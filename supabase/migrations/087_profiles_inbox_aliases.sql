-- 087 — Adresses de réception historiques d'un sourceur.
--
-- Quand une organisation active son domaine, l'adresse de réception de ses
-- sourceurs change de domaine : `sophie@mail.naywastudio.com` devient
-- `sophie@careers.cabinet-durand.fr`.
--
-- ⚠️ SANS CETTE COLONNE, L'ACTIVATION CASSE LES ÉCHANGES EN COURS.
--
-- Les candidats déjà contactés ont l'ancienne adresse dans leur boîte : c'est
-- elle qu'ils utiliseront en cliquant « Répondre », pendant des semaines. Le
-- rattachement d'un message entrant se fait par correspondance EXACTE sur
-- l'adresse destinataire — écraser la valeur ferait donc tomber toutes ces
-- réponses dans « destinataire inconnu », c'est-à-dire nulle part.
--
-- Et l'échec serait SILENCIEUX : un message non rattaché ressemble en tout
-- point à un message jamais envoyé. Le sourceur conclurait que son candidat ne
-- répond pas, et relancerait quelqu'un qui a déjà dit oui.
--
-- On conserve donc les anciennes adresses. Le domaine Naywa restant branché
-- (SMTP Supabase, contact, support), elles continuent de recevoir pour de vrai.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS inbox_aliases text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.profiles.inbox_aliases IS
  'Adresses de réception précédentes, conservées pour rattacher les réponses aux messages déjà envoyés. Ne sert jamais à l''envoi.';

-- Le rattachement interroge cette colonne à chaque email entrant, avec un
-- opérateur de contenance sur tableau — d'où GIN plutôt qu'un index B-tree.
CREATE INDEX IF NOT EXISTS profiles_inbox_aliases_idx
  ON public.profiles USING GIN (inbox_aliases);

-- L'adresse courante, elle, se cherche par égalité : B-tree, et unique, parce
-- que deux sourceurs partageant une adresse de réception rendraient le
-- rattachement ambigu — le message irait à l'un des deux, au hasard.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_inbox_address_key
  ON public.profiles (inbox_address)
  WHERE inbox_address IS NOT NULL;
