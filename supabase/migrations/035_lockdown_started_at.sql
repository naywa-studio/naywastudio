-- Migration 035 — Lockdown countdown for cabinets that lose access
--
-- When Stripe flips a subscription to past_due / unpaid (failed
-- prélèvement, expired trial without conversion), the org enters a
-- 15-day read-only window before its data gets wiped. We track the
-- entry point with `lockdown_started_at`.
--
-- Once set :
--   - workspace mutations return 403 (read-only mode)
--   - banner counts down from lockdown_started_at + 15 days
--   - daily cron wipes org data (candidates, jobs, matches, ...) at
--     expiry — keeps auth.users + the org row itself so the owner
--     can re-subscribe and the workspace says "souscrivez pour
--     reprendre l'accès"
--
-- Cleared when subscription becomes active or trialing again.

BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS lockdown_started_at timestamptz;

COMMENT ON COLUMN organizations.lockdown_started_at IS
  'When the org entered read-only mode. NULL = active access. Set on past_due / unpaid / canceled, cleared on next active/trialing subscription. Daily cron wipes data at +15 days.';

COMMIT;
