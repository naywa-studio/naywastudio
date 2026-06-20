/**
 * POST /api/cabinet/branding/request
 *
 * Owner crée une demande de modification d'un champ branding fort
 * (name, brand_logo_path, contact_email) après la période de grâce
 * post-onboarding. Avant le verrouillage, la modification se fait
 * directement via PATCH /api/cabinet sans passer par ici.
 *
 * Body :
 *   { field: 'name' | 'brand_logo_path' | 'contact_email',
 *     requested_value: string,
 *     reason?: string }
 *
 * Important : pour un changement de logo, le client upload d'abord
 * le nouveau fichier dans Storage (path `pending/{org_id}/{ts}.ext`)
 * puis envoie le path en requested_value. À l'approbation côté admin,
 * on déplacera le fichier vers `{org_id}/...`. À un refus, on
 * supprimera le fichier pending.
 *
 * Limite : une seule demande "pending" par (org, field) à la fois,
 * pour éviter la file d'attente confuse. Une nouvelle demande sur
 * le même champ écrase la précédente (annulée).
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { sendEmail, MAIL_DOMAIN } from "@/lib/resend"
import type { BrandingChangeField } from "@/lib/database.types"

export const runtime = "nodejs"

const VALID_FIELDS: BrandingChangeField[] = ["name", "brand_logo_path", "contact_email"]

const FIELD_LABEL: Record<BrandingChangeField, string> = {
  name: "Nom de l'organisation",
  brand_logo_path: "Logo",
  contact_email: "Email de contact",
}

const SUPPORT_INBOX = "support.it@naywastudio.com"
const SENDER_HEADER = `Naywa Studio <support@${MAIL_DOMAIN}>`

export async function POST(req: NextRequest) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: profile } = await sb
    .from("profiles")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!profile || profile.role !== "owner") {
    return NextResponse.json({ error: "owner_only" }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    field?: unknown
    requested_value?: unknown
    reason?: unknown
  } | null
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  const field = body.field as BrandingChangeField
  if (!VALID_FIELDS.includes(field)) {
    return NextResponse.json({ error: "invalid_field" }, { status: 400 })
  }
  const requestedValue = typeof body.requested_value === "string"
    ? body.requested_value.trim().slice(0, 500)
    : ""
  if (!requestedValue) {
    return NextResponse.json({ error: "requested_value_required" }, { status: 400 })
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null

  // Pour contact_email, valider le format.
  if (field === "contact_email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedValue)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 })
  }

  const admin = getAdminSupabase()
  // Snapshot de la valeur courante.
  const { data: org } = await admin
    .from("organizations")
    .select("name, brand_name, brand_logo_path, contact_email")
    .eq("id", profile.organization_id)
    .single()
  const currentValue =
    field === "name" ? (org?.brand_name ?? org?.name ?? null) :
    field === "brand_logo_path" ? (org?.brand_logo_path ?? null) :
    field === "contact_email" ? (org?.contact_email ?? null) :
    null

  // Annule toute demande pending précédente sur le même champ.
  await admin.from("branding_change_requests")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("organization_id", profile.organization_id)
    .eq("field", field)
    .eq("status", "pending")

  const { data: inserted, error } = await admin.from("branding_change_requests")
    .insert({
      organization_id: profile.organization_id,
      requested_by: user.id,
      field,
      current_value: currentValue,
      requested_value: requestedValue,
      reason,
      status: "pending",
    })
    .select("id")
    .single()

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? "insert_failed" }, { status: 500 })
  }

  // Mail à l'équipe admin pour qu'elle traite la demande sans devoir
  // refresh /admin/demandes en permanence. Best-effort : si Resend
  // échoue on log et on renvoie quand même 200 (la demande est créée).
  try {
    const { data: orgRow } = await admin
      .from("organizations").select("name, brand_name").eq("id", profile.organization_id).maybeSingle()
    const orgName = orgRow?.brand_name ?? orgRow?.name ?? "(sans nom)"
    const requesterEmail = user.email ?? "(email inconnu)"
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://naywastudio.com"
    await sendEmail({
      from: SENDER_HEADER,
      to: SUPPORT_INBOX,
      replyTo: requesterEmail,
      subject: `[Branding] Nouvelle demande — ${orgName} (${FIELD_LABEL[field]})`,
      text: [
        `Nouvelle demande de modification branding`,
        ``,
        `Organisation : ${orgName}`,
        `Demandeur : ${requesterEmail}`,
        `Champ : ${FIELD_LABEL[field]}`,
        `Valeur actuelle : ${currentValue ?? "(vide)"}`,
        `Valeur demandée : ${requestedValue}`,
        reason ? `\nRaison : ${reason}` : "",
        ``,
        `Traiter la demande : ${baseUrl}/admin/demandes`,
      ].filter(Boolean).join("\n"),
    })
  } catch (mailErr) {
    console.error("[branding/request] mail send failed", mailErr)
  }

  return NextResponse.json({ id: inserted.id, ok: true })
}
