-- Le jeton court qui identifie une conversation dans l'adresse de réponse.
--
-- ── Pourquoi remplacer l'identifiant encodé ───────────────────────────────
--
-- L'adresse portait jusqu'ici l'identifiant du match encodé en base32, soit
-- 26 caractères : `elyas+gd7db5hgpbgwbdoybyd6urs4uu@reply.naywastudio.com`.
-- Ça fonctionnait — et c'était **visible par le candidat**, dans le champ
-- « répondre à » de son message. Une adresse qui ressemble à une clé de
-- chiffrement fait douter de l'expéditeur, et c'est précisément la confiance
-- du candidat que tout cet add-on cherche à préserver.
--
-- Un jeton de 8 caractères tiré au sort donne
-- `elyas+k3f9d2a7@reply.naywastudio.com`, qui se lit comme une adresse de
-- suivi ordinaire.
--
-- ── Pourquoi STOCKER au lieu de dériver, cette fois ───────────────────────
--
-- La règle du chantier est de dériver. Mais raccourcir un identifiant le rend
-- irréversible : on ne peut plus retrouver le match à partir du jeton, il faut
-- une correspondance. C'est un identifiant, pas un état dupliqué — au même
-- titre que `rfc_message_id` : rien à désynchroniser, puisque rien n'est
-- recalculable ailleurs.
--
-- L'unicité est garantie par l'index, pas par la probabilité : 8 caractères
-- sur un alphabet de 31 font environ 10^12 combinaisons, mais un index unique
-- transforme une collision improbable en erreur d'écriture visible plutôt
-- qu'en réponse silencieusement rattachée à la mauvaise conversation.
--
-- Nullable et rempli au premier envoi : rien à reprendre sur l'existant.
--
-- Idempotente.

alter table public.match_assessments
  add column if not exists reply_token text;

comment on column public.match_assessments.reply_token is
  'Jeton court porté par l''adresse de réponse (sophie+<jeton>@…), qui rattache une réponse entrante à cette conversation. Posé au premier envoi.';

-- Partiel : seules les lignes qui en ont un sont indexées, et les millions de
-- matchs jamais contactés ne coûtent rien.
create unique index if not exists match_assessments_reply_token_key
  on public.match_assessments (reply_token)
  where reply_token is not null;
