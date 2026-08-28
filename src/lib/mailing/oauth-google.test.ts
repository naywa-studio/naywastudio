import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { createHmac } from "node:crypto"
import {
  GOOGLE_SCOPES, googleAuthUrl, googleRedirectUri, googleOAuthConfigured,
  signState, readState,
} from "./oauth-google"

/**
 * L'échange OAuth avec Google.
 *
 * Deux choses sont verrouillées ici, et une seule est « technique ».
 *
 * La première est ÉCONOMIQUE : le jeu de scopes. Y ajouter une lecture Gmail
 * ferait basculer le dossier en scope *restreint*, donc en évaluation CASA à
 * 15 000-75 000 $ par an. Un test qui échoue vaut mieux qu'une facture.
 *
 * La seconde est l'état anti-CSRF. Sans lui, un tiers fait aboutir un
 * `callback` sur la session d'un sourceur et lui rattache SA propre boîte :
 * les messages candidats partiraient depuis l'adresse d'un inconnu.
 */

const KEY = "une-cle-de-test-suffisamment-longue-pour-passer"

describe("les scopes demandés", () => {
  it("ne contient AUCUN scope de lecture Gmail", () => {
    // Le garde-fou le plus important du fichier. `gmail.readonly`,
    // `gmail.modify` et `gmail.metadata` sont RESTREINTS : ils imposent une
    // évaluation de sécurité annuelle payante.
    const joined = GOOGLE_SCOPES.join(" ")
    for (const interdit of ["gmail.readonly", "gmail.modify", "gmail.metadata", "gmail.compose", "mail.google.com"]) {
      expect(joined).not.toContain(interdit)
    }
  })

  it("demande gmail.send, et de quoi identifier l'adresse connectée", () => {
    expect(GOOGLE_SCOPES).toContain("https://www.googleapis.com/auth/gmail.send")
    expect(GOOGLE_SCOPES).toContain("email")
  })
})

describe("URL de consentement", () => {
  beforeEach(() => {
    process.env.MAILING_TOKEN_ENC_KEY = KEY
    process.env.GOOGLE_OAUTH_CLIENT_ID = "123-abc.apps.googleusercontent.com"
  })
  afterEach(() => {
    delete process.env.MAILING_TOKEN_ENC_KEY
    delete process.env.GOOGLE_OAUTH_CLIENT_ID
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET
  })

  it("porte offline ET consent", () => {
    // Sans `offline`, aucun jeton durable : la connexion meurt en une heure.
    // Sans `consent`, Google n'en délivre qu'à la PREMIÈRE autorisation — un
    // sourceur qui reconnecte après révocation échouerait sans message clair,
    // et le défaut n'apparaît qu'à la deuxième connexion.
    const url = googleAuthUrl("https://naywastudio.com", signState("u1"))
    expect(url).toContain("access_type=offline")
    expect(url).toContain("prompt=consent")
  })

  it("pointe exactement l'URI enregistrée chez Google", () => {
    // Une divergence, même d'un slash, donne `redirect_uri_mismatch` — une
    // erreur qui ne dit pas laquelle des deux valeurs est fausse.
    expect(googleRedirectUri("https://naywastudio.com/"))
      .toBe("https://naywastudio.com/api/mailing/oauth/google/callback")
    expect(googleRedirectUri("https://naywastudio.com"))
      .toBe("https://naywastudio.com/api/mailing/oauth/google/callback")
  })

  it("se sait mal configurée plutôt que de composer une URL cassée", () => {
    expect(googleOAuthConfigured()).toBe(false)   // pas de secret
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secret"
    expect(googleOAuthConfigured()).toBe(true)
  })
})

describe("état anti-CSRF", () => {
  beforeEach(() => { process.env.MAILING_TOKEN_ENC_KEY = KEY })
  afterEach(() => { delete process.env.MAILING_TOKEN_ENC_KEY })

  it("fait l'aller-retour et rend l'utilisateur", () => {
    expect(readState(signState("utilisateur-1"))).toBe("utilisateur-1")
  })

  it("refuse un état forgé ou modifié", () => {
    const s = signState("utilisateur-1")
    const [body, sig] = s.split(".")
    const autre = Buffer.from("victime:" + Date.now() + ":x", "utf8").toString("base64url")
    expect(readState(`${autre}.${sig}`)).toBeNull()
    expect(readState(`${body}.${sig.slice(0, -2)}zz`)).toBeNull()
    expect(readState("n'importe quoi")).toBeNull()
    expect(readState(null)).toBeNull()
  })

  it("refuse un état PÉRIMÉ", () => {
    // Un état qui traîne est un état qu'on a eu le temps de dérober.
    const vieux = Buffer.from(`u1:${Date.now() - 60 * 60 * 1000}:x`, "utf8").toString("base64url")
    const k = createHmac("sha256", KEY).update("oauth-state").digest("base64url")
    const sig = createHmac("sha256", k)
      .update(Buffer.from(vieux, "base64url").toString("utf8")).digest("base64url")
    expect(readState(`${vieux}.${sig}`)).toBeNull()
  })

  it("deux états du même utilisateur diffèrent", () => {
    // Sinon l'état serait rejouable indéfiniment.
    expect(signState("u1")).not.toBe(signState("u1"))
  })

  it("n'est pas signable avec la clé du chiffrement telle quelle", () => {
    // La clé d'état est DÉRIVÉE : la même valeur ne sert jamais à deux usages
    // cryptographiques différents.
    const s = signState("u1")
    const payload = Buffer.from(s.split(".")[0], "base64url").toString("utf8")
    const naif = createHmac("sha256", KEY).update(payload).digest("base64url")
    expect(s.split(".")[1]).not.toBe(naif)
  })
})
