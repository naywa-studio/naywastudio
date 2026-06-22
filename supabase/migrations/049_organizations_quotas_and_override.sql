-- Migration 049 — quotas + override custom
--
-- Ajoute les compteurs d'usage et l'override de quota custom sur les
-- organisations. Les quotas eux-mêmes ne sont PAS stockés ici — ils
-- sont dérivés en code (lib/quota-tiers.ts) à partir du plan
-- (subscription_price_lookup) pour rester source unique.
--
-- L'override permet à un admin Naywa d'accorder un quota custom à un
-- client (extras facturés hors-Stripe en V1). NULL = quotas du plan.
--
-- llm_period_start : marqueur du début du mois en cours pour le quota
-- LLM. Le cron mensuel reset llm_actions_this_month et bump
-- llm_period_start le 1er du mois. Si une org a un period_start dans
-- le mois précédent, le check quota le reset à la volée (filet de
-- sécurité au cas où le cron rate un mois).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS llm_actions_this_month INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS llm_period_start DATE NOT NULL DEFAULT date_trunc('month', now())::date,
  ADD COLUMN IF NOT EXISTS quota_override_json JSONB;

COMMENT ON COLUMN public.organizations.storage_used_bytes IS
  'Stockage utilisé en bytes — recalculé chaque nuit par /api/cron/recompute-storage en listant les buckets R2 par org_id.';

COMMENT ON COLUMN public.organizations.llm_actions_this_month IS
  'Actions LLM consommées sur le mois courant. Incrémenté par consumeQuota(), reset par /api/cron/reset-llm-quota le 1er.';

COMMENT ON COLUMN public.organizations.llm_period_start IS
  'Début du mois en cours pour le compteur LLM. Sert de filet de sécurité si le cron de reset rate un mois.';

COMMENT ON COLUMN public.organizations.quota_override_json IS
  'Override custom optionnel — { "storage_gb": 20, "llm_monthly": 30000 }. NULL = quotas dérivés du plan (subscription_price_lookup). Set par admin Naywa via /admin/recherche.';
