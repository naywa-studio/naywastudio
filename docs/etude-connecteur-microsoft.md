# Connecteur Microsoft — ce qu'il y a réellement à faire

> Étude du 31/08/2026, sur la documentation Microsoft à jour.
> Elle **corrige** ce que j'avais annoncé de mémoire dans les sessions
> précédentes.

---

## 0. La correction d'abord

J'avais dit : « depuis juillet 2026, `Mail.Send` délégué exige le consentement
d'un administrateur de tenant ». **C'est faux.**

Le changement de juin-juillet 2026 (message center MC1304287) fait bien basculer
huit permissions déléguées en consentement administrateur — mais ce sont
`Contacts.*`, `People.Read` et `Tasks.*`. **`Mail.Send` n'y figure pas.**

L'obstacle existe, mais il est ailleurs, et il est plus contournable. Le décrire
au bon endroit change la stratégie : on ne cherche plus à faire signer un
administrateur chez chaque client, on cherche à faire vérifier notre éditeur une
fois pour toutes.

---

## 1. Le vrai obstacle : le consentement gradué au risque

Depuis novembre 2020, quand le *risk-based step-up consent* est actif — c'est le
défaut —, **un utilisateur ne peut pas consentir à une application multi-tenant
récente dont l'éditeur n'est pas vérifié**, dès lors qu'elle demande plus que la
connexion et la lecture du profil. `Mail.Send` dépasse largement ce seuil.

Concrètement, sans vérification d'éditeur : le sourceur d'un cabinet sous
Microsoft 365 clique « Connecter ma boîte », voit un avertissement, et **ne peut
pas aller au bout seul**. Il doit passer par son administrateur informatique.

C'est exactement la friction que le connecteur devait supprimer.

Par-dessus, beaucoup d'organisations activent explicitement le réglage
recommandé par Microsoft — *« autoriser le consentement utilisateur uniquement
pour les applications d'éditeurs vérifiés »*. Chez celles-là, l'absence de badge
est un mur, pas un avertissement.

**Conclusion : la vérification d'éditeur n'est pas un ornement, c'est la
condition d'usage.**

---

## 2. Ce que coûte la vérification d'éditeur : rien, sauf du temps

La documentation est explicite : *« Microsoft doesn't charge developers for
publisher verification. No license is required. »* L'inscription au **Microsoft
AI Cloud Partner Program** (CPP, ex-MPN) est également gratuite.

Il n'y a donc **aucun coût** — contrairement au CASA de Google qui, lui, aurait
coûté 15 000 à 75 000 $/an si on avait demandé un scope restreint.

En revanche, les prérequis sont plus lourds que chez Google, et plusieurs ne
peuvent pas être faits par moi.

---

## 3. Les prérequis, un par un

| # | Prérequis | Qui | Difficulté |
|---|---|---|---|
| 1 | Un **tenant Microsoft Entra** (annuaire) | Elyas | 10 min, gratuit |
| 2 | **`naywastudio.com` ajouté et vérifié** dans ce tenant (TXT DNS) | Elyas (Cloudflare) | 15 min |
| 3 | Compte **Microsoft AI Cloud Partner Program** → **Partner One ID**, puis **vérification d'entreprise** | Elyas | Le long pôle : documents légaux, plusieurs jours |
| 4 | **Enregistrement de l'application** dans le tenant (multi-tenant, redirect URI, scopes) | moi | 30 min |
| 5 | **Publisher domain** de l'app = `naywastudio.com` | moi | 5 min |
| 6 | Association du Partner One ID à l'app → **badge vérifié** | moi, une fois le 3 obtenu | 5 min |
| 7 | **Le connecteur** (OAuth + Graph `sendMail`) | moi | ~1 journée |

### Pièges relevés dans la documentation, à ne pas découvrir en route

- **L'application doit être enregistrée avec un compte professionnel ou
  scolaire.** Une app créée avec un compte Microsoft personnel **ne peut jamais**
  être vérifiée. D'où le tenant Entra en prérequis n°1 — et non un simple
  compte Outlook.
- **Le publisher domain ne peut pas être `*.onmicrosoft.com`.** D'où le n°2.
- **L'adresse e-mail utilisée pour la vérification CPP** doit correspondre au
  publisher domain, ou à un domaine vérifié par DNS dans le tenant. Autrement
  dit : une adresse `@naywastudio.com`. Or cette boîte est chez **Lark**, ce qui
  ne pose pas de problème — c'est le DNS qui prouve, pas l'hébergeur du courrier.
- **Le tenant doit être rattaché au *partner global account*** du CPP. Si on
  crée le tenant après le compte partenaire, il faut penser à les associer.
- **Un « location Partner One ID » n'est pas accepté** — seulement celui du
  compte global.
- **MFA obligatoire** sur le compte qui lance la vérification.
- Rôles requis : *Application Administrator* ou *Cloud Application
  Administrator* côté Entra ; *CPP Partner Admin* ou *Account Admin* côté
  Partner Center.

---

## 4. Ce que demandera le connecteur, côté code

Symétrique de Google, en plus simple sur un point : Microsoft renouvelle les
jetons de rafraîchissement à chaque usage (fenêtre d'inactivité de 90 jours),
là où Google nous imposait la contrainte des 7 jours en mode test.

- **Scopes** : `Mail.Send`, `offline_access`, `openid`, `email`, `User.Read`.
  Rien de plus — la règle qui a fait accepter le dossier Google vaut ici :
  **jamais un scope de lecture**, `Mail.Read` ferait basculer le dossier dans une
  autre catégorie de scrutin, et détruirait l'argument « nous ne lisons jamais
  la boîte » sur lequel repose tout le reste.
- **Endpoint d'envoi** : `POST /me/sendMail` sur Microsoft Graph.
- **Multi-tenant** : l'enregistrement doit viser « comptes dans n'importe quel
  annuaire organisationnel », sinon seuls nos propres comptes pourraient se
  connecter.
- **Réutilisable tel quel** : `token-crypto.ts` (AES-256-GCM), l'état HMAC,
  `connected_mailboxes` (la colonne `provider` prévoit déjà `microsoft`),
  `send-via-mailbox.ts` et sa distinction `needs_reconnect` / `failed`. Le
  double `Reply-To`, la liste de suppression, `List-Unsubscribe` et la mention
  légale sont dans la couche commune, donc acquis.
- **À écrire** : `oauth-microsoft.ts`, `graph-send.ts` (l'équivalent de
  `gmail-send.ts` — Graph accepte un objet JSON, pas un RFC 822 brut, donc c'est
  plus court), et deux routes `start` / `callback`.

---

## 5. Ordre recommandé

1. **Elyas** : tenant Entra, domaine vérifié, inscription CPP. Lancer la
   vérification d'entreprise **en premier** — c'est elle qui prend des jours, et
   tout le reste peut avancer pendant ce temps.
2. **Moi** : enregistrement de l'app + connecteur, testables immédiatement dans
   notre propre tenant sans attendre la vérification.
3. **Moi**, dès le Partner One ID obtenu : association, badge vérifié.

Rien n'oblige à attendre la réponse de Google : les deux dossiers sont
indépendants, et Microsoft n'a pas d'équivalent de la vidéo de démonstration.

---

## 6. Ce que je ne peux pas faire

Par honnêteté sur le périmètre, et parce que la question a été posée :

- **créer le tenant et le compte partenaire** — cela engage l'identité de
  l'entreprise et demande des pièces légales ;
- **publier les enregistrements DNS** chez Cloudflare ;
- **activer la MFA** sur son compte.

Le reste — enregistrement de l'app, configuration, code, tests — se fait depuis
le navigateur intégré et le dépôt.

---

## Sources

- [Publisher verification overview](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)
- [MC1304287 — secure-by-default changes for Exchange APIs](https://mc.merill.net/message/MC1304287)
- [Configure user consent / risk-based step-up consent](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/user-admin-consent-overview)
