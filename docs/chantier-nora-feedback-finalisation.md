# Chantier — Finalisation boucle feedback Nora : retours POSITIFS + critères NÉGATIFS

> **But** : compléter la boucle de feedback client (lot 3c, déjà en prod) avec
> les deux évolutions identifiées :
> 1. **Retours positifs** — Nora apprend aussi de ce que le client a **aimé**
>    (candidats retenus / en entretien) pour **renforcer** les bons critères, pas
>    seulement des refus.
> 2. **Critères négatifs** — pouvoir dire « à ne surtout pas avoir » (proscrire),
>    au lieu de seulement durcir un critère positif.
>
> Ce document est le **contexte complet + la spec sans ambiguïté** pour développer
> ça sur une session dédiée. Le lot 3c est **déjà mergé sur `main`** — tout ce qui
> est décrit ici s'appuie dessus.

---

## 0. Rappel de l'existant (lot 3c, EN PROD sur `main`)

La boucle actuelle ne se nourrit **que des candidats ÉCARTÉS** :

- **Saisie du retour** : sur une carte de la **Shortlist**
  (`src/components/workspace/MissionPipeline.tsx`), un candidat passé en **Écarté**
  affiche des **motifs** (`match_assessments.client_reject_reasons text[]`, cf.
  `src/lib/client-reject-reasons.ts`) + un **commentaire libre**
  (`client_feedback_note`, horodaté `client_feedback_at`).
- **Proposition Nora** : `POST /api/jobs/[id]/adjust` (source `feedback`) agrège
  les retours des écartés **plus récents que le filigrane**
  (`jobs.feedback_consumed_until`), + l'historique
  (`jobs.criteria_adjustments`), et propose une **révision des critères**
  (`jobs.criteria`, format `Criterion` de `src/lib/job-criteria-catalog.ts`).
  Elle part toujours des critères actuels → renforce/assouplit, ne duplique pas.
- **Diff & application** : `src/components/workspace/NoraAdjustPanel.tsx` (diff
  rouge/vert via `src/lib/criteria-diff.ts`), apply = `PATCH /api/jobs/[id]/criteria`
  (pose l'historique + efface `jobs.pending_adjustment`) → relance le matching.
- **Ajustement libre** : `MissionGeneralAdjust.tsx` (onglet Candidats) + champ
  « Affiner avec Nora » dans le panneau (source `general`).
- **Matching** : `src/lib/matching.ts` `scoreBatchCriteria(job, criteria, batch,
  lang)` — score chaque candidat sur les critères. Route
  `POST /api/jobs/[id]/match`.
- **Migrations** : 070→076 (feedback, anonymized_at, reject_reasons,
  criteria_adjustments, feedback_consumed_until, pending_adjustment).

**Les deux manques** : (A) aucun signal sur ce qui a **plu** ; (B) aucun critère
« à proscrire ».

---

## PARTIE A — Retours POSITIFS (renforcement)  ·  *petit*

### Idée
Quand un candidat **avance** (Contacté → Entretien → Présenté → **Recruté**) ou
que le sourceur note « ce qui a plu », c'est un signal **positif**. Nora doit :
- **renforcer / conserver** les critères que ces candidats satisfont,
- **ne pas les assouplir** (même si des écartés poussent dans l'autre sens).

### Capture (UI Shortlist)
Sur les cartes de candidats **retenus** (stades `interview` / `offer` / `hired`),
ajouter, symétriquement aux motifs d'écart :
- un champ **« Ce qui a plu au client »** (commentaire libre), et/ou
- des **puces positives** (réutiliser le style des reject-reasons) : ex
  « Compétences », « Séniorité », « Expérience secteur », « Posture »…
  → nouveau `src/lib/client-liked-reasons.ts` (miroir de `client-reject-reasons.ts`).

### Schéma (migration additive/nullable)
Sur `match_assessments` :
- `client_liked_reasons text[]` (nullable)
- `client_positive_note text` (nullable)
- `client_positive_at timestamptz` (nullable) — horodatage (même logique que
  `client_feedback_at`, pour un éventuel filigrane positif ; V1 peut s'en passer).

Route : étendre l'allowlist de `PATCH /api/match/[id]/route.ts`
(`client_liked_reasons` sanitizé, `client_positive_note` borné + horodatage).

### Utilisation par Nora (prompt)
Dans `POST /api/jobs/[id]/adjust` (`src/app/api/jobs/[id]/adjust/route.ts`),
ajouter au payload envoyé au LLM une section **RETOURS POSITIFS** :
- les candidats **retenus** (stade ≥ interview) : leur `criteria_eval`
  (quels critères ils satisfont bien) + `client_liked_reasons` + `client_positive_note`.
- Règle de prompt à ajouter : *« Des candidats ont PLU au client (retours
  positifs). RENFORCE ou CONSERVE les critères qu'ils satisfont ; n'assouplis
  JAMAIS un critère qu'un candidat retenu remplit bien, même si un écarté suggère
  l'inverse. »*
- **Pas de filigrane nécessaire en V1** : les retenus sont un signal de contexte
  stable (pas des « items à consommer »). On les passe à chaque génération.

### Où le déclencher
- Le retour positif **enrichit** la proposition feedback existante (même bouton
  « Voir la proposition de Nora » en Shortlist) : Nora tient compte des deux.
- Optionnel : afficher un petit récap « X retenus · Y écartés » au-dessus de la
  proposition pour montrer que Nora équilibre.

### Découpage Partie A
1. Migration + types + `client-liked-reasons.ts` + allowlist `PATCH /api/match/[id]`.
2. UI capture sur cartes retenues (Shortlist) — symétrique aux motifs d'écart.
3. Prompt `/adjust` : injecter les retours positifs + règle de renforcement.

---

## PARTIE B — Critères NÉGATIFS (« à proscrire »)  ·  *moyen*

> ⚠️ Touche le **moteur de matching**. Deux options : **A (minimale, recommandée
> pour la session vacances)** et **B (complète, plus tard)**. Ne PAS mélanger les
> deux : choisir A, laisser B en évolution.

### Option A — « Exclusions » (minimale, faible risque)  ✅ recommandée
Un champ liste libre de choses **à proscrire**, injecté dans le prompt de
matching. Pas de nouveau type de critère, pas de changement d'affichage des
`criteria_eval`.

- **Schéma** : `jobs.exclusions text[]` (nullable) — ex `["profils juniors",
  "moins de 2 ans d'expérience", "pas de secteur bancaire"]`.
- **Saisie** :
  - manuelle dans le wizard critères (`CriteriaOnboarding`) : une petite section
    « À proscrire » (chips ajoutables).
  - **par Nora** : dans `/adjust`, autoriser Nora à proposer des exclusions
    (nouveau champ `exclusions` dans la réponse JSON, à côté de `criteria`).
    L'apply (`PATCH /api/jobs/[id]/criteria`) persiste aussi `exclusions`.
- **Matching** (`src/lib/matching.ts` `scoreBatchCriteria`) : ajouter au prompt
  une section *« À PROSCRIRE (pénalise fortement un candidat qui correspond à
  l'un de ces points) : … »*. Le LLM baisse le score en conséquence. **Aucune
  autre logique** → sûr, rapide.
- **UI diff / historique** : afficher les exclusions en **rouge « À proscrire »**
  dans le panneau Nora et le wizard. Léger.
- **Migration** : `jobs.exclusions text[]` + allowlist `PATCH /api/jobs/[id]/criteria`
  (et `/api/jobs/[id]` si édité au form).

Avantage : ~1 colonne + prompt + un peu d'UI. Zéro refonte du moteur de critères.

### Option B — Polarité sur les critères (complète, PLUS TARD)
Ajouter `polarity?: "require" | "exclude"` à `Criterion`
(`src/lib/job-criteria-catalog.ts`, défaut `"require"`).
- **Matching** : un critère `exclude` que le candidat **satisfait** = **pénalité**
  (inverser la contribution au score global dans `scoreBatchCriteria`). Le prompt
  doit indiquer la polarité par critère.
- **`criteria_eval`** : sémantique inversée pour un `exclude` (matcher = mauvais).
  Impacte l'affichage des jauges/badges (fiche match, cartes) → non trivial.
- **Diff / display** : `criteria-diff.ts` (`describeChange`) + `criterion-display.ts`
  doivent rendre la polarité (cadre rouge « proscrire »).
- **Wizard** : toggle require/exclude par critère.
- Plus puissant (un « exclude séniorité junior » structuré) mais **touche 5-6
  fichiers du cœur matching + affichage** → réservé à une itération dédiée, pas
  la session vacances.

### Recommandation
**Faire l'Option A** (exclusions text[]) — elle couvre 90 % du besoin (« client
refuse X ») avec un risque minimal. Garder l'Option B documentée pour plus tard
si le besoin d'un vrai critère négatif structuré se confirme.

### Découpage Partie B (Option A)
1. Migration `jobs.exclusions` + type + allowlist `PATCH /api/jobs/[id]/criteria`.
2. Matching : injecter les exclusions dans le prompt `scoreBatchCriteria`.
3. `/adjust` : Nora peut proposer des exclusions (champ `exclusions` dans la
   réponse) ; apply les persiste.
4. UI : section « À proscrire » (rouge) dans le wizard + le panneau Nora + petit
   rappel sur la fiche mission.

---

## Fichiers concernés (carte)

| Zone | Fichier(s) |
|---|---|
| Motifs / reasons | `src/lib/client-reject-reasons.ts` (modèle) → nouveau `client-liked-reasons.ts` |
| Capture Shortlist | `src/components/workspace/MissionPipeline.tsx` (cartes retenues + écartées) |
| Route match PATCH | `src/app/api/match/[id]/route.ts` (allowlist positifs) |
| Proposition Nora | `src/app/api/jobs/[id]/adjust/route.ts` (payload positifs + exclusions) |
| Application | `src/app/api/jobs/[id]/criteria/route.ts` (persiste exclusions) |
| Moteur matching | `src/lib/matching.ts` `scoreBatchCriteria` (prompt exclusions) |
| Diff / affichage | `src/lib/criteria-diff.ts`, `src/lib/criterion-display.ts`, `NoraAdjustPanel.tsx` |
| Wizard critères | `src/components/workspace/CriteriaOnboarding.tsx` (section « À proscrire ») |
| Types DB | `src/lib/database.types.ts` (match_assessments + jobs) |
| Migrations | `supabase/migrations/NNN_*.sql` (à numéroter après 076) |

---

## Garde-fous (comme lot 3c)

- **Nora PROPOSE, ne décide pas** : positifs et exclusions restent des
  suggestions validées par le sourceur (diff + cases à cocher).
- **Allowlist stricte** sur tous les PATCH (pas de spread `...body`).
- **Sanitize** les nouveaux `text[]` (comme `sanitizeClientRejectReasons`).
- **Gating** : `requireActiveAccess` sur les routes (déjà en place).
- **Anti-nag** : si on ajoute un filigrane positif, même logique que
  `feedback_consumed_until` ; sinon, positifs = contexte non consommable (V1).
- **Ne pas casser** le scoring existant : l'Option A n'ajoute qu'une section de
  prompt ; tester qu'un job SANS exclusions score exactement comme avant.
- Tester via **Vercel preview** ; workflow branche → push → validation → merge.

---

## Ordre conseillé pour la session

1. **Partie A** (retours positifs) d'abord — c'est le plus petit et le plus utile
   tout de suite (Nora arrête de sur-assouplir).
2. **Partie B Option A** (exclusions) ensuite si le temps le permet.
3. Laisser **Partie B Option B** (polarité structurée) pour une itération future.
