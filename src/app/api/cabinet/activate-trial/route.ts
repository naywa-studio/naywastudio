/**
 * POST /api/cabinet/activate-trial
 *
 * Owner-only. Stamps `organizations.trial_ends_at = now() + 15 days`
 * et marque l'email comme trial-consommé (table trial_consumed_emails)
 * pour empêcher un même email de re-tirer un trial en supprimant son
 * cabinet et en en re-créant un autre.
 *
 * Idempotent : si le trial est déjà activé, retourne la valeur existante.
 *
 * Si trial_consumed_emails contient déjà l'email -> 409.
 *
 * Le moyen de paiement est OPTIONNEL — l'user peut l'ajouter via
 * /api/stripe/setup-intent ou attendre le reminder. Cette route ne
 * touche pas Stripe.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { computeTrialEndsAt, TRIAL_DURATION_DAYS } from "@/lib/trial"

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export const runtime = "nodejs"

export async function POST() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  // RLS-scoped read first : confirms the caller belongs to an org and
  // is the owner. Avoids any admin-write before we know who we're
  // dealing with.
  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .single()

  if (profileErr || !profile?.organization_id) {
    return NextResponse.json({ error: "Profil introuvable" }, { status: 404 })
  }
  if (profile.role !== "owner") {
    return NextResponse.json(
      { error: "Seul l'owner du cabinet peut activer l'essai" },
      { status: 403 },
    )
  }

  // Read the current trial_ends_at value (idempotency check).
  const { data: org, error: orgErr } = await sb
    .from("organizations")
    .select("id, trial_ends_at")
    .eq("id", profile.organization_id)
    .single()

  if (orgErr || !org) {
    return NextResponse.json({ error: "Cabinet introuvable" }, { status: 404 })
  }

  if (org.trial_ends_at) {
    // Already activated (or expired). Don't refresh.
    return NextResponse.json({
      trialEndsAt:   org.trial_ends_at,
      alreadyActive: true,
    })
  }

  const admin = getAdminSupabase()

  // Anti-double-trial : si l'email a déjà tiré un trial ailleurs, refus.
  const ownerEmail = user.email ? normalizeEmail(user.email) : null
  if (ownerEmail) {
    const { data: consumed } = await admin
      .from("trial_consumed_emails")
      .select("email")
      .eq("email", ownerEmail)
      .maybeSingle()
    if (consumed) {
      return NextResponse.json(
        { error: "Vous avez déjà utilisé votre essai gratuit. Souscrivez directement pour reprendre l'accès." },
        { status: 409 },
      )
    }
  }

  const endsAt = computeTrialEndsAt()

  const { error: updateErr } = await admin
    .from("organizations")
    .update({ trial_ends_at: endsAt.toISOString() })
    .eq("id", org.id)

  if (updateErr) {
    console.error("[activate-trial] update failed", updateErr)
    return NextResponse.json(
      { error: "Activation impossible pour le moment" },
      { status: 500 },
    )
  }

  // Marque l'email immédiatement après stamp réussi.
  if (ownerEmail) {
    await admin
      .from("trial_consumed_emails")
      .upsert(
        { email: ownerEmail, organization_id: org.id },
        { onConflict: "email" },
      )
  }

  return NextResponse.json({
    trialEndsAt:   endsAt.toISOString(),
    durationDays:  TRIAL_DURATION_DAYS,
    alreadyActive: false,
  })
}
