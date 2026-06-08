-- Migration 031 — Cabinet onboarding completion stamp
--
-- Adds `organizations.cabinet_onboarded_at`. The flag is set when the
-- owner exits the /cabinet/onboarding flow (either by activating the
-- trial OR by skipping). Once set, the redirect to /cabinet/onboarding
-- stops firing.
--
-- Why a separate column from `trial_ends_at` : the owner may legitimately
-- want to skip the trial activation at signup (e.g. just exploring the
-- console first), and then activate later from the Subscription block
-- in the dashboard. Onboarding done != trial active.

BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS cabinet_onboarded_at timestamptz;

COMMENT ON COLUMN organizations.cabinet_onboarded_at IS
  'Timestamp when the owner finished the /cabinet/onboarding flow. NULL = owner has never seen it, redirect them on next /cabinet visit.';

COMMIT;
