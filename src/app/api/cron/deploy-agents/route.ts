/**
 * GET /api/cron/deploy-agents
 * Vercel Cron — runs every 2 minutes.
 * Finds VPS in "provisioning" state → polls Hostinger → when running, SSH-deploys agents.
 *
 * SSH deploy stays under 60s by launching pip install as a background systemd
 * oneshot job; uvicorn starts automatically once pip finishes.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { NodeSSH } from "node-ssh"
import { join } from "path"
import { readFileSync } from "fs"
import type { Database } from "@/lib/database.types"

const HOSTINGER_API = "https://developers.hostinger.com/api/vps/v1"

function hHeaders() {
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

function readTemplate(filename: string): string {
  return readFileSync(join(process.cwd(), "src", "lib", "agent-templates", filename), "utf-8")
}

// ── Check if Hostinger VPS is running ─────────────────────────────────────────
async function getVpsState(vpsId: string): Promise<{ state: string; ip: string }> {
  const r = await fetch(`${HOSTINGER_API}/virtual-machines/${vpsId}`, { headers: hHeaders() })
  if (!r.ok) return { state: "unknown", ip: "" }
  const vm = await r.json() as { state: string; actions_lock: string; ipv4?: Array<{ address: string }> }
  const ready = vm.state === "running" && vm.actions_lock === "unlocked"
  return { state: ready ? "ready" : vm.state, ip: vm.ipv4?.[0]?.address ?? "" }
}

// ── Fast SSH deploy (< 55s) ───────────────────────────────────────────────────
// pip install runs as a background systemd oneshot service.
// The main nawa-agent service declares After=nawa-pip.service so it waits.
async function fastSshDeploy(vpsIp: string, level: "leo" | "nora" | "alex"): Promise<void> {
  const privateKey    = Buffer.from(process.env.AGENT_VPS_SSH_KEY!, "base64").toString("utf-8")
  const secret        = process.env.NAWA_AGENT_SECRET!
  const openrouterKey = process.env.OPENROUTER_API_KEY!
  const googleApiKey  = process.env.GOOGLE_SEARCH_API_KEY!
  const googleCx      = process.env.GOOGLE_SEARCH_ENGINE_ID!
  const siteUrl       = process.env.NEXT_PUBLIC_SITE_URL!

  const ssh = new NodeSSH()

  // SSH connect with retries
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await ssh.connect({ host: vpsIp, username: "root", privateKey, readyTimeout: 15000 })
      break
    } catch (e) {
      if (attempt === 4) throw new Error(`SSH connection failed: ${e}`)
      await new Promise(r => setTimeout(r, 8000))
    }
  }

  try {
    // 1. System packages (fast with cache)
    await ssh.execCommand("apt-get update -qq && apt-get install -y python3 python3-pip python3-venv")

    // 2. Agent directory
    await ssh.execCommand("mkdir -p /opt/nawa-agent/logs")

    // 3. Upload files
    const tpl = join(process.cwd(), "src", "lib", "agent-templates")
    await ssh.putFile(join(tpl, "main.py"),          "/opt/nawa-agent/main.py")
    await ssh.putFile(join(tpl, "agent_leo.py"),     "/opt/nawa-agent/agent_leo.py")
    await ssh.putFile(join(tpl, "requirements.txt"), "/opt/nawa-agent/requirements.txt")
    if (level === "nora" || level === "alex") {
      await ssh.putFile(join(tpl, "agent_nora.py"),  "/opt/nawa-agent/agent_nora.py")
    }
    if (level === "alex") {
      await ssh.putFile(join(tpl, "agent_alex.py"),  "/opt/nawa-agent/agent_alex.py")
    }

    // 4. Create venv (fast, ~3s)
    await ssh.execCommand("python3 -m venv /opt/nawa-agent/venv")

    // 5. .env file
    const envContent = [
      `NAWA_AGENT_SECRET=${secret}`,
      `OPENROUTER_API_KEY=${openrouterKey}`,
      `GOOGLE_SEARCH_API_KEY=${googleApiKey}`,
      `GOOGLE_SEARCH_ENGINE_ID=${googleCx}`,
      `AGENT_LEVEL=${level}`,
      `NEXT_PUBLIC_SITE_URL=${siteUrl}`,
    ].join("\n")
    await ssh.execCommand(
      `printf '%s\n' '${envContent.replace(/'/g, "'\\''")}' > /opt/nawa-agent/.env && chmod 600 /opt/nawa-agent/.env`
    )

    // 6. Pip install as background systemd oneshot (doesn't block SSH)
    const pipService = `[Unit]
Description=Nawa Agent pip install
After=network.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/opt/nawa-agent/venv/bin/pip install --quiet -r /opt/nawa-agent/requirements.txt
StandardOutput=append:/opt/nawa-agent/logs/pip.log
StandardError=append:/opt/nawa-agent/logs/pip.log

[Install]
WantedBy=multi-user.target`

    await ssh.execCommand(`cat > /etc/systemd/system/nawa-pip.service << 'EOF'\n${pipService}\nEOF`)

    // 7. Main agent service (waits for pip)
    const agentService = `[Unit]
Description=Nawa Agent
After=nawa-pip.service
Requires=nawa-pip.service

[Service]
Type=simple
WorkingDirectory=/opt/nawa-agent
EnvironmentFile=/opt/nawa-agent/.env
ExecStart=/opt/nawa-agent/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10
StandardOutput=append:/opt/nawa-agent/logs/agent.log
StandardError=append:/opt/nawa-agent/logs/agent.log

[Install]
WantedBy=multi-user.target`

    await ssh.execCommand(`cat > /etc/systemd/system/nawa-agent.service << 'EOF'\n${agentService}\nEOF`)

    // 8. Enable + start (pip runs in background, agent starts when pip is done)
    await ssh.execCommand(
      "systemctl daemon-reload && " +
      "systemctl enable nawa-pip.service nawa-agent.service && " +
      "systemctl start nawa-pip.service nawa-agent.service"
    )

    console.log(`[cron/deploy-agents] SSH deploy launched for ${vpsIp} — pip installing in background`)
  } finally {
    ssh.dispose()
  }
}

// ── Check agent health ────────────────────────────────────────────────────────
async function checkAgentHealth(vpsIp: string): Promise<boolean> {
  try {
    const r = await fetch(`http://${vpsIp}:8000/health`, { signal: AbortSignal.timeout(5000) })
    return r.ok
  } catch {
    return false
  }
}

// ── Cron handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Verify Vercel cron secret
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sb = supabaseAdmin()

  // Find profiles with VPS in provisioning state
  const { data: profiles } = await sb
    .from("profiles")
    .select("user_id, vps_id, vps_ip, vps_status, agent_status, subscription_level")
    .in("vps_status", ["provisioning", "ready"])
    .in("agent_status", ["not_deployed", "deploying", "running"])

  if (!profiles?.length) {
    return NextResponse.json({ ok: true, message: "No VPS to process" })
  }

  const results: string[] = []

  for (const profile of profiles) {
    const { user_id, vps_id, vps_ip, vps_status, agent_status, subscription_level } = profile
    const level = (subscription_level ?? "leo") as "leo" | "nora" | "alex"

    try {
      // ── Case 1: VPS provisioning, no IP yet → poll Hostinger ─────────────
      if (vps_status === "provisioning" && !vps_ip && vps_id) {
        const { state, ip } = await getVpsState(vps_id)
        if (state === "ready" && ip) {
          await sb.from("profiles").update({ vps_ip: ip, agent_status: "deploying" }).eq("user_id", user_id)
          await fastSshDeploy(ip, level)
          results.push(`${user_id}: VPS ready (${ip}), SSH deploy launched`)
        } else {
          results.push(`${user_id}: VPS still ${state}, waiting...`)
        }
      }

      // ── Case 2: IP exists but agent not deployed → SSH deploy ─────────────
      else if (vps_ip && agent_status === "not_deployed") {
        await sb.from("profiles").update({ agent_status: "deploying" }).eq("user_id", user_id)
        await fastSshDeploy(vps_ip, level)
        results.push(`${user_id}: SSH deploy launched on existing IP ${vps_ip}`)
      }

      // ── Case 3: Deploying → check health ─────────────────────────────────
      else if (vps_ip && agent_status === "deploying") {
        const healthy = await checkAgentHealth(vps_ip)
        if (healthy) {
          await sb.from("profiles").update({ vps_status: "ready", agent_status: "running" }).eq("user_id", user_id)
          results.push(`${user_id}: Agent healthy at ${vps_ip} ✅`)
        } else {
          results.push(`${user_id}: Agent still deploying at ${vps_ip}...`)
        }
      }

      // ── Case 4: Running → periodic health check ───────────────────────────
      else if (vps_ip && agent_status === "running") {
        const healthy = await checkAgentHealth(vps_ip)
        if (!healthy) {
          await sb.from("profiles").update({ agent_status: "deploying" }).eq("user_id", user_id)
          results.push(`${user_id}: Agent down at ${vps_ip}, re-deploying...`)
        }
        // else: all good, skip
      }
    } catch (err) {
      console.error(`[cron/deploy-agents] Error for user ${user_id}:`, err)
      results.push(`${user_id}: ERROR — ${err}`)
    }
  }

  console.log("[cron/deploy-agents] Results:", results)
  return NextResponse.json({ ok: true, processed: profiles.length, results })
}
