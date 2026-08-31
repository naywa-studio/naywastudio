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

---

## 7. À quel taux le connecteur marchera-t-il réellement ? — 01/09/2026

Question posée par Elyas. Réponse en séparant ce qui est **vérifié** dans la
documentation de ce qui est **estimé** — les deux ne se raisonnent pas
pareil, et mélanger les deux produit un chiffre faussement rassurant.

### Vérifié : le défaut Entra est PERMISSIF

*« By default, all users are allowed to consent to applications for
permissions that don't require administrator consent. For example, by default,
a user can consent to allow an app to access their mailbox. »*

C'est décisif, et c'est meilleur que ce que je craignais : **`Mail.Send`
délégué n'exige pas le consentement d'un administrateur**, et le réglage par
défaut d'un tenant (`microsoft-user-default-legacy`) laisse l'utilisateur
consentir seul.

**Le seul verrou par défaut est donc la vérification d'éditeur** — le
consentement gradué au risque, qui bloque les applications multi-tenant non
vérifiées. Une fois le badge obtenu, un tenant resté au réglage d'usine laisse
le sourceur se connecter tout seul.

### Vérifié aussi : ce qui casse chez les tenants durcis

Microsoft **recommande** le réglage `microsoft-user-default-low` — « seulement
les éditeurs vérifiés, et seulement les permissions classées à faible
impact ». Or la classification « faible impact » par défaut ne contient que
`User.Read`, `openid`, `profile`, `email` et `offline_access`. **`Mail.Send`
n'y est pas.** Chez ces tenants, même vérifiés, il faudra un administrateur —
sauf s'il classe `Mail.Send` en faible impact, ce qu'il ne fera pas.

### Estimé : la répartition

Aucune source fiable ne donne ces parts pour les cabinets de recrutement
français. Ce sont des ordres de grandeur, à corriger dès qu'on aura dix
clients réels — c'est-à-dire à ne pas traiter comme des mesures.

| | Estimation | Effet |
|---|---|---|
| Cabinets sous Microsoft 365 | 55-70 % | concernés par ce connecteur |
| Cabinets sous Google Workspace | 20-30 % | déjà couverts |
| Autres (OVH, Infomaniak, Gandi, Zoho, Lark…) | 10-20 % | **aucun connecteur possible** |
| Parmi les tenants Microsoft : réglage d'usine | 70-85 % | connexion en autonomie |
| Parmi les tenants Microsoft : durcis | 15-30 % | administrateur requis |

### Le chiffre

- **Connecteur Microsoft, une fois l'éditeur vérifié : ~75 % des cabinets sous
  Microsoft se connectent seuls.** Les autres y arrivent, mais en passant par
  leur informaticien.
- **Google + Microsoft ensemble : ~85 % des cabinets** ont un chemin sans DNS.
- **Les 15 % restants n'ont AUCUN chemin** tant que Domain Connect n'existe
  pas. C'est le vrai enseignement de ce calcul : le connecteur Microsoft fait
  passer la couverture de 25 % à 85 %, mais **c'est Domain Connect qui décide
  du dernier sixième**, et lui seul.

### Ce qui déplace le chiffre, et qui dépend de nous

Le taux n'est pas subi. Trois gestes le remontent :

1. **Le lien de consentement administrateur.** Microsoft expose
   `/adminconsent?client_id=…` : un sourceur bloqué peut envoyer ce lien à son
   informaticien, qui approuve une fois pour tout le cabinet. Sans ce lien,
   l'écran dit « ça n'a pas marché » ; avec, il dit « envoyez ceci à votre
   informaticien ». **Le même refus devient un parcours.** À construire dans
   l'écran de connexion — c'est le meilleur rapport effort/effet de tout ce
   chantier.
2. **Détecter l'erreur `AADSTS65001` / `AADSTS900971`** au retour et afficher
   ce lien plutôt qu'un message générique.
3. **Un consentement administrateur vaut pour toute l'organisation** : chez un
   cabinet de six sourceurs, un seul geste d'informaticien débloque tout le
   monde. La friction est par CABINET, pas par personne — ce qui la rend
   beaucoup plus acceptable qu'il n'y paraît.
