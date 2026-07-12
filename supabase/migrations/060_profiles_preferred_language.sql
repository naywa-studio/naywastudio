-- 060 — Langue préférée du site, portée par le compte utilisateur.
--
-- Le toggle FR/EN du site marketing vivait uniquement en localStorage
-- (par navigateur). Pour qu'un utilisateur connecté retrouve le même
-- réglage sur n'importe quel appareil, la préférence est maintenant
-- aussi persistée sur profiles.preferred_language. localStorage reste
-- le fallback pour les visiteurs non connectés.

alter table public.profiles
  add column if not exists preferred_language text not null default 'fr';

alter table public.profiles
  add constraint profiles_preferred_language_check
  check (preferred_language in ('fr', 'en'));

comment on column public.profiles.preferred_language is
  'Langue préférée du site (fr/en), choisie via le sélecteur de langue. Fallback localStorage si non connecté.';
