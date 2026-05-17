-- Job-level briefing notes — free-form constraints from the client
-- (budget, démarrage souhaité, deal-breakers, contexte stakeholder, etc).
-- Surfaced in the job UI AND injected into the matching + compose LLM
-- prompts so Nora respects the client's actual requirements.

alter table public.jobs
  add column if not exists briefing text;
