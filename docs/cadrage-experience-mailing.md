# Mailing — cadrage de l'expérience

> Écrit le 01/09/2026, pendant l'attente de la vérification d'éditeur
> Microsoft. Les connecteurs sont la plomberie ; ce document décide ce qui se
> construit dessus.
>
> Il ne liste pas des écrans à faire. Il tranche **une** question, dont les
> écrans découlent — et dont dépendent aussi le modèle de données et le
> rattachement des réponses, qui coûtent cher à changer après coup.

---

## 1. La question : quelle est l'unité de conversation ?

Quatre besoins ont été exprimés. Ils ressemblent à quatre chantiers ; ce n'en
est qu'un :

- envoyer un nouveau message hors du fil existant ;
- gérer plusieurs discussions dans une fiche ;
- savoir qu'un candidat a **déjà été contacté pour une autre mission** ;
- distinguer ce qui relève du cabinet de ce qui relève du sourceur.

Les trois premiers sont la même question vue de trois côtés : **qu'est-ce qui
constitue une conversation — le candidat, le couple candidat-mission, ou le
fil ?** Y répondre écran par écran produirait trois réponses incohérentes.

---

## 2. Ce que fait le produit aujourd'hui

Établi en lisant le code, pas de mémoire.

- `email_messages` porte **`candidate_id` ET `job_id`** : le modèle sait déjà
  distinguer les missions.
- Le fil affiché est celui **du candidat**, tous messages confondus.
- **Le rattachement des réponses est le point faible.** `route-inbound.ts`
  identifie le sourceur par l'adresse de réception, le candidat par l'adresse
  d'expédition, puis prend la mission du **dernier message sortant** :

  ```
  .select("job_id").order("created_at", { ascending: false }).limit(1)
  ```

  Autrement dit : **un candidat approché pour deux missions verra sa réponse
  rattachée à la plus récente**, même s'il répond à l'autre. Le fil se remplit,
  rien n'échoue, et personne ne s'en aperçoit — la pire forme de défaut.

---

## 3. La décision : deux unités, pas une

C'est le cœur du cadrage, et il tient en une distinction :

**L'unité de CONVERSATION est le couple (candidat, mission).**
C'est ainsi que travaille un sourceur : il ouvre une mission, il approche des
gens pour elle. Deux missions, deux échanges, deux histoires — les mélanger
rend le fil illisible dès le deuxième poste proposé.

**L'unité de MÉMOIRE est le candidat.**
Ce qu'il faut montrer **avant d'écrire** ne dépend pas de la mission :
« Louis lui a écrit il y a trois jours pour une autre mission ». C'est ce qui
évite le seul incident vraiment coûteux du produit — deux sourceurs du même
cabinet sollicitant la même personne à quelques jours d'intervalle, et le
cabinet qui passe pour désorganisé aux yeux du candidat.

Ces deux unités ne s'opposent pas, elles se superposent : **on écrit dans une
conversation, on se souvient à l'échelle d'une personne.**

Cela répond aux trois premières questions d'un coup, et l'ordre d'importance
s'inverse au passage : le bandeau « déjà contacté » n'est pas un raffinement,
c'est la première chose à construire — il protège la crédibilité du cabinet,
là où le reste améliore le confort du sourceur.

---

## 4. Ce que ça impose : rattacher les réponses pour de bon

Le choix ci-dessus est intenable tant que le routage devine la mission. Deux
techniques :

| | |
|---|---|
| **En-têtes `In-Reply-To` / `References`** | Correct sur le papier. Mais il faut stocker le `Message-ID` de chaque envoi, et certains clients — surtout mobiles — ne les renvoient pas. On aurait un rattachement qui marche « en général ». |
| **Sous-adressage : `inbox+<matchId>@reply.naywastudio.com`** | Le contexte voyage **dans l'adresse de réponse**. Le client de messagerie n'a rien à préserver : il répond à l'adresse, point. SES le gère, et notre routage lit déjà plusieurs adresses de destination. |

**Recommandation : le sous-adressage**, avec repli sur la règle actuelle quand
le suffixe est absent — pour les réponses aux messages déjà envoyés, qui ne
l'ont pas.

C'est invisible pour le candidat : il voit déjà deux adresses de réponse, une
de plus n'y change rien. Et c'est le seul moyen d'être **certain** de la
mission plutôt que de la supposer.

⚠️ À vérifier avant de coder : que le `+` survive à la règle de réception SES
et à `ensureInboxAddress`. Un test d'envoi réel tranchera en dix minutes.

---

## 5. Cabinet ou sourceur : les deux existent déjà

La quatrième question n'appelle pas de développement, mais un écran qui dit la
vérité :

- **la boîte connectée est personnelle** — rattachée à l'utilisateur, jamais à
  l'organisation. Une boîte mail appartient à quelqu'un ;
- **le domaine d'envoi est au cabinet** — tout le monde écrit depuis
  `recrutement@cabinet.fr`.

Ce sont deux réponses à deux besoins réels : la relation personnelle obtient
de meilleurs taux de réponse ; l'adresse générique survit au départ d'un
sourceur. Le cabinet choisit ; l'écran doit poser le choix au lieu de le
laisser deviner.

⚠️ Limite assumée : une **boîte partagée** Microsoft (`recrutement@` en shared
mailbox) exigerait `Mail.Send.Shared`, que nous n'avons délibérément pas
demandé. À rouvrir seulement si un client le demande — le scope se paie en
scrutin, chez Google comme chez Microsoft.

---

## 6. Ce qui en découle, dans l'ordre

1. **Bandeau « déjà contacté »** sur la fiche match, avant la zone d'écriture :
   qui, quand, pour quelle mission. Peu de code, protège la crédibilité.
2. **Sous-adressage** des adresses de réponse + repli. Rend le reste fiable.
3. **Fil filtré par mission** avec bascule « tout l'historique de ce candidat ».
   Les deux unités deviennent visibles à l'écran.
4. **Renommer « Domaine d'envoi » → « Messagerie »**, deux cartes explicites
   avec les logos Google et Microsoft.
5. **Consentement administrateur Microsoft** : détecter `AADSTS65001` et
   afficher le lien à transmettre à l'informaticien, au lieu d'une erreur.

---

## 7. Ce qu'on ne fait pas, et pourquoi

- **Pas de table `threads`.** Grouper par sujet couvre l'essentiel du besoin
  « nouvelle discussion » pour une fraction du travail. Un modèle de fils se
  justifiera le jour où un cabinet aura vraiment plusieurs échanges parallèles
  sur une même mission — pas avant.
- **Pas de scope de lecture**, ni chez Google ni chez Microsoft. Ce serait la
  façon la plus rapide de capter 100 % des réponses, et la plus sûre de perdre
  la vérification qu'on vient d'obtenir.
- **Pas de campagnes.** Ni séquences, ni relances automatiques. Le produit
  repose sur « un sourceur, un candidat, un message choisi » — c'est
  l'argument du dossier Google, et c'est ce qui nous distingue d'un outil de
  publipostage.
