"""
Agent Léo (N1) — LinkedIn sourcing via Bing Web Search API
Recherche + pre-filter + scoring LLM multi-dimensionnel (4 axes + justification)
"""

import os
import re
import json
import asyncio
import base64
import logging
import unicodedata
import datetime
from difflib import SequenceMatcher
from io import BytesIO

import httpx
import pandas as pd

log = logging.getLogger("nawa-agent.leo")

GOOGLE_API_KEY    = os.environ["GOOGLE_SEARCH_API_KEY"]
GOOGLE_CX         = os.environ["GOOGLE_SEARCH_ENGINE_ID"]
OPENROUTER_KEY    = os.environ.get("OPENROUTER_API_KEY", "")

GOOGLE_ENDPOINT = "https://www.googleapis.com/customsearch/v1"
MAX_PROFILES    = 40


# ── String helpers ─────────────────────────────────────────────────────────────

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
    return " ".join(titre.split()[:3])


# ── Location normalization ─────────────────────────────────────────────────────

_SUBURB_TO_CITY: dict[str, str] = {
    "la garenne-colombes": "Paris", "boulogne-billancourt": "Paris",
    "levallois-perret": "Paris", "neuilly-sur-seine": "Paris",
    "courbevoie": "Paris", "puteaux": "Paris", "nanterre": "Paris",
    "issy-les-moulineaux": "Paris", "clichy": "Paris", "montreuil": "Paris",
    "saint-denis": "Paris", "aubervilliers": "Paris", "pantin": "Paris",
    "vincennes": "Paris", "saint-maur-des-fossés": "Paris",
    "villejuif": "Paris", "ivry-sur-seine": "Paris", "vitry-sur-seine": "Paris",
    "créteil": "Paris", "versailles": "Paris", "saint-germain-en-laye": "Paris",
    "massy": "Paris", "palaiseau": "Paris", "gif-sur-yvette": "Paris",
    "argenteuil": "Paris", "asnières-sur-seine": "Paris", "colombes": "Paris",
    "rueil-malmaison": "Paris", "antony": "Paris", "clamart": "Paris",
    "montrouge": "Paris", "malakoff": "Paris", "vanves": "Paris",
    "sceaux": "Paris", "bagneux": "Paris", "fontenay-sous-bois": "Paris",
    "nogent-sur-marne": "Paris", "joinville-le-pont": "Paris",
    "maisons-alfort": "Paris", "alfortville": "Paris", "charenton-le-pont": "Paris",
    "saint-cloud": "Paris", "sèvres": "Paris", "meudon": "Paris",
    "vélizy-villacoublay": "Paris", "guyancourt": "Paris",
    "villeurbanne": "Lyon", "bron": "Lyon", "vénissieux": "Lyon",
    "caluire-et-cuire": "Lyon", "décines-charpieu": "Lyon",
    "saint-priest": "Lyon", "meyzieu": "Lyon", "rillieux-la-pape": "Lyon",
    "mérignac": "Bordeaux", "pessac": "Bordeaux", "talence": "Bordeaux",
    "villenave-d'ornon": "Bordeaux", "bègles": "Bordeaux",
    "blagnac": "Toulouse", "colomiers": "Toulouse", "tournefeuille": "Toulouse",
    "labège": "Toulouse", "ramonville-saint-agne": "Toulouse",
    "roubaix": "Lille", "tourcoing": "Lille", "villeneuve-d'ascq": "Lille",
    "marcq-en-baroeul": "Lille", "wasquehal": "Lille",
    "saint-herblain": "Nantes", "rezé": "Nantes", "orvault": "Nantes",
    "antibes": "Nice", "cannes": "Nice", "sophia antipolis": "Nice",
    "valbonne": "Nice", "mougins": "Nice",
    "aix-en-provence": "Marseille", "aubagne": "Marseille",
    "schiltigheim": "Strasbourg", "illkirch-graffenstaden": "Strasbourg",
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
    key = loc.lower().strip()
    city = _SUBURB_TO_CITY.get(key, loc)
    region = _CITY_TO_REGION.get(city, "")
    return city, region


# ── Bing search ────────────────────────────────────────────────────────────────

async def _google_search(query: str, client: httpx.AsyncClient, start: int = 1) -> list[dict]:
    """Recherche Google Custom Search avec filtre site:linkedin.com/in/"""
    try:
        resp = await client.get(
            GOOGLE_ENDPOINT,
            params={
                "key":   GOOGLE_API_KEY,
                "cx":    GOOGLE_CX,
                "q":     f'site:linkedin.com/in/ {query}',
                "num":   10,      # Max par requête Google CSE
                "start": start,   # Pagination (1, 11, 21…)
                "hl":    "fr",
                "gl":    "fr",
            },
            timeout=15.0,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("items", [])
    except Exception as e:
        log.warning("Google CSE query failed [%s]: %s", query, e)
        return []


def _parse_google_item(item: dict) -> dict | None:
    """
    Parse un résultat Google CSE en profil Nawa.
    Format : title = "Marie Dupont - Développeur React | LinkedIn"
             snippet = "Développeur React Senior chez Doctolib · Paris · …"
             link = "https://www.linkedin.com/in/marie-dupont"
    """
    url = item.get("link", "")

    # Garder uniquement les URLs profil /in/{slug}
    if not re.match(r'https?://([a-z]{2}\.)?linkedin\.com/in/[^/?#\s]+/?$', url):
        return None

    display_name = item.get("title", "")
    snippet      = item.get("snippet", "")

    # "Marie Dupont - Développeur React | LinkedIn" → nom + titre
    clean = re.sub(r'\s*[|]\s*LinkedIn.*$', '', display_name, flags=re.IGNORECASE).strip()
    name, title = "", ""
    sep_match = re.search(r'\s[-–—]\s', clean)
    if sep_match:
        idx   = sep_match.start()
        name  = clean[:idx].strip()
        title = clean[idx + len(sep_match.group()):].strip()
    else:
        name = clean

    # Entreprise depuis snippet
    company = ""
    m = re.search(r'(?:chez|at|@)\s+([A-ZÀ-Ÿ][^,\.\n·—]{2,40})', snippet)
    if not m:
        parts = [p.strip() for p in snippet.split("·") if p.strip()]
        if len(parts) >= 2:
            company = parts[1]
    else:
        company = m.group(1).strip()

    # Localisation depuis snippet
    location = ""
    loc_match = re.search(
        r'\b(Paris|Lyon|Marseille|Toulouse|Bordeaux|Lille|Nantes|Strasbourg|'
        r'Nice|Grenoble|Rennes|Rouen|Montpellier|France|Remote|Télétravail)\b',
        snippet, re.IGNORECASE,
    )
    if loc_match:
        location = loc_match.group(1)

    return {
        "source":             "linkedin",
        "linkedin_url":       url.split("?")[0].rstrip("/"),
        "name":               name,
        "title":              title,
        "company":            company,
        "location":           location,
        "location_country":   "France",
        "summary":            snippet[:400],
        "skills":             [],        # Enrichi ultérieurement par l'extension Chrome
        "experience_summary": "",
        "years_experience":   0,
        "score":              None,
    }


async def search_profiles(brief: dict) -> list[dict]:
    """Construit les requêtes Bing et retourne des profils dédupliqués."""
    titre     = brief.get("titre_poste", "")
    keywords  = coerce_keywords(brief.get("mots_cles", []))
    criteres  = brief.get("criteres", "")
    loc_raw   = brief.get("localisation", "France")

    city, region  = normalize_location(loc_raw)
    titre_court   = short_title(titre)
    kw_str        = " ".join(keywords[:2]) if keywords else ""
    seniority     = detect_seniority(criteres)
    seniority_kw  = {"senior": "Senior", "junior": "Junior", "confirmed": "Confirmé"}.get(seniority, "")

    queries: list[str] = []
    queries.append(f'"{titre_court}" "{city}"')
    if kw_str:
        queries.append(f'"{titre_court}" {kw_str} "{city}"')
    if seniority_kw:
        queries.append(f'{seniority_kw} "{titre_court}" "{city}"')
    if region:
        queries.append(f'"{titre_court}" "{region}"')
    queries.append(f'"{titre_court}" France')
    if kw_str:
        queries.append(f'"{titre_court}" {kw_str} France')

    for alt in brief.get("alt_titles", [])[:2]:
        queries.append(f'"{alt}" "{city}"')

    seen_urls:  set[str] = set()
    seen_names: set[str] = set()
    all_profiles: list[dict] = []

    async with httpx.AsyncClient() as client:
        for query in queries:
            if len(all_profiles) >= MAX_PROFILES:
                break
            # Google CSE : 10 résultats/requête — on pagine si besoin (start=1 puis start=11)
            for start in (1, 11):
                if len(all_profiles) >= MAX_PROFILES:
                    break
                items = await _google_search(query, client, start=start)
                if not items:
                    break

                for item in items:
                    profile = _parse_google_item(item)
                    if not profile:
                        continue

                    url_norm = normalize_url(profile["linkedin_url"])
                    if url_norm in seen_urls:
                        continue

                    name_norm = normalize_name(profile["name"])
                    if name_norm and any(fuzzy_name_match(name_norm, n) for n in seen_names):
                        continue

                    seen_urls.add(url_norm)
                    if name_norm:
                        seen_names.add(name_norm)
                    all_profiles.append(profile)

    log.info("Google CSE : %d profils bruts récupérés", len(all_profiles))
    return all_profiles[:MAX_PROFILES]


# ── Pre-filter ─────────────────────────────────────────────────────────────────

def pre_filter(profiles: list[dict], brief: dict) -> list[dict]:
    """
    Filtre rapide (sans LLM) — élimine les profils clairement hors-sujet.
    Vérifie pertinence dans : titre + compétences + résumé (snippet Bing) + expérience.
    Intentionnellement peu agressif pour ne pas rejeter de bons profils.
    """
    keywords     = [k.lower() for k in coerce_keywords(brief.get("mots_cles", []))]
    localisation = brief.get("localisation", "france").lower()
    is_national  = localisation in ("france", "remote", "télétravail", "partout")

    filtered = []
    for p in profiles:
        if not p.get("linkedin_url"):
            continue

        # Filtre géographique
        country = (p.get("location_country") or "").lower()
        if not is_national and country and "france" not in country and country not in ("fr", ""):
            continue

        # Filtre pertinence minimale
        if keywords:
            text = " ".join([
                (p.get("title") or "").lower(),
                " ".join(p.get("skills") or []).lower(),
                (p.get("summary") or "").lower(),            # snippet Bing
                (p.get("experience_summary") or "").lower(),
            ])
            if not any(kw in text for kw in keywords):
                continue

        filtered.append(p)

    log.info("pre_filter: %d → %d profils conservés", len(profiles), len(filtered))
    return filtered


# ── LLM scoring multi-dimensionnel ────────────────────────────────────────────

async def llm_score(brief: dict, profiles: list[dict]) -> list[dict]:
    """
    Scoring riche via LLM : titre, résumé (snippet), entreprise.
    Retourne 4 dimensions + justification pour chaque profil.
    """
    if not OPENROUTER_KEY or not profiles:
        return profiles

    batch    = profiles[:30]
    titre    = brief.get("titre_poste", "")
    loc      = brief.get("localisation", "")
    criteres = brief.get("criteres", "")
    keywords = coerce_keywords(brief.get("mots_cles", []))

    profiles_for_llm = []
    for i, p in enumerate(batch):
        profiles_for_llm.append({
            "index":      i,
            "titre":      p["title"],
            "entreprise": p["company"],
            "lieu":       p["location"],
            "resume":     p.get("summary", "")[:250],   # snippet Bing — source principale
        })

    prompt = (
        f"Expert recruteur, évalue ces profils LinkedIn pour : « {titre} » à {loc}.\n"
        f"Critères client : {criteres}\n"
        f"Compétences requises : {', '.join(keywords[:10])}\n\n"
        "Pour chaque profil, retourne UNIQUEMENT ce JSON array :\n"
        '[{"index":0,"score":85,"competences":90,"seniorite":80,"localisation":100,"qualite":75,'
        '"seniority":"Senior","justification":"8 ans React, TypeScript ✓, Paris ✓"},...]\n\n'
        "Définitions :\n"
        "- score : pertinence globale 0-100\n"
        "- competences : % compétences requises présentes 0-100\n"
        "- seniorite : niveau d'expérience vs critères 0-100\n"
        "- localisation : correspondance géographique 0-100\n"
        "- qualite : profil complet et cohérent 0-100\n"
        "- seniority : Junior | Confirmé | Senior | Expert\n"
        "- justification : 1 phrase max, points forts/faibles clés\n\n"
        "Profils :\n"
        + json.dumps(profiles_for_llm, ensure_ascii=False)
    )

    try:
        async with httpx.AsyncClient(timeout=50.0) as client:
            r = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENROUTER_KEY}"},
                json={
                    "model":       "openai/gpt-4o-mini",
                    "messages":    [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "max_tokens":  2000,
                },
            )
            r.raise_for_status()
            content = r.json()["choices"][0]["message"]["content"]
            match = re.search(r'\[.*\]', content, re.DOTALL)
            if match:
                scores = json.loads(match.group())
                for item in scores:
                    i = item.get("index", -1)
                    if 0 <= i < len(batch):
                        batch[i]["score"]            = item.get("score", 50)
                        batch[i]["seniority"]        = item.get("seniority", "")
                        batch[i]["justification"]    = item.get("justification", "")
                        batch[i]["score_dimensions"] = {
                            "competences": item.get("competences", 50),
                            "seniorite":   item.get("seniorite",   50),
                            "localisation":item.get("localisation",50),
                            "qualite":     item.get("qualite",     50),
                        }
                log.info("llm_score: %d profils scorés", len(scores))
            else:
                log.warning("llm_score: regex no match — content: %s", content[:200])
                for p in batch:
                    p["score"] = p.get("score") or 50
    except Exception as e:
        log.warning("llm_score failed: %s", e)
        for p in batch:
            p["score"] = p.get("score") or 50

    profiles.sort(key=lambda p: p.get("score") or 0, reverse=True)
    return profiles


# ── Excel export ───────────────────────────────────────────────────────────────

def build_excel(profiles: list[dict], sheet_name: str = "Profils") -> str:
    rows = [
        {
            "Rang":          i + 1,
            "Nom":           p.get("name", ""),
            "Titre":         p.get("title", ""),
            "Entreprise":    p.get("company", ""),
            "Localisation":  p.get("location", ""),
            "Score":         p.get("score") or "",
            "Séniorité":     p.get("seniority", ""),
            "Justification": p.get("justification", ""),
            "Résumé":        p.get("summary", "")[:200],
            "LinkedIn":      p.get("linkedin_url", ""),
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
    """Point d'entrée Léo. Retourne {excel_b64, candidates, profiles_count}."""
    log.info("Léo démarrage — %s / %s", brief.get("titre_poste"), brief.get("localisation"))

    profiles = await search_profiles(brief)
    profiles = pre_filter(profiles, brief)
    profiles = await llm_score(brief, profiles)

    candidates = [
        {
            "linkedin_url":        p["linkedin_url"],
            "name_estimated":      p["name"],
            "title_estimated":     p["title"],
            "company":             p["company"],
            "keywords":            p.get("skills", []),
            "relevance_score":     p.get("score"),
            "score_justification": p.get("justification", ""),
            "score_dimensions":    p.get("score_dimensions"),
            "seniority_level":     p.get("seniority", ""),
            "source":              "leo",
        }
        for p in profiles
    ]

    log.info("Léo terminé — %d profils", len(profiles))
    return {
        "excel_b64":      build_excel(profiles),
        "candidates":     candidates,
        "profiles_count": len(profiles),
    }
