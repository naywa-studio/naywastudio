/**
 * POST /api/organization/anonymize-defaults   { template, watermark, watermarkText }
 *
 * Enregistre le GABARIT d'anonymisation par défaut de l'organisation
 * (organizations.anonymize_defaults = { template, watermark, watermarkText }).
 *
 * Décision produit (refonte anonymisation) : l'anonymisation est une
 * fonctionnalité WORKSPACE ouverte à TOUT sourceur disposant d'un siège actif —
 * plus réservée à l'owner via Branding. Le gabarit n'est que de la présentation
 * dérivée d'une identité déjà verrouillée (nom/logo/email) → aucun vecteur de
 * fraude à laisser un siège le régler.
 *
 * Accès : requireActiveAccess (abonnement/essai + siège). Écriture via client
 * ADMIN car la policy RLS `organizations_owner_write` réserve l'UPDATE à l'owner
 * — l'autorisation métier est déjà faite par le gate. Champ unique, validé.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { requireActiveAccess } from "@/lib/access-guard"
import { readOrgDefaults } from "@/components/workspace/anonymize/types"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const { data: profile } = await sb
    .from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle()
  const orgId = profile?.organization_id
  if (!orgId) return NextResponse.json({ error: "no_organization" }, { status: 400 })

  const body = await req.json().catch(() => null) as unknown
  // Validation stricte via le lecteur partagé (tolère champs manquants,
  // coerce le template, borne le texte). Aucun spread du body.
  const defaults = readOrgDefaults(body)

  const admin = getAdminSupabase()
  const { error } = await admin
    .from("organizations")
    .update({ anonymize_defaults: defaults })
    .eq("id", orgId)
  if (error) {
    console.error("[anonymize-defaults] update failed", error)
    return NextResponse.json({ error: "save_failed", detail: "internal_error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, anonymize_defaults: defaults })
}
