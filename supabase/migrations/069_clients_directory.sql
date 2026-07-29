-- 069 — Annuaire de clients (segment cabinet/ESN)
--
-- Un cabinet de recrutement / ESN / bureau d'étude travaille POUR des clients.
-- Cette table est l'annuaire org-scopé de ces clients. Une mission peut être
-- rattachée à un client (`jobs.client_id`). Fondation des lots suivants :
--   * off-limits (comparer l'employeur actuel d'un candidat à cet annuaire)
--   * feedback client + préférences récurrentes par client
--
-- `aliases` stocke les variantes de nom (ENGIE / Engie Solutions / GDF Suez)
-- pour fiabiliser la détection off-limits sans LLM au runtime.
--
-- Accès : org-scopé par RLS (comme sectors/jobs). Tout membre de l'org y a
-- accès en lecture/écriture via son org — l'autorisation applicative fine
-- (siège actif) est portée par requireActiveAccess côté route.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  -- Domaine principal du client (ex "engie.com"), optionnel. Sert de signal
  -- fort pour l'off-limits (email candidat @engie.com ↔ client engie.com).
  domain text,
  -- Variantes de nom connues, pour la détection off-limits (lot 2).
  aliases text[] not null default '{}',
  notes text,
  -- Auteur (auth.users). Pas de FK : les FK vers auth.users cassent
  -- l'auto-discovery des jointures Supabase. Hydratation manuelle si besoin.
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients enable row level security;

drop policy if exists clients_org_all on public.clients;
create policy clients_org_all on public.clients
  for all
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());

create index if not exists clients_org_idx on public.clients (organization_id);

-- Unicité insensible à la casse par org : évite « Engie » vs « engie ».
create unique index if not exists clients_org_name_lower_idx
  on public.clients (organization_id, lower(name));

-- Rattachement mission → client. NULL = mission sans client (équipe interne,
-- ou client pas encore renseigné). ON DELETE SET NULL : supprimer un client
-- ne détruit jamais les missions, il les détache.
alter table public.jobs
  add column if not exists client_id uuid references public.clients (id) on delete set null;

create index if not exists jobs_client_idx on public.jobs (client_id);

comment on table public.clients is 'Annuaire des clients d''une org (cabinet/ESN). Org-scopé RLS. Base off-limits + feedback client.';
comment on column public.clients.aliases is 'Variantes de nom pour la détection off-limits (ENGIE / Engie Solutions).';
comment on column public.jobs.client_id is 'Client concerné par la mission. NULL = sans client.';

-- Garde updated_at à jour sur UPDATE (réutilise le trigger générique si présent,
-- sinon défini ici).
create or replace function public.touch_clients_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_clients_updated_at on public.clients;
create trigger trg_touch_clients_updated_at
  before update on public.clients
  for each row execute function public.touch_clients_updated_at();
