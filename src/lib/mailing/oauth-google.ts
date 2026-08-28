/**
 * L'échange OAuth avec Google — connecter la boîte d'un sourceur.
 *
 * ── Le scope, et pourquoi il ne bougera pas ───────────────────────────────
 *
 * `gmail.send` UNIQUEMENT, plus `openid email` pour savoir quelle adresse a
 * été connectée. C'est le minimum strict, et c'est notre meilleur argument au
 * dossier de vérification : la deuxième cause de refus documentée est de
 * demander plus large que nécessaire.
 *
 * ⚠️ **Ne jamais y ajouter un scope de LECTURE.** `gmail.readonly`,
 * `gmail.modify`, `gmail.metadata` sont *restreints* : ils imposent une
 * évaluation de sécurité CASA, entre 15 000 et 75 000 $ par an, renouvelée.
 * Une ligne ajoutée ici change l'échelle économique du produit.
 *
 * ── `access_type=offline` et `prompt=consent` ────────────────────────────
 *
 * Sans le premier, Google ne délivre aucun jeton de rafraîchissement et la
 * connexion meurt en une heure. Sans le second, il n'en délivre un que la
 * PREMIÈRE fois : un sourceur qui reconnecte sa boîte après une révocation
 * obtiendrait un jeton d'accès seul, et la reconnexion échouerait sans
 * message clair. Les deux sont nécessaires, et l'oubli du second ne se voit
 * qu'à la deuxième connexion.
 */

import { createHmac, timingSafeEqual, randomBytes } from "node:crypto"

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"

/** Le strict nécessaire. Cf. l'avertissement en tête de fichier. */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "openid",
  "email",
] as const

/**
 * L'identifiant client, avec sa valeur réelle en défaut.
 *
 * Ce n'est **pas un secret** : il figure dans l'URL de consentement que voit
 * chaque utilisateur, et Google le publie dans la barre d'adresse. L'écrire
 * ici évite une variable d'environnement de plus à poser sur chaque
 * environnement — donc une occasion de moins de se tromper.
 *
 * Le secret, lui, n'est JAMAIS dans le code.
 */
const DEFAULT_CLIENT_ID = "575112726480-nspvtf5mbetevujj6cjacj4r42cinpph.apps.googleusercontent.com"

export function googleClientId(): string {
  return (process.env.GOOGLE_OAUTH_CLIENT_ID ?? "").trim() || DEFAULT_CLIENT_ID
}

function googleClientSecret(): string {
  return (process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "").trim()
}

/** La configuration est-elle complète ? Pour refuser proprement. */
export function googleOAuthConfigured(): boolean {
  return googleClientId() !== "" && googleClientSecret() !== ""
}

/**
 * L'URI de redirection — **figée côté Google**.
 *
 * Elle est enregistrée telle quelle dans la console : toute divergence, même
 * d'un slash, fait échouer le consentement avec `redirect_uri_mismatch`, une
 * erreur qui ne dit pas laquelle des deux valeurs est fausse.
 */
export function googleRedirectUri(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}/api/mailing/oauth/google/callback`
}

/* ── L'état anti-CSRF ──────────────────────────────────────────────────────
 *
 * Sans lui, n'importe qui peut faire aboutir un `callback` sur la session
 * d'un utilisateur connecté et lui rattacher SA PROPRE boîte mail. Le
 * sourceur enverrait alors ses messages candidats depuis la boîte d'un
 * inconnu, sans rien remarquer.
 *
 * L'état est signé plutôt que stocké : rien à nettoyer, rien à expirer en
 * base, et il porte lui-même l'utilisateur auquel il appartient.
 *
 * Clé dérivée de celle du chiffrement, par HMAC : la même valeur ne sert
 * jamais à deux usages cryptographiques différents. */
function stateKey(): string {
  const raw = (process.env.MAILING_TOKEN_ENC_KEY ?? "").trim()
  if (raw.length < 32) throw new Error("MAILING_TOKEN_ENC_KEY absente : état OAuth non signable")
  return createHmac("sha256", raw).update("oauth-state").digest("base64url")
}

/** Durée de vie de l'état : le temps d'un consentement, pas davantage. */
const STATE_TTL_MS = 15 * 60 * 1000

export function signState(userId: string): string {
  const payload = `${userId}:${Date.now()}:${randomBytes(9).toString("base64url")}`
  const sig = createHmac("sha256", stateKey()).update(payload).digest("base64url")
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sig}`
}

/** Renvoie l'identifiant d'utilisateur, ou `null` si l'état est invalide/périmé. */
export function readState(state: string | null | undefined): string | null {
  if (!state) return null
  const dot = state.lastIndexOf(".")
  if (dot <= 0) return null

  let payload: string
  try {
    payload = Buffer.from(state.slice(0, dot), "base64url").toString("utf8")
  } catch { return null }

  const expected = createHmac("sha256", stateKey()).update(payload).digest("base64url")
  const a = Buffer.from(expected)
  const b = Buffer.from(state.slice(dot + 1))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const [userId, issuedAt] = payload.split(":")
  if (!userId || !issuedAt) return null
  const age = Date.now() - Number(issuedAt)
  // Un état qui traîne est un état qu'on a eu le temps de dérober.
  if (!Number.isFinite(age) || age < 0 || age > STATE_TTL_MS) return null
  return userId
}

/** L'URL vers laquelle envoyer le sourceur pour qu'il autorise Naywa. */
export function googleAuthUrl(appUrl: string, state: string, loginHint?: string): string {
  const p = new URLSearchParams({
    client_id: googleClientId(),
    redirect_uri: googleRedirectUri(appUrl),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  })
  // Pré-remplit le sélecteur de compte. Confort seulement : Google laisse
  // l'utilisateur en choisir un autre, et c'est très bien — un sourceur peut
  // vouloir connecter une adresse d'équipe plutôt que la sienne.
  if (loginHint) p.set("login_hint", loginHint)
  return `${AUTH_ENDPOINT}?${p.toString()}`
}

export interface GoogleTokens {
  refreshToken: string
  accessToken: string
  /** L'adresse réellement connectée, lue dans l'`id_token`. */
  email: string
}

/** Décode la charge utile d'un JWT sans vérifier sa signature.
 *
 *  Acceptable ICI, et seulement ici : le jeton vient d'arriver par une
 *  réponse HTTPS directe de Google à notre serveur, en échange d'un secret
 *  client. Il n'a pas transité par le navigateur. Le vérifier n'ajouterait
 *  rien qu'un aller-retour vers les clés publiques de Google. */
function readIdTokenEmail(idToken: string | undefined): string | null {
  if (!idToken) return null
  try {
    const body = idToken.split(".")[1]
    if (!body) return null
    const json = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { email?: string }
    return typeof json.email === "string" ? json.email.toLowerCase() : null
  } catch { return null }
}

/**
 * Échange le code de consentement contre des jetons.
 *
 * Jette avec un message lisible : cet appel n'a lieu qu'au retour du
 * consentement, et le sourceur doit comprendre ce qui a échoué.
 */
export async function exchangeGoogleCode(code: string, appUrl: string): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      redirect_uri: googleRedirectUri(appUrl),
      grant_type: "authorization_code",
    }),
  })

  const data = await res.json().catch(() => ({})) as {
    refresh_token?: string; access_token?: string; id_token?: string
    error?: string; error_description?: string
  }

  if (!res.ok) {
    throw new Error(data.error_description || data.error || `Google a refusé l'échange (${res.status})`)
  }
  if (!data.refresh_token) {
    // Arrive quand `prompt=consent` manque et que l'utilisateur avait déjà
    // autorisé : Google ne renvoie alors qu'un jeton d'accès, inutilisable
    // pour envoyer dans une heure. Message explicite plutôt qu'un échec muet.
    throw new Error("Google n'a pas renvoyé de jeton durable. Réessayez la connexion.")
  }

  const email = readIdTokenEmail(data.id_token)
  if (!email) throw new Error("Impossible de lire l'adresse du compte connecté.")

  return { refreshToken: data.refresh_token, accessToken: data.access_token ?? "", email }
}

/**
 * Un jeton d'accès frais, à partir du jeton durable.
 *
 * Renvoie `null` quand Google refuse **définitivement** — révocation,
 * changement de mot de passe, application non vérifiée dont l'autorisation a
 * expiré. L'appelant doit alors marquer la boîte `needs_reconnect` et le DIRE
 * au sourceur, sinon il croira envoyer alors que rien ne part.
 */
export async function refreshGoogleAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      grant_type: "refresh_token",
    }),
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => ({})) as { access_token?: string }
  return data.access_token ?? null
}
