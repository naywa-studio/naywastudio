import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import type { PricingDefaultAvantages } from "@/lib/database.types"

/**
 * PATCH /api/cabinet
 *   Owner-only. Updates editable fields on the caller's organization.
 *   Body: { name?, brand_name?, brand_logo_path?, brand_color?,
 *           brand_slogan?, contact_email?, pricing_* }
 *
 * DELETE /api/cabinet
 *   Owner-only. Triggers cabinet deletion.
 *     - If the owner is alone in the org → wipe everything immediately
 *       (org cascade + auth.users + storage logo).
 *     - If other members exist → set pending_deletion_at = now() + 30 d,
 *       wipe the owner's auth.users + profile immediately. Members keep
 *       access during the grace period; the daily cron (built in a
 *       follow-up step) does the final wipe.
 */

const GRACE_DAYS = 30

interface UpdateBody {
  name?: string
  brand_name?: string | null
  brand_logo_path?: string | null
  // Branding cabinet — pour personnaliser le PDF anonymisé candidat
  // avec l'identité visuelle du cabinet (couleur primaire, slogan) +
  // un mail générique de contact imprimé en pied de page.
  brand_color?: string | null
  brand_slogan?: string | null
  contact_email?: string | null
  // Cabinet-wide pricing defaults — single source of truth for the
  // pricing engine. Owner-only writes; UI in /workspace/parametrage
  // and the first-time wizard call this route.
  pricing_billable_days_per_month?: number | null
  pricing_rtt_days_per_year?: number
  pricing_margin_min_pct?: number | null
  pricing_margin_target_pct?: number | null
  pricing_default_lieu?: "paris_petite_couronne" | "idf_grande_couronne" | "lyon" | "province" | null
  pricing_default_modalite?: "modalite_1" | "modalite_2" | "modalite_3" | null
  pricing_default_avantages?: PricingDefaultAvantages | null
  pricing_onboarded_at?: string | null
}

export async function PATCH(req: Request) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const { data: profile } = await sb
    .from("profiles")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .single()

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 404 })
  }
  if (profile.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can edit the cabinet" }, { status: 403 })
  }

  let body: UpdateBody
  try { body = (await req.json()) as UpdateBody }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const patch: UpdateBody = {}
  if ("name" in body && typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim()
  }
  if ("brand_name" in body) {
    patch.brand_name = body.brand_name && body.brand_name.trim() ? body.brand_name.trim() : null
  }
  if ("brand_logo_path" in body) {
    patch.brand_logo_path = body.brand_logo_path && body.brand_logo_path.trim() ? body.brand_logo_path : null
  }
  // Couleur de marque : on valide juste qu'elle a un format hex
  // raisonnable (#RGB ou #RRGGBB) pour éviter d'injecter n'importe
  // quoi dans le rendu PDF côté serveur. Si invalide on stocke null
  // (= défaut applicatif).
  if ("brand_color" in body) {
    const raw = typeof body.brand_color === "string" ? body.brand_color.trim() : ""
    patch.brand_color = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw) ? raw : null
  }
  if ("brand_slogan" in body) {
    const raw = typeof body.brand_slogan === "string" ? body.brand_slogan.trim() : ""
    // Slogan court : on cappe à 120 caractères côté serveur pour pas
    // exploser la mise en page du PDF si quelqu'un colle un paragraphe.
    patch.brand_slogan = raw ? raw.slice(0, 120) : null
  }
  if ("contact_email" in body) {
    const raw = typeof body.contact_email === "string" ? body.contact_email.trim() : ""
    // Validation minimale : juste s'assurer qu'il y a un @ avec un point
    // derrière. Le but n'est pas d'être parfaitement strict (RFC 5322 est
    // un cauchemar), juste d'éviter du texte libre arrivant sur le PDF.
    patch.contact_email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : null
  }

  // Pricing defaults — accepted but not strictly validated here; the UI
  // is the one that sanitises ranges (margin 0-100, billable days 1-22…).
  const PRICING_NUMBERS: Array<keyof UpdateBody> = [
    "pricing_billable_days_per_month",
    "pricing_rtt_days_per_year",
    "pricing_margin_min_pct",
    "pricing_margin_target_pct",
  ]
  for (const k of PRICING_NUMBERS) {
    if (k in body) {
      const v = (body as Record<string, unknown>)[k]
      ;(patch as Record<string, unknown>)[k] = typeof v === "number" && Number.isFinite(v) ? v : null
    }
  }
  if ("pricing_default_lieu" in body) {
    patch.pricing_default_lieu = (body.pricing_default_lieu ?? null) as UpdateBody["pricing_default_lieu"]
  }
  if ("pricing_default_modalite" in body) {
    patch.pricing_default_modalite = (body.pricing_default_modalite ?? null) as UpdateBody["pricing_default_modalite"]
  }
  if ("pricing_default_avantages" in body) {
    patch.pricing_default_avantages = (body.pricing_default_avantages ?? null) as PricingDefaultAvantages | null
  }
  if ("pricing_onboarded_at" in body) {
    patch.pricing_onboarded_at = typeof body.pricing_onboarded_at === "string" ? body.pricing_onboarded_at : null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Empty patch" }, { status: 400 })
  }

  const { error } = await sb
    .from("organizations")
    .update(patch)
    .eq("id", profile.organization_id)

  if (error) {
    console.error("[/api/cabinet PATCH]", error)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const { data: profile } = await sb
    .from("profiles")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .single()

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 404 })
  }
  if (profile.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can delete the cabinet" }, { status: 403 })
  }

  const admin = getAdminSupabase()

  // Count other members in the org (excluding the owner herself).
  const { count: otherMembers } = await admin
    .from("profiles")
    .select("user_id", { count: "exact", head: true })
    .eq("organization_id", profile.organization_id)
    .neq("user_id", user.id)

  // Fetch logo path so we can clean up storage too.
  const { data: org } = await admin
    .from("organizations")
    .select("brand_logo_path")
    .eq("id", profile.organization_id)
    .single()

  if ((otherMembers ?? 0) === 0) {
    // ─ Alone in the org → wipe immediately. Cascading FK ON DELETE on
    //   organizations removes every candidate, job, match, email, invite,
    //   daily_usage row and the owner's profile.
    if (org?.brand_logo_path) {
      await admin.storage.from("brand-logos").remove([org.brand_logo_path])
    }

    const { error: orgErr } = await admin
      .from("organizations")
      .delete()
      .eq("id", profile.organization_id)
    if (orgErr) {
      console.error("[/api/cabinet DELETE solo] org delete", orgErr)
      return NextResponse.json({ error: "DB error" }, { status: 500 })
    }

    const { error: userErr } = await admin.auth.admin.deleteUser(user.id)
    if (userErr) {
      console.error("[/api/cabinet DELETE solo] auth delete", userErr)
      return NextResponse.json({ error: "Auth error" }, { status: 500 })
    }

    return NextResponse.json({ ok: true, mode: "immediate" })
  }

  // ─ Members exist → enter 30-day grace mode. The owner is removed now,
  //   the org keeps running for the others, cron wipes everything at the
  //   deadline. owner_user_id is cleared so nothing dangles.
  const deletionDate = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000)

  const { error: orgErr } = await admin
    .from("organizations")
    .update({
      pending_deletion_at: deletionDate.toISOString(),
      owner_user_id: null,
    })
    .eq("id", profile.organization_id)
  if (orgErr) {
    console.error("[/api/cabinet DELETE grace] org update", orgErr)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  const { error: userErr } = await admin.auth.admin.deleteUser(user.id)
  if (userErr) {
    console.error("[/api/cabinet DELETE grace] auth delete", userErr)
    return NextResponse.json({ error: "Auth error" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    mode: "grace",
    pending_deletion_at: deletionDate.toISOString(),
  })
}
