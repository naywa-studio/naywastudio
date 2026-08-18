-- 084 — Le message d'accompagnement descend de la MISSION au CANDIDAT.
--
-- Il vivait dans `jobs.anonymize_options.customText`, donc partagé par tous les
-- candidats d'une shortlist. Or son propre libellé dit « Votre angle sur CE
-- profil : positionnement, contexte, points d'attention » — au singulier. Un
-- angle éditorial n'a de sens que pour une personne ; le mutualiser revenait à
-- écrire la même phrase sous douze profils différents.
--
-- Restent sur la mission les deux cases de résumé (« met-on des accroches dans
-- ce dossier ? »), qui sont bien une politique éditoriale décidée une fois.
--
-- Aucune reprise de données : mesuré avant écriture, 0 message chez GMH (seul
-- client réel) et 1 seul en organisation de test (16 caractères). La colonne
-- `jobs.anonymize_options.customText` devient orpheline et cesse simplement
-- d'être lue — on ne la supprime pas du jsonb, ça n'apporterait rien.

ALTER TABLE public.match_assessments
  ADD COLUMN IF NOT EXISTS anonymize_custom_text text;

COMMENT ON COLUMN public.match_assessments.anonymize_custom_text IS
  'Message d''accompagnement du sourceur pour CE candidat sur CETTE mission. Remplace jobs.anonymize_options.customText, qui était partagé par toute la shortlist.';
