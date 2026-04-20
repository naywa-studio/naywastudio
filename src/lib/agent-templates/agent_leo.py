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


def fuzzy_name_match(a: str, b: str, threshold: float = 0.85) -> bool:
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


# ── Short title extractor ──────────────────────────────────────────────────────

def short_title(titre: str) -> str:
    """Extract core job title: first 3 words, stopping at specialization markers."""
    stop_words = ["spécialisé", "spécialiste", "en charge", "responsable de", "expert en",
                  "dédié", "chargé", "orienté", "axé", "focalisé", "dans", "pour", "chez"]
    lower = titre.lower()
    for sw in stop_words:
        idx = lower.find(sw)
        if idx > 0:
            titre = titre[:idx].strip(" ,/-")
            break
    words = titre.split()
    return " ".join(words[:3]) if len(words) > 3 else titre


# ── Location normalization ────────────────────────────────────────────────────
#
# Strategy:
#   1. Map known suburbs/communes to their nearest major city (LinkedIn-friendly)
#   2. For ANY location that is NOT a recognized major city (known or mapped),
#      treat it as a suburb → always add broad fallback queries (region + no-loc)
#
# This handles the ~35 000 French communes we cannot enumerate explicitly.

_SUBURB_TO_CITY: dict[str, str] = {
    # ── Île-de-France (Paris area) ──────────────────────────────────────────
    "la garenne-colombes": "Paris",   "boulogne-billancourt": "Paris",
    "neuilly-sur-seine": "Paris",     "levallois-perret": "Paris",
    "issy-les-moulineaux": "Paris",   "courbevoie": "Paris",
    "nanterre": "Paris",              "puteaux": "Paris",
    "saint-denis": "Paris",           "vincennes": "Paris",
    "montreuil": "Paris",             "saint-cloud": "Paris",
    "rueil-malmaison": "Paris",       "massy": "Paris",
    "velizy-villacoublay": "Paris",   "versailles": "Paris",
    "cergy": "Paris",                 "croissy-sur-seine": "Paris",
    "gennevilliers": "Paris",         "colombes": "Paris",
    "argenteuil": "Paris",            "suresnes": "Paris",
    "chatou": "Paris",                "clamart": "Paris",
    "montrouge": "Paris",             "vanves": "Paris",
    "malakoff": "Paris",              "fontenay-sous-bois": "Paris",
    "saint-maur-des-fosses": "Paris", "creteil": "Paris",
    "vitry-sur-seine": "Paris",       "ivry-sur-seine": "Paris",
    "asnieres-sur-seine": "Paris",    "asnieres": "Paris",
    "aubervilliers": "Paris",         "pantin": "Paris",
    "noisy-le-grand": "Paris",        "bondy": "Paris",
    "clichy": "Paris",                "antony": "Paris",
    "champigny-sur-marne": "Paris",   "aulnay-sous-bois": "Paris",
    "villemomble": "Paris",           "bagnolet": "Paris",
    "maisons-alfort": "Paris",        "alfortville": "Paris",
    "charenton-le-pont": "Paris",     "nogent-sur-marne": "Paris",
    "joinville-le-pont": "Paris",     "saint-maure": "Paris",
    "saint-mande": "Paris",           "vincennes": "Paris",
    "epinay-sur-seine": "Paris",      "garges-les-gonesse": "Paris",
    "sarcelles": "Paris",             "villeneuve-la-garenne": "Paris",
    "asnières": "Paris",              "choisy-le-roi": "Paris",
    "thiais": "Paris",                "orly": "Paris",
    "rungis": "Paris",                "chevilly-larue": "Paris",
    "l-hay-les-roses": "Paris",       "villejuif": "Paris",
    "arcueil": "Paris",               "cachan": "Paris",
    "gentilly": "Paris",              "kremlin-bicetre": "Paris",
    "bagneux": "Paris",               "chatenay-malabry": "Paris",
    "chateauay": "Paris",             "montrouge": "Paris",
    "longjumeau": "Paris",            "les-ulis": "Paris",
    "palaiseau": "Paris",             "orsay": "Paris",
    "gif-sur-yvette": "Paris",        "corbeil-essonnes": "Paris",
    "evry": "Paris",                  "evry-courcouronnes": "Paris",
    "poissy": "Paris",                "saint-germain-en-laye": "Paris",
    "le-pecq": "Paris",               "meudon": "Paris",
    "sevres": "Paris",                "chaville": "Paris",
    "viroflay": "Paris",              "le-vesinet": "Paris",
    "carrières-sur-seine": "Paris",   "carrieres-sur-seine": "Paris",
    "houilles": "Paris",              "sartrouville": "Paris",
    "conflans-sainte-honorine": "Paris",
    "enghien-les-bains": "Paris",     "deuil-la-barre": "Paris",
    "montmorency": "Paris",           "ermont": "Paris",
    "pontoise": "Paris",              "cergy-pontoise": "Paris",
    "saint-ouen": "Paris",            "saint-ouen-sur-seine": "Paris",
    "la-courneuve": "Paris",          "pierrefitte-sur-seine": "Paris",
    "stains": "Paris",                "villetaneuse": "Paris",
    "dugny": "Paris",                 "le-bourget": "Paris",
    "drancy": "Paris",                "bobigny": "Paris",
    "livry-gargan": "Paris",          "clichy-sous-bois": "Paris",
    "montfermeil": "Paris",           "gagny": "Paris",
    "rosny-sous-bois": "Paris",       "neuilly-plaisance": "Paris",
    "neuilly-sur-marne": "Paris",     "chelles": "Paris",
    "villepinte": "Paris",            "tremblay-en-france": "Paris",
    "roissy-en-france": "Paris",      "goussainville": "Paris",
    "marly-le-roi": "Paris",          "le-chesnay": "Paris",
    "velizy": "Paris",                "buc": "Paris",
    "guyancourt": "Paris",            "trappes": "Paris",
    "montigny-le-bretonneux": "Paris","voisins-le-bretonneux": "Paris",
    "elancourt": "Paris",             "la-verriere": "Paris",
    "saclay": "Paris",                "bures-sur-yvette": "Paris",
    "savigny-sur-orge": "Paris",      "juvisy-sur-orge": "Paris",
    "athis-mons": "Paris",            "paray-vieille-poste": "Paris",
    "chilly-mazarin": "Paris",        "morangis": "Paris",
    "wissous": "Paris",               "fresnes": "Paris",
    "l-hay": "Paris",                 "hay-les-roses": "Paris",
    # ── Lyon area ────────────────────────────────────────────────────────────
    "villeurbanne": "Lyon",           "caluire-et-cuire": "Lyon",
    "ecully": "Lyon",                 "bron": "Lyon",
    "venissieux": "Lyon",             "oullins": "Lyon",
    "saint-fons": "Lyon",             "feyzin": "Lyon",
    "tassin-la-demi-lune": "Lyon",    "charbonnieres-les-bains": "Lyon",
    "chassieu": "Lyon",               "mions": "Lyon",
    "corbas": "Lyon",                 "saint-priest": "Lyon",
    "meyzieu": "Lyon",                "decines-charpieu": "Lyon",
    "vaulx-en-velin": "Lyon",        "rillieux-la-pape": "Lyon",
    "craponne": "Lyon",               "francheville": "Lyon",
    "sainte-foy-les-lyon": "Lyon",    "pierre-benite": "Lyon",
    # ── Bordeaux area ────────────────────────────────────────────────────────
    "merignac": "Bordeaux",           "pessac": "Bordeaux",
    "begles": "Bordeaux",             "talence": "Bordeaux",
    "gradignan": "Bordeaux",          "villenave-d-ornon": "Bordeaux",
    "le-bouscat": "Bordeaux",         "bruges": "Bordeaux",
    "eysines": "Bordeaux",            "lormont": "Bordeaux",
    "cenon": "Bordeaux",              "floirac": "Bordeaux",
    # ── Toulouse area ────────────────────────────────────────────────────────
    "blagnac": "Toulouse",            "colomiers": "Toulouse",
    "tournefeuille": "Toulouse",      "balma": "Toulouse",
    "castanet-tolosan": "Toulouse",   "labege": "Toulouse",
    "ramonville-saint-agne": "Toulouse", "muret": "Toulouse",
    # ── Lille area ───────────────────────────────────────────────────────────
    "roubaix": "Lille",               "tourcoing": "Lille",
    "villeneuve-d-ascq": "Lille",     "hem": "Lille",
    "wasquehal": "Lille",             "marcq-en-baroeul": "Lille",
    "mouvaux": "Lille",               "wattrelos": "Lille",
    "loos": "Lille",                  "lambersart": "Lille",
    "saint-andre-lez-lille": "Lille", "la-madeleine": "Lille",
    # ── Marseille area ───────────────────────────────────────────────────────
    "aubagne": "Marseille",           "aix-en-provence": "Marseille",
    "vitrolles": "Marseille",         "martigues": "Marseille",
    "salon-de-provence": "Marseille", "istres": "Marseille",
    "la-ciotat": "Marseille",         "cassis": "Marseille",
    "gardanne": "Marseille",          "bouc-bel-air": "Marseille",
    # ── Nantes area ──────────────────────────────────────────────────────────
    "saint-herblain": "Nantes",       "reze": "Nantes",
    "orvault": "Nantes",              "sainte-luce-sur-loire": "Nantes",
    "carquefou": "Nantes",            "vertou": "Nantes",
    "bouguenais": "Nantes",           "coueron": "Nantes",
    # ── Strasbourg area ──────────────────────────────────────────────────────
    "illkirch-graffenstaden": "Strasbourg", "schiltigheim": "Strasbourg",
    "ostwald": "Strasbourg",          "lingolsheim": "Strasbourg",
    "oberhausbergen": "Strasbourg",   "bischheim": "Strasbourg",
    # ── Nice / Côte d'Azur ───────────────────────────────────────────────────
    "antibes": "Nice",                "cannes": "Nice",
    "grasse": "Nice",                 "cagnes-sur-mer": "Nice",
    "saint-laurent-du-var": "Nice",   "menton": "Nice",
    "monaco": "Nice",                 "vallauris": "Nice",
    # ── Grenoble area ────────────────────────────────────────────────────────
    "echirolles": "Grenoble",         "saint-martin-d-heres": "Grenoble",
    "meylan": "Grenoble",             "fontaine": "Grenoble",
    "crolles": "Grenoble",            "montbonnot-saint-martin": "Grenoble",
}

# Cities whose names appear directly on LinkedIn profiles (no mapping needed)
_MAJOR_FRENCH_CITIES: frozenset[str] = frozenset({
    "paris", "lyon", "marseille", "toulouse", "bordeaux", "nantes",
    "lille", "strasbourg", "rennes", "nice", "montpellier", "grenoble",
    "tours", "nimes", "dijon", "angers", "reims", "le havre", "le mans",
    "saint-etienne", "toulon", "brest", "caen", "rouen", "metz", "nancy",
    "clermont-ferrand", "pau", "limoges", "perpignan", "besancon",
    "orleans", "mulhouse", "amiens", "dunkerque", "lorient", "quimper",
    "bayonne", "poitiers", "la rochelle", "annecy", "chambery",
    "valence", "saint-nazaire", "calais", "troyes", "ajaccio",
    "france", "remote", "télétravail", "teletravail", "full remote",
})

_CITY_TO_REGION: dict[str, str] = {
    "paris": "Île-de-France",         "lyon": "Auvergne-Rhône-Alpes",
    "marseille": "PACA",               "toulouse": "Occitanie",
    "bordeaux": "Nouvelle-Aquitaine",  "nantes": "Pays de la Loire",
    "lille": "Hauts-de-France",        "strasbourg": "Grand Est",
    "rennes": "Bretagne",              "nice": "Côte d'Azur",
    "montpellier": "Occitanie",        "grenoble": "Auvergne-Rhône-Alpes",
    "metz": "Grand Est",               "nancy": "Grand Est",
    "rouen": "Normandie",              "caen": "Normandie",
    "dijon": "Bourgogne-Franche-Comté","besancon": "Bourgogne-Franche-Comté",
    "clermont-ferrand": "Auvergne-Rhône-Alpes",
    "saint-etienne": "Auvergne-Rhône-Alpes",
    "angers": "Pays de la Loire",      "saint-nazaire": "Pays de la Loire",
    "poitiers": "Nouvelle-Aquitaine",  "la rochelle": "Nouvelle-Aquitaine",
    "bayonne": "Nouvelle-Aquitaine",   "pau": "Nouvelle-Aquitaine",
    "limoges": "Nouvelle-Aquitaine",   "bordeaux": "Nouvelle-Aquitaine",
    "perpignan": "Occitanie",          "nimes": "Occitanie",
    "toulon": "PACA",                  "nice": "PACA",
    "brest": "Bretagne",               "quimper": "Bretagne",
    "lorient": "Bretagne",             "rennes": "Bretagne",
    "reims": "Grand Est",              "mulhouse": "Grand Est",
    "amiens": "Hauts-de-France",       "dunkerque": "Hauts-de-France",
    "calais": "Hauts-de-France",       "tours": "Centre-Val de Loire",
    "orleans": "Centre-Val de Loire",  "annecy": "Auvergne-Rhône-Alpes",
    "chambery": "Auvergne-Rhône-Alpes","valence": "Auvergne-Rhône-Alpes",
}


def _ascii_key(s: str) -> str:
    """Lowercase + strip accents + collapse spaces/apostrophes to hyphens."""
    nfkd = unicodedata.normalize("NFD", s.lower().strip())
    out  = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"[\s'\u2019]+", "-", out).strip("-")


def normalize_location(loc: str) -> tuple[str, str, str, bool]:
    """Return (original, city_for_queries, region, is_major_city).

    - Maps suburbs to their nearest major city.
    - is_major_city = False  → location is a suburb or unknown commune.
      build_queries will add region + no-location fallback queries automatically.
    """
    if not loc:
        return "", "", "", True

    loc_key = loc.lower().strip()
    asc_key = _ascii_key(loc)

    # 1. Direct or ASCII-normalised lookup in the suburb map
    city = _SUBURB_TO_CITY.get(loc_key, _SUBURB_TO_CITY.get(asc_key, ""))

    if not city:
        # 2. Check if the location IS already a major city
        if loc_key in _MAJOR_FRENCH_CITIES or asc_key in _MAJOR_FRENCH_CITIES:
            city = loc.strip()
        else:
            # 3. Unknown commune — use as-is but flag as non-major
            city = loc.strip()

    region = _CITY_TO_REGION.get(city.lower(), "")
    is_major = city.lower() in _MAJOR_FRENCH_CITIES or _ascii_key(city) in _MAJOR_FRENCH_CITIES

    return loc, city, region, is_major


# ── English keyword expansion for technical/industrial domains ─────────────────

# Maps French technical terms to English equivalents used on LinkedIn profiles.
# Many French engineers write their profiles in English (especially oil & gas, IT).
_FR_TO_EN: dict[str, str] = {
    "équipements rotatifs":    "rotating equipment",
    "equipements rotatifs":    "rotating equipment",
    "compression":             "compression",
    "compresseurs":            "compressor",
    "turbines":                "turbine",
    "pompes":                  "pump",
    "fiabilité":               "reliability",
    "fiabilite":               "reliability",
    "maintenance industrielle":"industrial maintenance",
    "génie mécanique":         "mechanical engineer",
    "genie mecanique":         "mechanical engineer",
    "génie civil":             "civil engineer",
    "génie électrique":        "electrical engineer",
    "automatisme":             "automation",
    "instrumentation":         "instrumentation",
    "procédés":                "process engineer",
    "procedes":                "process engineer",
    "développeur":             "developer",
    "developpeur":             "developer",
    "cybersécurité":           "cybersecurity",
    "cybersecurite":           "cybersecurity",
    "intelligence artificielle": "artificial intelligence",
    "apprentissage automatique": "machine learning",
    "science des données":     "data science",
    "réseaux":                 "network engineer",
    "cloud":                   "cloud",
    "devops":                  "devops",
    "fullstack":               "full stack",
    "frontend":                "frontend",
    "backend":                 "backend",
    "logistique":              "supply chain",
    "ressources humaines":     "human resources",
    "finance":                 "finance",
    "comptabilité":            "accounting",
}

def detect_english_equivalents(titre: str, mots_list: list[str]) -> list[str]:
    """Return English equivalents for French technical terms (max 3).
    Only returns terms not already present in the brief keywords.
    """
    all_text = (titre + " " + " ".join(mots_list)).lower()
    nfkd     = unicodedata.normalize("NFD", all_text)
    ascii_t  = "".join(c for c in nfkd if not unicodedata.combining(c))

    found: list[str] = []
    for fr_term, en_term in _FR_TO_EN.items():
        nfkd_fr  = unicodedata.normalize("NFD", fr_term)
        ascii_fr = "".join(c for c in nfkd_fr if not unicodedata.combining(c))
        if (fr_term in all_text or ascii_fr in ascii_t) and en_term not in all_text:
            found.append(en_term)
        if len(found) >= 3:
            break
    return found


# ── Query builder ──────────────────────────────────────────────────────────────

def build_queries(brief: dict) -> tuple[list[str], list[str], list[str]]:
    """Return (linkedin_queries, malt_queries, apec_queries).

    Key improvements:
    - Location is normalized: suburbs → nearest major city (e.g. La Garenne-Colombes → Paris)
    - English-language queries added automatically for technical/industrial roles
    - Region-level queries (Île-de-France) for broader coverage
    - Fallback no-location queries to widen the net
    """
    titre     = brief.get("titre_poste", "")
    mots_list = coerce_keywords(brief.get("mots_cles", []))
    mots      = " ".join(mots_list)
    loc_orig  = brief.get("localisation", "")
    seniority = detect_seniority(brief.get("criteres", ""))

    # ── Location normalization ─────────────────────────────────────────────
    _, city_loc, region, is_major = normalize_location(loc_orig)

    # Primary location query: use city (mapped from suburb if needed)
    loc_q     = f'"{city_loc}"' if city_loc else ""
    loc_q_reg = f'"{region}"'   if region   else ""

    # If location is a suburb/commune not recognized as a major city:
    # → the city_loc might still be too specific for LinkedIn snippets,
    #   so we ALWAYS include region + no-location queries prominently.
    is_suburb = loc_orig and not is_major

    half   = max(len(mots_list) // 2, 1)
    mots_a = " ".join(mots_list[:half])
    mots_b = " ".join(mots_list[half:]) if len(mots_list) > half else mots
    mots_c = " ".join(mots_list[:3]) if len(mots_list) >= 3 else mots

    titre_court = short_title(titre)

    # ── English equivalents (technical/industrial/IT profiles) ────────────
    en_terms = detect_english_equivalents(titre, mots_list)
    en_str_a = " ".join(en_terms[:2]) if en_terms else ""
    en_str_b = en_terms[0] if en_terms else ""

    # ── LinkedIn — primary source (ALL queries go here) ───────────────────
    linkedin_q: list[str] = []

    # Core queries with city location
    if loc_q:
        linkedin_q += [
            f'site:linkedin.com/in "{titre_court}" {mots_a} {loc_q}',
            f'site:linkedin.com/in "{titre_court}" {mots_b} {loc_q}',
            f'site:linkedin.com/in {mots_a} {loc_q}',
            f'site:linkedin.com/in "{titre_court}" {mots_c} {loc_q}',
            f'"{titre_court}" {mots_a} {loc_q} linkedin',
        ]

    # Region-level queries — ALWAYS included, especially critical for suburbs
    if loc_q_reg:
        linkedin_q += [
            f'site:linkedin.com/in "{titre_court}" {mots_a} {loc_q_reg}',
            f'site:fr.linkedin.com/in "{titre_court}" {mots_a} {loc_q_reg}',
            f'site:fr.linkedin.com/in {mots_a} {loc_q_reg}',
        ]

    # No-location queries — ALWAYS included (profiles without city in snippet)
    linkedin_q += [
        f'site:linkedin.com/in "{titre_court}" {mots}',
        f'site:fr.linkedin.com/in "{titre_court}" {mots_a}',
        f'site:fr.linkedin.com/in {mots_a} {mots_b}',
    ]

    # French sub-domain with city (best for French profiles)
    if loc_q:
        linkedin_q += [
            f'site:fr.linkedin.com/in "{titre_court}" {mots_a} {loc_q}',
            f'site:fr.linkedin.com/in "{titre_court}" {mots_b} {loc_q}',
            f'site:fr.linkedin.com/in {mots} {loc_q}',
            f'site:fr.linkedin.com/in "{titre_court}" {mots_c}',
        ]

    # Extra broad queries for suburbs: "France" fallback
    if is_suburb:
        linkedin_q += [
            f'site:fr.linkedin.com/in "{titre_court}" {mots_a} "France"',
            f'site:linkedin.com/in "{titre_court}" {mots_a} "France"',
        ]

    # ── English-language queries (critical for technical/industrial) ───────
    if en_str_a:
        en_loc = loc_q_reg if loc_q_reg else loc_q
        linkedin_q += [
            f'site:linkedin.com/in {en_str_a} {en_loc}',
            f'site:fr.linkedin.com/in {en_str_a} {en_loc}',
            f'site:linkedin.com/in "{titre_court}" {en_str_b} {en_loc}',
            f'site:linkedin.com/in {en_str_a}',  # no-loc for EN profiles
        ]

    # ── Seniority-specific queries ─────────────────────────────────────────
    sen_loc = loc_q_reg if is_suburb else loc_q
    if seniority == "senior":
        linkedin_q += [
            f'site:fr.linkedin.com/in "{titre_court}" "Senior" {sen_loc}',
            f'site:fr.linkedin.com/in "{titre_court}" "Expert" {sen_loc}',
            f'site:fr.linkedin.com/in "{titre_court}" "Lead" {sen_loc}',
            f'site:linkedin.com/in "{titre_court}" "Head of" {sen_loc}',
        ]
    elif seniority == "junior":
        linkedin_q += [
            f'site:fr.linkedin.com/in "{titre_court}" "junior" {sen_loc}',
            f'site:fr.linkedin.com/in "{titre_court}" "alternance" {sen_loc}',
            f'site:linkedin.com/in "{titre_court}" "graduate" {sen_loc}',
        ]
    elif seniority == "confirmed":
        linkedin_q += [
            f'site:fr.linkedin.com/in "{titre_court}" "confirmé" {sen_loc}',
            f'site:fr.linkedin.com/in "{titre_court}" "expérimenté" {sen_loc}',
            f'site:linkedin.com/in "{titre_court}" "mid-level" {sen_loc}',
        ]

    # ── Malt — 1 query only (LinkedIn must dominate) ──────────────────────
    malt_q = [f'site:malt.fr "{titre_court}" {mots_a} {loc_q}']

    # APEC disabled — low quality
    apec_q: list[str] = []

    log.debug(
        "build_queries — loc '%s'→'%s' | is_major=%s | region='%s' | "
        "en_terms=%s | %d LinkedIn queries",
        loc_orig, city_loc, is_major, region, en_terms, len(linkedin_q),
    )
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
        "_snippet":       snippet,
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
        "_snippet":       snippet,
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
    seen_names: set[str]  = set()

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

        # 1. URL exact dedup
        if norm_url in seen_urls:
            return

        # 2. Name exact dedup (catches same name regardless of company)
        if norm_name and norm_name in seen_names:
            return

        # 3. Fuzzy name dedup (catches "Jean-Marie" vs "Jean Marie", etc)
        if norm_name and len(norm_name) >= 6:
            if any(fuzzy_name_match(norm_name, e) for e in seen_names):
                return

        seen_urls.add(norm_url)
        if norm_name:
            seen_names.add(norm_name)
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
