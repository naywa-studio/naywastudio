/**
 * Détection d'off-limits (conflit d'intérêt) — SEGMENT CABINET/ESN.
 *
 * Règle métier : on ne débauche pas un candidat qui travaille ACTUELLEMENT
 * chez un de nos clients pour le présenter à un autre client. Ce module
 * compare l'employeur actuel d'un candidat à l'annuaire des clients de l'org.
 *
 * 100 % déterministe, zéro LLM au runtime : normalisation + correspondance
 * de tokens + similarité + domaine. Tolérant aux variantes d'écriture
 * (« Acme », « acme », « Acme Solutions », « ACME SAS »).
 *
 * Verdict :
 *   - "confirmed" : correspondance forte (nom exact normalisé, alias exact,
 *     ou domaine identique) → badge rouge, conflit quasi certain.
 *   - "possible"  : correspondance partielle (sous-ensemble de tokens ou
 *     similarité élevée) → badge ambré « à confirmer », le sourceur tranche.
 *   - "none"      : aucun signal.
 *
 * L'off-limits est un AVERTISSEMENT, jamais un blocage : le sourceur reste
 * décideur. On préfère un « à confirmer » de trop qu'un conflit manqué.
 */

import type { ParsedCv } from "./database.types"

export type OffLimitsVerdict = "none" | "possible" | "confirmed"

export interface OffLimitsClientRef {
  id: string
  name: string
  aliases?: string[] | null
  domain?: string | null
}

export interface OffLimitsResult {
  verdict: OffLimitsVerdict
  /** Client en conflit (le plus fort match), ou null si verdict "none". */
  client: { id: string; name: string } | null
}

// Formes juridiques + suffixes corporate génériques retirés à la normalisation
// (pour que « Acme SAS » == « Acme »). On NE retire PAS « solutions / conseil /
// services » : le matching par sous-ensemble de tokens s'en charge sans risquer
// d'écraser un nom distinctif.
const LEGAL_TOKENS = new Set([
  "sas", "sa", "sarl", "sasu", "eurl", "sci", "scp", "snc", "sca", "gie",
  "group", "groupe", "holding", "cie", "co", "ltd", "llc", "inc", "gmbh", "bv",
  "et", "and", "associes", "associés", "partners",
])

/** Minuscule + sans accents + ponctuation → espace + espaces compactés. */
export function normalizeCompany(raw: string | null | undefined): string {
  if (!raw) return ""
  return raw
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // accents combinants
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

/** Tokens signifiants (formes juridiques + mots vides retirés). */
function significantTokens(normalized: string): string[] {
  return normalized.split(" ").filter((tk) => tk.length > 0 && !LEGAL_TOKENS.has(tk))
}

/** Forme « collée » (tokens signifiants sans espace) — rapproche « SwissLife »
 *  de « Swiss Life ». */
function collapsed(tokens: string[]): string {
  return tokens.join("")
}

/** Nettoie un domaine (retire protocole / www / chemin, minuscule). */
export function normalizeDomain(raw: string | null | undefined): string {
  if (!raw) return ""
  return raw.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
}

/** Jaccard sur deux ensembles de tokens. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const tk of a) if (b.has(tk)) inter++
  return inter / (a.size + b.size - inter)
}

function isSubset(small: Set<string>, big: Set<string>): boolean {
  if (small.size === 0) return false
  for (const tk of small) if (!big.has(tk)) return false
  return true
}

const VERDICT_RANK: Record<OffLimitsVerdict, number> = { none: 0, possible: 1, confirmed: 2 }

/**
 * Compare l'employeur actuel (+ domaine email optionnel) d'un candidat à
 * l'annuaire clients. Renvoie le conflit le plus fort trouvé.
 */
export function detectOffLimits(
  currentCompany: string | null | undefined,
  emailDomain: string | null | undefined,
  clients: OffLimitsClientRef[],
): OffLimitsResult {
  const normCompany = normalizeCompany(currentCompany)
  const candDomain = normalizeDomain(emailDomain)
  if (!normCompany && !candDomain) return { verdict: "none", client: null }

  const compTokenList = significantTokens(normCompany)
  const compTokens = new Set(compTokenList)
  const compCollapsed = collapsed(compTokenList)

  let best: OffLimitsResult = { verdict: "none", client: null }
  const consider = (verdict: OffLimitsVerdict, client: OffLimitsClientRef) => {
    if (VERDICT_RANK[verdict] > VERDICT_RANK[best.verdict]) {
      best = { verdict, client: { id: client.id, name: client.name } }
    }
  }

  for (const client of clients) {
    // 1) Domaine identique = signal fort.
    const clientDomain = normalizeDomain(client.domain)
    if (candDomain && clientDomain && candDomain === clientDomain) {
      consider("confirmed", client)
      continue
    }

    if (!normCompany) continue

    // 2) Nom + alias : exact normalisé = confirmé ; sous-ensemble / similarité
    //    = possible.
    const names = [client.name, ...(client.aliases ?? [])]
    for (const nm of names) {
      const normName = normalizeCompany(nm)
      if (!normName) continue
      if (normName === normCompany) { consider("confirmed", client); break }

      const nameTokenList = significantTokens(normName)
      const nameTokens = new Set(nameTokenList)
      const nameCollapsed = collapsed(nameTokenList)
      if (nameTokens.size === 0 || compTokens.size === 0) continue

      // Forme collée identique (« SwissLife » == « Swiss Life ») → confirmé.
      if (compCollapsed && nameCollapsed && compCollapsed === nameCollapsed) {
        consider("confirmed", client); break
      }
      // Sous-ensemble de tokens (« engie » ⊂ « engie solutions ») → possible.
      if (isSubset(nameTokens, compTokens) || isSubset(compTokens, nameTokens)) {
        consider("possible", client)
        continue
      }
      // Forme collée : l'une contient l'autre (assez longue) → possible.
      if (compCollapsed.length >= 5 && nameCollapsed.length >= 5
          && (compCollapsed.includes(nameCollapsed) || nameCollapsed.includes(compCollapsed))) {
        consider("possible", client)
        continue
      }
      if (jaccard(compTokens, nameTokens) >= 0.5) consider("possible", client)
    }
    if (best.verdict === "confirmed") break
  }

  return best
}

/** Une date de fin « vide » ou marquée en cours = poste ACTUEL. */
function isOngoingEnd(end: string | null | undefined): boolean {
  if (end === null || end === undefined) return true
  const e = end.trim().toLowerCase()
  if (e === "") return true
  return /present|présent|aujourd|actuel|current|now|en cours|ongoing/.test(e)
}

/**
 * Employeurs ACTUELS d'un candidat = expériences SANS date de fin (poste en
 * cours). C'est la base fiable de l'off-limits : on ne veut PAS taguer un
 * candidat qui a QUITTÉ un client.
 *
 * Fallback : si l'historique structuré est absent, on retombe sur
 * `fallbackCompany` (current_company) — best effort. Mais si l'historique
 * existe et qu'AUCUN poste n'est en cours, on renvoie [] (parti de partout →
 * pas d'off-limits, même si current_company pointe un ancien poste).
 */
export function currentEmployers(
  cv: ParsedCv | null | undefined,
  fallbackCompany: string | null | undefined,
): string[] {
  const exp = cv?.experience ?? []
  if (exp.length > 0) {
    const ongoing = exp
      .filter((e) => e && isOngoingEnd(e.end) && (e.company ?? "").trim().length > 0)
      .map((e) => e.company.trim())
    // dédoublonne en préservant l'ordre
    return [...new Set(ongoing)]
  }
  const fb = (fallbackCompany ?? "").trim()
  return fb ? [fb] : []
}

/**
 * Off-limits d'un candidat (tenure-aware) : ne considère que ses employeurs
 * ACTUELS + son domaine email. Renvoie le conflit le plus fort trouvé.
 */
export function detectOffLimitsForCandidate(
  cv: ParsedCv | null | undefined,
  fallbackCompany: string | null | undefined,
  clients: OffLimitsClientRef[],
): OffLimitsResult {
  if (clients.length === 0) return { verdict: "none", client: null }
  // Domaine de l'email (partie après @) — signal de CONFIRMATION à côté d'un
  // employeur actuel nommé, pas un déclencheur seul (un email ne prouve pas
  // qu'on est TOUJOURS en poste).
  const rawEmail = (cv?.email ?? "").trim()
  const at = rawEmail.lastIndexOf("@")
  const domain = at >= 0 ? normalizeDomain(rawEmail.slice(at + 1)) : ""
  const employers = currentEmployers(cv, fallbackCompany)

  let best: OffLimitsResult = { verdict: "none", client: null }
  const rank = (r: OffLimitsResult) => VERDICT_RANK[r.verdict]

  for (const co of employers) {
    const r = detectOffLimits(co, domain, clients)
    if (rank(r) > rank(best)) best = r
    if (best.verdict === "confirmed") return best
  }
  return best
}
