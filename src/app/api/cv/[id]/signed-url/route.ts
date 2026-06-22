/**
 * GET /api/cv/:id/signed-url  — short-lived signed URL for inline PDF preview.
 *
 * Sécurité : on vérifie que le caller appartient bien à l'org qui détient
 * le candidat AVANT de signer (R2 n'a pas de RLS, c'est nous qui scopons).
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { r2SignedUrl } from "@/lib/r2-storage"

export const runtime = "nodejs"

const TTL_SECONDS = 5 * 60

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const admin = getAdminSupabase()

  // Récupère l'org du caller pour vérifier le scoping path R2.
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!profile?.organization_id) {
    return NextResponse.json({ error: "no_organization" }, { status: 400 })
  }

  // Le candidat passe par la RLS du sb client → on garantit que
  // le caller a accès (org-scoped).
  const { data: candidate, error } = await sb
    .from("candidates")
    .select("cv_file_path, cv_file_name")
    .eq("id", id)
    .maybeSingle()

  if (error || !candidate) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (!candidate.cv_file_path) return NextResponse.json({ error: "no_file" }, { status: 404 })

  try {
    const url = await r2SignedUrl({
      bucket: "cv",
      path: candidate.cv_file_path,
      callerOrgId: profile.organization_id,
      ttlSeconds: TTL_SECONDS,
    })
    return NextResponse.json({
      url,
      expires_in: TTL_SECONDS,
      file_name: candidate.cv_file_name,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "sign_failed"
    console.error("[cv/signed-url] R2 error:", msg)
    return NextResponse.json({ error: "sign_failed" }, { status: 500 })
  }
}
