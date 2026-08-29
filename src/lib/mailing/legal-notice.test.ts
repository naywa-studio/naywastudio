import { describe, expect, it } from "vitest"
import { noticeFor, appendNotice, defaultNotice } from "./legal-notice"

/**
 * La mention d'information jointe aux messages candidats.
 *
 * Ce qui est protégé ici : qu'elle parte par défaut — un cabinet qui n'a rien
 * décidé doit être conforme — et qu'elle disparaisse vraiment quand il la
 * retire, parce que c'est SON message et SON obligation, pas la nôtre.
 */

describe("quelle mention pour cette organisation", () => {
  it("par défaut, la mention du produit au nom du cabinet", () => {
    // Entre un cabinet qui oublie et un cabinet qui décide de retirer, seul le
    // second a fait un choix. Le défaut protège le premier.
    const n = noticeFor({ name: "Cabinet Durand" })
    expect(n).toContain("Cabinet Durand")
    expect(n).toContain("recrutement")
  })

  it("préfère le nom de marque au nom légal", () => {
    // C'est le nom que le candidat connaît, pas celui du Kbis.
    expect(noticeFor({ name: "DURAND SAS", brand_name: "Cabinet Durand" }))
      .toContain("Cabinet Durand")
  })

  it("respecte un texte personnalisé", () => {
    expect(noticeFor({ name: "X", mailing_notice_text: "Notre mention à nous." }))
      .toBe("Notre mention à nous.")
  })

  it("se retire quand le cabinet la désactive", () => {
    expect(noticeFor({ name: "X", mailing_notice_enabled: false })).toBeNull()
  })

  it("un texte vidé vaut un retrait", () => {
    // Effacer tout exprime la même chose que décocher. Retomber sur le texte
    // par défaut réimposerait une mention que le cabinet vient d'enlever.
    expect(noticeFor({ name: "X", mailing_notice_text: "   " })).toBeNull()
  })
})

describe("ajout au message", () => {
  it("sépare d'une ligne vide, sans barre ni fioriture", () => {
    // Une barre de séparation transformerait un message personnel en
    // publipostage — mauvais pour la réponse et pour la délivrabilité.
    expect(appendNotice("Bonjour Marc,\n\nÀ bientôt", "— Mention."))
      .toBe("Bonjour Marc,\n\nÀ bientôt\n\n— Mention.")
  })

  it("ne l'ajoute pas deux fois", () => {
    // Un sourceur qui l'aurait recopiée dans son texte ne doit pas la voir
    // doublée en bas de son propre message.
    const notice = defaultNotice("Cabinet Durand")
    const body = `Bonjour,\n\n${notice}`
    expect(appendNotice(body, notice)).toBe(body)
  })

  it("laisse le message intact quand il n'y a pas de mention", () => {
    expect(appendNotice("Bonjour Marc", null)).toBe("Bonjour Marc")
  })
})
