-- Sprint Pricing — extend `jobs` to capture the commercial side of a mission.
--
-- Naywa pivots from generic "job postings" to ESN "missions / appels d'offre".
-- A mission carries: a client price range (TJM min/max), a minimum acceptable
-- margin, and an expected duration. These three drive the pricing widget on
-- the fiche match and the margin-evolution chart.
--
-- `location` and `contract_type` already exist on `jobs` — we reuse them for
-- "lieu de mission" and "type de contrat" rather than adding parallel fields.

alter table public.jobs
  add column if not exists client_tjm_min numeric(10,2),
  add column if not exists client_tjm_max numeric(10,2),
  add column if not exists margin_min_pct numeric(5,2),
  add column if not exists duration_months integer;

-- Soft sanity checks. We don't enforce hard bounds because the sourceur may
-- legitimately enter zero or unusually high TJMs during exploration.
alter table public.jobs
  add constraint jobs_tjm_range_chk
    check (
      client_tjm_min is null
      or client_tjm_max is null
      or client_tjm_min <= client_tjm_max
    );

alter table public.jobs
  add constraint jobs_margin_pct_chk
    check (margin_min_pct is null or (margin_min_pct >= 0 and margin_min_pct <= 100));

alter table public.jobs
  add constraint jobs_duration_chk
    check (duration_months is null or (duration_months > 0 and duration_months <= 120));

comment on column public.jobs.client_tjm_min is
  'TJM minimum proposé/négocié par le client (€ HT). NULL si non communiqué.';
comment on column public.jobs.client_tjm_max is
  'TJM maximum proposé/négocié par le client (€ HT). NULL si non communiqué.';
comment on column public.jobs.margin_min_pct is
  'Marge minimum acceptable pour cette mission (% de la facturation HT). NULL = utilise le défaut profil.';
comment on column public.jobs.duration_months is
  'Durée prévue de la mission en mois. NULL = indéterminée.';
