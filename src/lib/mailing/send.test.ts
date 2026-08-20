import { describe, expect, it } from "vitest"
import {
  candidateFromHeader,
  orgFromAddress,
  reputationGroupFor,
  type MailingOrg,
} from "./send"
import { sendingDomainFor, DEFAULT_SUBDOMAIN } from "./provider"
import { canSendFromOrgDomain, hasMailingAccess } from "../subscription"

/**
 * La garde d'envoi candidat.
 *
 * Ce qui est testé ici n'est pas du confort : c'est la règle « le domaine du
 * client, ou rien ». Un défaut de cette garde ne se voit pas en recette — le
 * mail part, l'écran dit « envoyé », et c'est le candidat qui ne reçoit rien
 * parce que le message est allé en spam faute de clés DKIM publiées.
 */

const ORG_BASE: MailingOrg = {
  id: "11111111-1111-4111-8111-111111111111",
  trial_ends_at: null,
  subscription_status: "active",
  current_period_end: null,
  subscription_has_mailing: false,
  mailing_status: null,
  mailing_sending_domain: null,
  mailing_subdomain: null,
} as MailingOrg

const org = (patch: Partial<MailingOrg>): MailingOrg => ({ ...ORG_BASE, ...patch })

describe("qui a le droit d'envoyer", () => {
  it("refuse une org sans l'option", () => {
    expect(canSendFromOrgDomain(org({}))).toBe(false)
  })

  it("refuse une org qui a payé mais dont le domaine n'est PAS vérifié", () => {
    // Le piège : elle a payé, l'UI pourrait croire que tout est prêt. Sans
    // clés DKIM publiées, l'email partirait en spam sous la marque du client.
    const o = org({
      subscription_has_mailing: true,
      mailing_status: "verifying",
      mailing_sending_domain: "careers.cabinet-durand.fr",
    })
    expect(hasMailingAccess(o)).toBe(true)
    expect(canSendFromOrgDomain(o)).toBe(false)
  })

  it("refuse un statut actif SANS domaine renseigné", () => {
    // Incohérence de données : on refuse plutôt que d'envoyer depuis "null@…".
    expect(canSendFromOrgDomain(org({
      subscription_has_mailing: true,
      mailing_status: "active",
      mailing_sending_domain: null,
    }))).toBe(false)
  })

  it("autorise quand l'option est acquise ET le domaine vérifié", () => {
    expect(canSendFromOrgDomain(org({
      subscription_has_mailing: true,
      mailing_status: "active",
      mailing_sending_domain: "careers.cabinet-durand.fr",
    }))).toBe(true)
  })

  it("un admin Naywa contourne le paywall, JAMAIS la vérification DNS", () => {
    // Le paywall est une règle commerciale ; la vérification DNS est une
    // réalité technique. Aucun privilège ne fait accepter un mail non signé.
    const notReady = org({ mailing_status: "verifying", mailing_sending_domain: "careers.x.fr" })
    expect(hasMailingAccess(notReady, { isAdmin: true })).toBe(true)
    expect(canSendFromOrgDomain(notReady, { isAdmin: true })).toBe(false)

    const ready = org({ mailing_status: "active", mailing_sending_domain: "careers.x.fr" })
    expect(canSendFromOrgDomain(ready, { isAdmin: true })).toBe(true)
  })

  it("un essai en cours donne l'option, comme pour la Suite Pricing", () => {
    const inTrial = org({
      subscription_status: null,
      trial_ends_at: new Date(Date.now() + 5 * 86400_000).toISOString(),
    })
    expect(hasMailingAccess(inTrial)).toBe(true)
  })
})

describe("adresse et en-tête d'envoi", () => {
  it("compose l'adresse depuis le sous-domaine", () => {
    expect(orgFromAddress(org({
      mailing_sending_domain: "careers.cabinet-durand.fr",
      mailing_subdomain: "careers",
    }))).toBe("careers@careers.cabinet-durand.fr")
  })

  it("retombe sur le sous-domaine par défaut s'il manque", () => {
    expect(orgFromAddress(org({
      mailing_sending_domain: "careers.cabinet-durand.fr",
      mailing_subdomain: null,
    }))).toBe(`${DEFAULT_SUBDOMAIN}@careers.cabinet-durand.fr`)
  })

  it("l'en-tête porte le nom du SOURCEUR, pas celui de Naywa", () => {
    expect(candidateFromHeader("Sophie Durand", "careers@cabinet-durand.fr"))
      .toBe("Sophie Durand <careers@cabinet-durand.fr>")
  })

  it("neutralise une tentative d'injection d'en-tête par le nom", () => {
    // Un nom est saisi librement. Sans filtrage, un chevron ou un saut de
    // ligne referme l'en-tête et en ouvre un autre — un Bcc, par exemple.
    const forged = candidateFromHeader(
      'Sophie" <x@evil.com>\r\nBcc: victime@ailleurs.fr',
      "careers@cabinet-durand.fr",
    )

    // Les trois propriétés qui comptent réellement :
    // 1. aucun saut de ligne → l'en-tête ne peut pas être refermé ;
    expect(forged).not.toMatch(/[\r\n]/)
    // 2. UNE SEULE paire de chevrons, celle de la vraie adresse ;
    expect(forged.match(/[<>]/g)).toHaveLength(2)
    // 3. UNE SEULE arobase — donc aucune fausse adresse lisible dans le nom.
    //    (Une première version de ce test exigeait l'absence du mot
    //    « evil.com » : trop strict, du texte brut n'usurpe aucune adresse.
    //    C'est l'arobase qui rend une chaîne crédible comme expéditeur.)
    expect(forged.match(/@/g)).toHaveLength(1)
    expect(forged.endsWith("<careers@cabinet-durand.fr>")).toBe(true)
  })
})

describe("domaine d'envoi", () => {
  it("n'envoie jamais depuis la racine du domaine client", () => {
    // La racine porte la messagerie interne du cabinet. Un incident sur du
    // sourcing ne doit pas dégrader les emails qu'il échange avec ses clients.
    const sending = sendingDomainFor("cabinet-durand.fr", null)
    expect(sending).toBe("careers.cabinet-durand.fr")
    expect(sending).not.toBe("cabinet-durand.fr")
  })

  it("normalise les points et la casse en trop", () => {
    expect(sendingDomainFor("  Cabinet-Durand.FR. ", ".jobs.")).toBe("jobs.cabinet-durand.fr")
  })
})

describe("cloisonnement de réputation", () => {
  it("dérive le groupe de l'identifiant, pas du nom du cabinet", () => {
    // Un cabinet peut être renommé ; son historique de réputation, non.
    expect(reputationGroupFor("11111111-1111-4111-8111-111111111111"))
      .toBe("org-11111111-1111-4111-8111-111111111111")
  })

  it("n'émet que des caractères acceptés par SES", () => {
    expect(reputationGroupFor("abc/def ghi.jkl")).toMatch(/^[a-zA-Z0-9_-]+$/)
  })
})
