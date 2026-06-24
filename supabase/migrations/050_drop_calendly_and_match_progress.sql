-- 050 — Drop Calendly (table interviews + colonnes profiles) + ajoute
-- 2 colonnes de suivi du matching pour fiabiliser la barre de progression
-- côté UI (scored / total à la place du temps écoulé).
--
-- Calendly retiré complètement : la feature visio / RDV est parking
-- définitif (V1 → V2 ou jamais). Le code Calendly est supprimé en parallèle.

BEGIN;

-- ─── Drop interviews + colonnes calendly_* sur profiles ─────────
DROP TABLE IF EXISTS public.interviews CASCADE;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS calendly_access_token,
  DROP COLUMN IF EXISTS calendly_refresh_token,
  DROP COLUMN IF EXISTS calendly_token_expires_at,
  DROP COLUMN IF EXISTS calendly_user_uri,
  DROP COLUMN IF EXISTS calendly_org_uri,
  DROP COLUMN IF EXISTS calendly_event_type_uri,
  DROP COLUMN IF EXISTS calendly_scheduling_url,
  DROP COLUMN IF EXISTS calendly_webhook_uri,
  DROP COLUMN IF EXISTS calendly_connected_at;

-- ─── jobs : progression réelle du matching ──────────────────────
-- match_progress_total  = taille du pool après pré-filtre (set au début du run)
-- match_progress_scored = compteur incrémenté après chaque batch persisté
-- La barre UI calcule pct = scored / total. Quand status passe à "done"
-- les deux sont remis à NULL (run terminé).
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS match_progress_total  integer,
  ADD COLUMN IF NOT EXISTS match_progress_scored integer;

COMMIT;
