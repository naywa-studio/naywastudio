/**
 * GET /api/admin/branding-logo-url?path={path}
 *
 * Renvoie une signed URL (1h) pour un fichier du bucket brand-logos,
 * destinée à la page /admin/demandes où l'admin compare visuellement
 * l'ancien logo et le nouveau (path = `{org_id}/...` ou
 * `{org_id}/pending/...`).
 *
 * Admin-only. Pas d'audit log ici parce que c'est purement de
 * l'affichage (la consultation de la fiche elle-même est déjà
 * journalisée par list_branding_requests).
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response

  const path = req.nextUrl.searchParams.get("path")
  if (!path) return NextResponse.json({ error: "path_required" }, { status: 400 })

  // Garde-fou : on n'accepte que des paths au format `{uuid}/...` ou
  // `{uuid}/pending/...`. Pas de "../" ni de path absolu.
  if (path.includes("..") || path.startsWith("/")) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 })
  }

  const admin = getAdminSupabase()
  const { data, error } = await admin.storage
    .from("brand-logos")
    .createSignedUrl(path, 60 * 60)

  if (error) return NextResponse.json({ url: null, error: error.message }, { status: 200 })
  return NextResponse.json({ url: data?.signedUrl ?? null })
}
