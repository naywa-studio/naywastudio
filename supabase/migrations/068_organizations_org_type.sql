-- 068 — Type d'organisation (fondation du segment cabinet/ESN)
--
-- Introduit `organizations.org_type` : distingue les structures qui
-- travaillent POUR des clients (cabinets de recrutement en placement,
-- ESN/bureaux d'étude/conseil en régie) des équipes de recrutement
-- INTERNES (qui recrutent pour leur propre entreprise).
--
-- Ce type pilote l'affichage des fonctionnalités « côté client » :
--   * cabinet_recrutement / esn_conseil  → annuaire clients + pricing
--   * equipe_interne                     → ni clients ni pricing (ne facture
--                                          personne)
--
-- Additif + nullable : sans impact tant que le code ne le lit pas. Les orgs
-- existantes sont backfillées en `cabinet_recrutement` (le plus permissif :
-- rien ne se masque pour un compte déjà en service). Le choix explicite se
-- fait désormais à l'onboarding.

alter table public.organizations
  add column if not exists org_type text;

-- Garde-fou : seules les 3 valeurs connues sont acceptées (NULL toléré pour
-- les orgs pré-migration non encore backfillées / cas pathologiques).
alter table public.organizations
  drop constraint if exists organizations_org_type_check;
alter table public.organizations
  add constraint organizations_org_type_check
  check (org_type is null or org_type in ('cabinet_recrutement', 'esn_conseil', 'equipe_interne'));

-- Backfill des orgs existantes : valeur permissive pour ne rien casser côté
-- comptes déjà onboardés (ils continuent de voir pricing + à terme clients).
update public.organizations
  set org_type = 'cabinet_recrutement'
  where org_type is null;

comment on column public.organizations.org_type is
  'Type de structure choisi à l''onboarding : cabinet_recrutement (placement) | esn_conseil (régie) | equipe_interne (recrute pour soi). Pilote l''affichage clients + pricing.';
