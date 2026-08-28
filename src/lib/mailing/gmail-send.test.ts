import { describe, expect, it } from "vitest"
import { buildRawMessage } from "./gmail-send"

/**
 * L'assemblage du message envoyé par la boîte du sourceur.
 *
 * L'API Gmail veut un message RFC 822 complet : on écrit les en-têtes à la
 * main. C'est donc ici, et nulle part ailleurs, que se joue l'injection
 * d'en-têtes — et un défaut n'y produirait **aucune erreur**, seulement un
 * message parti avec un destinataire caché que le sourceur ne verrait jamais.
 */

const base = {
  fromEmail: "sophie@cabinet-durand.fr",
  to: "marc@exemple.fr",
  subject: "Une opportunité",
  text: "Bonjour Marc,\n\nAu plaisir,\nSophie",
}

/** Les en-têtes seuls, avant la ligne vide qui ouvre le corps. */
function headers(raw: string): string[] {
  return raw.split("\r\n\r\n")[0].split("\r\n")
}

describe("assemblage du message", () => {
  it("pose les en-têtes essentiels", () => {
    const h = headers(buildRawMessage(base))
    expect(h).toContain("To: marc@exemple.fr")
    expect(h).toContain("From: sophie@cabinet-durand.fr")
    expect(h).toContain("MIME-Version: 1.0")
  })

  it("encode un sujet accentué, sinon il arrive illisible", () => {
    // Un sujet en français contient presque toujours un accent : sans la
    // RFC 2047, le candidat lit une suite de caractères cassés.
    const raw = buildRawMessage({ ...base, subject: "Opportunité chez un client" })
    const subject = headers(raw).find((l) => l.startsWith("Subject:"))!
    expect(subject).toMatch(/^Subject: =\?UTF-8\?B\?/)
    const encoded = subject.replace("Subject: =?UTF-8?B?", "").replace("?=", "")
    expect(Buffer.from(encoded, "base64").toString("utf8")).toBe("Opportunité chez un client")
  })

  it("laisse un sujet purement ASCII en clair", () => {
    expect(headers(buildRawMessage({ ...base, subject: "Hello" })))
      .toContain("Subject: Hello")
  })

  it("le corps survit à l'aller-retour, accents compris", () => {
    const texte = "Bonjour Marc,\n\nJ'ai vu votre parcours — intéressant.\nSophie"
    const raw = buildRawMessage({ ...base, text: texte })
    const body = raw.split("\r\n\r\n").slice(1).join("\r\n\r\n").replace(/\r\n/g, "")
    expect(Buffer.from(body, "base64").toString("utf8")).toBe(texte)
  })
})

describe("injection d'en-têtes", () => {
  it("un saut de ligne dans le SUJET n'ajoute pas d'en-tête", () => {
    // L'attaque classique : refermer le sujet pour glisser un `Bcc:`. Le
    // message partirait à un destinataire caché, sans trace pour le sourceur.
    const raw = buildRawMessage({
      ...base,
      subject: "Bonjour\r\nBcc: espion@ailleurs.fr",
    })
    expect(headers(raw).some((l) => /^Bcc:/i.test(l))).toBe(false)
  })

  it("un saut de ligne dans le NOM affiché non plus", () => {
    const raw = buildRawMessage({
      ...base,
      fromName: "Sophie\r\nBcc: espion@ailleurs.fr",
    })
    expect(headers(raw).some((l) => /^Bcc:/i.test(l))).toBe(false)
  })

  it("une arobase dans le nom ne fabrique pas un faux expéditeur", () => {
    // Sans ce filtre, « Sophie x@evil.com » s'afficherait tel quel chez le
    // candidat, qui lirait un expéditeur qui n'en est pas un.
    const from = headers(buildRawMessage({ ...base, fromName: "Sophie x@evil.com" }))
      .find((l) => l.startsWith("From:"))!
    expect(from).toContain("<sophie@cabinet-durand.fr>")
    expect(from).not.toContain("x@evil.com")
  })

  it("un nom d'en-tête personnalisé est assaini", () => {
    // Un « : » ou un saut de ligne dans le NOM permettrait d'en fabriquer un
    // second — le filtrage de la valeur seule ne suffirait pas.
    const raw = buildRawMessage({
      ...base,
      headers: { "X-Truc\r\nBcc": "espion@ailleurs.fr" },
    })
    expect(headers(raw).some((l) => /^Bcc:/i.test(l))).toBe(false)
  })

  it("laisse passer les en-têtes légitimes", () => {
    const h = headers(buildRawMessage({
      ...base,
      headers: { "List-Unsubscribe": "<https://naywastudio.com/x>" },
      replyTo: "sophie@cabinet-durand.fr",
    }))
    expect(h).toContain("List-Unsubscribe: <https://naywastudio.com/x>")
    expect(h).toContain("Reply-To: sophie@cabinet-durand.fr")
  })
})
