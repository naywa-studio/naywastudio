-- 051 — Backfill llm_period_start sur le modèle "anniversaire abo".
--
-- Avant : tous les llm_period_start étaient ancrés au 1er du mois courant
-- (cf. ancien cron reset-llm-quota), avec un compteur reseté tous les 1ers.
-- Après : llm_period_start = date d'activation de l'abonnement (puis
-- avance par bonds de 30 j à chaque renouvellement).
--
-- Pour les orgs existantes on n'a pas l'historique exact d'activation
-- Stripe, donc on backfille au mieux :
--   - Orgs avec abonnement actif → llm_period_start = current_period_end - 30 j
--     (= début théorique de la fenêtre courante côté Stripe). Si
--     current_period_end est NULL on garde la valeur en place.
--   - Orgs en essai uniquement → llm_period_start = trial_ends_at - 15 j
--     (= activation du trial). Ne change rien à la consommation (pot
--     fixe non-resetable).
--   - Orgs en lockdown ou sans abo → on touche pas, pas de consommation.

BEGIN;

-- Orgs abonnées : ancre = current_period_end - 30 j
UPDATE public.organizations
SET llm_period_start = (current_period_end - interval '30 days')::date::text
WHERE subscription_status IN ('active', 'trialing')
  AND current_period_end IS NOT NULL;

-- Orgs en essai uniquement : ancre = trial_ends_at - 15 j (= activation)
UPDATE public.organizations
SET llm_period_start = (trial_ends_at - interval '15 days')::date::text
WHERE subscription_status IS NULL
  AND trial_ends_at IS NOT NULL
  AND lockdown_started_at IS NULL;

COMMIT;
