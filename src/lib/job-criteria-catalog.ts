/**
 * Catalogue de critères flexibles (PR-Z).
 *
 * Source unique pour :
 *   1. Le prompt LLM "propose criteria" — liste exhaustive avec règles d'usage
 *   2. Le validateur côté serveur — sanitize les params
 *   3. Les widgets UI (badge, edit modal, filter chip)
 *   4. Le moteur de matching (cf. lib/matching.ts v2)
 *
 * 25 types : 10 quantitatifs (score 0-100) + 14 qualitatifs structurés
 * (yes/no/unknown + evidence) + 1 escape hatch (custom).
 *
 * Quand ajouter un type : nouvelle entrée dans CRITERION_CATALOG, le LLM
 * picker, le matcher et l'UI le découvriront automatiquement par leur clé.
 */

export type CriterionWeight = "main" | "bonus"
export type CriterionSource = "llm" | "manual"
export type CriterionKind = "quantitative" | "qualitative"

/** Évaluation d'un critère pour un candidat donné (stockée dans
 *  match_assessments.criteria_eval). */
export type CriterionEval = {
  /** Matche jobs.criteria[].id */
  id: string
  /** Pour les critères quantitatifs (0-100). */
  score?: number
  /** Pour les critères qualitatifs. "unknown" = pas d'info dans le CV. */
  status?: "yes" | "no" | "unknown"
  /** Citation du CV ou inférence courte. Crucial pour les qualitatifs
   *  (le sourceur doit pouvoir vérifier). */
  evidence?: string
}

/** Un critère configuré sur une mission (stocké dans jobs.criteria). */
export type Criterion = {
  id: string
  type: CriterionType
  label: string
  weight: CriterionWeight
  source: CriterionSource
  /** Params spécifiques au type — cf. CRITERION_CATALOG[type].schema. */
  params: Record<string, unknown>
}

export type CriterionType =
  // Quantitatifs (10) — score 0-100
  | "skills"
  | "seniority_fit"
  | "experience_years"
  | "role_fit"
  | "domain_fit"
  | "industry_experience_years"
  | "team_size"
  | "management_experience_years"
  | "client_facing"
  | "notice_period_weeks"
  // Qualitatifs (14) — yes/no/unknown + evidence
  | "language"
  | "license"
  | "certification"
  | "diploma"
  | "mobility"
  | "availability"
  | "legal_status"
  | "clearance"
  | "methodology"
  | "contract_preference"
  | "salary_expectation"
  | "travel_willingness"
  | "publication_portfolio"
  | "physical_requirements"
  // Escape hatch (1)
  | "custom"

interface CatalogEntry {
  kind: CriterionKind
  /** Libellé court par défaut, le LLM peut le préciser ("Compétences" → "Compétences Spark/Python"). */
  defaultLabel: string
  /** Description envoyée au LLM pour qu'il sache quand piocher ce critère. */
  llmHint: string
  /** Liste blanche des clés params autorisées. Le validateur strip le reste. */
  paramKeys: readonly string[]
}

export const CRITERION_CATALOG: Record<CriterionType, CatalogEntry> = {
  // ── Quantitatifs ────────────────────────────────────────────────────
  skills: {
    kind: "quantitative",
    defaultLabel: "Compétences techniques",
    llmHint: "Recouvrement des compétences/outils demandés. Quasi toujours pertinent (sauf missions pures soft skills). Params.must liste les skills must-have, params.nice les souhaitées.",
    paramKeys: ["must", "nice"],
  },
  seniority_fit: {
    kind: "quantitative",
    defaultLabel: "Séniorité",
    llmHint: "Adéquation séniorité demandée (junior/mid/senior/lead/principal) vs séniorité du candidat. Params.target = niveau cible.",
    paramKeys: ["target", "min", "max"],
  },
  experience_years: {
    kind: "quantitative",
    defaultLabel: "Années d'expérience",
    llmHint: "Années d'expérience totale post-diplôme (alternance/stage exclus). Params.min = minimum acceptable, params.target = idéal.",
    paramKeys: ["min", "target", "max"],
  },
  role_fit: {
    kind: "quantitative",
    defaultLabel: "Adéquation métier",
    llmHint: "À quel point le candidat est sur le BON métier (Data Eng vs Backend vs DevOps). Différent de skills : un dev Python sans expérience Data Eng peut avoir 80 skills mais 30 role_fit. Params.role = métier cible.",
    paramKeys: ["role", "families"],
  },
  domain_fit: {
    kind: "quantitative",
    defaultLabel: "Secteur",
    llmHint: "Alignement sectoriel (fintech, santé, retail, etc.). Params.domains = secteurs valorisés.",
    paramKeys: ["domains"],
  },
  industry_experience_years: {
    kind: "quantitative",
    defaultLabel: "Expérience secteur",
    llmHint: "Années d'expérience PRÉCISÉMENT dans ce secteur (différent de domain_fit qui est plus binaire). Critique pour réglementé (banque, santé). Params.domain + params.min années.",
    paramKeys: ["domain", "min"],
  },
  team_size: {
    kind: "quantitative",
    defaultLabel: "Taille d'équipe gérée",
    llmHint: "Pour postes lead/manager : combien de personnes le candidat a déjà managées. Params.min = taille minimum.",
    paramKeys: ["min", "target"],
  },
  management_experience_years: {
    kind: "quantitative",
    defaultLabel: "Années d'encadrement",
    llmHint: "Années d'expérience en management hiérarchique (vs IC). Distinct de team_size. Params.min années.",
    paramKeys: ["min", "target"],
  },
  client_facing: {
    kind: "quantitative",
    defaultLabel: "Expérience client",
    llmHint: "Pour conseil/commerce/CSM : % du parcours en interface client direct (vs back-office). Params.min = % minimum estimé.",
    paramKeys: ["min"],
  },
  notice_period_weeks: {
    kind: "quantitative",
    defaultLabel: "Préavis",
    llmHint: "Semaines de préavis du candidat. Inversé : moins = mieux. Souvent un deal-breaker sur démarrage urgent. Params.max = max acceptable.",
    paramKeys: ["max"],
  },

  // ── Qualitatifs structurés ──────────────────────────────────────────
  language: {
    kind: "qualitative",
    defaultLabel: "Langue",
    llmHint: "Maîtrise d'une langue à un niveau minimum. Params.code = ISO 639-1 (fr, en, de, es, it, ar, zh, pt, ru, ja, nl), params.level_min = A1-C2 ou 'natif'. Crée un critère par langue requise.",
    paramKeys: ["code", "level_min"],
  },
  license: {
    kind: "qualitative",
    defaultLabel: "Permis",
    llmHint: "Permis de conduire. Params.code = 'B', 'BE', 'C', 'CE', 'D', 'poids_lourd', 'moto_A2', etc. Crée un critère par permis requis.",
    paramKeys: ["code"],
  },
  certification: {
    kind: "qualitative",
    defaultLabel: "Certification",
    llmHint: "Certification professionnelle (AWS, Azure, GCP, PMP, Scrum, ITIL, CISSP, TOEIC, TOEFL, Cisco, RNCP…). Params.name = nom (texte libre, le LLM matche flexible), params.min_score si applicable (TOEIC 700+).",
    paramKeys: ["name", "min_score"],
  },
  diploma: {
    kind: "qualitative",
    defaultLabel: "Diplôme",
    llmHint: "Niveau et/ou école précise. Params.level = 'bac', 'bac+2', 'bac+3', 'bac+5', 'doctorat', params.school si école précise demandée ('X' / 'Polytechnique' / 'HEC' / 'École de commerce top 5'…).",
    paramKeys: ["level", "school", "field"],
  },
  mobility: {
    kind: "qualitative",
    defaultLabel: "Mobilité",
    llmHint: "Localisation acceptable. Params.kind = 'remote_full' | 'remote_partial' | 'on_site_paris' | 'on_site_other' | 'france' | 'international'. Difficile à déduire d'un CV (le LLM met souvent 'unknown' s'il n'y a pas d'indice explicite).",
    paramKeys: ["kind", "city"],
  },
  availability: {
    kind: "qualitative",
    defaultLabel: "Disponibilité",
    llmHint: "Date de démarrage. Params.from_date ISO. Quasi impossible à déduire d'un CV → 'unknown' la plupart du temps. Utile à requestionner via formulaire.",
    paramKeys: ["from_date"],
  },
  legal_status: {
    kind: "qualitative",
    defaultLabel: "Statut juridique",
    llmHint: "Params.kind = 'eu_citizen', 'work_permit_required', 'freelance_ok', 'cdi_only', 'self_employed'. Permet de filtrer non-UE / freelance / salariat selon les besoins du client.",
    paramKeys: ["kind"],
  },
  clearance: {
    kind: "qualitative",
    defaultLabel: "Habilitation",
    llmHint: "Habilitation officielle requise. Params.kind = 'secret_defense', 'tres_secret_defense', 'electrique_b0', 'electrique_b1v', 'electrique_b2v', 'atex', 'cobalt', 'iso_27001_auditor', 'medicale_aptitude'…",
    paramKeys: ["kind"],
  },
  methodology: {
    kind: "qualitative",
    defaultLabel: "Méthodologie",
    llmHint: "Pratique d'une méthodo. Params.kind = 'agile', 'scrum', 'safe', 'lean', 'six_sigma', 'kanban', 'prince2', 'devops', 'waterfall'. Cite l'expérience (Scrum Master, PO, équipe Agile…).",
    paramKeys: ["kind"],
  },
  contract_preference: {
    kind: "qualitative",
    defaultLabel: "Type de contrat",
    llmHint: "Type acceptable côté client. Params.kinds = liste parmi ['cdi','cdd','freelance','portage','interim','alternance','stage','vie']. Évalue si le candidat est ouvert à au moins un de ces types.",
    paramKeys: ["kinds"],
  },
  salary_expectation: {
    kind: "qualitative",
    defaultLabel: "Prétentions salariales",
    llmHint: "Adéquation budget client vs prétention candidat. Params.max_brut_annuel ou max_tjm. Le LLM met 'unknown' si prétention non indiquée sur le CV (cas général). Utile pour formulaire E2.",
    paramKeys: ["max_brut_annuel", "max_tjm", "currency"],
  },
  travel_willingness: {
    kind: "qualitative",
    defaultLabel: "Déplacements",
    llmHint: "Niveau de déplacements acceptable. Params.kind = 'none', 'local', 'regional', 'national', 'international', 'frequent_international'.",
    paramKeys: ["kind", "pct_max"],
  },
  publication_portfolio: {
    kind: "qualitative",
    defaultLabel: "Portfolio / publications",
    llmHint: "Signal d'expertise visible publiquement. Params.kind = 'github_active', 'portfolio', 'blog', 'publications_academiques', 'brevets', 'conferences'. Vérifiable via URLs sur le CV.",
    paramKeys: ["kind"],
  },
  physical_requirements: {
    kind: "qualitative",
    defaultLabel: "Exigences physiques",
    llmHint: "Pour missions terrain. Params.kind = 'port_charge_lourd', 'station_debout_prolongee', 'conduite_quotidienne', 'vision_correcte', 'aptitude_travail_hauteur', 'aptitude_milieu_confine'. Quasi toujours 'unknown' (à confirmer entretien).",
    paramKeys: ["kind"],
  },

  // ── Escape hatch ────────────────────────────────────────────────────
  custom: {
    kind: "qualitative",
    defaultLabel: "Critère personnalisé",
    llmHint: "Pour tout critère non couvert par les autres types. Params.description = description courte du critère (\"a travaillé sur des projets ML en production\", \"a déjà managé une équipe internationale distribuée\"…). Le LLM évalue yes/no/unknown + evidence. À utiliser avec parcimonie.",
    paramKeys: ["description"],
  },
}

/** Cap dur de critères par mission (5 main + 5 bonus = 10 total). */
export const MAX_CRITERIA_PER_MISSION = 10
export const MAX_MAIN_CRITERIA = 5
export const MAX_BONUS_CRITERIA = 5

export function kindOf(type: CriterionType): CriterionKind {
  return CRITERION_CATALOG[type].kind
}

/** Sanitize les params d'un critère contre la liste blanche du catalogue.
 *  Strip toute clé non autorisée (sécurité + propreté DB). */
export function sanitizeCriterionParams(
  type: CriterionType,
  raw: unknown,
): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {}
  const allowed = new Set<string>(CRITERION_CATALOG[type].paramKeys)
  const src = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(src)) {
    if (allowed.has(k) && src[k] !== undefined && src[k] !== null) {
      out[k] = src[k]
    }
  }
  return out
}

/** Valide & normalise un critère brut (venant du LLM ou de l'UI).
 *  Retourne null si invalide. */
export function normalizeCriterion(raw: unknown): Criterion | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const type = r.type as CriterionType
  if (!type || !(type in CRITERION_CATALOG)) return null
  const label = typeof r.label === "string" && r.label.trim()
    ? r.label.trim().slice(0, 80)
    : CRITERION_CATALOG[type].defaultLabel
  const weight: CriterionWeight = r.weight === "bonus" ? "bonus" : "main"
  const source: CriterionSource = r.source === "manual" ? "manual" : "llm"
  const id = typeof r.id === "string" && r.id ? r.id : crypto.randomUUID()
  return {
    id,
    type,
    label,
    weight,
    source,
    params: sanitizeCriterionParams(type, r.params),
  }
}

/** Trie + cap pour respecter les limites de mission. Garde toujours les
 *  main en premier (ordre d'insertion préservé sinon). */
export function capCriteria(criteria: Criterion[]): Criterion[] {
  const main = criteria.filter((c) => c.weight === "main").slice(0, MAX_MAIN_CRITERIA)
  const bonus = criteria.filter((c) => c.weight === "bonus").slice(0, MAX_BONUS_CRITERIA)
  return [...main, ...bonus]
}
