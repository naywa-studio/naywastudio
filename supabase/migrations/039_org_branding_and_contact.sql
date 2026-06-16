-- Migration 039 — Branding cabinet + carte de contact
--
-- Ajoute 3 colonnes à `organizations` pour personnaliser le rendu du
-- PDF anonymisé candidat avec l'identité visuelle du cabinet :
--
--   brand_color   : couleur primaire du cabinet (hex), pour styler le
--                   header/footer du PDF. Défaut = violet Naywa
--                   (#7C63C8) pour rester cohérent si l'owner ne
--                   personnalise pas.
--   brand_slogan  : phrase courte affichée sous le nom du cabinet sur
--                   le PDF (optionnel).
--   contact_email : adresse mail générique du cabinet, imprimée en
--                   pied de page du PDF pour que le client final
--                   puisse recontacter au sujet du candidat. Owner-only
--                   modif via /organisation. Pas de validation regex
--                   serveur (la UI fait du <input type="email">), on
--                   reste laxiste pour pas bloquer les workflows
--                   atypiques (boîte aux lettres avec + etc.).
--
-- Les 3 colonnes sont nullables : un cabinet existant continue de
-- fonctionner sans rien renseigner, on tombera sur les défauts violet
-- Naywa + pas de slogan + pas de mail contact côté PDF.
--
-- Aucun impact RLS : ces colonnes sont déjà couvertes par les policies
-- existantes sur `organizations` (current_org_id()).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS brand_color   TEXT,
  ADD COLUMN IF NOT EXISTS brand_slogan  TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT;

COMMENT ON COLUMN public.organizations.brand_color
  IS 'Couleur primaire hex (#RRGGBB) pour le PDF anonymisé. Défaut applicatif = #7C63C8.';
COMMENT ON COLUMN public.organizations.brand_slogan
  IS 'Slogan optionnel affiché sous le nom du cabinet sur le PDF anonymisé.';
COMMENT ON COLUMN public.organizations.contact_email
  IS 'Mail générique du cabinet, imprimé en pied de page du PDF anonymisé pour permettre au client final de recontacter.';
