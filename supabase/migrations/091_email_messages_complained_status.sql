-- 091 — Une plainte n'est pas un rebond, et n'avait pas d'état.
--
-- `email_messages.status` porte une contrainte CHECK fermée. Y écrire
-- « complained » sans l'ouvrir d'abord échouerait à l'insertion — bruyamment,
-- mais dans un webhook, donc dans les journaux d'AWS et nulle part ailleurs.
--
-- La distinction compte pour le sourceur : un rebond veut dire « personne n'a
-- rien reçu », une plainte veut dire « il a reçu et il a signalé comme
-- indésirable ». La conduite à tenir n'est pas la même — et la seconde pèse
-- beaucoup plus lourd sur la réputation du compte d'envoi.

alter table public.email_messages
  drop constraint if exists email_messages_status_check;

alter table public.email_messages
  add constraint email_messages_status_check
  check (status = any (array[
    'sent'::text,
    'delivered'::text,
    'received'::text,
    'failed'::text,
    'bounced'::text,
    'complained'::text
  ]));
