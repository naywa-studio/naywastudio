-- Critères NÉGATIFS « à proscrire » (Partie B, Option A minimale).
-- Liste libre de points rédhibitoires, injectée dans le prompt de matching
-- pour pénaliser fortement un candidat qui y correspond. Distinct de
-- jobs.criteria (critères positifs). Additif + nullable → aucun impact tant
-- que non renseigné, et un job sans exclusions score exactement comme avant.
alter table public.jobs
  add column if not exists exclusions text[];

comment on column public.jobs.exclusions is
  'Critères à PROSCRIRE (Option A) : liste libre de points rédhibitoires injectés dans le prompt de matching. Distinct des critères positifs (jobs.criteria).';
