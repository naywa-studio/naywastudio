"use client"

/** DEV ONLY — preview workspace avec les 3 agents */

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { AGENT_LEVELS } from "@/lib/mock-store"

/* ── Mock data ─────────────────────────────────────────────── */

const MOCK_CANDIDATES = [
  { id: "1", name: "Sophie Martin",  company: "Doctolib",  score: 92, status: "shortlisted", keywords: ["React", "Node.js", "TypeScript"], message: "Bonjour Sophie,\n\nJe recrute pour un poste de Dev Full-Stack Senior chez notre client. Votre profil m'a particulièrement intéressé.\n\nSeriez-vous disponible pour un échange de 30 min ?\n\n→ Réservez votre créneau : https://nawastudio.com/booking/abc123\n\nCordialement,\nHussein" },
  { id: "2", name: "Thomas Durand",  company: "Leboncoin", score: 88, status: "shortlisted", keywords: ["Vue.js", "Python", "AWS"],           message: "Bonjour Thomas,\n\nVotre expérience full-stack chez Leboncoin correspond exactement à ce que nous recherchons.\n\n→ Choisissez votre créneau : https://nawastudio.com/booking/def456\n\nCordialement,\nHussein" },
  { id: "3", name: "Claire Petit",   company: "Qonto",     score: 81, status: "raw",         keywords: ["React", "GraphQL"],                message: "" },
  { id: "4", name: "Marc Lefevre",   company: "ManoMano",  score: 76, status: "raw",         keywords: ["Angular", "Java"],                 message: "" },
  { id: "5", name: "Pierre Dubois",  company: "BlaBlaCar", score: 61, status: "rejected",    keywords: ["PHP", "Symfony"],                  message: "" },
]

const PIPELINE_STAGES = ["À contacter", "Contacté", "Entretien RH", "Entretien tech", "Offre"]

const BOOKING_LINKS = [
  { id: "bl1", candidateId: "1", name: "Sophie Martin",  company: "Doctolib",  status: "reserved", url: "https://nawastudio.com/booking/abc123" },
  { id: "bl2", candidateId: "2", name: "Thomas Durand",  company: "Leboncoin", status: "pending",  url: "https://nawastudio.com/booking/def456" },
]

const AGENT_CHAT: Record<number, { id: string; role: "agent" | "user"; text: string }[]> = {
  1: [
    { id: "1", role: "agent", text: "Bonjour ! Je suis Léo 🧹 votre agent de tri & nettoyage. Décrivez-moi le profil et je nettoie votre liste." },
    { id: "2", role: "user",  text: "Dev Full-Stack Senior, 4+ ans React/Node.js, Paris ou remote, CDI 55-65K€." },
    { id: "3", role: "agent", text: "Parfait. J'ai trouvé et trié 47 profils — 5 qualifiés prêts dans Résultats." },
  ],
  2: [
    { id: "1", role: "agent", text: "Bonjour ! Je suis Nora 🎯 votre agent de sourcing. Je source, score et rédige des messages personnalisés." },
    { id: "2", role: "user",  text: "Dev Full-Stack Senior, 4+ ans React/Node.js, Paris ou remote, CDI 55-65K€." },
    { id: "3", role: "agent", text: "Sourcing terminé. Shortlist de 2 profils scorés + messages personnalisés prêts dans vos onglets." },
  ],
  3: [
    { id: "1", role: "agent", text: "Bonjour ! Je suis Alex 🚀 votre orchestrateur. Je gère tout : sourcing → scoring → messages → booking." },
    { id: "2", role: "user",  text: "Dev Full-Stack Senior, 4+ ans React/Node.js, Paris ou remote, CDI 55-65K€." },
    { id: "3", role: "agent", text: "Pipeline complet lancé. 2 profils prêts, messages générés, liens booking créés. Consultez chaque onglet." },
  ],
}

/* ── Section config per agent ──────────────────────────────── */

type SectionKey = "results" | "scoring" | "messages" | "pipeline" | "booking"

const ALL_SECTIONS: { key: SectionKey; label: string; icon: string }[] = [
  { key: "results",  label: "Résultats", icon: "📊" },
  { key: "scoring",  label: "Scoring",   icon: "⭐" },
  { key: "messages", label: "Messages",  icon: "📧" },
  { key: "pipeline", label: "Pipeline",  icon: "🔀" },
  { key: "booking",  label: "Booking",   icon: "📅" },
]

function getSections(level: number): SectionKey[] {
  if (level >= 3) return ["results", "scoring", "messages", "pipeline", "booking"]
  if (level >= 2) return ["results", "scoring", "messages"]
  return ["results"]
}

const STATUS_META = {
  raw:         { label: "Brut",      color: "#6B7280", bg: "rgba(107,114,128,0.08)" },
  shortlisted: { label: "Shortlist", color: "#22c55e", bg: "rgba(34,197,94,0.08)"  },
  rejected:    { label: "Rejeté",    color: "#EF4444", bg: "rgba(239,68,68,0.08)"  },
}

const BOOKING_STATUS = {
  pending:  { label: "En attente", color: "#F59E0B" },
  reserved: { label: "Réservé",    color: "#3b82f6" },
  done:     { label: "Effectué",   color: "#22c55e" },
}

/* ── Component ─────────────────────────────────────────────── */

export default function MissionPreview() {
  const [agentLevel, setAgentLevel] = useState(1)
  const [activeSection, setActiveSection] = useState<SectionKey>("results")
  const [chatInput, setChatInput] = useState("")
  const [messages, setMessages] = useState(AGENT_CHAT[1])
  const [copied, setCopied] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const agent = AGENT_LEVELS[agentLevel]
  const sections = getSections(agentLevel)

  const switchAgent = (level: number) => {
    setAgentLevel(level)
    setMessages(AGENT_CHAT[level])
    const newSections = getSections(level)
    setActiveSection(newSections[0])
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  const sendMessage = () => {
    if (!chatInput.trim()) return
    const text = chatInput.trim()
    setChatInput("")
    setMessages((prev) => [...prev, { id: `u${Date.now()}`, role: "user", text }])
    setTimeout(() => {
      setMessages((prev) => [...prev, { id: `a${Date.now()}`, role: "agent", text: "Je prends en compte votre demande." }])
    }, 700)
  }

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAFA", fontFamily: "var(--font-inter), sans-serif" }}>

      {/* ── Header ── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 40, height: 60,
        background: "rgba(255,255,255,0.95)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid #F0ECF8",
        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px",
      }}>
        <nav style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#9CA3AF" }}>
          <Link href="/workspace-preview" style={{ color: "#9CA3AF", textDecoration: "none" }}>Workspace</Link>
          <span>/</span>
          <span style={{ color: "#374151", fontWeight: 600 }}>Dev Full-Stack Senior — Paris</span>
        </nav>

        {/* Agent switcher */}
        <div style={{ display: "flex", gap: 6 }}>
          {[1, 2, 3].map((lvl) => {
            const a = AGENT_LEVELS[lvl]
            const active = agentLevel === lvl
            return (
              <button key={lvl} onClick={() => switchAgent(lvl)} style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 999, cursor: "pointer",
                color: active ? a.color : "#9CA3AF",
                background: active ? a.colorLight : "transparent",
                border: active ? `1.5px solid ${a.borderColor}` : "1.5px solid #E5E7EB",
                transition: "all 150ms",
              }}>
                {a.icon} {a.agent}
              </button>
            )
          })}
        </div>
      </header>

      {/* ── Layout ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "300px 1fr",
        height: "calc(100vh - 60px)",
      }}>

        {/* ── Chat gauche ── */}
        <aside style={{
          borderRight: "1px solid #F0ECF8", background: "white",
          display: "flex", flexDirection: "column",
          height: "calc(100vh - 60px)", position: "sticky", top: 60,
        }}>
          {/* Agent header */}
          <div style={{ padding: "16px 18px", borderBottom: "1px solid #F0ECF8", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
              background: agent.colorLight, border: `1px solid ${agent.borderColor}`,
            }}>{agent.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#111827" }}>{agent.agent}</p>
              <p style={{ margin: 0, fontSize: 11, color: "#9CA3AF" }}>{agent.role}</p>
            </div>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 0 3px rgba(34,197,94,0.15)", flexShrink: 0 }} />
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.map((msg) => (
              <div key={msg.id} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "84%", padding: "9px 13px", fontSize: 13, lineHeight: 1.6,
                  borderRadius: msg.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
                  background: msg.role === "user" ? agent.color : "#F3F4F6",
                  color: msg.role === "user" ? "white" : "#111827",
                }}>
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: "10px 12px", borderTop: "1px solid #F0ECF8", display: "flex", gap: 8 }}>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Votre message…"
              style={{
                flex: 1, padding: "9px 12px", borderRadius: 9,
                border: "1.5px solid #E5E7EB", fontSize: 13, color: "#111827",
                outline: "none", background: "#FAFAFA",
              }}
            />
            <button onClick={sendMessage} disabled={!chatInput.trim()} style={{
              width: 36, height: 36, borderRadius: 9, border: "none", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center", cursor: chatInput.trim() ? "pointer" : "not-allowed",
              background: chatInput.trim() ? agent.color : "#E5E7EB",
            }}>
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
                <path d="M3 10l14-7-4 7 4 7-14-7z" fill="white" />
              </svg>
            </button>
          </div>
        </aside>

        {/* ── Contenu droite ── */}
        <div style={{ overflowY: "auto", padding: "24px 28px 80px" }}>

          {/* Mission card */}
          <div style={{
            background: "white", borderRadius: 16, border: `1.5px solid ${agent.borderColor}`,
            overflow: "hidden", marginBottom: 20,
          }}>
            <div style={{ height: 3, background: agent.color }} />
            <div style={{ padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div>
                <h1 style={{ margin: "0 0 3px", fontSize: 20, fontWeight: 800, color: "#111827", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
                  Dev Full-Stack Senior — Paris
                </h1>
                <p style={{ margin: 0, fontSize: 12, color: "#9CA3AF" }}>
                  Agent {agent.agent} · 5 avr. 2026 · {MOCK_CANDIDATES.length} profils
                </p>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 999,
                color: "#22c55e", background: "rgba(34,197,94,0.08)",
                display: "inline-flex", alignItems: "center", gap: 5,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e" }} /> En cours
              </span>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {ALL_SECTIONS.filter(s => sections.includes(s.key)).map(({ key, label, icon }) => {
              const active = activeSection === key
              return (
                <button key={key} onClick={() => setActiveSection(key)} style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px",
                  borderRadius: 10, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap",
                  fontWeight: active ? 700 : 500,
                  color: active ? agent.color : "#6B7280",
                  background: active ? agent.colorLight : "white",
                  border: active ? `1.5px solid ${agent.borderColor}` : "1.5px solid #F0ECF8",
                  transition: "all 150ms",
                }}>
                  {icon} {label}
                </button>
              )
            })}
          </div>

          {/* Section content */}
          <div style={{ background: "white", borderRadius: 16, border: "1.5px solid #F0ECF8", padding: "22px" }}>

            {/* ── Résultats ── */}
            {activeSection === "results" && (
              <div>
                <p style={{ margin: "0 0 14px", fontSize: 13, color: "#6B7280" }}>
                  {MOCK_CANDIDATES.length} profils identifiés
                </p>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr>
                        {["Nom", "Entreprise", "Score", "Statut"].map(h => (
                          <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "2px solid #F0ECF8" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {MOCK_CANDIDATES.map(c => {
                        const meta = STATUS_META[c.status as keyof typeof STATUS_META]
                        return (
                          <tr key={c.id} style={{ borderBottom: "1px solid #F8F6FF" }}>
                            <td style={{ padding: "11px 12px", fontWeight: 500, color: "#111827" }}>{c.name}</td>
                            <td style={{ padding: "11px 12px", color: "#6B7280" }}>{c.company}</td>
                            <td style={{ padding: "11px 12px" }}>
                              <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700, color: c.score >= 80 ? "#22c55e" : c.score >= 70 ? "#F59E0B" : "#EF4444", background: c.score >= 80 ? "rgba(34,197,94,0.08)" : c.score >= 70 ? "rgba(245,158,11,0.08)" : "rgba(239,68,68,0.08)" }}>
                                {c.score}
                              </span>
                            </td>
                            <td style={{ padding: "11px 12px" }}>
                              <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, color: meta.color, background: meta.bg }}>
                                {meta.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Scoring ── */}
            {activeSection === "scoring" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[...MOCK_CANDIDATES].sort((a, b) => b.score - a.score).map(c => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: 12, border: "1px solid #F0ECF8", background: "#FAFAFA", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827" }}>{c.name}</p>
                      <p style={{ margin: "2px 0 6px", fontSize: 12, color: "#6B7280" }}>{c.company}</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {c.keywords.map(kw => (
                          <span key={kw} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#F0ECF8", color: "#7C63C8" }}>{kw}</span>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                      <span style={{ fontSize: 28, fontWeight: 800, color: c.score >= 80 ? "#22c55e" : c.score >= 70 ? "#F59E0B" : "#EF4444", fontFamily: "var(--font-space-grotesk), sans-serif" }}>{c.score}</span>
                      <span style={{ fontSize: 12, color: "#9CA3AF" }}>/100</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Messages ── */}
            {activeSection === "messages" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {MOCK_CANDIDATES.filter(c => c.message).map(c => (
                  <div key={c.id} style={{ borderRadius: 12, border: "1px solid #F0ECF8", overflow: "hidden" }}>
                    <div style={{ padding: "10px 16px", background: "#F8F6FF", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827" }}>{c.name} — {c.company}</p>
                      <button onClick={() => copy(c.message, c.id)} style={{ fontSize: 11, fontWeight: 600, color: "#7C63C8", background: "transparent", border: "1px solid #E2DAF6", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>
                        {copied === c.id ? "✓ Copié !" : "Copier"}
                      </button>
                    </div>
                    <p style={{ margin: 0, padding: "14px 16px", fontSize: 13, color: "#374151", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{c.message}</p>
                  </div>
                ))}
                {MOCK_CANDIDATES.filter(c => !c.message).length > 0 && (
                  <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF", fontStyle: "italic" }}>
                    {MOCK_CANDIDATES.filter(c => !c.message).length} candidat(s) sans message généré.
                  </p>
                )}
              </div>
            )}

            {/* ── Pipeline ── */}
            {activeSection === "pipeline" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
                {PIPELINE_STAGES.map(stage => {
                  const group = MOCK_CANDIDATES.filter(c =>
                    stage === "À contacter" ? c.status === "raw" :
                    stage === "Contacté"    ? c.status === "shortlisted" :
                    false
                  )
                  return (
                    <div key={stage} style={{ borderRadius: 12, border: "1px solid #F0ECF8", overflow: "hidden" }}>
                      <div style={{ padding: "8px 12px", background: "#F8F6FF", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{stage}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: agent.color, background: agent.colorLight, padding: "1px 7px", borderRadius: 999 }}>{group.length}</span>
                      </div>
                      <div style={{ padding: "8px" }}>
                        {group.length === 0
                          ? <p style={{ margin: 0, padding: "6px", fontSize: 12, color: "#9CA3AF" }}>Vide</p>
                          : group.map(c => (
                            <div key={c.id} style={{ padding: "8px 10px", borderRadius: 8, marginBottom: 4, background: "white", border: "1px solid #F0ECF8" }}>
                              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#111827" }}>{c.name}</p>
                              <p style={{ margin: 0, fontSize: 11, color: "#9CA3AF" }}>{c.company}</p>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── Booking ── */}
            {activeSection === "booking" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <p style={{ margin: "0 0 4px", fontSize: 13, color: "#6B7280" }}>{BOOKING_LINKS.length} liens de booking</p>
                {BOOKING_LINKS.map(bl => {
                  const statusInfo = BOOKING_STATUS[bl.status as keyof typeof BOOKING_STATUS]
                  return (
                    <div key={bl.id} style={{ borderRadius: 14, border: "1px solid #F0ECF8", overflow: "hidden" }}>
                      <div style={{ padding: "12px 16px", background: "#FAFAFA", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                        <div>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827" }}>{bl.name}</p>
                          <p style={{ margin: 0, fontSize: 12, color: "#6B7280" }}>{bl.company}</p>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 999, color: statusInfo.color, background: `${statusInfo.color}14` }}>
                          {statusInfo.label}
                        </span>
                      </div>
                      <div style={{ padding: "12px 16px" }}>
                        <button onClick={() => copy(bl.url, bl.id)} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#7C63C8", background: "#F8F6FF", border: "1px solid #E2DAF6", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>
                          🔗 {copied === bl.id ? "✓ Copié !" : bl.url.replace("https://", "")}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
