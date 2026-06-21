-- Migration 048 — app_updates.affected_paths
--
-- Permet à l'admin de tagger une nouveauté avec les zones de l'app
-- qu'elle concerne (ex: '/workspace/vivier', '/organisation'). On
-- utilise ces tags côté UI pour afficher une pastille violette sur
-- les items de menu concernés quand la nouveauté n'a pas encore été
-- lue par l'utilisateur — plus pédagogique qu'une seule pastille
-- globale "Nouveautés".
--
-- Si vide, on retombe sur le comportement actuel (pastille globale
-- uniquement). Le composant CTA :::cta /path::: et ce nouveau tag
-- sont décorrélés : on peut pointer vers /workspace/pricing avec un
-- CTA tout en taggant /workspace/missions pour la pastille.

ALTER TABLE public.app_updates
  ADD COLUMN IF NOT EXISTS affected_paths text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.app_updates.affected_paths IS
  'Liste des paths de l''app concernés par la nouveauté (ex: /workspace/vivier). '
  'Utilisé pour afficher une pastille par item de menu dans la sidebar workspace. '
  'Vide = pastille globale uniquement.';
