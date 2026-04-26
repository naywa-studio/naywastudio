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
    pre_filter,
    build_excel,
    coerce_keywords,
    normalize_location,
    detect_seniority,
)

log = logging.getLogger("nawa-agent.nora")

OPENROUTER_KEY = os.environ["OPENROUTER_API_KEY"]
MODEL          = "openai/gpt-4o-mini"
LLM_TIMEOUT    = 50.0

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
    """
    Scoring riche multi-dimensionnel (4 axes + justification) — identique à Léo
    mais avec génération de messages personnalisés en prime.
    Utilise toutes les données disponibles : expérience, compétences, résumé, etc.
    """
    if not profiles:
        return profiles

    titre     = brief.get("titre_poste", "")
    loc       = brief.get("localisation", "")
    mots      = coerce_keywords(brief.get("mots_cles", []))
    extra     = brief.get("extra_keywords", [])
    all_kw    = (mots + extra)[:12]
    criteres  = brief.get("criteres", "")

    batch = profiles[:30]

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
        f"Compétences requises : {', '.join(all_kw)}\n\n"
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
        r = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENROUTER_KEY}"},
            json={
                "model": MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": 2000,
            },
            timeout=LLM_TIMEOUT,
        )
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"]
        log.info("score_profiles raw (first 300): %s", content[:300])
        match = re.search(r'\[.*\]', content, re.DOTALL)
        if match:
            results = json.loads(match.group())
            log.info("score_profiles parsed %d scores", len(results))
            for item in results:
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
            log.info("score_profiles — top score: %s", batch[0].get("score") if batch else "n/a")
        else:
            log.warning("score_profiles regex no match — content: %s", content[:300])
            for p in batch:
                p["score"] = p.get("score") or 50
    except Exception as e:
        log.warning("score_profiles failed: %s", e, exc_info=True)
        for p in batch:
            p["score"] = p.get("score") or 50

    profiles.sort(key=lambda p: p.get("score") or 0, reverse=True)
    return profiles


# ── Message generation ─────────────────────────────────────────────────────────

async def generate_message(brief: dict, profile: dict, client: httpx.AsyncClient) -> str:
    """Génère un message de prise de contact personnalisé et contextualisé."""
    ton      = brief.get("ton", "professionnel")
    titre    = brief.get("titre_poste", "")
    criteres = brief.get("criteres", "")

    # Enrichissement avec données de qualité
    exp_summary  = profile.get("experience_summary", "")
    years_exp    = profile.get("years_experience", 0)
    skills_str   = ", ".join(profile.get("skills", [])[:5])
    justification = profile.get("justification", "")

    context_line = ""
    if exp_summary:
        context_line = f"Expérience récente : {exp_summary[:120]}\n"
    elif skills_str:
        context_line = f"Compétences clés : {skills_str}\n"

    prompt = (
        f"Rédige un message de prise de contact LinkedIn court et personnalisé.\n"
        f"Ton : {ton}\n"
        f"Poste à pourvoir : {titre}\n"
        f"Profil ciblé : {profile.get('name', '')} — {profile.get('title', '')} "
        f"chez {profile.get('company', '')}\n"
        f"{context_line}"
        f"Critères clés : {criteres}\n\n"
        "Règles :\n"
        "- 3-4 phrases max\n"
        "- Mentionner le poste actuel ou une compétence spécifique du profil\n"
        "- Pas de formule générique type 'J'espère que vous allez bien'\n"
        "- Terminer par une invitation courte à échanger\n"
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
    avg_years = round(sum(p.get("years_experience") or 0 for p in top) / len(top)) if top else 0

    prompt = (
        f"Analyse de marché pour : {titre} à {city}\n"
        f"Profils trouvés : {len(profiles)}\n"
        f"Score moyen top 10 : {avg_score}/100\n"
        f"Ancienneté moyenne top 10 : {avg_years} ans\n"
        f"Entreprises représentées : {', '.join(companies)}\n"
        f"Titres fréquents : {', '.join(titles)}\n\n"
        "Rédige un rapport concis (150 mots max) avec :\n"
        "1. Disponibilité des profils sur le marché\n"
        "2. Profil type trouvé (ancienneté, provenance)\n"
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
                "Rang":           i + 1,
                "Nom":            p.get("name", ""),
                "Titre":          p.get("title", ""),
                "Entreprise":     p.get("company", ""),
                "Localisation":   p.get("location", ""),
                "Années exp.":    p.get("years_experience") or "",
                "Séniorité":      p.get("seniority", ""),
                "Score":          p.get("score") or "",
                "Justification":  p.get("justification", ""),
                "Compétences":    ", ".join(p.get("skills", [])[:8]),
                "Expérience":     p.get("experience_summary", ""),
                "LinkedIn":       p.get("linkedin_url", ""),
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

        # 2. Recherche Bing (même base que Léo + titres alternatifs)
        profiles = await search_profiles(enriched_brief)
        log.info("Bing : %d profils bruts", len(profiles))

        # 3. Pre-filter (géographique + pertinence minimale)
        profiles = pre_filter(profiles, enriched_brief)
        log.info("Après pre_filter : %d profils", len(profiles))

        # 4. Scoring multi-dimensionnel
        profiles = await score_profiles(enriched_brief, profiles, client)

        # 6. Shortlist
        n_short   = max(4, min(MAX_MESSAGES, int(len(profiles) * SHORTLIST_PCT)))
        shortlist = profiles[:n_short]
        longlist  = profiles[n_short:]

        # 7. Génération messages shortlist
        shortlist = await generate_messages_batch(enriched_brief, shortlist)

        # 8. Rapport marché
        report = await generate_report(enriched_brief, profiles, client)

    # 9. Excel 2 feuilles
    excel_b64 = build_nora_excel(shortlist, longlist)

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
            "message":           p.get("message", ""),
            "source":            "nora",
        }
        for p in shortlist + longlist
    ]

    log.info("Nora terminé — %d profils (%d shortlist)", len(profiles), len(shortlist))
    return {
        "excel_b64":       excel_b64,
        "candidates":      candidates,
        "profiles_count":  len(profiles),
        "research_report": report,
    }
