import type { Metadata } from "next"
import { NousRencontrerContent } from "./NousRencontrerContent"

/**
 * /nous-rencontrer — prise de rendez-vous « meet the team », accessible depuis la
 * section Équipe de l'accueil. Réutilise le même scheduler Lark que
 * /contact-equipe, mais avec un cadrage GÉNÉRAL (découverte / échange), pas le
 * funnel « 5+ sièges » (celui-ci reste sur /contact-equipe).
 */

export const metadata: Metadata = {
  title: "Nous rencontrer — Naywa Studio",
  description:
    "Prenez 20 minutes en visio avec l'équipe Naywa Studio. On répond à vos questions et on regarde ensemble si l'outil colle à votre façon de recruter.",
}

export default function NousRencontrerPage() {
  return <NousRencontrerContent />
}
