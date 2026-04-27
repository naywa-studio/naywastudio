/**
 * background.js — Service Worker MV3 v1.2.0
 * Orchestre :
 *  1. Réception et stockage du token Supabase depuis content_nawa.js
 *  2. Poll périodique des jobs (/api/extension/jobs)
 *  3. [Léo N1] Recherche Google en background → collecte d'URLs LinkedIn → envoi à search-results
 *  4. [Nora N2] Ouverture des profils LinkedIn → collecte via content_linkedin.js → envoi à profile
 */

const API_BASE         = "https://nawa-studio.vercel.app"
const POLL_ALARM       = "nawa-poll-jobs"
const ENRICH_DELAY_MS  = 4000   // 4s entre chaque profil LinkedIn (humain)
const SEARCH_DELAY_MS  = 2000   // 2s entre chaque recherche Google

let isProcessing = false

// ── Démarrage ────────────────────────────────────────────────────────────────

function ensureAlarm() {
  chrome.alarms.get(POLL_ALARM, alarm => {
    if (!alarm) {
      chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 })
      console.log("[Nawa] Alarm (re)créée")
    }
  })
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm()
  console.log("[Nawa] Extension installée v1.2.0")
})

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm()
  console.log("[Nawa] Extension démarrée (startup)")
  // Poll immédiatement au démarrage
  if (!isProcessing) pollAndProcess()
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
      }, () => {
        updateBadge("✓", "#22c55e")
        console.log("[Nawa] Token mis à jour pour user:", msg.userId)
        // Poll immédiat après reconnexion — n'attend pas l'alarm
        if (!isProcessing) {
          console.log("[Nawa] Déclenchement poll immédiat après SET_AUTH")
          pollAndProcess()
        }
      })
      sendResponse({ ok: true })
      break

    case "PROFILE_EXTRACTED":
      handleProfileExtracted(msg.profile, sender.tab?.id)
      sendResponse({ ok: true })
      break

    case "GOOGLE_RESULTS":
      // Géré directement dans openGoogleTab via le listener local
      console.log(`[Nawa] content_google → ${msg.results?.length ?? 0} résultat(s) pour "${msg.query?.slice(0,60)}"`)
      sendResponse({ ok: true })
      break

    case "GOOGLE_DONE":
      // Géré directement dans openGoogleTab via le listener local
      console.log("[Nawa] content_google → page traitée, tabId:", sender.tab?.id)
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
          isProcessing,
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

  let googleJobs  = []
  let linkedinJobs = []

  try {
    const res = await fetch(`${API_BASE}/api/extension/jobs`, {
      headers: { "Authorization": `Bearer ${token}` },
    })
    if (!res.ok) {
      if (res.status === 401) {
        console.warn("[Nawa] Token expiré (401) — reconnexion nécessaire")
        chrome.storage.local.remove(["nawa_access_token", "nawa_user_id"])
        updateBadge("!", "#ef4444")
      }
      return
    }
    const data  = await res.json()
    googleJobs   = data.google_jobs  ?? []
    linkedinJobs = data.jobs ?? []  // legacy field = linkedin_enrich
    console.log(`[Nawa] Jobs: ${googleJobs.length} Google, ${linkedinJobs.length} LinkedIn`)
  } catch (e) {
    console.warn("[Nawa] Erreur poll jobs:", e)
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

  console.log(`[Nawa] Session ${session_id} — ${queries.length} recherche(s) Google`)
  updateBadge("🔍", "#7C63C8")

  // Marquer la session en cours côté Vercel (optionnel, pour le suivi)
  await chrome.storage.local.set({ nawa_active_search_session: session_id })

  const allResults = []

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i]
    // URL Google avec filtre site:linkedin.com/in/
    const searchQuery = `site:linkedin.com/in/ ${query}`
    const searchUrl   = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=10&hl=fr&gl=fr`

    console.log(`[Nawa] Requête ${i+1}/${queries.length}: ${query.slice(0,60)}`)
    const results = await openGoogleTab(searchUrl)
    console.log(`[Nawa] Requête ${i+1}: ${results.length} résultat(s) trouvé(s)`)

    if (results.length > 0) {
      allResults.push(...results)
      // Envoi intermédiaire au fur et à mesure
      await postSearchResults(session_id, results, token)
    }

    if (i < queries.length - 1) {
      await sleep(SEARCH_DELAY_MS)
    }
  }

  // Marquer la session comme prête (toutes les requêtes traitées)
  await markSessionReady(session_id, token)

  // Stats
  const { nawa_searched_count = 0 } = await getStorage(["nawa_searched_count"])
  await chrome.storage.local.set({
    nawa_searched_count: nawa_searched_count + allResults.length,
    nawa_active_search_session: null,
  })

  console.log(`[Nawa] Session ${session_id} terminée — ${allResults.length} URL(s) trouvée(s) au total`)
}

// ── Ouvrir un onglet Google + attendre les résultats ─────────────────────────

function openGoogleTab(url) {
  return new Promise(resolve => {
    const results     = []
    let   resolved    = false
    let   tabId       = null
    let   doneTimeout = null

    function finish(reason) {
      if (resolved) return
      resolved = true
      clearTimeout(doneTimeout)
      console.log(`[Nawa] openGoogleTab finish (${reason}) — ${results.length} résultats`)
      if (tabId) {
        chrome.tabs.remove(tabId).catch(() => {})
      }
      resolve(results)
    }

    // Écouter les messages du content script sur cette tab spécifique
    const listener = (msg, sender) => {
      // Ignorer les messages qui ne viennent pas de notre tab
      if (sender.tab?.id !== tabId) return

      if (msg.type === "GOOGLE_RESULTS" && Array.isArray(msg.results)) {
        results.push(...msg.results)
        console.log(`[Nawa] GOOGLE_RESULTS reçu: +${msg.results.length} (total: ${results.length})`)
      }
      if (msg.type === "GOOGLE_DONE") {
        chrome.runtime.onMessage.removeListener(listener)
        // Petit délai pour s'assurer que GOOGLE_RESULTS est arrivé avant GOOGLE_DONE
        setTimeout(() => finish("GOOGLE_DONE"), 500)
      }
    }

    chrome.runtime.onMessage.addListener(listener)

    // Créer l'onglet — active:false pour ne pas déranger l'utilisateur
    // Chrome charge quand même le contenu et exécute les content scripts
    chrome.tabs.create({ url, active: false }, tab => {
      tabId = tab.id
      console.log(`[Nawa] Tab Google créée: ${tabId}`)

      // Timeout de sécurité : 20 secondes (Google peut être lent)
      doneTimeout = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(listener)
        finish("timeout")
      }, 20000)
    })
  })
}

// ── Envoyer résultats Google à Vercel ─────────────────────────────────────────

async function postSearchResults(session_id, results, token) {
  if (!results || results.length === 0) return
  try {
    const res = await fetch(`${API_BASE}/api/extension/search-results`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ session_id, results }),
    })
    if (!res.ok) {
      const text = await res.text()
      console.warn(`[Nawa] postSearchResults error ${res.status}: ${text.slice(0,100)}`)
    } else {
      const data = await res.json()
      console.log(`[Nawa] postSearchResults: +${data.added ?? 0} URLs (total: ${data.total ?? 0})`)
    }
  } catch (e) {
    console.warn("[Nawa] Erreur envoi résultats Google:", e)
  }
}

// ── Marquer session Google comme prête ────────────────────────────────────────

async function markSessionReady(session_id, token) {
  try {
    const res = await fetch(`${API_BASE}/api/extension/search-results`, {
      method:  "PATCH",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ session_id }),
    })
    if (res.ok) {
      console.log(`[Nawa] Session ${session_id} marquée prête ✓`)
    } else {
      console.warn(`[Nawa] markSessionReady error: ${res.status}`)
    }
  } catch (e) {
    console.warn("[Nawa] Erreur marquage session prête:", e)
  }
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
    console.warn("[Nawa] Erreur envoi profil:", e)
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
