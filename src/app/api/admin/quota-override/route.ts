/**
 * POST /api/admin/quota-override
 *
 * Admin-only. Set ou clear le `quota_override_json` d'une organisation.
 * Permet d'accorder un quota custom à un client en dehors de Stripe
 * (extras facturés manuellement en V1).
 *
 * Body : { organization_id, storage_gb?, llm_monthly?, clear? }
 *   - clear: true → reset à NULL (revient aux quotas du plan)
 *   - sinon → set le json avec les valeurs fournies
 *
 * Audit log : action "set_quota_override" / "clear_quota_override".
 */

import { NextRequest, NextResponse } from "next/server"
import { logAdminAction, requireAdmin } from "@/lib/admin"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response

  const body = await req.json().catch(() => null) as {
    organization_id?: unknown
    storage_gb?: unknown
    llm_monthly?: unknown
    clear?: unknown
  } | null
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  const orgId = typeof body.organization_id === "string" ? body.organization_id : null
  if (!orgId) return NextResponse.json({ error: "organization_id_required" }, { status: 400 })

  const admin = getAdminSupabase()

  if (body.clear === true) {
    const { error } = await admin
      .from("organizations")
      .update({ quota_override_json: null })
      .eq("id", orgId)
    if (error) {
      console.error("[admin/quota-override] clear error:", error.message)
      return NextResponse.json({ error: "db_error" }, { status: 500 })
    }
    await logAdminAction({
      adminUserId: gate.userId,
      action: "clear_quota_override",
      targetType: "organization",
      targetId: orgId,
    })
    return NextResponse.json({ ok: true, override: null })
  }

  // Validation simple — borne haute pour éviter les valeurs débiles.
  const storageGb = typeof body.storage_gb === "number" && body.storage_gb > 0 && body.storage_gb <= 10000
    ? Math.round(body.storage_gb) : undefined
  const llmMonthly = typeof body.llm_monthly === "number" && body.llm_monthly > 0 && body.llm_monthly <= 10_000_000
    ? Math.round(body.llm_monthly) : undefined

  if (storageGb === undefined && llmMonthly === undefined) {
    return NextResponse.json({ error: "no_valid_values" }, { status: 400 })
  }

  const override: Record<string, number> = {}
  if (storageGb !== undefined) override.storage_gb = storageGb
  if (llmMonthly !== undefined) override.llm_monthly = llmMonthly

  const { error } = await admin
    .from("organizations")
    .update({ quota_override_json: override })
    .eq("id", orgId)
  if (error) {
    console.error("[admin/quota-override] set error:", error.message)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }

  await logAdminAction({
    adminUserId: gate.userId,
    action: "set_quota_override",
    targetType: "organization",
    targetId: orgId,
    metadata: override,
  })

  return NextResponse.json({ ok: true, override })
}
