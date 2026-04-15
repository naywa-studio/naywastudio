"""
Local test script for Léo / Nora agents.

Usage:
  python scripts/test_agent.py leo    # test agent Léo (search only)
  python scripts/test_agent.py nora   # test agent Nora (search + score + message)

Requirements:
  pip install fastapi uvicorn httpx pandas openpyxl python-dotenv

Output:
  test_leo_output.xlsx  or  test_nora_output.xlsx  in the project root.
"""

import asyncio
import base64
import os
import sys
from pathlib import Path

# ── Load .env.local ───────────────────────────────────────────────────────────
project_root = Path(__file__).resolve().parent.parent
env_file = project_root / ".env.local"

if not env_file.exists():
    print(f"[error] .env.local not found at {env_file}")
    sys.exit(1)

for line in env_file.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, _, val = line.partition("=")
    os.environ.setdefault(key.strip(), val.strip())

print(f"[test] Loaded env from {env_file}")
print(f"[test] OPENROUTER_API_KEY set: {'yes' if os.getenv('OPENROUTER_API_KEY') else 'NO'}")
print(f"[test] TAVILY_API_KEY set: {'yes' if os.getenv('TAVILY_API_KEY') else 'NO'}")

# ── Add agent-templates to sys.path ──────────────────────────────────────────
templates_dir = project_root / "src" / "lib" / "agent-templates"
sys.path.insert(0, str(templates_dir))

# ── Test brief ────────────────────────────────────────────────────────────────
TEST_BRIEF = {
    "titre_poste": "Développeur Full-Stack Senior",
    "mots_cles": ["React", "Node.js", "TypeScript", "PostgreSQL"],
    "localisation": "Paris",
    "criteres": "5+ ans d'expérience, startup ou scale-up, open source apprécié",
    "ton": "direct et chaleureux",
    "nom_recruteur": "Elyas",
}

# ── Run ───────────────────────────────────────────────────────────────────────
async def run_leo():
    import agent_leo  # type: ignore
    print("\n[test] Running Léo agent...")
    result_b64 = await agent_leo.run(TEST_BRIEF)
    out_path = project_root / "test_leo_output.xlsx"
    out_path.write_bytes(base64.b64decode(result_b64))
    print(f"[test] ✓ Output written to {out_path}")


async def run_nora():
    import agent_nora  # type: ignore
    print("\n[test] Running Nora agent (this may take 1-2 min)...")
    result_b64 = await agent_nora.run(TEST_BRIEF)
    out_path = project_root / "test_nora_output.xlsx"
    out_path.write_bytes(base64.b64decode(result_b64))
    print(f"[test] ✓ Output written to {out_path}")


if __name__ == "__main__":
    agent = sys.argv[1].lower() if len(sys.argv) > 1 else "leo"
    if agent == "leo":
        asyncio.run(run_leo())
    elif agent == "nora":
        asyncio.run(run_nora())
    else:
        print(f"[error] Unknown agent '{agent}'. Use 'leo' or 'nora'.")
        sys.exit(1)
