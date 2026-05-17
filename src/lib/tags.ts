/**
 * Custom-tag helpers.
 *
 * The candidates.tags column mixes system flags (doublon, ancien) with
 * free-form tags the sourcer creates ("à recontacter", "client X",
 * "freelance"…). These helpers split the two so we never accidentally
 * surface or wipe a system flag from the custom-tag UI.
 */

export const SYSTEM_TAGS: ReadonlySet<string> = new Set(["doublon", "ancien"])

/** Tags the sourcer can actually edit / display as custom labels. */
export function customTagsOf(tags: string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) return []
  return tags.filter((t) => typeof t === "string" && !SYSTEM_TAGS.has(t))
}

/** Same as above but preserves system flags so callers can write back the
 *  full array. */
export function withCustomTag(tags: string[] | null | undefined, tag: string): string[] {
  const normalized = normalizeTag(tag)
  if (!normalized) return tags ?? []
  const current = tags ?? []
  if (current.some((t) => t.toLowerCase() === normalized.toLowerCase())) return current
  return [...current, normalized]
}

export function withoutCustomTag(tags: string[] | null | undefined, tag: string): string[] {
  const normalized = normalizeTag(tag)
  if (!normalized) return tags ?? []
  return (tags ?? []).filter((t) => t.toLowerCase() !== normalized.toLowerCase())
}

/** Trims, collapses whitespace, caps length. Returns null if empty. */
export function normalizeTag(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, " ").slice(0, 32)
  if (!trimmed) return null
  // Disallow accidentally creating a system tag.
  if (SYSTEM_TAGS.has(trimmed.toLowerCase())) return null
  return trimmed
}
