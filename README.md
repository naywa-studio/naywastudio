# Naywa Studio

> **Le SaaS qui aide les cabinets de recrutement à gérer leur vivier, leurs missions et leurs chiffrages avec une IA qui propose — vous décidez.**

Multi-utilisateur cabinet par cabinet, **Nora** (l'assistante IA) range les CVs en zones métier, score chaque candidat sur chaque mission, prépare les messages d'approche et calcule la marge selon Syntec. Elle ne déclenche **aucune** action sur un candidat sans clic d'approbation du sourceur.

🌐 **Production** : [naywastudio.com](https://naywastudio.com)

---

## Sommaire

- [Aperçu produit](#aperçu-produit)
- [Stack technique](#stack-technique)
- [Lancer en local](#lancer-en-local)
- [Architecture rapide](#architecture-rapide)
- [Variables d'environnement](#variables-denvironnement)
- [Migrations DB](#migrations-db)
- [Déploiement Vercel](#déploiement-vercel)
- [Conventions code](#conventions-code)
- [Garde-fous produit](#garde-fous-produit)
- [Pour les contributeurs](#pour-les-contributeurs)

---

## Aperçu produit

| Module | Quoi |
|---|---|
| **Vivier** | Upload CVs PDF, parsing IA (OCR + LLM), clustering Nora en zones métier (vivier vivant, manifestes persistés) |
| **Missions** | Création par brief texte → LLM extrait les champs → formulaire pré-rempli éditable. Re-matching auto à l'édition. |
| **Matching** | Pré-filtre déterministe sur tags + scoring LLM (jamais sur CV brut), pipeline Kanban manuel |
| **Pricing** | Engine Syntec maison (charges par statut, plafonds URSSAF, calendrier fériés FR). Live save par candidat × mission, export PDF nominatif ou anonymisé. |
| **Cabinet** | Multi-user (owner + members), invitations email avec token signé, sièges Package Sourcing alloués individuellement, suppression cabinet avec grace period 30 j |
| **Email tracking** | Envoi via Resend depuis `mail.naywastudio.com`, réception webhook avec signature svix, analyse LLM (sentiment + suggestion de stage pipeline) |

---

## Stack technique

| Couche | Technologie |
|---|---|
| **Framework** | Next.js 16 App Router + TypeScript strict |
| **DB + Auth** | Supabase (Postgres + RLS org-scopée + Storage + Auth email/Google) |
| **LLM** | OpenRouter (`gpt-4o-mini`) + plugin OCR `mistral-ocr` |
| **PDF** | unpdf (extraction) + @react-pdf/renderer (génération anonymisée + fiche pricing) |
| **Email** | Resend (SMTP auth Supabase + envoi/réception applicatif) + svix (signature webhook) |
| **Animations** | Framer Motion (`LazyMotion` + `m`) |
| **Hébergement** | Vercel (région `cdg1` — Paris) |

---

## Lancer en local

```bash
# 1. Cloner
git clone https://github.com/elyasmalki1003-cell/naywastudio.git
cd nawa-studio

# 2. Installer
npm install

# 3. Variables d'environnement
cp .env.local.example .env.local
# Renseigner les valeurs (voir section ci-dessous)

# 4. DB Supabase
# Soit pointer NEXT_PUBLIC_SUPABASE_URL vers une instance existante (recommandé pour Naywa),
# soit lancer Supabase local (https://supabase.com/docs/guides/cli/local-development)
# Les migrations sont dans supabase/migrations/ et s'appliquent dans l'ordre numérique.

# 5. Dev
npm run dev          # http://localhost:3000
```

### Scripts utiles

```bash
npm run dev          # serveur local
npm run build        # build production (doit passer sans erreur)
npm run lint         # ESLint --max-warnings=0
npx tsc --noEmit     # vérification type strict
npm run test         # vitest (tests pricing)
```

---

## Architecture rapide

```
src/
├── app/
│   ├── (marketing)         # / · /tarifs · /faq · /catalogue · /comment-ca-marche
│   ├── (legal)             # /mentions-legales · /politique-confidentialite · /cgu
│   ├── login/              # connexion + signup
│   ├── auth/callback/      # callback Supabase OAuth
│   ├── accept-invite/      # flow autonome d'acceptation d'invitation
│   ├── cabinet/            # console admin owner
│   │   ├── page.tsx        # dashboard (owner only)
│   │   └── parametrage/    # politique pricing (owner édite, member lit)
│   ├── workspace/          # CRM sourcing
│   │   ├── vivier/         # carte + liste candidats
│   │   ├── missions/       # liste + détail mission + édition
│   │   ├── pricing/        # liste + chiffrage + ref Syntec
│   │   └── pipeline/       # Kanban
│   └── api/                # toutes les routes server
├── components/
│   ├── workspace/          # composants partagés workspace
│   └── layout/             # LegalPageShell, Footer, Navbar
└── lib/
    ├── pricing/            # engine Syntec, calendar, presets, avantages-meta
    ├── cabinet-config.ts   # résolution org-scoped des configs cabinet
    ├── cv-parser.ts        # unpdf + LLM → ParsedCv (+ is_apprentice + post-grad seniority)
    ├── vivier-clusters.ts  # rendu carte + hues + layouts
    ├── matching.ts         # normalizeJob + scoring LLM
    ├── openrouter.ts       # wrapper LLM
    ├── quota.ts            # consumeQuota — obligatoire avant chaque appel LLM
    ├── resend.ts           # sendEmail + ensureInboxAddress
    ├── anonymized-cv.tsx   # PDF anonymisé candidat
    └── pricing-pdf.tsx     # PDF fiche pricing

supabase/migrations/         # 028 migrations, voir CLAUDE.md pour le détail
```

### Routes protégées

`src/proxy.ts` (Next.js 16, **pas** `middleware.ts`) protège `/workspace/*` et `/cabinet/*`. Sans session → redirige vers `/login?next=[path]` (path validé pour bloquer les open redirects).

- `/cabinet` dashboard : owner-only
- `/cabinet/parametrage` : owner édite, member en lecture seule
- `/workspace/*` : gate sur `profiles.has_sourcing_seat` → sans siège, bounce vers `/cabinet`

---

## Variables d'environnement

### Public (`NEXT_PUBLIC_*`)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_APP_URL=https://naywastudio.com   # optionnel (fallback)
```

### Server-only (**Sensitive** sur Vercel)

```bash
SUPABASE_SERVICE_ROLE_KEY=eyJ...          # bypass RLS, jamais exposé browser
OPENROUTER_API_KEY=sk-or-...
RESEND_API_KEY=re_...
RESEND_WEBHOOK_SECRET=whsec_...           # webhook Resend inbound
CRON_SECRET=<openssl rand -hex 32>        # vérifie Bearer header de Vercel cron

# Calendly (sensitives)
CALENDLY_CLIENT_ID=...
CALENDLY_CLIENT_SECRET=...
CALENDLY_WEBHOOK_SIGNING_KEY=...
```

### Configuration Supabase à faire dans le dashboard

- **Auth → Emails → SMTP** : Resend
  - Host `smtp.resend.com`, Port `465`
  - User `resend`, Password = `RESEND_API_KEY`
  - Sender = `contact@mail.naywastudio.com`, Name = `Naywa Studio`
- **Auth → URL Configuration**
  - Site URL = `https://naywastudio.com`
  - Redirect URLs allowlist : `/workspace`, `/cabinet`, `/auth/callback`
- **Auth → Emails → Templates** — 4 templates HTML brandés (Confirm signup, Invite user, Reset password, Magic Link) — voir `supabase/email-templates/` *(à exporter si besoin)*

---

## Migrations DB

Les migrations sont dans `supabase/migrations/NNN_description.sql` et s'appliquent dans l'ordre numérique strict.

Les plus structurantes :

| # | Apport |
|---|---|
| **019** | Modèle `organizations` + `org_invites` + RLS org-scopée partout + helper `current_org_id()` |
| **020** | Trigger `handle_new_auth_user()` — crée org "Cabinet de {prénom}" au signup |
| **023** | `profiles.has_sourcing_seat` — découple admin / siège sourcing |
| **024** | Trigger BEFORE INSERT — auto-fill `organization_id` (filet pour routes legacy) |
| **026** | Drop des colonnes legacy `profiles.brand_*` / `profiles.pricing_*` (source unique = `organizations`) |
| **028** | `cluster_manifests` (vivier vivant) + `candidates.is_apprentice` |

---

## Déploiement Vercel

- **Region** : `cdg1` (Paris)
- **Build command** : `npm run build`
- **Crons** dans `vercel.json` :
  ```json
  {
    "crons": [
      { "path": "/api/cron/wipe-expired-orgs", "schedule": "0 3 * * *" }
    ]
  }
  ```
- **Headers sécurité** : X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy minimale, cache long sur `/_next/static/` et `/fonts/`

---

## Conventions code

- **Code en anglais**, **commentaires longs + UI en français**
- **Zéro `any` TypeScript** ; `tsc --noEmit` et `eslint --max-warnings=0` doivent passer
- **Pas d'emoji** dans l'UI sauf si demandé explicitement
- **PATCH endpoints** : allowlist field-by-field (**pas** de spread `...body`)
- **framer-motion** : `m` (pas `motion`) + `LazyMotion` + easing `[0.22, 1, 0.36, 1]`
- **Naming** : composants en PascalCase, helpers en camelCase, tables Supabase en snake_case, API routes en `/api/[ressource]/route.ts`

### Sécurité serveur

- Toute route API authentifie via `auth.getUser()` (sauf webhooks signés et flows token-based)
- Toute mutation : **lire d'abord** via client RLS-scoped (404 si pas dans l'org) **avant** d'écrire en admin
- `getAdminSupabase()` est strictement server-only
- `consumeQuota()` **obligatoire** sur chaque route LLM
- `?next=` validé en `/login` (anti open-redirect)

---

## Garde-fous produit

> **Le LLM ne décide jamais à la place du sourceur.**

Concrètement, le service refuse de :
- Envoyer un mail à un candidat sans clic d'approbation explicite
- Avancer un candidat dans le pipeline sans action manuelle
- Lire la boîte mail personnelle d'un sourceur
- Traiter un email entrant comme une donnée fiable (analyse = suggestion uniquement, jamais d'action automatique)

---

## Pour les contributeurs

📖 **Contexte complet** : [`CLAUDE.md`](./CLAUDE.md) — modèle produit, schéma DB, architecture API détaillée, chantiers livrés/à venir.

📖 **Référence Syntec** : [`docs/syntec-reference.md`](./docs/syntec-reference.md) — toutes les valeurs (charges par statut, plafonds URSSAF, grille positions/coefficients).

🧪 **Tests** : `npm run test` (couvre l'engine pricing `lib/pricing/syntec.ts`).

🔒 **Sécurité** : tout signalement de vulnérabilité → `contact@naywastudio.com`. Pas de divulgation publique avant correctif.

---

© 2026 Naywa Studio — L'IA traite, vous décidez.
