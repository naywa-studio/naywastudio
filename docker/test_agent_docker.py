"""
Test HTTP client for the agent running in Docker.
Sends a real mission brief and polls until done.

Usage (with Docker running on port 8000 for Léo or 8001 for Nora):
  python docker/test_agent_docker.py leo    # port 8000
  python docker/test_agent_docker.py nora   # port 8001
"""

import asyncio
import base64
import os
import sys
import time
from pathlib import Path

# Load .env.local for NAWA_AGENT_SECRET
env_file = Path(__file__).resolve().parent.parent / ".env.local"
for line in env_file.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, _, val = line.partition("=")
    os.environ.setdefault(key.strip(), val.strip())

try:
    import httpx
except ImportError:
    print("[error] Run: pip install httpx")
    sys.exit(1)

TEST_BRIEF = {
    "titre_poste": "Développeur Full-Stack Senior",
    "mots_cles": ["React", "Node.js", "TypeScript", "PostgreSQL"],
    "localisation": "Paris",
    "criteres": "5+ ans d'expérience, startup ou scale-up, open source apprécié",
    "ton": "direct et chaleureux",
    "nom_recruteur": "Elyas",
}

SECRET = os.environ.get("NAWA_AGENT_SECRET", "")


async def test(agent: str) -> None:
    port = 8000 if agent == "leo" else 8001
    base = f"http://localhost:{port}"
    headers = {"X-Nawa-Secret": SECRET, "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=300) as client:
        # ── Health check ───────────────────────────────────────────────────────
        print(f"[test] Checking health at {base}/health …")
        try:
            h = await client.get(f"{base}/health")
            print(f"[test] Health: {h.json()}")
        except httpx.ConnectError:
            print(f"[error] Cannot connect to {base}. Is Docker running?")
            print(f"  → Run: docker compose --profile {agent} up --build -d")
            return

        # ── Launch mission ─────────────────────────────────────────────────────
        print(f"\n[test] Launching mission (agent={agent})…")
        r = await client.post(f"{base}/missions", headers=headers, json={"brief": TEST_BRIEF})
        r.raise_for_status()
        mission_id = r.json()["mission_id"]
        print(f"[test] Mission ID: {mission_id}")

        # ── Poll until done ────────────────────────────────────────────────────
        print("[test] Polling status every 5s…")
        start = time.time()
        while True:
            s = await client.get(f"{base}/missions/{mission_id}/status", headers=headers)
            status = s.json()
            print(f"  [{int(time.time()-start)}s] {status}")
            if status.get("status") in ("done", "error"):
                break
            await asyncio.sleep(5)

        if status.get("status") == "error":
            print(f"[error] Mission failed: {status.get('error')}")
            return

        # ── Download result ────────────────────────────────────────────────────
        res = await client.get(f"{base}/missions/{mission_id}/result", headers=headers)
        res.raise_for_status()
        result_b64 = res.json()["result"]
        out_path = Path(__file__).resolve().parent.parent / f"test_{agent}_docker_output.xlsx"
        out_path.write_bytes(base64.b64decode(result_b64))
        print(f"\n[test] ✓ Excel output written to {out_path}")
        elapsed = int(time.time() - start)
        print(f"[test] Total time: {elapsed}s")


if __name__ == "__main__":
    agent = sys.argv[1].lower() if len(sys.argv) > 1 else "leo"
    if agent not in ("leo", "nora"):
        print(f"[error] Use 'leo' or 'nora'")
        sys.exit(1)
    asyncio.run(test(agent))
