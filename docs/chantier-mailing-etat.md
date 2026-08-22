# Mailing depuis le domaine du client — état au 22 août 2026

Suite de `docs/chantier-mailing-domaine-client.md`, qui reste la spécification.
Ce document dit **où on en est** et **ce qui reste ouvert**.

Branches : `claude/mailing-lot-0` et `claude/mailing-lot-1`. **Aucune n'est
mergée.** Migrations 085 et 086 **appliquées en base**.

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

---

## 🔴 Ouvert — dans l'ordre de priorité

### 1. `ensureInboxAddress` n'utilise pas le domaine de l'org

**Point de la spec pour le lot 1, jamais écrit.** `lib/resend.ts` construit
encore les adresses avec la constante `MAIL_DOMAIN`. Quand un cabinet activera
son domaine, l'adresse de réception de ses sourceurs pointera toujours sur
Naywa — l'écart même que l'add-on doit supprimer.

Prévoir aussi la **régénération** des adresses existantes à l'activation.

### 2. La garde d'envoi n'a jamais tourné

`sendCandidateEmail` (option acquise ET domaine vérifié) n'existe qu'en tests
unitaires. La route de test d'envoi **court-circuite** cette garde en appelant
le fournisseur directement. Aucune organisation réelle n'est passée dedans.

### 3. `createSendingDomain` jamais exercé

On a lu l'état d'un domaine créé à la main dans la console. Le chemin
d'ÉCRITURE n'a jamais été appelé.

### 4. La signature de mail pollue le corps analysé

Constaté en base : `"Test éé é 3\nElyas Malki\nFounder & CEO — Naywa Studio…"`.
`stripQuotedReply` coupe les citations, pas les signatures — ce n'est pas son
rôle. Conséquence : l'analyse de sentiment porte en partie sur la signature de
l'expéditeur. Sur un message court, elle peut dominer le texte analysé.

Piège connu : couper les signatures trop agressivement supprime du contenu réel.

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
