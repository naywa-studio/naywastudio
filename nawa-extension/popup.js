/**
 * popup.js — v4.0.0
 *
 * Le popup est un simple moniteur de l'état de la recherche.
 * Toutes les commandes (lancement, choix du brief) viennent du chat Nawa Studio.
 *
 * Écrans : init → auth | idle | searching | done | error
 */

const $ = id => document.getElementById(id)
let pollTimer = null

let API_BASE = "https://nawa-studio.vercel.app"
chrome.storage.local.get(["nawa_api_base"], ({ nawa_api_base }) => {
  if (nawa_api_base) API_BASE = nawa_api_base
})

function showScreen(name) {
  ["init", "auth", "idle", "searching", "done", "error"].forEach(s => {
    $(`screen-${s}`)?.classList.toggle("hidden", s !== name)
  })
}

function setPill(text, type) {
  const pill = $("auth-pill")
  if (!pill) return
  pill.textContent = text
  pill.className = `pill pill--${type}`
}

function sendMsg(msgOrType) {
  const msg = typeof msgOrType === "string" ? { type: msgOrType } : msgOrType
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(msg, r => {
        if (chrome.runtime.lastError) return resolve(null)
        resolve(r)
      })
    } catch { resolve(null) }
  })
}

/* ── Render ──────────────────────────────────────────────────────────── */

function renderSearching(state) {
  const labels = {
    searching: "Recherche Google en cours…",
    enriching: "Enrichissement LinkedIn…",
    pushing:   "Analyse et création des candidats…",
  }
  $("phase-label").textContent = labels[state.phase] || "Traitement…"

  const count = state.profiles?.length ?? 0
  $("profile-count").textContent = count

  // Mission label (titre du poste si dispo)
  const titre = state.brief?.titre_poste
  const ml    = $("mission-label")
  if (titre) {
    ml.textContent = `Mission : ${titre}`
    ml.classList.remove("hidden")
  } else {
    ml.classList.add("hidden")
  }

  if (state.queries?.length > 0) {
    let pct
    if (state.phase === "enriching") {
      const ei = state.enrichIndex ?? 0
      const et = state.enrichQueue?.length ?? 1
      pct = 70 + (ei / et) * 25
    } else if (state.phase === "pushing") {
      pct = 97
    } else {
      pct = (state.queryIndex / state.queries.length) * 70
    }
    $("progress-bar").style.width = `${Math.min(pct, 100)}%`
    renderQueryList(state.queries, state.queryIndex, state.phase)
  }

  if (state.phase === "enriching") {
    const ei = (state.enrichIndex ?? 0) + 1
    const et = state.enrichQueue?.length ?? 0
    $("search-hint").textContent = `Enrichissement profil ${ei}/${et} sur LinkedIn…`
  } else if (state.phase === "pushing") {
    $("search-hint").textContent = "Scoring IA et insertion dans la mission…"
  } else {
    $("search-hint").textContent = "Le worker tourne en arrière-plan — vous pouvez continuer à utiliser Nawa Studio."
  }
}

function renderQueryList(queries, currentIndex, phase) {
  const list = $("queries-list")
  list.innerHTML = ""
  queries.forEach((q, i) => {
    const el = document.createElement("div")
    let cls = "query-item"
    if (phase === "enriching" || phase === "pushing" || i < currentIndex) {
      cls += " query-item--done"
    } else if (i === currentIndex) {
      cls += " query-item--active"
    }
    el.className = cls
    const cleaned = q
      .replace(/^site:linkedin\.com\/in\s*/i, "")
      .replace(/"/g, "")
      .trim()
    el.textContent = cleaned.slice(0, 55) + (cleaned.length > 55 ? "…" : "")
    list.appendChild(el)
  })
}

function renderDone(state) {
  showScreen("done")
  $("done-count").textContent = state.profiles?.length ?? 0
  const link = $("btn-open-mission")
  if (state.missionId) {
    link.href = `${API_BASE}/workspace/missions/${state.missionId}`
  } else {
    link.href = `${API_BASE}/workspace`
  }
}

function renderError(state) {
  showScreen("error")
  $("error-text").textContent = state.error || "La recherche a échoué."
}

/* ── Polling ─────────────────────────────────────────────────────────── */

function startPolling() {
  stopPolling()
  pollTimer = setInterval(refresh, 1200)
}
function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

async function refresh() {
  const status = await sendMsg("GET_STATUS")
  if (!status) return

  if (!status.authenticated) {
    setPill("Non connecté", "error")
    showScreen("auth")
    stopPolling()
    return
  }

  setPill("Connecté", "ok")
  const state = status.state

  if (!state || state.phase === "cancelled") {
    showScreen("idle")
    stopPolling()
    return
  }

  if (state.phase === "done") {
    renderDone(state)
    stopPolling()
    return
  }

  if (state.phase === "error") {
    renderError(state)
    stopPolling()
    return
  }

  // searching | enriching | pushing
  showScreen("searching")
  renderSearching(state)
}

/* ── Init ────────────────────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
  $("btn-cancel")?.addEventListener("click", async () => {
    stopPolling()
    await sendMsg("CANCEL_SEARCH")
    showScreen("idle")
  })

  $("btn-dismiss")?.addEventListener("click", async () => {
    await sendMsg("CANCEL_SEARCH") // clears state
    showScreen("idle")
  })

  $("btn-retry")?.addEventListener("click", async () => {
    await sendMsg("CANCEL_SEARCH")
    showScreen("idle")
  })

  refresh()
  startPolling()
})
