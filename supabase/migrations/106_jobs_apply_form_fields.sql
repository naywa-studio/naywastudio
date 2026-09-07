-- 106 — Formulaire public personnalisable par mission
--
-- Le formulaire public (/apply/[token]) n'avait que 4 champs fixes
-- obligatoires (prénom, nom, email, CV). Demande client : pouvoir AJOUTER,
-- par mission, des champs connus (téléphone, ville, LinkedIn, prétention
-- salariale, années d'expérience, message) — et dès qu'un champ est ajouté,
-- il devient OBLIGATOIRE pour le candidat (pas de champ "ajouté mais
-- optionnel" : si le recruteur le demande, il le veut vraiment).
--
-- Simple text[] plutôt qu'une table dédiée : c'est une LISTE DE CLÉS parmi un
-- catalogue fermé (défini en code, lib/apply-form-fields.ts), pas des données
-- métier — un tableau suffit, une table serait de la sur-ingénierie pour 6
-- valeurs possibles. Le catalogue lui-même n'est pas en base : l'ajout d'un
-- futur champ (ex. portfolio) est un changement de code, pas une migration.

begin;

alter table public.jobs
  add column if not exists apply_form_fields text[] not null default '{}';

comment on column public.jobs.apply_form_fields is
  'Clés du catalogue lib/apply-form-fields.ts activées pour /apply/[token] de cette mission. Vide = seuls les 4 champs de base (prénom/nom/email/CV). Chaque clé activée devient un champ OBLIGATOIRE du formulaire public.';

commit;
