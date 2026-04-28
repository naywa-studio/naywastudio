/**
 * background.js — Service Worker v4.0.0
 *
 * Mission-driven flow :
 *  1. Workspace chat appelle /api/missions/[id]/launch-extension
 *     → reçoit { missionId, brief, queries, level }
 *  2. La page poste {source:'nawa-page', type:'RUN_SEARCH', payload}
 *  3. content_nawa.js relaie via chrome.runtime.sendMessage
 *  4. Background ouvre un onglet "worker" en arrière-plan (l'utilisateur reste
 *     sur sa page mission) qui parcourt Google puis (Nora) LinkedIn
 *  5. Profils poussés vers /api/missions/[id]/profiles → Realtime sur la page
 *
 * State (chrome.storage.local) : nawa_search_state
 *   { phase, missionId, token, brief, queries, queryIndex, profiles,
 *     workerTabId, level, enrichQueue?, enrichIndex?, enrichedData? }
 */

const API_BASE   = "https://nawa-studio.vercel.app"
const STATE_KEY  = "nawa_search_state"
const MAX_PROFILES = 80
const ENRICH_MAX   = 8

/* ── Message handlers ──────────────────────────────────────────────────── */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Auth from content_nawa.js (cookie → access_token)
  if (msg.type === "SET_AUTH") {
    chrome.storage.local.set({
      nawa_access_token: msg.accessToken,
      nawa_user_id:      msg.userId,
      nawa_auth_at:      Date.now(),
    })
    sendResponse({ ok: true })
    return
  }

  // Status query (popup)
  if (msg.type === "GET_STATUS") {
    chrome.storage.local.get([STATE_KEY, "nawa_access_token", "nawa_user_id"], data => {
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
    handleRunFromPage(msg.payload)
      .then(r => sendResponse(r))
      .catch(e => sendResponse({ ok: false, error: e.message }))
    return true
  }

  // Google scrape results
  if (msg.type === "GOOGLE_RESULTS") {
    onGoogleResults(msg.results ?? [])
    sendResponse({ ok: true })
    return
  }

  if (msg.type === "GOOGLE_DONE") {
    onGoogleDone()
    sendResponse({ ok: true })
    return
  }

  // LinkedIn enrichment (Nora)
  if (msg.type === "PROFILE_EXTRACTED") {
    onProfileExtracted(msg.profile)
    sendResponse({ ok: true })
    return
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

  // LinkedIn enrichment safety timeout: if content_linkedin.js doesn't fire
  // PROFILE_EXTRACTED within 9s, advance anyway.
  if (state.phase === "enriching" && tab.url?.includes("linkedin.com/in/")) {
    setTimeout(async () => {
      const { [STATE_KEY]: cur } = await chrome.storage.local.get([STATE_KEY])
      if (!cur || cur.phase !== "enriching" || cur.workerTabId !== tabId) return
      if (cur.enrichIndex === state.enrichIndex) {
        await advanceEnrichment(tabId, cur)
      }
    }, 9000)
  }
})

// If the user closes the worker tab manually, abort cleanly.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { [STATE_KEY]: state } = await chrome.storage.local.get([STATE_KEY])
  if (!state || state.workerTabId !== tabId) return
  await chrome.storage.local.set({ [STATE_KEY]: { ...state, phase: "cancelled" } })
})

/* ── Auth helpers ──────────────────────────────────────────────────────── */

async function refreshTokenViaNawaTab() {
  try {
    const tabs = await chrome.tabs.query({ url: `${API_BASE}/*` })
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

/* ── Mission launch (from workspace chat) ─────────────────────────────── */

async function handleRunFromPage(payload) {
  if (!payload?.missionId || !Array.isArray(payload?.queries) || payload.queries.length === 0) {
    return { ok: false, error: "Payload invalide" }
  }

  const { missionId, brief, queries, level } = payload

  // Make sure we have a fresh token (the page just authenticated us)
  let { nawa_access_token: token } = await chrome.storage.local.get(["nawa_access_token"])
  if (!token) token = await refreshTokenViaNawaTab()
  if (!token) {
    return { ok: false, error: "Token introuvable — rechargez Nawa Studio" }
  }

  // Cancel any in-flight search before starting a new one
  const { [STATE_KEY]: existing } = await chrome.storage.local.get([STATE_KEY])
  if (existing?.workerTabId) {
    try { await chrome.tabs.remove(existing.workerTabId) } catch { /* tab gone */ }
  }

  // Open a dedicated worker tab in background — user keeps their mission tab open
  const firstUrl = `https://www.google.com/search?q=${encodeURIComponent(queries[0])}&num=10&hl=fr`
  const workerTab = await chrome.tabs.create({ url: firstUrl, active: false })

  const state = {
    phase:       "searching",
    missionId,
    token,
    level:       level || "leo",
    brief,
    queries,
    queryIndex:  0,
    profiles:    [],
    workerTabId: workerTab.id,
    startedAt:   Date.now(),
  }
  await chrome.storage.local.set({ [STATE_KEY]: state })

  return { ok: true, missionId, queriesCount: queries.length }
}

/* ── Google scraping ──────────────────────────────────────────────────── */

let _pendingProfiles = null
let _pendingTimer    = null

function onGoogleResults(newProfiles) {
  _pendingProfiles = newProfiles
  clearTimeout(_pendingTimer)
  _pendingTimer = setTimeout(() => {
    if (_pendingProfiles !== null) {
      const profiles = _pendingProfiles
      _pendingProfiles = null
      chrome.storage.local.get([STATE_KEY], ({ [STATE_KEY]: state }) => {
        if (state?.phase === "searching") {
          advanceSearch(state.workerTabId, state, profiles)
        }
      })
    }
  }, 3000)
}

function onGoogleDone() {
  clearTimeout(_pendingTimer)
  const profiles = _pendingProfiles ?? []
  _pendingProfiles = null

  chrome.storage.local.get([STATE_KEY], ({ [STATE_KEY]: state }) => {
    if (!state || state.phase !== "searching") return
    advanceSearch(state.workerTabId, state, profiles)
  })
}

async function advanceSearch(tabId, currentState, newProfiles) {
  const seen   = new Set(currentState.profiles.map(p => p.linkedin_url))
  const unique = (newProfiles || []).filter(p => p.linkedin_url && !seen.has(p.linkedin_url))
  const merged = [...currentState.profiles, ...unique]

  const nextIndex      = currentState.queryIndex + 1
  const updated        = { ...currentState, profiles: merged, queryIndex: nextIndex }
  const allQueriesDone = nextIndex >= currentState.queries.length
  const enoughProfiles = merged.length >= MAX_PROFILES

  if (allQueriesDone || enoughProfiles) {
    if (currentState.level === "nora" && merged.length > 0) {
      await startEnrichment(tabId, updated)
    } else {
      await finishSearch(updated)
    }
    return
  }

  await chrome.storage.local.set({ [STATE_KEY]: updated })
  await navigateToQuery(tabId, currentState.queries[nextIndex])
}

/* ── Nora enrichment ──────────────────────────────────────────────────── */

async function startEnrichment(tabId, state) {
  const enrichQueue = state.profiles.slice(0, ENRICH_MAX).map(p => p.linkedin_url)
  const enrichState = {
    ...state,
    phase:        "enriching",
    enrichQueue,
    enrichIndex:  0,
    enrichedData: [],
  }
  await chrome.storage.local.set({ [STATE_KEY]: enrichState })
  await chrome.tabs.update(tabId, { url: enrichQueue[0] })
}

async function onProfileExtracted(profile) {
  const { [STATE_KEY]: state } = await chrome.storage.local.get([STATE_KEY])
  if (!state || state.phase !== "enriching") return

  const enrichedData = [...(state.enrichedData || []), profile]
  const updated      = { ...state, enrichedData }
  await chrome.storage.local.set({ [STATE_KEY]: updated })
  await advanceEnrichment(state.workerTabId, updated)
}

async function advanceEnrichment(tabId, state) {
  const nextIndex = state.enrichIndex + 1

  if (nextIndex >= state.enrichQueue.length) {
    // Merge enrichment back into base profiles
    const enrichedByUrl = {}
    for (const p of state.enrichedData || []) enrichedByUrl[p.linkedin_url] = p
    const mergedProfiles = state.profiles.map(p => {
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
    await finishSearch({ ...state, profiles: mergedProfiles })
    return
  }

  const updated = { ...state, enrichIndex: nextIndex }
  await chrome.storage.local.set({ [STATE_KEY]: updated })
  await chrome.tabs.update(tabId, { url: state.enrichQueue[nextIndex] })
}

/* ── Finish: push to API + close worker tab ──────────────────────────── */

async function finishSearch(state) {
  if (!state.missionId) {
    console.warn("[Nawa BG] finishSearch without missionId — aborting")
    return cleanupWorkerTab(state)
  }

  await chrome.storage.local.set({ [STATE_KEY]: { ...state, phase: "pushing" } })

  // Build payload : take what content scripts gave us, normalize
  const payload = (state.profiles || []).map(p => {
    const parsed = parseDisplayTitle(p.display_title || "")
    return {
      linkedin_url: p.linkedin_url,
      name:         p.name     || parsed.name  || "",
      title:        p.title    || parsed.title || "",
      company:      p.company  || "",
      location:     p.location || "",
      snippet:      p.snippet  || p.display_title || "",
    }
  })

  let success = false
  try {
    const res = await fetch(`${API_BASE}/api/missions/${state.missionId}/profiles`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${state.token}`,
      },
      body: JSON.stringify({ profiles: payload, final: true }),
    })

    if (res.status === 401) {
      // Token expired during the search — refresh and retry once
      const fresh = await refreshTokenViaNawaTab()
      if (fresh) {
        const retry = await fetch(`${API_BASE}/api/missions/${state.missionId}/profiles`, {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${fresh}`,
          },
          body: JSON.stringify({ profiles: payload, final: true }),
        })
        success = retry.ok
      }
    } else {
      success = res.ok
    }

    if (!success) {
      const t = await res.text().catch(() => "")
      console.error("[Nawa BG] Push profiles failed:", res.status, t.slice(0, 200))
    }
  } catch (e) {
    console.error("[Nawa BG] Push profiles network error:", e)
  }

  await chrome.storage.local.set({
    [STATE_KEY]: { ...state, phase: success ? "done" : "error", finishedAt: Date.now() },
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

function navigateToQuery(tabId, query) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10&hl=fr`
  return chrome.tabs.update(tabId, { url })
}

function parseDisplayTitle(displayTitle) {
  const text = (displayTitle || "")
    .replace(/\s*[•·]\s*LinkedIn.*$/i, "")
    .replace(/\s*\|\s*LinkedIn.*$/i, "")
    .trim()
  if (!text) return { name: "", title: "" }
  const dashIdx = text.indexOf(" - ")
  if (dashIdx > -1) {
    return { name: text.slice(0, dashIdx).trim(), title: text.slice(dashIdx + 3).trim() }
  }
  return { name: text, title: "" }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
