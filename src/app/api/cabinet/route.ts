import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import type { PricingDefaultAvantages } from "@/lib/database.types"

export const runtime = "nodejs"

/**
 * PATCH /api/cabinet
 *   Owner-only. Updates editable fields on the caller's organization.
 *   Body: { name?, brand_name?, brand_logo_path?, brand_color?,
 *           brand_slogan?, contact_email?, pricing_* }
 *
 * DELETE /api/cabinet
 *   Owner-only. Programme la suppression de l'organisation avec une fenêtre
 *   de grâce de 30 jours, RECOUVRABLE (bouton "Annuler la suppression"). On
 *   ne détruit JAMAIS l'owner ni les membres tout de suite :
 *     - set `pending_deletion_at = now() + 30 j` (solo ET avec membres) ;
 *     - l'org passe en LECTURE SEULE pour tout le monde (cf. graceInfo) ;
 *     - l'export RGPD reste disponible ;
 *     - le cron `wipe-expired-orgs` finalise le wipe (org + auth.users +
 *       logo) à l'échéance si personne n'a annulé.
 *   Annulation : POST /api/cabinet/cancel-deletion (clear pending_deletion_at).
 */

const GRACE_DAYS = 30

interface UpdateBody {
  name?: string
  brand_name?: string | null
  brand_logo_path?: string | null
  // Branding cabinet — pour personnaliser le PDF anonymisé candidat
  // avec l'identité visuelle du cabinet (couleur primaire + secondaire
  // optionnelle, slogan) + un mail générique de contact imprimé en
  // pied de page.
  brand_color?: string | null
  brand_color_secondary?: string | null
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
    .select("organization_id, role, can_manage_org_settings")
    .eq("user_id", user.id)
    .single()

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 404 })
  }

  // Deux niveaux de droit sur cette route.
  //
  //   owner    → tout, y compris l'identité légale et l'e-mail de contact.
  //   délégué  → UNIQUEMENT l'habillage visuel et la politique de pricing.
  //
  // Le drapeau `can_manage_org_settings` est posé nommément par l'owner sur
  // un membre (cf. migration 062). Il ne donne aucun droit sur la
  // facturation, les sièges, le transfert de propriété ou la suppression —
  // ces actions vivent sur d'autres routes, toutes owner-only.
  const isOwner = profile.role === "owner"
  const isDelegate = profile.can_manage_org_settings === true
  if (!isOwner && !isDelegate) {
    return NextResponse.json({ error: "Only the owner can edit the cabinet" }, { status: 403 })
  }

  let body: UpdateBody
  try { body = (await req.json()) as UpdateBody }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  // Champs réservés à l'owner : `name` est l'identité légale de la société,
  // et les horodatages d'onboarding pilotent des redirections — ils ne se
  // modifient pas à la main.
  //
  // `contact_email` est délégable (décision Elyas) : c'est l'adresse imprimée
  // sur les documents envoyés aux clients, donc elle fait partie de ce que
  // gère la personne qui prépare ces documents.
  const OWNER_ONLY: ReadonlyArray<string> = [
    "name",
    "cabinet_onboarded_at",
    "pricing_onboarded_at",
  ]
  if (!isOwner) {
    const forbidden = OWNER_ONLY.filter((k) => k in (body as Record<string, unknown>))
    if (forbidden.length > 0) {
      return NextResponse.json(
        {
          error: "owner_only_fields",
          message: `Ces champs ne sont modifiables que par le propriétaire : ${forbidden.join(", ")}.`,
        },
        { status: 403 },
      )
    }
  }

  // Champs branding fort : verrouillés 24h après onboarding
  // (organizations.branding_locked_at). Passé ce délai, toute modification
  // doit passer par POST /api/cabinet/branding/request + validation admin —
  // sinon n'importe quel owner pourrait re-changer l'identité affichée sur
  // les CV anonymisés sans revue (vecteur d'usurpation). Le check UI seul
  // (organisation/page.tsx) ne suffit pas : cette route doit refuser elle-même.
  const LOCKED_FIELDS: Array<keyof UpdateBody> = ["name", "brand_name", "brand_logo_path", "contact_email"]
  if (LOCKED_FIELDS.some((f) => f in body)) {
    const { data: org } = await sb
      .from("organizations")
      .select("branding_locked_at")
      .eq("id", profile.organization_id)
      .single()
    const isLocked = !!org?.branding_locked_at && new Date(org.branding_locked_at).getTime() <= Date.now()
    if (isLocked) {
      return NextResponse.json({ error: "branding_locked" }, { status: 403 })
    }
  }

  const patch: UpdateBody = {}
  if ("name" in body && typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim()
  }
  if ("brand_name" in body) {
    patch.brand_name = body.brand_name && body.brand_name.trim() ? body.brand_name.trim() : null
  }
  if ("brand_logo_path" in body) {
    const raw = body.brand_logo_path && body.brand_logo_path.trim() ? body.brand_logo_path.trim() : null
    // Le chemin doit obligatoirement commencer par le préfixe de l'org
    // appelante — sinon un owner pourrait pointer brand_logo_path vers le
    // logo d'une autre organisation (le fichier n'a jamais été vérifié
    // comme appartenant réellement au caller avant cette route).
    if (raw && !raw.startsWith(`${profile.organization_id}/`)) {
      return NextResponse.json({ error: "invalid_logo_path" }, { status: 400 })
    }
    patch.brand_logo_path = raw
  }
  // Couleur de marque : on valide juste qu'elle a un format hex
  // raisonnable (#RGB ou #RRGGBB) pour éviter d'injecter n'importe
  // quoi dans le rendu PDF côté serveur. Si invalide on stocke null
  // (= défaut applicatif).
  if ("brand_color" in body) {
    const raw = typeof body.brand_color === "string" ? body.brand_color.trim() : ""
    patch.brand_color = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw) ? raw : null
  }
  if ("brand_color_secondary" in body) {
    const raw = typeof body.brand_color_secondary === "string" ? body.brand_color_secondary.trim() : ""
    patch.brand_color_secondary = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw) ? raw : null
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

  // Idempotence : si une suppression est déjà programmée, on renvoie la date
  // existante sans re-stamper (évite de repousser l'échéance à chaque clic).
  const { data: existing } = await admin
    .from("organizations")
    .select("pending_deletion_at")
    .eq("id", profile.organization_id)
    .single()
  if (existing?.pending_deletion_at) {
    return NextResponse.json({
      ok: true, mode: "grace", pending_deletion_at: existing.pending_deletion_at,
    })
  }

  // ─ Grâce 30 j, recouvrable. On NE détruit personne : ni l'owner, ni les
  //   membres, ni les données. L'org passe en lecture seule (graceInfo),
  //   l'owner peut annuler (cancel-deletion) ou transférer la propriété. Le
  //   cron wipe-expired-orgs finalise à l'échéance si rien n'a changé.
  //   owner_user_id est CONSERVÉ (l'owner doit pouvoir annuler / réactiver).
  const deletionDate = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000)

  const { error: orgErr } = await admin
    .from("organizations")
    .update({ pending_deletion_at: deletionDate.toISOString() })
    .eq("id", profile.organization_id)
  if (orgErr) {
    console.error("[/api/cabinet DELETE] org update", orgErr)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    mode: "grace",
    pending_deletion_at: deletionDate.toISOString(),
  })
}
