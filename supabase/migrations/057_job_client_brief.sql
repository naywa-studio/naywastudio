-- 057 — Brief client / appel d'offre sur les missions.
--
-- `jobs.briefing` porte déjà le brief original saisi par le sourceur.
-- On ajoute `client_brief` : le document brut transmis par le client
-- (cahier des charges / appel d'offre), optionnel, conservé tel quel
-- pour référence sur la fiche mission.

alter table public.jobs
  add column if not exists client_brief text;

comment on column public.jobs.client_brief is
  'Brief brut du client (appel d''offre / cahier des charges), optionnel. Distinct de briefing (brief saisi par le sourceur).';
