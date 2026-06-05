-- Migration 024 — Auto-fill organization_id on insert
--
-- After migration 019, every business table has a NOT NULL
-- organization_id column. Most existing API routes insert rows setting
-- only user_id (leftover from the user-scoped era), which now triggers
-- a NOT NULL violation.
--
-- Defense in depth: a BEFORE INSERT trigger pulls the inserter's
-- organization_id from their profile when the column wasn't supplied.
-- Routes that DO supply organization_id explicitly remain authoritative.

CREATE OR REPLACE FUNCTION set_organization_id_from_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM profiles WHERE user_id = NEW.user_id LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'candidates', 'jobs', 'match_assessments',
    'daily_usage', 'email_messages', 'interviews'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_org_id_%I ON %I;
       CREATE TRIGGER set_org_id_%I
         BEFORE INSERT ON %I
         FOR EACH ROW EXECUTE FUNCTION set_organization_id_from_user();',
      t, t, t, t
    );
  END LOOP;
END $$;
