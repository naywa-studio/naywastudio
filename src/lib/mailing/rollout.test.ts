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

  it("ouvre aux organisations en AVANT-PREMIÈRE, sans bypass admin", () => {
    // C'est ce qui permet d'éprouver le parcours exactement comme un client :
    // mêmes droits, mêmes écrans, mêmes refus. Un admin ne teste jamais
    // vraiment ce que vit un client -- il contourne les gardes qu'on cherche
    // justement à vérifier.
    expect(mailingVisible({ is_admin: false }, { mailing_early_access: true })).toBe(true)
  })

  it("n'ouvre RIEN sur la foi de `is_test`", () => {
    if (MAILING_LAUNCHED) return
    // Le vrai défaut, trouvé en base : GMH -- le seul client payant -- est
    // marqué `is_test`, dans ses deux organisations et sans aucun admin. Tant
    // que cette porte existait, il voyait en production l'offre d'une option
    // dont le prix n'existe pas encore. Un drapeau posé pour exclure des KPIs
    // ne doit gouverner aucune visibilité produit.
    expect(mailingVisible({ is_admin: false }, { is_test: true } as never)).toBe(false)
  })

  it("ne l'ouvre PAS à une organisation ordinaire", () => {
    if (MAILING_LAUNCHED) return
    expect(mailingVisible({ is_admin: false }, { mailing_early_access: false })).toBe(false)
    expect(mailingVisible({ is_admin: false }, {})).toBe(false)
    expect(mailingVisible({ is_admin: false }, null)).toBe(false)
  })

  it("ne prend rien d'autre pour un droit d'accès", () => {
    // Un `is_admin` absent ou nul ne doit jamais valoir vrai par accident.
    expect(mailingVisible({ is_admin: null })).toBe(MAILING_LAUNCHED)
  })
})
