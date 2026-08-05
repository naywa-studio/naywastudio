-- Retours POSITIFS client (miroir de client_reject_reasons / 073).
-- Ce qui a PLU au client sur un candidat retenu (interview/offer/hired) → Nora
-- RENFORCE les bons critères au lieu de seulement les assouplir sur les écartés.
-- Additif + nullable : aucun impact sur l'existant tant que non renseigné.
alter table public.match_assessments
  add column if not exists client_liked_reasons text[],
  add column if not exists client_positive_note text,
  add column if not exists client_positive_at timestamptz;

comment on column public.match_assessments.client_liked_reasons is
  'Ce qui a PLU au client sur un candidat retenu (multi, universel). Miroir de client_reject_reasons. Voir lib/client-liked-reasons.';
comment on column public.match_assessments.client_positive_note is
  'Commentaire libre du client sur ce qui a plu (candidat retenu).';
comment on column public.match_assessments.client_positive_at is
  'Horodatage du dernier retour positif client.';
