-- Migration 022 — Make the signup trigger honor an explicit first_name
--
-- The login page's signup form lets the user type their first name. We
-- now pass it through Supabase's `options.data` so it lands in
-- `auth.users.raw_user_meta_data->>'first_name'`. The trigger reads that
-- key first, falling back to Google OAuth's name fields and finally to
-- the email local-part.

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
    NULLIF(TRIM(NEW.raw_user_meta_data->>'first_name'), ''),
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
