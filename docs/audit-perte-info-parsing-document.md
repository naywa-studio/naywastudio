# Audit — ce qui se perd entre le CV du candidat et le document remis au client

*18 août 2026. Mesuré en base sur 198 CV, dont les 12 de GMH (seul client réel).*

## L'exigence

Écrite noir sur blanc dans `database.types.ts`, au-dessus de `other_sections` :

> « Demande explicite de GMH : retrouver TOUT ce qui figure au CV, dans la fiche
> comme dans le document anonymisé. »

Tout ce que le parseur extrait doit donc atteindre le client, **sauf** ce qu'on
anonymise délibérément (identité, coordonnées, adresse précise).

Cet audit vérifie champ par champ si c'est le cas. Réponse courte : non, et les
manques portent sur du contenu que le client lit pour décider.

## Méthode

Trois destinations possibles pour chaque champ de `ParsedCv` et de `taxonomy` :
le **document** anonymisé (4 gabarits + aperçu + DOCX), la **fiche candidat**
(le sourceur), le **matching**. Un champ peut légitimement n'aller nulle part
(diagnostic interne), mais ça doit être un choix, pas un oubli.

Source de vérité du document : `buildAnonymizedModel` dans
`lib/anonymized-cv-model.ts` — tout ce qui n'est pas dans `AnonymizedCvModel`
n'atteint aucun gabarit.

## Tableau

Légende : ✅ arrive · ❌ perdu · 🔒 retiré volontairement (anonymisation) · ⚙️ interne

| Champ | Document | Fiche | Matching | Verdict |
|---|---|---|---|---|
| `full_name` | 🔒 | ✅ | — | Remplacé par la référence `C-XXXX` |
| `email`, `phone` | 🔒 | ✅ | — | Coordonnées, jamais transmises |
| `linkedin_url`, `github_url`, `portfolio_url`, `malt_url` | 🔒 | ✅ | — | Identifiants directs |
| `location` | 🔒 dégradé | ✅ | ✅ | Commune + département seulement |
| `current_title` | ✅ | ✅ | ✅ | Titre du document si pas de mission |
| `current_company` | ✅ indirect | ✅ | ✅ | Visible via `experience[0].company` |
| `years_experience` | ✅ | ✅ | ✅ | |
| `seniority_level` | ✅ | ✅ | ✅ | |
| `seniority_role` | ❌ | — | ✅ | Mineur : `role_family` joue ce rôle |
| **`summary`** | **❌** | ✅ | ✅ | **Voir §1 — le plus grave** |
| `skills` | ✅ | ✅ | ✅ | Corrigé le 18/08 (fusion des deux sources) |
| **`certifications`** | **❌** | ✅ | ❌ | **Voir §2** |
| **`qualities`** | **❌** | ✅ | ❌ | **Voir §3** |
| **`is_apprentice`** | **❌** | ✅ badge | ✅ | **Voir §4** |
| `languages` | ✅ | ✅ | ✅ | |
| `experience` | ✅ | ✅ | ✅ | |
| `education` | ✅ | ✅ | ✅ | |
| `other_sections` | ✅ | ✅ | ✅ | Le fourre-tout fonctionne |
| `language` (ISO) | ⚙️ | — | — | Technique |
| `sector` | ⚙️ | ✅ | ✅ | Classement vivier |
| `completeness`, `warnings`, `source_quality` | ⚙️ | ✅ | — | Diagnostic sourceur, à ne pas transmettre |
| `taxonomy.core_skills` | ✅ | ✅ | ✅ | Fusionné avec `skills` le 18/08 |
| `taxonomy.tools` / `domains` / `industries` | ❌ | — | ✅ | Voir §5 |
| `taxonomy.role_family` | ✅ titre | ✅ | ✅ | |

## §1 — Le résumé du candidat est perdu sur ~100 % des CV

**Le plus grave, et le plus invisible.**

`buildAnonymizedModel` fait :

```ts
noraSummary: opts.keepNoraSummary
  ? (executiveSummary?.trim() || cv.summary?.trim() || null)
  : null
```

avec `keepNoraSummary` à **`false` par défaut**. Deux choses distinctes sont
donc pilotées par une seule case :

- le **résumé écrit par Nora** (texte généré, consomme un crédit) ;
- le **résumé du candidat lui-même**, son accroche, écrite de sa main sur son CV.

Décocher « Résumé Nora » — l'état par défaut — supprime **les deux**. Le second
n'est même pas de l'IA : c'est du contenu du CV, au même titre qu'une
expérience. Il n'apparaît qu'en repli, quand Nora n'a rien généré.

**Mesure** : `summary` est renseigné sur **12 CV sur 12 chez GMH**, 141 sur 142
chez KYPE, 33 sur 34 chez Naywa. Autrement dit, **quasiment chaque CV perd son
accroche** dans le document remis au client.

**Décision produit requise** (cf. §Suites) : découpler les deux, et afficher le
résumé du candidat par défaut puisque l'exigence est « tout le CV ».

## §2 — Les certifications n'atteignent aucun gabarit

Extraites, stockées dans `parsed_cv.certifications`, affichées sur la fiche
candidat — et **absentes de `AnonymizedCvModel`**, donc des 4 gabarits, de
l'aperçu et du DOCX.

**Mesure** : **5 CV sur 12 chez GMH**, 52 sur l'ensemble de la base.

Sur un profil d'ingénieur, une certification API, soudage ou sécurité peut être
le critère qui emporte la décision du client. Aucune raison éditoriale ne
justifie de la retirer : c'est un oubli.

À noter aussi : les certifications **ne sont pas exploitées par le matching**.
Une mission qui exige une habilitation ne peut pas s'appuyer dessus autrement
que par un critère libre.

## §3 — Les qualités n'atteignent aucun gabarit

Même situation : **12 CV sur 12 chez GMH**, 173 sur la base.

Nuance : ici l'omission se défend. Le prompt de parsing dit lui-même « IGNORE le
bruit : soft skills génériques (rigoureux, motivé) », et `rigueur`,
`adaptabilité`, `esprit d'équipe` sur un CV anonymisé n'apprennent rien à un
client. Mais l'exigence retenue est « tout le CV » : elles doivent donc partir,
quitte à ce que le sourceur les masque au cas par cas.

## §4 — L'alternance n'est pas dite au client

`is_apprentice` pilote un badge sur la fiche et entre dans le matching, mais
**n'apparaît pas sur le document**. Le client voit une séniorité et un nombre
d'années, jamais le fait que le candidat est en alternance.

**Mesure** : 0 chez GMH, mais **125 sur 142 chez KYPE** et 20 sur 34 chez Naywa.

C'est une information contractuelle déterminante pour un client. À afficher, au
moins comme mention dans le bandeau d'en-tête.

## §5 — `tools`, `domains`, `industries` : absence assumée

Ces trois champs de `taxonomy` servent au matching et ne vont pas au document.
C'est cohérent : `tools` recoupe largement la colonne `skills` désormais
fusionnée, et `domains`/`industries` sont des étiquettes de classement, pas du
contenu de CV (« btp », « paiement »). Les afficher tels quels affaiblirait la
fiche plutôt que de l'enrichir. **Rien à faire.**

## La cause commune

Aucune de ces pertes n'est un bug de code : chaque champ est correctement
extrait et stocké. Elles viennent toutes du même endroit — **le contrat entre le
parseur et le document n'est écrit nulle part et n'est vérifié par rien**.

`AnonymizedCvModel` est une liste d'inclusion : un champ ajouté au parseur
n'arrive au client que si quelqu'un pense à l'ajouter aussi ici. Personne ne
s'en aperçoit, puisque le document reste valide et joli — simplement incomplet.

C'est exactement le défaut que `anonymize-selection.ts` a su éviter pour les
briques, en choisissant une **liste d'exclusion** (« absent = la brique part »).
Le modèle du document, lui, applique la logique inverse.

**Remède durable** : un test qui, pour un CV de référence contenant tous les
champs, vérifie que chacun se retrouve dans le document ou figure dans une liste
d'exclusions explicitement justifiée. Un champ ajouté sans décision fait alors
échouer le test au lieu de disparaître en silence.

## Suites

| # | Action | Ampleur | Décision |
|---|---|---|---|
| 1 | Certifications au document (4 gabarits + aperçu + DOCX) | moyenne | ✅ tranchée : à faire |
| 2 | Qualités au document | moyenne | ✅ tranchée : à faire |
| 3 | Découpler résumé du candidat / résumé Nora | moyenne | ⏳ change le défaut de TOUS les documents |
| 4 | Mention alternance sur le document | petite | ⏳ à valider |
| 5 | Certifications exploitées par le matching | moyenne | ⏳ à cadrer |
| 6 | Test de non-régression parseur → document | petite | recommandé |

Les points 1 et 2 sont sans ambiguïté au regard de l'exigence « tout le CV ».
Le point 3 modifie l'apparence de **tous** les documents générés : il mérite
d'être validé avant, pas après.
