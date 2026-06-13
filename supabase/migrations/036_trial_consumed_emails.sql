-- Migration 036 — Track which emails have already consumed a free trial
--
-- Per-email tracker that survives org deletion : an owner who created
-- a cabinet, used the trial, got wiped, and signed up again with the
-- same email cannot get a second 15-day free trial.
--
-- We normalize the email at insert (lowercase, trim) so case variations
-- and accidental whitespace don't bypass the check.
--
-- The cron wipe (035) clears org data but NOT this table — that's the
-- whole point.

BEGIN;

CREATE TABLE IF NOT EXISTS trial_consumed_emails (
  email           text PRIMARY KEY,
  consumed_at     timestamptz NOT NULL DEFAULT now(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  notes           text
);

-- RLS : table read-only from RLS land. Only the service-role can
-- insert/check, which is what the trial-activation API does.
ALTER TABLE trial_consumed_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_select_anonymous"
  ON trial_consumed_emails
  FOR SELECT
  USING (false);

COMMENT ON TABLE trial_consumed_emails IS
  'Emails that have already used the 15-day free trial. Prevents the same person from re-creating a cabinet to refresh the trial.';
COMMENT ON COLUMN trial_consumed_emails.email IS
  'Lowercased, trimmed email. Primary key — collision = "trial already used".';

COMMIT;
