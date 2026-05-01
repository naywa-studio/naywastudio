"use client"

import { useState, useEffect, useRef } from "react"
import { m } from "framer-motion"

interface MissionRunPanelProps {
  missionId: string
  agentColor: string
  agentName: string
  /** Kept for back-compat with the empty-state CTA — currently a no-op. */
  skipLaunch?: boolean
  onCompleted: (excelB64: string, candidatesCount: number, researchReport?: string) => void
  onError: (msg: string) => void
}

/**
 * Passive "search in progress" panel.
 *
 * The actual search runs either in the Chrome extension (silent fetch
 * from background.js) or via the server-side fallback route. The mission
 * page subscribes to Supabase Realtime, so candidates and the final
 * `status=completed` arrive automatically — this panel just shows the
 * elapsed time while the user waits.
 */
function PulsingDot({ color }: { color: string }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", width: 10, height: 10 }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color, opacity: 0.4, animation: "ping2 1.2s cubic-bezier(0,0,0.2,1) infinite" }} />
      <span style={{ position: "relative", width: 10, height: 10, borderRadius: "50%", background: color }} />
      <style>{`@keyframes ping2 { 75%,100%{ transform: scale(2); opacity: 0; } }`}</style>
    </span>
  )
}

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(id)
  }, [startedAt])
  const m2 = Math.floor(elapsed / 60)
  const s = elapsed % 60
  return <span style={{ fontVariantNumeric: "tabular-nums" }}>{m2 > 0 ? `${m2}m ` : ""}{String(s).padStart(2, "0")}s</span>
}

export default function MissionRunPanel({
  agentColor, agentName,
}: MissionRunPanelProps) {
  const startedAt = useRef(Date.now())

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        padding: "24px",
        borderRadius: 14,
        border: `1.5px solid ${agentColor}30`,
        background: `${agentColor}06`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 36 }}>🔍</div>
      <div>
        <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#111827", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
          {agentName} recherche vos profils…
        </p>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif", maxWidth: 360 }}>
          Les candidats s&apos;afficheront ici automatiquement dès qu&apos;ils sont trouvés.
        </p>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999, background: "#F8F6FF", border: "1px solid #E2DAF6", fontSize: 12, color: agentColor, fontFamily: "var(--font-inter), sans-serif", fontWeight: 600 }}>
          <PulsingDot color={agentColor} />
          En cours · <ElapsedTimer startedAt={startedAt.current} />
        </div>
      </div>
    </m.div>
  )
}
