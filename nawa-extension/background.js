/**
 * background.js — Service Worker MV3
 * Orchestre :
 *  1. Réception et stockage du token Supabase depuis content_nawa.js
 *  2. Poll périodique des jobs (/api/extension/jobs)
 *  3. [Léo N1] Recherche Google en background → collecte d'URLs LinkedIn → envoi à search-results
 *  4. [Nora N2] Ouverture des profils LinkedIn → collecte via content_linkedin.js → envoi à profile
 */

const API_BASE      = "https://nawa-studio.vercel.app"
const POLL_ALARM    = "nawa-poll-jobs"
const ENRICH_DELAY_MS  = 4000   // 4s entre chaque profil LinkedIn (humain)
const SEARCH_DELAY_MS  = 3000   // 3s entre chaque recherche Google (humain)

let isProcessing = false

// ── Démarrage ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 })
  console.log("[Nawa] Extension installée v1.1.0")
})

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === POLL_ALARM && !isProcessing) {
    pollAndProcess()
  }
})

// ── Messages entrants ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {

    case "SET_AUTH":
      chrome.storage.local.set({
        nawa_access_token: msg.accessToken,
        nawa_user_id:      msg.userId,
        nawa_auth_at:      Date.now(),
      })
      updateBadge("✓", "#22c55e")
      sendResponse({ ok: true })
      break

    case "PROFILE_EXTRACTED":
      handleProfileExtracted(msg.profile, sender.tab?.id)
      sendResponse({ ok: true })
      break

    case "GOOGLE_RESULTS":
      handleGoogleResults(msg.results, msg.query)
      sendResponse({ ok: true })
      break

    case "GOOGLE_DONE":
      handleGoogleDone(sender.tab?.id)
      sendResponse({ ok: true })
      break

    case "GET_STATUS":
      chrome.storage.local.get(
        ["nawa_access_token", "nawa_user_id", "nawa_enriched_count", "nawa_searched_count"],
        data => sendResponse({
          connected:     !!data.nawa_access_token,
          userId:        data.nawa_user_id ?? null,
          enrichedCount: data.nawa_enriched_count ?? 0,
          searchedCount: data.nawa_searched_count ?? 0,
        })
      )
      return true   // async sendResponse

    case "TRIGGER_ENRICH":
      if (!isProcessing) pollAndProcess()
      sendResponse({ ok: true })
      break
  }
})

// ── Poll principal ────────────────────────────────────────────────────────────

async function pollAndProcess() {
  const { nawa_access_token: token } = await getStorage(["nawa_access_token"])
  if (!token) return

  let googleJobs = []
  let linkedinJobs = []

  try {
    const res = await fetch(`${API_BASE}/api/extension/jobs`, {
      headers: { "Authorization": `Bearer ${token}` },
    })
    if (!res.ok) {
      if (res.status === 401) {
        chrome.storage.local.remove(["nawa_access_token", "nawa_user_id"])
        updateBadge("!", "#ef4444")
      }
      return
    }
    const data = await res.json()
    googleJobs  = data.google_jobs  ?? []
    linkedinJobs = data.jobs ?? []  // legacy field = linkedin_enrich
  } catch {
    return
  }

  const total = googleJobs.length + linkedinJobs.length
  if (total === 0) {
    updateBadge("", "")
    return
  }

  updateBadge(String(total), "#7C63C8")
  isProcessing = true

  try {
    // Priorité 1 : Google search jobs (Léo)
    if (googleJobs.length > 0) {
      console.log(`[Nawa] ${googleJobs.length} session(s) de recherche Google à traiter`)
      for (const job of googleJobs) {
        await handleGoogleSearchJob(job, token)
      }
    }

    // Priorité 2 : LinkedIn enrichment jobs (Nora)
    if (linkedinJobs.length > 0) {
      console.log(`[Nawa] ${linkedinJobs.length} profil(s) LinkedIn à enrichir`)
      for (const job of linkedinJobs) {
        if (!job.linkedin_url) continue
        await enrichProfile(job, token)
        await sleep(ENRICH_DELAY_MS)
      }
    }
  } finally {
    isProcessing = false
    updateBadge("", "")
  }
}

// ── Google search job (Léo) ───────────────────────────────────────────────────

async function handleGoogleSearchJob(job, token) {
  const { session_id, queries } = job
  if (!session_id || !Array.isArray(queries) || queries.length === 0) return

  console.log(`[Nawa] Session ${session_id} — ${queries.length} recherche(s) Google à effectuer`)

  // Stocker la session active
  await chrome.storage.local.set({ nawa_active_search_session: session_id })

  const allResults = []

  for (const query of queries) {
    // Construire l'URL de recherche Google avec filtre LinkedIn
    const searchQuery = `site:linkedin.com/in/ ${query}`
    const searchUrl   = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=10&hl=fr&gl=fr`

    const results = await openGoogleTab(searchUrl)
    allResults.push(...results)

    if (allResults.length > 0) {
      // Envoyer les résultats intermédiaires au fur et à mesure
      await postSearchResults(session_id, results, token)
    }

    await sleep(SEARCH_DELAY_MS)
  }

  // Marquer la session comme prête (toutes les requêtes traitées)
  await markSessionReady(session_id, token)

  // Stats
  const { nawa_searched_count = 0 } = await getStorage(["nawa_searched_count"])
  await chrome.storage.local.set({
    nawa_searched_count: nawa_searched_count + allResults.length,
    nawa_active_search_session: null,
  })

  console.log(`[Nawa] Session ${session_id} terminée — ${allResults.length} URL(s) trouvée(s)`)
}

// ── Ouvrir un onglet Google + attendre les résultats ─────────────────────────

function openGoogleTab(url) {
  return new Promise(resolve => {
    const results       = []
    let   resolved      = false
    let   tabId         = null
    let   doneTimeout   = null

    function finish() {
      if (resolved) return
      resolved = true
      clearTimeout(doneTimeout)
      if (tabId) chrome.tabs.remove(tabId).catch(() => {})
      resolve(results)
    }

    // Écouter les messages du content script
    const listener = (msg, sender) => {
      if (sender.tab?.id !== tabId) return

      if (msg.type === "GOOGLE_RESULTS") {
        results.push(...(msg.results ?? []))
      }
      if (msg.type === "GOOGLE_DONE") {
        chrome.runtime.onMessage.removeListener(listener)
        // Petit délai pour s'assurer que GOOGLE_RESULTS est arrivé avant GOOGLE_DONE
        setTimeout(finish, 300)
      }
    }

    chrome.runtime.onMessage.addListener(listener)

    chrome.tabs.create({ url, active: false }, tab => {
      tabId = tab.id

      // Timeout de sécurité : 15 secondes
      doneTimeout = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(listener)
        finish()
      }, 15000)
    })
  })
}

// ── Envoyer résultats Google à Vercel ─────────────────────────────────────────

async function postSearchResults(session_id, results, token) {
  if (!results.length) return
  try {
    await fetch(`${API_BASE}/api/extension/search-results`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ session_id, results }),
    })
  } catch (e) {
    console.warn("[Nawa] Erreur envoi résultats Google :", e)
  }
}

// ── Marquer session Google comme prête ────────────────────────────────────────

async function markSessionReady(session_id, token) {
  try {
    await fetch(`${API_BASE}/api/extension/search-results`, {
      method:  "PATCH",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ session_id }),
    })
  } catch (e) {
    console.warn("[Nawa] Erreur marquage session prête :", e)
  }
}

// ── Handlers messages content scripts ─────────────────────────────────────────

function handleGoogleResults(results, query) {
  // Géré directement dans openGoogleTab via le listener
  console.log(`[Nawa] content_google → ${results?.length ?? 0} résultat(s) pour "${query}"`)
}

function handleGoogleDone(tabId) {
  // Géré directement dans openGoogleTab via le listener
  console.log("[Nawa] content_google → page traitée, tabId:", tabId)
}

// ── LinkedIn enrichment (Nora) ────────────────────────────────────────────────

async function handleProfileExtracted(profile, tabId) {
  const { nawa_access_token: token, nawa_pending_url } = await getStorage([
    "nawa_access_token",
    "nawa_pending_url",
  ])
  if (!token) return

  if (nawa_pending_url && normalize(profile.linkedin_url) !== normalize(nawa_pending_url)) {
    return
  }

  try {
    const res = await fetch(`${API_BASE}/api/extension/profile`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(profile),
    })

    if (res.ok) {
      const { nawa_enriched_count = 0 } = await getStorage(["nawa_enriched_count"])
      chrome.storage.local.set({ nawa_enriched_count: nawa_enriched_count + 1 })
      chrome.storage.local.remove("nawa_pending_url")

      if (tabId) {
        const { nawa_auto_tabs = [] } = await getStorage(["nawa_auto_tabs"])
        if (nawa_auto_tabs.includes(tabId)) {
          setTimeout(() => chrome.tabs.remove(tabId).catch(() => {}), 800)
        }
      }
      console.log("[Nawa] Profil enrichi :", profile.name || profile.linkedin_url)
    }
  } catch (e) {
    console.warn("[Nawa] Erreur envoi profil :", e)
  }
}

async function enrichProfile(job, token) {
  const url = job.linkedin_url

  return new Promise(resolve => {
    chrome.tabs.create({ url, active: false }, async tab => {
      const { nawa_auto_tabs = [] } = await getStorage(["nawa_auto_tabs"])
      chrome.storage.local.set({
        nawa_pending_url:          normalize(url),
        nawa_pending_candidate_id: job.candidate_id,
        nawa_auto_tabs:            [...nawa_auto_tabs, tab.id],
      })

      const timeout = setTimeout(async () => {
        chrome.storage.local.remove(["nawa_pending_url", "nawa_pending_candidate_id"])
        chrome.tabs.remove(tab.id).catch(() => {})
        resolve()
      }, 15000)

      const listener = (msg) => {
        if (msg.type === "PROFILE_EXTRACTED" && normalize(msg.profile.linkedin_url) === normalize(url)) {
          clearTimeout(timeout)
          chrome.runtime.onMessage.removeListener(listener)
          setTimeout(resolve, 2000)
        }
      }
      chrome.runtime.onMessage.addListener(listener)
    })
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(url) {
  return (url || "").split("?")[0].replace(/\/$/, "").toLowerCase()
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getStorage(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve))
}

function updateBadge(text, color) {
  chrome.action.setBadgeText({ text: text.slice(0, 4) })
  if (color) chrome.action.setBadgeBackgroundColor({ color })
}
