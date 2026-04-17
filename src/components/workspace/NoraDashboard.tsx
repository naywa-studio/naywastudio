"use client"

/**
 * NoraDashboard — Interactive expandable panels for Nora (level 2).
 * Uses CSS grid-template-rows for height animation (no framer-motion height anim —
 * animating height directly breaks in Next.js SSR).
 * Three sections: shortlist (7%) / relevant (score≥50) / all profiles.
 * Each section has a collapsed preview + expanded full view.
 */

import { useState, useCallback } from "react"
import type { Database } from "@/lib/database.types"
import { SOURCE_META } from "@/lib/candidate-meta"
import type { BriefChatHandle } from "./BriefChat"

type Candidate = Database["public"]["Tables"]["candidates"]["Row"]
type PanelKey = "top" | "relevant" | "all"

interface NoraDashboardProps {
  candidates: Candidate[]
  briefChatRef: React.RefObject<BriefChatHandle | null>
  onConsult: (id: string) => void
  onContact: (id: string) => void
}

/* ── Helpers ──────────────────────────────────────────────────── */

function scoreColor(s: number): { color: string; bg: string } {
  if (s >= 80) return { color: "#16a34a", bg: "rgba(22,163,74,0.09)" }
  if (s >= 60) return { color: "#D97706", bg: "rgba(217,119,6,0.09)" }
  return { color: "#DC2626", bg: "rgba(220,38,38,0.09)" }
}

function SourceBadge({ source }: { source: string | null }) {
  const m = SOURCE_META[source ?? "linkedin"] ?? SOURCE_META.linkedin
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 20, height: 20, borderRadius: 5, flexShrink: 0,
      fontSize: 9, fontWeight: 900, color: m.color, background: m.bg,
      fontFamily: "var(--font-inter), sans-serif", letterSpacing: -0.5,
      border: `1px solid ${m.color}25`,
    }}>{m.icon}</span>
  )
}

/* ── Shortlist candidate card ─────────────────────────────────── */

function ShortlistCard({
  c, index, onConsult, onContact,
}: { c: Candidate; index: number; onConsult: (id: string) => void; onContact: (id: string) => void }) {
  const [copied, setCopied] = useState(false)
  const isContacted = Boolean(c.contacted_at)
  const score = c.relevance_score ?? 0
  const sc = scoreColor(score)
  const srcMeta = SOURCE_META[c.source ?? "linkedin"] ?? SOURCE_META.linkedin

  const copyMsg = useCallback(() => {
    if (!c.message_draft) return
    navigator.clipboard.writeText(c.message_draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [c.message_draft])

  return (
    <div style={{
      borderRadius: 12,
      border: `1.5px solid ${isContacted ? "#DDD6FE" : "#F0ECF8"}`,
      background: isContacted ? "#FDFAFF" : "white",
      overflow: "hidden",
      transition: "border-color 200ms",
    }}>
      {/* Header row */}
      <div style={{ padding: "14px 16px 10px", display: "flex", alignItems: "flex-start", gap: 10 }}>
        {/* Rank */}
        <span style={{
          flexShrink: 0, width: 22, height: 22, borderRadius: "50%",
          background: index === 0 ? "#7C63C8" : index === 1 ? "#A78BFA" : "#EDE8FB",
          color: index < 2 ? "white" : "#7C63C8",
          fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-inter), sans-serif",
        }}>{index + 1}</span>

        <SourceBadge source={c.source} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <p style={{
              margin: 0, fontSize: 14, fontWeight: 700, color: "#111827",
              fontFamily: "var(--font-space-grotesk), sans-serif",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200,
            }}>{c.name_estimated ?? "Profil inconnu"}</p>
            {isContacted && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
                color: "#7C63C8", background: "#EDE8FB",
                fontFamily: "var(--font-inter), sans-serif",
              }}>✓ Contacté</span>
            )}
          </div>
          <p style={{
            margin: "2px 0 0", fontSize: 11, color: "#6B7280",
            fontFamily: "var(--font-inter), sans-serif",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {[c.title_estimated, c.company].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>

        {/* Score */}
        <div style={{ flexShrink: 0, textAlign: "center", padding: "5px 9px", borderRadius: 8, background: sc.bg }}>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: sc.color, lineHeight: 1, fontFamily: "var(--font-space-grotesk), sans-serif" }}>{score}</p>
          <p style={{ margin: 0, fontSize: 9, color: sc.color, fontWeight: 600, fontFamily: "var(--font-inter), sans-serif" }}>/100</p>
        </div>
      </div>

      {/* Justification */}
      {c.score_justification && (
        <p style={{ margin: "0 16px 8px", fontSize: 11, color: "#9CA3AF", fontStyle: "italic", fontFamily: "var(--font-inter), sans-serif", lineHeight: 1.5 }}>
          {c.score_justification}
        </p>
      )}

      {/* Keywords */}
      {c.keywords && c.keywords.length > 0 && (
        <div style={{ padding: "0 16px 10px", display: "flex", flexWrap: "wrap", gap: 4 }}>
          {c.keywords.slice(0, 6).map((kw, ki) => (
            <span key={`${kw}-${ki}`} style={{
              fontSize: 10, padding: "2px 7px", borderRadius: 999,
              background: "#F0ECF8", color: "#7C63C8",
              fontFamily: "var(--font-inter), sans-serif", fontWeight: 500,
            }}>{kw}</span>
          ))}
        </div>
      )}

      <div style={{ height: 1, background: "#F0ECF8" }} />

      {/* Message */}
      <div style={{ padding: "10px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "#374151", fontFamily: "var(--font-inter), sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Message préparé
          </p>
          {c.message_draft && (
            <button onClick={copyMsg} style={{
              fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 6,
              border: "1.5px solid #E2DAF6", background: copied ? "#EDE8FB" : "white",
              color: "#7C63C8", cursor: "pointer", fontFamily: "var(--font-inter), sans-serif",
              transition: "background 150ms",
            }}>
              {copied ? "✓ Copié" : "Copier"}
            </button>
          )}
        </div>
        {c.message_draft ? (
          <p style={{
            margin: 0, fontSize: 12, color: "#374151", lineHeight: 1.65,
            fontFamily: "var(--font-inter), sans-serif", whiteSpace: "pre-wrap",
            background: "#F8F6FF", borderRadius: 8, padding: "8px 11px",
            border: "1px solid #EDE8FB",
            maxHeight: 100, overflowY: "auto",
          }}>{c.message_draft}</p>
        ) : (
          <p style={{ margin: 0, fontSize: 11, color: "#D1D5DB", fontStyle: "italic", fontFamily: "var(--font-inter), sans-serif" }}>
            Pas de message généré pour ce profil
          </p>
        )}
      </div>

      <div style={{ height: 1, background: "#F0ECF8" }} />

      {/* Footer */}
      <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        {/* Contact checkbox */}
        <button
          onClick={() => onContact(c.id)}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "none", border: "none", cursor: "pointer", padding: 0,
          }}
        >
          <div style={{
            width: 16, height: 16, borderRadius: 4, flexShrink: 0,
            border: `2px solid ${isContacted ? "#7C63C8" : "#D1D5DB"}`,
            background: isContacted ? "#7C63C8" : "white",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 150ms",
          }}>
            {isContacted && (
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <span style={{
            fontSize: 12, fontWeight: isContacted ? 600 : 400,
            color: isContacted ? "#7C63C8" : "#6B7280",
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            {isContacted && c.contacted_at
              ? `Contacté le ${new Date(c.contacted_at).toLocaleDateString("fr-FR")}`
              : "Marquer comme contacté"}
          </span>
        </button>

        {/* Profile link */}
        {c.linkedin_url && (
          <a
            href={c.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => !c.consulted_at && onConsult(c.id)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 7,
              textDecoration: "none", color: srcMeta.color, background: srcMeta.bg,
              border: `1.5px solid ${srcMeta.color}35`,
              fontFamily: "var(--font-inter), sans-serif",
              transition: "all 150ms", whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = srcMeta.color; e.currentTarget.style.color = "white" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = srcMeta.bg; e.currentTarget.style.color = srcMeta.color }}
          >
            {srcMeta.urlLabel} →
          </a>
        )}
      </div>
    </div>
  )
}

/* ── Relevant (medium) card ───────────────────────────────────── */

function RelevantCard({ c, onConsult }: { c: Candidate; onConsult: (id: string) => void }) {
  const score = c.relevance_score
  const srcMeta = SOURCE_META[c.source ?? "linkedin"] ?? SOURCE_META.linkedin
  const isConsulted = Boolean(c.consulted_at)
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "9px 12px",
      borderRadius: 9, border: "1px solid #F0ECF8", background: "white",
      opacity: isConsulted ? 0.65 : 1,
    }}>
      <SourceBadge source={c.source} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#111827", fontFamily: "var(--font-inter), sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {c.name_estimated ?? "—"}
        </p>
        <p style={{ margin: 0, fontSize: 11, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[c.title_estimated, c.company].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>
      {score != null && (
        <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 6, fontFamily: "var(--font-inter), sans-serif", ...scoreColor(score) }}>{score}</span>
      )}
      {c.linkedin_url && (
        <a
          href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
          onClick={() => !isConsulted && onConsult(c.id)}
          style={{
            flexShrink: 0, fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6,
            textDecoration: "none", color: srcMeta.color, background: srcMeta.bg,
            fontFamily: "var(--font-inter), sans-serif",
          }}
        >→</a>
      )}
    </div>
  )
}

/* ── Compact row ──────────────────────────────────────────────── */

function CompactRow({ c, i, onConsult }: { c: Candidate; i: number; onConsult: (id: string) => void }) {
  const srcMeta = SOURCE_META[c.source ?? "linkedin"] ?? SOURCE_META.linkedin
  const score = c.relevance_score
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 7, padding: "7px 10px",
      borderRadius: 7, background: "white", opacity: c.consulted_at ? 0.55 : 1,
    }}>
      <span style={{ width: 18, fontSize: 10, fontWeight: 700, color: "#C4B5FD", fontFamily: "var(--font-inter), sans-serif", textAlign: "right", flexShrink: 0 }}>
        {c.consulted_at ? "✓" : i + 1}
      </span>
      <SourceBadge source={c.source} />
      <p style={{ flex: 1, margin: 0, fontSize: 12, color: "#374151", fontFamily: "var(--font-inter), sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {c.name_estimated ?? "—"}
        {c.title_estimated && <span style={{ color: "#9CA3AF" }}> · {c.title_estimated}</span>}
      </p>
      {score != null && (
        <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: scoreColor(score).color, fontFamily: "var(--font-inter), sans-serif" }}>{score}</span>
      )}
      {c.linkedin_url && (
        <a
          href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
          onClick={() => !c.consulted_at && onConsult(c.id)}
          style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 5, textDecoration: "none", color: srcMeta.color, background: srcMeta.bg, fontFamily: "var(--font-inter), sans-serif" }}
        >→</a>
      )}
    </div>
  )
}

/* ── Preview strip (shown when panel is collapsed) ────────────── */

function PreviewStrip({ candidates }: { candidates: Candidate[] }) {
  const shown = candidates.slice(0, 4)
  if (shown.length === 0) return null
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 16px 12px", flexWrap: "wrap" }}>
      {shown.map((c) => {
        const srcMeta = SOURCE_META[c.source ?? "linkedin"] ?? SOURCE_META.linkedin
        const score = c.relevance_score
        return (
          <span key={c.id} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 999,
            background: "#F8F6FF", border: "1px solid #EDE8FB",
            color: "#374151", fontFamily: "var(--font-inter), sans-serif",
            maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: srcMeta.color, flexShrink: 0 }} />
            {c.name_estimated ?? "—"}
            {score != null && <span style={{ color: scoreColor(score).color, fontWeight: 700, marginLeft: 2 }}>{score}</span>}
          </span>
        )
      })}
      {candidates.length > 4 && (
        <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
          +{candidates.length - 4} autres
        </span>
      )}
    </div>
  )
}

/* ── Expandable panel ─────────────────────────────────────────── */

function Panel({
  panelKey, icon, title, count, avgScore,
  isOpen, onToggle, previewCandidates, children,
}: {
  panelKey: PanelKey
  icon: string
  title: string
  count: number
  avgScore?: number
  isOpen: boolean
  onToggle: () => void
  previewCandidates: Candidate[]
  children: React.ReactNode
}) {
  return (
    <div style={{
      borderRadius: 14,
      border: `1.5px solid ${isOpen ? "#DDD6FE" : "#F0ECF8"}`,
      background: "white",
      overflow: "hidden",
      transition: "border-color 250ms",
    }}>
      {/* Always-visible header */}
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "14px 16px 12px",
          background: "none", border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 13, fontWeight: 700,
            color: isOpen ? "#111827" : "#374151",
            fontFamily: "var(--font-space-grotesk), sans-serif",
            transition: "color 200ms",
          }}>{title}</p>
          {avgScore != null && (
            <p style={{ margin: 0, fontSize: 10, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
              score moyen {avgScore}/100
            </p>
          )}
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
          color: isOpen ? "#7C63C8" : "#9CA3AF",
          background: isOpen ? "#EDE8FB" : "#F3F4F6",
          fontFamily: "var(--font-inter), sans-serif",
          transition: "all 200ms", flexShrink: 0,
        }}>{count}</span>
        {/* Chevron */}
        <svg
          width="14" height="14" viewBox="0 0 20 20" fill="none"
          style={{
            flexShrink: 0,
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 300ms cubic-bezier(0.22,1,0.36,1)",
            color: "#9CA3AF",
          }}
        >
          <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Preview strip — visible only when collapsed */}
      <div style={{
        display: "grid",
        gridTemplateRows: isOpen ? "0fr" : "1fr",
        transition: "grid-template-rows 0.32s cubic-bezier(0.22,1,0.36,1)",
      }}>
        <div style={{ overflow: "hidden" }}>
          <PreviewStrip candidates={previewCandidates} />
        </div>
      </div>

      {/* Expanded content */}
      <div style={{
        display: "grid",
        gridTemplateRows: isOpen ? "1fr" : "0fr",
        transition: "grid-template-rows 0.35s cubic-bezier(0.22,1,0.36,1)",
      }}>
        <div style={{ overflow: "hidden" }}>
          <div style={{ height: 1, background: "#F0ECF8" }} />
          <div style={{
            maxHeight: "calc(100vh - 340px)",
            minHeight: 120,
            overflowY: "auto",
            padding: panelKey === "top" ? "12px" : panelKey === "relevant" ? "10px" : "8px",
            display: "flex", flexDirection: "column",
            gap: panelKey === "top" ? 10 : 5,
          }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Market Insights widget ────────────────────────────────────── */

function MarketInsights({ candidates }: { candidates: Candidate[] }) {
  const scored = candidates.filter((c) => c.relevance_score != null)
  if (scored.length === 0) return null

  const avgScore = Math.round(scored.reduce((s, c) => s + (c.relevance_score ?? 0), 0) / scored.length)
  const highScore = scored.filter((c) => (c.relevance_score ?? 0) >= 80).length
  const liCount   = candidates.filter((c) => (c.source ?? "linkedin") === "linkedin").length
  const maltCount = candidates.filter((c) => c.source === "malt").length
  const apecCount = candidates.filter((c) => c.source === "apec").length

  // Most common keyword across all candidates
  const kwFreq: Record<string, number> = {}
  candidates.forEach((c) => {
    (c.keywords ?? []).forEach((kw) => {
      const k = kw.toLowerCase().trim()
      if (k) kwFreq[k] = (kwFreq[k] ?? 0) + 1
    })
  })
  const topKw = Object.entries(kwFreq).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null

  return (
    <div style={{
      borderRadius: 12, border: "1.5px solid #E2DAF6",
      background: "linear-gradient(135deg, #FDFAFF 0%, #F8F4FF 100%)",
      padding: "14px 16px",
    }}>
      <p style={{
        margin: "0 0 10px", fontSize: 10, fontWeight: 700, color: "#9CA3AF",
        textTransform: "uppercase", letterSpacing: "0.06em",
        fontFamily: "var(--font-inter), sans-serif",
      }}>
        Analyse du marché
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {/* Score moyen */}
        <div style={{ textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: avgScore >= 70 ? "#16a34a" : avgScore >= 55 ? "#D97706" : "#DC2626", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
            {avgScore}
          </p>
          <p style={{ margin: 0, fontSize: 10, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
            Score moyen
          </p>
        </div>
        {/* Profils excellents */}
        <div style={{ textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#7C63C8", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
            {highScore}
          </p>
          <p style={{ margin: 0, fontSize: 10, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
            Score ≥ 80
          </p>
        </div>
        {/* Sources */}
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 5, flexWrap: "wrap" }}>
            {liCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: "rgba(10,102,194,0.09)", color: "#0A66C2", fontFamily: "var(--font-inter), sans-serif" }}>
                LI {liCount}
              </span>
            )}
            {maltCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: "rgba(252,87,87,0.09)", color: "#FC5757", fontFamily: "var(--font-inter), sans-serif" }}>
                Ma {maltCount}
              </span>
            )}
            {apecCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: "rgba(232,119,34,0.09)", color: "#E87722", fontFamily: "var(--font-inter), sans-serif" }}>
                AP {apecCount}
              </span>
            )}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 10, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
            Sources
          </p>
        </div>
      </div>
      {topKw && (
        <p style={{ margin: "10px 0 0", fontSize: 11, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif" }}>
          Compétence la plus commune : <strong style={{ color: "#7C63C8" }}>{topKw}</strong>
        </p>
      )}
    </div>
  )
}

/* ── Main ─────────────────────────────────────────────────────── */

export default function NoraDashboard({ candidates, briefChatRef, onConsult, onContact }: NoraDashboardProps) {
  const [activePanel, setActivePanel] = useState<PanelKey | null>(null)

  const toggle = (panel: PanelKey) =>
    setActivePanel((prev) => (prev === panel ? null : panel))

  // Segmentation: validated (shortlisted by user) / relevant (score≥50, raw) / rest
  const validatedCandidates = candidates
    .filter((c) => c.status === "shortlisted")
    .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
  const relevantCandidates = candidates
    .filter((c) => c.status === "raw" && (c.relevance_score ?? 0) >= 50)
    .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
  const allCandidates = candidates
    .filter((c) => c.status === "raw" && (c.relevance_score ?? 0) < 50)

  const avgScore = validatedCandidates.length > 0
    ? Math.round(validatedCandidates.reduce((s, c) => s + (c.relevance_score ?? 0), 0) / validatedCandidates.length)
    : undefined
  const contactedCount = validatedCandidates.filter((c) => c.contacted_at).length

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

      {/* ── Market insights ───────────────────────────────── */}
      <MarketInsights candidates={candidates} />

      {/* ── Contact progress + Chercher plus ─────────────── */}
      {validatedCandidates.length > 0 && (
        <div style={{
          padding: "10px 14px", borderRadius: 12, background: "white",
          border: "1.5px solid #F0ECF8",
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", fontFamily: "var(--font-inter), sans-serif", whiteSpace: "nowrap" }}>
            Suivi contacts
          </span>
          <div style={{ flex: 1, minWidth: 80, height: 4, background: "#F0ECF8", borderRadius: 999, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 999,
              background: "linear-gradient(90deg, #7C63C8, #A78BFA)",
              width: `${validatedCandidates.length > 0 ? (contactedCount / validatedCandidates.length) * 100 : 0}%`,
              transition: "width 500ms cubic-bezier(0.22,1,0.36,1)",
            }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#7C63C8", fontFamily: "var(--font-inter), sans-serif", whiteSpace: "nowrap" }}>
            {contactedCount}/{validatedCandidates.length}
          </span>
          <button
            onClick={() => briefChatRef.current?.triggerExtend()}
            style={{
              fontSize: 11, fontWeight: 600, padding: "5px 11px", borderRadius: 8,
              border: "1.5px solid #E2DAF6", background: "white", color: "#7C63C8",
              cursor: "pointer", fontFamily: "var(--font-inter), sans-serif", whiteSpace: "nowrap",
              transition: "background 150ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#F0ECF8" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "white" }}
          >
            + Chercher plus
          </button>
        </div>
      )}

      {/* ── Panel 1: Validés ──────────────────────────────── */}
      {validatedCandidates.length > 0 && (
        <Panel
          panelKey="top"
          icon="✓"
          title="Validés"
          count={validatedCandidates.length}
          avgScore={avgScore}
          isOpen={activePanel === "top"}
          onToggle={() => toggle("top")}
          previewCandidates={validatedCandidates}
        >
          {validatedCandidates.map((c, i) => (
            <ShortlistCard key={c.id} c={c} index={i} onConsult={onConsult} onContact={onContact} />
          ))}
        </Panel>
      )}

      {/* ── Panel 2: Autres pertinents (score≥50) ─────────── */}
      {relevantCandidates.length > 0 && (
        <Panel
          panelKey="relevant"
          icon="◈"
          title="Autres profils pertinents"
          count={relevantCandidates.length}
          isOpen={activePanel === "relevant"}
          onToggle={() => toggle("relevant")}
          previewCandidates={relevantCandidates}
        >
          {relevantCandidates.map((c) => (
            <RelevantCard key={c.id} c={c} onConsult={onConsult} />
          ))}
        </Panel>
      )}

      {/* ── Panel 3: Tous les profils bruts ──────────────── */}
      {allCandidates.length > 0 && (
        <Panel
          panelKey="all"
          icon="≡"
          title="Tous les profils"
          count={allCandidates.length}
          isOpen={activePanel === "all"}
          onToggle={() => toggle("all")}
          previewCandidates={allCandidates}
        >
          {allCandidates.map((c, i) => (
            <CompactRow key={c.id} c={c} i={i} onConsult={onConsult} />
          ))}
        </Panel>
      )}

      {/* Bottom: chercher plus (if no validated yet) */}
      {validatedCandidates.length === 0 && (
        <div style={{ textAlign: "center", paddingTop: 4 }}>
          <button
            onClick={() => briefChatRef.current?.triggerExtend()}
            style={{
              fontSize: 12, fontWeight: 600, padding: "8px 16px", borderRadius: 9,
              border: "1.5px solid #E2DAF6", background: "white", color: "#7C63C8",
              cursor: "pointer", fontFamily: "var(--font-inter), sans-serif",
              transition: "background 150ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#F0ECF8" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "white" }}
          >
            + Chercher plus de profils
          </button>
        </div>
      )}
    </div>
  )
}
