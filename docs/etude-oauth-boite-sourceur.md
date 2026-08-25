# Envoyer depuis la boîte du sourceur — étude

> Étude du **2026-08-25**, après le refus d'accès production SES et l'objection
> d'Elyas : *« un sourceur ne peut pas envoyer des mails depuis sa boîte ?
> C'est contradictoire avec le métier. »*
>
> À lire avec `docs/etude-fournisseur-mailing.md`, dont elle est la suite.

---

## 1. Ce que ça résout — et ce que ça ne résout PAS

C'est le point central de l'étude, et il faut le poser avant les détails
techniques, parce qu'il décide de tout le reste.

**Ce que ça résout : l'ENVOI.**

- Plus aucune politique d'usage à subir. C'est sa boîte, son domaine, son
  envoi — le refus d'AWS devient sans objet.
- Délivrabilité réelle : un domaine et une réputation déjà établis, au lieu
  d'un sous-domaine neuf qu'il faut chauffer pendant des semaines.
- **Zéro DNS.** Aucun enregistrement à publier, aucune délégation de zone.
- Le message atterrit dans ses **Éléments envoyés**, là où il s'attend à le
  trouver.
- **Aucun coût d'envoi pour Naywa.**

**Ce que ça ne résout PAS : la RÉCEPTION.**

Sans accès en lecture à sa boîte — et on n'en veut pas, c'est le scope
*Restricted* à 15 000-75 000 $/an — une réponse de candidat arrive dans SA
messagerie et nous ne la voyons jamais. Or le fil de conversation, l'analyse
de Nora, le passage automatique en « Contacté » : tout repose sur le fait que
la réponse nous parvienne.

**La solution est le `Reply-To`**, et elle impose un arbitrage :

| Adresse de réponse | Configuration client | Ce que voit le candidat |
|---|---|---|
| `sophie@mail.naywastudio.com` | **aucune** | Expéditeur au nom du cabinet, réponse vers un domaine Naywa |
| `sophie@careers.cabinet.fr` | les enregistrements DNS qu'on a déjà construits | Tout au nom du cabinet |

Autrement dit : **OAuth ne remplace pas le travail sur le domaine, il le rend
facultatif.** Zéro configuration pour qui accepte une adresse de réponse chez
Naywa ; le parcours DNS reste offert à qui veut la cohérence complète. C'est
une meilleure histoire produit que celle qu'on avait — mais ce n'est pas
« OAuth à la place de tout », et il ne faut pas se raconter le contraire.

---

## 2. Google — le scope, la vérification, les jetons

### Le scope, et pourquoi il ne coûte rien

`https://www.googleapis.com/auth/gmail.send` est classé **Sensitive**, pas
*Restricted* — c'est écrit dans la documentation Google des scopes Gmail.
Conséquence directe : **vérification OAuth standard, sans évaluation de
sécurité CASA**. CASA ne concerne que les scopes *Restricted*
(`gmail.readonly`, `gmail.modify`, `mail.google.com`) et coûte de 15 000 à
75 000 $ par an, en se renouvelant chaque année.

⚠️ **Ne jamais demander de scope de lecture.** C'est la seule ligne à ne pas
franchir : elle multiplierait le coût du projet par cent. Toute idée du type
« afficher sa boîte », « retrouver le fil dans Gmail », « poser un libellé »
tombe dans *Restricted*.

### La vérification

Ce qu'il faut fournir : conformité déclarée, domaine dont on prouve la
propriété, page d'accueil et politique de confidentialité publiques
expliquant l'usage du scope, et **une vidéo montrant le parcours de bout en
bout** — écran de consentement compris, avec le même nom et la même marque
que ceux déclarés.

**Délai** : Google annonce une dizaine de jours pour un dossier complet ; le
retour de terrain donne plutôt **2 à 4 semaines**, les allers-retours étant
ce qui coûte le plus. Naywa a déjà tout le matériel (site, politique de
confidentialité, domaine vérifié) — c'est un dossier, pas un chantier.

**Coût** : nul.

### Le piège des jetons — celui qui fait perdre une semaine

Tant que l'application est en statut **« Testing »**, **tous les jetons de
rafraîchissement expirent au bout de 7 jours.** On croit alors avoir un bug
de gestion de jetons ; il n'y en a pas, c'est le statut.

En **production** (donc après vérification), ils sont valables
indéfiniment, sauf : inutilisés 6 mois, révoqués par l'utilisateur, plus de
50 jetons pour le même couple, l'app perd sa vérification — **ou changement
de mot de passe du compte Google**, qui invalide spécifiquement les jetons
portant des scopes Gmail.

→ Ce dernier point est à traiter dans le produit : un jeton peut mourir sans
prévenir, et le sourceur doit voir « reconnectez votre boîte », pas un envoi
qui échoue.

### Volumes

Google Workspace : **2 000 destinataires par jour** en rythme glissant.
Compte Gmail gratuit : 500. Les alias et adresses « Envoyer en tant que »
**partagent le quota du compte** — en faire tourner n'en crée pas.

Notre plafond maison est de **60 par siège et par jour** : on est à 3 % de la
limite Workspace. Le volume n'est pas un sujet.

### Alias

Gmail sait envoyer « en tant que » un alias vérifié du compte. Un cabinet peut
donc écrire depuis `recrutement@cabinet-durand.fr` sans acheter de siège :
**les alias Google Workspace sont gratuits** (jusqu'à 30 par utilisateur), et
en Microsoft 365 une **boîte partagée est gratuite** aussi.

→ Ça répond à la question d'Elyas : non, le client n'a rien à acheter.

---

## 3. Microsoft — plus simple techniquement, plus lourd administrativement

### La permission

`Mail.Send` en **permission déléguée**, via Microsoft Graph. Elle est
consentable par l'utilisateur lui-même, sur compte professionnel comme
personnel, et le message est enregistré dans les **Éléments envoyés**. Pas
d'équivalent de CASA, pas de vidéo à tourner.

### Mais la vérification d'éditeur est un vrai obstacle

J'avais dit « quelques jours ». C'est plus compliqué que ça, et c'est la
principale mauvaise nouvelle de cette étude.

Pour être « éditeur vérifié », il faut un **Partner One ID** d'un compte
**Microsoft Cloud Partner Program** vérifié, qui doit être le *partner global
account* de l'organisation — un identifiant de site ne suffit pas. Il faut
aussi que le domaine de l'adresse utilisée corresponde au domaine d'éditeur
déclaré, une authentification multifacteur, et les bons rôles des deux côtés.

**Sans cette vérification**, l'écran de consentement affiche un avertissement
« éditeur non vérifié, cette application peut être risquée ». Et beaucoup de
tenants d'entreprise **bloquent purement le consentement** aux applications
non vérifiées : le cabinet ne pourrait pas connecter sa boîte, même en le
voulant.

→ Adhérer au programme partenaire est gratuit, mais c'est une démarche
administrative à lancer **tôt**, parce qu'elle ne dépend pas de nous.

---

## 4. Ce qu'il faudrait construire

Le code n'est pas le point dur. L'inventaire, honnêtement :

| Lot | Contenu | Ordre de grandeur |
|---|---|---|
| Connecteur Google | OAuth, échange de code, stockage chiffré du jeton, rafraîchissement | 1 j |
| Connecteur Microsoft | idem via Graph | 0,5 j |
| Envoi | un troisième cas dans la route d'envoi, derrière l'interface existante | 0,5 j |
| Écran « Ma boîte » | connecter, état, reconnecter, déconnecter | 1 j |
| Jeton mort | détection, bandeau, blocage propre de l'envoi | 0,5 j |
| Dossier Google | vidéo, justification, page publique | 0,5 j |

**≈ 4 jours de développement**, plus 2 à 4 semaines de délai Google qui
tournent en parallèle, plus la démarche partenaire Microsoft.

Ce qui **ne change pas** : le fil de conversation, la rédaction assistée, les
suggestions de Nora, le rattachement des réponses, les plafonds, la liste de
suppression, la désinscription, le pipeline. Tout est indépendant du
transport — c'est exactement ce pour quoi l'interface `MailingProvider` avait
été écrite.

---

## 5. Les risques, sans enjoliver

**Google peut refuser la vérification.** Rien ne le garantit, et le motif
serait probablement aussi peu détaillé que celui d'AWS.

**Un jeton meurt sans prévenir** — changement de mot de passe, révocation,
politique du tenant. Il faut que ça se voie tout de suite dans le produit,
sinon le sourceur croit envoyer alors que rien ne part.

**La réputation devient celle du client.** C'est un avantage (elle est déjà
établie) et un risque : si un cabinet envoie n'importe quoi, c'est SON domaine
qui trinque. Notre plafond de 60 par siège reste donc utile.

**Le tenant peut bloquer.** Un client Microsoft dont l'administrateur
interdit le consentement aux applications tierces ne pourra pas connecter sa
boîte, quoi qu'on fasse.

**Ça ne couvre pas tout le monde.** Un cabinet chez OVH, Gandi, IONOS,
Infomaniak ou Zoho n'a pas d'OAuth. Pour eux : SMTP avec mot de passe
d'application — qui reste vivant chez ces hébergeurs, contrairement à
Microsoft qui le désactive par défaut en décembre 2026 et le supprime en 2027.

---

## 6. Recommandation

**Commencer par Microsoft, et lancer la démarche Google en parallèle.**

C'est l'ordre qu'Elyas avait proposé, et l'étude le confirme pour une raison
qu'on ne soupçonnait pas : le délai Google est de 2 à 4 semaines et ne dépend
pas de nous. Autant le faire courir dès maintenant pendant qu'on livre l'autre.

Et le premier client payant — GMH — est sous Microsoft.

**Trois choses à lancer tout de suite**, parce qu'elles sont administratives
et lentes :

1. La démarche **Microsoft Cloud Partner Program**, pour le Partner One ID.
2. Le dossier de **vérification OAuth Google** (vidéo + justification).
3. Passer l'application Google **en production** dès la vérification obtenue —
   sinon les jetons meurent tous les 7 jours et on cherchera un bug qui
   n'existe pas.

**Ce qu'on ne fait pas** : demander un scope de lecture Gmail. C'est la seule
décision irréversible du lot, et elle multiplierait le coût par cent.

---

---

## 7. Ce qui est déjà en place (2026-08-25)

Le projet Google Cloud existe. Ce qui suit a été fait et **vérifié dans la
console**, pas supposé :

| Élément | Valeur |
|---|---|
| Projet | `naywa-studio` |
| API Gmail | activée |
| Écran de consentement | nom « Naywa Studio », type **Externe** |
| Adresse de support | le Gmail personnel d'Elyas — **choix assumé**, cf. ci-dessous |
| Contact développeur | `elyas.malki@naywastudio.com` (jamais montré aux utilisateurs) |
| Client OAuth | « Naywa Studio - Web » → `GOOGLE_OAUTH_CLIENT_ID` |
| Origine autorisée | `https://naywastudio.com` |
| **URI de redirection** | `https://naywastudio.com/api/mailing/oauth/google/callback` |
| Scope déclaré | `gmail.send`, **classé « sensible »** |

⚠️ **L'URI de redirection est figée côté Google.** Le connecteur devra exposer
exactement cette route — un autre chemin ferait échouer le consentement avec
une erreur qui ne dit pas laquelle des deux valeurs est fausse.

**Le point le plus important de ce tableau** : `gmail.send` apparaît bien dans
« Vos champs d'application **sensibles** », et non dans « restreints ».
Confirmé sur le projet réel. C'est ce qui garantit une vérification standard
et gratuite plutôt qu'une évaluation CASA à 15 000-75 000 $/an — toute
l'économie de cette piste tient à cette ligne.

**L'adresse de support restera visible** des clients sur l'écran de
consentement. Elle est aujourd'hui personnelle faute de compte Google sur
`naywastudio.com` — la création a buté sur une limite anti-abus du numéro de
téléphone d'Elyas, saturé par ses autres comptes. Ce n'est **pas** un motif de
refus de vérification ; c'est un défaut d'image, corrigeable plus tard par un
abonnement Workspace à quelques euros (⚠️ sans jamais changer les MX, la
messagerie restant chez Lark).

**Le secret client n'a jamais été relevé** : il se copie de la console vers
Vercel directement, sous `GOOGLE_OAUTH_CLIENT_SECRET`.

---

## Sources

- [Google — Gmail API scopes (gmail.send = Sensitive)](https://developers.google.com/gmail/api/auth/scopes)
- [Google — Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [Google — Restricted scope verification (CASA)](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- [Google Workspace — Gmail sending limits](https://support.google.com/a/answer/166852)
- [Microsoft — Publisher verification overview](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)
- [Microsoft Graph — permissions reference (Mail.Send)](https://learn.microsoft.com/en-us/graph/permissions-reference)
- [Nylas — Google OAuth verification: costs and timelines](https://www.nylas.com/blog/google-oauth-app-verification/)
- [Unipile — Google OAuth refresh token: the 7-day limit](https://www.unipile.com/google-oauth-refresh-token/)
