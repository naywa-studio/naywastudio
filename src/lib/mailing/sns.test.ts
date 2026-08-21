import { describe, expect, it } from "vitest"
import { isTrustedCertUrl, verifySnsMessage, type SnsMessage } from "./sns"

/**
 * La vérification des notifications SNS.
 *
 * Ce que ces tests protègent : la capacité de n'importe qui à injecter de faux
 * emails entrants dans les fils de discussion des clients. Dans un outil de
 * recrutement, ce serait de fausses réponses de candidats, attribuées à des
 * personnes réelles.
 *
 * Le point le plus dangereux est `isTrustedCertUrl`. `SigningCertURL` vient du
 * message, donc de l'attaquant : s'il peut faire pointer la vérification vers
 * SON certificat, toute signature devient valide et la protection entière
 * tombe. Chaque cas ci-dessous correspond à un contournement réel de ce genre
 * de contrôle.
 */

describe("URL du certificat de signature", () => {
  it("accepte un hôte SNS légitime", () => {
    expect(isTrustedCertUrl(
      "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-abc.pem",
    )).toBe(true)
  })

  it("refuse un domaine qui IMITE le bon en le préfixant", () => {
    // Le contournement classique : une recherche de sous-chaîne laisserait
    // passer, parce que « sns.eu-west-1.amazonaws.com » est bien présent.
    expect(isTrustedCertUrl(
      "https://sns.eu-west-1.amazonaws.com.evil.net/cert.pem",
    )).toBe(false)
  })

  it("refuse un domaine attaquant qui contient le bon ailleurs", () => {
    expect(isTrustedCertUrl(
      "https://evil.net/?x=sns.eu-west-1.amazonaws.com",
    )).toBe(false)
  })

  it("refuse le HTTP en clair", () => {
    // En HTTP, le certificat serait remplaçable en transit — autant faire
    // confiance directement à l'attaquant.
    expect(isTrustedCertUrl(
      "http://sns.eu-west-1.amazonaws.com/cert.pem",
    )).toBe(false)
  })

  it("refuse un sous-domaine d'amazonaws qui n'est pas SNS", () => {
    expect(isTrustedCertUrl("https://s3.eu-west-1.amazonaws.com/cert.pem")).toBe(false)
  })

  it("refuse une URL absente ou illisible", () => {
    expect(isTrustedCertUrl(undefined)).toBe(false)
    expect(isTrustedCertUrl("")).toBe(false)
    expect(isTrustedCertUrl("pas-une-url")).toBe(false)
  })
})

describe("vérification d'un message", () => {
  const base: SnsMessage = {
    Type: "Notification",
    MessageId: "id-1",
    TopicArn: "arn:aws:sns:eu-west-1:1:naywa-inbound",
    Message: "{}",
    Timestamp: "2026-08-21T00:00:00.000Z",
    SignatureVersion: "1",
    Signature: "ZmF1c3NlLXNpZ25hdHVyZQ==",
    SigningCertURL: "https://sns.eu-west-1.amazonaws.com/cert.pem",
  }

  it("refuse un message sans signature", async () => {
    const r = await verifySnsMessage({ ...base, Signature: undefined })
    expect(r.ok).toBe(false)
  })

  it("refuse un message sans type", async () => {
    const r = await verifySnsMessage({ ...base, Type: "" })
    expect(r.ok).toBe(false)
  })

  it("refuse un type inconnu", async () => {
    // Un type non prévu n'a pas de chaîne canonique définie : on ne peut pas
    // vérifier, donc on refuse — jamais « on laisse passer par défaut ».
    const r = await verifySnsMessage({ ...base, Type: "SomethingElse" })
    expect(r.ok).toBe(false)
  })

  it("REFUSE AVANT d'aller chercher le certificat si l'URL est hostile", async () => {
    // Le test qui compte : la requête réseau ne doit jamais partir vers un
    // hôte non fiable. Si ce contrôle sautait, l'attaquant fournirait sa clé
    // et sa signature serait acceptée.
    const r = await verifySnsMessage({
      ...base,
      SigningCertURL: "https://sns.eu-west-1.amazonaws.com.evil.net/cert.pem",
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain("non fiable")
  })

  it("ne jette jamais : renvoie toujours un verdict", async () => {
    // L'appelant répond 403 sans distinguer attaque et panne, mais doit
    // pouvoir journaliser la raison. Une exception non rattrapée produirait
    // un 500 et ferait retenter SNS en boucle.
    const r = await verifySnsMessage({} as SnsMessage)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(typeof r.reason).toBe("string")
  })
})
