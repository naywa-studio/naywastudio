/**
 * POST /api/pricing-ia/chat
 *
 * Boucle agent pour le pricing IA. Le LLM peut appeler nos tools (JSON
 * function calling) plusieurs fois consécutives avant de répondre en texte
 * au sourceur. La boucle s'arrête sur (a) une réponse texte sans tool call,
 * (b) un tool `ask_user` qui demande à l'humain, ou (c) MAX_ITERATIONS.
 *
 * V0 : non-streaming (POST → réponse JSON complète). Le streaming SSE
 * viendra en V2 quand l'UX sera validée.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getAdminSupabase } from '@/lib/admin-supabase'
import { consumeQuota } from '@/lib/quota'
import { openrouterChat, type ORMessage, type ORToolCall } from '@/lib/openrouter'
import {
  PRICING_TOOLS,
  PRICING_AGENT_SYSTEM,
  executeToolCall,
  type ToolExecutionContext,
} from '@/lib/pricing/agent-tools'
import type { Candidate, Job, Profile, PricingDefaultAvantages } from '@/lib/database.types'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_ITERATIONS = 8        // safety cap on consecutive tool calls
const MAX_TURNS = 16            // truncate conversation history

interface RequestBody {
  messages?: { role: 'user' | 'assistant' | 'tool'; content: string; tool_call_id?: string; tool_calls?: ORToolCall[] }[]
  missionId?: string
  candidateId?: string
}

type AgentEvent =
  | { type: 'assistant_text'; content: string }
  | { type: 'tool_call'; tool: string; args: unknown; result_summary: string }
  | { type: 'ask_user'; question: string; options?: string[]; reason?: string }
  | { type: 'propose_deductions'; summary?: string; fields: Array<{
      field: string; label?: string; value: unknown; reasoning: string;
      confidence?: 'haute' | 'moyenne' | 'faible'; source?: string
    }> }
  | { type: 'error'; message: string }

export async function POST(req: NextRequest) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const body = await req.json().catch(() => null) as RequestBody | null
  if (!body || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 })
  }

  // Quota — réutilise le même bucket que les autres LLM calls
  const quota = await consumeQuota(getAdminSupabase(), user.id, 'pricing_agent')
  if (!quota.ok) {
    return NextResponse.json({ error: 'quota_exceeded', message: quota.message }, { status: 429 })
  }

  // ──────────────────────────────────────────────────────────────────────
  // Build the system context from mission + candidate + cabinet profile
  // ──────────────────────────────────────────────────────────────────────
  let mission: Job | null = null
  let candidate: Candidate | null = null

  if (body.missionId) {
    const { data } = await sb.from('jobs').select('*').eq('id', body.missionId).maybeSingle()
    mission = data as Job | null
  }
  if (body.candidateId) {
    const { data } = await sb.from('candidates').select('*').eq('id', body.candidateId).maybeSingle()
    candidate = data as Candidate | null
  }

  const { data: profileRow } = await sb
    .from('profiles')
    .select('pricing_billable_days_per_month, pricing_margin_min_pct, pricing_margin_target_pct, pricing_default_lieu, pricing_default_modalite, pricing_default_avantages, first_name')
    .eq('user_id', user.id)
    .maybeSingle()
  const cabinet = profileRow as Partial<Profile> | null

  const contextBlocks: string[] = []
  if (mission) {
    contextBlocks.push(
      `MISSION :\n${JSON.stringify({
        title: mission.title,
        location: mission.location,
        seniority: mission.seniority,
        contract_type: mission.contract_type,
        required_skills: mission.required_skills,
        client_tjm_min: mission.client_tjm_min,
        client_tjm_max: mission.client_tjm_max,
        duration_months: mission.duration_months,
        target_gross_salary: mission.target_gross_salary,
        start_date: mission.start_date,
      })}`,
    )
  }
  if (candidate) {
    const parsed = candidate.parsed_cv
    contextBlocks.push(
      `CANDIDAT :\n${JSON.stringify({
        full_name: candidate.full_name,
        current_title: candidate.current_title,
        years_experience: candidate.years_experience,
        seniority_level: candidate.seniority_level,
        skills_top: (candidate.taxonomy?.core_skills ?? candidate.skills ?? []).slice(0, 10),
        location: candidate.location,
        education: parsed?.education ?? null,
      })}`,
    )
  }
  if (cabinet) {
    contextBlocks.push(
      `PARAMÈTRES CABINET (défauts à utiliser sauf indication contraire) :\n${JSON.stringify({
        jours_facturables_par_mois: cabinet.pricing_billable_days_per_month ?? 18,
        marge_mini_pct:             cabinet.pricing_margin_min_pct ?? 15,
        marge_cible_pct:            cabinet.pricing_margin_target_pct ?? 22,
        lieu_defaut:                cabinet.pricing_default_lieu ?? 'paris_petite_couronne',
        modalite_defaut:            cabinet.pricing_default_modalite ?? 'modalite_1',
        avantages_defauts:          cabinet.pricing_default_avantages ?? null,
        prenom_sourceur:            cabinet.first_name ?? null,
      })}`,
    )
  }

  // ──────────────────────────────────────────────────────────────────────
  // Convert client messages → OpenRouter format
  // ──────────────────────────────────────────────────────────────────────
  const messages: ORMessage[] = [
    { role: 'system', content: PRICING_AGENT_SYSTEM },
    ...(contextBlocks.length > 0
      ? [{ role: 'system' as const, content: contextBlocks.join('\n\n') }]
      : []),
  ]

  // Contexte serveur passé à chaque tool call — permet d'injecter
  // automatiquement les défauts du cabinet (avantages, jours facturables,
  // lieu, modalité) si le LLM oublie de les passer. Garde-fou silencieux.
  const cabinetAvantages = (cabinet?.pricing_default_avantages ?? null) as PricingDefaultAvantages | null
  const toolCtx: ToolExecutionContext = {
    cabinetAvantages: cabinetAvantages as ToolExecutionContext['cabinetAvantages'],
    cabinetJoursFacturables: cabinet?.pricing_billable_days_per_month ?? undefined,
    cabinetLieuDefault: (cabinet?.pricing_default_lieu ?? undefined) as ToolExecutionContext['cabinetLieuDefault'],
    cabinetModaliteDefault: (cabinet?.pricing_default_modalite ?? undefined) as ToolExecutionContext['cabinetModaliteDefault'],
  }

  for (const m of body.messages.slice(-MAX_TURNS)) {
    if (m.role === 'user') {
      messages.push({ role: 'user', content: String(m.content ?? '') })
    } else if (m.role === 'assistant') {
      messages.push({
        role: 'assistant',
        content: String(m.content ?? ''),
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      })
    } else if (m.role === 'tool' && m.tool_call_id) {
      messages.push({ role: 'tool', content: String(m.content ?? ''), tool_call_id: m.tool_call_id })
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Agent loop — call LLM, execute tools, feed back, until plain reply
  // ──────────────────────────────────────────────────────────────────────
  const events: AgentEvent[] = []
  let iterations = 0

  while (iterations < MAX_ITERATIONS) {
    iterations++
    let response
    try {
      response = await openrouterChat({
        model: 'openai/gpt-4o-mini',
        temperature: 0.2,
        maxTokens: 1500,
        messages,
        tools: PRICING_TOOLS,
        toolChoice: 'auto',
      })
    } catch (err) {
      events.push({ type: 'error', message: (err as Error).message })
      break
    }

    const toolCalls = response.toolCalls ?? []
    const textContent = response.content.trim()

    // Plain text reply (no tool calls) — agent has its final word.
    if (toolCalls.length === 0) {
      if (textContent) {
        events.push({ type: 'assistant_text', content: textContent })
        messages.push({ role: 'assistant', content: textContent })
      }
      break
    }

    // Persist the assistant turn with tool calls in our running history
    messages.push({
      role: 'assistant',
      content: textContent,
      tool_calls: toolCalls,
    })

    let askedUser = false
    for (const call of toolCalls) {
      const result = executeToolCall(call.function.name, call.function.arguments, toolCtx)

      // Summarise the tool result for the client UI (short string, not full JSON)
      let argsParsed: unknown = null
      try { argsParsed = JSON.parse(call.function.arguments) } catch { /* ignore */ }
      events.push({
        type: 'tool_call',
        tool: call.function.name,
        args: argsParsed,
        result_summary: truncate(result.content, 280),
      })

      // Feed tool result back to the LLM
      messages.push({
        role: 'tool',
        content: result.content,
        tool_call_id: call.id,
      })

      if (result.userQuestion) {
        events.push({
          type: 'ask_user',
          question: result.userQuestion.question,
          options: result.userQuestion.options,
          reason: result.userQuestion.reason,
        })
        askedUser = true
      }
      if (result.deductions) {
        events.push({
          type: 'propose_deductions',
          summary: result.deductions.summary,
          fields: result.deductions.fields,
        })
        askedUser = true     // même logique : on rend la main à l'humain
      }
    }

    // If any tool called ask_user / propose_deductions, we hand back to the sourceur.
    if (askedUser) break
  }

  if (iterations >= MAX_ITERATIONS) {
    events.push({
      type: 'error',
      message: `Boucle agent : ${MAX_ITERATIONS} itérations atteintes sans réponse texte. Réessaye en simplifiant ta demande.`,
    })
  }

  return NextResponse.json({
    events,
    iterations,
    // For the client to replay later — only the messages we want to keep in the conv.
    persisted_messages: messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : '',
        ...(m.role === 'assistant' && m.tool_calls ? { tool_calls: m.tool_calls } : {}),
        ...(m.role === 'tool' ? { tool_call_id: m.tool_call_id } : {}),
      })),
  })
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + '…'
}
