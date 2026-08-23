# Mailing depuis le domaine du client — état au 23 août 2026

Suite de `docs/chantier-mailing-domaine-client.md`, qui reste la spécification.
Ce document dit **où on en est**, **ce qui reste**, et surtout **pourquoi les
choses sont faites ainsi** — pour qu'on ne re-débatte pas d'arbitrages déjà
tranchés en conditions réelles.

**Tout est mergé sur `main` et déployé.** Migrations 085 à 089 en base.
150 tests. Le code est en production mais **fermé aux clients** : cf. le
garde-fou de lancement ci-dessous.

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

### AWS (à faire à la console)

- **Alerte de facturation** (~5 $). Premier coût variable du chantier.
- **Règle de cycle de vie S3** sur `naywa-inbound-email-eu`, suppression à
  ~30 j. Le code supprime l'objet après traitement, mais un message non traité
  resterait indéfiniment. Minimisation RGPD autant que ménage.

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

## Ressources AWS (région `eu-west-1`, sauf Route 53 qui est global)

| Ressource | Valeur |
|---|---|
| Compte | `795364428552` |
| Identité domaine | `careers-test.naywastudio.com` |
| Rubrique SNS | `arn:aws:sns:eu-west-1:795364428552:naywa-inbound-email` |
| Bucket S3 | `naywa-inbound-email-eu`, préfixe `inbound/` |
| Jeu de règles SES | `naywa-inbound` — actif |
| IAM | `naywa-mailing` + `naywa-mailing-policy` (v2) + `naywa-inbound-s3-policy` |

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
