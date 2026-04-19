"""
Agent Nora (N2) — Sourcing intelligent multi-sources + scoring multi-dimensionnel

Différences clés vs Léo :
  - Expansion sémantique du brief (LLM génère titres alternatifs + compétences connexes)
  - Pre-filtre rapide avant scoring (élimine les profils sans aucun keyword commun)
  - Scoring multi-dimensionnel : compétences / séniorité / localisation / qualité profil
  - Estimation de la séniorité par profil (Junior / Confirmé / Senior)
  - Rapport de recherche Nora (analyse marché, recommandations)
  - Max 150 profils, shortlist top 7% (min 4, max 25)
  - Excel 2 feuilles : Shortlist (avec messages) + Longlist
Output : { excel_b64: str, candidates: list[dict], research_report: str }
"""

import os
import re
import asyncio
import base64
import json
import logging
from io import BytesIO

import httpx
import pandas as pd

from agent_leo import (
    build_queries,
    search_profiles,
    parse_linkedin_profile,
    parse_malt_profile,
    parse_apec_profile,
    fuzzy_name_match,
    normalize_url,
    normalize_name,
    coerce_keywords,
    location_score,
    detect_seniority,
    short_title,
)

MAX_PROFILES       = 150
BATCH_SIZE         = 10
MAX_MESSAGES       = 25
SHORTLIST_MIN_PCT  = 0.07   # top 7%
SHORTLIST_MIN_N    = 4

log = logging.getLogger("nawa-agent.nora")

OPENROUTER_KEY = os.environ["OPENROUTER_API_KEY"]
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL          = "openai/gpt-4o-mini"
LLM_TIMEOUT    = 35.0


# ── Brief expansion ───────────────────────────────────────────────────────────

async def expand_brief(brief: dict, client: httpx.AsyncClient) -> dict:
    """
    Ask LLM to enrich the brief with:
    - 3-4 alternative job titles (synonyms / adjacent roles)
    - 3-4 additional relevant keywords not already in the brief
    Returns an augmented brief dict (original keys + alt_titles + extra_keywords).
    """
    titre    = brief.get("titre_poste", "")
    mots     = coerce_keywords(brief.get("mots_cles", []))
    criteres = brief.get("criteres", "")

    prompt = (
        f"Tu es expert RH. Pour le recrutement de : « {titre} »\n"
        f"Critères : {criteres}\n"
        f"Compétences déjà identifiées : {', '.join(mots)}\n\n"
        "Génère en JSON :\n"
        "- alt_titles : liste de 4 intitulés COURTS alternatifs (1-3 mots max, comme ils apparaissent "
        "sur LinkedIn — ex : 'Lead Developer', 'Tech Lead', 'Ingénieur Senior'). "
        "Variantes françaises ET anglaises. JAMAIS de phrases longues.\n"
        "- extra_keywords : liste de 4 compétences/domaines connexes NON présentes dans "
        "les compétences déjà identifiées (ex : si React → Next.js, TypeScript, SPA).\n"
        "RÈGLE : alt_titles doivent être des titres de poste courts (1-3 mots) comme on les voit "
        "sur un profil LinkedIn, pas des descriptions de mission.\n"
        "Réponds UNIQUEMENT avec le JSON, sans explication :\n"
        '{"alt_titles":["..."],"extra_keywords":["..."]}'
    )

    try:
        resp = await client.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_KEY}",
                "Content-Type":  "application/json",
                "HTTP-Referer":  "https://nawastudio.com",
                "X-Title":       "Nawa Studio Nora",
            },
            json={
                "model":           MODEL,
                "messages":        [{"role": "user", "content": prompt}],
                "temperature":     0.4,
                "response_format": {"type": "json_object"},
                "max_tokens":      200,
            },
            timeout=LLM_TIMEOUT,
        )
        resp.raise_for_status()
        data = json.loads(resp.json()["choices"][0]["message"]["content"])
        expanded = dict(brief)
        expanded["_alt_titles"]      = data.get("alt_titles", [])[:4]
        expanded["_extra_keywords"]  = data.get("extra_keywords", [])[:4]
        log.info(
            "Brief expanded — alt_titles: %s | extra_keywords: %s",
            expanded["_alt_titles"], expanded["_extra_keywords"],
        )
        return expanded
    except Exception as exc:
        log.warning("Brief expansion failed: %s — using original brief", exc)
        return dict(brief)


def build_expanded_queries(brief: dict) -> tuple[list[str], list[str], list[str]]:
    """
    Build queries using both the original brief AND expanded alternatives.
    Alt titles each get their own focused query.
    """
    base_li, base_malt, base_apec = build_queries(brief)

    alt_titles     = brief.get("_alt_titles", [])
    extra_keywords = brief.get("_extra_keywords", [])
    loc            = brief.get("localisation", "")
    loc_q          = f'"{loc}"' if loc else ""

    extra_li: list[str] = []
    for alt in alt_titles[:3]:
        alt_short = short_title(alt)
        extra_li.append(f'site:linkedin.com/in "{alt_short}" {loc_q}')
        extra_li.append(f'site:fr.linkedin.com/in "{alt_short}" {loc_q}')

    if extra_keywords:
        kw_str = " ".join(extra_keywords[:3])
        extra_li.append(f'site:linkedin.com/in "{brief.get("titre_poste", "")}" {kw_str} {loc_q}')

    # Extra Malt queries for alt titles
    extra_malt: list[str] = []
    for alt in alt_titles[:2]:
        alt_short = short_title(alt)
        extra_malt.append(f'site:malt.fr "{alt_short}" {loc_q}')

    return (
        base_li + extra_li,
        base_malt + extra_malt,
        base_apec,  # APEC: keep as-is (limited index)
    )


# ── Seniority estimator ───────────────────────────────────────────────────────

_SENIOR_SIGNALS  = r"senior|lead|principal|expert|architect|directeur|head of|vp |cto|cpo|cso|" \
                   r"10 ans|12 ans|15 ans|7\+|8\+|9\+|10\+|staff"
_JUNIOR_SIGNALS  = r"junior|débutant|apprenti|alternant|stagiaire|graduate|0-3|1 an|2 ans|" \
                   r"entry.level|intern"
_CONFIRMED_SIGS  = r"confirmé|médior|mid.level|3-7|4 ans|5 ans|6 ans|intermédiaire|" \
                   r"expérimenté"

def estimate_seniority(title: str, snippet: str) -> str:
    """Return 'Junior' | 'Confirmé' | 'Senior' | 'Inconnu'."""
    text = (title + " " + snippet).lower()
    if re.search(_SENIOR_SIGNALS, text):
        return "Senior"
    if re.search(_CONFIRMED_SIGS, text):
        return "Confirmé"
    if re.search(_JUNIOR_SIGNALS, text):
        return "Junior"
    return "Inconnu"


# ── Pre-filter ────────────────────────────────────────────────────────────────

def pre_filter(profiles: list[dict], brief: dict) -> list[dict]:
    """
    Quickly eliminate profiles with zero keyword overlap with the brief.
    Avoids wasting LLM tokens on clearly irrelevant profiles.
    """
    all_keywords = coerce_keywords(brief.get("mots_cles", []))
    all_keywords += brief.get("_extra_keywords", [])
    if not all_keywords:
        return profiles

    normalized_kw = {k.lower().strip() for k in all_keywords}
    titre = brief.get("titre_poste", "").lower()

    kept, dropped = [], []
    for p in profiles:
        kw_str   = str(p.get("keywords", "")).lower()
        title_p  = str(p.get("title_estimated", "")).lower()
        # Keep if: has matching keyword OR title overlaps with the role
        has_kw    = any(k in kw_str or k in title_p for k in normalized_kw)
        has_title = any(word in title_p for word in titre.split() if len(word) > 3)
        if has_kw or has_title:
            kept.append(p)
        else:
            dropped.append(p)

    log.info("Pre-filter: kept %d / dropped %d profiles", len(kept), len(dropped))
    return kept if len(kept) >= 10 else profiles  # fallback: keep all if too aggressive


# ── Multi-dimensional LLM scoring ─────────────────────────────────────────────

async def score_batch_multi(
    profiles: list[dict], brief: dict, client: httpx.AsyncClient
) -> list[dict]:
    """
    Score each profile on 4 dimensions (0-100 each):
      - competences  : keyword / skill alignment with the brief
      - seniorite    : seniority level match
      - localisation : confidence of the geographic match
      - qualite      : profile completeness and signal richness

    Final score = 0.40*comp + 0.25*senior + 0.20*loc + 0.15*qual
    Each score is stored in score_dimensions dict.
    """
    titre    = brief.get("titre_poste", "")
    criteres = brief.get("criteres", "Expérience pertinente pour le poste")
    mots     = ", ".join(coerce_keywords(brief.get("mots_cles", []))[:8])
    loc      = brief.get("localisation", "France")

    lines = "\n".join(
        f"{i + 1}. {p.get('name_estimated', '?')} | "
        f"{p.get('title_estimated', '?')} chez {p.get('company', '?')} | "
        f"keywords: {p.get('keywords', '?')} | "
        f"loc_score: {p.get('_loc_score', 0)} | "
        f"seniority: {p.get('_seniority', '?')}"
        for i, p in enumerate(profiles)
    )

    prompt = (
        f"Tu es un recruteur senior expert. Évalue ces profils pour ce poste :\n"
        f"Poste : {titre} | Localisation cible : {loc}\n"
        f"Critères : {criteres}\n"
        f"Compétences requises : {mots}\n\n"
        f"{lines}\n\n"
        "Pour chaque profil, donne 4 scores (0-100) et une justification ≤12 mots.\n"
        "Règles de scoring :\n"
        "- competences : alignement avec les compétences requises (0=aucune, 100=toutes présentes)\n"
        "- seniorite   : correspondance niveau d'expérience demandé (loc_score aide)\n"
        "- localisation: confiance géographique (0=inconnu, 50=texte, 100=confirmé)\n"
        "- qualite     : richesse du profil (titre clair, entreprise connue, keywords variés)\n"
        "Un profil parfait mérite 85-100 sur les dimensions pertinentes.\n"
        "Un profil hors sujet mérite < 25 en compétences.\n"
        "Réponds UNIQUEMENT avec du JSON valide :\n"
        '{"scores":[{"index":1,"competences":75,"seniorite":80,"localisation":100,'
        '"qualite":70,"justification":"Profil solide, React+Node confirmé Paris"}]}'
    )

    try:
        resp = await client.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_KEY}",
                "Content-Type":  "application/json",
                "HTTP-Referer":  "https://nawastudio.com",
                "X-Title":       "Nawa Studio Nora",
            },
            json={
                "model":           MODEL,
                "messages":        [{"role": "user", "content": prompt}],
                "temperature":     0.15,
                "response_format": {"type": "json_object"},
                "max_tokens":      1200,
            },
            timeout=LLM_TIMEOUT,
        )
        resp.raise_for_status()
        raw      = resp.json()["choices"][0]["message"]["content"]
        data     = json.loads(raw)
        score_map = {item["index"]: item for item in data.get("scores", [])}

        for i, p in enumerate(profiles):
            s    = score_map.get(i + 1, {})
            comp = max(0, min(100, int(s.get("competences",  50))))
            sen  = max(0, min(100, int(s.get("seniorite",    50))))
            loc_d = max(0, min(100, int(s.get("localisation", 50))))
            qual = max(0, min(100, int(s.get("qualite",      50))))

            # Location bonus: boost if loc_score from Tavily snippet is confirmed (=3)
            loc_tavily = p.get("_loc_score", 0)
            if loc_tavily >= 3:
                loc_d = max(loc_d, 90)
            elif loc_tavily == 2:
                loc_d = max(loc_d, 65)
            elif loc_tavily == 0 and brief.get("localisation"):
                loc_d = min(loc_d, 40)

            final = round(0.40 * comp + 0.25 * sen + 0.20 * loc_d + 0.15 * qual)

            p["relevance_score"]    = final
            p["score_justification"] = s.get("justification", "")
            p["score_dimensions"]    = {
                "competences":  comp,
                "seniorite":    sen,
                "localisation": loc_d,
                "qualite":      qual,
            }

    except Exception as exc:
        log.warning("Multi-dim scoring batch failed: %s — fallback null", exc)
        for p in profiles:
            p.setdefault("relevance_score", None)
            p.setdefault("score_justification", "")
            p.setdefault("score_dimensions", None)

    return profiles


# ── Message generation ────────────────────────────────────────────────────────

async def generate_message(
    profile: dict, brief: dict, client: httpx.AsyncClient
) -> str:
    """Personalized outreach message adapted to source and profile dimensions."""
    nom_recruteur = brief.get("nom_recruteur", "l'équipe Nawa")
    titre_poste   = brief.get("titre_poste", "")
    source        = profile.get("_source", "linkedin")
    seniority     = profile.get("_seniority", "Inconnu")
    dims          = profile.get("score_dimensions") or {}

    # Identify the strongest matching dimension for personalization
    top_dim = max(dims, key=lambda k: dims[k]) if dims else "competences"
    top_dim_labels = {
        "competences":  "ses compétences techniques",
        "seniorite":    "son niveau d'expérience",
        "localisation": "sa localisation",
        "qualite":      "la qualité de son parcours",
    }
    highlight = top_dim_labels.get(top_dim, "son profil")

    # Source-specific intro
    if source == "malt":
        source_ctx = (
            f"Ce candidat est freelance actif sur Malt : {profile.get('name_estimated')}, "
            f"{profile.get('title_estimated')}. "
            "Mentionne son activité freelance et que tu lui proposes une mission ou un CDI selon le poste."
        )
    elif source == "apec":
        source_ctx = (
            f"Ce cadre est référencé APEC : {profile.get('name_estimated')}, "
            f"{profile.get('title_estimated')} chez {profile.get('company', '')}. "
            "Ton message doit être formel mais chaleureux, il cherche peut-être activement."
        )
    else:
        source_ctx = (
            f"Profil LinkedIn : {profile.get('name_estimated')}, "
            f"{profile.get('title_estimated')} chez {profile.get('company', '')}. "
            f"Niveau estimé : {seniority}."
        )

    # Keywords to highlight
    kw_raw  = str(profile.get("keywords", ""))
    kw_list = [k.strip() for k in kw_raw.split(",") if k.strip()][:3]
    kw_str  = ", ".join(kw_list) if kw_list else "ses compétences"

    # Map brief ton to concrete style instruction
    ton_raw = brief.get("ton", "")
    ton_map = {
        "professionnel": "Ton formel et soigné, phrases complètes, vouvoiement.",
        "formel":        "Ton formel et soigné, phrases complètes, vouvoiement.",
        "direct":        "Ton direct et concis, aller droit au but, pas de fioritures.",
        "efficace":      "Ton direct et concis, aller droit au but, pas de fioritures.",
        "chaleureux":    "Ton chaleureux et humain, proche, tutoiement possible.",
        "humain":        "Ton chaleureux et humain, proche, tutoiement possible.",
        "startup":       "Ton startup/casual, décontracté, peut tutoyer, énergie entrepreneuriale.",
        "casual":        "Ton startup/casual, décontracté, peut tutoyer, énergie entrepreneuriale.",
    }
    ton_instruction = next(
        (v for k, v in ton_map.items() if k in ton_raw.lower()),
        "Ton professionnel mais humain, ni trop formel ni trop familier."
    )

    prompt = (
        f"Rédige un message de prise de contact LinkedIn professionnel et personnalisé.\n"
        f"Recruteur : {nom_recruteur} | Poste : {titre_poste}\n"
        f"{source_ctx}\n"
        f"Compétences mises en avant : {kw_str}\n"
        f"Ce qui a retenu l'attention : {highlight}\n\n"
        f"STYLE IMPOSÉ : {ton_instruction}\n\n"
        "Règles STRICTES :\n"
        "- 3-4 phrases maximum\n"
        "- Mentionner UN élément spécifique du profil (titre, entreprise, ou compétence clé)\n"
        "- Ne PAS mentionner de salaire, plateforme, score, ou outil de recrutement\n"
        "- Terminer par une question ouverte ou proposition de 30 min\n"
        "- PAS de 'J'espère que ce message vous trouve bien'\n"
        "- PAS de formule de politesse finale, PAS de signature\n"
        "Réponds UNIQUEMENT avec le message."
    )

    try:
        resp = await client.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_KEY}",
                "Content-Type":  "application/json",
                "HTTP-Referer":  "https://nawastudio.com",
                "X-Title":       "Nawa Studio Nora",
            },
            json={
                "model":       MODEL,
                "messages":    [{"role": "user", "content": prompt}],
                "temperature": 0.72,
                "max_tokens":  280,
            },
            timeout=LLM_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        log.warning("Message generation failed for %s: %s", profile.get("name_estimated"), exc)
        return ""


# ── Research report ───────────────────────────────────────────────────────────

async def generate_research_report(
    profiles: list[dict],
    shortlist: list[dict],
    brief: dict,
    client: httpx.AsyncClient,
) -> str:
    """
    Generate a concise market analysis report after the sourcing run.
    Insights: score distribution, rarest skill, best source, recommendations.
    """
    if not profiles:
        return ""

    titre   = brief.get("titre_poste", "Poste")
    loc     = brief.get("localisation", "France")
    mots    = coerce_keywords(brief.get("mots_cles", []))

    # Compute stats
    n_total   = len(profiles)
    n_li      = sum(1 for p in profiles if p.get("_source", "linkedin") == "linkedin")
    n_malt    = sum(1 for p in profiles if p.get("_source") == "malt")
    n_apec    = sum(1 for p in profiles if p.get("_source") == "apec")
    n_short   = len(shortlist)

    scored    = [p for p in profiles if p.get("relevance_score") is not None]
    avg_score = round(sum(p["relevance_score"] for p in scored) / len(scored)) if scored else 0
    high_sc   = sum(1 for p in scored if p["relevance_score"] >= 80)
    med_sc    = sum(1 for p in scored if 60 <= p["relevance_score"] < 80)

    # Which keyword appears least in profiles?
    kw_counts: dict[str, int] = {}
    for kw in mots:
        kw_lower = kw.lower()
        kw_counts[kw] = sum(
            1 for p in profiles
            if kw_lower in str(p.get("keywords", "")).lower()
            or kw_lower in str(p.get("title_estimated", "")).lower()
        )
    rarest_kw  = min(kw_counts, key=lambda k: kw_counts[k]) if kw_counts else ""
    rarest_pct = round(kw_counts[rarest_kw] * 100 / n_total) if rarest_kw and n_total > 0 else 0

    # Best source (by avg score)
    src_scores: dict[str, list[int]] = {"linkedin": [], "malt": [], "apec": []}
    for p in scored:
        src = p.get("_source", "linkedin")
        if src in src_scores:
            src_scores[src].append(p["relevance_score"])
    best_source = max(
        (src for src in src_scores if src_scores[src]),
        key=lambda s: sum(src_scores[s]) / len(src_scores[s]),
        default="linkedin"
    )

    # Seniority distribution
    sen_dist: dict[str, int] = {}
    for p in profiles:
        sen = p.get("_seniority", "Inconnu")
        sen_dist[sen] = sen_dist.get(sen, 0) + 1

    stats_block = (
        f"Données brutes :\n"
        f"- Total profils trouvés : {n_total} (LinkedIn {n_li} / Malt {n_malt} / APEC {n_apec})\n"
        f"- Shortlist : {n_short} profils\n"
        f"- Score moyen : {avg_score}/100 | Excellents (≥80) : {high_sc} | Bons (60-79) : {med_sc}\n"
        f"- Compétence la plus rare : « {rarest_kw} » présente chez {rarest_pct}% des profils\n"
        f"- Meilleure source : {best_source}\n"
        f"- Distribution séniorité : {sen_dist}\n"
    )

    prompt = (
        f"Tu es un consultant RH expert. Analyse ces résultats de sourcing et rédige un rapport concis.\n\n"
        f"Mission : {titre} — {loc}\n"
        f"Compétences recherchées : {', '.join(mots)}\n\n"
        f"{stats_block}\n"
        "Rédige un rapport de 3-4 phrases maximum en français, naturel et professionnel :\n"
        "1. Un bilan des profils trouvés (volume, qualité globale)\n"
        "2. Un insight marché (compétence rare, tension du marché, meilleure source)\n"
        "3. Une recommandation concrète (élargir géo ? autre titre ? mots-clés alternatifs ?)\n"
        "Pas de bullet points. Pas de titre. Juste le texte du rapport."
    )

    try:
        resp = await client.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_KEY}",
                "Content-Type":  "application/json",
                "HTTP-Referer":  "https://nawastudio.com",
                "X-Title":       "Nawa Studio Nora",
            },
            json={
                "model":       MODEL,
                "messages":    [{"role": "user", "content": prompt}],
                "temperature": 0.6,
                "max_tokens":  250,
            },
            timeout=LLM_TIMEOUT,
        )
        resp.raise_for_status()
        report = resp.json()["choices"][0]["message"]["content"].strip()
        log.info("Research report generated (%d chars)", len(report))
        return report
    except Exception as exc:
        log.warning("Research report generation failed: %s", exc)
        # Fallback: build a simple report from stats
        return (
            f"Sur {n_total} profils identifiés (LinkedIn {n_li}, Malt {n_malt}, APEC {n_apec}), "
            f"{n_short} ont été sélectionnés en shortlist. "
            f"Score moyen : {avg_score}/100. "
            f"La compétence « {rarest_kw} » est présente chez seulement {rarest_pct}% des profils — "
            f"le marché est tendu sur ce critère."
        )


# ── Main entry point ──────────────────────────────────────────────────────────

async def run(brief: dict) -> dict:
    """
    Return dict: { excel_b64: str, candidates: list[dict], research_report: str }
    """
    location = brief.get("localisation", "")

    profiles: list[dict] = []
    seen_urls: set[str]  = set()
    seen_names: set[str] = set()

    semaphore = asyncio.Semaphore(5)

    async def throttled_search(q: str, domains: list[str], c: httpx.AsyncClient) -> list[dict]:
        async with semaphore:
            return await search_profiles(q, domains, c)

    # ── Step 1 — Expand the brief with LLM ───────────────────────────────────
    async with httpx.AsyncClient() as client:
        expanded_brief = await expand_brief(brief, client)

    # ── Step 2 — Multi-source search with expanded queries ───────────────────
    linkedin_queries, malt_queries, apec_queries = build_expanded_queries(expanded_brief)

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

        # 2. Name exact dedup (same person regardless of company)
        if norm_name and norm_name in seen_names:
            return

        # 3. Fuzzy name dedup (typos, hyphens, accents)
        if norm_name and len(norm_name) >= 6:
            if any(fuzzy_name_match(norm_name, e) for e in seen_names):
                return

        seen_urls.add(norm_url)
        if norm_name:
            seen_names.add(norm_name)
        profiles.append(p)

    for results in li_results:
        for r in results:
            add_profile(parse_linkedin_profile(r, location))
    for results in malt_results:
        for r in results:
            add_profile(parse_malt_profile(r, location))
    for results in apec_results:
        for r in results:
            add_profile(parse_apec_profile(r, location))

    # Location filter
    profiles.sort(key=lambda p: -p.get("_loc_score", 0))
    if location:
        confirmed   = [p for p in profiles if p.get("_loc_score", 0) > 0]
        unconfirmed = [p for p in profiles if p.get("_loc_score", 0) == 0]
        if len(confirmed) >= 30:
            profiles = confirmed
        elif len(confirmed) >= 15:
            profiles = confirmed + unconfirmed[:10]

    profiles = profiles[:MAX_PROFILES]

    # Annotate seniority before scoring
    for p in profiles:
        p["_seniority"] = estimate_seniority(
            p.get("title_estimated", ""),
            p.get("_snippet", ""),
        )

    malt_c = sum(1 for p in profiles if p.get("_source") == "malt")
    apec_c = sum(1 for p in profiles if p.get("_source") == "apec")
    log.info(
        "Nora found %d profiles | LinkedIn: %d | Malt: %d | APEC: %d",
        len(profiles), len(profiles) - malt_c - apec_c, malt_c, apec_c,
    )

    # ── Step 3 — Pre-filter ───────────────────────────────────────────────────
    profiles = pre_filter(profiles, expanded_brief)

    # ── Step 4 — Multi-dimensional LLM scoring ────────────────────────────────
    async with httpx.AsyncClient() as client:
        batches = [profiles[i:i + BATCH_SIZE] for i in range(0, len(profiles), BATCH_SIZE)]
        scored  = await asyncio.gather(
            *[score_batch_multi(b, expanded_brief, client) for b in batches]
        )
        profiles = [p for batch in scored for p in batch]

    # Sort by final score descending
    profiles.sort(key=lambda p: p.get("relevance_score") or 0, reverse=True)

    # ── Step 5 — Shortlist (top 7%, min 4, max 25) ────────────────────────────
    scored_profiles = [p for p in profiles if p.get("relevance_score") is not None]
    shortlist_n     = max(SHORTLIST_MIN_N, min(MAX_MESSAGES, round(len(scored_profiles) * SHORTLIST_MIN_PCT)))
    shortlist       = scored_profiles[:shortlist_n]
    log.info("Nora shortlist: %d profiles, generating messages…", len(shortlist))

    # ── Step 6 — Generate personalized messages for shortlist ──────────────────
    async with httpx.AsyncClient() as client:
        messages = await asyncio.gather(
            *[generate_message(p, expanded_brief, client) for p in shortlist]
        )
        for p, msg in zip(shortlist, messages):
            p["message_draft"] = msg

        # ── Step 7 — Research report ──────────────────────────────────────────
        research_report = await generate_research_report(profiles, shortlist, expanded_brief, client)

    shortlist_urls = {p["_norm_url"] for p in shortlist}

    # ── Step 8 — Build Excel (2 sheets) ───────────────────────────────────────
    def clean_row(p: dict, include_message: bool = False) -> dict:
        dims = p.get("score_dimensions") or {}
        row: dict = {
            "source":             p.get("_source", "linkedin"),
            "linkedin_url":       p.get("linkedin_url", ""),
            "name_estimated":     p.get("name_estimated", ""),
            "title_estimated":    p.get("title_estimated", ""),
            "company":            p.get("company", ""),
            "seniority":          p.get("_seniority", ""),
            "keywords":           p.get("keywords", ""),
            "score_final":        p.get("relevance_score"),
            "score_competences":  dims.get("competences"),
            "score_seniorite":    dims.get("seniorite"),
            "score_localisation": dims.get("localisation"),
            "score_qualite":      dims.get("qualite"),
            "score_justification": p.get("score_justification", ""),
        }
        if include_message:
            row["message_draft"] = p.get("message_draft", "")
        return row

    shortlist_rows = [clean_row(p, include_message=True) for p in shortlist]
    longlist_rows  = [clean_row(p) for p in profiles if p["_norm_url"] not in shortlist_urls]

    shortlist_cols = [
        "source", "linkedin_url", "name_estimated", "title_estimated", "company",
        "seniority", "keywords", "score_final", "score_competences", "score_seniorite",
        "score_localisation", "score_qualite", "score_justification", "message_draft",
    ]
    longlist_cols = [
        "source", "linkedin_url", "name_estimated", "title_estimated", "company",
        "seniority", "keywords", "score_final", "score_competences", "score_seniorite",
        "score_localisation", "score_qualite", "score_justification",
    ]

    df_short = pd.DataFrame(shortlist_rows, columns=shortlist_cols)
    df_long  = pd.DataFrame(longlist_rows,  columns=longlist_cols)

    buf = BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df_short.to_excel(writer, sheet_name="Shortlist Nora", index=False)
        df_long.to_excel(writer,  sheet_name="Longlist",       index=False)
        for sheet_name, df in [("Shortlist Nora", df_short), ("Longlist", df_long)]:
            ws = writer.sheets[sheet_name]
            for col in ws.columns:
                max_len = max(len(str(cell.value or "")) for cell in col)
                ws.column_dimensions[col[0].column_letter].width = min(max_len + 4, 80)

    excel_b64 = base64.b64encode(buf.getvalue()).decode()
    log.info("Nora Excel — shortlist=%d longlist=%d", len(df_short), len(df_long))

    # ── Step 9 — Flat candidates list for DB ──────────────────────────────────
    shortlist_data = {
        p["_norm_url"]: {
            "message": p.get("message_draft", ""),
            "score_dimensions": p.get("score_dimensions"),
        }
        for p in shortlist
    }

    all_candidates = []
    for p in profiles:
        url_key  = p["_norm_url"]
        sl_entry = shortlist_data.get(url_key, {})
        dims     = p.get("score_dimensions")
        all_candidates.append({
            "linkedin_url":        p.get("linkedin_url"),
            "name_estimated":      p.get("name_estimated"),
            "title_estimated":     p.get("title_estimated"),
            "company":             p.get("company"),
            "keywords":            [k.strip() for k in str(p.get("keywords", "")).split(",") if k.strip()],
            "relevance_score":     p.get("relevance_score"),
            "score_justification": p.get("score_justification"),
            "score_dimensions":    dims,
            "seniority_level":     p.get("_seniority"),
            "message":             sl_entry.get("message") or None,
            "source":              p.get("_source", "linkedin"),
        })

    return {
        "excel_b64":       excel_b64,
        "candidates":      all_candidates,
        "research_report": research_report,
    }
