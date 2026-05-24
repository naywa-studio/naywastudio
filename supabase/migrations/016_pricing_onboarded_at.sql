-- Sprint Pricing — track when the cabinet has finished the onboarding wizard.
--
-- We can't rely on pricing_billable_days_per_month being NULL because
-- migration 012 gave it a DEFAULT 18, so every new profile already has
-- a value. The wizard was never shown for any user.
--
-- A dedicated nullable timestamp is the cleanest signal: NULL ⇒ wizard
-- not done; not-NULL ⇒ done.

alter table public.profiles
  add column if not exists pricing_onboarded_at timestamp with time zone;

comment on column public.profiles.pricing_onboarded_at is
  'When the cabinet finished the pricing onboarding wizard. NULL = wizard not done yet, show it on next /workspace/pricing visit.';
