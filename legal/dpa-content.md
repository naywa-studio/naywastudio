# Accord de traitement de données (DPA)

**Version 1.2 — applicable au 31 août 2026**

*Cette version 1.2 : (1) ajoute Cloudflare (stockage des CV, section 6)
et Amazon Web Services / SES (envoi et réception des messages
candidats, section 6), absents de la version précédente bien que déjà
en production ; (2) précise que les données candidats ne servent
jamais à entraîner un modèle d'IA ni à constituer une base commune
entre clients (section 2) ; (3) documente le mécanisme de rétention
automatique par candidat (section 5) ; (4) met à jour la section 10 —
l'export, la suppression, l'anonymisation et le retrait du vivier d'un
candidat sont désormais en libre-service dans la plateforme, ce
n'était jusqu'ici qu'annoncé « en développement ». Aucune garantie
antérieure n'est retirée.*

*La version 1.1 avait ajouté la section 9 « Rôle administrateur Naywa »,
qui décrit les accès dont dispose l'équipe Naywa Studio pour le support
technique du service.*

Ce document constitue l'accord de traitement de données (Data Processing
Agreement, ci-après « DPA ») prévu à l'article 28 du Règlement (UE)
2016/679 (RGPD) entre :

- **Le Client** : l'entité (cabinet de recrutement, ESN, cabinet de
  consulting) souscrivant à un abonnement Naywa Studio, agissant en tant
  que **responsable du traitement** pour les données personnelles des
  candidats qu'elle uploade et traite via la plateforme.

- **Naywa Studio** (SAS en cours d'immatriculation, Paris, France),
  agissant en tant que **sous-traitant** au sens de l'article 4(8) RGPD,
  ci-après « Naywa ».

## 1. Objet

Naywa traite des données personnelles de candidats (CV, identité,
coordonnées, parcours, compétences) pour le compte du Client dans le
cadre de l'exécution du contrat d'abonnement au Package Sourcing. Le
présent DPA encadre ce traitement conformément au RGPD.

## 2. Nature et finalités du traitement

Naywa traite les données personnelles pour les finalités suivantes,
strictement nécessaires à l'exécution du service :

- ingestion et indexation des CV téléversés par le Client
- extraction structurée (nom, expérience, compétences) via un modèle
  d'intelligence artificielle
- mise à disposition d'un vivier de candidats consultable par les
  utilisateurs autorisés du Client
- scoring de pertinence candidat × mission, anonymisation à la
  demande, suivi du pipeline candidat
- calcul de chiffrages selon la convention Syntec (lorsque le Client
  souscrit à Sourcing Pro)
- envoi et réception des messages échangés avec les candidats
  (fonctionnalité optionnelle « Mailing »), avec une aide à l'analyse
  des réponses par un modèle d'intelligence artificielle : cette
  analyse ne produit que des SUGGESTIONS présentées au Client, aucune
  décision concernant un candidat (retenu, écarté, recontacté) n'est
  prise automatiquement — voir aussi l'article 22 RGPD, hors du champ
  duquel ce traitement se situe pour cette raison
- gestion de la durée de conservation par candidat et suppression ou
  anonymisation automatique en fin de rétention (voir section 5)

**Naywa ne réutilise jamais les données candidats du Client pour
entraîner ses propres modèles d'intelligence artificielle, constituer
une base de profils commune à plusieurs clients, ou sourcer
automatiquement pour le compte d'un autre client.** Chaque organisation
cliente est strictement cloisonnée (voir section 8, isolation
multi-tenant) ; les modèles d'IA utilisés sont des services tiers
appelés à la demande (voir section 6, OpenRouter), jamais ré-entraînés
sur les données transmises.

## 3. Catégories de données traitées

- **Identification** : nom, prénom, adresse e-mail, numéro de téléphone,
  adresse postale, lien LinkedIn lorsque renseigné par le candidat
- **Parcours professionnel** : expériences, postes, entreprises,
  périodes, formation, certifications, langues, compétences techniques
- **Données de traitement** : photo lorsque présente sur le CV
  (anonymisée à la demande), date d'upload, source du CV
- **Données financières limitées** : TJM cible, brut cible (uniquement
  saisis par les utilisateurs du Client, jamais collectés
  automatiquement)

Aucune donnée sensible au sens de l'article 9 RGPD n'est demandée par
Naywa. Si le Client uploade un CV contenant des données sensibles
(santé, opinions, etc.), il en assume la responsabilité au titre de
l'article 24 RGPD.

## 4. Catégories de personnes concernées

Les candidats dont le CV est téléversé par le Client dans la plateforme,
ainsi que les utilisateurs autorisés (collaborateurs du Client) qui
opèrent la plateforme au quotidien.

## 5. Durée du traitement

**Au niveau du contrat.** Les données sont conservées pour la durée
d'exécution du contrat d'abonnement. À la résiliation, Naywa supprime
les données dans un délai de **30 jours**, sauf demande contraire
écrite du Client (export, prolongation pour finalisation d'un dossier
en cours).

**Au niveau de chaque candidat**, indépendamment de la durée du
contrat, la plateforme applique une rétention automatique :

- **180 jours** à compter du dernier contact avec le candidat (ou de
  son import si jamais contacté), par défaut ;
- **2 ans** à compter du dernier contact si le Client a déclaré avoir
  obtenu l'accord du candidat pour une conservation en vivier au-delà
  du process de recrutement en cours (case « Conserver en vivier » sur
  la fiche du candidat — déclaratif, la plateforme ne collecte pas
  elle-même ce consentement auprès du candidat) ;
- un contact ultérieur avec le candidat repousse d'autant cette
  échéance ; un candidat toujours suivi activement ne s'éteint donc
  jamais faute d'action du Client.

Un traitement automatisé quotidien supprime le CV et les données
identifiantes de tout candidat dont l'échéance est dépassée, sans
action requise du Client. Le Client reste libre, à tout moment, de
supprimer ou d'anonymiser un candidat par avance, ou de retirer son
consentement à la conservation prolongée (voir section 10).

## 6. Sous-traitants ultérieurs (article 28.2 RGPD)

Le Client autorise Naywa à recourir aux sous-traitants ultérieurs
suivants pour l'exécution du service :

| Sous-traitant | Service rendu | Hébergement |
|---|---|---|
| **Supabase (Supabase Inc.)** | Base de données PostgreSQL, authentification | Union européenne (Francfort) |
| **Cloudflare (Cloudflare, Inc.)** | Stockage des fichiers CV et des documents anonymisés générés (service R2) | Union européenne — bucket à restriction de juridiction UE |
| **Vercel (Vercel Inc.)** | Hébergement de l'application web et des fonctions serverless | Union européenne (Paris, région cdg1) |
| **OpenRouter (OpenRouter Inc.)** | Acheminement vers les modèles d'IA (parsing CV, scoring, anonymisation textuelle) | États-Unis (avec engagement contractuel de non-rétention) |
| **Stripe (Stripe Payments Europe Ltd.)** | Traitement des paiements et facturation | Union européenne (Irlande) |
| **Resend (Resend Inc.)** | Envoi des e-mails de service (inscription, mot de passe, contact, support) — ne traite pas les messages échangés avec les candidats | Union européenne |
| **Amazon Web Services EMEA SARL** | Envoi et réception des messages échangés avec les candidats (fonctionnalité optionnelle « Mailing », service SES). Les messages entrants transitent par un stockage temporaire (service S3) supprimé dès leur traitement | Union européenne (Irlande) |
| **Sentry (Functional Software, Inc.)** | Suivi des erreurs applicatives — peut incidemment capter des fragments de données techniques (identifiants, messages d'erreur), jamais le contenu d'un CV | États-Unis (avec engagement contractuel de non-rétention) |

Naywa informe le Client de tout changement de sous-traitant ultérieur
avec un préavis raisonnable. Le Client peut s'y opposer pour motif
sérieux et résilier le contrat si Naywa ne propose pas d'alternative
acceptable.

Naywa garantit que chaque sous-traitant ultérieur présente des garanties
suffisantes au sens de l'article 28.4 RGPD, notamment via la signature
de leurs propres DPA (disponibles publiquement sur leurs sites).

## 7. Transferts hors Union européenne

Pour OpenRouter et Sentry, seuls sous-traitants situés hors UE, le
transfert vers les États-Unis est encadré par les clauses
contractuelles types (CCT) adoptées par la Commission européenne le 4
juin 2021 (décision 2021/914). Aucune autre donnée personnelle n'est
transférée hors UE — Supabase, Cloudflare, Vercel, Stripe et AWS SES
hébergent et traitent exclusivement en Union européenne.

## 8. Mesures de sécurité (article 32 RGPD)

Naywa met en œuvre les mesures techniques et organisationnelles
suivantes :

- **Chiffrement au repos** : toutes les bases de données et le stockage
  objet sont chiffrés AES-256 par les fournisseurs hôtes
- **Chiffrement en transit** : HTTPS / TLS 1.3 systématique
- **Isolation multi-tenant** : Row Level Security PostgreSQL — chaque
  structure (organisation) du Client est strictement cloisonnée au
  niveau base de données. Aucune fuite possible entre structures, même
  en cas de bug applicatif
- **Authentification** : email/mot de passe avec hachage bcrypt ou
  Google OAuth 2.0 (au choix du Client)
- **Contrôle d'accès** : système de rôles propriétaire / membre,
  attribution explicite des sièges par le propriétaire
- **Journalisation** : logs d'accès conservés 30 jours côté hébergeur
- **Sauvegardes** : sauvegardes chiffrées quotidiennes, rétention 7
  jours
- **Pas d'accès humain non autorisé** : seules les personnes habilitées
  côté Naywa (fondateurs) peuvent accéder aux données via des comptes
  administratifs nominatifs

## 9. Rôle administrateur Naywa

Pour assurer le support technique du service, certains comptes
nominatifs de l'équipe Naywa Studio disposent d'un rôle
**administrateur** transverse aux organisations clientes.

**Ce qu'un administrateur Naywa peut faire :**

- Consulter les statistiques agrégées du service (nombre total
  d'organisations, d'utilisateurs, de candidats, revenu mensuel
  estimé), sans accès au contenu des données
- Rechercher un utilisateur par adresse e-mail ou prénom afin
  d'identifier son organisation, son rôle, son statut d'abonnement
  et sa dernière date de connexion, dans le cadre exclusif d'une
  demande de support du Client
- Publier des nouveautés produit (changelogs) lisibles par tous
  les utilisateurs authentifiés
- Valider ou refuser les demandes de modification d'identité forte
  des organisations (logo, raison sociale, e-mail de contact) après
  la période de configuration initiale

**Ce qu'un administrateur Naywa ne peut pas faire :**

- Consulter le vivier de candidats d'une organisation cliente
- Consulter les missions, les chiffrages, le pipeline ou les
  e-mails échangés par une organisation cliente
- Se connecter à la place d'un utilisateur (impersonation)
- Modifier les données d'une organisation cliente ou d'un de ses
  utilisateurs en dehors du processus de validation des demandes
  de modification d'identité forte
- Supprimer une organisation cliente

**Journal d'audit.** Toute consultation effectuée par un
administrateur Naywa (recherche, ouverture d'une fiche, validation
ou refus d'une demande) est journalisée de manière inaltérable dans
un registre interne (qui, quand, quel type d'action, quelle cible).
Ce registre est conservé pendant la durée du contrat et tenu à
disposition du Client sur demande motivée.

**Limitation contractuelle.** L'équipe Naywa n'utilise ces accès que
dans le cadre du support technique du service. Toute autre
utilisation engagerait la responsabilité contractuelle de Naywa au
titre des obligations de confidentialité et de finalité figurant
au présent DPA.

## 10. Droits des personnes concernées

Naywa assiste le Client, dans la mesure du raisonnable, pour répondre
aux demandes d'exercice des droits prévus aux articles 15 à 22 RGPD
(accès, rectification, effacement, limitation, portabilité, opposition).

Sur la fiche de chaque candidat, le Client dispose en libre-service,
sans délai ni intervention de Naywa, de :

- **l'export des données** : télécharge un fichier contenant
  l'intégralité de ce que la plateforme détient sur ce candidat (droit
  d'accès, article 15)
- **la suppression définitive** : supprime le CV et toutes ses dérivées
  (PDF anonymisé, fiches pricing, etc.) — irréversible
- **l'anonymisation** : vide les données identifiantes (nom, e-mail,
  téléphone, CV) tout en conservant la fiche à des fins statistiques
  agrégées, non ré-identifiantes (droit d'effacement partiel, article
  17)
- **le retrait du consentement de conservation en vivier**, qui
  ramène la date de suppression automatique à l'échéance courte par
  défaut (voir section 5)
- **la consultation de l'historique** des actions RGPD effectuées sur
  ce candidat (qui, quand, quelle action)

Chacune de ces actions est journalisée de manière inaltérable et
subsiste même après suppression du candidat, à des fins de preuve de
conformité.

**Export complet du vivier** : accessible au propriétaire du compte
depuis les paramètres de l'organisation, en un clic, à tout moment
(sans délai d'attente).

**Délai de réponse** : pour toute demande que ces outils en
libre-service ne couvriraient pas, Naywa s'engage à répondre aux
demandes d'assistance du Client dans un délai maximum de 7 jours
ouvrés.

## 11. Notification de violation (article 33 RGPD)

En cas de violation de données personnelles affectant les traitements
réalisés pour le Client, Naywa s'engage à :

- **notifier le Client sans retard injustifié** et au plus tard dans les
  72 heures suivant la prise de connaissance de la violation
- **documenter la nature, l'étendue et les conséquences** de la
  violation
- **assister le Client** dans ses propres obligations de notification
  auprès de la CNIL et, le cas échéant, des personnes concernées

## 12. Auditabilité

Le Client dispose d'un droit d'audit dans les limites suivantes :

- audit documentaire annuel sur simple demande (Naywa transmet les
  attestations / certifications de ses sous-traitants ultérieurs, ses
  procédures de sécurité, le présent DPA à jour)
- audit sur site soumis à préavis raisonnable (30 jours), à fréquence
  maximale annuelle sauf incident, et aux frais du Client

## 13. Suppression et restitution

À la fin du contrat, le Client peut demander :

- **soit la restitution** de ses données dans un format structuré
  (export JSON / CSV des candidats, missions, chiffrages) — réalisée
  dans les 7 jours ouvrés suivant la demande
- **soit la suppression définitive** — réalisée automatiquement 30
  jours après la résiliation, sauf demande contraire

À l'issue du délai, aucune donnée du Client n'est conservée par Naywa
ni par ses sous-traitants ultérieurs, à l'exception des données dont la
conservation est requise par la loi (factures Stripe pendant 10 ans).

## 14. Confidentialité

Naywa s'engage à ce que toute personne ayant accès aux données
personnelles soit soumise à une obligation de confidentialité.

## 15. Modification du DPA

Toute modification substantielle du présent DPA est notifiée au Client
avec un préavis de 30 jours. Si la modification dégrade le niveau de
protection, le Client peut résilier sans préavis ni indemnité.

## 16. Contact

Pour toute question relative au traitement des données ou pour exercer
les droits prévus au présent DPA :

**Naywa Studio**
contact@naywastudio.com
Paris, France

---

*Document à co-signer entre le Client et Naywa Studio.
Une version mise à jour est disponible à tout moment sur
naywastudio.com/dpa.*
