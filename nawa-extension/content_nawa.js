/**
 * content_nawa.js — injecté sur nawa-studio.vercel.app — v4.0.0
 *
 * Rôles :
 *  1. Auth : récupère la session Supabase via cookies SSR → SET_AUTH au background
 *  2. Bridge : relais window.postMessage ↔ chrome.runtime
 *     - La page poste {source:'nawa-page', type:'RUN_SEARCH', payload}
 *     - On forwarde au background ; on ack via window.postMessage(source:'nawa-extension')
 */

;(function () {
  "use strict"

  const API_BASE = "https://nawa-studio.vercel.app"

  /* ── 1. Auth refresh ──────────────────────────────────────────────────── */

  fetch(`${API_BASE}/api/extension/auth`, { credentials: "include", cache: "no-store" })
    .then(r => r.json())
    .then(data => {
      if (data.authenticated && data.access_token) {
        chrome.runtime.sendMessage({
          type:        "SET_AUTH",
          accessToken: data.access_token,
          userId:      data.user_id,
        })
      }
    })
    .catch(() => { /* offline */ })

  /* ── 2. Bridge page ↔ background ─────────────────────────────────────── */

  // Announce extension presence so the page knows it can dispatch RUN_SEARCH
  window.postMessage({ source: "nawa-extension", type: "READY" }, window.location.origin)

  window.addEventListener("message", (event) => {
    if (event.source !== window) return
    const data = event.data
    if (!data || data.source !== "nawa-page") return

    if (data.type === "PING_EXTENSION") {
      window.postMessage({ source: "nawa-extension", type: "PONG" }, window.location.origin)
      return
    }

    if (data.type === "RUN_SEARCH") {
      chrome.runtime.sendMessage(
        { type: "RUN_SEARCH_FROM_PAGE", payload: data.payload },
        (resp) => {
          window.postMessage(
            {
              source: "nawa-extension",
              type:   "RUN_SEARCH_ACK",
              ok:     !!resp?.ok,
              error:  resp?.error || null,
              missionId: resp?.missionId || data.payload?.missionId,
              queriesCount: resp?.queriesCount,
            },
            window.location.origin
          )
        }
      )
    }
  })
})()
