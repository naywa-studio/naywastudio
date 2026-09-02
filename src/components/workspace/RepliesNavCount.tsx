"use client"

/**
 * Le nombre de réponses non prises en charge, sur l'onglet Accueil.
 *
 * Un chiffre plutôt qu'une pastille : « 3 » dit qu'il y a du travail et
 * combien, là où un point ne dit que « quelque chose a changé ». Les
 * nouveautés produit se contentent d'un point parce qu'on peut les lire plus
 * tard ; une personne qui attend une réponse, non.
 *
 * Le compte vient du store partagé de `useCandidateReplies` : ce composant
 * n'ouvre aucune requête à lui seul, quel que soit le nombre d'onglets rendus.
 */

import { useCandidateReplies } from "./useCandidateReplies"

export default function RepliesNavCount() {
  const { pending, enabled } = useCandidateReplies()
  if (!enabled || pending <= 0) return null

  return (
    <span
      // Le chiffre seul serait lu « Accueil 3 » par un lecteur d'écran.
      aria-label={`${pending} réponse${pending > 1 ? "s" : ""} de candidat à traiter`}
      style={{
        minWidth: 17, height: 17, padding: "0 5px", borderRadius: 9,
        background: "var(--nw-primary)", color: "white",
        fontSize: 10, fontWeight: 700, lineHeight: "17px", textAlign: "center",
        fontFamily: "var(--nw-font-mono)",
      }}
    >
      {pending > 9 ? "9+" : pending}
    </span>
  )
}
