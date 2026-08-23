import { describe, expect, it } from "vitest"
import { dailySendLimit, DAILY_SENDS_PER_SEAT, DAILY_SENDS_MINIMUM } from "./send-cap"

/**
 * Plafond d'envoi quotidien par organisation.
 *
 * Ce que ces tests protègent n'est pas un confort : chez SES la réputation est
 * celle du COMPTE. Un seul cabinet qui envoie massivement fait suspendre
 * l'envoi de TOUS les autres.
 *
 * Et c'est une promesse écrite : la demande d'accès production déposée chez
 * AWS dit « We enforce a per-customer daily sending cap in our application ».
 * Avant ce plafond, le seul existant était de 10 000 par utilisateur et par
 * jour — c'est-à-dire aucun.
 */

describe("dailySendLimit", () => {
  it("laisse une marge de travail réelle à un cabinet d'une personne", () => {
    // Décrit à AWS : « 10 à 30 messages par jour ouvré et par recruteur ».
    // Le plafond doit tenir une journée dense sans jamais gêner l'usage normal.
    expect(dailySendLimit(1)).toBe(DAILY_SENDS_MINIMUM)
    expect(dailySendLimit(1)).toBeGreaterThanOrEqual(30)
  })

  it("croît avec les sièges", () => {
    expect(dailySendLimit(4)).toBe(4 * DAILY_SENDS_PER_SEAT)
    expect(dailySendLimit(10)).toBeGreaterThan(dailySendLimit(4))
  })

  it("ne descend JAMAIS sous le plancher", () => {
    // Sièges nuls, absents ou incohérents : un plafond à zéro bloquerait tout
    // envoi d'un cabinet qui paie. Se tromper du bon côté, ici, c'est laisser
    // travailler.
    for (const seats of [0, -5, null, undefined, 0.4]) {
      expect(dailySendLimit(seats as number)).toBe(DAILY_SENDS_MINIMUM)
    }
  })

  it("reste très en dessous du quota SES d'un compte en bac à sable", () => {
    // 200 envois par 24 h en bac à sable. Un cabinet seul ne doit pas pouvoir
    // le consommer entièrement et couper les autres.
    expect(dailySendLimit(1)).toBeLessThan(200)
  })
})
