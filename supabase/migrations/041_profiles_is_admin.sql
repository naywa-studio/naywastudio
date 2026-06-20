-- 041_profiles_is_admin.sql
--
-- Introduit le rôle administrateur Naywa. L'admin n'est pas un rôle
-- d'organisation (owner/member) mais une élévation de privilège
-- transverse, accordée manuellement aux comptes Naywa pour :
--   - accéder à la console /admin (KPIs, recherche support, CRUD
--     nouveautés, validation des demandes de modification branding)
--   - bypasser les gates de paiement/essai/siège : un admin n'a pas à
--     activer un trial ni à payer pour utiliser le workspace
--
-- Source de vérité : profiles.is_admin (booléen, defaultu false).
-- L'élévation se fait via UPDATE direct en SQL (cf. fin de fichier).
--
-- RLS : la colonne est lisible par le propriétaire du profile, et par
-- les policies existantes scoped par organization_id. Pas de policy
-- spécifique nécessaire — on lit toujours is_admin pour son propre
-- user.id côté server avec un client admin (bypass RLS) quand on a
-- besoin de vérifier le statut admin du caller.
--
-- Non-destructive, idempotente (IF NOT EXISTS).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Index partial pour les requêtes "tous les admins" (rare mais utile
-- pour les pages d'audit). Très petit en pratique (1-3 lignes).
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin
  ON public.profiles (user_id)
  WHERE is_admin = true;

-- Élévation initiale : les deux comptes Naywa autorisés.
-- On joint sur auth.users pour résoudre l'email -> user_id sans
-- exposer le couplage côté code applicatif.
UPDATE public.profiles p
SET is_admin = true
FROM auth.users u
WHERE p.user_id = u.id
  AND lower(u.email) IN (
    'elyas.malki@naywastudio.com',
    'elyas.malki@icloud.com'
  );

-- Note : si un de ces comptes n'existe pas encore en DB au moment où
-- la migration tourne, le UPDATE ne fait rien pour cet email. Au
-- prochain login le profile sera créé via le trigger handle_new_auth_user
-- avec is_admin = false par défaut ; il faudra alors re-stamp à la main
-- via un UPDATE ciblé depuis le SQL Editor Supabase.

COMMENT ON COLUMN public.profiles.is_admin IS
  'Rôle administrateur Naywa transverse aux organisations. Donne accès à /admin et bypass les gates de paiement/siège. Élevé manuellement en SQL.';
