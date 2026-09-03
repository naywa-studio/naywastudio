import { describe, expect, it } from "vitest"
import { newReplyToken, replyAddressFor, parseReplyAddress, TOKEN_LENGTH } from "./reply-address"

/**
 * L'adresse de réponse, que le CANDIDAT voit dans son champ « répondre à ».
 *
 * Deux enjeux, et ils tirent en sens inverse : elle doit rattacher la réponse
 * à la bonne conversation (donc porter un jeton), et rester présentable (donc
 * rester courte). Ce fichier protège les deux, plus le repli — sans lequel une
 * mise en production perdrait en silence tous les échanges en cours.
 */

const TOKEN = "k3f9d2a7"

describe("le jeton", () => {
  it("fait la longueur annoncée et n'emploie que des caractères sûrs", () => {
    for (let i = 0; i < 200; i++) {
      const t = newReplyToken()
      expect(t).toHaveLength(TOKEN_LENGTH)
      expect(t).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]+$/)
    }
  })

  it("évite les caractères confondables", () => {
    // Cette adresse finit recopiée à la main ou lue dans une capture de
    // support : un « 0 » pris pour un « o » transforme cinq minutes en enquête.
    const echantillon = Array.from({ length: 300 }, newReplyToken).join("")
    for (const interdit of ["0", "1", "i", "l", "o"]) {
      expect(echantillon).not.toContain(interdit)
    }
  })

  it("ne se répète pas", () => {
    // Pas une preuve d'unicité — c'est l'index unique qui la garantit — mais
    // un générateur figé se verrait immédiatement ici.
    const tirages = new Set(Array.from({ length: 500 }, newReplyToken))
    expect(tirages.size).toBe(500)
  })
})

describe("fabriquer l'adresse de réponse", () => {
  it("reste courte et lisible", () => {
    const address = replyAddressFor("sophie@reply.naywastudio.com", TOKEN)
    expect(address).toBe("sophie+k3f9d2a7@reply.naywastudio.com")
    // C'était l'objet du changement : l'ancienne version en faisait 26.
    expect(address.split("@")[0].length).toBeLessThanOrEqual(16)
  })

  it("sans jeton, l'adresse ne change pas", () => {
    // Un message hors mission garde l'ancien comportement plutôt que de
    // porter une adresse bancale.
    expect(replyAddressFor("sophie@reply.naywastudio.com", null))
      .toBe("sophie@reply.naywastudio.com")
  })

  it("un jeton malformé ne fabrique pas d'adresse", () => {
    for (const mauvais of ["", "trop-court", "AVEC-MAJ", "abcdefgh0"]) {
      expect(replyAddressFor("sophie@reply.naywastudio.com", mauvais))
        .toBe("sophie@reply.naywastudio.com")
    }
  })

  it("renonce au jeton plutôt que de dépasser 64 caractères", () => {
    // Perdre la précision du rattachement est réparable ; un message qui
    // rebondit n'atteint jamais le candidat.
    const longue = "a".repeat(60)
    expect(replyAddressFor(`${longue}@reply.naywastudio.com`, TOKEN))
      .toBe(`${longue}@reply.naywastudio.com`)
  })
})

describe("décomposer une adresse reçue", () => {
  it("sépare le sourceur de la conversation", () => {
    expect(parseReplyAddress(`sophie+${TOKEN}@reply.naywastudio.com`)).toEqual({
      base: "sophie@reply.naywastudio.com", token: TOKEN,
    })
  })

  it("une adresse sans suffixe reste rattachée — c'est le cas de TOUT l'existant", () => {
    expect(parseReplyAddress("sophie@reply.naywastudio.com")).toEqual({
      base: "sophie@reply.naywastudio.com", token: null,
    })
  })

  it("un suffixe bricolé ne fait pas perdre le message", () => {
    // Un candidat qui ajoute « +test » à la main, ou l'ANCIEN jeton de 26
    // caractères : on retombe sur le rattachement par déduction.
    for (const suffixe of ["test", "gd7db5hgpbgwbdoybyd6urs4uu"]) {
      expect(parseReplyAddress(`sophie+${suffixe}@reply.naywastudio.com`)).toEqual({
        base: "sophie@reply.naywastudio.com", token: null,
      })
    }
  })

  it("normalise la casse et les espaces", () => {
    expect(parseReplyAddress(`  Sophie+${TOKEN.toUpperCase()}@Reply.Naywastudio.com `))
      .toEqual({ base: "sophie@reply.naywastudio.com", token: TOKEN })
  })

  it("ne casse pas sur une adresse absurde", () => {
    expect(parseReplyAddress("pas-une-adresse")).toEqual({
      base: "pas-une-adresse", token: null,
    })
  })

  it("plusieurs « + » : seul le premier sépare, et le reste invalide le jeton", () => {
    const r = parseReplyAddress(`sophie+${TOKEN}+autre@reply.naywastudio.com`)
    expect(r.base).toBe("sophie@reply.naywastudio.com")
    expect(r.token).toBeNull()
  })

  it("l'aller-retour tient pour n'importe quel jeton tiré", () => {
    for (let i = 0; i < 100; i++) {
      const t = newReplyToken()
      expect(parseReplyAddress(replyAddressFor("sophie@reply.naywastudio.com", t)).token).toBe(t)
    }
  })
})
