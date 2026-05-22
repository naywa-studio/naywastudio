/**
 * POST /api/jobs   — create a job, then normalize it for matching.
 * GET  /api/jobs   — list the caller's jobs (newest first).
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { normalizeJob } from "@/lib/matching"

export const runtime = "nodejs"
export const maxDuration = 30

const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t.length ? t : null
}
/** Parses optional numeric fields from the form (TJM, marge %, durée mois).
 *  Empty string / null / NaN → null so the column stays nullable in DB. */
const cleanNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
const cleanArr = (v: unknown): string[] => {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of v) {
    const s = String(x).trim()
    if (!s) continue
    const k = s.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k); out.push(s)
    if (out.length >= 30) break
  }
  return out
}

export async function GET() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data, error } = await sb
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 })
  return NextResponse.json({ jobs: data ?? [] })
}

export async function POST(req: NextRequest) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const title = clean(body?.title)
  if (!title) {
    return NextResponse.json({ error: "missing_title", message: "Le titre du poste est requis." }, { status: 400 })
  }

  const payload = {
    user_id: user.id,
    title,
    location: clean(body?.location),
    seniority: clean(body?.seniority),
    contract_type: clean(body?.contract_type),
    required_skills: cleanArr(body?.required_skills),
    nice_to_have_skills: cleanArr(body?.nice_to_have_skills),
    description: clean(body?.description),
    status: "open" as const,
    // Pricing — all optional, sourceur can fill them at creation or later.
    client_tjm_min: cleanNumber(body?.client_tjm_min),
    client_tjm_max: cleanNumber(body?.client_tjm_max),
    margin_min_pct: cleanNumber(body?.margin_min_pct),
    duration_months: cleanNumber(body?.duration_months),
  }

  const { data: created, error: insertErr } = await sb
    .from("jobs")
    .insert(payload)
    .select("*")
    .single()

  if (insertErr || !created) {
    return NextResponse.json({ error: "db_insert_failed", detail: insertErr?.message }, { status: 500 })
  }

  // Normalize for matching (best-effort — a failure here doesn't block creation).
  try {
    const normalized = await normalizeJob(payload)
    const { data: updated } = await sb
      .from("jobs")
      .update({ normalized })
      .eq("id", created.id)
      .select("*")
      .single()
    return NextResponse.json({ ok: true, job: updated ?? created })
  } catch (err) {
    console.error("[jobs] normalize failed:", (err as Error).message)
    return NextResponse.json({ ok: true, job: created, warning: "normalize_failed" })
  }
}
