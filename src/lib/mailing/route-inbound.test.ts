import { describe, expect, it } from "vitest"
import { stripQuotedReply, stripSignature } from "./route-inbound"

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

/**
 * Découpage de la signature — appliqué à l'ANALYSE seulement.
 *
 * Le message stocké garde sa signature : elle contient le téléphone et le
 * poste du candidat, information neuve que le sourceur veut lire. Elle ne gêne
 * qu'à l'entrée de l'analyse de sentiment, où « Founder & CEO — Naywa Studio »
 * pèse autant que la réponse et peut la dominer sur un message court.
 *
 * Le risque de ces tests est SYMÉTRIQUE, et c'est ce qu'ils gardent : couper
 * trop peu laisse la signature fausser l'analyse ; couper trop supprime une
 * phrase du candidat, ce qui la fausse tout autant — en plus discret.
 */

describe("stripSignature", () => {
  it("coupe au délimiteur normalisé", () => {
    const out = stripSignature([
      "Bonjour, je suis très intéressé par ce poste.",
      "-- ",
      "Elyas Malki",
      "Founder & CEO — Naywa Studio",
      "+33 6 00 00 00 00",
    ].join("\n"))
    expect(out).toBe("Bonjour, je suis très intéressé par ce poste.")
  })

  it("coupe après une formule de politesse, en la GARDANT", () => {
    // « Cordialement » n'est pas du bruit : c'est du ton, et le ton compte
    // pour une analyse de sentiment.
    const out = stripSignature([
      "Merci pour votre message, je suis disponible dès septembre.",
      "",
      "Cordialement,",
      "Elyas Malki",
      "Founder & CEO — Naywa Studio",
    ].join("\n"))
    expect(out).toContain("disponible dès septembre")
    expect(out).toContain("Cordialement")
    expect(out).not.toContain("Founder & CEO")
  })

  it("reconnaît les formules anglaises", () => {
    const out = stripSignature("Sounds great, count me in.\n\nBest regards,\nJohn Smith\nCTO, Acme")
    expect(out).toContain("count me in")
    expect(out).not.toContain("Acme")
  })

  it("NE COUPE PAS si le texte reprend longuement après la formule", () => {
    // Un « merci » en milieu de message n'est pas une frontière de signature.
    // Le confondre supprimerait la vraie réponse du candidat.
    const text = [
      "Merci",
      "pour votre proposition. Je dois cependant décliner :",
      "je viens d'accepter une autre offre, à Lyon, dans une équipe",
      "que je connais déjà. Je reste disponible si le poste",
      "se rouvrait plus tard dans l'année, et je vous recommande",
      "vivement de contacter un ancien collègue, très bon profil,",
      "que je peux vous présenter si vous le souhaitez.",
      "N'hésitez pas à revenir vers moi.",
      "Encore une fois, désolé pour ce contretemps.",
    ].join("\n")
    expect(stripSignature(text)).toBe(text)
  })

  it("laisse intact un message sans signature", () => {
    const text = "Bonjour, pouvez-vous me préciser le salaire proposé ?"
    expect(stripSignature(text)).toBe(text)
  })

  it("garde le texte ENTIER si la coupe ne laisserait presque rien", () => {
    // Message d'une ligne suivi d'une signature : couper laisserait un corps
    // vide, donc une analyse sur du vide — pire que l'analyse polluée.
    const out = stripSignature("Ok\n-- \nElyas Malki\nNaywa Studio")
    expect(out).toContain("Ok")
  })

  it("ne confond pas une ligne de tirets décorative avec le délimiteur", () => {
    const text = "Voici ma réponse détaillée.\n------\nUn point important ensuite."
    expect(stripSignature(text)).toBe(text)
  })

  it("préserve les accents", () => {
    expect(stripSignature("Je suis à Paris cet été.")).toContain("été")
  })
})
