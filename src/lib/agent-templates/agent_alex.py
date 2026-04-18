"""
Agent Alex (N3) — Orchestrateur de recrutement

Alex hérite de toute la logique Nora (recherche multi-sources, scoring multi-dim, messages)
et ajoute :
  - Génération de messages de relance personnalisés (LLM)
  - Rapport pipeline par étape (analyse conversion)
  - Détection automatique des candidats sans réponse (> N jours)

Endpoints spécifiques ajoutés dans main.py :
  POST /followup             → génère un message de relance LLM
  GET  /missions/{id}/report → retourne un rapport pipeline
"""

import os
import json
import logging

import httpx

log = logging.getLogger("nawa-agent.alex")

OPENROUTER_KEY = os.environ["OPENROUTER_API_KEY"]
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL          = "openai/gpt-4o-mini"
LLM_TIMEOUT    = 35.0


# Alex runs Nora's pipeline for the core mission (search + score + messages)
async def run(brief: dict) -> dict:
    from agent_nora import run as nora_run
    return await nora_run(brief)


# ── Follow-up message generation ──────────────────────────────────────────────

async def generate_followup(
    candidate_name: str | None,
    original_message: str,
    days_since_contact: int,
    job_title: str,
    recruiter_name: str | None,
) -> str:
    """
    Generate a personalized follow-up message for a candidate who hasn't replied.
    Returns the draft string.
    """
    name      = candidate_name or "vous"
    recruiter = recruiter_name or "notre équipe"

    prompt = (
        f"Tu es recruteur expert. Tu as contacté {name} il y a {days_since_contact} jours "
        f"pour le poste de {job_title} sans obtenir de réponse.\n\n"
        f"Message initial envoyé :\n---\n{original_message}\n---\n\n"
        "Rédige un message de relance court, chaleureux et professionnel en français (4-6 lignes max). "
        "Le message doit :\n"
        "- Rappeler brièvement le contexte sans être répétitif\n"
        "- Montrer un intérêt sincère et non intrusif\n"
        "- Proposer une alternative si le timing n'est pas bon\n"
        "- Être signé par " + recruiter + "\n\n"
        "Réponds UNIQUEMENT avec le texte du message, sans introduction ni explication."
    )

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_KEY}",
                "Content-Type":  "application/json",
                "HTTP-Referer":  "https://nawastudio.com",
                "X-Title":       "Nawa Studio Alex",
            },
            json={
                "model":       MODEL,
                "messages":    [{"role": "user", "content": prompt}],
                "temperature": 0.6,
                "max_tokens":  300,
            },
            timeout=LLM_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()


# ── Pipeline report ───────────────────────────────────────────────────────────

async def generate_pipeline_report(
    job_title: str,
    stages: dict[str, int],   # { "identified": N, "contacted": N, ... }
    avg_score: float,
) -> str:
    """
    Generate a short textual analysis of the pipeline state.
    stages: dict mapping stage name → count of candidates
    """
    total = sum(stages.values())
    contacted = stages.get("contacted", 0) + stages.get("replied", 0) + stages.get("interview", 0) + stages.get("offer", 0)
    reply_rate = round((stages.get("replied", 0) + stages.get("interview", 0) + stages.get("offer", 0)) / max(contacted, 1) * 100)

    prompt = (
        f"Tu es expert en recrutement. Voici l'état du pipeline pour le poste « {job_title} » :\n"
        f"- Profils identifiés : {stages.get('identified', 0)}\n"
        f"- Contactés : {stages.get('contacted', 0)}\n"
        f"- Réponses reçues : {stages.get('replied', 0)}\n"
        f"- En entretien : {stages.get('interview', 0)}\n"
        f"- Offres : {stages.get('offer', 0)}\n"
        f"- Score moyen des profils : {avg_score:.0f}/100\n"
        f"- Taux de réponse estimé : {reply_rate}%\n\n"
        "Rédige une analyse concise (4-6 phrases) du pipeline : état actuel, points forts, "
        "recommandations pour accélérer le recrutement. Sois direct et actionnable.\n"
        "Réponds en français, sans titre ni introduction."
    )

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_KEY}",
                "Content-Type":  "application/json",
                "HTTP-Referer":  "https://nawastudio.com",
                "X-Title":       "Nawa Studio Alex",
            },
            json={
                "model":       MODEL,
                "messages":    [{"role": "user", "content": prompt}],
                "temperature": 0.4,
                "max_tokens":  250,
            },
            timeout=LLM_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()
