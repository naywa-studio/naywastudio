/**
 * POST /api/cabinet/branding/request
 *
 * Owner soumet une demande de modification d'un ou plusieurs champs
 * branding fort (name, brand_logo_path, contact_email) après la
 * période de grâce post-onboarding. Avant le verrouillage, la
 * modification se fait directement via PATCH /api/cabinet.
 *
 * Body :
 *   { changes: [
 *       { field: 'name', requested_value: '…' },
 *       { field: 'brand_logo_path', requested_value: '{org_id}/pending/…' },
 *       { field: 'contact_email', requested_value: '…' },
 *     ],
 *     reason?: string }
 *
 *   Tous les champs sont optionnels (au moins 1 requis). Une seule
 *   `reason` couvre toute la batch. On crée 1 row par champ partageant
 *   le même `request_batch_id` — chaque row reste décidable
 *   indépendamment côté /admin/demandes (j'accepte le nom, je refuse
 *   le logo).
 *
 * Important : pour un changement de logo, le client upload d'abord
 * le nouveau fichier dans Storage (path `{org_id}/pending/{ts}.ext`,
 * respect RLS migration 025) puis envoie le path en requested_value.
 * À l'approbation côté admin, on adopte ce path tel quel. À un refus,
 * on supprime le fichier pending.
 *
 * Limite : une seule demande pending par (org, field) à la fois. Une
 * nouvelle demande sur un champ déjà pending annule la précédente
 * (status='cancelled' sur la row précédente).
 *
 * Body legacy supporté : si on reçoit `{ field, requested_value, reason }`
 * (mono-champ), on le convertit silencieusement en `{ changes: [...] }`
 * pour ne pas casser un client qui ne se serait pas encore rafraîchi.
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

interface InboundChange {
  field?: unknown
  requested_value?: unknown
}

interface NormalizedChange {
  field: BrandingChangeField
  requestedValue: string
}

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
    changes?: unknown
    field?: unknown
    requested_value?: unknown
    reason?: unknown
  } | null
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  // Normalise body legacy mono-champ → array uniformisé.
  const rawChanges: InboundChange[] = Array.isArray(body.changes)
    ? (body.changes as InboundChange[])
    : (typeof body.field === "string"
      ? [{ field: body.field, requested_value: body.requested_value }]
      : [])

  // Sanitization / validation par change.
  const normalized: NormalizedChange[] = []
  const seenFields = new Set<BrandingChangeField>()
  for (const change of rawChanges) {
    const field = change.field as BrandingChangeField
    if (!VALID_FIELDS.includes(field)) {
      return NextResponse.json({ error: "invalid_field", detail: String(change.field) }, { status: 400 })
    }
    if (seenFields.has(field)) {
      return NextResponse.json({ error: "duplicate_field", detail: field }, { status: 400 })
    }
    seenFields.add(field)
    const requestedValue = typeof change.requested_value === "string"
      ? change.requested_value.trim().slice(0, 500)
      : ""
    if (!requestedValue) {
      return NextResponse.json({ error: "requested_value_required", detail: field }, { status: 400 })
    }
    if (field === "contact_email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedValue)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 })
    }
    // Le nouveau logo doit avoir été uploadé par le caller lui-même dans son
    // propre préfixe Storage (`{org_id}/pending/...`, cf. RLS migration 025).
    // Sans ce check, un owner pourrait soumettre requested_value = le chemin
    // du logo d'une AUTRE org, et le faire adopter (approve) ou supprimer
    // (reject) via le client service-role de la route admin de décision.
    if (field === "brand_logo_path" && !requestedValue.startsWith(`${profile.organization_id}/pending/`)) {
      return NextResponse.json({ error: "invalid_logo_path" }, { status: 400 })
    }
    normalized.push({ field, requestedValue })
  }
  if (normalized.length === 0) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 })
  }

  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null

  const admin = getAdminSupabase()
  // Snapshot des valeurs courantes pour `current_value` (visible
  // côté admin pour comparer avant/après).
  const { data: org } = await admin
    .from("organizations")
    .select("name, brand_name, brand_logo_path, contact_email")
    .eq("id", profile.organization_id)
    .single()
  const currentValueOf = (field: BrandingChangeField): string | null => {
    if (field === "name") return org?.brand_name ?? org?.name ?? null
    if (field === "brand_logo_path") return org?.brand_logo_path ?? null
    if (field === "contact_email") return org?.contact_email ?? null
    return null
  }

  // Annule toute demande pending précédente sur chaque champ de la
  // batch — évite la confusion "j'ai 3 demandes en attente sur le
  // même nom".
  const fields = normalized.map((c) => c.field)
  await admin.from("branding_change_requests")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("organization_id", profile.organization_id)
    .in("field", fields)
    .eq("status", "pending")

  // Insert N rows partageant le même request_batch_id.
  const batchId = crypto.randomUUID()
  const rows = normalized.map((change) => ({
    organization_id: profile.organization_id,
    requested_by: user.id,
    field: change.field,
    current_value: currentValueOf(change.field),
    requested_value: change.requestedValue,
    reason,
    status: "pending" as const,
    request_batch_id: batchId,
  }))
  const { data: inserted, error } = await admin.from("branding_change_requests")
    .insert(rows)
    .select("id")
  if (error || !inserted) {
    console.error("[branding/request] insert error:", error?.message)
    return NextResponse.json({ error: "insert_failed", detail: "internal_error" }, { status: 500 })
  }

  // Mail à l'équipe admin pour qu'elle traite la batch sans avoir à
  // rafraîchir /admin/demandes en permanence. Best-effort.
  try {
    const orgName = org?.brand_name ?? org?.name ?? "(sans nom)"
    const requesterEmail = user.email ?? "(email inconnu)"
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://naywastudio.com"
    const fieldsSummary = normalized.map((c) => FIELD_LABEL[c.field]).join(", ")
    const lines = [
      `Nouvelle demande de modification branding`,
      ``,
      `Organisation : ${orgName}`,
      `Demandeur : ${requesterEmail}`,
      `Champs concernés : ${fieldsSummary}`,
      ``,
      `--- Détail ---`,
      ...normalized.flatMap((c) => [
        ``,
        `${FIELD_LABEL[c.field]} :`,
        `  Valeur actuelle : ${currentValueOf(c.field) ?? "(vide)"}`,
        `  Valeur demandée : ${c.requestedValue}`,
      ]),
      ``,
      reason ? `Raison : ${reason}` : "",
      ``,
      `Traiter la demande : ${baseUrl}/admin/demandes`,
    ].filter(Boolean)
    await sendEmail({
      from: SENDER_HEADER,
      to: SUPPORT_INBOX,
      replyTo: requesterEmail,
      subject: `[Branding] Nouvelle demande — ${orgName} (${fieldsSummary})`,
      text: lines.join("\n"),
    })
  } catch (mailErr) {
    console.error("[branding/request] mail send failed", mailErr)
  }

  return NextResponse.json({ batch_id: batchId, count: inserted.length, ok: true })
}
