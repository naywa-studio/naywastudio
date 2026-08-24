-- 092 — Un drapeau d'avant-première PROPRE, au lieu d'emprunter `is_test`.
--
-- ── Ce que ça corrige ────────────────────────────────────────────────────
--
-- Le garde-fou de lancement du Mailing s'ouvrait aux organisations marquées
-- `is_test`, au motif qu'elles « ne désignent jamais un vrai client ».
-- Vérification faite en base : **GMH est marqué `is_test`**, dans ses deux
-- organisations, sans aucun admin. Le premier client payant aurait donc vu
-- l'offre de l'option Mailing en production — celle dont le prix n'existe pas
-- encore dans le catalogue LIVE, donc celle qui échoue au clic.
--
-- `is_test` a été créé pour EXCLURE des organisations des KPIs admin. S'en
-- servir comme droit d'accès, c'est faire dépendre une visibilité produit d'un
-- drapeau posé pour une raison sans rapport — et personne ne pense à relire
-- l'un quand il change l'autre.
--
-- D'où un drapeau qui ne dit qu'une chose, et qui ne s'active qu'exprès.

alter table public.organizations
  add column if not exists mailing_early_access boolean not null default false;

comment on column public.organizations.mailing_early_access is
  'Avant-première Mailing : voit la fonctionnalité avant l''ouverture générale. À poser à la main, jamais dérivé.';
