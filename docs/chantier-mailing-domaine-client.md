# Chantier — Mailing depuis le domaine du client (add-on)

> **Statut** : spécification d'arrière-plan, non commencé. Dev prévu en session
> dédiée. **Rien n'est codé.** Ce doc décrit l'archi cible + l'ordre de build.
>
> **Décision produit** : l'envoi d'emails candidats se fait **depuis le domaine
> du client, ou pas du tout**. Le relais `mail.naywastudio.com` est débranché →
> à nettoyer une fois cet add-on en place. Feature **payante**, gatée comme la
> Suite Pricing (entitlement dérivé d'une ligne d'abonnement Stripe).

---

## 1. Objectif & principe

Chaque cabinet envoie ses emails candidats depuis **son propre domaine**
(`careers@cabinet-durand.fr`), avec authentification complète (DKIM/SPF/DMARC) et
réception des réponses dans l'app. **Friction client minimale**, qualifiée
automatiquement par le domaine — **aucun choix technique demandé au client**.

Règle incontournable de l'email : le domaine expéditeur **doit publier ses clés
DKIM/SPF dans son DNS autoritaire**. Toute la complexité se résume à : *qui écrit
ces enregistrements, et comment réduire le geste du client.* Resend = l'expéditeur
(génère les records + envoie), il **n'héberge pas** de DNS. Il faut donc un moyen
d'écrire dans le DNS du domaine → 4 parcours ci-dessous.

---

## 2. Qualification par le domaine (le cœur de l'UX)

Le client ne voit que **deux portes** :
- **« J'ai déjà un domaine »** → il le saisit.
- **« Je n'ai pas de domaine »** → Naywa lui en réserve un (parcours D).

Dès la saisie, Naywa **détecte le registrar** (lookup des nameservers +
découverte `_domainconnect`) et **route en silence** vers le bon parcours. Le
client ne choisit jamais « OVH / IONOS / … ».

| # | Condition détectée | Geste client | Backend |
|---|---|---|---|
| **A** | Registrar compatible Domain Connect + il gère le DNS | 1 clic « Autoriser » | Domain Connect (records écrits dans SON DNS) |
| **B** | Compatible mais il ne gère pas le DNS | saisit l'email de son contact IT | lien tokenisé → le contact fait le clic |
| **C** | Registrar non compatible (ex. OVH) | colle 2-4 lignes NS (lui ou son contact) | délégation NS → **zone Route 53** (on écrit tout) |
| **D** | Pas de domaine | choisit un nom | Naywa réserve + héberge (Route 53), 0 geste |

**Plancher de friction** (domaine apporté) : *une action par quelqu'un ayant
l'accès DNS* (un clic, ou coller une fois), délégable par email. Le seul vrai zéro
absolu = parcours D (Naywa possède l'accès).

---

## 3. Modèle de données (migration additive, org-scopée)

Sur `organizations` (le champ `mailing_domain` est déjà réservé) :

```
mailing_domain           text        -- racine, ex. "cabinet-durand.fr"
mailing_subdomain        text        -- ex. "careers" (défaut), modifiable
mailing_sending_domain   text        -- "careers.cabinet-durand.fr" (dérivé)
mailing_path             text        -- 'domain_connect' | 'ns_delegation' | 'naywa_managed'
mailing_registrar        text        -- détecté (info/support)
mailing_status           text        -- 'pending' | 'awaiting_dns' | 'verifying' | 'active' | 'failed'
mailing_managed          boolean     -- true si Naywa a réservé le domaine
mailing_resend_domain_id text
mailing_route53_zone_id  text        -- null en parcours A (Domain Connect)
mailing_ns_records       jsonb       -- lignes NS à afficher (parcours C/D)
mailing_dns_records      jsonb       -- records DKIM/SPF/DMARC/MX (affichage + vérif)
mailing_verified_at      timestamptz
-- délégation par email (parcours B, et C délégué)
mailing_delegate_email   text
mailing_delegate_token   uuid
mailing_delegate_sent_at timestamptz
```

**Entitlement** : ajouter `subscription_has_mailing boolean` (miroir de la ligne
add-on Stripe, écrit au webhook comme `subscription_has_pricing`). Gating via un
helper `canMailing(org, {isAdmin})` calqué sur `hasPricingAccess`.

**Impact `profiles.inbox_address`** : aujourd'hui `local@mail.naywastudio.com`.
Nouveau modèle → `local@{org.mailing_sending_domain}`. `ensureInboxAddress()` doit
dériver le domaine depuis l'org, plus une constante. Prévoir la régénération des
adresses quand une org active son domaine.

---

## 4. Intégration Resend (socle commun aux 4 parcours)

- **Créer le domaine** : `POST /domains { name: "careers.cabinet-durand.fr",
  region: "eu-west-1" }` → renvoie `id` + `records[]` (DKIM CNAMEs, SPF, DMARC,
  MX de réception). **Région EU obligatoire** (résidence des données, cohérent
  avec R2-EU).
- **Statut** : `GET /domains/:id` → `not_started|pending|verified|failed` + records.
- **Déclencher la vérif** : `POST /domains/:id/verify`.
- **Envoi** : `sendEmail()` existant, avec `from = careers@{sending_domain}`.
- **Réception** : les records incluent le **MX** vers Resend inbound. Le webhook
  `/api/inbound-email` (svix, existant) reçoit `email.received` ; router vers le
  bon user via l'adresse `to` (lookup `profiles.inbox_address`).

`lib/resend.ts` : remplacer `MAIL_DOMAIN` constant par le domaine **par org**.
Si l'org n'a pas de domaine `active` → **bloquer l'envoi** (règle « domaine ou rien »).

---

## 5. Parcours C & D — Délégation NS + Route 53 (le socle universel)

C'est le chemin qui marche **partout** (OVH inclus). À construire **en premier**.

1. **Créer la zone** : Route 53 `CreateHostedZone` pour `careers.cabinet-durand.fr`
   → renvoie 4 nameservers + `zone_id`. Stocker `mailing_route53_zone_id` + les NS.
2. **Écrire les records Resend** dans la zone : `ChangeResourceRecordSets`
   (DKIM CNAMEs, SPF TXT, DMARC TXT, MX). Automatique, aucune action client.
3. **Donner au client les 4 NS** à ajouter chez son registrar (délégation du
   sous-domaine). En parcours **D (managed)**, Naywa pose les NS parent lui-même
   (il contrôle le domaine) → 0 geste.
4. Poll `GET /domains/:id` jusqu'à `verified` → `mailing_status = active`.

**Avantage** : Naywa possède la zone → rotation DKIM + MX de réception triviaux,
aucun retour vers le client.

Dépendances : `@aws-sdk/client-route-53`. En parcours D aussi
`@aws-sdk/client-route-53-domains` (réservation). Creds AWS dédiées (voir §9).

---

## 6. Parcours A — Domain Connect (l'accélérateur un-clic)

Pour les registrars compatibles (GoDaddy, IONOS, Cloudflare, Squarespace…).
**Standard ouvert et gratuit.** Naywa = rôle *Service Provider* (léger, vit dans
l'app Next, **pas de VPS**).

1. **Découverte** : résoudre `_domainconnect.<domaine>` → URL de l'API du provider
   + support du flux `apply`. Si absent → basculer parcours C.
2. **Template** : publier un template décrivant les records (DKIM/SPF/DMARC/MX),
   avec la **valeur DKIM en variable** (fournie par Resend à la création).
3. **Flux synchrone** : rediriger le client (popup / nouvel onglet — **pas
   d'iframe**, les registrars bloquent `X-Frame-Options`) vers l'URL `apply` du
   provider avec les variables. Le client, connecté chez son registrar, approuve
   → les records sont écrits **dans son DNS** (pas de Route 53 ici).
4. Retour → poll vérif Resend → `active`.

**Nuance** : en parcours A les records vivent chez le client → Naywa ne contrôle
pas la zone (rotation DKIM = relancer le flux). C'est le compromis du confort
un-clic. Point le plus délicat = l'enregistrement du template Domain Connect
(providerId/serviceId) → à approfondir au moment du dev.

---

## 7. Parcours B — Délégation par email tokenisée

Quand le sourceur n'a pas l'accès DNS (fréquent).

1. Le sourceur saisit `email du contact qui gère le domaine`.
2. Naywa envoie (Resend) un email au contact avec un **lien magique tokenisé**
   (`mailing_delegate_token`, expirant) → il atterrit **directement** sur le bon
   flux pour CE domaine, **sans compte Naywa** :
   - registrar compatible → écran Domain Connect (1 clic),
   - sinon → les 2-4 lignes NS à coller + bouton « J'ai terminé ».
3. Naywa poll la vérif → **notifie le sourceur** « c'est prêt ».

Le même mécanisme sert donc Domain Connect **et** le manuel OVH → **UX unique**
côté sourceur (il fait lui-même, ou il délègue par email).

---

## 8. Machine à états & vérification

```
pending ──(records posés / flux lancé)──> awaiting_dns ──(poll)──> verifying ──> active
                                                   └──(échec/expiré)──> failed
```

- **Bouton « Vérifier »** dans l'UI = poll immédiat `GET /domains/:id`.
- **Cron** (ex. toutes les 15 min) : poll les orgs en `awaiting_dns|verifying`,
  bascule `active` + notifie, marque `failed` après N tentatives.
- `active` = envoi débloqué. Sinon envoi bloqué (message clair).

---

## 9. Câblage envoi/réception + UI

- **Envoi** : `lib/resend.ts` lit `org.mailing_sending_domain` ; `fromHeader` +
  `ensureInboxAddress` dérivent le domaine de l'org. Garde : `mailing_status !=
  active` → 502/erreur explicite (pas d'envoi hors domaine vérifié).
- **Réception** : `/api/inbound-email` route par l'adresse `to` → user → thread.
- **UI** (`/organisation`, gatée `canMailing`) : deux portes → saisie domaine →
  détection → parcours adapté → écran de statut avec bouton « Vérifier » et, si
  délégué, « Renvoyer à un autre contact ». Instructions **spécifiques OVH**
  (copier-coller + capture) pour réduire le support.

---

## 10. Variables d'environnement (nouvelles)

```
AWS_ROUTE53_ACCESS_KEY_ID       # compte AWS réel (Route 53 ≠ R2/Cloudflare)
AWS_ROUTE53_SECRET_ACCESS_KEY
AWS_ROUTE53_REGION              # ex. eu-west-1
# parcours D (réservation de domaine) : creds Route 53 Domains (ou autre registrar API)
```

`RESEND_API_KEY` + `RESEND_WEBHOOK_SECRET` existent déjà. Toujours **pas de npm
local** → chaque push validé par le build Vercel.

---

## 11. Coûts (rappel, vérifiés)

- **Resend** : facteur limitant = **nb de domaines**. Pro 20 $ = 10 domaines ·
  Scale 90 $ = 1 000. Le volume d'emails (sourcing = faible) n'est jamais la contrainte.
- **Route 53** : **0,50 $/zone/mois** (25 premières), puis 0,10 $. Requêtes
  négligeables.
- **Parcours D** : réservation domaine ~10-15 €/an (**appartient au client**,
  refacturé — pas un actif porté par Naywa).
- **Marge add-on 9,99 €** : ~1 à 4 $ de coût/client selon l'échelle → marge
  60-90 %. **Micro-entreprise** : charges sur le CA, coûts infra **non
  déductibles** → minimiser le marginal compte double (d'où AWS/Route 53 et
  **pas** Entri à 249 $/mois).

---

## 12. Sécurité & RGPD

- **Resend région EU** (résidence des données). Resend = sous-traitant **déjà
  déclaré**.
- **Route 53 / zone DNS** = aucune donnée personnelle → impact RGPD **nul**.
  Ajouter AWS comme sous-traitant technique (hébergement DNS) si pas déjà couvert.
- **Envoi pour le compte du client** (il est responsable de traitement, Naywa
  sous-traitant) → couvert par le DPA.
- **Email de délégation** : envoyé **uniquement** à l'adresse saisie par le
  client, mono-usage, token expirant. Pas de collecte.
- Base légale de l'outreach candidat = **intérêt légitime** (sourcing B2B),
  inchangée par le domaine.

---

## 13. Déprovisionnement

À la résiliation de l'add-on / suppression d'org : supprimer le domaine Resend +
la zone Route 53. **Ne PAS supprimer un domaine réservé (parcours D)** = c'est
l'actif du client ; on arrête juste l'envoi.

---

## 14. Ordre de build suggéré (lots)

0. **Gating + migration** (additive) + creds AWS. Entitlement `canMailing`.
1. **Socle Resend** : créer domaine (EU), fetch records, verify, poll ; câbler
   l'envoi sur le domaine d'org ; bloquer si non `active`. Tester bout-en-bout
   sur un domaine qu'on contrôle via délégation NS **manuelle**.
2. **Route 53** : créer zone + écrire records + renvoyer NS → le parcours C/D
   devient **100 % automatisé**.
3. **Détection registrar + UI deux portes + délégation email tokenisée**
   (+ instructions OVH). = parcours principal côté client.
4. **Domain Connect** (parcours A) : l'accélérateur un-clic pour les compatibles.
5. **Domaine géré Naywa** (parcours D) : réservation par API pour les sans-domaine.
6. **Réception par domaine client** + cron de vérif + déprovisionnement +
   **nettoyage du relais `mail.naywastudio.com`** mort.

---

## 15. À trancher au moment du dev

- **Sous-domaine par défaut** : `careers.` (retenu), champ pour modifier.
- **Entitlement Stripe** : nouvelle ligne add-on dédiée (comme `pricing_addon`),
  prix ~9,99 €/mois → `subscription_has_mailing`.
- **Parcours D — propriété** : domaine réservé **au nom du client**
  (transfert/ownership clair), refacturé ~12-15 €/an ou inclus dans un palier.
- **Domain Connect (parcours A)** peut être **différé** : les lots 0→3 (socle +
  NS/Route 53 + délégation email) suffisent à livrer le parcours universel ; A
  est un pur confort à ajouter ensuite.
