"""
Agent Nora (N2) — Sourcing + scoring LLM + messages personnalisés
Output : Excel 2 feuilles (Shortlist avec messages / Longlist)
"""

import os
import asyncio
import base64
import json
import logging
from io import BytesIO

import httpx
import pandas as pd

from agent_leo import build_queries, search_profiles, parse_profile, MAX_PROFILES

log = logging.getLogger("nawa-agent.nora")

OPENROUTER_KEY = os.environ["OPENROUTER_API_KEY"]
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "openai/gpt-4o-mini"

BATCH_SIZE = 10
SHORTLIST_MIN_SCORE = 60
MAX_MESSAGES = 20
LLM_TIMEOUT = 30.0


# ── Scoring ───────────────────────────────────────────────────────────────────

async def score_batch(
    profiles: list[dict], brief: dict, client: httpx.AsyncClient
) -> list[dict]:
    titre = brief.get("titre_poste", "")
    criteres = brief.get("criteres", "Expérience pertinente pour le poste")

    lines = "\n".join(
        f"{i + 1}. {p['name_estimated']} | {p['title_estimated']} "
        f"chez {p['company']} | {p['keywords']}"
        for i, p in enumerate(profiles)
    )

    prompt = (
        f"Tu es un expert recruteur. Évalue ces profils pour le poste : {titre}\n"
        f"Critères : {criteres}\n\n{lines}\n\n"
        "Pour chaque profil, donne un score 0-100 et une justification ≤15 mots.\n"
        'Réponds UNIQUEMENT avec du JSON valide :\n'
        '{"scores":[{"index":1,"score":80,"justification":"Profil très aligné, expérience confirmée"}]}'
    )

    try:
        resp = await client.post(
            OPENROUTER_URL,
            headers={"Authorization": f"Bearer {OPENROUTER_KEY}"},
            json={
                "model": MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            },
            timeout=LLM_TIMEOUT,
        )
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"]
        data = json.loads(raw)
        score_map = {item["index"]: item for item in data.get("scores", [])}
        for i, p in enumerate(profiles):
            s = score_map.get(i + 1, {})
            p["relevance_score"] = s.get("score")
            p["score_justification"] = s.get("justification", "")
    except Exception as exc:
        log.warning("Scoring batch failed: %s — fallback null", exc)
        for p in profiles:
            p.setdefault("relevance_score", None)
            p.setdefault("score_justification", "")

    return profiles


# ── Message generation ────────────────────────────────────────────────────────

async def generate_message(
    profile: dict, brief: dict, client: httpx.AsyncClient
) -> str:
    nom_recruteur = brief.get("nom_recruteur", "")
    titre_poste = brief.get("titre_poste", "")
    ton = brief.get("ton", "professionnel et chaleureux")

    prompt = (
        f"Rédige un message LinkedIn de prise de contact.\n"
        f"Recruteur : {nom_recruteur} | Poste : {titre_poste} | Ton : {ton}\n"
        f"Candidat : {profile['name_estimated']}, {profile['title_estimated']} "
        f"chez {profile['company']}\n\n"
        "Règles : 3-4 phrases max, personnalisé, pas de rémunération, "
        "invitation à échanger. Réponds uniquement avec le message."
    )

    try:
        resp = await client.post(
            OPENROUTER_URL,
            headers={"Authorization": f"Bearer {OPENROUTER_KEY}"},
            json={
                "model": MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.7,
            },
            timeout=LLM_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        log.warning("Message generation failed for %s: %s", profile.get("name_estimated"), exc)
        return ""


# ── Main entry point ──────────────────────────────────────────────────────────

async def run(brief: dict) -> str:
    """Return base64-encoded Excel file (2 sheets)."""
    queries = build_queries(brief)
    profiles: list[dict] = []
    seen: set[str] = set()

    # Step 1 — Search (same as Léo)
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

        log.info("Nora found %d profiles, starting scoring", len(profiles))

        # Step 2 — Score in batches
        batches = [
            profiles[i : i + BATCH_SIZE] for i in range(0, len(profiles), BATCH_SIZE)
        ]
        scored_batches = await asyncio.gather(
            *[score_batch(b, brief, client) for b in batches]
        )
        profiles = [p for batch in scored_batches for p in batch]

        # Step 3 — Generate messages for shortlist
        shortlist = sorted(
            [p for p in profiles if (p.get("relevance_score") or 0) >= SHORTLIST_MIN_SCORE],
            key=lambda p: p.get("relevance_score") or 0,
            reverse=True,
        )[:MAX_MESSAGES]

        log.info("Nora shortlist: %d profiles, generating messages", len(shortlist))
        messages = await asyncio.gather(
            *[generate_message(p, brief, client) for p in shortlist]
        )
        for p, msg in zip(shortlist, messages):
            p["message_draft"] = msg

    shortlist_ids = {p["linkedin_url"] for p in shortlist}

    # Step 4 — Build Excel (2 sheets)
    shortlist_cols = [
        "linkedin_url", "name_estimated", "title_estimated", "company",
        "keywords", "relevance_score", "score_justification", "message_draft",
    ]
    longlist_cols = [
        "linkedin_url", "name_estimated", "title_estimated", "company",
        "keywords", "relevance_score", "score_justification",
    ]

    df_short = pd.DataFrame(shortlist, columns=shortlist_cols)
    df_long = pd.DataFrame(
        [p for p in profiles if p["linkedin_url"] not in shortlist_ids],
        columns=longlist_cols,
    )

    buf = BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df_short.to_excel(writer, sheet_name="Shortlist", index=False)
        df_long.to_excel(writer, sheet_name="Longlist", index=False)
        for sheet_name, df in [("Shortlist", df_short), ("Longlist", df_long)]:
            ws = writer.sheets[sheet_name]
            for col in ws.columns:
                max_len = max(len(str(cell.value or "")) for cell in col)
                ws.column_dimensions[col[0].column_letter].width = min(max_len + 4, 80)

    log.info("Nora Excel generated — shortlist=%d longlist=%d", len(df_short), len(df_long))
    return base64.b64encode(buf.getvalue()).decode()
