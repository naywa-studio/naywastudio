-- Migration 027 — Live persistence of per-match avantages overrides
--
-- The pricing widget already persists pricing_tjm and pricing_brut per
-- match (so the sourceur finds them as they left). We now persist the
-- avantages overrides (tickets resto, transport, 13ᵉ mois, etc.) too —
-- so when they come back to the same candidate × mission, every slider
-- is exactly where it was. No more "save scenario" button: the widget
-- IS the scenario.
--
-- NULL = no override → falls back to organizations.pricing_default_avantages
-- (the cabinet's defaults). When the sourceur clicks "Réinitialiser"
-- in the widget, we wipe back to NULL.

ALTER TABLE match_assessments
  ADD COLUMN IF NOT EXISTS pricing_avantages_override jsonb;

COMMENT ON COLUMN match_assessments.pricing_avantages_override IS
  'Per-match override of the avantages used to compute the margin. NULL = use the cabinet defaults from organizations.pricing_default_avantages.';
