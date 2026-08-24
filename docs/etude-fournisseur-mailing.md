# Quel fournisseur d'envoi pour l'add-on Mailing ?

> Étude menée le **2026-08-24**, après le **refus d'accès production SES**
> (dossier `178726352900266`). Sources et clauses citées en fin de document.
> À relire avant toute décision de bascule — l'interface `MailingProvider`
> rend le changement peu coûteux, mais le choix du remplaçant l'est beaucoup
> moins.

---

## 1. Ce qu'on demande à un fournisseur

Quatre exigences, dont **trois sont éliminatoires** :

| # | Exigence | Pourquoi elle est dure |
|---|---|---|
| 1 | **Politique tolérant notre usage** | Éliminatoire. Un fournisseur qui interdit l'outreach ferme le compte — et emporte avec lui l'authentification si le compte est partagé. |
| 2 | **Réception des réponses** (inbound) | Éliminatoire. Sans elle, le candidat répond dans le vide. A déjà éliminé Scaleway. |
| 3 | **Un domaine d'envoi par CABINET**, piloté par API | Éliminatoire. C'est le produit : chaque client envoie sous sa marque. |
| 4 | Coût compatible avec 9,99 €/mois/cabinet | Arbitrable, mais décide de la marge. |

S'y ajoutent, non éliminatoires : hébergement UE (cohérence avec nos pages
légales), webhooks de rebond, et un plafond d'identités élevé.

---

## 2. La question qui décide de tout

**Notre usage est-il du « cold outreach » ?**

Les politiques d'usage visent les listes **achetées, louées ou aspirées**. Notre
cas est différent, et la différence est vérifiable :

- le candidat a **déposé son CV** auprès du cabinet, ou
- le cabinet l'a obtenu via une **CVthèque où le candidat a consenti** à être
  contacté par des recruteurs.

Autrement dit, une base **d'intérêt légitime** au sens du RGPD, pas une liste
froide. C'est exactement ce que MailerSend nomme comme fondement recevable.

**Mais** deux fournisseurs ferment quand même la porte : Resend interdit le
« cold outreach » nommément, MailerSend interdit les données « acquises auprès
d'un tiers » — une CVthèque en est un, littéralement. La frontière est étroite,
et c'est elle qu'il faut argumenter dans toute demande d'accès.

---

## 3. Le tableau

| Fournisseur | Politique / notre usage | Inbound | Domaines par client | UE | Verdict |
|---|---|---|---|---|---|
| **Amazon SES** | Sanctionne des **chiffres** (rebonds, plaintes), pas une catégorie | ✅ (S3 + SNS, **déjà codé**) | ✅ 10 000 identités, gratuit | ✅ eu-west-1 | **Le meilleur ajustement — mais accès production refusé** |
| **MailerSend** | Consentement OU **« legitimate interests »** cité explicitement ; interdit les données de tiers | ✅ natif | ✅ 10 (Starter) / 1 000 (Pro) | ⚠️ à confirmer | **Le seul repli sérieux** |
| **Resend** | « unsolicited messages of any kind, **including cold outreach** » + opt-in explicite exigé | ✅ | ✅ | ⚠️ | ❌ **Disqualifié, texte sans ambiguïté** |
| **Mailgun** | Interdit l'outreach, suspension automatisée | ✅ | ✅ | ✅ | ❌ Déjà écarté, confirmé |
| **SendGrid** | Outreach = violation des CGU, suspension sans préavis | ✅ | ✅ | ⚠️ | ❌ |
| **Postmark** | Interdit les listes non opt-in | ✅ | ✅ | ❌ | ❌ Déjà écarté |
| **Scaleway TEM** | Tolérante, française | ❌ **aucun inbound** | ✅ | ✅ | ❌ Éliminé sur l'inbound |
| **Brevo / Mailjet** | Régime marketing : opt-in exigé | ✅ | ✅ | ✅ | ⚠️ Plan C seulement |
| **Auto-hébergé** (Postal…) | Aucune politique à subir | ✅ | ✅ | ✅ | ⚠️ Transfère la délivrabilité et la réputation IP **sur nous** — le métier qu'on maîtrise le moins |

---

## 4. Le coût, et la marche d'escalier

**SES** : 0,10 $ / 1 000 envois, identités gratuites, aucun coût fixe. Un
cabinet actif coûte **quelques centimes par mois**. La marge sur 9,99 € est
d'environ 99 %, et elle ne bouge pas avec le nombre de clients.

**MailerSend** : coût **fixe**, et surtout un **plafond de domaines** qui crée
une marche brutale.

| Cabinets | Plan requis | Coût mensuel | Recette (9,99 €) | Marge |
|---|---|---|---|---|
| 1 | Starter | ~32 € | 10 € | **−22 €** |
| 4 | Starter | ~32 € | 40 € | +8 € |
| 10 | Starter (**plafond**) | ~32 € | 100 € | +68 € |
| **11** | **Professional** | **~102 €** | 110 € | **+8 €** |
| 20 | Professional | ~102 € | 200 € | +98 € |

⚠️ **Le 11ᵉ cabinet coûte 70 € de plus et rapporte 10 €.** La marge s'effondre
à ce passage et ne se rétablit qu'au 21ᵉ client environ. C'est le point à
mettre sur le graphique — pas le coût unitaire, qui n'est pas le sujet.

---

## 5. Ce qui nous manque, et qui explique probablement le refus

La cause de refus SES la plus souvent citée est **l'absence de notifications de
rebonds et de plaintes**. Vérifié dans notre code : `ensureReputationGroup()`
crée bien un jeu de configuration par organisation, mais **n'y attache aucune
destination d'événement**. SES n'a donc aucun moyen de nous signaler un rebond,
et nous n'avons aucun moyen de le traiter.

Ce n'est pas qu'un problème de dossier : c'est **un trou produit**. Sur le
chemin SES, un message qui rebondit reste `status: "sent"` pour toujours. Le
sourceur croit avoir contacté quelqu'un qui n'a jamais rien reçu — précisément
ce que la règle « le domaine du client ou rien » cherchait à éviter.

**À corriger quel que soit le fournisseur retenu.**

---

## 6. Recommandation

**Ne pas basculer tout de suite. Faire les trois dans cet ordre :**

1. **Combler le trou des rebonds** (destination d'événement SNS + traitement).
   Nécessaire dans tous les scénarios, et c'est le levier n°1 d'une nouvelle
   demande.
2. **Redéposer chez AWS**, avec un dossier qui dit d'où viennent les adresses
   (dépôt de CV / CVthèque avec consentement), nos plafonds par organisation,
   le groupe de réputation par client, et le traitement des rebonds. Demander
   **un échange humain** plutôt qu'une réponse automatisée.
3. **Préparer MailerSend en second fournisseur.** Les clés DKIM fonctionnent
   par sélecteurs : les deux peuvent coexister dans la même zone, ce qui permet
   de basculer **sans aucune modification DNS**. C'est l'idée d'Elyas, et c'est
   le moment de la câbler.

**Pourquoi pas la bascule immédiate :** MailerSend impose un coût fixe, un
plafond de domaines qui casse la marge au 11ᵉ client, et son propre processus
d'approbation — avec une clause « données acquises d'un tiers » qui nous vise
autant que SES. On échangerait un mur connu contre un mur inconnu, en payant.

**Si le second refus tombe** : MailerSend, plan Starter, et on avise à
l'approche du 10ᵉ cabinet.

---

## Sources

- [Resend — Acceptable Use Policy](https://resend.com/legal/acceptable-use)
- [MailerSend — Terms of Use](https://www.mailersend.com/legal/terms-of-use)
- [MailerSend — Plans, features and limits](https://www.mailersend.com/help/plans-features-and-limits)
- [MailerSend — Inbound routing](https://developers.mailersend.com/api/v1/email/inbound)
- [MailerSend — Multi-domain management](https://www.mailersend.com/features/multiple-domains)
- [Mailgun — Acceptable Use Policy](https://www.mailgun.com/legal/aup/)
- [SendGrid — Prohibited content types and uses](https://support.sendgrid.com/hc/en-us/articles/4404316003483-Email-Prohibited-Content-Types-and-Uses)
- [Scaleway — TEM capabilities and limits](https://www.scaleway.com/en/docs/transactional-email/reference-content/tem-capabilities-and-limits/)
- [AWS — Request production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)
- [Waypoint — AWS denied your production access to Amazon SES?](https://www.usewaypoint.com/blog/aws-denied-your-production-access-to-amazon-ses)
- [Brevo — Inbound parse webhooks](https://developers.brevo.com/docs/inbound-parse-webhooks)
