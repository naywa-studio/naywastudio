"use client"

import { useEffect, useState, useRef } from "react"
import { m, AnimatePresence } from "framer-motion"
import type { VpsStatus, AgentStatus } from "@/lib/database.types"

type SubscriptionLevel = "leo" | "nora" | "alex"

// ── Types ─────────────────────────────────────────────────────────────────────

interface StatusPayload {
  vps_status: VpsStatus
  agent_status: AgentStatus
  subscription_level: SubscriptionLevel | null
  ready: boolean
}

interface ProvisioningScreenProps {
  initialVpsStatus: VpsStatus
  initialAgentStatus: AgentStatus
  agentLevel: SubscriptionLevel
  onReady: () => void
}

// ── Steps definition ──────────────────────────────────────────────────────────

type StepId = "ordered" | "provisioning" | "configuring" | "agent" | "ready"

interface Step {
  id: StepId
  label: string
  sublabel: string
  icon: string
  estimatedSeconds: number
}

const STEPS: Step[] = [
  {
    id: "ordered",
    label: "Commande reçue",
    sublabel: "Votre VPS dédié est en file d'attente",
    icon: "📋",
    estimatedSeconds: 15,
  },
  {
    id: "provisioning",
    label: "Serveur en démarrage",
    sublabel: "Hostinger alloue votre machine virtuelle",
    icon: "⚡",
    estimatedSeconds: 90,
  },
  {
    id: "configuring",
    label: "Installation de l'agent",
    sublabel: "Python, dépendances et configuration",
    icon: "🔧",
    estimatedSeconds: 120,
  },
  {
    id: "agent",
    label: "Agent en ligne",
    sublabel: "Vérification de la connexion agent",
    icon: "🤖",
    estimatedSeconds: 30,
  },
  {
    id: "ready",
    label: "Prêt !",
    sublabel: "Votre agent est opérationnel",
    icon: "✅",
    estimatedSeconds: 0,
  },
]

// ── Map VPS/agent status → step index ─────────────────────────────────────────

function statusToStep(vpsStatus: VpsStatus, agentStatus: AgentStatus): number {
  if (vpsStatus === "ready" && agentStatus === "running") return 4  // ready
  if (vpsStatus === "ready") return 3                                 // agent starting
  if (vpsStatus === "provisioning") return 2                          // configuring (cloud-init running)
  if (vpsStatus === "pending") return 1                               // server starting
  return 0                                                            // ordered
}

// ── Animated progress ring ────────────────────────────────────────────────────

function ProgressRing({ progress, color }: { progress: number; color: string }) {
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (progress / 100) * circumference

  return (
    <svg width="128" height="128" viewBox="0 0 128 128" style={{ transform: "rotate(-90deg)" }}>
      <circle
        cx="64" cy="64" r={radius}
        fill="none"
        stroke="#F0ECF8"
        strokeWidth="7"
      />
      <circle
        cx="64" cy="64" r={radius}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 1s ease-in-out" }}
      />
    </svg>
  )
}

// ── Pulsing dot ───────────────────────────────────────────────────────────────

function PulsingDot({ color }: { color: string }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", width: 10, height: 10 }}>
      <span
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: color,
          opacity: 0.4,
          animation: "ping 1.2s cubic-bezier(0,0,0.2,1) infinite",
        }}
      />
      <span
        style={{
          position: "relative",
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: color,
        }}
      />
      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </span>
  )
}

// ── Elapsed timer ─────────────────────────────────────────────────────────────

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [startedAt])

  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      {mins > 0 ? `${mins}m ` : ""}{String(secs).padStart(2, "0")}s
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const ACCENT = "#7C63C8"
const POLL_INTERVAL = 10_000

export default function ProvisioningScreen({
  initialVpsStatus,
  initialAgentStatus,
  agentLevel,
  onReady,
}: ProvisioningScreenProps) {
  const [vpsStatus, setVpsStatus] = useState<VpsStatus>(initialVpsStatus)
  const [agentStatus, setAgentStatus] = useState<AgentStatus>(initialAgentStatus)
  const startedAt = useRef(Date.now())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const currentStep = statusToStep(vpsStatus, agentStatus)
  const isReady = currentStep === 4
  const progress = Math.round((currentStep / (STEPS.length - 1)) * 100)

  // ── Polling ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isReady) {
      // Small delay so user sees the "Prêt !" state before redirect
      const t = setTimeout(onReady, 2000)
      return () => clearTimeout(t)
    }

    const poll = async () => {
      try {
        const res = await fetch("/api/provisioning-status")
        if (!res.ok) return
        const data: StatusPayload = await res.json()
        setVpsStatus(data.vps_status)
        setAgentStatus(data.agent_status)
      } catch {
        // network error — silently retry on next tick
      }
    }

    timerRef.current = setInterval(poll, POLL_INTERVAL)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isReady, onReady])

  // ── Estimated time remaining ─────────────────────────────────────────────────

  const remainingSeconds = STEPS.slice(currentStep).reduce(
    (acc, s) => acc + s.estimatedSeconds,
    0
  )
  const remainingMins = Math.ceil(remainingSeconds / 60)

  const agentName = agentLevel === "nora" ? "Nora" : agentLevel === "alex" ? "Alex" : "Léo"
  const agentDesc =
    agentLevel === "nora"
      ? "Recherche · Scoring IA · Messages personnalisés"
      : agentLevel === "alex"
        ? "Recherche · Scoring · Messages · Booking"
        : "Recherche LinkedIn · Export Excel"

  return (
    <main
      style={{
        minHeight: "calc(100vh - 60px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        background: "#FAFAFA",
      }}
    >
      <m.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: "100%", maxWidth: 520, display: "flex", flexDirection: "column", gap: 28 }}
      >
        {/* Header card */}
        <div
          style={{
            background: "white",
            borderRadius: 20,
            border: "1.5px solid #E2DAF6",
            padding: "32px 28px",
            textAlign: "center",
            boxShadow: "0 4px 32px rgba(124,99,200,0.08)",
          }}
        >
          {/* Progress ring + icon */}
          <div style={{ position: "relative", width: 128, height: 128, margin: "0 auto 20px" }}>
            <ProgressRing progress={isReady ? 100 : progress} color={ACCENT} />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: isReady ? 40 : 34,
              }}
            >
              <AnimatePresence mode="wait">
                <m.span
                  key={currentStep}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.3 }}
                >
                  {STEPS[currentStep].icon}
                </m.span>
              </AnimatePresence>
            </div>
          </div>

          {/* Title */}
          <AnimatePresence mode="wait">
            <m.div
              key={currentStep}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <h1
                style={{
                  margin: "0 0 8px",
                  fontSize: 22,
                  fontWeight: 800,
                  color: "#111827",
                  fontFamily: "var(--font-space-grotesk), sans-serif",
                  letterSpacing: -0.3,
                }}
              >
                {STEPS[currentStep].label}
              </h1>
              <p
                style={{
                  margin: "0 0 16px",
                  fontSize: 14,
                  color: "#6B7280",
                  fontFamily: "var(--font-inter), sans-serif",
                  lineHeight: 1.6,
                }}
              >
                {STEPS[currentStep].sublabel}
              </p>
            </m.div>
          </AnimatePresence>

          {/* Status badge */}
          {!isReady && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 14px",
                borderRadius: 999,
                background: "#F8F6FF",
                border: "1px solid #E2DAF6",
                fontSize: 12,
                color: "#7C63C8",
                fontFamily: "var(--font-inter), sans-serif",
                fontWeight: 600,
              }}
            >
              <PulsingDot color={ACCENT} />
              En cours · <ElapsedTimer startedAt={startedAt.current} />
              {remainingMins > 0 && ` · ~${remainingMins} min restante${remainingMins > 1 ? "s" : ""}`}
            </div>
          )}

          {isReady && (
            <m.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 20px",
                borderRadius: 999,
                background: "rgba(34,197,94,0.1)",
                border: "1px solid rgba(34,197,94,0.25)",
                fontSize: 13,
                color: "#16a34a",
                fontFamily: "var(--font-inter), sans-serif",
                fontWeight: 700,
              }}
            >
              Agent {agentName} opérationnel — redirection…
            </m.div>
          )}
        </div>

        {/* Steps list */}
        <div
          style={{
            background: "white",
            borderRadius: 16,
            border: "1.5px solid #F0ECF8",
            overflow: "hidden",
          }}
        >
          {STEPS.map((step, idx) => {
            const done = idx < currentStep
            const active = idx === currentStep
            const pending = idx > currentStep

            return (
              <m.div
                key={step.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 20px",
                  borderBottom: idx < STEPS.length - 1 ? "1px solid #F8F6FF" : "none",
                  background: active ? "rgba(124,99,200,0.03)" : "white",
                  transition: "background 300ms",
                }}
              >
                {/* Step indicator */}
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: done ? 14 : 16,
                    background: done
                      ? "#7C63C8"
                      : active
                        ? "#F8F6FF"
                        : "#F8F6FF",
                    border: done
                      ? "none"
                      : active
                        ? "1.5px solid #7C63C8"
                        : "1.5px solid #E2DAF6",
                    color: done ? "white" : pending ? "#D1D5DB" : "#7C63C8",
                    transition: "all 400ms ease",
                  }}
                >
                  {done ? (
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                      <path d="M5 10l4 4 6-6" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : active ? (
                    step.icon
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#D1D5DB", fontFamily: "var(--font-inter), sans-serif" }}>
                      {idx + 1}
                    </span>
                  )}
                </div>

                {/* Label */}
                <div style={{ flex: 1 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      fontWeight: active ? 700 : done ? 600 : 500,
                      color: done ? "#111827" : active ? "#111827" : "#9CA3AF",
                      fontFamily: "var(--font-inter), sans-serif",
                      transition: "color 300ms",
                    }}
                  >
                    {step.label}
                  </p>
                  {active && (
                    <m.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      style={{
                        margin: "2px 0 0",
                        fontSize: 11,
                        color: "#9CA3AF",
                        fontFamily: "var(--font-inter), sans-serif",
                      }}
                    >
                      {step.sublabel}
                    </m.p>
                  )}
                </div>

                {/* Right badge */}
                {done && (
                  <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 600, fontFamily: "var(--font-inter), sans-serif" }}>
                    ✓ Fait
                  </span>
                )}
                {active && !isReady && (
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <PulsingDot color={ACCENT} />
                  </span>
                )}
              </m.div>
            )
          })}
        </div>

        {/* Agent info */}
        <div
          style={{
            background: "linear-gradient(135deg, #F8F6FF 0%, #F0ECF8 100%)",
            borderRadius: 14,
            border: "1.5px solid #E2DAF6",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 28 }}>
            {agentLevel === "nora" ? "🧠" : agentLevel === "alex" ? "🎯" : "🔍"}
          </span>
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 700,
                color: "#111827",
                fontFamily: "var(--font-space-grotesk), sans-serif",
              }}
            >
              Agent {agentName} — Package Sourcing
            </p>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: 12,
                color: "#7C63C8",
                fontFamily: "var(--font-inter), sans-serif",
              }}
            >
              {agentDesc}
            </p>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <p style={{ margin: 0, fontSize: 11, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
              VPS dédié
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#7C63C8", fontWeight: 600, fontFamily: "var(--font-inter), sans-serif" }}>
              eu-west-1
            </p>
          </div>
        </div>

        {/* Footer note */}
        <p
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "#9CA3AF",
            fontFamily: "var(--font-inter), sans-serif",
            margin: 0,
          }}
        >
          ☕ Cette page se met à jour automatiquement. Vous pouvez fermer l&apos;onglet et revenir dans quelques minutes.
        </p>
      </m.div>
    </main>
  )
}
