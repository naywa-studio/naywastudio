/**
 * background.js — Service Worker MV3 v2.0.0
 * Rôle minimal :
 *  1. Ouvrir la side panel au clic sur l'icône
 *  2. Stocker le token Supabase reçu depuis content_nawa.js
 *  3. Relayer les profils LinkedIn capturés par content_linkedin_search.js
 *     vers chrome.storage.local (lu par la side panel)
 */

const API_BASE = "https://nawa-studio.vercel.app"

// ── Ouvrir la side panel au clic ──────────────────────────────────────────────
chrome.action.onClicked.addListener(tab => {
  chrome.sidePanel.open({ tabId: tab.id })
})

// ── Messages ──────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // Auth depuis content_nawa.js
  if (msg.type === "SET_AUTH") {
    chrome.storage.local.set({
      nawa_access_token: msg.accessToken,
      nawa_user_id:      msg.userId,
      nawa_auth_at:      Date.now(),
    }, () => {
      console.log("[Nawa BG] Token stocké pour user:", msg.userId?.slice(0, 8))
    })
    sendResponse({ ok: true })
    return
  }

  // Profils LinkedIn capturés par content_linkedin_search.js
  if (msg.type === "LINKEDIN_PROFILES") {
    const incoming = msg.profiles ?? []
    if (incoming.length === 0) { sendResponse({ ok: true }); return }

    chrome.storage.local.get(["nawa_collected_profiles"], data => {
      const existing    = (data.nawa_collected_profiles ?? [])
      const existingSet = new Set(existing.map(p => p.linkedin_url))
      const newOnes     = incoming.filter(p => p.linkedin_url && !existingSet.has(p.linkedin_url))

      if (newOnes.length === 0) { sendResponse({ ok: true }); return }

      chrome.storage.local.set({
        nawa_collected_profiles: [...existing, ...newOnes],
      }, () => {
        console.log(`[Nawa BG] +${newOnes.length} profils (total: ${existing.length + newOnes.length})`)
        sendResponse({ ok: true, added: newOnes.length, total: existing.length + newOnes.length })
      })
    })
    return true   // réponse async
  }
})
