# Naywa Studio — Contexte projet

> **Statut** (juin 2026) : Premier client en période d'essai (GMH Engineering
> Solutions). Plus en beta privée. Stripe **branché en LIVE**. Produit phare =
> **Nora**, l'assistante IA du workspace. Un seul package commercial : **Package
> Sourcing** (+ variante **Sourcing Pro** qui ajoute la Suite Pricing Syntec).
> Stockage CV sur **Cloudflare R2** (depuis PR3). Système de **quotas mensuels
> dérivés du plan** (stockage + crédits IA) avec **override admin custom**.

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
- **Supabase** — Auth (email/mdp + Google OAuth), Postgres + RLS org-scopée, Storage **(logos uniquement post-PR3)**
- **Cloudflare R2** — Stockage CV + PDF anonymisés via S3-compatible API (10 GB gratuits, $0.015/GB ensuite, **egress gratuit**). 2 buckets : `naywa-cv`, `naywa-logos` (créé mais inutilisé V1).
- **@aws-sdk/client-s3** + **@aws-sdk/s3-request-presigner** — client R2
- **Stripe** — Checkout + Customer Portal + webhooks (LIVE mode)
- **Resend** — SMTP auth (via Supabase) + envois applicatifs sur `mail.naywastudio.com`
- **OpenRouter** — LLM (`gpt-4o-mini`) + OCR plugin `mistral-ocr`
- **unpdf** — extraction texte PDF serverless
- **@react-pdf/renderer** — PDF anonymisé candidat + fiche pricing
- **docx** — export Word du CV anonymisé
- **Sentry** — error tracking (server + client + edge). Tag `SENTRY_ENVIRONMENT=production` en prod.
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
- `/login` — connexion + signup (toggle `?mode=signup`, message `?expired=1`). Lien "Mot de passe oublié ?" en mode login.
- `/auth/callback` — callback OAuth Google
- `/accept-invite?token=…` — flow d'invitation autonome (4 états)
- `/forgot-password` — saisie email + `supabase.auth.resetPasswordForEmail()` → Resend
- `/reset-password` — atterrissage du lien magique, saisie nouveau MDP via `updateUser()`

### Onboarding (`/onboarding`, owner uniquement)
4 étapes : **Nom cabinet → Branding (logo + couleurs + slogan + contact) → Invitations → Trial 15 j**. Redirige depuis `/organisation/*` tant que `cabinet_onboarded_at` est NULL.

### Console organisation `/organisation` (protégée par `proxy.ts`)
3 onglets dans une page unique :
- **Onglet org** (par défaut, libellé = nom de l'org) : Identité (read-only) | Membres | Branding pleine largeur
- **Onglet "Mes packages"** : layout 2 colonnes — gauche (siège + abonnement + politique pricing pliable), droite sticky (`<QuotaGauges />` : barres stockage + crédits IA avec %)
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
- `/admin/maj` — CRUD nouveautés (modale title + body markdown enrichi + catégorie + multi-select `affected_paths` + preview live)
- `/admin/recherche` — recherche email/prénom, table résultats + **colonne "Quota" avec bouton "Custom"** pour set/clear `quota_override_json` (audit log auto)
- `/admin/demandes` — file des demandes de modification branding, regroupées par batch

### Nouveautés `/nouveautes` (auth)
Page changelog produit accessible depuis sidebar workspace + menu profil organisation. **Onglets par zone impactée** (Tout / Général / Vivier / Pricing / etc.) + **cards repliables** (toutes fermées par défaut, click pour expand). Pastille violette sidebar workspace via `<NavUnreadDot href={...}/>` quand non-lue concerne la zone. Card sobre sous le hero workspace + sous les tabs organisation. Mark-read auto à l'ouverture.

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
| `GET /api/cron/recompute-storage` | Cron 2h UTC — recalcule `storage_used_bytes` par org en listant R2 |
| `GET /api/cron/reset-llm-quota` | Cron mensuel le 1er 00:05 UTC — reset `llm_actions_this_month` à 0 |
| `GET /api/cron/migrate-cv-to-r2` | Cron 4h UTC — migre les CV résiduels Supabase Storage → R2 par batch de 200, idempotent |

### Vivier + parsing
| Route | Rôle |
|---|---|
| `POST /api/cv/upload` | Upload PDF (R2 `{org_id}/{cand_id}/...`) + check 3 quotas (daily, storage org, LLM org) + insert candidate |
| `POST /api/cv/[id]/parse` | R2 download (avec lazy migration si fichier encore sur Supabase) → unpdf → OpenRouter → `parsed_cv` + `taxonomy` |
| `POST /api/cv/[id]/anonymize` | PDF anonymisé (R2, 4 templates : classic/two-column/executive/bento, watermark optionnel) + consomme crédit LLM org |
| `POST /api/cv/[id]/anonymize/docx` | Word éditable (format linéaire indépendant des templates) |
| `POST /api/cv/[id]/compose` + `/send` | Brouillon outreach + envoi Resend |
| `GET /api/cv/[id]/signed-url` + `DELETE` | URL temporaire R2 (avec lazy migration fallback) + suppression cascade R2 + décrément `storage_used_bytes` |
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
| `POST /api/admin/quota-override` | Set/clear `quota_override_json` d'une org. Audit log auto. |
| `POST /api/admin/migrate-cv-to-r2` | Migration batch manuelle (dry_run + limit). Inutile en pratique : cron + lazy migration s'en chargent. |
| `GET /api/quota` | Auth — retourne stockage + crédits IA used/limit + plan label. Source des jauges UI. |

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
| `markdown.ts` | Parser markdown maison **enrichi** (PR2) : gras, italique, listes, liens, code, **callouts `:::tip/info/warning/success`**, **CTA `:::cta /path\|Label:::`**, **titres `##` stylisés**, **pastilles inline `[NOUVEAU]/[FIX]/...`**. Anti-XSS : escape HTML d'abord. |
| `r2-storage.ts` | Wrapper Cloudflare R2 (S3-compatible) : `r2Upload`, `r2SignedUrl`, `r2Download`, `r2Delete`, `r2GetSize`, `r2SumSizeByPrefix`. `assertOrgScopedPath()` filet sécu (path doit commencer par `{org_id}/`). |
| `lazy-migrate-cv.ts` | Helper qui migre un fichier Supabase Storage → R2 au moment d'un read (signed-url, parse). Idempotent + best-effort (fallback Supabase si échec). |
| `quota-tiers.ts` | `QUOTAS_BY_PLAN` (sourcing_1..4 + sourcing_pro_1..4) + `getQuotas(org, {isAdmin})` → résolution `admin > override > lockdown > plan > trial`. `formatBytes()`, `quotaPercent()`. |
| `affected-paths.ts` | `AFFECTED_PATH_OPTIONS` (zones de l'app pour `app_updates.affected_paths`) + `sanitizeAffectedPaths()` (allowlist). |
| `cv-parser.ts` | unpdf → LLM → `ParsedCv`. `is_apprentice` + `years_experience` post-diplôme |
| `candidate-ref.ts` | `candidateRefLabel(id)` → `C-XXXXXXXX` |
| `vivier-clusters.ts` | Helpers carte vivier |
| `matching.ts` | `normalizeJob()` + score LLM |
| `openrouter.ts` | Wrapper LLM (chat + json_object + plugins) |
| `quota.ts` | **3 niveaux** (PR3+PR4) : `consumeQuota()` (daily user) + `consumeOrgLlmAction()` / `consumeOrgLlmActionForUser()` (mensuel org, sur les 10 routes LLM) + `checkStorageQuota()`/`incrementStorageUsed()`/`decrementStorageUsed()` (stockage R2). |
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
- `components/updates/UpdatesHeroCard.tsx` + `UpdatesNavItem.tsx` (`UpdatesNavBadge` global + `NavUnreadDot href=...` par zone) + `useUnreadUpdates.ts` (retourne `{ unreadCount, latestTitle, unreadPaths: Set<string> }`)
- `components/quota/QuotaGauges.tsx` (jauges stockage + crédits IA avec modale détail) + `QuotaWarningBanner.tsx` (banner workspace à 80%, rouge à 100%)
- `components/ui/useEscapeKey.ts` (hook Échap → onClose, monté dans 7 modales du produit)
- `components/support/SupportButton.tsx` (modale via `createPortal` — sort du stacking context sticky header)
- `components/layout/PreviewBadge.tsx` (bottom-left, `VERCEL_ENV === "preview"`)

---

## 6. Schéma Supabase

### Tables principales
- **`organizations`** — `name`, `owner_user_id`, `brand_name`, `brand_logo_path`, `brand_color`, `brand_color_secondary`, `brand_slogan`, `contact_email`, `branding_locked_at`, `seats_total`, `pending_deletion_at`, `trial_ends_at`, `cabinet_onboarded_at`, `pricing_*`, `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `subscription_price_lookup`, `subscription_seats`, `subscription_has_pricing`, `current_period_end`, `lockdown_started_at`, `package_sourcing_onboarded_at`, `pricing_onboarded_at`, **`storage_used_bytes`** (recalc cron), **`llm_actions_this_month`** + **`llm_period_start`** (reset cron mensuel + filet runtime), **`quota_override_json`** (`{storage_gb, llm_monthly}` ou NULL = quotas du plan)
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
- **Supabase `brand-logos`** — privé. RLS exige `{org_id}` comme 1er segment du path. Logos approuvés : `{org_id}/{ts}.ext`. Logos en cours de demande : `{org_id}/pending/{ts}.ext`
- **Supabase `cv-uploads`** — **deprecated**, vidé progressivement par `cron/migrate-cv-to-r2` + lazy migration. Path legacy `{user_id}/{candidate_id}/...`. Routes ont un fallback automatique pour les fichiers restants.
- **Cloudflare R2 `naywa-cv`** — actif. Path R2 = `{org_id}/{candidate_id}/{filename}`. PDFs candidats + anonymisés. Sécurité : pas de RLS, `assertOrgScopedPath()` vérifie le path en code avant chaque op.
- **Cloudflare R2 `naywa-logos`** — créé mais inutilisé V1 (logos restent sur Supabase, taille négligeable).

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
| 048 | `app_updates.affected_paths text[]` (zones impactées par une nouveauté) |
| 049 | `organizations.storage_used_bytes`, `llm_actions_this_month`, `llm_period_start`, `quota_override_json` |

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
- **Markdown enrichi** (PR2) : callouts `:::tip/info/warning/success`, CTA `:::cta /path|Label:::`, titres `##` stylisés (barre violette + sparkle), pastilles `[NOUVEAU]/[FIX]/[AMÉLIORATION]/[ATTENTION]/[BETA]`.
- **Affected paths** (PR2) : colonne `app_updates.affected_paths text[]`. L'admin coche les zones impactées dans `/admin/maj`. Le hook `useUnreadUpdates` retourne `unreadPaths: Set<string>` agrégé pour afficher des pastilles ciblées via `<NavUnreadDot href={t.href}/>` sur la sidebar workspace.
- **Layout `/nouveautes`** : onglets par zone (Tout + Général + une tab par zone présente dans la liste) + cards repliables (toutes fermées par défaut, click pour expand).
- **Hook `useUnreadUpdates`** : poll 60s → `{ unreadCount, latestTitle, unreadPaths, loading }`
- **Pastille violette globale** (`UpdatesNavBadge`) : sidebar workspace + menu profil organisation
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

## 10bis. Stockage R2 + Système de quotas

### Buckets R2
- `naywa-cv` (actif) — PDFs candidats + anonymisés. Path = `{org_id}/{candidate_id}/{filename}`
- `naywa-logos` (créé inutilisé V1) — logos restent sur Supabase Storage par souci de scope

### Sécurité R2
- **Pas de RLS** sur R2 → `assertOrgScopedPath(path, callerOrgId)` dans `lib/r2-storage.ts` vérifie que le premier segment du path est bien l'org du caller.
- Tous les paths construits **server-side** avec `profile.organization_id`, jamais depuis le client.
- Credentials env vars Vercel `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`.
- TTL signed URL 1h max.

### Migration Supabase Storage → R2 (transparente)
- **Cron quotidien** `/api/cron/migrate-cv-to-r2` (04:00 UTC) : batch 200/jour, idempotent
- **Lazy migration** dans `signed-url` + `parse` via `lib/lazy-migrate-cv.ts` : si le fichier est encore sur Supabase, on le migre à la volée AVANT de servir, fallback Supabase si échec
- Le client ne fait rien, ne voit rien

### Quotas — 3 niveaux (lib/quota.ts)
1. **Daily par-user** (`consumeQuota` / `daily_usage` / RPC `bump_usage`) — filet anti-script
2. **Mensuel par-org LLM** (`consumeOrgLlmActionForUser` / `organizations.llm_actions_this_month`) — appelé sur les **10 routes LLM** (PR4) : upload, anonymize, critique, compose, jobs/extract, jobs/match, jobs/chat, candidates/match-all, vivier/cluster, assistant, pricing/compare
3. **Stockage R2 par-org** (`checkStorageQuota` + `incrementStorageUsed` + `decrementStorageUsed`) — hard cap à l'upload, recalcul nightly

### Grille (lib/quota-tiers.ts — source unique)
| Plan | Stockage | Crédits IA / mois |
|---|---|---|
| **Trial 15j** | 500 MB | 3 500 |
| Sourcing 1 siège | 1 GB | 3 500 |
| Sourcing 2 sièges | 2 GB | 8 000 |
| Sourcing 3 sièges | 3 GB | 12 500 |
| Sourcing 4 sièges | 4 GB | 17 000 |
| Pro 1 siège | 1.5 GB | 4 500 |
| Pro 2 sièges | 3 GB | 10 500 |
| Pro 3 sièges | 4.5 GB | 16 500 |
| Pro 4 sièges | 6 GB | 22 500 |

Coût Naywa worst case (Std 4 sièges plein) ≈ 17 €/mois sur 119 € CA. Marge ~100 €.

### Résolution quota — `getQuotas(org, {isAdmin})`
Ordre de priorité : **admin Naywa (infini)** > **override custom (`quota_override_json`)** > **lockdown (0)** > **plan actif Stripe** > **trial 15j** > **aucun accès (0)**.

### Affichage utilisateur
- **`/organisation` onglet "Mes packages"** : `<QuotaGauges />` en colonne droite sticky. Barres vertes 0-70 %, ambrées 70-90 %, rouges 90-100 %. Format compact (% en gros, valeur absolue toujours, "/limit" seulement >70%). Modale "Voir détail" avec CTA "contactez-nous" pour extensions.
- **Workspace layout** : `<QuotaWarningBanner />` discret apparaît à 80 %, vire rouge à 100 %.
- **`/tarifs`** + **modale `PlanPickerModal`** dans `/organisation` : affichent quotas inclus dynamiquement par sièges (source `QUOTAS_BY_PLAN`).

### Override admin custom
Bouton "Custom" dans `/admin/recherche` → modale → set/clear `organizations.quota_override_json = {storage_gb, llm_monthly}`. Audit log auto. V1 facturation manuelle hors-Stripe (Stripe metered billing reporté V2).

### Crons
- `recompute-storage` (02:00 UTC) — somme R2 ListObjects par org → update `storage_used_bytes`
- `reset-llm-quota` (1er du mois 00:05 UTC) — reset `llm_actions_this_month` à 0. Filet runtime : `consumeOrgLlmAction` reset à la volée si décalage `llm_period_start`.
- `migrate-cv-to-r2` (04:00 UTC) — batch 200, idempotent

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
SENTRY_ENVIRONMENT        # "production" en prod (à set Production scope uniquement)
CALENDLY_CLIENT_ID + CALENDLY_CLIENT_SECRET + CALENDLY_WEBHOOK_SIGNING_KEY
R2_ACCESS_KEY_ID          # Cloudflare R2 API token
R2_SECRET_ACCESS_KEY
R2_ENDPOINT               # https://<account-id>.r2.cloudflarestorage.com
```

### Configuration externe
- **Supabase Auth → SMTP** : Resend (smtp.resend.com:465, user `resend`, sender `contact@mail.naywastudio.com`)
- **Supabase Auth → Templates** : 4 templates HTML brandés Naywa (Confirm signup, Invite, Reset, Magic Link)
- **Supabase Auth → Redirect URLs** allowlist : `/workspace`, `/organisation`, `/onboarding`, `/auth/callback`, `/admin`, `/nouveautes`, **`/reset-password`** (pour le flow MDP oublié)
- **Cloudflare R2** : compte activé, buckets `naywa-cv` + `naywa-logos`. API token avec Object Read & Write sur les 2 buckets.
- **Vercel** : Region `cdg1`. 5 crons dans `vercel.json` :
  - `wipe-expired-orgs` 3h UTC
  - `wipe-lockdown-data` 3h30 UTC
  - `recompute-storage` 2h UTC
  - `reset-llm-quota` 1er du mois 00:05 UTC
  - `migrate-cv-to-r2` 4h UTC
  Headers sécurité (X-Frame-Options DENY, etc.).
- **Sentry** : 3 alert rules actives (Nouvelle erreur, Erreur récurrente 10+ events 60min throttle, Taux d'erreur élevé 20/10min). Destinataire = `elyas.malki@naywastudio.com`. **À faire un jour** : restreindre les rules à env `production` une fois ce dernier visible dans Sentry après premier deploy avec `SENTRY_ENVIRONMENT` set.

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
- Quotas LLM : `consumeQuota()` daily + **`consumeOrgLlmActionForUser()` mensuel org** obligatoires sur chaque route LLM (PR4)
- Quota storage : `checkStorageQuota()` + `incrementStorageUsed()` sur chaque route qui écrit dans R2
- `?next=` dans `/login` : whitelist racines via `sanitizeNext()` (anti open-redirect)
- **Pas de jointure Supabase auto-discovery sur FK vers `auth.users`** (ex: `requested_by`) → plante silencieusement. Hydrater profiles + emails séparément en parallèle (cf. `/api/admin/branding-requests`).
- **Paths R2 forgés server-side** avec `profile.organization_id`, jamais depuis le client. `assertOrgScopedPath()` en filet.
- **`runtime = "nodejs"`** déclaré sur toutes les routes qui dépendent de Node (Stripe SDK, Resend, admin-supabase, pdf-renderer, docx, openrouter, R2 SDK)
- **Modales** : `useEscapeKey(onClose)` monté dans chaque modale (raccourci clavier).

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

### ✅ Livré récent (cette session, juin 26 2026)

Tout mergé sur main, par ordre chronologique :

- **PR4** `5cffe0f` LLM quota org sur les 10 routes LLM + grille crédits 2× plus généreuse (3500-22500 selon plan, trial 1700)
- **PR5** `7a2e074` UX matching (vraie barre progress scored/total, bouton haut-droite) + **suppression complète Calendly** (5 routes API, 3 composants, table interviews, colonnes calendly_* sur profiles) + sweep cohérence (signup emailRedirectTo /cabinet → /organisation, FAQ "sans plafond mensuel", onboarding feature list)
- **PR5b** `949a815` Matching batches LLM en parallèle (Promise.allSettled, ~5× plus rapide)
- **PR5c** `e0558b6` Admin trial : `/admin/recherche` montre échéance Stripe ou jours d'essai restants + bouton "Essai" (modale prolonger N j / réinitialiser J+15) → route `POST /api/admin/trial`
- **PR6** `f81bc36` Quota reset à l'**anniversaire d'abonnement** (J+30 du `llm_period_start` stampé par webhook Stripe à l'activation) + **trial = pot fixe 1700 crédits** sur 15 j (pas mensuel). Migration 051 backfill. Cron daily au lieu de monthly. `Quotas.period: "month" | "fixed"`. `/api/quota` expose `period`. UI QuotaGauges adapte le wording.
- **Hotfix trial cap** `0cceb65` Retire le cap `daysLeft ≤ TRIAL_DURATION_DAYS` dans `lib/trial.ts` qui plafonnait l'affichage à 15 j même après prolongation admin.
- **PR7** `504b6f2` Refonte fiabilité matching : `temperature: 0` + `seed` déterministe (jobId+candidateIds) + prompt v2 avec chain-of-thought `reasoning` + règle juniors/alternants/concessions sourceur + retry au lieu de fallback "fair 45" + `is_apprentice` + `current_company` ajoutés au payload candidat. Param `seed?: number` ajouté à `openrouter.ts`.
- **PR8** `ef6beb4` Retire daily cap user (`DAILY_LIMITS` bumpé à 10 000 = no-op) + rename "Crédits IA" → "Actions IA" UI partout (QuotaGauges, tarifs, organisation, admin recherche, FAQ) + messages erreur neutralisés ("Limite d'usage IA atteinte" au lieu de "Quota crédits…").
- **PR9** `d546137` Upload massif vivier : cap UI 30 → 500 + pool 5 workers concurrent (222 fichiers passent de ~7 min à ~90 s).
- **PR10** `238f8d9` Batching cluster (séquentiel 150/batch, cap 900) + batching matching (parallèle 10 concurrents, MAX_SCORED_PER_RUN 40 → 500).
- **PR11** `3656c3b` Speedup matching 200 CVs : `MATCH_BATCH_SIZE` 4 → 8, `CONCURRENT_BATCHES` 10 → 20, `maxDuration` 60 → 300.
- **Sprint A** `cfcb22c` 3 fixes blocants : `CLUSTER_BATCH_SIZE` 150 → 50 (anti-504), désactivation auto-cluster au mount (boucle infinie), auto-flip matching stale → "error" si updated_at > 90s.
- **Sprint B (taxonomie zones)** `011fe26` Migration 052 : `cluster_manifests.is_seed/created_by_user_id/display_order`. Route cluster en 2 modes : 1er run = Nora propose ≤ `maxZonesForVivierSize(n)` zones, runs suivants = mode CLOSED (Nora choisit dans la liste). Zone "Autre" toujours présente. CRUD `/api/vivier/zones` (POST/PATCH/DELETE). Composant `ZonesManager` panneau "Mes zones".
- **Sprint B'** `ac25b16` Pivot : retire vue Carte + panneau Zones de l'UI (code conservé en backend). Vue Liste uniquement pour `/workspace/vivier`. À retravailler plus tard pour la taxonomie.
- **E1 + PR-X** `3e57aff` :
  - E1 : onglet **Missions en 2e** (avant Vivier) + bouton **"+ Importer des CVs"** sur fiche mission + modale `MissionCvUploadModal` (upload → parse → score-one en parallèle 5) + route `POST /api/match/score-one` (réutilisable E2)
  - PR-X fixes : R2 `storage_upload_failed` sur `..` dans filename (collapse + strip), doublon detection à l'upload (renvoie existant + skip parse + badge "Doublon"), prompt v3 SANS justification ni reasoning (gain ~1-2s/batch, maxTokens 3200→1200), tier seuils adoucis (excellent 75 / good 55 / fair 35), espace vide retiré dans card "Pourquoi ça matche" quand justif vide

### Pivot taxonomie vivier (Sprint B' juin 2026)
**Code conservé mais désactivé côté UI** :
- Composant `src/components/workspace/VivierMapView.tsx` (vue Carte) — pas importé dans `/workspace/vivier`
- Composant `src/components/workspace/ZonesManager.tsx` (CRUD zones) — pas importé
- Routes API `/api/vivier/cluster` (POST + GET) + `/api/vivier/zones` (GET/POST/PATCH/DELETE) — fonctionnelles
- Table `cluster_manifests` + migration 052 — intacte
- Pas de viewMode toggle, juste vue Liste plate sur `/workspace/vivier`

**Pour réintégrer plus tard** : réimporter `VivierMapView` + `ZonesManager` dans `vivier/page.tsx` + remettre le toggle Carte/Liste.

### Architecture E1 (uploads par mission, juin 2026)
**Route `POST /api/match/score-one`** body `{ candidate_id, job_id }` :
- Vérifie ownership via RLS (sb.from(...).maybeSingle())
- Consomme un crédit LLM org
- Appelle `scoreBatch(job, [candidate])` (lib/matching.ts)
- Upsert match_assessments (update si déjà existante, sinon insert avec pipeline_stage="identified")
- Mission tag write-back si tier excellent/good
- Réutilisable par E2 (formulaire candidature publique)

**Composant `MissionCvUploadModal`** sur fiche mission :
- Drag-drop PDF, cap 500 fichiers
- Pool 5 workers concurrents
- Pipeline par CV : `upload → parse → score-one` (skip parse si doublon déjà parsé)
- Affichage live des stages : `Upload… → Lecture du CV… → Scoring…` puis badge final score + tier (+ badge orange "Doublon" si appliqué)

### Doublon detection à l'upload
`POST /api/cv/upload` check `{org_id + cv_file_name + cv_file_size}` AVANT de créer une nouvelle row. Si existant → renvoie `{ok: true, duplicate: true, candidate: existing}`. Le client skip le parse (déjà fait) et passe direct au scoring. Gain ~5-10 s par doublon + pas de pollution vivier.

### Matching scoring (prompt v3, juin 2026)
- Modèle : `gpt-4o-mini`, `temperature: 0`, `seed` déterministe (jobId + candidateIds.sort().join), `maxTokens: 1200`
- Prompt court : 4 dimensions + score + tier UNIQUEMENT (plus de reasoning ni justification — gain latence)
- Seuils tier : **excellent ≥ 75, good ≥ 55, fair ≥ 35, poor < 35** (adoucis)
- Concessions sourceur : briefing mission lu en priorité, le LLM applique sans pénaliser
- Juniors/stagiaires/alternants : légitimes sur postes ouverts au niveau, `is_apprentice` exposé explicitement au LLM
- Retry une fois sur candidats skippés (pas de fallback "fair 45" qui pollue)

### Roadmap immédiate (à attaquer après compact)
- **PR-Y** : refonte UI mission page en **3 colonnes** par source de provenance :
  - "Ont postulé" (vide pour l'instant, attend E2)
  - "Vos importations" (CVs uploadés via E1)
  - "Depuis le vivier" (matching vivier + assignés)
  - Chaque colonne a son propre bouton d'action en haut
  - Nécessite migration 053 : ajouter `source` enum sur `match_assessments`
- **E2** : formulaire candidature publique par mission (URL `/apply/[token]`, formulaire customisable : champs requis cochables + questions custom, CAPTCHA Turnstile, rate limit, validation PDF, branding cabinet) — réutilise `POST /api/match/score-one` après le parse
- **Refonte tarifs/plans** : à discuter, source unique est `lib/quota-tiers.ts`
- **Avatars** au lieu d'extraction photo CV (déjà la conclusion : feature flag, pas prioritaire)

### Update CLAUDE.md
Cette section est à jour au 2026-06-26 (post-merge `3e57aff`). Sections 1-19 à relire après les multiples PRs : routes `/api/vivier/zones`, `/api/match/score-one`, `/api/admin/trial`, modèle de quotas anniversaire, suppression Calendly complète, prompt v3 matching, taxonomie zones fermée (code dispo, UI off).

### Compact-safety
Si compactage en cours : les PRs plus anciennes sont mergées sur main. La règle utilisateur stricte est **push branche → attendre validation preview → puis merger** ([[feedback_preview_before_merge]]).

#### PR-Z MERGÉE EN PROD — 2026-07-03
**PR-Z (critères flexibles) est mergée sur `main` (commit `5913a10`) et déployée en PRODUCTION.** Elyas a validé le flow en live (brief Club Med alternant commercial immobilier) et donné le go merge. Corrections finales incluses : critères Nora diversifiés (fin des 5× "Compétences" → skills+langues+diplôme+secteur+contrat, `d1d2924`), mini-libellé niveau sur cartes/fiche ("Anglais C1", "TOEIC ≥ 800", `5d67c76`), emojis PR-Z → SVG, et **garde-fou missions legacy** (`5913a10` : `needsOnboarding` ne force le wizard que si 0 match ; sinon bannière opt-in "Configurer les critères"). **Garantie anciens matchs** : route match + `score-one` UPSERT en préservant `pipeline_stage`/`in_pipeline`/`source` — jamais de delete, la ré-évaluation ne rafraîchit que score/criteria_eval/tier.

#### Refonte flow + visuel MERGÉE EN PROD — 2026-07-04
**Branche `claude/mission-flow-visual-refonte` mergée sur `main` (commit `7d8be6b`, fast-forward) et déployée.** Migration 055 (`match_assessments.salary_expectation_brut`) appliquée via MCP. Validé en live par Elyas. Contenu :
- **Création en PAGE** (`/workspace/missions/new`) — fini la popup. `JobForm` a un prop `variant "modal"|"page"` (édition reste modale). Wizard 3 étapes Brief → Mission → Critères (stepper), `CriteriaOnboarding` en mode `embedded`. Atterrissage direct sur le cockpit.
- **Fondations visuelles** : `src/lib/ui-tokens.ts` (`ui` + `space`), fond workspace calmé (ShaderBackground retiré du layout workspace, gardé pour marketing), jauges recolorées **charte violette douce** (`dimColor`), cartes de matching refondues (score héros + hover `m.article`), filtres actifs en violet, `#9CA3AF`→`ui.textMuted` partiel.
- **Champs mission adaptatifs** : bloc pricing (Zone + TJM) affiché seulement si `hasPricingAccess(org,{isAdmin})` (**helper nouveau** dans `lib/subscription.ts` = admin OR pricing souscrit OR essai). **Salaire cible du poste = UNIVERSEL** (toujours visible). Placeholders sans jargon techno.
- **Prétention salariale** sur la fiche match (universelle) : col `salary_expectation_brut`, `PATCH /api/match/[id]` universel, carte + comparaison avec le salaire cible (Sous/Dans/Au-dessus · %).
- **Fiabilité 504** : `openrouterChat` timeout par défaut 45s→**24s** (sous les maxDuration 30s), `/api/jobs` borne normalizeJob 15s + parsing client robuste, extract maxDuration 9→30, critique timeoutMs 15s.
- **Matching fiabilisé** : (a) **rattrapage** des candidats non scorés (batches LLM qui jetaient étaient droppés sans retry → 37/66 au lieu de 66 ; fix = 2ᵉ passe petits batches). (b) **incrémental** : mission non modifiée → ne re-score que les nouveaux CV ; modifiée (`criteria_locked_at > matched_at`) → tout. Aucun match auto à l'ajout de CV.
- Critères : custom affiche son libellé sur les cartes, skills liste ses compétences repliées "voir plus", prompt crée des customs pour technos spécifiques.

Wipe org icloud (`1680d9d9`) refait via MCP (66 cand + 566 matchs + 15 missions, storage reset). R2 orphelins (admin bypass quota → OK).

**Reste (déprio Elyas)** : finition visuelle (sticky onglets/filtres, sweep `#9CA3AF` résiduel fiche match/barre mission, badges source). "Elyas reviendra sur les visuels plus tard."

#### PR EN COURS — Matching vivier par secteurs — branche `claude/vivier-sectors`
**PAS mergée. Dernier commit `f480b5a`. Migration 056 déjà appliquée** sur le projet Supabase `gtxjrepqiqbqbyhtmtlk` via MCP (table `sectors` + `candidates.sectors/sector_status` + `jobs.target_sectors/last_match_mode`). tsc + lint clean. Reprise directe : faire le **lot 2b** puis 3, 4, 5.

**Spec validée** (reste la référence) :
- **Secteurs** : multi par candidat (par NOM). `sectors` table org-scopée (liste canonique) + `candidates.sectors text[]` + `candidates.sector_status` ('auto' Nora non validé / 'to_review' à classer / 'validated' humain). `jobs.target_sectors text[]` + `jobs.last_match_mode`.
- **Classement à l'import** par Nora (précision > exhaustivité : 1-3 secteurs AVEC PREUVE, réutilise l'existant, "à classer" si pas sûre). **Revue rapide optionnelle non bloquante** (dropdown par CV, "Tout valider"). Profils hybrides = pas de plafond mais conservateur.
- **Périmètre à l'ONBOARDING mission** : Nora propose les secteurs cibles (comme les critères) → chips à valider. `jobs.target_sectors`.
- **3 modes ADDITIFS** (sur l'incrémental, jamais 2× le même CV), sans chiffres : **Intelligent** (séniorité ±2 + contrat + secteurs mission — défaut) · **Approfondi** (séniorité seule ±4, hors secteur — le delta) · **Complet** (le reste).
- **UX matcher** : un seul bouton → petit panneau au clic (juste le mode, secteurs déjà définis à l'onboarding).
- **Vivier** = organisé par secteurs : **liste de cartes secteur** (nom + nombre) → clic → **liste des CV**. Carte **"À classer"** en tête. Reclasser en 1 geste. Badges statut : Nora (violet clair) / À classer (ambré) / Validé (vert).
- **Garde-fous fiabilité** (`lib/sector-gate.ts`) : séniorité inconnue = gardé ; candidat to_review/sans secteur = JAMAIS exclu ; mission sans cible = filtre off ; **canary** (~5% des écartés → alerte si un "bon" ressort — à faire lot 4) ; secteur = guide jamais mur.

**Lots — état :**
- ✅ **Lot 1** (`1a62cba`) — fondations : migration 056, types (candidates/jobs/table sectors + alias `Sector`/`SectorStatus`, `CANDIDATE_COLUMNS` étendu), `lib/sector-gate.ts` (3 modes, `passesGate`/`partitionByGate`), `GET/POST /api/sectors` (liste + comptage + "à classer" + création).
- ✅ **Lot 2a** (`f480b5a`) — `lib/sector-classify.ts` (classif Nora bornée 10s), route `parse` appelle classifySectors + crée secteurs `created_by=nora` + stocke sectors/sector_status, **auto-match retiré du parse** (plus de match-all fire-and-forget → aligné "aucun match auto à l'ajout de CV"). `PATCH /api/candidates/[id]/sectors` (revue/édition → 'validated').
- ✅ **Lot 2b** (`b9b4fae`) — UI de revue à l'import : `components/workspace/SectorReviewControl.tsx` (badge statut Nora/À classer/Validé + dropdown éditable multi-secteurs + création à la volée, PATCH → 'validated'). Câblé dans `MissionCvUploadModal` (capture secteurs réponse parse/upload, colonne par CV scoré + **"Tout valider"** batch) + carte vivier `CandidateCard` (remplace l'ancien chip cluster, reclasse en 1 geste). `GET /api/sectors` alimente le dropdown au niveau page/modale.
- ⏳ **Lot 3** (reprise ici) — secteurs à l'onboarding : `POST /api/jobs/[id]/propose-sectors` (Nora, comme propose-criteria) + bloc chips "Secteurs ciblés" dans le wizard critères (`CriteriaOnboarding` ou étape mission) + allowlist `target_sectors` dans `PATCH /api/jobs/[id]`.
- ⏳ **Lot 4** — modes de match : panneau reveal sur "Matcher le vivier" (3 modes radio + phrase, sans chiffres) + brancher `partitionByGate` dans `/api/jobs/[id]/match` (lit `body.mode`, défaut 'complet' pour ne rien casser tant que l'UI n'envoie pas) + **canary 5%** + mémo `last_match_mode`.
- ⏳ **Lot 5** — vivier par secteurs : cartes secteur → liste CV + reclasser rapide + carte "À classer" + gestion secteurs (renommer/fusionner/supprimer avec cascade `candidates.sectors` + `jobs.target_sectors`) + action "Classer le vivier" (Nora sur les non classés).

Track Mac front `ent-mac-front` = couloir séparé ([[project_mac_front_track]]), ne pas toucher. Maquette validée (statuts import + panneau modes) faite via l'outil visualize.

#### PR-Z (archive détail) — branche `claude/pr-z-flexible-criteria`
Dernier commit `76c3751`. Migrations 053 (source enum) + 054 (jobs.criteria/criteria_locked_at + match_assessments.criteria_eval) **déjà appliquées** sur le projet Supabase `gtxjrepqiqbqbyhtmtlk` via MCP. Preview Vercel branch alias = `nawa-studio-git-claude-pr-z-fle-3a570b-...` (dernier build READY = ed57ace/76c3751). Testé en live navigateur, gros du flow validé.

Ce que PR-Z apporte :
- **Critères flexibles par mission** (remplace les 4 dimensions hardcodées). Catalogue 25 types `lib/job-criteria-catalog.ts`. `POST /api/jobs/[id]/propose-criteria` (Nora propose) + `PATCH /api/jobs/[id]/criteria` (sauve + stamp `criteria_locked_at`). `scoreBatchCriteria()` dans `lib/matching.ts` (quantitatif=score 0-100, qualitatif=yes/no/unknown+evidence, score global = moyenne pondérée des "main").
- **Flow mission** : création → redirect auto vers `/workspace/missions/[id]` → wizard `CriteriaOnboarding` (car `criteria_locked_at` NULL) → "Valider les critères" (PLUS de matching auto, le sourceur choisit) → empty state avec boutons.
- **UI** : `MissionSummaryBar` (bandeau collapsible), `MatchCard` (cartes avec jauges 0-100 + badges ✓/✗/?), `DynamicCriteriaFilters`, onglets par source (Tous/Postulé/Importé/Vivier). Fiche match : section "Critères de cette mission". Bandeau "critères modifiés" si `criteria_locked_at > matched_at`.
- **Affichage matching** : score TOUT le vivier (≤200) mais masque les profils "poor" (score < 35) derrière un dépliable "Voir N profils à faible affinité".
- **Doublons** : dedup upload org-scopé (préfère copie active, réactive "ancien", jamais de nouvelle ligne) + `score-one` upsert (jamais 2 matchs par couple). Confirmé 0 doublon intra-org.
- **Critère "custom"** éditable inline dans le wizard (libellé = description LLM).

Points connus / à faire : previews Vercel SSO-protégées ([[feedback_vercel_preview_sso_protected]]) → tester via l'user + vérif DB MCP. `file_upload` navigateur refuse les chemins hors session (test doublon fait par l'user). R2 orphelins après wipe (MCP ne delete pas les objets R2). Tâche spawn : mutualiser les ~12 appels `/api/updates` par page (hors PR-Z). **Prochaine étape user : validation preview finale → décision merge sur main, PUIS visuels/couleurs de l'app.** Track Mac front `ent-mac-front` = couloir séparé ([[project_mac_front_track]]), ne pas toucher.

Wipe : org `elyas.malki@naywastudio.com` (4e39ce0f) + org `elyas.malki@icloud.com` (`1680d9d9`, 91 candidats + 360 matchs supprimés, storage reset) faits via MCP.

---

### ✅ Sessions antérieures (déjà documentées)
- **PR4 — Quota LLM mensuel sur toutes les routes** : `consumeOrgLlmActionForUser()` ajouté aux 10 routes LLM. Grille crédits 2× plus généreuse.
- **PR3 — Stockage R2 + quotas** (mergé) : migration cv-uploads Supabase → Cloudflare R2 transparente (cron + lazy). Migration 049. 3 niveaux de quotas (daily user / mensuel org LLM / storage org). Override custom admin via `/admin/recherche`. Jauges `/organisation` + warning banner workspace. `/tarifs` et modale Stripe affichent quotas inclus dynamiquement.
- **PR2 — Nouveautés stylisées** (mergé) : markdown enrichi (callouts, CTA, pastilles, titres). Migration 048 affected_paths. Pastilles violettes ciblées par item sidebar. Page `/nouveautes` avec onglets par zone + cards repliables.
- **PR1 — Stabilité prod** (mergé) : 7 fixes (modale Échap, retry pricing, cooldown email, mot de passe oublié sur /login + /forgot-password + /reset-password, empty states CTA, runtime nodejs sur routes lourdes, standardisation erreurs API).
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
- **PR4 à merger** : `claude/llm-quota-all-routes` en attente validation Elyas + merge
- **Self-service extras quotas (V2)** : aujourd'hui Elyas set manuellement `quota_override_json` via `/admin/recherche` quand un client demande plus. V2 = page `/organisation` "Augmenter mon quota" + Stripe metered billing (catalogue Produits "Extra Stockage 5 GB / 3 €", "Extra 2k crédits IA / 10 €"). À faire quand on a 2-3 demandes effectives.
- **Email auto à 90 % quota** : le cron `recompute-storage` détecte les orgs en zone rouge et envoie un mail proactif. ~30 min.
- **Tests unitaires** sur `getQuotas()` : admin / trial / lockdown / override / plan. ~1h.
- **Sentry — restreindre alertes à env `production`** : après premier deploy avec `SENTRY_ENVIRONMENT=production`, éditer les 3 alert rules pour Environment = production seulement (évite bruit previews). Voir aussi : débloquer support.it limbo + ajouter comme 2ᵉ destinataire.
- **Compte sandbox preview isolé** (Stripe TEST + Resend log-only + wipe complet) → branche `claude/preview-sandbox`. Elyas a dit pas besoin pour l'instant (il utilise l'iCloud admin)
- **Inbox support `/admin/support`** : ingestion Resend Inbound + analyse IA + bouton "Répondre" → branche `claude/support-inbox`. Reporté V2
- **Anonymisation EN du contenu CV** (cache `parsed_cv_translations`) → branche `claude/anonymize-translate-cv`. Bloqué par le besoin d'i18n du site d'abord
- **i18n FR/EN** (proposé en option A site marketing seulement, B full produit, C report). Décision en attente
- **DPA PDF v1.1** à régénérer via Python le jour où un client signe
- **Régénération PDF DPA** : `python legal/build_dpa_pdf.py` (lit `legal/dpa-content.md`)
- **Mailing domain perso** par cabinet : champ `mailing_domain` déjà en DB, UI masquée jusqu'à câblage Resend per-cabinet
