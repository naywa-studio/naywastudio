import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { encryptToken, decryptToken, canStoreTokens } from "./token-crypto"

/**
 * Le chiffrement des jetons OAuth.
 *
 * Ce que ces tests protègent : un jeton de rafraîchissement Google permet
 * d'envoyer des emails au nom de quelqu'un, indéfiniment. Une faute ici ne
 * produit aucune erreur visible — elle produit une base dont la lecture
 * suffirait à écrire aux candidats sous l'identité de nos clients.
 */

const KEY = "une-cle-de-test-suffisamment-longue-pour-passer"

describe("chiffrement des jetons", () => {
  beforeEach(() => { process.env.MAILING_TOKEN_ENC_KEY = KEY })
  afterEach(() => { delete process.env.MAILING_TOKEN_ENC_KEY })

  it("fait l'aller-retour", () => {
    const token = "1//0eXaMpLe-refresh-token-google"
    expect(decryptToken(encryptToken(token))).toBe(token)
  })

  it("produit un chiffré DIFFÉRENT à chaque appel", () => {
    // Le même jeton chiffré deux fois doit donner deux valeurs distinctes :
    // sinon l'IV est réutilisé, et en GCM cela ne fait pas qu'affaiblir le
    // chiffrement — ça peut révéler la clé d'authentification. C'est l'erreur
    // classique, et elle est parfaitement silencieuse.
    const a = encryptToken("meme-jeton")
    const b = encryptToken("meme-jeton")
    expect(a).not.toBe(b)
    expect(decryptToken(a)).toBe("meme-jeton")
    expect(decryptToken(b)).toBe("meme-jeton")
  })

  it("ne laisse RIEN du jeton en clair dans le chiffré", () => {
    const enc = encryptToken("1//0eXaMpLe-refresh-token-google")
    expect(enc).not.toContain("refresh")
    expect(enc).not.toContain("google")
  })

  it("refuse un chiffré ALTÉRÉ plutôt que de rendre des octets faux", () => {
    // C'est tout l'intérêt de GCM face à un mode non authentifié : quelqu'un
    // qui accède à la base ne peut pas modifier un jeton sans que ça se voie.
    const enc = encryptToken("jeton")
    const [iv, tag, data] = enc.split(".")
    expect(decryptToken(`${iv}.${tag}.${data.slice(0, -4)}AAAA`)).toBeNull()
    expect(decryptToken(`${iv}.AAAAAAAAAAAAAAAAAAAAAA.${data}`)).toBeNull()
  })

  it("renvoie null sur une valeur illisible, sans jeter", () => {
    // Un jeton devenu illisible est un état NORMAL du produit — clé tournée,
    // ligne abîmée. La conduite est « demande une reconnexion », pas « plante
    // l'envoi ».
    expect(decryptToken("n'importe quoi")).toBeNull()
    expect(decryptToken("")).toBeNull()
    expect(decryptToken("a.b")).toBeNull()
  })

  it("ne déchiffre pas avec une AUTRE clé", () => {
    const enc = encryptToken("jeton")
    process.env.MAILING_TOKEN_ENC_KEY = "une-autre-cle-tout-aussi-longue-mais-differente"
    expect(decryptToken(enc)).toBeNull()
  })

  it("REFUSE de chiffrer sans clé — pas de repli", () => {
    // Contrairement au secret de désinscription, il n'y a pas de valeur de
    // secours : chiffrer avec une clé devinable donnerait l'illusion d'une
    // protection, ce qui est pire que pas de chiffrement du tout.
    delete process.env.MAILING_TOKEN_ENC_KEY
    expect(canStoreTokens()).toBe(false)
    expect(() => encryptToken("jeton")).toThrow(/MAILING_TOKEN_ENC_KEY/)
  })

  it("refuse une clé trop courte", () => {
    process.env.MAILING_TOKEN_ENC_KEY = "trop-court"
    expect(canStoreTokens()).toBe(false)
  })
})
