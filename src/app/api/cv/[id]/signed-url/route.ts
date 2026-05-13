/**
 * GET /api/cv/:id/signed-url  — short-lived signed URL for inline PDF preview.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

const TTL_SECONDS = 5 * 60

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: candidate, error } = await sb
    .from("candidates")
    .select("user_id, cv_file_path, cv_file_name")
    .eq("id", id)
    .single()

  if (error || !candidate) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (candidate.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  if (!candidate.cv_file_path) return NextResponse.json({ error: "no_file" }, { status: 404 })

  const admin = getAdminSupabase()
  const { data: signed, error: signErr } = await admin.storage
    .from("cv-uploads")
    .createSignedUrl(candidate.cv_file_path, TTL_SECONDS, {
      download: false,
    })

  if (signErr || !signed) {
    return NextResponse.json({ error: "sign_failed", detail: signErr?.message }, { status: 500 })
  }

  return NextResponse.json({
    url: signed.signedUrl,
    expires_in: TTL_SECONDS,
    file_name: candidate.cv_file_name,
  })
}
