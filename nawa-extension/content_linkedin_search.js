/**
 * content_linkedin_search.js — injecté sur linkedin.com/search/results/people/
 * Extrait les cartes de profil visibles et les envoie au background (→ side panel).
 * Observe les nouveaux résultats chargés au scroll via MutationObserver.
 */

(function () {
  if (!window.location.href.includes("/search/results/people/")) return

  const seen = new Set()

  // ── Extraction d'une carte LinkedIn ─────────────────────────────────────────

  function extractFromCard(card) {
    // URL du profil (plusieurs variantes de sélecteur selon les versions de LinkedIn)
    const link = (
      card.querySelector('a[href*="/in/"]') ||
      card.querySelector('a[data-control-name="search_srp_result"]')
    )
    if (!link) return null

    const href  = link.getAttribute("href") || ""
    const match = href.match(/\/in\/([a-zA-Z0-9_%-]+)/)
    if (!match) return null

    const slug = match[1].split("?")[0]
    if (!slug || slug.length < 2) return null

    const url = `https://www.linkedin.com/in/${slug}`
    if (seen.has(url)) return null
    seen.add(url)

    // Nom — plusieurs sélecteurs selon la version du DOM
    const nameEl = (
      card.querySelector(".entity-result__title-text span[aria-hidden='true']") ||
      card.querySelector(".entity-result__title-text") ||
      card.querySelector("[data-anonymize='person-name']") ||
      card.querySelector(".artdeco-entity-lockup__title span[aria-hidden='true']")
    )

    // Titre + entreprise
    const subtitleEl = (
      card.querySelector(".entity-result__primary-subtitle") ||
      card.querySelector(".artdeco-entity-lockup__subtitle")
    )

    // Localisation
    const locationEl = (
      card.querySelector(".entity-result__secondary-subtitle") ||
      card.querySelector(".artdeco-entity-lockup__caption")
    )

    // Snippet (résumé optionnel)
    const snippetEl = card.querySelector(".entity-result__summary")

    const name     = (nameEl?.innerText || "").trim().split("\n")[0].trim()
    const subtitle = (subtitleEl?.innerText || "").trim()
    const location = (locationEl?.innerText || "").trim()
    const snippet  = (snippetEl?.innerText || "").trim()

    // Séparer titre et entreprise (souvent "Titre chez Entreprise" ou "Titre · Entreprise")
    let title = subtitle, company = ""
    const sepMatch = subtitle.match(/^(.+?)\s+(?:chez|at|@|·)\s+(.+)$/)
    if (sepMatch) {
      title   = sepMatch[1].trim()
      company = sepMatch[2].trim()
    }

    return {
      linkedin_url: url,
      name,
      title,
      company,
      location,
      snippet: snippet.slice(0, 300),
      source: "linkedin_search",
    }
  }

  // ── Balayage de la page ──────────────────────────────────────────────────────

  function scanPage() {
    const SELECTORS = [
      "li.reusable-search__result-container",
      ".entity-result",
      "[data-view-name='search-entity-result-universal-template']",
    ]

    const profiles = []

    for (const sel of SELECTORS) {
      const cards = document.querySelectorAll(sel)
      if (cards.length === 0) continue

      cards.forEach(card => {
        const p = extractFromCard(card)
        if (p) profiles.push(p)
      })

      if (profiles.length > 0) break  // sélecteur qui a marché
    }

    if (profiles.length > 0) {
      console.log(`[Nawa LI] ${profiles.length} nouveau(x) profil(s)`)
      chrome.runtime.sendMessage({ type: "LINKEDIN_PROFILES", profiles }, () => {
        // ignore chrome.runtime.lastError si la side panel est fermée
        void chrome.runtime.lastError
      })
    }
  }

  // ── Démarrage ────────────────────────────────────────────────────────────────

  // Scan initial (laisser le DOM se stabiliser)
  setTimeout(scanPage, 2000)

  // Observer les nouvelles cartes chargées au scroll / pagination
  let debounceTimer = null
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(scanPage, 800)
  })

  observer.observe(document.body, { childList: true, subtree: true })

  console.log("[Nawa LI] Content script actif — collecte des profils")
})()
