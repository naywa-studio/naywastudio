-- 075 — Filigrane des retours client déjà absorbés par un ajustement Nora.
--
-- Nora ne re-propose un réajustement que sur des retours dont le
-- `client_feedback_at` est POSTÉRIEUR à ce filigrane. Sans ça, elle reproposait
-- en boucle les mêmes retours et finissait par sur-contraindre le matching.
-- Les ajustements de type "general" (consigne libre) n'y touchent pas.
--
-- NOTE : appliquée en base via MCP le 2026-08-05, commitée a posteriori.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS feedback_consumed_until timestamptz;

COMMENT ON COLUMN public.jobs.feedback_consumed_until IS
  'Filigrane retours client absorbés (lot 3c). Nora ne propose un réajustement feedback que sur des retours plus récents.';
