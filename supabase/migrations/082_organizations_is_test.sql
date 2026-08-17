BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS organizations_is_test_idx
  ON organizations (is_test);

COMMIT;