-- 096 — Les boîtes mail connectées par les sourceurs (OAuth Google, puis Microsoft).
--
-- ── Pourquoi une table, et pas des colonnes sur `profiles` ───────────────
--
-- Parce qu'un sourceur peut, à terme, connecter plus d'une boîte : la sienne
-- et une adresse d'équipe partagée. Poser `google_refresh_token` sur
-- `profiles` rendrait ce cas impossible sans migration, et mêlerait des
-- secrets à une table lue partout dans l'application.
--
-- ── Le jeton est CHIFFRÉ, et ce n'est pas décoratif ──────────────────────
--
-- Un jeton de rafraîchissement Google permet d'envoyer des emails au nom de
-- quelqu'un, indéfiniment. C'est, de loin, le secret le plus sensible que
-- Naywa ait jamais stocké — plus qu'un mot de passe, qui lui expire et se
-- change. Il n'est donc jamais écrit en clair : le chiffrement se fait dans
-- l'application (`lib/mailing/token-crypto.ts`), pas en base.
--
-- ── Aucune policy de lecture, volontairement ─────────────────────────────
--
-- RLS activée SANS policy `select` : même le propriétaire de la ligne ne peut
-- pas lire son propre jeton depuis le navigateur. Seul le service role y
-- accède, côté serveur, au moment d'envoyer. L'interface a besoin de savoir
-- QUELLE adresse est connectée et si elle fonctionne — pas du secret.
-- C'est ce que sert la vue `connected_mailboxes_public`.

create table if not exists public.connected_mailboxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  /** L'adresse telle que le fournisseur la connaît — c'est elle qui enverra. */
  email text not null,
  /** Chiffré applicativement. JAMAIS en clair. */
  refresh_token_encrypted text not null,
  /** 'active' | 'needs_reconnect' — un jeton meurt sans prévenir (mot de passe
   *  changé, révocation, politique du tenant), et ça doit se VOIR. */
  status text not null default 'active' check (status in ('active', 'needs_reconnect')),
  /** Dernière erreur du fournisseur, pour expliquer au sourceur. */
  last_error text,
  connected_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- Une seule connexion par (utilisateur, fournisseur, adresse) : reconnecter
-- doit REMPLACER, pas empiler. Sans ça, on accumulerait des jetons morts dont
-- on ne saurait plus lequel est le bon.
create unique index if not exists connected_mailboxes_unique
  on public.connected_mailboxes (user_id, provider, email);

create index if not exists connected_mailboxes_org_idx
  on public.connected_mailboxes (organization_id);

alter table public.connected_mailboxes enable row level security;
-- Pas de policy : aucune lecture ni écriture depuis un JWT utilisateur.

comment on table public.connected_mailboxes is
  'Boites mail connectees en OAuth. Jeton chiffre applicativement, jamais lisible depuis le navigateur.';
