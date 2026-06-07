-- Migration 030 — Trial 15 days, owner-activated
--
-- Adds `organizations.trial_ends_at` (timestamptz, nullable).
--
-- Three-state semantics, encoded in a single column to keep things
-- light :
--
--   NULL                  -> trial not yet activated (owner sees the
--                            onboarding modal in /cabinet)
--   trial_ends_at > now() -> trial active (banner shows the countdown)
--   trial_ends_at <= now() -> trial expired (banner switches to red,
--                            access stays open until Stripe is wired)
--
-- Existing orgs left at NULL on purpose : the owner has to opt in
-- explicitly. The single existing org (Elyas') will land on the
-- activation modal next time he opens /cabinet — useful for demoing
-- the flow during the prospect pitch.

BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

COMMENT ON COLUMN organizations.trial_ends_at IS
  'Timestamp the 15-day free trial expires. NULL = not yet activated by the owner. Trial mechanics are advisory only until Stripe is wired (see CLAUDE.md section 17).';

CREATE INDEX IF NOT EXISTS organizations_trial_ends_at_idx
  ON organizations (trial_ends_at);

COMMIT;
