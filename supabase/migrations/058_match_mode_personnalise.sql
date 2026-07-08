-- 058 — Renomme le mode de match "approfondi" → "personnalise".
--
-- Vocabulaire aligné sur l'UX (retour Elyas) : les 3 modes du panneau
-- "Matcher le vivier" sont Intelligent / Personnalisé / Complet.
-- `approfondi` (posé en 056, jamais utilisé en prod) est remplacé.

alter table public.jobs
  drop constraint if exists jobs_last_match_mode_check;

update public.jobs
  set last_match_mode = 'personnalise'
  where last_match_mode = 'approfondi';

alter table public.jobs
  add constraint jobs_last_match_mode_check
  check (last_match_mode is null or last_match_mode in ('intelligent', 'personnalise', 'complet'));
