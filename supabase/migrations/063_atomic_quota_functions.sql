-- Point 9 de l'audit sécurité : quotas non atomiques (dépassement possible
-- en cas d'uploads simultanés). On ferme la race sur les 2 plafonds touchés
-- à chaque upload de CV : le nombre de CV (plafond principal visible) et le
-- compteur d'actions LLM. Le quota stockage reste en check-then-write (filet
-- interne jamais montré + auto-corrigé par le cron nightly recompute-storage).

-- ── 1) Plafond CV : compte + insert sous verrou par-org ──────────────────
-- Un verrou consultatif transaction-scoped (pg_advisory_xact_lock) sérialise
-- les uploads concurrents d'une MÊME org : deux requêtes ne peuvent plus lire
-- "sous la limite" en même temps puis insérer toutes les deux. Le verrou est
-- lié à la transaction du RPC (PostgREST) → libéré automatiquement au retour,
-- compatible avec le pooler transaction-mode de Supabase.
create or replace function public.insert_candidate_if_under_cv_quota(
  p_user_id uuid,
  p_org_id uuid,
  p_cv_file_name text,
  p_cv_file_size integer,
  p_cv_mime_type text,
  p_cv_limit integer
) returns public.candidates
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_active integer;
  v_row public.candidates;
begin
  perform pg_advisory_xact_lock(hashtext(p_org_id::text));

  -- CV actifs = total de l'org moins les doublons archivés (tag "ancien").
  -- tags NULL ou '{}' → non archivé → compté (aligné sur countActiveCvs()).
  select count(*) filter (where not coalesce(tags @> array['ancien']::text[], false))
    into v_active
  from public.candidates
  where organization_id = p_org_id;

  if v_active >= p_cv_limit then
    raise exception 'cv_quota_exceeded' using errcode = 'P0001';
  end if;

  insert into public.candidates
    (user_id, organization_id, cv_file_name, cv_file_size, cv_mime_type, parse_status)
  values
    (p_user_id, p_org_id, p_cv_file_name, p_cv_file_size, p_cv_mime_type, 'parsing')
  returning * into v_row;

  return v_row;
end $$;

revoke all on function public.insert_candidate_if_under_cv_quota(uuid, uuid, text, integer, text, integer) from public, anon, authenticated;
grant execute on function public.insert_candidate_if_under_cv_quota(uuid, uuid, text, integer, text, integer) to service_role;

-- ── 2) Compteur LLM : increment conditionnel atomique ────────────────────
-- UPDATE ... WHERE compteur < limite RETURNING : si la ligne est retournée
-- l'action est réservée atomiquement ; NULL = limite déjà atteinte (aucun
-- increment). Remplace le lire-comparer-écrire non atomique côté app.
create or replace function public.consume_org_llm_quota(
  p_org_id uuid,
  p_limit integer
) returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_new integer;
begin
  update public.organizations
  set llm_actions_this_month = llm_actions_this_month + 1
  where id = p_org_id
    and llm_actions_this_month < p_limit
  returning llm_actions_this_month into v_new;
  return v_new; -- NULL = limite atteinte (ou org introuvable)
end $$;

revoke all on function public.consume_org_llm_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_org_llm_quota(uuid, integer) to service_role;
