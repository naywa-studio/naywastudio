/**
 * GET /api/mailing/readiness?candidate_id=…&job_id=…
 *
 * Tout ce qu'il faut savoir AVANT d'écrire à un candidat : peut-on lui
 * écrire, depuis quelle identité, et quelqu'un du cabinet l'a-t-il déjà
 * sollicité.
 *
 * ── Pourquoi une route dédiée ─────────────────────────────────────────────
 *
 * Ces informations existaient toutes, mais dispersées et consultées seulement
 * au moment de l'envoi — c'est-à-dire trop tard. Les rassembler ici évite
 * quatre appels depuis le navigateur à l'ouverture de chaque fiche, et surtout
 * évite que la connaissance de l'ORDRE (ce qui bloque avant ce qui avertit)
 * se répartisse entre plusieurs composants qui finiraient par diverger.
 *
 * Cette route ne fait qu'observer : aucune écriture, aucune consommation de
 * quota. Elle ne crée notamment PAS l'adresse de réception — la créer à la
 * simple ouverture d'une fiche stamperait des adresses pour des candidats à
 * qui personne n'écrira jamais.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { canSendFromOrgDomain } from "@/lib/subscription"
import { mailingVisible } from "@/lib/mailing/rollout"
import { orgFromAddress } from "@/lib/mailing/send"
import { suppressionFor } from "@/lib/mailing/suppression"
import { checkOrgDailySendCap } from "@/lib/mailing/send-cap"
import { evaluateReadiness } from "@/lib/mailing/readiness"
import { summarizeContacts, type ContactRow } from "@/lib/mailing/contact-history"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const candidateId = req.nextUrl.searchParams.get("candidate_id")
  const jobId = req.nextUrl.searchParams.get("job_id")
  if (!candidateId) return NextResponse.json({ error: "missing_candidate" }, { status: 400 })

  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: profile } = await sb
    .from("profiles")
    .select("organization_id, is_admin, inbox_address")
    .eq("user_id", user.id)
    .maybeSingle()

  const { data: org } = await sb
    .from("organizations")
    .select("id, name, trial_ends_at, subscription_status, current_period_end, subscription_has_mailing, subscription_seats, mailing_status, mailing_sending_domain, mailing_from_local, mailing_early_access, brand_name")
    .eq("id", profile?.organization_id ?? "")
    .maybeSingle()

  /* La même vanne que partout ailleurs. Sans elle, cette route décrirait
   * l'add-on — plafonds, identité d'envoi — à des organisations qui n'y ont
   * pas droit et à qui rien n'est encore montré. */
  if (!mailingVisible(profile, org)) return NextResponse.json({ ok: true, enabled: false })

  // Client RLS : un identifiant d'une autre organisation ne renvoie rien. Le
  // cloisonnement ne dépend donc pas d'un filtre que ce fichier pourrait
  // oublier d'écrire.
  const { data: candidate } = await sb
    .from("candidates").select("id, email").eq("id", candidateId).maybeSingle()
  if (!candidate) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const admin = getAdminSupabase()
  const asAdmin = { isAdmin: profile?.is_admin === true }

  /* Les quatre lectures sont indépendantes : les enchaîner ferait attendre
   * l'ouverture de la fiche pour rien. */
  const [suppression, cap, mailboxRes, messagesRes] = await Promise.all([
    candidate.email
      ? suppressionFor(admin, candidate.email, profile?.organization_id)
      : Promise.resolve({ blocked: false, unknown: false, reason: null as null }),
    profile?.organization_id
      ? checkOrgDailySendCap(admin, profile.organization_id, org?.subscription_seats)
      : Promise.resolve({ ok: true, sent: 0, limit: 0 }),
    /* Volontairement SANS filtre sur le statut, contrairement à
     * `activeMailboxFor` : une boîte révoquée est précisément ce qu'il faut
     * montrer. L'écarter ici la rendrait invisible au moment même où le
     * sourceur pourrait la réparer. */
    admin.from("connected_mailboxes")
      .select("email, status, provider")
      .eq("user_id", user.id)
      .order("connected_at", { ascending: false })
      .limit(1).maybeSingle(),
    /* Toutes missions confondues : c'est le sens même de l'unité de mémoire.
     * Le tri décroissant borne la lecture aux échanges récents, qui sont les
     * seuls à peser dans la décision d'écrire. */
    sb.from("email_messages")
      .select("direction, job_id, user_id, created_at")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false })
      .limit(100),
  ])

  const onOwnDomain = canSendFromOrgDomain(org, asAdmin)
  const mailbox = mailboxRes.data as { email: string; status: "active" | "needs_reconnect"; provider: string } | null

  const verdict = evaluateReadiness({
    email: candidate.email,
    suppression: { blocked: suppression.blocked, reason: suppression.reason },
    cap: { sent: cap.sent, limit: cap.limit },
    mailbox: mailbox ? { email: mailbox.email, status: mailbox.status } : null,
    orgDomainReady: onOwnDomain,
    fallbackAddress: onOwnDomain && org ? orgFromAddress(org) : (profile?.inbox_address ?? null),
  })

  const history = summarizeContacts((messagesRes.data ?? []) as ContactRow[], {
    currentJobId: jobId,
    viewerId: user.id,
  })

  /* Le bandeau nomme l'auteur — « Louis lui a écrit » porte, « un collègue »
   * non. On ne résout que les deux identifiants réellement affichés : lire
   * tout le trombinoscope à chaque ouverture de fiche coûterait cher pour
   * deux prénoms. */
  const ids = [history.sameMission?.userId, history.otherMission?.userId].filter(Boolean) as string[]
  const names: Record<string, string> = {}
  if (ids.length) {
    const { data: people } = await admin
      .from("profiles").select("user_id, first_name").in("user_id", ids)
    for (const p of people ?? []) if (p.first_name) names[p.user_id] = p.first_name
  }

  /* Les titres des missions concernées, pour la même raison : « pour un autre
   * poste » laisse le sourceur deviner ; « pour Développeur Java » lui permet
   * de trancher sans quitter la page. Lus en RLS — une mission d'une autre
   * organisation ne remonterait simplement pas. */
  const jobIds = [history.sameMission?.jobId, history.otherMission?.jobId].filter(Boolean) as string[]
  const jobTitles: Record<string, string> = {}
  if (jobIds.length) {
    const { data: jobs } = await sb.from("jobs").select("id, title").in("id", jobIds)
    for (const j of jobs ?? []) if (j.title) jobTitles[j.id] = j.title
  }

  return NextResponse.json({
    ok: true,
    enabled: true,
    ...verdict,
    /* `unknown` : la lecture des suppressions a échoué. On refuse l'envoi par
     * précaution côté route d'envoi ; ici on le DIT, sinon le sourceur verrait
     * un blocage sans motif. */
    suppressionUnknown: suppression.unknown === true,
    history,
    names,
    jobTitles,
  })
}
