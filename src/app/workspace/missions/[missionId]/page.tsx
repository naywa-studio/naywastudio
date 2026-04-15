"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { m, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { useParams } from "next/navigation"
import { getSupabase } from "@/lib/supabase"
import { AGENT_LEVELS } from "@/lib/mock-store"
import { useWorkspace } from "../../layout"
import type { Database } from "@/lib/database.types"

type Mission = Database["public"]["Tables"]["missions"]["Row"]
type Candidate = Database["public"]["Tables"]["candidates"]["Row"]

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]
const fu = (delay: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay, ease: EASE },
})

/* ── Section visibility per subscription level ─────────────── */

type SectionKey = "results" | "scoring" | "messages" | "pipeline" | "calendar"

function getSections(level: number): SectionKey[] {
  if (level >= 3) return ["results", "scoring", "messages", "pipeline", "calendar"]
  if (level >= 2) return ["results", "scoring", "messages"]
  return ["results"]
}

const SECTION_META: Record<SectionKey, { label: string; icon: string; minLevel: number }> = {
  results:  { label: "Résultats",  icon: "📊", minLevel: 1 },
  scoring:  { label: "Scoring",    icon: "⭐", minLevel: 2 },
  messages: { label: "Messages",   icon: "📧", minLevel: 2 },
  pipeline: { label: "Pipeline",   icon: "🔀", minLevel: 3 },
  calendar: { label: "Booking",    icon: "📅", minLevel: 3 },
}

/* ── Status meta ───────────────────────────────────────────── */

const STATUS_META: Record<Mission["status"], { label: string; color: string; bg: string }> = {
  preparation: { label: "Préparation", color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
  in_progress: { label: "En cours",    color: "#22c55e", bg: "rgba(34,197,94,0.08)" },
  completed:   { label: "Terminée",    color: "#6B7280", bg: "rgba(107,114,128,0.08)" },
}

/* ── Brief chat questions per agent level ─────────────────── */

const AGENT_QUESTIONS: Record<number, string[]> = {
  1: [
    "Bonjour ! Je suis Léo. Décrivez-moi le profil que vous recherchez et je nettoierai votre liste.",
    "Quel format de fichier source souhaitez-vous utiliser ? (CSV, Excel, export Walaxy…)",
    "Merci. Je vais analyser et trier votre liste. Les résultats arrivent très vite.",
  ],
  2: [
    "Bonjour ! Je suis Nora. Décrivez-moi le poste que vous cherchez à pourvoir.",
    "Quel niveau d'expérience attendez-vous ? Dans quel périmètre géographique ?",
    "Des compétences techniques ou soft skills indispensables ?",
    "Parfait, j'ai tout ce qu'il me faut. Je lance le sourcing et vous présenterai une shortlist priorisée.",
  ],
  3: [
    "Bonjour ! Je suis Alex. Décrivez-moi le poste et son contexte.",
    "Quel est le budget salarial prévu et le type de contrat ?",
    "Y a-t-il des contraintes de délai ?",
    "Des compétences techniques ou qualités humaines incontournables ?",
    "Parfait. Je prends en charge l'intégralité du processus. Premiers profils sous 48h.",
  ],
}

type ChatMsg = { id: string; role: "agent" | "user"; text: string }

/* ── Page ─────────────────────────────────────────────────── */

export default function MissionDetailPage() {
  const params = useParams()
  const missionId = params.missionId as string
  const { agentLevel } = useWorkspace()
  const agent = AGENT_LEVELS[agentLevel]

  const [mission, setMission] = useState<Mission | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<SectionKey>("results")

  // Chat state
  const [showChat, setShowChat] = useState(false)
  const [chatInput, setChatInput] = useState("")
  const [chatStep, setChatStep] = useState(0)
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  const questions = AGENT_QUESTIONS[agentLevel] ?? AGENT_QUESTIONS[1]
  const sections = getSections(agentLevel)

  const fetchData = useCallback(async () => {
    const sb = getSupabase()
    const [{ data: m }, { data: c }] = await Promise.all([
      sb.from("missions").select("*").eq("id", missionId).single(),
      sb.from("candidates").select("*").eq("mission_id", missionId).order("score", { ascending: false }),
    ])
    setMission(m)
    setCandidates(c ?? [])
    setLoading(false)
  }, [missionId])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages.length, showChat])

  const handleStartChat = () => {
    setShowChat(true)
    if (chatMessages.length === 0) {
      setChatMessages([{ id: "a0", role: "agent", text: questions[0] }])
      setChatStep(1)
    }
  }

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return
    const text = chatInput.trim()
    setChatInput("")
    const userMsg: ChatMsg = { id: `u${Date.now()}`, role: "user", text }
    setChatMessages((prev) => [...prev, userMsg])

    const nextStep = chatStep
    if (nextStep < questions.length) {
      setTimeout(() => {
        const agentMsg: ChatMsg = { id: `a${Date.now()}`, role: "agent", text: questions[nextStep] }
        setChatMessages((prev) => [...prev, agentMsg])
        setChatStep(nextStep + 1)

        if (nextStep === questions.length - 1) {
          // Brief complete — save to DB and update status
          setTimeout(async () => {
            const briefText = `Brief défini le ${new Date().toLocaleDateString("fr-FR")}.`
            await getSupabase()
              .from("missions")
              .update({ brief: briefText, status: "in_progress" })
              .eq("id", missionId)
            setMission((prev) => prev ? { ...prev, brief: briefText, status: "in_progress" } : prev)
          }, 600)
        }
      }, 700)
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
        <Spinner />
      </div>
    )
  }

  if (!mission) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <p style={{ color: "#6B7280", fontFamily: "var(--font-inter), sans-serif" }}>
          Mission introuvable.
        </p>
        <Link href="/workspace" style={{ color: "#7C63C8", fontFamily: "var(--font-inter), sans-serif" }}>
          ← Retour
        </Link>
      </div>
    )
  }

  const statusMeta = STATUS_META[mission.status]
  const missionDate = new Date(mission.created_at).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  const briefDefined = Boolean(mission.brief)

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px 80px" }}>
      {/* Breadcrumb */}
      <nav style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#9CA3AF" }}>
        <Link href="/workspace" style={{ color: "#9CA3AF", textDecoration: "none", fontFamily: "var(--font-inter), sans-serif" }}>
          Workspace
        </Link>
        <span>/</span>
        <span
          style={{
            color: "#374151",
            fontWeight: 500,
            fontFamily: "var(--font-inter), sans-serif",
            maxWidth: 200,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {mission.title}
        </span>
      </nav>

      {/* Mission header */}
      <m.div
        {...fu(0)}
        style={{
          background: "white",
          borderRadius: 18,
          border: `1.5px solid ${agent.borderColor}`,
          overflow: "hidden",
          marginBottom: 20,
        }}
      >
        <div style={{ height: 3, background: agent.color }} />
        <div style={{ padding: "20px 24px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
              marginBottom: briefDefined ? 0 : 16,
            }}
          >
            <div>
              <h1
                style={{
                  margin: "0 0 4px",
                  fontSize: "clamp(18px, 2.5vw, 24px)",
                  fontWeight: 800,
                  color: "#111827",
                  fontFamily: "var(--font-space-grotesk), sans-serif",
                }}
              >
                {mission.title}
              </h1>
              <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
                Agent {agent.agent} · Créée le {missionDate}
              </p>
            </div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                fontWeight: 600,
                padding: "5px 12px",
                borderRadius: 999,
                color: statusMeta.color,
                background: statusMeta.bg,
                fontFamily: "var(--font-inter), sans-serif",
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: statusMeta.color }} />
              {statusMeta.label}
            </span>
          </div>

          {/* Agent welcome — brief not defined yet */}
          {!briefDefined && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "16px",
                borderRadius: 12,
                background: agent.colorLight,
                border: `1px solid ${agent.borderColor}`,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "white",
                  background: agent.color,
                  flexShrink: 0,
                }}
              >
                {agent.agent.charAt(0)}
              </div>
              <div>
                <p style={{ margin: "0 0 10px", fontSize: 14, color: "#111827", lineHeight: 1.6, fontFamily: "var(--font-inter), sans-serif" }}>
                  Bonjour&nbsp;! Je suis <strong>{agent.agent}</strong>, votre {agent.role.toLowerCase()}.
                  Commençons par définir votre besoin pour cette mission.
                </p>
                <button
                  onClick={handleStartChat}
                  style={{
                    padding: "9px 18px",
                    borderRadius: 9,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "white",
                    background: agent.color,
                    fontFamily: "var(--font-inter), sans-serif",
                  }}
                >
                  Définir le besoin →
                </button>
              </div>
            </div>
          )}
        </div>
      </m.div>

      {/* Chat panel */}
      <AnimatePresence>
        {showChat && !briefDefined && (
          <m.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              background: "white",
              borderRadius: 18,
              border: "1.5px solid #F0ECF8",
              overflow: "hidden",
              marginBottom: 20,
            }}
          >
            {/* Chat header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 20px",
                borderBottom: "1px solid #F0ECF8",
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "white",
                  background: agent.color,
                }}
              >
                {agent.agent.charAt(0)}
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827", fontFamily: "var(--font-inter), sans-serif" }}>
                  Conversation avec {agent.agent}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
                  Définition du besoin
                </p>
              </div>
            </div>

            {/* Messages */}
            <div style={{ maxHeight: 340, overflowY: "auto", padding: "16px 20px" }}>
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: "flex",
                    justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      maxWidth: "76%",
                      padding: "10px 14px",
                      fontSize: 13,
                      lineHeight: 1.6,
                      fontFamily: "var(--font-inter), sans-serif",
                      borderRadius: msg.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
                      background: msg.role === "user" ? agent.color : "#F3F4F6",
                      color: msg.role === "user" ? "white" : "#111827",
                    }}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            {chatStep < questions.length && (
              <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #F0ECF8" }}>
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder="Décrivez votre besoin…"
                  style={{
                    flex: 1,
                    padding: "10px 14px",
                    borderRadius: 9,
                    border: "1.5px solid #E5E7EB",
                    fontSize: 13,
                    color: "#111827",
                    outline: "none",
                    fontFamily: "var(--font-inter), sans-serif",
                  }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim()}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 9,
                    border: "none",
                    cursor: chatInput.trim() ? "pointer" : "not-allowed",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "white",
                    background: chatInput.trim() ? agent.color : "#D1D5DB",
                    fontFamily: "var(--font-inter), sans-serif",
                  }}
                >
                  Envoyer
                </button>
              </div>
            )}
          </m.div>
        )}
      </AnimatePresence>

      {/* Sections — visible once brief is defined */}
      {briefDefined && (
        <m.div {...fu(0.08)}>
          {/* Section tabs */}
          <div
            style={{
              display: "flex",
              gap: 6,
              marginBottom: 16,
              overflowX: "auto",
              paddingBottom: 2,
            }}
          >
            {sections.map((key) => {
              const meta = SECTION_META[key]
              const isActive = activeSection === key
              return (
                <button
                  key={key}
                  onClick={() => setActiveSection(key)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    borderRadius: 10,
                    border: isActive ? `1.5px solid ${agent.borderColor}` : "1.5px solid #F0ECF8",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? agent.color : "#6B7280",
                    background: isActive ? agent.colorLight : "white",
                    fontFamily: "var(--font-inter), sans-serif",
                    whiteSpace: "nowrap",
                    transition: "all 150ms",
                  }}
                >
                  <span>{meta.icon}</span>
                  {meta.label}
                </button>
              )
            })}
          </div>

          {/* Section content */}
          <div
            style={{
              background: "white",
              borderRadius: 16,
              border: "1.5px solid #F0ECF8",
              padding: "24px",
              minHeight: 200,
            }}
          >
            <SectionContent
              sectionKey={activeSection}
              candidates={candidates}
              agentName={agent.agent}
            />
          </div>
        </m.div>
      )}
    </main>
  )
}

/* ── Section renderers ────────────────────────────────────── */

function SectionContent({
  sectionKey,
  candidates,
  agentName,
}: {
  sectionKey: SectionKey
  candidates: Candidate[]
  agentName: string
}) {
  if (candidates.length === 0) {
    return <EmptySection agentName={agentName} />
  }

  switch (sectionKey) {
    case "results":
      return <ResultsSection candidates={candidates} />
    case "scoring":
      return <ScoringSection candidates={candidates} />
    case "messages":
      return <MessagesSection candidates={candidates} />
    case "pipeline":
      return <PipelineSection candidates={candidates} />
    case "calendar":
      return <CalendarSection />
    default:
      return null
  }
}

function EmptySection({ agentName }: { agentName: string }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 0" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
      <p
        style={{
          margin: "0 0 6px",
          fontSize: 15,
          fontWeight: 600,
          color: "#374151",
          fontFamily: "var(--font-space-grotesk), sans-serif",
        }}
      >
        {agentName} travaille sur votre mission
      </p>
      <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
        Les résultats apparaîtront ici dès qu&apos;ils seront disponibles.
      </p>
    </div>
  )
}

function ResultsSection({ candidates }: { candidates: Candidate[] }) {
  return (
    <div>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif" }}>
        {candidates.length} profil{candidates.length !== 1 ? "s" : ""} identifié{candidates.length !== 1 ? "s" : ""}
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 480, borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["Nom estimé", "Entreprise", "Score", "Statut"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 12px",
                    textAlign: "left",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#9CA3AF",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    borderBottom: "2px solid #F0ECF8",
                    fontFamily: "var(--font-inter), sans-serif",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #F8F6FF" }}>
                <td style={{ padding: "11px 12px", fontWeight: 500, color: "#111827", fontFamily: "var(--font-inter), sans-serif" }}>
                  {c.name_estimated ?? "—"}
                </td>
                <td style={{ padding: "11px 12px", color: "#6B7280", fontFamily: "var(--font-inter), sans-serif" }}>
                  {c.company ?? "—"}
                </td>
                <td style={{ padding: "11px 12px" }}>
                  {c.score !== null ? (
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        color: c.score >= 80 ? "#22c55e" : "#F59E0B",
                        background: c.score >= 80 ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)",
                        fontFamily: "var(--font-inter), sans-serif",
                      }}
                    >
                      {c.score}
                    </span>
                  ) : "—"}
                </td>
                <td style={{ padding: "11px 12px", color: "#6B7280", fontFamily: "var(--font-inter), sans-serif" }}>
                  {c.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ScoringSection({ candidates }: { candidates: Candidate[] }) {
  const scored = candidates.filter((c) => c.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {scored.map((c) => (
        <div
          key={c.id}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderRadius: 12,
            border: "1px solid #F0ECF8",
            background: "#FAFAFA",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827", fontFamily: "var(--font-inter), sans-serif" }}>
              {c.name_estimated ?? "Candidat inconnu"}
            </p>
            {c.company && (
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif" }}>
                {c.company}
              </p>
            )}
            {c.keywords && c.keywords.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {c.keywords.slice(0, 4).map((kw) => (
                  <span
                    key={kw}
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "#F0ECF8",
                      color: "#7C63C8",
                      fontFamily: "var(--font-inter), sans-serif",
                    }}
                  >
                    {kw}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: (c.score ?? 0) >= 80 ? "#22c55e" : "#F59E0B",
                fontFamily: "var(--font-space-grotesk), sans-serif",
              }}
            >
              {c.score ?? "—"}
            </span>
            <span style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>/100</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function MessagesSection({ candidates }: { candidates: Candidate[] }) {
  const withMessages = candidates.filter((c) => c.message_draft)
  if (withMessages.length === 0) {
    return <EmptySection agentName="L'agent" />
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {withMessages.map((c) => (
        <div key={c.id} style={{ borderRadius: 12, border: "1px solid #F0ECF8", overflow: "hidden" }}>
          <div
            style={{
              padding: "10px 16px",
              background: "#F8F6FF",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827", fontFamily: "var(--font-inter), sans-serif" }}>
              {c.name_estimated ?? "Candidat"} {c.company ? `— ${c.company}` : ""}
            </p>
            <button
              onClick={() => { if (c.message_draft) navigator.clipboard.writeText(c.message_draft) }}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#7C63C8",
                background: "transparent",
                border: "1px solid #E2DAF6",
                borderRadius: 7,
                padding: "4px 10px",
                cursor: "pointer",
                fontFamily: "var(--font-inter), sans-serif",
              }}
            >
              Copier
            </button>
          </div>
          <p
            style={{
              margin: 0,
              padding: "12px 16px",
              fontSize: 13,
              color: "#374151",
              lineHeight: 1.7,
              fontFamily: "var(--font-inter), sans-serif",
              whiteSpace: "pre-wrap",
            }}
          >
            {c.message_draft}
          </p>
        </div>
      ))}
    </div>
  )
}

function PipelineSection({ candidates }: { candidates: Candidate[] }) {
  const statuses: Candidate["status"][] = ["new", "qualified", "contacted", "rejected"]
  const labels: Record<Candidate["status"], string> = {
    new: "Nouveau",
    qualified: "Qualifié",
    contacted: "Contacté",
    rejected: "Rejeté",
  }
  const colors: Record<Candidate["status"], string> = {
    new: "#6B7280",
    qualified: "#3b82f6",
    contacted: "#22c55e",
    rejected: "#EF4444",
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
      {statuses.map((status) => {
        const group = candidates.filter((c) => c.status === status)
        return (
          <div key={status} style={{ borderRadius: 12, border: "1px solid #F0ECF8", overflow: "hidden" }}>
            <div
              style={{
                padding: "8px 14px",
                background: "#F8F6FF",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: colors[status], fontFamily: "var(--font-inter), sans-serif" }}>
                {labels[status]}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: colors[status],
                  background: `${colors[status]}14`,
                  padding: "2px 7px",
                  borderRadius: 999,
                  fontFamily: "var(--font-inter), sans-serif",
                }}
              >
                {group.length}
              </span>
            </div>
            <div style={{ padding: "8px" }}>
              {group.length === 0 ? (
                <p style={{ margin: 0, padding: "8px 6px", fontSize: 12, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
                  Aucun candidat
                </p>
              ) : (
                group.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      marginBottom: 4,
                      background: "white",
                      border: "1px solid #F0ECF8",
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#111827", fontFamily: "var(--font-inter), sans-serif" }}>
                      {c.name_estimated ?? "Inconnu"}
                    </p>
                    {c.company && (
                      <p style={{ margin: 0, fontSize: 11, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
                        {c.company}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CalendarSection() {
  return (
    <div style={{ textAlign: "center", padding: "40px 0" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📅</div>
      <p
        style={{
          margin: "0 0 6px",
          fontSize: 15,
          fontWeight: 600,
          color: "#374151",
          fontFamily: "var(--font-space-grotesk), sans-serif",
        }}
      >
        Booking en attente
      </p>
      <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
        Les liens de réservation apparaîtront ici une fois les candidats contactés.
      </p>
    </div>
  )
}

function Spinner() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" style={{ animation: "spin 0.8s linear infinite" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" stroke="#E2DAF6" strokeWidth="3" fill="none" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="#7C63C8" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  )
}
