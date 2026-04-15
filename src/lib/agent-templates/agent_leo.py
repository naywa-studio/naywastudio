"""
Agent Léo (N1) — Sourcing de profils publics via Tavily
Output : Excel 1 feuille (linkedin_url, name_estimated, title_estimated, company, keywords)
"""

import os
import asyncio
import base64
import logging
from io import BytesIO

import httpx
import pandas as pd

log = logging.getLogger("nawa-agent.leo")

TAVILY_KEY = os.environ["TAVILY_API_KEY"]
TAVILY_URL = "https://api.tavily.com/search"
MAX_PROFILES = 50
TAVILY_TIMEOUT = 10.0


# ── Query builder ─────────────────────────────────────────────────────────────

def build_queries(brief: dict) -> list[str]:
    titre = brief.get("titre_poste", "")
    mots = " ".join(brief.get("mots_cles", []))
    loc = brief.get("localisation", "")
    return [
        f'site:linkedin.com/in "{titre}" {mots} {loc}',
        f'"{titre}" {mots} {loc} linkedin profil recrutement',
        f'"{titre}" {mots} {loc} profil linkedin disponible',
    ]


# ── Tavily search ─────────────────────────────────────────────────────────────

async def search_profiles(query: str, client: httpx.AsyncClient) -> list[dict]:
    try:
        resp = await client.post(
            TAVILY_URL,
            json={
                "api_key": TAVILY_KEY,
                "query": query,
                "search_depth": "basic",
                "max_results": 20,
                "include_domains": ["linkedin.com"],
            },
            timeout=TAVILY_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json().get("results", [])
    except Exception as exc:
        log.warning("Tavily error for '%s': %s", query[:60], exc)
        return []


# ── Profile parser ────────────────────────────────────────────────────────────

def parse_profile(result: dict) -> dict | None:
    url = result.get("url", "")
    if "linkedin.com/in/" not in url:
        return None

    # Title format: "Prénom Nom - Titre chez Entreprise | LinkedIn"
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
    kw = [w for w in snippet.split() if len(w) > 4][:6]

    return {
        "linkedin_url": url,
        "name_estimated": name,
        "title_estimated": role,
        "company": company,
        "keywords": ", ".join(kw),
    }


# ── Main entry point ──────────────────────────────────────────────────────────

async def run(brief: dict) -> str:
    """Return base64-encoded Excel file."""
    queries = build_queries(brief)
    profiles: list[dict] = []
    seen: set[str] = set()

    async with httpx.AsyncClient() as client:
        results_list = await asyncio.gather(
            *[search_profiles(q, client) for q in queries]
        )

    for results in results_list:
        for r in results:
            p = parse_profile(r)
            if p and p["linkedin_url"] not in seen:
                seen.add(p["linkedin_url"])
                profiles.append(p)
                if len(profiles) >= MAX_PROFILES:
                    break

    log.info("Leo found %d profiles", len(profiles))

    df = pd.DataFrame(
        profiles,
        columns=["linkedin_url", "name_estimated", "title_estimated", "company", "keywords"],
    )

    buf = BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Profils", index=False)
        # Auto-width columns
        ws = writer.sheets["Profils"]
        for col in ws.columns:
            max_len = max(len(str(cell.value or "")) for cell in col)
            ws.column_dimensions[col[0].column_letter].width = min(max_len + 4, 60)

    return base64.b64encode(buf.getvalue()).decode()
