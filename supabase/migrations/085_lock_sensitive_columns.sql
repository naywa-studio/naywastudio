-- 085 — Verrouille les colonnes sensibles de `profiles` et `organizations`
-- contre un UPDATE fait avec le JWT d'un utilisateur (audit sécurité C1).
--
-- Constat : les policies RLS `profiles_self_write` et
-- `organizations_owner_write` (migration 019) ne filtrent que la LIGNE
-- (`auth.uid() = user_id` / `owner_user_id = auth.uid()`), jamais les
-- colonnes. PostgREST autorise par défaut l'update de n'importe quelle
-- colonne de la table tant qu'aucun trigger ne vient le bloquer — un simple
-- appel `fetch()` avec le JWT de session suffit donc à poser `is_admin=true`
-- sur son propre profil, ou `quota_override_json`/`subscription_status` sur
-- sa propre org. Le scoping "colonnes qu'un self-service peut toucher"
-- n'existait qu'au niveau de l'UI Next.js, jamais en base.
--
-- Fix : un trigger BEFORE UPDATE SECURITY DEFINER qui compare OLD à NEW et
-- lève une exception si l'appelant n'est PAS service_role/une connexion
-- directe (migrations, SQL editor, cron) ET qu'une colonne verrouillée a
-- changé de valeur. Bloque tout le batch (pas un filtrage colonne par
-- colonne) : un update qui touche `first_name` ET `is_admin` en même temps
-- est refusé en entier — plus simple et plus sûr qu'un filtrage partiel.
--
-- Détection service_role : `auth.role()` lit la claim `role` du JWT
-- PostgREST ('authenticated' | 'anon' | 'service_role'). Une connexion
-- directe (migration, Studio SQL editor, `psql`) n'a pas de JWT du tout →
-- `auth.role()` renvoie NULL, traité comme un contexte de confiance au même
-- titre que service_role (sinon cette migration elle-même, ou un futur
-- backfill admin en SQL, se bloquerait). `IS DISTINCT FROM` gère le NULL
-- proprement (`NULL IS DISTINCT FROM 'x'` = true), contrairement à `NOT IN`.
--
-- Écritures légitimes déjà en place, vérifiées avant d'écrire ce trigger :
--   - `profiles.first_name` : mis à jour côté client (RLS) depuis
--     `src/app/login/page.tsx` et `src/app/workspace/layout.tsx` — colonne
--     non verrouillée, continue de passer.
--   - Tout le reste (branding, quotas, abonnement Stripe, sièges, admin...)
--     passe par `getAdminSupabase()` (service_role) dans les routes
--     serveur — jamais concerné par RLS ni par ce trigger.

BEGIN;

CREATE OR REPLACE FUNCTION public.lock_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- service_role (routes admin) et connexions directes (migrations, Studio
  -- SQL editor, cron) ne sont jamais contraints par ce trigger.
  IF auth.role() IS DISTINCT FROM 'authenticated' AND auth.role() IS DISTINCT FROM 'anon' THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'profiles' THEN
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
      OR NEW.has_sourcing_seat IS DISTINCT FROM OLD.has_sourcing_seat
      OR NEW.can_manage_branding IS DISTINCT FROM OLD.can_manage_branding
      OR NEW.can_manage_pricing IS DISTINCT FROM OLD.can_manage_pricing
      OR NEW.can_manage_team IS DISTINCT FROM OLD.can_manage_team
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    THEN
      RAISE EXCEPTION 'lock_sensitive_columns: modification interdite sur une colonne verrouillée de profiles'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'organizations' THEN
    IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
      OR NEW.subscription_seats IS DISTINCT FROM OLD.subscription_seats
      OR NEW.subscription_has_pricing IS DISTINCT FROM OLD.subscription_has_pricing
      OR NEW.subscription_price_lookup IS DISTINCT FROM OLD.subscription_price_lookup
      OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
      OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
      OR NEW.current_period_end IS DISTINCT FROM OLD.current_period_end
      OR NEW.subscription_cancel_at_period_end IS DISTINCT FROM OLD.subscription_cancel_at_period_end
      OR NEW.storage_used_bytes IS DISTINCT FROM OLD.storage_used_bytes
      OR NEW.llm_actions_this_month IS DISTINCT FROM OLD.llm_actions_this_month
      OR NEW.llm_period_start IS DISTINCT FROM OLD.llm_period_start
      OR NEW.quota_override_json IS DISTINCT FROM OLD.quota_override_json
      OR NEW.seats_total IS DISTINCT FROM OLD.seats_total
      OR NEW.pending_deletion_at IS DISTINCT FROM OLD.pending_deletion_at
      OR NEW.lockdown_started_at IS DISTINCT FROM OLD.lockdown_started_at
      OR NEW.branding_locked_at IS DISTINCT FROM OLD.branding_locked_at
      OR NEW.cabinet_onboarded_at IS DISTINCT FROM OLD.cabinet_onboarded_at
      OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
      OR NEW.is_test IS DISTINCT FROM OLD.is_test
    THEN
      RAISE EXCEPTION 'lock_sensitive_columns: modification interdite sur une colonne verrouillée de organizations'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- La fonction ne doit jamais être appelable en RPC direct
-- (`/rest/v1/rpc/lock_sensitive_columns`) — même traitement que
-- `touch_app_updates_updated_at()` en migration 083. Les triggers
-- continuent de fonctionner : ils s'exécutent avec les droits du
-- propriétaire de la fonction, pas de l'appelant.
REVOKE EXECUTE ON FUNCTION public.lock_sensitive_columns() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lock_sensitive_columns() FROM anon;
REVOKE EXECUTE ON FUNCTION public.lock_sensitive_columns() FROM authenticated;

DROP TRIGGER IF EXISTS lock_sensitive_columns_profiles ON public.profiles;
CREATE TRIGGER lock_sensitive_columns_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_sensitive_columns();

DROP TRIGGER IF EXISTS lock_sensitive_columns_organizations ON public.organizations;
CREATE TRIGGER lock_sensitive_columns_organizations
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_sensitive_columns();

COMMIT;
