"use client"

/**
 * CandidateCarousel — Tinder-style candidate evaluation for Nora (level 2).
 * Enriched cards: seniority badge, 4-dimension score bars, source context.
 * Actions: Refuser (left) / Plus tard (skip) / Valider (right + generate message).
 * On validation: calls POST /api/candidates/[id]/generate-message.
 */

import { useState, useCallback } from "react"
import { SOURCE_META } from "@/lib/candidate-meta"
import type { Database, ScoreDimensions } from "@/lib/database.types"

type Candidate = Database["public"]["Tables"]["candidates"]["Row"]
type Decision = "validated" | "rejected" | "later"
type AnimState = "idle" | "exiting-right" | "exiting-left"

interface CandidateCarouselProps {
  candidates: Candidate[]
  missionId: string
  onDecision: (id: string, decision: Decision, messageDraft?: string) => void
}

/* ── Dimension score bar ─────────────────────────────────────────────────── */

const DIM_META: Record<string, { label: string; color: string }> = {
  competences:  { label: "Compétences", color: "#7C63C8" },
  seniorite:    { label: "Séniorité",   color: "#0A66C2" },
  localisation: { label: "Localisation", color: "#16a34a" },
  qualite:      { label: "Qualité",     color: "#D97706" },
}

function DimBar({ dim, value }: { dim: string; value: number }) {
  const meta = DIM_META[dim] ?? { label: dim, color: "#9CA3AF" }
  const pct  = Math.max(0, Math.min(100, value))
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{
        fontSize: 9, fontWeight: 700, color: "#9CA3AF", width: 72, flexShrink: 0,
        fontFamily: "var(--font-inter), sans-serif", textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}>
        {meta.label}
      </span>
      <div style={{
        flex: 1, height: 4, background: "#F0ECF8", borderRadius: 999, overflow: "hidden",
      }}>
        <div style={{
          width: `${pct}%`, height: "100%", background: meta.color,
          borderRadius: 999, transition: "width 500ms ease",
        }} />
      </div>
      <span style={{
        fontSize: 10, fontWeight: 700, color: meta.color, minWidth: 24,
        fontFamily: "var(--font-inter), sans-serif", textAlign: "right",
      }}>
        {value}
      </span>
    </div>
  )
}

/* ── Main score ring ─────────────────────────────────────────────────────── */

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? "#16a34a" : score >= 65 ? "#D97706" : "#DC2626"
  const pct   = Math.max(0, Math.min(100, score))
  const circ  = 2 * Math.PI * 20  // r=20
  const dash  = (pct / 100) * circ

  return (
    <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
      <svg width="52" height="52" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="26" cy="26" r="20" fill="none" stroke="#F0ECF8" strokeWidth="4" />
        <circle
          cx="26" cy="26" r="20" fill="none"
          stroke={color} strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 600ms ease" }}
        />
      </svg>
      <span style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 13, fontWeight: 800, color,
        fontFamily: "var(--font-space-grotesk), sans-serif",
      }}>
        {score}
      </span>
    </div>
  )
}

/* ── Seniority badge ─────────────────────────────────────────────────────── */

function SeniorityBadge({ level }: { level: string | null }) {
  if (!level || level === "Inconnu") return null
  const meta: Record<string, { color: string; bg: string }> = {
    Junior:   { color: "#16a34a", bg: "rgba(22,163,74,0.09)" },
    Confirmé: { color: "#D97706", bg: "rgba(217,119,6,0.09)" },
    Senior:   { color: "#7C63C8", bg: "rgba(124,99,200,0.09)" },
  }
  const style = meta[level] ?? { color: "#6B7280", bg: "#F3F4F6" }
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
      color: style.color, background: style.bg,
      fontFamily: "var(--font-inter), sans-serif", textTransform: "uppercase",
      letterSpacing: "0.05em",
    }}>
      {level}
    </span>
  )
}

/* ── Card ────────────────────────────────────────────────────────────────── */

export default function CandidateCarousel({ candidates, missionId, onDecision }: CandidateCarouselProps) {
  const [anim, setAnim] = useState<AnimState>("idle")
  const [generating, setGenerating] = useState(false)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})

  const pending = candidates.filter((c) => !decisions[c.id])
  const current = pending[0] ?? null
  const next    = pending[1] ?? null

  const decide = useCallback(async (decision: Decision) => {
    if (!current || anim !== "idle" || generating) return

    if (decision === "validated") {
      setGenerating(true)
      let msg: string | undefined
      try {
        const res  = await fetch(`/api/candidates/${current.id}/generate-message`, { method: "POST" })
        const data = await res.json() as { ok?: boolean; message_draft?: string }
        msg = data.message_draft
      } catch { /* ignore — onDecision will handle undefined */ }
      setAnim("exiting-right")
      setTimeout(() => {
        setDecisions((prev) => ({ ...prev, [current.id]: "validated" }))
        onDecision(current.id, "validated", msg)
        setAnim("idle")
        setGenerating(false)
      }, 320)
    } else {
      const dir = decision === "rejected" ? "exiting-left" : "exiting-right"
      setAnim(dir)
      setTimeout(() => {
        setDecisions((prev) => ({ ...prev, [current.id]: decision }))
        onDecision(current.id, decision)
        setAnim("idle")
      }, 300)
    }
  }, [current, anim, generating, onDecision])

  /* ── All done ──────────────────────────────────────────────────────────── */
  if (pending.length === 0) {
    const validCount   = Object.values(decisions).filter((d) => d === "validated").length
    const rejCount     = Object.values(decisions).filter((d) => d === "rejected").length
    return (
      <div style={{
        padding: "32px 20px", textAlign: "center",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontSize: 34 }}>🎯</span>
        <p style={{
          margin: 0, fontSize: 15, fontWeight: 700, color: "#111827",
          fontFamily: "var(--font-space-grotesk), sans-serif",
        }}>
          Évaluation terminée
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <span style={{
            fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 999,
            background: "rgba(22,163,74,0.09)", color: "#16a34a",
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            {validCount} validé{validCount !== 1 ? "s" : ""}
          </span>
          <span style={{
            fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 999,
            background: "rgba(220,38,38,0.09)", color: "#DC2626",
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            {rejCount} refusé{rejCount !== 1 ? "s" : ""}
          </span>
        </div>
        <p style={{
          margin: 0, fontSize: 12, color: "#9CA3AF",
          fontFamily: "var(--font-inter), sans-serif",
        }}>
          Consultez les messages générés ci-dessous.
        </p>
      </div>
    )
  }

  if (!current) return null

  const srcMeta  = SOURCE_META[current.source ?? "linkedin"] ?? SOURCE_META.linkedin
  const score    = current.relevance_score ?? 0
  const dims     = current.score_dimensions as ScoreDimensions | null
  const decided  = candidates.length - pending.length
  const total    = candidates.length

  const cardTransform =
    anim === "exiting-right" ? "translateX(115%) rotate(8deg)"
    : anim === "exiting-left"  ? "translateX(-115%) rotate(-8deg)"
    : "translateX(0) rotate(0deg)"

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Progress bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, height: 3, background: "#F0ECF8", borderRadius: 999, overflow: "hidden" }}>
          <div style={{
            width: `${total > 0 ? (decided / total) * 100 : 0}%`,
            height: "100%",
            background: "linear-gradient(90deg, #7C63C8, #A78BFA)",
            borderRadius: 999, transition: "width 400ms ease",
          }} />
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, color: "#9CA3AF", whiteSpace: "nowrap",
          fontFamily: "var(--font-inter), sans-serif",
        }}>
          {decided}/{total}
        </span>
      </div>

      {/* Card stack */}
      <div style={{ position: "relative", height: dims ? 360 : 300 }}>

        {/* Shadow card (next) */}
        {next && (
          <div style={{
            position: "absolute", inset: 0,
            borderRadius: 16, border: "1.5px solid #F0ECF8", background: "#FAFAFA",
            transform: "translateY(8px) scale(0.97)", zIndex: 0,
          }} />
        )}

        {/* Current card */}
        <div style={{
          position: "absolute", inset: 0,
          borderRadius: 16, border: "1.5px solid #E2DAF6", background: "white",
          overflow: "hidden",
          transform: cardTransform,
          opacity: anim !== "idle" ? 0 : 1,
          transition: anim !== "idle"
            ? "transform 300ms cubic-bezier(0.22,1,0.36,1), opacity 280ms ease"
            : "none",
          zIndex: 1,
          boxShadow: "0 4px 24px rgba(124,99,200,0.10)",
        }}>
          {/* Source accent line */}
          <div style={{ height: 3, background: `linear-gradient(90deg, ${srcMeta.color}, ${srcMeta.color}55)` }} />

          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, height: "100%", boxSizing: "border-box" }}>

            {/* Header: source badge + name + score ring */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                fontSize: 10, fontWeight: 900, color: srcMeta.color, background: srcMeta.bg,
                fontFamily: "var(--font-inter), sans-serif",
                border: `1px solid ${srcMeta.color}25`,
              }}>
                {srcMeta.icon}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <p style={{
                    margin: 0, fontSize: 15, fontWeight: 700, color: "#111827",
                    fontFamily: "var(--font-space-grotesk), sans-serif",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {current.name_estimated ?? "Profil"}
                  </p>
                  <SeniorityBadge level={current.seniority_level} />
                </div>
                <p style={{
                  margin: "2px 0 0", fontSize: 11, color: "#6B7280",
                  fontFamily: "var(--font-inter), sans-serif",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {[current.title_estimated, current.company].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                <ScoreRing score={score} />
                {current.linkedin_url && (
                  <a
                    href={current.linkedin_url} target="_blank" rel="noopener noreferrer"
                    style={{
                      fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 6,
                      textDecoration: "none", color: srcMeta.color, background: srcMeta.bg,
                      fontFamily: "var(--font-inter), sans-serif",
                    }}
                  >
                    Voir →
                  </a>
                )}
              </div>
            </div>

            {/* Score dimensions */}
            {dims && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {Object.entries(dims).map(([dim, val]) => (
                  <DimBar key={dim} dim={dim} value={val as number} />
                ))}
              </div>
            )}

            {/* Score justification */}
            {current.score_justification && (
              <p style={{
                margin: 0, fontSize: 11, color: "#6B7280", fontStyle: "italic",
                fontFamily: "var(--font-inter), sans-serif", lineHeight: 1.45,
                borderLeft: "2px solid #E2DAF6", paddingLeft: 8,
              }}>
                {current.score_justification}
              </p>
            )}

            {/* Keywords */}
            {current.keywords && current.keywords.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {current.keywords.slice(0, 6).map((kw, ki) => (
                  <span key={`${kw}-${ki}`} style={{
                    fontSize: 10, padding: "2px 7px", borderRadius: 999,
                    background: "#F0ECF8", color: "#7C63C8",
                    fontFamily: "var(--font-inter), sans-serif", fontWeight: 500,
                  }}>
                    {kw}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>

        {/* Reject */}
        <button
          onClick={() => decide("rejected")}
          disabled={anim !== "idle" || generating}
          style={{
            flex: 1, padding: "12px 0", borderRadius: 12,
            border: "1.5px solid rgba(220,38,38,0.25)",
            background: "rgba(220,38,38,0.04)",
            color: "#DC2626", fontSize: 13, fontWeight: 700,
            cursor: anim !== "idle" || generating ? "not-allowed" : "pointer",
            fontFamily: "var(--font-inter), sans-serif", transition: "all 150ms",
          }}
          onMouseEnter={(e) => {
            if (anim === "idle" && !generating) {
              e.currentTarget.style.background = "rgba(220,38,38,0.09)"
              e.currentTarget.style.transform = "translateY(-1px)"
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(220,38,38,0.04)"
            e.currentTarget.style.transform = "translateY(0)"
          }}
        >
          ✗ Refuser
        </button>

        {/* Later */}
        <button
          onClick={() => decide("later")}
          disabled={anim !== "idle" || generating}
          style={{
            padding: "12px 16px", borderRadius: 12,
            border: "1.5px solid #E5E7EB", background: "white",
            color: "#6B7280", fontSize: 13, fontWeight: 600,
            cursor: anim !== "idle" || generating ? "not-allowed" : "pointer",
            fontFamily: "var(--font-inter), sans-serif", transition: "all 150ms",
          }}
          title="Revoir plus tard"
          onMouseEnter={(e) => { if (anim === "idle" && !generating) e.currentTarget.style.borderColor = "#C4B5FD" }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E5E7EB" }}
        >
          ↻
        </button>

        {/* Validate */}
        <button
          onClick={() => decide("validated")}
          disabled={anim !== "idle" || generating}
          style={{
            flex: 1, padding: "12px 0", borderRadius: 12,
            border: "none",
            background: generating ? "#E5E7EB" : "linear-gradient(135deg, #7C63C8 0%, #9B7FE8 100%)",
            color: generating ? "#9CA3AF" : "white",
            fontSize: 13, fontWeight: 700,
            cursor: anim !== "idle" || generating ? "not-allowed" : "pointer",
            fontFamily: "var(--font-inter), sans-serif",
            boxShadow: anim === "idle" && !generating ? "0 4px 14px rgba(124,99,200,0.35)" : "none",
            transition: "all 150ms",
          }}
          onMouseEnter={(e) => {
            if (anim === "idle" && !generating) {
              e.currentTarget.style.transform = "translateY(-1px)"
              e.currentTarget.style.boxShadow = "0 6px 18px rgba(124,99,200,0.45)"
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)"
            e.currentTarget.style.boxShadow = "0 4px 14px rgba(124,99,200,0.35)"
          }}
        >
          {generating ? "Génération…" : "✓ Valider"}
        </button>
      </div>

      {/* Generating hint */}
      {generating && (
        <div style={{ textAlign: "center" }}>
          <p style={{
            margin: 0, fontSize: 11, color: "#9CA3AF",
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            Nora rédige un message personnalisé…
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 6 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{
                width: 5, height: 5, borderRadius: "50%", background: "#C4B5FD",
                animation: `dotPulse 1.2s ${i * 0.2}s ease-in-out infinite`,
              }} />
            ))}
          </div>
          <style>{`
            @keyframes dotPulse {
              0%, 80%, 100% { transform: scale(0.8); opacity: 0.4; }
              40% { transform: scale(1.2); opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </div>
  )
}
