import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"

export const runtime = "nodejs"

/**
 * PATCH /api/profile
 *
 * Met à jour les champs personnels du profil de l'utilisateur connecté.
 * Champs autorisés : first_name, preferred_language. Pas de spread du
 * body pour rester strict sur la field-allowlist.
 */
export async function PATCH(req: NextRequest) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }

  const body = await req.json().catch(() => null) as { first_name?: unknown; preferred_language?: unknown } | null
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const update: { first_name?: string | null; preferred_language?: "fr" | "en" } = {}

  if ("first_name" in body) {
    if (typeof body.first_name !== "string") {
      return NextResponse.json({ error: "invalid_first_name" }, { status: 400 })
    }
    const trimmed = body.first_name.trim().slice(0, 60)
    update.first_name = trimmed === "" ? null : trimmed
  }

  if ("preferred_language" in body) {
    if (body.preferred_language !== "fr" && body.preferred_language !== "en") {
      return NextResponse.json({ error: "invalid_preferred_language" }, { status: 400 })
    }
    update.preferred_language = body.preferred_language
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, noop: true })
  }

  const { error } = await sb
    .from("profiles")
    .update(update)
    .eq("user_id", user.id)

  if (error) {
    return NextResponse.json(
      { error: "update_failed", detail: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
