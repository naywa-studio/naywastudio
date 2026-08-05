/**
 * Diff structurel entre deux jeux de critères (lot 3c v3).
 *
 * Nora renvoie une liste de critères COMPLÈTE révisée. Pour montrer au sourceur
 * UNIQUEMENT ce qui change (avant rouge → après vert), on calcule le diff nous-
 * mêmes sur les vraies données (pas sur une phrase du LLM = pas d'hallucination).
 *
 * Appariement par CLÉ stable (type + discriminant pour les types multiples :
 * langue→code, certif→nom, permis→code, custom→libellé). Un critère présent des
 * deux côtés mais avec des params/poids différents = "modify". Présent seulement
 * après = "add". Seulement avant = "remove". Identique (params+poids) = masqué,
 * même si le libellé a été reformulé.
 *
 * `applyCriteriaChanges` reconstruit la liste finale de façon déterministe à
 * partir des seuls changements ACCEPTÉS (cases cochées) → le sourceur garde la
 * main : décocher un changement = garder l'ancienne valeur pour ce critère.
 */

import type { Criterion, CriterionType } from "./job-criteria-catalog"
import { shortCriterionName, criterionValueLabel } from "./criterion-display"
import type { Lang } from "./i18n/LanguageContext"

export type CriterionChangeKind = "add" | "remove" | "modify"

export type CriterionChange = {
  /** Clé d'appariement stable (sert d'identifiant du changement). */
  key: string
  kind: CriterionChangeKind
  /** Critère actuel (null pour un ajout). */
  before: Criterion | null
  /** Critère proposé (null pour un retrait). */
  after: Criterion | null
}

/** Discriminant d'appariement. La plupart des types sont uniques par mission
 *  (un seul skills, une seule séniorité…) → clé = type. Les types multiples
 *  portent un discriminant. */
export function criterionKey(c: Criterion): string {
  const p = c.params as Record<string, unknown>
  switch (c.type) {
    case "language":
      return `language:${String(p.code ?? "").toLowerCase()}`
    case "certification":
      return `certification:${String(p.name ?? c.label ?? "").toLowerCase().trim()}`
    case "license":
      return `license:${String(p.code ?? "").toUpperCase()}`
    case "custom":
      return `custom:${String(c.label ?? p.description ?? "").toLowerCase().trim()}`
    default:
      return c.type
  }
}

/** Stringify stable (clés triées) pour comparer params indépendamment de
 *  l'ordre d'insertion. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`
}

/** Signature "matérielle" d'un critère (type + poids + params), IGNORE le
 *  libellé libre : un simple reformulage de label ne compte pas comme un
 *  changement. */
function signature(c: Criterion): string {
  return stableStringify({ type: c.type, weight: c.weight, params: c.params })
}

/** Calcule les changements entre `before` (actuel) et `after` (proposé).
 *  Les critères inchangés (même signature) ne sont PAS listés. */
export function computeCriteriaDiff(before: Criterion[], after: Criterion[]): CriterionChange[] {
  const beforeByKey = new Map<string, Criterion>()
  for (const c of before) beforeByKey.set(criterionKey(c), c)
  const afterByKey = new Map<string, Criterion>()
  for (const c of after) afterByKey.set(criterionKey(c), c)

  const changes: CriterionChange[] = []

  // Parcourt d'abord dans l'ordre de `before` (modif/retrait), puis les ajouts
  // dans l'ordre de `after` → rendu stable et lisible.
  for (const c of before) {
    const key = criterionKey(c)
    const next = afterByKey.get(key)
    if (!next) {
      changes.push({ key, kind: "remove", before: c, after: null })
    } else if (signature(c) !== signature(next)) {
      changes.push({ key, kind: "modify", before: c, after: next })
    }
    // sinon : inchangé → masqué
  }
  for (const c of after) {
    const key = criterionKey(c)
    if (!beforeByKey.has(key)) {
      changes.push({ key, kind: "add", before: null, after: c })
    }
  }
  return changes
}

/** Description LISIBLE d'un changement, pour l'affichage du diff. Les types à
 *  liste (compétences / contrat / secteurs) sont décrits en DELTA (items
 *  ajoutés / retirés) — c'est le seul moyen de voir « + Closing » ou « + CDI ».
 *  Les autres en valeur scalaire avant → après ("≥ 3 ans" → "≥ 5 ans"). */
export type ChangeDescription = {
  /** Nom court du critère concerné ("Compétences", "Contrat", "Anglais"…). */
  name: string
  /** Items ajoutés (types à liste). */
  addedItems?: string[]
  /** Items retirés (types à liste). */
  removedItems?: string[]
  /** Valeur scalaire avant (types non-liste). */
  beforeValue?: string | null
  /** Valeur scalaire après (types non-liste). */
  afterValue?: string | null
}

/** Clé de params portant la liste, par type. */
const LIST_PARAM: Partial<Record<CriterionType, string>> = {
  skills: "must",
  contract_preference: "kinds",
  domain_fit: "domains",
}

function listValues(c: Criterion): string[] | null {
  const key = LIST_PARAM[c.type]
  if (!key) return null
  const v = (c.params as Record<string, unknown>)[key]
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x).trim()).filter(Boolean)
}

/** Cosmétique : capitalise les items de contrat ("cdi" → "CDI", "alternance"
 *  → "Alternance"). Laisse les compétences telles quelles. */
function prettyItem(type: CriterionType, item: string): string {
  if (type === "contract_preference") {
    return item.length <= 4 ? item.toUpperCase() : item.charAt(0).toUpperCase() + item.slice(1)
  }
  return item
}

export function describeChange(ch: CriterionChange, lang: Lang): ChangeDescription {
  const ref = ch.after ?? ch.before
  if (!ref) return { name: "" }
  const name = shortCriterionName(ref, lang)

  const beforeList = ch.before ? listValues(ch.before) : null
  const afterList = ch.after ? listValues(ch.after) : null
  const isList = beforeList !== null || afterList !== null

  if (isList) {
    const b = new Set((beforeList ?? []).map((s) => s.toLowerCase()))
    const a = new Set((afterList ?? []).map((s) => s.toLowerCase()))
    const added = (afterList ?? []).filter((s) => !b.has(s.toLowerCase())).map((s) => prettyItem(ref.type, s))
    const removed = (beforeList ?? []).filter((s) => !a.has(s.toLowerCase())).map((s) => prettyItem(ref.type, s))
    return { name, addedItems: added, removedItems: removed }
  }

  let beforeValue = ch.before ? criterionValueLabel(ch.before, lang) : null
  let afterValue = ch.after ? criterionValueLabel(ch.after, lang) : null

  // Un changement de POIDS seul (obligatoire ↔ souhaité) fait diverger la
  // signature sans toucher la valeur affichée → on le reflète explicitement
  // pour ne pas montrer un « X → X » trompeur.
  if (ch.before && ch.after && ch.before.weight !== ch.after.weight) {
    const wl = (w: Criterion["weight"]) =>
      w === "main"
        ? (lang === "fr" ? "obligatoire" : "required")
        : (lang === "fr" ? "souhaité" : "nice-to-have")
    beforeValue = [beforeValue, wl(ch.before.weight)].filter(Boolean).join(" · ")
    afterValue = [afterValue, wl(ch.after.weight)].filter(Boolean).join(" · ")
  }

  return { name, beforeValue, afterValue }
}

/** Reconstruit la liste finale de critères à partir de l'état ACTUEL + des
 *  seuls changements acceptés. Déterministe. Préserve l'ordre : critères
 *  actuels d'abord (dans leur ordre), puis ajouts acceptés. */
export function applyCriteriaChanges(
  before: Criterion[],
  changes: CriterionChange[],
  acceptedKeys: Set<string>,
): Criterion[] {
  const accepted = new Map<string, CriterionChange>()
  for (const ch of changes) if (acceptedKeys.has(ch.key)) accepted.set(ch.key, ch)

  const result: Criterion[] = []
  const usedKeys = new Set<string>()

  // 1. Critères actuels, éventuellement modifiés/retirés si le changement est accepté.
  for (const c of before) {
    const key = criterionKey(c)
    usedKeys.add(key)
    const ch = accepted.get(key)
    if (!ch) { result.push(c); continue }
    if (ch.kind === "remove") continue // retrait accepté → on saute
    if (ch.kind === "modify" && ch.after) { result.push(ch.after); continue }
    result.push(c)
  }
  // 2. Ajouts acceptés (clés absentes de `before`).
  for (const ch of changes) {
    if (!acceptedKeys.has(ch.key)) continue
    if (ch.kind === "add" && ch.after && !usedKeys.has(ch.key)) {
      result.push(ch.after)
      usedKeys.add(ch.key)
    }
  }
  return result
}
