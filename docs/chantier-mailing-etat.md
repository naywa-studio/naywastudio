# Mailing depuis le domaine du client — état au 24 août 2026

Suite de `docs/chantier-mailing-domaine-client.md`, qui reste la spécification.
Ce document dit **où on en est**, **ce qui reste**, et surtout **pourquoi les
choses sont faites ainsi** — pour qu'on ne re-débatte pas d'arbitrages déjà
tranchés en conditions réelles.

**Tout est mergé sur `main` et déployé.** Migrations 085 à 089 en base.
170 tests. Le code est en production mais **fermé aux clients** : cf. le
garde-fou de lancement ci-dessous.

---

## ⚠️ ACCÈS PRODUCTION SES ACCORDÉ — 2026-08-26

AWS a **accordé** l'accès production sur le dossier `178726352900266`, à la
seconde demande : **50 000 messages/jour, 14/seconde, compte sorti du bac à
sable** en eu-west-1.

Ce qui a changé entre les deux demandes, et qui explique probablement le
retournement : la première décrivait quatre dispositifs qui **n'existaient
pas** (consommation SNS des rebonds, liste de suppression, désinscription,
alarmes). La seconde l'a **dit franchement**, et les trois premiers avaient
été construits entre-temps. La leçon vaut au-delà d'AWS : on ne décrit à un
fournisseur que ce qui est dans le code.

**Conséquence sur les priorités.** Après le refus, j'avais recommandé de
reléguer SES et de faire d'OAuth la fondation. **Cet arbitrage s'inverse.**
Le parcours domaine fonctionne désormais de bout en bout — envoi ET
réception — pour tout le monde, sans revue par client, sans consentement
d'administrateur, sans plafond de 100. OAuth redevient ce qu'il aurait dû
rester : le chemin **sans DNS**, un confort d'adoption, pas un sauvetage.

**Les deux conditions d'ouverture** consignées plus haut : la première est
levée. Reste le prix `mailing_addon` dans le catalogue LIVE (9,99 €,
arbitré par Elyas).


---

## Le fournisseur : Amazon SES

Retenu après comparatif, sur des **critères durs, pas sur le prix** :

- **Postmark et Mailgun interdisent l'outreach** et suspendent les comptes qui
  en font. Ils sanctionnent une CATÉGORIE d'usage — précisément la nôtre.
- **Scaleway TEM ne sait pas recevoir** : MX « blackhole » qui accepte et jette.
- **Postmark n'héberge rien en Europe**, ce qui contredit la migration R2-EU.

SES sanctionne des **chiffres** (rebonds > 5 %, plaintes > 0,1 %), pas une
catégorie. Et il ne facture **rien au domaine**, là où les concurrents à
paliers rendaient l'add-on déficitaire dès le 1ᵉʳ ou 2ᵉ client.

**MailerSend reste le plan de secours** — d'où l'interface à quatre fonctions
dans `lib/mailing/provider.ts` : changer de fournisseur = un fichier.

---

## Ce qui est prouvé en conditions réelles

| Maillon | Preuve |
|---|---|
| Envoi depuis le domaine du cabinet | `dkim=pass` + `dmarc=pass` sur un vrai message |
| Chaîne complète | déclarer → basculer l'adresse → écrire → recevoir la réponse, en une traite |
| Rattachement | bon candidat ET bonne mission, `sentiment: interested`, étape suggérée `interview` |
| Réception d'un gros message | 1 141 Ko, **7×** le plafond de la voie SNS directe |
| Pièce jointe | 847 Ko sur R2, chemin org-scopé, nom assaini |
| **Zone Route 53** | créée → 4 enregistrements écrits → **supprimée**, zéro résidu |
| Suppression à la résiliation | `deleteZone` branché sur les DEUX crons de wipe |
| Retrait propre | adresses rebasculées, anciennes archivées en alias |

### Les défauts que SEUL le test réel a trouvés

Aucun n'était visible en relecture — tests verts, `tsc` et `eslint` propres :

1. **`inboxDomainFor` ignorait le bypass admin** → envoi depuis le domaine du
   cabinet avec un `Reply-To` chez Naywa. Faux positif garanti.
2. **Le jeu de configuration SES n'était créé nulle part**, alors que son nom
   partait à chaque envoi → SES rejetait tout.
3. **L'index unique PARTIEL de la 088 bloquait toute réception** — `ON CONFLICT`
   ne sait pas inférer depuis un index partiel.
4. **Un cron horaire faisait échouer TOUS les déploiements.** Le plan Vercel
   Hobby refuse au BUILD toute expression plus fréquente qu'une fois par jour.
   Dix-sept heures sans rien livrer, dont une fusion sur `main`.
5. **Déléguer la zone d'un domaine déjà vérifié la créait VIDE.** Publier les NS
   aurait fait tomber un domaine qui marchait.
6. **La zone gérée n'était offerte que pendant la mise en route**, donc jamais
   au client déjà configuré à la main — celui qui en a le plus besoin.

---

## L'audit du 24/08 — trois trous, tous corrigés

Fait à la demande d'Elyas, après coup, sur du code déjà en production.

1. **Le plafond d'envoi n'existait pas.** La demande d'accès production
   déposée chez AWS dit : « We enforce a per-customer daily sending cap in
   our application. » Le seul plafond du code était
   `DAILY_LIMITS.send = 10 000` par utilisateur — autrement dit aucun.
   Au-delà de l'exactitude vis-à-vis d'AWS : la réputation SES est celle du
   COMPTE, donc un seul cabinet qui déborde fait suspendre tous les autres.
   → `lib/mailing/send-cap.ts`, plafond par ORGANISATION (60/siège,
   plancher 60). Par organisation et non par utilisateur : c'est l'unité que
   SES mesure, et un plafond par utilisateur se contourne en ajoutant des
   sièges. Compte les lignes `email_messages` plutôt qu'un compteur, qui se
   désynchronise. **Laisse passer si la lecture échoue** — c'est un garde-fou
   de réputation, pas un contrôle d'accès.

2. **L'analyse des réponses n'avait aucun quota.** Chaque email entrant
   déclenchait un appel au modèle. Or l'adresse de réception d'un sourceur
   est publique par construction : elle figure dans chaque message envoyé à
   un candidat. → imputée à l'organisation. Quota épuisé = pas d'analyse,
   **mais le message est conservé**.

3. **Les options survivaient à l'impayé.** `subscription_has_pricing` et
   `subscription_has_mailing` restent à `true` quand un paiement échoue
   (le webhook pose le verrouillage sans démonter les lignes d'abo). Une org
   en défaut gardait donc son option — et pouvait nous faire créer une zone
   Route 53 facturée. → corrigé dans **les deux** fonctions d'un seul geste ;
   les séparer aurait recréé l'écart. 14 tests écrits en boucle sur les deux,
   pour qu'un futur écart casse la suite.

---

## 🔒 Le garde-fou de lancement

`lib/mailing/rollout.ts` → **`MAILING_LAUNCHED = false`**.

Trois portes, une seule ouverte à tous le jour venu :
le drapeau général (fermé), **les admins Naywa**, et **les organisations
`is_test`** — cette dernière pour éprouver le parcours EXACTEMENT comme un
client, sans bypass. Un admin ne teste jamais ce que vit un client : il
contourne les gardes qu'on cherche à vérifier.

Appliqué **côté serveur** autant que côté client : masquer sans fermer la
route laisserait la fonctionnalité atteignable par un appel direct.

**Ouvrir = passer ce drapeau à `true`**, une fois les DEUX conditions remplies :

1. **Accès production SES accordé.** En bac à sable, une org en essai pourrait
   publier son DNS, faire vérifier son domaine, et découvrir que chaque envoi
   échoue. Le travail DNS fait pour rien, c'est la meilleure façon de ne jamais
   le refaire.
2. **Prix `mailing_addon` créé dans le catalogue LIVE.** Sinon GMH — le seul
   client payant — verrait un interrupteur dont le clic répond « Modification
   impossible ». Proposer puis refuser est pire que ne rien proposer.

---

## 🔴 Ce qui reste

### Décisions (hors code)

- **Le prix de l'add-on.** `MAILING_ADDON_EUR = 9,99 €` est une valeur par
  défaut, pas un arbitrage. ⚠️ La changer APRÈS création du prix LIVE ne change
  rien à ce qui est facturé : seul l'affichage bougerait, et les deux
  divergeraient en silence. **Trancher avant.**
- **Accès production SES** — dossier `178726352900266`, sans réponse depuis le
  21/08.

### AWS — ✅ fait le 24/08

- **`naywa-mailing-alerte`** : budget mensuel 5 $, alertes à 85 %, 100 % et
  sur prévision, vers `elyas.malki@naywastudio.com`.
- **`expire-inbound-30j`** sur `naywa-inbound-email-eu` : portée limitée au
  préfixe `inbound/`, expiration à 30 j, aucune autre action.

### Code

- **Domain Connect.** ⚠️ **Correction d'une erreur que j'avais dite** : Cloudflare
  le SUPPORTE, contrairement à ce que j'ai affirmé. La liste officielle compte
  ~20 hébergeurs dont GoDaddy, IONOS, **Cloudflare**, Squarespace. OVH et Gandi :
  aucune trace de support. La couverture est donc meilleure qu'annoncé.
- **Domaine géré par Naywa** (lot 5) — pour les cabinets sans domaine.
- **Le parcours client n'a jamais été vécu SANS privilège.** Tout a été
  éprouvé en admin, qui contourne précisément les gardes qu'on veut vérifier.
  La troisième porte (`is_test`) le rend possible, mais il faut un domaine
  qui ne soit pas `naywastudio.com` — refusé aux non-admins, à dessein.
  ⏸️ En attente d'un domaine prêté par un tiers.

---

## Prochaine session — l'ordre convenu

Du certain vers l'incertain, en attendant SES et le prix :

1. **L'adresse d'expéditeur.** `careers@careers.cabinet-durand.fr` — le mot
   répété. C'est ce que voit CHAQUE candidat, et c'est précisément ce que
   l'add-on vend. Laisser le cabinet choisir sa partie locale
   (`recrutement@`, `contact@`, son prénom) avec un défaut propre.
   Ne dépend d'aucun blocage.
2. **Accessibilité de `/mailing-setup`** — le SEUL écran de Naywa ouvert à
   quelqu'un qu'on ne connaît pas, sur un poste qu'on ne contrôle pas.
   Ailleurs les utilisateurs sont des sourceurs équipés ; là, non.
3. **Passe visuelle courte** sur les écrans mailing — corriger ce qu'on sait
   faux, pas ce qu'on imagine perfectible : aucun client ne les a utilisés.

**Écarté, et pourquoi** : Domain Connect. Intestable aujourd'hui (il faudrait
un domaine chez un hébergeur compatible, et rien ne part tant que SES est en
bac à sable). Le squelette d'une intégration non éprouvée n'est pas un acquis,
c'est une dette qui en a l'air. À reprendre quand SES sera ouvert.

---

## Ressources AWS (région `eu-west-1`, sauf Route 53 qui est global)

> ⚠️ **Ce dépôt est PUBLIC** — Vercel Hobby refuse de déployer un dépôt privé
> appartenant à une organisation GitHub, donc le passer en privé coûterait un
> plan Pro. Aucune clé n'y figure (vérifié : aucun `.env` réel suivi, ni
> maintenant ni dans l'historique), mais on n'y écrit pas non plus le numéro de
> compte AWS ni les ARN complets : ils n'ouvrent rien, et servent quand même à
> cibler un compte précis. Les valeurs réelles se lisent dans la console AWS et
> dans les variables Vercel.

| Ressource | Où la trouver |
|---|---|
| Compte AWS | Console AWS, en haut à droite |
| Identité domaine | SES → Identités (`careers-test.naywastudio.com` pour les tests) |
| Rubrique SNS entrante | `AWS_SNS_INBOUND_TOPIC_ARN` |
| Rubrique SNS événements | `AWS_SNS_EVENTS_TOPIC_ARN` (rebonds, plaintes, remises) |
| Bucket S3 | `AWS_SES_INBOUND_BUCKET`, préfixe `inbound/` |
| Jeu de règles SES | `naywa-inbound` — actif |
| IAM | utilisateur `naywa-mailing` + ses politiques attachées |

`naywa-mailing-policy` **v2** ajoute `route53:ListResourceRecordSets` — c'est
elle qui permet de VIDER une zone avant suppression, Route 53 refusant de
supprimer une zone non vide. Sans elle, chaque zone de client parti resterait
facturée 0,50 $/mois, indéfiniment et sans trace.

```
AWS_SES_ACCESS_KEY_ID · AWS_SES_SECRET_ACCESS_KEY
AWS_SES_REGION = eu-west-1 · AWS_SNS_INBOUND_TOPIC_ARN
```

⚠️ **Les 3 MX Lark du domaine racine portent la messagerie professionnelle.**
Ne jamais y toucher.

---

## Trois règles à ne pas perdre

**`mail.naywastudio.com` ne doit PAS être débranché.** Il porte le SMTP de
Supabase (inscriptions, mots de passe), le contact et le support. Seul
l'outreach CANDIDAT bascule. La spec d'origine dit « à nettoyer » : cette
phrase ne vaut que pour l'envoi candidat.

**Une option se câble sur QUATRE maillons** : envoi client, lecture serveur,
sauvegarde, rendu. Leçon payée sur `keepCandidateSummary`, livrée avec trois
maillons sur quatre cassés.

**Du socle correct mais injoignable, ça arrive trois fois par chantier.** La
route d'envoi sans bouton, la carte de domaine sans écran, le retrait sans
appelant. À chaque fonction écrite, se demander qui l'appelle — et si la
réponse est « personne », ce n'est pas fini.
