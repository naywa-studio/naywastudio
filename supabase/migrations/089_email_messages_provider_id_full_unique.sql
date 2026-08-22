-- 089 — L'unicité de `provider_id` doit être TOTALE, pas partielle.
--
-- Correction de la 088, qui a bloqué toute réception d'email.
--
-- ── L'erreur ────────────────────────────────────────────────────────────────
--
--   there is no unique or exclusion constraint matching the ON CONFLICT
--   specification
--
-- La 088 posait un index unique PARTIEL (`WHERE provider_id IS NOT NULL`).
-- Postgres refuse d'inférer une cible `ON CONFLICT (provider_id)` depuis un
-- index partiel, à moins que la requête ne répète exactement le même
-- prédicat — ce qu'un `upsert` PostgREST ne sait pas exprimer.
--
-- ── Pourquoi la partialité était inutile ────────────────────────────────────
--
-- Je l'avais choisie pour laisser coexister plusieurs envois EN ÉCHEC, dont le
-- `provider_id` est nul faute d'avoir atteint le fournisseur. Or Postgres
-- considère déjà deux NULL comme distincts dans un index unique : un index
-- total les autorise tous, et n'impose l'unicité que sur les valeurs réelles.
-- La partialité ne protégeait donc rien, et cassait l'idempotence.
--
-- ── Ce que ça coûtait ───────────────────────────────────────────────────────
--
-- TOUTE réponse de candidat était perdue. La route renvoyait 500, SNS
-- retentait, et échouait à l'identique — quatre fois avant qu'on le voie dans
-- les journaux. Le 500 est ce qui sauve la mise : le message reste dans S3 et
-- sera livré à la prochaine tentative, une fois cet index en place.

DROP INDEX IF EXISTS public.email_messages_provider_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS email_messages_provider_id_key
  ON public.email_messages (provider_id);
