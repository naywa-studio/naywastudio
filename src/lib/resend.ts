/**
 * Resend — le relais de Naywa, pour les emails que Naywa envoie EN SON NOM.
 *
 * Confirmations d'inscription et réinitialisations de mot de passe (via le
 * SMTP Supabase), formulaire de contact, support, demandes de branding.
 *
 * ⚠️ L'outreach CANDIDAT ne passe plus par ici quand l'organisation a activé
 * son domaine : il part par `lib/mailing/`, sous la marque du cabinet. Ce
 * relais-ci ne doit jamais être débranché pour autant — il porte
 * l'authentification de tous les utilisateurs.
 */

export const MAIL_DOMAIN = "mail.naywastudio.com"

/**
 * Le domaine qui REÇOIT — distinct de celui qui envoie, et c'est le point.
 *
 * ── Le défaut que cette séparation corrige ────────────────────────────────
 *
 * Les adresses de réception des sourceurs étaient composées sur
 * `MAIL_DOMAIN`, c'est-à-dire sur le domaine d'ENVOI. Or celui-ci n'a aucun
 * enregistrement MX : il ne sait qu'expédier. **Chaque réponse de candidat
 * adressée à `prenom@mail.naywastudio.com` rebondissait donc**, depuis
 * toujours, et le sourceur en concluait que personne ne lui répondait.
 *
 * Le défaut a survécu si longtemps parce qu'une seule constante portait deux
 * rôles opposés : personne ne se demande si un domaine d'envoi sait recevoir.
 *
 * ⚠️ Ne jamais les refusionner. `mail.` porte le SMTP de Supabase — donc les
 * confirmations d'inscription et les mots de passe oubliés. Y brancher de la
 * réception mêlerait l'authentification de tous les utilisateurs au courrier
 * des candidats.
 */
export const INBOX_DOMAIN = "reply.naywastudio.com"
const RESEND_ENDPOINT = "https://api.resend.com/emails"

/* ─────────────────────────── Sending ─────────────────────────── */

export interface SendEmailInput {
  from: string            // "Elyas <elyas@mail.naywastudio.com>"
  to: string
  replyTo: string
  subject: string
  text: string
  html?: string
  cc?: string
  bcc?: string
  /** En-têtes bruts, ex. `List-Unsubscribe`. */
  headers?: Record<string, string>
}

export interface SendEmailResult {
  id: string
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = (process.env.RESEND_API_KEY ?? "").trim()
  if (!key) throw new Error("RESEND_API_KEY missing")

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      reply_to: input.replyTo,
      // Le sujet peut contenir un fragment saisi par l'utilisateur (nom
      // d'org, sujet libre du formulaire contact...) — on retire tout saut
      // de ligne avant envoi. Fix centralisé ici plutôt que sur chaque
      // appelant : protège tous les call sites, présents et futurs.
      subject: input.subject.replace(/[\r\n]+/g, " "),
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      ...(input.cc ? { cc: [input.cc] } : {}),
      ...(input.bcc ? { bcc: [input.bcc] } : {}),
      // En-têtes personnalisés — aujourd'hui `List-Unsubscribe` sur l'outreach
      // candidat. Posés ici AUSSI, et pas seulement sur le chemin SES : un
      // cabinet sans domaine propre envoie par ce relais, et ses messages
      // perdraient sinon le bouton « Se désabonner » sans que ça se voie.
      ...(input.headers && Object.keys(input.headers).length > 0
        ? { headers: input.headers }
        : {}),
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 240)}`)
  }
  const data = await res.json() as { id?: string }
  if (!data.id) throw new Error("Resend: no message id returned")
  return { id: data.id }
}

/* ─────────────────────────── Receiving ─────────────────────────── */

export interface InboundEmailContent {
  text: string | null
  html: string | null
}

/**
 * Fetch the body of an inbound email. The `email.received` webhook only
 * carries metadata (from/to/subject) — the body must be retrieved here,
 * by design, to keep webhook payloads small for serverless endpoints.
 */
export async function getInboundEmail(emailId: string): Promise<InboundEmailContent> {
  const key = (process.env.RESEND_API_KEY ?? "").trim()
  if (!key) throw new Error("RESEND_API_KEY missing")

  const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Resend receiving ${res.status}: ${detail.slice(0, 240)}`)
  }
  const json = await res.json() as Record<string, unknown>
  // The API may return the email object directly or wrapped in `data`.
  const email = (json.data && typeof json.data === "object" ? json.data : json) as Record<string, unknown>
  return {
    text: typeof email.text === "string" ? email.text : null,
    html: typeof email.html === "string" ? email.html : null,
  }
}

/* ──────────────────── Inbox address provisioning ──────────────────── */

/**
 * Déplacé vers `lib/mailing/inbox-address.ts`.
 *
 * L'adresse de réception d'un sourceur ne dépend plus de ce fichier : elle
 * suit le domaine de son organisation, qui peut ne pas être celui de Naywa.
 * La laisser ici l'aurait figée sur `MAIL_DOMAIN` — c'est exactement le défaut
 * que l'add-on mailing corrige.
 *
 * `MAIL_DOMAIN` reste exporté ci-dessus : le contact, le support et les
 * demandes de branding sont des emails que Naywa envoie EN SON NOM, et
 * n'ont aucune raison de basculer.
 */
