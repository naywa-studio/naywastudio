"use client"

import { LegalPageShell, type LegalSection } from "@/components/layout/LegalPageShell"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const SECTIONS: Record<"fr" | "en", LegalSection[]> = {
  fr: [
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
  ],
  en: [
    {
      title: "1. Who we are",
      content: [
        "**Naywa Studio** publishes a SaaS platform that lets recruitment agencies centralize their CVs, create job openings, score candidates, and draft outreach messages, with the help of artificial intelligence.",
        "Data controller for the platform: Naywa Studio, reachable at contact@naywastudio.com.",
        "This policy explains what we collect, why, who we work with to process it, and the rights you have.",
      ],
    },
    {
      title: "2. Data we collect",
      content: [
        "**User accounts**",
        "Email address, first name, password (hashed), account creation date, last login. Your organization's logo and name if you provide them.",
        "**Data entered in the workspace**",
        "CVs in PDF format that you upload. Data extracted by OCR + AI from those CVs (name, work history, skills, education). Job openings you create (title, description, location, pricing parameters). Matching assessments, email exchanges with candidates.",
        "**Technical data**",
        "IP address, browser user agent, session identifiers, server logs (for incident diagnostics).",
        "**Billing data** *(once Stripe is connected)*",
        "Organization name, billing address, subscription status. No banking data ever passes through Naywa Studio. It is processed by Stripe.",
      ],
    },
    {
      title: "3. Why we process this data",
      content: [
        "**Providing the service**: giving you access to your workspace, storing your CVs and job openings, running matching, pricing, and message generation features.",
        "**Improving AI matching relevance**: assessments are produced for you only and are never reused to train a general-purpose model.",
        "**Security and abuse prevention**: server logs kept for as long as needed to investigate an incident.",
        "**Billing**: once a paid subscription is active, managing the contract and any applicable VAT.",
        "**Customer support**: responding to requests sent to contact@naywastudio.com.",
        "Legal basis: performance of the service contract you enter into with Naywa Studio (GDPR Art. 6.1.b) and legitimate interest in securing the service (Art. 6.1.f).",
      ],
    },
    {
      title: "4. Technical subprocessors",
      content: [
        "To run the service, Naywa Studio relies on the following providers, all contractually bound to comply with the GDPR:",
        "**Supabase Inc.** *(Ireland / United States)*: database, authentication, file storage. Database hosted on eu-central-1.",
        "**Vercel Inc.** *(United States)*: web application hosting. Deployment region: cdg1 (Paris).",
        "**Resend Inc.** *(United States)*: sending and receiving outbound/inbound emails. Domain: mail.naywastudio.com.",
        "**OpenRouter** *(United States)*: gateway to language models (gpt-4o-mini for CV parsing / scoring / messages, file-parser plugin for OCR).",
        "No other third party receives your data. No data is ever resold, traded, or transferred.",
        "**Transfers outside the EU**: some providers are based in the United States. Transfers take place under the European Commission's Standard Contractual Clauses (SCC) and/or the EU-U.S. Data Privacy Framework.",
      ],
    },
    {
      title: "5. Retention period",
      content: [
        "**Organization data** *(CVs, job openings, exchanges)*: kept for as long as your organization is active. Fully deleted upon termination — immediately if you're the sole user, or at the end of the paid period if other members are active (see Terms of Service).",
        "**User account**: deleted immediately upon your request or when the organization is terminated.",
        "**Technical logs**: kept for 30 days, then purged.",
        "**Billing data**: 10 years, the legal French retention period for accounting records.",
      ],
    },
    {
      title: "6. Your rights",
      content: [
        "As a user, you have the following rights over your personal data at any time:",
        "• **Access**: obtain a copy of the data concerning you",
        "• **Rectification**: correct inaccurate data (editable directly in the workspace or by email)",
        "• **Erasure**: delete your account and your data (the \"Delete my organization\" button in the console, or a request to contact@naywastudio.com)",
        "• **Portability**: receive your data in a structured format",
        "• **Objection**: object to a specific processing activity",
        "• **Restriction**: request the temporary suspension of a processing activity",
        "Response time: 1 month maximum from the date of the request.",
        "**Complaint to the CNIL**: if you believe your rights have not been respected, you can file a complaint with the CNIL (the French data protection authority): www.cnil.fr.",
      ],
    },
    {
      title: "7. Candidate data you import",
      content: [
        "When you import a CV into Naywa Studio, **you are the data controller** under the GDPR for the candidate's data. Naywa Studio acts as the **data processor**.",
        "You agree to only import CVs collected in accordance with applicable rules (candidate consent, sourcing from public channels, etc.).",
        "Candidates can exercise their rights directly with you, or write to us at contact@naywastudio.com to be redirected to your organization.",
        "A more detailed Data Processing Agreement (DPA) is available on request to formalize this relationship, particularly for organizations subject to a GDPR audit.",
      ],
    },
    {
      title: "8. Naywa administrator role",
      content: [
        "To provide technical support for the service, certain named accounts on the Naywa Studio team hold an administrator role that spans across organizations.",
        "**What the Naywa team can do**: view aggregated service statistics (number of organizations, users, parsed candidates, estimated monthly revenue); search for a user by email or first name to identify their organization and subscription status as part of a support request; publish product updates; approve or reject requests to change strong-identity fields (logo, legal name, contact email).",
        "**What the Naywa team cannot do**: view your talent pool, job openings, quotes, pipeline, or emails; sign in on your behalf; modify your data outside the approval process described above; delete your organization.",
        "**Audit log**: every action taken by a Naywa administrator is logged in an internal register (who, when, what type of action). This register is made available to you upon a justified request.",
        "This section is restated more formally in the DPA available on request.",
      ],
    },
    {
      title: "9. Security",
      content: [
        "**Encryption in transit**: all connections to the service use HTTPS/TLS.",
        "**Encryption at rest**: Supabase encrypts data stored in the database and in file buckets.",
        "**Multi-tenant isolation**: each organization only ever sees its own data, enforced by Row Level Security policies at the database level.",
        "**Private storage**: CVs are never publicly accessible. The service generates temporary signed URLs for downloads.",
        "**Authentication**: hashed passwords, short-lived JWT sessions, Google OAuth support.",
        "**Regular audits**: internal security reviews and ongoing fixes.",
      ],
    },
    {
      title: "10. Cookies",
      content: [
        "Naywa Studio only uses **strictly necessary cookies** for the service to function: authentication cookies (Supabase), session cookies.",
        "**No advertising tracking or behavioral analytics cookies are used.**",
        "You can block cookies through your browser. This will make authentication impossible.",
      ],
    },
    {
      title: "11. AI and decision-making",
      content: [
        "Naywa Studio uses an LLM (gpt-4o-mini via OpenRouter) to: extract information from a CV, produce a candidate × job-opening matching score, and suggest an outreach message.",
        "**All AI outputs are suggestions**. No action ever has an effect on a candidate without the recruiter's explicit approval (sending an email, moving them in the pipeline, etc.).",
        "In accordance with GDPR Art. 22, neither you nor the candidates are ever subject to a fully automated decision producing legal effects.",
        "Prompts sent to OpenRouter are not used by OpenAI or Anthropic to train their models (per OpenRouter's business-tier commercial policy).",
      ],
    },
    {
      title: "12. Changes to this policy",
      content: [
        "This policy evolves along with the product. Any substantial change will be notified to you by email, and new consent will be requested if the legal basis requires it.",
        "For any question: contact@naywastudio.com.",
      ],
    },
  ],
}

const copy = {
  fr: {
    badge: "Confidentialité",
    title: "Politique de confidentialité",
    lastUpdated: "20 juin 2026",
    intro: "Naywa Studio respecte la vie privée des utilisateurs et des candidats dont les données transitent par notre service. Cette politique explique en clair ce qui est collecté, pourquoi, avec qui, et comment exercer vos droits.",
  },
  en: {
    badge: "Privacy",
    title: "Privacy Policy",
    lastUpdated: "June 20, 2026",
    intro: "Naywa Studio respects the privacy of its users and of the candidates whose data passes through our service. This policy explains in plain terms what we collect, why, with whom, and how to exercise your rights.",
  },
}

export function PolitiqueConfidentialiteContent() {
  const { lang } = useLanguage()
  const t = copy[lang]
  return (
    <LegalPageShell
      badge={t.badge}
      title={t.title}
      lastUpdated={t.lastUpdated}
      intro={t.intro}
      sections={SECTIONS[lang]}
    />
  )
}
