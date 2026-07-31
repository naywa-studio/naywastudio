-- 073 — Motifs d'écart CLIENT (multi-select), lot 3
--
-- Distinct des `reject_reason` de sourcing (single, orientés régie : TJM,
-- stack…). Ici ce sont les motifs du CLIENT quand il écarte un candidat
-- présenté : universels, multiples, non bloquants. Ils remontent dans le
-- contexte de la mission → matière pour Nora (ajustement + meilleur matching).
--
-- text[] libre (validé côté app contre le catalogue lib/client-reject-reasons).
-- Additif + nullable.

ALTER TABLE match_assessments
  ADD COLUMN IF NOT EXISTS client_reject_reasons text[];
