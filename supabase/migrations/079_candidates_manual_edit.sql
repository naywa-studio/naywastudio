-- Lot D — édition manuelle de la fiche candidat.
--
-- Le sourceur doit pouvoir corriger ce que Nora a produit : une date fausse,
-- un intitulé approximatif, un poste oublié. Sans ça, « Nous traitons, vous
-- décidez » n'est vrai qu'à moitié — il n'a aujourd'hui AUCUN recours face à
-- une fiche erronée.
--
-- Deux colonnes, additives et nullables : aucun impact tant que le code qui
-- les lit n'est pas déployé.
--
--  * parsed_cv_original — instantané de `parsed_cv` pris à la PREMIÈRE
--    modification manuelle. Permet le retour à l'original. NULL = jamais
--    modifiée à la main.
--  * parsed_cv_edited_at — date de la dernière modification manuelle. Pilote
--    le tag « modifié » dans le workspace (décision Elyas : ce tag ne doit
--    JAMAIS apparaître sur le CV anonymisé, il sèmerait le doute chez le
--    client final sans lui donner de moyen d'agir).
--
-- Politique de conflit (décision Elyas) : un re-parsing ÉCRASE l'édition, et
-- le sourceur en est averti avant. La route de parsing remet donc ces deux
-- colonnes à NULL — l'instantané d'origine n'aurait plus de sens face à un
-- parsing tout neuf.

BEGIN;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS parsed_cv_original jsonb,
  ADD COLUMN IF NOT EXISTS parsed_cv_edited_at timestamptz;

-- Sert à lister les fiches retouchées (filtre workspace, contrôle qualité).
CREATE INDEX IF NOT EXISTS candidates_parsed_cv_edited_at_idx
  ON candidates (parsed_cv_edited_at)
  WHERE parsed_cv_edited_at IS NOT NULL;

COMMIT;
