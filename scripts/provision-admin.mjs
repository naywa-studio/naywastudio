/**
 * One-off script: provision the admin VPS on Hostinger with all 3 agents.
 * Run: node scripts/provision-admin.mjs
 */

import { readFileSync } from "fs"
import { join } from "path"

// ── Load env vars ─────────────────────────────────────────────────────────────
const envRaw = readFileSync(".env.local", "utf-8")
const get = (k) => {
  const m = envRaw.match(new RegExp(`^${k}=(.+)`, "m"))
  return m ? m[1].trim() : ""
}

const HOSTINGER_TOKEN = get("HOSTINGER_API_TOKEN")
const SSH_KEY_ID      = parseInt(get("HOSTINGER_SSH_KEY_ID"))
const SECRET          = get("NAWA_AGENT_SECRET")
const OR_KEY          = get("OPENROUTER_API_KEY")
const TAVILY_KEY      = get("TAVILY_API_KEY")
const SITE_URL        = get("NEXT_PUBLIC_SITE_URL")
const SB_URL          = get("NEXT_PUBLIC_SUPABASE_URL")
const SB_SERVICE      = get("SUPABASE_SERVICE_ROLE_KEY")

const USER_ID = "a66360fb-9616-4b79-81d5-1155d146482e"
const LEVEL   = "alex"

// ── Read agent files ──────────────────────────────────────────────────────────
const tpl = (f) => join("src", "lib", "agent-templates", f)
const b64 = (f) => Buffer.from(readFileSync(tpl(f), "utf-8")).toString("base64")

const mainB64 = b64("main.py")
const leoB64  = b64("agent_leo.py")
const noraB64 = b64("agent_nora.py")
const alexB64 = b64("agent_alex.py")
const reqB64  = b64("requirements.txt")

// ── Build cloud-init (no template literal bash vars — use concatenation) ──────
const cloudInit = [
  "#!/bin/bash",
  "set -e",
  "exec > /var/log/nawa-setup.log 2>&1",
  `echo "[nawa] Starting setup for user ${USER_ID} level ${LEVEL}"`,
  "apt-get update -qq",
  "apt-get install -y python3 python3-pip python3-venv curl",
  "mkdir -p /opt/nawa-agent/logs",
  "cd /opt/nawa-agent",
  "python3 -m venv venv",
  `echo "${reqB64}" | base64 -d > requirements.txt`,
  "/opt/nawa-agent/venv/bin/pip install --quiet -r requirements.txt",
  `echo "${mainB64}" | base64 -d > main.py`,
  `echo "${leoB64}" | base64 -d > agent_leo.py`,
  `echo "${noraB64}" | base64 -d > agent_nora.py`,
  `echo "${alexB64}" | base64 -d > agent_alex.py`,
  // Write .env using printf to avoid heredoc issues
  `printf 'NAWA_AGENT_SECRET=${SECRET}\\nOPENROUTER_API_KEY=${OR_KEY}\\nTAVILY_API_KEY=${TAVILY_KEY}\\nAGENT_LEVEL=${LEVEL}\\nNEXT_PUBLIC_SITE_URL=${SITE_URL}\\n' > /opt/nawa-agent/.env`,
  "chmod 600 /opt/nawa-agent/.env",
  // Systemd service
  "cat > /etc/systemd/system/nawa-agent.service << 'SVCEOF'",
  "[Unit]",
  "Description=Nawa Agent",
  "After=network.target",
  "",
  "[Service]",
  "Type=simple",
  "WorkingDirectory=/opt/nawa-agent",
  "EnvironmentFile=/opt/nawa-agent/.env",
  "ExecStart=/opt/nawa-agent/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000",
  "Restart=always",
  "RestartSec=5",
  "StandardOutput=append:/opt/nawa-agent/logs/agent.log",
  "StandardError=append:/opt/nawa-agent/logs/agent.log",
  "",
  "[Install]",
  "WantedBy=multi-user.target",
  "SVCEOF",
  "systemctl daemon-reload",
  "systemctl enable nawa-agent",
  "systemctl start nawa-agent",
  'echo "[nawa] Agent started, waiting for warmup..."',
  "sleep 15",
  // Health check
  "for i in 1 2 3; do",
  '  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health || echo "000")',
  '  if [ "$STATUS" = "200" ]; then',
  '    echo "[nawa] Agent healthy"',
  "    break",
  "  fi",
  '  echo "[nawa] Attempt $i failed, retrying..."',
  "  sleep 10",
  "done",
  // Webhook
  "VPS_IP=$(curl -s --max-time 5 https://api.ipify.org || curl -s --max-time 5 https://ifconfig.me)",
  `curl -s -X POST "${SITE_URL}/api/provisioning-webhook" \\`,
  `  -H "Content-Type: application/json" \\`,
  `  -H "X-Nawa-Secret: ${SECRET}" \\`,
  `  -d "{\\"user_id\\":\\"${USER_ID}\\",\\"ip\\":\\"$VPS_IP\\"}"`,
  'echo "[nawa] Setup complete"',
].join("\n")

// ── Create VPS ────────────────────────────────────────────────────────────────
async function run() {
  console.log("🚀 Création VPS Hostinger (KVM_2, eu-west-1, ubuntu-22-04)...")
  console.log(`   SSH key ID : ${SSH_KEY_ID}`)
  console.log(`   Webhook    : ${SITE_URL}/api/provisioning-webhook`)

  const resp = await fetch("https://developers.hostinger.com/api/vps/v1/virtual-machines", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HOSTINGER_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan: "KVM_2",
      region: "eu-west-1",
      hostname: "nawa-admin",
      ssh_key_ids: [SSH_KEY_ID],
      os: "ubuntu-22-04",
      user_data: Buffer.from(cloudInit).toString("base64"),
    }),
  })

  const text = await resp.text()
  if (!resp.ok) {
    console.error("❌ Erreur Hostinger:", resp.status, text)
    return
  }

  const data = JSON.parse(text)
  console.log("✅ VPS créé !")
  console.log("   Réponse:", JSON.stringify(data, null, 2))

  const vpsId = String(data.id ?? data.virtual_machine?.id ?? "unknown")

  // Update Supabase profile
  const upResp = await fetch(`${SB_URL}/rest/v1/profiles?user_id=eq.${USER_ID}`, {
    method: "PATCH",
    headers: {
      apikey: SB_SERVICE,
      Authorization: `Bearer ${SB_SERVICE}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      vps_id: vpsId,
      vps_status: "provisioning",
      agent_status: "not_deployed",
      vps_ip: null,
    }),
  })

  if (upResp.ok) {
    console.log("✅ Supabase → vps_status: provisioning, vps_id:", vpsId)
    console.log("")
    console.log("⏳ Le VPS est en cours de démarrage (5-10 min).")
    console.log("   Le webhook appelera automatiquement /api/provisioning-webhook")
    console.log("   une fois l'agent démarré et l'IP sera mise à jour.")
  } else {
    console.error("❌ Supabase update error:", await upResp.text())
  }
}

run().catch(console.error)
