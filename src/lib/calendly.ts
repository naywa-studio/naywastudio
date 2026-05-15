/**
 * Calendly integration — OAuth + API wrapper.
 *
 * Each client connects their own Calendly account once (OAuth). Naywa stores
 * the tokens on the profile, embeds the client's scheduling widget on the
 * public booking page, and listens to Calendly webhooks for bookings.
 *
 * We never create bookings via the API (Calendly has no such endpoint) — the
 * candidate books through the embedded widget, and Calendly notifies us.
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

const AUTH_BASE = "https://auth.calendly.com"
const API_BASE = "https://api.calendly.com"

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://naywastudio.com").replace(/\/$/, "")
export const CALENDLY_REDIRECT_URI = `${SITE_URL}/api/calendly/oauth/callback`
export const CALENDLY_WEBHOOK_URL = `${SITE_URL}/api/calendly/webhook`

function clientId(): string {
  const v = (process.env.CALENDLY_CLIENT_ID ?? "").trim()
  if (!v) throw new Error("CALENDLY_CLIENT_ID missing")
  return v
}
function clientSecret(): string {
  const v = (process.env.CALENDLY_CLIENT_SECRET ?? "").trim()
  if (!v) throw new Error("CALENDLY_CLIENT_SECRET missing")
  return v
}

/* ─────────────────────────── OAuth ─────────────────────────── */

/** Build the Calendly authorize URL the client is redirected to. */
export function getAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    response_type: "code",
    redirect_uri: CALENDLY_REDIRECT_URI,
    state,
  })
  return `${AUTH_BASE}/oauth/authorize?${params.toString()}`
}

/* ─────── OAuth state (HMAC-signed, no cookie) ─────── */

function stateSecret(): string {
  // Reuse the service-role key as the HMAC secret — already required, server-only.
  const v = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim()
  if (!v) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing")
  return v
}

/**
 * Build a tamper-proof, time-bound state that carries the initiating
 * Naywa user id. The callback can then identify the user even if the
 * browser dropped the session cookie during the cross-site round-trip.
 */
export function buildOAuthState(userId: string): string {
  const payload = `${userId}.${Date.now()}.${randomBytes(8).toString("hex")}`
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("hex")
  return `${payload}.${sig}`
}

/** Verify a state string and return the embedded userId, or null if invalid. */
export function verifyOAuthState(state: string): string | null {
  const parts = state.split(".")
  if (parts.length !== 4) return null
  const [userId, ts, nonce, sig] = parts
  const expected = createHmac("sha256", stateSecret()).update(`${userId}.${ts}.${nonce}`).digest("hex")
  try {
    const a = Buffer.from(sig, "hex")
    const b = Buffer.from(expected, "hex")
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum)) return null
  if (Date.now() - tsNum >= 10 * 60 * 1000) return null
  return userId
}

export interface CalendlyToken {
  accessToken: string
  refreshToken: string
  /** ISO timestamp when the access token expires. */
  expiresAt: string
}

function parseTokenResponse(json: Record<string, unknown>): CalendlyToken {
  const accessToken = typeof json.access_token === "string" ? json.access_token : ""
  const refreshToken = typeof json.refresh_token === "string" ? json.refresh_token : ""
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600
  if (!accessToken || !refreshToken) throw new Error("Calendly: incomplete token response")
  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  }
}

/** Exchange an authorization code for tokens. */
export async function exchangeCodeForToken(code: string): Promise<CalendlyToken> {
  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId(),
      client_secret: clientSecret(),
      code,
      redirect_uri: CALENDLY_REDIRECT_URI,
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Calendly token exchange ${res.status}: ${detail.slice(0, 240)}`)
  }
  return parseTokenResponse(await res.json())
}

/** Refresh an expired access token. */
export async function refreshAccessToken(refreshToken: string): Promise<CalendlyToken> {
  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Calendly token refresh ${res.status}: ${detail.slice(0, 240)}`)
  }
  return parseTokenResponse(await res.json())
}

/**
 * Return a valid access token for a connected profile, refreshing and
 * persisting it if it expires within the next 2 minutes. Pass the admin client.
 */
export async function getValidAccessToken(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const { data: profile } = await admin
    .from("profiles")
    .select("calendly_access_token, calendly_refresh_token, calendly_token_expires_at")
    .eq("user_id", userId)
    .single()

  if (!profile?.calendly_access_token || !profile.calendly_refresh_token) return null

  const expiresAt = profile.calendly_token_expires_at
    ? new Date(profile.calendly_token_expires_at).getTime()
    : 0
  if (expiresAt - Date.now() > 120_000) return profile.calendly_access_token

  // Expired or about to — refresh.
  const refreshed = await refreshAccessToken(profile.calendly_refresh_token)
  await admin.from("profiles").update({
    calendly_access_token: refreshed.accessToken,
    calendly_refresh_token: refreshed.refreshToken,
    calendly_token_expires_at: refreshed.expiresAt,
  }).eq("user_id", userId)
  return refreshed.accessToken
}

/* ─────────────────────────── API ─────────────────────────── */

async function calendlyGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Calendly GET ${path} ${res.status}: ${detail.slice(0, 240)}`)
  }
  return res.json() as Promise<T>
}

export interface CalendlyUser {
  uri: string
  name: string | null
  schedulingUrl: string
  organizationUri: string
}

/** GET /users/me — the connected client's Calendly identity. */
export async function getCurrentUser(token: string): Promise<CalendlyUser> {
  const json = await calendlyGet<{ resource: Record<string, unknown> }>(token, "/users/me")
  const r = json.resource
  return {
    uri: String(r.uri ?? ""),
    name: typeof r.name === "string" ? r.name : null,
    schedulingUrl: String(r.scheduling_url ?? ""),
    organizationUri: String(r.current_organization ?? ""),
  }
}

export interface CalendlyEventType {
  uri: string
  name: string
  schedulingUrl: string
  active: boolean
  durationMinutes: number | null
}

/** GET /event_types?user=… — the client's bookable meeting types. */
export async function listEventTypes(token: string, userUri: string): Promise<CalendlyEventType[]> {
  const json = await calendlyGet<{ collection: Record<string, unknown>[] }>(
    token,
    `/event_types?user=${encodeURIComponent(userUri)}&active=true&count=100`,
  )
  return (json.collection ?? []).map((r) => ({
    uri: String(r.uri ?? ""),
    name: String(r.name ?? "Sans titre"),
    schedulingUrl: String(r.scheduling_url ?? ""),
    active: r.active === true,
    durationMinutes: typeof r.duration === "number" ? r.duration : null,
  }))
}

export interface CalendlyScheduledEvent {
  uri: string
  status: string
  startTime: string
  endTime: string
  locationType: string | null
  joinUrl: string | null
  locationText: string | null
}

function parseLocation(location: unknown): {
  locationType: string | null; joinUrl: string | null; locationText: string | null
} {
  if (!location || typeof location !== "object") {
    return { locationType: null, joinUrl: null, locationText: null }
  }
  const l = location as Record<string, unknown>
  const type = typeof l.type === "string" ? l.type : null
  // Video locations carry a join_url; physical/custom carry a free-text location.
  const joinUrl = typeof l.join_url === "string" ? l.join_url : null
  const text = typeof l.location === "string" ? l.location
    : typeof l.additional_info === "string" ? l.additional_info : null
  return { locationType: type, joinUrl, locationText: text }
}

/** GET a single scheduled event by its URI. */
export async function getScheduledEvent(token: string, eventUri: string): Promise<CalendlyScheduledEvent> {
  const uuid = eventUri.split("/").pop() ?? ""
  const json = await calendlyGet<{ resource: Record<string, unknown> }>(token, `/scheduled_events/${uuid}`)
  const r = json.resource
  const loc = parseLocation(r.location)
  return {
    uri: String(r.uri ?? eventUri),
    status: String(r.status ?? "active"),
    startTime: String(r.start_time ?? ""),
    endTime: String(r.end_time ?? ""),
    ...loc,
  }
}

/** GET /scheduled_events?user=… within a time window — feeds the agenda views. */
export async function listScheduledEvents(
  token: string,
  userUri: string,
  minStartTime: string,
  maxStartTime: string,
): Promise<CalendlyScheduledEvent[]> {
  const params = new URLSearchParams({
    user: userUri,
    min_start_time: minStartTime,
    max_start_time: maxStartTime,
    status: "active",
    count: "100",
  })
  const json = await calendlyGet<{ collection: Record<string, unknown>[] }>(
    token,
    `/scheduled_events?${params.toString()}`,
  )
  return (json.collection ?? []).map((r) => {
    const loc = parseLocation(r.location)
    return {
      uri: String(r.uri ?? ""),
      status: String(r.status ?? "active"),
      startTime: String(r.start_time ?? ""),
      endTime: String(r.end_time ?? ""),
      ...loc,
    }
  })
}

/* ─────────────────────────── Webhooks ─────────────────────────── */

function webhookSigningKey(): string {
  const v = (process.env.CALENDLY_WEBHOOK_SIGNING_KEY ?? "").trim()
  if (!v) throw new Error("CALENDLY_WEBHOOK_SIGNING_KEY missing")
  return v
}

/**
 * Create a user-scoped webhook subscription for invitee.created / invitee.canceled.
 * Returns the subscription URI (stored so it can be deleted on disconnect).
 */
export async function createWebhookSubscription(
  token: string,
  organizationUri: string,
  userUri: string,
): Promise<string> {
  const res = await fetch(`${API_BASE}/webhook_subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: CALENDLY_WEBHOOK_URL,
      events: ["invitee.created", "invitee.canceled"],
      organization: organizationUri,
      user: userUri,
      scope: "user",
      signing_key: webhookSigningKey(),
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Calendly webhook create ${res.status}: ${detail.slice(0, 240)}`)
  }
  const json = await res.json() as { resource?: { uri?: string } }
  const uri = json.resource?.uri
  if (!uri) throw new Error("Calendly webhook create: no uri returned")
  return uri
}

/** Delete a webhook subscription (best-effort, on disconnect). */
export async function deleteWebhookSubscription(token: string, webhookUri: string): Promise<void> {
  const uuid = webhookUri.split("/").pop() ?? ""
  await fetch(`${API_BASE}/webhook_subscriptions/${uuid}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {})
}

/**
 * Verify a Calendly webhook signature.
 * Header format: `Calendly-Webhook-Signature: t=<timestamp>,v1=<hmac>`.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const [k, v] = p.split("=")
      return [k?.trim(), v?.trim()]
    }),
  ) as { t?: string; v1?: string }
  if (!parts.t || !parts.v1) return false

  const expected = createHmac("sha256", webhookSigningKey())
    .update(`${parts.t}.${rawBody}`)
    .digest("hex")
  try {
    const a = Buffer.from(expected, "hex")
    const b = Buffer.from(parts.v1, "hex")
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}
