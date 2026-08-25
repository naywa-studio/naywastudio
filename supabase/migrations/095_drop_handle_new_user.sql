-- ⚠️ RENUMÉROTÉE : écrite par Amine sous le numéro 091 sur la branche
-- `claude/security-audit-2026-08-22`, mais 091 était déjà pris sur `main`
-- par le chantier mailing. Le contenu est INCHANGÉ ; seul le numéro bouge, la
-- numérotation devant rester strictement croissante.
--
-- Appliquée en base le 2026-08-25 après vérification de deux points qui
-- l'auraient rendue dangereuse :
--   1. `auth.role()` existe bien sur ce projet — si la fonction manquait, le
--      trigger lèverait une exception sur CHAQUE update.
--   2. Les seules écritures côté navigateur sur `profiles`/`organizations`
--      sont trois `update({ first_name })` (auth/callback, login,
--      workspace/layout) — colonne non verrouillée, elles passent toujours.

-- 091 — Supprime la fonction orpheline `handle_new_user()` (audit sécurité A3).
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
