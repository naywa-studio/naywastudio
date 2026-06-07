# Naywa Studio — Contexte projet

> **Statut** : Beta privée. Premier produit = **Nora**, l'assistante IA du
> workspace. Plus de Léo / Alex — un seul package commercial : **Package
> Sourcing**. Stripe pas encore branché ; toute la mécanique d'abonnement
> est en place côté code (sièges, grace period, cron de wipe) et ne demande
> qu'à être câblée à Stripe quand on y sera.

---

## 1. Modèle produit

### Acteurs
| Rôle | Accès |
|---|---|
| **Owner** (créateur du compte) | `/cabinet` (console admin) + `/workspace` si un siège lui est alloué |
| **Member** (invité par l'owner) | `/workspace` uniquement (lecture seule sur `/cabinet/parametrage`) |

### Sièges (Package Sourcing)
- Un compte gratuit crée une **organisation** (cabinet) avec son créateur en **owner**.
- L'owner décide d'**allouer un siège** à lui-même (s'il veut utiliser le sourcing) et/ou d'**inviter des collègues** qui occuperont chacun un siège.
- Tous les members d'une org **partagent le vivier**, les missions et le pipeline (vivier vivant : Nora se souvient des zones déjà créées entre uploads).
- **Suppression de cabinet** : si l'owner est seul, wipe immédiat. Si membres restants → `pending_deletion_at = now() + 30 j` (grace period) ; le cron quotidien `/api/cron/wipe-expired-orgs` finalise.

### Garde-fou produit
> **Le LLM ne décide jamais à la place du sourceur.**
> Pas d'envoi automatique de mail, pas de déplacement auto dans le pipeline,
> pas de classement IA appliqué sans validation. Toutes les sorties IA sont
> des **suggestions** modifiables.

---

## 2. Stack

- **Next.js 16** App Router + TypeScript strict — Vercel (région `cdg1`)
- **Supabase** — Auth (email/mdp + Google OAuth), Postgres + RLS, Storage
- **Resend** — SMTP pour les auth emails (via Supabase) + envoi/réception applicatifs sur `mail.naywastudio.com`
- **OpenRouter** — LLM (`gpt-4o-mini`) + OCR plugin `mistral-ocr`
- **unpdf** — extraction texte PDF serverless
- **@react-pdf/renderer** — PDF anonymisé candidat + fiche pricing
- **svix** — vérification signature webhooks Resend
- **framer-motion** — animations (`LazyMotion` + `domAnimation`, import via `m`)

### Commandes
```bash
npm run dev       # serveur local
npm run build     # build production (doit passer sans erreur)
npm run lint      # ESLint --max-warnings=0
npx tsc --noEmit  # type-check strict
```

---

## 3. Architecture pages

### Marketing (public)
- `/` — homepage
- `/comment-ca-marche`, `/tarifs`, `/faq`, `/catalogue`
- `/mentions-legales`, `/politique-confidentialite`, `/cgu` — pages légales via `<LegalPageShell />` partagé

### Auth (public)
- `/login` — connexion + signup (toggle `?mode=signup`, message `?expired=1`)
- `/signup` — redirige côté serveur
- `/auth/callback` — callback Supabase OAuth
- `/accept-invite?token=…` — flow autonome pour rejoindre un cabinet sur invitation. 4 états : choix (accepter / refuser), formulaire signup (prénom + mdp), confirm (utilisateur déjà connecté avec le bon email), mauvais email.

### Console cabinet `/cabinet` (protégée par `proxy.ts`)
- `/cabinet` — dashboard owner (identité, sièges, membres, abonnement, zone danger). **Owner-only** (members → `/workspace`).
- `/cabinet/parametrage` — politique pricing du cabinet (marges, RTT, avantages standards). **Édition owner**, **lecture seule member**.

### Workspace sourcing `/workspace/*` (protégée par `proxy.ts`)
- `/workspace` — accueil (4 piliers : vivier, missions, matches, pricing)
- `/workspace/vivier` — vue carte (zones Nora) + vue plate
- `/workspace/vivier/[candidateId]` — fiche candidat
- `/workspace/missions` — liste missions + bouton "Créer une mission"
- `/workspace/missions/[jobId]` — fiche mission + bouton "Modifier" + relance matching
- `/workspace/pricing` — liste missions à chiffrer
- `/workspace/pricing/[jobId]` — chiffrage mission × candidat (widget complet)
- `/workspace/pricing/reference` — doc Syntec (accessible à tous, owner + member)
- `/workspace/pipeline` — Kanban candidats

Le gate `/workspace` exige un **siège** (`profiles.has_sourcing_seat`) ; sans siège → bounce sur `/cabinet`.

---

## 4. Architecture API

### Auth + cabinet
| Route | Rôle |
|---|---|
| `POST /api/subscribe` | No-op legacy — confirme juste que l'utilisateur a une org |
| `PATCH /api/cabinet` | Owner-only — met à jour nom, brand, logo, pricing defaults |
| `DELETE /api/cabinet` | Owner-only — suppression cabinet (immédiate si solo, grace 30 j sinon) |
| `POST /api/cabinet/seat` | Owner toggle son propre siège |
| `POST /api/cabinet/invite` | Owner invite un membre par email |
| `DELETE /api/cabinet/invite?id=…` | Owner révoque une invitation |
| `GET /api/cabinet/accept-invite?token=…` | Public — preview invitation (org name + email invité) |
| `POST /api/cabinet/accept-invite` | Utilisateur connecté accepte une invitation |
| `POST /api/cabinet/accept-invite-signup` | Public — crée auth user + accepte invitation en un coup |
| `POST /api/cabinet/decline-invite` | Public — supprime l'invitation |
| `DELETE /api/cabinet/members/[userId]` | Owner retire un member |
| `GET  /api/cron/wipe-expired-orgs` | Cron quotidien (3h00 UTC) — wipe orgs `pending_deletion_at <= now()` |

### Vivier + parsing
| Route | Rôle |
|---|---|
| `POST /api/cv/upload` | Upload PDF + insert candidate |
| `POST /api/cv/[id]/parse` | unpdf → OpenRouter → `parsed_cv` + `taxonomy` |
| `POST /api/cv/[id]/anonymize` | Génère PDF anonymisé (brand cabinet inliné) |
| `POST /api/cv/[id]/compose` | Brouillon message d'approche |
| `POST /api/cv/[id]/send` | Envoie via Resend (`fromHeader` cabinet) |
| `GET  /api/cv/[id]/signed-url` | URL temporaire 5 min |
| `DELETE /api/cv/[id]` | Suppression candidate (Storage + cascade) |
| `POST /api/vivier/cluster` | Clustering LLM org-scoped avec **manifestes** (vivier vivant) |
| `POST /api/candidates/dedup` | Détection doublons |
| `POST /api/candidates/[id]/match-all` | Lance matching contre toutes missions ouvertes |
| `POST /api/assistant` | Chat Nora (contexte vivier) |

### Missions + matching + pricing
| Route | Rôle |
|---|---|
| `GET/POST /api/jobs` | Liste / crée une mission |
| `GET/PATCH/DELETE /api/jobs/[id]` | CRUD mission |
| `POST /api/jobs/extract` | LLM extrait les champs structurés depuis un brief texte |
| `POST /api/jobs/[id]/match` | Lance matching |
| `POST /api/jobs/[id]/assign` | Assigne manuellement un candidat |
| `POST /api/jobs/chat` | Chat IA création mission (legacy, peu utilisé) |
| `PATCH /api/match/[id]/stage` | Met à jour le pipeline_stage |
| `PATCH /api/match/[id]/pipeline` | Ajoute / retire du pipeline |
| `PATCH /api/match/[id]/pricing-params` | Persist TJM / Brut / avantages override par match |
| `GET  /api/match/[id]/pricing-pdf?anonymize={0,1}` | Export PDF fiche pricing |
| `POST /api/pricing/compare` | Compare 2 scénarios candidats |

### Emails + Calendly
| Route | Rôle |
|---|---|
| `POST /api/inbound-email` | Webhook Resend — vérification signature svix |
| `GET /api/calendly/oauth/start` | Démarre OAuth Calendly |
| `GET /api/calendly/oauth/callback` | Callback Calendly (HMAC state) |
| `POST /api/calendly/webhook` | Webhook Calendly (signature vérifiée) |
| `GET /api/calendly/event-types` | Liste les event types du compte |
| `DELETE /api/calendly/disconnect` | Déconnecte Calendly |
| `GET /api/dashboard/today` | Agrégats interviews / réponses / relances |

---

## 5. Bibliothèques lib/

| Fichier | Rôle |
|---|---|
| `supabase.ts` | Client browser (`createBrowserClient`) |
| `supabase-server.ts` | Client server RSC + Route Handlers |
| `admin-supabase.ts` | Service-role client (server-only, bypass RLS) |
| `database.types.ts` | Types DB + alias métier (`Profile`, `Organization`, `Job`, `Candidate`, `MatchAssessment`, `OrgInvite`, `OrgRole`, …) + `CANDIDATE_COLUMNS` |
| `cabinet-config.ts` | `getCabinetPricingConfig()` / `getCabinetBrand()` / `getCabinetOrgId()` — résolution org-scoped des configs cabinet |
| `cv-parser.ts` | Parser CV : unpdf → LLM → `ParsedCv`. Calcule `is_apprentice` et `years_experience` post-diplôme (exclut stages + alternance en cours). |
| `candidate-ref.ts` | `candidateRefLabel(id)` → `C-XXXXXXXX` (8 premiers chars UUID en majuscule) |
| `vivier-clusters.ts` | Helpers carte vivier : `candidateClusters()`, `clusterHue()`, `hsl()`, `buildClusters()`, layouts par cluster count |
| `matching.ts` | `normalizeJob()` + score LLM candidat × poste |
| `openrouter.ts` | Wrapper LLM (chat + responseFormat json_object + plugins) |
| `quota.ts` | `consumeQuota(admin, userId, action)` — obligatoire avant tout appel LLM |
| `resend.ts` | `sendEmail()`, `ensureInboxAddress()`, `fromHeader()` |
| `anonymized-cv.tsx` | PDF anonymisé candidat |
| `pricing-pdf.tsx` | PDF fiche pricing (header brand + 3 KPI + détail Syntec + avantages) |
| `pricing/syntec.ts` | `computeMissionMargin()`, `computeEmployerCost()`, charges par statut, plafonds URSSAF |
| `pricing/calendar.ts` | Calendrier français avec fériés (working days réels) |
| `pricing/preset.ts` | `detectSeniority()` + presets statut/position/coefficient |
| `pricing/avantages-meta.ts` | `AVANTAGES_CONFIG[]` + `avantagesMonthlyTotal()` |
| `pricing/quick-margin.ts` | `computeQuickMargin()` pour la liste candidats (snapshot léger) |

---

## 6. Schéma Supabase — vue d'ensemble

### Tables principales
- **`organizations`** *(source de vérité cabinet)*
  - `id`, `name`, `owner_user_id`, `brand_name`, `brand_logo_path`, `mailing_domain` *(masqué UI)*
  - `package_sourcing_active`, `seats_total`, `pending_deletion_at`
  - `pricing_billable_days_per_month`, `pricing_margin_min_pct`, `pricing_margin_target_pct`, `pricing_default_lieu`, `pricing_default_modalite`, `pricing_default_avantages`, `pricing_onboarded_at`, `pricing_rtt_days_per_year`

- **`profiles`** — `user_id` ←→ `auth.users` (cascade), `organization_id`, `role: 'owner'|'member'`, `has_sourcing_seat`, `first_name`, `inbox_address`, `inbox_cc_self`, `calendly_*`

- **`org_invites`** — invitations en attente (token uuid, expires 7 j, UNIQUE (org_id, email))

- **`cluster_manifests`** — résumé "qui ressemble à ça" par zone (vivier vivant) ; UNIQUE (organization_id, label)

- **`candidates`** — vivier (`parsed_cv: ParsedCv`, `taxonomy`, `parse_status`, `cluster_assignments`, `is_apprentice`, `anonymized_pdf_path`, `outreach_draft`, `outreach_meta`)

- **`jobs`** — missions (`role_name`, `title`, `briefing`, `client_tjm_min/max`, `margin_min_pct/target_pct`, `duration_months`, `target_gross_salary`, `start_date`, `pricing_lieu`, `has_grand_deplacement`, `is_expatriated`, `normalized`, `match_status`)

- **`match_assessments`** — candidat × poste (`score`, `score_dimensions`, `match_tier`, `pipeline_stage`, `pricing_tjm`, `pricing_brut`, `pricing_avantages_override`, `reject_reason`)

- **`email_messages`** — outbound + inbound (`ai_sentiment`, `ai_summary`, `ai_suggested_stage`)

- **`daily_usage`** — quota LLM par user/jour/action

- **`interviews`** — rendez-vous Calendly

### RLS
**Toutes les tables sont org-scopées** depuis migration 019. Helper SECURITY DEFINER `current_org_id()` est utilisé dans toutes les policies — évite la récursion infinie sur `profiles`.

### Triggers + fonctions
- `handle_new_auth_user()` (migration 020/022) — sur `auth.users INSERT` → crée org "Cabinet de {prénom}" + profile owner. Lit `first_name` depuis `raw_user_meta_data` en priorité.
- `set_organization_id_from_user()` (migration 024) — BEFORE INSERT sur les tables business → auto-remplit `organization_id` depuis `profiles` si absent. Filet de sécurité pour le code legacy qui n'écrit que `user_id`.
- `current_org_id()` SECURITY DEFINER — résout l'org du caller depuis profiles
- Cron Vercel quotidien (3h00 UTC) → `/api/cron/wipe-expired-orgs` (auth `Authorization: Bearer ${CRON_SECRET}`)

### Storage
- Bucket `brand-logos` — privé, RLS org-scopée (path = `{org_id}/{ts}.ext`)
- Bucket `cv-uploads` — privé, RLS user-scopée (path = `{user_id}/{candidate_id}/...`) — accédé uniquement via signed URLs depuis admin-client

### Migrations clés *(répertoire `supabase/migrations/`)*
| # | Apport |
|---|---|
| 019 | `organizations` + `org_invites` + `current_org_id()` + RLS swap user → org |
| 020 | Trigger auto-create org au signup |
| 021 | Cleanup colonnes legacy (`sector`, `vps_*`, `workspace_*`, `apify_*`, `subscription_level`, etc.) + `mailing_domain` |
| 022 | Trigger lit `raw_user_meta_data.first_name` en priorité |
| 023 | `profiles.has_sourcing_seat` (découple admin du siège sourcing) |
| 024 | Trigger `BEFORE INSERT` auto-fill `organization_id` (filet pour routes legacy) |
| 025 | Storage RLS `brand-logos` org-scopée |
| 026 | Drop des colonnes legacy `brand_*` + `pricing_*` sur `profiles` (source unique = `organizations`) |
| 027 | `match_assessments.pricing_avantages_override` |
| 028 | `cluster_manifests` (vivier vivant) + `candidates.is_apprentice` |

---

## 7. Contextes React partagés

```ts
// src/app/workspace/layout.tsx
interface WorkspaceCtx {
  profile: Profile | null
  organization: Organization | null
  userEmail: string
  hasSubscription: boolean      // always true V1 (= has org)
  refetchProfile: () => Promise<void>
}
// Hook : useWorkspace()

// src/app/cabinet/layout.tsx
interface CabinetCtx {
  profile: Profile
  organization: Organization
  userEmail: string
  isOwner: boolean
  refetch: () => Promise<void>
}
// Hook : useCabinet()
```

### Protection routes
- `src/proxy.ts` (Next.js 16, **pas** `middleware.ts`) — protège `/workspace/*` et `/cabinet/*`
- `/cabinet` layout : permet member d'accéder à `/cabinet/parametrage` en lecture seule
- `/cabinet` dashboard : owner-only (redirect via useEffect)
- `/workspace` layout : gate sur `has_sourcing_seat` → bounce `/cabinet` si pas de siège

---

## 8. Règles de développement

### Code
- **Langue code** : anglais (variables, fonctions, commentaires courts)
- **Langue commentaires longs + UI** : français
- **Zéro `any`** TypeScript ; `tsc --noEmit` + `eslint --max-warnings=0` doivent passer
- **Pas d'emoji** dans l'UI sauf si demandé explicitement
- **Tailwind seul** pour le CSS — pas de styled-components / Emotion ailleurs
- **framer-motion** : utiliser `m` (pas `motion`) + `LazyMotion`

### Sécurité serveur
- Toute route API authentifie via `getUser()` *(sauf webhooks signés et flows token-based : accept-invite-signup, decline-invite)*
- Toute route mutation : lire d'abord via **client RLS-scoped** (404 si pas dans l'org) **avant** toute écriture admin
- `getAdminSupabase()` est **server-only** — jamais exposé au navigateur
- `consumeQuota()` **obligatoire** sur chaque route LLM
- PATCH endpoints : **field-allowlist** (pas de spread `...body`)
- `next=` dans `/login` validé `startsWith("/") && !startsWith("//")` (anti open-redirect)

### Périmètre — ce que Naywa ne fait jamais
- Envoi mail à candidat sans clic d'approbation explicite du sourceur
- Mouvement pipeline sans validation du client
- Lecture boîte mail personnelle du client
- Les emails entrants sont **NON FIABLES** → analyse LLM = suggestion uniquement, jamais action auto

---

## 9. Variables d'environnement

```bash
# Public (browser)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL   # optionnel — fallback "https://naywastudio.com"

# Server-only — DOIVENT être marquées "Sensitive" sur Vercel
SUPABASE_SERVICE_ROLE_KEY
OPENROUTER_API_KEY
RESEND_API_KEY
RESEND_WEBHOOK_SECRET     # commence par whsec_
CRON_SECRET               # généré via openssl rand -hex 32

# Calendly (server-only, sensitive)
CALENDLY_CLIENT_ID
CALENDLY_CLIENT_SECRET
CALENDLY_WEBHOOK_SIGNING_KEY
```

### Configuration Supabase
- **Auth → Emails → SMTP** : Resend (host `smtp.resend.com`, port 465, user `resend`, password = `RESEND_API_KEY`, sender `contact@mail.naywastudio.com`)
- **Auth → URL Configuration** : Site URL = `https://naywastudio.com` ; Redirect URLs allowlist = `/workspace`, `/cabinet`, `/auth/callback`
- **Auth → Emails → Templates** : 4 templates HTML brandés Naywa (Confirm signup, Invite user, Reset password, Magic Link)

### Vercel
- **Crons** dans `vercel.json` : `/api/cron/wipe-expired-orgs` à `0 3 * * *` (3h00 UTC)
- **Region** : `cdg1` (Paris)
- **Headers sécurité** : X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy minimale

---

## 10. Pricing — engine maison

### Cadre
- **Convention Syntec** appliquée par défaut (charges par statut + plafonds URSSAF + grille positions/coefficients)
- Source unique du code : `lib/pricing/syntec.ts` (testé via `__tests__/syntec.test.ts`)
- Calendrier fériés FR via `lib/pricing/calendar.ts`

### Flow utilisateur
1. **Cabinet config** *(owner-only via `/cabinet/parametrage`)* : marges min/cible, RTT/an, avantages standards. Persistés sur `organizations.pricing_*`.
2. **Mission config** *(éditable dans `/workspace/missions/[jobId]` "Modifier")* : TJM range, brut cible, durée, date début, lieu typé, type contrat.
3. **Per-match** *(persistés sur `match_assessments`)* : `pricing_tjm`, `pricing_brut`, `pricing_avantages_override`. Live save + bouton "Réinitialiser" qui remet sur les valeurs mission.
4. **Export PDF** : `/api/match/[id]/pricing-pdf?anonymize={0,1}` — header logo + KPI verdict + détail Syntec + avantages. Anonymisé = label `Réf C-XXXXXXXX`.

### Doc Syntec consultable
`/workspace/pricing/reference` — toutes les valeurs (charges, plafonds, formules) avec leur source. Accessible owner + member.

---

## 11. Vivier vivant — clustering Nora

### Principe
Nora ne re-scanne pas tout le vivier à chaque upload. À chaque zone créée, elle écrit un **manifeste** ("qui ressemble à ça") dans `cluster_manifests`. Au prochain passage, elle relit les manifestes et range les nouveaux candidats dans les zones existantes au max. Nouvelle zone créée **uniquement si ≥ 3 orphelins** forment un domaine cohérent absent.

### Règles dures
- **Interdit** : cluster "Étudiants", "Stagiaires", "Alternance", "Juniors" ou tout cluster basé sur statut/séniorité. Un débutant va dans son cluster **métier** ; `is_apprentice` est un **badge sur la fiche**, pas une zone.
- Nora regarde la **trajectoire** (3-4 dernières XP + formation), pas juste le `current_title`.

### Séniorité
- `years_experience` ne compte que le **travail post-diplôme** : stages avant diplôme et alternance en cours sont **exclus**.
- Quelqu'un avec un diplôme depuis 10 ans mais 2 ans de CDI réel = **2 ans**, pas 10.

---

## 12. Mission — flow "brief → form"

L'ancien formulaire à blanc est remplacé par un flow LLM-driven :

1. **Stage 1** : grande textarea, le sourceur colle son brief / fiche de poste / RFP client. Élargissement disponible si long.
2. **Bouton "Analyser avec Nora"** → `POST /api/jobs/extract` (LLM extrait 14 champs structurés).
3. **Stage 2** : formulaire pré-rempli avec **bordures couleur** :
   - Vert : rempli (manuel ou LLM) — pastille verte "Détecté" si extrait par LLM
   - Rouge : obligatoire manquant — pastille rouge "À compléter"
   - Orange : optionnel manquant
4. Le sourceur peut **rouvrir le brief + Re-analyser** pour itérer.
5. Bouton **"Valider et lancer le matching"** → POST `/api/jobs` → matching auto.

### Obligatoires *(V1)*
**Nom du poste**, **Lieu**, **≥ 1 compétence requise**. Tout le reste est optionnel.

### Édition mission
Bouton **"Modifier"** sur `/workspace/missions/[jobId]` ouvre le même modal en mode edit (skip stage brief, PATCH `/api/jobs/:id`). Save → **re-matching auto** (force=1) pour propager les nouveaux critères.

### Fallback manuel
Bouton discret **"Sans brief — saisie manuelle"** en bas du stage 1 → saute directement au form vide.

---

## 13. Design system

- **Thème clair** : fond `#FFFFFF`, surface `#F8F6FF`
- **Primary** : `#7C63C8` (violet-indigo) — **Secondary** : `#B8AEDE`
- **Fonts** : `Space Grotesk` (titres) + `Inter` (corps) via CSS vars `--font-space-grotesk` / `--font-inter`
- **Animations** : `viewport={{ once: true }}`, easing `[0.22, 1, 0.36, 1]`. **Jamais bounce/elastic.**
- **Borders d'état** *(formulaire mission)* :
  - OK = `#22C55E` (vert)
  - Required manquant = `#EF4444` (rouge)
  - Optional manquant = `#F59E0B` (orange)
- **Modaux** : `framer-motion` + `m.div`, backdrop `rgba(17,24,39,0.40)` + `blur(2px)`
- **Pastilles statut** : padding `2px 7px`, font-size 10-11, letter-spacing `0.05em`, uppercase

---

## 14. Skills design disponibles

| Skill | Quand l'utiliser |
|---|---|
| `/frontend-design` | Créer/refaire un composant avec forte direction visuelle |
| `/critique` | Score UX + anti-patterns |
| `/normalize` | Aligner sur le design system |
| `/polish` | Passe finale avant livraison |
| `/adapt` | Rendre responsive / mobile |
| `/colorize` | Retravailler la palette |
| `/emil-design-eng` | Animations, micro-interactions avancées |

---

## 15. Conventions nommage

- **API routes** : `src/app/api/[ressource]/route.ts`
- **Composants React** : PascalCase, dans `src/components/...`
- **Helpers** : camelCase, dans `src/lib/...`
- **Tables Supabase** : snake_case
- **Migrations** : `supabase/migrations/NNN_description_snake.sql` (numérotation strictement croissante)

---

## 16. État des chantiers (juin 2026)

### ✅ Livré
- Multi-user complet (orgs, invites, sièges, suppression cabinet avec grace, cron wipe)
- Sécurité multi-tenant auditée (RLS org-scopée partout, pas de secret exposé client, buckets privés)
- Pages légales complètes (Mentions / Politique de confidentialité / CGU via `<LegalPageShell />`)
- Pricing : engine Syntec testé, widget en place, export PDF (anonymisé ou nominatif)
- Vivier vivant (clustering avec manifestes, séniorité post-diplôme correcte, badge alternant)
- Mission brief → LLM → formulaire pré-rempli + édition + re-matching auto
- Suppression de colonnes legacy `profiles.brand_*` / `profiles.pricing_*`

### 🔜 À venir
- **Stripe** — Package Sourcing payant, sièges dégressifs, facturation
- **DPA** PDF téléchargeable (B2B audit)
- **Email tracking V1** — webhook Resend `email.received/delivered/bounced` à activer côté Resend
- **Email V2** — Gmail OAuth (CASA déféré)
- **Mailing domain perso** — champ déjà dans `organizations.mailing_domain`, UI masquée jusqu'à câblage Resend per-cabinet
- Tâche #15 originale (scénarios pricing nommés) **abandonnée** au profit du flow live-save + export PDF (plus pragmatique)
