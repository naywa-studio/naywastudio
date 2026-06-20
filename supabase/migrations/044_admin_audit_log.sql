-- 044_admin_audit_log.sql
--
-- Journal d'audit pour toute action admin sur des données
-- d'utilisateurs/d'organisations. Objectif :
--   1. Conformité RGPD : preuve écrite que les consultations admin
--      sont tracées, requise par le DPA (article "rôle admin").
--   2. Sécurité juridique pour Naywa : en cas de litige avec un
--      client, on peut retrouver qui a consulté quoi quand.
--   3. Garde-fou pour l'admin lui-même : sait que chaque action
--      est tracée, ce qui dissuade les consultations inutiles.
--
-- Pas de RLS user-facing — la table n'est lue que par les admins
-- depuis /admin/audit (à ajouter en V2 si besoin). Les admins ne
-- peuvent pas supprimer une ligne (lecture seule via UI).
--
-- Note : audit_log volumineux à terme. On garde un index sur
-- created_at pour pouvoir purger les > 1 an (cron à ajouter plus
-- tard si besoin).

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Action métier en snake_case lisible :
  --   - 'search_users'             : recherche email/nom
  --   - 'view_organization'        : ouverture d'une fiche org
  --   - 'view_user'                : ouverture d'une fiche user
  --   - 'list_branding_requests'   : liste des demandes de modification
  --   - 'approve_branding_request' : validation
  --   - 'reject_branding_request'  : refus
  --   - 'publish_update'           : publication d'une nouveauté
  --   - 'delete_update'            : suppression d'une nouveauté
  action          TEXT NOT NULL,
  -- target_type est NULL pour les actions globales (search).
  target_type     TEXT,           -- 'user' | 'organization' | 'app_update' | 'branding_request'
  target_id       UUID,           -- id de la ressource ciblée
  -- metadata libre, jsonb (ex: query saisie, ancien/nouveau, etc.)
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
  ON public.admin_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin
  ON public.admin_audit_log (admin_user_id, created_at DESC);

-- RLS : on enable mais aucune policy autorisée pour les users
-- standards. Les lectures admin se font via getAdminSupabase().
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.admin_audit_log IS
  'Journal d''audit des actions admin Naywa. Écrit par les routes /api/admin/* via getAdminSupabase(). Lu uniquement par les admins.';
