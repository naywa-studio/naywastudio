-- 052 — Taxonomie de zones fermée + CRUD utilisateur
--
-- Avant : Nora créait des zones librement à chaque cluster run → soupe
-- de 50+ zones, instabilité des noms, mauvaise UX vivier.
--
-- Après : table cluster_manifests devient la TAXONOMIE FERMÉE de l'org.
-- - Le 1er run de clustering laisse Nora créer les zones initiales
--   (CAP dynamique selon la taille du vivier, cf. lib/cluster-taxonomy.ts)
-- - Les runs suivants : Nora choisit UNIQUEMENT dans cette taxonomie.
--   Si rien ne colle vraiment → zone système "Autre".
-- - Le sourceur peut créer / éditer / supprimer ses zones manuellement
--   via un nouveau panneau "Mes zones" sur /workspace/vivier.
--
-- Ajout :
--   - is_seed : true si la zone a été créée par le 1er run LLM (vs created
--     manuellement par le sourceur). Sert juste à signaler l'origine pour
--     la UI, n'affecte pas la logique de matching.
--   - created_by_user_id : trace qui a créé la zone (NULL pour seed).
--   - display_order : pour permettre au sourceur de réordonner les zones.

BEGIN;

ALTER TABLE public.cluster_manifests
  ADD COLUMN IF NOT EXISTS is_seed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 100;

-- Index utile pour le tri d'affichage.
CREATE INDEX IF NOT EXISTS cluster_manifests_org_display_idx
  ON public.cluster_manifests (organization_id, display_order);

-- Constraint : label non-vide + unique par org (déjà présent via UNIQUE)
-- + protection du label "Autre" qui est un fallback système et ne doit
-- pas être supprimable. On garde la logique en code (check via column ?
-- non, simple text-match côté DELETE route).

COMMIT;
