# Dossier de vérification OAuth Google — les trois textes

> Préparé le 2026-08-25. Scope demandé : **`gmail.send` uniquement**.
> Rien d'autre. Toute addition d'un scope de lecture ferait basculer le
> dossier en *Restricted*, donc en évaluation CASA à 15 000-75 000 $/an.
>
> ⚠️ La vidéo se tourne **APRÈS** l'écriture du connecteur : elle doit montrer
> un vrai consentement, pas une maquette.

---

## 1. Justification du scope (à coller telle quelle, en anglais)

**Scope requested:** `https://www.googleapis.com/auth/gmail.send`

**What our application does**

Naywa Studio is a recruitment platform used by recruitment agencies. A
recruiter writes to a specific candidate about a specific open position. The
message is composed by the recruiter in our interface and sent only when they
explicitly click "Send" — nothing is ever sent automatically.

**Why we need this scope**

Recruiters need their candidates to receive these messages from their own
professional address, the one candidates recognise and can reply to. Sending
from a third-party domain instead means the message reaches the candidate
under a brand that is not their employer's, and is far more likely to be
filtered as spam. `gmail.send` lets us deliver the message the recruiter
wrote, from the recruiter's own mailbox, with a copy in their Sent folder
where they expect to find it.

**Why no narrower alternative works**

There is no narrower Gmail scope that permits sending. `gmail.compose` would
also allow creating and modifying drafts, which we do not need, and is a
restricted scope. SMTP with a stored password is not an acceptable
alternative: it would require us to hold the user's credentials, which is
worse for the user than a revocable OAuth grant.

**What we explicitly do NOT request, and why it matters**

We never request read access to the user's mailbox — no `gmail.readonly`, no
`gmail.modify`, no `gmail.metadata`. We cannot see the contents of their
inbox, their contacts, their labels, or any message they did not send through
our product.

Replies from candidates are not read from the user's mailbox. Each message we
send carries a Reply-To address belonging to our own platform, so replies
reach us directly and are shown in the conversation thread of that candidate.
This design was chosen specifically so that we never need read access.

**Data handling**

We store only the OAuth refresh token, encrypted, and the address the user
connected. We do not store, copy or index the user's mailbox. The user can
disconnect at any time from our interface, and can revoke access from their
Google Account at any time. Message content is written by the recruiter and
stored in their own agency's workspace, which they control and can delete.

---

## 2. Script de la vidéo

**Contraintes de forme, non négociables** : déposée sur **YouTube en non
répertoriée**, et **tout en anglais** — interface comprise. Naywa est
bilingue : basculer la langue du compte en anglais avant d'enregistrer.

Durée visée : 2 à 3 minutes. Pas de montage, pas de musique, une seule prise
si possible : ils veulent un parcours continu et crédible.

### Avant d'appuyer sur enregistrer

- Compte de démonstration prêt, **pas** un compte client. Utiliser une
  organisation de test.
- Langue de l'interface en **anglais**.
- **Fermer** les autres onglets et les extensions visibles.
- Enregistrer **la fenêtre entière du navigateur**, jamais l'onglet seul :
  la barre d'adresse doit rester visible en permanence.

### Plan 1 — l'application (≈ 20 s)

Montrer la page d'accueil de Naywa Studio, connecté, puis naviguer jusqu'à
l'écran d'où l'on connecte une boîte mail. Dire à voix haute, ou écrire en
sous-titre :

> "Naywa Studio is a recruitment platform. Recruiters use it to contact
> candidates about open positions."

### Plan 2 — le consentement (≈ 40 s) — **le plan qui compte**

Cliquer sur « Connect my mailbox ». L'écran de consentement Google s'ouvre.

**Trois choses doivent être lisibles à l'image, en même temps :**

1. **Le nom de l'application** sur l'écran de consentement — identique à
   celui déclaré dans la console.
2. **La barre d'adresse**, où figure l'**identifiant client OAuth**.
   ⚠️ C'est l'erreur classique : on filme l'écran de consentement en plein
   écran, l'URL disparaît, et le dossier est refusé pour ça seul.
3. **Le scope demandé** tel que Google le formule — « Send email on your
   behalf ».

Ne pas couper : montrer l'utilisateur qui **choisit son compte**, lit
l'écran, puis clique sur **Continue**. Prendre son temps ici.

### Plan 3 — ce que le scope permet (≈ 60 s)

Retour dans Naywa. Ouvrir une fiche candidat, rédiger un court message,
cliquer **Send**.

Puis, et c'est ce qu'ils veulent voir : **ouvrir Gmail dans un autre onglet et
montrer le message dans les Éléments envoyés**. C'est la démonstration que le
scope fait exactement ce qu'on a dit et rien d'autre.

Commentaire :

> "The message is sent from the recruiter's own mailbox and appears in their
> Sent folder. We never read their inbox."

### Plan 4 — la révocation (≈ 20 s)

Revenir dans Naywa, montrer le bouton **Disconnect**. Facultatif chez Google,
mais c'est un signal de sérieux qui coûte vingt secondes.

### Ce qu'il ne faut PAS faire

- Filmer un compte client réel, ou un vrai CV de candidat.
- Utiliser un nom d'application différent de celui déclaré.
- Accélérer ou couper le parcours de consentement.
- Laisser un morceau d'interface en français.

---

## 3. Paragraphe pour la politique de confidentialité

À ajouter dans la section **« 4. Sous-traitants techniques »**, ou juste
après, dans `PolitiqueConfidentialiteContent.tsx`. **Les deux langues** — le
site est bilingue et le dossier Google exige l'anglais.

### Version française

**Connexion de votre messagerie (Google / Microsoft)** — si vous choisissez
de connecter votre boîte professionnelle, Naywa Studio obtient une
autorisation limitée à **l'envoi de messages en votre nom**. Nous ne
demandons, et ne recevons, **aucun droit de lecture** : ni vos messages
reçus, ni vos contacts, ni vos libellés ne nous sont accessibles. Nous
conservons uniquement le jeton d'autorisation, chiffré, et l'adresse
connectée. Vous pouvez vous déconnecter à tout moment depuis Naywa Studio, ou
révoquer l'accès depuis votre compte Google ou Microsoft. L'usage des données
issues des API Google respecte la
[Politique relative aux données utilisateur des services API Google](https://developers.google.com/terms/api-services-user-data-policy),
y compris ses exigences d'utilisation limitée.

### English version

**Connecting your mailbox (Google / Microsoft)** — if you choose to connect
your professional mailbox, Naywa Studio receives an authorization limited to
**sending messages on your behalf**. We neither request nor receive **any
read access**: your incoming messages, your contacts and your labels remain
inaccessible to us. We store only the authorization token, encrypted, and the
connected address. You can disconnect at any time from Naywa Studio, or
revoke access from your Google or Microsoft account. Naywa Studio's use of
information received from Google APIs adheres to the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
including the Limited Use requirements.

> ⚠️ **La phrase sur la « Limited Use » n'est pas décorative.** Son absence
> est un motif de refus courant, et Google la cherche explicitement dans la
> politique de confidentialité.

---

## Ordre des opérations

1. Créer le projet Google Cloud et l'application OAuth → on obtient
   l'identifiant client, et on vérifie tout de suite qu'un consentement passe.
2. Publier le paragraphe de politique de confidentialité (§3 ci-dessus).
3. Écrire le connecteur.
4. **Puis** tourner la vidéo — elle doit montrer un vrai consentement.
5. Déposer le dossier avec la justification (§1).
6. Passer l'application **en production** dès la vérification obtenue, sinon
   les jetons expirent tous les 7 jours.
