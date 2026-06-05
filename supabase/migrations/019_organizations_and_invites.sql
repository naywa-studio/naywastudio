-- Migration 019 — Organizations & multi-user workspace
--
-- Introduces the org concept so multiple users (= a cabinet's team) can
-- share the same Nora workspace. Until now, every piece of data
-- (candidates, jobs, matches…) was scoped by user_id. This migration
-- transitions to org-scoping:
--
--   - new tables `organizations` + `org_invites`
--   - `profiles.organization_id` + `profiles.role` ('owner' | 'member')
--   - `organization_id` added to every business table with ON DELETE CASCADE
--     → wiping an org is atomic (RGPD-friendly)
--   - backfill : each existing profile gets a personal "Cabinet de {prénom}"
--     org with itself as owner; every existing row is linked to that org
--   - RLS policies switched from `user_id = auth.uid()` to org membership
--   - `pending_deletion_at` on org → owner can request deletion, members
--     keep access until the deadline, then a cron wipes everything
--
-- Brand fields (brand_name, brand_logo_path) and pricing settings
-- (pricing_*) are duplicated on `organizations` and backfilled, but the
-- columns on `profiles` are KEPT for now to avoid breaking the existing
-- code. A follow-up migration will drop them once all read paths use the
-- org-scoped fields.

BEGIN;

------------------------------------------------------------------------
-- 1. organizations
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text NOT NULL,
  owner_user_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Branding (mirrors profiles.brand_* — single source of truth going forward)
  brand_name               text,
  brand_logo_path          text,

  -- Subscription state (no Stripe yet — booleans + counts only)
  package_sourcing_active  boolean NOT NULL DEFAULT true,
  seats_total              integer NOT NULL DEFAULT 1,

  -- Pricing cabinet-wide defaults (mirrors profiles.pricing_* — single
  -- source of truth going forward)
  pricing_billable_days_per_month  numeric DEFAULT 18,
  pricing_margin_min_pct           numeric DEFAULT 15,
  pricing_margin_target_pct        numeric DEFAULT 22,
  pricing_default_lieu             text    DEFAULT 'paris_petite_couronne',
  pricing_default_modalite         text    DEFAULT 'modalite_1',
  pricing_default_avantages        jsonb,
  pricing_onboarded_at             timestamptz,
  pricing_rtt_days_per_year        integer NOT NULL DEFAULT 0,

  -- Grace period for deletion. If non-null, the org will be wiped by the
  -- cron when now() >= pending_deletion_at. Members keep access until then.
  pending_deletion_at      timestamptz,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN organizations.pending_deletion_at IS
  'If set, the org and all its data will be deleted by the daily cron once now() >= pending_deletion_at. Owner is already gone; members keep access until then.';

CREATE INDEX IF NOT EXISTS organizations_pending_deletion_idx
  ON organizations (pending_deletion_at)
  WHERE pending_deletion_at IS NOT NULL;

------------------------------------------------------------------------
-- 2. profiles : organization_id + role
------------------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'owner'
    CHECK (role IN ('owner', 'member'));

CREATE INDEX IF NOT EXISTS profiles_organization_id_idx ON profiles (organization_id);

------------------------------------------------------------------------
-- 3. organization_id on every business table (nullable for now, NOT NULL
--    after backfill)
------------------------------------------------------------------------
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS candidates_organization_id_idx ON candidates (organization_id);

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS jobs_organization_id_idx ON jobs (organization_id);

ALTER TABLE match_assessments
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS match_assessments_organization_id_idx ON match_assessments (organization_id);

ALTER TABLE daily_usage
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS daily_usage_organization_id_idx ON daily_usage (organization_id);

ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS email_messages_organization_id_idx ON email_messages (organization_id);

ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS interviews_organization_id_idx ON interviews (organization_id);

------------------------------------------------------------------------
-- 4. Backfill — one org per existing profile, with that profile as owner.
--    All business rows owned by that user are linked to that org.
------------------------------------------------------------------------
DO $$
DECLARE
  prof RECORD;
  new_org_id uuid;
  org_label text;
BEGIN
  FOR prof IN SELECT * FROM profiles WHERE organization_id IS NULL LOOP
    org_label := COALESCE(
      NULLIF(prof.brand_name, ''),
      'Cabinet de ' || COALESCE(NULLIF(prof.first_name, ''), 'sourceur')
    );

    INSERT INTO organizations (
      name, owner_user_id,
      brand_name, brand_logo_path,
      package_sourcing_active, seats_total,
      pricing_billable_days_per_month,
      pricing_margin_min_pct,
      pricing_margin_target_pct,
      pricing_default_lieu,
      pricing_default_modalite,
      pricing_default_avantages,
      pricing_onboarded_at,
      pricing_rtt_days_per_year
    )
    VALUES (
      org_label, prof.user_id,
      prof.brand_name, prof.brand_logo_path,
      true, 1,
      COALESCE(prof.pricing_billable_days_per_month, 18),
      COALESCE(prof.pricing_margin_min_pct, 15),
      COALESCE(prof.pricing_margin_target_pct, 22),
      COALESCE(prof.pricing_default_lieu, 'paris_petite_couronne'),
      COALESCE(prof.pricing_default_modalite, 'modalite_1'),
      prof.pricing_default_avantages,
      prof.pricing_onboarded_at,
      COALESCE(prof.pricing_rtt_days_per_year, 0)
    )
    RETURNING id INTO new_org_id;

    UPDATE profiles
       SET organization_id = new_org_id, role = 'owner'
     WHERE id = prof.id;

    UPDATE candidates         SET organization_id = new_org_id WHERE user_id = prof.user_id;
    UPDATE jobs               SET organization_id = new_org_id WHERE user_id = prof.user_id;
    UPDATE match_assessments  SET organization_id = new_org_id WHERE user_id = prof.user_id;
    UPDATE daily_usage        SET organization_id = new_org_id WHERE user_id = prof.user_id;
    UPDATE email_messages     SET organization_id = new_org_id WHERE user_id = prof.user_id;
    UPDATE interviews         SET organization_id = new_org_id WHERE user_id = prof.user_id;
  END LOOP;
END $$;

-- Now enforce NOT NULL where every row has been backfilled.
ALTER TABLE profiles            ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE candidates          ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE jobs                ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE match_assessments   ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE daily_usage         ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE email_messages      ALTER COLUMN organization_id SET NOT NULL;
-- interviews may have orphan rows from deleted users (FK left at NULL after
-- those users were deleted) — keep nullable for that table.

------------------------------------------------------------------------
-- 5. org_invites
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_invites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           text NOT NULL,
  token           uuid NOT NULL DEFAULT gen_random_uuid(),
  role            text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  invited_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

CREATE INDEX IF NOT EXISTS org_invites_token_idx ON org_invites (token);
CREATE INDEX IF NOT EXISTS org_invites_email_idx ON org_invites (email);

------------------------------------------------------------------------
-- 6. Helper : current_org_id() — SECURITY DEFINER so RLS policies can
--    read the caller's org without an infinite recursion on profiles.
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM profiles WHERE user_id = auth.uid() LIMIT 1
$$;

------------------------------------------------------------------------
-- 7. RLS — drop old user-scoped policies, install org-scoped ones.
------------------------------------------------------------------------

-- profiles : a user sees their own profile + every member of their org
DROP POLICY IF EXISTS profiles_own ON profiles;

CREATE POLICY profiles_self_or_org_member
  ON profiles
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR organization_id = current_org_id()
  );

CREATE POLICY profiles_self_write
  ON profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY profiles_self_insert
  ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY profiles_self_delete
  ON profiles
  FOR DELETE
  USING (auth.uid() = user_id);

-- organizations : everyone in the org reads it ; only the owner writes it
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY organizations_member_read
  ON organizations
  FOR SELECT
  USING (id = current_org_id());

CREATE POLICY organizations_owner_write
  ON organizations
  FOR UPDATE
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- No INSERT policy on organizations from the client: orgs are created
-- by the server (signup trigger or admin client) only.

-- org_invites : viewable + writable by any member of the org
ALTER TABLE org_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_invites_member_all
  ON org_invites
  FOR ALL
  USING (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());

-- candidates / jobs / match_assessments / daily_usage / email_messages :
-- replace user-scoped policy by org membership.

DROP POLICY IF EXISTS candidates_owner_all ON candidates;
CREATE POLICY candidates_org_all
  ON candidates
  FOR ALL
  USING (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());

DROP POLICY IF EXISTS jobs_owner_all ON jobs;
CREATE POLICY jobs_org_all
  ON jobs
  FOR ALL
  USING (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());

DROP POLICY IF EXISTS match_owner_all ON match_assessments;
CREATE POLICY match_org_all
  ON match_assessments
  FOR ALL
  USING (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());

DROP POLICY IF EXISTS daily_usage_owner_all ON daily_usage;
CREATE POLICY daily_usage_org_all
  ON daily_usage
  FOR ALL
  USING (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());

DROP POLICY IF EXISTS email_messages_owner_all ON email_messages;
CREATE POLICY email_messages_org_all
  ON email_messages
  FOR ALL
  USING (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());

-- interviews keeps its 3 split policies, just add org membership as the
-- fallback (a member can see / edit any interview of their org).
DROP POLICY IF EXISTS "Users can view own interviews"   ON interviews;
DROP POLICY IF EXISTS "Users can update own interviews" ON interviews;
DROP POLICY IF EXISTS "Users can delete own interviews" ON interviews;

CREATE POLICY interviews_org_select
  ON interviews FOR SELECT
  USING (organization_id IS NOT NULL AND organization_id = current_org_id());

CREATE POLICY interviews_org_update
  ON interviews FOR UPDATE
  USING (organization_id IS NOT NULL AND organization_id = current_org_id())
  WITH CHECK (organization_id IS NOT NULL AND organization_id = current_org_id());

CREATE POLICY interviews_org_delete
  ON interviews FOR DELETE
  USING (organization_id IS NOT NULL AND organization_id = current_org_id());

CREATE POLICY interviews_org_insert
  ON interviews FOR INSERT
  WITH CHECK (organization_id IS NOT NULL AND organization_id = current_org_id());

------------------------------------------------------------------------
-- 8. Trigger : keep organizations.updated_at fresh
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION organizations_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS organizations_updated_at ON organizations;
CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION organizations_touch_updated_at();

COMMIT;
