/**
 * POST /api/admin/branding-requests/:id
 *
 * Décision admin sur une demande de modification branding.
 *
 * Body :
 *   { action: 'approve' | 'reject',
 *     note?: string }   // raison du refus (envoyée par mail au client)
 *
 * Sur approve :
 *   - On applique le requested_value sur organizations.{field}.
 *   - On stamp status='approved', decided_by, decided_at.
 *   - Mail Resend au requester : "Votre demande a été acceptée".
 *
 * Sur reject :
 *   - On stamp status='rejected', decided_by, decided_at, decision_note.
 *   - Si field='brand_logo_path', on supprime le fichier pending dans
 *     Storage (le requester l'avait uploadé en pending).
 *   - Mail Resend au requester : "Votre demande a été refusée [note]".
 *
 * Idempotent : déjà décidé = 409.
 */

import { NextRequest, NextResponse } from "next/server"
import { logAdminAction, requireAdmin } from "@/lib/admin"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { sendEmail } from "@/lib/resend"
import type { Organization } from "@/lib/database.types"

export const runtime = "nodejs"

type OrgPatch = Partial<Pick<Organization, "name" | "brand_name" | "brand_logo_path" | "contact_email">>

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response
  const { id } = await ctx.params

  const body = await req.json().catch(() => null) as {
    action?: unknown
    note?: unknown
  } | null
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  const action = body.action === "approve" || body.action === "reject" ? body.action : null
  if (!action) return NextResponse.json({ error: "invalid_action" }, { status: 400 })
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : null

  const admin = getAdminSupabase()
  const { data: request } = await admin
    .from("branding_change_requests")
    .select("id, organization_id, requested_by, field, requested_value, current_value, status")
    .eq("id", id)
    .maybeSingle()
  if (!request) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (request.status !== "pending") {
    return NextResponse.json({ error: "already_decided" }, { status: 409 })
  }

  // Récupère l'email + le nom du requester pour le mail final.
  const { data: requesterAuth } = await admin.auth.admin.getUserById(request.requested_by ?? "")
  const requesterEmail = requesterAuth?.user?.email ?? null
  const { data: requesterProfile } = await admin
    .from("profiles").select("first_name").eq("user_id", request.requested_by ?? "").maybeSingle()
  const { data: org } = await admin
    .from("organizations").select("name, brand_name").eq("id", request.organization_id).maybeSingle()
  const orgName = org?.brand_name ?? org?.name ?? "votre organisation"

  if (action === "approve") {
    // On applique la valeur sur l'org.
    const patch: OrgPatch = {}
    if (request.field === "name") {
      patch.name = request.requested_value
      patch.brand_name = request.requested_value
    } else if (request.field === "brand_logo_path") {
      patch.brand_logo_path = request.requested_value
      // Si l'ancien logo existait, on le supprime du Storage.
      if (request.current_value) {
        await admin.storage.from("brand-logos").remove([request.current_value])
      }
    } else if (request.field === "contact_email") {
      patch.contact_email = request.requested_value
    }

    const { error: orgErr } = await admin.from("organizations")
      .update(patch).eq("id", request.organization_id)
    if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 })

    await admin.from("branding_change_requests").update({
      status: "approved",
      decided_by: gate.userId,
      decided_at: new Date().toISOString(),
    }).eq("id", id)

    if (requesterEmail) {
      try {
        await sendEmail({
          from: "Naywa Studio <contact@mail.naywastudio.com>",
          to: requesterEmail,
          replyTo: "support.it@naywastudio.com",
          subject: `Votre demande de modification a été acceptée — ${orgName}`,
          text: [
            `Bonjour ${requesterProfile?.first_name ?? ""},`.trim(),
            "",
            `Votre demande de modification du branding de ${orgName} a été acceptée.`,
            `Champ modifié : ${labelFor(request.field)}.`,
            "",
            "Vous pouvez consulter le résultat dans votre console.",
            "",
            "L'équipe Naywa Studio",
          ].join("\n"),
        })
      } catch (e) {
        console.error("[branding/approve] mail send failed", e)
      }
    }

    await logAdminAction({
      adminUserId: gate.userId,
      action: "approve_branding_request",
      targetType: "branding_request",
      targetId: id,
      metadata: { field: request.field, organization_id: request.organization_id },
    })
    return NextResponse.json({ ok: true })
  }

  // action === "reject"
  if (request.field === "brand_logo_path") {
    // On supprime le fichier pending uploadé par le requester.
    await admin.storage.from("brand-logos").remove([request.requested_value])
  }
  await admin.from("branding_change_requests").update({
    status: "rejected",
    decided_by: gate.userId,
    decided_at: new Date().toISOString(),
    decision_note: note,
  }).eq("id", id)

  if (requesterEmail) {
    try {
      await sendEmail({
        from: "Naywa Studio <contact@mail.naywastudio.com>",
        to: requesterEmail,
        replyTo: "support.it@naywastudio.com",
        subject: `Votre demande de modification n'a pas été acceptée — ${orgName}`,
        text: [
          `Bonjour ${requesterProfile?.first_name ?? ""},`.trim(),
          "",
          `Votre demande de modification du branding de ${orgName} n'a pas été acceptée.`,
          `Champ concerné : ${labelFor(request.field)}.`,
          note ? `\nRaison : ${note}\n` : "",
          "Vous pouvez ouvrir une nouvelle demande depuis votre console si besoin,",
          "ou répondre à ce mail pour échanger avec notre équipe.",
          "",
          "L'équipe Naywa Studio",
        ].join("\n"),
      })
    } catch (e) {
      console.error("[branding/reject] mail send failed", e)
    }
  }

  await logAdminAction({
    adminUserId: gate.userId,
    action: "reject_branding_request",
    targetType: "branding_request",
    targetId: id,
    metadata: { field: request.field, organization_id: request.organization_id, note },
  })
  return NextResponse.json({ ok: true })
}

function labelFor(field: string): string {
  if (field === "name") return "Nom de l'organisation"
  if (field === "brand_logo_path") return "Logo"
  if (field === "contact_email") return "Email de contact"
  return field
}
