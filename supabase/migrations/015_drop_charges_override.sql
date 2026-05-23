-- Sprint Pricing — remove the misconceived pricing_charges_rate_override.
--
-- We initially added this field thinking an ESN could "negotiate" their
-- patronal charge rate. In reality, charges sociales are fixed by law per
-- statut (ETAM / Cadre / Assimilé Cadre), with the only variable being
-- the versement mobilité which depends on the work location. The override
-- never made sense and would have led to wrong calculations if used.
--
-- The new calculator reads the rate from a TAUX_CHARGES_BY_LIEU table in
-- syntec.ts indexed by location. No user override.

alter table public.profiles
  drop constraint if exists profiles_pricing_charges_chk;

alter table public.profiles
  drop column if exists pricing_charges_rate_override;
