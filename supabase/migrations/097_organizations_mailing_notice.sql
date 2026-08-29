-- 097 — La mention d'information jointe aux messages candidats.
--
-- ── Pourquoi elle existe ─────────────────────────────────────────────────
--
-- Quand un cabinet écrit à un candidat dont il a obtenu le CV ailleurs
-- (CVthèque, cooptation), le RGPD lui impose d'informer cette personne **au
-- plus tard lors de la première communication** — article 14. Or cette
-- première communication est précisément le message d'approche.
--
-- ── Pourquoi c'est DÉSACTIVABLE ──────────────────────────────────────────
--
-- Parce que l'obligation est celle du CABINET, pas la nôtre. Naywa n'est que
-- sous-traitant : on aide, on n'impose pas. Un cabinet qui a déjà sa propre
-- mention, ou qui préfère sa formulation, doit pouvoir écrire la sienne ou
-- retirer la nôtre — c'est son message et sa responsabilité.
--
-- Activée par défaut, cependant : entre un cabinet qui oublie et un cabinet
-- qui décide de retirer, seul le second a fait un choix.
--
-- `mailing_notice_text` NULL = on utilise le texte par défaut du produit.
-- Le figer en base obligerait une migration pour corriger une virgule.

alter table public.organizations
  add column if not exists mailing_notice_enabled boolean not null default true,
  add column if not exists mailing_notice_text text;

comment on column public.organizations.mailing_notice_enabled is
  'Joindre la mention d''information RGPD aux messages candidats. Obligation du cabinet, pas de Naywa : desactivable.';
comment on column public.organizations.mailing_notice_text is
  'Texte personnalise de la mention. NULL = texte par defaut du produit.';
