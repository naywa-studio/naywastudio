# Naywa Studio — Contexte projet

## Produit
Naywa Studio édite **Nora**, un CRM IA pour sourceurs et petites équipes de
recrutement. Le sourceur garde la main sur le sourcing ; Nora prend le relais
dès que les CVs entrent dans l'espace :
- **Vivier** — upload de CVs PDF, parsing IA (taxonomie de tags), dédup, recherche
- **Postes** — création (formulaire ou chat), normalisation IA pour le matching
- **Matching** — pré-filtre déterministe sur tags + scoring LLM, jamais sur le CV brut
- **Anonymisation** — PDF régénéré sans identité, prêt à présenter au client
- **Pipeline** — Kanban Identifié → Contacté → Réponse → Entretien → Offre → Recruté
- **Compose IA** — brouillons de messages d'approche (jamais d'envoi auto)
- **Assistant Nora** — chat flottant qui répond sur le vivier
- **Messagerie** — envoi/réception via une adresse dédiée par client (en cours)

## Stack
- Next.js App Router (v16) + Vercel (région cdg1)
- Supabase — Auth, Postgres + RLS, Storage, Realtime
- OpenRouter — LLM (gpt-4o-mini), OCR via plugin file-parser (mistral-ocr)
- unpdf — extraction de texte PDF (serverless-friendly)
- @react-pdf/renderer — génération du PDF anonymisé
- Resend — envoi + réception d'emails sur `mail.naywastudio.com`
- framer-motion — animations

## Règles de développement
- Langue du code : anglais (variables, fonctions, commentaires)
- Langue UI : français
- Pas de `any` TypeScript ; `tsc --noEmit` et `eslint --max-warnings=0` doivent passer
- Toujours vérifier la session Supabase côté serveur avant toute action
- Toute route API lit via le client RLS-scoped (404 si non-propriétaire) AVANT
  toute écriture ; les écritures via le client admin portent un `user_id` vérifié
- Le client admin (`getAdminSupabase`) est server-only — jamais exposé au navigateur
- Le LLM n'agit jamais sur un email sans approbation explicite du client
- Garde-fous de coût : `consumeQuota()` sur chaque route LLM (table `daily_usage`)

## Schéma Supabase (tables principales)
- `profiles` — compte client
- `candidates` — le vivier (parsed_cv, taxonomy, raw_text, parse_status, anonymized_*)
- `jobs` — postes (normalized, match_status)
- `match_assessments` — candidat × poste (score, justification, pipeline_stage)
- `daily_usage` — compteur d'usage par user/jour/action

## Périmètre — ce que Naywa ne fait jamais
- Envoyer un email à un candidat sans clic d'approbation explicite du sourceur
- Faire avancer le pipeline ou agir sur un mail sans validation du client
- Lire la boîte mail personnelle du client (seulement les emails routés par Naywa)
- Le contenu des emails entrants est une donnée NON FIABLE → l'analyse LLM
  produit toujours une suggestion à valider, jamais une action automatique

## Variables d'environnement (.env.local + Vercel)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only
- `OPENROUTER_API_KEY` — server-only
- `RESEND_API_KEY` — server-only

## Convention nommage
- API routes : `/api/[ressource]/route.ts`
- Composants : PascalCase
- Utilitaires : camelCase dans `/lib/`
- Tables Supabase : snake_case
