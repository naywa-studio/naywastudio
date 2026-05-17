/**
 * GET /api/dashboard/today
 *
 * Agrège tout ce que le sourceur doit faire aujourd'hui :
 *   - entretiens du jour (interviews scheduled today)
 *   - nouvelles réponses inbound récentes pas encore traitées
 *   - relances à faire (contacted depuis >5j sans inbound depuis)
 *   - stats de la semaine (envoyés / réponses / entretiens)
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"

export const runtime = "nodejs"

interface TodayInterview {
  id: string
  start_time: string
  end_time: string
  candidate_id: string | null
  candidate_name: string | null
  candidate_title: string | null
  job_title: string | null
  join_url: string | null
  location_text: string | null
}

interface RecentReply {
  id: string
  created_at: string
  candidate_id: string | null
  candidate_name: string | null
  subject: string | null
  ai_summary: string | null
  ai_sentiment: string | null
  ai_suggested_stage: string | null
}

interface PendingFollowup {
  candidate_id: string
  candidate_name: string | null
  job_title: string | null
  contacted_at: string
  days_since: number
}

interface WeekStats {
  sent: number
  replies: number
  response_rate: number
  interviews: number
}

export async function GET() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const now = new Date()
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)

  // 1. Today's interviews — join candidate + job
  const { data: interviewsRaw } = await sb
    .from("interviews")
    .select(`
      id, start_time, end_time, join_url, location_text, candidate_id,
      candidate:candidates(full_name, current_title),
      job:jobs(title)
    `)
    .eq("status", "scheduled")
    .gte("start_time", startOfDay.toISOString())
    .lte("start_time", endOfDay.toISOString())
    .order("start_time", { ascending: true })

  type InterviewJoin = {
    id: string; start_time: string; end_time: string
    join_url: string | null; location_text: string | null
    candidate_id: string | null
    candidate: { full_name: string | null; current_title: string | null } | null
    job: { title: string | null } | null
  }
  const interviews: TodayInterview[] = (interviewsRaw as unknown as InterviewJoin[] ?? []).map((iv) => ({
    id: iv.id,
    start_time: iv.start_time,
    end_time: iv.end_time,
    candidate_id: iv.candidate_id,
    candidate_name: iv.candidate?.full_name ?? null,
    candidate_title: iv.candidate?.current_title ?? null,
    job_title: iv.job?.title ?? null,
    join_url: iv.join_url,
    location_text: iv.location_text,
  }))

  // 2. Recent inbound replies (last 14 days) — most useful: those still in
  // "contacted" stage (sourcer hasn't acted yet). We surface the 5 most recent.
  const { data: repliesRaw } = await sb
    .from("email_messages")
    .select(`
      id, created_at, candidate_id, subject, ai_summary, ai_sentiment, ai_suggested_stage,
      candidate:candidates(full_name)
    `)
    .eq("direction", "inbound")
    .gte("created_at", new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(8)

  type ReplyJoin = {
    id: string; created_at: string; candidate_id: string | null
    subject: string | null; ai_summary: string | null
    ai_sentiment: string | null; ai_suggested_stage: string | null
    candidate: { full_name: string | null } | null
  }
  const replies: RecentReply[] = (repliesRaw as unknown as ReplyJoin[] ?? []).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    candidate_id: r.candidate_id,
    candidate_name: r.candidate?.full_name ?? null,
    subject: r.subject,
    ai_summary: r.ai_summary,
    ai_sentiment: r.ai_sentiment,
    ai_suggested_stage: r.ai_suggested_stage,
  }))

  // 3. Follow-ups: matches at "contacted" with contacted_at > 5 days ago AND
  // no inbound since. We pull the matches first, then check for inbound.
  const { data: contactedRaw } = await sb
    .from("match_assessments")
    .select(`
      candidate_id, contacted_at,
      candidate:candidates(full_name),
      job:jobs(title)
    `)
    .eq("pipeline_stage", "contacted")
    .lt("contacted_at", fiveDaysAgo.toISOString())
    .order("contacted_at", { ascending: true })
    .limit(20)

  type ContactedJoin = {
    candidate_id: string; contacted_at: string
    candidate: { full_name: string | null } | null
    job: { title: string | null } | null
  }
  const contactedMatches = (contactedRaw as unknown as ContactedJoin[] ?? [])

  // Pull all inbound emails for these candidates so we can exclude ones who replied.
  const candIds = [...new Set(contactedMatches.map((m) => m.candidate_id).filter(Boolean))]
  const repliedCandIds = new Set<string>()
  if (candIds.length > 0) {
    const { data: inboundForCands } = await sb
      .from("email_messages")
      .select("candidate_id")
      .eq("direction", "inbound")
      .in("candidate_id", candIds)
    for (const r of (inboundForCands ?? [])) {
      if (r.candidate_id) repliedCandIds.add(r.candidate_id)
    }
  }

  const followups: PendingFollowup[] = contactedMatches
    .filter((m) => !repliedCandIds.has(m.candidate_id))
    .map((m) => ({
      candidate_id: m.candidate_id,
      candidate_name: m.candidate?.full_name ?? null,
      job_title: m.job?.title ?? null,
      contacted_at: m.contacted_at,
      days_since: Math.floor((now.getTime() - new Date(m.contacted_at).getTime()) / (24 * 60 * 60 * 1000)),
    }))
    .slice(0, 8)

  // 4. Week stats — fast count queries.
  const [sentRes, repliesRes, interviewsRes] = await Promise.all([
    sb.from("email_messages").select("id", { count: "exact", head: true })
      .eq("direction", "outbound").gte("created_at", weekAgo.toISOString()),
    sb.from("email_messages").select("id", { count: "exact", head: true })
      .eq("direction", "inbound").gte("created_at", weekAgo.toISOString()),
    sb.from("interviews").select("id", { count: "exact", head: true })
      .eq("status", "scheduled").gte("start_time", weekAgo.toISOString()),
  ])

  const sent = sentRes.count ?? 0
  const repliesCount = repliesRes.count ?? 0
  const interviewsCount = interviewsRes.count ?? 0
  const stats: WeekStats = {
    sent,
    replies: repliesCount,
    response_rate: sent > 0 ? Math.round((repliesCount / sent) * 100) : 0,
    interviews: interviewsCount,
  }

  return NextResponse.json({
    ok: true,
    interviews,
    replies,
    followups,
    stats,
  })
}
