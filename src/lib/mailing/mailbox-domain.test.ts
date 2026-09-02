import { describe, expect, it } from "vitest"
import { checkMailboxDomain, allowedMailboxDomains, domainOf } from "./mailbox-domain"

/**
 * Une règle qui refuse quelque chose doit être testée par ce qu'elle LAISSE
 * passer autant que par ce qu'elle bloque. Un refus de trop, ici, prive un
 * client de l'add-on qu'il vient de payer — et il n'appellera pas le support,
 * il conclura que ça ne marche pas.
 */

const cabinet = {
  accountEmail: "marie@cabinet.fr",
  orgContactEmail: "contact@cabinet.fr",
  orgSendingDomain: null,
}

describe("ce qui est refusé", () => {
  it("l'adresse personnelle d'une sourceuse invitée sur le domaine du cabinet", () => {
    const v = checkMailboxDomain("marie.dupont@gmail.com", cabinet)
    expect(v.allowed).toBe(false)
    expect(v.domain).toBe("gmail.com")
    // Le refus doit NOMMER ce qui était attendu : sans ça il est incompréhensible.
    expect(v.expected).toContain("cabinet.fr")
  })

  it("le domaine d'un autre cabinet", () => {
    expect(checkMailboxDomain("marie@concurrent.fr", cabinet).allowed).toBe(false)
  })

  it("une adresse inexploitable", () => {
    expect(checkMailboxDomain("pas-une-adresse", cabinet).allowed).toBe(false)
  })
})

describe("ce qui doit passer — et c'est le plus important", () => {
  it("le Gmail d'un cabinet d'une personne inscrit en Gmail", () => {
    // Une liste noire de fournisseurs grand public bloquerait ce cas, qui est
    // parfaitement légitime : c'est SON adresse professionnelle.
    const v = checkMailboxDomain("jean@gmail.com", {
      accountEmail: "jean@gmail.com", orgContactEmail: null, orgSendingDomain: null,
    })
    expect(v.allowed).toBe(true)
  })

  it("le domaine de contact de l'organisation, même si le compte est ailleurs", () => {
    // Cas courant : l'owner s'est inscrit avec une adresse, le cabinet écrit
    // depuis une autre.
    const v = checkMailboxDomain("sophie@cabinet.fr", {
      accountEmail: "sophie@ancien-employeur.fr",
      orgContactEmail: "contact@cabinet.fr",
      orgSendingDomain: null,
    })
    expect(v.allowed).toBe(true)
  })

  it("la casse et les espaces ne font pas échouer", () => {
    expect(checkMailboxDomain("  Marie@Cabinet.FR ", cabinet).allowed).toBe(true)
  })

  it("aucun repère connu : on laisse passer plutôt que d'ériger un mur arbitraire", () => {
    const v = checkMailboxDomain("qui@queconque.fr", {
      accountEmail: null, orgContactEmail: null, orgSendingDomain: null,
    })
    expect(v.allowed).toBe(true)
  })
})

describe("le domaine d'envoi et sa racine", () => {
  it("un salarié du cabinet passe alors que l'envoi est sur un sous-domaine", () => {
    // Le domaine d'envoi est `careers.cabinet.fr` mais les boîtes des salariés
    // sont en `@cabinet.fr`. Ne pas remonter d'un cran les bloquerait tous.
    const v = checkMailboxDomain("paul@cabinet.fr", {
      accountEmail: null, orgContactEmail: null, orgSendingDomain: "careers.cabinet.fr",
    })
    expect(v.allowed).toBe(true)
  })

  it("on ne remonte QUE d'un cran — jamais jusqu'au suffixe", () => {
    // Remonter complètement finirait par accepter « fr », donc tout le pays.
    const domains = allowedMailboxDomains({
      accountEmail: null, orgContactEmail: null, orgSendingDomain: "careers.cabinet.fr",
    })
    expect(domains).toEqual(["careers.cabinet.fr", "cabinet.fr"])
    expect(domains).not.toContain("fr")
  })
})

describe("domainOf", () => {
  it("prend ce qui suit la DERNIÈRE arobase", () => {
    expect(domainOf("a@b@cabinet.fr")).toBe("cabinet.fr")
  })
  it("refuse un domaine sans point", () => {
    expect(domainOf("marie@localhost")).toBeNull()
  })
  it("refuse une adresse vide ou nulle", () => {
    expect(domainOf(null)).toBeNull()
    expect(domainOf("@cabinet.fr")).toBeNull()
  })
})
