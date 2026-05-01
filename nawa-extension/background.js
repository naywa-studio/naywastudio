/**
 * background.js — Service Worker v5.1.0 (silent fetch search)
 *
 * Architecture rework — May 2026:
 * The extension performs the LinkedIn discovery search by issuing
 * background fetches to Google (NOT scraping a tab). Because the request
 * comes from the user's regular browser (residential IP, real cookies,
 * no automation flag), Google does not present a CAPTCHA in normal use.
 * No tab is opened during the search phase — fully silent for the user.
 *
 * Flow:
 *   1. The workspace chat calls /api/missions/[id]/launch-extension which
 *      generates queries and (for Nora) is followed by enrichment.
 *   2. Page posts {source:'nawa-page', type:'RUN_SEARCH', payload}
 *      with payload = { missionId, brief, queries, level }
 *   3. content_nawa.js relays to background.
 *   4. Background loops over queries, fetching Google search HTML,
 *      parsing LinkedIn URLs, deduping.
 *   5. (Nora) For each profile, opens linkedin.com/in/<slug> in a hidden
 *      worker tab and waits for content_linkedin.js to scrape data.
 *   6. Background POSTs the collected (and optionally enriched) profiles
 *      to /api/missions/[id]/profiles for scoring + insert.
 *
 * State (chrome.storage.local : nawa_search_state):
 *   { phase, missionId, token, brief, queries, queryIndex,
 *     profiles, level, enrichQueue?, enrichIndex?, enrichedData?,
 *     workerTabId?, startedAt, finishedAt?, error? }
 *
 *   phase ∈ "searching" | "enriching" | "pushing" | "done" | "error" | "cancelled"
 */

const DEFAULT_API_BASE   = "https://nawa-studio.vercel.app"
const STATE_KEY          = "nawa_search_state"

// Search-phase tuning
const MAX_PROFILES        = 80
const SEARCH_DELAY_MIN_MS = 1_500
const SEARCH_DELAY_MAX_MS = 3_500

// Nora enrichment tuning
const ENRICH_MAX            = 8
const ENRICH_TIMEOUT_MS     = 9_000
const ENRICH_DELAY_MIN_MS   = 2_500
const ENRICH_DELAY_MAX_MS   = 5_000

async function resolveApiBase(override) {
  if (override) return override
  const { nawa_api_base } = await chrome.storage.local.get(["nawa_api_base"])
  return nawa_api_base || DEFAULT_API_BASE
}

/* ── Message handlers ──────────────────────────────────────────────────── */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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

  if (msg.type === "CANCEL_SEARCH") {
    cancelSearch().then(() => sendResponse({ ok: true }))
    return true
  }
})

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return
  const { [STATE_KEY]: state } = await chrome.storage.local.get([STATE_KEY])
  if (!state || state.workerTabId !== tabId) return

  if (state.phase === "enriching" && tab.url?.includes("linkedin.com/in/")) {
    setTimeout(async () => {
      const { [STATE_KEY]: cur } = await chrome.storage.local.get([STATE_KEY])
      if (!cur || cur.phase !== "enriching" || cur.workerTabId !== tabId) return
      if (cur.enrichIndex === state.enrichIndex) await advanceEnrichment(tabId, cur)
    }, ENRICH_TIMEOUT_MS)
  }
})

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { [STATE_KEY]: state } = await chrome.storage.local.get([STATE_KEY])
  if (!state || state.workerTabId !== tabId) return
  await chrome.storage.local.set({ [STATE_KEY]: { ...state, phase: "cancelled" } })
})

/* ── Auth helper ──────────────────────────────────────────────────────── */

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

/* ── Mission launch entry-point ──────────────────────────────────────── */

async function handleRunFromPage(payload) {
  if (!payload?.missionId) return { ok: false, error: "Payload invalide (missionId)" }

  let { nawa_access_token: token } = await chrome.storage.local.get(["nawa_access_token"])
  if (!token) token = await refreshTokenViaNawaTab()
  if (!token) return { ok: false, error: "Token introuvable — rechargez Nawa Studio" }

  // Cancel any in-flight search
  const { [STATE_KEY]: existing } = await chrome.storage.local.get([STATE_KEY])
  if (existing?.workerTabId) {
    try { await chrome.tabs.remove(existing.workerTabId) } catch { /* gone */ }
  }

  const queries = Array.isArray(payload.queries) ? payload.queries : []
  const seedProfiles = Array.isArray(payload.profiles) ? payload.profiles : []

  // If the server already provided profiles (CSE pre-search), keep them as
  // a baseline; otherwise we discover everything via background fetch.
  const baseState = {
    phase:       "searching",
    missionId:   payload.missionId,
    token,
    brief:       payload.brief || null,
    level:       payload.level === "nora" ? "nora" : "leo",
    queries,
    queryIndex:  0,
    profiles:    seedProfiles,
    startedAt:   Date.now(),
  }
  await chrome.storage.local.set({ [STATE_KEY]: baseState })

  // Kick off the silent search loop without blocking the message reply
  runSilentSearch().catch((e) => {
    console.error("[Nawa BG] runSilentSearch crashed:", e)
    chrome.storage.local.set({
      [STATE_KEY]: { ...baseState, phase: "error", error: e?.message || "Erreur inattendue", finishedAt: Date.now() },
    })
  })

  return { ok: true, missionId: payload.missionId, queriesCount: queries.length }
}

/* ── Silent Google search via background fetch ───────────────────────── */

async function runSilentSearch() {
  let { [STATE_KEY]: state } = await chrome.storage.local.get([STATE_KEY])
  if (!state || state.phase !== "searching") return

  if ((state.queries || []).length === 0) {
    if ((state.profiles || []).length > 0) return goNext(state)
    return runServerFallback("Aucune requête à exécuter")
  }

  const seenUrls = new Set((state.profiles || []).map((p) => p.linkedin_url))
  let consecutiveBlocks = 0
  for (let i = 0; i < state.queries.length; i++) {
    const cur = (await chrome.storage.local.get([STATE_KEY]))[STATE_KEY]
    if (!cur || cur.phase !== "searching") return
    if (cur.profiles.length >= MAX_PROFILES) break

    const q = state.queries[i]
    let found = []
    let blocked = false
    try {
      const r = await fetchGoogleResults(q)
      found = r.profiles
      blocked = r.blocked
    } catch (e) {
      console.warn("[Nawa BG] Google fetch failed for query:", q.slice(0, 60), e?.message)
    }

    if (blocked) {
      consecutiveBlocks++
      // After 2 consecutive blocks (CAPTCHA / 429 / consent), bail to server fallback
      if (consecutiveBlocks >= 2) {
        console.warn("[Nawa BG] Google blocking — switching to server fallback")
        return runServerFallback("Google a limité les recherches depuis votre IP — bascule vers la recherche serveur.")
      }
    } else {
      consecutiveBlocks = 0
    }

    const fresh = found.filter((p) => p.linkedin_url && !seenUrls.has(p.linkedin_url))
    fresh.forEach((p) => seenUrls.add(p.linkedin_url))
    const merged = [...cur.profiles, ...fresh].slice(0, MAX_PROFILES)
    await chrome.storage.local.set({
      [STATE_KEY]: { ...cur, profiles: merged, queryIndex: i + 1 },
    })

    if (merged.length >= MAX_PROFILES) break
    if (i < state.queries.length - 1) await sleep(jitter(SEARCH_DELAY_MIN_MS, SEARCH_DELAY_MAX_MS))
  }

  const final = (await chrome.storage.local.get([STATE_KEY]))[STATE_KEY]
  if (!final || final.phase !== "searching") return

  // If we found nothing at all via Google, try the server fallback
  if ((final.profiles || []).length === 0) {
    return runServerFallback("Google a renvoyé 0 résultats — bascule vers la recherche serveur.")
  }
  return goNext(final)
}

/**
 * Hand off to the server-side Custom Search API. Used when Google rate-
 * limits the user's IP, hides results behind a consent interstitial, or
 * simply returns nothing. The server endpoint handles search + scoring +
 * insert + completion, so we just clear our state once it succeeds.
 */
async function runServerFallback(reason) {
  console.warn("[Nawa BG] Server fallback:", reason)
  const { [STATE_KEY]: state } = await chrome.storage.local.get([STATE_KEY])
  if (!state) return

  let success = false
  let serverMessage = ""
  try {
    const apiBase = await resolveApiBase()
    const res = await fetch(`${apiBase}/api/missions/${state.missionId}/run-server-search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${state.token}` },
    })
    const body = await res.json().catch(() => ({}))
    success = !!body?.ok
    if (!success) serverMessage = body?.error || `HTTP ${res.status}`
  } catch (e) {
    serverMessage = e?.message || "Erreur réseau"
  }

  await chrome.storage.local.set({
    [STATE_KEY]: {
      ...state,
      phase:      success ? "done" : "error",
      error:      success ? null : (serverMessage || reason),
      finishedAt: Date.now(),
    },
  })
}

async function goNext(state) {
  if (state.level === "nora" && (state.profiles || []).length > 0) {
    return startEnrichment(state)
  }
  return pushProfiles(state)
}

async function fetchGoogleResults(query) {
  const url = "https://www.google.com/search?q=" + encodeURIComponent(query) + "&hl=fr&num=10"
  let res
  try {
    res = await fetch(url, {
      method:      "GET",
      credentials: "include",
      headers: {
        "Accept":          "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    })
  } catch (e) {
    console.warn("[Nawa BG] Google fetch error:", e?.message)
    return { profiles: [], blocked: true }
  }

  if (res.status === 429 || res.status === 503) {
    console.warn("[Nawa BG] Google HTTP", res.status, "(rate-limit) for", query.slice(0, 60))
    return { profiles: [], blocked: true }
  }
  if (!res.ok) {
    console.warn("[Nawa BG] Google HTTP", res.status, "for", query.slice(0, 60))
    return { profiles: [], blocked: false }
  }
  if (/^https?:\/\/[^/]+\/sorry\//.test(res.url)) {
    console.warn("[Nawa BG] Google CAPTCHA for", query.slice(0, 60))
    return { profiles: [], blocked: true }
  }
  const html = await res.text()
  if (/consent\.google\.com/.test(res.url) || /interstitial-consent|consent-bump|google\.com\/consent/i.test(html)) {
    console.warn("[Nawa BG] Google consent interstitial — user must accept on google.com first")
    return { profiles: [], blocked: true }
  }
  const parsed = parseGoogleResults(html)
  if (parsed.length > 0) {
    console.log("[Nawa BG] Google →", parsed.length, "profiles for", query.slice(0, 60))
  }
  return { profiles: parsed, blocked: false }
}

function parseGoogleResults(html) {
  const seen = new Set()
  const out = []

  // LinkedIn profile URLs
  const liRe = /https?:\/\/(?:[a-z]{2}\.)?linkedin\.com\/in\/([a-zA-Z0-9_\-%.~]{2,80})/g
  let m
  while ((m = liRe.exec(html)) !== null) {
    const slug = decodeURIComponent(m[1]).replace(/[^a-zA-Z0-9_-]/g, "")
    if (slug.length < 2) continue
    const url = "https://www.linkedin.com/in/" + slug
    if (seen.has(url)) continue
    seen.add(url)
    out.push({ linkedin_url: url, source: "linkedin", name: "", title: "", company: "", location: "", snippet: "" })
    if (out.length >= 10) break
  }

  // Malt freelance URLs (https://www.malt.fr/profile/<slug> or .com)
  const maltRe = /https?:\/\/(?:www\.)?malt\.(?:fr|com)\/profile\/([a-zA-Z0-9_\-%.~]{2,80})/g
  while ((m = maltRe.exec(html)) !== null) {
    const slug = decodeURIComponent(m[1]).replace(/[^a-zA-Z0-9_-]/g, "")
    if (slug.length < 2) continue
    const url = "https://www.malt.fr/profile/" + slug
    if (seen.has(url)) continue
    seen.add(url)
    // We reuse `linkedin_url` as the canonical key so the rest of the
    // pipeline (dedupe, scoring, candidates table) keeps working unchanged.
    out.push({ linkedin_url: url, source: "malt", name: "", title: "", company: "", location: "", snippet: "" })
    if (out.length >= 10) break
  }

  // Try to attach a display title for each URL we found.
  if (out.length > 0) {
    const titleByUrl = new Map()
    const titleRe = /<a[^>]+href="(?:\/url\?q=)?(https?:\/\/(?:[a-z]{2}\.|www\.)?(?:linkedin\.com\/in|malt\.(?:fr|com)\/profile)\/[^"&]+)[^"]*"[^>]*>(?:<[^>]+>\s*)*<h3[^>]*>([\s\S]*?)<\/h3>/g
    let mm
    while ((mm = titleRe.exec(html)) !== null) {
      const u = canonicalUrl(mm[1])
      if (!u) continue
      const title = mm[2].replace(/<[^>]+>/g, "").trim()
      if (title) titleByUrl.set(u, title)
    }
    for (const item of out) {
      const t = titleByUrl.get(item.linkedin_url)
      if (!t) continue
      const cleaned = t
        .replace(/\s*[•·]\s*LinkedIn.*$/i, "")
        .replace(/\s*\|\s*LinkedIn.*$/i, "")
        .replace(/\s*[-–—]\s*Malt.*$/i, "")
        .trim()
      const dash = cleaned.indexOf(" - ")
      if (dash > -1) {
        item.name  = cleaned.slice(0, dash).trim()
        item.title = cleaned.slice(dash + 3).trim()
      } else {
        item.name = cleaned
      }
    }
  }

  return out
}

function canonicalUrl(raw) {
  const li = raw.match(/linkedin\.com\/in\/([a-zA-Z0-9_\-%.~]{2,80})/)
  if (li) return "https://www.linkedin.com/in/" + decodeURIComponent(li[1]).replace(/[^a-zA-Z0-9_-]/g, "")
  const ma = raw.match(/malt\.(?:fr|com)\/profile\/([a-zA-Z0-9_\-%.~]{2,80})/)
  if (ma) return "https://www.malt.fr/profile/" + decodeURIComponent(ma[1]).replace(/[^a-zA-Z0-9_-]/g, "")
  return null
}

/* ── Nora enrichment (LinkedIn pages, hidden worker tab) ──────────────── */

async function startEnrichment(state) {
  // Only enrich LinkedIn profiles via the LinkedIn worker tab.
  // Malt profiles ride through with their Google snippet only.
  const enrichQueue = state.profiles
    .filter((p) => p.source !== "malt" && p.linkedin_url?.includes("linkedin.com/in/"))
    .slice(0, ENRICH_MAX)
    .map((p) => p.linkedin_url)
  if (enrichQueue.length === 0) return pushProfiles(state)

  const workerTab = await chrome.tabs.create({ url: enrichQueue[0], active: false })
  const next = {
    ...state,
    phase:        "enriching",
    enrichQueue,
    enrichIndex:  0,
    enrichedData: [],
    workerTabId:  workerTab.id,
  }
  await chrome.storage.local.set({ [STATE_KEY]: next })
}

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
    return pushProfiles({ ...state, profiles: mergedProfiles })
  }

  await sleep(jitter(ENRICH_DELAY_MIN_MS, ENRICH_DELAY_MAX_MS))
  const updated = { ...state, enrichIndex: nextIndex }
  await chrome.storage.local.set({ [STATE_KEY]: updated })
  await chrome.tabs.update(tabId, { url: state.enrichQueue[nextIndex] })
}

/* ── Push profiles to API ─────────────────────────────────────────────── */

async function pushProfiles(state) {
  if (!state.missionId) return cleanupWorkerTab(state)
  await chrome.storage.local.set({ [STATE_KEY]: { ...state, phase: "pushing" } })

  const payload = (state.profiles || []).map((p) => ({
    linkedin_url: p.linkedin_url,
    source:       p.source   || "linkedin",
    name:         p.name     || "",
    title:        p.title    || "",
    company:      p.company  || "",
    location:     p.location || "",
    snippet:      p.snippet  || "",
  }))

  if (payload.length === 0) {
    return finalizeError("Aucun profil LinkedIn trouvé. Affinez les mots-clés et relancez.")
  }

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

async function finalizeError(reason) {
  const { [STATE_KEY]: state } = await chrome.storage.local.get([STATE_KEY])
  await chrome.storage.local.set({
    [STATE_KEY]: { ...(state || {}), phase: "error", error: reason, finishedAt: Date.now() },
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

function sleep(ms)        { return new Promise((r) => setTimeout(r, ms)) }
function jitter(min, max) { return min + Math.floor(Math.random() * (max - min)) }
