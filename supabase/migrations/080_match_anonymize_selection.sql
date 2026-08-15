-- Lot D — seconde surface d'édition : ce qui part dans le CV anonymisé,
-- mission par mission.
--
-- La 079 a ouvert l'édition de la SOURCE DE VÉRITÉ (fiche candidat). Celle-ci
-- ouvre un geste différent, et volontairement séparé : décider ce qu'on montre
-- à UN client donné. Le poste chez son concurrent, le job étudiant sans
-- rapport, la rubrique loisirs — on ne les efface pas du vivier, on choisit de
-- ne pas les faire figurer sur CE document.
--
-- Confondre les deux serait une faute produit : corriger une date depuis la
-- fiche match la laisserait fausse dans le matching et sur les CV de toutes
-- les autres missions, et il faudrait refaire la correction à chaque mission.
--
-- Forme : LISTE D'EXCLUSION par clé de contenu ({experiences, education,
-- sections}), pas une liste d'inclusion et pas des index.
--   * exclusion → une brique retrouvée par un re-parsing part d'office chez le
--     client. Une liste d'inclusion l'aurait fait disparaître en silence.
--   * clé de contenu → un index désignerait un autre poste dès que l'ordre
--     change, et masquerait donc un poste que personne n'a choisi de masquer.
-- Détail dans src/lib/anonymize-selection.ts.
--
-- Additive et nullable : sans effet tant que le code qui la lit n'est pas
-- déployé. NULL = rien d'exclu = comportement actuel.

BEGIN;

ALTER TABLE match_assessments
  ADD COLUMN IF NOT EXISTS anonymize_excluded jsonb;

COMMENT ON COLUMN match_assessments.anonymize_excluded IS
  'Briques du CV masquées dans le document anonymisé de CETTE mission. '
  'Liste d''exclusion par clé de contenu : {experiences[], education[], sections[]}. '
  'Ne modifie jamais candidates.parsed_cv.';

COMMIT;
