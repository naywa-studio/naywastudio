-- Migration 018 — jobs.role_name
--
-- Distingue deux notions qui étaient mélangées dans `title` :
--   role_name : NOM DU POSTE recherché — le signal principal du matching LLM
--               (ex : "Data Engineer"). Générique, normalisable.
--   title     : INTITULÉ de la mission — purement indicatif pour le sourceur
--               (ex : "Mission DataLake client BNP"). Le LLM l'ignore sauf si
--               role_name est absent (fallback).
--
-- role_name est nullable pour ne pas casser les missions existantes : à la
-- lecture, le matching utilise `role_name ?? title`.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS role_name TEXT NULL;

COMMENT ON COLUMN jobs.role_name IS 'Nom du poste recherché — signal principal du matching LLM (ex: "Data Engineer"). title reste l''intitulé indicatif de la mission. NULL = fallback sur title.';
