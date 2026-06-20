import type { Metadata } from "next"
import { LegalPageShell, type LegalSection } from "@/components/layout/LegalPageShell"

export const metadata: Metadata = {
  title: "Politique de confidentialité | Naywa Studio",
  description: "Comment Naywa Studio collecte, traite et protège vos données et celles de vos candidats.",
}

const SECTIONS: LegalSection[] = [
  {
    title: "1. Qui sommes-nous",
    content: [
      "**Naywa Studio** édite une plateforme SaaS permettant aux cabinets de recrutement de centraliser leurs CVs, créer des missions, scorer les candidats et préparer leurs messages d'approche, avec l'assistance d'une intelligence artificielle.",
      "Responsable du traitement pour la plateforme : Naywa Studio, contactable à contact@naywastudio.com.",
      "Cette politique explique ce que nous collectons, pourquoi, avec qui nous travaillons pour le traiter, et les droits dont vous disposez.",
    ],
  },
  {
    title: "2. Données collectées",
    content: [
      "**Comptes utilisateurs**",
      "Adresse email, prénom, mot de passe (haché), date de création, dernière connexion. Logo et nom du cabinet si vous les renseignez.",
      "**Données saisies dans le workspace**",
      "CVs au format PDF que vous importez. Données extraites par OCR + IA depuis ces CVs (nom, expériences, compétences, formation). Missions que vous créez (intitulé, description, lieu, paramètres de pricing). Évaluations de matching, échanges email avec les candidats.",
      "**Données techniques**",
      "Adresse IP, agent navigateur, identifiants de session, logs serveur (pour diagnostic incident).",
      "**Données de facturation** *(quand Stripe sera branché)*",
      "Nom du cabinet, adresse de facturation, statut d'abonnement. Aucune donnée bancaire ne transite chez Naywa Studio. Elle est traitée par Stripe.",
    ],
  },
  {
    title: "3. Pourquoi nous traitons ces données",
    content: [
      "**Fournir le service** :vous donner accès à votre workspace, conserver vos CVs et missions, exécuter les fonctions de matching, de pricing, et de génération de messages.",
      "**Améliorer la pertinence du matching IA** :les évaluations sont produites pour vous uniquement et ne sont pas ré-exploitées pour entraîner un modèle généraliste.",
      "**Sécurité et lutte contre l'abus** :logs serveur conservés le temps nécessaire pour investiguer un incident.",
      "**Facturation** :quand un abonnement payant sera actif, gérer le contrat et l'éventuelle TVA.",
      "**Support client** :répondre à vos demandes envoyées à contact@naywastudio.com.",
      "Base légale : exécution du contrat de service que vous souscrivez avec Naywa Studio (RGPD Art. 6.1.b) et intérêt légitime à sécuriser le service (Art. 6.1.f).",
    ],
  },
  {
    title: "4. Sous-traitants techniques",
    content: [
      "Pour faire fonctionner le service, Naywa Studio s'appuie sur les prestataires suivants, tous engagés contractuellement à respecter le RGPD :",
      "**Supabase Inc.** *(Irlande / États-Unis)* :base de données, authentification, stockage des fichiers. Hébergement de la base sur eu-central-1.",
      "**Vercel Inc.** *(États-Unis)* :hébergement de l'application web. Région de déploiement : cdg1 (Paris).",
      "**Resend Inc.** *(États-Unis)* :envoi et réception des emails outbound/inbound. Domaine : mail.naywastudio.com.",
      "**OpenRouter** *(États-Unis)* :passerelle d'accès aux modèles de langage (gpt-4o-mini pour parsing CV / scoring / messages, plugin file-parser pour OCR).",
      "Aucun autre tiers ne reçoit vos données. Aucune donnée n'est revendue, échangée ou cédée.",
      "**Transferts hors UE** :certains prestataires sont basés aux États-Unis. Les transferts s'effectuent sous le cadre des clauses contractuelles types de la Commission européenne (SCC) et/ou du Data Privacy Framework UE-USA.",
    ],
  },
  {
    title: "5. Durée de conservation",
    content: [
      "**Données du cabinet** *(CVs, missions, échanges)* :conservées tant que votre cabinet est actif. Suppression complète à la résiliation, immédiate si vous êtes seul utilisateur, à la fin de la période payée si d'autres membres sont actifs (voir CGU).",
      "**Compte utilisateur** :supprimé immédiatement à votre demande ou à la résiliation du cabinet.",
      "**Logs techniques** :conservés 30 jours puis purgés.",
      "**Données de facturation** *(quand Stripe sera branché)* :10 ans, durée légale française de conservation des pièces comptables.",
    ],
  },
  {
    title: "6. Vos droits",
    content: [
      "En tant qu'utilisateur, vous disposez à tout moment des droits suivants sur vos données personnelles :",
      "• **Accès** :obtenir copie des données vous concernant",
      "• **Rectification** :corriger une donnée inexacte (modifiable directement dans le workspace ou par email)",
      "• **Effacement** :supprimer votre compte et vos données (bouton « Supprimer mon cabinet » dans la console, ou demande à contact@naywastudio.com)",
      "• **Portabilité** :recevoir vos données dans un format structuré",
      "• **Opposition** :vous opposer à un traitement particulier",
      "• **Limitation** :demander la suspension temporaire d'un traitement",
      "Délai de réponse : 1 mois maximum à compter de la demande.",
      "**Réclamation auprès de la CNIL** :si vous estimez vos droits non respectés, vous pouvez saisir la CNIL : www.cnil.fr.",
    ],
  },
  {
    title: "7. Données des candidats que vous importez",
    content: [
      "Lorsque vous importez un CV dans Naywa Studio, **vous êtes responsable du traitement** au sens du RGPD pour les données du candidat. Naywa Studio agit comme **sous-traitant**.",
      "Vous vous engagez à n'importer que des CVs collectés conformément aux règles applicables (consentement du candidat, sourcing depuis des canaux publics, etc.).",
      "Les candidats peuvent exercer leurs droits auprès de vous, ou nous écrire à contact@naywastudio.com pour être redirigés vers votre cabinet.",
      "Un Data Processing Agreement (DPA) plus détaillé est disponible sur demande pour formaliser cette relation, notamment pour les cabinets soumis à l'audit RGPD.",
    ],
  },
  {
    title: "8. Rôle administrateur Naywa",
    content: [
      "Pour assurer le support technique du service, certains comptes nominatifs de l'équipe Naywa Studio disposent d'un rôle administrateur transverse aux cabinets.",
      "**Ce que l'équipe Naywa peut faire** : consulter des statistiques agrégées du service (nombre de cabinets, d'utilisateurs, de candidats parsés, revenu mensuel estimé) ; rechercher un utilisateur par e-mail ou prénom pour identifier son cabinet et son statut d'abonnement dans le cadre d'une demande de support ; publier des nouveautés produit ; valider ou refuser les demandes de modification d'identité forte (logo, raison sociale, e-mail de contact).",
      "**Ce que l'équipe Naywa ne peut pas faire** : consulter votre vivier, vos missions, vos chiffrages, votre pipeline, vos e-mails ; se connecter à votre place ; modifier vos données en dehors du processus de validation décrit ci-dessus ; supprimer votre cabinet.",
      "**Journal d'audit** : toute consultation effectuée par un administrateur Naywa est tracée dans un registre interne (qui, quand, quel type d'action). Ce registre est tenu à votre disposition sur demande motivée.",
      "Cette section est reprise de manière plus formelle dans le DPA disponible sur demande.",
    ],
  },
  {
    title: "9. Sécurité",
    content: [
      "**Chiffrement en transit** :toutes les connexions au service utilisent HTTPS/TLS.",
      "**Chiffrement au repos** :Supabase chiffre les données stockées dans la base et dans les buckets de fichiers.",
      "**Cloisonnement multi-locataire** :chaque cabinet ne voit que ses propres données, garanti par des politiques Row Level Security côté base de données.",
      "**Stockage privé** :les CVs ne sont jamais accessibles publiquement. Le service génère des URLs signées temporaires pour les téléchargements.",
      "**Authentification** :mots de passe hachés, sessions JWT avec expiration courte, support de Google OAuth.",
      "**Audit régulier** :revues internes de sécurité et corrections continues.",
    ],
  },
  {
    title: "10. Cookies",
    content: [
      "Naywa Studio n'utilise **que des cookies strictement nécessaires** au fonctionnement du service : cookies d'authentification (Supabase), cookies de session.",
      "**Aucun cookie de tracking publicitaire ni d'analyse comportementale n'est utilisé.**",
      "Vous pouvez bloquer les cookies via votre navigateur. Cela rendra l'authentification impossible.",
    ],
  },
  {
    title: "11. L'IA et la prise de décision",
    content: [
      "Naywa Studio utilise un LLM (gpt-4o-mini via OpenRouter) pour : extraire les informations d'un CV, produire un score de matching candidat × mission, et suggérer un message d'approche.",
      "**Toutes les sorties de l'IA sont des suggestions**. Aucune action ne déclenche d'effet sur un candidat sans validation explicite du sourceur (envoi d'email, déplacement dans le pipeline, etc.).",
      "Conformément à l'Art. 22 du RGPD, vous (et les candidats) n'êtes jamais soumis à une décision entièrement automatisée produisant des effets juridiques.",
      "Les prompts envoyés à OpenRouter ne sont pas utilisés par OpenAI ou Anthropic pour entraîner leurs modèles (politique commerciale d'OpenRouter en place sur le service business).",
    ],
  },
  {
    title: "12. Modifications de cette politique",
    content: [
      "Cette politique évolue avec le produit. Toute modification substantielle vous sera notifiée par email et un nouveau consentement sera demandé si la base juridique le requiert.",
      "Pour toute question : contact@naywastudio.com.",
    ],
  },
]

export default function PolitiqueConfidentialitePage() {
  return (
    <LegalPageShell
      badge="Confidentialité"
      title="Politique de confidentialité"
      lastUpdated="20 juin 2026"
      intro="Naywa Studio respecte la vie privée des utilisateurs et des candidats dont les données transitent par notre service. Cette politique explique en clair ce qui est collecté, pourquoi, avec qui, et comment exercer vos droits."
      sections={SECTIONS}
    />
  )
}
