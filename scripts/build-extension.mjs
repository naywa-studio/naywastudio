/**
 * Builds a clean zip of nawa-extension/ for distribution.
 *
 *   npm run build:extension
 *
 * Produces  public/naywa-extension.zip  (overwritten each run).
 * The /install page links directly to this zip.
 *
 * Pure stdlib: shells out to PowerShell's Compress-Archive on Windows
 * and to `zip` on macOS/Linux. No npm dep.
 */

import { execSync } from "node:child_process"
import { readFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { platform } from "node:os"

const __filename = fileURLToPath(import.meta.url)
const ROOT       = resolve(dirname(__filename), "..")
const SRC_DIR    = resolve(ROOT, "nawa-extension")
const OUT_DIR    = resolve(ROOT, "public")
const OUT_FILE   = resolve(OUT_DIR, "naywa-extension.zip")

mkdirSync(OUT_DIR, { recursive: true })

const manifest = JSON.parse(readFileSync(resolve(SRC_DIR, "manifest.json"), "utf8"))
console.log(`Packaging Naywa Studio extension v${manifest.version}…`)

if (existsSync(OUT_FILE)) unlinkSync(OUT_FILE)

const isWin = platform() === "win32"
try {
  if (isWin) {
    // PowerShell Compress-Archive zips ALL items inside SRC_DIR (the trailing \*).
    const cmd = `powershell -NoProfile -Command "Compress-Archive -Path '${SRC_DIR}\\*' -DestinationPath '${OUT_FILE}' -CompressionLevel Optimal -Force"`
    execSync(cmd, { stdio: "inherit" })
  } else {
    // zip(1) on macOS/Linux. -r recursive, -q quiet, -X strip metadata.
    execSync(`cd "${SRC_DIR}" && zip -rqX "${OUT_FILE}" . -x ".git*" -x ".DS_Store" -x "node_modules/*"`, {
      stdio: "inherit",
      shell: "/bin/sh",
    })
  }
} catch (e) {
  console.error("Zip command failed:", e.message)
  process.exit(1)
}

import { statSync } from "node:fs"
const size = statSync(OUT_FILE).size
console.log(`✓ ${OUT_FILE}  (${(size / 1024).toFixed(1)} kB)`)
