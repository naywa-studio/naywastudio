/**
 * popup.js — Nawa Studio Extension v3.0.0
 *
 * Machine à états du popup :
 *   init → auth | idle | searching | done
 *
 * Communique avec background.js via chrome.runtime.sendMessage
 */

const $ = id => document.getElementById(id)

let pollTimer = null

// ── Affichage ─────────────────────────────────────────────────────────────────

function showScreen(name) {
  ['init', 'auth', 'idle', 'searching', 'done'].forEach(s => {
    $(`screen-${s}`)?.classList.toggle('hidden', s !== name)
  })
}

function setPill(text, type) {
  const pill = $('auth-pill')
  if (!pill) return
  pill.textContent = text
  pill.className = `pill pill--${type}`
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  showScreen('init')

  const status = await sendMsg('GET_STATUS')

  if (!status?.authenticated) {
    setPill('Non connecté', 'error')
    showScreen('auth')
    return
  }

  setPill('Connecté', 'ok')

  const state = status.state
  if (!state || state.phase === 'idle' || state.phase === 'error') {
    showScreen('idle')
    return
  }

  if (state.phase === 'done' || state.phase === 'returning') {
    renderDone(state)
    return
  }

  // Recherche active
  showScreen('searching')
  renderSearching(state)
  startPolling()
}

// ── Render searching ──────────────────────────────────────────────────────────

function renderSearching(state) {
  const labels = {
    searching: 'Recherche Google en cours…',
    enriching: 'Enrichissement LinkedIn…',
    returning: 'Retour sur Nawa Studio…',
  }
  $('phase-label').textContent = labels[state.phase] || 'Traitement…'

  const count = state.profiles?.length ?? 0
  $('profile-count').textContent = `${count} profil${count > 1 ? 's' : ''}`

  if (state.queries?.length > 0) {
    let progressPct
    if (state.phase === 'enriching') {
      const ei = state.enrichIndex ?? 0
      const et = state.enrichQueue?.length ?? 1
      progressPct = 80 + (ei / et) * 20  // enrichissement = 80→100%
    } else if (state.phase === 'returning') {
      progressPct = 100
    } else {
      progressPct = (state.queryIndex / state.queries.length) * 80  // recherche = 0→80%
    }
    $('progress-bar').style.width = `${Math.min(progressPct, 100)}%`
    renderQueryList(state.queries, state.queryIndex, state.phase)
  }

  if (state.phase === 'enriching') {
    const ei = (state.enrichIndex ?? 0) + 1
    const et = state.enrichQueue?.length ?? 0
    $('search-hint').textContent = `Enrichissement profil ${ei}/${et} sur LinkedIn…`
  }
}

function renderQueryList(queries, currentIndex, phase) {
  const list = $('queries-list')
  list.innerHTML = ''
  queries.forEach((q, i) => {
    const el = document.createElement('div')
    let cls = 'query-item'
    if (phase === 'enriching' || phase === 'returning' || i < currentIndex) {
      cls += ' query-item--done'
    } else if (i === currentIndex) {
      cls += ' query-item--active'
    }
    el.className = cls

    const cleaned = q
      .replace(/^site:linkedin\.com\/in\s*/i, '')
      .replace(/"/g, '')
      .trim()
    el.textContent = cleaned.slice(0, 55) + (cleaned.length > 55 ? '…' : '')
    list.appendChild(el)
  })
}

// ── Render done ───────────────────────────────────────────────────────────────

function renderDone(state) {
  showScreen('done')
  $('done-count').textContent = state.profiles?.length ?? 0
}

// ── Polling ───────────────────────────────────────────────────────────────────

function startPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(async () => {
    const status = await sendMsg('GET_STATUS')
    if (!status) return

    const state = status.state
    if (!state) {
      stopPolling()
      showScreen('idle')
      return
    }

    if (state.phase === 'done') {
      stopPolling()
      renderDone(state)
      return
    }

    renderSearching(state)
  }, 1500)
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

// ── Actions ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  $('btn-start')?.addEventListener('click', async () => {
    const rawText = $('brief-input')?.value?.trim()
    if (!rawText || rawText.length < 5) {
      $('brief-input')?.focus()
      return
    }

    const level = $('level-select')?.value || 'leo'

    const { nawa_access_token: token } = await getStorage(['nawa_access_token'])
    if (!token) {
      showScreen('auth')
      return
    }

    showScreen('searching')
    $('phase-label').textContent = 'Génération des requêtes…'
    $('profile-count').textContent = '0 profil'
    $('progress-bar').style.width = '0%'
    $('queries-list').innerHTML = ''

    const result = await sendMsg({ type: 'START_SEARCH', raw_text: rawText, token, level })

    if (!result?.ok) {
      stopPolling()
      showScreen('idle')
      alert(result?.error || 'Erreur lors du démarrage de la recherche')
      return
    }

    startPolling()
  })

  $('btn-cancel')?.addEventListener('click', async () => {
    stopPolling()
    await sendMsg('CANCEL_SEARCH')
    showScreen('idle')
  })

  $('btn-new-search')?.addEventListener('click', async () => {
    await sendMsg('CANCEL_SEARCH')
    showScreen('idle')
    $('brief-input').value = ''
  })

  init()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function sendMsg(msgOrType) {
  const msg = typeof msgOrType === 'string' ? { type: msgOrType } : msgOrType
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(msg, r => {
        if (chrome.runtime.lastError) return resolve(null)
        resolve(r)
      })
    } catch {
      resolve(null)
    }
  })
}

function getStorage(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve))
}
