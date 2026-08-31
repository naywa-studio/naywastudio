-- 100 — Slice 2 RGPD : historique des actions candidat + colonne d'anonymisation
--
-- Complète 098 (fix prod adopté) + 099 (colonnes rétention + last_contact_at)
-- avec ce qu'il faut pour les actions recruteur sur la fiche candidat :
-- exporter, supprimer, anonymiser (RGPD), retirer du vivier, s'opposer au
-- contact, et un historique traçable de tout ça.
--
-- ── candidate_rgpd_log ────────────────────────────────────────────────────
--
-- Org-scopée comme `clients`/`sectors` (RLS `for all` en lecture SEULEMENT —
-- l'écriture passe par les routes serveur via le client admin, après
-- vérification d'appartenance côté RLS sur `candidates`, même pattern que
-- `DELETE /api/cv/[id]`).
--
-- `candidate_id` est en ON DELETE SET NULL, pas CASCADE : supprimer un
-- candidat (RGPD ou purge auto) ne doit PAS effacer la trace qu'on l'a fait —
-- c'est tout l'intérêt d'un historique. `candidate_ref` capture la réf
-- lisible (candidateRefLabel) AU MOMENT de l'action pour que le log reste
-- compréhensible même quand candidate_id est devenu NULL.
create table if not exists public.candidate_rgpd_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  candidate_id uuid references public.candidates (id) on delete set null,
  candidate_ref text not null,
  action text not null check (action in (
    'export', 'delete', 'anonymize', 'consent_granted', 'consent_revoked',
    'opt_out_contact', 'auto_purged'
  )),
  -- NULL = action système (cron de purge par rétention expirée).
  actor_user_id uuid references public.profiles (user_id) on delete set null,
  detail text,
  created_at timestamptz not null default now()
);

alter table public.candidate_rgpd_log enable row level security;

drop policy if exists candidate_rgpd_log_org_select on public.candidate_rgpd_log;
create policy candidate_rgpd_log_org_select on public.candidate_rgpd_log
  for select
  using (organization_id = public.current_org_id());

-- Pas de policy insert/update/delete pour `authenticated` : ces lignes
-- s'écrivent UNIQUEMENT depuis les routes serveur via le client admin
-- (service_role, qui bypass RLS), après une vérification d'appartenance
-- faite en amont sur `candidates`. Un utilisateur ne doit jamais pouvoir
-- écrire ou falsifier son propre historique RGPD.

create index if not exists candidate_rgpd_log_org_idx
  on public.candidate_rgpd_log (organization_id, created_at desc);
create index if not exists candidate_rgpd_log_candidate_idx
  on public.candidate_rgpd_log (candidate_id)
  where candidate_id is not null;

comment on table public.candidate_rgpd_log is
  'Historique traçable des actions RGPD sur un candidat (export/suppression/anonymisation/consentement/opposition). Survit à la suppression du candidat (candidate_id nullable).';

-- ── Anonymisation RGPD (scrub PII, ligne conservée pour les stats) ─────────
--
-- Distincte de `candidates.anonymized_at` (déjà utilisée par le produit pour
-- "un CV anonymisé a été généré pour présentation à un client" — même mot,
-- sens totalement différent). Ne PAS réutiliser cette colonne : ça
-- confondrait deux fonctionnalités sans rapport.
alter table public.candidates
  add column if not exists rgpd_anonymized_at timestamptz;

comment on column public.candidates.rgpd_anonymized_at is
  'Horodatage du scrub RGPD (nom/email/tel/CV vidés, ligne conservée pour les stats agrégées). Distinct de anonymized_at (document remis au client, feature produit sans rapport).';
