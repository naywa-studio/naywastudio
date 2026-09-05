-- 104 — Slice 6.1 RGPD/E2 : formulaire public de candidature
--
-- ── jobs.apply_token ────────────────────────────────────────────────────
--
-- Un jeton opaque, unique, par mission — c'est lui qui identifie la mission
-- dans l'URL publique `/apply/[token]`, jamais l'UUID de la mission (qui
-- fuiterait l'organisation interne des IDs séquentiels/ordonnés dans le
-- temps). Généré par défaut à la création (DEFAULT), donc CHAQUE mission en
-- a un dès aujourd'hui — l'exposer dans l'UI reste une décision produit à
-- part, ce n'est pas parce que le jeton existe qu'un lien est déjà partagé.
--
-- Pas de politique de rotation en V1 : si un lien fuite, la seule parade est
-- de repasser la mission en 'draft'/'archived' (le contrôle d'accès se fait
-- sur jobs.status, pas sur le secret du jeton).
--
-- ── public_form_submissions ──────────────────────────────────────────────
--
-- Sert DEUX choses à la fois : la limitation de débit (rate-limit) par IP et
-- par email sur le formulaire public, ET la trace d'audit anti-abus. Pas de
-- RLS ouverte — cette table n'est JAMAIS lue/écrite autrement que par le
-- client admin, depuis la route serveur du formulaire (même pattern que
-- admin_audit_log : RLS activée, aucune policy authenticated/anon).
--
-- `ip_hash`, pas l'IP en clair : c'est une donnée personnelle au sens RGPD,
-- et on n'en a besoin que pour COMPTER, jamais pour l'identifier précisément
-- après coup. HMAC avec le même secret que les jetons candidat (voir
-- lib/candidate-privacy-token.ts) — non réversible sans le secret serveur.

begin;

alter table public.jobs
  add column if not exists apply_token text;

update public.jobs
set apply_token = encode(gen_random_bytes(16), 'hex')
where apply_token is null;

alter table public.jobs
  alter column apply_token set not null,
  alter column apply_token set default encode(gen_random_bytes(16), 'hex');

create unique index if not exists jobs_apply_token_key on public.jobs (apply_token);

comment on column public.jobs.apply_token is
  'Jeton opaque identifiant la mission dans /apply/[token]. Ne jamais exposer job.id publiquement à la place.';

create table if not exists public.public_form_submissions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ip_hash text not null,
  email text,
  candidate_id uuid references public.candidates (id) on delete set null,
  status text not null default 'accepted' check (status in ('accepted', 'rejected_rate_limit', 'rejected_honeypot', 'rejected_invalid')),
  created_at timestamptz not null default now()
);

alter table public.public_form_submissions enable row level security;
-- Aucune policy : accès exclusivement via le client admin (service_role),
-- jamais via authenticated/anon — cf. commentaire d'en-tête.

create index if not exists public_form_submissions_ip_idx
  on public.public_form_submissions (ip_hash, created_at desc);
create index if not exists public_form_submissions_job_email_idx
  on public.public_form_submissions (job_id, email, created_at desc)
  where email is not null;

comment on table public.public_form_submissions is
  'Rate-limit + audit du formulaire public de candidature (Slice 6.1). ip_hash jamais en clair. Pas de policy RLS — admin uniquement.';

commit;
