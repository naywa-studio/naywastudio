# Mailing — architecture de l'expérience

> Écrit le 01/09/2026, pendant l'attente de la vérification d'éditeur
> Microsoft. Prolonge `cadrage-experience-mailing.md`, qui tranchait **une**
> question : l'unité de conversation. Ce document-ci traite le reste — tout ce
> que le client voit, dans quel ordre, et **comment plusieurs sourceurs d'un
> même cabinet écrivent aux mêmes candidats sans se marcher dessus.**
>
> Tout ce qui est décrit comme « aujourd'hui » a été vérifié dans le code, pas
> de mémoire.

---

## 1. Rappel du cadrage, en deux lignes

**L'unité de CONVERSATION est le couple (candidat, mission).** On écrit à
quelqu'un *pour un poste*. Deux missions, deux histoires.

**L'unité de MÉMOIRE est le candidat.** Ce qu'il faut savoir avant d'écrire ne
dépend pas de la mission : « Louis lui a écrit il y a trois jours ».

Tout ce qui suit découle de ces deux phrases.

---

## 2. Le problème que ce document résout vraiment

Le vivier est **entièrement partagé** entre les membres d'une organisation
(règle établie, section 19 de `CLAUDE.md`). Les missions aussi. Mais la
**boîte aux lettres est personnelle** : `connected_mailboxes` porte un
`user_id`. Trois sourceurs, trois boîtes, un seul vivier.

C'est de cette asymétrie que naissent tous les conflits :

| # | Conflit | Ce qui se passe aujourd'hui |
|---|---|---|
| 1 | Deux sourceurs écrivent au même candidat pour deux missions | Rien ne l'empêche, rien ne le signale |
| 2 | Deux sourceurs écrivent au même candidat pour **la même** mission | Idem, et c'est le pire cas |
| 3 | Un candidat répond, deux sourceurs traitent la réponse | Aucun état « pris en charge » |
| 4 | Un candidat approché sur deux missions répond | Sa réponse est rattachée à la **mission la plus récente**, à tort |
| 5 | Le sourceur qui a écrit est absent / parti | Sa boîte se décroche, personne ne peut reprendre le fil proprement |
| 6 | Un candidat s'est désinscrit | L'envoi échoue **au moment du clic**, après rédaction |
| 7 | Le plafond quotidien est atteint par un collègue | Le plafond est par organisation ; le refus ne le dit pas |

Aucun de ces sept n'est un bug de code : ce sont des **trous d'expérience**.
Ils ne se voient pas en recette solo — il faut deux personnes et deux semaines
pour les rencontrer, c'est-à-dire chez le client.

---

## 3. Les trois principes

**a. Dériver, ne pas stocker.** Qui est l'interlocuteur d'un candidat, quand
il a été contacté, pour quelle mission : tout est déjà dans `email_messages`.
Un champ « owner » dupliqué se désynchronise le jour où un message est
supprimé ou une mission fusionnée, et un état faux est pire qu'un état absent.
Une seule exception, justifiée en §6 : la **prise en charge d'une réponse**,
qui est une intention humaine et ne se déduit d'aucune donnée.

**b. Le contexte voyage dans l'adresse.** C'est la décision structurante.
Aujourd'hui l'adresse de réponse identifie **le sourceur**
(`profiles.inbox_address`), et la mission est *devinée*. Demain elle
identifiera **la conversation** : `inbox+<matchId>@reply.naywastudio.com`. Le
client de messagerie du candidat n'a rien à préserver — il répond à l'adresse,
point. C'est ce qui rend les conflits 4 et 5 impossibles plutôt que rares.

**c. Entre collègues : avertir, jamais bloquer.** Un cabinet doit pouvoir
couvrir une absence, reprendre un dossier, doubler volontairement. Le produit
ne décide jamais à la place du sourceur — c'est le garde-fou fondateur. Le
seul blocage dur concerne le **candidat** (désinscription, rebond), parce que
là ce n'est plus une préférence interne mais une obligation.

---

## 4. Ce que le client voit — trois surfaces, et pas une de plus

### Surface 1 — `/organisation` → section « Messagerie »

Remplace l'actuel « Domaine d'envoi ». Trois blocs, dans cet ordre :

**« Votre boîte d'envoi »** *(personnel — un par membre)*
Deux cartes, logos Google et Microsoft, une seule connectable à la fois.
États : non connectée · connectée (adresse + date) · à reconnecter (nommant
le bon fournisseur — un « Google a révoqué… » sous une boîte Microsoft envoie
chercher au mauvais endroit). Une phrase, pas négociable :
> *Nous n'accédons jamais au contenu de votre boîte. Nous envoyons en votre
> nom ; les réponses reviennent dans Naywa.*

**« L'identité du cabinet »** *(organisation — owner ou délégué)*
Le domaine d'envoi, l'adresse générique, la mention légale de prospection
(éditable, désactivable). ⚠️ **Cet éditeur est aujourd'hui inaccessible** : il
vit dans `MailingDomainCard`, masquée par `SHOW_SENDING_DOMAIN_CARD = false`.
Il doit remonter ici, indépendamment de Domain Connect.

**« Qui peut écrire »** *(owner uniquement — nouveau)*
La liste des sièges et l'état de leur boîte. Sans ça, un owner ne peut pas
répondre à « pourquoi Marie ne peut pas envoyer ? » — il n'a aucune vue.
Trois lignes de tableau, pas un écran.

Le choix entre *relation personnelle* (meilleur taux de réponse) et *adresse
générique* (survit au départ d'un sourceur) doit être **posé**, pas deviné.

#### La boîte partagée d'équipe : c'est le domaine d'envoi, pas un connecteur

Question d'Elyas (02/09) : l'owner ne pourrait-il pas connecter une BAL
partagée, chaque membre choisissant ensuite sa boîte ou celle de l'équipe ?

**Techniquement, non.** Une boîte aux lettres partagée Microsoft n'a ni licence
ni mot de passe et **ne peut pas se connecter** : il n'y a personne à
authentifier. Ce qui existe, c'est qu'un *utilisateur* disposant du droit
« Envoyer en tant que » s'authentifie avec le scope `Mail.Send.Shared` et
envoie *au nom de* la BAL. Tous les envois de l'équipe passeraient alors par
**le jeton d'une personne** — l'owner part, tout s'arrête. On aurait recréé le
problème qu'on cherche à éviter.

**La réponse est déjà dans le produit : le domaine d'envoi.**
`recrutement@cabinet.fr` expédié par SES sous le domaine authentifié du
cabinet. Ni BAL, ni scope supplémentaire, ni dépendance à un salarié. L'owner
configure une fois, tout le monde en dispose, ça survit à tous les départs.

Le mécanisme voulu reste exactement celui décrit, posé sur cette voie-là :
**chaque membre choisit — ma boîte, ou l'adresse du cabinet.** Ce qui donne à
Domain Connect un rôle qu'on ne lui prêtait pas : ce n'est pas seulement le
chemin de repli des cabinets sans Google ni Microsoft, c'est **la** réponse au
besoin d'équipe.

`Mail.Send.Shared` reste l'issue de secours si un client exige que les
messages figurent dans les *Éléments envoyés* de la BAL dans Outlook. À ne
rouvrir que sur demande réelle.

### Surface 2 — la fiche match : là où on écrit

C'est la surface principale, elle existe déjà (colonne 2 de
`workspace/match/[matchId]`). Il lui manque **ce qui vient avant d'écrire**.

Ordre imposé de haut en bas — et cet ordre est la fonctionnalité :

1. **Bandeau de mémoire** (nouveau) — *avant* la zone de rédaction, jamais
   après. Trois états possibles, du plus grave au plus anodin :
   - 🔴 **désinscrit / rebond permanent** → rédaction fermée, motif expliqué ;
   - 🟠 **déjà contacté pour cette mission** par X, il y a N jours ;
   - 🟡 **déjà contacté pour une autre mission** par X, il y a N jours, avec
     le titre du poste.
   Au-delà de 90 jours, l'information passe en gris discret : « dernier
   échange en mars ». Un avertissement permanent devient un décor qu'on ne lit
   plus.
2. **Le fil**, filtré sur la mission courante, avec une bascule
   « tout l'historique de ce candidat » — les deux unités du §1, rendues
   visibles.
3. **La rédaction**, repliée derrière « Répondre » dès qu'un échange existe
   (déjà le cas).

### Surface 3 — « Réponses » : le rendez-vous quotidien

**Le trou le plus béant du produit aujourd'hui.** Les réponses arrivent en
base, Nora les analyse — et **rien ne dit au sourceur qu'il en a**. Il faut
rouvrir les fiches une par une. Le commentaire en tête de
`api/candidates/[id]/messages/route.ts` le raconte déjà : des sourceurs ont
cru qu'un candidat ne répondait pas alors que sa réponse était en base.

Une entrée de navigation **« Réponses »**, avec pastille de non-lu.

Ce n'est **pas** une messagerie : pas de dossiers, pas de rédaction, pas de
recherche plein texte. Une liste, triée par date : candidat · mission ·
extrait · humeur détectée par Nora · qui a écrit le message d'origine · qui a
pris en charge. Un clic ouvre la fiche match. C'est tout.

Cette retenue n'est pas de la frugalité : **le dossier Google repose sur
« un sourceur, un candidat, un message choisi »**. Un client de messagerie
complet contredirait ce qu'on a écrit pour obtenir la vérification.

---

## 5. L'échelle d'états de la zone de rédaction

L'ordre d'évaluation compte autant que la liste : ce qui **bloque** passe
avant ce qui **avertit**, et ce qui est **imputable au candidat** avant ce qui
est imputable au cabinet.

| Ordre | Condition | Ce que voit le sourceur |
|---|---|---|
| 1 | Mailing non ouvert à l'org | Rien du tout (`mailingVisible`) |
| 2 | Lecture seule / lockdown | Le message d'abonnement existant |
| 3 | CV non parsé | « Disponible une fois le CV lu » |
| 4 | **Candidat sans adresse** | « Aucune adresse » + lien vers la fiche |
| 5 | **Adresse supprimée** (rebond, plainte, désinscription) | 🔴 Rédaction fermée, motif en clair |
| 6 | **Plafond quotidien du cabinet atteint** | « Votre cabinet a atteint ses N envois du jour » — le mot *cabinet* est essentiel, sinon le sourceur croit à un bug |
| 7 | **Aucune boîte connectée** | Bouton « Connecter ma messagerie » — jamais un échec au clic sur Envoyer |
| 8 | **Boîte à reconnecter** | Bouton nommant le fournisseur |
| 9 | Déjà contacté (§4) | 🟠/🟡 Bandeau, rédaction **ouverte** |
| 10 | Rien de tout ça | Rédaction |

Les états 4 à 8 sont aujourd'hui découverts **au clic sur Envoyer**. Les
remonter en amont ne coûte presque rien et change tout : un message rédigé
puis refusé, c'est du travail perdu et de la confiance perdue.

---

## 6. Modèle de données

### Ce qui existe et suffit

`email_messages` porte déjà `candidate_id`, `job_id`, `user_id`,
`organization_id`, `direction`, l'analyse de Nora et les pièces jointes. Le
bandeau de mémoire, l'interlocuteur, l'ancienneté du dernier contact : **tout
se dérive de cette table.** Aucune colonne à ajouter pour ça.

`connected_mailboxes` (par utilisateur), `email_suppressions` (par
organisation), `send-cap` (par organisation) sont en place et corrects.

### Les trois seuls ajouts

```sql
-- Une réponse « prise en charge ». Intention humaine : ne se dérive pas.
alter table email_messages add column handled_at  timestamptz;
alter table email_messages add column handled_by  uuid references auth.users(id);

-- Le bandeau de mémoire interroge cette table à chaque ouverture de fiche.
create index if not exists email_messages_org_candidate_idx
  on email_messages (organization_id, candidate_id, created_at desc);
```

**Pourquoi la prise en charge est au niveau de l'ORGANISATION et non de
l'utilisateur.** Le vivier est partagé : le signal utile n'est pas « je l'ai
lu » mais « quelqu'un s'en occupe ». Un état de lecture par personne
multiplierait les lignes et ne résoudrait pas le conflit n° 3 — deux sourceurs
répondant à la même personne. Conséquence assumée : la pastille de non-lu est
celle du **cabinet**, et elle s'éteint pour tout le monde quand l'un s'en
saisit. C'est le comportement qu'on veut.

---

## 7. Le routage des réponses — la pièce maîtresse

### Aujourd'hui (`lib/mailing/route-inbound.ts`)

1. l'adresse **destinataire** désigne le sourceur (`profiles.inbox_address`) ;
2. l'adresse **expéditeur** désigne le candidat ;
3. la mission est celle du **dernier message sortant** :
   `.order("created_at", desc).limit(1)`.

Le point 3 est faux dès qu'un candidat est approché sur deux missions. Le fil
se remplit, rien n'échoue, personne ne s'en aperçoit — la pire forme de
défaut. Le point 1 lie la conversation à une **personne**, ce qui casse au
premier départ.

### Demain

L'adresse de réponse devient **`inbox+<matchId>@reply.<domaine>`**.

Le `matchId` donne, en une jointure : le candidat, la mission, l'organisation
— et le fil, quel que soit le sourceur qui répond ensuite. Les trois
identifications deviennent une seule lecture certaine.

Trois conséquences qui valent d'être dites :

- **Conflit 4 résolu par construction**, plus par heuristique.
- **Conflit 5 résolu** : une réponse appartient à la conversation du cabinet,
  pas à la boîte d'un salarié. Un départ ne perd plus rien.
- **Un collègue qui reprend un fil** réutilise la même adresse de réponse. Le
  candidat garde un seul fil ; côté Naywa aussi.

**Repli obligatoire** : les messages déjà envoyés ne portent pas le suffixe.
Sans `+`, on retombe sur la règle actuelle. Le repli n'est pas une politesse,
c'est ce qui évite de perdre les réponses en vol le jour du déploiement.

⚠️ **À prouver avant de coder** : que le `+` survive à la règle de réception
SES et à `ensureInboxAddress`. Un envoi réel tranche en dix minutes. Si le `+`
posait problème, la solution de repli est un préfixe
(`m<matchId>.inbox@…`) — même principe, aucune dépendance au sous-adressage.

---

## 8. Les sept conflits, et leur réponse

| # | Réponse | Coût |
|---|---|---|
| 1 | Bandeau 🟡, rédaction ouverte | Une requête, un composant |
| 2 | Bandeau 🟠 + mention de l'interlocuteur dans la zone de rédaction | Même requête |
| 3 | `handled_at` / `handled_by` + « Pris en charge par X » dans Réponses | Migration + un bouton |
| 4 | Sous-adressage par `matchId` | §7 |
| 5 | Idem — la conversation appartient au cabinet | §7 |
| 6 | État 5 de l'échelle : blocage **avant** rédaction | Lecture `email_suppressions` |
| 7 | État 6 : message nommant le **cabinet** et l'heure de remise à zéro | Une phrase |

Aucune de ces réponses n'est une fonctionnalité vendable. Ensemble, elles font
la différence entre un outil qu'un cabinet de trois personnes adopte et un
outil qu'il abandonne au bout de trois semaines sans savoir dire pourquoi.

---

## 9. Ce qui est construit (02/09, commit `137bb3f`)

Lots 1 et 3 livrés, branche `claude/mailing-from-address`, en attente de
validation en preview. tsc + eslint propres, 287 tests (23 neufs).

- `lib/mailing/readiness.ts` — l'échelle d'états du §5, fonction **pure** : la
  route rassemble les faits, ce fichier décide de l'ordre. Un ordre se teste,
  une suite de `if` dans une route non.
- `lib/mailing/contact-history.ts` — la mémoire, **dérivée** d'`email_messages`.
- `GET /api/mailing/readiness` — les deux ci-dessus, en une lecture, avant
  d'écrire. N'écrit rien : ne crée notamment pas l'adresse de réception.
- `OutreachReadiness` — le bandeau, au-dessus de la rédaction, qui disparaît
  avec elle quand c'est bloquant.
- `GET/POST /api/mailing/replies` + `RepliesSection` + `RepliesNavCount` —
  la surface 3, sur l'accueil, avec le compteur sur l'onglet.
- Migration **099** appliquée : `handled_at`/`handled_by` + les deux index.
- **Répondre marque la prise en charge**, sans rien demander. Un compteur qui
  ne descend jamais cesse d'être regardé — y compris le jour où il compte.

Reste du plan : le sous-adressage (lot 2), la section Messagerie (lot 4), le
consentement administrateur Microsoft (lot 5).

---

## 10. Ordre de construction

L'ordre suit le risque, pas la facilité.

1. **Bandeau de mémoire + échelle d'états** (surface 2). Le plus rentable :
   protège la crédibilité du cabinet devant le candidat, ne touche à aucun
   schéma, entièrement testable seul.
2. **Sous-adressage + repli.** Rend tout le reste fiable. À faire avant que
   du volume réel s'accumule sous l'ancien routage — la dette de rattachement
   ne se rattrape pas après coup.
3. **Réponses** (surface 3) + migration `handled_*`. Ferme la boucle
   quotidienne.
4. **Section Messagerie** (surface 1), dont le **rapatriement de l'éditeur de
   mention légale**, aujourd'hui inaccessible.
5. **Consentement administrateur Microsoft** : détecter `AADSTS65001` et
   afficher le lien à transmettre à l'informaticien, au lieu d'une erreur
   brute.

Puis seulement : **Domain Connect**, en parallèle des deux semaines de Mailing
offertes à GMH.

**Rien de tout ceci ne s'ouvre à GMH avant le badge d'éditeur Microsoft**
(consigne du 01/09). `MAILING_LAUNCHED = false` reste la vanne ;
`mailing_early_access` par organisation est le robinet qu'on ouvrira.

---

## 11. Ce qu'on ne fait pas, et pourquoi

- **Pas de scope de lecture**, ni `gmail.readonly` ni `Mail.Read`. Ce serait
  le moyen le plus rapide de capter 100 % des réponses, et le plus sûr de
  perdre la vérification qu'on vient d'obtenir.
- **Pas de messagerie complète.** « Réponses » est une liste, pas une boîte.
- **Pas de campagnes**, ni séquences, ni relances automatiques.
- **Pas de table `threads`.** Grouper par sujet couvre l'essentiel pour une
  fraction du travail. À rouvrir le jour où un cabinet aura vraiment plusieurs
  échanges parallèles sur une même mission.
- **Pas de boîte partagée Microsoft** (`recrutement@` en shared mailbox) :
  exigerait `Mail.Send.Shared`, délibérément non demandé. Un scope se paie en
  scrutin, chez Google comme chez Microsoft.
- **Pas de verrou d'édition concurrente.** Deux sourceurs rédigeant au même
  instant est un cas rare ; le bandeau de mémoire couvre le cas fréquent, qui
  est décalé de plusieurs jours.
