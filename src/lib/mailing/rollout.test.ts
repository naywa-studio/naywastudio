import { describe, expect, it } from "vitest"
import { mailingVisible, MAILING_LAUNCHED } from "./rollout"

/**
 * Garde-fou de lancement du Mailing.
 *
 * Il protège deux situations concrètes, et non une abstraction :
 *
 *  - GMH, le seul client payant, verrait un interrupteur « Mailing · 9,99 € »
 *    dont le clic répondrait « Modification impossible », faute de prix dans
 *    le catalogue LIVE ;
 *  - une organisation en essai pourrait publier son DNS, faire vérifier son
 *    domaine, puis constater que chaque envoi échoue — SES étant en bac à
 *    sable. Elle aurait fait le travail pour rien.
 */

describe("mailingVisible", () => {
  it("cache la fonctionnalité aux clients tant que le lancement n'est pas ouvert", () => {
    if (MAILING_LAUNCHED) return // une fois ouvert, ce test n'a plus d'objet
    expect(mailingVisible({ is_admin: false })).toBe(false)
    expect(mailingVisible({})).toBe(false)
    expect(mailingVisible(null)).toBe(false)
    expect(mailingVisible(undefined)).toBe(false)
  })

  it("la laisse toujours aux admins Naywa", () => {
    // C'est ainsi qu'on continue de l'éprouver en conditions réelles sans
    // rien montrer aux clients.
    expect(mailingVisible({ is_admin: true })).toBe(true)
  })

  it("ne prend rien d'autre pour un droit d'accès", () => {
    // Un `is_admin` absent ou nul ne doit jamais valoir vrai par accident.
    expect(mailingVisible({ is_admin: null })).toBe(MAILING_LAUNCHED)
  })
})
