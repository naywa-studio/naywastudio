-- Migration 029 — Security hardening
--
-- Resolves Supabase Security Advisor warnings without touching any
-- behaviour. Three buckets :
--
-- 1. Pin search_path on the two `touch_updated_at` trigger functions.
--    They were created without `SET search_path`, which lets a hostile
--    schema search order shadow `now()` or operators. Pinning to
--    public + pg_temp closes that.
--
-- 2. Revoke EXECUTE from PUBLIC on the trigger functions that should
--    never be called directly (`handle_new_auth_user`,
--    `set_organization_id_from_user`). Triggers run under the owner's
--    SECURITY DEFINER privilege regardless of who pulls the row, so
--    revoking PUBLIC EXECUTE breaks nothing.
--
-- 3. Tighten EXECUTE on `current_org_id()` : revoke PUBLIC (anonymous
--    callers don't need it — RLS only runs for `authenticated`) and
--    keep an explicit GRANT to `authenticated`. RLS policies that
--    reference it continue to work because they execute under the
--    caller's role.
--
-- All five `CREATE OR REPLACE FUNCTION` rewrites preserve the existing
-- body byte-for-byte; only the function attributes change.

BEGIN;

------------------------------------------------------------------------
-- 1. organizations_touch_updated_at — pin search_path
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION organizations_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

------------------------------------------------------------------------
-- 2. cluster_manifests_touch_updated_at — pin search_path
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cluster_manifests_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

------------------------------------------------------------------------
-- 3. handle_new_auth_user — revoke EXECUTE from non-trigger callers
--    Triggers run under SECURITY DEFINER so don't need PUBLIC EXECUTE.
------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION handle_new_auth_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION handle_new_auth_user() FROM anon;
REVOKE EXECUTE ON FUNCTION handle_new_auth_user() FROM authenticated;

------------------------------------------------------------------------
-- 4. set_organization_id_from_user — same treatment
------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION set_organization_id_from_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_organization_id_from_user() FROM anon;
REVOKE EXECUTE ON FUNCTION set_organization_id_from_user() FROM authenticated;

------------------------------------------------------------------------
-- 5. current_org_id — tighten to authenticated only
--    Anonymous users never carry an org context, so they shouldn't be
--    able to invoke the helper. RLS policies will continue to call it
--    under the signed-in user's role.
------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION current_org_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION current_org_id() FROM anon;
GRANT  EXECUTE ON FUNCTION current_org_id() TO   authenticated;

COMMIT;
