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

function buildCloudInit(userId: string, level: "leo" | "nora" | "alex"): string {
  const mainB64 = toB64(readTemplate("main.py"))
  const leoB64 = toB64(readTemplate("agent_leo.py"))
  const noraB64 = (level === "nora" || level === "alex") ? toB64(readTemplate("agent_nora.py")) : null
  const alexB64 = level === "alex" ? toB64(readTemplate("agent_alex.py")) : null
  const reqB64 = toB64(readTemplate("requirements.txt"))

  const secret = process.env.NAWA_AGENT_SECRET!
  const openrouterKey = process.env.OPENROUTER_API_KEY!
  const googleApiKey = process.env.GOOGLE_SEARCH_API_KEY!
  const googleCx = process.env.GOOGLE_SEARCH_ENGINE_ID!
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
${alexB64 ? `echo "${alexB64}" | base64 -d > agent_alex.py` : ""}

# Environment
cat > /opt/nawa-agent/.env << 'ENVEOF'
NAWA_AGENT_SECRET=${secret}
OPENROUTER_API_KEY=${openrouterKey}
GOOGLE_SEARCH_API_KEY=${googleApiKey}
GOOGLE_SEARCH_ENGINE_ID=${googleCx}
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
//
// Hostinger VPS API v1 flow (2-step):
//   1. POST /api/billing/v1/orders  → creates subscription + VPS shell
//      Body: { item_id: "hostingercom-vps-kvm1"|"hostingercom-vps-kvm2" }
//      Returns: { subscription_id, ... } → VPS shows up at GET /vps/v1/virtual-machines
//
//   2. POST /vps/v1/virtual-machines/{id}/setup → installs OS + SSH key
//      Body: { template_id: 1077 (Ubuntu 24.04), data_center_id: 19 (Frankfurt),
//              public_key_ids: [SSH_KEY_ID], hostname }
//      After this: poll GET /vps/v1/virtual-machines/{id} until state=="running"
//
//   3. SSH in → run buildCloudInit() script (agent files too large for post-install)
//      Uses AGENT_VPS_SSH_KEY (base64-encoded ed25519 private key, no passphrase)
//
// Note: cloud-init user_data is NOT supported by Hostinger VPS API v1.
//       Post-install scripts have a ~90KB size limit (our agent bundle ~93KB).
//       Deployment is done via SSH after VPS is ready (see scripts/provision-admin.mjs).

// Hostinger template IDs (GET /vps/v1/templates)
const TEMPLATE_UBUNTU_24 = 1077
// Hostinger data center IDs (GET /vps/v1/data-centers)
const DC_FRANKFURT = 19
// Hostinger catalog item IDs (GET /api/billing/v1/catalog)
const PLAN_IDS = { leo: "hostingercom-vps-kvm1", nora: "hostingercom-vps-kvm2", alex: "hostingercom-vps-kvm2" } as const

interface VpsCreateResult {
  vps_id: string
  vps_ip?: string
}

export async function createVps(
  userId: string,
  level: "leo" | "nora" | "alex"
): Promise<VpsCreateResult> {
  const hostname = `nawa-${userId.slice(0, 8)}`
  const sshKeyId = Number(process.env.HOSTINGER_SSH_KEY_ID)

  // Step 1 — Create billing order (purchases the VPS subscription)
  const orderResp = await fetch("https://developers.hostinger.com/api/billing/v1/orders", {
    method: "POST",
    headers: hostingerHeaders(),
    body: JSON.stringify({ item_id: PLAN_IDS[level] }),
  })

  if (!orderResp.ok) {
    const err = await orderResp.text()
    throw new Error(`Hostinger billing order failed: ${orderResp.status} — ${err}`)
  }

  // Step 2 — Find the newly created VPS (it appears in the VM list within seconds)
  await new Promise(r => setTimeout(r, 5000))
  const vmsResp = await fetch(`${HOSTINGER_API}/virtual-machines`, { headers: hostingerHeaders() })
  const vms = await vmsResp.json() as Array<{ id: number; state: string; hostname: string; subscription_id?: string }>
  const newVm = vms.find(v => v.state === "initial" || v.hostname === hostname || v.hostname.startsWith("srv"))
  if (!newVm) throw new Error("Could not locate newly created VPS")

  const vpsId = String(newVm.id)

  // Step 3 — Set up OS + SSH key
  const setupResp = await fetch(`${HOSTINGER_API}/virtual-machines/${vpsId}/setup`, {
    method: "POST",
    headers: hostingerHeaders(),
    body: JSON.stringify({
      template_id: TEMPLATE_UBUNTU_24,
      data_center_id: DC_FRANKFURT,
      public_key_ids: [sshKeyId],
      hostname,
    }),
  })

  if (!setupResp.ok) {
    const err = await setupResp.text()
    throw new Error(`Hostinger VPS setup failed: ${setupResp.status} — ${err}`)
  }

  return { vps_id: vpsId }
}

// ── Poll VPS until running ────────────────────────────────────────────────────

async function waitForVpsReady(vpsId: string, timeoutMs = 300_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 15_000))
    const r = await fetch(`${HOSTINGER_API}/virtual-machines/${vpsId}`, { headers: hostingerHeaders() })
    if (!r.ok) continue
    const vm = await r.json() as { state: string; actions_lock: string; ipv4?: Array<{ address: string }> }
    if (vm.state === "running" && vm.actions_lock === "unlocked") {
      return vm.ipv4?.[0]?.address ?? ""
    }
  }
  throw new Error("VPS did not become ready within timeout")
}

// ── SSH agent deployment ──────────────────────────────────────────────────────
//
// After VPS is running, we SSH in and deploy the agent files.
// Requires: AGENT_VPS_SSH_KEY (base64 ed25519 private key, no passphrase)
// TODO: implement with node-ssh once added to package.json dependencies.
// For now, manual deployment via scripts/provision-admin.mjs.

// ── Background provisioning (called fire-and-forget from /api/subscribe) ─────

export async function provisionInBackground(
  userId: string,
  level: "leo" | "nora" | "alex"
): Promise<void> {
  const sb = supabaseAdmin()

  try {
    // Step 1: Create VPS via Hostinger billing + setup API
    const { vps_id } = await createVps(userId, level)
    await sb.from("profiles").update({ vps_id, vps_status: "provisioning" }).eq("user_id", userId)

    // Step 2: Wait for VPS to be running (OS setup ~2-5 min)
    const vpsIp = await waitForVpsReady(vps_id)
    if (!vpsIp) throw new Error("VPS IP not available after setup")

    // Step 3: SSH deploy agent files
    // TODO: automated SSH deployment (see scripts/provision-admin.mjs for manual reference)
    // For now we mark as "deploying" — admin must run the deploy script manually.
    await sb
      .from("profiles")
      .update({ vps_ip: vpsIp, vps_status: "provisioning", agent_status: "not_deployed" })
      .eq("user_id", userId)

    console.log(`[vps] VPS ${vps_id} ready at ${vpsIp} — SSH deploy required`)
  } catch (err) {
    console.error("[vps] provisionInBackground error:", err)
    await sb.from("profiles").update({ vps_status: "error" }).eq("user_id", userId)
  }
}
