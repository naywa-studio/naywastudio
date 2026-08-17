-- 074 — Historique des réajustements de critères proposés par Nora (lot 3c).
--
-- Chaque entrée : { at, summary, changes[], source, instruction? }.
-- `source` = "feedback" (retours client sur les écartés) | "general" (consigne
-- libre du sourceur). Affiché sous le brief dans l'onglet Candidats.
--
-- NOTE : cette migration a été appliquée en base via MCP le 2026-08-04 sans
-- être commitée. Elle est écrite ici a posteriori, idempotente, pour que le
-- dépôt puisse recréer la base à l'identique.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS criteria_adjustments jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.jobs.criteria_adjustments IS
  'Historique des réajustements de critères Nora appliqués (lot 3c). Array de { at, summary, changes[], source, instruction? }.';
