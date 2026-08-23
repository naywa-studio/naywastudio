-- 090 — La partie locale de l'adresse d'expédition, choisie par le cabinet.
--
-- Jusqu'ici l'adresse d'envoi reprenait le sous-domaine, ce qui donnait
-- `careers@careers.cabinet-durand.fr` — le mot deux fois. C'est la seule
-- chaîne de tout le chantier que CHAQUE candidat lit, en tête de message.
--
-- NULL = le défaut du code (`DEFAULT_FROM_LOCAL`). On ne pose pas de valeur
-- par défaut en base : le défaut appartient au produit, et le figer ici
-- obligerait une migration pour le changer.
--
-- Aucune conséquence DNS : la partie locale d'une adresse ne s'authentifie
-- pas. Un cabinet peut la changer à tout moment, domaine actif compris, sans
-- rien republier ni revérifier.

alter table public.organizations
  add column if not exists mailing_from_local text;

comment on column public.organizations.mailing_from_local is
  'Partie locale de l''adresse d''expédition candidat (avant le @). NULL = défaut produit.';
