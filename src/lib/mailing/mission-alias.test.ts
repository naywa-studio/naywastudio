import { describe, expect, it } from "vitest"
import { missionAliasLocal } from "./mission-alias"

/**
 * La composition de l'adresse dédiée à une mission.
 *
 * Elle est LUE par le candidat, dans son champ « répondre à » : c'est le seul
 * endroit du produit où une chaîne technique s'affiche chez quelqu'un qui
 * n'est pas client. Elle doit donc rester une adresse, pas un identifiant
 * déguisé — et rester valide, ce que la limite RFC de 64 caractères impose.
 */

describe("missionAliasLocal", () => {
  it("compose prénom + mission, séparés par un point", () => {
    expect(missionAliasLocal("elyas", "Commercial Immobilier"))
      .toBe("elyas.commercial-immobilier")
  })

  it("garde le point comme séparateur, et des tirets DANS la mission", () => {
    // C'est ce qui la fait lire comme une adresse professionnelle plutôt que
    // comme une suite de mots collés.
    expect(missionAliasLocal("marie", "Développeur Java Senior"))
      .toBe("marie.developpeur-java-senior")
  })

  it("neutralise accents et ponctuation", () => {
    expect(missionAliasLocal("hélène", "Chargé(e) d'affaires — CDI"))
      .toMatch(/^helene\.[a-z0-9-]+$/)
  })

  it("tronque une mission à rallonge sans laisser un tiret en fin", () => {
    // Un intitulé de mission peut faire une ligne entière ; la partie locale
    // d'une adresse est limitée à 64 caractères.
    const local = missionAliasLocal(
      "elyas",
      "Responsable du développement commercial pour la région Île-de-France",
    )
    expect(local.length).toBeLessThanOrEqual(41)
    expect(local.endsWith("-")).toBe(false)
    expect(local.startsWith("elyas.")).toBe(true)
  })

  it("sans intitulé, retombe sur la seule partie sourceur", () => {
    // Mieux vaut l'adresse générique qu'un point orphelin en fin de chaîne,
    // qui produirait une adresse invalide.
    expect(missionAliasLocal("elyas", null)).toBe("elyas")
    expect(missionAliasLocal("elyas", "   ")).toBe("elyas")
    expect(missionAliasLocal("elyas", "!!!")).toBe("elyas")
  })

  it("sans partie sourceur exploitable, garde un repli lisible", () => {
    expect(missionAliasLocal("", "Commercial")).toBe("sourceur.commercial")
  })

  it("ne produit jamais de caractère interdit dans une adresse", () => {
    for (const titre of [
      "R&D / Innovation",
      "Chef de projet (H/F)",
      "Data — Analyste, BI",
      "Ingénieur·e système",
    ]) {
      expect(missionAliasLocal("elyas", titre)).toMatch(/^[a-z0-9.-]+$/)
    }
  })

  it("deux intitulés différents donnent deux adresses différentes", () => {
    expect(missionAliasLocal("elyas", "Commercial Immobilier"))
      .not.toBe(missionAliasLocal("elyas", "Commercial Bancaire"))
  })

  it("deux intitulés IDENTIQUES donnent la même base — le suffixe vient de la base", () => {
    /* C'est volontaire : ce n'est pas à la composition de départager deux
     * missions homonymes, mais à l'index unique. Une base déterministe rend le
     * comportement prévisible ; le `-2` est posé par `ensureMissionAlias`
     * quand l'insertion est refusée. */
    expect(missionAliasLocal("elyas", "Commercial"))
      .toBe(missionAliasLocal("elyas", "commercial"))
  })
})
