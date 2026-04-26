/**
 * background.js — Service Worker MV3
 * Orchestre :
 *  1. Réception et stockage du token Supabase depuis content_nawa.js
 *  2. Poll périodique des jobs d'enrichissement (/api/extension/jobs)
 *  3. Ouverture des profils LinkedIn en background + collecte via content_linkedin.js
 *  4. Envoi des données enrichies à /api/extension/profile
 */

const API_BASE = "https://nawa-studio.vercel.app"
const POLL_ALARM = "nawa-poll-jobs"
const ENRICH_DELAY_MS = 4000   // 4s entre chaque profil (humain)

let isEnriching = false

// ── Démarrage ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  // Alarme toutes les minutes (minimum MV3)
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 })
  console.log("[Nawa] Extension installée")
})

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === POLL_ALARM && !isEnriching) {
    pollAndEnrich()
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

    case "GET_STATUS":
      chrome.storage.local.get(
        ["nawa_access_token", "nawa_user_id", "nawa_enriched_count"],
        data => sendResponse({
          connected:     !!data.nawa_access_token,
          userId:        data.nawa_user_id ?? null,
          enrichedCount: data.nawa_enriched_count ?? 0,
        })
      )
      return true   // async sendResponse

    case "TRIGGER_ENRICH":
      if (!isEnriching) pollAndEnrich()
      sendResponse({ ok: true })
      break
  }
})

// ── Collecte de profil depuis content script ──────────────────────────────────

async function handleProfileExtracted(profile, tabId) {
  const { nawa_access_token: token, nawa_pending_url } = await getStorage([
    "nawa_access_token",
    "nawa_pending_url",
  ])
  if (!token) return

  // Vérifier que ce profil fait partie d'un job en cours
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
      // Incrémenter le compteur
      const { nawa_enriched_count = 0 } = await getStorage(["nawa_enriched_count"])
      chrome.storage.local.set({ nawa_enriched_count: nawa_enriched_count + 1 })
      chrome.storage.local.remove("nawa_pending_url")

      // Fermer l'onglet automatique (tabId défini = onglet ouvert par le background)
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

// ── Poll + enrichissement automatique ────────────────────────────────────────

async function pollAndEnrich() {
  const { nawa_access_token: token } = await getStorage(["nawa_access_token"])
  if (!token) return

  let jobs = []
  try {
    const res = await fetch(`${API_BASE}/api/extension/jobs`, {
      headers: { "Authorization": `Bearer ${token}` },
    })
    if (!res.ok) {
      if (res.status === 401) {
        // Token expiré — vider le stockage et demander reconnexion
        chrome.storage.local.remove(["nawa_access_token", "nawa_user_id"])
        updateBadge("!", "#ef4444")
      }
      return
    }
    const data = await res.json()
    jobs = data.jobs ?? []
  } catch {
    return
  }

  if (!jobs.length) {
    updateBadge("", "")
    return
  }

  updateBadge(String(jobs.length), "#7C63C8")
  console.log(`[Nawa] ${jobs.length} profil(s) à enrichir`)

  isEnriching = true
  try {
    for (const job of jobs) {
      if (!job.linkedin_url) continue

      await enrichProfile(job, token)
      await sleep(ENRICH_DELAY_MS)   // Délai humain entre profils
    }
  } finally {
    isEnriching = false
    updateBadge("", "")
  }
}

async function enrichProfile(job, token) {
  const url = job.linkedin_url

  return new Promise(resolve => {
    // Ouvrir le profil LinkedIn en arrière-plan
    chrome.tabs.create({ url, active: false }, async tab => {
      // Stocker l'URL en attente et le tabId auto-ouvert
      const { nawa_auto_tabs = [] } = await getStorage(["nawa_auto_tabs"])
      chrome.storage.local.set({
        nawa_pending_url: normalize(url),
        nawa_pending_candidate_id: job.candidate_id,
        nawa_auto_tabs: [...nawa_auto_tabs, tab.id],
      })

      // Attendre que le contenu soit extrait (content script l'enverra via message)
      // Timeout de sécurité : 15 secondes
      const timeout = setTimeout(async () => {
        chrome.storage.local.remove(["nawa_pending_url", "nawa_pending_candidate_id"])
        chrome.tabs.remove(tab.id).catch(() => {})
        resolve()
      }, 15000)

      // Écouter la confirmation d'envoi
      const listener = (msg) => {
        if (msg.type === "PROFILE_EXTRACTED" && normalize(msg.profile.linkedin_url) === normalize(url)) {
          clearTimeout(timeout)
          chrome.runtime.onMessage.removeListener(listener)
          // Laisser handleProfileExtracted gérer la fermeture de l'onglet
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
