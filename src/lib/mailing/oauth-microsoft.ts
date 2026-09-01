/**
 * OAuth Microsoft — connecter la boîte Outlook / Microsoft 365 du sourceur.
 *
 * Jumeau de `oauth-google.ts`, dont il partage la clé HMAC d'état et la
 * logique générale. Trois différences comptent, et deux sont des pièges.
 *
 * ── 1. Le jeton durable TOURNE ⚠️ ─────────────────────────────────────────
 *
 * Google renvoie un `refresh_token` une fois pour toutes. **Microsoft en
 * renvoie un NOUVEAU à chaque rafraîchissement**, et l'ancien cesse d'être
 * utilisable. Ne pas persister le nouveau, c'est fabriquer une bombe à
 * retardement : les envois marchent tant que le jeton d'accès en cache est
 * valide, puis la boîte se décroche sans que personne comprenne pourquoi.
 *
 * D'où `refreshMicrosoftAccessToken` qui renvoie **les deux** jetons, et un
 * appelant (`send-via-mailbox`) qui a l'obligation d'écrire le nouveau.
 *
 * ── 2. L'adresse ne se lit pas dans l'`id_token` ─────────────────────────
 *
 * Microsoft y met `preferred_username`, qui est l'UPN — souvent l'adresse,
 * mais pas toujours : un UPN peut être `jean.durand@cabinet.onmicrosoft.com`
 * alors que la boîte est `j.durand@cabinet.fr`. Écrire au candidat depuis la
 * mauvaise adresse serait un défaut visible par lui, pas par nous. On lit donc
 * `mail` sur Graph, et l'UPN seulement en dernier recours.
 *
 * ── 3. `common` plutôt qu'un tenant ──────────────────────────────────────
 *
 * L'autorité `common` accepte les comptes professionnels ET personnels. Un
 * cabinet sur Microsoft 365 comme un indépendant sur Outlook.com peuvent
 * connecter leur boîte. Viser un tenant précis ne laisserait entrer que nous.
 *
 * ── Le scope, et pourquoi il ne bougera pas ──────────────────────────────
 *
 * `Mail.Send` et rien qui lise. **Ne jamais y ajouter `Mail.Read`,
 * `Mail.ReadWrite` ni `Mail.ReadBasic`** : ce sont les permissions que
 * Microsoft a placées sous surveillance renforcée, et surtout elles
 * détruiraient l'argument sur lequel repose tout le produit — nous ne lisons
 * jamais la boîte du sourceur, les réponses nous reviennent par notre propre
 * domaine (cf. le double `Reply-To` dans `cv/[id]/send`).
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto"

const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0"
const AUTH_ENDPOINT = `${AUTHORITY}/authorize`
const TOKEN_ENDPOINT = `${AUTHORITY}/token`
const GRAPH_ME = "https://graph.microsoft.com/v1.0/me"

/** Le strict nécessaire. Cf. l'avertissement en tête de fichier. */
export const MICROSOFT_SCOPES = [
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/User.Read",
  "offline_access",
  "openid",
  "email",
] as const

/**
 * L'identifiant client, avec sa valeur réelle en défaut.
 *
 * Ce n'est **pas un secret** : il figure dans l'URL de consentement que voit
 * chaque sourceur, et Microsoft l'affiche dans la barre d'adresse. L'écrire
 * ici évite une variable d'environnement de plus à tenir synchronisée entre
 * la production, les préversions et les postes — même choix que pour Google.
 *
 * Application « Naywa Studio », annuaire naywastudio.com, multi-tenant +
 * comptes personnels.
 */
export function microsoftClientId(): string {
  return (process.env.MICROSOFT_OAUTH_CLIENT_ID ?? "3a5fcf8d-0f0b-4190-babd-b1686de9b751").trim()
}

function microsoftClientSecret(): string {
  const s = (process.env.MICROSOFT_OAUTH_CLIENT_SECRET ?? "").trim()
  if (!s) throw new Error("MICROSOFT_OAUTH_CLIENT_SECRET absente")
  return s
}

/** Le connecteur est-il utilisable ? L'écran s'en sert pour ne pas proposer
 *  un bouton qui mènerait à une page d'erreur Microsoft. */
export function microsoftOAuthConfigured(): boolean {
  return microsoftClientId().length > 0 && (process.env.MICROSOFT_OAUTH_CLIENT_SECRET ?? "").trim().length > 0
}

/**
 * L'URI de redirection.
 *
 * ⚠️ Doit correspondre **au caractère près** à celle déclarée dans le portail
 * Entra, y compris l'absence de barre finale. Microsoft rejette sinon avec
 * `AADSTS50011`, dont le message ne dit pas quel caractère diffère.
 */
export function microsoftRedirectUri(appUrl: string): string {
  return `${appUrl.replace(/\/$/, "")}/api/mailing/oauth/microsoft/callback`
}

/* ── L'état anti-CSRF ──────────────────────────────────────────────────────
 *
 * Même mécanisme que Google, mais une clé DÉRIVÉE différemment : un secret ne
 * sert jamais à deux usages, et deux fournisseurs sont deux usages. Un état
 * signé pour Google ne doit pas pouvoir être rejoué sur Microsoft. */
function stateKey(): string {
  const raw = (process.env.MAILING_TOKEN_ENC_KEY ?? "").trim()
  if (raw.length < 32) throw new Error("MAILING_TOKEN_ENC_KEY absente : état OAuth non signable")
  return createHmac("sha256", raw).update("oauth-state-microsoft").digest("base64url")
}

const STATE_TTL_MS = 15 * 60 * 1000

export function signMicrosoftState(userId: string): string {
  const payload = `${userId}:${Date.now()}:${randomBytes(9).toString("base64url")}`
  const sig = createHmac("sha256", stateKey()).update(payload).digest("base64url")
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sig}`
}

/** Renvoie l'identifiant d'utilisateur, ou `null` si l'état est invalide/périmé. */
export function readMicrosoftState(state: string | null | undefined): string | null {
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
  if (!Number.isFinite(age) || age < 0 || age > STATE_TTL_MS) return null
  return userId
}

/** L'URL vers laquelle envoyer le sourceur pour qu'il autorise Naywa. */
export function microsoftAuthUrl(appUrl: string, state: string, loginHint?: string): string {
  const p = new URLSearchParams({
    client_id: microsoftClientId(),
    redirect_uri: microsoftRedirectUri(appUrl),
    response_type: "code",
    scope: MICROSOFT_SCOPES.join(" "),
    response_mode: "query",
    // `select_account` plutôt que `consent` : Microsoft renvoie de toute façon
    // un jeton durable dès que `offline_access` est demandé, donc forcer un
    // nouveau consentement à chaque reconnexion n'apporterait qu'un écran de
    // plus. Le sélecteur, lui, sert vraiment : beaucoup de gens ont un compte
    // professionnel et un compte personnel ouverts en même temps.
    prompt: "select_account",
    state,
  })
  if (loginHint) p.set("login_hint", loginHint)
  return `${AUTH_ENDPOINT}?${p.toString()}`
}

export interface MicrosoftTokens {
  refreshToken: string
  accessToken: string
  /** L'adresse réellement connectée, lue sur Graph. */
  email: string
}

/**
 * L'adresse de la boîte, demandée à Graph.
 *
 * `mail` d'abord — c'est l'adresse d'envoi réelle. `userPrincipalName` en
 * repli seulement : sur un compte personnel Outlook.com, `mail` est parfois
 * vide alors que l'UPN est bien l'adresse.
 */
async function readMailboxAddress(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${GRAPH_ME}?$select=mail,userPrincipalName`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const d = await res.json() as { mail?: string | null; userPrincipalName?: string | null }
    const addr = (d.mail || d.userPrincipalName || "").trim().toLowerCase()
    // Un UPN sans « @ » existe (comptes fédérés anciens) : il ne sert à rien
    // comme adresse d'expédition, mieux vaut échouer franchement.
    return addr.includes("@") ? addr : null
  } catch {
    return null
  }
}

/**
 * Échange le code de consentement contre des jetons.
 *
 * Jette avec un message lisible : cet appel n'a lieu qu'au retour du
 * consentement, et le sourceur doit comprendre ce qui a échoué.
 */
export async function exchangeMicrosoftCode(code: string, appUrl: string): Promise<MicrosoftTokens> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: microsoftClientId(),
      client_secret: microsoftClientSecret(),
      redirect_uri: microsoftRedirectUri(appUrl),
      grant_type: "authorization_code",
      scope: MICROSOFT_SCOPES.join(" "),
    }),
  })

  const data = await res.json().catch(() => ({})) as {
    refresh_token?: string; access_token?: string
    error?: string; error_description?: string
  }

  if (!res.ok) {
    throw new Error(data.error_description || data.error || `Microsoft a refusé l'échange (${res.status})`)
  }
  if (!data.refresh_token || !data.access_token) {
    // Sans `offline_access` accordé, on n'obtient qu'un jeton d'une heure :
    // les envois marcheraient aujourd'hui et plus demain.
    throw new Error("Microsoft n'a pas renvoyé de jeton durable. Réessayez la connexion.")
  }

  const email = await readMailboxAddress(data.access_token)
  if (!email) throw new Error("Impossible de lire l'adresse du compte connecté.")

  return { refreshToken: data.refresh_token, accessToken: data.access_token, email }
}

/** Ce que rend un rafraîchissement. ⚠️ `refreshToken` est le NOUVEAU jeton
 *  durable : l'ancien ne vaut plus rien, l'appelant DOIT le remplacer. */
export interface MicrosoftRefresh {
  accessToken: string
  refreshToken: string
}

/**
 * Un jeton d'accès frais, et le jeton durable qui le remplace.
 *
 * Renvoie `null` quand Microsoft refuse **définitivement** — consentement
 * révoqué par l'utilisateur ou son administrateur, compte désactivé, mot de
 * passe changé sur certains tenants. L'appelant doit alors marquer la boîte
 * `needs_reconnect` et le DIRE au sourceur, sinon il croira envoyer alors que
 * rien ne part.
 */
export async function refreshMicrosoftAccessToken(refreshToken: string): Promise<MicrosoftRefresh | null> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: microsoftClientId(),
      client_secret: microsoftClientSecret(),
      grant_type: "refresh_token",
      scope: MICROSOFT_SCOPES.join(" "),
    }),
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => ({})) as { access_token?: string; refresh_token?: string }
  if (!data.access_token) return null
  return {
    accessToken: data.access_token,
    // Microsoft renvoie normalement toujours un nouveau jeton durable ; on
    // retombe sur l'ancien s'il manque plutôt que de perdre la connexion.
    refreshToken: data.refresh_token || refreshToken,
  }
}
