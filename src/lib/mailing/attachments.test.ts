import { describe, expect, it } from "vitest"
import { safeFilename } from "./attachments"

/**
 * Assainissement du nom de fichier d'une pièce jointe.
 *
 * Ce nom est écrit par l'expéditeur d'un email — ni authentifié, ni de
 * confiance. Il sert à construire un chemin de stockage. Un nom malveillant
 * écrirait donc chez un autre cabinet : le cloisonnement entre clients est ce
 * que ce produit vend, et il tomberait sur un champ d'en-tête MIME.
 *
 * Deux autres couches existent (chemin construit côté serveur,
 * `assertOrgScopedPath`), mais celle-ci est la première. Chaque cas ci-dessous
 * correspond à une traversée de répertoire réelle.
 */

describe("safeFilename", () => {
  it("garde un nom ordinaire lisible", () => {
    expect(safeFilename("CV_Othmane_OU-AMMOU_V5.pdf")).toBe("CV_Othmane_OU-AMMOU_V5.pdf")
  })

  it("neutralise une traversée de répertoire UNIX", () => {
    const out = safeFilename("../../autre-cabinet/cv.pdf")
    expect(out).not.toContain("..")
    expect(out).not.toContain("/")
    expect(out).toBe("cv.pdf")
  })

  it("neutralise une traversée Windows", () => {
    const out = safeFilename("..\\..\\autre\\cv.pdf")
    expect(out).not.toContain("\\")
    expect(out).not.toContain("..")
    expect(out).toBe("cv.pdf")
  })

  it("neutralise un chemin absolu", () => {
    expect(safeFilename("/etc/passwd")).toBe("passwd")
  })

  it("ne produit jamais un nom commençant par un point", () => {
    // « ..pdf » ou « .htaccess » : noms cachés, et « .. » reste un motif de
    // traversée pour certains systèmes de fichiers.
    expect(safeFilename("...cv.pdf").startsWith(".")).toBe(false)
    expect(safeFilename(".htaccess").startsWith(".")).toBe(false)
  })

  it("retire les accents du CHEMIN sans les perdre pour l'utilisateur", () => {
    // Le nom affiché au sourceur reste l'original, stocké à part : seul le
    // chemin doit voyager en ASCII.
    expect(safeFilename("CV_Améliéré_été.pdf")).toBe("CV_Ameliere_ete.pdf")
  })

  it("remplace espaces et caractères exotiques", () => {
    const out = safeFilename("mon cv (final) #2 <v3>.pdf")
    expect(out).toMatch(/^[a-zA-Z0-9._-]+$/)
  })

  it("borne la longueur", () => {
    expect(safeFilename("a".repeat(400) + ".pdf").length).toBeLessThanOrEqual(120)
  })

  it("ne renvoie JAMAIS une chaîne vide", () => {
    // Un nom vide produirait un chemin se terminant par « / », donc un objet
    // sans nom — ou pire, l'écrasement du préfixe.
    expect(safeFilename("")).toBe("piece-jointe")
    expect(safeFilename("...")).toBe("piece-jointe")
    expect(safeFilename("///")).toBe("piece-jointe")
    expect(safeFilename("€€€").length).toBeGreaterThan(0)
  })

  it("le résultat ne peut pas s'échapper d'un chemin construit", () => {
    // Test de synthèse : quel que soit le nom, le chemin final reste dans
    // l'organisation. C'est l'invariant qui compte vraiment.
    const hostiles = [
      "../../../root.pdf",
      "..\\..\\win.pdf",
      "/absolu.pdf",
      "....//....//x.pdf",
      "a/../../b.pdf",
    ]
    for (const name of hostiles) {
      const path = `ORG-ID/inbound/CAND/MSG/0-${safeFilename(name)}`
      expect(path.includes("..")).toBe(false)
      expect(path.split("/")[0]).toBe("ORG-ID")
      expect(path.split("/").length).toBe(5)
    }
  })
})
