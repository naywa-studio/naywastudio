-- 072 — Marqueur « présenté au client » par (candidat × mission), lot 3
--
-- Signal métier retenu (sans friction) : ANONYMISER un CV = le préparer pour
-- le client. On stampe donc `match_assessments.anonymized_at` au moment de
-- l'anonymisation, dans le contexte de la mission (batch shortlist + fiche
-- match, qui passent tous deux le job_id). La Revue client s'appuie dessus
-- pour sa section « Anonymisés » (= présentés / à présenter).
--
-- NB : `candidates.anonymized_at` existe déjà mais est GLOBAL (candidat) ; il
-- ne dit pas POUR QUELLE mission. D'où ce marqueur par match.
--
-- Additif + nullable : aucun impact tant que non renseigné.

ALTER TABLE match_assessments
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;
