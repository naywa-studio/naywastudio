-- 083 — Durcissement : retirer EXECUTE aux rôles exposés sur les deux fonctions
-- de trigger ajoutées après la 029.
--
-- La migration 029 avait fait ce ménage pour les fonctions d'alors. Les deux
-- fonctions `touch_*` créées depuis (app_updates, clients) sont restées
-- exécutables via `/rest/v1/rpc/...` par `anon` et `authenticated` — remonté
-- par le linter Supabase (0028/0029).
--
-- Aucun risque réel (elles ne lisent ni n'écrivent rien hors du trigger qui les
-- appelle), mais une fonction SECURITY DEFINER ne doit jamais être appelable
-- depuis l'API publique. Les triggers, eux, continuent de fonctionner : ils
-- s'exécutent avec les droits du propriétaire de la fonction, pas de l'appelant.

REVOKE EXECUTE ON FUNCTION public.touch_app_updates_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_app_updates_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.touch_app_updates_updated_at() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.touch_clients_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_clients_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.touch_clients_updated_at() FROM authenticated;
