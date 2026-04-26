/**
 * content_linkedin.js — s'injecte sur linkedin.com/in/*
 * Extrait les données du profil LinkedIn visible et les envoie au background.
 * Fonctionne avec la session du client — aucun proxy, aucun compte Nawa.
 */

(function () {
  // Attendre que le DOM soit chargé (React hydration)
  let attempts = 0
  const MAX_ATTEMPTS = 10
  const DELAY_MS = 800

  function tryExtract() {
    const name = extractName()
    if (!name || name.length < 2) {
      if (++attempts < MAX_ATTEMPTS) {
        setTimeout(tryExtract, DELAY_MS)
      }
      return
    }
    const profile = extractProfile()
    if (profile.linkedin_url) {
      chrome.runtime.sendMessage({ type: "PROFILE_EXTRACTED", profile })
    }
  }

  setTimeout(tryExtract, 1200)

  // ── Extracteurs DOM ──────────────────────────────────────────────────────────

  function extractName() {
    // Plusieurs sélecteurs en fallback (LinkedIn change son DOM fréquemment)
    return (
      document.querySelector("h1.text-heading-xlarge")?.innerText?.trim() ||
      document.querySelector("h1")?.innerText?.trim() ||
      ""
    )
  }

  function extractProfile() {
    const url = window.location.href.split("?")[0].replace(/\/$/, "")

    // Nom
    const name = extractName()

    // Titre / headline
    const title = (
      document.querySelector(".text-body-medium.break-words")?.innerText?.trim() ||
      document.querySelector('[data-field="headline"]')?.innerText?.trim() ||
      ""
    )

    // Localisation
    const location = (
      document.querySelector(".pb2.pv-text-details__left-panel span:nth-child(2)")?.innerText?.trim() ||
      document.querySelector(".text-body-small.inline.t-black--light.break-words")?.innerText?.trim() ||
      ""
    )

    // About / résumé
    const aboutSection = document.querySelector("#about")?.closest("section")
    const about = (
      aboutSection?.querySelector(".inline-show-more-text--is-collapsed span[aria-hidden]")?.innerText?.trim() ||
      aboutSection?.querySelector(".inline-show-more-text span:first-child")?.innerText?.trim() ||
      aboutSection?.querySelector(".pv-shared-text-with-see-more")?.innerText?.trim() ||
      ""
    )

    // Entreprise actuelle (depuis la section expérience)
    const expSection = document.querySelector("#experience")?.closest("section")
    const firstExpItem = expSection?.querySelector("li.artdeco-list__item")
    const company = (
      firstExpItem?.querySelector(".t-14.t-normal span:first-child")?.innerText?.trim() ||
      firstExpItem?.querySelector(".t-14.t-normal")?.innerText?.trim() ||
      ""
    ).replace(/\s*·.*$/, "").trim()   // Supprime " · Full-time" etc.

    // Expériences (top 4)
    const expItems = Array.from(
      expSection?.querySelectorAll("li.artdeco-list__item") ?? []
    ).slice(0, 4)

    const experience = expItems.map(item => {
      const jobTitle  = item.querySelector(".t-bold span:first-child")?.innerText?.trim() || ""
      const jobCo     = item.querySelector(".t-14.t-normal span:first-child")?.innerText?.trim()?.replace(/\s*·.*$/, "").trim() || ""
      const duration  = item.querySelector(".pvs-entity__caption-wrapper")?.innerText?.trim() || ""
      return jobTitle || jobCo ? { title: jobTitle, company: jobCo, duration } : null
    }).filter(Boolean)

    const expSummary = experience
      .map(e => `${e.title}${e.company ? ` @ ${e.company}` : ""}${e.duration ? ` (${e.duration})` : ""}`)
      .join(" | ")
      .slice(0, 300)

    // Compétences
    const skillsSection = document.querySelector("#skills")?.closest("section")
    const skills = Array.from(
      skillsSection?.querySelectorAll(".t-bold span[aria-hidden]") ?? []
    )
      .map(el => el.innerText?.trim())
      .filter(s => s && s.length > 1 && s.length < 50)
      .slice(0, 20)

    // Estimation années d'expérience (basique)
    const currentYear = new Date().getFullYear()
    let yearsExp = 0
    const firstExp = expItems[expItems.length - 1] // le plus ancien
    if (firstExp) {
      const yearMatch = firstExp.querySelector(".pvs-entity__caption-wrapper")
        ?.innerText?.match(/\b(19|20)\d{2}\b/)
      if (yearMatch) {
        yearsExp = Math.min(currentYear - parseInt(yearMatch[0]), 40)
      }
    }

    return {
      linkedin_url:       url,
      name,
      title,
      company,
      location,
      about:              about.slice(0, 400),
      skills,
      experience_summary: expSummary,
      years_experience:   yearsExp,
    }
  }
})()
