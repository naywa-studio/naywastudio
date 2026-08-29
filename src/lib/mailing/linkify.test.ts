import { describe, expect, it } from "vitest"
import { linkify, isSafeHref } from "./linkify"

/**
 * Rendre les liens d'un message cliquables.
 *
 * Le contenu vient d'un inconnu, et il s'affiche dans la session d'un
 * sourceur connecté. Ces tests protègent les deux bouts : que les vrais liens
 * marchent, et qu'un `javascript:` ne devienne jamais cliquable.
 */

const links = (t: string) => linkify(t).filter((s) => s.kind === "link")

describe("détection des liens", () => {
  it("reconnaît une URL nue", () => {
    expect(links("Voir https://naywastudio.com/ pour la suite"))
      .toEqual([{ kind: "link", label: "https://naywastudio.com/", href: "https://naywastudio.com/" }])
  })

  it("démêle le motif `libellé<url>` des signatures", () => {
    // C'est ce que produit une messagerie en convertissant `<a href>` en
    // texte. Sans ce cas, le sourceur lit
    // « naywastudio.com<https://naywastudio.com/> » dans chaque signature.
    expect(links("naywastudio.com<https://naywastudio.com/>"))
      .toEqual([{ kind: "link", label: "naywastudio.com", href: "https://naywastudio.com/" }])
  })

  it("complète un `www.` sans schéma", () => {
    // Sans schéma, l'attribut `href` produirait un lien RELATIF — donc une
    // page de Naywa qui n'existe pas, au lieu du site visé.
    expect(links("www.exemple.fr")[0]).toMatchObject({ href: "https://www.exemple.fr" })
  })

  it("ne mange pas la ponctuation finale", () => {
    const segs = linkify("Allez sur https://naywastudio.com.")
    expect(segs.find((s) => s.kind === "link")).toMatchObject({ href: "https://naywastudio.com" })
    expect(segs[segs.length - 1]).toEqual({ kind: "text", value: "." })
  })

  it("préserve le texte autour, à l'identique", () => {
    const t = "Bonjour,\n\nVoici https://x.fr\n\nCordialement"
    expect(linkify(t).map((s) => (s.kind === "link" ? s.label : s.value)).join("")).toBe(t)
  })

  it("laisse un texte sans lien intact", () => {
    expect(linkify("Merci pour votre message")).toEqual([
      { kind: "text", value: "Merci pour votre message" },
    ])
  })
})

describe("sûreté du lien", () => {
  it("n'accepte que http, https et mailto", () => {
    expect(isSafeHref("https://x.fr")).toBe(true)
    expect(isSafeHref("mailto:a@b.fr")).toBe(true)
    // Sans ce filtre, un `javascript:` glissé dans un message de candidat
    // s'exécuterait au clic, dans la session du sourceur.
    expect(isSafeHref("javascript:alert(1)")).toBe(false)
    expect(isSafeHref("  JavaScript:alert(1)")).toBe(false)
    expect(isSafeHref("data:text/html,<script>")).toBe(false)
    expect(isSafeHref("file:///etc/passwd")).toBe(false)
  })
})
