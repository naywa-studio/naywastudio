/**
 * Resolves the base URL of the agent for a given user.
 * Priority:
 *  1. NAWA_AGENT_URL env var (Docker preview / local dev override)
 *  2. profile.vps_ip from Supabase (production)
 */

import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"

export const AGENT_SECRET = process.env.NAWA_AGENT_SECRET!

function supabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function getAgentBaseUrl(userId: string): Promise<string> {
  // ── Docker / local dev override ───────────────────────────────────────────
  if (process.env.NAWA_AGENT_URL) {
    return process.env.NAWA_AGENT_URL.replace(/\/$/, "")
  }

  // ── Production: read VPS IP from profile ──────────────────────────────────
  const sb = supabaseAdmin()
  const { data: profile } = await sb
    .from("profiles")
    .select("vps_ip, vps_status, agent_status")
    .eq("user_id", userId)
    .single()

  if (!profile?.vps_ip || profile.vps_status !== "ready" || profile.agent_status !== "running") {
    throw new Error("Agent not ready")
  }

  return `http://${profile.vps_ip}:8000`
}

export function agentHeaders() {
  return {
    "Content-Type": "application/json",
    "X-Nawa-Secret": AGENT_SECRET,
  }
}
