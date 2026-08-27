# OAuth boîte du sourceur — étude de viabilité

> **2026-08-25.** Complète `docs/etude-oauth-boite-sourceur.md`, qui décrivait
> la piste. Celle-ci répond à une seule question : **est-ce que ça tient ?**
>
> Deux résultats sont nouveaux depuis la première étude, et l'un d'eux
> renverse l'ordre que je recommandais.

---

## 1. Ce qui est établi, et ne demande plus de vérification

| Fait | Conséquence |
|---|---|
| `gmail.send` est classé **sensible**, pas restreint | Vérification standard **gratuite**. Pas de CASA (15 000-75 000 $/an) |
| Constaté sur notre propre projet Cloud | Ce n'est plus une lecture de documentation |
| Envoi Gmail API : **gratuit** | Coût marginal par client = **zéro** |
| Workspace : 2 000 destinataires/jour | Notre plafond maison est de 60/siège. On est à 3 % |
| Alias Workspace et boîtes partagées M365 | **Gratuits** — le client n'achète rien |
| Le message atterrit dans « Éléments envoyés » | Le sourceur retrouve ce qu'il a envoyé, là où il le cherche |

---

## 2. Google — le parcours réel, palier par palier

### Trois états, et deux d'entre eux plafonnent

| État | Qui peut connecter | Jetons | Écran |
|---|---|---|---|
| **Testing** | 100 comptes, **déclarés un par un** | **expirent à 7 jours** | avertissement |
| **Production, non vérifiée** | 100 comptes | durables | avertissement |
| **Production, vérifiée** | illimité | durables | normal |

⚠️ Le plafond de 100 **survit au passage en production** tant que le scope
sensible n'est pas approuvé. Passer en production ne débloque donc rien à lui
seul — c'est la vérification qui compte, pas le statut.

⚠️ En Testing, chaque compte doit être **inscrit à la main** dans la liste des
testeurs. Ce n'est pas « 100 clients qui arrivent », c'est « 100 adresses
qu'on ajoute une par une ». Parfait pour un pilote choisi, inutilisable en
libre-service.

### Ce qui fait refuser un dossier

Par ordre de fréquence, d'après les motifs documentés :

1. **Discordance de marque.** Le nom, le logo et l'adresse de support affichés
   à l'écran de consentement doivent correspondre exactement à ce qui est
   déclaré et à ce qu'on voit sur le site public. C'est le motif n° 1.
2. **Scope plus large que nécessaire.** Ne rien demander d'autre que
   `gmail.send`. Une seule addition et le dossier change de catégorie.
3. **Propriété du domaine non prouvée** dans la Search Console, **avec le
   compte propriétaire du projet**.
4. Vidéo incomplète — typiquement l'identifiant client absent de la barre
   d'adresse.

### Délai

Les sources donnent de **3-5 jours ouvrés** à **2-4 semaines**. L'écart tient
aux allers-retours : un dossier complet du premier coup part vite, un dossier
incomplet repart pour un tour. C'est un argument pour soigner la vidéo plutôt
que pour l'expédier.

### Une politique à connaître

La politique Gmail API interdit les applications qui « contournent les limites
de compte, les filtres et l'anti-spam » — elle vise les outils de *warmup*, et
elle a déjà servi à couper des accès. **Notre usage n'en relève pas** : envoi
un-à-un, déclenché par un humain, plafonné à 60/jour/siège, sans rotation de
comptes. La recommandation communément admise pour préserver la réputation est
de 30-50 par boîte et par jour : notre plafond est déjà dans cette zone.

C'est un point à ne pas dégrader plus tard sous la pression commerciale.

---

## 3. Microsoft — le résultat qui renverse l'ordre

**Depuis juillet 2026, `Mail.Send` en délégué exige le consentement d'un
ADMINISTRATEUR du tenant.** C'est une conséquence de la *Secure Future
Initiative* : le consentement utilisateur ne suffit plus pour les permissions
Graph touchant aux données Exchange, sauf pour une liste d'applications de
messagerie déjà approuvées par Microsoft — dont nous ne faisons pas partie.

Ce que ça veut dire concrètement : **le sourceur ne peut pas connecter sa
boîte tout seul.** Il doit faire approuver Naywa par l'administrateur de son
tenant.

Conséquences en cascade :

- Dans un petit cabinet, le sourceur EST souvent l'administrateur → friction
  faible.
- Dans une structure avec une vraie DSI → une demande interne, un délai, et un
  refus possible sur lequel nous n'avons aucune prise.
- L'avertissement « éditeur non vérifié » pèse alors **beaucoup plus lourd** :
  c'est un administrateur qui le lit, et c'est exactement son métier de dire
  non. D'où l'importance du Partner One ID.

**J'avais écrit que Microsoft serait le plus simple et qu'il fallait
commencer par lui.** C'était vrai côté développement, et faux côté adoption.
**Google devient le premier chantier** — son consentement reste individuel.

---

## 4. Couverture réelle du marché

| Segment | Chemin | Friction |
|---|---|---|
| Google Workspace | OAuth Google | **consentement individuel** |
| Microsoft 365 | OAuth Microsoft | **admin du tenant requis** |
| OVH, Gandi, IONOS, Infomaniak, Zoho | parcours domaine (SES) | 2 à 5 enregistrements DNS |
| Gmail gratuit, Orange, Free | OAuth Google (500/jour) ou rien | faible pour Gmail |

Aucun segment n'est sans solution. Mais **aucun chemin ne couvre tout**, et
c'est la conclusion structurante : il faudra vivre avec trois transports, ce
que l'interface `MailingProvider` permet déjà.

---

## 5. Les modes d'échec, et ce qu'on perd dans chacun

**Google refuse la vérification.** On reste plafonné à 100 connexions. À court
terme ce n'est pas bloquant — c'est même au-delà de l'horizon commercial
actuel. On corrige et on redépose : contrairement à AWS, **Google dit ce qui
manque**.

**Un tenant Microsoft refuse.** Ce client-là bascule sur le parcours domaine,
ou reste au copier-coller. Perte unitaire, pas systémique.

**Un jeton meurt** (mot de passe changé, révocation, politique). Il faut que
ça se voie immédiatement dans le produit, sinon le sourceur croit envoyer
alors que rien ne part. **C'est le défaut le plus probable de tous, et le plus
silencieux** — à traiter dès le connecteur, pas après.

**Google durcit sa politique.** Risque réel et non maîtrisable : Gmail API
s'est resserrée plusieurs fois. C'est l'argument pour ne jamais dépendre d'un
seul transport, et pour garder SES vivant même minoritaire.

---

## 6. Verdict

**Viable. Chances d'obtenir la vérification Google : de l'ordre de 85 %,
peut-être après un aller-retour.**

Ce chiffre est un jugement, pas une statistique — voici sur quoi il repose.

*En notre faveur* : un seul scope, sensible et non restreint ; un usage
un-à-un déclenché par un humain, qui n'est pas ce que la politique vise ; un
site public réel, une politique de confidentialité, un domaine vérifiable ;
aucun accès en lecture, ce qui est l'argument le plus fort qu'on puisse
présenter ; et des critères publiés, donc corrigeables.

*Contre nous* : une société inconnue et petite ; une adresse de support
personnelle sur l'écran de consentement, qui touche précisément le motif de
refus n° 1 ; et un contexte de recrutement qui appelle un examen attentif.

Les 15 % de risque tiennent surtout au dossier, donc à nous — c'est la bonne
nouvelle.

**Ce que je ferais, dans cet ordre :**

1. **Le connecteur Google d'abord** — inversion par rapport à la première
   étude, à cause du consentement administrateur imposé par Microsoft.
2. **La vidéo et le dossier dans la foulée**, puisque la revue est le seul
   délai qu'on ne maîtrise pas.
3. **Corriger l'adresse de support avant de déposer**, si le compte sur le
   domaine devient possible. C'est le seul motif de refus n° 1 qu'on ait sur
   nous, et il se corrige pour quelques euros.
4. **Microsoft ensuite**, avec le Partner One ID obtenu entre-temps — il
   devient nécessaire, plus seulement souhaitable.

---

## Sources

- [Google — Gmail API scopes](https://developers.google.com/gmail/api/auth/scopes)
- [Google — Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [Google — Unverified apps](https://support.google.com/cloud/answer/7454865)
- [Google — Manage app audience](https://support.google.com/cloud/answer/15549945)
- [Google Workspace — Gmail sending limits](https://support.google.com/a/answer/166852)
- [Microsoft — Graph permissions overview](https://learn.microsoft.com/en-us/graph/permissions-overview)
- [Microsoft — default app consent policy change](https://blog-en.topedia.com/2026/05/microsoft-managed-default-app-consent-policy-will-block-8-additional-permissions/)
- [Unipile — the Google OAuth 100-user limit](https://www.unipile.com/google-oauth-100-user-limit/)
- [GMass — issues with Google OAuth scope verification](https://www.gmass.co/blog/five-annoying-issues-google-oauth-scope-verification/)
