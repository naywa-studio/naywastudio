/**
 * Google Custom Search API wrapper.
 *
 * Uses the official paid API — NOT scraping. No CAPTCHA risk.
 * Free tier: 100 queries/day; paid: $5 / 1000 queries.
 *
 * The Custom Search Engine (cx) must be configured to search the entire
 * web (not just one site) — refine via the `site:linkedin.com/in` operator
 * embedded in the query itself.
 */

import type { RawProfile } from "@/lib/profile-pipeline"

const ENDPOINT = "https://www.googleapis.com/customsearch/v1"

interface CSEItem {
  title?:   string
  link?:    string
  snippet?: string
  pagemap?: {
    metatags?: Array<{
      "og:title"?:       string
      "og:description"?: string
    }>
  }
}

interface CSEResponse {
  items?: CSEItem[]
  error?: { code: number; message: string }
}

/** Run a single CSE query and return raw LinkedIn profiles found. */
export async function searchLinkedInProfiles(query: string): Promise<RawProfile[]> {
  const key = (process.env.GOOGLE_SEARCH_API_KEY ?? "").trim()
  const cx  = (process.env.GOOGLE_SEARCH_ENGINE_ID ?? "").trim()
  if (!key || !cx) {
    console.warn("[google-cse] Missing GOOGLE_SEARCH_API_KEY or GOOGLE_SEARCH_ENGINE_ID")
    return []
  }

  const params = new URLSearchParams({
    key,
    cx,
    q:   query,
    num: "10",
    hl:  "fr",
  })

  let res: Response
  try {
    res = await fetch(`${ENDPOINT}?${params.toString()}`, { cache: "no-store" })
  } catch (e) {
    console.warn("[google-cse] Network error:", e)
    return []
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "")
    console.warn("[google-cse] HTTP", res.status, txt.slice(0, 200))
    return []
  }

  const data = (await res.json()) as CSEResponse
  if (data.error) {
    console.warn("[google-cse] API error:", data.error.message)
    return []
  }

  const items = data.items ?? []
  const profiles: RawProfile[] = []
  for (const it of items) {
    const url = normalizeLinkedInUrl(it.link ?? "")
    if (!url) continue
    const title   = stripLinkedInBoilerplate(it.pagemap?.metatags?.[0]?.["og:title"] ?? it.title ?? "")
    const snippet = (it.pagemap?.metatags?.[0]?.["og:description"] ?? it.snippet ?? "").trim()
    const { name, jobTitle } = splitTitle(title)
    profiles.push({
      linkedin_url: url,
      name,
      title:    jobTitle,
      company:  guessCompany(snippet),
      location: guessLocation(snippet),
      snippet,
    })
  }
  return profiles
}

/** Run multiple queries and dedupe by URL. */
export async function searchLinkedInForBrief(queries: string[]): Promise<RawProfile[]> {
  if (process.env.NAWA_MOCK_SEARCH === "1") return mockProfiles(queries)

  const seen = new Set<string>()
  const all: RawProfile[] = []
  for (const q of queries) {
    let found = await searchLinkedInProfiles(q)
    if (found.length === 0) {
      // Fallback: DuckDuckGo HTML (no API key, no CAPTCHA risk).
      found = await searchLinkedInViaDuckDuckGo(q)
    }
    for (const p of found) {
      if (seen.has(p.linkedin_url)) continue
      seen.add(p.linkedin_url)
      all.push(p)
    }
    await sleep(250)
  }
  return all
}

/** Generate plausible-looking fake profiles for E2E and dev testing. */
function mockProfiles(queries: string[]): RawProfile[] {
  const seed = (queries[0] || "").toLowerCase()
  const titles = ["Senior Data Engineer", "Lead Data Engineer", "Data Engineer", "Principal Data Engineer", "Staff Data Engineer", "Data Platform Engineer"]
  const companies = ["Capgemini", "BNP Paribas", "Société Générale", "Datadog", "OVH", "Doctolib"]
  const cities = ["Paris", "Paris, France", "Île-de-France", "Lyon", "Bordeaux"]
  const out: RawProfile[] = []
  for (let i = 0; i < 6; i++) {
    out.push({
      linkedin_url: `https://www.linkedin.com/in/mock-${seed.replace(/\W+/g, "-").slice(0, 16) || "profile"}-${i}`,
      name:         `Profil Test ${i + 1}`,
      title:        titles[i % titles.length],
      company:      companies[i % companies.length],
      location:     cities[i % cities.length],
      snippet:      `${titles[i % titles.length]} at ${companies[i % companies.length]} · ${cities[i % cities.length]} · 5+ ans d'expérience`,
    })
  }
  return out
}

/**
 * DuckDuckGo HTML fallback. Hits the lite HTML endpoint and parses the
 * organic result links. Used when Google Custom Search returns no items
 * (API not enabled, daily quota hit, etc.).
 */
async function searchLinkedInViaDuckDuckGo(query: string): Promise<RawProfile[]> {
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36",
          "Accept-Language": "fr,en;q=0.8",
        },
        cache: "no-store",
      }
    )
    if (!res.ok) return []
    const html = await res.text()
    return parseDdgHtml(html)
  } catch (e) {
    console.warn("[ddg] search failed:", e)
    return []
  }
}

function parseDdgHtml(html: string): RawProfile[] {
  const profiles: RawProfile[] = []
  const seen = new Set<string>()

  // DDG lite wraps each result in <a class="result__a" href="...">Title</a>
  // followed by <a class="result__snippet">snippet</a>.
  const blockRe = /<h2[^>]*class="result__title"[^>]*>[\s\S]*?<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(html)) !== null) {
    const rawUrl = decodeDdgUrl(m[1])
    const url    = normalizeLinkedInUrl(rawUrl)
    if (!url || seen.has(url)) continue
    seen.add(url)
    const title   = stripLinkedInBoilerplate(stripTags(m[2] || ""))
    const snippet = stripTags(m[3] || "").trim()
    const { name, jobTitle } = splitTitle(title)
    profiles.push({
      linkedin_url: url,
      name,
      title:    jobTitle,
      company:  guessCompany(snippet),
      location: guessLocation(snippet),
      snippet,
    })
  }
  return profiles
}

function decodeDdgUrl(href: string): string {
  // DDG often wraps target URLs in /l/?uddg=ENCODED or //duckduckgo.com/l/?uddg=...
  try {
    if (href.includes("/l/?")) {
      const m = href.match(/[?&]uddg=([^&]+)/)
      if (m) return decodeURIComponent(m[1])
    }
    if (href.startsWith("//")) return "https:" + href
    return href
  } catch {
    return href
  }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim()
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function normalizeLinkedInUrl(raw: string): string | null {
  if (!raw) return null
  const m = raw.match(/https?:\/\/(?:[a-z]{2}\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)/i)
  if (!m) return null
  const slug = m[1].slice(0, 100)
  return `https://www.linkedin.com/in/${slug}`
}

function stripLinkedInBoilerplate(s: string): string {
  return s
    .replace(/\s*[•·]\s*LinkedIn.*$/i, "")
    .replace(/\s*\|\s*LinkedIn.*$/i, "")
    .replace(/^LinkedIn\s*[-:]\s*/i, "")
    .trim()
}

function splitTitle(text: string): { name: string; jobTitle: string } {
  if (!text) return { name: "", jobTitle: "" }
  const idx = text.indexOf(" - ")
  if (idx > -1) return { name: text.slice(0, idx).trim(), jobTitle: text.slice(idx + 3).trim() }
  return { name: text, jobTitle: "" }
}

function guessCompany(snippet: string): string {
  // Pattern often seen in LinkedIn snippets: "Title at Company · Location · ..."
  const m = snippet.match(/\bat\s+([^·•|–\-—]+)/i) || snippet.match(/\bchez\s+([^·•|–\-—]+)/i)
  return m ? m[1].trim().slice(0, 80) : ""
}

function guessLocation(snippet: string): string {
  // Look for "Region, Country" pattern with capitalized first letter.
  const m = snippet.match(/([A-ZÉÈÊÀÂÎÔÛÇ][^·•|]{3,40},\s*France)/)
  return m ? m[1].trim() : ""
}
