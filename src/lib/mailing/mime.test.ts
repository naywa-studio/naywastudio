import { describe, expect, it } from "vitest"
import { namedAddress } from "./mime"

/**
 * `Nom <adresse>` dans une LISTE d'adresses.
 *
 * L'enjeu n'est pas cosmétique. `Reply-To` est séparé par des virgules : un
 * nom de cabinet qui en contient couperait la liste en deux, et la seconde
 * moitié deviendrait une adresse invalide. Les réponses des candidats ne nous
 * reviendraient plus — chez ce client-là seulement, et sans aucune erreur.
 */

describe("namedAddress", () => {
  it("met le nom du cabinet devant l'adresse", () => {
    expect(namedAddress("Cabinet Durand", "suivi@reply.naywastudio.com"))
      .toBe("Cabinet Durand <suivi@reply.naywastudio.com>")
  })

  it("retire la virgule, qui couperait la liste Reply-To", () => {
    const out = namedAddress("Durand, Martin & Associés", "suivi@reply.naywastudio.com")
    expect(out).not.toContain(",")
    expect(out).toContain("<suivi@reply.naywastudio.com>")
  })

  it("neutralise ce qui permettrait de fabriquer une fausse adresse", () => {
    /* « Sophie <x@evil.com> » comme nom affiché ferait lire au candidat un
     * expéditeur qui n'en est pas un. Le texte peut subsister — ce qui compte
     * est qu'il ne soit plus LISIBLE comme une adresse : ni arobase, ni
     * chevrons, hors ceux de l'adresse véritable en fin de chaîne. */
    const out = namedAddress('Sophie <x@evil.com>"', "suivi@reply.naywastudio.com")
    expect(out.endsWith(" <suivi@reply.naywastudio.com>")).toBe(true)
    const nom = out.slice(0, out.lastIndexOf(" <"))
    expect(nom).not.toMatch(/[@<>"]/)
  })

  it("encode les accents plutôt que de les laisser illisibles", () => {
    // Un nom de cabinet français non encodé arrive en charabia.
    expect(namedAddress("Cabinet Hélène", "s@x.fr")).toMatch(/^=\?UTF-8\?B\?.+\?= <s@x\.fr>$/)
  })

  it("sans nom, renvoie l'adresse nue plutôt qu'un chevron vide", () => {
    expect(namedAddress(null, "s@x.fr")).toBe("s@x.fr")
    expect(namedAddress("   ", "s@x.fr")).toBe("s@x.fr")
  })

  it("aplatit un nom multiligne", () => {
    const out = namedAddress("Cabinet\r\nBcc: pirate@x.fr", "s@x.fr")
    expect(out).not.toMatch(/[\r\n]/)
  })
})
