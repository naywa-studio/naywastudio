/**
 * content_google.js — injecté sur google.com/search — v1.2.0
 * Extrait les URLs LinkedIn des résultats organiques et les envoie au background.
 * Ne s'active que si la recherche contient "linkedin.com/in".
 */

(function () {
  const params = new URLSearchParams(window.location.search)
  const query  = params.get("q") || ""

  // Ne s'activer que pour les recherches LinkedIn
  if (!query.toLowerCase().includes("linkedin.com/in")) return

  console.log("[Nawa Google] Activé pour:", query.slice(0, 80))

  let attempts    = 0
  const MAX_ATTEMPTS = 20   // ~13 secondes max de retry
  const RETRY_MS     = 650

  function tryExtract() {
    const results = extractLinkedInResults()

    if (results.length > 0) {
      // Résultats trouvés — envoyer immédiatement
      console.log(`[Nawa Google] ${results.length} profil(s) LinkedIn trouvé(s)`)
      safeSendMessage({ type: "GOOGLE_RESULTS", query, results })
      // Délai avant GOOGLE_DONE pour laisser le temps au background de recevoir GOOGLE_RESULTS
      setTimeout(() => safeSendMessage({ type: "GOOGLE_DONE", url: window.location.href, count: results.length }), 600)
      return
    }

    if (attempts >= MAX_ATTEMPTS) {
      // Timeout — signaler quand même que la page est traitée
      console.log("[Nawa Google] Aucun résultat LinkedIn après", MAX_ATTEMPTS, "tentatives")
      safeSendMessage({ type: "GOOGLE_DONE", url: window.location.href, count: 0 })
      return
    }

    attempts++
    setTimeout(tryExtract, RETRY_MS)
  }

  // Délai initial — laisser Google charger ses résultats JS
  setTimeout(tryExtract, 1500)

  // ── Extraction des résultats Google ─────────────────────────────────────────

  function extractLinkedInResults() {
    const found = []
    const seen  = new Set()

    // ── Méthode 1 : sélecteurs de blocs de résultat (robuste aux changements Google) ──
    const RESULT_SELECTORS = [
      "div.g",                              // classique
      "div[data-hveid]",                    // data attribute
      "div[jscontroller] > div > div.g",   // nested variant
      "div[data-sokoban-container]",        // 2023 variant
      "div.MjjYud > div",                   // 2024 variant
      "div[class*='g ']",                   // classe commençant par g
      "li.b_algo",                          // Bing fallback (si redirect)
    ]

    for (const selector of RESULT_SELECTORS) {
      const blocks = document.querySelectorAll(selector)
      if (blocks.length === 0) continue

      blocks.forEach(block => {
        const link = block.querySelector('a[href*="linkedin.com/in/"]')
        if (!link) return

        const rawUrl = link.getAttribute("href") || ""
        const url    = normalizeLinkedInUrl(rawUrl)
        if (!url || seen.has(url)) return
        seen.add(url)

        const titleEl      = block.querySelector("h3")
        const displayTitle = titleEl?.innerText?.trim() || link.innerText?.trim() || ""

        // Snippets — Google a plusieurs classes selon l'année
        const snippetEl = block.querySelector(
          ".VwiC3b, .lEBKkf, [data-sncf='1'], .s3v9rd, .st, .IsZvec, .lyLwlc, span[style]"
        )
        const snippet = snippetEl?.innerText?.trim() || ""

        found.push({ linkedin_url: url, display_title: displayTitle, snippet })
      })

      if (found.length > 0) break  // Sélecteur qui a marché — on s'arrête
    }

    // ── Méthode 2 : fallback global — chercher TOUS les liens LinkedIn dans la page ──
    if (found.length === 0) {
      const allLinks = document.querySelectorAll('a[href*="linkedin.com/in/"]')
      allLinks.forEach(link => {
        const url = normalizeLinkedInUrl(link.getAttribute("href") || "")
        if (!url || seen.has(url)) return

        // Ignorer les liens de nav Google (suggestions, etc.)
        const href = link.getAttribute("href") || ""
        if (href.includes("google.com") || href.includes("webcache")) return

        seen.add(url)

        // Chercher le titre et snippet dans le parent
        let block = link
        for (let i = 0; i < 5; i++) {
          block = block.parentElement
          if (!block) break
        }
        const titleEl = block?.querySelector("h3")
        const displayTitle = titleEl?.innerText?.trim() || link.innerText?.trim() || ""

        found.push({ linkedin_url: url, display_title: displayTitle, snippet: "" })
      })
    }

    // ── Méthode 3 : recherche dans le HTML brut ──
    if (found.length === 0) {
      // Parse les URLs LinkedIn dans le contenu de la page via regex
      const html    = document.body.innerHTML
      const regex   = /https?:\/\/(?:[a-z]{2}\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)/g
      let   match
      while ((match = regex.exec(html)) !== null) {
        const url = `https://www.linkedin.com/in/${match[1]}`
        if (!seen.has(url)) {
          seen.add(url)
          found.push({ linkedin_url: url, display_title: "", snippet: "" })
        }
        if (found.length >= 20) break
      }
    }

    return found
  }

  // ── Normalisation URL LinkedIn ───────────────────────────────────────────────

  function normalizeLinkedInUrl(raw) {
    try {
      let url = raw || ""

      // Google redirige parfois via /url?q=https://...
      if (url.includes("/url?") || url.includes("google.com/url")) {
        try {
          const u = new URL(url, "https://www.google.com")
          url = u.searchParams.get("q") || url
        } catch { /* ignore */ }
      }

      // Décoder les entités HTML éventuelles
      url = url.replace(/&amp;/g, "&")

      // Extraire l'URL LinkedIn proprement
      const match = url.match(/https?:\/\/(?:[a-z]{2}\.)?linkedin\.com\/in\/([^/?#\s"'<>]+)/)
      if (!match) return null

      // Nettoyer le slug (peut contenir des caractères parasites)
      const slug = match[1].replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100)
      if (!slug || slug.length < 2) return null

      return `https://www.linkedin.com/in/${slug}`
    } catch {
      return null
    }
  }

  // ── Envoi sécurisé de message ────────────────────────────────────────────────

  function safeSendMessage(msg) {
    try {
      chrome.runtime.sendMessage(msg)
    } catch (e) {
      console.warn("[Nawa Google] Erreur envoi message:", e)
    }
  }
})()
