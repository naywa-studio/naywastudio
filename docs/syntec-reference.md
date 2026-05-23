# Référence Syntec — Pricing Naywa

Document de référence pour le calculateur de pricing ESN (convention collective **Syntec IDCC 1486**, brochure 3018).

> **Avenant salaires en vigueur** : Accord du 27 novembre 2025, étendu par arrêté du 14 février 2026 (publié au JO le 1ᵉʳ mars 2026). Applicable depuis le 1ᵉʳ janvier 2026.
> **Revalorisation 2026** : +2,8% ETAM · +2,5% Cadres.
> **À surveiller** : avenant n°8 du 16 décembre 2025 sur la complémentaire santé, applicable au 1ᵉʳ juillet 2026.

Légende :
- ✅ **Confirmé** — valeur cohérente entre plusieurs sources
- ⚠ **À vérifier** — source unique ou divergences entre sources
- ❌ **Manquant** — pas trouvé dans les sources web publiques, consulter Légifrance directement

---

## 1. Statuts & nomenclature

> **Important** : "Cadre Standard 1" et "Cadre Standard 2" ne sont **pas** des catégories Syntec officielles. La convention distingue uniquement **ETAM** et **IC (Ingénieurs & Cadres)**. Ce que ton Excel appelait "Cadre Standard 1/2" correspond en réalité aux **3 modalités de durée du travail** ci-dessous.

### Les 3 modalités Syntec ✅

| Modalité | Nom officiel | Heures hebdo | Statuts éligibles | Majoration minima |
|---|---|---|---|---|
| **Modalité 1** | Standard | 35 h | Tous (ETAM + Cadres) | — |
| **Modalité 2** | Réalisation de missions | 38h30 (forfait hebdo, max 1 700 h/an) | Cadres + ETAM position 3.x | **+15%** du minimum conventionnel |
| **Modalité 3** | Forfait jours | 218 jours/an max | Cadres autonomes, position 2.3+ | **+20%** du minimum conventionnel |

**Mapping interface Naywa proposé** :
- Label UI "Cadre Standard 1" → Cadre en Modalité 1 ou 2 (à choisir au paramétrage cabinet)
- Label UI "Cadre Standard 2" → Cadre en Modalité 3 (forfait jours)

### Statut social cotisations (impacte coût employeur) ✅

| Statut | Cotisations spécifiques cadre ? |
|---|---|
| ETAM (positions 1.x à 2.x) | Non — pas APEC, pas prévoyance 1,5% T1 |
| ETAM Assimilé Cadre ⚠ | Position non explicitement définie Syntec — généralement ETAM position 3.x. **À clarifier au paramétrage cabinet.** |
| Cadre (IC) | Oui — APEC + prévoyance 1,5% T1 obligatoire |

**Note critique** ❌ : La notion d'**ETAM Assimilé Cadre** n'apparaît pas explicitement dans les sources web consultées comme une catégorie Syntec distincte. C'est probablement une pratique d'ESN qui passe les ETAM 3.x au régime de cotisations cadre. **À valider directement avec un expert paie ou via Légifrance.**

---

## 2. Grilles de minima salariaux 2026

### Grille ETAM ✅ (sources multiples cohérentes)

| Position | Coefficient | Minimum mensuel brut (€) | Profil type |
|---|---|---|---|
| 1.1 | 240 | 1 815 | Entrée, junior technicien |
| 1.2 | 250 | 1 845 | Junior confirmé |
| 2.1 | 275 | 1 875 | Technicien expérimenté |
| 2.2 | 310 | 1 905 | Animateur d'équipe |
| 2.3 | 355 | 2 045 | Confirmé / référent |
| 3.1 | 400 | 2 185 | Confirmé, expert technique |
| 3.2 | 450 | 2 340 | Très qualifié |
| 3.3 | 500 | 2 490 | ETAM senior, frontière cadre |

**Valeur du point ETAM 2026** : 7,68 € (mais barèmes établis avec base fixe + point, formules variables selon position).
**Plancher conventionnel** : 2 145 € (minimum garanti pour les coefficients bas — concerne surtout les ETAM 1.x dont le SMIC s'applique de facto).

> ⚠ Divergences entre sources : LégiSocial (avenant 2017) donne des chiffres obsolètes. Les valeurs ci-dessus viennent de Culture RH (à jour 2026). **Source primaire à confirmer**.

### Grille Cadres (IC) ✅

| Position | Coefficient | Minimum mensuel brut (€) | Profil type |
|---|---|---|---|
| 1.1 | 95 | 2 135 | Jeune diplômé Bac+5 |
| 1.2 | 100 | 2 240 | Ingénieur débutant (1-2 ans XP) |
| 2.1 | 105 (< 26 ans) | 2 315 | Ingénieur junior |
| 2.1 | 115 (≥ 26 ans) | 2 530 | Ingénieur confirmé |
| 2.2 | 130 | 2 850 | Senior / lead position |
| 2.3 | 150 | 3 275 | Senior confirmé, consultant |
| 3.1 | 170 | 3 650 | Manager / chef de projet |
| 3.2 | 210 | 4 495 | Senior manager / expert |
| 3.3 | 270 | 5 755 | Director / principal / partner |

**Valeurs du point Cadres 2026** :
- Positions 1.x : 21,88 € (ou 22,06 € selon source ⚠)
- Positions 2.x : 22,46 €
- Positions 3.x : 22,84 € (ou 20,43 € sur ancienne source ⚠ — à confirmer)

**Formule simplifiée** : `Minimum mensuel = Coefficient × Valeur du point`.

> ⚠ Sources web divergent sur la valeur du point pos. 3.x : confirmer 22,84 € (avenant 2026) vs 20,43 € (avenant 2017).

### Majorations modalités

- **Modalité 2 (38h30)** : minima × 1,15
- **Modalité 3 (forfait jours)** : minima × 1,20

**Exemple** : Cadre 2.3 coef 150 en forfait jours → 3 275 × 1,20 = **3 930 € minimum mensuel**.

---

## 3. Forfait jours (Modalité 3) — conditions de validité ✅

**Éligibilité** :
- Cadres positions 2.3 et au-delà
- ETAM 3.x (rare en pratique)

**Conditions obligatoires** :
1. Accord d'entreprise autorisant le forfait jours pour la catégorie
2. Clause individuelle écrite dans le contrat de travail mentionnant **"forfait annuel en jours" + nombre (max 218 jours, hors CP & jours fériés)**
3. Repos minimum 11 h consécutives par jour ; 35 h hebdo minimum
4. **Entretien annuel obligatoire sur la charge de travail**
5. Rémunération ≥ **120%** du minimum conventionnel de la position
6. Suivi documenté des jours travaillés par l'employeur

**Risque critique** : Absence de l'entretien annuel ou de la clause contractuelle → forfait jours nul, le salarié a droit au **rappel d'heures sup sur 3 ans à +25% et +50%**. Impact financier ESN très lourd.

---

## 4. Période d'essai & délai de prévenance ✅ — Article 3.4 Syntec confirmé Légifrance

> Source : Convention Syntec **Article 3.4** (En vigueur étendu). Avenant n°2 du 27 octobre 2022 (BOCC 2022-49) — coefficient ETAM passé de 230 à **240**.

**Règle préalable** : la période d'essai et son renouvellement **ne se présument pas**. Ils doivent être **expressément stipulés** dans la proposition d'embauche ou le contrat de travail. Sans clause écrite → pas de période d'essai opposable.

### Durée par coefficient

| Catégorie & coefficient | Durée initiale | Renouvellement max | Total max |
|---|---|---|---|
| ETAM coef **240 à 250** (positions 1.x) | **2 mois** | 2 mois | 4 mois |
| ETAM coef **275 à 500** (positions 2.x et 3.x) | **3 mois** | 3 mois | 6 mois |
| Cadres coef **95 à 270** (toutes positions IC) | **4 mois** | 4 mois | 8 mois |

> ⚡ **Différence vs Code du travail** : le légal donne 2 mois ETAM (toutes positions). Syntec va jusqu'à **3 mois** pour les ETAM 275+ — c'est plus long.
> Le **renouvellement est exceptionnel** et exige un **accord écrit** du salarié et de l'employeur.

### Délai de prévenance pendant période d'essai ✅ — barème Syntec spécifique

> ⚡ **Différence vs Code du travail** : Syntec étend le délai max à **6 semaines** (vs 1 mois légal) pour les anciennetés > 6 mois.

**À l'initiative de l'employeur** :
| Temps de présence | Délai |
|---|---|
| < 8 jours | 24 h |
| 8 jours à 1 mois | 48 h |
| 1 mois à 3 mois | 2 semaines |
| 3 mois à 6 mois | 1 mois |
| **6 mois à 8 mois** | **6 semaines** *(spécifique Syntec)* |

**À l'initiative du salarié** :
| Temps de présence | Délai |
|---|---|
| < 8 jours | 24 h |
| ≥ 8 jours | 48 h |

### Indemnité compensatrice si non-respect du délai ✅

- La période d'essai (renouvellement inclus) ne peut **pas** être prolongée par le délai de prévenance
- Si l'employeur ne respecte pas le délai → **indemnité compensatrice = salaires + avantages que le salarié aurait perçus** s'il avait travaillé jusqu'à l'expiration du délai, **indemnité compensatrice de CP comprise**
- **Non due** si dispense d'exécution sollicitée par le salarié et acceptée par l'employeur

### Absences pour recherche d'emploi pendant l'essai ✅

- **2 heures par jour ouvré** entre la date de notification de la rupture et la fin d'activité
- **Non rémunérées** si la rupture est à l'initiative du salarié

---

## 5. Préavis (rupture en CDI) ✅ — Article 4.2 Syntec confirmé Légifrance

| Catégorie | Démission | Licenciement |
|---|---|---|
| ETAM ancienneté < 2 ans | 1 mois | 1 mois |
| ETAM ancienneté ≥ 2 ans | 2 mois | 2 mois |
| ETAM coefficients 400 / 450 / 500 | **2 mois quelle que soit l'ancienneté** | 2 mois |
| Cadre (toutes positions) | **3 mois** | **3 mois** |

> Source : Convention Syntec **Article 4.2** (KALIARTI000047513833), en vigueur étendu.
> Une durée supérieure ou inférieure peut être définie par accord entre les parties.
> Pas de préavis en cas de faute grave, faute lourde, ou impossibilité de reclassement.

**Heures de recherche d'emploi pendant préavis** ✅ — Article 4.3 Syntec :
- **6 jours ouvrés / mois** (correction : pas 50 h/mois)
- Pris en une ou plusieurs fois, en principe par demi-journée
- Réparti pour moitié employeur, moitié salarié
- Pas de réduction de rémunération en cas de licenciement
- Non rémunérées en cas de démission
- Pas d'indemnité si non utilisées

**Indemnité compensatrice de préavis** ✅ — Article 4.4 Syntec :
- Partie qui n'observe pas le préavis doit à l'autre une indemnité égale à la rémunération du préavis restant à courir
- **L'employeur qui dispense du préavis** doit verser une indemnité compensatrice intégrale pour la période non effectuée
- **Le salarié qui part en cours de préavis pour un nouvel emploi** n'a droit qu'à la rémunération de la période effectivement travaillée
- Sur demande du salarié, paiement immédiat et intégral possible
- La dispense d'exécution n'avance pas la date de fin de contrat

---

## 6. Indemnité conventionnelle de licenciement ✅ — Article 4.5 Syntec confirmé Légifrance

> Source : Convention Syntec **Article 4.5** (KALIARTI000047513839), en vigueur étendu depuis l'arrêté d'extension du 5 avril 2023.

**Conditions d'attribution** :
- Salarié licencié justifiant d'**au moins 8 mois d'ancienneté ininterrompue**
- S'ajoute à l'indemnité compensatrice de préavis éventuellement versée
- **Non due** en cas de faute grave ou lourde

**Formule ETAM** :
| Ancienneté | Fraction de mois par année |
|---|---|
| Jusqu'à 10 ans | **1/4 de mois** par année |
| Au-delà de 10 ans | **1/3 de mois** par année |

**Formule Cadres et Ingénieurs** ⚠ **plus généreuse que le légal** :
| Ancienneté | Fraction de mois par année |
|---|---|
| < 2 ans | 1/4 de mois par année |
| **≥ 2 ans** | **1/3 de mois par année** ← Syntec passe au 1/3 dès 2 ans (vs 10 ans en légal) |

**Différence impact ESN** : un cadre licencié à 5 ans d'ancienneté touche **+33% en Syntec vs légal** :
- Syntec : 5 × 1/3 = **1,67 mois**
- Légal : 5 × 1/4 = 1,25 mois

**Base de calcul** : 1/12 de la rémunération des 12 derniers mois précédant la notification de la rupture.
- **Inclut** : primes prévues par le contrat de travail
- **Exclut** : majorations pour heures supplémentaires, indemnités/majorations liées à un déplacement ou détachement

**Années incomplètes** : prorata du nombre de mois de présence.

**Règle "plus favorable"** : L'employeur verse l'indemnité dont le montant est le **plus élevé** entre la formule Syntec ci-dessus et la formule du Code du travail (R1234-2). Cela protège le salarié dans les rares cas où le légal devient plus avantageux (typiquement très longues anciennetés ETAM).

### Indemnité de départ à la retraite ✅ — Article 4.8 Syntec

- À 5 ans révolus : **1 mois**
- Au-delà : **1/5 de mois par année supplémentaire**
- Base : 1/12 des 12 derniers mois, hors primes/HS/déplacements

### Indemnité de mise à la retraite (employeur) ✅
Au moins égale à l'indemnité de licenciement.

### Indemnité de rupture conventionnelle ✅

**Plancher légal** = indemnité conventionnelle de licenciement (ou indemnité légale si la conventionnelle est moins favorable).
En pratique ESN : souvent négociée à +20% à +30% du plancher pour éviter Prud'hommes.

### Indemnité de fin de CDD ✅

10% de la rémunération brute totale versée pendant le CDD (sauf CDD jeune saisonnier ou CDD avec formation diplômante).

### Indemnité de fin de CDI de chantier (accord branche 2018) ❌

Syntec a négocié un accord de branche spécifique au CDI de chantier en 2018.
- **Indemnité de fin de chantier** : montant exact à confirmer Légifrance.
- **Préavis** : généralement aligné sur le CDI classique (3 mois cadre).
- **Avantages CDI chantier ESN** : moins de risque qu'un CDI classique (terme = fin de mission), souvent positionné comme "CDI à durée limitée".

---

## 7. Clause de non-concurrence ❌ → standard légal

Syntec ne déroge pas significativement au cadre légal Code du travail :
- Limitée dans le temps (max 2 ans, courant 12-24 mois)
- Limitée géographiquement
- Limitée par nature d'activité
- **Indemnité compensatrice obligatoire** : montant non fixé par la loi, mais jurisprudence exige "non dérisoire" → en pratique 50% du brut moyen sur la durée de la clause. Exemple : clause 12 mois + brut 4 000 € → 24 000 € à payer sur 12 mois.

Important : si activée, c'est un coût lourd pour l'ESN en cas de rupture. Souvent renoncée par l'ESN à la rupture.

---

## 8. Heures supplémentaires ✅

### ETAM en modalité 1 (35h)
- 36ᵉ à 43ᵉ heure : **+25%**
- 44ᵉ heure et au-delà : **+50%**

### Cadres en modalité 2 (38h30)
- Forfait hebdomadaire inclus → 38h30 sans HS jusqu'à 38h30
- Au-delà : majoration HS classique
- Limite : 1 700 h/an
- Minimum salarial : +15% du minimum conventionnel position

### Cadres en modalité 3 (forfait jours)
- **Pas d'HS au sens classique** (forfait en jours, pas en heures)
- Si dépassement 218 j/an : rachat possible, **+10% minimum** (souvent +25% par accord)
- Limite : 235 jours max après rachat
- Repos minimum 11 h consécutives/jour, 35 h/semaine impératif

---

## 9. Cotisations & coût employeur 2026 ⚠

**Important** : ces taux viennent de la connaissance générale du droit social français 2026, **pas d'une extraction directe URSSAF** (le fetch a échoué). **À valider avec un expert paie avant production**.

### Taux charges patronales — Cadre Syntec en région parisienne (estimation 2026)

| Cotisation | Taux | Base | Statut |
|---|---|---|---|
| Maladie-maternité | 7,00% (13% sans réduction Fillon) | Totalité | Tous |
| Allocations familiales | 3,45% (5,25% si > 3,5 SMIC) | Totalité | Tous |
| Vieillesse plafonnée | 8,55% | T1 | Tous |
| Vieillesse déplafonnée | 2,02% | Totalité | Tous |
| AT/MP (tech ESN moyen) | ~1,0% | Totalité | Tous |
| FNAL (≥ 50 salariés) | 0,50% | Totalité | Tous |
| FNAL (< 50 salariés) | 0,10% | T1 | Tous |
| CSA (Contribution Solidarité Autonomie) | 0,30% | Totalité | Tous |
| AGIRC-ARRCO T1 (contractuelle) | 4,72% | T1 | Tous |
| AGIRC-ARRCO T2 (contractuelle) | 12,95% | T2 | Cadres |
| CEG (Contribution Équilibre Général) T1 | 1,29% | T1 | Tous |
| CEG T2 | 1,62% | T2 | Cadres |
| CET (Contribution Équilibre Technique) | 0,14% | T1+T2 si > PASS | Cadres |
| **APEC** | **0,036%** | **T1+T2** | **Cadres uniquement** |
| **Prévoyance Syntec** | **1,50%** | **T1** | **Cadres + Assimilés (obligatoire Syntec)** |
| Chômage | 4,05% | T1+T2 (plafond 4 PASS) | Tous |
| AGS | 0,15% | T1+T2 | Tous |
| CUFPA (contribution unique formation/apprentissage) | 1,68% | Totalité | Tous |
| Versement mobilité Paris (Grand Paris) | **3,05%** (2026, +0,10 vs 2025) | Totalité | Tous (≥ 11 salariés en zone) |
| Versement mobilité Lyon | ~1,95% | Totalité | Tous |
| Versement mobilité Province (autres) | 0% à 2% | Totalité | Variable par commune |
| Forfait social (intéressement, PEE) | 20% (8% si CSE+PEE) | Sur sommes versées | Tous |
| Médecine du travail (cotisation forfaitaire) | ~80-120 € | Par salarié/an | Tous |

**PASS 2026** ✅ confirmé arrêté du 22/12/2025 : **4 005 €/mois · 48 060 €/an** (revalorisation +2 % vs 2025). Plafond journalier 220 €. T1 = jusqu'à 1 PASS, T2 = 1 à 8 PASS.

### Total approximatif pour un cadre Syntec Paris

**~42% à 45% du brut** selon les options (réduction Fillon, taille entreprise, versement mobilité local).

> ⚠ **Critique pour le calcul** : ces taux doivent être vérifiés annuellement (lois de financement Sécurité Sociale + accords AGIRC-ARRCO). Coder dans `syntec-bareme-2026.json` avec date de mise à jour pour faciliter la maintenance.

---

## 10. Prime de vacances (Article 31 Syntec) ✅

**Obligatoire pour tous les salariés Syntec** ayant acquis des CP.

**Formule** : **10% des congés payés** acquis sur la période de référence (1ᵉʳ juin → 31 mai).
- En pratique : ≈ 1 mois de salaire (les CP) × 10% = ~10% d'un mois de brut → ≈ 250-500 €/an pour un cadre moyen.

**Versement** : entre le 1ᵉʳ mai et le 31 octobre (généralement juin avec la paie de mai).

**Substitution possible** : l'employeur peut absorber dans intéressement, participation, ou prime annuelle ≥ 10% des CP versée à tous entre mai et octobre. **Mais doit être versée à TOUS les salariés** (pas de discrimination).

**Au départ du salarié** : prorata des CP acquis non encore payés, versé avec le solde de tout compte.

---

## 11. Indemnités URSSAF déplacements 2026 ⚠

Barème URSSAF (s'applique à tous, pas spécifique Syntec) — chiffres généraux 2025 à confirmer pour 2026.

### Petits déplacements (repas, le salarié rentre chez lui le soir)

| Cas | Montant 2026 ⚠ |
|---|---|
| Repas sur le lieu de travail (panier) | 7,50 €/repas (était 7,40 € en 2025) |
| Repas hors entreprise (restaurant) | 21,10 €/repas |
| Repas hors entreprise (panier) | 10,40 €/repas (était 10,30 € en 2025) |

### Grands déplacements (salarié hébergé hors domicile)

| Zone | Hébergement + petit-déj (€/jour) | Repas (€/repas) | Total/jour ✅ |
|---|---|---|---|
| Paris + petite couronne (75, 92, 93, 94) | 74,30 | 21,40 | **117,10** |
| Autres départements métropole | 55,10 | 21,40 | **97,90** |

### Abattements pour mission longue durée

- Mission de **3 mois à 24 mois** sur le même lieu : **−15%** des forfaits
- Mission de **24 mois à 6 ans** : **−30%** des forfaits

### Indemnités kilométriques (barème URSSAF 2026 ⚠)

Variables selon puissance fiscale du véhicule (3 CV à 7 CV+) et kilométrage annuel. Formule officielle URSSAF.

> **À récupérer** : barème complet URSSAF 2026 frais professionnels, publié annuellement.

---

## 12. Types de contrat ESN — Syntec

### CDI classique ✅
- Cadre commun, le plus utilisé en ESN
- Préavis et indemnités voir sections 5-6
- Risque rupture le plus coûteux

### CDD ✅
- Motifs limités (remplacement, accroissement temporaire, mission spécifique)
- Durée max **18 mois** (renouvellement inclus, sauf cas particuliers)
- **Indemnité de précarité 10%** en fin de CDD (sauf exceptions)
- Pas de période d'essai si conversion CDD→CDI sur même poste

### CDI de chantier Syntec (accord branche 2018) ❌ détails
- CDI avec clause "fin = fin de mission/chantier"
- Très utilisé en ESN depuis 2018
- Indemnité de fin de chantier : montant à confirmer (≥ 10% de la rémunération versée selon usage)
- **Position de pitch Naywa** : "Quel type de contrat est le moins risqué pour cette mission ?"

> Le portage salarial et freelance/sous-traitance sortent du périmètre Syntec — à modéliser séparément si besoin.

---

## 13. Avantages et compléments rémunération

### Tickets restaurant ✅ (cadre légal 2026)
- Valeur faciale : 9-13 € typiquement
- **Part employeur** : 50% à 60% (exonération sociale et fiscale)
- ✅ Plafond exonération URSSAF 2026 confirmé : **7,32 €/jour part employeur** (était 7,26 € en 2025, 7,18 € en 2024).

### Mutuelle ✅
- **Obligation Syntec** : part employeur ≥ 50% (minimum légal)
- Avenant n°8 du 16/12/2025 sur mutuelle Syntec applicable au **1ᵉʳ juillet 2026** — à intégrer.

### Transport ✅
- **Obligation légale** : 50% de l'abonnement transports en commun (Navigo Paris, TCL Lyon, etc.)
- Forfait mobilité durable (optionnel) : jusqu'à 700 €/an exonérés (vélo, covoiturage…)

### 13ᵉ mois ❌ Syntec
- **Pas obligatoire** Syntec, mais ~60% des ESN le pratiquent.
- À paramétrer côté cabinet (case à cocher avantages).

### Intéressement / PEE / PERCO
- Optionnel, dispositif spécifique entreprise.
- Forfait social 20% (8% si PEE + CSE).

---

## 14. Vérification de conformité

À implémenter dans le calculateur :
1. **Brut proposé ≥ minimum conventionnel** (selon position + coef) → alerter si en dessous
2. **Forfait jours** → vérifier rémunération ≥ 120% minimum conventionnel
3. **Modalité 2** → vérifier rémunération ≥ 115% minimum conventionnel
4. **SMIC 2026** ⚠ : 1 801,80 € brut/mois (à confirmer pour mai 2026) → plancher absolu, jamais en dessous quel que soit la convention.

---

## Sources

- [Légifrance — Convention Syntec IDCC 1486 (texte consolidé)](https://www.legifrance.gouv.fr/conv_coll/id/KALICONT000005635173) — **source officielle, à consulter pour articles 8, 19 et accord CDI chantier**
- [Travail-Industrie — Décryptage Syntec 2026 (IDCC 1486)](https://travail-industrie.com/outils/conventions-collectives/syntec-2026-salaires-primes-decryptage-idcc-1486)
- [Culture RH — Coefficient Syntec 2026](https://culture-rh.com/coefficient-syntec-2026-grille-salaire-classification-position/)
- [Carrieres.dev — Guide complet Syntec 2026](https://www.carrieres.dev/blog/grille-syntec-2026-guide-complet-coefficients-salaires)
- [Kenko — Grille salaire Syntec 2026](https://www.kenko.fr/blog/grille-salaires-syntec)
- [LégiSocial — Conv. 1486 brochure 3018](https://www.legisocial.fr/conventions-collectives-nationales/1486-syntec-bureaux-etudes-techniques-cabinets-ingenieurs-conseils-societes/remunerations-salaire-minimal-grille-salaire-valeur-du-point.html) — ⚠ certaines pages renvoient l'avenant 2017 obsolète
- [Fédération Syntec — Convention collective](https://www.syntec.fr/convention-collective/)

---

## Zones à valider (TODO avant production)

1. ❌ **Article 19 Syntec** : formule exacte indemnité conventionnelle de licenciement (récupérer texte Légifrance)
2. ❌ **CDI de chantier** : indemnité de fin exacte, accord branche 2018
3. ❌ **ETAM Assimilé Cadre** : existe-t-il vraiment comme catégorie Syntec ou seulement pratique ESN ?
4. ⚠ **Charges patronales 2026** : faire valider chaque taux par expert paie (PASS, AGIRC-ARRCO, etc.)
5. ⚠ **Barème URSSAF déplacements 2026** : récupérer le PDF officiel annuel
6. ⚠ **Versement mobilité par commune** : récupérer table complète (zonage URSSAF Île-de-France + provinces)
7. ⚠ **SMIC mensuel mai 2026** : revaloriser si revalorisation gouvernementale en cours d'année
