import { describe, expect, it } from "vitest"
import { stripQuotedReply } from "./route-inbound"

/**
 * Découpage des citations dans une réponse.
 *
 * Code désormais PARTAGÉ par les deux chemins de réception (Resend et SES).
 * Une divergence donnerait des corps de message différents selon le
 * fournisseur, pour un même échange — donc une analyse et un affichage
 * différents.
 *
 * L'enjeu n'est pas cosmétique : le texte retenu alimente l'analyse de
 * sentiment. Si toute la citation reste, l'analyse porte majoritairement sur
 * ce que le SOURCEUR a écrit, pas sur la réponse du candidat.
 */

describe("stripQuotedReply", () => {
  it("garde le texte neuf et coupe la citation Gmail française", () => {
    const out = stripQuotedReply([
      "Bonjour, je suis intéressé.",
      "",
      "Le 21 août 2026 à 14:03, Sophie Durand a écrit :",
      "> Bonjour, j'ai vu votre profil…",
    ].join("\n"))
    expect(out).toContain("je suis intéressé")
    expect(out).not.toContain("j'ai vu votre profil")
  })

  it("coupe la citation anglaise", () => {
    const out = stripQuotedReply([
      "Thanks, not available right now.",
      "",
      "On Aug 21, 2026, at 14:03, Sophie Durand wrote:",
      "> Hello…",
    ].join("\n"))
    expect(out).toBe("Thanks, not available right now.")
  })

  it("coupe au séparateur Outlook", () => {
    const out = stripQuotedReply([
      "Très bien pour moi.",
      "________________________________",
      "De : Sophie Durand",
    ].join("\n"))
    expect(out).toBe("Très bien pour moi.")
  })

  it("coupe sur un bloc d'en-têtes recopiés", () => {
    // Outlook n'envoie pas toujours de séparateur : il recopie l'en-tête.
    const out = stripQuotedReply([
      "Oui, disponible jeudi.",
      "",
      "De : Sophie Durand <sophie@cabinet.fr>",
      "Envoyé : jeudi 21 août 2026",
    ].join("\n"))
    expect(out).toContain("disponible jeudi")
    expect(out).not.toContain("sophie@cabinet.fr")
  })

  it("coupe dès la première ligne citée", () => {
    const out = stripQuotedReply("Non merci.\n\n> Bonjour,\n> je vous contacte…")
    expect(out).toBe("Non merci.")
  })

  it("laisse intact un message sans citation", () => {
    const text = "Bonjour,\n\nJe suis disponible la semaine prochaine.\n\nCordialement"
    expect(stripQuotedReply(text)).toBe(text)
  })

  it("garde le texte ENTIER si la coupe ne laisserait presque rien", () => {
    // Cas réel : le candidat cite d'abord, répond ensuite. Couper à la
    // première citation donnerait un corps vide, et une conversation qui
    // semblerait rester sans réponse. Mieux vaut trop de texte que pas de
    // texte — on ne peut pas deviner ce qui manque.
    const text = "> Bonjour, j'ai vu votre profil…\n\nOui, cela m'intéresse beaucoup."
    expect(stripQuotedReply(text)).toContain("m'intéresse beaucoup")
  })

  it("préserve les accents", () => {
    // L'encodage se casse en silence : personne ne le remarque avant qu'un
    // candidat reçoive un message truffé de caractères abîmés.
    expect(stripQuotedReply("Été prochain, je suis à Paris.")).toContain("Été")
  })
})
