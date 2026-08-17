-- 076 — Proposition d'ajustement Nora GÉNÉRÉE mais PAS ENCORE APPLIQUÉE.
--
-- Persistée pour qu'elle ne disparaisse pas au rechargement de page ni au
-- changement d'onglet. Forme : { source, summary, changes[], criteria[],
-- instruction?, feedbackWatermark? }. Effacée à l'application (PATCH /criteria)
-- ou à l'abandon (POST /feedback-dismiss).
--
-- NOTE : appliquée en base via MCP le 2026-08-05, commitée a posteriori.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS pending_adjustment jsonb;

COMMENT ON COLUMN public.jobs.pending_adjustment IS
  'Proposition Nora en attente (lot 3c). Persistée jusqu''à application/abandon.';
