-- 067 — Réglages d'anonymisation (chantier Shortlist par mission, lot B)
--
-- Deux niveaux de persistance, additifs et nullable (aucun impact tant que
-- rien ne les lit) :
--
--  * organizations.anonymize_defaults — le GABARIT du cabinet, réglé dans
--    /organisation → Branding (gaté accès actif) :
--        { template, watermark (bool), watermarkText }
--    watermarkText vide → le rendu retombe sur le nom de l'org.
--
--  * jobs.anonymize_options — l'override par MISSION, réglé dans la shortlist
--    juste avant génération :
--        { keepNoraSummary (défaut false), customText }
--    NULL → hérite des défauts du cabinet (résumé Nora masqué par défaut).

alter table organizations
  add column if not exists anonymize_defaults jsonb;

alter table jobs
  add column if not exists anonymize_options jsonb;

comment on column organizations.anonymize_defaults is
  'Gabarit CV anonymisé du cabinet : { template, watermark, watermarkText }. NULL = défauts applicatifs.';
comment on column jobs.anonymize_options is
  'Override anonymisation par mission : { keepNoraSummary, customText }. NULL = défauts du cabinet.';
