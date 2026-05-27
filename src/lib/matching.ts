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
  location?: string | null
  seniority?: string | null
  contract_type?: string | null
  required_skills?: string[] | null
  nice_to_have_skills?: string[] | null
  description?: string | null
}): Promise<JobNormalized> {
  const userMsg = [
    `Titre : ${input.title}`,
    input.seniority ? `Séniorité indiquée : ${input.seniority}` : "",
    input.location ? `Lieu : ${input.location}` : "",
    input.contract_type ? `Contrat : ${input.contract_type}` : "",
    input.required_skills?.length ? `Compétences requises : ${input.required_skills.join(", ")}` : "",
    input.nice_to_have_skills?.length ? `Compétences souhaitées : ${input.nice_to_have_skills.join(", ")}` : "",
    input.description ? `Description :\n${input.description}` : "",
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

const norm = (s: string) => s.toLowerCase().trim()
const overlapCount = (a: string[], b: string[]): number => {
  if (!a.length || !b.length) return 0
  const setB = new Set(b.map(norm))
  let n = 0
  for (const x of a) if (setB.has(norm(x))) n++
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
 *   - a role_family matches, OR
 *   - at least 1 must-have skill / tool overlaps, OR
 *   - the job AND the candidate are both entry-level (étudiant/stagiaire/
 *     junior) — student & internship jobs are about level + availability,
 *     not a long skill list, so skill overlap would wrongly drop them.
 * Candidates with no taxonomy at all are kept (can't pre-filter blindly).
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

    const roleHit = overlapCount(jobRoles, candRoles)
    const mustHit = overlapCount(jobMust, candSkills)
    const niceHit = overlapCount(jobNice, candSkills)
    const domainHit = overlapCount(jobDomains, candDomains)
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

const SCORE_PROMPT = `Tu es un assistant de matching recrutement. On te donne UN poste et une LISTE de profils candidats déjà structurés (tu n'as PAS le CV brut, uniquement les tags + résumé).
Pour CHAQUE candidat, évalue l'adéquation au poste.

Réponds UNIQUEMENT en JSON valide :
{
  "results": [
    {
      "candidate_id": string,
      "score": number,                // 0-100
      "tier": "excellent" | "good" | "fair" | "poor",
      "dimensions": {
        "skills_match":   number,     // 0-100
        "seniority_fit":  number,     // 0-100
        "domain_fit":     number,     // 0-100
        "experience_fit": number      // 0-100
      },
      "justification": string         // 1-2 phrases concrètes : pourquoi ça matche ou pas
    }
  ]
}

Barème tiers : excellent 80-100, good 60-79, fair 40-59, poor 0-39.
Sois honnête et discriminant — ne gonfle pas les scores. Base-toi sur les tags fournis.
Justification : factuelle, cite les points forts/faibles réels. Pas de markdown, JSON pur.

Si un champ "briefing" est présent sur le poste, il contient des contraintes EXPLICITES du client (budget, démarrage, anti-patterns, deal-breakers, etc.). Tu DOIS les respecter : un candidat qui viole un deal-breaker du briefing perd au moins 30 points, et la justification doit mentionner la contrainte concernée.`

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
    years_experience: c.years_experience ?? null,
    seniority: c.seniority_level ?? tax?.seniority ?? null,
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
function tierFor(score: number, raw: unknown): MatchTier {
  if (typeof raw === "string" && (TIERS as string[]).includes(raw)) return raw as MatchTier
  if (score >= 80) return "excellent"
  if (score >= 60) return "good"
  if (score >= 40) return "fair"
  return "poor"
}

/** Score one batch of candidates against a job in a single LLM call. */
export async function scoreBatch(job: Job, candidates: Candidate[]): Promise<MatchResult[]> {
  if (candidates.length === 0) return []

  const jobPayload = {
    title: job.title,
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

  const result = await openrouterChat({
    model: "openai/gpt-4o-mini",
    temperature: 0.15,
    responseFormat: "json_object",
    maxTokens: 2600,
    messages: [
      { role: "system", content: SCORE_PROMPT },
      { role: "user", content: `POSTE :\n${JSON.stringify(jobPayload)}\n\nCANDIDATS :\n${JSON.stringify(candPayload)}` },
    ],
  })

  const parsed = safeJsonParse<{ results?: unknown[] }>(result.content)
  const rows = Array.isArray(parsed?.results) ? parsed!.results : []
  const byId = new Map<string, MatchResult>()

  for (const r of rows) {
    if (!r || typeof r !== "object") continue
    const o = r as Record<string, unknown>
    const id = typeof o.candidate_id === "string" ? o.candidate_id : null
    if (!id || !candidates.some((c) => c.id === id)) continue
    const score = clamp(o.score, 0, 100)
    const dims = (o.dimensions ?? {}) as Record<string, unknown>
    byId.set(id, {
      candidate_id: id,
      score,
      tier: tierFor(score, o.tier),
      dimensions: {
        skills_match: clamp(dims.skills_match, 0, 100),
        seniority_fit: clamp(dims.seniority_fit, 0, 100),
        domain_fit: clamp(dims.domain_fit, 0, 100),
        experience_fit: clamp(dims.experience_fit, 0, 100),
      },
      justification: typeof o.justification === "string"
        ? o.justification.trim().slice(0, 600)
        : "",
    })
  }

  // Any candidate the LLM skipped → conservative "fair" fallback so nothing is lost silently.
  return candidates.map((c) =>
    byId.get(c.id) ?? {
      candidate_id: c.id,
      score: 45,
      tier: "fair" as MatchTier,
      dimensions: { skills_match: 45, seniority_fit: 45, domain_fit: 45, experience_fit: 45 },
      justification: "Évaluation automatique indisponible — à revoir manuellement.",
    },
  )
}

/* ─────────────────────── Mission tag (vivier memory) ───────────────────── */

/**
 * A normalized, low-noise tag derived from a job — written back onto the
 * taxonomy of candidates that match well, so the vivier remembers.
 * e.g. { title: "Senior Data Engineer Fintech" } → "data-engineer · fintech"
 */
export function missionTagFor(job: Job): string {
  const role = job.normalized?.role_family?.[0] ?? job.title
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

// Smaller batch = first persist hits the DB faster, which matters because
// Vercel Hobby kills the function at 60 s. With 4 candidates per LLM call
// the first batch typically completes in 5-8 s, so even if the route is
// killed mid-second-batch the user has at least 4 scored results AND a
// "done" status (the route flips status after each batch).
export const MATCH_BATCH_SIZE = 4
