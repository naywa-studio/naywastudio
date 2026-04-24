"""
Agent Léo (N2) — LinkedIn sourcing via Apify
Recherche directe LinkedIn (no cookies) — $3/1000 profils
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

APIFY_TOKEN    = os.environ["APIFY_TOKEN"]
OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY", "")

# Actor Apify : LinkedIn Profile Search (no cookies)
# Docs : https://apify.com/harvestapi/linkedin-profile-search
APIFY_ACTOR  = "harvestapi~linkedin-profile-search"
APIFY_BASE   = "https://api.apify.com/v2"

MAX_PROFILES = 40   # plafond par mission → ~$3/mois pour 1000 profils


# ── Helpers ────────────────────────────────────────────────────────────────────

def normalize_url(url: str) -> str:
    base = url.split("?")[0].split("#")[0].rstrip("/").lower()
    return re.sub(r'^https?://(www\.|[a-z]{2}\.)?', '', base)


def normalize_name(name: str) -> str:
    nfkd = unicodedata.normalize('NFD', name.lower())
    ascii_n = ''.join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r'\s+', ' ', ascii_n.replace('-', ' ').replace('.', ' ')).strip()


def fuzzy_name_match(a: str, b: str, threshold: float = 0.85) -> bool:
    if len(a) < 6 or len(b) < 6:
        return False
    return SequenceMatcher(None, a, b).ratio() >= threshold


def coerce_keywords(raw: object) -> list[str]:
    if isinstance(raw, list):
        return [str(k).strip() for k in raw if str(k).strip()]
    if isinstance(raw, str):
        return [p.strip() for p in re.split(r'[,;]+', raw) if p.strip()]
    return []


def detect_seniority(criteres: str) -> str:
    c = (criteres or "").lower()
    if any(k in c for k in ["senior", "lead", "principal", "expert", "7+", "8+", "10 ans"]):
        return "senior"
    if any(k in c for k in ["junior", "débutant", "0-2", "1-2", "stage"]):
        return "junior"
    if any(k in c for k in ["confirmé", "3-5", "5 ans", "intermédiaire"]):
        return "confirmed"
    return "any"


def short_title(titre: str) -> str:
    """Retourne les 3 premiers mots d'un titre pour les requêtes."""
    words = titre.split()[:3]
    return " ".join(words)


# ── Location normalization ─────────────────────────────────────────────────────

_SUBURB_TO_CITY: dict[str, str] = {
    # Île-de-France
    "la garenne-colombes": "Paris", "boulogne-billancourt": "Paris",
    "levallois-perret": "Paris", "neuilly-sur-seine": "Paris",
    "courbevoie": "Paris", "puteaux": "Paris", "nanterre": "Paris",
    "issy-les-moulineaux": "Paris", "clichy": "Paris", "montreuil": "Paris",
    "saint-denis": "Paris", "aubervilliers": "Paris", "pantin": "Paris",
    "vincennes": "Paris", "saint-maur-des-fossés": "Paris",
    "villejuif": "Paris", "ivry-sur-seine": "Paris", "vitry-sur-seine": "Paris",
    "créteil": "Paris", "versailles": "Paris", "saint-germain-en-laye": "Paris",
    "massy": "Paris", "palaiseau": "Paris", "gif-sur-yvette": "Paris",
    "villepinte": "Paris", "roissy-en-france": "Paris", "argenteuil": "Paris",
    "asnières-sur-seine": "Paris", "colombes": "Paris", "rueil-malmaison": "Paris",
    "antony": "Paris", "clamart": "Paris", "chatillon": "Paris",
    "montrouge": "Paris", "malakoff": "Paris", "vanves": "Paris",
    "sceaux": "Paris", "bagneux": "Paris", "fontenay-sous-bois": "Paris",
    "nogent-sur-marne": "Paris", "joinville-le-pont": "Paris",
    "maisons-alfort": "Paris", "alfortville": "Paris", "charenton-le-pont": "Paris",
    "saint-cloud": "Paris", "sèvres": "Paris", "meudon": "Paris",
    "chaville": "Paris", "vélizy-villacoublay": "Paris",
    "guyancourt": "Paris", "montigny-le-bretonneux": "Paris",
    "trappes": "Paris", "élancourt": "Paris",
    # Lyon
    "villeurbanne": "Lyon", "bron": "Lyon", "vénissieux": "Lyon",
    "caluire-et-cuire": "Lyon", "décines-charpieu": "Lyon",
    "saint-priest": "Lyon", "meyzieu": "Lyon", "mions": "Lyon",
    "chassieu": "Lyon", "rillieux-la-pape": "Lyon",
    # Bordeaux
    "mérignac": "Bordeaux", "pessac": "Bordeaux", "talence": "Bordeaux",
    "villenave-d'ornon": "Bordeaux", "bègles": "Bordeaux",
    "le bouscat": "Bordeaux", "eysines": "Bordeaux",
    # Toulouse
    "blagnac": "Toulouse", "colomiers": "Toulouse", "tournefeuille": "Toulouse",
    "labège": "Toulouse", "ramonville-saint-agne": "Toulouse",
    # Lille
    "roubaix": "Lille", "tourcoing": "Lille", "villeneuve-d'ascq": "Lille",
    "marcq-en-baroeul": "Lille", "wasquehal": "Lille", "hem": "Lille",
    # Nantes
    "saint-herblain": "Nantes", "rezé": "Nantes", "orvault": "Nantes",
    "carquefou": "Nantes", "vertou": "Nantes",
    # Nice
    "antibes": "Nice", "cannes": "Nice", "sophia antipolis": "Nice",
    "valbonne": "Nice", "mougins": "Nice", "cagnes-sur-mer": "Nice",
    # Marseille
    "aix-en-provence": "Marseille", "aubagne": "Marseille",
    "martigues": "Marseille", "istres": "Marseille",
    # Strasbourg
    "schiltigheim": "Strasbourg", "illkirch-graffenstaden": "Strasbourg",
    "ostwald": "Strasbourg",
}

_CITY_TO_REGION: dict[str, str] = {
    "Paris": "Île-de-France", "Lyon": "Auvergne-Rhône-Alpes",
    "Marseille": "Provence-Alpes-Côte d'Azur", "Toulouse": "Occitanie",
    "Bordeaux": "Nouvelle-Aquitaine", "Lille": "Hauts-de-France",
    "Nantes": "Pays de la Loire", "Strasbourg": "Grand Est",
    "Nice": "Provence-Alpes-Côte d'Azur", "Grenoble": "Auvergne-Rhône-Alpes",
    "Rennes": "Bretagne", "Rouen": "Normandie", "Montpellier": "Occitanie",
}


def normalize_location(loc: str) -> tuple[str, str]:
    """Retourne (city_for_search, region). Normalise les banlieues vers la grande ville."""
    key = loc.lower().strip()
    city = _SUBURB_TO_CITY.get(key, loc)
    region = _CITY_TO_REGION.get(city, "")
    return city, region


# ── Apify search ───────────────────────────────────────────────────────────────

async def _apify_search(query: str, client: httpx.AsyncClient) -> list[dict]:
    """Lance une recherche LinkedIn via harvestapi sur Apify. Retourne des profils bruts."""
    try:
        resp = await client.post(
            f"{APIFY_BASE}/acts/{APIFY_ACTOR}/run-sync-get-dataset-items",
            params={"token": APIFY_TOKEN, "timeout": 90, "memory": 512},
            json={
                "searchQuery": query,
                "profileScraperMode": "Full",  # données complètes (titre, expériences, compétences)
                "takePages": 1,                 # 1 page = 25 profils
                "maxItems": 25,
            },
            timeout=100.0,
        )
        resp.raise_for_status()
        data = resp.json()
        return data if isinstance(data, list) else []
    except Exception as e:
        log.warning("Apify query failed [%s]: %s", query, e)
        return []


async def search_profiles(brief: dict) -> list[dict]:
    """Construit les requêtes et appelle Apify. Retourne des profils dédupliqués."""
    titre     = brief.get("titre_poste", "")
    keywords  = coerce_keywords(brief.get("mots_cles", []))
    criteres  = brief.get("criteres", "")
    loc_raw   = brief.get("localisation", "France")

    city, region = normalize_location(loc_raw)
    titre_court  = short_title(titre)
    kw_str       = " ".join(keywords[:2]) if keywords else ""
    seniority    = detect_seniority(criteres)
    seniority_kw = {"senior": "Senior", "junior": "Junior", "confirmed": "Confirmé"}.get(seniority, "")

    # Requêtes variées pour maximiser la couverture
    queries: list[str] = []

    # Requêtes avec ville
    queries.append(f"{titre_court} {city}")
    if kw_str:
        queries.append(f"{titre_court} {kw_str} {city}")
    if seniority_kw:
        queries.append(f"{seniority_kw} {titre_court} {city}")

    # Requêtes avec région
    if region:
        queries.append(f"{titre_court} {region}")

    # Requêtes France (fallback)
    queries.append(f"{titre_court} France")
    if kw_str:
        queries.append(f"{titre_court} {kw_str} France")

    # Titres alternatifs anglais pour les postes techniques
    alt_titles = brief.get("alt_titles", [])
    for alt in alt_titles[:2]:
        queries.append(f"{alt} {city}")

    seen_urls:  set[str] = set()
    seen_names: set[str] = set()
    all_profiles: list[dict] = []

    async with httpx.AsyncClient() as client:
        for query in queries:
            if len(all_profiles) >= MAX_PROFILES:
                break
            items = await _apify_search(query, client)

            for item in items:
                url = item.get("linkedinUrl") or item.get("url") or ""
                if not url:
                    continue
                url_norm = normalize_url(url)
                if url_norm in seen_urls:
                    continue

                # Déduplication par nom (harvestapi: firstName + lastName)
                first = item.get("firstName") or ""
                last  = item.get("lastName") or ""
                name  = f"{first} {last}".strip() or item.get("fullName") or item.get("name") or ""
                name_norm = normalize_name(name)
                if name_norm and any(fuzzy_name_match(name_norm, n) for n in seen_names):
                    continue

                seen_urls.add(url_norm)
                if name_norm:
                    seen_names.add(name_norm)
                all_profiles.append(item)

    return all_profiles[:MAX_PROFILES]


# ── Profile parsing ────────────────────────────────────────────────────────────

def parse_profile(raw: dict) -> dict:
    """Normalise un profil brut Apify (harvestapi) vers le format Nawa."""
    # Name: harvestapi returns firstName + lastName separately
    first = raw.get("firstName") or ""
    last  = raw.get("lastName") or ""
    name  = f"{first} {last}".strip() or raw.get("fullName") or raw.get("name") or ""

    # Company: from currentPosition list
    current_pos = raw.get("currentPosition") or []
    company = ""
    if current_pos and isinstance(current_pos, list):
        company = current_pos[0].get("companyName") or current_pos[0].get("company") or ""

    # Location: harvestapi returns a dict {linkedinText, parsed: {city, ...}}
    loc_raw = raw.get("location") or ""
    if isinstance(loc_raw, dict):
        location = (loc_raw.get("linkedinText") or
                    loc_raw.get("parsed", {}).get("city") or "")
    else:
        location = str(loc_raw)

    # Skills: harvestapi returns [{name: "React", ...}], extract names
    skills_raw = raw.get("skills") or raw.get("topSkills") or []
    if skills_raw and isinstance(skills_raw[0], dict):
        skills = [s.get("name", "") for s in skills_raw if s.get("name")]
    else:
        skills = [str(s) for s in skills_raw if s]

    return {
        "source":       "linkedin",
        "linkedin_url": raw.get("linkedinUrl") or raw.get("url") or "",
        "name":         name,
        "title":        raw.get("headline") or (current_pos[0].get("position") if current_pos else "") or "",
        "company":      company,
        "location":     location,
        "summary":      (raw.get("about") or raw.get("summary") or "")[:300],
        "skills":       skills,
        "score":        None,
    }


# ── LLM scoring ────────────────────────────────────────────────────────────────

async def llm_score(brief: dict, profiles: list[dict]) -> list[dict]:
    """Score les profils 0-100 via GPT-4o-mini. Trie par score décroissant."""
    if not OPENROUTER_KEY or not profiles:
        return profiles

    batch = profiles[:30]
    prompt = (
        f"Score ces profils LinkedIn pour le poste « {brief.get('titre_poste')} » "
        f"à {brief.get('localisation', '')}.\n"
        f"Critères : {brief.get('criteres', '')}\n"
        f"Mots-clés : {', '.join(coerce_keywords(brief.get('mots_cles', [])))}\n\n"
        "Retourne UNIQUEMENT un JSON array : [{\"index\": 0, \"score\": 85}, ...]\n"
        "Score 0-100 basé sur titre, localisation, compétences.\n\n"
        "Profils :\n"
        + json.dumps(
            [{"index": i, "title": p["title"], "company": p["company"], "location": p["location"]}
             for i, p in enumerate(batch)],
            ensure_ascii=False
        )
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENROUTER_KEY}"},
                json={
                    "model": "openai/gpt-4o-mini",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "max_tokens": 500,
                },
            )
            r.raise_for_status()
            content = r.json()["choices"][0]["message"]["content"]
            match = re.search(r'\[.*?\]', content, re.DOTALL)
            if match:
                scores = json.loads(match.group())
                score_map = {s["index"]: s["score"] for s in scores}
                for i, p in enumerate(batch):
                    p["score"] = score_map.get(i, 50)
    except Exception as e:
        log.warning("LLM scoring failed: %s", e)

    profiles.sort(key=lambda p: p.get("score") or 0, reverse=True)
    return profiles


# ── Excel export ───────────────────────────────────────────────────────────────

def build_excel(profiles: list[dict], sheet_name: str = "Profils") -> str:
    rows = [
        {
            "Rang":         i + 1,
            "Nom":          p.get("name", ""),
            "Titre":        p.get("title", ""),
            "Entreprise":   p.get("company", ""),
            "Localisation": p.get("location", ""),
            "Score":        p.get("score") or "",
            "LinkedIn":     p.get("linkedin_url", ""),
            "Résumé":       p.get("summary", ""),
        }
        for i, p in enumerate(profiles)
    ]
    df = pd.DataFrame(rows)
    buf = BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name=sheet_name)
        ws = writer.sheets[sheet_name]
        for col in ws.columns:
            w = max(len(str(c.value or "")) for c in col)
            ws.column_dimensions[col[0].column_letter].width = min(w + 2, 60)
    return base64.b64encode(buf.getvalue()).decode()


# ── Entry point ────────────────────────────────────────────────────────────────

async def run(brief: dict) -> dict:
    """Point d'entrée principal. Retourne {excel_b64, candidates, profiles_count}."""
    log.info("Léo démarrage — %s / %s", brief.get("titre_poste"), brief.get("localisation"))

    raw = await search_profiles(brief)
    log.info("Apify : %d profils bruts", len(raw))

    profiles = [parse_profile(r) for r in raw if r.get("linkedinUrl") or r.get("url")]
    profiles = await llm_score(brief, profiles)

    candidates = [
        {
            "linkedin_url":    p["linkedin_url"],
            "name_estimated":  p["name"],
            "title_estimated": p["title"],
            "company":         p["company"],
            "keywords":        p.get("skills", []),
            "relevance_score": p.get("score"),
            "seniority_level": p.get("seniority", ""),
            "message":         p.get("message", ""),
            "source":          "leo",
        }
        for p in profiles
    ]

    log.info("Léo terminé — %d profils", len(profiles))
    return {
        "excel_b64":      build_excel(profiles),
        "candidates":     candidates,
        "profiles_count": len(profiles),
    }
