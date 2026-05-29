/**
 * Seniority bands — shared, pure, dependency-free so both the browser form
 * and the server-side matching can use the exact same logic.
 *
 * A mission's seniority is captured as an EXPERIENCE INTERVAL (e.g. 5–10 years).
 * From that interval we derive:
 *   - the set of bands it overlaps (for a human-readable "Mid → Senior" label),
 *   - a single primary band (the one containing the interval midpoint) that
 *     feeds the existing matching pipeline, which expects one seniority key.
 *
 * Bands mirror the ones used by the CV parser (cv-parser.ts seniority_level)
 * so a mission's detected band lines up with a candidate's stored band.
 */

export interface SeniorityBand {
  key: "junior" | "mid" | "senior" | "lead" | "principal"
  label: string
  /** Inclusive lower bound in years. */
  min: number
  /** Exclusive upper bound in years (Infinity for the last band). */
  max: number
}

// junior <3 · mid 3-6 · senior 6-10 · lead 10-15 · principal 15+
export const SENIORITY_BANDS: SeniorityBand[] = [
  { key: "junior",    label: "Junior",    min: 0,  max: 3 },
  { key: "mid",       label: "Mid",       min: 3,  max: 6 },
  { key: "senior",    label: "Senior",    min: 6,  max: 10 },
  { key: "lead",      label: "Lead",      min: 10, max: 15 },
  { key: "principal", label: "Principal", min: 15, max: Infinity },
]

/** Normalize a possibly-messy interval: clamps, swaps if reversed, defaults. */
export function normalizeInterval(
  minYears: number | null | undefined,
  maxYears: number | null | undefined,
): { min: number; max: number } | null {
  const a = typeof minYears === "number" && isFinite(minYears) ? Math.max(0, minYears) : null
  const b = typeof maxYears === "number" && isFinite(maxYears) ? Math.max(0, maxYears) : null
  if (a == null && b == null) return null
  const lo = a ?? b ?? 0
  const hi = b ?? a ?? lo
  return lo <= hi ? { min: lo, max: hi } : { min: hi, max: lo }
}

/** Every band that overlaps the [min, max] interval, in order. */
export function bandsForInterval(
  minYears: number | null | undefined,
  maxYears: number | null | undefined,
): SeniorityBand[] {
  const iv = normalizeInterval(minYears, maxYears)
  if (!iv) return []
  return SENIORITY_BANDS.filter((b) => iv.min < b.max && iv.max >= b.min)
}

/** Single primary band key — the band containing the interval midpoint. */
export function primarySeniority(
  minYears: number | null | undefined,
  maxYears: number | null | undefined,
): SeniorityBand["key"] | null {
  const iv = normalizeInterval(minYears, maxYears)
  if (!iv) return null
  const mid = (iv.min + iv.max) / 2
  const band = SENIORITY_BANDS.find((b) => mid >= b.min && mid < b.max)
  return band?.key ?? "principal"
}

/**
 * Human-readable label for the interval's detected seniority.
 * One band  → "Senior"
 * Several   → "Mid → Senior"
 */
export function seniorityIntervalLabel(
  minYears: number | null | undefined,
  maxYears: number | null | undefined,
): string | null {
  const bands = bandsForInterval(minYears, maxYears)
  if (bands.length === 0) return null
  if (bands.length === 1) return bands[0].label
  return `${bands[0].label} → ${bands[bands.length - 1].label}`
}
