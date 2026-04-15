-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 002: Phase 2 — VPS fields, agent schema, fixed column types
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. profiles — champs VPS & souscription ──────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscribed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vps_id         TEXT,
  ADD COLUMN IF NOT EXISTS vps_ip         TEXT,
  ADD COLUMN IF NOT EXISTS vps_status     TEXT,
  ADD COLUMN IF NOT EXISTS agent_status   TEXT DEFAULT 'not_deployed';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_vps_status_check
    CHECK (vps_status IN ('pending', 'provisioning', 'ready', 'error')),
  ADD CONSTRAINT profiles_agent_status_check
    CHECK (agent_status IN ('not_deployed', 'deploying', 'running', 'error'));

-- ── 2. missions — jsonb brief, agent_level, profiles_count, statut 'error' ───

-- Supprimer l'ancienne contrainte status et la recréer avec 'error'
DO $$
DECLARE v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.missions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.missions DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE public.missions
  ADD CONSTRAINT missions_status_check
    CHECK (status IN ('preparation', 'in_progress', 'completed', 'error'));

-- Convertir brief TEXT → JSONB (table vide, sans risque)
ALTER TABLE public.missions
  ALTER COLUMN brief TYPE JSONB
  USING CASE WHEN brief IS NULL THEN NULL ELSE brief::jsonb END;

-- Nouvelles colonnes
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS agent_level    TEXT,
  ADD COLUMN IF NOT EXISTS profiles_count INT DEFAULT 0;

ALTER TABLE public.missions
  ADD CONSTRAINT missions_agent_level_check
    CHECK (agent_level IN ('leo', 'nora'));

-- Note: missions_updated_at trigger existait déjà — pas recréé

-- ── 3. candidates — nouveaux champs, statuts corrigés ────────────────────────

-- Supprimer l'ancienne contrainte status
DO $$
DECLARE v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.candidates'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.candidates DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

-- Supprimer l'ancienne contrainte score
DO $$
DECLARE v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.candidates'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%score%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.candidates DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE public.candidates ALTER COLUMN status SET DEFAULT 'raw';

ALTER TABLE public.candidates
  ADD CONSTRAINT candidates_status_check
    CHECK (status IN ('raw', 'shortlisted', 'rejected'));

-- Nouveaux champs
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS title_estimated     TEXT,
  ADD COLUMN IF NOT EXISTS relevance_score     FLOAT,
  ADD COLUMN IF NOT EXISTS score_justification TEXT,
  ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.candidates
  ADD CONSTRAINT candidates_relevance_score_check
    CHECK (relevance_score IS NULL OR (relevance_score >= 0 AND relevance_score <= 100));

DROP TRIGGER IF EXISTS candidates_updated_at ON public.candidates;
CREATE TRIGGER candidates_updated_at
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
