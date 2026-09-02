import { describe, expect, it } from "vitest"
import { evaluateReadiness, type ReadinessFacts } from "./readiness"

/**
 * Ce qui est testé ici n'est pas une liste de conditions : c'est leur ORDRE.
 *
 * Un produit qui annonce « connectez votre messagerie » à propos d'un candidat
 * qui s'est désinscrit fait perdre du temps et dit une chose fausse. L'ordre
 * ne se voit dans aucune capture d'écran et ne casse aucun test de rendu — il
 * se protège ici ou nulle part.
 */

const base: ReadinessFacts = {
  email: "candidat@exemple.fr",
  suppression: { blocked: false, reason: null },
  cap: { sent: 0, limit: 60 },
  mailbox: { email: "sophie@cabinet.fr", status: "active" },
  orgDomainReady: false,
  fallbackAddress: "sophie@reply.naywastudio.com",
}

const facts = (patch: Partial<ReadinessFacts>): ReadinessFacts => ({ ...base, ...patch })

describe("ce qui bloque, et rien d'autre", () => {
  it("un candidat sans adresse", () => {
    const v = evaluateReadiness(facts({ email: null }))
    expect(v.canWrite).toBe(false)
    expect(v.block?.code).toBe("no_email")
  })

  it("une adresse supprimée, avec son motif — le sourceur doit savoir POURQUOI", () => {
    const v = evaluateReadiness(facts({ suppression: { blocked: true, reason: "unsubscribe" } }))
    expect(v.canWrite).toBe(false)
    expect(v.block).toMatchObject({ code: "suppressed", reason: "unsubscribe" })
  })

  it("le plafond du cabinet atteint, avec les chiffres", () => {
    const v = evaluateReadiness(facts({ cap: { sent: 60, limit: 60 } }))
    expect(v.canWrite).toBe(false)
    expect(v.block).toMatchObject({ code: "cap_reached", sent: 60, limit: 60 })
  })

  it("la désinscription passe AVANT le plafond", () => {
    // Les deux interdisent d'écrire, mais l'un tombe à minuit et l'autre est
    // définitif. Annoncer « revenez demain » ferait réessayer pour rien.
    const v = evaluateReadiness(facts({
      suppression: { blocked: true, reason: "complaint" },
      cap: { sent: 60, limit: 60 },
    }))
    expect(v.block?.code).toBe("suppressed")
  })

  it("l'absence d'adresse passe avant tout — on ne parle pas d'envoi sans destinataire", () => {
    const v = evaluateReadiness(facts({
      email: null,
      suppression: { blocked: true, reason: "bounce" },
      cap: { sent: 99, limit: 60 },
    }))
    expect(v.block?.code).toBe("no_email")
  })
})

describe("ce qui n'est PAS un blocage", () => {
  it("aucune boîte connectée : on écrit quand même, depuis l'adresse de repli", () => {
    // Il y a toujours un transport. Le dire comme un blocage ferait paraître
    // cassé un produit qui fonctionne.
    const v = evaluateReadiness(facts({ mailbox: null }))
    expect(v.canWrite).toBe(true)
    expect(v.transport).toBe("naywa")
    expect(v.warnings.map((w) => w.code)).toContain("generic_identity")
  })

  it("une boîte révoquée bascule sur le domaine du cabinet, et le signale", () => {
    // Le défaut le plus sournois : l'envoi continue, mais sous une autre
    // identité que celle que le sourceur croit utiliser.
    const v = evaluateReadiness(facts({
      mailbox: { email: "sophie@cabinet.fr", status: "needs_reconnect" },
      orgDomainReady: true,
      fallbackAddress: "recrutement@cabinet.fr",
    }))
    expect(v.canWrite).toBe(true)
    expect(v.transport).toBe("org_domain")
    expect(v.fromAddress).toBe("recrutement@cabinet.fr")
    expect(v.warnings.map((w) => w.code)).toContain("mailbox_needs_reconnect")
  })

  it("le domaine du cabinet ne déclenche PAS l'avertissement d'identité", () => {
    // Écrire depuis `recrutement@cabinet.fr` est un choix d'équipe légitime,
    // pas un défaut de configuration.
    const v = evaluateReadiness(facts({
      mailbox: null, orgDomainReady: true, fallbackAddress: "recrutement@cabinet.fr",
    }))
    expect(v.warnings.map((w) => w.code)).not.toContain("generic_identity")
  })
})

describe("l'identité montrée au sourceur", () => {
  it("sa boîte quand elle est active", () => {
    expect(evaluateReadiness(base).fromAddress).toBe("sophie@cabinet.fr")
    expect(evaluateReadiness(base).transport).toBe("mailbox")
  })

  it("la boîte connectée prime sur le domaine du cabinet", () => {
    // Sa vraie adresse, sa réputation déjà établie, une copie dans ses
    // « Éléments envoyés » : c'est le meilleur des trois chemins.
    const v = evaluateReadiness(facts({ orgDomainReady: true, fallbackAddress: "recrutement@cabinet.fr" }))
    expect(v.transport).toBe("mailbox")
  })
})

describe("le plafond qui approche", () => {
  it("prévient à 80 %", () => {
    const v = evaluateReadiness(facts({ cap: { sent: 48, limit: 60 } }))
    expect(v.canWrite).toBe(true)
    expect(v.warnings.map((w) => w.code)).toContain("cap_near")
  })

  it("se tait en dessous — un avertissement permanent n'est plus lu", () => {
    const v = evaluateReadiness(facts({ cap: { sent: 47, limit: 60 } }))
    expect(v.warnings.map((w) => w.code)).not.toContain("cap_near")
  })

  it("un plafond nul ne bloque pas et n'avertit pas", () => {
    // `limit: 0` signifie « pas de plafond connu », pas « zéro envoi permis ».
    // L'inverse couperait tout le monde au premier hoquet du calcul.
    const v = evaluateReadiness(facts({ cap: { sent: 10, limit: 0 } }))
    expect(v.canWrite).toBe(true)
    expect(v.warnings.map((w) => w.code)).not.toContain("cap_near")
  })
})
