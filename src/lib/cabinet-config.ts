/**
 * cabinet-config — single source for the cabinet's brand + pricing config.
 *
 * Until migration 019 these fields lived on `profiles`. Now they live on
 * `organizations`; this helper hides the org-lookup hop from the
 * many call sites that just want "the cabinet's defaults for the
 * caller's user".
 *
 * Use the shape `CabinetPricingConfig` everywhere instead of
 * `Pick<Profile, "pricing_...">` so the type doesn't get tied back to
 * the legacy columns.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, Organization, PricingDefaultAvantages } from "./database.types"

export interface CabinetPricingConfig {
  pricing_billable_days_per_month: number | null
  pricing_rtt_days_per_year: number
  pricing_margin_min_pct: number | null
  pricing_margin_target_pct: number | null
  pricing_default_lieu: Organization["pricing_default_lieu"]
  pricing_default_modalite: Organization["pricing_default_modalite"]
  pricing_default_avantages: PricingDefaultAvantages | null
  pricing_onboarded_at: string | null
}

export interface CabinetBrand {
  brand_name: string | null
  brand_logo_path: string | null
  /** Fallback when brand_name is not set — the org's canonical name. */
  organization_name: string
}

const PRICING_COLS = `
  pricing_billable_days_per_month,
  pricing_rtt_days_per_year,
  pricing_margin_min_pct,
  pricing_margin_target_pct,
  pricing_default_lieu,
  pricing_default_modalite,
  pricing_default_avantages,
  pricing_onboarded_at
`

const BRAND_COLS = `name, brand_name, brand_logo_path`

/**
 * Fetch the caller's cabinet pricing config. Pass any supabase client
 * (user-scoped or admin) — the helper does the profile→org hop.
 *
 * Returns null when the caller has no profile or no org. UI code should
 * handle that case gracefully (typically a redirect to /login).
 */
export async function getCabinetPricingConfig(
  sb: SupabaseClient<Database>,
  userId: string,
): Promise<CabinetPricingConfig | null> {
  const { data: profile } = await sb
    .from("profiles")
    .select("organization_id")
    .eq("user_id", userId)
    .maybeSingle()
  if (!profile?.organization_id) return null

  const { data: org } = await sb
    .from("organizations")
    .select(PRICING_COLS)
    .eq("id", profile.organization_id)
    .maybeSingle()
  if (!org) return null

  return org as unknown as CabinetPricingConfig
}

/** Same as above, but resolves to the cabinet's branding (name + logo). */
export async function getCabinetBrand(
  sb: SupabaseClient<Database>,
  userId: string,
): Promise<CabinetBrand | null> {
  const { data: profile } = await sb
    .from("profiles")
    .select("organization_id")
    .eq("user_id", userId)
    .maybeSingle()
  if (!profile?.organization_id) return null

  const { data: org } = await sb
    .from("organizations")
    .select(BRAND_COLS)
    .eq("id", profile.organization_id)
    .maybeSingle()
  if (!org) return null

  return {
    brand_name: org.brand_name ?? null,
    brand_logo_path: org.brand_logo_path ?? null,
    organization_name: org.name,
  }
}

/**
 * Returns the org_id of the caller — convenience for call sites that
 * need to write something org-scoped (e.g. update pricing settings).
 */
export async function getCabinetOrgId(
  sb: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const { data: profile } = await sb
    .from("profiles")
    .select("organization_id")
    .eq("user_id", userId)
    .maybeSingle()
  return profile?.organization_id ?? null
}
