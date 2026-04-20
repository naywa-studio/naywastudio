"use client"

import { useState, useRef, useEffect } from "react"
import { m, AnimatePresence } from "framer-motion"
import Link from "next/link"

/* ── Design tokens Léo ──────────────────────────────────────── */
const LEO = {
  color: "#22c55e",
  colorLight: "rgba(34,197,94,0.06)",
  colorMid: "rgba(34,197,94,0.12)",
  border: "rgba(34,197,94,0.25)",
}

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]
const fu = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay, ease: EASE },
})

/* ── Mock data ───────────────────────────────────────────────── */
type ProfileStatus = "brut" | "qualifié" | "rejeté"

interface Profile {
  id: string
  name: string
  title: string
  company: string
  location: string
  source: string
  status: ProfileStatus
  keywords: string[]
}

const MOCK_PROFILES: Profile[] = [
  { id: "1", name: "Sophie Martin", title: "Dev Full-Stack", company: "Doctolib", location: "Paris", source: "LinkedIn", status: "brut", keywords: ["React", "Node.js", "TypeScript"] },
  { id: "2", name: "Thomas Durand", title: "Dev Full-Stack", company: "Alan", location: "Paris", source: "LinkedIn", status: "brut", keywords: ["React", "Python", "AWS"] },
  { id: "3", name: "Claire Petit", title: "Dev Backend", company: "Luko", location: "Remote", source: "Tavily", status: "brut", keywords: ["Node.js", "Go", "PostgreSQL"] },
  { id: "4", name: "Marc Lefevre", title: "Dev Full-Stack", company: "Swile", location: "Paris", source: "LinkedIn", status: "brut", keywords: ["React", "Ruby", "Docker"] },
  { id: "5", name: "Julie Moreau", title: "Dev Frontend", company: "Pennylane", location: "Lyon", source: "Tavily", status: "brut", keywords: ["React", "Vue.js", "CSS"] },
  { id: "6", name: "Pierre Dubois", title: "Dev Full-Stack", company: "Contentsquare", location: "Paris", source: "LinkedIn", status: "brut", keywords: ["Angular", "Java", "Kubernetes"] },
  { id: "7", name: "Emma Rousseau", title: "Dev Full-Stack Senior", company: "Ledger", location: "Remote", source: "Tavily", status: "brut", keywords: ["React", "Node.js", "Rust"] },
  { id: "8", name: "Lucas Bernard", title: "Dev Full-Stack", company: "Qonto", location: "Paris", source: "LinkedIn", status: "brut", keywords: ["React", "Elixir", "GraphQL"] },
]

const BRIEF_QUESTIONS = [
  "Bonjour ! Je suis Léo 🧹 Je recherche des profils sur le web pour vous. Quel poste cherchez-vous à pourvoir ?",
  "Dans quelle ville ou région ? (ou remote ?)",
  "Des mots-clés importants pour affiner la recherche ? (ex : React, CDI, 5 ans d'expérience…)",
  "Combien de profils souhaitez-vous que je trouve ? (ex : 30, 50, 100)",
  "Parfait ! Je lance la recherche. Les profils apparaîtront ici dès qu'ils sont trouvés. 🚀",
]

const STATUS_COLORS: Record<ProfileStatus, { color: string; bg: string; label: string }> = {
  brut:     { color: "#6B7280", bg: "rgba(107,114,128,0.08)", label: "Brut" },
  qualifié: { color: "#22c55e", bg: "rgba(34,197,94,0.08)",   label: "Qualifié" },
  rejeté:   { color: "#EF4444", bg: "rgba(239,68,68,0.08)",   label: "Rejeté" },
}

type PreviewState = "brief" | "working" | "results"
type ChatMsg = { id: string; role: "agent" | "user"; text: string }

/* ── Main ────────────────────────────────────────────────────── */
export default function LeoPreviewPage() {
  const [previewState, setPreviewState] = useState<PreviewState>("brief")
  const [profiles, setProfiles] = useState(MOCK_PROFILES)
  const [copied, setCopied] = useState(false)
  const [filterStatus, setFilterStatus] = useState<ProfileStatus | "all">("all")

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAFA", fontFamily: "var(--font-inter), sans-serif" }}>
      {/* Preview bar */}
      <div style={{ background: "#111827", borderBottom: "1px solid #374151", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
            Preview — Interface Léo
          </span>
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: LEO.color, display: "inline-block" }} />
          <span style={{ fontSize: 12, color: LEO.color, fontWeight: 600, fontFamily: "var(--font-inter), sans-serif" }}>Agent N1</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["brief", "working", "results"] as PreviewState[]).map((s) => (
            <button
              key={s}
              onClick={() => setPreviewState(s)}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "var(--font-inter), sans-serif",
                background: previewState === s ? LEO.color : "#374151",
                color: previewState === s ? "white" : "#9CA3AF",
                transition: "all 150ms",
              }}
            >
              {s === "brief" ? "📝 Brief" : s === "working" ? "⚙️ En cours" : "📊 Résultats"}
            </button>
          ))}
        </div>
      </div>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px 80px" }}>
        {/* Breadcrumb */}
        <nav style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#9CA3AF" }}>
          <span style={{ fontFamily: "var(--font-inter), sans-serif" }}>Workspace</span>
          <span>/</span>
          <span style={{ color: "#374151", fontWeight: 500, fontFamily: "var(--font-inter), sans-serif" }}>
            Dev Full-Stack Senior — Paris
          </span>
        </nav>

        {/* Mission header */}
        <m.div key="header" {...fu(0)} style={{ background: "white", borderRadius: 18, border: `1.5px solid ${LEO.border}`, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ height: 3, background: LEO.color }} />
          <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <h1 style={{ margin: "0 0 4px", fontSize: "clamp(18px,2.5vw,24px)", fontWeight: 800, color: "#111827", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
                  Dev Full-Stack Senior — Paris
                </h1>
                <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
                  Agent Léo · Créée le 15 avril 2026
                </p>
              </div>
              <StatusBadge state={previewState} />
            </div>

            {/* Brief CTA — état brief seulement */}
            {previewState === "brief" && (
              <div style={{ marginTop: 16, display: "flex", alignItems: "flex-start", gap: 12, padding: 16, borderRadius: 12, background: LEO.colorLight, border: `1px solid ${LEO.border}` }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, background: LEO.color, flexShrink: 0 }}>
                  🧹
                </div>
                <div>
                  <p style={{ margin: "0 0 10px", fontSize: 14, color: "#111827", lineHeight: 1.6, fontFamily: "var(--font-inter), sans-serif" }}>
                    Bonjour ! Je suis <strong>Léo</strong>, votre agent de recherche de profils.
                    Commençons par définir votre besoin.
                  </p>
                </div>
              </div>
            )}
          </div>
        </m.div>

        <AnimatePresence mode="wait">
          {previewState === "brief" && <BriefChat key="brief" />}
          {previewState === "working" && <WorkingState key="working" />}
          {previewState === "results" && (
            <ResultsView
              key="results"
              profiles={profiles}
              setProfiles={setProfiles}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              copied={copied}
              setCopied={setCopied}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

/* ── Status badge ─────────────────────────────────────────────── */
function StatusBadge({ state }: { state: PreviewState }) {
  const map = {
    brief:   { label: "Préparation", color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
    working: { label: "En cours",    color: "#22c55e", bg: "rgba(34,197,94,0.08)" },
    results: { label: "Terminée",    color: "#6B7280", bg: "rgba(107,114,128,0.08)" },
  }
  const m = map[state]
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 999, color: m.color, background: m.bg, fontFamily: "var(--font-inter), sans-serif" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: m.color }} />
      {m.label}
    </span>
  )
}

/* ── Brief Chat ───────────────────────────────────────────────── */
function BriefChat() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: "a0", role: "agent", text: BRIEF_QUESTIONS[0] },
  ])
  const [input, setInput] = useState("")
  const [step, setStep] = useState(1)
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages.length])

  const send = () => {
    if (!input.trim() || sending) return
    const text = input.trim()
    setInput("")
    setSending(true)
    setMessages((prev) => [...prev, { id: `u${Date.now()}`, role: "user", text }])
    setTimeout(() => {
      if (step < BRIEF_QUESTIONS.length) {
        setMessages((prev) => [...prev, { id: `a${Date.now()}`, role: "agent", text: BRIEF_QUESTIONS[step] }])
        setStep((s) => s + 1)
      }
      setSending(false)
    }, 600)
  }

  const done = step >= BRIEF_QUESTIONS.length

  return (
    <m.div {...fu(0.05)} style={{ background: "white", borderRadius: 18, border: "1.5px solid #F0ECF8", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderBottom: "1px solid #F0ECF8" }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, background: LEO.color }}>
          🧹
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827", fontFamily: "var(--font-inter), sans-serif" }}>Conversation avec Léo</p>
          <p style={{ margin: 0, fontSize: 11, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>Définition du besoin · {step}/{BRIEF_QUESTIONS.length} étapes</p>
        </div>
        {/* Progress */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {BRIEF_QUESTIONS.map((_, i) => (
            <div key={i} style={{ width: 20, height: 4, borderRadius: 999, background: i < step ? LEO.color : "#F0ECF8", transition: "background 300ms" }} />
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={{ maxHeight: 340, overflowY: "auto", padding: "16px 20px" }}>
        {messages.map((msg) => (
          <div key={msg.id} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
            {msg.role === "agent" && (
              <div style={{ width: 26, height: 26, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, background: LEO.colorLight, border: `1px solid ${LEO.border}`, flexShrink: 0, marginRight: 8, alignSelf: "flex-end" }}>🧹</div>
            )}
            <div style={{
              maxWidth: "72%", padding: "10px 14px", fontSize: 13, lineHeight: 1.65,
              fontFamily: "var(--font-inter), sans-serif",
              borderRadius: msg.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
              background: msg.role === "user" ? LEO.color : "#F3F4F6",
              color: msg.role === "user" ? "white" : "#111827",
            }}>
              {msg.text}
            </div>
          </div>
        ))}
        {done && (
          <div style={{ textAlign: "center", padding: "12px 0 4px" }}>
            <span style={{ fontSize: 12, color: LEO.color, fontWeight: 600, fontFamily: "var(--font-inter), sans-serif" }}>
              ✓ Brief complet — Léo va commencer la recherche
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      {!done && (
        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #F0ECF8" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Votre réponse…"
            style={{ flex: 1, padding: "10px 14px", borderRadius: 9, border: "1.5px solid #E5E7EB", fontSize: 13, color: "#111827", outline: "none", fontFamily: "var(--font-inter), sans-serif" }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            style={{ padding: "10px 16px", borderRadius: 9, border: "none", cursor: input.trim() && !sending ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 700, color: "white", background: input.trim() ? LEO.color : "#D1D5DB", fontFamily: "var(--font-inter), sans-serif", transition: "background 150ms" }}
          >
            Envoyer
          </button>
        </div>
      )}
    </m.div>
  )
}

/* ── Working State ────────────────────────────────────────────── */
function WorkingState() {
  const [dots, setDots] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d + 1) % 4), 500)
    return () => clearInterval(id)
  }, [])

  const steps = [
    { label: "Brief analysé",          done: true },
    { label: "Recherche Tavily en cours", done: false, active: true },
    { label: "Déduplication profils",  done: false },
    { label: "Génération Excel",       done: false },
  ]

  return (
    <m.div {...fu(0.05)} style={{ background: "white", borderRadius: 18, border: `1.5px solid ${LEO.border}`, overflow: "hidden" }}>
      <div style={{ padding: "32px 24px", textAlign: "center" }}>
        {/* Animated icon */}
        <div style={{ width: 72, height: 72, borderRadius: 20, background: LEO.colorLight, border: `1.5px solid ${LEO.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, margin: "0 auto 20px", position: "relative" }}>
          🧹
          <span style={{ position: "absolute", top: -4, right: -4, width: 14, height: 14, borderRadius: "50%", background: LEO.color, border: "2px solid white" }}>
            <span style={{ display: "block", width: "100%", height: "100%", borderRadius: "50%", background: LEO.color, animation: "ping 1.2s ease-out infinite" }} />
          </span>
        </div>

        <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#111827", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
          Léo recherche des profils{".".repeat(dots)}
        </h2>
        <p style={{ margin: "0 0 32px", fontSize: 14, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif" }}>
          Recherche en cours via Tavily · Dev Full-Stack Senior · Paris
        </p>

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 340, margin: "0 auto", textAlign: "left" }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 999, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700,
                background: s.done ? LEO.color : s.active ? LEO.colorLight : "#F3F4F6",
                border: s.active ? `2px solid ${LEO.color}` : "2px solid transparent",
                color: s.done ? "white" : s.active ? LEO.color : "#9CA3AF",
              }}>
                {s.done ? "✓" : i + 1}
              </div>
              <span style={{
                fontSize: 13, fontFamily: "var(--font-inter), sans-serif",
                color: s.done ? "#111827" : s.active ? LEO.color : "#9CA3AF",
                fontWeight: s.active ? 600 : 400,
              }}>
                {s.label}
                {s.active && <span style={{ marginLeft: 4, opacity: 0.6 }}>{".".repeat(dots)}</span>}
              </span>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 24, fontSize: 12, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
          Résultats estimés sous quelques minutes
        </p>
      </div>

      <style>{`@keyframes ping { 0%{transform:scale(1);opacity:1} 75%,100%{transform:scale(2);opacity:0} }`}</style>
    </m.div>
  )
}

/* ── Results View ─────────────────────────────────────────────── */
function ResultsView({
  profiles,
  setProfiles,
  filterStatus,
  setFilterStatus,
  copied,
  setCopied,
}: {
  profiles: Profile[]
  setProfiles: React.Dispatch<React.SetStateAction<Profile[]>>
  filterStatus: ProfileStatus | "all"
  setFilterStatus: (v: ProfileStatus | "all") => void
  copied: boolean
  setCopied: (v: boolean) => void
}) {
  const filtered = filterStatus === "all" ? profiles : profiles.filter((p) => p.status === filterStatus)
  const counts = {
    all: profiles.length,
    brut: profiles.filter((p) => p.status === "brut").length,
    qualifié: profiles.filter((p) => p.status === "qualifié").length,
    rejeté: profiles.filter((p) => p.status === "rejeté").length,
  }

  const handleExport = () => {
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const setStatus = (id: string, status: ProfileStatus) => {
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)))
  }

  return (
    <m.div {...fu(0.05)}>
      {/* Stats header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, background: LEO.colorLight, border: `1px solid ${LEO.border}` }}>🧹</div>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#111827", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
              {profiles.length} profils trouvés
            </p>
            <p style={{ margin: 0, fontSize: 12, color: LEO.color, fontWeight: 600, fontFamily: "var(--font-inter), sans-serif" }}>
              ✓ Sourcing terminé · Tavily
            </p>
          </div>
        </div>

        {/* Export Excel */}
        <button
          onClick={handleExport}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "10px 18px", borderRadius: 10, border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 700, color: "white",
            background: copied ? "#16a34a" : LEO.color,
            fontFamily: "var(--font-inter), sans-serif",
            boxShadow: "0 4px 16px rgba(34,197,94,0.25)",
            transition: "all 200ms",
          }}
        >
          {copied ? "✓ Export lancé !" : (
            <>
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
                <path d="M10 2v10M6 8l4 4 4-4M3 14v2a1 1 0 001 1h12a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Télécharger Excel
            </>
          )}
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {(["all", "brut", "qualifié", "rejeté"] as const).map((s) => {
          const isActive = filterStatus === s
          const label = s === "all" ? `Tous (${counts.all})` : `${STATUS_COLORS[s]?.label ?? s} (${counts[s]})`
          const color = s === "all" ? "#6B7280" : STATUS_COLORS[s].color
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              style={{
                padding: "6px 14px", borderRadius: 8, border: isActive ? `1.5px solid ${color}30` : "1.5px solid #F0ECF8",
                cursor: "pointer", fontSize: 12, fontWeight: isActive ? 700 : 500,
                color: isActive ? color : "#6B7280",
                background: isActive ? `${color}10` : "white",
                fontFamily: "var(--font-inter), sans-serif",
                transition: "all 150ms",
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Profile cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map((p, i) => (
          <m.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.35, ease: EASE }}>
            <ProfileCard profile={p} onStatusChange={(s) => setStatus(p.id, s)} />
          </m.div>
        ))}
      </div>
    </m.div>
  )
}

/* ── Profile Card ─────────────────────────────────────────────── */
function ProfileCard({ profile: p, onStatusChange }: { profile: Profile; onStatusChange: (s: ProfileStatus) => void }) {
  const [open, setOpen] = useState(false)
  const statusMeta = STATUS_COLORS[p.status]

  return (
    <div
      style={{
        background: "white", borderRadius: 14,
        border: `1.5px solid ${open ? LEO.border : "#F0ECF8"}`,
        overflow: "hidden", transition: "border-color 150ms, box-shadow 150ms",
        boxShadow: open ? `0 4px 20px ${LEO.colorMid}` : "none",
      }}
    >
      <div
        style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}
        onClick={() => setOpen((v) => !v)}
      >
        {/* Avatar */}
        <div style={{ width: 40, height: 40, borderRadius: 12, background: LEO.colorLight, border: `1px solid ${LEO.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
          {p.name.charAt(0)}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827", fontFamily: "var(--font-inter), sans-serif" }}>{p.name}</p>
          <p style={{ margin: "1px 0 0", fontSize: 12, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif" }}>
            {p.title} · {p.company} · {p.location}
          </p>
        </div>

        {/* Source */}
        <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif", flexShrink: 0 }}>
          via {p.source}
        </span>

        {/* Status badge */}
        <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 999, color: statusMeta.color, background: statusMeta.bg, fontFamily: "var(--font-inter), sans-serif", flexShrink: 0 }}>
          {statusMeta.label}
        </span>

        {/* Chevron */}
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, color: "#D1D5DB", transform: open ? "rotate(90deg)" : "none", transition: "transform 200ms" }}>
          <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {open && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "0 18px 16px", borderTop: "1px solid #F8F6FF" }}>
              {/* Keywords */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "12px 0" }}>
                {p.keywords.map((kw) => (
                  <span key={kw} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, background: LEO.colorLight, color: "#22c55e", border: `1px solid ${LEO.border}`, fontFamily: "var(--font-inter), sans-serif" }}>
                    {kw}
                  </span>
                ))}
              </div>

              {/* Status actions */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif", marginRight: 4 }}>Qualifier :</span>
                {(["brut", "qualifié", "rejeté"] as ProfileStatus[]).map((s) => {
                  const meta = STATUS_COLORS[s]
                  const isActive = p.status === s
                  return (
                    <button
                      key={s}
                      onClick={() => onStatusChange(s)}
                      style={{
                        padding: "5px 12px", borderRadius: 8, border: `1px solid ${meta.color}30`,
                        cursor: "pointer", fontSize: 11, fontWeight: 600,
                        color: isActive ? "white" : meta.color,
                        background: isActive ? meta.color : `${meta.color}10`,
                        fontFamily: "var(--font-inter), sans-serif",
                        transition: "all 150ms",
                      }}
                    >
                      {meta.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
