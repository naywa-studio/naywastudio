# Naywa Studio — Contexte projet

## Positionnement produit
Naywa Studio propose des **packages métier** qui intègrent l'IA dans les processus
d'entreprise. Le **Package Sourcing** est le premier package — il permet aux sourceurs
et petites équipes de recrutement de déléguer la partie traitement à l'IA tout en
gardant la main sur les décisions.

Le Package Sourcing se décline en 3 niveaux (agents) :
- **Léo** — recherche de profils publics → tableur structuré
- **Nora** — sourcing complet + scoring + messages personnalisés (le plus demandé)
- **Alex** — pipeline complet jusqu'à la réservation de créneau

## Produit actif — Nora CRM
L'espace workspace est le CRM IA de Nora. Le sourceur garde la main ; Nora s'occupe
du traitement dès qu'un CV entre dans l'espace.

### Fonctionnalités actives (sprints 0 → 6)
- **Vivier** — upload CVs PDF, parsing IA (OCR + LLM), taxonomy de tags, dédup, recherche full-text
- **Missions** (ex-Postes — orienté ESN / appel d'offre) — création (formulaire ou chat IA), normalisation LLM pour le matching, **TJM client + marge min + durée prévue** pour le pricing
- **Matching** — pré-filtre déterministe sur tags + scoring LLM (jamais sur le CV brut)
- **Anonymisation** — PDF régénéré sans identité via `@react-pdf/renderer`
- **Pipeline** — Kanban : Identifié → Contacté → Réponse → Entretien → Offre → Recruté
- **Compose IA** — brouillons de messages d'approche (jamais d'envoi auto)
- **Assistant Nora** — chat flottant (`NoraAssistant`) qui répond sur le vivier
- **Email tracking V1** — envoi outbound Resend + réception inbound webhook + analyse LLM suggestion

### Roadmap sprints
| Sprint | Durée | Statut |
|--------|-------|--------|
| 0 — Cleanup | 1-2j | ✅ Done |
| 1 — CV upload + parse | 3-4j | ✅ Done |
| 2 — Jobs + matching | 3-4j | ✅ Done |
| 3 — Anonymisation | 2-3j | ✅ Done |
| 4 — Pipeline manuel | 2j | ✅ Done |
| 5 — Compose IA | 2-3j | ✅ Done |
| 6 — Email tracking V1 (BCC) | 3-4j | ✅ Code done — webhook Resend à activer |
| 7 — Email tracking V2 (Gmail OAuth) | 5-7j | 🔜 À venir |

### État Sprint 6 — ce qui reste
Le code `/api/inbound-email` est **complet** (vérification signature svix, matching candidat,
analyse LLM, log `email_messages`). Il manque uniquement :
1. Créer le webhook Resend avec les 4 événements : `email.received`, `email.delivered`, `email.bounced`, `email.delivery_delayed`
2. Ajouter `RESEND_WEBHOOK_SECRET` dans les variables d'environnement Vercel
3. Redéployer + tester la boucle complète (envoi → réception → log pipeline)

## Stack
- **Next.js 16** App Router + TypeScript strict — Vercel (région cdg1)
- **Supabase** — Auth (email + Google OAuth), Postgres + RLS, Storage
- **OpenRouter** — LLM (`gpt-4o-mini`), OCR via plugin file-parser (`mistral-ocr`)
- **unpdf** — extraction texte PDF côté serveur (serverless-safe)
- **@react-pdf/renderer** — génération PDF anonymisé
- **Resend** — envoi + réception emails sur `mail.naywastudio.com`
- **svix** — vérification signature webhook Resend
- **framer-motion** — animations (`LazyMotion` + `domAnimation`, import via `m` pas `motion`)

## Commandes
```bash
npm run dev      # serveur local
npm run build    # build production (doit passer sans erreur)
npm run lint     # ESLint --max-warnings=0
```

## Architecture — Pages

### Marketing (public)
- `/` — homepage (Hero, WhyNawa, AgentsPreview, HowItWorks, FinalCTA)
- `/catalogue` — catalogue Léo/Nora/Alex avec tableau comparatif
- `/tarifs` — pricing
- `/faq` — FAQ
- `/mentions-legales` — mentions légales
- `/comment-ca-marche` — explication du fonctionnement

### Auth (public)
- `/login` — connexion + inscription (toggle `?mode=signup`)
- `/signup` — redirect server-side vers `/login?mode=signup`
- `/auth/callback` — callback Supabase OAuth

### Workspace (protégé via `proxy.ts`)
- `/workspace` — dashboard accueil
- `/workspace/vivier` — liste candidats
- `/workspace/vivier/[candidateId]` — fiche candidat complète
- `/workspace/missions` — liste missions (anciennement "postes")
- `/workspace/missions/[jobId]` — fiche mission + matching
- `/workspace/pipeline` — kanban pipeline

## Architecture — API Routes

| Route | Rôle |
|---|---|
| `POST /api/cv/upload` | Upload CV → Storage + insert `candidates` |
| `POST /api/cv/[id]/parse` | Parsing LLM (unpdf + OpenRouter) |
| `POST /api/cv/[id]/anonymize` | Génère PDF anonymisé |
| `GET /api/cv/[id]/signed-url` | URL signée Supabase Storage |
| `POST /api/cv/[id]/compose` | Génère message d'approche IA |
| `POST /api/cv/[id]/send` | Envoie email via Resend (BCC optionnel) |
| `GET/POST /api/jobs` | Liste / crée un poste |
| `GET/PATCH/DELETE /api/jobs/[id]` | Fiche poste CRUD |
| `POST /api/jobs/[id]/match` | Lance matching candidats × poste |
| `POST /api/jobs/chat` | Chat IA pour créer un poste |
| `PATCH /api/match/[id]/stage` | Met à jour le stage pipeline |
| `POST /api/assistant` | Chat Nora (contexte vivier) |
| `POST /api/subscribe` | Flow souscription |
| `POST /api/inbound-email` | Webhook Resend — inbound + delivery tracking |

## Architecture — Lib (`src/lib/`)

| Fichier | Rôle |
|---|---|
| `supabase.ts` | Client browser (`createBrowserClient` de `@supabase/ssr`, cookie-based) |
| `supabase-server.ts` | Client server RSC/actions (`createServerClient`) |
| `admin-supabase.ts` | Client admin service-role — **server-only, jamais exposé browser** |
| `database.types.ts` | Types complets DB + `CANDIDATE_COLUMNS` + alias métier |
| `cv-parser.ts` | Parsing CV : unpdf → texte → OpenRouter → `ParsedCv` + `CandidateTaxonomy` |
| `matching.ts` | Score LLM candidat × poste → `ScoreDimensions` + `match_tier` |
| `openrouter.ts` | Wrapper appels LLM (OpenRouter) |
| `quota.ts` | `consumeQuota()` — vérifie et incrémente `daily_usage` avant chaque appel LLM |
| `resend.ts` | Envoi emails + `ensureInboxAddress()` + `fromHeader()` |
| `anonymized-cv.tsx` | Composant `@react-pdf/renderer` pour le PDF anonymisé |

## Schéma Supabase

### Tables
- `profiles` — compte client (`subscription_level: 'leo'|'nora'|'alex'|null`, `inbox_address`, `inbox_cc_self`, `workspace_memory`, etc.)
- `candidates` — le vivier (`parsed_cv: ParsedCv`, `taxonomy: CandidateTaxonomy`, `parse_status`, `anonymized_pdf_path`, `outreach_draft`, `outreach_meta`)
- `jobs` — missions (`normalized: JobNormalized`, `match_status`, **pricing**: `client_tjm_min`/`client_tjm_max`/`margin_min_pct`/`duration_months`)
- `match_assessments` — candidat × poste (`score`, `score_dimensions`, `match_tier`, `pipeline_stage`)
- `daily_usage` — quota LLM par user/jour/action
- `email_messages` — emails outbound + inbound (`ai_sentiment`, `ai_summary`, `ai_suggested_stage`)

### Types clés exportés
```ts
Profile, Job, Candidate, MatchAssessment, EmailMessage
JobStatus, ParseStatus, PipelineStage, MatchTier, EmailDirection, EmailSentiment
CANDIDATE_COLUMNS  // select sans raw_text + search_tsv
```

### Fonction RPC
- `bump_usage(p_user, p_action)` → incrémente `daily_usage`, retourne le count

## Protection des routes
`src/proxy.ts` (pas `middleware.ts` — Next.js 16) protège `/workspace/*`.
Redirige vers `/login?next=[path]` si pas de session.

## WorkspaceContext
```ts
interface WorkspaceCtx {
  profile: Profile | null
  userEmail: string
  hasSubscription: boolean
  refetchProfile: () => Promise<void>
}
// Hook : useWorkspace()
// Tabs : Accueil | Vivier | Missions | Pipeline
```

## Règles de développement
- Langue du code : **anglais** (variables, fonctions, commentaires)
- Langue UI : **français**
- Pas de `any` TypeScript — `tsc --noEmit` et `eslint --max-warnings=0` doivent passer
- Toujours vérifier la session Supabase côté serveur avant toute action
- Toute route API : lire via client RLS-scoped (→ 404 si non-propriétaire) **avant** toute écriture
- `getAdminSupabase()` est **server-only** — jamais exposé au navigateur
- `consumeQuota()` **obligatoire** sur chaque route LLM
- Le LLM n'agit jamais sans approbation explicite du client

## Périmètre — ce que Naywa ne fait jamais
- Envoyer un email à un candidat sans clic d'approbation explicite du sourceur
- Faire avancer le pipeline sans validation du client
- Lire la boîte mail personnelle du client
- Les emails entrants sont **NON FIABLES** → analyse LLM = suggestion uniquement, jamais action auto

## Variables d'environnement (`.env.local` + Vercel)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only
- `OPENROUTER_API_KEY` — server-only
- `RESEND_API_KEY` — server-only
- `RESEND_WEBHOOK_SECRET` — server-only (à ajouter sur Vercel, commence par `whsec_`)

## Design system
- Thème : clair — fond `#FFFFFF`, surface `#F8F6FF`
- Couleur primaire : `#7C63C8` (violet-indigo), secondaire : `#B8AEDE`
- Fonts : `Space Grotesk` (`--font-space-grotesk`) + `Inter` (`--font-inter`)
- Animations : `viewport={{ once: true }}`, easing `[0.22, 1, 0.36, 1]`
- Jamais bounce ni elastic dans les transitions
- Tailwind uniquement — pas de librairies CSS externes

## Convention nommage
- API routes : `/api/[ressource]/route.ts`
- Composants : PascalCase
- Utilitaires : camelCase dans `/lib/`
- Tables Supabase : snake_case

## Skills design disponibles
| Skill | Quand l'utiliser |
|---|---|
| `/frontend-design` | Créer/refaire un composant avec forte direction visuelle |
| `/critique` | Score UX + anti-patterns |
| `/normalize` | Aligner sur le design system |
| `/polish` | Passe finale avant livraison |
| `/adapt` | Rendre responsive / mobile |
| `/colorize` | Retravailler la palette |
| `/emil-design-eng` | Animations, micro-interactions avancées |
