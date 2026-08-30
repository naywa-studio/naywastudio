-- 098 — Rétention RGPD des candidats : consentement vivier déclaratif + purge auto
--
-- ⚠️ Numérotée 098 et non 085 : cette branche (`formulaire_mission`) part d'un
-- snapshot de main qui s'arrête à la migration 084. `origin/main` est allé
-- jusqu'à 097 entre-temps (chantier Mailing). 098 évite la collision au merge
-- — mais si quelqu'un d'autre a posé un 098 ailleurs depuis, il faudra
-- renuméroter avant merge (cf. l'incident du double 070 dans CLAUDE.md).
--
-- ── Ce que ça résout ──────────────────────────────────────────────────────
--
-- Aucune durée de conservation n'existait pour un candidat : un CV importé
-- restait en base indéfiniment, contacté ou non. La CNIL admet jusqu'à 2 ans
-- de conservation après le dernier contact SI le candidat a accepté d'être
-- gardé en vivier ; sans accord, une durée courte liée au recrutement en cours.
--
-- ── Le modèle retenu, et pourquoi ────────────────────────────────────────
--
-- Pas de formulaire candidat aujourd'hui (E2 non construit) : le consentement
-- vivier est DÉCLARATIF, posé par le sourceur sur la fiche candidat (accord
-- obtenu par ailleurs — email, téléphone, CV reçu directement pour ce poste).
-- D'où `talent_pool_consent` + `_at` + `_by` : on trace QUI a déclaré quoi et
-- QUAND, pas juste un booléen muet.
--
-- Naywa n'a pas de "mission clôturée" exploitable par candidat : le vivier est
-- PARTAGÉ dans l'org, un même candidat peut être lié à plusieurs missions
-- actives ou closes en même temps (match_assessments). Une règle par mission
-- n'a donc pas de sens ici. Règle retenue :
--
--   consentement vivier = 2 ans depuis le dernier contact (ou l'import si
--     jamais contacté)
--   pas de consentement = 180 jours depuis le dernier contact (ou l'import) —
--     couvre largement un process de recrutement ; repart à zéro à chaque
--     nouveau contact, donc un candidat activement travaillé ne s'éteint pas
--
-- 180 j est un défaut raisonnable choisi pour livrer cette slice, PAS une
-- valeur imposée par le RGPD — à confirmer avec Elyas, deviendra un réglage
-- par organisation si besoin (pas fait ici, scope volontairement serré).
--
-- `last_contact_at` est dérivé de `match_assessments.contacted_at` par
-- trigger — pas un nouveau call site à faire penser d'appeler à la main (3
-- routes posent déjà contacted_at aujourd'hui ; en ajouter un 4e qui oublie
-- de mettre à jour candidates serait exactement le genre de trou qu'on a
-- payé sur keepCandidateSummary).
--
-- ⚠️ PAS DE BACKFILL rétroactif dans cette migration. Les candidats déjà en
-- base auront retention_until = NULL après ce script, donc jamais purgés
-- automatiquement tant que personne n'y touche. Backfiller à created_at+180j
-- aurait marqué "expiré" une bonne partie du vivier réel de GMH dès la mise
-- en ligne du cron — une suppression de masse rétroactive n'est pas une
-- décision qu'une migration prend seule. Si tu veux nettoyer l'historique, on
-- le fait exprès, dans une slice dédiée, avec un dry-run d'abord.

begin;

alter table public.candidates
  add column if not exists talent_pool_consent boolean not null default false,
  add column if not exists talent_pool_consent_at timestamptz,
  add column if not exists talent_pool_consent_by uuid references public.profiles(user_id) on delete set null,
  add column if not exists last_contact_at timestamptz,
  add column if not exists retention_until timestamptz;

comment on column public.candidates.talent_pool_consent is
  'Déclaratif (posé par le sourceur, pas par le candidat — pas de formulaire public aujourd''hui) : accord obtenu pour conserver ce profil en vivier au-delà d''un process de recrutement.';
comment on column public.candidates.talent_pool_consent_at is
  'Horodatage de la déclaration de consentement (ou de son retrait).';
comment on column public.candidates.talent_pool_consent_by is
  'Profil qui a déclaré le consentement. NULL si ce profil a depuis été supprimé.';
comment on column public.candidates.last_contact_at is
  'Dernier contact avec ce candidat, tous matchs confondus. Dérivé de match_assessments.contacted_at par trigger — ne jamais l''écrire à la main.';
comment on column public.candidates.retention_until is
  'Date de purge RGPD automatique (cron wipe-expired-candidates). NULL = jamais purgé automatiquement (candidat pré-existant, pas encore retouché — voir note de migration). Recalculée par trigger, ne jamais l''écrire à la main.';

create index if not exists candidates_retention_until_idx
  on public.candidates (retention_until)
  where retention_until is not null;

------------------------------------------------------------------------
-- Calcul centralisé, appelé par les triggers ci-dessous. Une seule formule
-- pour ne jamais la faire diverger entre deux call sites.
------------------------------------------------------------------------
create or replace function public.compute_candidate_retention_until(
  p_talent_pool_consent boolean,
  p_last_contact_at timestamptz,
  p_created_at timestamptz
)
returns timestamptz
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_last_contact_at, p_created_at)
    + case when p_talent_pool_consent then interval '730 days' else interval '180 days' end
$$;

------------------------------------------------------------------------
-- BEFORE INSERT sur candidates : pose retention_until dès la création
-- (consentement par défaut = false → maintenant + 180 j).
------------------------------------------------------------------------
create or replace function public.set_candidate_retention_default()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.retention_until is null then
    new.retention_until := public.compute_candidate_retention_until(
      new.talent_pool_consent, new.last_contact_at, coalesce(new.created_at, now())
    );
  end if;
  return new;
end $$;

drop trigger if exists candidates_set_retention_default on public.candidates;
create trigger candidates_set_retention_default
  before insert on public.candidates
  for each row execute function public.set_candidate_retention_default();

------------------------------------------------------------------------
-- BEFORE UPDATE sur candidates : recalcule quand le consentement change.
-- La Slice 2 (toggle vivier) n'aura qu'à écrire talent_pool_consent/_at/_by
-- — jamais retention_until directement, ce trigger s'en charge.
------------------------------------------------------------------------
create or replace function public.recompute_candidate_retention_on_consent_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.talent_pool_consent is distinct from old.talent_pool_consent then
    new.retention_until := public.compute_candidate_retention_until(
      new.talent_pool_consent, new.last_contact_at, coalesce(new.created_at, now())
    );
  end if;
  return new;
end $$;

drop trigger if exists candidates_recompute_retention_on_consent on public.candidates;
create trigger candidates_recompute_retention_on_consent
  before update on public.candidates
  for each row execute function public.recompute_candidate_retention_on_consent_change();

------------------------------------------------------------------------
-- AFTER UPDATE sur match_assessments : un nouveau contact fait avancer
-- last_contact_at + retention_until du candidat concerné.
------------------------------------------------------------------------
create or replace function public.touch_candidate_last_contact()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.candidates
  set
    last_contact_at = new.contacted_at,
    retention_until = public.compute_candidate_retention_until(
      talent_pool_consent, new.contacted_at, coalesce(created_at, now())
    )
  where id = new.candidate_id
    and (last_contact_at is null or last_contact_at < new.contacted_at);
  return new;
end $$;

drop trigger if exists match_touch_candidate_last_contact on public.match_assessments;
create trigger match_touch_candidate_last_contact
  after update of contacted_at on public.match_assessments
  for each row
  when (new.contacted_at is not null and new.contacted_at is distinct from old.contacted_at)
  execute function public.touch_candidate_last_contact();

-- Fonctions SECURITY DEFINER implicite (propriétaire) : jamais appelables
-- directement via l'API REST, même immutable/sql (pattern de la 029/083).
revoke execute on function public.compute_candidate_retention_until(boolean, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.set_candidate_retention_default() from public, anon, authenticated;
revoke execute on function public.recompute_candidate_retention_on_consent_change() from public, anon, authenticated;
revoke execute on function public.touch_candidate_last_contact() from public, anon, authenticated;

commit;
