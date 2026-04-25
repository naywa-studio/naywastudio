"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { AGENT_LEVELS } from "@/lib/mock-store"

/* ── Types ───────────────────────────────────────────────────── */

interface Candidate {
  id: string; initials: string; name: string; title: string
  company: string; ci: string; score: number; status: "shortlisted" | "raw" | "rejected"
  skills?: string[]; location?: string; contract?: string; salary?: string
  experience?: string; availability?: string; aiAnalysis?: string
}
interface MissionStats { analysed: number; shortlist: number; toQualify: number; rejected: number }
interface ChatMsg { id: string; role: "agent" | "user"; text: string; statsCard?: boolean; topProfile?: string }
interface MissionData {
  id: string; name: string; status: "en-cours" | "preparation" | "terminee"; profiles: number
  stats: MissionStats; candidates: Candidate[]
  chat: Record<number, ChatMsg[]>; topProfile: string
}

/* ── Mock missions ───────────────────────────────────────────── */

const MISSIONS_DATA: MissionData[] = [
  {
    id: "1",
    name: "Dev Full-Stack Senior — Paris",
    status: "en-cours",
    profiles: 47,
    topProfile: "Sophie Martin — score 92 · Doctolib",
    stats: { analysed: 47, shortlist: 5, toQualify: 2, rejected: 1 },
    candidates: [
      { id: "1", initials: "SM", name: "Sophie Martin",  title: "Lead Dev Full-Stack",    company: "Doctolib",  ci: "D", score: 92, status: "shortlisted", location: "Paris", contract: "CDI", salary: "62K€", experience: "6 ans", availability: "2 mois",  skills: ["React", "Node.js", "TypeScript", "GraphQL", "AWS"],       aiAnalysis: "Profil idéal : stack React/Node exacte, 6 ans d'exp., Paris intramuros. Doctolib = scale-up solide. Disponible dans 2 mois." },
      { id: "2", initials: "TD", name: "Thomas Durand",  title: "Senior Full-Stack Dev",   company: "Leboncoin", ci: "L", score: 88, status: "shortlisted", location: "Paris", contract: "CDI", salary: "58K€", experience: "5 ans", availability: "1 mois",  skills: ["React", "Node.js", "PostgreSQL", "Docker"],               aiAnalysis: "Très bon profil backend-first, expérience Leboncoin (trafic élevé). React solide, disponible rapidement." },
      { id: "3", initials: "CP", name: "Claire Petit",   title: "Full-Stack Engineer",     company: "Qonto",     ci: "Q", score: 81, status: "raw",         location: "Paris", contract: "CDI", salary: "56K€", experience: "4 ans", availability: "3 mois",  skills: ["React", "Python", "Django", "Redis"],                     aiAnalysis: "Profil fintech solide. Stack légèrement différente (Python/Django) mais React maîtrisé. Transition facile." },
      { id: "4", initials: "ML", name: "Marc Lefevre",   title: "Dev Full-Stack",          company: "ManoMano",  ci: "M", score: 76, status: "raw",         location: "Lille", contract: "CDI", salary: "52K€", experience: "4 ans", availability: "Immédiat", skills: ["Vue.js", "Node.js", "MySQL"],                              aiAnalysis: "Bonne base technique mais stack Vue.js. Localisation Lille peut poser problème pour un poste Paris présentiel." },
      { id: "5", initials: "PD", name: "Pierre Dubois",  title: "Front-End Dev",           company: "BlaBlaCar", ci: "B", score: 61, status: "rejected",    location: "Lyon",  contract: "Freelance", salary: "55K€", experience: "3 ans", availability: "Immédiat", skills: ["Vue.js", "Nuxt", "CSS"],                          aiAnalysis: "Profil front-end uniquement, pas de compétences backend. Ne correspond pas au besoin Full-Stack senior." },
    ],
    chat: {
      1: [
        { id: "g1", role: "agent", text: "Bonjour Hussein. J'ai analysé 47 profils pour la mission Dev Full-Stack Senior — Paris.", statsCard: true, topProfile: "Sophie Martin — score 92 · Doctolib" },
        { id: "u1", role: "user",  text: "Dev Full-Stack Senior, 4+ ans React/Node.js, Paris ou remote, CDI 55-65K€." },
        { id: "g2", role: "agent", text: "Parfait. J'ai trouvé et trié 47 profils — 5 qualifiés prêts dans Résultats. Sophie Martin (92) et Thomas Durand (88) correspondent idéalement." },
      ],
      2: [
        { id: "g1", role: "agent", text: "J'ai sourcé et scoré 47 profils pour cette mission.", statsCard: true, topProfile: "Sophie Martin — score 92 · Doctolib" },
        { id: "u1", role: "user",  text: "Dev Full-Stack Senior, 4+ ans React/Node.js, Paris ou remote, CDI 55-65K€." },
        { id: "g2", role: "agent", text: "Shortlist de 5 profils générée avec messages personnalisés. Consultez les onglets." },
      ],
      3: [
        { id: "g1", role: "agent", text: "Pipeline complet lancé — 47 profils traités, scoring, messages et booking.", statsCard: true, topProfile: "Sophie Martin — score 92 · Doctolib" },
        { id: "u1", role: "user",  text: "Dev Full-Stack Senior, 4+ ans React/Node.js, Paris ou remote, CDI 55-65K€." },
        { id: "g2", role: "agent", text: "2 profils shortlistés, messages générés, liens booking créés." },
      ],
    },
  },
  {
    id: "2",
    name: "Product Manager — Lyon",
    status: "preparation",
    profiles: 12,
    topProfile: "Alice Rousseau — score 87 · Decathlon",
    stats: { analysed: 12, shortlist: 2, toQualify: 4, rejected: 2 },
    candidates: [
      { id: "1", initials: "AR", name: "Alice Rousseau",   title: "Senior Product Manager",  company: "Decathlon", ci: "D", score: 87, status: "shortlisted", location: "Lyon",  contract: "CDI", salary: "58K€", experience: "7 ans", availability: "1 mois",  skills: ["Roadmap", "Agile", "Figma", "SQL", "A/B Testing"],        aiAnalysis: "Profil senior idéal. 7 ans PM chez Decathlon, maîtrise des cycles produit retail. Disponible rapidement." },
      { id: "2", initials: "BM", name: "Baptiste Meyer",   title: "Product Owner",           company: "Veepee",    ci: "V", score: 83, status: "shortlisted", location: "Lyon",  contract: "CDI", salary: "54K€", experience: "5 ans", availability: "2 mois",  skills: ["Scrum", "Jira", "User Stories", "Analytics"],             aiAnalysis: "Bon PO avec culture e-commerce. Légèrement moins senior qu'Alice mais très opérationnel." },
      { id: "3", initials: "CF", name: "Camille Fontaine", title: "Chef de produit",         company: "Cdiscount", ci: "C", score: 74, status: "raw",         location: "Lyon",  contract: "CDI", salary: "50K€", experience: "4 ans", availability: "3 mois",  skills: ["UX Research", "Product Strategy", "Notion"],              aiAnalysis: "Profil orienté UX/recherche. Moins de culture data que demandé mais potentiel fort." },
      { id: "4", initials: "ND", name: "Nicolas Dumas",    title: "PM / Growth",             company: "Auchan",    ci: "A", score: 69, status: "raw",         location: "Lille", contract: "CDI", salary: "52K€", experience: "4 ans", availability: "Immédiat", skills: ["Growth Hacking", "SEO", "Data", "Python"],                aiAnalysis: "Profil growth-PM intéressant mais localisation Lille et orienté acquisition vs produit pur." },
      { id: "5", initials: "LB", name: "Laura Bernard",    title: "Associate PM",            company: "Fnac",      ci: "F", score: 58, status: "rejected",    location: "Paris", contract: "CDI", salary: "44K€", experience: "2 ans", availability: "Immédiat", skills: ["Trello", "Figma"],                                        aiAnalysis: "Profil junior, 2 ans d'expérience seulement. Ne correspond pas au niveau senior requis." },
      { id: "6", initials: "RG", name: "Rémi Garnier",     title: "Product Manager",         company: "Leroy M.",  ci: "L", score: 54, status: "rejected",    location: "Paris", contract: "Freelance", salary: "60K€", experience: "3 ans", availability: "2 mois", skills: ["Agile", "OKR"],                               aiAnalysis: "Statut freelance incompatible avec le besoin CDI. Expérience insuffisante pour le poste." },
    ],
    chat: {
      1: [
        { id: "g1", role: "agent", text: "Bonjour Hussein. J'ai commencé l'analyse pour la mission Product Manager — Lyon. 12 profils identifiés jusqu'ici.", statsCard: true, topProfile: "Alice Rousseau — score 87 · Decathlon" },
        { id: "u1", role: "user",  text: "PM senior, 5 ans d'expérience produit, Lyon ou hybride, CDI 50-60K€." },
        { id: "g2", role: "agent", text: "Bien reçu. Je continue le sourcing sur ce profil — résultats disponibles dans quelques minutes." },
      ],
      2: [
        { id: "g1", role: "agent", text: "Sourcing en cours — 12 profils PM senior identifiés sur Lyon et alentours.", statsCard: true, topProfile: "Alice Rousseau — score 87 · Decathlon" },
        { id: "u1", role: "user",  text: "PM senior, 5 ans d'expérience produit, Lyon ou hybride, CDI 50-60K€." },
        { id: "g2", role: "agent", text: "Shortlist de 2 profils générée. Alice Rousseau (87) est le profil le plus aligné." },
      ],
      3: [
        { id: "g1", role: "agent", text: "Mission en phase de préparation — sourcing actif sur le profil PM Lyon.", statsCard: true, topProfile: "Alice Rousseau — score 87 · Decathlon" },
        { id: "u1", role: "user",  text: "PM senior, 5 ans d'expérience produit, Lyon ou hybride, CDI 50-60K€." },
        { id: "g2", role: "agent", text: "2 profils shortlistés, messages en cours de rédaction. Booking disponible dès validation." },
      ],
    },
  },
]

const QUICK_CHIPS = [
  { label: "Résumer top 3",      icon: "≡" },
  { label: "Dispo rapide",       icon: "⏱" },
  { label: "Élargir critères",   icon: "⊕" },
  { label: "Rédiger contact",    icon: "✉" },
  { label: "Sourcer similaires", icon: "◎" },
]

/* ── Status helpers ──────────────────────────────────────────── */

const STATUS_MISSION: Record<string, { label: string; color: string }> = {
  "en-cours":    { label: "En cours",    color: "#22c55e" },
  "preparation": { label: "Préparation", color: "#F59E0B" },
  "terminee":    { label: "Terminée",    color: "#6B7280" },
}

const STATUS_CANDIDATE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  shortlisted: { label: "Shortlist", color: "#16a34a", bg: "rgba(34,197,94,0.08)",   border: "rgba(34,197,94,0.2)"   },
  raw:         { label: "Brut",      color: "#6B7280", bg: "rgba(107,114,128,0.07)", border: "rgba(107,114,128,0.15)" },
  rejected:    { label: "Rejeté",    color: "#EF4444", bg: "rgba(239,68,68,0.07)",   border: "rgba(239,68,68,0.2)"   },
}

function scoreColor(s: number) {
  if (s >= 85) return "#22c55e"
  if (s >= 72) return "#F59E0B"
  return "#EF4444"
}

type SectionKey = "results" | "pipeline"
function getSections(level: number): SectionKey[] {
  return level >= 2 ? ["results", "pipeline"] : ["results"]
}

/* ── Component ───────────────────────────────────────────────── */

const PIPELINE_STAGES = ["À contacter", "Contacté", "Entretien RH", "Entretien tech", "Offre"]

export default function MissionPreview() {
  const [agentLevel, setAgentLevel]         = useState(1)
  const [activeMissionId, setActiveMissionId] = useState("1")
  const [activeSection, setActiveSection]   = useState<SectionKey>("results")
  const [chatInput, setChatInput]           = useState("")
  const [extraMessages, setExtraMessages]   = useState<Record<string, ChatMsg[]>>({})
  // pipeline: missionId → candidateId → stage name
  const [pipelineStages, setPipelineStages] = useState<Record<string, Record<string, string>>>({})
  const [draggingId, setDraggingId]         = useState<string | null>(null)
  const [dragOverStage, setDragOverStage]   = useState<string | null>(null)
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [hoveredCardId, setHoveredCardId]   = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const agent   = AGENT_LEVELS[agentLevel]
  const mission = MISSIONS_DATA.find(m => m.id === activeMissionId)!
  const sections = getSections(agentLevel)
  const baseMessages = mission.chat[agentLevel] ?? []
  const extra = extraMessages[`${activeMissionId}-${agentLevel}`] ?? []
  const messages = [...baseMessages, ...extra]

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages.length])

  const switchAgent = (level: number) => {
    setAgentLevel(level)
    setActiveSection(getSections(level)[0])
  }

  const switchMission = (id: string) => {
    setActiveMissionId(id)
    setActiveSection("results")
    setChatInput("")
    setSelectedCandidateId(null)
  }

  const sendMessage = () => {
    if (!chatInput.trim()) return
    const text = chatInput.trim()
    setChatInput("")
    const key = `${activeMissionId}-${agentLevel}`
    const userMsg: ChatMsg = { id: `u${Date.now()}`, role: "user", text }
    setExtraMessages(prev => ({ ...prev, [key]: [...(prev[key] ?? []), userMsg] }))
    setTimeout(() => {
      const reply: ChatMsg = { id: `a${Date.now()}`, role: "agent", text: "Je prends en compte votre demande et mets à jour l'analyse." }
      setExtraMessages(prev => ({ ...prev, [key]: [...(prev[key] ?? []), reply] }))
    }, 700)
  }

  const getCandidateStage = (candidateId: string) =>
    pipelineStages[activeMissionId]?.[candidateId] ?? null

  const dropOnStage = (stage: string) => {
    if (!draggingId) return
    setPipelineStages(prev => ({
      ...prev,
      [activeMissionId]: { ...(prev[activeMissionId] ?? {}), [draggingId]: stage },
    }))
    setDraggingId(null)
    setDragOverStage(null)
    setActiveSection("pipeline")
  }

  const missionStatus = STATUS_MISSION[mission.status]
  const progression = Math.round((mission.stats.shortlist / mission.stats.analysed) * 100 + 30)

  return (
    <div style={{ minHeight: "100vh", background: "#F8F7FF", fontFamily: "var(--font-inter), sans-serif", display: "flex", flexDirection: "column" }}>

      {/* ── Header ── */}
      <header style={{
        height: 52, flexShrink: 0, background: "white", borderBottom: "1px solid #F0ECF8",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", position: "sticky", top: 0, zIndex: 40,
      }}>
        <nav style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#9CA3AF" }}>
          <Link href="/workspace-preview" style={{ color: "#9CA3AF", textDecoration: "none", fontWeight: 500 }}>Workspace</Link>
          <span style={{ fontSize: 11 }}>/</span>
          <span style={{ color: "#374151", fontWeight: 600 }}>{mission.name}</span>
        </nav>
        <div style={{ display: "flex", gap: 5 }}>
          {[1, 2, 3].map(lvl => {
            const a = AGENT_LEVELS[lvl]
            const active = agentLevel === lvl
            return (
              <button key={lvl} onClick={() => switchAgent(lvl)} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 999, cursor: "pointer",
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

      {/* ── 3-col layout ── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "210px 320px 1fr", height: "calc(100vh - 52px)", overflow: "hidden" }}>

        {/* ── Col 1 : Missions sidebar ── */}
        <aside style={{ borderRight: "1px solid #F0ECF8", background: "white", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "14px 14px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9CA3AF" }}>
              MISSIONS {MISSIONS_DATA.length}
            </span>
            <button style={{
              width: 24, height: 24, borderRadius: 7, border: "none",
              background: agent.color, color: "white",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1,
            }}>+</button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px 12px" }}>
            {MISSIONS_DATA.map(m => {
              const st = STATUS_MISSION[m.status]
              const isActive = m.id === activeMissionId
              return (
                <div
                  key={m.id}
                  onClick={() => switchMission(m.id)}
                  style={{
                    padding: "10px 10px 10px 12px",
                    borderRadius: 10, marginBottom: 4, cursor: "pointer",
                    borderLeft: isActive ? `3px solid ${agent.color}` : "3px solid transparent",
                    background: isActive ? agent.colorLight : "transparent",
                    transition: "all 150ms",
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "#F8F6FF" }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent" }}
                >
                  <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? "#111827" : "#374151", lineHeight: 1.3 }}>
                    {m.name}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: "#6B7280" }}>{st.label} · {m.profiles} profils</span>
                  </div>
                </div>
              )
            })}

            <button style={{
              width: "100%", padding: "8px 12px", borderRadius: 10,
              border: `1.5px dashed ${agent.color}55`, background: "transparent",
              color: agent.color, fontSize: 11, fontWeight: 600, cursor: "pointer",
              textAlign: "left", marginTop: 4,
            }}>
              + Nouvelle mission
            </button>
          </div>
        </aside>

        {/* ── Col 2 : Chat ── */}
        <aside style={{ borderRight: "1px solid #F0ECF8", background: "white", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
          {/* Agent header */}
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #F0ECF8", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
              background: agent.colorMid, border: `1.5px solid ${agent.borderColor}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 800, color: agent.color,
            }}>{agent.agent[0]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#111827", textTransform: "uppercase", letterSpacing: "0.04em" }}>{agent.agent}</span>
                <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: agent.color, color: "white", letterSpacing: "0.06em" }}>IA</span>
              </div>
              <p style={{ margin: 0, fontSize: 10, color: "#9CA3AF" }}>{agent.role}</p>
            </div>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 0 2px rgba(34,197,94,0.2)", flexShrink: 0 }} />
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map(msg => (
              <div key={msg.id} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                {msg.role === "agent" && (
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%", flexShrink: 0, marginRight: 8, marginTop: 2,
                    background: agent.colorMid, border: `1px solid ${agent.borderColor}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 800, color: agent.color,
                  }}>{agent.agent[0]}</div>
                )}
                <div style={{ maxWidth: "82%", display: "flex", flexDirection: "column", gap: 6 }}>
                  {msg.role === "agent" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em" }}>{agent.agent}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 999, background: agent.color, color: "white" }}>IA</span>
                    </div>
                  )}
                  <div style={{
                    padding: "10px 13px", fontSize: 12, lineHeight: 1.65,
                    borderRadius: msg.role === "user" ? "14px 4px 14px 14px" : "4px 14px 14px 14px",
                    background: msg.role === "user" ? agent.color : "white",
                    color: msg.role === "user" ? "white" : "#111827",
                    border: msg.role === "user" ? "none" : "1px solid #F0ECF8",
                    boxShadow: msg.role === "agent" ? "0 1px 4px rgba(0,0,0,0.05)" : "none",
                  }}>{msg.text}</div>

                  {msg.statsCard && (
                    <div style={{ background: "white", borderRadius: 12, border: "1px solid #F0ECF8", padding: "12px 14px", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
                      <div style={{ display: "flex", gap: 16, marginBottom: 10, justifyContent: "center" }}>
                        {[
                          { n: mission.stats.shortlist, label: "Shortlist", color: "#22c55e" },
                          { n: mission.stats.toQualify, label: "À qualifier", color: "#F59E0B" },
                          { n: mission.stats.rejected,  label: "Rejeté",     color: "#EF4444" },
                        ].map(s => (
                          <div key={s.label} style={{ textAlign: "center" }}>
                            <div style={{
                              width: 40, height: 40, borderRadius: "50%", margin: "0 auto 4px",
                              border: `2px solid ${s.color}30`, background: `${s.color}0a`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 16, fontWeight: 800, color: s.color,
                              fontFamily: "var(--font-space-grotesk), sans-serif",
                            }}>{s.n}</div>
                            <p style={{ margin: 0, fontSize: 10, color: "#6B7280" }}>{s.label}</p>
                          </div>
                        ))}
                      </div>
                      {msg.topProfile && (
                        <p style={{ margin: 0, fontSize: 11, color: "#6B7280", borderTop: "1px solid #F0ECF8", paddingTop: 8 }}>
                          Top profil : <strong style={{ color: "#111827" }}>{msg.topProfile.split(" — ")[0]}</strong>{" "}— {msg.topProfile.split(" — ")[1]}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Quick chips */}
          <div style={{ padding: "8px 14px 0", flexShrink: 0, display: "flex", flexWrap: "wrap", gap: 5 }}>
            {QUICK_CHIPS.map(chip => (
              <button key={chip.label} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: 11, fontWeight: 500, padding: "5px 10px", borderRadius: 999,
                border: "1px solid #E5E7EB", background: "white", color: "#374151",
                cursor: "pointer", transition: "all 120ms",
              }}
                onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = agent.color; el.style.color = agent.color }}
                onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = "#E5E7EB"; el.style.color = "#374151" }}
              >
                <span style={{ fontSize: 10 }}>{chip.icon}</span> {chip.label}
              </button>
            ))}
          </div>

          {/* Input */}
          <div style={{ padding: "10px 12px 14px", flexShrink: 0 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              border: "1.5px solid #E5E7EB", borderRadius: 12,
              padding: "8px 8px 8px 14px", background: "#FAFAFA", transition: "border-color 150ms",
            }}
              onFocusCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = agent.color }}
              onBlurCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = "#E5E7EB" }}
            >
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendMessage()}
                placeholder={`Demandez à ${agent.agent}…`}
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 12, color: "#111827", fontFamily: "var(--font-inter), sans-serif" }}
              />
              <button onClick={sendMessage} disabled={!chatInput.trim()} style={{
                width: 32, height: 32, borderRadius: 9, border: "none", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: chatInput.trim() ? agent.color : "#E5E7EB",
                cursor: chatInput.trim() ? "pointer" : "default", transition: "background 150ms",
              }}>
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                  <path d="M3 10l14-7-4 7 4 7-14-7z" fill="white" />
                </svg>
              </button>
            </div>
          </div>
        </aside>

        {/* ── Col 3 : Content ── */}
        <main style={{ overflowY: "auto", display: "flex", flexDirection: "column", position: "relative" }}>
          {/* Mission header */}
          <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid #F0ECF8", background: "white", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
              <div>
                <h1 style={{ margin: "0 0 3px", fontSize: 18, fontWeight: 800, color: "#111827", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
                  {mission.name}
                </h1>
                <p style={{ margin: 0, fontSize: 12, color: "#9CA3AF" }}>
                  Agent {agent.agent} · 5 avr. 2026 · <strong style={{ color: "#374151" }}>{mission.stats.analysed} profils analysés</strong>
                </p>
              </div>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 999,
                color: missionStatus.color, background: `${missionStatus.color}12`, border: `1px solid ${missionStatus.color}30`,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: missionStatus.color }} />
                {missionStatus.label}
              </span>
            </div>

            {/* Stats bar */}
            <div style={{
              marginTop: 12, display: "flex", alignItems: "center",
              background: "#F8F7FF", borderRadius: 10, border: "1px solid #F0ECF8", overflow: "hidden",
            }}>
              {[
                { n: mission.stats.analysed,  label: "analysés",   color: "#7C63C8" },
                { n: mission.stats.shortlist, label: "shortlist",  color: "#22c55e" },
                { n: mission.stats.toQualify, label: "à qualifier", color: "#F59E0B" },
                { n: mission.stats.rejected,  label: "rejetés",    color: "#EF4444" },
              ].map((s, i) => (
                <div key={s.label} style={{
                  flex: 1, padding: "8px 12px", textAlign: "center",
                  borderRight: i < 3 ? "1px solid #F0ECF8" : "none",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: s.color, fontFamily: "var(--font-space-grotesk), sans-serif" }}>{s.n}</span>
                  <span style={{ fontSize: 11, color: "#6B7280" }}>{s.label}</span>
                </div>
              ))}
              <div style={{ flex: 1.4, padding: "8px 14px", borderLeft: "1px solid #F0ECF8" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#9CA3AF", letterSpacing: "0.04em" }}>Progression tri</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: agent.color }}>{progression}%</span>
                </div>
                <div style={{ height: 5, borderRadius: 999, background: "#E5E7EB", overflow: "hidden" }}>
                  <div style={{ width: `${progression}%`, height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${agent.color}, #A78BFA)`, transition: "width 600ms ease" }} />
                </div>
              </div>
            </div>
          </div>

          {/* Stepper nav */}
          <div style={{
            padding: "10px 24px", borderBottom: "1px solid #F0ECF8", background: "white",
            display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {sections.map((key, i) => {
                const labels: Record<string, string> = { results: "Résultats", pipeline: "Pipeline" }
                const counts: Record<string, number> = {
                  results:  mission.candidates.filter(c => c.status !== "rejected").length,
                  pipeline: mission.candidates.filter(c => c.status === "shortlisted").length,
                }
                const active = activeSection === key
                const stepNum = i + 1
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {i > 0 && (
                      <svg width="20" height="10" viewBox="0 0 20 10" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M0 5h16M12 1l4 4-4 4" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    <button onClick={() => setActiveSection(key)} style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      padding: "6px 12px 6px 6px", borderRadius: 999, cursor: "pointer",
                      background: active ? agent.colorLight : "transparent",
                      border: active ? `1.5px solid ${agent.borderColor}` : "1.5px solid #E5E7EB",
                      transition: "all 150ms",
                    }}>
                      {/* Step number circle */}
                      <div style={{
                        width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 800,
                        background: active ? agent.color : "white",
                        color: active ? "white" : "#9CA3AF",
                        border: active ? "none" : "1.5px solid #E5E7EB",
                      }}>{stepNum}</div>
                      {/* Label */}
                      <span style={{
                        fontSize: 13, fontWeight: active ? 700 : 500,
                        color: active ? agent.color : "#6B7280",
                      }}>{labels[key]}</span>
                      {/* Count badge */}
                      <span style={{
                        fontSize: 10, fontWeight: 800, padding: "1px 7px", borderRadius: 999,
                        background: active ? agent.color : "#F0ECF8",
                        color: active ? "white" : "#6B7280",
                      }}>{counts[key]}</span>
                    </button>
                  </div>
                )
              })}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {["Filtres", "Trier"].map(label => (
                <button key={label} style={{
                  display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px",
                  borderRadius: 8, border: "1px solid #E5E7EB", background: "white",
                  fontSize: 12, color: "#6B7280", cursor: "pointer",
                }}>
                  {label === "Filtres" ? "⊟" : "⇅"} {label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div style={{ padding: "0 24px 40px", flex: 1 }}>
            {activeSection === "results" && (
              <div style={{ marginTop: 16, width: "100%" }}>
                {/* Column header */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "40px 1fr 110px 56px 90px 72px",
                  padding: "0 20px", marginBottom: 8, width: "100%",
                }}>
                  {["", "Candidat", "Entreprise", "Score", "Statut", ""].map((h, i) => (
                    <div key={i} style={{
                      fontSize: 10, fontWeight: 500, letterSpacing: "0.10em",
                      textTransform: "uppercase", color: "#9CA3AF",
                      fontFamily: "var(--font-space-grotesk), sans-serif",
                    }}>{h}</div>
                  ))}
                </div>

                {/* Cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
                  {mission.candidates.map(c => {
                    const st  = STATUS_CANDIDATE[c.status]
                    const sc  = scoreColor(c.score)
                    const inP = getCandidateStage(c.id)
                    const isDragging = draggingId === c.id
                    const isSelected = selectedCandidateId === c.id
                    const isHovered  = hoveredCardId === c.id

                    // SVG score ring
                    const r = 15, cx = 20, cy = 20
                    const circ = 2 * Math.PI * r
                    const dash = (c.score / 100) * circ

                    // Left border color
                    const accentColor = isSelected
                      ? agent.color
                      : c.status === "shortlisted" ? "#22c55e"
                      : c.status === "rejected"    ? "#EF4444"
                      : isHovered ? agent.color : "transparent"

                    return (
                      <div
                        key={c.id}
                        draggable
                        onDragStart={() => setDraggingId(c.id)}
                        onDragEnd={() => { setDraggingId(null); setDragOverStage(null) }}
                        onClick={() => setSelectedCandidateId(prev => prev === c.id ? null : c.id)}
                        onMouseEnter={() => setHoveredCardId(c.id)}
                        onMouseLeave={() => setHoveredCardId(null)}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "40px 1fr 110px 56px 90px 72px",
                          width: "100%",
                          alignItems: "center",
                          background: isSelected ? agent.colorLight : isHovered ? "#FDFCFF" : "white",
                          borderTop: `1px solid ${isHovered || isSelected ? `${agent.color}4D` : "#F0ECF8"}`,
                          borderRight: `1px solid ${isHovered || isSelected ? `${agent.color}4D` : "#F0ECF8"}`,
                          borderBottom: `1px solid ${isHovered || isSelected ? `${agent.color}4D` : "#F0ECF8"}`,
                          borderLeft: `3px solid ${accentColor}`,
                          borderRadius: 12,
                          padding: "0 20px",
                          minHeight: 72,
                          cursor: "pointer",
                          opacity: isDragging ? 0.5 : 1,
                          boxShadow: isHovered ? `0 4px 16px ${agent.color}1A, 0 1px 3px ${agent.color}0F` : "0 1px 2px rgba(124,99,200,0.04)",
                          transform: isHovered ? "translateY(-1px)" : "none",
                          transition: "border-color 150ms, box-shadow 150ms, transform 150ms, background 120ms",
                        }}
                      >
                        {/* Avatar */}
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                            background: isHovered ? agent.colorLight : agent.colorMid,
                            border: `1.5px solid ${isHovered ? agent.color + "66" : agent.borderColor}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, fontWeight: 700,
                            color: agent.color,
                            fontFamily: "var(--font-space-grotesk), sans-serif",
                            transition: "all 200ms",
                          }}>{c.initials}</div>
                        </div>

                        {/* Identity */}
                        <div style={{ padding: "14px 12px 14px 0", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                          <span style={{
                            fontFamily: "var(--font-space-grotesk), sans-serif",
                            fontWeight: 600, fontSize: 13.5, color: "#111827",
                            letterSpacing: "-0.02em", whiteSpace: "nowrap",
                            overflow: "hidden", textOverflow: "ellipsis",
                          }}>{c.name}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
                            <span style={{ fontSize: 11.5, color: "#9CA3AF", whiteSpace: "nowrap", flexShrink: 0 }}>{c.title}</span>
                            {(c.skills ?? []).slice(0, 2).map(skill => (
                              <span key={skill} style={{
                                padding: "1px 7px", borderRadius: 20,
                                background: isHovered ? agent.colorLight : "#F8F7FF",
                                border: `1px solid ${isHovered ? agent.color + "40" : "#E9E4F8"}`,
                                fontSize: 10.5, color: isHovered ? agent.color : "#9CA3AF",
                                fontFamily: "var(--font-space-grotesk), sans-serif",
                                whiteSpace: "nowrap", flexShrink: 0,
                                transition: "all 150ms",
                              }}>{skill}</span>
                            ))}
                            {inP && (
                              <span style={{
                                fontSize: 10, fontWeight: 600, padding: "1px 7px",
                                borderRadius: 999, background: agent.colorLight,
                                color: agent.color, border: `1px solid ${agent.borderColor}`,
                                whiteSpace: "nowrap", flexShrink: 0,
                              }}>{inP}</span>
                            )}
                          </div>
                        </div>

                        {/* Company */}
                        <div style={{ paddingRight: 12, display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                          <div style={{
                            width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                            background: "#F8F7FF", border: "1px solid #E9E4F8",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 8, fontWeight: 800, color: "#7C63C8",
                            fontFamily: "var(--font-space-grotesk), sans-serif",
                          }}>{c.ci}</div>
                          <span style={{ fontSize: 12.5, color: "#374151", fontFamily: "var(--font-space-grotesk), sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.company}</span>
                        </div>

                        {/* Score ring */}
                        <div style={{ display: "flex", alignItems: "center", paddingRight: 12 }}>
                          <svg width="40" height="40" viewBox="0 0 40 40" style={{ overflow: "visible" }}>
                            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F0ECF8" strokeWidth="3" />
                            <circle
                              cx={cx} cy={cy} r={r} fill="none" stroke={sc} strokeWidth="3"
                              strokeDasharray={`${dash.toFixed(1)} ${circ.toFixed(1)}`}
                              strokeLinecap="round"
                              transform={`rotate(-90 ${cx} ${cy})`}
                            />
                            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
                              fontFamily="var(--font-space-grotesk), sans-serif"
                              fontWeight="700" fontSize="10" fill={sc}>{c.score}</text>
                          </svg>
                        </div>

                        {/* Status badge */}
                        <div style={{ paddingRight: 12 }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            padding: "4px 11px", borderRadius: 20,
                            fontSize: 11, fontWeight: 500, letterSpacing: "0.03em",
                            fontFamily: "var(--font-space-grotesk), sans-serif",
                            color: st.color, background: st.bg, border: `1px solid ${st.border}`,
                            whiteSpace: "nowrap",
                          }}>
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: st.color, flexShrink: 0 }} />
                            {st.label}
                          </span>
                        </div>

                        {/* Hover actions */}
                        <div style={{ display: "flex", alignItems: "center", gap: 4, opacity: isHovered ? 1 : 0, transition: "opacity 150ms" }}>
                          <button
                            onClick={e => { e.stopPropagation() }}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "center",
                              width: 28, height: 28, borderRadius: 6,
                              border: "1px solid #E5E7EB", background: "white",
                              cursor: "pointer", color: "#6B7280", transition: "all 120ms",
                            }}
                            onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = "#22c55e"; el.style.color = "#22c55e"; el.style.background = "#f0fdf4" }}
                            onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = "#E5E7EB"; el.style.color = "#6B7280"; el.style.background = "white" }}
                            title="Shortlister"
                          >
                            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4">
                              <path d="M1.5 5.5l2.5 2.5 5.5-5.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                          <button
                            onClick={e => { e.stopPropagation() }}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "center",
                              width: 28, height: 28, borderRadius: 6,
                              border: "1px solid #E5E7EB", background: "white",
                              cursor: "pointer", color: "#6B7280", transition: "all 120ms",
                            }}
                            onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = "#EF4444"; el.style.color = "#EF4444"; el.style.background = "#fef2f2" }}
                            onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = "#E5E7EB"; el.style.color = "#6B7280"; el.style.background = "white" }}
                            title="Rejeter"
                          >
                            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4">
                              <path d="M1 1l9 9M10 1L1 10" strokeLinecap="round"/>
                            </svg>
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setSelectedCandidateId(c.id) }}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
                              padding: "5px 8px", height: 28, borderRadius: 6,
                              border: "1px solid #E5E7EB", background: "white",
                              cursor: "pointer", color: "#6B7280", fontSize: 11,
                              fontFamily: "var(--font-space-grotesk), sans-serif",
                              transition: "all 120ms",
                            }}
                            onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = agent.color + "66"; el.style.color = agent.color; el.style.background = agent.colorLight }}
                            onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = "#E5E7EB"; el.style.color = "#6B7280"; el.style.background = "white" }}
                            title="Voir"
                          >
                            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.3">
                              <circle cx="5.5" cy="5.5" r="3"/>
                              <path d="M1 5.5C2.5 2.5 8.5 2.5 10 5.5C8.5 8.5 2.5 8.5 1 5.5Z" strokeLinecap="round"/>
                            </svg>
                            Voir
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {activeSection === "pipeline" && (
              <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(5, minmax(150px, 1fr))", gap: 10, overflowX: "auto" }}>
                {PIPELINE_STAGES.map(stage => {
                  const assignedIds = pipelineStages[activeMissionId] ?? {}
                  const group = mission.candidates.filter(c => assignedIds[c.id] === stage)
                  const isOver = dragOverStage === stage
                  return (
                    <div
                      key={stage}
                      onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage) }}
                      onDragLeave={() => setDragOverStage(null)}
                      onDrop={() => dropOnStage(stage)}
                      style={{
                        borderRadius: 12,
                        border: isOver ? `2px solid ${agent.color}` : "1px solid #F0ECF8",
                        overflow: "hidden",
                        background: isOver ? agent.colorLight : "white",
                        transition: "border-color 150ms ease, background 150ms ease",
                        minHeight: 120,
                      }}
                    >
                      <div style={{ padding: "8px 12px", background: isOver ? agent.colorMid : agent.colorLight, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>{stage}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: agent.color, background: "white", padding: "1px 7px", borderRadius: 999 }}>{group.length}</span>
                      </div>
                      <div style={{ padding: "8px", minHeight: 60 }}>
                        {group.length === 0
                          ? (
                            <p style={{ margin: 0, padding: "6px", fontSize: 12, color: isOver ? agent.color : "#C4B5F4", textAlign: "center", fontStyle: "italic" }}>
                              {isOver ? "Déposer ici" : "Vide"}
                            </p>
                          )
                          : group.map(c => (
                            <div key={c.id} style={{ padding: "8px 10px", borderRadius: 8, marginBottom: 4, background: "#FAFAFA", border: "1px solid #F0ECF8" }}>
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
          </div>
        </main>

        {/* ── Candidate detail panel ── */}
        {(() => {
          const sel = selectedCandidateId
            ? mission.candidates.find(c => c.id === selectedCandidateId)
            : null
          const sc = sel ? scoreColor(sel.score) : "#22c55e"
          const scoreLabel = sel
            ? sel.score >= 85 ? "Excellent match" : sel.score >= 72 ? "Bon match" : "Match partiel"
            : ""
          return (
            <div style={{
              position: "absolute", top: 0, right: 0, bottom: 0,
              width: sel ? 340 : 0,
              overflow: "hidden",
              transition: "width 260ms cubic-bezier(0.4,0,0.2,1)",
              zIndex: 20,
              display: "flex",
              flexDirection: "column",
              background: "white",
              borderLeft: "1px solid #F0ECF8",
              boxShadow: sel ? "-4px 0 24px rgba(124,99,200,0.08)" : "none",
            }}>
              {sel && (
                <div style={{ width: 340, display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }}>
                  {/* Panel header */}
                  <div style={{ padding: "16px 18px 14px", borderBottom: "1px solid #F0ECF8", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                        background: `linear-gradient(135deg, ${agent.colorMid}, ${agent.colorLight})`,
                        border: `2px solid ${agent.borderColor}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, fontWeight: 800, color: agent.color,
                      }}>{sel.initials}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 700, color: "#111827" }}>{sel.name}</p>
                        <p style={{ margin: 0, fontSize: 11, color: "#6B7280" }}>{sel.title} · {sel.company}</p>
                      </div>
                      <button
                        onClick={() => setSelectedCandidateId(null)}
                        style={{
                          width: 26, height: 26, borderRadius: "50%", border: "1px solid #E5E7EB",
                          background: "white", cursor: "pointer", flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 14, color: "#9CA3AF", fontWeight: 400,
                        }}>✕</button>
                    </div>
                  </div>

                  {/* Score */}
                  <div style={{ padding: "14px 18px", borderBottom: "1px solid #F0ECF8", flexShrink: 0 }}>
                    <div style={{
                      background: `${sc}0d`, border: `1px solid ${sc}25`,
                      borderRadius: 12, padding: "12px 16px",
                      display: "flex", alignItems: "center", gap: 14,
                    }}>
                      <span style={{ fontSize: 36, fontWeight: 900, color: sc, fontFamily: "var(--font-space-grotesk), sans-serif", lineHeight: 1 }}>{sel.score}</span>
                      <div>
                        <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: sc }}>{scoreLabel}</p>
                        <p style={{ margin: 0, fontSize: 11, color: "#9CA3AF" }}>Score IA / 100</p>
                      </div>
                    </div>
                  </div>

                  {/* AI Analysis */}
                  {sel.aiAnalysis && (
                    <div style={{ padding: "14px 18px", borderBottom: "1px solid #F0ECF8", flexShrink: 0 }}>
                      <p style={{ margin: "0 0 8px", fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.08em", textTransform: "uppercase" }}>Analyse IA</p>
                      <div style={{
                        background: agent.colorLight, border: `1px solid ${agent.borderColor}`,
                        borderRadius: 10, padding: "10px 12px",
                        fontSize: 12, lineHeight: 1.65, color: "#374151",
                      }}>
                        {sel.aiAnalysis.split(" ").map((w, i) =>
                          ["idéal", "Excellent", "senior", "Profil"].includes(w)
                            ? <strong key={i} style={{ color: agent.color }}>{w} </strong>
                            : <span key={i}>{w} </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Infos */}
                  <div style={{ padding: "14px 18px", borderBottom: "1px solid #F0ECF8", flexShrink: 0 }}>
                    <p style={{ margin: "0 0 10px", fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.08em", textTransform: "uppercase" }}>Informations</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {[
                        { label: "Localisation",  value: sel.location },
                        { label: "Type",          value: sel.contract },
                        { label: "Salaire visé",  value: sel.salary },
                        { label: "Expérience",    value: sel.experience },
                        { label: "Disponibilité", value: sel.availability },
                      ].filter(r => r.value).map(row => (
                        <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 12, color: "#6B7280" }}>{row.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Skills */}
                  {sel.skills && sel.skills.length > 0 && (
                    <div style={{ padding: "14px 18px", flexShrink: 0 }}>
                      <p style={{ margin: "0 0 10px", fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.08em", textTransform: "uppercase" }}>Compétences</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {sel.skills.map(skill => (
                          <span key={skill} style={{
                            fontSize: 11, fontWeight: 500, padding: "4px 10px", borderRadius: 999,
                            background: agent.colorLight, border: `1px solid ${agent.borderColor}`,
                            color: agent.color,
                          }}>{skill}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ marginTop: "auto", padding: "14px 18px 20px", borderTop: "1px solid #F0ECF8", display: "flex", gap: 8, flexShrink: 0 }}>
                    <button style={{
                      flex: 1, padding: "10px", borderRadius: 10, border: "none",
                      background: agent.color, color: "white", fontSize: 12, fontWeight: 700,
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    }}>✓ Shortlisté</button>
                    <button style={{
                      flex: 1, padding: "10px", borderRadius: 10,
                      border: "1.5px solid #E5E7EB", background: "white", color: "#374151",
                      fontSize: 12, fontWeight: 600, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    }}>✕ Rejeter</button>
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
