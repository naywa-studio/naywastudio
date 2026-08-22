import { describe, expect, it } from "vitest"
import { checkRootDomain, cleanSubdomain } from "./domain-input"

/**
 * Le domaine saisi par le client.
 *
 * Cette chaîne devient un nom DNS déclaré chez AWS, une partie d'adresse
 * d'expédition, et une clé d'unicité entre organisations. Trois usages où une
 * valeur douteuse ne produit pas une erreur claire, mais un domaine déclaré
 * pour rien, une adresse invalide, ou un conflit incompréhensible.
 */

describe("checkRootDomain", () => {
  it("accepte un domaine ordinaire", () => {
    expect(checkRootDomain("cabinet-durand.fr")).toMatchObject({ ok: true, value: "cabinet-durand.fr" })
  })

  it("survit à un copier-coller depuis la barre d'adresse", () => {
    // Le cas le plus fréquent, et de loin : le client colle une URL.
    for (const input of [
      "https://www.cabinet-durand.fr/",
      "HTTP://Cabinet-Durand.FR",
      "  www.cabinet-durand.fr  ",
      "cabinet-durand.fr.",
      "cabinet-durand.fr/contact?x=1",
    ]) {
      expect(checkRootDomain(input)).toMatchObject({ ok: true, value: "cabinet-durand.fr" })
    }
  })

  it("accepte un sous-domaine et un TLD composé", () => {
    expect(checkRootDomain("recrutement.cabinet.co.uk").ok).toBe(true)
  })

  it("REFUSE le domaine de Naywa et ses sous-domaines", () => {
    // Un client ne revendique pas notre identité : il enverrait sous notre
    // marque, et récupérerait le courrier qui nous est destiné.
    expect(checkRootDomain("naywastudio.com")).toMatchObject({ ok: false, reason: "reserved" })
    expect(checkRootDomain("careers.naywastudio.com")).toMatchObject({ ok: false, reason: "reserved" })
    expect(checkRootDomain("mail.naywastudio.com")).toMatchObject({ ok: false, reason: "reserved" })
  })

  it("refuse ce qui ne peut pas porter de DKIM", () => {
    expect(checkRootDomain("192.168.1.1").ok).toBe(false)
    expect(checkRootDomain("localhost").ok).toBe(false)
    expect(checkRootDomain("fr").ok).toBe(false)
    expect(checkRootDomain("1.2").ok).toBe(false)
  })

  it("refuse une saisie vide ou malformée", () => {
    expect(checkRootDomain("")).toMatchObject({ ok: false, reason: "empty" })
    expect(checkRootDomain(null)).toMatchObject({ ok: false, reason: "empty" })
    expect(checkRootDomain("cabinet durand.fr").ok).toBe(false)
    expect(checkRootDomain("-cabinet.fr").ok).toBe(false)
    expect(checkRootDomain("cabinet-.fr").ok).toBe(false)
    expect(checkRootDomain("cabinet..fr").ok).toBe(false)
  })

  it("refuse une saisie démesurée", () => {
    expect(checkRootDomain(`${"a".repeat(200)}.fr`)).toMatchObject({ ok: false, reason: "too_long" })
  })

  it("ne laisse jamais passer un caractère hors nom de domaine", () => {
    // Invariant de synthèse : ce qui sort est utilisable tel quel dans un nom
    // DNS et dans une adresse email. Sans ça, une injection remonterait
    // jusqu'à l'en-tête From.
    for (const hostile of [
      "cabinet.fr\r\nBcc: tout@le-monde.fr",
      "cabinet.fr<script>",
      "a@b.fr",
      "cabinet.fr;evil.com",
      "café.fr",
    ]) {
      const out = checkRootDomain(hostile)
      if (out.ok) expect(out.value).toMatch(/^[a-z0-9.-]+$/)
    }
  })
})

describe("cleanSubdomain", () => {
  it("normalise une étiquette valide", () => {
    expect(cleanSubdomain("  Careers ")).toBe("careers")
    expect(cleanSubdomain("jobs-2026")).toBe("jobs-2026")
  })

  it("renvoie null plutôt que de bloquer sur un champ facultatif", () => {
    // L'appelant retombe alors sur « careers ». Personne ne doit être arrêté
    // par un champ optionnel.
    expect(cleanSubdomain("")).toBeNull()
    expect(cleanSubdomain("careers.mail")).toBeNull()
    expect(cleanSubdomain("-jobs")).toBeNull()
    expect(cleanSubdomain("job s")).toBeNull()
  })
})
