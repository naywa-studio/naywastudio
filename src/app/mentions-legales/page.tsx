import type { Metadata } from "next"
import { LegalPageShell, type LegalSection } from "@/components/layout/LegalPageShell"

export const metadata: Metadata = {
  title: "Mentions légales — Naywa Studio",
  description: "Mentions légales de Naywa Studio.",
}

const SECTIONS: LegalSection[] = [
  {
    title: "1. Éditeur du site",
    content: [
      "Le site naywastudio.com et le service Naywa Studio sont édités par :",
      "**Naywa Studio**",
      "Forme juridique : Entreprise individuelle (micro-entrepreneur)",
      "SIREN : 106 031 917",
      "SIRET (établissement principal) : 10603191700011",
      "Code APE : 6311Z — Traitement de données, hébergement et activités connexes",
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
      "**Vercel Inc.** — 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis — vercel.com",
      "La base de données et les fichiers (CVs, logos) sont hébergés par :",
      "**Supabase Inc.** — 970 Toa Payoh North, Singapour — supabase.com — région de stockage : eu-central-1 (Francfort).",
    ],
  },
  {
    title: "4. Sous-traitants techniques",
    content: [
      "Naywa Studio s'appuie sur les prestataires suivants pour le fonctionnement du service :",
      "— **Supabase** — base de données, authentification, stockage fichiers",
      "— **Vercel** — hébergement de l'application web",
      "— **Resend** — envoi et réception des emails (mail.naywastudio.com)",
      "— **OpenRouter** — passerelle d'accès aux modèles d'IA (gpt-4o-mini pour le parsing, le scoring et la génération de messages)",
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
]

export default function MentionsLegalesPage() {
  return (
    <LegalPageShell
      badge="Légal"
      title="Mentions légales"
      lastUpdated="juin 2026"
      sections={SECTIONS}
    />
  )
}
