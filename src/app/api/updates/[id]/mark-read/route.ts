/**
 * POST /api/updates/:id/mark-read
 *
 * Stamp idempotent : marque cette update comme lue par le user
 * courant. Pas de payload — l'id est dans l'URL, le user dans la
 * session.
 *
 * Idempotent : si le couple (user_id, update_id) existe déjà, on
 * ignore. La table a une clé composite, donc on s'appuie sur
 * onConflict pour ne rien faire.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: updateId } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(updateId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 })
  }

  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  // Vérifie que l'update existe et est publiée (sinon on ne stamp pas
  // — éviter qu'un user "lise" un brouillon avant publication).
  const { data: row, error: readErr } = await sb
    .from("app_updates")
    .select("id, published_at")
    .eq("id", updateId)
    .maybeSingle()
  if (readErr || !row) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (!row.published_at || new Date(row.published_at).getTime() > Date.now()) {
    return NextResponse.json({ error: "not_published" }, { status: 400 })
  }

  // Upsert via admin client : la table a une PK composite (user_id,
  // update_id) donc le re-stamp est idempotent — on ignore l'erreur
  // de conflit le cas échéant.
  const admin = getAdminSupabase()
  const { error: upsertErr } = await admin
    .from("app_updates_reads")
    .upsert(
      { user_id: user.id, update_id: updateId },
      { onConflict: "user_id,update_id", ignoreDuplicates: true },
    )
  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
