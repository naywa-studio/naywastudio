-- 105 — Slice 6.2 : ajoute 'rectification' aux actions journalisables
--
-- La page self-service candidat (/privacy-request/[token]) permet de
-- corriger ses propres coordonnées — un type d'action qui n'existait pas
-- dans la Slice 2 (recruteur uniquement : export/delete/anonymize/
-- consentement/opposition). Postgres n'autorise pas d'ALTER sur un CHECK
-- existant : on le retire et le repose avec la valeur en plus.

begin;

alter table public.candidate_rgpd_log
  drop constraint if exists candidate_rgpd_log_action_check;

alter table public.candidate_rgpd_log
  add constraint candidate_rgpd_log_action_check
  check (action in (
    'export', 'delete', 'anonymize', 'consent_granted', 'consent_revoked',
    'opt_out_contact', 'auto_purged', 'rectification'
  ));

commit;
