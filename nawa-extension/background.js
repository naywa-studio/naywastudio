/**
 * background.js — Service Worker v5.0.0 (Nora-only enrichment)
 *
 * Architecture rework — May 2026:
 * The Google search phase is now handled SERVER-SIDE via the Custom Search
 * JSON API (or DuckDuckGo fallback). The extension is no longer a Google
 * scraper, which removes the entire CAPTCHA / anti-bot risk.
 *
 * Léo (N1) : the server does everything; the extension does nothing.
 * Nora (N2): the server returns a list of LinkedIn URLs; the extension
 *            opens each profile in a hidden worker tab, scrapes the page
 *            (where the user is logged in to LinkedIn), and pushes the
 *            enriched profiles to /api/missions/[id]/profiles for scoring.
 *
 * State (chrome.storage.local : nawa_search_state) :
 *   { phase, missionId, token, brief, profiles, enrichIndex,
 *     enrichedData, workerTabId, startedAt, finishedAt?, error? }
 *
 *   phase ∈ "enriching" | "pushing" | "done" | "error" | "cancelled"
 */

const DEFAULT_API_BASE   = "https://nawa-studio.vercel.app"
const STATE_KEY          = "nawa_search_state"
const ENRICH_MAX         = 8       // hard cap of profiles enriched per run
const ENRICH_TIMEOUT_MS  = 9_000   // safety timeout if content_linkedin.js stalls
const ENRICH_DELAY_MIN_MS = 2_500
const ENRICH_DELAY_MAX_MS = 5_000

async function resolveApiBase(override) {
  if (override) return override
  const { nawa_api_base } = await chrome.storage.local.get(["nawa_api_base"])
  return nawa_api_base || DEFAULT_API_BASE
}

/* ── Message handlers ──────────────────────────────────────────────────── */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Auth from content_nawa.js — accepté de n'importe quel onglet Nawa
  if (msg.type === "SET_AUTH") {
    const patch = {
      nawa_access_token: msg.accessToken,
      nawa_user_id:      msg.userId,
      nawa_auth_at:      Date.now(),
    }
    if (msg.apiBase) patch.nawa_api_base = msg.apiBase
    chrome.storage.local.set(patch)
    sendResponse({ ok: true })
    return
  }

  // Status query (popup) — pas un onglet web, accepté
  if (msg.type === "GET_STATUS") {
    chrome.storage.local.get([STATE_KEY, "nawa_access_token", "nawa_user_id"], (data) => {
      sendResponse({
        authenticated: !!data.nawa_access_token,
        userId:        data.nawa_user_id ?? null,
        state:         data[STATE_KEY] ?? null,
      })
    })
    return true
  }

  // Mission launch from workspace chat (via content_nawa.js bridge)
  if (msg.type === "RUN_SEARCH_FROM_PAGE") {
    if (msg.apiBase) chrome.storage.local.set({ nawa_api_base: msg.apiBase })
    handleRunFromPage(msg.payload)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: e.message }))
    return true
  }

  // LinkedIn enrichment events — only accept from our worker tab
  if (msg.type === "PROFILE_EXTRACTED") {
    chrome.storage.local.get([STATE_KEY], ({ [STATE_KEY]: state }) => {
      if (!state) { sendResponse({ ok: false, reason: "no-state" }); return }
      if (sender?.tab?.id !== state.workerTabId) {
        sendResponse({ ok: false, reason: "foreign-tab" })
        return
      }
      onProfileExtracted(msg.profile)
      sendResponse({ ok: true })
    })
    return true
  }

  // Cancel
  if (msg.type === "CANCEL_SEARCH") {
    cancelSearch().then(() => sendResponse({ ok: true }))
    return true
  }
})

/* ── Tab lifecycle ─────────────────────────────────────────────────────── */

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return
  const { [STATE_KEY]: state } = await chrome.storage.local.get([STATE_KEY])
  if (!state || state.workerTabId !== tabId) return

  // Safety timeout: if content_linkedin.js doesn't fire PROFILE_EXTRACTED
  // within ENRICH_TIMEOUT_MS, advance anyway.
  if (state.phase === "enriching" && tab.url?.includes("linkedin.com/in/")) {
    setTimeout(async () => {
      const { [STATE_KEY]: cur } = await chrome.storage.local.get([STATE_KEY])
      if (!cur || cur.phase !== "enriching" || cur.workerTabId !== tabId) return
      if (cur.enrichIndex === state.enrichIndex) {
        await advanceEnrichment(tabId, cur)
      }
    }, ENRICH_TIMEOUT_MS)
  }
})

// User closes the worker tab manually → abort cleanly.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { [STATE_KEY]: state } = await chrome.storage.local.get([STATE_KEY])
  if (!state || state.workerTabId !== tabId) return
  await chrome.storage.local.set({ [STATE_KEY]: { ...state, phase: "cancelled" } })
})

/* ── Auth helpers ──────────────────────────────────────────────────────── */

async function refreshTokenViaNawaTab() {
  try {
    const apiBase = await resolveApiBase()
    const tabs = await chrome.tabs.query({ url: `${apiBase}/*` })
    if (tabs.length === 0) return null
    await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      files:  ["content_nawa.js"],
    })
    for (let i = 0; i < 12; i++) {
      await sleep(250)
      const { nawa_access_token, nawa_auth_at } = await chrome.storage.local.get([
        "nawa_access_token", "nawa_auth_at",
      ])
      if (nawa_access_token && nawa_auth_at && Date.now() - nawa_auth_at < 5000) {
        return nawa_access_token
      }
    }
    return null
  } catch (e) {
    console.warn("[Nawa BG] Token refresh failed:", e)
    return null
  }
}

/* ── Mission launch (Nora enrichment only) ────────────────────────────── */

async function handleRunFromPage(payload) {
  if (!payload?.missionId) return { ok: false, error: "Payload invalide (missionId)" }
  const profiles = Array.isArray(payload?.profiles) ? payload.profiles : []
  if (profiles.length === 0) {
    return { ok: false, error: "Aucun profil à enrichir" }
  }

  let { nawa_access_token: token } = await chrome.storage.local.get(["nawa_access_token"])
  if (!token) token = await refreshTokenViaNawaTab()
  if (!token) return { ok: false, error: "Token introuvable — rechargez Nawa Studio" }

  // Cancel any in-flight search before starting a new one
  const { [STATE_KEY]: existing } = await chrome.storage.local.get([STATE_KEY])
  if (existing?.workerTabId) {
    try { await chrome.tabs.remove(existing.workerTabId) } catch { /* tab gone */ }
  }

  // Cap enrichment to ENRICH_MAX
  const enrichQueue = profiles.slice(0, ENRICH_MAX).map((p) => p.linkedin_url).filter(Boolean)
  if (enrichQueue.length === 0) return { ok: false, error: "Aucune URL LinkedIn valide" }

  // Open dedicated worker tab on the first profile
  const workerTab = await chrome.tabs.create({ url: enrichQueue[0], active: false })

  const state = {
    phase:        "enriching",
    missionId:    payload.missionId,
    token,
    brief:        payload.brief || null,
    profiles,             // raw search-stage data, kept for merge
    enrichQueue,
    enrichIndex:  0,
    enrichedData: [],
    workerTabId:  workerTab.id,
    startedAt:    Date.now(),
  }
  await chrome.storage.local.set({ [STATE_KEY]: state })

  return { ok: true, missionId: payload.missionId, profilesCount: enrichQueue.length }
}

/* ── LinkedIn enrichment ──────────────────────────────────────────────── */

async function onProfileExtracted(profile) {
  const { [STATE_KEY]: state } = await chrome.storage.local.get([STATE_KEY])
  if (!state || state.phase !== "enriching") return
  const enrichedData = [...(state.enrichedData || []), profile]
  const updated = { ...state, enrichedData }
  await chrome.storage.local.set({ [STATE_KEY]: updated })
  await advanceEnrichment(state.workerTabId, updated)
}

async function advanceEnrichment(tabId, state) {
  const nextIndex = state.enrichIndex + 1

  if (nextIndex >= state.enrichQueue.length) {
    // Merge enrichment back into the original raw search profiles
    const enrichedByUrl = {}
    for (const p of state.enrichedData || []) enrichedByUrl[p.linkedin_url] = p
    const mergedProfiles = state.profiles.map((p) => {
      const e = enrichedByUrl[p.linkedin_url]
      if (!e) return p
      return {
        ...p,
        name:     e.name     || p.name     || "",
        title:    e.title    || p.title    || "",
        company:  e.company  || p.company  || "",
        location: e.location || p.location || "",
        snippet:  (e.about || e.experience_summary || p.snippet || "").slice(0, 300),
      }
    })
    await finishEnrichment({ ...state, profiles: mergedProfiles })
    return
  }

  // Polite spacing between LinkedIn navigations
  await sleep(jitter(ENRICH_DELAY_MIN_MS, ENRICH_DELAY_MAX_MS))

  const updated = { ...state, enrichIndex: nextIndex }
  await chrome.storage.local.set({ [STATE_KEY]: updated })
  await chrome.tabs.update(tabId, { url: state.enrichQueue[nextIndex] })
}

/* ── Push enriched profiles back to the API ───────────────────────────── */

async function finishEnrichment(state) {
  if (!state.missionId) return cleanupWorkerTab(state)
  await chrome.storage.local.set({ [STATE_KEY]: { ...state, phase: "pushing" } })

  const payload = (state.profiles || []).map((p) => ({
    linkedin_url: p.linkedin_url,
    name:         p.name     || "",
    title:        p.title    || "",
    company:      p.company  || "",
    location:     p.location || "",
    snippet:      p.snippet  || "",
  }))

  let success = false
  let serverMessage = ""
  try {
    const apiBase = await resolveApiBase()
    const body = JSON.stringify({ profiles: payload, final: true })
    let res = await fetch(`${apiBase}/api/missions/${state.missionId}/profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.token}` },
      body,
    })
    if (res.status === 401) {
      const fresh = await refreshTokenViaNawaTab()
      if (fresh) {
        res = await fetch(`${apiBase}/api/missions/${state.missionId}/profiles`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${fresh}` },
          body,
        })
      }
    }
    success = res.ok
    if (!success) {
      serverMessage = (await res.text().catch(() => "")).slice(0, 200)
      console.error("[Nawa BG] Push profiles failed:", res.status, serverMessage)
    }
  } catch (e) {
    serverMessage = e.message
    console.error("[Nawa BG] Push profiles network error:", e)
  }

  await chrome.storage.local.set({
    [STATE_KEY]: {
      ...state,
      phase:      success ? "done" : "error",
      error:      success ? null : (serverMessage || "Erreur serveur"),
      finishedAt: Date.now(),
    },
  })
  await cleanupWorkerTab(state)
}

async function cleanupWorkerTab(state) {
  if (state?.workerTabId) {
    try { await chrome.tabs.remove(state.workerTabId) } catch { /* already gone */ }
  }
}

async function cancelSearch() {
  const { [STATE_KEY]: state } = await chrome.storage.local.get([STATE_KEY])
  if (state?.workerTabId) {
    try { await chrome.tabs.remove(state.workerTabId) } catch { /* ignore */ }
  }
  await chrome.storage.local.remove([STATE_KEY])
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function sleep(ms)            { return new Promise((r) => setTimeout(r, ms)) }
function jitter(min, max)     { return min + Math.floor(Math.random() * (max - min)) }
