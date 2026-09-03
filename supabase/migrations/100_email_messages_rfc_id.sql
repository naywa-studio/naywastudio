-- L'identifiant RFC du message, pour répondre DANS le fil du candidat.
--
-- ── Le défaut que ça corrige ──────────────────────────────────────────────
--
-- Dans Naywa, le fil d'un candidat était parfait. Chez le candidat, non :
-- `lib/mailing/inbound.ts` lisait déjà le `Message-ID` et la chaîne
-- `References` de chaque message entrant — et personne ne les stockait. Aucun
-- envoi ne posait donc `In-Reply-To`, et nos réponses arrivaient chez lui
-- comme des messages neufs, à côté de l'échange en cours.
--
-- Rien n'échouait, et c'était invisible depuis le workspace : le seul endroit
-- où le défaut se voyait, c'était la boîte du candidat.
--
-- ── Pourquoi une colonne, alors que la règle est de DÉRIVER ───────────────
--
-- Ce n'est pas un état dérivable : c'est une donnée que le client de
-- messagerie du candidat nous a transmise et que nous jetions. On la garde,
-- on ne la calcule pas.
--
-- ⚠️ À ne pas confondre avec `provider_id`, qui porte l'identifiant SES ou
-- Gmail — utile pour rapprocher les accusés de réception, inutilisable pour
-- le chaînage RFC. Deux identifiants, deux usages.
--
-- Idempotente : réexécutable sans effet.

alter table public.email_messages
  add column if not exists rfc_message_id text;

comment on column public.email_messages.rfc_message_id is
  'En-tête Message-ID du message entrant, renvoyé en In-Reply-To pour que nos réponses restent dans le fil du candidat. Distinct de provider_id (identifiant du fournisseur).';
