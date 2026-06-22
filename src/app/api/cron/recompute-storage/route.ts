/**
 * GET /api/cron/recompute-storage
 *
 * Cron nightly (Vercel, 02:00 UTC). Pour chaque org active, on liste
 * tous les objets du bucket R2 naywa-cv sous le préfixe `{org_id}/`
 * et on somme leurs tailles. Le résultat va dans
 * `organizations.storage_used_bytes`.
 *
 * Pourquoi : les compteurs incrémentaux (incrementStorageUsed,
 * decrementStorageUsed) peuvent dériver — fichier uploadé mais l'API
 * crashe après, suppression manuelle dans R2, etc. Cette passe
 * nightly remet la vraie valeur.
 *
 * Performance : R2 ListObjectsV2 = 1000 objets / appel, paginé. Une
 * org de 5 GB = max ~10 000 fichiers CV = 10 round-trips. Le cron tourne
 * en série pour ne pas saturer (40-50 orgs en 30s c'est large).
 *
 * Auth : Bearer CRON_SECRET comme les autres crons.
 */

import { NextResponse, type NextRequest } from "next/server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { r2SumSizeByPrefix } from "@/lib/r2-storage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = (process.env.CRON_SECRET ?? "").trim()
  const provided = req.headers.get("authorization") ?? ""
  if (!secret || provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const admin = getAdminSupabase()

  // On ne recalcule QUE les orgs sans pending_deletion (les autres
  // vont disparaître au prochain wipe-expired-orgs cron).
  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id")
    .is("pending_deletion_at", null)

  if (error) {
    console.error("[cron/recompute-storage] list orgs error:", error.message)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }

  let processed = 0
  let updated = 0
  const errors: { orgId: string; msg: string }[] = []

  for (const org of orgs ?? []) {
    processed++
    try {
      const bytes = await r2SumSizeByPrefix("cv", `${org.id}/`)
      await admin
        .from("organizations")
        .update({ storage_used_bytes: bytes })
        .eq("id", org.id)
      updated++
    } catch (err) {
      errors.push({ orgId: org.id, msg: err instanceof Error ? err.message : "unknown" })
    }
  }

  return NextResponse.json({
    processed,
    updated,
    errors_count: errors.length,
    errors: errors.slice(0, 10),
  })
}
