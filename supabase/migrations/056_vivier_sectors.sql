-- 056 — Secteurs du vivier (matching par périmètre)
--
-- Le vivier s'organise par SECTEUR. Un candidat porte 0..N secteurs (par nom),
-- avec un statut de classement (auto Nora / à classer / validé humain). Les
-- missions ciblent des secteurs, et "Matcher le vivier" gate le scoring dessus.
--
-- Règle fiabilité : un candidat "to_review" ou sans secteur n'est JAMAIS
-- exclu du matching (il flotte partout jusqu'à classement) → pas d'oubli
-- silencieux. C'est pourquoi le défaut est 'to_review'.

-- Liste canonique des secteurs par org (pour le picker + gestion).
create table if not exists public.sectors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  -- Qui a créé ce secteur : proposé par Nora ou saisi par le sourceur.
  created_by text not null default 'user' check (created_by in ('user', 'nora')),
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.sectors enable row level security;

drop policy if exists sectors_org_all on public.sectors;
create policy sectors_org_all on public.sectors
  for all
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());

create index if not exists sectors_org_idx on public.sectors (organization_id);

-- Secteurs + statut de classement sur le candidat.
alter table public.candidates
  add column if not exists sectors text[] not null default '{}',
  add column if not exists sector_status text not null default 'to_review'
    check (sector_status in ('auto', 'to_review', 'validated'));

comment on column public.candidates.sectors is 'Secteurs (par nom) du candidat. Multi-secteur autorisé (profils hybrides).';
comment on column public.candidates.sector_status is 'auto = proposé Nora non validé · to_review = à classer · validated = confirmé humain. to_review/vide = jamais exclu du matching.';

-- Secteurs cibles + mémo du dernier mode sur la mission.
alter table public.jobs
  add column if not exists target_sectors text[] not null default '{}',
  add column if not exists last_match_mode text
    check (last_match_mode is null or last_match_mode in ('intelligent', 'approfondi', 'complet'));

comment on column public.jobs.target_sectors is 'Secteurs cibles de la mission (définis à l''onboarding). Gate le "Matcher le vivier".';
comment on column public.jobs.last_match_mode is 'Dernier mode de match choisi : intelligent / approfondi / complet.';
