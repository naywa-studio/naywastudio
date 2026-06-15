# Accord de traitement de données (DPA)

**Version 1.0 — applicable au 15 juin 2026**

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

Les données sont conservées pour la durée d'exécution du contrat
d'abonnement. À la résiliation, Naywa supprime les données dans un
délai de **30 jours**, sauf demande contraire écrite du Client
(export, prolongation pour finalisation d'un dossier en cours).

## 6. Sous-traitants ultérieurs (article 28.2 RGPD)

Le Client autorise Naywa à recourir aux sous-traitants ultérieurs
suivants pour l'exécution du service :

| Sous-traitant | Service rendu | Hébergement |
|---|---|---|
| **Supabase (Supabase Inc.)** | Base de données PostgreSQL, authentification, stockage objet | Union européenne (Francfort) |
| **Vercel (Vercel Inc.)** | Hébergement de l'application web et des fonctions serverless | Union européenne (Paris, région cdg1) |
| **OpenRouter (OpenRouter Inc.)** | Acheminement vers les modèles d'IA (parsing CV, scoring, anonymisation textuelle) | États-Unis (avec engagement contractuel de non-rétention) |
| **Stripe (Stripe Payments Europe Ltd.)** | Traitement des paiements et facturation | Union européenne (Irlande) |
| **Resend (Resend Inc.)** | Acheminement des e-mails transactionnels | Union européenne |

Naywa informe le Client de tout changement de sous-traitant ultérieur
avec un préavis raisonnable. Le Client peut s'y opposer pour motif
sérieux et résilier le contrat si Naywa ne propose pas d'alternative
acceptable.

Naywa garantit que chaque sous-traitant ultérieur présente des garanties
suffisantes au sens de l'article 28.4 RGPD, notamment via la signature
de leurs propres DPA (disponibles publiquement sur leurs sites).

## 7. Transferts hors Union européenne

Pour OpenRouter, le transfert vers les États-Unis est encadré par les
clauses contractuelles types (CCT) adoptées par la Commission européenne
le 4 juin 2021 (décision 2021/914). Aucune autre donnée personnelle
n'est transférée hors UE.

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

## 9. Droits des personnes concernées

Naywa assiste le Client, dans la mesure du raisonnable, pour répondre
aux demandes d'exercice des droits prévus aux articles 15 à 22 RGPD
(accès, rectification, effacement, limitation, portabilité, opposition).

- **Suppression d'un candidat** : un seul clic dans la plateforme suffit
  à supprimer définitivement le CV et toutes ses dérivées (PDF
  anonymisé, fiches pricing, etc.)
- **Export du vivier** : export complet sur demande à
  contact@naywastudio.com pendant que la fonctionnalité self-service
  est en cours de développement (mise à disposition prévue en 2026)
- **Délai de réponse** : Naywa s'engage à répondre aux demandes
  d'assistance du Client dans un délai maximum de 7 jours ouvrés

## 10. Notification de violation (article 33 RGPD)

En cas de violation de données personnelles affectant les traitements
réalisés pour le Client, Naywa s'engage à :

- **notifier le Client sans retard injustifié** et au plus tard dans les
  72 heures suivant la prise de connaissance de la violation
- **documenter la nature, l'étendue et les conséquences** de la
  violation
- **assister le Client** dans ses propres obligations de notification
  auprès de la CNIL et, le cas échéant, des personnes concernées

## 11. Auditabilité

Le Client dispose d'un droit d'audit dans les limites suivantes :

- audit documentaire annuel sur simple demande (Naywa transmet les
  attestations / certifications de ses sous-traitants ultérieurs, ses
  procédures de sécurité, le présent DPA à jour)
- audit sur site soumis à préavis raisonnable (30 jours), à fréquence
  maximale annuelle sauf incident, et aux frais du Client

## 12. Suppression et restitution

À la fin du contrat, le Client peut demander :

- **soit la restitution** de ses données dans un format structuré
  (export JSON / CSV des candidats, missions, chiffrages) — réalisée
  dans les 7 jours ouvrés suivant la demande
- **soit la suppression définitive** — réalisée automatiquement 30
  jours après la résiliation, sauf demande contraire

À l'issue du délai, aucune donnée du Client n'est conservée par Naywa
ni par ses sous-traitants ultérieurs, à l'exception des données dont la
conservation est requise par la loi (factures Stripe pendant 10 ans).

## 13. Confidentialité

Naywa s'engage à ce que toute personne ayant accès aux données
personnelles soit soumise à une obligation de confidentialité.

## 14. Modification du DPA

Toute modification substantielle du présent DPA est notifiée au Client
avec un préavis de 30 jours. Si la modification dégrade le niveau de
protection, le Client peut résilier sans préavis ni indemnité.

## 15. Contact

Pour toute question relative au traitement des données ou pour exercer
les droits prévus au présent DPA :

**Naywa Studio**
contact@naywastudio.com
Paris, France

---

*Document à co-signer entre le Client et Naywa Studio.
Une version mise à jour est disponible à tout moment sur
naywastudio.com/dpa.*
