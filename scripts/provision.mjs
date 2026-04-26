/**
 * Nawa VPS Provisioning Script — Run locally, no timeout
 * Usage: node scripts/provision.mjs [level]
 * level: leo | nora (default: nora)
 *
 * Reads credentials from .env.local
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

// ── Config ───────────────────────────────────────────────────────────────────
const ADMIN_EMAIL     = "elyas.malki1003@gmail.com"
const level           = process.argv[2] || "nora"
const HOSTINGER_API   = "https://developers.hostinger.com/api/vps/v1"
const TEMPLATE_UBUNTU = 1077  // Ubuntu 24.04
const DC_FRANKFURT    = 19
const PLAN_IDS        = { leo: "hostingercom-vps-kvm1", nora: "hostingercom-vps-kvm2", alex: "hostingercom-vps-kvm2" }

const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`)

function hHeaders() {
  return { Authorization: `Bearer ${process.env.HOSTINGER_API_TOKEN}`, "Content-Type": "application/json" }
}

// ── Step 1: Create VPS ───────────────────────────────────────────────────────
async function createVps(userId) {
  const hostname = `nawa-${userId.slice(0, 8)}`

  log(`Creating Hostinger VPS order (plan: ${PLAN_IDS[level]})...`)
  const orderResp = await fetch("https://developers.hostinger.com/api/billing/v1/orders", {
    method: "POST",
    headers: hHeaders(),
    body: JSON.stringify({ item_id: PLAN_IDS[level] }),
  })
  if (!orderResp.ok) {
    const err = await orderResp.text()
    throw new Error(`Billing order failed: ${orderResp.status} — ${err}`)
  }
  log("Billing order created. Waiting 5s for VPS to appear...")
  await new Promise(r => setTimeout(r, 5000))

  const vmsResp = await fetch(`${HOSTINGER_API}/virtual-machines`, { headers: hHeaders() })
  const vms = await vmsResp.json()
  const newVm = vms.find(v => v.state === "initial" || v.hostname === hostname || v.hostname.startsWith("srv"))
  if (!newVm) {
    log("VMs found: " + JSON.stringify(vms.map(v => ({ id: v.id, hostname: v.hostname, state: v.state }))))
    throw new Error("Could not locate newly created VPS")
  }
  const vpsId = String(newVm.id)
  log(`VPS found: id=${vpsId}, hostname=${newVm.hostname}`)

  log("Setting up Ubuntu 24.04 + SSH key...")
  const setupResp = await fetch(`${HOSTINGER_API}/virtual-machines/${vpsId}/setup`, {
    method: "POST",
    headers: hHeaders(),
    body: JSON.stringify({
      template_id: TEMPLATE_UBUNTU,
      data_center_id: DC_FRANKFURT,
      public_key_ids: [Number(process.env.HOSTINGER_SSH_KEY_ID)],
      hostname,
    }),
  })
  if (!setupResp.ok) {
    const err = await setupResp.text()
    throw new Error(`VPS setup failed: ${setupResp.status} — ${err}`)
  }
  log("OS setup initiated (takes 3-5 min)...")
  return vpsId
}

// ── Step 2: Wait for VPS ready ───────────────────────────────────────────────
async function waitForVpsReady(vpsId) {
  const deadline = Date.now() + 360_000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 15_000))
    const r = await fetch(`${HOSTINGER_API}/virtual-machines/${vpsId}`, { headers: hHeaders() })
    if (!r.ok) continue
    const vm = await r.json()
    log(`VPS state: ${vm.state}, lock: ${vm.actions_lock}`)
    if (vm.state === "running" && vm.actions_lock === "unlocked") {
      const ip = vm.ipv4?.[0]?.address ?? ""
      log(`VPS ready! IP: ${ip}`)
      return ip
    }
  }
  throw new Error("VPS did not become ready within 6 minutes")
}

// ── Step 3: SSH deploy ───────────────────────────────────────────────────────
async function deployAgentViaSsh(vpsIp) {
  const privateKey    = Buffer.from(process.env.AGENT_VPS_SSH_KEY, "base64").toString("utf-8")
  const secret        = process.env.NAWA_AGENT_SECRET
  const openrouterKey = process.env.OPENROUTER_API_KEY
  const googleApiKey  = process.env.GOOGLE_SEARCH_API_KEY
  const googleCx      = process.env.GOOGLE_SEARCH_ENGINE_ID
  const siteUrl       = process.env.NEXT_PUBLIC_SITE_URL

  const ssh = new NodeSSH()

  log(`Connecting SSH to ${vpsIp}...`)
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await ssh.connect({ host: vpsIp, username: "root", privateKey, readyTimeout: 20000 })
      log("SSH connected!")
      break
    } catch (e) {
      if (attempt === 10) throw new Error(`SSH failed after 10 attempts: ${e}`)
      log(`SSH attempt ${attempt} failed, retrying in 15s... (${e.message})`)
      await new Promise(r => setTimeout(r, 15000))
    }
  }

  try {
    log("Installing system packages (apt-get)...")
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
    if (level === "alex") {
      await ssh.putFile(join(tpl, "agent_alex.py"),  "/opt/nawa-agent/agent_alex.py")
    }
    log("Files uploaded.")

    log("Creating Python venv + installing dependencies (~1-2 min)...")
    const { stderr: pipErr } = await ssh.execCommand(
      "python3 -m venv /opt/nawa-agent/venv && " +
      "/opt/nawa-agent/venv/bin/pip install --quiet -r /opt/nawa-agent/requirements.txt",
      { execOptions: { pty: false } }
    )
    if (pipErr && !pipErr.includes("WARNING") && !pipErr.includes("notice")) {
      log("[pip stderr] " + pipErr.slice(0, 300))
    }
    log("Dependencies installed.")

    log("Writing .env file...")
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
    const serviceUnit = `[Unit]
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

    await ssh.execCommand(`cat > /etc/systemd/system/nawa-agent.service << 'SVCEOF'\n${serviceUnit}\nSVCEOF`)
    await ssh.execCommand("systemctl daemon-reload && systemctl enable nawa-agent && systemctl start nawa-agent")
    log("Service started.")

    log("Waiting for agent health check (up to 80s)...")
    let healthy = false
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 10000))
      const { stdout } = await ssh.execCommand(
        "curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/health || echo 000"
      )
      log(`Health check ${i + 1}/8: ${stdout.trim()}`)
      if (stdout.trim() === "200") { healthy = true; break }
    }

    if (!healthy) {
      const { stdout: agentLog } = await ssh.execCommand("tail -30 /opt/nawa-agent/logs/agent.log 2>/dev/null || echo 'no logs'")
      log("Agent log:\n" + agentLog)
      throw new Error("Agent health check failed")
    }

    log("Agent is healthy! ✅")
    return true
  } finally {
    ssh.dispose()
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 Nawa VPS Provisioning — level: ${level}\n`)

  if (!PLAN_IDS[level]) throw new Error(`Invalid level: ${level}. Use: leo | nora | alex`)

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  // Get user ID
  const { data } = await sb.auth.admin.listUsers()
  const user = data?.users?.find(u => u.email === ADMIN_EMAIL)
  if (!user) throw new Error(`User ${ADMIN_EMAIL} not found in Supabase`)
  const userId = user.id
  log(`User: ${ADMIN_EMAIL} (${userId})`)

  // Reset profile state
  await sb.from("profiles").update({
    subscription_level: level,
    subscribed_at: new Date().toISOString(),
    vps_status: "pending",
    agent_status: "not_deployed",
    vps_id: null,
    vps_ip: null,
  }).eq("user_id", userId)

  // Step 1: Create VPS
  const vpsId = await createVps(userId)
  await sb.from("profiles").update({ vps_id: vpsId, vps_status: "provisioning" }).eq("user_id", userId)

  // Step 2: Wait for VPS
  const vpsIp = await waitForVpsReady(vpsId)
  await sb.from("profiles").update({ vps_ip: vpsIp, agent_status: "deploying" }).eq("user_id", userId)

  // Step 3: SSH deploy
  await deployAgentViaSsh(vpsIp)

  // Step 4: Mark ready
  await sb.from("profiles").update({ vps_status: "ready", agent_status: "running" }).eq("user_id", userId)

  console.log(`\n✅ Provisioning complete!`)
  console.log(`   IP     : ${vpsIp}`)
  console.log(`   Level  : ${level}`)
  console.log(`   Health : http://${vpsIp}:8000/health`)
  console.log(`\n🎉 Tes agents sont prêts !\n`)
}

main().catch(err => {
  console.error("\n❌ Provisioning failed:", err.message || err)
  process.exit(1)
})
