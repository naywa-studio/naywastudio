-- 093 — La liste de suppression : les adresses qu'on ne recontacte plus.
--
-- ── Pourquoi elle manquait, et pourquoi ça comptait ──────────────────────
--
-- Une adresse qui rebondit définitivement pouvait être recontactée le
-- lendemain par un collègue de la même organisation, indéfiniment. Mauvais
-- pour le candidat, inutile pour le sourceur, et toxique pour la réputation
-- d'envoi — qui est PARTAGÉE entre tous les clients du compte SES.
--
-- ── Deux portées, et la distinction n'est pas cosmétique ─────────────────
--
--   `organization_id IS NULL`  = GLOBAL. Un rebond permanent dit que l'adresse
--   n'existe pas : c'est un fait sur l'adresse, pas sur une relation. Une
--   plainte pour indésirable est globale aussi, mais pour une autre raison —
--   elle pèse sur la réputation du COMPTE, donc sur tous les cabinets.
--
--   `organization_id` renseigné = propre à un cabinet. Un candidat qui demande
--   à ne plus être contacté s'adresse à CE cabinet-là. Le propager à tous
--   reviendrait à décider à sa place, et à faire fuiter une information d'un
--   cabinet vers un autre.
--
-- L'unicité passe par `coalesce` plutôt que par `nulls not distinct` : une
-- colonne nullable dans un index unique laisse passer autant de doublons
-- qu'on veut, et ce genre de trou ne se voit jamais — il produit juste une
-- table qui grossit et des vérifications qui ralentissent.

create table if not exists public.suppressed_addresses (
  id uuid primary key default gen_random_uuid(),
  /** NULL = suppression globale (rebond définitif, plainte). */
  organization_id uuid references public.organizations(id) on delete cascade,
  email text not null,
  reason text not null check (reason in ('bounce', 'complaint', 'unsubscribe', 'manual')),
  /** Détail lisible : le message d'AWS, ou la trace de l'action humaine. */
  detail text,
  created_at timestamptz not null default now()
);

create unique index if not exists suppressed_addresses_unique
  on public.suppressed_addresses (
    email,
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists suppressed_addresses_email_idx
  on public.suppressed_addresses (email);

alter table public.suppressed_addresses enable row level security;

-- Lecture : sa propre organisation, plus les suppressions globales. Aucune
-- policy d'écriture — la table n'est alimentée que par le service role, depuis
-- le webhook d'événements et la désinscription. Un client ne doit pas pouvoir
-- retirer une adresse que le fournisseur a déclarée invalide.
drop policy if exists suppressed_addresses_read on public.suppressed_addresses;
create policy suppressed_addresses_read on public.suppressed_addresses
  for select
  using (organization_id is null or organization_id = public.current_org_id());

comment on table public.suppressed_addresses is
  'Adresses à ne plus contacter. organization_id NULL = global (rebond, plainte) ; renseigné = désinscription auprès d''un cabinet.';
