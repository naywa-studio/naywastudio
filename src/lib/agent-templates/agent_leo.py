"""
Agent Léo (N1) — LinkedIn sourcing via Chrome Extension (Google Search)
L'extension ouvre des onglets Google en background → extrait les URLs LinkedIn
→ les renvoie au VPS via Vercel. Léo attend les résultats puis score avec LLM.
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

OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY", "")
SITE_URL       = os.environ.get("NEXT_PUBLIC_SITE_URL", "").rstrip("/")
AGENT_SECRET   = os.environ.get("NAWA_AGENT_SECRET", "")

MAX_PROFILES       = 40
POLL_INTERVAL_S    = 8     # secondes entre chaque poll
POLL_TIMEOUT_S     = 360   # 6 minutes max d'attente (l'extension a 8 min de timeout)


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


# ── Query builder ──────────────────────────────────────────────────────────────

def build_queries(brief: dict) -> list[str]:
    """Construit les requêtes Google pour l'extension Chrome."""
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

    # Dédupliquer tout en conservant l'ordre
    seen: set[str] = set()
    unique: list[str] = []
    for q in queries:
        if q not in seen:
            seen.add(q)
            unique.append(q)

    return unique


# ── Extension-based search ─────────────────────────────────────────────────────

async def create_search_session(user_id: str, mission_id: str | None, queries: list[str]) -> str | None:
    """Crée une session de recherche sur Vercel. Retourne le session_id."""
    if not SITE_URL or not AGENT_SECRET:
        log.error("SITE_URL ou AGENT_SECRET manquant — impossible de créer une session de recherche")
        return None

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                f"{SITE_URL}/api/extension/search-session",
                headers={"x-nawa-secret": AGENT_SECRET, "Content-Type": "application/json"},
                json={"user_id": user_id, "mission_id": mission_id, "queries": queries},
            )
            if not r.is_success:
                log.error("Erreur création session: %s — %s", r.status_code, r.text[:200])
                return None
            data = r.json()
            session_id = data.get("session_id")
            log.info("Session de recherche créée : %s (%d requêtes)", session_id, len(queries))
            return session_id
    except Exception as e:
        log.error("Exception création session: %s", e)
        return None


async def poll_search_results(session_id: str) -> list[dict]:
    """
    Attend que l'extension Chrome complète les recherches Google et retourne les résultats.
    Timeout : POLL_TIMEOUT_S secondes.
    """
    log.info("Attente résultats extension (session %s) — timeout %ds", session_id, POLL_TIMEOUT_S)
    elapsed = 0

    async with httpx.AsyncClient(timeout=10.0) as client:
        while elapsed < POLL_TIMEOUT_S:
            await asyncio.sleep(POLL_INTERVAL_S)
            elapsed += POLL_INTERVAL_S

            try:
                r = await client.get(
                    f"{SITE_URL}/api/extension/search-session",
                    headers={"x-nawa-secret": AGENT_SECRET},
                    params={"id": session_id},
                )
                if not r.is_success:
                    log.warning("Poll session %s: HTTP %s", session_id, r.status_code)
                    continue

                data   = r.json()
                status = data.get("status", "pending")
                results = data.get("results", [])

                log.info("Poll session %s [%ds]: status=%s, résultats=%d",
                         session_id, elapsed, status, len(results))

                if status == "ready":
                    return results
                if status == "timeout":
                    log.warning("Session %s expirée — %d résultats partiels", session_id, len(results))
                    return results  # Retourner ce qu'on a quand même

            except Exception as e:
                log.warning("Exception poll session %s: %s", session_id, e)

    log.warning("Timeout côté agent (%ds) — session %s", POLL_TIMEOUT_S, session_id)
    return []


# ── Parse Google result → profil Nawa ──────────────────────────────────────────

def parse_google_result(item: dict) -> dict | None:
    """
    Convertit un résultat Google (envoyé par l'extension) en profil Nawa.
    Format : display_title = "Marie Dupont - Développeur React | LinkedIn"
             snippet       = "Développeur React Senior chez Doctolib · Paris · …"
             linkedin_url  = "https://www.linkedin.com/in/marie-dupont"
    """
    url = (item.get("linkedin_url") or "").strip()
    if not re.match(r'https?://([a-z]{2}\.)?linkedin\.com/in/[^/?#\s]+/?$', url):
        return None

    display_title = item.get("display_title", "")
    snippet       = item.get("snippet", "")

    # "Marie Dupont - Développeur React | LinkedIn" → nom + titre
    clean = re.sub(r'\s*[|]\s*LinkedIn.*$', '', display_title, flags=re.IGNORECASE).strip()
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
        "skills":             [],
        "experience_summary": "",
        "years_experience":   0,
        "score":              None,
    }


async def search_profiles(brief: dict) -> list[dict]:
    """
    Recherche LinkedIn via l'extension Chrome.
    1. Construit les requêtes Google
    2. Crée une session sur Vercel
    3. Attend que l'extension renvoie les URLs
    4. Déduplique et retourne les profils
    """
    user_id    = brief.get("__user_id", "")
    mission_id = brief.get("__mission_id")

    if not user_id:
        log.error("__user_id absent du brief — impossible de créer une session extension")
        return []

    queries = build_queries(brief)
    log.info("Léo → %d requêtes Google via extension", len(queries))

    session_id = await create_search_session(user_id, mission_id, queries)
    if not session_id:
        return []

    raw_results = await poll_search_results(session_id)
    if not raw_results:
        log.warning("Aucun résultat reçu de l'extension")
        return []

    # Dédupliquer et parser
    seen_urls:  set[str] = set()
    seen_names: set[str] = set()
    profiles: list[dict] = []

    for item in raw_results:
        profile = parse_google_result(item)
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
        profiles.append(profile)

        if len(profiles) >= MAX_PROFILES:
            break

    log.info("Extension → %d profils bruts, %d après déduplication", len(raw_results), len(profiles))
    return profiles


# ── Pre-filter ─────────────────────────────────────────────────────────────────

def pre_filter(profiles: list[dict], brief: dict) -> list[dict]:
    """Filtre rapide (sans LLM) — élimine les profils clairement hors-sujet."""
    keywords     = [k.lower() for k in coerce_keywords(brief.get("mots_cles", []))]
    localisation = brief.get("localisation", "france").lower()
    is_national  = localisation in ("france", "remote", "télétravail", "partout")

    filtered = []
    for p in profiles:
        if not p.get("linkedin_url"):
            continue

        country = (p.get("location_country") or "").lower()
        if not is_national and country and "france" not in country and country not in ("fr", ""):
            continue

        # Léo n'a pas encore les skills (c'est Nora qui les enrichit) — filtre léger
        if keywords:
            text = " ".join([
                (p.get("title") or "").lower(),
                (p.get("summary") or "").lower(),
                (p.get("experience_summary") or "").lower(),
            ])
            # Accepter si au moins 1 keyword présent (ou pas de texte du tout = nouveau profil)
            if text.strip() and not any(kw in text for kw in keywords):
                continue

        filtered.append(p)

    log.info("pre_filter: %d → %d profils conservés", len(profiles), len(filtered))
    return filtered


# ── LLM scoring multi-dimensionnel ────────────────────────────────────────────

async def llm_score(brief: dict, profiles: list[dict]) -> list[dict]:
    """Scoring LLM sur titre + snippet Google. Retourne 4 dimensions + justification."""
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
            "resume":     p.get("summary", "")[:250],
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
        "Note: ces profils viennent de résultats Google — les données sont partielles.\n"
        "Base ton évaluation sur le titre et le résumé disponibles.\n\n"
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
    """
    Point d'entrée Léo. Retourne {excel_b64, candidates, profiles_count}.
    Le brief doit contenir __user_id (ajouté par run/route.ts).
    """
    log.info("Léo démarrage — %s / %s (user: %s)",
             brief.get("titre_poste"), brief.get("localisation"),
             brief.get("__user_id", "???"))

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
