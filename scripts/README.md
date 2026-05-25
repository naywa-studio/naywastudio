# Scripts

## `test-pricing.ts` — smoke tests des calculs pricing

Vérifie que les fonctions critiques de `src/lib/pricing/syntec.ts` et
`src/lib/pricing/calendar.ts` n'ont pas régressé après une modification.

**Exécution** :
```bash
npx tsx scripts/test-pricing.ts
```

(npx installe `tsx` à la volée la 1ère fois — pas d'install permanente
dans `package.json`.)

**À lancer obligatoirement** avant de pousser une modification dans :
- `src/lib/pricing/syntec.ts`
- `src/lib/pricing/calendar.ts`
- `src/lib/pricing/syntec-bareme-2026.json`

Le script doit retourner **`Tous les invariants pricing sont OK.`** Si un
test FAIL, c'est une régression — investigate avant de pousser.

**Cas couverts** (39 assertions) :
- `computeEmployerCost` — Cadre Paris brut 45k (charges, prime, fixe, variable)
- `computeEmployerCost` — ETAM Province sans avantages
- `computeEmployerCost` — avec 13ᵉ mois (assiette élargie)
- `workingDaysInRange` — Nov 2024, Août 2025, Octobre 2025 (vrais jours)
- `missionMonthProfile` — 12 mois depuis 01/11/2024 (calendrier réel)
- `computeMissionMargin` — Cadre 45k TJM 650 sur 12 mois (revenu, coût, marge totale & %)
- `computeRuptureRiskProfile` — cadre 7m essai puis cliff (préavis, indemnité Art 4.5, CP)
- `validateAgainstMinimum` — seuil minimum Syntec
