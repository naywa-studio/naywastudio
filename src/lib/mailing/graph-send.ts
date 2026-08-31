/**
 * Envoi par Microsoft Graph — l'équivalent de `gmail-send.ts`.
 *
 * ── Plus court que Gmail, et ce n'est pas un raccourci ───────────────────
 *
 * Gmail veut un message RFC 822 complet, que `buildRawMessage` assemble à la
 * main — d'où tout l'appareil de protection contre l'injection d'en-têtes.
 * Graph, lui, prend un objet JSON et compose le message lui-même. Le vecteur
 * « un saut de ligne dans le sujet ajoute un `Bcc:` » **n'existe pas ici**,
 * parce qu'il n'y a pas d'en-têtes à refermer.
 *
 * On nettoie quand même sujet et nom affiché (`sanitize`) : ce n'est plus une
 * garde de sécurité mais une garde de propreté, et surtout la même donnée
 * part parfois par l'un ou l'autre chemin. Deux comportements différents pour
 * un même message seraient un piège pour la personne qui viendra après.
 *
 * ── Ce que Graph impose ───────────────────────────────────────────────────
 *
 * - **L'expéditeur n'est pas paramétrable.** Graph envoie depuis la boîte du
 *   jeton, point. On ne passe donc pas de `from` — le préciser ferait échouer
 *   l'appel sur les comptes sans droit d'usurpation.
 * - **`saveToSentItems`** doit valoir `true` : le sourceur doit retrouver son
 *   message dans ses « Éléments envoyés ». C'est la promesse du connecteur —
 *   écrire depuis sa vraie boîte, avec la trace dans sa vraie boîte.
 * - Les en-têtes libres passent par `internetMessageHeaders`, et Microsoft
 *   **exige qu'ils commencent par `X-`**. `List-Unsubscribe` est donc refusé
 *   par cette voie : cf. le commentaire à l'endroit où on l'écarte.
 */

const SEND_ENDPOINT = "https://graph.microsoft.com/v1.0/me/sendMail"

export interface GraphMessage {
  /** Nom affiché de l'expéditeur — le sourceur. */
  fromName?: string | null
  /** L'adresse connectée. Graph l'impose de toute façon ; sert aux journaux. */
  fromEmail: string
  to: string
  subject: string
  text: string
  /** Liste d'adresses séparées par des virgules, comme pour Gmail. */
  replyTo?: string
  bcc?: string
  headers?: Record<string, string>
}

/** Retire les sauts de ligne et les espaces superflus. Cf. l'en-tête. */
function sanitize(v: string): string {
  return v.replace(/[\r\n]+/g, " ").trim()
}

/** `a@b.fr, c@d.fr` → la forme attendue par Graph. Les entrées vides sont
 *  écartées : une virgule en trop ne doit pas produire un destinataire vide,
 *  que Graph rejetterait en bloc — donc l'envoi entier échouerait. */
function recipients(list: string | undefined): { emailAddress: { address: string } }[] {
  if (!list) return []
  return list
    .split(",")
    .map((a) => sanitize(a))
    .filter((a) => a.includes("@"))
    .map((address) => ({ emailAddress: { address } }))
}

export type GraphSendResult =
  | { ok: true; id: string }
  /** Le jeton est mort : reconnecter, ne pas réessayer. */
  | { ok: false; reason: "needs_reconnect"; detail: string }
  | { ok: false; reason: "failed"; detail: string }

/**
 * Envoie le message.
 *
 * La distinction entre les deux échecs est la seule chose qui compte ici :
 * un 401/403 veut dire que le consentement a sauté et qu'il faut le DIRE au
 * sourceur ; tout le reste est une panne passagère, et couper une boîte saine
 * parce que Microsoft a hoqueté obligerait à reconnecter pour rien.
 */
export async function sendViaGraph(accessToken: string, m: GraphMessage): Promise<GraphSendResult> {
  /* `List-Unsubscribe` ne peut PAS passer par Graph : Microsoft refuse tout
   * en-tête personnalisé qui ne commence pas par « X- ». Le candidat garde
   * malgré tout un moyen de refus — la mention légale en pied de message
   * l'invite à répondre, et la liste de suppression traite ces réponses.
   * C'est moins bien qu'un clic dans le client de messagerie ; c'est la
   * limite de ce chemin, et elle est assumée plutôt que masquée. */
  const custom = Object.entries(m.headers ?? {})
    .filter(([k]) => /^x-/i.test(k))
    .map(([name, value]) => ({ name: sanitize(name), value: sanitize(value) }))

  const body = {
    message: {
      subject: sanitize(m.subject),
      body: { contentType: "Text", content: m.text },
      toRecipients: recipients(m.to),
      bccRecipients: recipients(m.bcc),
      replyTo: recipients(m.replyTo),
      ...(custom.length > 0 ? { internetMessageHeaders: custom } : {}),
    },
    saveToSentItems: true,
  }

  let res: Response
  try {
    res = await fetch(SEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    return { ok: false, reason: "failed", detail: err instanceof Error ? err.message : "network" }
  }

  // Graph répond 202 sans corps : il n'y a pas d'identifiant de message à
  // récupérer, contrairement à Gmail. On en fabrique un pour le journal.
  if (res.status === 202 || res.ok) {
    return { ok: true, id: `graph-${Date.now().toString(36)}` }
  }

  const detail = await res.text().catch(() => "")
  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: "needs_reconnect", detail: detail.slice(0, 300) || `HTTP ${res.status}` }
  }
  return { ok: false, reason: "failed", detail: detail.slice(0, 300) || `HTTP ${res.status}` }
}
