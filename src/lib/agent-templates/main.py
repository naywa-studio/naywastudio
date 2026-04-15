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
        logging.FileHandler("/opt/nawa-agent/logs/agent.log", delay=True),
    ],
)
log = logging.getLogger("nawa-agent")

# In-memory store — single-tenant VPS, no persistence needed
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
    allow_methods=["GET", "POST"],
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
    brief = await request.json()
    mission_id = str(uuid.uuid4())
    missions[mission_id] = {"status": "running", "result": None, "error": None}
    background_tasks.add_task(_run_mission, mission_id, brief)
    log.info("Mission %s created", mission_id)
    return {"id": mission_id, "status": "running"}


@app.get("/missions/{mission_id}/status")
def get_status(mission_id: str, x_nawa_secret: str | None = Header(None)):
    check_secret(x_nawa_secret)
    m = missions.get(mission_id)
    if not m:
        raise HTTPException(status_code=404, detail="Mission not found")
    return {"id": mission_id, "status": m["status"], "error": m.get("error")}


@app.get("/missions/{mission_id}/result")
def get_result(mission_id: str, x_nawa_secret: str | None = Header(None)):
    check_secret(x_nawa_secret)
    m = missions.get(mission_id)
    if not m:
        raise HTTPException(status_code=404, detail="Mission not found")
    if m["status"] != "completed":
        raise HTTPException(status_code=400, detail=f"Mission status: {m['status']}")
    return {"id": mission_id, "status": "completed", "excel_base64": m["result"]}


# ── Background task ───────────────────────────────────────────────────────────

async def _run_mission(mission_id: str, brief: dict) -> None:
    try:
        if AGENT_LEVEL == "nora":
            from agent_nora import run
        else:
            from agent_leo import run

        result = await run(brief)
        missions[mission_id]["status"] = "completed"
        missions[mission_id]["result"] = result
        log.info("Mission %s completed", mission_id)
    except Exception as exc:
        missions[mission_id]["status"] = "error"
        missions[mission_id]["error"] = str(exc)
        log.error("Mission %s failed: %s", mission_id, exc, exc_info=True)
