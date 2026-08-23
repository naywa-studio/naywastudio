import { describe, expect, it } from "vitest"
import { delegateLinkExpired, DELEGATE_LINK_DAYS } from "./verify-domain"

/**
 * Validité du lien de délégation DNS.
 *
 * Ce lien part chez un TIERS que Naywa n'authentifie pas — le prestataire
 * informatique du cabinet. Il n'ouvre presque rien (les enregistrements ont
 * vocation à être publics), mais il ne doit pas rester utilisable
 * indéfiniment dans une boîte mail : ce qu'il révèle vraiment, c'est QUEL
 * cabinet met en route QUEL domaine.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString()

describe("delegateLinkExpired", () => {
  it("accepte un lien fraîchement envoyé", () => {
    expect(delegateLinkExpired(new Date().toISOString())).toBe(false)
  })

  it("accepte encore la veille de l'échéance", () => {
    // Un prestataire qui traite la demande au bout d'une semaine est un cas
    // NORMAL, pas un cas limite : la fenêtre doit être confortable.
    expect(delegateLinkExpired(daysAgo(DELEGATE_LINK_DAYS - 1))).toBe(false)
  })

  it("refuse au-delà de l'échéance", () => {
    expect(delegateLinkExpired(daysAgo(DELEGATE_LINK_DAYS + 1))).toBe(true)
  })

  it("refuse quand la date est absente", () => {
    // Le défaut penche vers le REFUS : une date manquante est une anomalie,
    // et ouvrir un lien sur une anomalie serait le mauvais côté de l'erreur.
    expect(delegateLinkExpired(null)).toBe(true)
    expect(delegateLinkExpired(undefined)).toBe(true)
  })
})
