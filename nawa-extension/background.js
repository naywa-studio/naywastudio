/**
 * background.js — Service Worker v3.0.0
 *
 * Orchestrateur de recherche LinkedIn via Google.
 *
 * Flux :
 *  1. Popup envoie START_SEARCH { raw_text, token, level }
 *  2. Background appelle /api/extension/generate-queries → brief + queries[]
 *  3. Background trouve / crée un onglet Nawa Studio
 *  4. Pour chaque query : navigue l'onglet vers Google → content_google.js extrait les URLs
 *  5. Nora uniquement : visite les top profils LinkedIn pour enrichissement
 *  6. Revient sur l'onglet Nawa Studio → content_nawa.js prend le relais
 *
 * State (chrome.storage.local) : nawa_search_state
 */

const API_BASE = "https://nawa-studio.vercel.app"
const STATE_KEY = "nawa_search_state"
const MAX_PROFILES = 80    // profils max collectés
const ENRICH_MAX   = 8     // profils enrichis max (Nora)

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // Auth reçue depuis content_nawa.js
  if (msg.type === "SET_AUTH") {
    chrome.storage.local.set({
      nawa_access_token: msg.accessToken,
      nawa_user_id:      msg.userId,
      nawa_auth_at:      Date.now(),
    })
    sendResponse({ ok: true })
    return
  }

  // Statut pour le popup
  if (msg.type === "GET_STATUS") {
    chrome.storage.local.get([STATE_KEY, "nawa_access_token", "nawa_user_id"], data => {
      sendResponse({
        authenticated: !!data.nawa_access_token,
        userId:        data.nawa_user_id ?? null,
        state:         data[STATE_KEY] ?? null,
      })
    })
    return true // async
  }

  // Démarrage depuis le popup
  if (msg.type === "START_SEARCH") {
    handleStartSearch(msg)
      .then(r => sendResponse(r))
      .catch(e => sendResponse({ ok: false, error: e.message }))
    return true
  }

  // Résultats Google depuis content_google.js
  if (msg.type === "GOOGLE_RESULTS") {
    onGoogleResults(msg.results ?? [])
    sendResponse({ ok: true })
    return
  }

  // Fin de page Google (0 résultat ou après GOOGLE_RESULTS)
  if (msg.type === "GOOGLE_DONE") {
    onGoogleDone()
    sendResponse({ ok: true })
    return
  }

  // Profil LinkedIn enrichi depuis content_linkedin.js (Nora)
  if (msg.type === "PROFILE_EXTRACTED") {
    onProfileExtracted(msg.profile)
    sendResponse({ ok: true })
    return
  }

  // Annulation depuis le popup
  if (msg.type === "CANCEL_SEARCH") {
    chrome.storage.local.remove([STATE_KEY])
    sendResponse({ ok: true })
    return
  }
})

// ── Tab watcher ───────────────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return

  const { [STATE_KEY]: state } = await chrome.storage.local.get([STATE_KEY])
  if (!state || state.nawaTabId !== tabId) return

  // Retour sur Nawa Studio après les recherches
  if (
    (state.phase === "returning") &&
    tab.url?.includes("nawa-studio.vercel.app")
  ) {
    await chrome.storage.local.set({
      [STATE_KEY]: { ...state, phase: "done" },
    })
    return
  }

  // Enrichissement Nora : profil LinkedIn chargé
  if (state.phase === "enriching" && tab.url?.includes("linkedin.com/in/")) {
    // content_linkedin.js va envoyer PROFILE_EXTRACTED
    // Timeout de sécurité (LinkedIn lent ou bloqué)
    setTimeout(async () => {
      const { [STATE_KEY]: cur } = await chrome.storage.local.get([STATE_KEY])
      if (!cur || cur.phase !== "enriching" || cur.nawaTabId !== tabId) return
      // Si PROFILE_EXTRACTED n'a pas encore avancé l'index, on avance quand même
      if (cur.enrichIndex === state.enrichIndex) {
        await advanceEnrichment(tabId, cur)
      }
    }, 9000)
  }
})

// ── Start search ──────────────────────────────────────────────────────────────

async function refreshTokenViaNawaTab() {
  try {
    const tabs = await chrome.tabs.query({ url: `${API_BASE}/*` })
    if (tabs.length === 0) return null
    await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      files:  ["content_nawa.js"],
    })
    // content_nawa.js fait fetch /api/extension/auth (cookies) → SET_AUTH
    // On attend que le storage soit mis à jour
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

async function callGenerateQueries(token, raw_text, level) {
  const res = await fetch(`${API_BASE}/api/extension/generate-queries`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ raw_text, level: level || "leo" }),
  })
  return { res, status: res.status }
}

async function handleStartSearch({ raw_text, token, level }) {
  // 1. Générer brief + requêtes via LLM (avec retry si token expiré)
  let brief, queries
  let usedToken = token
  try {
    let { res } = await callGenerateQueries(usedToken, raw_text, level)

    if (res.status === 401) {
      console.log("[Nawa BG] Token expiré — tentative de refresh…")
      const fresh = await refreshTokenViaNawaTab()
      if (!fresh) {
        return { ok: false, error: "Session expirée. Rechargez l'onglet Nawa Studio (F5), puis réessayez." }
      }
      usedToken = fresh
      const retry = await callGenerateQueries(usedToken, raw_text, level)
      res = retry.res
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "")
      console.error("[Nawa BG] generate-queries HTTP", res.status, txt.slice(0, 200))
      const errMsg = res.status === 401
        ? "Session expirée. Rechargez l'onglet Nawa Studio."
        : res.status === 404
        ? "Endpoint introuvable — déploiement en cours ?"
        : `Erreur serveur (${res.status})`
      return { ok: false, error: errMsg }
    }

    const data = await res.json()
    if (!data.ok || !data.queries?.length) {
      return { ok: false, error: data.error || "Aucune requête générée" }
    }
    brief   = data.brief
    queries = data.queries
  } catch (e) {
    console.error("[Nawa BG] generate-queries:", e)
    return { ok: false, error: `Erreur réseau : ${e.message}` }
  }

  // Sauvegarder le token éventuellement rafraîchi pour les prochains appels
  token = usedToken

  // 2. Trouver ou créer l'onglet Nawa Studio
  let nawaTabId
  let nawaUrl = `${API_BASE}/workspace`

  try {
    const nawaTabs = await chrome.tabs.query({ url: `${API_BASE}/*` })
    if (nawaTabs.length > 0) {
      const tab = nawaTabs[0]
      nawaTabId = tab.id
      nawaUrl   = tab.url || nawaUrl
      await chrome.tabs.update(nawaTabId, { active: true })
    } else {
      const newTab = await chrome.tabs.create({ url: nawaUrl })
      nawaTabId = newTab.id
      await sleep(2500) // attendre que la page charge
    }
  } catch (e) {
    return { ok: false, error: "Impossible d'accéder à l'onglet Nawa Studio" }
  }

  // 3. Sauvegarder l'état et démarrer
  const state = {
    phase:      "searching",
    token,
    level:      level || "leo",
    brief,
    queries,
    queryIndex: 0,
    profiles:   [],
    nawaTabId,
    nawaUrl,
    startedAt:  Date.now(),
  }
  await chrome.storage.local.set({ [STATE_KEY]: state })

  // 4. Naviguer vers la première requête Google
  await navigateToQuery(nawaTabId, queries[0])

  return { ok: true, brief, queriesCount: queries.length }
}

// ── Google result handlers ────────────────────────────────────────────────────

// Guard : éviter double-advance si GOOGLE_RESULTS + GOOGLE_DONE arrivent tous les deux
let _pendingProfiles = null
let _pendingTimer    = null

function onGoogleResults(newProfiles) {
  // Stocker les profils reçus ; attendre GOOGLE_DONE pour avancer
  _pendingProfiles = newProfiles
  // Fallback si GOOGLE_DONE n'arrive jamais
  clearTimeout(_pendingTimer)
  _pendingTimer = setTimeout(() => {
    if (_pendingProfiles !== null) {
      const profiles = _pendingProfiles
      _pendingProfiles = null
      chrome.storage.local.get([STATE_KEY], ({ [STATE_KEY]: state }) => {
        if (state?.phase === "searching") {
          advanceSearch(state.nawaTabId, state, profiles)
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
    advanceSearch(state.nawaTabId, state, profiles)
  })
}

async function advanceSearch(tabId, currentState, newProfiles) {
  // Dédupliquer
  const seen = new Set(currentState.profiles.map(p => p.linkedin_url))
  const unique = (newProfiles || []).filter(p => p.linkedin_url && !seen.has(p.linkedin_url))
  const merged = [...currentState.profiles, ...unique]

  const nextIndex = currentState.queryIndex + 1

  const updated = { ...currentState, profiles: merged, queryIndex: nextIndex }

  // Condition de fin
  const allQueriesDone = nextIndex >= currentState.queries.length
  const enoughProfiles = merged.length >= MAX_PROFILES

  if (allQueriesDone || enoughProfiles) {
    if (currentState.level === "nora" && merged.length > 0) {
      await startEnrichment(tabId, updated)
    } else {
      await returnToNawa(tabId, updated)
    }
    return
  }

  // Prochaine requête
  await chrome.storage.local.set({ [STATE_KEY]: updated })
  await navigateToQuery(tabId, currentState.queries[nextIndex])
}

// ── Enrichissement Nora ───────────────────────────────────────────────────────

async function startEnrichment(tabId, state) {
  const enrichQueue = state.profiles
    .slice(0, ENRICH_MAX)
    .map(p => p.linkedin_url)

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
  await advanceEnrichment(state.nawaTabId, updated)
}

async function advanceEnrichment(tabId, state) {
  const nextIndex = state.enrichIndex + 1

  if (nextIndex >= state.enrichQueue.length) {
    // Fusionner les données enrichies avec les profils de base
    const enrichedByUrl = {}
    for (const p of state.enrichedData || []) {
      enrichedByUrl[p.linkedin_url] = p
    }
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
        skills:   e.skills   || [],
      }
    })
    await returnToNawa(tabId, { ...state, profiles: mergedProfiles })
    return
  }

  const updated = { ...state, enrichIndex: nextIndex }
  await chrome.storage.local.set({ [STATE_KEY]: updated })
  await chrome.tabs.update(tabId, { url: state.enrichQueue[nextIndex] })
}

// ── Retour Nawa ───────────────────────────────────────────────────────────────

async function returnToNawa(tabId, state) {
  await chrome.storage.local.set({
    [STATE_KEY]: { ...state, phase: "returning" },
  })
  await chrome.tabs.update(tabId, { url: state.nawaUrl, active: true })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function navigateToQuery(tabId, query) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10&hl=fr`
  console.log(`[Nawa BG] Navigating to: ${url.slice(0, 100)}`)
  return chrome.tabs.update(tabId, { url })
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}
