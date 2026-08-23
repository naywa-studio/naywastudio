import { describe, expect, it } from "vitest"
import { checkRootDomain, cleanLocalPart, cleanSubdomain, isForbiddenSendingDomain } from "./domain-input"
import { sendingDomainFor } from "./provider"

/**
 * Le domaine saisi par le client.
 *
 * Cette chaîne devient un nom DNS déclaré chez AWS, une partie d'adresse
 * d'expédition, et une clé d'unicité entre organisations. Trois usages où une
 * valeur douteuse ne produit pas une erreur claire, mais un domaine déclaré
 * pour rien, une adresse invalide, ou un conflit incompréhensible.
 */

describe("checkRootDomain", () => {
  it("accepte un domaine ordinaire", () => {
    expect(checkRootDomain("cabinet-durand.fr")).toMatchObject({ ok: true, value: "cabinet-durand.fr" })
  })

  it("survit à un copier-coller depuis la barre d'adresse", () => {
    // Le cas le plus fréquent, et de loin : le client colle une URL.
    for (const input of [
      "https://www.cabinet-durand.fr/",
      "HTTP://Cabinet-Durand.FR",
      "  www.cabinet-durand.fr  ",
      "cabinet-durand.fr.",
      "cabinet-durand.fr/contact?x=1",
    ]) {
      expect(checkRootDomain(input)).toMatchObject({ ok: true, value: "cabinet-durand.fr" })
    }
  })

  it("accepte un sous-domaine et un TLD composé", () => {
    expect(checkRootDomain("recrutement.cabinet.co.uk").ok).toBe(true)
  })

  it("REFUSE le domaine de Naywa et ses sous-domaines", () => {
    // Un client ne revendique pas notre identité : il enverrait sous notre
    // marque, et récupérerait le courrier qui nous est destiné.
    expect(checkRootDomain("naywastudio.com")).toMatchObject({ ok: false, reason: "reserved" })
    expect(checkRootDomain("careers.naywastudio.com")).toMatchObject({ ok: false, reason: "reserved" })
    expect(checkRootDomain("mail.naywastudio.com")).toMatchObject({ ok: false, reason: "reserved" })
  })

  it("laisse un admin Naywa déclarer un sous-domaine, pour éprouver la chaîne", () => {
    // Elyas n'a qu'un domaine. Sans cette porte, la mise en route ne peut être
    // testée qu'en en achetant un second.
    expect(checkRootDomain("careers-test.naywastudio.com", { isAdmin: true }).ok).toBe(true)
  })

  it("laisse un admin saisir la racine, le garde-fou portant sur le résultat", () => {
    // Contrôler la RACINE interdisait « naywastudio.com » + « careers-test »,
    // dont le résultat est inoffensif — et c'est pourtant la seule
    // combinaison qui permet d'éprouver la chaîne sur le domaine déjà
    // vérifié. Le vrai objet du contrôle est le domaine d'envoi final.
    expect(checkRootDomain("naywastudio.com", { isAdmin: true }).ok).toBe(true)
  })

  it("refuse ce qui ne peut pas porter de DKIM", () => {
    expect(checkRootDomain("192.168.1.1").ok).toBe(false)
    expect(checkRootDomain("localhost").ok).toBe(false)
    expect(checkRootDomain("fr").ok).toBe(false)
    expect(checkRootDomain("1.2").ok).toBe(false)
  })

  it("refuse une saisie vide ou malformée", () => {
    expect(checkRootDomain("")).toMatchObject({ ok: false, reason: "empty" })
    expect(checkRootDomain(null)).toMatchObject({ ok: false, reason: "empty" })
    expect(checkRootDomain("cabinet durand.fr").ok).toBe(false)
    expect(checkRootDomain("-cabinet.fr").ok).toBe(false)
    expect(checkRootDomain("cabinet-.fr").ok).toBe(false)
    expect(checkRootDomain("cabinet..fr").ok).toBe(false)
  })

  it("refuse une saisie démesurée", () => {
    expect(checkRootDomain(`${"a".repeat(200)}.fr`)).toMatchObject({ ok: false, reason: "too_long" })
  })

  it("ne laisse jamais passer un caractère hors nom de domaine", () => {
    // Invariant de synthèse : ce qui sort est utilisable tel quel dans un nom
    // DNS et dans une adresse email. Sans ça, une injection remonterait
    // jusqu'à l'en-tête From.
    for (const hostile of [
      "cabinet.fr\r\nBcc: tout@le-monde.fr",
      "cabinet.fr<script>",
      "a@b.fr",
      "cabinet.fr;evil.com",
      "café.fr",
    ]) {
      const out = checkRootDomain(hostile)
      if (out.ok) expect(out.value).toMatch(/^[a-z0-9.-]+$/)
    }
  })
})

describe("cleanSubdomain", () => {
  it("normalise une étiquette valide", () => {
    expect(cleanSubdomain("  Careers ")).toBe("careers")
    expect(cleanSubdomain("jobs-2026")).toBe("jobs-2026")
  })

  it("renvoie null plutôt que de bloquer sur un champ facultatif", () => {
    // L'appelant retombe alors sur « careers ». Personne ne doit être arrêté
    // par un champ optionnel.
    expect(cleanSubdomain("")).toBeNull()
    expect(cleanSubdomain("careers.mail")).toBeNull()
    expect(cleanSubdomain("-jobs")).toBeNull()
    expect(cleanSubdomain("job s")).toBeNull()
  })
})

/**
 * Le garde-fou qui compte : le domaine d'envoi FINAL.
 *
 * Il était d'abord posé sur la racine saisie. Mauvais endroit, pour deux
 * raisons symétriques : il interdisait des combinaisons inoffensives, et il
 * ne regardait pas ce qui sert réellement à envoyer. Une racine anodine et un
 * sous-domaine anodin peuvent composer un domaine qui ne l'est pas.
 */

describe("isForbiddenSendingDomain", () => {
  it("refuse le relais qui porte l'authentification", () => {
    // mail.naywastudio.com sert au SMTP de Supabase : inscriptions et
    // réinitialisations de mot de passe. Le détourner couperait la connexion
    // de TOUS les utilisateurs. Aucune exception, admin compris.
    expect(isForbiddenSendingDomain("mail.naywastudio.com")).toBe(true)
  })

  it("refuse la racine, qui porte la messagerie professionnelle", () => {
    expect(isForbiddenSendingDomain("naywastudio.com")).toBe(true)
    expect(isForbiddenSendingDomain("NAYWASTUDIO.COM.")).toBe(true)
  })

  it("laisse passer un sous-domaine dédié", () => {
    expect(isForbiddenSendingDomain("careers-test.naywastudio.com")).toBe(false)
    expect(isForbiddenSendingDomain("careers.cabinet-durand.fr")).toBe(false)
  })

  it("attrape la composition dangereuse que la racine seule laissait passer", () => {
    // « mail » + « naywastudio.com » : deux saisies anodines, un résultat qui
    // ne l'est pas. C'est précisément le trou de la version précédente.
    expect(isForbiddenSendingDomain(sendingDomainFor("naywastudio.com", "mail"))).toBe(true)
  })
})

/**
 * La partie locale de l'adresse d'expédition.
 *
 * Elle est saisie par un client, puis écrite dans un en-tête `From` lu par des
 * serveurs de mail. Le filtrage anti-injection de `candidateFromHeader` porte
 * sur le NOM affiché, pas sur l'adresse : ce qui passe ici va tel quel dans
 * l'en-tête. La liste blanche est la seule forme sûre.
 */
describe("cleanLocalPart", () => {
  it("accepte les formes ordinaires", () => {
    expect(cleanLocalPart("recrutement")).toBe("recrutement")
    expect(cleanLocalPart("jean.dupont")).toBe("jean.dupont")
    expect(cleanLocalPart("talent-team")).toBe("talent-team")
    expect(cleanLocalPart("job+2026")).toBe("job+2026")
  })

  it("normalise ce qu'un humain tape vraiment", () => {
    expect(cleanLocalPart("  Recrutement  ")).toBe("recrutement")
    expect(cleanLocalPart("Prénom")).toBe("prenom")
  })

  it("refuse ce qui refermerait l'en-tête From", () => {
    // Sans ce refus, `x@evil.com>, ` composerait une adresse d'expédition
    // qui referme l'en-tête pour en ouvrir un autre — un `Bcc:`, typiquement.
    expect(cleanLocalPart("x@evil.com>, y")).toBeNull()
    expect(cleanLocalPart("sophie\r\nBcc: tout@le.monde")).toBeNull()
    expect(cleanLocalPart('"guillemets"')).toBeNull()
    expect(cleanLocalPart("avec espace")).toBeNull()
  })

  it("refuse le vide et le trop long", () => {
    expect(cleanLocalPart(null)).toBeNull()
    expect(cleanLocalPart("   ")).toBeNull()
    expect(cleanLocalPart("a".repeat(65))).toBeNull()
  })

  it("ne laisse jamais un séparateur en tête ni en fin", () => {
    // `.recrutement@…` et `recrutement.@…` sont refusées par bon nombre de
    // serveurs : l'adresse serait acceptée chez nous et rejetée en vol.
    expect(cleanLocalPart(".recrutement")).toBe("recrutement")
    expect(cleanLocalPart("recrutement.")).toBe("recrutement")
    expect(cleanLocalPart("...")).toBeNull()
  })
})
