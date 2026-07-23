-- 065 — Éclatement du drapeau de délégation en capacités granulaires.
--
-- Contexte : la migration 062 a introduit `can_manage_org_settings`, un drapeau
-- unique bundlé (branding + pricing). On le remplace par des capacités
-- accordables INDÉPENDAMMENT, pour que l'owner délègue à la carte :
--   - can_manage_branding : identité & image (logo, couleurs, slogan, contact)
--   - can_manage_pricing  : politique commerciale (marges, jours, défauts TJM)
--   - can_manage_team     : gestion d'équipe (structure prête, non exposée V1)
--
-- Ces caps ne concernent QUE les membres : un owner tient tous les droits de
-- son rôle (résolu dans lib/capabilities.ts → getCapabilities), on ne pose donc
-- AUCUNE de ces colonnes à true pour les owners. La facturation, les sièges
-- payés, le transfert de propriété, la suppression et l'OCTROI de caps restent
-- strictement owner — non représentés par une colonne (dérivés du rôle).

alter table public.profiles
  add column if not exists can_manage_branding boolean not null default false,
  add column if not exists can_manage_pricing  boolean not null default false,
  add column if not exists can_manage_team     boolean not null default false;

-- Report des délégations existantes (membres non-owner qui portaient le drapeau
-- bundlé) vers les deux caps correspondantes. Les owners avaient aussi
-- can_manage_org_settings=true (posé par la 062) mais n'en ont pas besoin — on
-- ne les touche pas, getCapabilities leur accorde tout via le rôle.
update public.profiles
  set can_manage_branding = true,
      can_manage_pricing = true
  where can_manage_org_settings = true
    and role <> 'owner';

-- On retire l'ancien drapeau : la source de vérité devient les 3 caps + le rôle.
-- Garder les deux mènerait à des états divergents (un owner retire une cap via
-- la nouvelle UI, mais l'ancien drapeau bundlé la rouvrirait silencieusement).
alter table public.profiles
  drop column if exists can_manage_org_settings;

comment on column public.profiles.can_manage_branding is
  'Membre habilité par l''owner à gérer l''identité & le branding. N''ouvre ni facturation, ni sièges, ni transfert, ni suppression.';
comment on column public.profiles.can_manage_pricing is
  'Membre habilité par l''owner à gérer la politique commerciale (pricing).';
comment on column public.profiles.can_manage_team is
  'Membre habilité à gérer l''équipe (inviter, attribuer un siège payé, retirer). Réservé pour usage futur (non exposé en V1).';
