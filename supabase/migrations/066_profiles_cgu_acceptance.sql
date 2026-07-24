-- 066 — Acceptation des CGU par utilisateur (clickwrap).
--
-- On enregistre, par profil, la date d'acceptation et la version acceptée.
-- Écrites côté serveur (client admin) → auditable, non falsifiable par l'user.
-- Colonnes nullable : les comptes existants (ex. GMH) restent NULL et
-- reçoivent une bannière de rappel jusqu'à acceptation. La case obligatoire
-- à la création de compte alimente ces colonnes pour tout nouveau compte.
--
-- Additif et rétrocompatible : aucune ligne existante n'est modifiée, aucune
-- contrainte NOT NULL (on ne veut PAS bloquer l'app pour les comptes en cours).

alter table public.profiles
  add column if not exists cgu_accepted_at timestamptz,
  add column if not exists cgu_version     text;

comment on column public.profiles.cgu_accepted_at is
  'Horodatage d''acceptation des CGU par cet utilisateur (clickwrap). NULL = jamais accepté (rappel affiché).';
comment on column public.profiles.cgu_version is
  'Version des CGU acceptée (cf. CURRENT_CGU_VERSION dans lib/cgu.ts). Si != version courante → ré-acceptation demandée.';
