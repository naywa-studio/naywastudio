"""
Sets up your Supabase profile for local Docker preview.
Marks vps_status=ready, agent_status=running so the workspace
behaves as if the VPS is live (using NAWA_AGENT_URL instead of real VPS).

Usage:
  python scripts/setup_docker_preview.py leo    # subscribe as Léo
  python scripts/setup_docker_preview.py nora   # subscribe as Nora
  python scripts/setup_docker_preview.py reset  # clear subscription (back to empty workspace)

Requirements: pip install supabase python-dotenv
"""

import sys
import os
from pathlib import Path

# ── Load .env.local ───────────────────────────────────────────────────────────
env_file = Path(__file__).resolve().parent.parent / ".env.local"
for line in env_file.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, _, v = line.partition("=")
    os.environ.setdefault(k.strip(), v.strip())

try:
    from supabase import create_client
except ImportError:
    print("[error] Run: pip install supabase")
    sys.exit(1)

sb = create_client(
    os.environ["NEXT_PUBLIC_SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"],
)

def get_profiles():
    """List all profiles with email."""
    res = sb.table("profiles").select("user_id, first_name, subscription_level, vps_status").execute()
    return res.data or []

def apply(user_id: str, level: str):
    import datetime
    sb.table("profiles").update({
        "subscription_level": level,
        "subscribed_at": datetime.datetime.utcnow().isoformat(),
        "vps_status": "ready",
        "agent_status": "running",
        "vps_ip": "docker-local",
        "vps_id": "docker-preview",
    }).eq("user_id", user_id).execute()
    print(f"[setup] ✓ Profile {user_id[:8]}… set to level={level}, vps_status=ready")

def reset(user_id: str):
    sb.table("profiles").update({
        "subscription_level": None,
        "subscribed_at": None,
        "vps_status": None,
        "agent_status": "not_deployed",
        "vps_ip": None,
        "vps_id": None,
    }).eq("user_id", user_id).execute()
    print(f"[setup] ✓ Profile {user_id[:8]}… reset to no subscription")

if __name__ == "__main__":
    action = sys.argv[1].lower() if len(sys.argv) > 1 else ""
    if action not in ("leo", "nora", "reset"):
        print("Usage: python scripts/setup_docker_preview.py leo|nora|reset")
        sys.exit(1)

    profiles = get_profiles()
    if not profiles:
        print("[error] No profiles found in Supabase. Create an account first.")
        sys.exit(1)

    if len(profiles) == 1:
        target = profiles[0]
        print(f"[setup] Found 1 profile: {target.get('first_name', 'Unknown')} ({target['user_id'][:8]}…)")
    else:
        print("[setup] Multiple profiles found:")
        for i, p in enumerate(profiles):
            print(f"  {i+1}. {p.get('first_name', 'Unknown')} — {p['user_id'][:8]}… (level={p.get('subscription_level')}, vps={p.get('vps_status')})")
        choice = int(input("Choose profile number: ")) - 1
        target = profiles[choice]

    if action == "reset":
        reset(target["user_id"])
    else:
        apply(target["user_id"], action)

    print()
    print("Next steps:")
    if action != "reset":
        print(f"  1. Make sure NAWA_AGENT_URL=http://localhost:8000 is in .env.local")
        print(f"  2. Run: docker compose --profile {action} up --build -d")
        print(f"  3. Run: npm run dev")
        print(f"  4. Open http://localhost:3000/workspace")
    else:
        print("  Subscription cleared. Open http://localhost:3000/workspace")
