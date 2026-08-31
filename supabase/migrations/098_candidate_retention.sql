-- 098 — Rétention RGPD des candidats : écrire dans le dépôt ce qui n'existait
-- qu'en base, et rendre le calcul appelable par les utilisateurs authentifiés.
--
-- ── Ce que cette migration répare ────────────────────────────────────────────
--
-- `compute_candidate_retention_until` n'avait EXECUTE que pour `postgres` et
-- `service_role`. Or elle est appelée depuis un trigger BEFORE UPDATE sur
-- `candidates`, et la fiche candidat écrit sur cette table DIRECTEMENT depuis
-- le navigateur, via RLS — donc sous le rôle `authenticated` :
--
--     workspace/vivier/[candidateId] : consulted_at, notes, tags
--
-- Résultat en production : « permission denied for function
-- compute_candidate_retention_until », en boucle. Ce n'était pas le pipeline
-- (qui n'écrit que sur `match_assessments` et ne déclenche aucun de ces
-- triggers) : c'est l'OUVERTURE d'une fiche candidat, qui estampille
-- `consulted_at`. Le symptôme le plus visible n'est pas toujours la cause.
--
-- ── Pourquoi ce GRANT ne rouvre rien ─────────────────────────────────────────
--
-- Les migrations 029 et 083 ont délibérément retiré EXECUTE à PUBLIC sur les
-- fonctions du schéma. Ce GRANT est une exception, et elle est sûre : la
-- fonction est IMMUTABLE, écrite en SQL pur, n'est PAS `SECURITY DEFINER`, ne
-- lit aucune table et n'a aucun effet de bord. Elle additionne une date et un
-- intervalle. Un appelant malveillant n'en tire rien qu'il ne puisse calculer
-- lui-même.
--
-- Les deux fonctions TRIGGER, elles, restent fermées : PostgreSQL n'exige pas
-- EXECUTE sur une fonction trigger pour le rôle qui déclenche le trigger. Seul
-- l'appel imbriqué est vérifié. On n'ouvre donc que le strict nécessaire.
--
-- ── Durées ───────────────────────────────────────────────────────────────────
--
-- 180 jours par défaut à compter du dernier contact ; 730 jours si le candidat
-- a consenti à rester dans le vivier. Ces valeurs viennent de la base, elles
-- ne sont pas réinventées ici.
--
-- Idempotente : rejouable sans effet de bord.

create or replace function public.compute_candidate_retention_until(
  p_talent_pool_consent boolean,
  p_last_contact_at     timestamptz,
  p_created_at          timestamptz
) returns timestamptz
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(p_last_contact_at, p_created_at)
    + case when p_talent_pool_consent then interval '730 days' else interval '180 days' end
$$;

create or replace function public.set_candidate_retention_default()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.retention_until is null then
    new.retention_until := public.compute_candidate_retention_until(
      new.talent_pool_consent, new.last_contact_at, coalesce(new.created_at, now())
    );
  end if;
  return new;
end $$;

create or replace function public.recompute_candidate_retention_on_consent_change()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.talent_pool_consent is distinct from old.talent_pool_consent then
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

drop trigger if exists candidates_recompute_retention_on_consent on public.candidates;
create trigger candidates_recompute_retention_on_consent
  before update on public.candidates
  for each row execute function public.recompute_candidate_retention_on_consent_change();

-- Le correctif. Sans lui, toute écriture sur `candidates` depuis le navigateur
-- échoue — donc l'ouverture même d'une fiche candidat.
revoke execute on function
  public.compute_candidate_retention_until(boolean, timestamptz, timestamptz) from public;
grant execute on function
  public.compute_candidate_retention_until(boolean, timestamptz, timestamptz) to authenticated;

-- Les fonctions trigger restent fermées : appelées par le moteur, jamais par un
-- client. Aligné sur le durcissement des migrations 029 et 083.
revoke execute on function public.set_candidate_retention_default() from public;
revoke execute on function public.recompute_candidate_retention_on_consent_change() from public;
