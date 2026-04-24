"""
Agent Léo (N1) — LinkedIn sourcing via Apify harvestapi
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

APIFY_TOKEN    = os.environ["APIFY_TOKEN"]
OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY", "")

APIFY_ACTOR  = "harvestapi~linkedin-profile-search"
APIFY_BASE   = "https://api.apify.com/v2"

MAX_PROFILES = 40


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


# ── Experience helpers ─────────────────────────────────────────────────────────

def _get_year(date_field: object) -> int | None:
    """Extrait l'année depuis les formats Apify variés (int, dict, None)."""
    if not date_field:
        return None
    if isinstance(date_field, int):
        return date_field
    if isinstance(date_field, dict):
        return date_field.get("year")
    return None


def _extract_experience_summary(experience_raw: list, current_pos: list) -> str:
    """Formate les dernières expériences en string pour le LLM."""
    if not experience_raw:
        if current_pos:
            pos = current_pos[0]
            title = pos.get("title") or pos.get("position") or ""
            company = pos.get("companyName") or pos.get("company") or ""
            return f"{title} @ {company}".strip(" @")
        return ""

    entries = []
    for exp in experience_raw[:4]:
        title   = exp.get("title") or exp.get("position") or ""
        company = exp.get("companyName") or exp.get("company") or ""
        start   = _get_year(exp.get("startDate") or exp.get("start") or exp.get("startYear"))
        end     = _get_year(exp.get("endDate") or exp.get("end") or exp.get("endYear"))

        if title or company:
            entry = f"{title} @ {company}".strip(" @")
            if start:
                end_str = str(end) if end else "présent"
                entry += f" ({start}-{end_str})"
            entries.append(entry)

    return " | ".join(entries)


def _estimate_years_experience(experience_raw: list) -> int:
    """Estime le nombre d'années d'expérience totales."""
    if not experience_raw:
        return 0

    current_year = datetime.datetime.now().year
    total_months = 0

    for exp in experience_raw:
        start_year = _get_year(
            exp.get("startDate") or exp.get("start") or exp.get("startYear")
        )
        end_year = _get_year(
            exp.get("endDate") or exp.get("end") or exp.get("endYear")
        )
        if start_year:
            end = end_year or current_year
            total_months += max(0, (end - start_year) * 12)

    return min(round(total_months / 12), 40)


# ── Apify search ───────────────────────────────────────────────────────────────

async def _apify_search(query: str, client: httpx.AsyncClient) -> list[dict]:
    try:
        resp = await client.post(
            f"{APIFY_BASE}/acts/{APIFY_ACTOR}/run-sync-get-dataset-items",
            params={"token": APIFY_TOKEN, "timeout": 90, "memory": 512},
            json={
                "searchQuery": query,
                "profileScraperMode": "Full",
                "takePages": 1,
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

    queries: list[str] = []
    queries.append(f"{titre_court} {city}")
    if kw_str:
        queries.append(f"{titre_court} {kw_str} {city}")
    if seniority_kw:
        queries.append(f"{seniority_kw} {titre_court} {city}")
    if region:
        queries.append(f"{titre_court} {region}")
    queries.append(f"{titre_court} France")
    if kw_str:
        queries.append(f"{titre_court} {kw_str} France")

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


# ── Profile parsing — données complètes ───────────────────────────────────────

def parse_profile(raw: dict) -> dict:
    """Normalise un profil brut Apify vers le format Nawa — extrait toutes les données utiles."""
    # Nom
    first = raw.get("firstName") or ""
    last  = raw.get("lastName") or ""
    name  = f"{first} {last}".strip() or raw.get("fullName") or raw.get("name") or ""

    # Entreprise actuelle
    current_pos = raw.get("currentPosition") or []
    company = ""
    if current_pos and isinstance(current_pos, list):
        company = current_pos[0].get("companyName") or current_pos[0].get("company") or ""

    # Localisation (Apify renvoie un dict ou une string)
    loc_raw = raw.get("location") or ""
    if isinstance(loc_raw, dict):
        location    = loc_raw.get("linkedinText") or loc_raw.get("parsed", {}).get("city") or ""
        loc_country = (loc_raw.get("parsed") or {}).get("country") or ""
    else:
        location    = str(loc_raw)
        loc_country = "France" if "france" in str(loc_raw).lower() else ""

    # Compétences (Apify renvoie [{name: "..."}, ...])
    skills_raw = raw.get("skills") or raw.get("topSkills") or []
    if skills_raw and isinstance(skills_raw[0], dict):
        skills = [s.get("name", "") for s in skills_raw if s.get("name")]
    else:
        skills = [str(s) for s in skills_raw if s]

    # Expérience professionnelle
    experience_raw     = raw.get("experience") or []
    experience_summary = _extract_experience_summary(experience_raw, current_pos)
    years_experience   = _estimate_years_experience(experience_raw)

    # Résumé / about
    about = (raw.get("about") or raw.get("summary") or "")[:400]

    return {
        "source":             "linkedin",
        "linkedin_url":       raw.get("linkedinUrl") or raw.get("url") or "",
        "name":               name,
        "title":              raw.get("headline") or (current_pos[0].get("position") or current_pos[0].get("title") if current_pos else "") or "",
        "company":            company,
        "location":           location,
        "location_country":   loc_country,
        "summary":            about,
        "skills":             skills,
        "experience_summary": experience_summary,
        "years_experience":   years_experience,
        "score":              None,
    }


# ── Pre-filter ─────────────────────────────────────────────────────────────────

def pre_filter(profiles: list[dict], brief: dict) -> list[dict]:
    """
    Filtre rapide (sans LLM) — élimine les profils clairement hors-sujet.
    Règles :
      1. Pays != France si mission en France → rejeté
      2. Aucun mot-clé requis trouvé dans titre + skills + about + exp → rejeté
    Intentionnellement peu agressif : mieux vaut garder un faux positif
    que rejeter un vrai positif rare.
    """
    keywords    = [k.lower() for k in coerce_keywords(brief.get("mots_cles", []))]
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
                (p.get("summary") or "").lower(),
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
    Scoring riche : utilise titre, compétences, expérience complète, résumé.
    Retourne 4 dimensions + justification pour chaque profil.
    """
    if not OPENROUTER_KEY or not profiles:
        return profiles

    batch    = profiles[:30]
    titre    = brief.get("titre_poste", "")
    loc      = brief.get("localisation", "")
    criteres = brief.get("criteres", "")
    keywords = coerce_keywords(brief.get("mots_cles", []))

    # Construction des profils enrichis pour le LLM
    profiles_for_llm = []
    for i, p in enumerate(batch):
        profiles_for_llm.append({
            "index":       i,
            "titre":       p["title"],
            "entreprise":  p["company"],
            "lieu":        p["location"],
            "competences": p.get("skills", [])[:12],
            "experience":  p.get("experience_summary", ""),
            "annees_exp":  p.get("years_experience", 0),
            "resume":      p.get("summary", "")[:200],
        })

    prompt = (
        f"Expert recruteur, évalue ces profils LinkedIn pour : « {titre} » à {loc}.\n"
        f"Critères client : {criteres}\n"
        f"Compétences requises : {', '.join(keywords[:10])}\n\n"
        "Pour chaque profil, retourne UNIQUEMENT ce JSON array :\n"
        '[{"index":0,"score":85,"competences":90,"seniorite":80,"localisation":100,"qualite":75,'
        '"seniority":"Senior","justification":"8 ans chez Total, skills API618 ✓, Paris ✓"},...]\n\n'
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
                log.info("llm_score: %d profils scorés, top score: %s",
                         len(scores), batch[0].get("score") if batch else "n/a")
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
            "Rang":           i + 1,
            "Nom":            p.get("name", ""),
            "Titre":          p.get("title", ""),
            "Entreprise":     p.get("company", ""),
            "Localisation":   p.get("location", ""),
            "Années exp.":    p.get("years_experience") or "",
            "Score":          p.get("score") or "",
            "Justification":  p.get("justification", ""),
            "Compétences":    ", ".join(p.get("skills", [])[:8]),
            "Expérience":     p.get("experience_summary", ""),
            "LinkedIn":       p.get("linkedin_url", ""),
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

    raw = await search_profiles(brief)
    log.info("Apify : %d profils bruts", len(raw))

    profiles = [parse_profile(r) for r in raw if r.get("linkedinUrl") or r.get("url")]
    profiles = pre_filter(profiles, brief)
    profiles = await llm_score(brief, profiles)

    candidates = [
        {
            "linkedin_url":      p["linkedin_url"],
            "name_estimated":    p["name"],
            "title_estimated":   p["title"],
            "company":           p["company"],
            "keywords":          p.get("skills", []),
            "relevance_score":   p.get("score"),
            "score_justification": p.get("justification", ""),
            "score_dimensions":  p.get("score_dimensions"),
            "seniority_level":   p.get("seniority", ""),
            "source":            "leo",
        }
        for p in profiles
    ]

    log.info("Léo terminé — %d profils", len(profiles))
    return {
        "excel_b64":      build_excel(profiles),
        "candidates":     candidates,
        "profiles_count": len(profiles),
    }
