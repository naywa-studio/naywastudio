/**
 * content_google.js — injecté sur google.com/search
 * Extrait les URLs LinkedIn des résultats organiques et les envoie au background.
 * Ne s'active que si la recherche contient "linkedin.com/in/".
 */

(function () {
  // Ne tourner que sur les recherches LinkedIn
  const params = new URLSearchParams(window.location.search)
  const query = params.get("q") || ""
  if (!query.toLowerCase().includes("linkedin.com/in")) return

  // Attendre que les résultats soient chargés (Google est SPA)
  let attempts = 0
  const MAX_ATTEMPTS = 15

  function tryExtract() {
    const results = extractLinkedInResults()
    if (results.length > 0 || attempts >= MAX_ATTEMPTS) {
      if (results.length > 0) {
        chrome.runtime.sendMessage({
          type:    "GOOGLE_RESULTS",
          query,
          results,
        })
        console.log(`[Nawa] Google → ${results.length} profil(s) LinkedIn trouvé(s)`)
      }
      // Signaler que cette page est traitée (même si 0 résultats)
      setTimeout(() => {
        chrome.runtime.sendMessage({ type: "GOOGLE_DONE", url: window.location.href, count: results.length })
      }, 500)
      return
    }
    attempts++
    setTimeout(tryExtract, 600)
  }

  // Délai initial pour laisser Google charger ses résultats JS
  setTimeout(tryExtract, 1500)

  // ── Extraction des résultats Google ─────────────────────────────────────────

  function extractLinkedInResults() {
    const found = []
    const seen  = new Set()

    // Sélecteurs Google (peuvent changer, plusieurs en fallback)
    const resultBlocks = document.querySelectorAll(
      "div.g, div[data-sokoban-container], div[jscontroller] > div > div.g"
    )

    resultBlocks.forEach(block => {
      // Chercher un lien vers linkedin.com/in/
      const link = block.querySelector('a[href*="linkedin.com/in/"]')
      if (!link) return

      const rawUrl = link.getAttribute("href") || ""
      const url    = normalizeLinkedInUrl(rawUrl)
      if (!url || seen.has(url)) return
      seen.add(url)

      // Titre du résultat Google (souvent "Prénom Nom - Titre | LinkedIn")
      const titleEl   = block.querySelector("h3")
      const displayTitle = titleEl?.innerText?.trim() || ""

      // Snippet / description
      const snippetEl = block.querySelector(
        ".VwiC3b, .lEBKkf, [data-sncf='1'], .s3v9rd, .st"
      )
      const snippet = snippetEl?.innerText?.trim() || ""

      found.push({ linkedin_url: url, display_title: displayTitle, snippet })
    })

    // Fallback : chercher tous les liens LinkedIn directs dans la page
    if (found.length === 0) {
      document.querySelectorAll('a[href*="linkedin.com/in/"]').forEach(link => {
        const url = normalizeLinkedInUrl(link.getAttribute("href") || "")
        if (!url || seen.has(url)) return
        seen.add(url)
        found.push({ linkedin_url: url, display_title: "", snippet: "" })
      })
    }

    return found
  }

  function normalizeLinkedInUrl(raw) {
    try {
      // Google wraps URLs in redirects like /url?q=https://...
      let url = raw
      if (url.includes("/url?") || url.includes("google.com/url")) {
        const u = new URL(url, "https://www.google.com")
        url = u.searchParams.get("q") || url
      }
      // Must be a proper LinkedIn profile URL
      const match = url.match(/https?:\/\/([a-z]{2}\.)?linkedin\.com\/in\/([^/?#\s]+)/)
      if (!match) return null
      return `https://www.linkedin.com/in/${match[2]}`
    } catch {
      return null
    }
  }
})()
