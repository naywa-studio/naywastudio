# Chantier — Pricing « honoraires » (placement) vs « TJM » (régie)

> **But** : permettre aux cabinets de **placement** (recrutement au succès) de
> chiffrer une mission en **honoraires** (% du package annuel ou forfait), en
> plus du modèle **régie/TJM** existant (ESN, moteur Syntec). Un `pricing_mode`
> par mission, avec défaut au niveau organisation, choisi à l'onboarding pricing.
>
> Ce document est le **contexte complet** pour développer la feature sur une
> session dédiée. Il décrit l'existant, le modèle métier honoraires, le schéma
> à ajouter, l'intégration onboarding, l'UI, le gating, les fichiers concernés
> et le découpage en lots. **Ne rien casser du moteur Syntec existant.**

---

## 1. Pourquoi

Aujourd'hui le pricing Naywa raisonne **uniquement en TJM/régie** (modèle ESN,
convention Syntec, marge sur un taux journalier). Or les **cabinets de
placement** (recrutement au succès / chasse) ne pensent pas en TJM : ils
facturent des **honoraires**, généralement un **pourcentage du package annuel
brut** du candidat placé (souvent **15–25 %**, parfois plus pour des profils
rares/cadres dirigeants), ou un **forfait fixe**. La base de calcul est le
**salaire annuel** (budget client / rémunération du poste), pas un taux
journalier.

C'est un **wedge produit** : la plupart des concurrents (Boond, etc.) sont
orientés ESN. Un moteur honoraires simple + propre = argument de vente pour le
segment cabinet.

Retour prospect : le calcul honoraires est **beaucoup plus simple** que Syntec.
On a déjà un champ « salaire cible du poste » universel sur les missions.

---

## 2. L'existant (à connaître avant de coder)

### Moteur régie/TJM — NE PAS TOUCHER
- **`src/lib/pricing/syntec.ts`** (testé `__tests__/syntec.test.ts`) : moteur
  Syntec/URSSAF. Types clés : `PricingInputs`, `EmployerCostBreakdown`,
  `computeEmployerCost()`, `computeMissionMargin()`, `computeRuptureRiskProfile()`,
  `Statut`/`Modalite`/`Lieu`/`TypeContrat`/`Avantages`.
- `src/lib/pricing/calendar.ts` (jours ouvrés/fériés FR), `preset.ts`,
  `avantages-meta.ts`, `quick-margin.ts`.

### Config pricing au niveau ORGANISATION (colonnes `organizations`)
- `pricing_margin_min_pct`, `pricing_margin_target_pct` (number | null)
- `pricing_default_avantages` (jsonb `PricingDefaultAvantages`)
- `pricing_rtt_days_per_year` (number)
- Édité via **`src/components/organisation/PricingPolicyForm.tsx`** (inline dans
  `/organisation?tab=pricing`) + wizard de 1er réglage
  **`src/components/organisation/PricingOnboardingWizard.tsx`** (modale
  `PricingOnboardingGate`, se retire une fois `organizations.pricing_onboarded_at`
  posé).
- Route d'écriture : `PATCH /api/cabinet` (allowlist stricte — **ajouter les
  nouveaux champs à la liste blanche**).

### Config pricing au niveau MISSION (colonnes `jobs`)
- `client_tjm_min`, `client_tjm_max`, `margin_min_pct`, `margin_target_pct`,
  `duration_months`, **`target_gross_salary`** (salaire cible du poste — brut
  **mensuel**, universel), `start_date`, `pricing_lieu`, `has_grand_deplacement`,
  `is_expatriated`, `essai_renouvele`.
- Édité dans le form mission (`JobForm`, `src/app/workspace/missions/page.tsx`)
  — le bloc pricing (Zone + TJM) ne s'affiche que si `hasPricingAccess(org,
  {isAdmin})`. **Le salaire cible est universel** (toujours visible).

### Per-candidat (colonnes `match_assessments`)
- `pricing_tjm`, `pricing_brut`, `pricing_avantages_override` (override par match).
- `salary_expectation_brut` (prétention salariale du candidat, universelle) —
  **base idéale pour le calcul honoraires** quand elle est renseignée.
- Édité sur la **fiche match** `/workspace/match/[matchId]` + route
  `PATCH /api/match/[id]`.

### Pages pricing
- `/workspace/pricing` (liste des missions à chiffrer), `/workspace/pricing/[jobId]`
  (cockpit chiffrage), `/workspace/pricing/reference` (doc Syntec).
- `src/components/workspace/PricingWidget.tsx` (sliders TJM/brut/marge).
- Export PDF : `GET /api/match/[id]/pricing-pdf?anonymize={0,1}`, rendu
  `src/lib/pricing-pdf.tsx`.

### Entitlement (add-on Suite Pricing)
- **`hasPricingAccess(org, {isAdmin})`** dans `src/lib/subscription.ts`
  (= admin OU add-on Pricing souscrit OU essai).
- **`requirePricingAccess()`** dans `src/lib/access-guard.ts` — garde les routes
  `pricing/compare`, `match/[id]/pricing-params`, `match/[id]/pricing-pdf`.
- **⚠️ Le mode honoraires reste GATÉ par la Suite Pricing** (même add-on). Ce
  n'est pas gratuit : c'est juste un 2ᵉ mode DANS la Suite Pricing.

---

## 3. Modèle métier « honoraires »

### Calcul (déterministe, simple)
```
package_annuel_brut = salaire_mensuel_brut × nb_mois        (défaut 12)
honoraires = max(taux_pct × package_annuel_brut, honoraires_min_eur)
             OU  forfait_fixe_eur   (si mode forfait)
```
- **Base salaire** : priorité à `match_assessments.salary_expectation_brut`
  (prétention du candidat présenté) → sinon `jobs.target_gross_salary` (cible du
  poste). Toujours du **brut mensuel** → ×`nb_mois`.
- **`nb_mois`** : 12 par défaut, paramétrable org (certains comptent 13 mois /
  incluent le variable). V1 = 12, champ optionnel.
- **Taux** : `taux_pct` (ex 18 %). Barème simple. Option **forfait fixe** (ex
  8 000 €) pour les missions à forfait.
- **Plancher** : `honoraires_min_eur` (ex 6 000 €) — les cabinets ont souvent un
  minimum de facturation.

### Paramètres complémentaires (V1 optionnels, à afficher mais non bloquants)
- **Garantie** (`garantie_mois`, ex 3) : période pendant laquelle, si le candidat
  part, le cabinet rembourse (souvent dégressif). V1 = simple champ informatif
  affiché sur le devis ; le calcul de remboursement dégressif = V2.
- **Modalités de paiement** : à la signature / échelonné (ex 30/30/40). V1 =
  texte libre ou preset simple ; V2 = échéancier calculé.
- **Exclusivité / acompte** : hors V1.

### Ce que ça REMPLACE à l'affichage (mode honoraires)
En mode honoraires, on **masque** tout ce qui est TJM/Syntec (marge journalière,
charges employeur, risque rupture, avantages Syntec) et on montre : base salaire
annuel, taux/forfait, honoraires HT, garantie, (échéancier V2). Le cockpit
pricing devient beaucoup plus léger.

---

## 4. Schéma à ajouter (migrations additives/nullable)

> Numéroter à la suite (dernière migration en date à vérifier dans
> `supabase/migrations/`). Appliquer via MCP Supabase (`apply_migration`).

### `organizations` (défauts org)
- `pricing_mode text default 'regie_tjm'` CHECK in (`'regie_tjm'`,`'placement_honoraires'`)
  — **mode par défaut du cabinet**.
- `honoraires_pct numeric` (ex 18.0), nullable.
- `honoraires_fixed_eur numeric` nullable (si le cabinet fait du forfait par défaut).
- `honoraires_min_eur numeric` nullable (plancher).
- `honoraires_base_months int default 12` (nb de mois pour le package annuel).
- `honoraires_garantie_mois int` nullable.

### `jobs` (override par mission)
- `pricing_mode text` nullable (NULL = hérite du défaut org).
- `honoraires_pct numeric` nullable (override).
- `honoraires_fixed_eur numeric` nullable (mission au forfait).
- `honoraires_base_annual numeric` nullable (si on veut figer le package annuel
  à la main plutôt que salaire_mensuel×mois).

### Types
- Étendre `src/lib/database.types.ts` (Row + Insert de `organizations` et `jobs`).
- Nouveau module **`src/lib/pricing/honoraires.ts`** (pur, testable) :
  ```ts
  export type HonorairesInputs = {
    annualGrossSalary: number        // package annuel brut (base)
    pct?: number | null              // taux % (mode pourcentage)
    fixedEur?: number | null         // forfait (mode forfait)
    minEur?: number | null           // plancher
  }
  export function computeHonoraires(i: HonorairesInputs): {
    mode: 'pct' | 'fixed'
    base: number
    raw: number                      // pct×base ou fixed
    total: number                    // max(raw, minEur)
    flooredByMin: boolean
  }
  // + helper resolvePricingMode(job, org) → 'regie_tjm' | 'placement_honoraires'
  // + helper resolveAnnualBase(match, job, org) → salaire annuel base
  ```

---

## 5. Intégration ONBOARDING

- **`PricingOnboardingWizard.tsx`** : ajouter en **étape 1** une question claire
  « Comment facturez-vous vos missions ? » →
  - **Régie / TJM** (ESN, sous-traitance) → suite = réglages Syntec actuels.
  - **Placement / honoraires** (recrutement au succès) → suite = taux par défaut
    (%), plancher, garantie ; **on saute tout le paramétrage Syntec** (marges
    journalières, RTT, avantages).
- Poser `organizations.pricing_mode` + les défauts honoraires selon le choix.
- **`PricingPolicyForm.tsx`** (`/organisation?tab=pricing`) : afficher les champs
  du mode actif ; un sélecteur permet de basculer de mode (rare, mais possible).
  En mode honoraires, masquer marges/RTT/avantages Syntec.
- Le bloc pricing du **form mission** (`JobForm`) : en mode honoraires, remplacer
  Zone+TJM par « taux (hérité : X %) » + éventuel forfait, et garder le salaire
  cible (déjà universel).

---

## 6. UI à faire

1. **Cockpit `/workspace/pricing/[jobId]`** : brancher `resolvePricingMode` →
   rendre soit le cockpit Syntec actuel, soit un **cockpit honoraires** léger
   (base annuelle éditable, taux/forfait, honoraires HT en héros, garantie).
2. **Fiche match** `/workspace/match/[matchId]` : en mode honoraires, le bloc
   pricing montre les honoraires calculés (base = prétention candidat si
   présente, sinon cible mission) au lieu du TJM/marge.
3. **Export PDF devis honoraires** : variante de `pricing-pdf.tsx` (ou nouveau
   template) — « Proposition d'honoraires » : poste, base annuelle, taux ou
   forfait, honoraires HT, garantie, modalités. Réutiliser le branding cabinet.
4. **Liste `/workspace/pricing`** : afficher le bon libellé (honoraires vs TJM)
   par mission.

---

## 7. Sécurité / gating (garde-fous)

- **`requirePricingAccess()`** sur toute nouvelle route honoraires (compute côté
  client possible car pur, mais toute route qui persiste/exporte = gatée).
- `PATCH /api/cabinet` : **ajouter les nouveaux champs org à l'allowlist** (pas
  de spread). Écriture déléguée owner/`canPricing` (cf. capabilities).
- `PATCH /api/jobs/[id]` : ajouter les champs mission honoraires à l'allowlist.
- **`resolvePricingMode`** côté serveur ET client (source unique) pour ne jamais
  diverger.
- **Nora ne fixe rien** : si un jour Nora suggère un taux (marché/rareté), ça
  reste une **suggestion** que le sourceur valide (garde-fou produit habituel).
  V1 = 100 % déterministe, pas de LLM.

---

## 8. Fichiers concernés (carte)

| Zone | Fichier(s) |
|---|---|
| Moteur (nouveau) | `src/lib/pricing/honoraires.ts` (+ test `__tests__/honoraires.test.ts`) |
| Résolution mode | `src/lib/pricing/honoraires.ts` (`resolvePricingMode`) |
| Types DB | `src/lib/database.types.ts` (organizations + jobs Row/Insert) |
| Entitlement | `src/lib/subscription.ts` (déjà `hasPricingAccess`), `src/lib/access-guard.ts` |
| Onboarding | `src/components/organisation/PricingOnboardingWizard.tsx` |
| Config org | `src/components/organisation/PricingPolicyForm.tsx` + `PATCH /api/cabinet` |
| Form mission | `JobForm` dans `src/app/workspace/missions/page.tsx` + `PATCH /api/jobs/[id]` |
| Cockpit | `src/app/workspace/pricing/[jobId]/…` + `PricingWidget.tsx` (ou nouveau `HonorairesWidget`) |
| Fiche match | `src/app/workspace/match/[matchId]/page.tsx` |
| PDF devis | `src/lib/pricing-pdf.tsx` (variante) + `GET /api/match/[id]/pricing-pdf` |
| Migrations | `supabase/migrations/NNN_pricing_mode_honoraires.sql` |

---

## 9. Edge cases / décisions à trancher

- **Base salaire manquante** : ni prétention candidat ni cible mission → afficher
  « à compléter » (pas de calcul fantaisiste).
- **Mode par mission ≠ mode org** : la mission override toujours l'org.
- **Bascule de mode sur une mission déjà chiffrée** : ne pas perdre les valeurs
  de l'autre mode (colonnes distinctes, pas d'écrasement).
- **13ᵉ mois / variable** : `honoraires_base_months` couvre le 13ᵉ ; le variable
  = V2 (champ `honoraires_base_annual` permet de figer à la main en attendant).
- **TVA** : honoraires affichés **HT** (comme le reste). Mention « HT ».
- **Arrondis** : arrondir à l'euro.

---

## 10. Découpage en lots

1. **Moteur + schéma** : migration (org + jobs), types DB, `honoraires.ts` pur
   + test, `resolvePricingMode`/`resolveAnnualBase`. Aucun rendu. Vérifiable en
   test unitaire.
2. **Onboarding + config org** : question mode dans le wizard, champs honoraires
   dans `PricingPolicyForm`, allowlist `PATCH /api/cabinet`. Masquer Syntec en
   mode honoraires.
3. **Form mission + fiche match** : override mode/taux par mission (allowlist
   `PATCH /api/jobs/[id]`), affichage honoraires calculés sur la fiche match.
4. **Cockpit pricing honoraires** + **PDF devis honoraires**.
5. (V2) Garantie dégressive, échéancier de paiement, suggestion Nora de taux.

---

## 11. À ne PAS faire / pièges

- **Ne pas modifier `syntec.ts`** ni ses tests — le mode régie reste identique.
- **Ne pas dégater** la Suite Pricing : honoraires = 2ᵉ mode DANS l'add-on, pas
  une feature gratuite.
- **Ne pas** introduire de `role === "owner"` épars pour le gating → passer par
  `getCapabilities` / `hasPricingAccess`.
- **Pas de spread `...body`** dans les PATCH — allowlist stricte.
- Tester via **Vercel preview** (pas de preview local sur ce projet).
- Workflow git : branche `claude/<nom>` → push → **valider preview → merge**
  (jamais de merge direct sans validation).
