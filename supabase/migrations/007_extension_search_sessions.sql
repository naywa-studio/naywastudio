-- ── Extension search sessions ────────────────────────────────────────────────
-- Stores Google search jobs created by Leo (VPS) and fulfilled by the Chrome extension.
-- Leo deposits queries → extension opens Google tabs → extension posts LinkedIn URLs back.

CREATE TABLE IF NOT EXISTS extension_search_sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id  text,
  queries     jsonb       NOT NULL DEFAULT '[]',
  results     jsonb       NOT NULL DEFAULT '[]',  -- [{ linkedin_url, display_title, snippet }]
  status      text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'collecting', 'ready', 'timeout')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for extension polling (find pending sessions by user)
CREATE INDEX IF NOT EXISTS idx_search_sessions_user_status
  ON extension_search_sessions (user_id, status, created_at DESC);

-- Auto-cleanup: sessions older than 30 minutes become timeouts
-- (handled in application layer, no pg_cron needed)

ALTER TABLE extension_search_sessions ENABLE ROW LEVEL SECURITY;

-- Only service_role accesses this table (Leo via secret, extension via token validated server-side)
-- No client-side RLS policies needed — all access goes through API routes
