-- Migration 037 — Stamp de l'onboarding "Package Sourcing"
--
-- Marqueur posé quand l'owner a terminé la visite guidée 6 étapes
-- (présentation du produit) déclenchée après son premier abonnement
-- réussi.
--
-- Différent du `cabinet_onboarded_at` (migration 031) :
--   cabinet_onboarded_at      = flow initial (nom de l'org + invites)
--                               à la création du cabinet
--   package_sourcing_onboarded_at = présentation du produit après
--                               souscription, optionnelle (dismissable
--                               avec bannière reminder)

BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS package_sourcing_onboarded_at timestamptz;

COMMENT ON COLUMN organizations.package_sourcing_onboarded_at IS
  'Set quand l''owner a terminé (ou explicitement skippé) la visite guidée Package Sourcing post-souscription. NULL = la bannière reminder s''affiche sur /organisation.';

COMMIT;
