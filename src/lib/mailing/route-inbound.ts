/**
 * Rattachement d'un email entrant : à qui, à quel candidat, à quelle mission.
 *
 * ── Pourquoi cette fonction est partagée ─────────────────────────────────
 *
 * Deux chemins de réception coexistent pendant la transition : l'ancien, par
 * `mail.naywastudio.com` via Resend, et le nouveau, par le domaine du client
 * via SES. **Ils doivent rattacher exactement de la même façon.**
 *
 * Dupliquer cette logique produirait deux comportements qui divergent
 * lentement — et la divergence ne se verrait pas : un message rattaché au
 * mauvais candidat, ou pas rattaché du tout, ressemble à un message qui n'est
 * jamais arrivé. Le sourceur croit que son candidat n'a pas répondu.
 *
 * ── L'ordre de résolution ────────────────────────────────────────────────
 *
 * 1. L'adresse DESTINATAIRE désigne le sourceur (`profiles.inbox_address`).
 *    Inconnue = ce n'est pas une de nos adresses : on abandonne sans erreur.
 * 2. L'adresse EXPÉDITEUR désigne le candidat, cherché dans TOUTE
 *    l'organisation — le vivier est partagé entre membres, et une réponse
 *    adressée à un sourceur peut venir d'un candidat importé par un collègue.
 * 3. Le dernier message SORTANT vers ce candidat porte le contexte mission.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../database.types"

export interface InboundRouting {
  /** Le sourceur destinataire. `null` = adresse inconnue, message à ignorer. */
  userId: string | null
  organizationId: string | null
  /** Le candidat expéditeur, s'il est au vivier. */
  candidateId: string | null
  /** Mission déduite du dernier échange sortant. */
  jobId: string | null
}

/**
 * Résout le rattachement. Ne jette pas et n'écrit rien : la décision
 * d'enregistrer appartient à l'appelant, qui seul sait quoi faire d'un
 * message non rattaché.
 */
export async function resolveInboundRouting(
  admin: SupabaseClient<Database>,
  opts: { toAddress: string; fromAddress: string },
): Promise<InboundRouting> {
  const toAddr = opts.toAddress.trim().toLowerCase()
  const fromAddr = opts.fromAddress.trim().toLowerCase()

  // L'adresse courante d'abord, puis les anciennes.
  //
  // Une organisation qui active son domaine change l'adresse de réception de
  // ses sourceurs. Les candidats déjà contactés, eux, répondent à celle qu'ils
  // ont dans leur boîte — pendant des semaines. Ne chercher que l'adresse
  // courante ferait tomber toutes ces réponses dans « destinataire inconnu »,
  // sans le moindre signe : un message non rattaché est indiscernable d'un
  // message jamais reçu, et le sourceur en conclut que personne n'a répondu.
  let { data: profile } = await admin
    .from("profiles")
    .select("user_id, organization_id")
    .eq("inbox_address", toAddr)
    .maybeSingle()

  if (!profile) {
    const { data: byAlias } = await admin
      .from("profiles")
      .select("user_id, organization_id")
      .contains("inbox_aliases", [toAddr])
      .limit(1)
      .maybeSingle()
    profile = byAlias
  }

  if (!profile) {
    return { userId: null, organizationId: null, candidateId: null, jobId: null }
  }

  // Le vivier est partagé : on cherche dans toute l'organisation, pas
  // seulement parmi les candidats importés par le destinataire.
  const { data: candidate } = await admin
    .from("candidates")
    .select("id")
    .eq("organization_id", profile.organization_id)
    .eq("email", fromAddr)
    .limit(1)
    .maybeSingle()

  let jobId: string | null = null
  if (candidate) {
    const { data: lastOut } = await admin
      .from("email_messages")
      .select("job_id")
      .eq("candidate_id", candidate.id)
      .eq("direction", "outbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    jobId = lastOut?.job_id ?? null
  }

  return {
    userId: profile.user_id,
    organizationId: profile.organization_id,
    candidateId: candidate?.id ?? null,
    jobId,
  }
}

/**
 * Retire la citation du message précédent d'une réponse.
 *
 * Sans ça, chaque réponse embarque tout l'historique du fil, et l'analyse
 * comme l'affichage portent sur un texte majoritairement composé de ce que le
 * sourceur a écrit lui-même — ce qui fausse le sentiment détecté autant que la
 * lisibilité.
 *
 * Les marqueurs varient d'un client à l'autre ; on coupe au premier rencontré.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.split(/\r?\n/)
  const attribution = [
    /^\s*>?\s*Le .+ a écrit\s*:/i,                   // Apple Mail / Gmail FR
    /^\s*>?\s*On .+ wrote:\s*$/i,                    // Apple Mail / Gmail EN
    /^\s*-{2,}\s*(Original Message|Message d'origine)\s*-{2,}/i,
    /^\s*_{5,}\s*$/,                                 // séparateur Outlook
    // Ajouts : Outlook FR et EN écrivent parfois un bloc d'en-têtes recopiés
    // plutôt qu'un séparateur. Constaté sur les messages de test.
    /^\s*De\s*:\s*.+$/i,
    /^\s*From\s*:\s*.+$/i,
  ]
  let cut = lines.length
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*>/.test(lines[i]) || attribution.some((re) => re.test(lines[i]))) {
      cut = i
      break
    }
  }
  const head = lines.slice(0, cut).join("\n").replace(/\s+$/, "")
  // Filet : une coupe qui ne laisse presque rien vient d'un marqueur déclenché
  // trop tôt — une citation placée en tête, par exemple. Mieux vaut un texte
  // trop long qu'un texte vide : on ne peut pas deviner ce qui manque, et un
  // corps vide ferait croire à une conversation restée sans réponse.
  return head.trim().length >= 8 ? head : text.trim()
}
