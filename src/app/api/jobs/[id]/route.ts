/**
 * GET    /api/jobs/:id  — job + its match assessments (joined candidates).
 * PATCH  /api/jobs/:id  — update job fields; re-normalize if matching inputs change.
 * DELETE /api/jobs/:id  — delete job (match_assessments cascade via FK).
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"
import { normalizeJob } from "@/lib/matching"
import type { Database } from "@/lib/database.types"

type JobUpdate = Database["public"]["Tables"]["jobs"]["Update"]

export const runtime = "nodejs"
export const maxDuration = 30

const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t.length ? t : null
}
const cleanArr = (v: unknown): string[] => {
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x).trim()).filter(Boolean).slice(0, 30)
}
const cleanNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: job, error } = await sb.from("jobs").select("*").eq("id", id).single()
  if (error || !job) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const { data: assessments } = await sb
    .from("match_assessments")
    .select("*, candidate:candidates(*)")
    .eq("job_id", id)
    .order("score", { ascending: false, nullsFirst: false })

  // Exclure les matchs dont le candidat a été marqué "ancien" par la dédup —
  // le vivier les masque aussi, donc les afficher ici crée un doublon visible
  // alors que le sourceur a déjà fait le tri.
  const filtered = (assessments ?? []).filter((m) => {
    const tags = (m.candidate as { tags?: string[] | null } | null)?.tags ?? []
    return !tags.includes("ancien")
  })

  return NextResponse.json({ job, assessments: filtered })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const { data: job, error: fetchErr } = await sb.from("jobs").select("*").eq("id", id).single()
  if (fetchErr || !job) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: "bad_body" }, { status: 400 })

  const update: JobUpdate = {}
  let matchingInputsChanged = false

  if ("title" in body)               { update.title = clean(body.title) ?? job.title; matchingInputsChanged = true }
  if ("role_name" in body)           { update.role_name = clean(body.role_name); matchingInputsChanged = true }
  if ("location" in body)            { update.location = clean(body.location) }
  if ("seniority" in body)           { update.seniority = clean(body.seniority); matchingInputsChanged = true }
  if ("contract_type" in body)       { update.contract_type = clean(body.contract_type) }
  if ("required_skills" in body)     { update.required_skills = cleanArr(body.required_skills); matchingInputsChanged = true }
  if ("nice_to_have_skills" in body) { update.nice_to_have_skills = cleanArr(body.nice_to_have_skills); matchingInputsChanged = true }
  if ("description" in body)         { update.description = clean(body.description); matchingInputsChanged = true }
  if ("briefing" in body)            { update.briefing = clean(body.briefing) }
  if ("client_brief" in body)        { update.client_brief = clean(body.client_brief) }
  if ("status" in body && ["draft", "open", "filled", "archived"].includes(String(body.status))) {
    update.status = body.status as JobUpdate["status"]
  }
  // Pricing fields — pure passthrough, no impact on matching normalization.
  if ("client_tjm_min" in body)      { update.client_tjm_min = cleanNumber(body.client_tjm_min) }
  if ("client_tjm_max" in body)      { update.client_tjm_max = cleanNumber(body.client_tjm_max) }
  if ("margin_min_pct" in body)      { update.margin_min_pct = cleanNumber(body.margin_min_pct) }
  if ("margin_target_pct" in body)   { update.margin_target_pct = cleanNumber(body.margin_target_pct) }
  if ("duration_months" in body)     { update.duration_months = cleanNumber(body.duration_months) }
  if ("target_gross_salary" in body) { update.target_gross_salary = cleanNumber(body.target_gross_salary) }
  if ("start_date" in body)          { update.start_date = clean(body.start_date) }
  // Pricing mission — lieu typé + flags d'activation des tarifs cabinet.
  if ("pricing_lieu" in body) {
    const lieu = clean(body.pricing_lieu)
    update.pricing_lieu = (lieu && ["paris_petite_couronne", "idf_grande_couronne", "lyon", "province"].includes(lieu))
      ? lieu as 'paris_petite_couronne' | 'idf_grande_couronne' | 'lyon' | 'province'
      : null
  }
  if ("has_grand_deplacement" in body) { update.has_grand_deplacement = Boolean(body.has_grand_deplacement) }
  if ("is_expatriated" in body)        { update.is_expatriated = Boolean(body.is_expatriated) }
  if ("essai_renouvele" in body)       { update.essai_renouvele = Boolean(body.essai_renouvele) }

  if (matchingInputsChanged) {
    try {
      update.normalized = await normalizeJob({
        title: update.title ?? job.title,
        location: update.location ?? job.location,
        seniority: update.seniority ?? job.seniority,
        contract_type: update.contract_type ?? job.contract_type,
        required_skills: update.required_skills ?? job.required_skills,
        nice_to_have_skills: update.nice_to_have_skills ?? job.nice_to_have_skills,
        description: update.description ?? job.description,
      })
    } catch (err) {
      console.error("[jobs] re-normalize failed:", (err as Error).message)
    }
  }

  const { data: updated, error: updateErr } = await sb
    .from("jobs")
    .update(update)
    .eq("id", id)
    .select("*")
    .single()

  if (updateErr) return NextResponse.json({ error: "db_update_failed", detail: updateErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, job: updated })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const { error } = await sb.from("jobs").delete().eq("id", id)
  if (error) return NextResponse.json({ error: "db_delete_failed", detail: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
