# Naywa Studio — Contexte projet

> **Statut** (juin 2026) : Premier client en période d'essai (GMH Engineering
> Solutions). Plus en beta privée. Stripe **branché en LIVE**. Produit phare =
> **Nora**, l'assistante IA du workspace. Un seul package commercial : **Package
> Sourcing** (+ variante **Sourcing Pro** qui ajoute la Suite Pricing Syntec).

---

## 1. Modèle produit

### Acteurs
| Rôle | Accès |
|---|---|
| **Owner** (créateur du compte) | `/organisation` (console cabinet) + `/workspace` si un siège lui est alloué |
| **Member** (invité par l'owner) | `/workspace` uniquement (lecture seule sur `/organisation/parametrage`) |
| **Admin Naywa** (`profiles.is_admin = true`) | Tout + `/admin` (KPIs, recherche support, CRUD nouveautés, demandes branding). Bypass total trial/seat/paywall. |

### Sièges (Package Sourcing)
- Un compte gratuit crée une **organisation** avec son créateur en **owner**.
- L'owner **alloue un siège** à lui-même et/ou invite des collègues. Owner sans siège = admin pur du cabinet (pas d'accès workspace).
- Tous les members d'une org **partagent le vivier**, les missions et le pipeline (vivier vivant : Nora se souvient des zones entre uploads).
- **Suppression de cabinet** : si owner seul, wipe immédiat. Sinon `pending_deletion_at = now() + 30 j` ; cron quotidien `/api/cron/wipe-expired-orgs` finalise.

### Garde-fous produit (verrouillage anti-fraude)
- **Le LLM ne décide jamais à la place du sourceur.** Pas d'envoi de mail auto, pas de mouvement pipeline auto, pas de classement appliqué sans validation. Toutes les sorties IA = suggestions.
- **Branding fort verrouillé** : 24h après onboarding terminé, le nom + logo + email contact deviennent read-only (apparaissent sur les CV anonymisés → vecteur d'usurpation). Modification = demande validée par admin Naywa via `/admin/demandes`.
- Couleurs + slogan restent libres à tout moment.

---

## 2. Stack

- **Next.js 16** App Router + TypeScript strict — Vercel (région `cdg1`)
- **Supabase** — Auth (email/mdp + Google OAuth), Postgres + RLS org-scopée, Storage
- **Stripe** — Checkout + Customer Portal + webhooks (LIVE mode)
- **Resend** — SMTP auth (via Supabase) + envois applicatifs sur `mail.naywastudio.com`
- **OpenRouter** — LLM (`gpt-4o-mini`) + OCR plugin `mistral-ocr`
- **unpdf** — extraction texte PDF serverless
- **@react-pdf/renderer** — PDF anonymisé candidat + fiche pricing
- **docx** — export Word du CV anonymisé
- **Sentry** — error tracking (server + client + edge)
- **svix** — vérification signature webhooks Resend
- **framer-motion** — animations (`LazyMotion` + `domAnimation`, import via `m`)

```bash
npm run dev       # serveur local (Elyas ne l'utilise pas, tests sur Vercel)
npm run build     # build production
npm run lint -- --max-warnings=0
npx tsc --noEmit
```

---

## 3. Architecture pages

### Marketing (public)
- `/`, `/a-propos`, `/solutions`, `/tarifs`, `/faq`, `/contact`
- `/mentions-legales`, `/politique-confidentialite`, `/cgu` via `<LegalPageShell />`
- `/dpa-naywa-v1.pdf` (PDF servi statique, contenu v1.1, section rôle admin)

### Auth (public)
- `/login` — connexion + signup (toggle `?mode=signup`, message `?expired=1`)
- `/auth/callback` — callback OAuth Google
- `/accept-invite?token=…` — flow d'invitation autonome (4 états)

### Onboarding (`/onboarding`, owner uniquement)
4 étapes : **Nom cabinet → Branding (logo + couleurs + slogan + contact) → Invitations → Trial 15 j**. Redirige depuis `/organisation/*` tant que `cabinet_onboarded_at` est NULL.

### Console organisation `/organisation` (protégée par `proxy.ts`)
3 onglets dans une page unique :
- **Onglet org** (par défaut, libellé = nom de l'org) : Identité (read-only) | Membres | Branding pleine largeur
- **Onglet "Mes packages"** : siège owner + abonnement Stripe + Politique pricing pliable
- **Onglet Sécurité** : zone de danger (suppression cabinet) + export RGPD

Sous-pages : `/organisation/parametrage` (politique pricing détaillée, lecture member).

### Workspace `/workspace/*` (protégée par `proxy.ts`)
- `/workspace` — accueil 4 piliers + raccourcis + KPI + activité récente
- `/workspace/vivier` (carte zones Nora + vue plate) | `/workspace/vivier/[id]`
- `/workspace/missions` | `/workspace/missions/[jobId]`
- `/workspace/pricing` | `/workspace/pricing/[jobId]` | `/workspace/pricing/reference` (doc Syntec)
- `/workspace/pipeline` (Kanban)
- `/workspace/match/[matchId]` (fiche match + anonymisation)

Gate : exige `has_sourcing_seat` (sauf admins). Owner sans siège → bounce `/organisation` (cf. `lib/post-login-destination.ts`).

### Console admin `/admin/*` (protégée par `proxy.ts` + `requireAdmin()`)
- `/admin` — dashboard 6 KPIs (cabinets, users, sièges, candidats parsés, trials, MRR)
- `/admin/maj` — CRUD nouveautés (modale title + body markdown + catégorie, preview live)
- `/admin/recherche` — recherche email/prénom, table résultats + audit log auto
- `/admin/demandes` — file des demandes de modification branding, regroupées par batch

### Nouveautés `/nouveautes` (auth)
Page changelog produit accessible depuis sidebar workspace + menu profil organisation. Pastille violette sidebar quand non-lues. Card sobre sous le hero workspace + sous les tabs organisation. Mark-read auto à l'ouverture.

---

## 4. Architecture API

### Auth + organisation
| Route | Rôle |
|---|---|
| `PATCH /api/cabinet` | Owner-only — allowlist nom, brand_name, brand_logo_path, brand_color, brand_color_secondary, brand_slogan, contact_email, pricing defaults |
| `DELETE /api/cabinet` | Owner-only — suppression (immédiate si solo, grace 30 j sinon) |
| `POST /api/cabinet/seat` | Toggle siège (owner pour soi-même ou autre member) |
| `POST /api/cabinet/invite` + `DELETE ?id=` | Invitation par email + révocation |
| `POST /api/cabinet/accept-invite[-signup]` + `/decline-invite` | Flows token-based |
| `DELETE /api/cabinet/members/[userId]` | Owner retire member |
| `POST /api/cabinet/activate-trial` | Idempotent — stamp `trial_ends_at = now() + 15 j` |
| `POST /api/cabinet/onboarding-done` | Stamp `cabinet_onboarded_at` + `branding_locked_at = +24h` |
| `POST /api/cabinet/branding/request` | Owner soumet `{ changes: [{ field, requested_value }], reason }`. N rows, 1 batch_id |
| `GET /api/cabinet/branding/requests` | Owner — liste ses demandes pending + decided des 30 derniers jours |
| `POST /api/cabinet/reset-onboarding` | Preview-only (`VERCEL_ENV === "preview"`) — nullifie `cabinet_onboarded_at` |
| `POST /api/contact` | Public — formulaire contact → `contact@naywastudio.com` |
| `POST /api/support` | Auth — bouton support workspace/organisation. Email/org/URL/UA auto-attachés. Subject `[Support · {topic}] {prénom} — {org}` |
| `GET /api/cron/wipe-expired-orgs` | Cron 3h UTC — wipe orgs `pending_deletion_at <= now()` |
| `GET /api/cron/wipe-lockdown-data` | Cron 3h UTC — wipe orgs en lockdown depuis > 15 j (sub canceled) |

### Vivier + parsing
| Route | Rôle |
|---|---|
| `POST /api/cv/upload` | Upload PDF + insert candidate |
| `POST /api/cv/[id]/parse` | unpdf → OpenRouter → `parsed_cv` + `taxonomy` |
| `POST /api/cv/[id]/anonymize` | PDF anonymisé (brand cabinet, 4 templates : classic/two-column/executive/bento, watermark optionnel) |
| `POST /api/cv/[id]/anonymize/docx` | Word éditable (format linéaire indépendant des templates) |
| `POST /api/cv/[id]/compose` + `/send` | Brouillon outreach + envoi Resend |
| `GET /api/cv/[id]/signed-url` + `DELETE` | URL temporaire + suppression cascade |
| `POST /api/vivier/cluster` | Clustering org-scoped avec **manifestes** (vivier vivant) |
| `POST /api/candidates/dedup` + `[id]/match-all` | Doublons + matching toutes missions |
| `POST /api/assistant` | Chat Nora |

### Missions + matching + pricing
| Route | Rôle |
|---|---|
| `GET/POST /api/jobs` + `[id]` (GET/PATCH/DELETE) | CRUD missions |
| `POST /api/jobs/extract` | LLM extrait 14 champs depuis brief texte |
| `POST /api/jobs/[id]/match` + `/assign` | Lance matching + assignment manuel |
| `PATCH /api/match/[id]/stage` + `/pipeline` + `/pricing-params` | Pipeline + pricing override par match |
| `GET /api/match/[id]/pricing-pdf?anonymize={0,1}` | PDF fiche pricing |
| `POST /api/pricing/compare` | Compare 2 scénarios candidats |

### Stripe + emails + Calendly
| Route | Rôle |
|---|---|
| `POST /api/stripe/checkout` + `/portal` + `/setup-intent` | Checkout, portail, Setup Intent SEPA |
| `POST /api/stripe/webhook` | Webhook signé (sync `subscription_status`, `subscription_seats`, etc.) |
| `POST /api/inbound-email` | Webhook Resend (svix) |
| `GET /api/calendly/oauth/start` + `/callback` + `POST /webhook` + autres | Connexion + RDV |
| `GET /api/dashboard/today` | Agrégats interviews / réponses / relances |

### Admin (admin-only via `requireAdmin()`)
| Route | Rôle |
|---|---|
| `GET /api/admin/kpis` | 6 KPIs sourcés (1 requête / KPI, pas de ratio composé) |
| `GET /api/admin/search?q=` | Recherche email/prénom — pull tous les `auth.users` (perPage:1000) + filter code. Audit log auto |
| `GET/POST /api/admin/maj` + `PATCH/DELETE [id]` | CRUD app_updates |
| `GET /api/admin/branding-requests` | Liste demandes regroupées par batch. **Pas de join Supabase sur requested_by** (FK → auth.users, l'auto-discovery plante). Hydratation manuelle profiles + emails en parallèle |
| `POST /api/admin/branding-requests/[id]` | Approve/Reject (par change row, pas par batch). Mail Resend au requester. Si reject + field=logo : supprime fichier pending du Storage |
| `GET /api/admin/branding-logo-url?path=` | Signed URL 1h pour previews dans `/admin/demandes` |

### Nouveautés (auth)
| Route | Rôle |
|---|---|
| `GET /api/updates` | Liste publiée + `is_read` par user |
| `POST /api/updates/[id]/mark-read` | Idempotent (PK composite) |

### Account
| Route | Rôle |
|---|---|
| `GET /api/account/me` + `/profile` | Lecture profil / patch first_name |
| `GET /api/export/me` | Export RGPD JSON |

---

## 5. Bibliothèques lib/ (clés)

| Fichier | Rôle |
|---|---|
| `supabase.ts` / `supabase-server.ts` / `admin-supabase.ts` | Browser / server RSC / service-role (server-only, bypass RLS) |
| `database.types.ts` | Types DB + alias métier (`Profile`, `Organization`, `Job`, `Candidate`, `MatchAssessment`, `AppUpdate`, `BrandingChangeRequest`, `AdminAuditLog`, ...) + `CANDIDATE_COLUMNS` |
| `admin.ts` | `isAdmin()`, `requireAdmin()` (renvoie 401/403), `logAdminAction()` (best-effort) |
| `subscription.ts` | `subscriptionAccess(org, { isAdmin })` → states `trial`/`paid`/`trialing`/`admin`/`blocked`. `hasActiveAccess` + `isInLockdown` acceptent tous les deux `isAdmin` pour bypass |
| `trial.ts` | `trialStatus()` + `TRIAL_DURATION_DAYS=15` + `TRIAL_SEAT_CAP=2` |
| `stripe.ts` / `stripe-emails.ts` | `getStripe()`, `PLAN_PRICES_EUR`, `lookupKey()`, mails Resend post-checkout |
| `post-login-destination.ts` | `resolvePostLoginDestination()` — owner sans onboarding → `/onboarding`, owner sans siège → `/organisation`, sinon `/workspace`. Whitelist `?next=` |
| `markdown.ts` | Parser markdown maison (gras, italique, listes, liens https/mailto, code inline). Anti-XSS : escape HTML d'abord |
| `cv-parser.ts` | unpdf → LLM → `ParsedCv`. `is_apprentice` + `years_experience` post-diplôme |
| `candidate-ref.ts` | `candidateRefLabel(id)` → `C-XXXXXXXX` |
| `vivier-clusters.ts` | Helpers carte vivier |
| `matching.ts` | `normalizeJob()` + score LLM |
| `openrouter.ts` | Wrapper LLM (chat + json_object + plugins) |
| `quota.ts` | `consumeQuota()` — obligatoire sur chaque route LLM |
| `resend.ts` | `sendEmail()`, `MAIL_DOMAIN`, `getInboundEmail()` |
| `anonymized-cv.tsx` + `anonymized-cv-docx.ts` | PDF (4 templates) + DOCX |
| `pricing-pdf.tsx` | PDF fiche pricing |
| `pricing/syntec.ts` (testé) + `calendar.ts` + `preset.ts` + `avantages-meta.ts` + `quick-margin.ts` | Engine Syntec maison |
| `cabinet-config.ts` | Résolution org-scoped des configs cabinet |

### Composants partagés
- `components/ui/Select.tsx` (4 variantes : default / ok / required / optional)
- `components/trial/TrialBanner.tsx` (prop `isAdmin` pour bypass)
- `components/workspace/LockdownBanner.tsx`, `MemberWaitingBanner.tsx`
- `components/organisation/BrandColorPicker.tsx` (palette curated + extraction logo + bicolore)
- `components/updates/UpdatesHeroCard.tsx` + `UpdatesNavItem.tsx` + `useUnreadUpdates.ts`
- `components/support/SupportButton.tsx` (modale via `createPortal` — sort du stacking context sticky header)
- `components/layout/PreviewBadge.tsx` (bottom-left, `VERCEL_ENV === "preview"`)

---

## 6. Schéma Supabase

### Tables principales
- **`organizations`** — `name`, `owner_user_id`, `brand_name`, `brand_logo_path`, `brand_color`, `brand_color_secondary`, `brand_slogan`, `contact_email`, `branding_locked_at`, `seats_total`, `pending_deletion_at`, `trial_ends_at`, `cabinet_onboarded_at`, `pricing_*`, `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `subscription_price_lookup`, `subscription_seats`, `subscription_has_pricing`, `current_period_end`, `lockdown_started_at`, `package_sourcing_onboarded_at`, `pricing_onboarded_at`
- **`profiles`** — `user_id` (FK auth.users CASCADE), `organization_id`, `role: 'owner'|'member'`, `has_sourcing_seat`, `is_admin`, `first_name`, `inbox_address`, `calendly_*`, `package_sourcing_onboarded_at`
- **`org_invites`** — UUID token, expires 7 j, UNIQUE (org_id, email)
- **`cluster_manifests`** — résumé "qui ressemble à ça" par zone ; UNIQUE (org_id, label)
- **`candidates`**, **`jobs`**, **`match_assessments`**, **`email_messages`**, **`daily_usage`**, **`interviews`** — métier
- **`trial_consumed_emails`** — anti double-trial sur signup
- **`app_updates`** (changelog produit) + **`app_updates_reads`** (PK composite user_id + update_id)
- **`admin_audit_log`** (journal RGPD des actions admin : `search_users`, `view_user`, `list_branding_requests`, `approve/reject_branding_request`, `publish_update`, …)
- **`branding_change_requests`** — `{field, current_value, requested_value, status, decided_*, decision_note, request_batch_id}` — pending/approved/rejected/cancelled

### RLS
**Toutes les tables sont org-scopées** via helper SECURITY DEFINER `current_org_id()` (évite la récursion sur profiles). `admin_audit_log` n'a pas de policy user-facing (lu uniquement via getAdminSupabase). `app_updates_reads` = user-scopé via `auth.uid()`.

### Triggers + fonctions
- `handle_new_auth_user()` — INSERT auth.users → org "Organisation de {prénom}" + profile owner
- `set_organization_id_from_user()` — BEFORE INSERT auto-fill `organization_id` (filet routes legacy)
- `current_org_id()` SECURITY DEFINER
- `touch_app_updates_updated_at()` BEFORE UPDATE

### Storage
- **`brand-logos`** — privé. RLS exige `{org_id}` comme 1er segment du path. Logos approuvés : `{org_id}/{ts}.ext`. Logos en cours de demande : `{org_id}/pending/{ts}.ext`
- **`cv-uploads`** — privé, user-scopé `{user_id}/{candidate_id}/...`, accès via signed URLs admin-client

### Migrations clés
| # | Apport |
|---|---|
| 019-024 | Multi-tenant : orgs, RLS swap user → org, triggers signup + filet |
| 025 | Storage RLS `brand-logos` org-scopée |
| 026 | Drop colonnes legacy `brand_*` / `pricing_*` sur profiles |
| 028 | `cluster_manifests` + `candidates.is_apprentice` |
| 029 | Security hardening (search_path, REVOKE EXECUTE) |
| 030 | `organizations.trial_ends_at` |
| 031 | `organizations.cabinet_onboarded_at` |
| 032 | `jobs.essai_renouvele` |
| 033 | Stripe subscription fields (`stripe_customer_id`, `subscription_status`, ...) |
| 034 | Drop `organizations.package_sourcing_active` |
| 035 | `organizations.lockdown_started_at` |
| 036 | `trial_consumed_emails` |
| 037-038 | Package Sourcing onboarded flags (org + profile, per-user visite guidée) |
| 039 | `organizations.brand_color` + `brand_slogan` + `contact_email` |
| 040 | `organizations.brand_color_secondary` |
| 041 | `profiles.is_admin` + élévation initiale 2 comptes Naywa |
| 042 | `app_updates` |
| 043 | `app_updates_reads` (PK composite) |
| 044 | `admin_audit_log` |
| 045 | `organizations.branding_locked_at` + backfill `cabinet_onboarded_at + 24h` |
| 046 | `branding_change_requests` |
| 047 | `branding_change_requests.request_batch_id` (regroupement multi-champs) |

---

## 7. Contextes React

```ts
// /workspace/layout.tsx → useWorkspace()
interface WorkspaceCtx {
  profile: Profile | null   // contient is_admin
  organization: Organization | null
  userEmail: string
  hasSubscription: boolean
  isReadOnly: boolean       // lockdown OU member sans accès actif. False si is_admin.
  refetchProfile: () => Promise<void>
}

// /organisation/layout.tsx → useCabinet()
interface CabinetCtx {
  profile: Profile
  organization: Organization
  userEmail: string
  emailConfirmed: boolean
  isOwner: boolean
  refetch: () => Promise<void>
}

// /admin/layout.tsx → useAdmin()
interface AdminCtx { profile: Profile; userEmail: string }
```

### Protection
- `src/proxy.ts` (Next 16 — **pas** `middleware.ts`) — auth gate `/workspace`, `/organisation`, `/onboarding`, `/profil`, `/admin`, `/nouveautes`
- `/workspace` layout : bypass complet si `profile.is_admin`. Sinon owner sans siège → `/organisation`, owner sans access actif → `/organisation`
- `/admin` layout : `requireAdmin()` côté server + redirect `/workspace` si pas admin

---

## 8. Rôle administrateur Naywa

### Élévation
- `profiles.is_admin BOOLEAN DEFAULT false`
- Élevé manuellement via SQL Editor Supabase ou par la migration 041 (les 2 comptes `elyas.malki@naywastudio.com` + `elyas.malki@icloud.com` sont stampés au déploiement)
- **Jamais modifiable via une route API** (sécurité : pas d'élévation possible côté client)

### Bypass appliqués
- `TrialBanner` / `LockdownBanner` / `MemberWaitingBanner` → `isAdmin` prop court-circuite tout
- `subscriptionAccess(org, { isAdmin })` → state `"admin"`, `hasActiveAccess` retourne true
- Workspace layout : pas de redirect siège/trial pour admin
- `lib/post-login-destination.ts` : admin sans siège → `/organisation` quand même (UX cohérente)
- Menu profil : item "Console admin" visible si `is_admin`

### Audit log
Toute consultation admin (search, view fiche, list demandes, approve/reject, publish update, delete) → row dans `admin_audit_log` (`admin_user_id`, `action`, `target_type`, `target_id`, `metadata`, `created_at`). Best-effort : si l'insert échoue on ne casse pas l'action métier.

---

## 9. Nouveautés produit (`app_updates`)

- **Catégories** : `feature` (vert), `fix` (bleu), `important` (orange), `announce` (violet)
- **Brouillon vs publié** : `published_at` NULL = brouillon. `<= now()` = visible. `> now()` = planifié auto-publish.
- **Rendu** : `lib/markdown.ts` (parser maison anti-XSS). Pas d'images V1.
- **Hook `useUnreadUpdates`** : poll 60s, retourne `{ unreadCount, latestTitle, loading }`
- **Pastille violette** (`UpdatesNavBadge`) : sidebar workspace + menu profil organisation
- **Card hero** (`UpdatesHeroCard`) : sous le hero `/workspace` + sous tabs `/organisation`, disparaît si tout est lu
- **Mark-read auto** au mount de `/nouveautes`

---

## 10. Verrouillage anti-fraude branding

### Champs concernés
- `name` / `brand_name`, `brand_logo_path`, `contact_email` (apparaissent sur le PDF anonymisé)
- Couleurs + slogan **restent libres** (faible enjeu)

### Cycle
1. **24h post-onboarding** = grâce libre (`branding_locked_at = cabinet_onboarded_at + 24h`)
2. **Après** : champs read-only en UI. Bouton "Modifier vos informations verrouillées" en haut de la carte Branding ouvre la modale globale
3. Modale = 3 checkboxes (Nom / Logo / Email). Owner coche ce qu'il veut changer, indique nouvelle valeur. Pour logo : aperçu Actuel vs Nouveau dans la modale. 1 raison globale (optionnelle).
4. POST `/api/cabinet/branding/request { changes: [...], reason }` → N rows partageant 1 `request_batch_id`, status `pending`. Mail Resend à `support.it@naywastudio.com` avec lien vers `/admin/demandes`.
5. Admin via `/admin/demandes` : **chaque change est décidé indépendamment** (peut approuver le nom et refuser le logo dans le même batch). Si refus + note → mail Resend au client avec la raison. Si refus + field logo → fichier pending supprimé du Storage.
6. **Statut visible côté owner** sous chaque champ verrouillé (`RequestStatusInline`) : pending ambré / approved vert / rejected rouge avec raison admin en italique.

### Backfill
Migration 045 a stampé `branding_locked_at = cabinet_onboarded_at + 24h` pour toutes les orgs existantes. Les comptes onboardés > 24h sont immédiatement verrouillés.

---

## 11. Pricing — engine maison Syntec

### Cadre
- Convention Syntec par défaut + plafonds URSSAF + grille positions/coefficients
- Source unique : `lib/pricing/syntec.ts` (testé `__tests__/syntec.test.ts`)
- Calendrier fériés FR via `lib/pricing/calendar.ts` (working days réels)

### Flow
1. **Org config** owner-only (`/organisation/parametrage`) → marges, RTT, avantages standards
2. **Mission config** dans `/workspace/missions/[id]` "Modifier" → TJM range, brut cible, durée, date début, lieu typé, contrat
3. **Per-match** persisté sur `match_assessments` → `pricing_tjm`, `pricing_brut`, `pricing_avantages_override`. Live save + bouton "Réinitialiser"
4. **Export PDF** `/api/match/[id]/pricing-pdf?anonymize={0,1}`

Doc Syntec consultable `/workspace/pricing/reference` (owner + member).

---

## 12. Vivier vivant + Mission brief flow

### Clustering Nora (vivier vivant)
À chaque zone créée, Nora écrit un **manifeste** ("qui ressemble à ça") dans `cluster_manifests`. Au prochain passage, relit les manifestes et range les nouveaux dans les zones existantes. Nouvelle zone créée **uniquement si ≥ 3 orphelins** forment un domaine cohérent absent.

**Interdit** : cluster basé sur statut/séniorité ("Stagiaires", "Juniors"…). Un débutant va dans son cluster métier. `is_apprentice` = badge fiche.

**Séniorité** : `years_experience` = travail post-diplôme seulement (stages + alternance en cours exclus).

### Mission "brief → form"
1. Stage 1 : textarea brief. Bouton "Analyser avec Nora" → `POST /api/jobs/extract` (LLM extrait 14 champs)
2. Stage 2 : form pré-rempli avec **bordures couleur** : vert (rempli/détecté) / rouge (requis manquant) / orange (optionnel manquant). Pastille "Détecté" si LLM
3. **Obligatoires V1** : nom poste, lieu, ≥ 1 compétence requise
4. Édition mission → même modal en mode edit (skip brief, PATCH /api/jobs/:id). Save → re-matching auto
5. Fallback "Sans brief — saisie manuelle"

---

## 13. Support produit (V1)

- Bouton "Un bug, une question ?" dans header workspace + organisation (via `createPortal` pour échapper au stacking context sticky)
- Modale : email connecté pré-affiché (read-only), dropdown "Où est le problème ?" (11 options : Vivier / Missions / Pricing / Pipeline / Workspace / Organisation / Onboarding / Nouveautés / Compte / Facturation / Autre), textarea message
- POST `/api/support` → mail vers `support.it@naywastudio.com` avec email + org + URL + UA auto-attachés
- Subject : `[Support · {topic}] {prénom} — {orgName}` pour tri facile

**Pas de stockage DB en V1** — Elyas traite depuis sa boîte mail. Inbox / IA d'analyse reportée à un futur sprint si volume grimpe.

---

## 14. Design system

- **Thème clair** : fond `#FFFFFF`, surface `#F8F6FF`
- **Primary** : `#7C63C8` (violet-indigo) — **Secondary** : `#B8AEDE`
- **Fonts** : `Space Grotesk` (titres) + `Inter` (corps) via CSS vars
- **Animations** : `viewport={{ once: true }}`, easing `[0.22, 1, 0.36, 1]`. Jamais bounce/elastic.
- **Borders d'état** (forms) : OK vert `#22C55E`, requis rouge `#EF4444`, optionnel orange `#F59E0B`
- **Modaux** : `framer-motion` + `m.div`, backdrop `rgba(17,24,39,0.40)` + `blur(2px)`. Pour les modaux ouverts depuis un header sticky → **`createPortal` vers `document.body`** obligatoire.
- **Pastilles statut** : padding `2px 7px`, font-size 10-11, letter-spacing `0.05em`, uppercase
- **Pas d'emoji UI** sauf demande explicite. Icônes SVG style fins géométriques.

---

## 15. Variables d'environnement

```bash
# Public
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL   # fallback "https://naywastudio.com"
NEXT_PUBLIC_SENTRY_DSN

# Server-only (Sensitive sur Vercel)
SUPABASE_SERVICE_ROLE_KEY
OPENROUTER_API_KEY
RESEND_API_KEY
RESEND_WEBHOOK_SECRET     # whsec_…
CRON_SECRET               # openssl rand -hex 32
STRIPE_SECRET_KEY         # LIVE
STRIPE_WEBHOOK_SECRET     # whsec_…
SENTRY_AUTH_TOKEN
CALENDLY_CLIENT_ID + CALENDLY_CLIENT_SECRET + CALENDLY_WEBHOOK_SIGNING_KEY
```

### Configuration externe
- **Supabase Auth → SMTP** : Resend (smtp.resend.com:465, user `resend`, sender `contact@mail.naywastudio.com`)
- **Supabase Auth → Templates** : 4 templates HTML brandés Naywa (Confirm signup, Invite, Reset, Magic Link)
- **Supabase Auth → Redirect URLs** allowlist : `/workspace`, `/organisation`, `/onboarding`, `/auth/callback`, `/admin`, `/nouveautes`
- **Vercel** : Region `cdg1`, crons dans `vercel.json` (wipe-expired-orgs + wipe-lockdown-data à 3h UTC), headers sécurité (X-Frame-Options DENY, etc.)

---

## 16. Règles de développement

### Code
- Langue code = anglais, commentaires longs + UI = français
- Zéro `any` ; `tsc --noEmit` + `eslint --max-warnings=0` doivent passer
- Pas de Tailwind, pas de styled-components — styles inline objets `React.CSSProperties`
- `framer-motion` : `m` (pas `motion`) + `LazyMotion`
- **React 19 / Next 16 — règle de pureté** : interdit `Date.now()` dans le render. Wrapper dans `useState + useEffect` avec cancelled-guard. Pattern subscription accepté pour fetch HTTP.

### Sécurité serveur
- Toute route auth via `getUser()` (sauf webhooks signés et flows token-based)
- Routes admin : **première ligne = `requireAdmin()`**, return du response 401/403 tel quel
- `getAdminSupabase()` **server-only** — jamais exposé client
- PATCH : **field-allowlist** (pas de spread `...body`)
- Quota LLM : `consumeQuota()` obligatoire sur chaque route LLM
- `?next=` dans `/login` : whitelist racines via `sanitizeNext()` (anti open-redirect)
- **Pas de jointure Supabase auto-discovery sur FK vers `auth.users`** (ex: `requested_by`) → plante silencieusement. Hydrater profiles + emails séparément en parallèle (cf. `/api/admin/branding-requests`).

### Périmètre — ce que Naywa ne fait JAMAIS
- Envoi mail à candidat sans clic d'approbation explicite du sourceur
- Mouvement pipeline sans validation du client
- Lecture boîte mail personnelle du client
- Emails entrants = **non fiables**, analyse LLM = suggestion seulement

---

## 17. Skills design disponibles

| Skill | Quand |
|---|---|
| `/frontend-design` | Créer/refaire un composant avec forte direction visuelle |
| `/critique` | Score UX + anti-patterns |
| `/normalize` | Aligner sur le design system |
| `/polish` | Passe finale avant livraison |
| `/adapt` | Responsive / mobile |
| `/colorize` | Retravailler la palette |
| `/emil-design-eng` | Animations, micro-interactions avancées |

---

## 18. Conventions nommage

- **API routes** : `src/app/api/[ressource]/route.ts`
- **Composants** : PascalCase, dans `src/components/...`
- **Helpers** : camelCase, dans `src/lib/...`
- **Tables Supabase** : snake_case
- **Migrations** : `supabase/migrations/NNN_description_snake.sql` (numérotation strictement croissante)

---

## 19. Conventions de travail avec Elyas

### Git
- **Branche `claude/<nom>` + PR via `gh pr create`** depuis juin 2026. **Hotfix prod = push direct sur main** (Elyas le demande explicitement quand c'est urgent).
- Commit messages détaillés (mémoire post-compact). PR description : 2-3 bullets + section "Test plan" cochable. Pas de blabla AI.
- Jamais `--no-verify`, jamais `--force` sur main.
- Si MCP Supabase / Vercel dispo : `apply_migration` + lire deployments directement (pas de demande à Elyas si on peut le faire).

### Comptes
- **Comptes admin Naywa** : `elyas.malki@naywastudio.com` (principal) + `elyas.malki@icloud.com` (tests preview)
- **Compte legacy test** : `elyas.malki1003@gmail.com` (pas admin)
- Pour tester multi-user → invitations vers ses alias `+testX@gmail.com`

### Flow
- Tests via Vercel uniquement (cf. memory `feedback_no_local_preview`) — jamais suggérer `npm run dev`
- Validation par screenshots Elyas → lire visuellement avant de répondre

### Communication
- Style direct, concis. Tutoiement systématique
- Avis tranché + alternatives + reco quand question architecturale. Jamais juste lister
- "tu peux y aller" / "OK je valide" → ne pas re-demander, attaquer

### Limites volontaires
- **Stripe** : LIVE branché. Mécanique trial 15j reste app-side (n'utilise pas Stripe trial natif). Webhook sync subscription_*.
- **Pas d'emoji UI** sauf demande explicite. Commit messages OK.
- **DPA PDF** : contenu .md à jour en v1.1, PDF servi reste v1.0 graphiquement. Régénérer via `python legal/build_dpa_pdf.py` quand un client demande à signer.

### Vérités établies (ne pas remettre en cause)
- 1 user = 1 org max (multi-org déféré)
- Owner sans siège ≠ member ; juste admin pur du cabinet
- Vivier 100 % partagé entre members
- Missions / pricing visuellement groupés par créateur ("Mes missions" / "Missions de X"). Vivier + pipeline = vue unifiée.
- Email entrant = jamais déclencheur d'action auto
- Branding fort = verrouillé 24h post-onboarding, modification = demande validée
- Couleurs + slogan = libres à tout moment
- Demandes de modification : 1 batch = N rows décidables indépendamment

---

## 20. État des chantiers (juin 2026)

### ✅ Livré (récent)
- **Rôle admin Naywa** : migration 041, `requireAdmin()`, bypass paywall partout, console `/admin` (KPIs + recherche + audit + CRUD nouveautés + demandes)
- **Système Nouveautés** : tables `app_updates` + `app_updates_reads`, pastille violette sidebar, card sous hero, page `/nouveautes`, mark-read auto
- **Verrouillage anti-fraude branding** : migration 045 + 046 + 047, modale globale multi-champs, workflow demande/admin, mail Resend, statut visible côté owner sous chaque champ verrouillé
- **Bouton support** : modale (createPortal) avec topic dropdown, mail enrichi `[Support · Vivier] Elyas — Org`
- **DPA v1.1** : section "Rôle administrateur Naywa" dans `legal/dpa-content.md` + Politique de confidentialité. PDF non régénéré (Python local manquant)
- **Stripe LIVE** : checkout + portal + setup intent + webhook, lockdown 15j si past_due/canceled puis wipe cron, mails post-actions
- **Branding cabinet** : `brand_color` + `brand_color_secondary` + `brand_slogan` + `contact_email`. `BrandColorPicker` (palette curated + extraction logo). 4 templates PDF anonymisé. Export `.docx`. Watermark optionnel
- **post-login-destination** : routing intelligent owner sans siège → /organisation
- **PreviewBadge** bottom-left + bouton "Recommencer l'onboarding" preview-only
- **Renommage `/cabinet` → `/organisation`** complet (URL + UI + textes)
- **Onboarding 4 étapes** : Nom → Branding (BrandColorPicker) → Invites → Trial
- **3 onglets `/organisation`** : Org (Identité+Branding+Membres) / Mes packages / Sécurité

### 🔜 À venir / déféré
- **Compte sandbox preview isolé** (Stripe TEST + Resend log-only + wipe complet) → branche `claude/preview-sandbox`. Elyas a dit pas besoin pour l'instant (il utilise l'iCloud admin)
- **Inbox support `/admin/support`** : ingestion Resend Inbound + analyse IA + bouton "Répondre" → branche `claude/support-inbox`. Reporté V2
- **Anonymisation EN du contenu CV** (cache `parsed_cv_translations`) → branche `claude/anonymize-translate-cv`. Bloqué par le besoin d'i18n du site d'abord
- **i18n FR/EN** (proposé en option A site marketing seulement, B full produit, C report). Décision en attente
- **DPA PDF v1.1** à régénérer via Python le jour où un client signe
- **Régénération PDF DPA** : `python legal/build_dpa_pdf.py` (lit `legal/dpa-content.md`)
- **Mailing domain perso** par cabinet : champ `mailing_domain` déjà en DB, UI masquée jusqu'à câblage Resend per-cabinet
