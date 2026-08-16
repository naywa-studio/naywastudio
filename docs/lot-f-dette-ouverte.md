# Lot F — tout ce qui reste ouvert

**Cadré le 2026-08-15, à attaquer après le lot D.**

Ce document rassemble ce que les lots A à E ont laissé de côté, sciemment ou
faute de temps. Rien ici n'est une idée neuve : ce sont des dettes constatées,
chacune avec son coût et sa conséquence si on ne la traite pas.

L'ordre proposé plus bas n'est pas l'ordre d'écriture — il est en fin de
document, après les faits.

---

## F1 — Auth mutualisée

**Ce que c'est.** À chaque ouverture d'une page du workspace, **cinq bouts de
code différents demandent séparément « qui est connecté ? »**, et chacun
interroge le serveur Supabase. Vérifié le 2026-08-15 :

| Appelant | Fichier |
|---|---|
| Layout workspace | `src/app/workspace/layout.tsx:111` |
| Rappel CGU | `src/components/legal/CguGate.tsx:53` |
| Bandeau de suppression | `src/components/workspace/PendingDeletionBanner.tsx:36` |
| Bouton support | `src/components/support/SupportButton.tsx:155` |
| La page elle-même | `vivier/page.tsx:309`, `missions/page.tsx:333`, `pipeline/page.tsx:226`, `pricing/page.tsx:141` |

Sur les pages pricing, `PricingWidget.tsx:370` en ajoute un sixième.

**Pourquoi ça compte.** Deux effets, tous les deux déjà observés :

1. **Latence.** Cinq allers-retours réseau concurrents avant que la page
   commence à charger ses vraies données.
2. **Les alertes Sentry de verrou.** `auth-js` protège son rafraîchissement de
   jeton par un verrou navigateur (Web Locks). Cinq appels simultanés se
   disputent ce verrou, l'un le vole aux autres, et l'`AbortError` remonte dans
   Sentry — c'est l'alerte « Lock broken by another request with the 'steal'
   option » reçue par mail le 2026-08-13. **Ce n'est pas un bug fonctionnel** :
   personne n'est déconnecté, rien ne se perd. C'est du bruit qui masque les
   vraies alertes.

**Le correctif.** Poser la question une fois, dans un contexte React monté haut
(le layout en dispose déjà via `useWorkspace()`), et faire lire cette réponse
aux quatre autres au lieu de la redemander.

**Coût : une demi-journée.** Sans migration, sans changement de comportement
visible. Décision Elyas de le différer une première fois — assumée, ce n'est
pas urgent.

---

## F2 — Le scoring du matching n'est pas reproductible

**Ce que c'est.** Relancer un matching sur la même mission et le même vivier ne
redonne pas les mêmes notes. Le classement, lui, est stable : ce sont les
valeurs absolues qui bougent.

**Pourquoi ça compte.** Le produit **trie bien** — c'est ce qu'on lui demande.
Mais il **ne note pas de façon stable**, donc un score ne doit jamais être cité
comme une mesure (« ce candidat est à 82 »). C'est une contrainte de discours
autant que de code : à ne pas promettre en démo.

**État.** Documenté, non corrigé, et non corrigeable par un simple réglage : la
même variabilité se voit sur le volume de texte produit au parsing (LOKROU :
2 348 puis 5 780 caractères à structure identique). C'est le comportement du
modèle, pas un défaut d'implémentation.

**Piste si ça devient gênant.** Ancrer davantage le barème dans le prompt (des
paliers décrits plutôt qu'une note libre), ou déplacer une part du score vers
du calcul déterministe, comme le plancher déjà posé sur `domain_fit`. À
reprendre à froid, si l'usage le fait remonter.

---

## F3 — Jeu de référence pour le parsing

**Ce que c'est.** Une vingtaine de CV représentatifs (courts, longs,
multi-colonnes, scannés, FR et EN), un fichier d'attendu écrit **à la main**
pour chacun (nombre d'expériences, employeurs, dates, telle habilitation), et
un script qui compare la sortie du parsing à l'attendu.

**Pourquoi ça compte.** Aujourd'hui, la seule façon de savoir si un changement
casse le parsing est de re-parser des CV et de regarder. Les quatre régressions
de la session du 2026-08-13 (espaces perdus, gouttière non détectée, JSON
tronqué, prompt qui invitait à raccourcir) ont **toutes** été trouvées comme
ça. **Aucune n'a été vue en relisant le code.** Sans filet, la prochaine
passera.

C'est aussi la seule façon d'annoncer un **pourcentage de fiabilité défendable**
plutôt qu'un chiffre inventé.

**Obstacle pratique à trancher AVANT de commencer.** Pas de `node`, `npm` ni
`python` sur la machine ; le build Vercel est le seul exécuteur. Le script doit
donc tourner ailleurs : route admin protégée, ou GitHub Action. Ce choix change
l'estimation.

**Coût : une journée**, plus le temps de trancher l'exécution. C'est de
l'outillage, **invisible en démo** — à arbitrer contre du produit visible.

---

## F4 — Aucun moyen de re-parser les CV d'un client après un correctif

**Ce que c'est.** `POST /api/cv/[id]/parse` lit le candidat via le client
**RLS**, org-scopé par `current_org_id()`. Depuis le compte Naywa, un candidat
de GMH renvoie **404**. Le bypass admin est applicatif (`subscriptionAccess`),
il ne traverse pas la RLS.

**Ce comportement est CORRECT et voulu** : personne chez Naywa ne doit pouvoir
modifier les données d'un client par inadvertance. C'est même un argument de
vente.

**La conséquence, elle, ne tient pas à l'échelle.** À chaque amélioration du
parsing, seuls les clients peuvent en faire bénéficier leurs CV existants, en
cliquant « Relancer le parsing » fiche par fiche. Il faut donc leur demander un
geste après chaque correctif. **Cas concret non résolu : Aymen HAMMAMI (GMH),
le CV multi-colonnes qui a déclenché tout le lot E, n'a jamais été re-parsé.**

**Piste.** `POST /api/admin/reparse` : client admin, `requireAdmin()`, **org
ciblée explicitement** (jamais « toutes »), journalisée dans
`admin_audit_log`, plafonnée par lot. C'est une capacité sensible — à peser
contre le cloisonnement actuel, qui est un argument commercial.

**Coût : une demi-journée.** La décision compte plus que le code.

---

## F5 — Identifiant stable de brique au parsing

**Ce que c'est.** Le lot D masque des briques du CV dans le document remis à un
client, en les désignant par une **clé dérivée de leur contenu**
(`lib/anonymize-selection.ts`).

**La limite.** Corriger une brique masquée depuis la fiche candidat — renommer
l'employeur, rectifier la date de début — change sa clé, et **la brique
réapparaît** dans le document client. L'exclusion devient orpheline.

Les deux alternatives sont pires : un index désignerait un autre poste dès que
l'ordre change, et une liste d'inclusion ferait disparaître en silence les
briques retrouvées par un re-parsing.

**Le vrai remède** est un identifiant stable posé sur chaque brique **au
parsing**, que le schéma `ParsedCv` n'a pas aujourd'hui. Il servirait au-delà
de l'anonymisation : suivre une expérience d'un parsing à l'autre, mesurer ce
qu'un re-parsing a réellement changé, alimenter le jeu de référence (F3).

**Atténuation en place** : le panneau de la fiche match affiche en permanence
le nombre de briques masquées, donc l'écart se voit avant de regénérer.

**Coût : une demi-journée**, mais elle touche le schéma de parsing — à ne pas
faire à la légère, et de préférence **après** F3, qui donnerait le filet pour
la valider.

---

## F6 — Rubrique mêlée : la moitié non prévue se perd

**Ce que c'est.** Une rubrique de CV qui mélange deux natures — « LANGUES ET
CENTRES D'INTÉRÊT » — voit sa moitié prévue par le schéma partir dans le bon
champ (les langues) et **l'autre moitié disparaître** (les centres d'intérêt).

**État : une règle a été ajoutée au prompt, elle n'a PAS fonctionné au test**
(MEHDI MELAKHESSOU ressort encore à zéro). Non poursuivi : faible valeur de
recrutement, et le texte intégral affiché sur la fiche rattrape la perte pour
qui va le consulter.

**Piste si on y revient.** Traiter le découpage en rubriques **en code** avant
d'appeler le modèle, plutôt que de lui demander de le faire — le même
raisonnement que pour les alertes du lot E, où déplacer ce qui se compte du
modèle vers le code a supprimé les faux positifs d'un coup.

**Coût : deux heures pour essayer, sans garantie.** Le plus faible enjeu du
lot.

---

## F7 — `core_skills` : vérifier que le correctif a pris

**Ce que c'est.** Le champ « Compétences clés » s'affiche **tel quel sur le CV
remis au client**. Le prompt en demandait 8 à 20, le modèle en sortait **4,3 en
moyenne** (mesuré sur 31 CV). Quatre étiquettes pour quinze ans de carrière
donnent l'image d'un candidat pauvre alors que son CV est riche.

**État : le prompt a été corrigé et poussé (commit `acecdd8`), l'effet n'a
jamais été mesuré.** Trois leviers ajoutés plutôt qu'un rappel du nombre :
puiser dans le parcours et pas seulement dans la section « Compétences »,
reprendre `tools` et `domains` quand c'est déterminant à l'embauche, et se
relire en dessous de 8.

**Coût : une heure.** Re-parser une dizaine de CV du vivier et recompter. **À
faire en premier** — c'est le seul point du lot dont on ignore encore s'il est
réglé.

---

## F8 — Réserve cosmétique du template deux colonnes

La barre latérale colorée se prolonge vide sur les pages de continuation, et
laisse un petit bloc coloré flottant en haut de la dernière page. Rien ne
déborde. Comportement antérieur au lot C, devenu visible depuis que les CV
dépassent une page.

**Correctif : ne rendre la barre que sur la première page. Une heure.**

---

## F9 — Dépendance externe au moment du build

Un déploiement a échoué sur des **404 de `fonts.gstatic.com`** (JetBrains Mono,
`next/font/google` dans `src/lib/fonts.ts`). Rien à voir avec le code ; une
relance a suffi.

Mais **le build dépend d'un service tiers pour aboutir**, et ce service est le
seul typecheck du projet. Basculer en `next/font/local` supprime la dépendance.

**Coût : une heure**, télécharger les fichiers de police comprise.

---

## F10 — L'aperçu vivant ne rend qu'un seul gabarit

Repéré par Elyas le 2026-08-16. Le panneau latéral propose les **quatre**
gabarits (classique, deux colonnes, exécutif, bento) et le choix part bien au
PDF. Mais `AnonymizedCvLivePreview.tsx` **ne lit jamais `options.template`** :
il rend toujours la mise en page classique.

Conséquence : on choisit « deux colonnes », l'aperçu montre du mono-colonne, et
le PDF sort en deux colonnes. L'aperçu **ment sur la mise en page** — sur le
document que voit le client final.

Le contenu, lui, est juste : `buildAnonymizedModel()` est partagé, donc les
blocs masqués et l'ordre sont identiques dans les deux. Seule la **forme**
diverge.

**Deux niveaux de correctif :**

1. **Ne plus mentir — un quart d'heure.** Quand le gabarit choisi n'est pas
   « classique », afficher au-dessus de l'aperçu : « Aperçu en mise en page
   classique. Le PDF sortira en <gabarit>. » La vignette SVG du gabarit existe
   déjà (`TemplatePreview` dans `AnonymizeControls.tsx`), on peut la poser à
   côté.

2. **Rendre les quatre — un jour, un jour et demi.** Ré-écrire en HTML les trois
   autres mises en page. La machinerie d'édition (`BlockShell`, glisser-déposer,
   panneaux de correction) est indépendante de la mise en page : elle enveloppe
   des blocs, elle ne les positionne pas. Ce qui est à refaire, c'est le
   contenant : barre latérale de 165 pt pour deux colonnes, bandeau de méta pour
   exécutif, grille pour bento. Point de vigilance : le glisser-déposer doit
   rester cohérent dans une grille bento, où l'ordre visuel n'est pas l'ordre du
   flux.

**Faire le 1 tout de suite, le 2 dans le lot.**

---

## F11 — L'aperçu ne colle pas au PDF en hauteur

L'aperçu est **fidèle en largeur** (794 px = 595,28 pt à 96 dpi) et **environ
25 % plus haut** que le PDF. Deux causes, de coûts très différents.

**Cause 1 — le chrome d'édition prend de la place. Deux à trois heures.**
Chaque bloc est enveloppé dans un `BlockShell` qui ajoute `padding: 7px 9px` et
un `gap: 8`. Sur une vingtaine de blocs, ça fait ~280 px de haut qui n'existent
pas dans le PDF. Le correctif : sortir le chrome du flux (fond et contour en
`box-shadow` à débord négatif au lieu de `padding`, colonne d'actions déjà en
absolu sur les blocs d'en-tête). À faire en même temps : recaler les
`line-height` sur ceux de `@react-pdf`, qui dérivent en cumulé. Ça ramène l'écart
sous les 5 %.

**Cause 2 — savoir OÙ tombent les sauts de page. Long, à ne pas entreprendre.**
Il faudrait reproduire le moteur de pagination de `@react-pdf` : Yoga pour le
flex, plus les métriques exactes des polices embarquées. J'avais posé des repères
de page calculés à la main : ils annonçaient **3,8 pages pour 3 réelles**, et je
les ai retirés — un repère faux est pire que pas de repère.

**Faire la cause 1. Ne pas promettre la cause 2 :** un aperçu éditable ne peut
pas être un rendu PDF, et il vaut mieux qu'il ne prétende pas l'être.

---

## Ordre proposé

| # | Sujet | Coût | Pourquoi ce rang |
|---|---|---|---|
| 0 | **F10-1** l'aperçu ne ment plus sur le gabarit | ¼ h | Trivial, et l'aperçu induit en erreur sur un document client. |
| 1 | **F7** core_skills | 1 h | Seul point dont on ignore s'il est réglé. Touche le document client. |
| 2 | **F1** auth mutualisée | ½ j | Gain visible (navigation) + supprime le bruit Sentry qui masque les vraies alertes. |
| 3 | **F9** polices locales | 1 h | Rend fiable le seul typecheck du projet. |
| 4 | **F8** barre deux colonnes | 1 h | Visible par le client final, correctif trivial. |
| 5 | **F3** jeu de référence | 1 j + arbitrage | Le filet de tout le reste. À trancher : où le script tourne. |
| 6 | **F5** identifiant de brique | ½ j | À faire **après** F3, qui donne de quoi le valider. |
| 7 | **F4** route admin de re-parsing | ½ j | Décision produit avant code. Débloque Aymen HAMMAMI. |
| 8 | **F11-1** hauteur de l'aperçu (chrome) | 2-3 h | Ramène l'écart de 25 % à moins de 5 %. |
| 9 | **F10-2** les quatre gabarits dans l'aperçu | 1-1,5 j | Le plus gros de la liste. À faire une fois F11-1 posé, sinon on règle la hauteur quatre fois. |
| 10 | **F6** rubrique mêlée | 2 h | Plus faible enjeu, sans garantie de succès. |
| — | **F2** reproductibilité du scoring | — | Pas d'action. Contrainte de discours, à ne pas promettre. |
| — | **F11-2** sauts de page exacts | — | Pas d'action. Reproduire la pagination de `@react-pdf` coûte plus que ça ne rapporte. |

**Le premier jour (F10-1 + F7 + F1 + F9 + F8) règle cinq points.** Le reste
demande des arbitrages qui ne sont pas techniques, sauf F10-2 qui est du travail
franc.
