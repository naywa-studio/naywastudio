-- ── Calendly integration: per-client connection + interviews ──────────────────
-- Sprint 7 — booking. A client connects their own Calendly account once; the
-- public booking page embeds their widget, and Calendly webhooks feed the
-- `interviews` table + pipeline.

-- Calendly connection lives on the profile (one client = one Calendly account).
-- Tokens are server-only — never selected by the browser RLS client.
ALTER TABLE public.profiles
  ADD COLUMN calendly_access_token      TEXT,
  ADD COLUMN calendly_refresh_token     TEXT,
  ADD COLUMN calendly_token_expires_at  TIMESTAMPTZ,
  ADD COLUMN calendly_user_uri          TEXT,
  ADD COLUMN calendly_org_uri           TEXT,
  ADD COLUMN calendly_event_type_uri    TEXT,
  ADD COLUMN calendly_scheduling_url    TEXT,
  ADD COLUMN calendly_webhook_uri       TEXT,
  ADD COLUMN calendly_connected_at      TIMESTAMPTZ;

-- Per-match booking token — embedded in the candidate's booking link so the
-- Calendly webhook can resolve which pipeline card a booking belongs to.
ALTER TABLE public.match_assessments
  ADD COLUMN booking_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX match_assessments_booking_token_idx
  ON public.match_assessments (booking_token);

-- ── Interviews ────────────────────────────────────────────────────────────────
-- One row per scheduled Calendly event. Populated by the Calendly webhook.
CREATE TABLE public.interviews (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  candidate_id         UUID REFERENCES public.candidates(id) ON DELETE SET NULL,
  job_id               UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  match_id             UUID REFERENCES public.match_assessments(id) ON DELETE SET NULL,
  calendly_event_uri   TEXT UNIQUE NOT NULL,
  calendly_invitee_uri TEXT,
  status               TEXT NOT NULL DEFAULT 'scheduled'
                         CHECK (status IN ('scheduled', 'canceled')),
  start_time           TIMESTAMPTZ NOT NULL,
  end_time             TIMESTAMPTZ NOT NULL,
  location_type        TEXT,          -- 'physical' | 'google_meet' | 'zoom' | 'microsoft_teams' | 'custom' | ...
  join_url             TEXT,          -- video link, when the location is a meeting
  location_text        TEXT,          -- physical address or free-text location
  invitee_name         TEXT,
  invitee_email        TEXT,
  canceled_at          TIMESTAMPTZ,
  cancel_reason        TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX interviews_user_id_idx    ON public.interviews (user_id);
CREATE INDEX interviews_match_id_idx   ON public.interviews (match_id);
CREATE INDEX interviews_start_time_idx ON public.interviews (start_time);

ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own interviews"
  ON public.interviews FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own interviews"
  ON public.interviews FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own interviews"
  ON public.interviews FOR DELETE
  USING (auth.uid() = user_id);

-- No INSERT policy: interviews are created by the Calendly webhook using the
-- service-role client, which bypasses RLS.

CREATE TRIGGER interviews_updated_at
  BEFORE UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
