/**
 * Hostinger VPS provisioning + cloud-init agent deployment
 * Called from /api/subscribe — fire and forget (no await on long ops)
 */

import { readFileSync } from "fs"
import { join } from "path"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"

const HOSTINGER_API = "https://developers.hostinger.com/api/vps/v1"

function hostingerHeaders() {
  return {
    Authorization: `Bearer ${process.env.HOSTINGER_API_TOKEN}`,
    "Content-Type": "application/json",
  }
}

function supabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── Read agent template files ─────────────────────────────────────────────────

function readTemplate(filename: string): string {
  const p = join(process.cwd(), "src", "lib", "agent-templates", filename)
  return readFileSync(p, "utf-8")
}

function toB64(content: string): string {
  return Buffer.from(content).toString("base64")
}

// ── Cloud-init script generator ───────────────────────────────────────────────

function buildCloudInit(userId: string, level: "leo" | "nora"): string {
  const mainB64 = toB64(readTemplate("main.py"))
  const leoB64 = toB64(readTemplate("agent_leo.py"))
  const noraB64 = level === "nora" ? toB64(readTemplate("agent_nora.py")) : null
  const reqB64 = toB64(readTemplate("requirements.txt"))

  const secret = process.env.NAWA_AGENT_SECRET!
  const openrouterKey = process.env.OPENROUTER_API_KEY!
  const tavilyKey = process.env.TAVILY_API_KEY!
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!

  // Note: bash $VAR refs use no braces to avoid JS template literal collision
  return `#!/bin/bash
set -e
exec > /var/log/nawa-setup.log 2>&1

echo "[nawa] Starting setup for user ${userId} level ${level}"

# System packages
apt-get update -qq
apt-get install -y python3 python3-pip python3-venv curl

# Agent directory
mkdir -p /opt/nawa-agent/logs
cd /opt/nawa-agent

# Virtual environment
python3 -m venv venv

# Dependencies
echo "${reqB64}" | base64 -d > requirements.txt
/opt/nawa-agent/venv/bin/pip install --quiet -r requirements.txt

# Agent files
echo "${mainB64}" | base64 -d > main.py
echo "${leoB64}" | base64 -d > agent_leo.py
${noraB64 ? `echo "${noraB64}" | base64 -d > agent_nora.py` : ""}

# Environment
cat > /opt/nawa-agent/.env << 'ENVEOF'
NAWA_AGENT_SECRET=${secret}
OPENROUTER_API_KEY=${openrouterKey}
TAVILY_API_KEY=${tavilyKey}
AGENT_LEVEL=${level}
NEXT_PUBLIC_SITE_URL=${siteUrl}
ENVEOF

chmod 600 /opt/nawa-agent/.env

# Systemd service
cat > /etc/systemd/system/nawa-agent.service << 'SVCEOF'
[Unit]
Description=Nawa Agent
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/nawa-agent
EnvironmentFile=/opt/nawa-agent/.env
ExecStart=/opt/nawa-agent/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5
StandardOutput=append:/opt/nawa-agent/logs/agent.log
StandardError=append:/opt/nawa-agent/logs/agent.log

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable nawa-agent
systemctl start nawa-agent

echo "[nawa] Agent started, waiting for warmup..."
sleep 15

# Health check
for i in 1 2 3; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "[nawa] Agent healthy"
    break
  fi
  echo "[nawa] Attempt $i failed (status=$STATUS), retrying..."
  sleep 10
done

# Report back to Nawa
VPS_IP=$(curl -s --max-time 5 https://api.ipify.org || curl -s --max-time 5 https://ifconfig.me)
curl -s -X POST "${siteUrl}/api/provisioning-webhook" \\
  -H "Content-Type: application/json" \\
  -H "X-Nawa-Secret: ${secret}" \\
  -d "{\\"user_id\\":\\"${userId}\\",\\"ip\\":\\"$VPS_IP\\"}"

echo "[nawa] Setup complete — ip=$VPS_IP"
`
}

// ── Hostinger VPS creation ────────────────────────────────────────────────────

interface VpsCreateResult {
  vps_id: string
}

export async function createVps(
  userId: string,
  level: "leo" | "nora"
): Promise<VpsCreateResult> {
  const hostname = `nawa-${userId.slice(0, 8)}`
  const plan = level === "leo" ? "KVM_1" : "KVM_2"
  const cloudInit = buildCloudInit(userId, level)

  const resp = await fetch(`${HOSTINGER_API}/virtual-machines`, {
    method: "POST",
    headers: hostingerHeaders(),
    body: JSON.stringify({
      plan,
      region: "eu-west-1",
      hostname,
      ssh_key_ids: [Number(process.env.HOSTINGER_SSH_KEY_ID)],
      os: "ubuntu-22-04",
      user_data: Buffer.from(cloudInit).toString("base64"),
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Hostinger create VPS failed: ${resp.status} — ${err}`)
  }

  const data = await resp.json()
  return { vps_id: String(data.id ?? data.virtual_machine?.id) }
}

// ── Background provisioning (called fire-and-forget from /api/subscribe) ─────

export async function provisionInBackground(
  userId: string,
  level: "leo" | "nora"
): Promise<void> {
  const sb = supabaseAdmin()

  try {
    // Create VPS (fast — Hostinger API just queues it)
    const { vps_id } = await createVps(userId, level)

    await sb
      .from("profiles")
      .update({ vps_id, vps_status: "provisioning" })
      .eq("user_id", userId)
  } catch (err) {
    console.error("[vps] provisionInBackground error:", err)
    await sb
      .from("profiles")
      .update({ vps_status: "error" })
      .eq("user_id", userId)
  }
}
