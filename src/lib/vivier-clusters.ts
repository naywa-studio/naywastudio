/**
 * vivier-clusters — dérive les secteurs (clusters) d'un vivier à partir de
 * la liste des candidats. Pas de migration DB pour V1 : on lit
 * `candidate.taxonomy.role_family[0]` comme cluster primaire, et
 * `role_family[1]` comme cluster secondaire si présent (profils hybrides).
 *
 * Les noms de clusters viennent donc directement du LLM côté parsing CV.
 * Si le LLM produit "Data engineer" et "Data Engineer" pour deux profils,
 * la dédupe ci-dessous les fusionne (clé : lowercase trim).
 *
 * Couleurs / positions : déterministes à partir du nom du cluster (hash →
 * hue), pour que les couleurs restent stables entre les renders.
 */

import type { Candidate } from "./database.types"

/** Etiquette de fallback quand le LLM n'a pas pu déterminer un rôle. */
const FALLBACK_CLUSTER = "À reclasser"

export interface VivierCluster {
  /** Clé stable (slug lowercase) pour comparer et router. */
  id: string
  /** Libellé affiché (capitalisation d'origine du premier candidat rencontré). */
  label: string
  /** Hue HSL stable, dérivé du slug. */
  hue: number
  /** Candidats dont c'est le secteur primaire. */
  primary: Candidate[]
  /** Candidats dont c'est le secteur secondaire (profils hybrides). */
  secondary: Candidate[]
  /** Total visible dans ce secteur (primaires + secondaires). */
  total: number
  /** Position dans le canvas Carte, normalisée 0..1. Calculée en fonction
   *  de l'index dans la couronne radiale + taille relative. */
  cx: number
  cy: number
  /** Rayon normalisé 0..1 (proportionnel à √total). */
  radius: number
}

/** Lit le cluster primaire / secondaire d'un candidat depuis son parsing.
 *  Renvoie FALLBACK_CLUSTER pour les CVs sans role_family. */
export function candidateClusters(c: Candidate): { primary: string; secondary: string | null } {
  const family = c.taxonomy?.role_family ?? []
  const primary = (family[0] ?? "").trim() || FALLBACK_CLUSTER
  const secondary = (family[1] ?? "").trim() || null
  return { primary, secondary }
}

const clusterKey = (label: string) => label.toLowerCase().trim()

/** Hash léger string → hue 0-360 (stable). FNV-1a-ish. */
function hashHue(label: string): number {
  let h = 2166136261
  const s = clusterKey(label)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  // Steer towards the 0-360 range with offset to avoid pure red (which clashes
  // with our destructive UI states).
  return ((h >>> 0) % 320) + 20
}

/** Construit la liste des clusters à partir des candidats du vivier. Les
 *  clusters sont triés par total décroissant (gros secteur d'abord). */
export function buildClusters(candidates: Candidate[]): VivierCluster[] {
  const bucket = new Map<string, { label: string; primary: Candidate[]; secondary: Candidate[] }>()

  for (const c of candidates) {
    const { primary, secondary } = candidateClusters(c)
    const pk = clusterKey(primary)
    const pEntry = bucket.get(pk) ?? { label: primary, primary: [], secondary: [] }
    pEntry.primary.push(c)
    bucket.set(pk, pEntry)

    if (secondary) {
      const sk = clusterKey(secondary)
      const sEntry = bucket.get(sk) ?? { label: secondary, primary: [], secondary: [] }
      sEntry.secondary.push(c)
      bucket.set(sk, sEntry)
    }
  }

  const rows = Array.from(bucket.entries()).map(([id, v]) => ({
    id,
    label: v.label,
    hue: hashHue(v.label),
    primary: v.primary,
    secondary: v.secondary,
    total: v.primary.length + v.secondary.length,
  }))
  rows.sort((a, b) => b.total - a.total)

  // Disposition radiale : on place les clusters en couronne autour du centre,
  // taille du cercle proportionnelle à √total (sinon le plus gros mange tout).
  const N = rows.length
  if (N === 0) return []
  const maxTotal = rows[0].total
  const angleOffset = -Math.PI / 2 // commencer en haut

  return rows.map((r, i) => {
    let cx: number, cy: number
    if (N === 1) {
      cx = 0.5; cy = 0.5
    } else {
      // Distribution en couronne, avec un rayon de placement de 0.30 du canvas.
      const angle = angleOffset + (i / N) * Math.PI * 2
      cx = 0.5 + Math.cos(angle) * 0.30
      cy = 0.5 + Math.sin(angle) * 0.30
    }
    // Rayon visuel proportionnel à √(total / maxTotal), borné.
    const radius = 0.10 + Math.sqrt(r.total / maxTotal) * 0.18
    return { ...r, cx, cy, radius }
  })
}

/** HSL stable pour les éléments UI (chips, bandeaux, gradients). */
export function hsl(hue: number, sat = 65, lit = 60): string {
  return `hsl(${hue}, ${sat}%, ${lit}%)`
}

export const VIVIER_CLUSTER_FALLBACK = FALLBACK_CLUSTER
