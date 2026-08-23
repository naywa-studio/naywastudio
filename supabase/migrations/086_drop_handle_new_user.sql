-- 086 — Supprime la fonction orpheline `handle_new_user()` (audit sécurité A3).
--
-- Créée en migration 001 comme trigger `AFTER INSERT ON auth.users`, elle a
-- été remplacée dès la migration 020 par `handle_new_auth_user()` (DROP
-- TRIGGER + CREATE TRIGGER pointant vers la nouvelle fonction). La fonction
-- d'origine n'a jamais été supprimée : elle reste SECURITY DEFINER sans
-- `search_path` pinné ni `REVOKE EXECUTE`, contrairement à sa remplaçante
-- (durcie en migration 029). Vérifié avant suppression : aucun trigger,
-- aucune policy ni aucun appelant applicatif ne la référence plus dans le
-- repo (seule migration 001 la mentionne).

DROP FUNCTION IF EXISTS public.handle_new_user();
