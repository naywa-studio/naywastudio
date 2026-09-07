-- 107 — Questions libres du formulaire public, rédigées par le recruteur
--
-- Complète 106 (catalogue fermé de champs connus) avec des questions dont le
-- TEXTE est écrit par le recruteur lui-même — pas une clé fermée, une chaîne
-- libre. Toujours obligatoires une fois ajoutées (même règle que le
-- catalogue : ce qui est demandé n'est jamais facultatif).
--
-- text[] plutôt qu'une table : l'ordre EST l'array (pas de colonne "order"
-- à maintenir), et il n'y a rien d'autre à stocker par question (pas de
-- type, pas de méta) — une table serait de la sur-ingénierie ici aussi.

begin;

alter table public.jobs
  add column if not exists apply_custom_questions text[] not null default '{}';

comment on column public.jobs.apply_custom_questions is
  'Questions libres rédigées par le recruteur pour /apply/[token] de cette mission. Chaque entrée devient un champ texte OBLIGATOIRE du formulaire public, dans cet ordre. Assaini par sanitizeApplyCustomQuestions (lib/apply-form-fields.ts) : max 5 questions, 300 caractères chacune.';

commit;
