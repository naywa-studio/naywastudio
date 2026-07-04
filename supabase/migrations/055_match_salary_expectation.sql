-- 055 — Prétention salariale du candidat par match (universelle)
--
-- Champ saisi par le sourceur sur la fiche match : la prétention salariale
-- (brut annuel €) du candidat POUR cette mission. Universel — indépendant de
-- la Suite Pricing (toutes les équipes de sourcing en ont besoin). Sert de
-- repère + comparaison avec le salaire cible du poste (jobs.target_gross_salary),
-- et pourra être reporté dans le pricing plus tard.
ALTER TABLE public.match_assessments
  ADD COLUMN IF NOT EXISTS salary_expectation_brut integer;

COMMENT ON COLUMN public.match_assessments.salary_expectation_brut
  IS 'Prétention salariale du candidat (brut annuel €) pour cette mission. Saisie sur la fiche match. Universel (hors Suite Pricing).';
