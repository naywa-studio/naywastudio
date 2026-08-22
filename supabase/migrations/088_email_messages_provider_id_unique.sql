-- 088 — Un message par identifiant fournisseur.
--
-- ⚠️ SNS ABANDONNE UNE LIVRAISON HTTPS AU BOUT D'UNE QUINZAINE DE SECONDES,
-- PUIS LA RETENTE.
--
-- Or le traitement d'un email entrant n'est pas instantané : lecture de l'objet
-- S3, analyse MIME, recopie des pièces jointes sur R2, lecture de la réponse
-- par Nora. Un message avec un CV de 800 Ko et un modèle qui répond lentement
-- peut franchir la limite. AWS retente alors — et sans garde, le sourceur
-- verrait la même réponse deux fois dans son fil, avec deux analyses.
--
-- L'identifiant de message du fournisseur est stable d'une tentative à
-- l'autre : c'est la bonne clé d'unicité. Le code s'appuie dessus pour rendre
-- l'insertion idempotente.
--
-- Partiel, parce que `provider_id` est nul sur les messages qui n'ont jamais
-- atteint le fournisseur (envois en échec, journalisés pour que le fil montre
-- la tentative) : plusieurs échecs doivent pouvoir coexister.

CREATE UNIQUE INDEX IF NOT EXISTS email_messages_provider_id_key
  ON public.email_messages (provider_id)
  WHERE provider_id IS NOT NULL;
