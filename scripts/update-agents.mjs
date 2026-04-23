/**
 * Update agent Python files on a running VPS without re-provisioning.
 *
 * Usage:
 *   node scripts/update-agents.mjs [USER_ID]
 *
 * If USER_ID is omitted, uses the hardcoded ADMIN_USER_ID below.
 * Reads VPS IP from Supabase, deploys updated agent files via SSH, restarts service.
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync } from "fs"
import { join } from "path"
import { execSync } from "child_process"
import { tmpdir } from "os"

// ── Load env vars ─────────────────────────────────────────────────────────────

const envRaw = readFileSync(".env.local", "utf-8")
const get = (k) => {
  const m = envRaw.match(new RegExp(`^${k}=(.+)`, "m"))
  return m ? m[1].trim() : ""
}

const SB_URL      = get("NEXT_PUBLIC_SUPABASE_URL")
const SB_SERVICE  = get("SUPABASE_SERVICE_ROLE_KEY")
const SSH_KEY_B64 = get("AGENT_VPS_SSH_KEY")

const ADMIN_USER_ID = "a66360fb-9616-4b79-81d5-1155d146482e"
const USER_ID = process.argv[2] || ADMIN_USER_ID

// ── Resolve VPS IP from Supabase ──────────────────────────────────────────────

async function getVpsIp(userId) {
  const resp = await fetch(
    `${SB_URL}/rest/v1/profiles?user_id=eq.${userId}&select=vps_ip,vps_status,agent_status`,
    {
      headers: {
        apikey: SB_SERVICE,
        Authorization: `Bearer ${SB_SERVICE}`,
      },
    }
  )
  const rows = await resp.json()
  const profile = rows[0]
  if (!profile?.vps_ip) throw new Error(`No VPS IP for user ${userId}`)
  console.log(`   VPS status : ${profile.vps_status} / agent: ${profile.agent_status}`)
  return profile.vps_ip
}

// ── Read agent template files ─────────────────────────────────────────────────

function tpl(f) {
  return join("src", "lib", "agent-templates", f)
}

// ── SSH helpers ───────────────────────────────────────────────────────────────

function ssh(ip, keyFile, cmd) {
  const full = `ssh -i "${keyFile}" -o StrictHostKeyChecking=no -o ConnectTimeout=15 root@${ip} "${cmd}"`
  return execSync(full, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] })
}

function scpFile(ip, keyFile, localPath, remotePath) {
  const cmd = `scp -i "${keyFile}" -o StrictHostKeyChecking=no "${localPath}" root@${ip}:${remotePath}`
  execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] })
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n🔄 Updating agents for user ${USER_ID}...\n`)

  // 1. Get VPS IP
  const vpsIp = await getVpsIp(USER_ID)
  console.log(`   VPS IP     : ${vpsIp}`)

  // 2. Write SSH private key to temp file
  const keyPath = join(tmpdir(), `nawa_deploy_key_${Date.now()}`)
  const keyContent = Buffer.from(SSH_KEY_B64, "base64").toString("utf-8")
  writeFileSync(keyPath, keyContent, { mode: 0o600 })

  try {
    // 3. Check current agent version for reference
    try {
      const ver = ssh(vpsIp, keyPath, "head -3 /opt/nawa-agent/agent_leo.py")
      console.log(`   Current agent_leo.py: ${ver.split("\\n")[0].trim()}`)
    } catch { /* ignore */ }

    // 4. Upload updated Python files
    const files = [
      { local: tpl("agent_leo.py"),  remote: "/opt/nawa-agent/agent_leo.py"  },
      { local: tpl("agent_nora.py"), remote: "/opt/nawa-agent/agent_nora.py" },
      { local: tpl("agent_alex.py"), remote: "/opt/nawa-agent/agent_alex.py" },
      { local: tpl("main.py"),       remote: "/opt/nawa-agent/main.py"       },
    ]

    for (const { local, remote } of files) {
      if (!existsSync(local)) {
        console.log(`   ⚠️  Skipping ${local} (not found)`)
        continue
      }
      process.stdout.write(`   Uploading ${local.split("/").pop()}...`)
      scpFile(vpsIp, keyPath, local, remote)
      console.log(" ✓")
    }

    // 5. Restart the systemd service
    console.log(`   Restarting nawa-agent service...`)
    ssh(vpsIp, keyPath, "systemctl restart nawa-agent")
    console.log(`   Waiting for startup...`)
    await new Promise(r => setTimeout(r, 6000))

    // 6. Health check
    const status = ssh(vpsIp, keyPath, "curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/health || echo 000")
    if (status.trim() === "200") {
      console.log(`\n✅ Agent updated and healthy! (HTTP 200)`)
    } else {
      const log = ssh(vpsIp, keyPath, "tail -20 /opt/nawa-agent/logs/agent.log")
      console.error(`\n⚠️  Agent responded with status ${status.trim()}`)
      console.error(`   Last logs:\n${log}`)
    }

  } finally {
    // Always clean up the temp key
    try { unlinkSync(keyPath) } catch { /* ignore */ }
  }
}

run().catch((err) => {
  console.error("\n❌ Error:", err.message)
  process.exit(1)
})
