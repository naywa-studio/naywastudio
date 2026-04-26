/**
 * Nawa Agent Deployment Script
 * Usage: node scripts/deploy-agents.mjs <vps-ip> [level]
 * level: leo | nora (default: nora)
 *
 * Deploys Nawa agents to an existing VPS via SSH.
 * The VPS must already be running Ubuntu 24.04 with SSH access.
 */

import { readFileSync, existsSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"
import { NodeSSH } from "node-ssh"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = join(ROOT, ".env.local")
if (!existsSync(envPath)) throw new Error(".env.local not found")
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const t = line.trim()
  if (!t || t.startsWith("#")) continue
  const eq = t.indexOf("=")
  if (eq < 1) continue
  const k = t.slice(0, eq).trim()
  const v = t.slice(eq + 1).trim()
  if (!process.env[k]) process.env[k] = v
}

const vpsIp = process.argv[2]
const level = process.argv[3] || "nora"
const ADMIN_EMAIL = "elyas.malki1003@gmail.com"

if (!vpsIp) {
  console.error("Usage: node scripts/deploy-agents.mjs <vps-ip> [level]")
  console.error("Example: node scripts/deploy-agents.mjs 195.179.100.50 nora")
  process.exit(1)
}

const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`)

async function deployAgentViaSsh() {
  const privateKey    = Buffer.from(process.env.AGENT_VPS_SSH_KEY, "base64").toString("utf-8")
  const secret        = process.env.NAWA_AGENT_SECRET
  const openrouterKey = process.env.OPENROUTER_API_KEY
  const googleApiKey  = process.env.GOOGLE_SEARCH_API_KEY
  const googleCx      = process.env.GOOGLE_SEARCH_ENGINE_ID
  const siteUrl       = process.env.NEXT_PUBLIC_SITE_URL

  const ssh = new NodeSSH()

  log(`Connecting SSH to ${vpsIp}...`)
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      await ssh.connect({ host: vpsIp, username: "root", privateKey, readyTimeout: 20000 })
      log("SSH connected!")
      break
    } catch (e) {
      if (attempt === 8) throw new Error(`SSH failed after 8 attempts: ${e}`)
      log(`SSH attempt ${attempt}/8 failed, retrying in 10s... (${e.message})`)
      await new Promise(r => setTimeout(r, 10000))
    }
  }

  try {
    log("Installing system packages...")
    await ssh.execCommand("apt-get update -qq && apt-get install -y python3 python3-pip python3-venv")

    log("Creating agent directory...")
    await ssh.execCommand("mkdir -p /opt/nawa-agent/logs")

    log("Uploading agent files...")
    const tpl = join(ROOT, "src", "lib", "agent-templates")
    await ssh.putFile(join(tpl, "main.py"),          "/opt/nawa-agent/main.py")
    await ssh.putFile(join(tpl, "agent_leo.py"),     "/opt/nawa-agent/agent_leo.py")
    await ssh.putFile(join(tpl, "requirements.txt"), "/opt/nawa-agent/requirements.txt")
    if (level === "nora" || level === "alex") {
      await ssh.putFile(join(tpl, "agent_nora.py"),  "/opt/nawa-agent/agent_nora.py")
    }
    log("Files uploaded.")

    log("Creating venv + installing Python dependencies (~1-2 min)...")
    const { stderr: pipErr } = await ssh.execCommand(
      "python3 -m venv /opt/nawa-agent/venv && " +
      "/opt/nawa-agent/venv/bin/pip install --quiet -r /opt/nawa-agent/requirements.txt"
    )
    if (pipErr && !pipErr.includes("WARNING") && !pipErr.includes("notice")) {
      log("[pip] " + pipErr.slice(0, 200))
    }
    log("Dependencies installed.")

    log("Writing .env...")
    const envLines = [
      `NAWA_AGENT_SECRET=${secret}`,
      `OPENROUTER_API_KEY=${openrouterKey}`,
      `GOOGLE_SEARCH_API_KEY=${googleApiKey}`,
      `GOOGLE_SEARCH_ENGINE_ID=${googleCx}`,
      `AGENT_LEVEL=${level}`,
      `NEXT_PUBLIC_SITE_URL=${siteUrl}`,
    ].join("\n")
    await ssh.execCommand(
      `printf '%s\n' '${envLines.replace(/'/g, "'\\''")}' > /opt/nawa-agent/.env && chmod 600 /opt/nawa-agent/.env`
    )

    log("Creating systemd service...")
    const svc = `[Unit]
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
WantedBy=multi-user.target`

    await ssh.execCommand(`cat > /etc/systemd/system/nawa-agent.service << 'EOF'\n${svc}\nEOF`)
    await ssh.execCommand("systemctl daemon-reload && systemctl enable nawa-agent && systemctl start nawa-agent")
    log("Service started.")

    log("Health check (up to 90s)...")
    let healthy = false
    for (let i = 0; i < 9; i++) {
      await new Promise(r => setTimeout(r, 10000))
      const { stdout } = await ssh.execCommand(
        "curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/health || echo 000"
      )
      log(`Health ${i + 1}/9: ${stdout.trim()}`)
      if (stdout.trim() === "200") { healthy = true; break }
    }

    if (!healthy) {
      const { stdout: agentLog } = await ssh.execCommand("tail -30 /opt/nawa-agent/logs/agent.log 2>/dev/null || journalctl -u nawa-agent -n 30 --no-pager")
      log("Agent logs:\n" + agentLog)
      throw new Error("Agent health check failed after 90s")
    }

    log("Agent healthy! ✅")
    return true
  } finally {
    ssh.dispose()
  }
}

async function main() {
  console.log(`\n🚀 Nawa Agent Deployment`)
  console.log(`   VPS IP : ${vpsIp}`)
  console.log(`   Level  : ${level}\n`)

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  // Get user
  const { data } = await sb.auth.admin.listUsers()
  const user = data?.users?.find(u => u.email === ADMIN_EMAIL)
  if (!user) throw new Error(`User ${ADMIN_EMAIL} not found`)
  const userId = user.id
  log(`User: ${ADMIN_EMAIL} (${userId})`)

  // Update DB
  await sb.from("profiles").update({
    subscription_level: level,
    subscribed_at: new Date().toISOString(),
    vps_ip: vpsIp,
    vps_status: "provisioning",
    agent_status: "deploying",
  }).eq("user_id", userId)

  // Deploy
  await deployAgentViaSsh()

  // Mark ready
  await sb.from("profiles").update({
    vps_status: "ready",
    agent_status: "running",
  }).eq("user_id", userId)

  console.log(`\n✅ Déploiement terminé !`)
  console.log(`   IP     : ${vpsIp}`)
  console.log(`   Level  : ${level}`)
  console.log(`   Health : http://${vpsIp}:8000/health`)
  console.log(`\n🎉 Tes agents sont prêts !\n`)
}

main().catch(err => {
  console.error("\n❌ Déploiement échoué:", err.message || err)
  process.exit(1)
})
