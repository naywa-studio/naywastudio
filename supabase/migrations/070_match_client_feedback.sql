-- 070 — Retour client sur un match (segment cabinet/ESN, lot 3a)
--
-- Dimension CLIENT, orthogonale au pipeline interne (`pipeline_stage`) :
-- une fois un candidat PRÉSENTÉ à un client, quel est son verdict ?
--   - presented  : présenté au client, en attente de retour
--   - retained   : retenu par le client (avance)
--   - rejected   : rejeté par le client
--   - to_adjust  : le client veut ajuster (le sourceur réoriente le brief)
-- NULL = pas encore présenté au client (défaut).
--
-- `client_feedback_note` = motif / retour libre du client (saisi par le
-- sourceur, pas de portail client en V1). `client_feedback_at` = horodatage
-- du dernier changement de statut, pour l'affichage.
--
-- Additif + nullable : aucun impact sur l'existant tant que non renseigné.

ALTER TABLE match_assessments
  ADD COLUMN IF NOT EXISTS client_status text
    CHECK (client_status IN ('presented', 'retained', 'rejected', 'to_adjust')),
  ADD COLUMN IF NOT EXISTS client_feedback_note text,
  ADD COLUMN IF NOT EXISTS client_feedback_at timestamptz;
