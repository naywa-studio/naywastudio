"use client"

import { useState, useRef, useEffect } from "react"
import { m, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useMockStore, AGENT_LEVELS } from "@/lib/mock-store"
import type { WorkspaceSection, MissionStatus } from "@/lib/mock-store"

/* ─── Animations ─────────────────────────────────────────────── */

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]
const fu = (delay: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: EASE },
})

/* ─── Status ─────────────────────────────────────────────────── */

const STATUS_LABELS: Record<MissionStatus, { label: string; color: string; bg: string }> = {
  preparation: { label: "Préparation", color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
  "en-cours": { label: "En cours", color: "#22c55e", bg: "rgba(34,197,94,0.08)" },
  terminee: { label: "Terminée", color: "#6B7280", bg: "rgba(107,114,128,0.08)" },
}

/* ─── Chat questions per agent ────────────────────────────────── */

const AGENT_QUESTIONS: Record<number, string[]> = {
  1: [
    "Bonjour ! Je suis Léo. Décrivez-moi le profil que vous recherchez et je nettoierai votre liste.",
    "Parfait. Quel est le format de votre fichier source ? (CSV, Excel, export Walaxy...)",
    "Merci. Je vais analyser et trier votre liste. Les résultats arrivent en quelques minutes.",
  ],
  2: [
    "Bonjour ! Je suis Nora, votre agent de sourcing. Décrivez-moi le poste que vous cherchez à pourvoir.",
    "Quel niveau d'expérience attendez-vous ? Et dans quel périmètre géographique ?",
    "Dernière question : y a-t-il des compétences techniques ou soft skills indispensables ?",
    "Parfait, j'ai tout ce qu'il me faut. Je lance le sourcing et vous présenterai une shortlist priorisée.",
  ],
  3: [
    "Bonjour ! Je suis Alex, votre orchestrateur de recrutement. Décrivez-moi le poste et son contexte.",
    "Quel est le budget salarial prévu et le type de contrat ? (CDI, freelance, etc.)",
    "Y a-t-il des contraintes de délai ? Une date limite pour le recrutement ?",
    "Des compétences techniques ou qualités humaines incontournables ?",
    "Parfait. Je prends en charge l'intégralité du processus. Vous recevrez les premiers profils sous 48h.",
  ],
}

/* ─── Section renderers ───────────────────────────────────────── */

function SectionBesoin({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, v]) => v)
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-[10px] border border-[#F0ECF8] bg-[var(--surface)] px-4 py-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {key.replace(/_/g, " ")}
          </p>
          <p className="text-sm font-medium text-[var(--text-primary)]">{String(value)}</p>
        </div>
      ))}
    </div>
  )
}

function SectionProfils({ data }: { data: Record<string, unknown> }) {
  const rows = (data.rows ?? []) as Array<Record<string, string | number>>
  const count = data.count as number
  return (
    <div>
      <p className="mb-3 text-[13px] text-[var(--text-muted)]">{count} profils identifiés</p>
      <div className="-mx-2 overflow-x-auto px-2">
        <table className="w-full min-w-[500px] border-collapse text-[13px]">
          <thead>
            <tr>
              {["Nom", "Poste", "Score", "Source", "Statut"].map((h) => (
                <th
                  key={h}
                  className="border-b-2 border-[#F0ECF8] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-[var(--surface)]">
                <td className="px-3 py-2.5 font-medium text-[var(--text-primary)]">{row.nom}</td>
                <td className="px-3 py-2.5 text-[var(--text-secondary)]">{row.poste}</td>
                <td className="px-3 py-2.5">
                  <span
                    className="rounded-md px-2 py-0.5 text-xs font-semibold"
                    style={{
                      color: Number(row.score) >= 85 ? "#22c55e" : "#F59E0B",
                      background: Number(row.score) >= 85 ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)",
                    }}
                  >
                    {row.score}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-[var(--text-muted)]">{row.source}</td>
                <td className="px-3 py-2.5 text-[var(--text-muted)]">{row.statut}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SectionShortlist({ data }: { data: Record<string, unknown> }) {
  const candidates = (data.candidates ?? []) as Array<{
    nom: string; score: number; points: string[]; recommendation: string
  }>
  return (
    <div className="flex flex-col gap-3">
      {candidates.map((c) => (
        <div
          key={c.nom}
          className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-[#F0ECF8] bg-[var(--surface)] p-4 sm:p-5"
        >
          <div className="min-w-[200px] flex-1">
            <div className="mb-2 flex items-center gap-2.5">
              <span className="text-[15px] font-semibold text-[var(--text-primary)]">{c.nom}</span>
              <span
                className="rounded-md px-2.5 py-0.5 text-xs font-bold"
                style={{
                  color: c.score >= 90 ? "#22c55e" : "#3b82f6",
                  background: c.score >= 90 ? "rgba(34,197,94,0.08)" : "rgba(59,130,246,0.08)",
                }}
              >
                {c.score}/100
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {c.points.map((p) => (
                <span key={p} className="text-[13px] text-[var(--text-secondary)]">✓ {p}</span>
              ))}
            </div>
          </div>
          <span className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--accent-blue)]/18 bg-[var(--accent-blue)]/8 px-3.5 py-1.5 text-xs font-semibold text-[var(--accent-blue)]">
            {c.recommendation}
          </span>
        </div>
      ))}
    </div>
  )
}

function SectionContacts({ data }: { data: Record<string, unknown> }) {
  const contacted = (data.contacted ?? []) as Array<Record<string, string | boolean>>
  return (
    <div className="flex flex-col gap-2">
      {contacted.map((c, i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[#F0ECF8] bg-[var(--surface)] px-4 py-3 sm:gap-4"
        >
          <span className="min-w-[140px] text-sm font-semibold text-[var(--text-primary)]">{String(c.nom)}</span>
          <span className="text-xs text-[var(--text-muted)]">{String(c.date)}</span>
          <span className="text-xs text-[var(--text-muted)]">{String(c.canal)}</span>
          <span
            className="ml-auto text-xs font-semibold"
            style={{ color: String(c.reponse) === "En attente" ? "#F59E0B" : "#22c55e" }}
          >
            {String(c.reponse)}
          </span>
          {c.relance && (
            <span className="text-[11px] font-medium text-red-500">Relance prévue</span>
          )}
        </div>
      ))}
    </div>
  )
}

function SectionCalendrier({ data }: { data: Record<string, unknown> }) {
  const interviews = (data.interviews ?? []) as Array<Record<string, string>>
  return (
    <div className="flex flex-col gap-2.5">
      {interviews.map((iv, i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-4 rounded-xl border border-[#F0ECF8] bg-[var(--surface)] px-4 py-3.5 sm:px-5"
        >
          <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-white">
            <span className="text-[10px] font-bold leading-none text-[var(--accent-blue)]">
              {iv.date.slice(8)}
            </span>
            <span className="text-[8px] text-[var(--text-muted)]">AVR</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{iv.candidat}</p>
            <p className="text-xs text-[var(--text-muted)]">{iv.heure} · {iv.type}</p>
          </div>
          <span
            className="rounded-md px-3 py-1 text-xs font-semibold"
            style={{
              color: iv.statut === "Confirmé" ? "#22c55e" : "#F59E0B",
              background: iv.statut === "Confirmé" ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)",
            }}
          >
            {iv.statut}
          </span>
        </div>
      ))}
    </div>
  )
}

function SectionDossiers({ data }: { data: Record<string, unknown> }) {
  const dossiers = (data.dossiers ?? []) as Array<{
    candidat: string; synthese: string; points_forts: string[]; points_vigilance: string[]
  }>
  return (
    <div className="flex flex-col gap-4">
      {dossiers.map((d) => (
        <div key={d.candidat} className="rounded-[14px] border border-[#F0ECF8] bg-[var(--surface)] p-5">
          <p className="mb-2.5 text-base font-bold text-[var(--text-primary)]">{d.candidat}</p>
          <p className="mb-3.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">{d.synthese}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-green-500">
                Points forts
              </p>
              {d.points_forts.map((p) => (
                <p key={p} className="text-[13px] text-[var(--text-secondary)]">✓ {p}</p>
              ))}
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-500">
                Points de vigilance
              </p>
              {d.points_vigilance.map((p) => (
                <p key={p} className="text-[13px] text-[var(--text-secondary)]">⚠ {p}</p>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function SectionPresentation({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] to-[var(--accent-blue-light)] p-6">
      <p className="text-lg font-bold text-[var(--text-primary)]">{String(data.titre)}</p>
      <p className="mb-4 mt-1 text-[13px] text-[var(--text-muted)]">Générée le {String(data.date)}</p>
      <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase text-[var(--text-muted)]">Candidats retenus</p>
        <p className="text-[28px] font-extrabold text-[var(--accent-blue)]">{String(data.candidats_retenus)}</p>
      </div>
      <div className="rounded-[10px] border border-[var(--border)] bg-white px-4 py-3.5">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-blue)]">
          Recommandation
        </p>
        <p className="text-sm font-medium text-[var(--text-primary)]">{String(data.recommandation)}</p>
      </div>
    </div>
  )
}

function SectionHistorique({ data }: { data: Record<string, unknown> }) {
  const events = (data.events ?? []) as Array<{ date: string; action: string; agent: string }>
  return (
    <div className="relative pl-6">
      <div className="absolute bottom-2 left-[7px] top-2 w-0.5 bg-gradient-to-b from-[var(--border)] to-transparent" />
      {events.map((ev, i) => (
        <div key={i} className="relative mb-4 flex gap-3.5">
          <div
            className="absolute -left-5 mt-[5px] h-2 w-2 shrink-0 rounded-full"
            style={{
              background: i === 0 ? "#7C63C8" : "#E2DAF6",
              border: i === 0 ? "2px solid rgba(124,99,200,0.3)" : "none",
            }}
          />
          <div>
            <p className="text-[13px] font-medium text-[var(--text-primary)]">{ev.action}</p>
            <p className="text-[11px] text-[var(--text-muted)]">{ev.date} · {ev.agent}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function renderSection(section: WorkspaceSection) {
  switch (section.type) {
    case "besoin": return <SectionBesoin data={section.data} />
    case "profils": return <SectionProfils data={section.data} />
    case "shortlist": return <SectionShortlist data={section.data} />
    case "contacts": return <SectionContacts data={section.data} />
    case "calendrier": return <SectionCalendrier data={section.data} />
    case "dossiers": return <SectionDossiers data={section.data} />
    case "presentation": return <SectionPresentation data={section.data} />
    case "historique": return <SectionHistorique data={section.data} />
    default: return null
  }
}

const SECTION_ICONS: Record<string, string> = {
  besoin: "📋", profils: "📊", shortlist: "⭐", contacts: "📧",
  calendrier: "📅", dossiers: "📄", presentation: "🎯", historique: "🕐",
}

/* ─── Page ────────────────────────────────────────────────────── */

export default function WorkspacePage() {
  const params = useParams()
  const missionId = params.missionId as string
  const { getMission, subscribedLevel, addChatMessage, defineBesoin } = useMockStore()
  const [showChat, setShowChat] = useState(false)
  const [chatInput, setChatInput] = useState("")
  const [chatStep, setChatStep] = useState(0)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const mission = getMission(missionId)
  const agent = subscribedLevel ? AGENT_LEVELS[subscribedLevel] : null

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [mission?.chatMessages.length, showChat])

  if (!mission || !agent) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <p className="mb-5 text-base text-[var(--text-muted)]">Mission introuvable.</p>
          <Link
            href="/espace-client/sourcing"
            className="rounded-xl bg-[var(--accent-blue)] px-6 py-3 text-sm font-semibold text-white no-underline"
          >
            Retour aux missions →
          </Link>
        </div>
      </div>
    )
  }

  const status = STATUS_LABELS[mission.status]
  const questions = AGENT_QUESTIONS[agent.number] ?? AGENT_QUESTIONS[1]

  const handleStartChat = () => {
    setShowChat(true)
    if (mission.chatMessages.length === 0) {
      addChatMessage(missionId, { id: `msg-${Date.now()}`, role: "agent", text: questions[0] })
      setChatStep(1)
    } else {
      setChatStep(mission.chatMessages.filter((msg) => msg.role === "agent").length)
    }
  }

  const handleSendMessage = () => {
    if (!chatInput.trim()) return
    const text = chatInput.trim()
    setChatInput("")

    addChatMessage(missionId, { id: `msg-${Date.now()}`, role: "user", text })

    const nextStep = chatStep
    if (nextStep < questions.length) {
      setTimeout(() => {
        addChatMessage(missionId, { id: `msg-${Date.now()}`, role: "agent", text: questions[nextStep] })
        setChatStep(nextStep + 1)

        if (nextStep === questions.length - 1) {
          setTimeout(() => {
            defineBesoin(missionId, {
              poste: "Profil défini via conversation",
              details: "Le besoin a été défini lors de l'échange avec l'agent.",
              statut: "Validé",
              date: new Date().toISOString().slice(0, 10),
            })
          }, 800)
        }
      }, 600)
    }
  }

  return (
    <main className="mx-auto max-w-[960px] px-4 pb-20 pt-8 sm:px-6">
      {/* Breadcrumb */}
      <nav className="mb-6 hidden items-center gap-1.5 text-[13px] text-[var(--text-muted)] sm:flex">
        <Link href="/espace-client" className="text-[var(--text-muted)] no-underline hover:text-[var(--text-primary)]">
          Espace client
        </Link>
        <span>/</span>
        <Link href="/espace-client/sourcing" className="text-[var(--text-muted)] no-underline hover:text-[var(--text-primary)]">
          Missions
        </Link>
        <span>/</span>
        <span className="max-w-[200px] truncate font-medium text-[var(--text-primary)]">
          {mission.name}
        </span>
      </nav>

      {/* Mission header card */}
      <m.div
        {...fu(0)}
        className="mb-7 overflow-hidden rounded-[20px] border-[1.5px] bg-white"
        style={{ borderColor: agent.borderColor }}
      >
        <div className="h-1" style={{ background: agent.color }} />
        <div className="p-5 sm:p-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="font-heading text-xl font-bold text-[var(--text-primary)] sm:text-2xl">
                {mission.name}
              </h1>
              <p className="mt-1 text-[13px] text-[var(--text-muted)]">
                Agent {agent.agent} · Créée le {mission.createdAt}
              </p>
            </div>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold"
              style={{ color: status.color, background: status.bg }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: status.color }} />
              {status.label}
            </span>
          </div>

          {/* Agent welcome — shown when need is NOT defined */}
          {!mission.needDefined && (
            <div
              className="flex items-start gap-3.5 rounded-[14px] border p-5"
              style={{ background: agent.colorLight, borderColor: agent.borderColor }}
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                style={{ background: agent.color }}
              >
                {agent.agent.charAt(0)}
              </div>
              <div>
                <p className="mb-2 text-sm font-medium leading-relaxed text-[var(--text-primary)]">
                  Bonjour ! Je suis <strong>{agent.agent}</strong>, votre {agent.role.toLowerCase()}.
                  Commençons par définir votre besoin pour cette mission.
                </p>
                <button
                  onClick={handleStartChat}
                  className="cursor-pointer rounded-[10px] px-5 py-2.5 text-sm font-semibold text-white transition-all"
                  style={{ background: agent.color }}
                >
                  Définir le besoin →
                </button>
              </div>
            </div>
          )}
        </div>
      </m.div>

      {/* Chat simulation */}
      <AnimatePresence>
        {showChat && !mission.needDefined && (
          <m.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-7 overflow-hidden rounded-[20px] border-[1.5px] border-[var(--border)] bg-white"
          >
            {/* Chat header */}
            <div className="flex items-center gap-2.5 border-b border-[#F0ECF8] px-5 py-3.5 sm:px-6">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-[10px] text-sm font-bold text-white"
                style={{ background: agent.color }}
              >
                {agent.agent.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Conversation avec {agent.agent}
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">Définition du besoin</p>
              </div>
            </div>

            {/* Messages */}
            <div className="max-h-[400px] overflow-y-auto px-5 py-5 sm:px-6">
              {mission.chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`mb-3 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className="max-w-[75%] px-4 py-3 text-sm leading-relaxed"
                    style={{
                      borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
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
              <div className="flex gap-2.5 border-t border-[#F0ECF8] px-5 py-4 sm:px-6">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder="Décrivez votre besoin..."
                  className="flex-1 rounded-[10px] border-[1.5px] border-[var(--border)] px-3.5 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-blue)]"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim()}
                  className="cursor-pointer rounded-[10px] px-5 py-3 text-sm font-semibold text-white transition-all disabled:cursor-not-allowed disabled:bg-gray-300"
                  style={{ background: chatInput.trim() ? agent.color : undefined }}
                >
                  Envoyer
                </button>
              </div>
            )}
          </m.div>
        )}
      </AnimatePresence>

      {/* Workspace sections */}
      {mission.sections.length > 0 && (
        <div className="flex flex-col gap-5">
          {mission.sections.map((section, i) => (
            <m.div
              key={section.id}
              {...fu(0.1 + i * 0.06)}
              className="overflow-hidden rounded-[20px] border-[1.5px] border-[var(--border)] bg-white"
            >
              {/* Section header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F0ECF8] px-5 py-4 sm:px-7">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">{SECTION_ICONS[section.type] ?? "📋"}</span>
                  <h3 className="font-heading text-base font-semibold text-[var(--text-primary)]">
                    {section.title}
                  </h3>
                  <span className="rounded-md bg-green-500/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-green-500">
                    Complété
                  </span>
                </div>
                {section.exportable && (
                  <button
                    onClick={() => alert("Export simulé — fonctionnalité disponible prochainement.")}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--accent-blue)]/18 bg-[var(--accent-blue)]/6 px-4 py-2 text-xs font-semibold text-[var(--accent-blue)] transition-all hover:bg-[var(--accent-blue)]/12"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M7 1v8m0 0l-3-3m3 3l3-3M2 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Télécharger
                  </button>
                )}
              </div>

              {/* Section content */}
              <div className="p-5 sm:p-7">
                {renderSection(section)}
              </div>
            </m.div>
          ))}
        </div>
      )}

      {/* Fallback empty state */}
      {mission.needDefined && mission.sections.length === 0 && (
        <m.div
          {...fu(0.1)}
          className="rounded-[20px] border-[1.5px] border-[var(--border)] bg-white px-8 py-12 text-center"
        >
          <p className="text-base text-[var(--text-muted)]">
            {agent.agent} travaille sur votre mission. Les résultats apparaîtront ici.
          </p>
        </m.div>
      )}
    </main>
  )
}
