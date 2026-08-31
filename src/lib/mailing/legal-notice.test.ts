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

describe("la langue de la mention", () => {
  it("suit la langue du sourceur", () => {
    // Une ligne en français sous un message anglais se voit immédiatement, et
    // décrédite justement le passage censé rassurer le candidat.
    const en = noticeFor({ name: "Durand Recruiting" }, "en")
    expect(en).toContain("is contacting you about a recruitment")
    expect(en).not.toContain("vous contacte")
  })

  it("reste en français par défaut", () => {
    // Le défaut protège l'usage majoritaire : nos cabinets sont français.
    expect(noticeFor({ name: "Cabinet Durand" })).toContain("vous contacte")
  })

  it("traduit aussi le nom de repli", () => {
    // Sans nom d'organisation, « Cette organisation » dans un texte anglais
    // serait la faute la plus visible de la phrase.
    expect(defaultNotice("This organisation", "en")).toContain("This organisation")
    expect(noticeFor({}, "en")).toContain("This organisation")
  })

  it("un texte personnalisé l'emporte sur la langue", () => {
    // Le cabinet qui a écrit sa propre mention l'a écrite dans SA langue :
    // la traduire par-dessus serait réécrire ses mots.
    expect(noticeFor({ name: "X", mailing_notice_text: "Notre texte." }, "en"))
      .toBe("Notre texte.")
  })
})
