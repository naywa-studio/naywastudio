"use client"

import { useState, useEffect, useRef } from "react"
import { m } from "framer-motion"

interface MissionRunPanelProps {
  missionId: string
  agentColor: string
  agentName: string
  onCompleted: (excelB64: string, candidatesCount: number, researchReport?: string) => void
  onError: (msg: string) => void
}

type RunStatus = "launching" | "running" | "done" | "error"

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

const POLL_MS = 5000

export default function MissionRunPanel({
  missionId, agentColor, agentName, onCompleted, onError,
}: MissionRunPanelProps) {
  const [status, setStatus] = useState<RunStatus>("launching")
  const [errorMsg, setErrorMsg] = useState("")
  const startedAt = useRef(Date.now())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Launch on mount ──────────────────────────────────────────────────────────
  useEffect(() => {
    const launch = async () => {
      const res = await fetch(`/api/missions/${missionId}/run`, { method: "POST" })
      if (!res.ok) {
        const { error } = await res.json() as { error: string }
        setStatus("error")
        setErrorMsg(error ?? "Erreur au lancement")
        onError(error)
        return
      }
      setStatus("running")
      startPoll()
    }
    launch().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      setStatus("error")
      setErrorMsg(msg)
      onError(msg)
    })
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId])

  const startPoll = () => {
    timerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/missions/${missionId}/agent-status`)
        const data = await res.json() as { status: string; error?: string }

        if (data.status === "done" || data.status === "completed") {
          clearInterval(timerRef.current!)
          await fetchResult()
        } else if (data.status === "error") {
          clearInterval(timerRef.current!)
          setStatus("error")
          setErrorMsg(data.error ?? "Erreur agent")
          onError(data.error ?? "Erreur agent")
        }
      } catch {
        // network hiccup — retry
      }
    }, POLL_MS)
  }

  const fetchResult = async () => {
    const res = await fetch(`/api/missions/${missionId}/download`, { method: "POST" })
    const data = await res.json() as {
      ok?: boolean
      excel_b64?: string
      candidates_count?: number
      research_report?: string
      error?: string
    }
    if (!res.ok || !data.ok) {
      setStatus("error")
      setErrorMsg(data.error ?? "Erreur téléchargement")
      onError(data.error ?? "Erreur téléchargement")
      return
    }
    setStatus("done")
    onCompleted(data.excel_b64!, data.candidates_count ?? 0, data.research_report)
  }

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
      {status === "launching" && (
        <>
          <span style={{ fontSize: 32 }}>🚀</span>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#111827", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
              Connexion à {agentName}…
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif" }}>
              Envoi du brief en cours
            </p>
          </div>
        </>
      )}

      {status === "running" && (
        <>
          <div style={{ fontSize: 36 }}>🔍</div>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#111827", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
              {agentName} recherche vos profils…
            </p>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif" }}>
              Patience, ça peut prendre 1 à 2 minutes
            </p>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999, background: "#F8F6FF", border: "1px solid #E2DAF6", fontSize: 12, color: agentColor, fontFamily: "var(--font-inter), sans-serif", fontWeight: 600 }}>
              <PulsingDot color={agentColor} />
              En cours · <ElapsedTimer startedAt={startedAt.current} />
            </div>
          </div>
        </>
      )}

      {status === "error" && (
        <>
          <span style={{ fontSize: 32 }}>❌</span>
          <div>
            <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "#EF4444", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
              Erreur agent
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif", maxWidth: 360 }}>
              {errorMsg}
            </p>
          </div>
        </>
      )}

      {status === "done" && (
        <>
          <span style={{ fontSize: 36 }}>✅</span>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#16a34a", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
            Mission terminée — chargement des résultats…
          </p>
        </>
      )}
    </m.div>
  )
}
