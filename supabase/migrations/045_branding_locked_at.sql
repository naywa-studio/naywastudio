-- 045_branding_locked_at.sql
--
-- Verrouillage anti-fraude du branding cabinet : une fois
-- l'onboarding terminé + 24h de grâce écoulées, les champs
-- "identité forte" deviennent read-only en UI :
--   - brand_logo_path
--   - name / brand_name
--   - contact_email (figure sur le PDF anonymisé envoyé au client
--     final → vecteur de détournement potentiel)
--
-- Les champs cosmétiques (brand_color, brand_color_secondary,
-- brand_slogan) restent libres : faible enjeu de fraude, frustrant
-- à verrouiller.
--
-- Workflow : pour modifier après verrouillage, l'owner ouvre une
-- demande dans branding_change_requests (cf. migration 046), qu'un
-- admin Naywa valide ou refuse manuellement.
--
-- branding_locked_at est NULL tant que la grâce n'est pas écoulée.
-- Le verrouillage effectif est calculé côté API/UI :
--   branding_locked_at IS NOT NULL AND branding_locked_at <= now()
--
-- On stamp branding_locked_at = cabinet_onboarded_at + 24h dans la
-- route /api/cabinet/onboarding-done (côté code, pas trigger DB —
-- garde la logique métier visible).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS branding_locked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_organizations_branding_locked
  ON public.organizations (branding_locked_at)
  WHERE branding_locked_at IS NOT NULL;

-- Backfill : les organisations existantes (qui ont déjà fini leur
-- onboarding avant cette migration) deviennent immédiatement
-- verrouillées. Sinon n'importe quel owner pourrait changer son
-- branding sans demande post-déploiement.
UPDATE public.organizations
SET branding_locked_at = cabinet_onboarded_at + INTERVAL '24 hours'
WHERE cabinet_onboarded_at IS NOT NULL
  AND branding_locked_at IS NULL;

COMMENT ON COLUMN public.organizations.branding_locked_at IS
  'Timestamp à partir duquel le logo, le nom et l''email de contact deviennent read-only pour l''owner. Stamp à cabinet_onboarded_at + 24h. Modification après cette date = demande à valider par admin Naywa.';
