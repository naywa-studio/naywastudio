-- Migration 054 — Critères flexibles par mission (PR-Z).
--
-- Refonte du scoring matching : au lieu de 4 dimensions hardcodées
-- (skills_match, seniority_fit, experience_fit, domain_fit), chaque
-- mission a sa propre liste de critères choisis par Nora + validés par
-- le sourceur. Cf. src/lib/job-criteria-catalog.ts pour les 25 types.
--
-- jobs.criteria : array de Criterion JSONB
--   [{ id, type, label, weight: "main"|"bonus", params: {...}, source: "llm"|"manual" }]
--   id     = uuid stable pour identifier le critère entre runs (re-scoring)
--   type   = clé du catalogue (skills | language | license | ...)
--   label  = libellé human-readable affiché à l'UI
--   weight = "main" (compte dans le score global) | "bonus" (informatif)
--   params = paramètres spécifiques au type (ex: { code: "DE", level_min: "B2" })
--   source = "llm" (proposé par Nora) | "manual" (ajouté par le sourceur)
--
-- jobs.criteria_locked_at : timestamp de validation par le sourceur.
--   NULL = onboarding pas fait, UI affiche le wizard
--   timestamp = configurée, UI affiche les cartes candidats
--
-- match_assessments.criteria_eval : array d'évaluations par critère.
--   [{ id, score?: 0-100, status?: "yes"|"no"|"unknown", evidence?: string }]
--   id       = matche jobs.criteria[].id
--   score    = pour les critères quantitatifs (0-100)
--   status   = pour les critères qualitatifs
--   evidence = citation du CV / inférence (pour les qualitatifs)

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS criteria jsonb,
  ADD COLUMN IF NOT EXISTS criteria_locked_at timestamptz;

ALTER TABLE public.match_assessments
  ADD COLUMN IF NOT EXISTS criteria_eval jsonb;

-- Pas de backfill : les missions existantes garderont criteria_locked_at NULL
-- → l'UI les force à passer par l'onboarding au prochain accès. Le sourceur
-- peut valider les critères proposés par Nora et relancer le matching. Les
-- anciens score_dimensions restent visibles le temps de la transition mais
-- n'alimentent plus l'UI principale.

COMMENT ON COLUMN public.jobs.criteria IS
  'Liste de critères choisis par Nora + validés par le sourceur. Schema : [{ id, type, label, weight: "main"|"bonus", params, source: "llm"|"manual" }]. Cf. src/lib/job-criteria-catalog.ts.';
COMMENT ON COLUMN public.jobs.criteria_locked_at IS
  'Timestamp de validation des critères par le sourceur. NULL = onboarding non fait.';
COMMENT ON COLUMN public.match_assessments.criteria_eval IS
  'Évaluation par critère pour ce (candidat × mission). [{ id, score?: 0-100, status?: "yes"|"no"|"unknown", evidence? }].';
