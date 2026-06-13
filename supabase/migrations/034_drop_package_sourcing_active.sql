-- Migration 034 — Drop legacy package_sourcing_active boolean
--
-- Before Stripe : access was gated on this bool (always true since
-- migration 020 trigger). The new gate is the union :
--
--   trial_ends_at > now()                      ← free 15-day trial
--   OR subscription_status IN ('trialing','active')   ← paid Stripe sub
--
-- Both are computed in TypeScript (lib/trial.ts + lib/subscription.ts),
-- so the boolean has no more reason to exist. Dropping it now to avoid
-- a stale "always true" flag misleading future readers of the schema.
--
-- The column had no business meaning that isn't covered by the new
-- pair, and removing it is safer than keeping a misleading "active"
-- flag the code never reads.

BEGIN;

ALTER TABLE organizations
  DROP COLUMN IF EXISTS package_sourcing_active;

COMMIT;
