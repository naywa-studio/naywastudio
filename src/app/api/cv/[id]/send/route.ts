/**
 * POST /api/cv/:id/send   { subject, body, job_id? }
 *
 * Sends an outreach email to a candidate from the client's dedicated
 * Naywa address. Triggered by an explicit "Envoyer" click — that click
 * IS the user's approval. Nothing is ever sent without it.
 *
 *   1. Auth + load candidate (must have an email)
 *   2. Daily send quota
 *   3. Provision / fetch the client's inbox address
 *   4. Send via Resend (BCC the client's personal email if opted in)
 *   5. Log to email_messages (outbound)
 *   6. If a job is linked, advance that pipeline stage identified → contacted
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { consumeQuota } from "@/lib/quota"
import { sendEmail } from "@/lib/resend"
import { ensureInboxAddress, fromHeader } from "@/lib/mailing/inbox-address"

import { namedAddress } from "@/lib/mailing/mime"
import { ensureMissionAlias } from "@/lib/mailing/mission-alias"
import { sendCandidateEmail } from "@/lib/mailing/send"
import { canSendFromOrgDomain } from "@/lib/subscription"
import { checkOrgDailySendCap } from "@/lib/mailing/send-cap"
import { activeMailboxFor, sendFromMailbox } from "@/lib/mailing/send-via-mailbox"
import { suppressionFor, explainSuppression } from "@/lib/mailing/suppression"
import { unsubscribeHeaders } from "@/lib/mailing/unsubscribe"
import { noticeFor, appendNotice } from "@/lib/mailing/legal-notice"
import { getAppUrl } from "@/lib/stripe"

export const runtime = "nodejs"
export const maxDuration = 30

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const body = await req.json().catch(() => null) as {
    subject?: unknown; body?: unknown; job_id?: unknown
  } | null
  const subject = typeof body?.subject === "string" ? body.subject.trim() : ""
  const messageBody = typeof body?.body === "string" ? body.body.trim() : ""
  const jobId = typeof body?.job_id === "string" ? body.job_id : null
  if (!subject || !messageBody) {
    return NextResponse.json({ error: "missing_content", message: "Objet et message requis." }, { status: 400 })
  }

  // Candidate (RLS-scoped — 404 if not the caller's)
  const { data: candidate, error } = await sb
    .from("candidates")
    .select("id, user_id, full_name, email")
    .eq("id", id)
    .single()
  if (error || !candidate) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (!candidate.email) {
    return NextResponse.json(
      { error: "no_email", message: "Ce candidat n'a pas d'adresse email, impossible de lui écrire." },
      { status: 400 },
    )
  }

  const admin = getAdminSupabase()

  const quota = await consumeQuota(admin, user.id, "send")
  if (!quota.ok) {
    return NextResponse.json({ error: "quota_exceeded", message: quota.message }, { status: 429 })
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("first_name, inbox_cc_self, organization_id, is_admin, preferred_language")
    .eq("user_id", user.id)
    .single()

  const { data: org } = profile?.organization_id
    ? await admin.from("organizations").select("*").eq("id", profile.organization_id).single()
    : { data: null }

  /* ── Sous quelle identité part ce message ? ────────────────────────────
   *
   * Deux chemins, et un seul critère pour trancher : le domaine du cabinet
   * est-il RÉELLEMENT prêt (option acquise ET clés DKIM publiées) ?
   *
   *   oui  → le domaine du cabinet, via `lib/mailing`. Là, la règle est
   *          « son domaine ou rien » : aucun repli, jamais.
   *   non  → le domaine Naywa, comme depuis toujours.
   *
   * Ce n'est pas une contradiction. Un cabinet sans add-on n'a pas de
   * domaine à usurper ; un cabinet qui en a un ne doit jamais voir ses
   * messages partir sous une autre marque que la sienne.
   *
   * L'adresse de réception suit le même domaine — sans quoi le candidat
   * lirait un expéditeur au nom du cabinet et répondrait à Naywa. */
  // ⚠️ La MÊME valeur d'`isAdmin` des deux côtés. Une divergence enverrait
  // depuis le domaine du cabinet avec un `Reply-To` chez Naywa : le candidat
  // répondrait ailleurs, et tout aurait l'air de marcher.
  const asAdmin = { isAdmin: profile?.is_admin === true }

  /* ── Plafond quotidien par ORGANISATION ────────────────────────────────
   *
   * Le seul plafond existant était `DAILY_LIMITS.send = 10 000` par
   * utilisateur, c'est-à-dire aucun. Or la réputation SES est celle du
   * COMPTE : un cabinet qui envoie massivement les fait suspendre tous. Et
   * c'est ce qu'on a écrit à AWS dans la demande d'accès production.
   *
   * Refusé AVANT d'atteindre le fournisseur : on ne consomme rien pour un
   * envoi qu'on va rejeter. */
  if (profile?.organization_id) {
    const cap = await checkOrgDailySendCap(admin, profile.organization_id, org?.subscription_seats)
    if (!cap.ok) {
      return NextResponse.json(
        { error: "daily_send_cap", message: cap.message, sent: cap.sent, limit: cap.limit },
        { status: 429 },
      )
    }
  }

  /* ── A-t-il demandé à ne plus être contacté ? ──────────────────────────
   *
   * Avant tout envoi, et avant de consommer quoi que ce soit. Une adresse qui
   * a rebondi définitivement ou dont le titulaire s'est plaint ne doit plus
   * jamais recevoir — y compris par un AUTRE membre de l'organisation, qui ne
   * peut pas savoir.
   *
   * Sur erreur de lecture, `suppressionFor` refuse : écrire à quelqu'un qui a
   * dit non a des conséquences (pour lui, et pour la réputation partagée du
   * compte d'envoi) qu'un refus temporaire n'a pas. */
  const suppression = await suppressionFor(admin, candidate.email, profile?.organization_id)
  if (suppression.blocked) {
    return NextResponse.json({
      error: "recipient_suppressed",
      reason: suppression.reason,
      message: explainSuppression(suppression.reason),
    }, { status: suppression.unknown ? 503 : 409 })
  }

  const onOwnDomain = canSendFromOrgDomain(org, asAdmin)
  const inboxAddress = await ensureInboxAddress(admin, user.id, org, asAdmin)
  const from = fromHeader(profile?.first_name, inboxAddress)

  /* ── L'adresse de réponse EST l'identifiant de la conversation ─────────
   *
   * Trois pistes ont précédé celle-ci, et chacune manquait une exigence :
   *
   *  - un jeton (`elyas+97w26uu2@…`) : certain, mais visible dans le champ
   *    « répondre à » du candidat, sur un message dont tout l'enjeu est
   *    d'inspirer confiance ;
   *  - `In-Reply-To` : invisible et certain, mais il exige de connaître
   *    l'identifiant RFC de notre propre envoi — Gmail et Graph ne le rendent
   *    pas et écrasent celui qu'on poserait. La PREMIÈRE réponse d'un
   *    candidat, la plus importante, resterait non rattachée ;
   *  - le rapprochement par l'objet : lisible et efficace dès la première
   *    réponse, mais faillible dès que deux missions portent le même intitulé.
   *
   * D'où le renversement : au lieu de cacher l'identifiant, on le rend
   * lisible. Cf. `lib/mailing/mission-alias.ts`. */
  /* Une adresse dédiée à la mission : `elyas.commercial-immobilier@…`. Elle
   * EST l'identifiant de la conversation — correspondance exacte au retour,
   * aucune déduction, y compris quand deux missions portent le même intitulé
   * (l'index unique les départage par un `-2`).
   *
   * Hors mission, ou si la pose échoue, on garde l'adresse générique du
   * sourceur : perdre la précision du rattachement est réparable, un message
   * qui ne part pas ne l'est pas. */
  let replyAddress = inboxAddress
  if (jobId && profile?.organization_id) {
    const { data: job } = await admin
      .from("jobs").select("title, role_name").eq("id", jobId).maybeSingle()
    const dedicated = await ensureMissionAlias(admin, {
      userId: user.id,
      organizationId: profile.organization_id,
      jobId,
      jobTitle: job?.title || job?.role_name || null,
      inboxAddress,
    })
    if (dedicated) replyAddress = dedicated
  }
  /* Le nom du cabinet devant l'adresse de suivi. C'est ce que le candidat lit
   * dans « répondre à » — l'adresse brute y ressemblait à une adresse de
   * machine, et faisait douter de l'expéditeur. */
  const replyLabel = namedAddress(org?.brand_name || org?.name, replyAddress)
  const bcc = profile?.inbox_cc_self ? (user.email ?? undefined) : undefined
  /* ── La mention d'information ─────────────────────────────────────────
   *
   * Ajoutée ICI, une seule fois, avant le choix du transport. La poser dans
   * chaque branche garantirait qu'on l'oublie dans la prochaine — et une
   * mention absente ne se voit pas : le message part, il a l'air normal, et
   * c'est le cabinet qui est en défaut sans le savoir.
   *
   * L'obligation est celle du cabinet (article 14 du RGPD, information due au
   * plus tard lors de la PREMIÈRE communication). Il peut retirer la mention
   * ou écrire la sienne — cf. `lib/mailing/legal-notice.ts`. */
  // La mention suit la langue du sourceur : une ligne en français sous un
  // message anglais saute aux yeux, et décrédite le passage même qui doit
  // rassurer le candidat. Cf. lib/mailing/legal-notice.ts.
  const noticeLang = profile?.preferred_language === "en" ? "en" : "fr"
  const bodyToSend = appendNotice(messageBody, noticeFor(org, noticeLang))

  const unsubHeaders = profile?.organization_id
    ? unsubscribeHeaders(candidate.email, profile.organization_id, getAppUrl(req))
    : {}

  /* ── Répondre DANS le fil du candidat ──────────────────────────────────
   *
   * Dans Naywa le fil était parfait ; chez le candidat, non. Faute de
   * `In-Reply-To`, nos réponses arrivaient comme des messages neufs, à côté
   * de l'échange en cours. Rien n'échouait, et le seul endroit où ça se voyait
   * était sa boîte à lui.
   *
   * On reprend le `Message-ID` de son DERNIER message : c'est à celui-là qu'on
   * répond. `References` reçoit la même valeur — la chaîne complète serait
   * plus fidèle à la RFC, mais tous les clients de messagerie chaînent sur le
   * dernier maillon, et une chaîne partielle vaut mieux qu'une absente.
   *
   * Silencieux si l'échange est antérieur à la colonne, ou si c'est le premier
   * message : il n'y a alors rien à rattacher. */
  const threadHeaders: Record<string, string> = {}
  const { data: lastInbound } = await admin
    .from("email_messages")
    .select("rfc_message_id")
    .eq("candidate_id", candidate.id)
    .eq("direction", "inbound")
    .not("rfc_message_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastInbound?.rfc_message_id) {
    threadHeaders["In-Reply-To"] = lastInbound.rfc_message_id
    threadHeaders["References"] = lastInbound.rfc_message_id
  }
  const outHeaders = { ...unsubHeaders, ...threadHeaders }

  /* ── Par quelle boîte ce message part-il ? ─────────────────────────────
   *
   * Trois transports, dans cet ordre :
   *
   *   1. LA BOÎTE CONNECTÉE du sourceur (OAuth). Prioritaire, et pas par
   *      commodité : les cabinets sont presque toujours sur Workspace avec
   *      leur propre domaine, donc c'est déjà `sophie@cabinet-durand.fr` qui
   *      envoie — sa vraie adresse, sa réputation déjà établie, et une copie
   *      dans ses « Éléments envoyés ». Aucun DNS n'a été demandé à personne.
   *   2. LE DOMAINE de l'organisation (SES), pour qui n'a pas connecté de
   *      boîte mais a fait la configuration.
   *   3. LE DOMAINE NAYWA, comme depuis toujours.
   *
   * Une boîte marquée `needs_reconnect` n'est PAS retenue : elle s'affiche
   * dans l'écran avec son bandeau, mais laisser l'envoi tomber dessus ferait
   * échouer chaque tentative au lieu de basculer proprement. */
  const mailbox = await activeMailboxFor(admin, user.id)

  // Send
  let providerId: string
  try {
    if (mailbox) {
      const sent = await sendFromMailbox(admin, mailbox, {
        fromName: profile?.first_name,
        to: candidate.email,
        subject,
        text: bodyToSend,
        bcc,
        headers: outHeaders,
        /* ── DEUX adresses de réponse, dans cet ordre ──────────────────
         *
         * La sienne d'abord, la nôtre ensuite. Le candidat clique
         * « Répondre », sa messagerie remplit les deux : la réponse arrive
         * chez le sourceur ET dans Naywa, donc le fil se remplit, Nora
         * analyse, le pipeline avance.
         *
         * L'ORDRE n'est pas cosmétique. Un `Reply-To` entièrement hors du
         * domaine du `From` est un motif classique d'hameçonnage pour les
         * filtres ; en mettant la sienne en tête, le désaccord total —
         * le vrai signal d'alerte — n'existe pas.
         *
         * La RFC 5322 définit bien `Reply-To` comme une LISTE : ce n'est pas
         * un détournement. Et l'adresse est VISIBLE par le candidat, ce qui
         * distingue ce choix d'une copie cachée : il voit à qui il écrit, et
         * peut retirer la nôtre s'il ne la veut pas.
         *
         * ⚠️ Limite connue : quelques messageries anciennes ou mobiles ne
         * gardent que la première adresse. On perd alors la copie — sans
         * bruit. C'est le défaut résiduel de ce chemin. */
        replyTo: `${namedAddress(profile?.first_name, mailbox.email)}, ${replyLabel}`,
      })
      if (!sent.ok) {
        // `needs_reconnect` remonte tel quel : c'est une consigne pour le
        // sourceur (« reconnectez »), pas une panne à réessayer.
        return NextResponse.json(
          { error: sent.reason, message: sent.message },
          { status: sent.reason === "needs_reconnect" ? 409 : 502 },
        )
      }
      providerId = sent.id
    } else if (onOwnDomain && org) {
      const sent = await sendCandidateEmail(
        {
          org,
          senderName: profile?.first_name,
          replyTo: replyLabel,
          to: candidate.email,
          subject,
          text: bodyToSend,
          bcc,
          // Le bouton natif « Se désabonner » de Gmail et d'Outlook. Son
          // absence est l'un des signaux qui font traiter un expéditeur comme
          // un indésirable — et c'était une des promesses faites à AWS.
          headers: outHeaders,
        },
        asAdmin,
      )
      // Un refus ici serait une incohérence : `canSendFromOrgDomain` vient de
      // dire oui. On le traite quand même — la garde interne de l'envoi est
      // la dernière avant le candidat, et on préfère un échec explicite à un
      // message parti sous une identité imprévue.
      if (!sent.ok) throw new Error(`mailing refusé: ${sent.reason}`)
      providerId = sent.id
    } else {
      const sent = await sendEmail({
        from,
        to: candidate.email,
        replyTo: replyLabel,
        subject,
        text: bodyToSend,
        bcc,
        // Le même en-tête que sur le chemin « domaine du cabinet ». L'oublier
        // ici priverait du bouton « Se désabonner » précisément les cabinets
        // qui n'ont PAS d'add-on — donc la majorité des envois.
        headers: outHeaders,
      })
      providerId = sent.id
    }
  } catch (err) {
    // Log the failure so the thread shows it.
    await admin.from("email_messages").insert({
      user_id: user.id,
      candidate_id: candidate.id,
      job_id: jobId,
      direction: "outbound",
      from_address: inboxAddress,
      to_address: candidate.email,
      subject,
      body_text: bodyToSend,
      status: "failed",
      error: (err as Error).message,
    })
    return NextResponse.json({
      error: "send_failed",
      message: "L'envoi a échoué. Réessayez.",
      // La cause réelle, pour les admins Naywa uniquement. Un message de
      // fournisseur peut nommer une adresse ou une configuration interne :
      // il n'a rien à faire chez un client. Mais sans lui, diagnostiquer un
      // refus SES revient à deviner — le refus « bac à sable », notamment,
      // parle du destinataire et n'oriente vers rien.
      ...(profile?.is_admin === true ? { detail: (err as Error).message } : {}),
    }, { status: 502 })
  }

  // Log the sent message
  const { data: logged } = await admin
    .from("email_messages")
    .insert({
      user_id: user.id,
      candidate_id: candidate.id,
      job_id: jobId,
      direction: "outbound",
      from_address: inboxAddress,
      to_address: candidate.email,
      subject,
      body_text: bodyToSend,
      provider_id: providerId,
      status: "sent",
    })
    .select("*")
    .single()

  /* ── Répondre, c'est prendre en charge ────────────────────────────────
   *
   * Les réponses non traitées alimentent la section « Vos candidats ont
   * répondu » de l'accueil et le compteur de la navigation. Si seul un clic
   * explicite sur « Je m'en occupe » pouvait les éteindre, la liste
   * accumulerait des candidats à qui on a DÉJÀ répondu — et un compteur qui
   * ne descend pas cesse d'être regardé, y compris le jour où il compte.
   *
   * Le geste qui traite vraiment une réponse, c'est écrire au candidat. On
   * l'enregistre donc ici, sans rien demander au sourceur.
   *
   * Best-effort, comme le journal d'audit : rater cette écriture laisse une
   * ligne de trop dans une liste, alors qu'échouer casserait un envoi déjà
   * parti chez le candidat. */
  await admin
    .from("email_messages")
    .update({ handled_at: new Date().toISOString(), handled_by: user.id })
    .eq("candidate_id", candidate.id)
    .eq("direction", "inbound")
    .is("handled_at", null)
    .then(undefined, () => {})

  // Advance the pipeline stage for the linked job, if still at "identified".
  if (jobId) {
    const { data: assessment } = await admin
      .from("match_assessments")
      .select("id, pipeline_stage, contacted_at")
      .eq("candidate_id", candidate.id)
      .eq("job_id", jobId)
      .maybeSingle()
    if (assessment && assessment.pipeline_stage === "identified") {
      // Envoyer un email = contact effectif → "Contacté" ET entrée auto dans
      // la pipeline (in_pipeline).
      await admin.from("match_assessments").update({
        pipeline_stage: "contacted",
        in_pipeline: true,
        contacted_at: assessment.contacted_at ?? new Date().toISOString(),
      }).eq("id", assessment.id)
    } else if (assessment) {
      // Déjà au-delà de "identified" — on garantit juste qu'il est suivi.
      await admin.from("match_assessments").update({ in_pipeline: true }).eq("id", assessment.id)
    }
  }

  return NextResponse.json({ ok: true, message: logged })
}
