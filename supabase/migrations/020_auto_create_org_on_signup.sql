-- Migration 020 — Auto-create an org when a new auth user signs up
--
-- Without this trigger, a brand-new signup would have a profile but no
-- organization_id, and every org-scoped RLS policy would reject their
-- queries (current_org_id() returns NULL → no rows).
--
-- This trigger fires after a row is inserted into auth.users:
--   1. Creates a personal org named "Cabinet de {prénom_ou_email}"
--   2. Inserts/updates the corresponding profile row with that org_id
--      and role='owner'
--
-- The first_name is derived from raw_user_meta_data when available
-- (Google OAuth), otherwise it falls back to the local-part of the email.

CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  derived_first_name text;
  new_org_id uuid;
BEGIN
  derived_first_name := COALESCE(
    NULLIF(TRIM(SPLIT_PART(NEW.raw_user_meta_data->>'full_name', ' ', 1)), ''),
    NULLIF(TRIM(SPLIT_PART(NEW.raw_user_meta_data->>'name', ' ', 1)), ''),
    NULLIF(TRIM(SPLIT_PART(NEW.email, '@', 1)), ''),
    'sourceur'
  );

  INSERT INTO organizations (name, owner_user_id)
  VALUES ('Cabinet de ' || derived_first_name, NEW.id)
  RETURNING id INTO new_org_id;

  INSERT INTO profiles (user_id, first_name, organization_id, role)
  VALUES (NEW.id, derived_first_name, new_org_id, 'owner')
  ON CONFLICT (user_id) DO UPDATE
    SET organization_id = EXCLUDED.organization_id,
        role = 'owner',
        first_name = COALESCE(profiles.first_name, EXCLUDED.first_name);

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_auth_user();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_user_id_unique'
  ) THEN
    BEGIN
      ALTER TABLE profiles ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);
    EXCEPTION WHEN duplicate_table OR unique_violation THEN
      NULL;
    END;
  END IF;
END $$;
