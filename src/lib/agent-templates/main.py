"""
Nawa Agent — FastAPI server (runs on client VPS, port 8000)
Auth : header X-Nawa-Secret must match env NAWA_AGENT_SECRET
"""

import os
import uuid
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Header, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

NAWA_SECRET = os.environ["NAWA_AGENT_SECRET"]
AGENT_LEVEL = os.getenv("AGENT_LEVEL", "leo")
SITE_URL = os.getenv("NEXT_PUBLIC_SITE_URL", "")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.StreamHandler(),
        # File handler only created if directory exists (VPS env)
        *([logging.FileHandler("/opt/nawa-agent/logs/agent.log", delay=True)]
          if os.path.isdir("/opt/nawa-agent/logs") else []),
    ],
)
log = logging.getLogger("nawa-agent")

# In-memory store — single-tenant VPS, no persistence needed
# result shape: { status, excel_b64, candidates, error }
missions: dict[str, dict[str, Any]] = {}


def check_secret(x_nawa_secret: str | None) -> None:
    if x_nawa_secret != NAWA_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Nawa agent starting — level=%s", AGENT_LEVEL)
    yield
    log.info("Nawa agent shutting down")


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[SITE_URL] if SITE_URL else ["*"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "agent": AGENT_LEVEL}


# ── Missions ──────────────────────────────────────────────────────────────────

@app.post("/missions")
async def create_mission(
    request: Request,
    background_tasks: BackgroundTasks,
    x_nawa_secret: str | None = Header(None),
):
    check_secret(x_nawa_secret)
    body = await request.json()
    # Accept both { brief: {...} } and plain brief dict
    brief = body.get("brief", body)
    mission_id = str(uuid.uuid4())
    missions[mission_id] = {"status": "running", "excel_b64": None, "candidates": None, "error": None}
    background_tasks.add_task(_run_mission, mission_id, brief)
    log.info("Mission %s created (level=%s)", mission_id, AGENT_LEVEL)
    return {"mission_id": mission_id, "status": "running"}


@app.get("/missions/{mission_id}/status")
def get_status(mission_id: str, x_nawa_secret: str | None = Header(None)):
    check_secret(x_nawa_secret)
    m = missions.get(mission_id)
    if not m:
        raise HTTPException(status_code=404, detail="Mission not found")
    return {"mission_id": mission_id, "status": m["status"], "error": m.get("error")}


@app.get("/missions/{mission_id}/result")
def get_result(mission_id: str, x_nawa_secret: str | None = Header(None)):
    check_secret(x_nawa_secret)
    m = missions.get(mission_id)
    if not m:
        raise HTTPException(status_code=404, detail="Mission not found")
    if m["status"] == "running":
        raise HTTPException(status_code=400, detail="Mission still running")
    if m["status"] == "error":
        raise HTTPException(status_code=500, detail=m.get("error", "Unknown error"))
    return {
        "mission_id": mission_id,
        "status": "completed",
        "result": m["excel_b64"],         # base64 Excel
        "candidates": m["candidates"],    # list[dict] for DB ingestion
    }


# ── Delete mission (VPS cleanup) ──────────────────────────────────────────────

@app.delete("/missions/{mission_id}/delete")
def delete_mission(mission_id: str, x_nawa_secret: str | None = Header(None)):
    check_secret(x_nawa_secret)
    missions.pop(mission_id, None)
    log.info("Mission %s deleted from VPS store", mission_id)
    return {"ok": True}


# ── Alex: follow-up generation ────────────────────────────────────────────────

@app.post("/followup")
async def generate_followup_endpoint(
    request: Request,
    x_nawa_secret: str | None = Header(None),
):
    """
    Alex-only endpoint. Generates a follow-up message for a candidate.
    Body: {
      candidate_name: str | null,
      original_message: str,
      days_since_contact: int,
      job_title: str,
      recruiter_name: str | null
    }
    """
    if AGENT_LEVEL != "alex":
        raise HTTPException(status_code=403, detail="This endpoint requires Alex (N3)")
    check_secret(x_nawa_secret)

    body = await request.json()
    from agent_alex import generate_followup

    draft = await generate_followup(
        candidate_name=body.get("candidate_name"),
        original_message=body.get("original_message", ""),
        days_since_contact=body.get("days_since_contact", 7),
        job_title=body.get("job_title", ""),
        recruiter_name=body.get("recruiter_name"),
    )
    return {"draft": draft}


# ── Alex: pipeline report ─────────────────────────────────────────────────────

@app.post("/pipeline-report")
async def pipeline_report_endpoint(
    request: Request,
    x_nawa_secret: str | None = Header(None),
):
    """
    Alex-only endpoint. Generates a pipeline analysis report.
    Body: {
      job_title: str,
      stages: { identified: int, contacted: int, replied: int, interview: int, offer: int },
      avg_score: float
    }
    """
    if AGENT_LEVEL != "alex":
        raise HTTPException(status_code=403, detail="This endpoint requires Alex (N3)")
    check_secret(x_nawa_secret)

    body = await request.json()
    from agent_alex import generate_pipeline_report

    report = await generate_pipeline_report(
        job_title=body.get("job_title", ""),
        stages=body.get("stages", {}),
        avg_score=body.get("avg_score", 0),
    )
    return {"report": report}


# ── Background task ───────────────────────────────────────────────────────────

async def _run_mission(mission_id: str, brief: dict) -> None:
    try:
        if AGENT_LEVEL in ("nora", "alex"):
            from agent_nora import run
        else:
            from agent_leo import run

        result = await run(brief)
        # run() returns dict: { excel_b64: str, candidates: list[dict] }
        missions[mission_id]["status"] = "completed"
        missions[mission_id]["excel_b64"] = result["excel_b64"]
        missions[mission_id]["candidates"] = result["candidates"]
        log.info("Mission %s completed — %d candidates", mission_id, len(result["candidates"]))
    except Exception as exc:
        missions[mission_id]["status"] = "error"
        missions[mission_id]["error"] = str(exc)
        log.error("Mission %s failed: %s", mission_id, exc, exc_info=True)
