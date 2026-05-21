-- Sprint Pricing — extend `profiles` with the cabinet's pricing defaults.
--
-- Every chiffrage on the fiche match starts from these values; the sourceur
-- can override them per-mission, but most of the time they'll just accept the
-- pre-filled values that match how their cabinet usually does business.
--
-- All fields are optional with sane defaults: the calculator works out of
-- the box without forcing the sourceur to visit the paramétrage page first.

alter table public.profiles
  add column if not exists pricing_billable_days_per_month numeric(4,1) default 18,
  add column if not exists pricing_margin_min_pct numeric(5,2) default 15,
  add column if not exists pricing_margin_target_pct numeric(5,2) default 22,
  add column if not exists pricing_charges_rate_override numeric(5,4),
  add column if not exists pricing_default_lieu text default 'paris_petite_couronne',
  add column if not exists pricing_default_modalite text default 'modalite_1',
  add column if not exists pricing_default_avantages jsonb;

-- Sanity bounds so the UI can't end up with degenerate values that crash
-- the cost computation.
alter table public.profiles
  add constraint profiles_pricing_days_chk
    check (pricing_billable_days_per_month between 10 and 22);

alter table public.profiles
  add constraint profiles_pricing_margin_min_chk
    check (pricing_margin_min_pct is null or pricing_margin_min_pct between 0 and 100);

alter table public.profiles
  add constraint profiles_pricing_margin_target_chk
    check (pricing_margin_target_pct is null or pricing_margin_target_pct between 0 and 100);

alter table public.profiles
  add constraint profiles_pricing_charges_chk
    check (pricing_charges_rate_override is null
           or pricing_charges_rate_override between 0 and 1);

alter table public.profiles
  add constraint profiles_pricing_lieu_chk
    check (pricing_default_lieu in (
      'paris_petite_couronne', 'idf_grande_couronne', 'lyon', 'province'
    ));

alter table public.profiles
  add constraint profiles_pricing_modalite_chk
    check (pricing_default_modalite in (
      'modalite_1', 'modalite_2', 'modalite_3'
    ));

comment on column public.profiles.pricing_billable_days_per_month is
  'Jours facturables par mois (par défaut 18). Slider 10-22 dans le paramétrage.';
comment on column public.profiles.pricing_margin_min_pct is
  'Marge minimum acceptable par défaut (% de la facturation HT).';
comment on column public.profiles.pricing_margin_target_pct is
  'Marge cible standard du cabinet (% de la facturation HT).';
comment on column public.profiles.pricing_charges_rate_override is
  'Override du taux de charges patronales effectif (0.00-1.00). NULL = utilise le taux calculé par lieu.';
comment on column public.profiles.pricing_default_avantages is
  'Avantages pré-cochés par défaut sur chaque chiffrage. Structure: { ticketsResto, mutuellePremium, transport, forfaitMobilite, treiziemeMois, primeCooptationAnnuelle, autresMensuels }.';
