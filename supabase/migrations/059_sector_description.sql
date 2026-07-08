-- 059 — Définition d'un secteur (backbone de fiabilité du classement).
--
-- Quand le sourceur crée un secteur, Nora en écrit une définition courte
-- ("Regroupe les profils qui…") que l'user valide. Cette définition est
-- réinjectée dans le classement automatique (lib/sector-classify) pour que
-- Nora range CONTRE les définitions du cabinet, pas au feeling → classement
-- cohérent dans le temps.

alter table public.sectors
  add column if not exists description text;

comment on column public.sectors.description is
  'Définition courte du secteur (validée par le sourceur), réinjectée dans le classement Nora.';
