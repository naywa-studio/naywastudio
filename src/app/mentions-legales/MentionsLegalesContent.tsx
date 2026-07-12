"use client"

import { LegalPageShell, type LegalSection } from "@/components/layout/LegalPageShell"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const SECTIONS: Record<"fr" | "en", LegalSection[]> = {
  fr: [
    {
      title: "1. Éditeur du site",
      content: [
        "Le site naywastudio.com et le service Naywa Studio sont édités par :",
        "**Naywa Studio**",
        "Forme juridique : Entreprise individuelle (micro-entrepreneur)",
        "SIREN : 106 031 917",
        "SIRET (établissement principal) : 10603191700011",
        "Code APE : 6311Z (Traitement de données, hébergement et activités connexes)",
        "Siège social : 2 rue du Voyage, 95490 Vauréal, France",
        "Email : contact@naywastudio.com",
      ],
    },
    {
      title: "2. Directeur de la publication",
      content: [
        "Le directeur de la publication est Elyas Malki, fondateur de Naywa Studio.",
      ],
    },
    {
      title: "3. Hébergement",
      content: [
        "L'application web est hébergée par :",
        "**Vercel Inc.**, 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis. Site : vercel.com",
        "La base de données et les fichiers (CVs, logos) sont hébergés par :",
        "**Supabase Inc.**, 970 Toa Payoh North, Singapour. Site : supabase.com. Région de stockage : eu-central-1 (Francfort).",
      ],
    },
    {
      title: "4. Sous-traitants techniques",
      content: [
        "Naywa Studio s'appuie sur les prestataires suivants pour le fonctionnement du service :",
        "• **Supabase** : base de données, authentification, stockage fichiers.",
        "• **Vercel** : hébergement de l'application web.",
        "• **Resend** : envoi et réception des emails (mail.naywastudio.com).",
        "• **OpenRouter** : passerelle d'accès aux modèles d'IA (gpt-4o-mini pour le parsing, le scoring et la génération de messages).",
        "La liste détaillée et les engagements de chaque prestataire sont décrits dans la politique de confidentialité.",
      ],
    },
    {
      title: "5. Propriété intellectuelle",
      content: [
        "L'ensemble du contenu de ce site (textes, images, graphismes, logo, icônes, code, interfaces) est la propriété exclusive de Naywa Studio, sauf mention contraire.",
        "Toute reproduction, distribution, modification, adaptation, retransmission ou publication de ces éléments est strictement interdite sans accord écrit préalable.",
      ],
    },
    {
      title: "6. Données personnelles",
      content: [
        "Naywa Studio collecte et traite des données personnelles dans le cadre de la création de compte et de l'utilisation du service.",
        "Conformément au Règlement Général sur la Protection des Données (RGPD) et à la loi Informatique et Libertés, vous disposez d'un droit d'accès, de rectification, d'effacement, de portabilité, et d'opposition.",
        "Pour exercer ces droits ou pour toute question relative à vos données, écrivez à contact@naywastudio.com.",
        "Le détail des traitements (données collectées, base légale, durée de conservation, sous-traitants) est exposé dans la politique de confidentialité.",
      ],
    },
    {
      title: "7. Cookies",
      content: [
        "Le site utilise uniquement des cookies techniques nécessaires au fonctionnement du service (authentification, session).",
        "Aucun cookie publicitaire ni de tracking comportemental n'est utilisé.",
      ],
    },
    {
      title: "8. Limitation de responsabilité",
      content: [
        "Naywa Studio s'efforce d'assurer l'exactitude et la mise à jour des informations diffusées sur ce site, et se réserve le droit de modifier le contenu à tout moment et sans préavis.",
        "Naywa Studio ne peut être tenu responsable des dommages directs ou indirects résultant de l'utilisation du site ou de l'impossibilité d'y accéder.",
      ],
    },
    {
      title: "9. Droit applicable",
      content: [
        "Les présentes mentions légales sont soumises au droit français.",
        "En cas de litige, et après tentative de résolution amiable, les tribunaux français seront seuls compétents.",
      ],
    },
  ],
  en: [
    {
      title: "1. Site publisher",
      content: [
        "The website naywastudio.com and the Naywa Studio service are published by:",
        "**Naywa Studio**",
        "Legal form: Sole proprietorship (French micro-entrepreneur status)",
        "SIREN: 106 031 917",
        "SIRET (main establishment): 10603191700011",
        "APE code: 6311Z (Data processing, hosting, and related activities)",
        "Registered office: 2 rue du Voyage, 95490 Vauréal, France",
        "Email: contact@naywastudio.com",
      ],
    },
    {
      title: "2. Publication director",
      content: [
        "The publication director is Elyas Malki, founder of Naywa Studio.",
      ],
    },
    {
      title: "3. Hosting",
      content: [
        "The web application is hosted by:",
        "**Vercel Inc.**, 440 N Barranca Ave #4133, Covina, CA 91723, USA. Website: vercel.com",
        "The database and files (CVs, logos) are hosted by:",
        "**Supabase Inc.**, 970 Toa Payoh North, Singapore. Website: supabase.com. Storage region: eu-central-1 (Frankfurt).",
      ],
    },
    {
      title: "4. Technical subprocessors",
      content: [
        "Naywa Studio relies on the following providers to run the service:",
        "• **Supabase**: database, authentication, file storage.",
        "• **Vercel**: web application hosting.",
        "• **Resend**: sending and receiving emails (mail.naywastudio.com).",
        "• **OpenRouter**: gateway to AI models (gpt-4o-mini for parsing, scoring, and message generation).",
        "The detailed list and each provider's commitments are described in the privacy policy.",
      ],
    },
    {
      title: "5. Intellectual property",
      content: [
        "All content on this site (text, images, graphics, logo, icons, code, interfaces) is the exclusive property of Naywa Studio, unless stated otherwise.",
        "Any reproduction, distribution, modification, adaptation, retransmission, or publication of these elements is strictly prohibited without prior written consent.",
      ],
    },
    {
      title: "6. Personal data",
      content: [
        "Naywa Studio collects and processes personal data as part of account creation and use of the service.",
        "In accordance with the General Data Protection Regulation (GDPR) and the French Data Protection Act, you have the right to access, rectify, erase, port, and object to the processing of your data.",
        "To exercise these rights or for any question about your data, write to contact@naywastudio.com.",
        "The details of our processing activities (data collected, legal basis, retention period, subprocessors) are set out in the privacy policy.",
      ],
    },
    {
      title: "7. Cookies",
      content: [
        "The site only uses technical cookies necessary for the service to function (authentication, session).",
        "No advertising or behavioral tracking cookies are used.",
      ],
    },
    {
      title: "8. Limitation of liability",
      content: [
        "Naywa Studio strives to ensure the accuracy and timeliness of the information published on this site, and reserves the right to modify its content at any time without notice.",
        "Naywa Studio cannot be held liable for direct or indirect damages resulting from the use of the site or the inability to access it.",
      ],
    },
    {
      title: "9. Governing law",
      content: [
        "This legal notice is governed by French law.",
        "In the event of a dispute, and after an attempt at amicable resolution, the French courts shall have exclusive jurisdiction.",
      ],
    },
  ],
}

const copy = {
  fr: { badge: "Légal", title: "Mentions légales", lastUpdated: "juin 2026" },
  en: { badge: "Legal", title: "Legal Notice", lastUpdated: "June 2026" },
}

export function MentionsLegalesContent() {
  const { lang } = useLanguage()
  const t = copy[lang]
  return (
    <LegalPageShell
      badge={t.badge}
      title={t.title}
      lastUpdated={t.lastUpdated}
      sections={SECTIONS[lang]}
    />
  )
}
