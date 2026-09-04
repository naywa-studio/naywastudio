-- Une adresse de réponse par (sourceur, mission).
--
-- ── Le problème, en une phrase ────────────────────────────────────────────
--
-- Il faut savoir de QUELLE conversation une réponse relève, sans afficher au
-- candidat quelque chose qui ressemble à un mouchard.
--
-- Trois pistes ont été essayées avant celle-ci :
--
--   1. un jeton dans l'adresse — certain, mais
--      `elyas+97w26uu2@reply.naywastudio.com` est visible dans le champ
--      « répondre à » du candidat, sur un message dont tout l'enjeu est
--      d'inspirer confiance ;
--   2. `In-Reply-To` — invisible ET certain, mais il exige de connaître
--      l'identifiant RFC de notre propre envoi. Gmail et Graph ne le rendent
--      pas et écrasent celui qu'on poserait : la PREMIÈRE réponse d'un
--      candidat, la plus importante, resterait non rattachée ;
--   3. le rapprochement par l'objet — lisible et efficace dès la première
--      réponse, mais faillible : deux missions au même intitulé ne peuvent
--      pas être départagées.
--
-- ── La solution : arrêter de cacher l'identifiant, le rendre lisible ──────
--
--   elyas.commercial-immobilier@reply.naywastudio.com
--
-- L'adresse EST l'identifiant. Correspondance exacte, aucune déduction, aucun
-- cas limite — et elle ne ressemble pas à un traceur, parce que c'est
-- réellement une adresse de recrutement.
--
-- Rien n'est divulgué au candidat : il est contacté POUR cette mission, et
-- l'objet du message la nomme déjà.
--
-- ── Pourquoi une table, et pas une colonne sur `jobs` ─────────────────────
--
-- L'adresse dépend du couple (sourceur, mission) : deux sourceurs écrivant
-- pour la même mission ont chacun la leur. Et surtout, une table permet
-- l'index UNIQUE sur l'adresse — c'est lui qui départage deux missions au
-- même intitulé, là où l'objet ne pouvait pas. La deuxième prend `-2`.
--
-- ── Coût côté SES : nul ───────────────────────────────────────────────────
--
-- La réception est facturée au message, jamais à l'adresse, et la règle de
-- réception porte sur le domaine entier. Mille adresses ou une, même prix.
--
-- Idempotente.

create table if not exists public.mailing_inbox_aliases (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  job_id          uuid not null references public.jobs(id) on delete cascade,
  address         text not null,
  created_at      timestamptz not null default now()
);

comment on table public.mailing_inbox_aliases is
  'Adresse de réponse dédiée à un couple (sourceur, mission). Sa correspondance exacte rattache une réponse entrante à la bonne conversation, sans jeton visible par le candidat.';

-- Le cœur du mécanisme : c'est cet index qui rend le rattachement infaillible
-- ET qui départage deux missions au même intitulé.
create unique index if not exists mailing_inbox_aliases_address_key
  on public.mailing_inbox_aliases (lower(address));

-- Un sourceur n'a qu'une adresse par mission : la seconde demande renvoie la
-- même, elle ne doit pas en créer une nouvelle à chaque envoi.
create unique index if not exists mailing_inbox_aliases_user_job_key
  on public.mailing_inbox_aliases (user_id, job_id);

alter table public.mailing_inbox_aliases enable row level security;

-- Lecture org-scopée, comme le reste du produit. L'écriture passe par le
-- client admin depuis la route d'envoi : personne n'a de raison de fabriquer
-- une adresse de réception depuis le navigateur, et pouvoir le faire
-- permettrait de détourner les réponses d'un collègue.
drop policy if exists "aliases_select_own_org" on public.mailing_inbox_aliases;
create policy "aliases_select_own_org" on public.mailing_inbox_aliases
  for select using (organization_id = public.current_org_id());
