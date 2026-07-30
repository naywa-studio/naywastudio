-- 070 — Retour client sur un match (segment cabinet/ESN, lot 3)
--
-- Champs de suivi du process client une fois un candidat présenté :
--   - client_status      : verdict client (retiré en 071 au profit du kanban)
--   - client_feedback_note : retour / motif libre du client (saisi par le
--     sourceur, pas de portail client en V1)
--   - client_feedback_at : horodatage du dernier retour, pour l'affichage
--
-- Additif + nullable : aucun impact sur l'existant tant que non renseigné.

ALTER TABLE match_assessments
  ADD COLUMN IF NOT EXISTS client_status text
    CHECK (client_status IN ('presented', 'retained', 'rejected', 'to_adjust')),
  ADD COLUMN IF NOT EXISTS client_feedback_note text,
  ADD COLUMN IF NOT EXISTS client_feedback_at timestamptz;
