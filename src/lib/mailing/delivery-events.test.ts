import { describe, expect, it } from "vitest"
import { classifySesEvent, shouldApply, type SesEventPayload } from "./delivery-events"

/**
 * Le sort d'un message après son départ.
 *
 * Ce que ces tests protègent : **un envoi qui a échoué doit se voir**. Le
 * défaut qu'ils empêchent ne produit aucune erreur — le message reste
 * simplement « envoyé » pour toujours, et le sourceur relance un candidat qui
 * n'a jamais rien reçu.
 */

const mail = (p: Partial<SesEventPayload>): SesEventPayload => ({
  mail: { messageId: "0102-abc" }, ...p,
})

describe("classifySesEvent", () => {
  it("un rebond permanent est un échec, et il est nommé", () => {
    const v = classifySesEvent(mail({
      eventType: "Bounce",
      bounce: { bounceType: "Permanent", bounceSubType: "NoEmail" },
    }))
    expect(v).toMatchObject({ providerId: "0102-abc", status: "bounced" })
    expect(v!.error).toContain("n'existe pas")
  })

  it("un rebond transitoire ne change PAS l'état", () => {
    // Boîte pleine : SES réessaie. Annoncer un échec ferait abandonner un
    // candidat parfaitement joignable.
    const v = classifySesEvent(mail({
      eventType: "Bounce",
      bounce: { bounceType: "Transient", bounceSubType: "MailboxFull" },
    }))
    expect(v!.status).toBeNull()
    expect(v!.error).toContain("différée")
  })

  it("une cause indéterminée est traitée comme transitoire", () => {
    // Arbitrage explicite : se tromper en annonçant un échec coûte plus cher
    // que se tromper en restant silencieux.
    expect(classifySesEvent(mail({
      eventType: "Bounce", bounce: { bounceType: "Undetermined" },
    }))!.status).toBeNull()
  })

  it("distingue la plainte du rebond", () => {
    expect(classifySesEvent(mail({ eventType: "Complaint" }))!.status).toBe("complained")
  })

  it("accepte les deux noms de champ d'AWS", () => {
    // Jeu de configuration → `eventType` ; notification d'identité →
    // `notificationType`. N'en lire qu'un rendrait ce code muet le jour d'un
    // changement de câblage, sans rien casser de visible.
    expect(classifySesEvent(mail({ notificationType: "Delivery" }))!.status).toBe("delivered")
  })

  it("ignore ce qui ne parle pas d'acheminement", () => {
    expect(classifySesEvent(mail({ eventType: "Open" }))).toBeNull()
    expect(classifySesEvent(mail({ eventType: "Click" }))).toBeNull()
  })

  it("sans identifiant de message, il n'y a rien à rapprocher", () => {
    expect(classifySesEvent({ eventType: "Bounce" })).toBeNull()
  })
})

describe("précédence des états", () => {
  it("une remise tardive n'efface JAMAIS un rebond", () => {
    // SNS ne garantit pas l'ordre et retente : c'est un cas réel, pas
    // théorique. Sans cette règle, la plainte disparaîtrait de l'écran.
    expect(shouldApply("bounced", "delivered")).toBe(false)
    expect(shouldApply("complained", "delivered")).toBe(false)
  })

  it("mais une plainte postérieure à une remise passe", () => {
    expect(shouldApply("delivered", "complained")).toBe(true)
  })

  it("le chemin normal reste ouvert", () => {
    expect(shouldApply("sent", "delivered")).toBe(true)
    expect(shouldApply("sent", "bounced")).toBe(true)
  })

  it("un même événement rejoué ne change rien", () => {
    // SNS retente jusqu'à obtenir un 2xx : le même événement arrive plusieurs
    // fois, et doit rester sans effet.
    expect(shouldApply("delivered", "delivered")).toBe(false)
    expect(shouldApply("bounced", "bounced")).toBe(false)
  })
})
