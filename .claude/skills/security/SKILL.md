---
name: security
description: Audit de sécurité complet du produit Naywa Studio (code + routes API + secrets + dépendances + éventuellement recon passif du site en prod). Se lance depuis main, crée sa propre branche de chantier, puis génère deux livrables Markdown locaux (rapport.md et lots.md) jamais commités.
---

# /security — Audit de sécurité Naywa Studio

Tu es un auditeur de sécurité qui review **son propre produit** (contexte défensif,
autorisé — pas de pentest tiers). Objectif : parcourir le code (et si possible le
site en prod, en lecture seule) pour lister les failles réelles, les noter par
sévérité, et produire un plan de correction actionnable par lots.

**Ce skill (la phase d'audit) ne modifie AUCUN fichier du produit.** Il ne fait
que lire, analyser, et écrire deux rapports dans `.claude/security-reports/`
(dossier hors de git : `.claude/security-reports/` est explicitement dans le
`.gitignore` du repo — rien de ce que tu écris ici ne peut finir dans un commit,
même par oubli, quelle que soit la branche. Ne déplace jamais ces fichiers
ailleurs dans le repo). La correction des lots (chantier séparé, sur demande de
l'utilisateur) touchera elle du code produit — c'est normal et voulu, seuls les
DEUX RAPPORTS eux-mêmes ne doivent jamais être commités.

## 0. Préparation

- **Pars toujours de `main` à jour**, puis crée une branche dédiée à ce chantier :
  `git checkout main && git pull origin main --ff-only && git checkout -b
  claude/security-audit-{YYYY-MM-DD}`. Si l'utilisateur est déjà sur une branche
  qu'il a créée exprès pour cet audit, réutilise-la (ne recrée pas une deuxième
  branche). C'est CETTE branche qui accueillera plus tard les commits de
  correction des lots — le rapport lui-même n'y sera jamais commité (gitignoré),
  seul le fait d'être dessus permet d'enchaîner audit → fixes → push sans
  mélanger avec d'autres travaux.
- Crée le dossier de sortie s'il n'existe pas : `.claude/security-reports/`
- Note la date du jour et le commit courant (`git rev-parse HEAD`, `git branch --show-current`)
  pour horodater le rapport.
- Relis mentalement la section 16 de `CLAUDE.md` ("Règles de développement" /
  "Sécurité serveur") et l'historique des audits déjà faits (section 20, chercher
  "Audit sécurité") — **ne re-liste pas comme neuve une faille déjà documentée
  comme corrigée**, mais VÉRIFIE qu'elle l'est réellement dans le code actuel
  (les régressions arrivent). Si un point d'un ancien audit est revenu, c'est du
  Critique (régression sur un point déjà connu = pire qu'une découverte neuve).

## 1. Inventaire

Fais l'inventaire avant d'auditer, pour ne rien manquer :
- Toutes les routes API : `Glob src/app/api/**/route.ts`
- Tous les fichiers `lib/` sensibles : auth, quota, admin, r2-storage, stripe, resend
- `src/proxy.ts` (gate d'auth global)
- `supabase/migrations/*.sql` (RLS, policies, fonctions SECURITY DEFINER)
- `package.json` (dépendances + versions)
- `next.config.*`, `vercel.json` (headers, crons)
- `.env*.example` ou toute doc de variables d'env (pour repérer les secrets attendus,
  jamais pour lire de vraies valeurs)

Si le dossier est trop gros pour tout lire en direct, lance 1 à 3 agents
`Explore` en parallèle (`run_in_background: false` puisque tu as besoin du
résultat tout de suite) pour couvrir en fan-out : (a) routes API + auth guards,
(b) migrations SQL + RLS, (c) lib/ sensible + config. Récupère leurs résultats
et poursuis l'analyse toi-même — la synthèse et la notation de sévérité ne se
délèguent pas.

## 2. Checklist d'audit (code)

Pour chaque route API, vérifie et note tout écart :

- **Auth** : `getUser()` appelé en tout début (sauf webhooks signés / flows
  token-based explicites) ?
- **Admin** : routes `/api/admin/*` → `requireAdmin()` en toute première ligne,
  return du 401/403 tel quel ?
- **Org-scoping** : la donnée lue/écrite est-elle bien filtrée par
  `organization_id` du caller (RLS ou filtre explicite) ? Un ID d'une autre org
  passé en paramètre peut-il retourner/modifier des données ?
- **PATCH/POST allowlist** : jamais de spread `...body` sur une table — allowlist
  de champs explicite ?
- **IDOR** : un paramètre d'URL/body (candidate_id, job_id, match_id, org_id...)
  est-il vérifié comme appartenant au caller avant usage ?
- **Quotas** : `consumeQuota()` + `consumeOrgLlmActionForUser()` sur les routes
  LLM, `checkStorageQuota()`/`incrementStorageUsed()` sur les routes qui écrivent
  dans R2 — présents et **non contournables** (ex: appelés après l'action au lieu
  d'avant, ou sur un chemin alternatif qui les saute) ?
- **Paths R2** : forgés server-side avec `profile.organization_id` uniquement,
  jamais depuis une valeur client ? `assertOrgScopedPath()` bien en filet ?
- **Webhooks** (`stripe/webhook`, `inbound-email`) : signature vérifiée AVANT
  tout traitement, secret lu depuis l'env, pas de fallback permissif ?
- **Cron routes** (`/api/cron/*`) : protégées par `CRON_SECRET` (header/query
  vérifié), pas déclenchables publiquement ?
- **`?next=` / redirections** : passent par une allowlist (`sanitizeNext()`),
  pas d'open redirect ?
- **Rate limiting** : les routes publiques non authentifiées (`/api/contact`,
  signup, `/api/support`, login) ont-elles un frein anti-abus (même basique) ?
- **Upload de fichiers** : validation MIME + taille côté **serveur** (pas
  seulement JS client), bucket Storage/R2 borné ?
- **Erreurs** : pas de stack trace / message interne Postgres renvoyé au client ;
  logs serveur (`console.error`/Sentry) oui, réponse JSON générique.
- **`runtime = "nodejs"`** déclaré sur les routes qui en dépendent (Stripe SDK,
  Resend, admin-supabase, pdf-renderer, docx, R2 SDK) ?

Pour la base (migrations SQL) :
- Toute nouvelle table a-t-elle une **policy RLS** (ou `current_org_id()`) ?
  Cherche les tables sans `ENABLE ROW LEVEL SECURITY` ou sans policy associée.
- Fonctions `SECURITY DEFINER` : `search_path` pinné + `REVOKE EXECUTE` sur les
  rôles qui ne devraient pas les appeler en RPC direct ?
- Colonnes sensibles (`is_admin`, `quota_override_json`, `storage_used_bytes`)
  modifiables uniquement server-side (jamais via une policy qui laisserait un
  UPDATE client les toucher) ?

Pour le code général :
- **Secrets en dur** : `Grep` sur des patterns de clé (`sk_live`, `sk_test`,
  `whsec_`, motifs base64 longs, `Bearer `, hostnames internes) dans `src/` —
  rien ne doit être en dur, tout doit venir de `process.env`.
- **XSS** : usages de `dangerouslySetInnerHTML` — le contenu est-il bien
  échappé/sanitizé en amont (cf. `lib/markdown.ts` qui escape HTML avant de
  parser) ? Tout nouveau point d'injection HTML introduit depuis le dernier
  audit ?
- **Dépendances** : `npm audit --omit=dev` (Bash) si `node_modules` présent,
  sinon lire les versions dans `package.json` et signaler les majeures très en
  retard (Next.js notamment, cf. historique CVE Next).
- **Headers de sécurité** : présents dans `next.config.*`/`vercel.json`
  (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS) ?
- **CORS** : une route API renvoie-t-elle des headers CORS permissifs
  (`Access-Control-Allow-Origin: *`) sur un endpoint qui ne devrait pas être
  public cross-origin ?
- **Logs de données sensibles** : Sentry/console — des emails, tokens, mots de
  passe ou contenu de CV bruts partent-ils dans les logs ?

## 3. Recon passif du site en prod (best-effort, ne bloque pas l'audit si impossible)

Si `WebFetch` est disponible et que le site est joignable publiquement
(`https://naywastudio.com` et pages marketing seulement — **jamais** de
tentative de login, de bruteforce, ou d'appel répété/agressif sur une route) :
- Headers de réponse sur `/` (sécurité, cache, cookies `Secure`/`HttpOnly`/`SameSite`)
- Fichiers qu'on ne devrait jamais pouvoir lire : `/.env`, `/.git/config`,
  `/next.config.js`, sourcemaps `.js.map` exposées
- `robots.txt` / `sitemap.xml` : rien de sensible listé
- Pages `/admin`, `/organisation` sans session : redirigent bien vers `/login`
  et ne fuient aucune donnée avant redirection

Reste strictement passif — 1 requête par point vérifié, jamais de scan
automatisé ni de tentative d'exploitation active. Si le doute existe sur une
route authentifiée, note-le comme "à vérifier manuellement" plutôt que de
tenter de la déclencher sans session.

## 4. Notation de sévérité

- **Critique** — exploitable sans compte, ou par n'importe quel compte
  authentifié contre les données d'une autre org ; fuite de données
  clients/paiement ; escalade de privilèges (devenir admin) ; contournement
  total d'un garde-fou métier (paywall, quota, anti-fraude branding).
- **À surveiller** — nécessite une condition préalable (compte déjà compromis,
  combinaison avec une autre faille, accès admin déjà obtenu) ; dette de
  sécurité réelle mais atténuée par une autre couche (ex: filet applicatif
  présent mais pas de contrainte DB) ; mauvaise pratique avec impact non nul.
- **Passable** — bonne pratique manquante, durcissement "nice to have", aucun
  chemin d'exploitation réaliste identifié dans ce produit.

## 5. Écrire `.claude/security-reports/rapport.md`

```markdown
# Rapport de sécurité — Naywa Studio

> Généré le {date}, sur `{branche}` @ `{commit court}`. Audit de code (+ recon
> passif prod si disponible). Ne remplace pas un pentest externe.

## Résumé
{N} failles trouvées : {x} Critique, {y} À surveiller, {z} Passable.
{1-3 phrases de synthèse : la tendance générale, ce qui est déjà solide}

## 🔴 Critique
### C1 — {titre court}
- **Où** : `chemin/fichier.ts:ligne` (route/fonction)
- **Constat** : {ce qui a été trouvé, factuel}
- **Scénario d'exploitation** : {qui peut faire quoi, avec quel accès}
- **Impact** : {données/argent/comptes exposés}

{...}

## 🟠 À surveiller
{même structure}

## 🟡 Passable
{même structure}

## Ce qui est déjà solide
{2-4 points vérifiés et bons — utile pour ne pas tout re-suspecter au prochain audit}
```

## 6. Écrire `.claude/security-reports/lots.md`

Regroupe les failles du rapport en lots cohérents (par thème technique :
"routes non protégées", "RLS/DB", "secrets & dépendances", "headers &
transport", etc. — pas un lot par faille isolée, sauf si une faille Critique
est isolée et mérite d'être traitée seule en premier). Trie les lots par
sévérité max contenue (les lots avec du Critique en premier).

```markdown
# Plan de correction — Naywa Studio

> Compagnon de `rapport.md`. Chaque lot est pensé pour être donné TEL QUEL à
> une IA (ou un dev) qui n'a pas le contexte de l'audit — la "Consigne" est
> autosuffisante.

## Lot 1 — {titre, ex: "Verrouiller les routes admin non gardées"}
**Sévérité du lot** : Critique
**Failles couvertes** : C1, C3

### C1 — {titre}
**Brief** : {1-2 phrases, la faille en une respiration}
**Explication** : {pourquoi c'est un problème techniquement, mécanisme exact}
**Consigne de correction** (à copier-coller à une IA) :
> {prompt autonome : fichier(s) concerné(s), ce qu'il faut changer précisément,
> le pattern correct à suivre — en citant un exemple déjà correct dans le repo
> si un pattern conforme existe ailleurs (ex: "suit le pattern de
> `requireAdmin()` déjà utilisé dans /api/admin/kpis")}

{... répète par faille du lot}

## Lot 2 — {...}
{...}
```

## 7. Fin

Affiche à l'utilisateur, dans le chat (pas seulement dans les fichiers) :
- La branche sur laquelle tourne le chantier (celle créée en étape 0)
- Le compte par sévérité
- Le chemin des 2 fichiers générés (`.claude/security-reports/rapport.md` et
  `lots.md`)
- Rappelle que ces fichiers sont **gitignorés** (`.claude/security-reports/`) :
  ils ne partiront jamais dans un commit ni un push, même sur cette branche.
- Les 1-2 failles Critique les plus urgentes, en une phrase chacune, pour que
  la personne sache quoi lire en premier même sans ouvrir les fichiers.

Ne propose PAS d'appliquer les correctifs toi-même dans ce skill — c'est un
audit, pas une correction. Si l'utilisateur veut qu'un lot soit résolu tout de
suite, il te le demandera séparément (ou lancera `/code-review` / une session
dédiée sur le lot).

## 8. Cycle complet du chantier (au-delà de ce skill)

Ce skill ne couvre que l'audit (étapes 0-7). La suite du chantier, quand
l'utilisateur la demande, se passe sur la MÊME branche créée en étape 0 :
1. Les lots de `lots.md` sont corrigés un par un (ou en bloc), commit par
   commit, comme n'importe quel travail de code sur cette branche.
2. **Seulement une fois tous les fixes validés** (build/tests verts, revue
   faite) : supprimer les deux rapports (`rapport.md` et `lots.md` dans
   `.claude/security-reports/`) — ils ont fait leur travail, et même s'ils sont
   gitignorés donc jamais partis dans un commit, on ne les laisse pas traîner
   sur le disque une fois le sujet clos.
3. Pousser la branche : elle ne contient alors QUE les commits de correction
   (les rapports n'y ont jamais été, gitignore oblige) → PR normale via
   `gh pr create`, suivant le workflow standard du repo (section 19 de
   `CLAUDE.md`) : preview validée avant merge, jamais de `--force` sur main.
