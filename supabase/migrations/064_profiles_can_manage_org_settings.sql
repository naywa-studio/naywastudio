-- 062 — Délégation de la configuration d'organisation à un membre.
--
-- Contexte : le DG de GMH est owner mais n'utilise pas l'outil ; il veut que
-- sa sourceuse gère le branding et la politique de pricing sans pour autant
-- lui ouvrir la facturation, les sièges, le transfert de propriété ou la
-- suppression de l'organisation.
--
-- Pourquoi un DRAPEAU par membre plutôt qu'un droit accordé à tous les
-- members : dans une équipe de plusieurs sourceurs, la marge minimum ne doit
-- pas être modifiable par n'importe qui. L'owner délègue NOMMÉMENT.
--
-- Le drapeau ne donne accès qu'à DEUX sections : Branding et Politique
-- pricing. Tout le reste de /organisation reste strictement owner-only.

alter table public.profiles
  add column if not exists can_manage_org_settings boolean not null default false;

comment on column public.profiles.can_manage_org_settings is
  'Membre autorisé par l''owner à modifier le branding et la politique de pricing de son organisation. Ne donne AUCUN droit sur la facturation, les sièges, le transfert de propriété ou la suppression.';

-- Un owner a toujours ces droits par son rôle : le drapeau ne le concerne
-- pas et resterait trompeur s'il valait false sur sa ligne.
update public.profiles set can_manage_org_settings = true where role = 'owner';
