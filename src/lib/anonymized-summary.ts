/**
 * Résumé exécutif mission-oriented pour le CV anonymisé.
 *
 * Extrait de la route /api/cv/[id]/anonymize pour être partagé avec la
 * génération groupée (batch shortlist). Best-effort : toute erreur (timeout,
 * parse, clé manquante) renvoie null → le PDF se rend avec cv.summary.
 */

import type { Candidate, ParsedCv } from "@/lib/database.types"
import type { AnonymizedJobContext } from "@/lib/anonymized-cv"
import { openrouterChat } from "@/lib/openrouter"

const EXEC_SUMMARY_PROMPT_FR = `Tu es Nora, assistante recrutement Naywa. On te donne un candidat et une mission. Tu produis un résumé exécutif FACTUEL de 2 à 3 phrases (50 à 80 mots) qui synthétise objectivement le profil dans le sens de la mission.

Règles strictes :
- Réponds en JSON strict : { "summary": string }.
- LANGUE DE SORTIE : FRANÇAIS uniquement.
- Ton formel, vouvoiement. Destiné au client final du cabinet de recrutement.
- Anonymisation : JAMAIS de nom, école, coordonnées.
- ZÉRO INFÉRENCE sur ce qui n'est pas écrit : pas de "motivé", "passionné", "très impliqué", "candidat idéal", "fort potentiel", "excellent communicant". Tu n'as pas eu d'entretien, tu n'as PAS accès à ces dimensions.
- Tu te limites à ce que le CV permet de dire FACTUELLEMENT :
  années d'expérience, séniorité, compétences techniques alignées
  avec les exigences mission, types de contextes/secteurs déjà
  rencontrés. Pas plus.
- Si tu manques d'information sur un axe, tu n'en parles pas.
- Connecte 2-3 éléments du CV aux exigences mission ("X ans en Y,
  expérience sur Z et W mentionnés comme requis").
- Pas d'envolée, pas de vocabulaire commercial. Sec, précis, sourcé.
- Évite les superlatifs ("expert", "maîtrise parfaite") sauf si le
  CV les mentionne textuellement.`

const EXEC_SUMMARY_PROMPT_EN = `You are Nora, Naywa's recruitment assistant. You are given a candidate and a job. Produce a FACTUAL executive summary of 2 to 3 sentences (50 to 80 words) that objectively summarises the profile against the mission requirements.

Strict rules:
- Reply in strict JSON: { "summary": string }.
- OUTPUT LANGUAGE: ENGLISH only.
- Formal tone. The text is for the recruitment firm's end client.
- Anonymisation: NEVER mention name, school, or contact details.
- ZERO INFERENCE on what is not written: no "motivated", "passionate", "highly engaged", "perfect candidate", "high potential", "excellent communicator". You have not interviewed the candidate, you have NO access to those dimensions.
- Stay strictly within what the CV factually supports:
  years of experience, seniority, technical skills aligned with the
  job's requirements, types of contexts/industries already worked in.
  Nothing more.
- If a dimension lacks information, don't mention it.
- Connect 2-3 concrete CV facts to the job's requirements ("X years
  in Y, experience with Z and W which are listed as required").
- No flourish, no sales wording. Dry, precise, sourced.
- Avoid superlatives ("expert", "perfect mastery") unless the CV
  literally uses them.`

/** Longueur max d'une description de poste dans le récapitulatif envoyé au
 *  modèle. Les éléments qui font la valeur d'un profil (outils, normes, types
 *  d'installations, taille d'équipe) arrivent quasi toujours en tête. */
const RECAP_DESC_CHARS = 300
/** Budget total de description. Au-delà, les postes les plus anciens gardent
 *  intitulé, société et dates : aucune ligne de parcours ne disparaît, seul le
 *  détail du plus lointain s'efface. */
const RECAP_DESC_BUDGET = 3_000

/**
 * Récapitulatif du parcours transmis au modèle qui rédige le résumé exécutif.
 *
 * Exhaustif par construction : TOUS les postes, jamais une sélection.
 */
function experienceRecap(
  experiences: NonNullable<ParsedCv["experience"]>,
  language: "fr" | "en",
): Array<Record<string, unknown>> {
  let remaining = RECAP_DESC_BUDGET
  return experiences.map((e) => {
    const full = (e.description ?? "").trim()
    let desc: string | null = null
    if (full && remaining > 0) {
      desc = full.slice(0, Math.min(RECAP_DESC_CHARS, remaining))
      remaining -= desc.length
    }
    // `null` = poste en cours ; absent/undefined = date de fin inconnue. Les
    // confondre faisait passer un poste terminé pour le poste actuel du
    // candidat, jusque dans le document remis au client.
    const fin = e.end === null
      ? (language === "en" ? "present" : "présent")
      : (e.end ?? null)
    return {
      titre: e.title,
      societe: e.company,
      duree: [e.start, fin].filter(Boolean).join(" – "),
      missions: desc,
    }
  })
}

export async function buildExecutiveSummary(
  candidate: Candidate,
  job: AnonymizedJobContext,
  language: "fr" | "en" = "fr",
): Promise<string | null> {
  try {
    const cv = candidate.parsed_cv ?? {}
    const snapshot = {
      mission: {
        titre: job.title,
        seniorite_attendue: job.seniority,
        // Exigences de la mission au complet. Le résumé doit RELIER le candidat
        // à ces exigences : en tronquer deux, c'est risquer de manquer
        // précisément celle sur laquelle il excelle. La normalisation de la
        // mission les plafonne déjà en amont.
        competences_must_have: job.must_have_skills,
        competences_required: job.required_skills,
      },
      candidat: {
        titre_actuel: candidate.current_title,
        ans_xp: candidate.years_experience,
        seniorite: candidate.seniority_level,
        // Plus de `slice(0, 12)` : la taxonomie est déjà plafonnée en amont
        // (20 compétences clés), tronquer une seconde fois ici écartait des
        // compétences que le parsing venait d'extraire.
        competences_principales: candidate.taxonomy?.core_skills ?? candidate.skills ?? [],
        // Le parcours COMPLET, descriptions comprises. Il était limité aux 4
        // postes les plus récents ET privé de toute description : le résumé
        // envoyé au client final était donc rédigé sur quatre intitulés secs,
        // sans jamais savoir ce que le candidat avait fait. Sur un profil à 13
        // expériences, les deux tiers du parcours étaient invisibles.
        experience_recap: experienceRecap(cv.experience ?? [], language),
      },
    }

    const systemPrompt = language === "en" ? EXEC_SUMMARY_PROMPT_EN : EXEC_SUMMARY_PROMPT_FR

    const result = await openrouterChat({
      model: "openai/gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 320,
      timeoutMs: 20_000,
      responseFormat: "json_object",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(snapshot) },
      ],
    })
    const parsed = JSON.parse(result.content) as { summary?: unknown }
    if (typeof parsed.summary !== "string") return null
    const text = parsed.summary.trim()
    if (text.length < 20) return null
    return text
  } catch {
    return null
  }
}
