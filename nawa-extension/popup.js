/**
 * popup.js — Gère l'affichage du popup de l'extension Nawa.
 */

const $ = id => document.getElementById(id)

function showState(name) {
  ["connected", "disconnected", "loading", "enriching"].forEach(s => {
    $(`state-${s}`)?.classList.toggle("hidden", s !== name)
  })
}

// ── Init ──────────────────────────────────────────────────────────────────────

chrome.runtime.sendMessage({ type: "GET_STATUS" }, status => {
  if (chrome.runtime.lastError) {
    showState("disconnected")
    return
  }

  if (!status?.connected) {
    showState("disconnected")
    return
  }

  showState("connected")
  if (status.enrichedCount > 0) {
    $("enriched-count").textContent = `${status.enrichedCount} enrichi${status.enrichedCount > 1 ? "s" : ""}`
  }
})

// ── Actions ───────────────────────────────────────────────────────────────────

$("btn-enrich")?.addEventListener("click", () => {
  showState("enriching")
  chrome.runtime.sendMessage({ type: "TRIGGER_ENRICH" }, () => {
    // Revenir à l'état connecté après 2 secondes
    setTimeout(() => showState("connected"), 2000)
  })
})

$("btn-disconnect")?.addEventListener("click", () => {
  chrome.storage.local.remove(
    ["nawa_access_token", "nawa_user_id", "nawa_enriched_count"],
    () => showState("disconnected")
  )
})
