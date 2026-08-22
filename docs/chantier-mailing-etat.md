# Mailing depuis le domaine du client — état au 23 août 2026

Suite de `docs/chantier-mailing-domaine-client.md`, qui reste la spécification.
Ce document dit **où on en est** et **ce qui reste ouvert**.

Branches : `claude/mailing-lot-0` et `claude/mailing-lot-1`. **Aucune n'est
mergée.** Migrations 085 à 089 **appliquées en base**.

> **La chaîne complète a tourné de bout en bout le 23/08** — cf. « Prouvé en
> conditions réelles » ci-dessous.

---

## Le fournisseur retenu : Amazon SES

Décision prise après un comparatif réel, et deux éliminations **sur des
critères durs, pas sur le prix** :

- **Postmark et Mailgun interdisent l'outreach** et suspendent les comptes qui
  en font. Ils sanctionnent une CATÉGORIE d'usage. Naywa contacte des candidats
  qui n'ont rien demandé : c'est précisément ce qu'ils bannissent.
- **Scaleway TEM ne sait pas recevoir** — il pose un MX « blackhole » qui
  accepte le courrier et le jette. Incompatible avec les réponses candidats.
- **Postmark n'héberge aucune donnée en Europe** et n'a pas de projet d'en
  avoir, ce qui contredit la migration R2-EU.

SES sanctionne des **chiffres** (rebonds > 5 %, plaintes > 0,1 %), pas une
catégorie — c'est ce qui le rend compatible. Et il ne facture **rien au
domaine**, là où les concurrents à paliers rendaient l'add-on déficitaire dès
le 1ᵉʳ ou 2ᵉ client.

**MailerSend reste le plan de secours** (UE, réception native, API simple),
d'où l'interface fine : changer de fournisseur = un fichier.

---

## Prouvé en conditions réelles

| Maillon | Preuve |
|---|---|
| Envoi depuis le domaine du cabinet | `dkim=pass header.i=@careers-test.naywastudio.com` + `dmarc=pass` sur un vrai message reçu |
| Lecture de l'état d'un domaine | route de diagnostic, `status: active` |
| Réception — signature SNS + contrôle de rubrique | abonnement auto-confirmé, journaux Vercel |
| Réception — email réel | 1 141 Ko, dépassant **7×** le plafond de 150 Ko de la voie SNS directe |
| Lecture du contenu depuis S3 | accents intacts (`Test éé é`) |
| Rattachement au sourceur | ligne écrite dans `email_messages` |
| Pièce jointe stockée sur R2 | 847 Ko, chemin org-scopé, nom assaini |
| **CHAÎNE COMPLÈTE (23/08)** | déclarer → basculer l'adresse → écrire → recevoir la réponse, en une seule traite |

### La chaîne complète, le 23 août 2026

Le message sortant porte un identifiant SES (`010201a02bc36b2d-…`), pas un
UUID Resend : la preuve que le chemin emprunté est bien le nouveau.

La réponse est revenue sur `elyas@careers-test.naywastudio.com` — donc le
`Reply-To` a été suivi — rattachée au bon candidat ET à la bonne mission, avec
`sentiment: interested`, `étape suggérée: interview` et un résumé exact. Le
pipeline était déjà passé en `contacted` à l'envoi.

**Quatre défauts trouvés par ce seul test, aucun par relecture :**

1. `inboxDomainFor` ignorait le bypass admin → aurait envoyé depuis le domaine
   du cabinet avec un `Reply-To` chez Naywa. **Faux positif garanti.**
2. Les adresses ne basculaient pas quand le domaine ressortait `active` dès la
   déclaration.
3. **Le jeu de configuration SES n'était créé nulle part** alors que son nom
   était passé à chaque envoi → SES rejetait tout.
4. **L'index unique PARTIEL de la 088 bloquait toute réception** (`ON CONFLICT`
   ne sait pas inférer depuis un index partiel). Corrigé par la 089.

---

## ✅ Fermé depuis — adresse de réception au domaine de l'org

Le point qui manquait au lot 1 est écrit (migration **087**).

- `ensureInboxAddress` vit désormais dans `lib/mailing/inbox-address.ts` et
  dérive son domaine de l'organisation via `inboxDomainFor`, adossé à
  `canSendFromOrgDomain` — pas à une règle maison, pour que recevoir et
  envoyer ne puissent pas diverger.
- **La bascule garde la partie locale** (`sophie@` reste `sophie@`) et
  **archive l'ancienne adresse** dans `profiles.inbox_aliases`. Sans ça,
  l'activation ferait tomber toutes les réponses en cours dans « destinataire
  inconnu » — un échec parfaitement muet, que le sourceur lirait comme un
  candidat qui ne répond pas.
- `resolveInboundRouting` cherche l'adresse courante **puis les alias**.
- Une adresse abandonnée n'est jamais réattribuée à un collègue : ce serait
  une fuite de fil entre deux membres, pire qu'une réponse perdue.
- La route `/api/inbound-email` (Resend) **utilise enfin** `resolveInboundRouting`
  au lieu de sa copie — la divergence que son propre commentaire annonçait.
- Index unique sur `inbox_address` : deux sourceurs partageant une adresse
  rendraient le rattachement ambigu.

`POST /api/cv/[id]/send` route maintenant sur `sendCandidateEmail` dès que le
domaine du cabinet est prêt, et sur Resend sinon. Le `Bcc` de courtoisie
(`inbox_cc_self`) a été porté sur le chemin SES — un réglage coché par
l'utilisateur qui aurait disparu sans bruit à l'activation.

18 tests dédiés (`inbox-address.test.ts`), 107 au total.

---

## ✅ Fermé depuis — activation, analyse partagée, signature

**Le chemin d'écriture existe** (`createSendingDomain` n'était jamais appelé) :

- `POST /api/mailing/domain` déclare le domaine, `GET` lit son état,
  `POST /api/mailing/domain/verify` constate la publication DNS. **Seule la
  vérification peut accorder `active`**, et seulement sur la réponse du
  fournisseur : un `active` posé sans clés DKIM ferait partir des emails non
  authentifiés sous la marque du cabinet, sans que personne ne voie d'erreur.
- Gate : option acquise **et** `canBranding` — le domaine d'envoi est une
  identité de marque, il suit la même délégation que le nom et le logo.
- Remplacer un domaine déjà actif exige `confirm_replace` : les candidats en
  cours écrivent encore à l'ancien.
- `lib/mailing/domain-input.ts` valide la saisie (tolérant au copier-coller
  d'URL, strict sur le résultat) et **refuse `naywastudio.com`** — un client ne
  revendique pas notre identité.
- Au passage à `active`, les adresses de réception de tous les membres
  basculent (best-effort : un échec ne doit pas annuler une étape DNS que le
  client vient de franchir).

**Divergence trouvée en chemin, et fermée** : `analyzeReply` n'était appelé que
par la route Resend. Une réponse arrivée sur le domaine du cabinet repartait
donc **sans sentiment, sans résumé, sans étape suggérée** — le sourceur aurait
vu ses suggestions cesser le jour de l'activation, sans explication. Extrait
dans `lib/mailing/analyze-reply.ts`, appelé par les deux chemins.

**Signature** : `stripSignature` coupe au délimiteur `-- ` ou après une formule
de politesse (gardée). Appliqué à **l'analyse seulement** — la signature d'un
candidat contient son téléphone et son poste, information neuve que le sourceur
veut lire. C'est ce qui la distingue d'une citation, redondante partout.
Le découpage est fait DANS `analyzeReply`, pour qu'aucun appelant ne l'oublie.

**Doublons SNS** : AWS abandonne une livraison HTTPS au bout d'une quinzaine de
secondes et retente. Avec un CV volumineux et un modèle lent, la même réponse
aurait pu s'afficher deux fois. Migration **088** (unique partiel sur
`provider_id`) + insertion idempotente, et le message est désormais **écrit
avant** l'analyse : la réponse du candidat est la seule chose irremplaçable ici.

---

## ✅ Fermé depuis — l'écran de mise en route

`MailingDomainCard` dans la section **Identité et branding** de `/organisation`
(le domaine d'envoi s'affiche sur chaque message reçu par un candidat, au même
titre que le nom et le logo : même endroit, même délégation).

Trois partis pris, tous dictés par le fait que **publier du DNS est l'étape où
les gens abandonnent** — difficulté de confiance, pas de technique :
un enregistrement par ligne copiable en un clic (un jeton DKIM retapé produit
une faute, et une faute produit une vérification qui échoue sans dire pourquoi) ;
l'état toujours affiché, y compris « en attente » (ne rien montrer entre la
publication et la vérification fait croire à une panne et envoie au support) ;
et jamais de promesse que c'est prêt — l'écran ne fait que rapporter la réponse
du fournisseur.

**Exception admin** sur `checkRootDomain` : un admin Naywa peut déclarer un
sous-domaine de `naywastudio.com`, pour éprouver la chaîne sans acheter un
second domaine. `mail.naywastudio.com` et la racine restent interdits **à tout
le monde** — le premier porte le SMTP de Supabase, le détourner couperait
l'authentification de tous les utilisateurs.

---

## Le plan d'origine, relu à l'aune de SES

Le plan en 7 lots a été écrit **quand on partait sur Resend**. Le comparatif a
fait basculer sur SES, ce qui rend une partie caduque — et l'ordre a changé en
cours de route, pour une raison qui reste valable : **la réception était
l'inconnue risquée**, on l'a donc traitée en premier plutôt qu'en dernier.

| Plan d'origine | Réalité |
|---|---|
| **Prép.** Compte AWS + IAM | ✅ compte `795364428552`, IAM `naywa-mailing` |
| **Prép.** Env vars `AWS_ROUTE53_*` | ⚠️ nommées `AWS_SES_*`. Route 53 pas encore utilisé — mêmes clés à réutiliser le moment venu |
| **Prép.** Ligne add-on Stripe LIVE | ❌ **jamais créée** — l'option n'est vendable à personne |
| **Prép.** Vérifier le palier Resend (10 domaines) | ⛔️ **caduc** — Resend ne porte plus les domaines clients. C'était le point qui tuait la marge |
| **Prép.** Trancher prix + propriété du domaine géré | ❌ non tranché |
| **Lot 0** Migration `mailing_*` | ✅ 085 |
| **Lot 0** `subscription_has_mailing` + webhook | ✅ colonne + lecture au webhook (mais aucun prix à lire) |
| **Lot 0** Helper `canMailing` + gating | ✅ **scindé en deux** : `hasMailingAccess` (a-t-il payé ?) et `canSendFromOrgDomain` (son domaine est-il prêt ?). Les confondre laissait passer des envois non authentifiés |
| **Lot 1** Créer domaine + records + verify | ✅ les 3 fonctions du fournisseur + les routes |
| **Lot 1** Poll du statut | ❌ pas de cron — la vérification est manuelle |
| **Lot 1** Envoi sur le domaine d'org, bloqué si non actif | ✅ `sendCandidateEmail`, branché sur `/api/cv/[id]/send` |
| **Lot 1** `ensureInboxAddress` / `fromHeader` | ✅ migration 087, avec conservation des anciennes adresses |
| **Lot 1** **Test bout-en-bout** | ❌ **jamais fait — c'est la priorité** |
| **Lot 2** Route 53 : zone + records + NS | ❌ non commencé. Débloque les lots 3, 4 et 5 |
| **Lot 3** Détection registrar | ❌ |
| **Lot 3** UI deux portes | ⚠️ **une seule porte** : le copier-coller manuel (`MailingDomainCard`). Fait en avance parce que la fonctionnalité était injoignable |
| **Lot 3** Délégation par email tokenisée | ❌ colonnes prêtes (`mailing_delegate_*`), aucun code |
| **Lot 4** Domain Connect | ❌ |
| **Lot 5** Domaine géré Naywa | ❌ |
| **Lot 6** Réception par domaine client | ✅ **fait en avance** — SNS + S3, prouvé sur un email réel de 1 141 Ko |
| **Lot 6** Cron de vérification des domaines en attente | ❌ |
| **Lot 6** Déprovisionnement (résiliation / suppression org) | ❌ |
| **Lot 6** « Nettoyer le relais `mail.naywastudio.com` » | ⛔️ **révisé — à NE PAS faire.** Il porte le SMTP de Supabase. Seul l'outreach candidat bascule |

**Deux surprises hors plan, traitées** : l'analyse des réponses n'était câblée
que sur le chemin Resend (les suggestions auraient cessé le jour de
l'activation), et SNS retente au-delà de ~15 s (doublons possibles dans le fil).

---

## 🔴 Ouvert

### 1. L'add-on Stripe n'existe pas

Le webhook sait LIRE une ligne `mailing_addon`, mais **ce prix n'a jamais été
créé, aucune route ne le vend, aucun interrupteur ne l'active**.
`subscription_has_mailing` ne peut donc valoir `true` pour personne : la
fonctionnalité n'est atteignable qu'en essai (`hasMailingAccess` est vrai
pendant l'essai) ou en admin.

C'est mécanique — `/api/stripe/pricing-addon` fait exactement ça pour la Suite
Pricing et se recopie — mais tant que ce n'est pas fait, **l'option n'est pas
vendable**.

### 2. Pas de fil de conversation dans l.interface

Les réponses arrivent en base, **rien ne les affiche**. Le commit qui avait
retiré les surfaces mail (`8f7127d`) le disait : masquées « until the
multi-domain rework » — ce chantier-ci EST ce rework. Le composant annoncé
« gardé en arbre » n.existe nulle part dans l.historique : à écrire.

Sans lui, un sourceur voit partir ses messages et jamais revenir les réponses.

⚠️ **Accès production SES toujours en attente** : hors bac à sable, on ne peut
écrire qu'à des adresses vérifiées. La preuve de l'envoi réel en dépend.

### 3. Les parcours DNS assistés ne sont pas écrits

La spec en prévoyait trois — Domain Connect, délégation NS, domaine géré par
Naywa. Les colonnes existent (`mailing_path`, `mailing_dns_zone_id`,
`mailing_ns_records`, `mailing_delegate_email/token`), **aucun n'est
implémenté**. Ce qui est livré, c'est le copier-coller manuel.

C'est le vrai risque produit : la promesse « 0-config » n'est pas tenue, et
c'est précisément l'étape où un client non technique décroche. À traiter avant
d'élargir, pas après.

---

## ⚠️ À faire avant toute mise en production

**Retirer les deux routes de diagnostic** — elles sont marquées comme
temporaires dans leur en-tête :
- `app/api/admin/mailing/diagnose/route.ts`
- `app/api/admin/mailing/test-send/route.ts` ← **envoie de vrais emails**

**Remettre `profiles.inbox_address` à `null`** sur le profil
`6708fee5-3311-455c-bd7a-9d6aca147757` (Elyas, org « Naywa Studio », org de
test). Posée manuellement pour éprouver le rattachement ; tous les profils
étaient à `null` avant.

**Poser une règle de cycle de vie S3** sur `naywa-inbound-email-eu` (suppression
après ~30 j). Le code supprime déjà l'objet après traitement, mais un message
non traité resterait indéfiniment. Minimisation RGPD autant que ménage.

**Poser une alerte de facturation AWS** (~5 $). Compte neuf, services facturés
à l'usage.

---

## Ressources AWS en place (région `eu-west-1` — Irlande)

| Ressource | Valeur |
|---|---|
| Compte | `795364428552` |
| Identité domaine | `careers-test.naywastudio.com` — vérifiée |
| Identité email | `elyas.malki@naywastudio.com` — vérifiée (bac à sable) |
| Rubrique SNS | `arn:aws:sns:eu-west-1:795364428552:naywa-inbound-email` |
| Bucket S3 | `naywa-inbound-email-eu`, préfixe `inbound/` |
| Jeu de règles SES | `naywa-inbound` — **actif** |
| Utilisateur IAM | `naywa-mailing` + 2 politiques (SES/Route 53, puis S3) |
| MX | `careers-test` → `inbound-smtp.eu-west-1.amazonaws.com` |

**Accès production SES : en attente** (dossier `178726352900266`). Tant qu'il
n'est pas accordé, on ne peut écrire qu'à des adresses vérifiées.

⚠️ **Les 3 MX Lark du domaine racine portent la messagerie professionnelle.**
Ne jamais y toucher.

### Variables d'environnement (Vercel, Production + Preview)

```
AWS_SES_ACCESS_KEY_ID
AWS_SES_SECRET_ACCESS_KEY
AWS_SES_REGION = eu-west-1
AWS_SNS_INBOUND_TOPIC_ARN
```

L'abonnement SNS pointe sur l'**alias de branche** avec un jeton de
contournement Vercel en paramètre : les previews sont protégées par SSO
(`all_except_custom_domains`), donc AWS ne peut pas les atteindre autrement.

---

## Deux règles à ne pas perdre

**`mail.naywastudio.com` ne doit PAS être débranché.** Il porte le SMTP de
Supabase (confirmations d'inscription, réinitialisations de mot de passe), le
contact et le support. Seul l'outreach CANDIDAT bascule sur le domaine du
client. Le débrancher couperait l'authentification de tous les utilisateurs.
La spec d'origine dit « à nettoyer » : cette phrase ne vaut que pour l'envoi
candidat.

**Une option se câble sur QUATRE maillons** : envoi client, lecture serveur,
sauvegarde, rendu. Leçon payée cette semaine sur `keepCandidateSummary`, livrée
avec trois maillons sur quatre cassés — la case s'affichait, se cochait, et ne
faisait rien.
