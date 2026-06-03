/**
 * vivier-clusters — dérive les secteurs (clusters) d'un vivier à partir de
 * la liste des candidats.
 *
 * Pas de migration DB pour V1 : on lit `candidate.taxonomy.role_family[0]`
 * comme cluster primaire et `role_family[1]` comme cluster secondaire si
 * présent (profils hybrides). MAIS les role_family produits par le LLM sont
 * très fins ("Senior Data Engineer Spark", "Big Data Developer"…) — ça
 * créerait 1 zone par profil, ce qui casse l'idée d'atlas. On consolide
 * donc d'abord vers ~10 grandes familles métier via consolidateClusterLabel.
 *
 * Couleurs / positions : déterministes à partir du nom du cluster (hash →
 * hue), pour que les couleurs restent stables entre les renders.
 */

import type { Candidate } from "./database.types"

/** Etiquette de fallback quand le LLM n'a pas pu déterminer un rôle. */
const FALLBACK_CLUSTER = "À reclasser"

/** Familles métier macro — l'atlas du vivier reste lisible quel que soit le
 *  niveau de finesse renvoyé par le LLM. Ordonné par fréquence présumée. */
const BROAD_CLUSTERS: ReadonlyArray<{ label: string; tokens: string[] }> = [
  { label: "Data",              tokens: ["data engineer", "data engineering", "data eng", "data scientist", "data science", "data analyst", "analytics engineer", "big data", "data platform", "data ops", "machine learning", "ml engineer", "ml ops", "ia engineer", "ai engineer", "data"] },
  { label: "Backend",           tokens: ["backend", "back-end", "back end", "api", "node.js", "node engineer", "software engineer", "software developer", "ingénieur logiciel", "ingénieur software", "java engineer", "python engineer", "golang", "go engineer", "kotlin", "scala engineer", "rust engineer", "platform engineer"] },
  { label: "Frontend",          tokens: ["frontend", "front-end", "front end", "ui engineer", "ux engineer", "react developer", "vue developer", "angular", "javascript developer", "design system"] },
  { label: "Fullstack",         tokens: ["full stack", "fullstack", "full-stack", "développeur full", "développeuse full", "full stack developer", "fullstack engineer", "développeur"] },
  { label: "Mobile",            tokens: ["ios", "android", "mobile", "react native", "flutter", "swift", "kotlin android"] },
  { label: "DevOps / Cloud",    tokens: ["devops", "sre", "site reliability", "cloud engineer", "cloud architect", "platform engineer", "infrastructure", "kubernetes", "terraform", "infra", "ingénieur devops", "ingénieur cloud"] },
  { label: "Cybersécurité",     tokens: ["security", "cyber", "sécurité", "infosec", "pentest", "appsec", "soc analyst"] },
  { label: "Quant / Finance",   tokens: ["quant", "trading", "actuaire", "actuary", "risk analyst", "compliance officer", "compliance", "finance", "audit"] },
  { label: "Produit / PM",      tokens: ["product manager", "product owner", "product designer", "pm", "po"] },
  { label: "Design",            tokens: ["ux designer", "ui designer", "designer produit", "design ops"] },
  { label: "Étudiants",         tokens: ["étudiant", "étudiante", "stagiaire", "stage", "junior", "alternant", "alternance"] },
]

/** Ramène un libellé fin (role_family produit par le LLM) vers une famille
 *  métier macro. Si rien ne matche, on garde le libellé d'origine (capitalisé
 *  proprement) pour ne pas perdre l'info — ça générera une petite zone "À
 *  reclasser" ou un libellé fin isolé. */
export function consolidateClusterLabel(raw: string): string {
  const norm = raw.toLowerCase().trim()
  if (!norm) return FALLBACK_CLUSTER
  for (const broad of BROAD_CLUSTERS) {
    if (broad.tokens.some((t) => norm.includes(t))) return broad.label
  }
  // Capitaliser proprement le libellé d'origine pour les niches.
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
    .trim()
}

export interface VivierCluster {
  /** Clé stable (slug lowercase) pour comparer et router. */
  id: string
  /** Libellé affiché (capitalisation d'origine du premier candidat rencontré). */
  label: string
  /** Hue HSL stable, dérivé du slug. */
  hue: number
  /** Candidats dont c'est le secteur primaire (poids le plus élevé). */
  primary: Candidate[]
  /** Candidats hybrides — c'est l'un de leurs secteurs secondaires (poids ≥ 0.5
   *  mais inférieur au poids de leur secteur primaire). */
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

/** Lit les clusters d'un candidat.
 *
 *  Priorité 1 : cluster_assignments produit par Nora lors d'un passage de
 *  clustering (POST /api/vivier/cluster). C'est la vérité — Nora a regardé
 *  le profil entier et a décidé.
 *
 *  Priorité 2 (fallback, pas encore classé) : on consolide la role_family
 *  fine du parsing vers une famille macro. Permet d'afficher quelque chose
 *  sur la carte même avant le premier passage de clustering. */
export function candidateClusters(c: Candidate): { primary: string; secondary: string | null; extras: string[] } {
  const assigns = c.cluster_assignments ?? []
  if (assigns.length > 0) {
    // Garantir le tri par poids décroissant (la route trie déjà mais on
    // se reblinde en lecture).
    const sorted = [...assigns].sort((a, b) => b.weight - a.weight)
    const primary = sorted[0].label
    const secondary = sorted[1]?.label ?? null
    const extras = sorted.slice(2).map((a) => a.label)
    return { primary, secondary, extras }
  }
  // Fallback : on n'a pas encore lancé le clustering, on retombe sur la
  // consolidation heuristique.
  const family = c.taxonomy?.role_family ?? []
  const rawPrimary = (family[0] ?? "").trim()
  const rawSecondary = (family[1] ?? "").trim()
  const primary = rawPrimary ? consolidateClusterLabel(rawPrimary) : FALLBACK_CLUSTER
  const secondary = rawSecondary ? consolidateClusterLabel(rawSecondary) : null
  if (secondary && secondary === primary) return { primary, secondary: null, extras: [] }
  return { primary, secondary, extras: [] }
}

/** Clé safe pour HTML/SVG (pas d'espaces, accents, caractères spéciaux).
 *  Une id de gradient SVG avec espace casse la résolution `url(#…)`. */
const clusterKey = (label: string) =>
  label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim() || "x"

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
    const { primary, secondary, extras } = candidateClusters(c)
    const pk = clusterKey(primary)
    const pEntry = bucket.get(pk) ?? { label: primary, primary: [], secondary: [] }
    pEntry.primary.push(c)
    bucket.set(pk, pEntry)

    // Tous les clusters non-primaires reçoivent le candidat en hybride
    // (rare au-delà du secondaire — max 3 ou 4 dans des cas vraiment
    // ambigus, c'est ce que Nora décide).
    for (const lbl of [secondary, ...extras].filter((x): x is string => !!x)) {
      const sk = clusterKey(lbl)
      const sEntry = bucket.get(sk) ?? { label: lbl, primary: [], secondary: [] }
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
  // Tie-breaker stable : à total égal, on classe par id pour que l'ordre
  // ne dépende pas de l'ordre d'insertion dans la Map.
  rows.sort((a, b) => (b.total - a.total) || a.id.localeCompare(b.id))

  const N = rows.length
  if (N === 0) return []
  const maxTotal = rows[0].total

  /* Layout adaptatif :
   *   - Le plus gros cluster au CENTRE (occupe l'espace, sinon donut).
   *   - Anneau interne (jusqu'à 5 clusters) autour à distance 0.27.
   *   - Anneau externe (le reste) à distance 0.42, décalé d'un demi-angle
   *     pour ne pas se superposer aux clusters de l'anneau interne.
   *
   * Les positions sont déterministes (tri stable par total + id) — entre
   * deux runs avec exactement les mêmes clusters, les zones ne bougent
   * pas. Quand un nouveau cluster apparait, on réindexe : l'arrangement
   * s'adapte intelligemment.
   *
   * Toutes les coordonnées sont clampées à [0.18, 0.82] sur les deux axes
   * pour que les cercles ne se fassent jamais couper par le bord du canvas
   * (ce qui créait une délimitation rectiligne en haut). */
  const layout = computeLayout(N)
  const positioned = rows.map((r, i) => {
    const pos = layout[i]
    // Rayon visuel : √(total / maxTotal), un peu plus grand pour le cluster
    // central (qui a l'espace), un peu plus petit pour les périphériques.
    const sizeFactor = Math.sqrt(Math.max(r.total, 1) / maxTotal)
    const baseRadius = 0.13 + sizeFactor * 0.13
    const radius = i === 0 ? baseRadius * 1.15 : baseRadius
    return { ...r, cx: pos.cx, cy: pos.cy, radius }
  })

  return positioned
}

/** Pré-calcule les positions normalisées (cx, cy) pour N clusters, en
 *  respectant l'invariant : index 0 au centre, suivants en anneau interne
 *  puis externe. Toujours clampé pour éviter de toucher le bord du canvas. */
function computeLayout(n: number): Array<{ cx: number; cy: number }> {
  const positions: Array<{ cx: number; cy: number }> = []
  if (n === 0) return positions
  if (n === 1) {
    positions.push({ cx: 0.5, cy: 0.5 })
    return positions
  }
  // Cluster #0 : centre
  positions.push({ cx: 0.5, cy: 0.5 })

  const inner = Math.min(n - 1, 5)
  const outer = n - 1 - inner

  // Anneau interne, partant du haut, dans le sens horaire
  const angleOffsetInner = -Math.PI / 2
  for (let k = 0; k < inner; k++) {
    const angle = angleOffsetInner + (k / inner) * Math.PI * 2
    positions.push({
      cx: clamp(0.5 + Math.cos(angle) * 0.27, 0.18, 0.82),
      cy: clamp(0.5 + Math.sin(angle) * 0.27, 0.18, 0.82),
    })
  }

  // Anneau externe : décalé d'un demi-angle pour offset visuel
  if (outer > 0) {
    const angleOffsetOuter = -Math.PI / 2 + Math.PI / Math.max(outer, 1)
    for (let k = 0; k < outer; k++) {
      const angle = angleOffsetOuter + (k / outer) * Math.PI * 2
      positions.push({
        cx: clamp(0.5 + Math.cos(angle) * 0.42, 0.18, 0.82),
        cy: clamp(0.5 + Math.sin(angle) * 0.42, 0.18, 0.82),
      })
    }
  }
  return positions
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** HSL stable pour les éléments UI (chips, bandeaux, gradients). */
export function hsl(hue: number, sat = 65, lit = 60): string {
  return `hsl(${hue}, ${sat}%, ${lit}%)`
}

export const VIVIER_CLUSTER_FALLBACK = FALLBACK_CLUSTER
