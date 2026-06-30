-- Migration 053 — Provenance des matches (PR-Y).
--
-- Ajoute une colonne `source` sur match_assessments pour différencier
-- d'où vient un (candidat × mission) :
--
--   - 'applied'         : candidature spontanée via formulaire public (E2, à venir)
--   - 'uploaded'        : CV déposé directement sur la fiche mission (E1, MissionCvUploadModal)
--   - 'vivier_matched'  : remonté par le matching automatique sur le vivier
--   - 'vivier_assigned' : assignation manuelle par le sourceur depuis le vivier
--
-- L'UI fiche mission affiche un onglet par source (+ "Tous"), et le badge
-- de provenance sur chaque ligne du tableau de matching.
--
-- Backfill :
--   - score IS NULL              → vivier_assigned (toujours créé par /assign)
--   - score IS NOT NULL          → vivier_matched  (la seule autre source historique)
--   Les nouvelles rows depuis cette PR sont taggées explicitement par les
--   routes API.

DO $$ BEGIN
  CREATE TYPE match_source AS ENUM (
    'applied',
    'uploaded',
    'vivier_matched',
    'vivier_assigned'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.match_assessments
  ADD COLUMN IF NOT EXISTS source public.match_source;

-- Backfill historique (avant cette PR il n'y avait que vivier_* comme sources).
UPDATE public.match_assessments
SET source = CASE
  WHEN score IS NULL THEN 'vivier_assigned'::public.match_source
  ELSE 'vivier_matched'::public.match_source
END
WHERE source IS NULL;

ALTER TABLE public.match_assessments
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN source SET DEFAULT 'vivier_matched'::public.match_source;

-- Index utile pour le filtrage par onglet sur la fiche mission.
CREATE INDEX IF NOT EXISTS idx_match_assessments_job_source
  ON public.match_assessments (job_id, source);

COMMENT ON COLUMN public.match_assessments.source IS
  'Provenance du match : applied (formulaire public E2), uploaded (CV déposé sur la mission E1), vivier_matched (matching auto), vivier_assigned (assignation manuelle sourceur).';
