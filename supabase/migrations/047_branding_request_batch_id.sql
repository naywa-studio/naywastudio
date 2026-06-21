-- Regroupement des rows d'une meme soumission "demande de modification".
-- L'owner peut maintenant cocher plusieurs champs (nom + logo + email)
-- dans un seul formulaire. Cote DB on conserve 1 row par champ pour
-- permettre l'approbation/refus selectifs (j'accepte le nom, je refuse
-- le logo), mais on les attache au meme batch via cet UUID.
--
-- request_batch_id est defaulte a gen_random_uuid() pour les inserts
-- legacy ou un seul champ change (1 row = son propre batch).

ALTER TABLE public.branding_change_requests
  ADD COLUMN IF NOT EXISTS request_batch_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_branding_change_requests_batch
  ON public.branding_change_requests (request_batch_id);

COMMENT ON COLUMN public.branding_change_requests.request_batch_id IS
  'Regroupement des rows d''une meme soumission (l''owner a coche plusieurs champs dans un seul formulaire). Chaque row reste decidable independamment.';
