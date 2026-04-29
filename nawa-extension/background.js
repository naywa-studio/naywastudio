/**
 * background.js — Service Worker v4.1.0
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
 * Anti-blocking Google :
 *  - Délai aléatoire 3–6s entre chaque navigation Google
 *  - Pas de paramètre &num= (signal d'automatisation)
 *  - Détection /sorry/ + formulaire reCAPTCHA → arrêt propre + erreur claire
 *  - Tous les messages des content scripts sont filtrés par sender.tab.id :
 *    seul l'onglet worker peut influer sur la mission en cours.
 *
 * State (chrome.storage.local) : nawa_search_state
 *   { phase, missionId, token, brief, queries, queryIndex, profiles,
 *     workerTabId, level, enrichQueue?, enrichIndex?, enrichedData?, error? }
 */

const DEFAULT_API_BASE = "https://nawa-studio.vercel.app"
const STATE_KEY  = "nawa_search_state"

async function resolveApiBase(override) {
  if (override) return override
  const { nawa_api_base } = await chrome.storage.local.get(["nawa_api_base"])
  return nawa_api_base || DEFAULT_API_BASE
}
const MAX_PROFILES = 80
const ENRICH_MAX   = 8

// Anti-blocking : délais aléatoires entre les requêtes Google
const GOOGLE_DELAY_MIN_MS = 3000
const GOOGLE_DELAY_MAX_MS = 6000
const LINKEDIN_DELAY_MIN_MS = 2500
const LINKEDIN_DELAY_MAX_MS = 5000

/* ── Message handlers ──────────────────────────────────────────────────── */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Auth from content_nawa.js (cookie → access_token) — accepté de n'importe quel onglet Nawa
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

  // Status query (popup) — pas un onglet web
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

  // Mission launch from workspace chat (via content_nawa.js bridge) — uniquement depuis Nawa
  if (msg.type === "RUN_SEARCH_FROM_PAGE") {
    if (msg.apiBase) chrome.storage.local.set({ nawa_api_base: msg.apiBase })
    handleRunFromPage(msg.payload)
      .then(r => sendResponse(r))
      .catch(e => sendResponse({ ok: false, error: e.message }))
    return true
  }

  // Cancel — accepté du popup
  if (msg.type === "CANCEL_SEARCH") {
    cancelSearch().then(() => sendResponse({ ok: true }))
    return true
  }

  // ─── Messages venant de content_google.js / content_linkedin.js ──────
  // CRITIQUE : on ne traite QUE les messages venant de l'onglet worker.
  // Si l'utilisateur fait sa propre recherche Google, on ignore.
  const senderTabId = sender?.tab?.id

  if (msg.type === "GOOGLE_RESULTS") {
    isWorkerTab(senderTabId).then(isWorker => {
      if (isWorker) onGoogleResults(msg.results ?? [])
    })
    sendResponse({ ok: true })
    return
  }

  if (msg.type === "GOOGLE_DONE") {
    isWorkerTab(senderTabId).then(isWorker => {
      if (isWorker) onGoogleDone()
    })
    sendResponse({ ok: true })
    return
  }

  if (msg.type === "GOOGLE_BLOCKED") {
    isWorkerTab(senderTabId).then(isWorker => {
      if (isWorker) onGoogleBlocked(msg.reason || "Google a détecté l'automatisation")
    })
    sendResponse({ ok: true })
    return
  }

  if (msg.type === "PROFILE_EXTRACTED") {
    isWorkerTab(senderTabId).then(isWorker => {
      if (isWorker) onProfileExtracted(msg.profile)
    })
    sendResponse({ ok: true })
    return
  }
})

async function isWorkerTab(tabId) {
  if (!tabId) return false
  const { [STATE_KEY]: state } = await chrome.storage.local.get([STATE_KEY])
  return !!state && state.workerTabId === tabId
}

/* ── Tab lifecycle ─────────────────────────────────────────────────────── */

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return

  const { [STATE_KEY]: state } = await chrome.storage.local.get([STATE_KEY])
  if (!state || state.workerTabId !== tabId) return

  // Détection blocage Google côté URL (redirection vers /sorry/…)
  if (tab.url && /https:\/\/(www\.)?google\.com\/sorry/i.test(tab.url)) {
    onGoogleBlocked("Google a affiché un CAPTCHA (blocage anti-bot)")
    return
  }

  // LinkedIn enrichment safety timeout : si content_linkedin.js ne fire pas
  // PROFILE_EXTRACTED dans les 9s, on avance.
  if (state.phase === "enriching" && tab.url?.includes("linkedin.com/in/")) {
    const snapshotIndex = state.enrichIndex
    setTimeout(async () => {
      const { [STATE_KEY]: cur } = await chrome.storage.local.get([STATE_KEY])
      if (!cur || cur.phase !== "enriching" || cur.workerTabId !== tabId) return
      if (cur.enrichIndex === snapshotIndex) {
        await advanceEnrichment(tabId, cur)
      }
    }, 9000)
  }
})

// Si l'utilisateur ferme l'onglet worker manuellement, abort proprement.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { [STATE_KEY]: state } = await chrome.storage.local.get([STATE_KEY])
  if (!state || state.workerTabId !== tabId) return
  // Si on était sur le point de finir (pushing/done) on ne touche pas
  if (state.phase === "done" || state.phase === "pushing") return
  await chrome.storage.local.set({
    [STATE_KEY]: { ...state, phase: "cancelled", workerTabId: null },
  })
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

/* ── Mission launch (from workspace chat) ─────────────────────────────── */

async function handleRunFromPage(payload) {
  if (!payload?.missionId || !Array.isArray(payload?.queries) || payload.queries.length === 0) {
    return { ok: false, error: "Payload invalide" }
  }

  const { missionId, brief, queries, level } = payload

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

  // Onglet worker dédié, en arrière-plan, isolé des onglets utilisateur
  const firstUrl = buildGoogleUrl(queries[0])
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

async function onGoogleBlocked(reason) {
  clearTimeout(_pendingTimer)
  _pendingProfiles = null
  const { [STATE_KEY]: state } = await chrome.storage.local.get([STATE_KEY])
  if (!state) return
  if (state.phase !== "searching" && state.phase !== "enriching") return

  // Si on a déjà trouvé des profils, on essaie quand même de finaliser
  if ((state.profiles || []).length > 0) {
    console.warn("[Nawa BG] Google bloqué mais profils déjà collectés → finalisation")
    if (state.level === "nora" && state.phase === "searching") {
      // On saute l'enrichissement (LinkedIn risque aussi de bloquer)
      await finishSearch({ ...state, _partial: true, _blockReason: reason })
    } else {
      await finishSearch({ ...state, _partial: true, _blockReason: reason })
    }
    return
  }

  // Aucun profil → erreur claire
  await chrome.storage.local.set({
    [STATE_KEY]: {
      ...state,
      phase: "error",
      error: `${reason}. Réessayez dans quelques minutes ou changez de réseau.`,
      finishedAt: Date.now(),
    },
  })
  if (state.workerTabId) {
    try { await chrome.tabs.remove(state.workerTabId) } catch { /* gone */ }
  }
  // On ne marque pas la mission en "error" côté serveur : on n'a juste rien envoyé.
  // Le serveur la repassera elle-même en "draft" via /api/missions/[id]/profiles si besoin
  // ou l'utilisateur peut relancer.
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

  // Délai aléatoire pour échapper à la détection
  const delay = randomBetween(GOOGLE_DELAY_MIN_MS, GOOGLE_DELAY_MAX_MS)
  setTimeout(async () => {
    // Re-check : la mission peut avoir été annulée pendant le délai
    const { [STATE_KEY]: now } = await chrome.storage.local.get([STATE_KEY])
    if (!now || now.phase !== "searching" || now.workerTabId !== tabId) return
    await navigateToQuery(tabId, currentState.queries[nextIndex])
  }, delay)
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

  // Délai aléatoire pour LinkedIn aussi (rate-limit)
  const delay = randomBetween(LINKEDIN_DELAY_MIN_MS, LINKEDIN_DELAY_MAX_MS)
  setTimeout(async () => {
    const { [STATE_KEY]: now } = await chrome.storage.local.get([STATE_KEY])
    if (!now || now.phase !== "enriching" || now.workerTabId !== tabId) return
    chrome.tabs.update(tabId, { url: state.enrichQueue[nextIndex] }).catch(() => {})
  }, delay)
}

/* ── Finish: push to API + close worker tab ──────────────────────────── */

async function finishSearch(state) {
  if (!state.missionId) {
    console.warn("[Nawa BG] finishSearch without missionId — aborting")
    return cleanupWorkerTab(state)
  }

  await chrome.storage.local.set({ [STATE_KEY]: { ...state, phase: "pushing" } })

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
  let serverMessage = ""
  try {
    const body = JSON.stringify({
      profiles: payload,
      final: true,
      partial: !!state._partial,
      blockReason: state._blockReason || null,
    })
    const apiBase = await resolveApiBase()
    let res = await fetch(`${apiBase}/api/missions/${state.missionId}/profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${state.token}` },
      body,
    })

    if (res.status === 401) {
      const fresh = await refreshTokenViaNawaTab()
      if (fresh) {
        res = await fetch(`${apiBase}/api/missions/${state.missionId}/profiles`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${fresh}` },
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
    console.error("[Nawa BG] Push profiles network error:", e)
    serverMessage = String(e?.message || e)
  }

  await chrome.storage.local.set({
    [STATE_KEY]: {
      ...state,
      phase: success ? "done" : "error",
      error: success ? null : (serverMessage || "Échec de l'envoi des profils"),
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

function buildGoogleUrl(query) {
  // Pas de &num= — c'est un signal d'automatisation
  return `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=fr`
}

function navigateToQuery(tabId, query) {
  return chrome.tabs.update(tabId, { url: buildGoogleUrl(query) })
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

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
