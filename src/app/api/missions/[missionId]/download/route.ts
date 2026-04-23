/**
 * POST /api/missions/[missionId]/download
 * Fetches the Excel result from the agent, saves candidates to Supabase,
 * marks the mission as completed, and returns the Excel as base64.
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { getAgentBaseUrl, agentHeaders } from "@/lib/agent-proxy"
import type { Database } from "@/lib/database.types"

const log = { info: (msg: string) => console.log(`[download] ${msg}`) }

function normUrl(url: string): string {
  const base = url.split("?")[0].split("#")[0].replace(/\/$/, "").toLowerCase()
  return base.replace(/^https?:\/\/(www\.|[a-z]{2}\.)?/, "")
}

interface ScoreDimensions {
  competences:  number
  seniorite:    number
  localisation: number
  qualite:      number
}

interface AgentCandidate {
  linkedin_url: string
  name_estimated: string | null
  title_estimated: string | null
  company: string | null
  keywords: string[]
  relevance_score?: number | null
  score_justification?: string | null
  score_dimensions?: ScoreDimensions | null
  seniority_level?: string | null
  message?: string | null
  source?: 'linkedin' | 'malt' | 'apec' | null
}

interface AgentResult {
  result: string              // base64 Excel
  candidates?: AgentCandidate[]
  research_report?: string   // Nora only
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ missionId: string }> }
) {
  const { missionId } = await params

  const cookieStore = await cookies()
  const sb = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options)
        },
      },
    }
  )

  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const { data: mission } = await sb
    .from("missions")
    .select("brief, status, agent_level")
    .eq("id", missionId)
    .eq("user_id", user.id)
    .single()

  if (!mission) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const brief = mission.brief as ({ __agent_id?: string } | null)
  const agentMissionId = brief?.__agent_id
  if (!agentMissionId) return NextResponse.json({ error: "No agent mission id" }, { status: 400 })

  let agentBase: string
  try {
    agentBase = await getAgentBaseUrl(user.id, mission.agent_level)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 503 })
  }

  // ── Fetch result from agent ──────────────────────────────────────────────────
  const res = await fetch(`${agentBase}/missions/${agentMissionId}/result`, {
    headers: agentHeaders(),
  })

  if (!res.ok) {
    return NextResponse.json({ error: `Agent error: ${res.status}` }, { status: 502 })
  }

  const agentData = await res.json() as AgentResult

  // ── Save candidates to Supabase (service role — bypasses RLS insert rules) ──
  const sbAdmin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (agentData.candidates && agentData.candidates.length > 0) {
    // Get existing candidate URLs for this mission (for URL-based dedup)
    const { data: existingCands } = await sbAdmin
      .from("candidates")
      .select("linkedin_url")
      .eq("mission_id", missionId)

    const existingNormUrls = new Set(
      (existingCands ?? []).map((c) => normUrl(c.linkedin_url ?? ""))
    )

    const deduped = agentData.candidates.filter((c) => {
      const n = normUrl(c.linkedin_url)
      if (!n || existingNormUrls.has(n)) return false
      existingNormUrls.add(n)
      return true
    })

    // For Nora missions: top 7% by score (min 4) are shortlisted
    // For Léo missions: fixed score >= 60 threshold
    const isNora = mission.agent_level === 'nora'
    let shortlistUrls: Set<string> | null = null
    if (isNora) {
      const sorted = [...deduped]
        .filter((c) => c.relevance_score != null)
        .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
      const shortlistN = Math.max(4, Math.ceil(deduped.length * 0.07))
      shortlistUrls = new Set(sorted.slice(0, shortlistN).map((c) => normUrl(c.linkedin_url)))
    }

    const newRows = deduped.map((c) => ({
      mission_id: missionId,
      user_id: user.id,
      linkedin_url: c.linkedin_url,
      name_estimated: c.name_estimated ?? null,
      title_estimated: c.title_estimated ?? null,
      company: c.company ?? null,
      keywords: c.keywords ?? [],
      relevance_score: c.relevance_score ?? null,
      score_justification: c.score_justification ?? null,
      score_dimensions: c.score_dimensions ?? null,
      seniority_level: c.seniority_level ?? null,
      // Agent may pre-generate message for top profils (used in Excel)
      // but status stays 'raw' — the Nora carousel is the validation step
      message_draft: c.message ?? null,
      source: c.source ?? 'linkedin',
      status: "raw" as const,
    }))

    if (newRows.length > 0) {
      await sbAdmin.from("candidates").insert(newRows)
      log.info(`Inserted ${newRows.length} new candidates for mission ${missionId}`)
    }

    // profiles_count = total profiles found in THIS run (matches Excel row count)
    // newRows.length = deduplicated new entries saved to DB this run
    const runCount = agentData.candidates.length

    // Save research_report if provided (Nora agent only)
    const missionUpdate: {
      status: "completed"
      profiles_count: number
      research_report?: string | null
    } = {
      status: "completed",
      profiles_count: runCount,
    }
    if (agentData.research_report) {
      missionUpdate.research_report = agentData.research_report
    }
    await sbAdmin.from("missions").update(missionUpdate).eq("id", missionId)

    // ── Incrémenter quota Apify ──────────────────────────────────────────────
    if (runCount > 0) {
      const { data: prof } = await sbAdmin
        .from("profiles")
        .select("apify_credits_used, apify_reset_at")
        .eq("user_id", user.id)
        .single()

      const now      = new Date()
      const resetAt  = prof?.apify_reset_at ? new Date(prof.apify_reset_at) : new Date(0)
      const sameMonth = now.getFullYear() === resetAt.getFullYear() && now.getMonth() === resetAt.getMonth()
      const today    = now.toISOString().slice(0, 10)

      if (sameMonth) {
        await sbAdmin
          .from("profiles")
          .update({ apify_credits_used: (prof?.apify_credits_used ?? 0) + runCount })
          .eq("user_id", user.id)
      } else {
        // Nouveau mois → reset
        await sbAdmin
          .from("profiles")
          .update({ apify_credits_used: runCount, apify_reset_at: today })
          .eq("user_id", user.id)
      }
    }

    return NextResponse.json({
      ok: true,
      excel_b64: agentData.result,
      candidates_count: runCount,
      new_candidates: newRows.length,
      research_report: agentData.research_report ?? null,
    })
  }

  // ── No candidates — still mark completed ────────────────────────────────────
  await sbAdmin
    .from("missions")
    .update({ status: "completed", profiles_count: 0 })
    .eq("id", missionId)

  return NextResponse.json({
    ok: true,
    excel_b64: agentData.result,
    candidates_count: 0,
    new_candidates: 0,
  })
}
