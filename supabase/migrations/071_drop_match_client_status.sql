-- 071 — Retrait de match_assessments.client_status (lot 3, révision « Revue client »)
--
-- Décision produit : le process client N'EST PAS un axe séparé, c'est la queue
-- du kanban interne (un seul entonnoir Candidats → Shortlist → Revue client).
--   - « Présenté au client » = stade kanban `offer` (relabellé)
--   - « Recruté »            = stade `hired`
--   - « Écarté »             = stade `rejected`
-- Le verdict vit donc dans `pipeline_stage`. On garde `client_feedback_note`
-- (+ `client_feedback_at`) pour le retour libre du client, affiché dans la
-- Revue client. La colonne `client_status`, jamais exploitée en prod, est
-- retirée pour éviter deux sources de vérité.

ALTER TABLE match_assessments
  DROP COLUMN IF EXISTS client_status;
