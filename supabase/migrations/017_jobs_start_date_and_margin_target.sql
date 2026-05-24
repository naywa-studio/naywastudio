-- Migration 017 — jobs.start_date + jobs.margin_target_pct
--
-- start_date  : ancre le calendrier du chart d'évolution de marge sur le mois
--               de démarrage réel de la mission (août = 14 j facturables, etc.).
--               NULL = on retombe sur today() à l'affichage.
-- margin_target_pct : override par mission de la marge cible cabinet
--               (profiles.pricing_margin_target_pct). NULL = défaut cabinet.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS start_date DATE NULL,
  ADD COLUMN IF NOT EXISTS margin_target_pct INTEGER NULL;

COMMENT ON COLUMN jobs.start_date IS 'Mission start date — anchors the calendar profile in the margin chart (which month is "month 1"). NULL = falls back to today.';
COMMENT ON COLUMN jobs.margin_target_pct IS 'Per-mission override of the cabinet target margin (profiles.pricing_margin_target_pct). NULL = use cabinet default.';
