/**
 * content_nawa.js — s'injecte sur nawa-studio.vercel.app — v3.0.0
 *
 * 1. Récupère la session Supabase via cookies SSR → envoie SET_AUTH au background
 * 2. Vérifie si une recherche est terminée (state "done"/"returning")
 *    → Appelle /api/extension/analyze-profiles → Redirige vers la mission créée
 */

;(function () {
  'use strict'

  const API_BASE  = 'https://nawa-studio.vercel.app'
  const STATE_KEY = 'nawa_search_state'

  // ── Auth ────────────────────────────────────────────────────────────────────

  fetch(`${API_BASE}/api/extension/auth`, { credentials: 'include', cache: 'no-store' })
    .then(r => r.json())
    .then(data => {
      if (data.authenticated && data.access_token) {
        chrome.runtime.sendMessage({
          type:        'SET_AUTH',
          accessToken: data.access_token,
          userId:      data.user_id,
        })
      }
    })
    .catch(() => { /* offline */ })

  // ── Pickup pending results ──────────────────────────────────────────────────

  chrome.storage.local.get([STATE_KEY], async ({ [STATE_KEY]: state }) => {
    if (!state) return
    if (!['done', 'returning'].includes(state.phase)) return

    if (!state.profiles || state.profiles.length === 0) {
      chrome.storage.local.remove([STATE_KEY])
      showNotification('Aucun profil trouvé lors de la recherche.', 'info')
      return
    }

    showNotification(
      `⏳ ${state.profiles.length} profils trouvés — analyse IA en cours…`,
      'loading'
    )

    try {
      const profilesPayload = state.profiles.map(p => {
        const parsed = parseDisplayTitle(p.display_title || '')
        return {
          linkedin_url: p.linkedin_url,
          name:         p.name     || parsed.name  || '',
          title:        p.title    || parsed.title || '',
          company:      p.company  || '',
          location:     p.location || '',
          snippet:      p.snippet  || p.display_title || '',
        }
      })

      const res = await fetch(`${API_BASE}/api/extension/analyze-profiles`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${state.token}`,
        },
        body: JSON.stringify({ brief: state.brief, profiles: profilesPayload }),
      })

      const data = await res.json()

      if (res.ok && data.ok) {
        chrome.storage.local.remove([STATE_KEY])
        showNotification(
          `✅ ${data.candidates_count} profils analysés ! Ouverture de la mission…`,
          'success'
        )
        setTimeout(() => {
          window.location.href = `/workspace/missions/${data.mission_id}`
        }, 1800)
      } else {
        chrome.storage.local.remove([STATE_KEY])
        showNotification(`❌ Erreur analyse : ${data.error || 'Erreur inconnue'}`, 'error')
      }
    } catch (e) {
      chrome.storage.local.remove([STATE_KEY])
      showNotification('❌ Erreur réseau lors de l\'analyse', 'error')
    }
  })

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function parseDisplayTitle(displayTitle) {
    // Format Google typique : "Nom Prénom - Titre at Entreprise | LinkedIn"
    const text = (displayTitle || '')
      .replace(/\s*[•·]\s*LinkedIn.*$/i, '')
      .replace(/\s*\|\s*LinkedIn.*$/i, '')
      .trim()

    if (!text) return { name: '', title: '' }

    const dashIdx = text.indexOf(' - ')
    if (dashIdx > -1) {
      return {
        name:  text.slice(0, dashIdx).trim(),
        title: text.slice(dashIdx + 3).trim(),
      }
    }
    return { name: text, title: '' }
  }

  function showNotification(message, type) {
    document.getElementById('nawa-ext-notif')?.remove()

    const colors = {
      loading: { bg: '#EFF6FF', border: '#3B82F6', text: '#1E40AF' },
      success: { bg: '#F0FDF4', border: '#22C55E', text: '#15803D' },
      error:   { bg: '#FEF2F2', border: '#EF4444', text: '#DC2626' },
      info:    { bg: '#F9FAFB', border: '#9CA3AF', text: '#374151' },
    }
    const c = colors[type] || colors.info

    const el = document.createElement('div')
    el.id = 'nawa-ext-notif'
    el.style.cssText = `
      position: fixed; bottom: 24px; left: 50%;
      transform: translateX(-50%);
      background: ${c.bg}; border: 1.5px solid ${c.border}; color: ${c.text};
      padding: 14px 22px; border-radius: 10px;
      font: 500 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      z-index: 99999;
      box-shadow: 0 8px 24px rgba(0,0,0,.12);
      max-width: 90vw; text-align: center;
    `
    el.textContent = message
    document.body.appendChild(el)

    if (type === 'success' || type === 'error' || type === 'info') {
      setTimeout(() => el.remove(), 5000)
    }
  }
})()
