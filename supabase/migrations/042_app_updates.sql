-- 042_app_updates.sql
--
-- Système de "Nouveautés" : table app_updates pour publier les
-- changelogs produit lisibles par tous les utilisateurs connectés.
--
-- Le contenu (body) est du markdown brut. Pas d'images V1 pour
-- éviter le bordel de hébergement / autorisation. Rendu côté UI
-- via un parser markdown simple (gras, italique, listes, liens).
--
-- Catégorie sert au pastillage couleur dans l'UI :
--   - 'feature'  : nouvelle fonctionnalité (vert)
--   - 'fix'      : correctif (bleu)
--   - 'important': info importante / breaking (orange)
--   - 'announce' : annonce générale (violet)
--
-- RLS : lisible par tout user authentifié si published_at <= now().
-- L'écriture est réservée aux admins (vérifié côté API via
-- requireAdmin()), pas besoin d'une policy DB côté écriture car
-- la route bypass RLS avec le client admin.

CREATE TABLE IF NOT EXISTS public.app_updates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'feature'
    CHECK (category IN ('feature', 'fix', 'important', 'announce')),
  -- published_at NULL = brouillon, non visible des users.
  -- published_at <= now() = visible.
  -- published_at > now() = planifié, deviendra visible automatiquement.
  published_at    TIMESTAMPTZ,
  author_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_updates_published_at
  ON public.app_updates (published_at DESC)
  WHERE published_at IS NOT NULL;

-- updated_at auto-touch via trigger
CREATE OR REPLACE FUNCTION public.touch_app_updates_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_updates_updated_at ON public.app_updates;
CREATE TRIGGER trg_app_updates_updated_at
BEFORE UPDATE ON public.app_updates
FOR EACH ROW
EXECUTE FUNCTION public.touch_app_updates_updated_at();

-- RLS
ALTER TABLE public.app_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read published updates" ON public.app_updates;
CREATE POLICY "Authenticated can read published updates"
ON public.app_updates
FOR SELECT
TO authenticated
USING (
  published_at IS NOT NULL
  AND published_at <= now()
);

-- Pas de policy INSERT/UPDATE/DELETE : seules les routes admin
-- (qui utilisent getAdminSupabase()) peuvent écrire.

COMMENT ON TABLE public.app_updates IS
  'Changelogs / annonces produit lisibles dans /nouveautes par tout user authentifié.';
