/**
 * sidepanel.js — Nawa Studio Side Panel v2.0.0
 * Chat interface pour capturer des profils LinkedIn et lancer des analyses.
 *
 * Phases :
 *  loading     → vérification auth
 *  disconnected → pas de session
 *  brief        → saisie du brief (poste / ville / critères)
 *  searching    → URL LinkedIn générée, attente navigation
 *  collecting   → sur la page LinkedIn, accumulation des profils
 *  analyzing    → envoi au serveur pour scoring LLM
 *  done         → résultats affichés
 */

const API_BASE = "https://nawa-studio.vercel.app"

// ── État global ───────────────────────────────────────────────────────────────
const S = {
  phase:     "loading",
  token:     null,
  userId:    null,
  brief:     null,      // { titre, localisation, criteres }
  searchUrl: null,      // URL LinkedIn Search générée
  profiles:  [],        // profils capturés par content_linkedin_search.js
  results:   null,      // résultats de l'analyse
  missionId: null,
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id)
const msgList   = $("messages")
const inputArea = $("input-area")
const collectBar = $("collect-bar")
const collectCount = $("collect-count")
const btnAnalyze = $("btn-analyze")
const userInput  = $("user-input")
const sendBtn    = $("send-btn")
const statusPill = $("header-status")

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  setupInput()
  setupStorageWatcher()
  checkAuth()
})

async function checkAuth() {
  setStatus("…", "loading")
  const stored = await getStorage(["nawa_access_token", "nawa_user_id"])

  if (stored.nawa_access_token) {
    S.token  = stored.nawa_access_token
    S.userId = stored.nawa_user_id
    // Valider le token via l'API (rafraîchit aussi depuis les cookies)
    try {
      const res  = await fetch(`${API_BASE}/api/extension/auth`, { credentials: "include", cache: "no-store" })
      const data = await res.json()
      if (data.authenticated && data.access_token) {
        S.token  = data.access_token
        S.userId = data.user_id
        await chrome.storage.local.set({ nawa_access_token: data.access_token, nawa_user_id: data.user_id })
        enterPhase("brief")
        return
      }
    } catch { /* réseau hors ligne — utiliser le token stocké */ }
    // Token potentiellement valide, utiliser tel quel
    if (S.token) { enterPhase("brief"); return }
  }

  enterPhase("disconnected")
}

// ── Machine à états ───────────────────────────────────────────────────────────

function enterPhase(phase) {
  S.phase = phase
  console.log("[Nawa SP] Phase:", phase)

  inputArea.classList.add("hidden")
  collectBar.classList.add("hidden")

  switch (phase) {

    case "disconnected":
      setStatus("Non connecté", "error")
      addBotMessage(
        "👋 Bienvenue sur Nawa Studio !\n\n" +
        "Pour commencer, connectez-vous sur le site Nawa.",
        [{
          label: "Ouvrir Nawa Studio →",
          href:  `${API_BASE}/workspace`,
          style: "primary",
        }]
      )
      break

    case "brief":
      setStatus("Connecté", "ok")
      // Réinitialiser la collecte pour une nouvelle mission
      S.brief    = null
      S.profiles = []
      chrome.storage.local.remove("nawa_collected_profiles")
      addBotMessage(
        "👋 Bonjour ! Quel profil cherchez-vous ?\n\n" +
        "Décrivez simplement le poste, la ville, et les critères clés."
      )
      showInput("Développeur React senior Paris…")
      break

    case "searching":
      setStatus("Connecté", "ok")
      showLinkedInSearchPrompt()
      break

    case "collecting":
      setStatus("Collecte active", "ok")
      collectBar.classList.remove("hidden")
      refreshCollectBar()
      break

    case "analyzing":
      setStatus("Analyse…", "loading")
      addTypingThenMessage("⏳ Analyse en cours — scoring IA sur les profils capturés…")
      break

    case "done":
      setStatus("Terminé ✓", "ok")
      break
  }
}

// ── Brief parsing ─────────────────────────────────────────────────────────────

function parseUserInput(raw) {
  // Heuristique simple — le LLM pourra enrichir côté serveur
  const text  = raw.trim()
  const lines = text.split(/\n|,|;/).map(l => l.trim()).filter(Boolean)

  // Chercher une ville connue dans le texte
  const cities = [
    "Paris", "Lyon", "Marseille", "Toulouse", "Bordeaux", "Lille", "Nantes",
    "Strasbourg", "Nice", "Grenoble", "Rennes", "Rouen", "Montpellier",
    "France", "Remote", "Télétravail",
  ]
  let localisation = "France"
  for (const c of cities) {
    if (new RegExp(`\\b${c}\\b`, "i").test(text)) { localisation = c; break }
  }

  return {
    titre_poste:  lines[0] || text,
    localisation,
    criteres:     lines.slice(1).join(". "),
    mots_cles:    [],
  }
}

function buildLinkedInUrl(brief) {
  // LinkedIn People search — l'utilisateur DOIT être connecté
  const base    = "https://www.linkedin.com/search/results/people/"
  const q       = encodeURIComponent(brief.titre_poste)
  const loc     = encodeURIComponent(brief.localisation !== "France" ? brief.localisation : "")
  return `${base}?keywords=${q}${loc ? `&geoUrn=${loc}` : ""}&origin=GLOBAL_SEARCH_HEADER`
}

// ── LinkedIn search prompt ────────────────────────────────────────────────────

function showLinkedInSearchPrompt() {
  const liUrl = buildLinkedInUrl(S.brief)
  S.searchUrl = liUrl

  addBotMessage(
    `🔍 Parfait ! Voici comment trouver des profils pour **${S.brief.titre_poste}** à ${S.brief.localisation} :\n\n` +
    `1. Cliquez sur le bouton ci-dessous\n` +
    `2. LinkedIn s'ouvre avec la recherche pré-remplie\n` +
    `3. Je collecte automatiquement les profils visibles\n` +
    `4. Faites défiler pour en charger plus`,
    [{
      label:  "🔗 Ouvrir la recherche LinkedIn",
      href:   liUrl,
      style:  "linkedin",
    }]
  )

  // Passer en "collecting" dès que l'onglet actif change vers LinkedIn Search
  listenForLinkedInNav()
}

function listenForLinkedInNav() {
  // Vérifier l'onglet actif immédiatement
  checkActiveTabForLinkedIn()

  // Puis écouter les navigations
  chrome.tabs.onActivated.addListener(checkTabActivated)
  chrome.tabs.onUpdated.addListener(checkTabUpdated)
}

async function checkActiveTabForLinkedIn() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.url?.includes("linkedin.com/search/results/people/")) {
    removeLinkedInListeners()
    enterPhase("collecting")
  }
}

function checkTabActivated({ tabId }) {
  chrome.tabs.get(tabId, tab => {
    if (tab?.url?.includes("linkedin.com/search/results/people/")) {
      removeLinkedInListeners()
      enterPhase("collecting")
    }
  })
}

function checkTabUpdated(tabId, changeInfo) {
  if (changeInfo.url?.includes("linkedin.com/search/results/people/")) {
    removeLinkedInListeners()
    enterPhase("collecting")
  }
}

function removeLinkedInListeners() {
  chrome.tabs.onActivated.removeListener(checkTabActivated)
  chrome.tabs.onUpdated.removeListener(checkTabUpdated)
}

// ── Storage watcher (profils entrants) ────────────────────────────────────────

function setupStorageWatcher() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.nawa_collected_profiles) return
    const newVal = changes.nawa_collected_profiles.newValue ?? []
    S.profiles = newVal

    if (S.phase === "searching" && newVal.length > 0) {
      removeLinkedInListeners()
      enterPhase("collecting")
    } else if (S.phase === "collecting") {
      refreshCollectBar()
    }
  })
}

function refreshCollectBar() {
  const n = S.profiles.length
  collectCount.textContent = `${n} profil${n > 1 ? "s" : ""} capturé${n > 1 ? "s" : ""}`
  btnAnalyze.disabled = n < 1
}

// ── Bouton Analyser ───────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  btnAnalyze.addEventListener("click", () => {
    if (S.profiles.length === 0 || S.phase !== "collecting") return
    runAnalysis()
  })
})

async function runAnalysis() {
  enterPhase("analyzing")

  try {
    const res = await fetch(`${API_BASE}/api/extension/analyze-profiles`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${S.token}`,
      },
      body: JSON.stringify({
        brief:    S.brief,
        profiles: S.profiles,
      }),
    })

    const data = await res.json()

    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Erreur serveur")
    }

    S.results   = data
    S.missionId = data.mission_id
    chrome.storage.local.remove("nawa_collected_profiles")

    showResults(data)

  } catch (err) {
    addBotMessage(`❌ Erreur lors de l'analyse : ${err.message}`)
    showInput("Réessayer avec un autre poste…")
    S.phase = "brief"
    setStatus("Connecté", "ok")
  }
}

function showResults(data) {
  enterPhase("done")
  const { candidates_count, top_profiles } = data

  let html = `✅ **${candidates_count} profil${candidates_count > 1 ? "s" : ""} analysé${candidates_count > 1 ? "s" : ""}**`

  const actions = [
    {
      label: "Voir dans Nawa Studio →",
      href:  `${API_BASE}/workspace`,
      style: "primary",
    },
    {
      label: "Nouvelle recherche",
      action: "new",
    },
  ]

  addBotMessage(html, actions)

  // Afficher les top profils comme cartes
  if (top_profiles && top_profiles.length > 0) {
    renderProfileCards(top_profiles.slice(0, 8))
  }
}

// ── Saisie utilisateur ────────────────────────────────────────────────────────

function setupInput() {
  sendBtn.addEventListener("click", handleSend)
  userInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  })
}

function handleSend() {
  const text = userInput.value.trim()
  if (!text) return

  userInput.value = ""
  hideInput()
  addUserMessage(text)

  if (S.phase === "brief") {
    S.brief = parseUserInput(text)
    // Petit délai pour effet naturel
    setTimeout(() => enterPhase("searching"), 600)
  }
}

function showInput(placeholder) {
  inputArea.classList.remove("hidden")
  userInput.placeholder = placeholder || "Votre message…"
  userInput.focus()
}

function hideInput() {
  inputArea.classList.add("hidden")
}

// ── Rendu messages ────────────────────────────────────────────────────────────

function addBotMessage(text, actions) {
  const el = document.createElement("div")
  el.className = "msg msg--bot"

  const bubble = document.createElement("div")
  bubble.className = "msg__bubble"
  bubble.innerHTML = formatText(text)

  el.appendChild(bubble)

  if (actions && actions.length > 0) {
    const row = document.createElement("div")
    row.style.cssText = "display:flex;flex-direction:column;gap:6px;margin-top:8px;"
    actions.forEach(a => row.appendChild(makeActionBtn(a)))
    el.appendChild(row)
  }

  msgList.appendChild(el)
  scrollToBottom()
}

function addUserMessage(text) {
  const el = document.createElement("div")
  el.className = "msg msg--user"
  const bubble = document.createElement("div")
  bubble.className = "msg__bubble"
  bubble.textContent = text
  el.appendChild(bubble)
  msgList.appendChild(el)
  scrollToBottom()
}

function addTypingThenMessage(text) {
  const typing = document.createElement("div")
  typing.className = "msg msg--bot"
  typing.innerHTML = `<div class="msg-typing"><span></span><span></span><span></span></div>`
  msgList.appendChild(typing)
  scrollToBottom()
  setTimeout(() => {
    msgList.removeChild(typing)
    addBotMessage(text)
  }, 900)
}

function renderProfileCards(profiles) {
  const wrapper = document.createElement("div")
  wrapper.className = "msg msg--bot"
  wrapper.style.maxWidth = "100%"

  const list = document.createElement("div")
  list.className = "profile-list"

  profiles.forEach(p => {
    const score = p.relevance_score ?? p.score
    const tier  = score >= 75 ? "high" : score >= 50 ? "mid" : "low"

    const card = document.createElement("div")
    card.className = "profile-card"
    card.innerHTML = `
      <div class="profile-card__name">${escHtml(p.name_estimated || p.name || "—")}</div>
      <div class="profile-card__title">${escHtml(p.title_estimated || p.title || "")}</div>
      <div class="profile-card__meta">
        ${score != null ? `<span class="score-badge score-badge--${tier}">${score}/100</span>` : ""}
        <span class="profile-card__loc">${escHtml(p.location || "")}</span>
      </div>
      ${p.score_justification ? `<div class="profile-card__just">${escHtml(p.score_justification)}</div>` : ""}
      <a class="profile-card__link" href="${escHtml(p.linkedin_url)}" target="_blank">Voir le profil →</a>
    `
    list.appendChild(card)
  })

  wrapper.appendChild(list)
  msgList.appendChild(wrapper)
  scrollToBottom()
}

// ── Boutons d'action ──────────────────────────────────────────────────────────

function makeActionBtn(action) {
  if (action.href) {
    const a = document.createElement("a")
    a.href   = action.href
    a.target = "_blank"
    a.textContent = action.label
    if (action.style === "linkedin") {
      a.className = "li-link-btn"
    } else {
      a.className = `btn btn--${action.style === "primary" ? "primary" : "ghost"}`
    }
    return a
  }

  const b = document.createElement("button")
  b.className = `btn btn--${action.style === "primary" ? "primary" : "ghost"}`
  b.textContent = action.label
  if (action.action === "new") {
    b.addEventListener("click", () => {
      clearMessages()
      enterPhase("brief")
    })
  }
  return b
}

// ── Utilitaires DOM ───────────────────────────────────────────────────────────

function formatText(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>")
}

function escHtml(str) {
  return (str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")
}

function setStatus(text, type) {
  statusPill.textContent = text
  statusPill.className = `status-pill status-pill--${type}`
}

function scrollToBottom() {
  msgList.scrollTop = msgList.scrollHeight
}

function clearMessages() {
  msgList.innerHTML = ""
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function getStorage(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve))
}
