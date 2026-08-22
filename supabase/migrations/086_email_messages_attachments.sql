-- 086 — Pièces jointes des emails entrants.
--
-- Un candidat qui répond joint son CV. Jusqu'ici ce fichier était perdu : le
-- message transitait par S3, le texte partait en base, et l'objet S3 était
-- supprimé avec la pièce jointe dedans. Le sourceur voyait « le candidat a
-- répondu » sans jamais pouvoir ouvrir ce qu'il avait envoyé.
--
-- Le FICHIER va sur R2, là où vivent déjà les CV du vivier. Cette colonne ne
-- garde que le nécessaire pour le retrouver et l'afficher :
--   [{ filename, contentType, size, path }]
--
-- `path` est le chemin R2, toujours préfixé de l'identifiant d'organisation —
-- c'est ce qui permet à `assertOrgScopedPath` de refuser une lecture croisée
-- entre deux cabinets.
--
-- jsonb plutôt qu'une table dédiée : une pièce jointe n'a d'existence que par
-- son message, on ne la requête jamais seule, et une table imposerait une
-- jointure à chaque affichage de fil.

ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.email_messages.attachments IS
  'Pièces jointes stockées sur R2 : [{ filename, contentType, size, path }]. Le path est org-scopé.';
