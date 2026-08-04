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

import type { Criterion } from "./job-criteria-catalog"

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
