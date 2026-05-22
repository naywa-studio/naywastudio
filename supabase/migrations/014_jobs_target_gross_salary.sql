-- Sprint Pricing — capture the client's target gross salary on the mission.
--
-- When the ESN's client communicates a salary budget for the role, the
-- sourceur enters it at mission creation. The pricing widget then has two
-- of the three triangle inputs (TJM + brut) and can derive the resulting
-- marge automatically.

alter table public.jobs
  add column if not exists target_gross_salary numeric(10,2);

alter table public.jobs
  add constraint jobs_target_gross_chk
    check (target_gross_salary is null or target_gross_salary >= 0);

comment on column public.jobs.target_gross_salary is
  'Salaire brut annuel ciblé par le client (€). NULL si non communiqué. Sert de pivot brut au triangle pricing quand il est renseigné.';
