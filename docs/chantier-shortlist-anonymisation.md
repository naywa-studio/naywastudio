# Chantier — Shortlist par mission + Anonymisation

> Spec de démarrage pour la session de dev (Claude Code sur PC fix).
> Branche : `claude/mission-shortlist-anonymisation` (partie de `main` mergé et en prod).
> Rédigé le 2026-07-24 à la fin de la session « accueil workspace + CGU ».

---

## 0. Le problème (mots d'Elyas)

- On parle beaucoup de **shortlist** mais dans une mission, les candidats **mis en
  pipeline** (la vraie shortlist, où on va **écarter ou accepter**) sont **mélangés
  avec les autres** (résultats de matching bruts).
- Il faut une **vraie page Shortlist dans la mission** — pas un filtre, une page où
  l'on gère les candidats `in_pipeline`.
- L'**anonymisation** doit **sortir des fiches match** pour être pilotée dans
  l'affichage shortlist de la mission : personnaliser l'affichage, **sauvegarder ces
  paramètres**, et **télécharger plusieurs CV anonymisés à la fois**.
- **Résumé Nora désactivé par défaut** : il n'apparaît qu'en cochant la case.

---

## 1. État actuel (où vivent les choses)

### Missions
- `src/app/workspace/missions/page.tsx` — liste des missions.
- `src/app/workspace/missions/[jobId]/page.tsx` — **la page mission** (c'est ici
  qu'on ajoute la Shortlist, en onglet ou section dédiée).
- `src/app/workspace/missions/new/page.tsx` — création.

### Pipeline / matchs
- Table `match_assessments` (cf. `src/lib/database.types.ts`) :
  - `in_pipeline: boolean` — **true = dans la shortlist** de la mission.
  - `pipeline_stage: 'identified' | 'pricing' | 'contacted' | 'replied' | 'interview' | 'offer' | 'hired' | 'rejected'`.
  - `match_tier`, `score`, `source`, `candidate_id`, `job_id`, `reject_reason`, etc.
- La fiche match : `src/app/workspace/match/[matchId]/page.tsx` (`MatchPage`) — c'est
  **de là qu'il faut SORTIR l'anonymisation**.

### Anonymisation (existe déjà — à déplacer, pas à recréer)
- UI : `src/components/workspace/anonymize/AnonymizeControls.tsx` (haut de fiche match)
  + `AnonymizePreview.tsx` (bas). État **lifté dans `MatchPage`**.
- `src/components/workspace/anonymize/types.ts` — **`AnonymizeOptions`** :
  ```ts
  interface AnonymizeOptions {
    template: 'classic' | 'two-column' | 'executive' | 'bento'
    keepNoraSummary: boolean   // DÉFAUT true → à passer à FALSE (demande Elyas)
    customText: string         // max 600 (CUSTOM_TEXT_MAX)
    watermark: boolean         // défaut false
  }
  ```
  `INITIAL_ANONYMIZE_OPTIONS` a `keepNoraSummary: true` → **le mettre à `false`**.
- `src/components/workspace/AnonymizeForJob.tsx` — action « anonymiser pour ce poste »
  (self-contained, GET/POST `/api/cv/[id]/anonymize`), déjà orientée job. **Bon point
  de départ** pour la shortlist (déjà job-aware, embarquable via `embedded`).
- API : `src/app/api/cv/[id]/anonymize/route.ts` (POST = génère, GET = récupère l'URL
  existante). Retourne `preview_url` + `download_url`.
- Rendus : `src/lib/anonymized-cv.tsx` (PDF @react-pdf) + `src/lib/anonymized-cv-docx.ts`.
- Branding utilisé : `organizations.brand_color`, `brand_color_secondary`,
  `brand_logo_path`, `brand_slogan`, `contact_email`.

---

## 2. Découpage en sous-lots (ordre conseillé)

### Lot A — Page/onglet Shortlist dans la mission
- Dans `missions/[jobId]`, ajouter une vue **Shortlist** listant UNIQUEMENT les
  `match_assessments` avec `in_pipeline = true` pour ce `job_id`, **séparée** des
  résultats de matching.
- Actions par candidat : **avancer** (changer `pipeline_stage`) / **écarter**
  (`pipeline_stage = 'rejected'` + `reject_reason`). Réutiliser la logique pipeline
  existante (voir `src/app/workspace/pipeline`).
- Regrouper / trier par `pipeline_stage` (les `identified` en tête = « à qualifier »,
  cohérent avec le KPI de l'accueil qu'on vient d'ajouter).
- **Droits** : lecture seule si `isReadOnly` (pas de siège) — masquer les actions
  mutantes ; le serveur `requireActiveAccess` garde déjà les mutations.

### Lot B — Anonymisation déplacée + persistée
- **Sortir** `AnonymizeControls`/`AnonymizePreview` de `MatchPage` → les piloter
  depuis la Shortlist (ou une modale/panneau shortlist).
- **`keepNoraSummary` défaut `false`** (résumé Nora masqué tant qu'on ne coche pas).
- **Sauvegarder les paramètres** (`AnonymizeOptions`) : aujourd'hui ils sont
  transitoires par-match. Décider la portée (cf. §3) et **persister** (migration).

### Lot C — Téléchargement multiple (batch)
- Depuis la Shortlist : sélectionner N candidats → **télécharger tous les CV
  anonymisés d'un coup** (zip, ou génération séquentielle côté serveur).
- S'appuyer sur la route `anonymize` existante ; prévoir un endpoint batch ou une
  boucle contrôlée (attention quotas LLM / temps de génération PDF).

---

## 3. Décisions à trancher (avec reco)

1. **Portée de la sauvegarde des `AnonymizeOptions`** :
   - **Par mission** (`jobs`) → chaque mission a son gabarit d'affichage. *(reco : le
     plus parlant pour Elyas — « l'affichage shortlist de la mission »)*.
   - Par organisation (`organizations`) → défaut cabinet, override par mission.
   - **Reco** : colonne `jobs.anonymize_options jsonb` (défaut = `INITIAL_...` avec
     `keepNoraSummary:false`), + éventuel défaut org plus tard.
2. **Emplacement de la Shortlist** : onglet dans `missions/[jobId]` (reco) vs page
   dédiée `/missions/[jobId]/shortlist`.
3. **Batch download** : zip client (JSZip) vs endpoint serveur qui renvoie un zip.
   Vérifier l'impact quotas (génération = coût LLM/PDF).

---

## 4. Contraintes (À RESPECTER — cf. CLAUDE.md §20)

- **Charte graphique** : surfaces **plates tokenisées** (`--nw-*`, `--nw-primary-50`,
  `rgba(124,99,200,0.06)`, bordures `--nw-border(-soft)`), composants `Card`/`Panel`
  existants. **Pas de dégradé décoratif** sur les surfaces ; le **dégradé primaire**
  (`linear-gradient(120deg, var(--nw-primary), var(--nw-primary-dark))`) est réservé
  aux **boutons d'action**.
- **Pas d'outils de build en local** (ni npm, ni tsc, ni node_modules) : le **build
  Vercel est le SEUL typecheck** (`tsc` + `eslint --max-warnings=0`). Valider CHAQUE
  push via le statut du déploiement Vercel (MCP Vercel). TypeScript strict, zéro `any`.
- **Droits / caps** : `getCapabilities` (source unique). Lecture seule = pas de siège ;
  délégué = selon caps. Mutations gardées serveur (`requireActiveAccess`).
- **Migrations** : via Supabase MCP (projet `gtxjrepqiqbqbyhtmtlk`), fichier
  `supabase/migrations/067_...sql`. Base **partagée prod/preview** → migrations
  **additives** (colonnes nullable, `add column if not exists`).
- **Sécurité** : ne JAMAIS faire de checkout Stripe de test sur GMH (client réel).
  Pas de credentials en clair.

---

## 5. Validation (definition of done par lot)

- [ ] Build Vercel **vert** (tsc + eslint) à chaque push — c'est le typecheck.
- [ ] Shortlist affiche bien uniquement `in_pipeline = true`, séparée du matching.
- [ ] Écarter / avancer un candidat met à jour `pipeline_stage` (+ `reject_reason`).
- [ ] Anonymisation retirée de la fiche match, disponible depuis la Shortlist.
- [ ] `keepNoraSummary` **décoché par défaut** ; le résumé Nora n'apparaît qu'en cochant.
- [ ] Paramètres d'affichage **persistés** (rechargement conserve le gabarit).
- [ ] Téléchargement **multiple** fonctionnel.
- [ ] Lecture seule (sans siège) : aucune action mutante exposée.
- [ ] Charte respectée (surfaces plates, pas de dégradé décoratif).
- [ ] Validation visuelle Elyas en preview, puis merge `main` (fast-forward) + vérif
      déploiement prod vert.

---

## 6. Rappels de contexte (déjà en prod)

- Accueil workspace : KPI **« Matchs à qualifier »** = `match_tier ∈ {excellent,good}`
  **et** `in_pipeline = true` **et** `pipeline_stage = 'identified'`. La Shortlist est
  la destination logique de ce chiffre (« à qualifier » = premier stade de la shortlist).
- CGU : `lib/cgu.ts` (`CURRENT_CGU_VERSION`), `CguGate`, `POST /api/cgu/accept`.
- Détails complets du contexte projet : voir **CLAUDE.md § 20**.
