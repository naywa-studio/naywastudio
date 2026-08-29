/**
 * GET /api/mailing/attachment?message=<id>&index=<n>
 *
 * Renvoie une URL temporaire vers une pièce jointe reçue d'un candidat.
 *
 * ── Pourquoi cette route existe ──────────────────────────────────────────
 *
 * Les pièces jointes étaient recopiées sur R2 et affichées dans le fil sous
 * forme de pastille — nom et taille. Mais **rien ne permettait de les
 * ouvrir**. Un candidat envoie son CV à jour, le sourceur le voit annoncé et
 * ne peut pas le lire. C'est le même défaut que les autres : la donnée est
 * là, elle n'est simplement pas atteignable.
 *
 * ── L'index plutôt que le chemin ─────────────────────────────────────────
 *
 * L'appelant demande la pièce n° N d'un message, jamais un chemin R2. Un
 * chemin accepté depuis le client serait une invitation à en forger un autre
 * — et R2 n'a pas de RLS. Le chemin est relu en base, où il est déjà
 * org-scopé, puis contrôlé une seconde fois par `assertOrgScopedPath`.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { r2SignedUrl } from "@/lib/r2-storage"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const messageId = req.nextUrl.searchParams.get("message")
  const index = Number(req.nextUrl.searchParams.get("index"))
  if (!messageId || !Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 })
  }

  const admin = getAdminSupabase()

  const { data: profile } = await admin
    .from("profiles").select("organization_id").eq("user_id", user.id).single()
  if (!profile?.organization_id) return NextResponse.json({ error: "no_org" }, { status: 403 })

  /* Le message est relu en filtrant SUR L'ORGANISATION du demandeur : un
   * identifiant de message appartenant à un autre cabinet ne renvoie rien,
   * plutôt que de renvoyer un refus qui confirmerait son existence. */
  const { data: message } = await admin
    .from("email_messages")
    .select("attachments")
    .eq("id", messageId)
    .eq("organization_id", profile.organization_id)
    .maybeSingle()

  const file = message?.attachments?.[index]
  if (!file) return NextResponse.json({ error: "not_found" }, { status: 404 })

  try {
    // `assertOrgScopedPath` est le filet final : R2 n'a pas de RLS, et c'est
    // la seule chose qui garantit qu'un chemin ne sort pas de l'organisation.
    const url = await r2SignedUrl({
      bucket: "cv",
      path: file.path,
      callerOrgId: profile.organization_id,
      ttlSeconds: 300,
      // Force le téléchargement sous le nom d'origine plutôt qu'un
      // affichage sous une clé R2 illisible.
      filename: file.filename,
    })
    return NextResponse.json({ ok: true, url, filename: file.filename })
  } catch (err) {
    console.error("[mailing/attachment] URL impossible:", (err as Error).message)
    return NextResponse.json({ error: "url_failed", detail: "internal_error" }, { status: 500 })
  }
}
