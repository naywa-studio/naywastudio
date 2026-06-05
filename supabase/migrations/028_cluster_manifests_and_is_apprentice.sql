-- Migration 028 — Vivier "vivant"
--
-- 1. cluster_manifests : pour chaque zone créée par Nora, on persiste une
--    courte description "qui ressemble à ça". Au prochain upload, Nora
--    consulte ces manifestes au lieu de tout re-scanner. Si un candidat
--    rentre dans une zone existante on la réutilise (et incrémente son
--    candidate_count) ; on n'invente une nouvelle zone QUE si ≥3 nouveaux
--    candidats forment un domaine cohérent absent des manifestes.
--
-- 2. candidates.is_apprentice : badge pour les alternants en cours
--    d'études. Pas un cluster — le LLM les range dans leur cluster
--    métier — mais la fiche candidat affichera le badge.

CREATE TABLE IF NOT EXISTS cluster_manifests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label           text NOT NULL,
  description     text NOT NULL,
  candidate_count integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, label)
);

CREATE INDEX IF NOT EXISTS cluster_manifests_org_idx
  ON cluster_manifests (organization_id);

ALTER TABLE cluster_manifests ENABLE ROW LEVEL SECURITY;

CREATE POLICY cluster_manifests_org_all
  ON cluster_manifests FOR ALL
  USING (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS is_apprentice boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN candidates.is_apprentice IS
  'True si le candidat est actuellement en alternance / apprentissage. Affiché en badge sur la fiche, jamais utilisé comme cluster.';

CREATE OR REPLACE FUNCTION cluster_manifests_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cluster_manifests_updated_at ON cluster_manifests;
CREATE TRIGGER cluster_manifests_updated_at
  BEFORE UPDATE ON cluster_manifests
  FOR EACH ROW EXECUTE FUNCTION cluster_manifests_touch_updated_at();
