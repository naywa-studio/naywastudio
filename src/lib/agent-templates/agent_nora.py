"""
Agent Nora (N2) — Sourcing LinkedIn + scoring multi-dimensionnel + messages personnalisés
Utilise Apify via agent_leo pour la recherche. Ajoute expansion sémantique + shortlist.
Output : { excel_b64: str, candidates: list[dict], research_report: str }
"""

import os
import re
import json
import asyncio
import base64
import logging
from io import BytesIO

import httpx
import pandas as pd

from agent_leo import (
    search_profiles,
    parse_profile,
    build_excel,
    coerce_keywords,
    normalize_location,
    detect_seniority,
)

log = logging.getLogger("nawa-agent.nora")

OPENROUTER_KEY = os.environ["OPENROUTER_API_KEY"]
MODEL          = "openai/gpt-4o-mini"
LLM_TIMEOUT    = 35.0

MAX_PROFILES  = 40
MAX_MESSAGES  = 20
SHORTLIST_PCT = 0.35   # top 35% → shortlist avec messages


# ── Brief expansion ────────────────────────────────────────────────────────────

async def expand_brief(brief: dict, client: httpx.AsyncClient) -> dict:
    """Enrichit le brief avec des titres alternatifs et mots-clés connexes via LLM."""
    titre    = brief.get("titre_poste", "")
    mots     = coerce_keywords(brief.get("mots_cles", []))
    criteres = brief.get("criteres", "")

    prompt = (
        f"Tu es expert en sourcing LinkedIn. Poste : « {titre} »\n"
        f"Critères : {criteres}\n"
        f"Mots-clés existants : {', '.join(mots)}\n\n"
        "Génère en JSON :\n"
        "- alt_titles : 4 intitulés courts (1-3 mots) tels qu'ils apparaissent sur LinkedIn. "
        "Inclure 2 variantes anglaises si poste technique.\n"
        "  Valides : 'Rotating Equipment Engineer', 'Reliability Engineer', 'Ingénieur Fiabilité'\n"
        "  Invalides (trop longs) : 'Expert en maintenance des équipements de compression'\n"
        "- extra_keywords : 4 compétences connexes NON présentes dans les mots-clés existants. "
        "Inclure des termes anglais si domaine technique.\n"
        '{"alt_titles":["..."],"extra_keywords":["..."]}'
    )

    try:
        r = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENROUTER_KEY}"},
            json={
                "model": MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.4,
                "max_tokens": 200,
            },
            timeout=LLM_TIMEOUT,
        )
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"]
        match = re.search(r'\{.*\}', content, re.DOTALL)
        if match:
            data = json.loads(match.group())
            return {
                **brief,
                "alt_titles":     data.get("alt_titles", []),
                "extra_keywords": data.get("extra_keywords", []),
            }
    except Exception as e:
        log.warning("expand_brief failed: %s", e)

    return brief


# ── Multi-dimensional scoring ──────────────────────────────────────────────────

async def score_profiles(brief: dict, profiles: list[dict], client: httpx.AsyncClient) -> list[dict]:
    """Score multi-dimensionnel : titre (40) + localisation (20) + compétences (30) + profil (10)."""
    if not profiles:
        return profiles

    titre     = brief.get("titre_poste", "")
    mots      = coerce_keywords(brief.get("mots_cles", []))
    extra     = brief.get("extra_keywords", [])
    all_kw    = mots + extra
    city, _   = normalize_location(brief.get("localisation", ""))
    criteres  = brief.get("criteres", "")

    batch = profiles[:30]
    prompt = (
        f"Score ces profils LinkedIn pour : « {titre} » à {city}.\n"
        f"Critères : {criteres}\n"
        f"Mots-clés attendus : {', '.join(all_kw[:8])}\n\n"
        "Pour chaque profil, retourne un score global 0-100 et une estimation de séniorité.\n"
        "UNIQUEMENT ce JSON : [{\"index\": 0, \"score\": 85, \"seniority\": \"Senior\"}, ...]\n\n"
        "Profils :\n"
        + json.dumps(
            [{"index": i, "title": p["title"], "company": p["company"],
              "location": p["location"], "summary": p.get("summary", "")[:100]}
             for i, p in enumerate(batch)],
            ensure_ascii=False
        )
    )

    try:
        r = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENROUTER_KEY}"},
            json={
                "model": MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": 600,
            },
            timeout=LLM_TIMEOUT,
        )
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"]
        match = re.search(r'\[.*?\]', content, re.DOTALL)
        if match:
            results = json.loads(match.group())
            for item in results:
                i = item.get("index", -1)
                if 0 <= i < len(batch):
                    batch[i]["score"]    = item.get("score", 50)
                    batch[i]["seniority"] = item.get("seniority", "")
    except Exception as e:
        log.warning("score_profiles failed: %s", e)
        for p in batch:
            p.setdefault("score", 50)

    profiles.sort(key=lambda p: p.get("score") or 0, reverse=True)
    return profiles


# ── Message generation ─────────────────────────────────────────────────────────

async def generate_message(brief: dict, profile: dict, client: httpx.AsyncClient) -> str:
    """Génère un message de prise de contact personnalisé."""
    ton      = brief.get("ton", "professionnel")
    titre    = brief.get("titre_poste", "")
    criteres = brief.get("criteres", "")

    prompt = (
        f"Rédige un message de prise de contact LinkedIn court et personnalisé.\n"
        f"Ton : {ton}\n"
        f"Poste à pourvoir : {titre}\n"
        f"Profil ciblé : {profile.get('name', '')} — {profile.get('title', '')} "
        f"chez {profile.get('company', '')}\n"
        f"Critères clés : {criteres}\n\n"
        "Règles :\n"
        "- 3-4 phrases max\n"
        "- Personnalisé (mention du titre/entreprise actuelle)\n"
        "- Pas de formule générique type 'J'espère que vous allez bien'\n"
        "- Terminer par une invitation à échanger\n"
        "Retourne UNIQUEMENT le message, sans guillemets ni explication."
    )

    try:
        r = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENROUTER_KEY}"},
            json={
                "model": MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.7,
                "max_tokens": 200,
            },
            timeout=LLM_TIMEOUT,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        log.warning("generate_message failed: %s", e)
        return ""


async def generate_messages_batch(brief: dict, profiles: list[dict]) -> list[dict]:
    """Génère des messages pour la shortlist en parallèle (max 5 à la fois)."""
    sem = asyncio.Semaphore(5)

    async def _gen(profile: dict, client: httpx.AsyncClient) -> str:
        async with sem:
            return await generate_message(brief, profile, client)

    async with httpx.AsyncClient() as client:
        tasks = [_gen(p, client) for p in profiles]
        messages = await asyncio.gather(*tasks)

    for profile, msg in zip(profiles, messages):
        profile["message"] = msg

    return profiles


# ── Research report ────────────────────────────────────────────────────────────

async def generate_report(brief: dict, profiles: list[dict], client: httpx.AsyncClient) -> str:
    """Génère un rapport d'analyse marché rapide."""
    titre    = brief.get("titre_poste", "")
    city, _  = normalize_location(brief.get("localisation", ""))
    top      = profiles[:10]

    companies = list({p["company"] for p in top if p.get("company")})[:5]
    titles    = list({p["title"] for p in top if p.get("title")})[:5]
    avg_score = round(sum(p.get("score") or 0 for p in top) / len(top)) if top else 0

    prompt = (
        f"Analyse de marché pour : {titre} à {city}\n"
        f"Profils trouvés : {len(profiles)}\n"
        f"Score moyen top 10 : {avg_score}/100\n"
        f"Entreprises représentées : {', '.join(companies)}\n"
        f"Titres fréquents : {', '.join(titles)}\n\n"
        "Rédige un rapport concis (150 mots max) avec :\n"
        "1. Disponibilité des profils sur le marché\n"
        "2. Profil type trouvé\n"
        "3. 1-2 recommandations pour optimiser la recherche\n"
        "Format markdown simple."
    )

    try:
        r = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENROUTER_KEY}"},
            json={
                "model": MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.5,
                "max_tokens": 300,
            },
            timeout=LLM_TIMEOUT,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        log.warning("generate_report failed: %s", e)
        return ""


# ── Excel 2 feuilles ───────────────────────────────────────────────────────────

def build_nora_excel(shortlist: list[dict], longlist: list[dict]) -> str:
    def _rows(profiles: list[dict], with_message: bool) -> list[dict]:
        rows = []
        for i, p in enumerate(profiles):
            row = {
                "Rang":         i + 1,
                "Nom":          p.get("name", ""),
                "Titre":        p.get("title", ""),
                "Entreprise":   p.get("company", ""),
                "Localisation": p.get("location", ""),
                "Séniorité":    p.get("seniority", ""),
                "Score":        p.get("score") or "",
                "LinkedIn":     p.get("linkedin_url", ""),
            }
            if with_message:
                row["Message"] = p.get("message", "")
            rows.append(row)
        return rows

    buf = BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        # Shortlist
        df_short = pd.DataFrame(_rows(shortlist, with_message=True))
        df_short.to_excel(writer, index=False, sheet_name="Shortlist")
        ws = writer.sheets["Shortlist"]
        for col in ws.columns:
            w = max(len(str(c.value or "")) for c in col)
            ws.column_dimensions[col[0].column_letter].width = min(w + 2, 80)

        # Longlist
        df_long = pd.DataFrame(_rows(longlist, with_message=False))
        df_long.to_excel(writer, index=False, sheet_name="Longlist")
        ws2 = writer.sheets["Longlist"]
        for col in ws2.columns:
            w = max(len(str(c.value or "")) for c in col)
            ws2.column_dimensions[col[0].column_letter].width = min(w + 2, 60)

    return base64.b64encode(buf.getvalue()).decode()


# ── Entry point ────────────────────────────────────────────────────────────────

async def run(brief: dict) -> dict:
    """Point d'entrée principal Nora."""
    log.info("Nora démarrage — %s / %s", brief.get("titre_poste"), brief.get("localisation"))

    async with httpx.AsyncClient() as client:
        # 1. Expansion sémantique du brief
        enriched_brief = await expand_brief(brief, client)
        log.info("Brief enrichi — alt_titles: %s", enriched_brief.get("alt_titles", []))

        # 2. Recherche Apify (même base que Léo)
        raw = await search_profiles(enriched_brief)
        log.info("Apify : %d profils bruts", len(raw))

        # 3. Parse
        profiles = [parse_profile(r) for r in raw if r.get("linkedinUrl") or r.get("url")]

        # 4. Scoring multi-dimensionnel
        profiles = await score_profiles(enriched_brief, profiles, client)

        # 5. Shortlist
        n_short   = max(4, min(MAX_MESSAGES, int(len(profiles) * SHORTLIST_PCT)))
        shortlist = profiles[:n_short]
        longlist  = profiles[n_short:]

        # 6. Génération messages shortlist
        shortlist = await generate_messages_batch(enriched_brief, shortlist)

        # 7. Rapport marché
        report = await generate_report(enriched_brief, profiles, client)

    # 8. Excel 2 feuilles
    excel_b64 = build_nora_excel(shortlist, longlist)

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
            "source":          "nora",
        }
        for p in profiles
    ]

    log.info("Nora terminé — %d profils (%d shortlist)", len(profiles), len(shortlist))
    return {
        "excel_b64":       excel_b64,
        "candidates":      candidates,
        "profiles_count":  len(profiles),
        "research_report": report,
    }
