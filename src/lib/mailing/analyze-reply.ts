/**
 * La lecture d'une réponse de candidat par Nora — une SUGGESTION, jamais une décision.
 *
 * ── Pourquoi ce code est partagé ─────────────────────────────────────────
 *
 * Il vivait dans la route de réception Resend, et la route SES ne l'appelait
 * pas. Conséquence : une réponse arrivée sur le domaine du cabinet n'obtenait
 * ni sentiment, ni résumé, ni étape suggérée — alors que la même réponse
 * arrivée sur le domaine Naywa en obtenait trois.
 *
 * Le sourceur n'aurait vu aucune erreur. Juste des suggestions qui cessent
 * d'apparaître le jour où son organisation active son domaine, sans que rien
 * n'explique pourquoi. C'est le genre de régression qu'on met des mois à
 * remarquer, et qu'on impute alors au hasard.
 *
 * ── Le garde-fou produit ─────────────────────────────────────────────────
 *
 * Le contenu analysé vient d'un email entrant : il n'est ni authentifié, ni de
 * confiance. Rien de ce qui sort d'ici n'est appliqué automatiquement — pas de
 * mouvement de pipeline, pas de réponse. Le sourceur valide, toujours.
 */

import { openrouterChat, safeJsonParse } from "../openrouter"
import { consumeOrgLlmAction } from "../quota"
import { getAdminSupabase } from "../admin-supabase"
import type { EmailSentiment } from "../database.types"
import { stripSignature } from "./route-inbound"

const ANALYSIS_PROMPT = `Tu analyses la réponse d'un candidat à un message de recrutement.
Réponds UNIQUEMENT en JSON :
{
  "sentiment": "interested" | "not_interested" | "question" | "neutral" | "negotiation",
  "summary": string,            // 1 phrase, ce que dit le candidat
  "suggested_stage": "replied" | "interview" | "rejected"
}
- "suggested_stage" : étape de pipeline suggérée. "rejected" seulement si le candidat décline clairement.
- C'est une SUGGESTION pour le sourceur, pas une décision. Sois factuel.
- Pas de markdown, JSON pur.`

const SENTIMENTS: EmailSentiment[] = ["interested", "not_interested", "question", "neutral", "negotiation"]
const SUGGESTED_STAGES = ["replied", "interview", "rejected"]

export interface ReplyAnalysis {
  sentiment: EmailSentiment | null
  summary: string | null
  suggestedStage: string | null
}

/**
 * Analyse une réponse de candidat.
 *
 * La signature est retirée ICI, et pas par l'appelant : un appelant peut
 * oublier, et l'oubli ne se voit pas — l'analyse porterait alors en partie sur
 * « Founder & CEO — Naywa Studio », qui pèse lourd face à une réponse de deux
 * lignes. Le message STOCKÉ, lui, garde sa signature : elle contient le
 * téléphone et le poste du candidat, que le sourceur veut lire.
 *
 * Ne jette jamais : une panne du modèle ne doit pas faire perdre le message
 * lui-même, qui est la seule chose irremplaçable ici.
 */
export async function analyzeReply(
  text: string,
  /**
   * Organisation à qui imputer l'appel. **À passer systématiquement.**
   *
   * ── Pourquoi ce paramètre existe ────────────────────────────────────
   *
   * Sans lui, chaque email entrant déclenchait un appel au modèle SANS
   * aucun plafond. L'adresse de réception d'un sourceur est publique par
   * construction — elle figure dans chaque message envoyé à un candidat.
   * N'importe qui pouvait donc, en écrivant en boucle à cette adresse,
   * faire tourner notre facture d'IA sans limite.
   *
   * L'analyse est désormais imputée à l'organisation, comme les dix autres
   * routes qui appellent un modèle. Quand le quota est épuisé, on N'ANALYSE
   * PAS — mais **on garde le message** : la réponse du candidat est
   * irremplaçable, la suggestion ne l'est pas.
   */
  orgId?: string | null,
  /**
   * Bypass administrateur Naywa, comme les dix autres routes qui appellent un
   * modèle. Ce chemin était le SEUL à ne pas le transmettre : une organisation
   * admin, sans abonnement, se voyait donc refuser l'analyse avec un
   * « quota épuisé » alors qu'elle était à zéro action consommée. Le message
   * était trompeur autant que le refus.
   */
  opts?: { isAdmin?: boolean },
): Promise<ReplyAnalysis> {
  const body = stripSignature(text ?? "")
  if (!body.trim()) return { sentiment: null, summary: null, suggestedStage: null }

  if (orgId) {
    const quota = await consumeOrgLlmAction(getAdminSupabase(), orgId, opts)
    if (!quota.ok) {
      /* « Épuisé » était faux dans le cas le plus fréquent : une limite à zéro
       * (essai terminé, pas d'abonnement) n'est pas un quota consommé. Un
       * journal qui ment fait chercher au mauvais endroit — il a coûté une
       * demi-heure ici même. */
      console.warn(
        `[analyze-reply] pas de quota IA (${quota.used}/${quota.limit}), message conservé sans analyse:`,
        orgId,
      )
      return { sentiment: null, summary: null, suggestedStage: null }
    }
  }
  try {
    const res = await openrouterChat({
      model: "openai/gpt-4o-mini",
      temperature: 0.2,
      responseFormat: "json_object",
      maxTokens: 300,
      messages: [
        { role: "system", content: ANALYSIS_PROMPT },
        { role: "user", content: `Réponse du candidat :\n\n${body.slice(0, 6000)}` },
      ],
    })
    const p = safeJsonParse<Record<string, unknown>>(res.content)
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
    const sent = str(p?.sentiment)
    const stage = str(p?.suggested_stage)
    return {
      sentiment: sent && (SENTIMENTS as string[]).includes(sent) ? (sent as EmailSentiment) : "neutral",
      summary: str(p?.summary),
      suggestedStage: stage && SUGGESTED_STAGES.includes(stage) ? stage : "replied",
    }
  } catch {
    return { sentiment: null, summary: null, suggestedStage: "replied" }
  }
}
