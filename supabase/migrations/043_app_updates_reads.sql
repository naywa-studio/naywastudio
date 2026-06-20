-- 043_app_updates_reads.sql
--
-- Tracking par utilisateur des nouveautés lues, pour pouvoir
-- afficher une pastille violette dans la sidebar tant qu'au moins
-- une update reste non-lue.
--
-- Stamp au premier mount de /nouveautes pour chaque update visible.
-- Pas de notion d'archive ni d'unread manuel : "lu une fois = lu
-- pour toujours" (UX simple, pas de friction).
--
-- Clé composite (user_id, update_id) : un stamp unique par paire.

CREATE TABLE IF NOT EXISTS public.app_updates_reads (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  update_id   UUID NOT NULL REFERENCES public.app_updates(id) ON DELETE CASCADE,
  read_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, update_id)
);

CREATE INDEX IF NOT EXISTS idx_app_updates_reads_user
  ON public.app_updates_reads (user_id);

-- RLS : un user ne voit / écrit que ses propres reads.
ALTER TABLE public.app_updates_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User reads own reads" ON public.app_updates_reads;
CREATE POLICY "User reads own reads"
ON public.app_updates_reads
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "User stamps own reads" ON public.app_updates_reads;
CREATE POLICY "User stamps own reads"
ON public.app_updates_reads
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Pas d'UPDATE / DELETE policy : un read est immuable. Si on veut
-- "annuler une lecture" un jour, ça passera par un upsert côté admin.

COMMENT ON TABLE public.app_updates_reads IS
  'Stamp idempotent : un user a lu une update. Sert à afficher la pastille violette tant qu''au moins une update visible n''est pas dans cette table pour le user courant.';
