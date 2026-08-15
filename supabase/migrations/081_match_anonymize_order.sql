-- Lot D — ordre des briques dans le document anonymisé d'UNE mission.
--
-- Complète la 080 (`anonymize_excluded`). Même forme, mêmes clés de contenu :
-- {experiences[], education[], sections[]}, mais ici la liste dit l'ORDRE au
-- lieu de dire ce qu'on retire.
--
-- Règle de résolution (cf. src/lib/anonymize-selection.ts) : une brique absente
-- de la liste va à la FIN, dans son ordre d'origine. C'est la direction sûre —
-- un poste retrouvé par un re-parsing apparaît chez le client, quitte à être
-- mal placé, plutôt que de disparaître ou de s'insérer au hasard.
--
-- Deux colonnes plutôt qu'une : masquer et réordonner sont deux gestes
-- indépendants, et le sourceur en fait souvent un sans l'autre. Les fusionner
-- obligerait à réécrire l'ensemble à chaque clic.
--
-- Additive et nullable : NULL = ordre d'origine du parsing = comportement
-- actuel.

BEGIN;

ALTER TABLE match_assessments
  ADD COLUMN IF NOT EXISTS anonymize_order jsonb;

COMMENT ON COLUMN match_assessments.anonymize_order IS
  'Ordre des briques dans le document anonymise de CETTE mission. '
  'Listes de cles de contenu : {experiences[], education[], sections[]}. '
  'Une brique absente va a la fin. Ne modifie jamais candidates.parsed_cv.';

-- Instantané de la TAXONOMIE, pris en même temps que `parsed_cv_original`.
--
-- Les « compétences clés » imprimées sur le document client viennent de
-- `taxonomy.core_skills`, pas de `parsed_cv`. Les rendre éditables sans les
-- inclure dans l'instantané rendrait le bouton « Revenir à la version de
-- Nora » PARTIELLEMENT FAUX : le parcours reviendrait, les compétences non.
-- Une promesse à moitié tenue est pire qu'une fonctionnalité absente.
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS taxonomy_original jsonb;

COMMENT ON COLUMN candidates.taxonomy_original IS
  'Instantane de `taxonomy` pris a la PREMIERE edition manuelle, en meme temps '
  'que parsed_cv_original. Remis a NULL au retour arriere et au re-parsing.';

COMMIT;
