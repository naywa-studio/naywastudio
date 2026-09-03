import { describe, expect, it } from "vitest"
import {
  encodeMatchToken, decodeMatchToken, replyAddressFor, parseReplyAddress, TOKEN_LENGTH,
} from "./reply-address"

/**
 * Un encodage réversible se teste par son ALLER-RETOUR, pas par ses valeurs :
 * figer une chaîne attendue ne prouverait que la constance, jamais la
 * correction. Et ce qui doit être tenu ici est brutal — un jeton mal décodé
 * rattache la réponse d'un candidat à la mauvaise conversation, ou la perd.
 */

const UUID = "3a5fcf8d-0f0b-4190-babd-b1686de9b751"

describe("l'aller-retour du jeton", () => {
  it("retrouve exactement l'identifiant", () => {
    const token = encodeMatchToken(UUID)!
    expect(decodeMatchToken(token)).toBe(UUID)
  })

  it("tient dans 26 caractères, quel que soit l'identifiant", () => {
    // C'est LA contrainte : la partie locale d'une adresse est limitée à 64
    // caractères, et un identifiant en clair en fait 36.
    for (const id of [
      "00000000-0000-0000-0000-000000000000",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
      UUID,
    ]) {
      const token = encodeMatchToken(id)!
      expect(token).toHaveLength(TOKEN_LENGTH)
      expect(decodeMatchToken(token)).toBe(id)
    }
  })

  it("n'emploie que des caractères sûrs dans une adresse", () => {
    expect(encodeMatchToken(UUID)!).toMatch(/^[a-z2-7]+$/)
  })

  it("ignore la casse au décodage — une adresse n'est pas sensible à la casse", () => {
    const token = encodeMatchToken(UUID)!
    expect(decodeMatchToken(token.toUpperCase())).toBe(UUID)
  })

  it("refuse ce qui n'est pas un identifiant", () => {
    expect(encodeMatchToken("pas-un-uuid")).toBeNull()
    expect(encodeMatchToken("")).toBeNull()
  })

  it("refuse un jeton tronqué, rallongé ou altéré", () => {
    const token = encodeMatchToken(UUID)!
    expect(decodeMatchToken(token.slice(0, -1))).toBeNull()
    expect(decodeMatchToken(token + "a")).toBeNull()
    expect(decodeMatchToken("!".repeat(TOKEN_LENGTH))).toBeNull()
  })
})

describe("fabriquer l'adresse de réponse", () => {
  it("insère le jeton avant l'arobase", () => {
    const address = replyAddressFor("sophie@reply.naywastudio.com", UUID)
    expect(address).toMatch(/^sophie\+[a-z2-7]{26}@reply\.naywastudio\.com$/)
  })

  it("sans mission, l'adresse ne change pas", () => {
    // Un message hors mission doit garder l'ancien comportement plutôt que de
    // porter une adresse bancale.
    expect(replyAddressFor("sophie@reply.naywastudio.com", null))
      .toBe("sophie@reply.naywastudio.com")
  })

  it("un identifiant invalide ne fabrique pas d'adresse invalide", () => {
    expect(replyAddressFor("sophie@reply.naywastudio.com", "n'importe quoi"))
      .toBe("sophie@reply.naywastudio.com")
  })

  it("renonce au jeton plutôt que de dépasser 64 caractères", () => {
    // Perdre la précision du rattachement est réparable ; un message qui
    // rebondit n'atteint jamais le candidat.
    const longue = "a".repeat(40)
    const address = replyAddressFor(`${longue}@reply.naywastudio.com`, UUID)
    expect(address).toBe(`${longue}@reply.naywastudio.com`)
  })

  it("accepte une partie locale juste en dessous de la limite", () => {
    const local = "b".repeat(37) // 37 + 1 + 26 = 64
    const address = replyAddressFor(`${local}@reply.naywastudio.com`, UUID)
    expect(address.split("@")[0]).toHaveLength(64)
  })
})

describe("décomposer une adresse reçue", () => {
  it("sépare le sourceur de la conversation", () => {
    const address = replyAddressFor("sophie@reply.naywastudio.com", UUID)
    expect(parseReplyAddress(address)).toEqual({
      base: "sophie@reply.naywastudio.com", matchId: UUID,
    })
  })

  it("une adresse sans suffixe reste rattachée — c'est le cas de TOUT l'existant", () => {
    // Les réponses aux messages déjà envoyés n'ont pas de jeton. Les rejeter
    // ferait perdre en silence les échanges en cours le jour du déploiement.
    expect(parseReplyAddress("sophie@reply.naywastudio.com")).toEqual({
      base: "sophie@reply.naywastudio.com", matchId: null,
    })
  })

  it("un suffixe bricolé ne fait pas perdre le message", () => {
    // Un candidat qui ajoute « +test » à la main, un client de messagerie
    // exotique : on retombe sur le rattachement par défaut.
    expect(parseReplyAddress("sophie+test@reply.naywastudio.com")).toEqual({
      base: "sophie@reply.naywastudio.com", matchId: null,
    })
  })

  it("normalise la casse et les espaces", () => {
    const token = encodeMatchToken(UUID)!
    expect(parseReplyAddress(`  Sophie+${token.toUpperCase()}@Reply.Naywastudio.com `))
      .toEqual({ base: "sophie@reply.naywastudio.com", matchId: UUID })
  })

  it("ne casse pas sur une adresse absurde", () => {
    expect(parseReplyAddress("pas-une-adresse")).toEqual({
      base: "pas-une-adresse", matchId: null,
    })
  })

  it("plusieurs « + » : seul le premier sépare", () => {
    const token = encodeMatchToken(UUID)!
    expect(parseReplyAddress(`sophie+${token}+autre@reply.naywastudio.com`).matchId).toBeNull()
    expect(parseReplyAddress(`sophie+${token}+autre@reply.naywastudio.com`).base)
      .toBe("sophie@reply.naywastudio.com")
  })
})
