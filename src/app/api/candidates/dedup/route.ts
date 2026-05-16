/**
 * POST /api/candidates/dedup
 *
 * "Lancer le tri" — Nora scans every candidate of the current user, groups
 * them by email (then phone), and for each group keeps the freshest version
 * canonical while tagging the others "ancien" (hidden from the vivier).
 *
 * The freshness signal is the most recent experience end-date in parsed_cv
 * (null end = still in role = today), falling back to created_at when no
 * usable dates exist. Deterministic, no LLM call needed.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import type { ParsedCv } from "@/lib/database.types"

export const runtime = "nodejs"
export const maxDuration = 30

interface Row {
  id: string
  email: string | null
  phone: string | null
  parsed_cv: ParsedCv | null
  created_at: string
  tags: string[] | null
}

function freshnessTimestamp(cv: ParsedCv | null, fallbackIso: string): number {
  const now = Date.now()
  const exps = cv?.experience ?? []
  let latest = 0
  for (const e of exps) {
    if (e?.end === null) return now
    const s = typeof e?.end === "string" ? e.end : null
    if (!s) continue
    const m = s.match(/^(\d{4})(?:-(\d{1,2}))?/)
    if (!m) continue
    const y = parseInt(m[1], 10)
    if (y < 1950 || y > 2100) continue
    const mo = m[2] ? Math.max(1, Math.min(12, parseInt(m[2], 10))) - 1 : 11
    const t = Date.UTC(y, mo, 28)
    if (t > latest) latest = t
  }
  return latest || new Date(fallbackIso).getTime()
}

export async function POST() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const admin = getAdminSupabase()

  // Pull every non-archived candidate for this user. parsed_cv is needed for
  // the freshness score; created_at as the tie-breaker fallback.
  const { data: rowsRaw, error } = await admin
    .from("candidates")
    .select("id, email, phone, parsed_cv, created_at, tags")
    .eq("user_id", user.id)
    .not("tags", "cs", "{ancien}")

  if (error) {
    return NextResponse.json({ error: "db_failed", detail: error.message }, { status: 500 })
  }
  const rows = (rowsRaw ?? []) as unknown as Row[]

  // Group by email first, then phone (for rows without email).
  const groups = new Map<string, Row[]>()
  const keyFor = (r: Row) => {
    if (r.email) return `e:${r.email.toLowerCase()}`
    if (r.phone) return `p:${r.phone.replace(/\s+/g, "")}`
    return ""
  }
  for (const r of rows) {
    const k = keyFor(r)
    if (!k) continue
    const arr = groups.get(k)
    if (arr) arr.push(r)
    else groups.set(k, [r])
  }

  let archived = 0
  let kept = 0

  for (const [, group] of groups) {
    if (group.length < 2) continue
    // Pick the freshest as the survivor.
    const sorted = [...group].sort((a, b) => {
      const fa = freshnessTimestamp(a.parsed_cv, a.created_at)
      const fb = freshnessTimestamp(b.parsed_cv, b.created_at)
      if (fb !== fa) return fb - fa
      // Tie-break: the more recently uploaded row wins.
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    const survivor = sorted[0]
    const losers = sorted.slice(1)

    // Drop "doublon" from the survivor.
    const survivorTags = (survivor.tags ?? []).filter((t) => t !== "doublon")
    if ((survivor.tags ?? []).includes("doublon")) {
      await admin.from("candidates").update({ tags: survivorTags }).eq("id", survivor.id)
    }
    kept += 1

    for (const l of losers) {
      const next = (l.tags ?? []).filter((t) => t !== "doublon")
      if (!next.includes("ancien")) next.push("ancien")
      await admin.from("candidates").update({ tags: next }).eq("id", l.id)
      archived += 1
    }
  }

  return NextResponse.json({ ok: true, archived, kept })
}
