-- Migration 038 — Stamp par-user de la visite guidée Package Sourcing
--
-- Avant : organizations.package_sourcing_onboarded_at (migration 037)
-- déclenchait/cachait la visite guidée pour TOUS les profiles de l'org
-- en une seule valeur. Conséquence : si l'owner termine la visite, les
-- membres invités plus tard ne la voient jamais. Et inversement.
--
-- Désormais on persiste le stamp PAR-PROFILE. Chaque user — owner ou
-- member — voit la visite à son premier accès au workspace, jusqu'à
-- ce qu'il la termine ou la skippe explicitement. Le flag org reste
-- en place (cleanup ultérieur si plus utilisé).

BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS package_sourcing_onboarded_at timestamptz;

COMMENT ON COLUMN profiles.package_sourcing_onboarded_at IS
  'Set quand cet utilisateur (owner ou member) a complété ou skippé la visite guidée Package Sourcing sur /workspace. NULL = la modale s''ouvre à son prochain accès.';

COMMIT;
