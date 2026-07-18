-- 061 — Résiliation programmée : mémoriser cancel_at_period_end.
--
-- Quand un client résilie depuis le portail Stripe, l'abonnement N'EST PAS
-- annulé tout de suite : Stripe garde `status = "active"` jusqu'à la fin de la
-- période payée et pose `cancel_at_period_end = true`. On ne stockait pas ce
-- flag → la base ne distinguait pas « actif » de « actif mais qui se termine »,
-- et la console annonçait un « prochain prélèvement » qui n'aurait jamais lieu.
--
-- Le flag est réécrit à CHAQUE customer.subscription.updated : reprendre son
-- abonnement (« Ne pas annuler » au portail) le repasse à false tout seul.
-- La date de fin est déjà connue via `current_period_end`.
--
-- Défaut false + NOT NULL : les orgs existantes ne sont pas en résiliation.

alter table public.organizations
  add column if not exists subscription_cancel_at_period_end boolean not null default false;

comment on column public.organizations.subscription_cancel_at_period_end is
  'Résiliation programmée à la fin de la période payée (miroir de Stripe subscription.cancel_at_period_end). L''accès reste complet jusqu''à current_period_end, puis le webhook subscription.deleted pose lockdown_started_at et la grâce de 30 j démarre.';
