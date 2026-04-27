/**
 * popup.js — Gère l'affichage du popup de l'extension Nawa v1.2.0
 */

const $ = id => document.getElementById(id)

function showState(name) {
  ["connected", "disconnected", "loading", "enriching"].forEach(s => {
    $(`state-${s}`)?.classList.toggle("hidden", s !== name)
  })
}

function updateStats(status) {
  const enriched = status.enrichedCount ?? 0
  const searched = status.searchedCount ?? 0

  // Badge header
  if (enriched > 0) {
    $("enriched-count").textContent = `${enriched} enrichi${enriched > 1 ? "s" : ""}`
  } else {
    $("enriched-count").textContent = ""
  }

  // Stats box
  const searchedEl = $("searched-count")
  const enrichedEl = $("enriched-val")
  if (searchedEl) searchedEl.textContent = searched
  if (enrichedEl) enrichedEl.textContent = enriched

  // Recherche en cours ?
  const searchActive = $("search-active")
  if (searchActive) {
    searchActive.classList.toggle("hidden", !status.isProcessing)
  }
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
  updateStats(status)
})

// ── Actions ───────────────────────────────────────────────────────────────────

$("btn-enrich")?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "TRIGGER_ENRICH" }, () => {
    // Rafraîchir le statut après déclenchement
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: "GET_STATUS" }, status => {
        if (status?.connected) updateStats(status)
      })
    }, 800)
  })
})

$("btn-disconnect")?.addEventListener("click", () => {
  chrome.storage.local.remove(
    ["nawa_access_token", "nawa_user_id", "nawa_enriched_count", "nawa_searched_count"],
    () => showState("disconnected")
  )
})
