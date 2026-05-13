/**
 * DELETE /api/cv/:id  — remove a candidate (DB row + Storage object).
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  // Verify ownership via user-scoped client (RLS enforced)
  const { data: candidate, error: fetchErr } = await sb
    .from("candidates")
    .select("id, user_id, cv_file_path")
    .eq("id", id)
    .single()

  if (fetchErr || !candidate) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (candidate.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const admin = getAdminSupabase()

  if (candidate.cv_file_path) {
    await admin.storage.from("cv-uploads").remove([candidate.cv_file_path])
    // Also clean the candidate folder in case other artifacts (anonymized PDF, etc.)
    // get added in later sprints.
    const folder = `${candidate.user_id}/${candidate.id}`
    const { data: extras } = await admin.storage.from("cv-uploads").list(folder)
    if (extras && extras.length > 0) {
      await admin.storage.from("cv-uploads").remove(extras.map((f) => `${folder}/${f.name}`))
    }
  }

  const { error: delErr } = await admin.from("candidates").delete().eq("id", candidate.id)
  if (delErr) return NextResponse.json({ error: "db_delete_failed", detail: delErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
