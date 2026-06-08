-- Migration 032 — Période d'essai renouvelée (variable mission)
--
-- Article 3.4 Syntec : le renouvellement de la période d'essai N'EST PAS
-- automatique, il exige un accord écrit du salarié et de l'employeur. Le
-- moteur Syntec prenait jusqu'ici systématiquement le total_max (initiale
-- + renouvellement), ce qui sous-estimait le risque de rupture précoce
-- dans le chart "Risque rupture".
--
-- On ajoute un flag par mission. Défaut false (= durée initiale seule).
-- Le sourceur le passe à true s'il sait que le contrat prévoit le
-- renouvellement, pour simuler le scénario "le client a négocié".

BEGIN;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS essai_renouvele boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN jobs.essai_renouvele IS
  'True si le contrat de mission prévoit explicitement le renouvellement de la période d''essai (accord écrit). False par défaut : seule la durée initiale est appliquée. Impacte computeRuptureRiskProfile / computeRuptureScenarios.';

COMMIT;
