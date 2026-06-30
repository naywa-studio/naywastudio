/**
 * Matching engine — Sprint 2.
 *
 * Design (validated with product):
 *   - A CV's raw text is read by the LLM exactly once, at upload (parse step).
 *   - Matching NEVER re-reads the raw CV. It works on the structured
 *     `taxonomy` tags + a compact profile summary.
 *   - Step 1: deterministic pre-filter (free, instant) on tag overlap —
 *     candidates with no plausible overlap are dropped, never sent to the LLM.
 *   - Step 2: the plausible pool is scored by the LLM in small batches,
 *     seeing only tags + title + years + summary (~tens of tokens each).
 *   - Step 3: good matches write a normalized `mission_tag` back onto the
 *     candidate's taxonomy — the vivier gets richer with every job.
 */

import { openrouterChat, safeJsonParse } from "./openrouter"
import type {
  Candidate,
  Job,
  JobNormalized,
  CandidateTaxonomy,
  ScoreDimensions,
  MatchTier,
} from "./database.types"
import {
  CRITERION_CATALOG,
  kindOf,
  type Criterion,
  type CriterionEval,
} from "./job-criteria-catalog"

/* ─────────────────────────── Job normalization ─────────────────────────── */

const NORMALIZE_JOB_PROMPT = `Tu normalises une fiche de poste pour un moteur de matching de CVs.
Tu réponds UNIQUEMENT en JSON valide :

{
  "role_family":          string[],   // 1-2 familles de métier génériques ("Data Engineer", "Commercial B2B")
  "must_have_skills":     string[],   // compétences/technos indispensables, max 12
  "nice_to_have_skills":  string[],   // compétences appréciées mais non bloquantes, max 10
  "domains":              string[],   // domaines fonctionnels visés, max 6
  "seniority":            "etudiant" | "stagiaire" | "junior" | "mid" | "senior" | "lead" | "principal" | null,
  "summary":              string      // 1 phrase neutre résumant le besoin
}

Règles : minuscules sauf noms propres/acronymes, déduplique, pas de markdown, JSON pur.
Déduis les infos depuis le titre + la description, ne sur-invente pas.
Séniorité : "etudiant" pour un job étudiant / alternance / poste ouvert aux étudiants ;
"stagiaire" pour un stage ; sinon junior→principal selon l'expérience attendue.`

export async function normalizeJob(input: {
  title: string
  /** Nom du poste — signal principal pour role_family. Fallback sur title. */
  role_name?: string | null
  location?: string | null
  seniority?: string | null
  contract_type?: string | null
  required_skills?: string[] | null
  nice_to_have_skills?: string[] | null
  description?: string | null
}): Promise<JobNormalized> {
  // Le nom du poste est le signal métier ; l'intitulé n'est qu'une étiquette.
  const roleSignal = input.role_name?.trim() || input.title
  const userMsg = [
    `Nom du poste recherché : ${roleSignal}`,
    input.seniority ? `Séniorité indiquée : ${input.seniority}` : "",
    input.location ? `Lieu : ${input.location}` : "",
    input.contract_type ? `Contrat : ${input.contract_type}` : "",
    input.required_skills?.length ? `Compétences requises : ${input.required_skills.join(", ")}` : "",
    input.nice_to_have_skills?.length ? `Compétences souhaitées : ${input.nice_to_have_skills.join(", ")}` : "",
    input.description ? `Contexte de la mission :\n${input.description}` : "",
  ].filter(Boolean).join("\n")

  const result = await openrouterChat({
    model: "openai/gpt-4o-mini",
    temperature: 0.1,
    responseFormat: "json_object",
    maxTokens: 700,
    messages: [
      { role: "system", content: NORMALIZE_JOB_PROMPT },
      { role: "user", content: userMsg },
    ],
  })

  const raw = safeJsonParse<Record<string, unknown>>(result.content) ?? {}
  const arr = (v: unknown, max: number): string[] => {
    if (!Array.isArray(v)) return []
    const seen = new Set<string>()
    const out: string[] = []
    for (const x of v) {
      const s = String(x).trim()
      if (!s) continue
      const k = s.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k); out.push(s)
      if (out.length >= max) break
    }
    return out
  }
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

  return {
    role_family: arr(raw.role_family, 2),
    must_have_skills: arr(raw.must_have_skills, 12),
    nice_to_have_skills: arr(raw.nice_to_have_skills, 10),
    domains: arr(raw.domains, 6),
    seniority: str(raw.seniority),
    summary: str(raw.summary),
  }
}

/* ───────────────────────── Deterministic pre-filter ────────────────────── */

/**
 * Normalisation pour la comparaison de tags :
 *   - lowercase
 *   - strip accents (NFD + remove combining diacriticals)
 *   - retire les caractères non-alphanumériques (espaces, ponctuation,
 *     points dans "React.js" → "reactjs", slashes dans "CI/CD" → "cicd")
 *   - trim
 * Permet à "React.js" / "ReactJS" / "react" de matcher entre eux sans
 * exiger une orthographe canonique pour passer le pré-filtre.
 */
const norm = (s: string) =>
  s.toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim()

/**
 * "Loose overlap" : pour chaque entrée de `a`, retourne true si elle
 * apparaît comme **sous-chaîne** d'au moins une entrée de `b` (ou
 * réciproquement). Plus permissif que l'égalité stricte :
 *   - "python" matche "python 3.11"
 *   - "react" matche "reactjs"
 *   - "sql" matche "postgresql"
 * Compromis acceptable côté pré-filtre : le LLM tranche derrière, on
 * préfère laisser entrer un faux-positif que dropper un vrai match.
 */
const looseOverlapCount = (a: string[], b: string[]): number => {
  if (!a.length || !b.length) return 0
  const normB = b.map(norm).filter(Boolean)
  let n = 0
  for (const x of a) {
    const nx = norm(x)
    if (!nx) continue
    for (const nb of normB) {
      if (nx === nb || nx.includes(nb) || nb.includes(nx)) { n++; break }
    }
  }
  return n
}

export interface PrefilterHit {
  candidate: Candidate
  signal: number          // 0..1 rough relevance — used only to order the LLM queue
}

// Entry-level bands where a CV is naturally thin on skills — for these,
// a seniority match alone is enough to keep the candidate in the pool.
const ENTRY_LEVELS = new Set(["etudiant", "stagiaire", "junior"])

/**
 * Keep only candidates with a plausible overlap. A candidate passes if:
 *   - a role_family matches (loose substring), OR
 *   - at least 1 must-have skill / tool overlaps (loose), OR
 *   - the job AND the candidate are both entry-level (étudiant/stagiaire/
 *     junior) — student & internship jobs are about level + availability,
 *     not a long skill list, so skill overlap would wrongly drop them.
 * Candidates with no taxonomy at all are kept (can't pre-filter blindly).
 *
 * Le matching est PERMISSIF côté pré-filtre — c'est le LLM qui tranche.
 * On préfère envoyer un faux-positif au scoring que dropper un bon profil
 * pour une variante d'orthographe ("React.js" vs "ReactJS").
 */
export function prefilterCandidates(job: JobNormalized, candidates: Candidate[]): PrefilterHit[] {
  const jobRoles = job.role_family ?? []
  const jobMust = job.must_have_skills ?? []
  const jobNice = job.nice_to_have_skills ?? []
  const jobDomains = job.domains ?? []
  const jobSkillPool = [...jobMust, ...jobNice]
  const jobSeniority = (job.seniority ?? "").toLowerCase()
  const jobIsEntry = ENTRY_LEVELS.has(jobSeniority)

  const hits: PrefilterHit[] = []
  for (const c of candidates) {
    const tax: CandidateTaxonomy | null = c.taxonomy
    // Fallback skill pool when taxonomy is missing (CV parsed before Sprint 2).
    const candRoles = tax?.role_family ?? []
    const candSkills = [
      ...(tax?.core_skills ?? []),
      ...(tax?.tools ?? []),
      ...(c.skills ?? []),
    ]
    const candDomains = [...(tax?.domains ?? []), ...(tax?.industries ?? [])]
    const candSeniority = (c.seniority_level ?? tax?.seniority ?? "").toLowerCase()

    const roleHit = looseOverlapCount(jobRoles, candRoles)
    const mustHit = looseOverlapCount(jobMust, candSkills)
    const niceHit = looseOverlapCount(jobNice, candSkills)
    const domainHit = looseOverlapCount(jobDomains, candDomains)
    const seniorityBridge = jobIsEntry && ENTRY_LEVELS.has(candSeniority)

    const noTaxonomy = !tax || (!candRoles.length && !(tax?.core_skills?.length))
    const plausible = noTaxonomy || roleHit > 0 || mustHit > 0 || seniorityBridge

    if (!plausible) continue

    // Rough signal to order the LLM queue (best candidates scored first).
    const signal = Math.min(
      1,
      roleHit * 0.5 +
      (jobMust.length ? (mustHit / jobMust.length) * 0.35 : 0) +
      (jobSkillPool.length ? (niceHit / Math.max(1, jobNice.length)) * 0.1 : 0) +
      (jobDomains.length ? (domainHit / jobDomains.length) * 0.05 : 0) +
      (seniorityBridge ? 0.2 : 0),
    )
    hits.push({ candidate: c, signal: noTaxonomy ? Math.max(signal, 0.15) : signal })
  }
  hits.sort((a, b) => b.signal - a.signal)
  return hits
}

/* ───────────────────────────── LLM scoring ─────────────────────────────── */

/**
 * Prompt v2 (PR 7) :
 *  - cadrage explicite du rôle (juger l'adéquation profil ↔ besoin client,
 *    pas faire "matcher des mots-clés")
 *  - acceptation explicite des profils stagiaires / alternants / étudiants
 *    QUAND le poste lui-même est ouvert à ce niveau (pas de rejet par
 *    défaut sur la séniorité)
 *  - chain-of-thought via le champ `reasoning` (rempli AVANT le score) :
 *    le LLM raisonne d'abord, ce qui stabilise le scoring et évite les
 *    contradictions entre justif et score
 *  - notation par dimension d'abord, score global = moyenne pondérée par
 *    importance perçue → cohérence dimensions ↔ score
 *  - règle explicite "concessions du sourceur" : si le briefing autorise
 *    des compromis (séniorité flexible, etc.), le LLM les applique sans
 *    pénaliser
 *  - justifications utiles : ce qui colle ET ce qui manque
 */
const SCORE_PROMPT = `Tu es l'expert de matching recrutement de Naywa Studio. Pour chaque candidat fourni, détermine s'il colle au besoin du client.

CONTEXTE
- POSTE : intitulé, séniorité visée, contrat, compétences, description.
- BRIEFING : contraintes client (budget, démarrage, deal-breakers, concessions acceptables). Prime sur tes intuitions.
- CANDIDAT : poste, séniorité, compétences, domaines, années XP post-diplôme, résumé court. Pas le CV brut.

RÈGLES
1. Lis la description + briefing AVANT les candidats. Reconstruis le profil idéal et les concessions tolérées.
2. Pour chaque candidat, attribue 4 dimensions 0-100 :
   - skills_match : recouvrement compétences (avec synonymes/variantes)
   - seniority_fit : adéquation séniorité demandée vs réelle
   - domain_fit : alignement secteur/industrie
   - experience_fit : années + nature des expériences
3. Score global 0-100 = synthèse pondérée selon ce qui compte pour CE poste. Doit rester cohérent avec les dimensions.
4. Tiers : excellent ≥ 75, good ≥ 55, fair ≥ 35, poor < 35.

NIVEAU JUNIOR / STAGIAIRE / ALTERNANT
Sur un poste ouvert à ce niveau (séniorité "etudiant"/"stagiaire"/"junior" OU mention dans la description), ces profils sont LÉGITIMES. Ne les pénalise pas pour manque d'expérience — c'est inhérent au niveau. Ils peuvent être "excellent" ou "good" si les compétences à ce niveau collent. Sur un poste senior, un profil clairement junior est "poor" ou "fair".

CONCESSIONS DU SOURCEUR
Si le briefing autorise un compromis ("séniorité flexible si très technique", "ok mid si solide sur Spark") : applique-le SANS pénaliser.

DEAL-BREAKERS
Si le briefing liste un deal-breaker explicite ("pas < 3 ans XP", "doit être sur Paris") et que le candidat le viole : perd au moins 30 points.

RÉPONDS UNIQUEMENT EN JSON, pas de markdown :
{
  "results": [
    {
      "candidate_id": string,
      "dimensions": {
        "skills_match":   number,
        "seniority_fit":  number,
        "domain_fit":     number,
        "experience_fit": number
      },
      "score": number,
      "tier": "excellent" | "good" | "fair" | "poor"
    }
  ]
}`

export interface MatchResult {
  candidate_id: string
  score: number
  tier: MatchTier
  dimensions: ScoreDimensions
  justification: string
}

function compactCandidate(c: Candidate): Record<string, unknown> {
  const tax = c.taxonomy
  return {
    candidate_id: c.id,
    title: c.current_title ?? null,
    current_company: c.current_company ?? null,
    years_experience: c.years_experience ?? null,
    seniority: c.seniority_level ?? tax?.seniority ?? null,
    // is_apprentice (= alternant en cours) est crucial pour ne pas le
    // rejeter sur un poste ouvert aux étudiants/alternants. Le LLM doit
    // savoir explicitement qu'on est sur ce profil.
    is_apprentice: c.is_apprentice ?? false,
    role_family: tax?.role_family ?? [],
    core_skills: tax?.core_skills ?? (c.skills ?? []).slice(0, 12),
    tools: tax?.tools ?? [],
    domains: tax?.domains ?? [],
    industries: tax?.industries ?? [],
    summary: c.parsed_cv?.summary ?? null,
  }
}

const clamp = (n: unknown, lo: number, hi: number): number => {
  const x = typeof n === "number" && isFinite(n) ? n : 0
  return Math.max(lo, Math.min(hi, Math.round(x)))
}
const TIERS: MatchTier[] = ["excellent", "good", "fair", "poor"]
// Seuils tier — adoucis (juin 2026) après retour sourceur "le score
// baisse vite". Un 58 avec dimensions 60/100/50/40 passe maintenant de
// "fair" à "good" — plus en phase avec la pondération.
function tierFor(score: number, raw: unknown): MatchTier {
  if (typeof raw === "string" && (TIERS as string[]).includes(raw)) return raw as MatchTier
  if (score >= 75) return "excellent"
  if (score >= 55) return "good"
  if (score >= 35) return "fair"
  return "poor"
}

/**
 * Seed déterministe dérivée du job + des candidats. Combinée à
 * temperature: 0, donne des résultats quasi-reproductibles entre runs
 * (avec gpt-4o-mini, les variations résiduelles sont rares et marginales).
 *
 * Pas de Math.random() : on veut que 2 runs du même job sur le même
 * vivier produisent la même seed et donc le même scoring.
 */
function deterministicSeed(jobId: string, candidateIds: string[]): number {
  let h = 0
  const s = jobId + "|" + candidateIds.slice().sort().join(",")
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  // OpenAI/OpenRouter seed doit être un entier 32-bit non-négatif.
  return Math.abs(h)
}

/**
 * Appel LLM unique pour scorer un batch. Retourne uniquement les
 * candidats que le LLM a explicitement évalués. Les "skippés" (oubliés
 * dans la réponse, parsing raté, ID inconnu) ne sont PAS retournés —
 * c'est au caller de retry si nécessaire (cf. scoreBatch ci-dessous).
 */
async function scoreBatchOnce(job: Job, candidates: Candidate[]): Promise<MatchResult[]> {
  const jobPayload = {
    // Le nom du poste est le signal métier principal ; on l'envoie comme
    // "role". L'intitulé indicatif (title) n'est pas transmis au scoring.
    role: job.role_name?.trim() || job.title,
    location: job.location,
    seniority: job.seniority ?? job.normalized?.seniority ?? null,
    contract_type: job.contract_type,
    normalized: job.normalized ?? null,
    required_skills: job.required_skills ?? [],
    nice_to_have_skills: job.nice_to_have_skills ?? [],
    description: job.description ?? null,
    briefing: job.briefing ?? null,
  }
  const candPayload = candidates.map(compactCandidate)
  const seed = deterministicSeed(job.id, candidates.map((c) => c.id))

  const result = await openrouterChat({
    model: "openai/gpt-4o-mini",
    // Stabilité maximum : temperature 0 + seed déterministe + JSON mode.
    // maxTokens 1200 suffit après retrait du reasoning + justification
    // (prompt v3, juin 2026) — chaque candidat = ~60 tokens output max,
    // donc 8 candidats = ~500 tokens, marge x2.
    temperature: 0,
    seed,
    responseFormat: "json_object",
    maxTokens: 1200,
    messages: [
      { role: "system", content: SCORE_PROMPT },
      { role: "user", content: `POSTE :\n${JSON.stringify(jobPayload)}\n\nCANDIDATS :\n${JSON.stringify(candPayload)}` },
    ],
  })

  const parsed = safeJsonParse<{ results?: unknown[] }>(result.content)
  const rows = Array.isArray(parsed?.results) ? parsed!.results : []
  const out: MatchResult[] = []
  const knownIds = new Set(candidates.map((c) => c.id))

  for (const r of rows) {
    if (!r || typeof r !== "object") continue
    const o = r as Record<string, unknown>
    const id = typeof o.candidate_id === "string" ? o.candidate_id : null
    if (!id || !knownIds.has(id)) continue
    const score = clamp(o.score, 0, 100)
    const dims = (o.dimensions ?? {}) as Record<string, unknown>
    out.push({
      candidate_id: id,
      score,
      tier: tierFor(score, o.tier),
      dimensions: {
        skills_match: clamp(dims.skills_match, 0, 100),
        seniority_fit: clamp(dims.seniority_fit, 0, 100),
        domain_fit: clamp(dims.domain_fit, 0, 100),
        experience_fit: clamp(dims.experience_fit, 0, 100),
      },
      justification: "",
    })
  }
  return out
}

/**
 * Score un batch de candidats, avec un retry une fois sur ceux que le
 * LLM aurait oublié dans sa réponse.
 *
 * PHILOSOPHIE FIABILITÉ (PR 7) :
 * On préfère NE PAS scorer un candidat plutôt que de l'évaluer avec un
 * fallback arbitraire ("fair 45"). Si après retry il manque toujours
 * des candidats, ils sont simplement absents du résultat — la route
 * appelante n'inserera rien pour eux et l'UI ne mentionnera pas de
 * "fair 45" trompeur. Le sourceur peut relancer le matching si besoin.
 */
export async function scoreBatch(job: Job, candidates: Candidate[]): Promise<MatchResult[]> {
  if (candidates.length === 0) return []

  // Passe 1.
  const first = await scoreBatchOnce(job, candidates)
  const scoredIds = new Set(first.map((r) => r.candidate_id))
  const missing = candidates.filter((c) => !scoredIds.has(c.id))

  if (missing.length === 0) return first

  // Passe 2 : retry uniquement les manquants. Évite de re-payer tout le
  // pool quand le LLM en a juste raté 1 ou 2 dans sa première réponse.
  let second: MatchResult[] = []
  try {
    second = await scoreBatchOnce(job, missing)
  } catch (err) {
    console.error("[match] retry batch failed:", (err as Error).message)
  }

  return [...first, ...second]
}

/* ─────────────────────── Mission tag (vivier memory) ───────────────────── */

/**
 * A normalized, low-noise tag derived from a job — written back onto the
 * taxonomy of candidates that match well, so the vivier remembers.
 * e.g. { title: "Senior Data Engineer Fintech" } → "data-engineer · fintech"
 */
export function missionTagFor(job: Job): string {
  const role = job.normalized?.role_family?.[0] ?? job.role_name?.trim() ?? job.title
  const domain = job.normalized?.domains?.[0] ?? null
  const slug = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)
  const roleSlug = slug(role)
  return domain ? `${roleSlug} · ${slug(domain)}` : roleSlug
}

/** Merge a mission tag into an existing taxonomy without duplicating. */
export function withMissionTag(tax: CandidateTaxonomy | null, tag: string): CandidateTaxonomy {
  const base: CandidateTaxonomy = tax ?? {}
  const existing = base.mission_tags ?? []
  if (existing.some((t) => t.toLowerCase() === tag.toLowerCase())) return base
  return { ...base, mission_tags: [...existing, tag].slice(-20) }
}

// Batch size 8 (PR 11) : sur un vivier de 200+ candidats, 4/batch
// donnait 50 appels LLM. Avec 8/batch on tombe à 25 appels, divisant
// par 2 la latence totale sans dégrader la qualité — le prompt v2
// demande un reasoning explicite par candidat, ce qui force le LLM
// à les traiter individuellement même dans un batch plus large.
export const MATCH_BATCH_SIZE = 8

/* ─────────────────────── Scoring v3 — critères flexibles (PR-Z) ─────────
 *
 * Au lieu des 4 dimensions hardcodées, on évalue chaque critère défini
 * sur la mission (jobs.criteria). Score global = moyenne pondérée des
 * critères "main" (les "bonus" sont informatifs, n'entrent pas dans le
 * score). Le LLM ne calcule PAS le score global : il évalue critère par
 * critère et le serveur agrège — résultat plus prévisible.
 */

export interface CriteriaMatchResult {
  candidate_id: string
  /** Score global 0-100 calculé déterministiquement depuis criteria_eval. */
  score: number
  tier: MatchTier
  criteria_eval: CriterionEval[]
}

const CRITERIA_SCORE_SYSTEM_PROMPT = `Tu es l'expert de matching recrutement Naywa. Pour chaque candidat fourni, tu évalues UNIQUEMENT les critères de la mission.

CONTEXTE
- POSTE : titre, séniorité, contrat, description, briefing.
- CRITÈRES : liste avec { id, type, label, weight, params }. weight="main" compte dans le score global, "bonus" est informatif. Évalue les DEUX.
- CANDIDATS : poste actuel, séniorité, années XP, skills, domaines, summary, langues si visibles. Pas le CV brut.

RÈGLES PAR TYPE
- Critères QUANTITATIFS (skills, seniority_fit, experience_years, role_fit, domain_fit, etc.) → renvoie un \`score\` 0-100.
- Critères QUALITATIFS (language, license, certification, etc.) → renvoie un \`status\` "yes" | "no" | "unknown" + une \`evidence\` courte citant le CV ("Allemand vu dans 'Langues : Allemand B2'") ou expliquant l'inférence.

PRINCIPE D'OR
- \`unknown\` = pas d'info dans le profil pour trancher. N'invente PAS : si le CV ne mentionne pas le permis, le statut est "unknown", PAS "no".
- Evidence COURTE : 1 phrase max, citation directe quand possible.

CONCESSIONS DU SOURCEUR
Si le briefing autorise un compromis ("séniorité flexible si très technique"), applique-le sans pénaliser.

DEAL-BREAKERS
Si un critère main est clairement "no" ou un score quantitatif main < 30, le candidat sera automatiquement classé "poor" côté serveur — sois rigoureux.

RÉPONDS UNIQUEMENT EN JSON, pas de markdown :
{
  "results": [
    {
      "candidate_id": "uuid",
      "criteria_eval": [
        { "id": "criterion_id", "score": 0-100 }              // pour QUANTITATIFS
        // OU
        { "id": "criterion_id", "status": "yes"|"no"|"unknown", "evidence": "..." }  // pour QUALITATIFS
      ]
    }
  ]
}`

/** Mappe un statut qualitatif vers un score numérique pour l'agrégation.
 *  Choix : "unknown" = 50 (neutre, pas pénalisant ni avantageux). */
function statusToScore(status: "yes" | "no" | "unknown" | undefined): number {
  if (status === "yes") return 100
  if (status === "no") return 0
  return 50
}

/** Calcule le score global d'un candidat depuis criteria_eval.
 *  Moyenne pondérée des critères "main" uniquement. Si aucun main
 *  évalué, retourne 0 (le caller décidera). */
function computeGlobalScore(criteria: Criterion[], evals: CriterionEval[]): number {
  const evalById = new Map(evals.map((e) => [e.id, e]))
  let total = 0
  let weights = 0
  for (const c of criteria) {
    if (c.weight !== "main") continue
    const e = evalById.get(c.id)
    if (!e) continue
    const kind = kindOf(c.type)
    const score = kind === "quantitative"
      ? Math.max(0, Math.min(100, Math.round(e.score ?? 0)))
      : statusToScore(e.status)
    total += score
    weights += 1
  }
  return weights > 0 ? Math.round(total / weights) : 0
}

function tierFromScore(score: number): MatchTier {
  if (score >= 75) return "excellent"
  if (score >= 55) return "good"
  if (score >= 35) return "fair"
  return "poor"
}

function compactCandidateForCriteria(c: Candidate): Record<string, unknown> {
  const tax = c.taxonomy
  return {
    candidate_id: c.id,
    title: c.current_title ?? null,
    current_company: c.current_company ?? null,
    years_experience: c.years_experience ?? null,
    seniority: c.seniority_level ?? tax?.seniority ?? null,
    is_apprentice: c.is_apprentice ?? false,
    role_family: tax?.role_family ?? [],
    core_skills: tax?.core_skills ?? (c.skills ?? []).slice(0, 12),
    tools: tax?.tools ?? [],
    domains: tax?.domains ?? [],
    industries: tax?.industries ?? [],
    languages: c.parsed_cv?.languages ?? [],
    certifications: c.parsed_cv?.certifications ?? [],
    location: c.location ?? null,
    summary: c.parsed_cv?.summary ?? null,
  }
}

async function scoreBatchCriteriaOnce(
  job: Job,
  criteria: Criterion[],
  candidates: Candidate[],
): Promise<CriteriaMatchResult[]> {
  const jobPayload = {
    role: job.role_name?.trim() || job.title,
    location: job.location,
    seniority: job.seniority ?? job.normalized?.seniority ?? null,
    contract_type: job.contract_type,
    description: job.description ?? null,
    briefing: job.briefing ?? null,
    criteria: criteria.map((c) => ({
      id: c.id, type: c.type, label: c.label, weight: c.weight,
      params: c.params,
      // Aide LLM : précise le kind attendu en sortie.
      expected_output: kindOf(c.type) === "quantitative" ? "score 0-100" : "status yes/no/unknown + evidence",
    })),
  }
  const candPayload = candidates.map(compactCandidateForCriteria)
  const seed = deterministicSeed(job.id, candidates.map((c) => c.id))

  const result = await openrouterChat({
    model: "openai/gpt-4o-mini",
    temperature: 0,
    seed,
    responseFormat: "json_object",
    maxTokens: Math.min(4000, 250 + candidates.length * criteria.length * 30),
    messages: [
      { role: "system", content: CRITERIA_SCORE_SYSTEM_PROMPT },
      { role: "user", content: `POSTE :\n${JSON.stringify(jobPayload)}\n\nCANDIDATS :\n${JSON.stringify(candPayload)}` },
    ],
  })

  const parsed = safeJsonParse<{ results?: unknown[] }>(result.content)
  const rows = Array.isArray(parsed?.results) ? parsed!.results : []
  const knownCandIds = new Set(candidates.map((c) => c.id))
  const knownCritIds = new Set(criteria.map((c) => c.id))

  const out: CriteriaMatchResult[] = []
  for (const r of rows) {
    if (!r || typeof r !== "object") continue
    const o = r as Record<string, unknown>
    const candidateId = typeof o.candidate_id === "string" ? o.candidate_id : null
    if (!candidateId || !knownCandIds.has(candidateId)) continue
    const evalsRaw = Array.isArray(o.criteria_eval) ? o.criteria_eval : []
    const evals: CriterionEval[] = []
    for (const e of evalsRaw) {
      if (!e || typeof e !== "object") continue
      const ev = e as Record<string, unknown>
      const id = typeof ev.id === "string" ? ev.id : null
      if (!id || !knownCritIds.has(id)) continue
      const item: CriterionEval = { id }
      if (typeof ev.score === "number" && isFinite(ev.score)) {
        item.score = Math.max(0, Math.min(100, Math.round(ev.score)))
      }
      if (ev.status === "yes" || ev.status === "no" || ev.status === "unknown") {
        item.status = ev.status
      }
      if (typeof ev.evidence === "string" && ev.evidence.trim()) {
        item.evidence = ev.evidence.trim().slice(0, 240)
      }
      evals.push(item)
    }
    const score = computeGlobalScore(criteria, evals)
    out.push({
      candidate_id: candidateId,
      score,
      tier: tierFromScore(score),
      criteria_eval: evals,
    })
  }
  return out
}

/**
 * Score un batch de candidats sur les critères de la mission.
 * Retry une fois sur les candidats que le LLM a oublié.
 */
export async function scoreBatchCriteria(
  job: Job,
  criteria: Criterion[],
  candidates: Candidate[],
): Promise<CriteriaMatchResult[]> {
  if (candidates.length === 0 || criteria.length === 0) return []

  const first = await scoreBatchCriteriaOnce(job, criteria, candidates)
  const scoredIds = new Set(first.map((r) => r.candidate_id))
  const missing = candidates.filter((c) => !scoredIds.has(c.id))
  if (missing.length === 0) return first

  let second: CriteriaMatchResult[] = []
  try {
    second = await scoreBatchCriteriaOnce(job, criteria, missing)
  } catch (err) {
    console.error("[match v3] retry failed:", (err as Error).message)
  }
  return [...first, ...second]
}
