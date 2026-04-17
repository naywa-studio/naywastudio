"""
Agent Léo (N1) — Sourcing de profils publics via Tavily + Malt
Améliorations v2:
  - Extraction de localisation depuis snippet LinkedIn (pattern "Ville · X relations")
  - Source Malt (freelances français, localisation certaine)
  - Requêtes seniority ciblées selon les critères du brief
  - Déduplication fuzzy sur les noms (difflib + normalisation hyphens)
  - Re-ranking LLM (gpt-4o-mini via OpenRouter) si clé disponible
Output: Excel 1 feuille + candidates list pour DB
"""

import os
import re
import json
import asyncio
import base64
import logging
import unicodedata
from difflib import SequenceMatcher
from io import BytesIO

import httpx
import pandas as pd

log = logging.getLogger("nawa-agent.leo")

TAVILY_KEY  = os.environ["TAVILY_API_KEY"]
OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY", "")
TAVILY_URL  = "https://api.tavily.com/search"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

MAX_PROFILES   = 100
TAVILY_TIMEOUT = 12.0
LLM_TIMEOUT    = 25.0


# ── URL + Name normalizers ─────────────────────────────────────────────────────

def normalize_url(url: str) -> str:
    """Canonical form: strip subdomain / protocol / params / trailing slash."""
    base = url.split("?")[0].split("#")[0].rstrip("/").lower()
    base = re.sub(r'^https?://(www\.|[a-z]{2}\.)?', '', base)
    return base


def normalize_name(name: str) -> str:
    """Lowercase, remove accents, collapse hyphens/spaces — for dedup."""
    nfkd = unicodedata.normalize('NFD', name.lower())
    ascii_name = ''.join(c for c in nfkd if not unicodedata.combining(c))
    ascii_name = ascii_name.replace('-', ' ').replace('.', ' ')
    return re.sub(r'\s+', ' ', ascii_name).strip()


def fuzzy_name_match(a: str, b: str, threshold: float = 0.92) -> bool:
    """True if two normalized names are likely the same person."""
    if len(a) < 6 or len(b) < 6:
        return False
    return SequenceMatcher(None, a, b).ratio() >= threshold


# ── Keyword coercion ────────────────────────────────────────────────────────────

def coerce_keywords(raw: object) -> list[str]:
    """Accept mots_cles as list OR comma/space string (AI output is unpredictable)."""
    if isinstance(raw, list):
        return [str(k).strip() for k in raw if str(k).strip()]
    if isinstance(raw, str):
        parts = re.split(r'[,;]+', raw)
        return [p.strip() for p in parts if p.strip()]
    return []


# ── Seniority detection ─────────────────────────────────────────────────────────

def detect_seniority(criteres: str) -> str:
    """Return 'senior' | 'junior' | 'confirmed' | 'any'."""
    c = (criteres or "").lower()
    if any(k in c for k in ["senior", "lead", "principal", "expert", "7+", "8+",
                              "9+", "10 ans", "architecte", "director"]):
        return "senior"
    if any(k in c for k in ["junior", "débutant", "0-3", "1 an", "2 ans",
                              "stage", "alternance", "graduate"]):
        return "junior"
    if any(k in c for k in ["confirmé", "médior", "3-7", "4 ans", "5 ans",
                              "6 ans", "intermédiaire"]):
        return "confirmed"
    return "any"


# ── Query builder ──────────────────────────────────────────────────────────────

def build_queries(brief: dict) -> tuple[list[str], list[str], list[str]]:
    """Return (linkedin_queries, malt_queries, apec_queries)."""
    titre     = brief.get("titre_poste", "")
    mots_list = coerce_keywords(brief.get("mots_cles", []))
    mots      = " ".join(mots_list)
    loc       = brief.get("localisation", "")
    loc_q     = f'"{loc}"' if loc else ""
    seniority = detect_seniority(brief.get("criteres", ""))

    half   = max(len(mots_list) // 2, 1)
    mots_a = " ".join(mots_list[:half])
    mots_b = " ".join(mots_list[half:]) if len(mots_list) > half else mots

    linkedin_q = [
        f'site:linkedin.com/in "{titre}" {mots} {loc_q}',
        f'site:linkedin.com/in "{titre}" {loc_q} {mots_a}',
        f'site:linkedin.com/in "{titre}" {loc_q} {mots_b}',
        f'site:linkedin.com/in {mots} {loc_q}',
        f'"{titre}" {mots} {loc_q} linkedin profil',
        f'"{titre}" {loc_q} linkedin disponible recrutement',
        f'linkedin "{titre}" {mots_a} {loc_q}',
    ]

    french_cities = ["paris", "lyon", "bordeaux", "marseille", "toulouse", "nantes",
                     "lille", "strasbourg", "rennes", "nice", "montpellier", "france"]
    if loc and any(city in loc.lower() for city in french_cities):
        linkedin_q += [
            f'site:fr.linkedin.com/in "{titre}" {mots}',
            f'site:fr.linkedin.com/in "{titre}" {mots_a} {loc_q}',
            f'site:fr.linkedin.com/in {mots} {loc_q}',
        ]

    # Seniority-specific queries (no OR operator — not supported by Tavily)
    if seniority == "senior":
        linkedin_q += [
            f'site:fr.linkedin.com/in "{titre}" "Tech Lead" {loc_q}',
            f'site:fr.linkedin.com/in "{titre}" "Expert" "10 ans" {loc_q}',
        ]
    elif seniority == "junior":
        linkedin_q += [
            f'site:fr.linkedin.com/in "{titre}" "junior" {loc_q}',
            f'site:fr.linkedin.com/in "{titre}" "alternance" {loc_q}',
        ]
    elif seniority == "confirmed":
        linkedin_q += [
            f'site:fr.linkedin.com/in "{titre}" "confirmé" {loc_q}',
            f'site:fr.linkedin.com/in "{titre}" "5 ans expérience" {loc_q}',
        ]

    # Malt queries (freelances uniquement)
    malt_q = [
        f'site:malt.fr "{titre}" {mots} {loc_q}',
        f'site:malt.fr {mots} {loc_q}',
    ]

    # APEC queries (cadres français, profils publics indexés par Google)
    apec_q = [
        f'site:cadres.apec.fr "{titre}" {mots} {loc_q}',
        f'site:apec.fr "{titre}" {mots} {loc_q}',
    ]

    return linkedin_q, malt_q, apec_q


# ── Tavily search ──────────────────────────────────────────────────────────────

async def search_profiles(
    query: str,
    domains: list[str],
    client: httpx.AsyncClient,
) -> list[dict]:
    try:
        resp = await client.post(
            TAVILY_URL,
            json={
                "api_key": TAVILY_KEY,
                "query": query,
                "search_depth": "basic",
                "max_results": 20,
                "include_domains": domains,
            },
            timeout=TAVILY_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json().get("results", [])
    except Exception as exc:
        log.warning("Tavily error for '%s': %s", query[:60], exc)
        return []


# ── Location extraction ────────────────────────────────────────────────────────

# LinkedIn snippet format: "Paris, Île-de-France · 500+ relations"
_LINKEDIN_LOC_RE = re.compile(
    r'([A-ZÀ-Ö][a-zà-öœé\-]{2,}(?:,\s*[A-ZÀ-Ö][a-zà-öœé\-\s]{3,})?)'
    r'\s*[·•]\s*[\d\s\u202f]+\+?\s*(?:relation|abonné|follower|contact)',
    re.IGNORECASE | re.UNICODE,
)

def extract_snippet_location(snippet: str) -> str | None:
    """Parse the structured 'City · X relations' pattern from LinkedIn snippets."""
    m = _LINKEDIN_LOC_RE.search(snippet)
    return m.group(1).strip() if m else None


# ── Location scorer (0 = not found, 2 = text match, 3 = structured match) ─────

_CITY_ALIASES: dict[str, list[str]] = {
    "paris":       ["paris", "île-de-france", "idf", "ile-de-france", "region parisienne"],
    "lyon":        ["lyon", "auvergne-rhône-alpes", "auvergne-rhone-alpes"],
    "bordeaux":    ["bordeaux", "nouvelle-aquitaine"],
    "marseille":   ["marseille", "bouches-du-rhône", "paca"],
    "toulouse":    ["toulouse", "occitanie"],
    "nantes":      ["nantes", "pays de la loire"],
    "lille":       ["lille", "hauts-de-france"],
    "strasbourg":  ["strasbourg", "grand est"],
    "rennes":      ["rennes", "bretagne"],
    "nice":        ["nice", "alpes-maritimes", "côte d'azur"],
    "montpellier": ["montpellier", "hérault"],
}

def location_score(content: str, title: str, location: str) -> int:
    if not location:
        return 1  # neutral — no location filter requested
    loc_lower = location.lower()
    loc_aliases = _CITY_ALIASES.get(loc_lower, [loc_lower])

    # Level 3: confirmed via structured snippet pattern
    confirmed = extract_snippet_location(content)
    if confirmed:
        confirmed_lower = confirmed.lower()
        if any(a in confirmed_lower for a in loc_aliases):
            return 3

    # Level 2: location string found anywhere in text
    text = (content + " " + title).lower()
    if any(a in text for a in loc_aliases):
        return 2

    return 0


# ── LinkedIn profile parser ────────────────────────────────────────────────────

def parse_linkedin_profile(result: dict, location: str = "") -> dict | None:
    url = result.get("url", "")
    if "linkedin.com/in/" not in url:
        return None

    raw_title = result.get("title", "").split(" | ")[0]
    parts = raw_title.split(" - ", 1)
    name = parts[0].strip()
    role_company = parts[1].strip() if len(parts) > 1 else ""

    role, company = "", ""
    for sep in (" at ", " chez ", " @ "):
        if sep in role_company:
            r, c = role_company.split(sep, 1)
            role, company = r.strip(), c.strip()
            break
    else:
        role = role_company

    snippet = result.get("content", "")
    kw = [w for w in snippet.split() if len(w) > 4][:8]
    loc_sc = location_score(snippet, raw_title, location)

    return {
        "linkedin_url":   url,
        "name_estimated": name,
        "title_estimated": role,
        "company":        company,
        "keywords":       ", ".join(kw),
        "_loc_score":     loc_sc,
        "_norm_url":      normalize_url(url),
        "_norm_name":     normalize_name(name) if name else "",
        "_source":        "linkedin",
    }


# ── Malt profile parser ────────────────────────────────────────────────────────

def parse_malt_profile(result: dict, location: str = "") -> dict | None:
    url = result.get("url", "")
    if "malt.fr/profile/" not in url:
        return None

    raw_title = result.get("title", "").split(" | ")[0]
    name, role = "", ""

    if "," in raw_title:
        parts = raw_title.split(",", 1)
        name = parts[0].strip()
        role_part = parts[1].strip()
        # Remove " à Paris" / "- Freelance" suffixes
        role = re.sub(r'\s*[àa]\s+\S.*$', '', role_part).strip()
        role = re.sub(r'\s*-\s*[Ff]reelance.*$', '', role).strip()
    elif " - " in raw_title:
        parts = raw_title.split(" - ", 1)
        name = parts[0].strip()
        role = parts[1].strip()
    else:
        name = raw_title

    snippet = result.get("content", "")
    kw = [w for w in re.split(r'[,.\s·]+', snippet) if len(w) > 4][:8]
    # Malt profiles always include city on signup → slight loc boost
    loc_sc = location_score(snippet, raw_title, location)
    if loc_sc == 0 and location:
        loc_sc = 1  # assume France-based freelance if no explicit match

    return {
        "linkedin_url":   url,  # Malt URL stored in same field (just a profile URL)
        "name_estimated": name,
        "title_estimated": role,
        "company":        "Freelance (Malt)",
        "keywords":       ", ".join(kw),
        "_loc_score":     loc_sc,
        "_norm_url":      normalize_url(url),
        "_norm_name":     normalize_name(name) if name else "",
        "_source":        "malt",
    }


# ── APEC profile parser ────────────────────────────────────────────────────────

def parse_apec_profile(result: dict, location: str = "") -> dict | None:
    url = result.get("url", "")
    if "apec.fr" not in url:
        return None
    # APEC mostly returns job offers, skip them
    if any(kw in url.lower() for kw in ["/offre-", "/annonce-", "/emploi-"]):
        return None

    raw_title = result.get("title", "").split(" | ")[0].split(" - APEC")[0]
    name, role = "", ""
    if " - " in raw_title:
        parts = raw_title.split(" - ", 1)
        name = parts[0].strip()
        role = parts[1].strip()
    else:
        name = raw_title.strip()

    snippet = result.get("content", "")
    kw = [w for w in re.split(r'[,.\s·]+', snippet) if len(w) > 4][:8]
    loc_sc = location_score(snippet, raw_title, location)

    return {
        "linkedin_url":    url,
        "name_estimated":  name,
        "title_estimated": role,
        "company":         "",
        "keywords":        ", ".join(kw),
        "_loc_score":      loc_sc,
        "_norm_url":       normalize_url(url),
        "_norm_name":      normalize_name(name) if name else "",
        "_source":         "apec",
    }


# ── LLM re-ranking ─────────────────────────────────────────────────────────────

async def llm_rerank(
    profiles: list[dict],
    brief: dict,
    client: httpx.AsyncClient,
) -> list[dict]:
    """Re-rank profiles semantically via gpt-4o-mini. Falls back silently on error."""
    if not OPENROUTER_KEY or len(profiles) < 5:
        return profiles

    # Compact profile lines to save tokens
    lines = []
    for i, p in enumerate(profiles):
        titre = (p.get("title_estimated") or "")[:45]
        co    = (p.get("company") or "")[:30]
        kw    = (p.get("keywords") or "")[:50]
        lines.append(f"{i}|{titre}|{co}|{kw}")

    prompt = (
        f"Brief recrutement: {brief.get('titre_poste')} à {brief.get('localisation')}.\n"
        f"Critères: {brief.get('criteres', 'non précisé')}.\n"
        f"Mots-clés: {', '.join(coerce_keywords(brief.get('mots_cles', []))[:8])}.\n\n"
        "Profils (index|titre|entreprise|mots_clés):\n"
        + "\n".join(lines)
        + "\n\nScore chaque profil 0-100 selon la pertinence pour ce brief.\n"
        "RÉPONDS UNIQUEMENT avec un JSON array compact: "
        '[{"i":0,"s":85},{"i":1,"s":72},...] — rien d\'autre.'
    )

    try:
        resp = await client.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_KEY}",
                "Content-Type":  "application/json",
                "HTTP-Referer":  "https://nawastudio.com",
                "X-Title":       "Nawa Studio Leo",
            },
            json={
                "model":       "openai/gpt-4o-mini",
                "messages":    [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens":  900,
            },
            timeout=LLM_TIMEOUT,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"].strip()

        # Strip possible markdown fences
        content = re.sub(r'^```(?:json)?', '', content).strip().rstrip('`').strip()
        scores_raw: list[dict] = json.loads(content)
        score_map = {
            item["i"]: int(item["s"])
            for item in scores_raw
            if isinstance(item.get("i"), int) and isinstance(item.get("s"), (int, float))
        }

        for i, p in enumerate(profiles):
            p["_llm_score"] = score_map.get(i, 50)

        profiles.sort(key=lambda p: (-(p.get("_llm_score", 50)), -p.get("_loc_score", 0)))
        log.info("LLM re-ranking applied to %d profiles", len(profiles))

    except Exception as exc:
        log.warning("LLM re-ranking failed (falling back to loc sort): %s", exc)

    return profiles


# ── Main entry point ───────────────────────────────────────────────────────────

async def run(brief: dict) -> dict:
    """
    Return dict: { excel_b64: str, candidates: list[dict] }
    excel_b64  → base64 Excel for download
    candidates → structured list for DB ingestion
    """
    linkedin_queries, malt_queries, apec_queries = build_queries(brief)
    location = brief.get("localisation", "")
    profiles: list[dict]  = []
    seen_urls: set[str]   = set()
    seen_names: list[str] = []  # list for fuzzy matching

    # Throttle concurrency to avoid Tavily rate limits (max 5 simultaneous requests)
    semaphore = asyncio.Semaphore(5)

    async def throttled_search(q: str, domains: list[str], c: httpx.AsyncClient) -> list[dict]:
        async with semaphore:
            return await search_profiles(q, domains, c)

    async with httpx.AsyncClient() as client:
        li_tasks   = [throttled_search(q, ["linkedin.com"], client) for q in linkedin_queries]
        malt_tasks = [throttled_search(q, ["malt.fr"], client) for q in malt_queries]
        apec_tasks = [throttled_search(q, ["apec.fr", "cadres.apec.fr"], client) for q in apec_queries]
        all_results = await asyncio.gather(*li_tasks, *malt_tasks, *apec_tasks)

    n_li, n_malt = len(linkedin_queries), len(malt_queries)
    li_results   = all_results[:n_li]
    malt_results = all_results[n_li:n_li + n_malt]
    apec_results = all_results[n_li + n_malt:]

    def add_profile(p: dict | None) -> None:
        if p is None:
            return
        norm_url  = p["_norm_url"]
        norm_name = p["_norm_name"]

        # 1. URL dedup
        if norm_url in seen_urls:
            return

        # 2. Exact name+company dedup
        name_co_key = f"{norm_name}|{p['company'].lower().strip()}"
        if norm_name and norm_name in seen_names and p["company"]:
            if name_co_key in seen_names:
                return

        # 3. Fuzzy name dedup (catches "Jean-Marie" vs "Jean Marie", typos…)
        if norm_name and any(fuzzy_name_match(norm_name, existing) for existing in seen_names):
            return

        seen_urls.add(norm_url)
        if norm_name:
            seen_names.append(norm_name)
            seen_names.append(name_co_key)
        profiles.append(p)

    # LinkedIn profiles
    for results in li_results:
        for r in results:
            add_profile(parse_linkedin_profile(r, location))

    # Malt profiles (append after LinkedIn to avoid displacing them)
    for results in malt_results:
        for r in results:
            add_profile(parse_malt_profile(r, location))

    # APEC profiles
    for results in apec_results:
        for r in results:
            add_profile(parse_apec_profile(r, location))

    # Sort by location confidence
    profiles.sort(key=lambda p: -p.get("_loc_score", 0))

    # Post-filter: drop unconfirmed if we have enough confirmed
    if location:
        confirmed   = [p for p in profiles if p.get("_loc_score", 0) > 0]
        unconfirmed = [p for p in profiles if p.get("_loc_score", 0) == 0]
        if len(confirmed) >= 30:
            profiles = confirmed
            log.info("Location strict filter: %d confirmed kept, %d dropped",
                     len(confirmed), len(unconfirmed))
        elif len(confirmed) >= 15:
            profiles = confirmed + unconfirmed[:10]
            log.info("Location partial filter: %d confirmed + %d unconfirmed",
                     len(confirmed), min(10, len(unconfirmed)))

    profiles = profiles[:MAX_PROFILES]

    # LLM re-ranking (optional — requires OPENROUTER_API_KEY)
    async with httpx.AsyncClient() as client:
        profiles = await llm_rerank(profiles, brief, client)

    apec_count = sum(1 for p in profiles if p.get("_source") == "apec")
    malt_count = sum(1 for p in profiles if p.get("_source") == "malt")
    li_count   = len(profiles) - apec_count - malt_count
    log.info("Leo v2 — %d profiles | LinkedIn: %d | Malt: %d | APEC: %d | location=%s",
             len(profiles), li_count, malt_count, apec_count, location)

    # Strip internal fields but keep source (rename _source → source)
    clean = []
    for p in profiles:
        entry = {k: v for k, v in p.items() if not k.startswith("_")}
        entry["source"] = p.get("_source", "linkedin")
        clean.append(entry)

    df = pd.DataFrame(
        clean,
        columns=["source", "linkedin_url", "name_estimated", "title_estimated", "company", "keywords"],
    )

    buf = BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Profils", index=False)
        ws = writer.sheets["Profils"]
        for col in ws.columns:
            max_len = max(len(str(cell.value or "")) for cell in col)
            ws.column_dimensions[col[0].column_letter].width = min(max_len + 4, 60)

    excel_b64 = base64.b64encode(buf.getvalue()).decode()

    candidates = [
        {**p, "keywords": [k.strip() for k in p["keywords"].split(",") if k.strip()]}
        for p in clean
    ]

    return {"excel_b64": excel_b64, "candidates": candidates}
