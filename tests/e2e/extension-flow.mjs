/**
 * E2E test for the Nawa Studio Chrome extension flow.
 *
 * Loads the unpacked extension into a real Chromium, drives the workspace
 * chat to create + launch a mission, observes the worker tab opening
 * Google, and waits for candidates to land via the /profiles API.
 *
 * Run with: node tests/e2e/extension-flow.mjs
 *
 * The dev server must already be running on http://localhost:3000.
 */

import { chromium } from "playwright"
import { fileURLToPath } from "node:url"
import path from "node:path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXT_PATH  = path.resolve(__dirname, "..", "..", "nawa-extension")
const BASE      = "http://localhost:3000"

const log = (...a) => console.log("[E2E]", ...a)

async function run() {
  log("Loading extension from", EXT_PATH)

  const userDataDir = path.resolve(__dirname, "..", ".pw-profile")
  // Prefer Edge — it doesn't fight with the user's existing Chrome profile.
  const CHROME_EXE = process.env.NAWA_CHROME_PATH
    || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: CHROME_EXE,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--no-sandbox",
    ],
    viewport: { width: 1280, height: 800 },
  })

  // Open a Nawa page first — this wakes up the MV3 service worker via content_nawa.js
  const page0 = context.pages()[0] || await context.newPage()
  await page0.goto(`${BASE}/api/dev-login?secret=NawaDevLogin2026`, { waitUntil: "load" }).catch(() => {})

  // Find the extension service worker — proves the extension loaded
  let bg = context.serviceWorkers()[0]
  if (!bg) {
    try { bg = await context.waitForEvent("serviceworker", { timeout: 30000 }) }
    catch {
      // Service worker not auto-started — force-wake by opening the popup HTML
      const all = context.serviceWorkers()
      log("known service workers:", all.map(s => s.url()))
      log("opening chrome://extensions to inspect")
      const inspect = await context.newPage()
      await inspect.goto("chrome://extensions").catch(() => {})
      await page0.waitForTimeout(2000)
      bg = context.serviceWorkers()[0]
    }
  }
  if (!bg) throw new Error("Extension service worker never started")
  const extId = bg.url().split("/")[2]
  log("Extension loaded — id:", extId, "sw:", bg.url())

  // Capture extension service-worker logs
  bg.on("console", (msg) => log("[SW]", msg.type(), msg.text().slice(0, 300)))

  // Capture page console + errors on every page
  context.on("page", (page) => {
    page.on("console", (msg) => {
      const t = msg.text()
      // Filter out Next.js dev noise
      if (/HMR|webpack|Fast Refresh|font|preload/.test(t)) return
      log(`[page ${page.url().slice(0,40)}]`, msg.type(), t.slice(0, 200))
    })
    page.on("pageerror", (err) => log(`[page-error]`, err.message))
  })

  const page = page0

  // Pre-accept Google's EU consent banner so fetches return real SERP HTML
  await context.addCookies([
    { name: "CONSENT", value: "YES+1", domain: ".google.com", path: "/" },
    { name: "SOCS",    value: "CAESHAgBEhJnd3NfMjAyNDA0MDgtMF9SQzIaAmZyIAEaBgiAi-OuBg", domain: ".google.com", path: "/" },
  ])

  // 1. Authenticate via dev-login (already triggered, ensure we landed on /workspace)
  await page.waitForURL((u) => u.pathname === "/workspace", { timeout: 30000 })
  log("Logged in, on", page.url())

  // 2. Wait for content_nawa.js to broadcast READY (extension presence)
  await page.waitForFunction(
    () => new Promise((r) => {
      const handler = (e) => {
        if (e.data?.source === "nawa-extension" && e.data?.type === "READY") {
          window.removeEventListener("message", handler)
          r(true)
        }
      }
      window.addEventListener("message", handler)
      setTimeout(() => { window.removeEventListener("message", handler); r(false) }, 5000)
    }),
    null,
    { timeout: 8000 }
  ).catch(() => log("READY signal not seen — extension content_nawa may not be active"))

  // 3. Reset chat history so we get a clean run
  await page.evaluate(() => fetch("/api/workspace/chat", { method: "DELETE" }))
  await page.reload()
  await page.waitForSelector("textarea")

  // 4. Send a brief
  log("Sending brief")
  const brief = "Je cherche un Data Engineer senior à Paris, 5 ans d expérience Spark Python AWS"
  await page.evaluate((b) => {
    const ta = document.querySelector("textarea")
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
    setter.call(ta, b)
    ta.dispatchEvent(new Event("input", { bubbles: true }))
    document.querySelector('button[aria-label="Envoyer"]').click()
  }, brief)

  // Wait for assistant response with mission_created card
  await page.waitForFunction(
    () => /Je peux lancer la recherche|Je vais créer/i.test(document.body.innerText),
    null,
    { timeout: 30000 }
  )
  log("Mission created — confirming")

  // 5. Confirm launch
  await page.evaluate(() => {
    const ta = document.querySelector("textarea")
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
    setter.call(ta, "oui go")
    ta.dispatchEvent(new Event("input", { bubbles: true }))
    document.querySelector('button[aria-label="Envoyer"]').click()
  })

  // 6. Wait to land on the mission page
  await page.waitForURL(/\/workspace\/missions\//, { timeout: 90000 })
  const missionId = page.url().split("/").pop().split("?")[0]
  log("Landed on mission", missionId)

  // 7. The extension is now in charge of the search (silent fetch from
  //    background.js). Poll until the mission flips to completed / error.
  log("Waiting for extension-driven search to complete…")
  // Surface ext state every 5s so we can see the search progress
  let prevExt = ""
  const start = Date.now()
  let last = null
  const TIMEOUT_MS = 90_000
  while (Date.now() - start < TIMEOUT_MS) {
    await page.waitForTimeout(1500)
    const cur = await page.evaluate(async (mId) => {
      const r = await fetch(`/api/missions/${mId}/status`)
      if (!r.ok) return null
      return r.json()
    }, missionId)
    const status = cur?.mission?.status
    const count  = cur?.candidatesCount ?? 0
    if (status !== last) { last = status; log("mission status →", status, "candidates:", count) }
    // Also peek at the extension state for visibility
    const ext = await dumpExtState(bg, true)
    const extKey = `${ext?.phase}/${ext?.queryIndex}/${ext?.profiles?.length}/${ext?.error || ""}`
    if (extKey !== prevExt) {
      prevExt = extKey
      log("ext →", `phase=${ext?.phase}`, `qIdx=${ext?.queryIndex}`, `profiles=${ext?.profiles?.length}`, ext?.error ? `err=${ext.error}` : "")
    }
    if (status === "completed" || status === "error") break
  }

  // 9. Final assessment via API
  const final = await page.evaluate(async (mId) => {
    const r = await fetch(`/api/missions/${mId}/status`)
    if (!r.ok) return null
    return r.json()
  }, missionId)
  log("Final status:", final?.mission?.status, "candidates:", final?.candidatesCount, "err:", final?.error)
  if ((final?.candidatesCount ?? 0) > 0 && final?.mission?.status === "completed") {
    log("✅✅✅ SUCCESS — Léo completed with", final.candidatesCount, "candidates")
  } else {
    log("❌ Léo flow did not complete cleanly")
  }

  // 10. Verify mission page actually displays the candidates
  log("Verifying mission page UI…")
  await page.waitForTimeout(1500)
  const uiCheck = await page.evaluate(() => {
    const txt = document.body.innerText
    return {
      hasCompleteBadge:  /Terminée|Complétée|completed/i.test(txt),
      hasCandidatesList: /Profil Test|Data Engineer/i.test(txt),
      candidateRowCount: document.querySelectorAll('[data-candidate-id], a[href*="linkedin.com/in/"], .candidate-row').length,
      missionTitle:      (document.querySelector("h1, h2") || {}).innerText || "",
      mainText:          txt.slice(0, 800),
    }
  })
  log("UI check:", JSON.stringify(uiCheck).slice(0, 500))

  // Leave context open briefly so we can inspect if needed
  await new Promise((r) => setTimeout(r, 2000))
  await context.close()
}

async function dumpExtState(bg, silent = false) {
  try {
    const state = await bg.evaluate(() => new Promise((r) => {
      chrome.storage.local.get(["nawa_search_state"], (data) => r(data?.nawa_search_state ?? null))
    }))
    if (!silent) log("ext state:", JSON.stringify(state).slice(0, 500))
    return state
  } catch (e) {
    if (!silent) log("dumpExtState failed:", e.message)
    return null
  }
}

async function failure(reason, ctx) {
  console.error("\n=== FAILURE:", reason, "===")
  await new Promise((r) => setTimeout(r, 1500))
  await ctx.context.close()
  process.exit(1)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
