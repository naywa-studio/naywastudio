-- Migration 026 — Drop the legacy brand & pricing mirrors on profiles
--
-- Migrations 019/021 introduced these fields on organizations as the
-- new single source of truth, but they were also kept on profiles to
-- avoid breaking existing code. All read/write call sites have now
-- been migrated to read/write organizations directly, so we can drop
-- the mirrors safely.

ALTER TABLE profiles
  DROP COLUMN IF EXISTS brand_name,
  DROP COLUMN IF EXISTS brand_logo_path,
  DROP COLUMN IF EXISTS pricing_billable_days_per_month,
  DROP COLUMN IF EXISTS pricing_margin_min_pct,
  DROP COLUMN IF EXISTS pricing_margin_target_pct,
  DROP COLUMN IF EXISTS pricing_default_lieu,
  DROP COLUMN IF EXISTS pricing_default_modalite,
  DROP COLUMN IF EXISTS pricing_default_avantages,
  DROP COLUMN IF EXISTS pricing_onboarded_at,
  DROP COLUMN IF EXISTS pricing_rtt_days_per_year;
