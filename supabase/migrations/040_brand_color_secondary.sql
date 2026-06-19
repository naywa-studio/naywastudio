-- Migration 040 — Couleur secondaire optionnelle pour le branding
--
-- Permet à un cabinet de définir une seconde couleur (accent
-- complémentaire) qui sera utilisée dans le PDF anonymisé pour les
-- titres de section / liserés / éléments secondaires, là où la
-- couleur principale est réservée au header + headline.
--
-- Nullable et indépendante : si vide, le PDF utilise UNIQUEMENT la
-- couleur principale (comportement actuel).
--
-- Changement de défaut produit (logique applicative, pas DB) :
--   - Avant : brand_color NULL → PDF stylé en violet Naywa par défaut
--   - Après : brand_color NULL → PDF stylé en NOIR par défaut
--   On force l'utilisateur à choisir sa couleur de marque depuis
--   /organisation, sinon il aura un rendu sobre noir (clairement
--   "non configuré") au lieu d'usurper l'identité Naywa.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS brand_color_secondary TEXT;

COMMENT ON COLUMN public.organizations.brand_color_secondary
  IS 'Couleur secondaire hex (#RRGGBB), optionnelle. Utilisée dans le PDF anonymisé pour les titres de section et accents. NULL = pas de bicolore.';
