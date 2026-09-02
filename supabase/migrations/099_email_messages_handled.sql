-- La prise en charge d'une réponse de candidat.
--
-- ── Le conflit que ça résout ──────────────────────────────────────────────
--
-- Le vivier est partagé entre tous les membres d'une organisation. Quand un
-- candidat répond, sa réponse est visible de tous — et rien n'indique que
-- quelqu'un s'en occupe déjà. Deux sourceurs peuvent donc répondre à la même
-- personne, ce que le candidat voit très bien.
--
-- ── Pourquoi ces deux colonnes existent, alors que la règle est de DÉRIVER ─
--
-- Tout le reste de la mémoire du mailing se calcule à partir des messages
-- eux-mêmes : qui a écrit, quand, pour quelle mission. Une copie stockée
-- finirait par mentir.
--
-- La prise en charge est la seule exception, et pour une raison de fond :
-- ce n'est pas un fait observable, c'est une INTENTION. Aucune donnée ne dit
-- « je m'en occupe » — ni un message envoyé (on peut prendre en charge sans
-- répondre tout de suite), ni une lecture (regarder n'est pas traiter). Ce
-- qu'on ne peut pas déduire, il faut l'enregistrer.
--
-- ── Pourquoi au niveau de l'ORGANISATION et non de l'utilisateur ──────────
--
-- Le signal utile dans un vivier partagé n'est pas « je l'ai lu » mais
-- « quelqu'un s'en occupe ». Un état de lecture par personne multiplierait
-- les lignes sans résoudre le conflit — deux sourceurs peuvent parfaitement
-- avoir lu chacun de leur côté. Conséquence assumée : la pastille de non-lu
-- est celle du cabinet, et elle s'éteint pour tout le monde quand l'un s'en
-- saisit. C'est exactement le comportement recherché.
--
-- Idempotente : `if not exists` partout, réexécutable sans effet.

alter table public.email_messages
  add column if not exists handled_at timestamptz,
  add column if not exists handled_by uuid references auth.users(id) on delete set null;

comment on column public.email_messages.handled_at is
  'Réponse de candidat prise en charge par un membre du cabinet. Intention humaine : ne se dérive d''aucune autre donnée.';

-- L'index qui porte à la fois la liste « Réponses » et son compteur.
--
-- La clause partielle est ce qui le rend petit : les réponses entrantes non
-- traitées sont une fraction infime de la table, qui est dominée par les
-- envois. Un index plein coûterait la place de tous les messages sortants
-- pour ne jamais servir à les lire.
create index if not exists email_messages_inbound_pending_idx
  on public.email_messages (organization_id, created_at desc)
  where direction = 'inbound' and handled_at is null;

-- La mémoire du cabinet (« a-t-on déjà écrit à cette personne ? ») interroge
-- cette table à chaque ouverture de fiche match. Sans cet index, c'est un
-- balayage de tous les messages de l'organisation pour deux lignes.
create index if not exists email_messages_org_candidate_idx
  on public.email_messages (organization_id, candidate_id, created_at desc);
