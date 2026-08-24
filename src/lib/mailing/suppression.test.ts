import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { isGlobalSuppression, normalizeEmail, explainSuppression } from "./suppression"
import { unsubscribeToken, readUnsubscribeToken, unsubscribeHeaders } from "./unsubscribe"

/**
 * Ne plus écrire à ceux qui ont dit non.
 *
 * Deux défauts que ces tests empêchent, et aucun des deux ne lève d'exception :
 * bloquer trop (un cabinet privé d'un candidat joignable) ou trop peu (une
 * adresse morte recontactée indéfiniment, ce qui fait suspendre le compte
 * d'envoi de TOUS les cabinets).
 */

describe("portée d'une suppression", () => {
  it("un rebond et une plainte valent pour tout le monde", () => {
    // Le rebond parle de l'ADRESSE (elle n'existe pas) ; la plainte parle du
    // COMPTE (c'est notre taux de plaintes chez AWS qui monte).
    expect(isGlobalSuppression("bounce")).toBe(true)
    expect(isGlobalSuppression("complaint")).toBe(true)
  })

  it("une désinscription ne vaut que pour le cabinet concerné", () => {
    // Elle parle d'une RELATION. La propager déciderait à la place du candidat,
    // et ferait fuiter d'un cabinet vers un autre le fait qu'il a refusé.
    expect(isGlobalSuppression("unsubscribe")).toBe(false)
    expect(isGlobalSuppression("manual")).toBe(false)
  })

  it("normalise l'adresse pour qu'une majuscule ne contourne pas le filtre", () => {
    expect(normalizeEmail("  Marc.Durand@Exemple.FR ")).toBe("marc.durand@exemple.fr")
  })

  it("explique chaque motif au sourceur, y compris l'échec de lecture", () => {
    expect(explainSuppression("bounce")).toContain("n'existe plus")
    expect(explainSuppression("unsubscribe")).toContain("ne plus être contacté")
    // Le cas `null` compte : sur erreur de lecture on refuse l'envoi, et le
    // sourceur doit comprendre que c'est temporaire, pas définitif.
    expect(explainSuppression(null)).toContain("Réessayez")
  })
})

describe("jeton de désinscription", () => {
  const ORG = "11111111-1111-4111-8111-111111111111"

  beforeEach(() => { process.env.MAILING_UNSUBSCRIBE_SECRET = "secret-de-test-tres-long" })
  afterEach(() => { delete process.env.MAILING_UNSUBSCRIBE_SECRET })

  it("fait l'aller-retour", () => {
    const t = unsubscribeToken("Marc@Exemple.fr", ORG)!
    expect(readUnsubscribeToken(t)).toEqual({ email: "marc@exemple.fr", organizationId: ORG })
  })

  it("refuse un jeton modifié", () => {
    // Sans signature, l'URL contiendrait une adresse en clair modifiable :
    // n'importe qui désinscrirait n'importe quel candidat de n'importe quel
    // cabinet en changeant un paramètre.
    const t = unsubscribeToken("marc@exemple.fr", ORG)!
    const [body, sig] = t.split(".")
    const autre = Buffer.from(`victime@exemple.fr:${ORG}`, "utf8").toString("base64url")
    expect(readUnsubscribeToken(`${autre}.${sig}`)).toBeNull()
    expect(readUnsubscribeToken(`${body}.${sig.slice(0, -2)}xy`)).toBeNull()
    expect(readUnsubscribeToken("n'importe quoi")).toBeNull()
    expect(readUnsubscribeToken(null)).toBeNull()
  })

  it("refuse un jeton signé avec un AUTRE secret", () => {
    const t = unsubscribeToken("marc@exemple.fr", ORG)!
    process.env.MAILING_UNSUBSCRIBE_SECRET = "un-autre-secret"
    expect(readUnsubscribeToken(t)).toBeNull()
  })

  it("sans secret, pas de jeton et SURTOUT pas d'en-tête", () => {
    delete process.env.MAILING_UNSUBSCRIBE_SECRET
    delete process.env.CRON_SECRET
    expect(unsubscribeToken("marc@exemple.fr", ORG)).toBeNull()
    // Un en-tête `List-Unsubscribe` pointant vers un lien non fonctionnel
    // serait pire que pas d'en-tête : la messagerie l'annonce au candidat.
    expect(unsubscribeHeaders("marc@exemple.fr", ORG, "https://naywastudio.com")).toEqual({})
  })

  it("produit les deux en-têtes attendus par Gmail et Outlook", () => {
    const h = unsubscribeHeaders("marc@exemple.fr", ORG, "https://naywastudio.com/")
    expect(h["List-Unsubscribe"]).toMatch(/^<https:\/\/naywastudio\.com\/api\/mailing\/unsubscribe\?t=.+>$/)
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
  })
})
