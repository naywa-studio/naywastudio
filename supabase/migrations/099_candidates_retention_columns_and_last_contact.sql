-- 099 — Rétention candidats : ferme la dette de colonnes + last_contact_at
--
-- Complète 098 (adopté d'origin/main, déjà vérifié en prod), qui ne
-- contenait QUE le correctif GRANT sur `compute_candidate_retention_until`.
-- Deux choses manquaient encore, vérifiées absentes de tout le dépôt
-- (migrations ET code applicatif) au moment d'écrire ceci :
--
-- 1. **La dette de schéma.** `talent_pool_consent`, `talent_pool_consent_at`,
--    `talent_pool_consent_by`, `last_contact_at`, `retention_until` sont déjà
--    en base (sinon les triggers de la 098 ne fonctionneraient pas), mais leur
--    `ALTER TABLE` n'a jamais été committé nulle part — même dette que les
--    migrations 074/075/076 (posées via MCP/SQL direct, jamais écrites en
--    migration). `IF NOT EXISTS` partout : no-op si déjà là, filet si un
--    environnement ne les a pas.
--
-- 2. **`last_contact_at` ne bouge jamais.** Rien ne le met à jour quand un
--    candidat est contacté (`match_assessments.contacted_at`, posé par
--    3 routes existantes : cv/[id]/send, match/[id], match/[id]/stage — toutes
--    via le client RLS `authenticated`, jamais admin). Sans ce trigger,
--    `retention_until` ne reflète que la date d'IMPORT, jamais le dernier
--    contact réel — un candidat activement travaillé s'éteindrait quand même
--    au bout de 180 j.
--
-- La fonction de calcul (`compute_candidate_retention_until`, déjà GRANT
-- authenticated par la 098) est réutilisée telle quelle — pas redéfinie ici,
-- pour ne pas faire diverger deux copies de la même formule.

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
  'Dernier contact avec ce candidat, tous matchs confondus. Dérivé de match_assessments.contacted_at par le trigger ci-dessous — ne jamais l''écrire à la main.';
comment on column public.candidates.retention_until is
  'Date de purge RGPD automatique (cron wipe-expired-candidates). Recalculée par trigger (098 + ci-dessous) — ne jamais l''écrire à la main.';

create index if not exists candidates_retention_until_idx
  on public.candidates (retention_until)
  where retention_until is not null;

------------------------------------------------------------------------
-- AFTER UPDATE sur match_assessments : un nouveau contact fait avancer
-- last_contact_at + retention_until du candidat concerné. Réutilise
-- compute_candidate_retention_until (098), déjà GRANT authenticated —
-- ce trigger tourne sous authenticated (les 3 routes qui posent
-- contacted_at écrivent via le client RLS, pas admin), donc l'appel
-- imbriqué passe sans GRANT supplémentaire à poser ici.
------------------------------------------------------------------------
create or replace function public.touch_candidate_last_contact()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
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

-- Fermée comme les deux triggers candidates de la 098 : jamais appelable
-- directement, seul le moteur de trigger l'invoque.
revoke execute on function public.touch_candidate_last_contact() from public;

commit;
