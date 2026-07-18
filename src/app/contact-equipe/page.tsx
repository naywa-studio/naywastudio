import type { Metadata } from "next"
import { ContactEquipeContent } from "./ContactEquipeContent"

/**
 * /contact-equipe — prise de RDV pour les structures au-delà du self-service.
 *
 * Le configurateur (/organisation) et la grille (/tarifs) basculent ici dès que
 * le nombre de personnes dépasse MAX_SELF_SERVE_SEATS : à ce niveau on veut une
 * conversation (périmètre, facturation, onboarding), pas un paiement à l'aveugle.
 */

export const metadata: Metadata = {
  title: "Parlons de votre équipe — Naywa Studio",
  description:
    "Vous êtes plus de 5 à utiliser Naywa ? Prenez 20 minutes avec l'équipe pour construire l'offre qui correspond à votre structure.",
}

export default function ContactEquipePage() {
  return <ContactEquipeContent />
}
