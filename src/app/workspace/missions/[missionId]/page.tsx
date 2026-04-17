"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { m, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { useParams } from "next/navigation"
import { getSupabase } from "@/lib/supabase"
import { AGENT_LEVELS } from "@/lib/mock-store"
import { useWorkspace } from "../../layout"
import BriefChat, { type BriefChatHandle } from "@/components/workspace/BriefChat"
import MissionRunPanel from "@/components/workspace/MissionRunPanel"
import { SOURCE_META } from "@/lib/candidate-meta"
import type { Database } from "@/lib/database.types"
import type { MissionBrief, ScoreDimensions } from "@/lib/database.types"

type Mission = Database["public"]["Tables"]["missions"]["Row"]
type Candidate = Database["public"]["Tables"]["candidates"]["Row"]
type BookingLink = Database["public"]["Tables"]["booking_links"]["Row"]

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nawastudio.com"
const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]
const fu = (delay: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay, ease: EASE },
})

/* ── Section visibility (Léo tabs) ────────────────────────────── */

type SectionKey = "results" | "scoring" | "messages" | "pipeline" | "calendar"

function getSections(level: number): SectionKey[] {
  if (level >= 3) return ["results", "scoring", "messages", "pipeline", "calendar"]
  if (level >= 2) return ["results", "scoring", "messages"]
  return ["results"]
}

const SECTION_META: Record<SectionKey, { label: string; icon: string }> = {
  results:  { label: "Résultats",  icon: "📊" },
  scoring:  { label: "Scoring",    icon: "⭐" },
  messages: { label: "Messages",   icon: "📧" },
  pipeline: { label: "Pipeline",   icon: "🔀" },
  calendar: { label: "Booking",    icon: "📅" },
}

const STATUS_META: Record<Mission["status"], { label: string; color: string; bg: string }> = {
  preparation: { label: "Préparation", color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
  in_progress: { label: "En cours",    color: "#22c55e", bg: "rgba(34,197,94,0.08)" },
  completed:   { label: "Terminée",    color: "#6B7280", bg: "rgba(107,114,128,0.08)" },
  error:       { label: "Erreur",      color: "#EF4444", bg: "rgba(239,68,68,0.08)" },
}

const BOOKING_STATUS_META: Record<BookingLink["status"], { label: string; color: string }> = {
  pending:  { label: "En attente", color: "#F59E0B" },
  reserved: { label: "Réservé",    color: "#3b82f6" },
  done:     { label: "Effectué",   color: "#22c55e" },
}

/* ── Helpers ───────────────────────────────────────────────────── */

function buildBookingPageUrl(token: string) {
  return `${SITE_URL}/booking/${token}`
}

function buildMessageTemplate(
  candidateName: string | null,
  missionTitle: string,
  recruiterName: string | null,
  bookingPageUrl: string
): string {
  const name = candidateName ?? "vous"
  const recruiter = recruiterName ?? "notre équipe"
  return `Bonjour ${name},\n\nJe suis ${recruiter} et je recrute actuellement pour le poste de ${missionTitle}.\n\nVotre profil m'a particulièrement intéressé(e). Seriez-vous disponible pour un échange de 30 minutes ?\n\n→ Choisissez directement votre créneau : ${bookingPageUrl}\n\nCordialement,\n${recruiter}`
}

/* ── Page ──────────────────────────────────────────────────────── */

export default function MissionDetailPage() {
  const params = useParams()
  const missionId = params.missionId as string
  const { agentLevel, profile } = useWorkspace()
  const agent = AGENT_LEVELS[agentLevel]

  const [mission, setMission] = useState<Mission | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [bookingLinks, setBookingLinks] = useState<BookingLink[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<SectionKey>("results")
  const briefChatRef = useRef<BriefChatHandle>(null)

  const [isRunning, setIsRunning] = useState(false)
  const [excelB64, setExcelB64] = useState<string | null>(null)

  const sections = getSections(agentLevel)

  const fetchData = useCallback(async () => {
    const sb = getSupabase()
    const [{ data: m }, { data: c }, { data: bl }] = await Promise.all([
      sb.from("missions").select("*").eq("id", missionId).single(),
      sb.from("candidates").select("*").eq("mission_id", missionId).order("relevance_score", { ascending: false }),
      sb.from("booking_links").select("*").eq("mission_id", missionId),
    ])
    setMission(m)
    setCandidates(c ?? [])
    setBookingLinks(bl ?? [])
    setLoading(false)
  }, [missionId])

  useEffect(() => { fetchData() }, [fetchData])

  const handleChatLaunch = async (brief: MissionBrief) => {
    await getSupabase().from("missions").update({ brief }).eq("id", missionId)
    setMission((prev) => prev ? { ...prev, brief, status: "in_progress" } : prev)
    setIsRunning(true)
  }

  const handleRunCompleted = (b64: string, count: number, researchReport?: string) => {
    setExcelB64(b64)
    setIsRunning(false)
    setMission((prev) => {
      if (!prev) return prev
      return { ...prev, status: "completed", profiles_count: count, research_report: researchReport ?? prev.research_report ?? null }
    })
    fetchData()
  }

  const handleRunError = () => {
    setIsRunning(false)
    setMission((prev) => prev ? { ...prev, status: "error" } : prev)
  }

  const [reDownloading, setReDownloading] = useState(false)

  const downloadExcel = (b64?: string) => {
    const data = b64 ?? excelB64
    if (!data || !mission) return
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${mission.title.replace(/\s+/g, "_")}_${agentLevel >= 2 ? "nora" : "leo"}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const reDownload = async () => {
    if (!mission) return
    setReDownloading(true)
    try {
      const res = await fetch(`/api/missions/${missionId}/download`, { method: "POST" })
      const data = await res.json() as { ok?: boolean; excel_b64?: string }
      if (data.ok && data.excel_b64) downloadExcel(data.excel_b64)
    } finally {
      setReDownloading(false)
    }
  }

  const handleContact = async (candidateId: string) => {
    const current = candidates.find((c) => c.id === candidateId)
    const previousVal = current?.contacted_at ?? null
    const newVal = previousVal ? null : new Date().toISOString()
    setCandidates((prev) => prev.map((c) => c.id === candidateId ? { ...c, contacted_at: newVal } : c))
    try {
      await fetch(`/api/candidates/${candidateId}/contact`, { method: "PATCH" })
    } catch {
      setCandidates((prev) => prev.map((c) => c.id === candidateId ? { ...c, contacted_at: previousVal } : c))
    }
  }

  const handleDecision = async (
    candidateId: string,
    decision: "validated" | "rejected",
    messageDraft?: string
  ) => {
    if (decision === "validated") {
      setCandidates((prev) =>
        prev.map((c) => c.id === candidateId
          ? { ...c, status: "shortlisted" as const, message_draft: messageDraft ?? c.message_draft }
          : c
        )
      )
    } else {
      setCandidates((prev) => prev.map((c) => c.id === candidateId ? { ...c, status: "rejected" as const } : c))
      try {
        await getSupabase().from("candidates").update({ status: "rejected" }).eq("id", candidateId)
      } catch { /* ignore */ }
    }
  }

  const handleConsult = async (candidateId: string) => {
    setCandidates((prev) => prev.map((c) => c.id === candidateId ? { ...c, consulted_at: new Date().toISOString() } : c))
    try {
      await fetch(`/api/candidates/${candidateId}/consult`, { method: "PATCH" })
    } catch {
      setCandidates((prev) => prev.map((c) => c.id === candidateId ? { ...c, consulted_at: null } : c))
    }
  }

  const generateBookingLink = async (candidate: Candidate) => {
    const sb = getSupabase()
    const { data: link } = await sb
      .from("booking_links")
      .insert({ candidate_id: candidate.id, mission_id: missionId })
      .select().single()
    if (!link) return
    setBookingLinks((prev) => [...prev, link])
    const bookingPageUrl = buildBookingPageUrl(link.token)
    const messageDraft = buildMessageTemplate(candidate.name_estimated, mission?.title ?? "", profile?.first_name ?? null, bookingPageUrl)
    await sb.from("candidates").update({ message_draft: messageDraft }).eq("id", candidate.id)
    setCandidates((prev) => prev.map((c) => (c.id === candidate.id ? { ...c, message_draft: messageDraft } : c)))
  }

  const updateBookingStatus = async (linkId: string, newStatus: BookingLink["status"]) => {
    await getSupabase().from("booking_links").update({ status: newStatus }).eq("id", linkId)
    setBookingLinks((prev) => prev.map((bl) => (bl.id === linkId ? { ...bl, status: newStatus } : bl)))
  }

  /* ── Nora computed values ─────────────────────────────────────── */
  const scoredCandidates = candidates.filter((c) => c.relevance_score != null)
  const shortlistN = scoredCandidates.length > 0 ? Math.max(4, Math.ceil(scoredCandidates.length * 0.07)) : 0
  const topByScore = [...scoredCandidates]
    .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
    .slice(0, shortlistN)
  const validatedCandidates = candidates.filter((c) => c.status === "shortlisted")
  const rejectedCount = candidates.filter((c) => c.status === "rejected").length

  /* ── Render ───────────────────────────────────────────────────── */

  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}><Spinner /></div>
  }

  if (!mission) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <p style={{ color: "#6B7280", fontFamily: "var(--font-inter), sans-serif" }}>Mission introuvable.</p>
        <Link href="/workspace" style={{ color: "#7C63C8", fontFamily: "var(--font-inter), sans-serif" }}>← Retour</Link>
      </div>
    )
  }

  const statusMeta = STATUS_META[mission.status]
  const missionDate = new Date(mission.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })

  return (
    <div style={{ display: "flex", minHeight: "calc(100vh - 60px)", position: "relative" }}>

      {/* ── LEFT SIDEBAR — BriefChat ─────────────────────────── */}
      <div style={{
        width: 460, flexShrink: 0,
        position: "sticky", top: 60,
        height: "calc(100vh - 60px)",
        borderRight: "1.5px solid #F0ECF8",
        background: "rgba(255,255,255,0.98)",
        display: "flex", flexDirection: "column",
        zIndex: 5, overflowY: "auto", padding: "20px",
      }}>
        <BriefChat
          ref={briefChatRef}
          missionId={missionId}
          firstName={profile?.first_name ?? null}
          agentColor={agent.color}
          agentName={agent.agent}
          isRunning={isRunning}
          completedCount={mission.status === "completed" ? (mission.profiles_count ?? candidates.length) : undefined}
          onLaunch={handleChatLaunch}
        />
      </div>

      {/* ── RIGHT CONTENT ─────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, padding: "24px 24px 72px", position: "relative" }}>

        {/* Top nav */}
        <div style={{ marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <Link
            href="/workspace"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 13px", borderRadius: 9,
              border: "1.5px solid #E2DAF6", background: "white",
              color: "#7C63C8", fontSize: 12, fontWeight: 600,
              textDecoration: "none", fontFamily: "var(--font-inter), sans-serif",
              transition: "all 150ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#F0ECF8" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "white" }}
          >
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <path d="M15 10H5M9 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Workspace
          </Link>
          <nav style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
            <span>Workspace</span><span>/</span>
            <span style={{ color: "#374151", fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {mission.title}
            </span>
          </nav>
        </div>

        {/* Mission header */}
        <m.div {...fu(0)} style={{
          background: "white", borderRadius: 14,
          border: `1.5px solid ${agent.borderColor}`,
          overflow: "hidden", marginBottom: 14,
        }}>
          <div style={{ height: 2.5, background: agent.color }} />
          <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div>
              <h1 style={{ margin: "0 0 1px", fontSize: "clamp(14px, 2vw, 18px)", fontWeight: 800, color: "#111827", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
                {mission.title}
              </h1>
              <p style={{ margin: 0, fontSize: 11, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
                Agent {agent.agent} · Créée le {missionDate}
                {candidates.length > 0 && ` · ${candidates.length} profil${candidates.length > 1 ? "s" : ""}`}
              </p>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 999, color: statusMeta.color, background: statusMeta.bg, fontFamily: "var(--font-inter), sans-serif" }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: statusMeta.color }} />
              {statusMeta.label}
            </span>
          </div>
        </m.div>

        {/* Running state */}
        {isRunning && (
          <MissionRunPanel
            missionId={missionId}
            agentColor={agent.color}
            agentName={agent.agent}
            onCompleted={handleRunCompleted}
            onError={handleRunError}
          />
        )}

        {/* Empty state */}
        {!isRunning && candidates.length === 0 && (
          <div style={{
            background: "white", borderRadius: 14, border: "1.5px solid #F0ECF8",
            padding: "56px 24px", textAlign: "center",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, background: "#F8F6FF",
              border: "1.5px solid #E2DAF6",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="#7C63C8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#374151", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
              Définissez votre recherche
            </p>
            <p style={{ margin: 0, fontSize: 12, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif", maxWidth: 280 }}>
              Discutez avec l'assistant pour cadrer votre besoin et lancer la recherche.
            </p>
          </div>
        )}

        {/* Results */}
        {!isRunning && candidates.length > 0 && (
          agentLevel === 2 ? (
            /* ━━ NORA: cloud sections ━━ */
            <NoraSections
              mission={mission}
              candidates={candidates}
              topByScore={topByScore}
              shortlistN={shortlistN}
              validatedCandidates={validatedCandidates}
              rejectedCount={rejectedCount}
              excelB64={excelB64}
              reDownloading={reDownloading}
              missionId={missionId}
              agentColor={agent.color}
              onDownload={() => mission.status === "completed" && !excelB64 ? reDownload() : downloadExcel()}
              onDecision={handleDecision}
              onContact={handleContact}
            />
          ) : (
            /* ━━ LÉO: tab-based sections ━━ */
            <div>
              <div style={{ display: "flex", gap: 5, marginBottom: 12, overflowX: "auto", paddingBottom: 2 }}>
                {sections.map((key) => {
                  const meta = SECTION_META[key]
                  const isActive = activeSection === key
                  return (
                    <button
                      key={key}
                      onClick={() => setActiveSection(key)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "7px 12px", borderRadius: 9,
                        border: isActive ? `1.5px solid ${agent.borderColor}` : "1.5px solid #F0ECF8",
                        cursor: "pointer", fontSize: 12, fontWeight: isActive ? 700 : 500,
                        color: isActive ? agent.color : "#6B7280",
                        background: isActive ? agent.colorLight : "white",
                        fontFamily: "var(--font-inter), sans-serif", whiteSpace: "nowrap", transition: "all 150ms",
                      }}
                    >
                      <span>{meta.icon}</span>{meta.label}
                    </button>
                  )
                })}
              </div>
              <div style={{ background: "white", borderRadius: 14, border: "1.5px solid #F0ECF8", padding: "20px" }}>
                {activeSection === "results" && <ResultsSection candidates={candidates} onConsult={handleConsult} />}
                {activeSection === "scoring" && <ScoringSection candidates={candidates} />}
                {activeSection === "messages" && (
                  <MessagesSection
                    candidates={candidates}
                    bookingLinks={bookingLinks}
                    agentLevel={agentLevel}
                    hasBookingUrl={Boolean(profile?.booking_url)}
                    onGenerateLink={generateBookingLink}
                  />
                )}
                {activeSection === "pipeline" && (
                  <PipelineSection candidates={candidates} bookingLinks={bookingLinks} onUpdateStatus={updateBookingStatus} />
                )}
                {activeSection === "calendar" && (
                  <CalendarSection candidates={candidates} bookingLinks={bookingLinks} onUpdateStatus={updateBookingStatus} />
                )}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   NORA SECTIONS — cloud of accordion tiles
   ═══════════════════════════════════════════════════════════════ */

type NoraTab = "tableur" | "fiches" | "contact"

function NoraSections({
  mission,
  candidates,
  topByScore,
  shortlistN,
  validatedCandidates,
  rejectedCount,
  excelB64,
  reDownloading,
  missionId,
  agentColor,
  onDownload,
  onDecision,
  onContact,
}: {
  mission: Mission
  candidates: Candidate[]
  topByScore: Candidate[]
  shortlistN: number
  validatedCandidates: Candidate[]
  rejectedCount: number
  excelB64: string | null
  reDownloading: boolean
  missionId: string
  agentColor: string
  onDownload: () => void
  onDecision: (id: string, decision: "validated" | "rejected", msgDraft?: string) => void
  onContact: (id: string) => void
}) {
  const [active, setActive] = useState<NoraTab | null>(null)

  const toggle = (tab: NoraTab) => setActive((prev) => (prev === tab ? null : tab))

  const contactedCount = validatedCandidates.filter((c) => c.contacted_at).length
  const pendingCount = topByScore.filter((c) => c.status === "raw").length

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

      {/* Research report — always visible, not a section tile */}
      {mission.research_report && (
        <div style={{
          borderRadius: 12, border: "1.5px solid #E2DAF6",
          background: "linear-gradient(135deg, #FDFAFF 0%, #F5F0FF 100%)",
          padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start",
        }}>
          <div style={{
            width: 4, flexShrink: 0, borderRadius: 2, alignSelf: "stretch",
            background: agentColor, opacity: 0.5,
          }} />
          <div style={{ minWidth: 0 }}>
            <p style={{
              margin: "0 0 4px", fontSize: 9, fontWeight: 700, color: agentColor,
              textTransform: "uppercase", letterSpacing: "0.08em",
              fontFamily: "var(--font-inter), sans-serif",
            }}>
              Analyse Nora
            </p>
            <p style={{ margin: 0, fontSize: 12, color: "#374151", lineHeight: 1.6, fontFamily: "var(--font-inter), sans-serif" }}>
              {mission.research_report}
            </p>
          </div>
        </div>
      )}

      {/* ── Section 1: Tableur ────────────────────────────────── */}
      <SectionTile
        id="tableur"
        title="Tableur"
        accentColor="#16a34a"
        active={active === "tableur"}
        onToggle={() => toggle("tableur")}
        preview={`${candidates.length} profil${candidates.length !== 1 ? "s" : ""} · ${validatedCandidates.length} validé${validatedCandidates.length !== 1 ? "s" : ""}${rejectedCount > 0 ? ` · ${rejectedCount} refusé${rejectedCount !== 1 ? "s" : ""}` : ""}`}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          {/* Stats */}
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <StatPill value={candidates.length} label="Profils trouvés" color="#111827" />
            <StatPill value={validatedCandidates.length} label="Validés" color="#16a34a" />
            {rejectedCount > 0 && <StatPill value={rejectedCount} label="Refusés" color="#DC2626" />}
            {shortlistN > 0 && <StatPill value={shortlistN} label="Top sélection" color="#7C63C8" />}
          </div>

          {/* Download */}
          <button
            onClick={onDownload}
            disabled={reDownloading || (!excelB64 && mission.status !== "completed")}
            style={{
              padding: "9px 16px", borderRadius: 9, border: "none",
              background: (!excelB64 && mission.status !== "completed") ? "#F0ECF8" : "#16a34a",
              color: (!excelB64 && mission.status !== "completed") ? "#9CA3AF" : "white",
              fontSize: 12, fontWeight: 700,
              cursor: (!excelB64 && mission.status !== "completed") ? "not-allowed" : "pointer",
              fontFamily: "var(--font-inter), sans-serif", whiteSpace: "nowrap",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <path d="M10 3v11M5 10l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 17h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            {reDownloading ? "Chargement…" : "Télécharger Excel"}
          </button>
        </div>
      </SectionTile>

      {/* ── Section 2: Fiches candidats ───────────────────────── */}
      <SectionTile
        id="fiches"
        title="Fiches candidats"
        accentColor={agentColor}
        active={active === "fiches"}
        onToggle={() => toggle("fiches")}
        preview={shortlistN > 0
          ? `Top ${shortlistN} sélection · ${pendingCount} à évaluer · ${validatedCandidates.length} validé${validatedCandidates.length !== 1 ? "s" : ""}`
          : "Aucun profil scoré"
        }
      >
        {topByScore.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
            Aucun profil dans la sélection.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topByScore.map((c) => (
              <CandidateFiche
                key={c.id}
                candidate={c}
                missionId={missionId}
                agentColor={agentColor}
                onDecision={onDecision}
              />
            ))}
          </div>
        )}
      </SectionTile>

      {/* ── Section 3: Contact progression ───────────────────── */}
      <SectionTile
        id="contact"
        title="Progression contact"
        accentColor="#0EA5E9"
        active={active === "contact"}
        onToggle={() => toggle("contact")}
        preview={validatedCandidates.length === 0
          ? "Aucun candidat validé"
          : `${contactedCount} / ${validatedCandidates.length} contacté${contactedCount !== 1 ? "s" : ""}`
        }
      >
        {validatedCandidates.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
            Validez des candidats dans la section Fiches pour les retrouver ici.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Progress bar */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif" }}>
                  {contactedCount} contacté{contactedCount !== 1 ? "s" : ""} sur {validatedCandidates.length}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#0EA5E9", fontFamily: "var(--font-inter), sans-serif" }}>
                  {validatedCandidates.length > 0 ? Math.round((contactedCount / validatedCandidates.length) * 100) : 0}%
                </span>
              </div>
              <div style={{ height: 5, borderRadius: 999, background: "#E0F2FE", overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 999, background: "#0EA5E9",
                  width: `${validatedCandidates.length > 0 ? (contactedCount / validatedCandidates.length) * 100 : 0}%`,
                  transition: "width 400ms ease",
                }} />
              </div>
            </div>

            {/* Candidate rows */}
            {validatedCandidates.map((c) => {
              const source = (c.source ?? "linkedin") as keyof typeof SOURCE_META
              const srcMeta = SOURCE_META[source] ?? SOURCE_META.linkedin
              const isContacted = Boolean(c.contacted_at)
              return (
                <div key={c.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 10,
                  border: `1.5px solid ${isContacted ? "#BAE6FD" : "#F0ECF8"}`,
                  background: isContacted ? "#F0F9FF" : "white",
                  transition: "all 180ms",
                }}>
                  {/* Source */}
                  <span style={{
                    flexShrink: 0, width: 22, height: 22, borderRadius: 6,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 900, color: srcMeta.color, background: srcMeta.bg,
                    fontFamily: "var(--font-inter), sans-serif",
                  }}>{srcMeta.icon}</span>

                  {/* Name + title */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827", fontFamily: "var(--font-inter), sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.name_estimated ?? "Candidat"}
                      {c.company && <span style={{ fontWeight: 400, color: "#6B7280" }}> · {c.company}</span>}
                    </p>
                    {c.title_estimated && (
                      <p style={{ margin: 0, fontSize: 11, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.title_estimated}
                      </p>
                    )}
                  </div>

                  {/* LinkedIn link */}
                  {c.linkedin_url && (
                    <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
                      style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 7, textDecoration: "none", color: srcMeta.color, background: srcMeta.bg, fontFamily: "var(--font-inter), sans-serif" }}>
                      Profil
                    </a>
                  )}

                  {/* Contacted toggle */}
                  <label style={{
                    flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5,
                    fontSize: 11, fontWeight: 600, cursor: "pointer",
                    color: isContacted ? "#0EA5E9" : "#9CA3AF",
                    padding: "4px 9px", borderRadius: 7,
                    background: isContacted ? "rgba(14,165,233,0.08)" : "#F9FAFB",
                    border: `1.5px solid ${isContacted ? "rgba(14,165,233,0.28)" : "#E5E7EB"}`,
                    transition: "all 150ms", userSelect: "none",
                    fontFamily: "var(--font-inter), sans-serif",
                  }}>
                    <input
                      type="checkbox"
                      checked={isContacted}
                      onChange={() => onContact(c.id)}
                      style={{ width: 13, height: 13, accentColor: "#0EA5E9", cursor: "pointer" }}
                    />
                    Contacté
                  </label>
                </div>
              )
            })}
          </div>
        )}
      </SectionTile>
    </div>
  )
}

/* ── SectionTile (accordion) ──────────────────────────────────── */

function SectionTile({
  id: _id,
  title,
  accentColor,
  active,
  onToggle,
  preview,
  children,
}: {
  id: string
  title: string
  accentColor: string
  active: boolean
  onToggle: () => void
  preview: string
  children: React.ReactNode
}) {
  return (
    <div style={{
      borderRadius: 14,
      border: `1.5px solid ${active ? accentColor + "30" : "#F0ECF8"}`,
      background: active ? `${accentColor}03` : "white",
      overflow: "hidden",
      transition: "border-color 220ms, background 220ms",
    }}>
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        style={{
          width: "100%", padding: "13px 16px",
          display: "flex", alignItems: "center", gap: 10,
          background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        {/* Accent bar */}
        <div style={{
          width: 3, height: 18, borderRadius: 2, flexShrink: 0,
          background: accentColor, opacity: active ? 1 : 0.35,
          transition: "opacity 220ms",
        }} />

        {/* Title */}
        <span style={{
          fontSize: 13, fontWeight: 700, color: "#111827",
          fontFamily: "var(--font-space-grotesk), sans-serif",
          flex: 1,
        }}>
          {title}
        </span>

        {/* Preview (hidden when expanded) */}
        {!active && (
          <span style={{
            fontSize: 11, color: "#9CA3AF",
            fontFamily: "var(--font-inter), sans-serif",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            maxWidth: 280, flexShrink: 1,
          }}>
            {preview}
          </span>
        )}

        {/* Chevron */}
        <svg
          width="14" height="14" viewBox="0 0 20 20" fill="none"
          style={{
            flexShrink: 0, color: active ? accentColor : "#9CA3AF",
            transform: active ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 250ms, color 220ms",
          }}
        >
          <path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Content — animated with grid-template-rows */}
      <div style={{
        display: "grid",
        gridTemplateRows: active ? "1fr" : "0fr",
        transition: "grid-template-rows 280ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}>
        <div style={{ overflow: "hidden" }}>
          <div style={{ padding: "2px 16px 16px" }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── CandidateFiche (Nora candidate card) ─────────────────────── */

function CandidateFiche({
  candidate: c,
  missionId: _missionId,
  agentColor,
  onDecision,
}: {
  candidate: Candidate
  missionId: string
  agentColor: string
  onDecision: (id: string, decision: "validated" | "rejected", msgDraft?: string) => void
}) {
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  const source = (c.source ?? "linkedin") as keyof typeof SOURCE_META
  const srcMeta = SOURCE_META[source] ?? SOURCE_META.linkedin
  const score = c.relevance_score ?? 0
  const dims = c.score_dimensions as ScoreDimensions | null

  const scoreColor = score >= 80 ? "#16a34a" : score >= 60 ? "#F59E0B" : "#EF4444"

  const isValidated = c.status === "shortlisted"
  const isRejected = c.status === "rejected"

  const handleValidate = async () => {
    if (isValidated || isRejected) return
    setGenerating(true)
    try {
      const res = await fetch(`/api/candidates/${c.id}/generate-message`, { method: "POST" })
      const data = await res.json() as { message_draft?: string }
      onDecision(c.id, "validated", data.message_draft)
    } catch {
      onDecision(c.id, "validated")
    } finally {
      setGenerating(false)
    }
  }

  const copyMessage = () => {
    if (!c.message_draft) return
    navigator.clipboard.writeText(c.message_draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{
      borderRadius: 12,
      border: `1.5px solid ${isValidated ? "#BBF7D0" : isRejected ? "#FECACA" : "#F0ECF8"}`,
      background: isValidated ? "#F0FDF4" : isRejected ? "#FFF5F5" : "white",
      overflow: "hidden",
      opacity: isRejected ? 0.6 : 1,
      transition: "all 200ms",
    }}>
      {/* Top row */}
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* Source */}
        <span style={{
          flexShrink: 0, width: 22, height: 22, borderRadius: 6,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 900, color: srcMeta.color, background: srcMeta.bg,
          fontFamily: "var(--font-inter), sans-serif",
        }}>{srcMeta.icon}</span>

        {/* Name + title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#111827", fontFamily: "var(--font-inter), sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.name_estimated ?? "Profil anonyme"}
              {c.company && <span style={{ fontWeight: 400, color: "#6B7280" }}> · {c.company}</span>}
            </p>
            {/* Seniority badge */}
            {c.seniority_level && c.seniority_level !== "Inconnu" && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
                color: c.seniority_level === "Senior" ? "#7C63C8" : c.seniority_level === "Confirmé" ? "#F59E0B" : "#16a34a",
                background: c.seniority_level === "Senior" ? "#F0ECF8" : c.seniority_level === "Confirmé" ? "rgba(245,158,11,0.1)" : "rgba(22,163,74,0.1)",
                fontFamily: "var(--font-inter), sans-serif",
              }}>
                {c.seniority_level}
              </span>
            )}
            {/* Status badge */}
            {isValidated && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999, color: "#16a34a", background: "rgba(22,163,74,0.1)", fontFamily: "var(--font-inter), sans-serif" }}>
                Validé
              </span>
            )}
            {isRejected && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999, color: "#EF4444", background: "rgba(239,68,68,0.1)", fontFamily: "var(--font-inter), sans-serif" }}>
                Refusé
              </span>
            )}
          </div>
          {c.title_estimated && (
            <p style={{ margin: "1px 0 0", fontSize: 11, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.title_estimated}
            </p>
          )}
        </div>

        {/* Score badge */}
        <div style={{
          flexShrink: 0, display: "flex", flexDirection: "column",
          alignItems: "center", gap: 1,
        }}>
          <span style={{
            fontSize: 16, fontWeight: 800, color: scoreColor,
            fontFamily: "var(--font-space-grotesk), sans-serif",
            lineHeight: 1,
          }}>
            {score}
          </span>
          <span style={{ fontSize: 9, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>/100</span>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {c.linkedin_url && (
            <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 7, textDecoration: "none", color: srcMeta.color, background: srcMeta.bg, fontFamily: "var(--font-inter), sans-serif" }}>
              Profil
            </a>
          )}

          {!isValidated && !isRejected && (
            <>
              <button
                onClick={() => onDecision(c.id, "rejected")}
                style={{
                  padding: "5px 10px", borderRadius: 7, border: "1.5px solid #FECACA",
                  background: "white", color: "#EF4444",
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                  fontFamily: "var(--font-inter), sans-serif",
                }}
              >
                Rejeter
              </button>
              <button
                onClick={handleValidate}
                disabled={generating}
                style={{
                  padding: "5px 12px", borderRadius: 7, border: "none",
                  background: generating ? "#D1D5DB" : agentColor,
                  color: "white",
                  fontSize: 11, fontWeight: 700, cursor: generating ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-inter), sans-serif",
                  display: "inline-flex", alignItems: "center", gap: 5,
                }}
              >
                {generating ? (
                  <>
                    <span style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
                    Génération…
                  </>
                ) : "Valider + message"}
              </button>
            </>
          )}

          {isValidated && c.message_draft && (
            <button
              onClick={copyMessage}
              style={{
                padding: "5px 10px", borderRadius: 7,
                border: `1.5px solid ${copied ? "#86EFAC" : "#E2DAF6"}`,
                background: copied ? "rgba(22,163,74,0.07)" : "white",
                color: copied ? "#16a34a" : "#7C63C8",
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                fontFamily: "var(--font-inter), sans-serif", transition: "all 150ms",
              }}
            >
              {copied ? "Copié" : "Copier message"}
            </button>
          )}
        </div>
      </div>

      {/* Score dimensions bar */}
      {dims && !isRejected && (
        <div style={{ padding: "0 14px 10px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {(Object.entries(dims) as Array<[string, number]>).map(([dim, val]) => {
            const dimMeta: Record<string, { label: string; color: string }> = {
              competences:  { label: "Compét.",   color: "#7C63C8" },
              seniorite:    { label: "Séniorité", color: "#0EA5E9" },
              localisation: { label: "Lieu",      color: "#10B981" },
              qualite:      { label: "Qualité",   color: "#F59E0B" },
            }
            const meta = dimMeta[dim]
            if (!meta) return null
            return (
              <div key={dim} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 60, flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 9, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>{meta.label}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: meta.color, fontFamily: "var(--font-inter), sans-serif" }}>{val}</span>
                </div>
                <div style={{ height: 3, borderRadius: 999, background: "#F0ECF8", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 999, background: meta.color, width: `${val}%`, opacity: 0.7 }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Message preview (when validated) */}
      {isValidated && c.message_draft && (
        <div style={{ borderTop: "1px solid #E7FAF0", padding: "8px 14px 10px" }}>
          <p style={{
            margin: 0, fontSize: 11, color: "#374151",
            fontFamily: "var(--font-inter), sans-serif",
            lineHeight: 1.6, whiteSpace: "pre-wrap",
            display: "-webkit-box", WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical" as const, overflow: "hidden",
          }}>
            {c.message_draft}
          </p>
        </div>
      )}

      {/* Score justification */}
      {c.score_justification && !isRejected && (
        <div style={{ borderTop: "1px solid #F0ECF8", padding: "6px 14px 8px" }}>
          <p style={{
            margin: 0, fontSize: 11, color: "#6B7280",
            fontFamily: "var(--font-inter), sans-serif", lineHeight: 1.5,
            fontStyle: "italic",
          }}>
            {c.score_justification}
          </p>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

/* ── Stat pill ───────────────────────────────────────────────── */

function StatPill({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color, fontFamily: "var(--font-space-grotesk), sans-serif", lineHeight: 1 }}>
        {value}
      </p>
      <p style={{ margin: "2px 0 0", fontSize: 10, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
        {label}
      </p>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   LÉO SECTION COMPONENTS
   ═══════════════════════════════════════════════════════════════ */

function ResultsSection({ candidates, onConsult }: { candidates: Candidate[]; onConsult: (id: string) => void }) {
  const [filter, setFilter] = useState<"all" | "linkedin" | "malt" | "apec">("all")
  const [search, setSearch] = useState("")

  if (candidates.length === 0) return <WaitingState label="Les profils identifiés apparaîtront ici." />

  const consultedCount = candidates.filter((c) => c.consulted_at).length
  const liCount   = candidates.filter((c) => (c.source ?? "linkedin") === "linkedin").length
  const maltCount = candidates.filter((c) => c.source === "malt").length
  const apecCount = candidates.filter((c) => c.source === "apec").length

  const filtered = candidates.filter((c) => {
    const matchSource = filter === "all" || (c.source ?? "linkedin") === filter
    const matchSearch = !search || [c.name_estimated, c.title_estimated, c.company]
      .some((v) => v?.toLowerCase().includes(search.toLowerCase()))
    return matchSource && matchSearch
  })

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {[
          { key: "all",      label: `Tous (${candidates.length})`,  color: "#7C63C8", bg: "#F0ECF8" },
          { key: "linkedin", label: `LinkedIn (${liCount})`,        color: "#0A66C2", bg: "rgba(10,102,194,0.08)" },
          { key: "malt",     label: `Malt (${maltCount})`,          color: "#FC5757", bg: "rgba(252,87,87,0.08)" },
          { key: "apec",     label: `APEC (${apecCount})`,          color: "#E87722", bg: "rgba(232,119,34,0.08)" },
        ].map(({ key, label, color, bg }) => (
          <button key={key} onClick={() => setFilter(key as typeof filter)}
            style={{
              padding: "5px 12px", borderRadius: 999,
              border: `1.5px solid ${filter === key ? color : "#E5E7EB"}`,
              background: filter === key ? bg : "white", color: filter === key ? color : "#6B7280",
              fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 130ms",
              fontFamily: "var(--font-inter), sans-serif",
            }}>{label}</button>
        ))}
        <div style={{ marginLeft: "auto", position: "relative", minWidth: 180 }}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none"
            style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }}>
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M13.5 13.5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…"
            style={{
              paddingLeft: 28, paddingRight: 10, paddingTop: 6, paddingBottom: 6,
              borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12,
              color: "#111827", outline: "none", background: "white", width: "100%",
              fontFamily: "var(--font-inter), sans-serif", boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {consultedCount > 0 && (
        <p style={{ margin: "0 0 10px", fontSize: 11, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
          {consultedCount} profil{consultedCount > 1 ? "s" : ""} consulté{consultedCount > 1 ? "s" : ""} · cliquez sur un lien pour marquer comme consulté
        </p>
      )}

      <div style={{ maxHeight: "calc(100vh - 420px)", minHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5, paddingRight: 2 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#9CA3AF", fontSize: 13, fontFamily: "var(--font-inter), sans-serif" }}>
            Aucun profil pour ce filtre.
          </div>
        ) : filtered.map((c, i) => {
          const source = (c.source ?? "linkedin") as keyof typeof SOURCE_META
          const srcMeta = SOURCE_META[source] ?? SOURCE_META.linkedin
          const isConsulted = Boolean(c.consulted_at)
          const score = c.relevance_score

          return (
            <div key={c.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              borderRadius: 11, border: `1.5px solid ${isConsulted ? "#E2DAF6" : "#F0ECF8"}`,
              background: isConsulted ? "#FDFAFF" : "white", transition: "all 150ms", opacity: isConsulted ? 0.72 : 1,
            }}
              onMouseEnter={(e) => { if (!isConsulted) (e.currentTarget as HTMLElement).style.borderColor = "#E2DAF6" }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = isConsulted ? "#E2DAF6" : "#F0ECF8" }}
            >
              <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: isConsulted ? "#7C63C8" : "#9CA3AF", background: isConsulted ? "#EDE8FB" : "#F8F6FF", fontFamily: "var(--font-inter), sans-serif" }}>
                {isConsulted ? "✓" : i + 1}
              </span>
              <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: srcMeta.color, background: srcMeta.bg, fontFamily: "var(--font-inter), sans-serif", letterSpacing: -0.3 }}>
                {srcMeta.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827", fontFamily: "var(--font-inter), sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                    {c.name_estimated ?? "Profil inconnu"}
                  </p>
                  {isConsulted && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999, color: "#7C63C8", background: "#EDE8FB", fontFamily: "var(--font-inter), sans-serif", whiteSpace: "nowrap" }}>
                      Consulté
                    </span>
                  )}
                </div>
                <p style={{ margin: "1px 0 0", fontSize: 11, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>
                  {[c.title_estimated, c.company].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              {score !== null && score !== undefined && (
                <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: "3px 7px", borderRadius: 6, color: score >= 80 ? "#16a34a" : score >= 60 ? "#F59E0B" : "#EF4444", background: score >= 80 ? "rgba(22,163,74,0.08)" : score >= 60 ? "rgba(245,158,11,0.08)" : "rgba(239,68,68,0.08)", fontFamily: "var(--font-inter), sans-serif" }}>
                  {score}
                </span>
              )}
              {c.linkedin_url ? (
                <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
                  onClick={() => !isConsulted && onConsult(c.id)}
                  style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 8, textDecoration: "none", whiteSpace: "nowrap", transition: "all 150ms", color: isConsulted ? "#9CA3AF" : srcMeta.color, background: isConsulted ? "#F3F4F6" : srcMeta.bg, border: `1.5px solid ${isConsulted ? "#E5E7EB" : srcMeta.color + "40"}`, fontFamily: "var(--font-inter), sans-serif" }}>
                  {srcMeta.urlLabel}
                </a>
              ) : (
                <span style={{ flexShrink: 0, fontSize: 11, color: "#D1D5DB" }}>—</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ScoringSection({ candidates }: { candidates: Candidate[] }) {
  const scored = candidates.filter((c) => c.relevance_score !== null).sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
  if (scored.length === 0) return <WaitingState label="Les scores apparaîtront ici une fois le sourcing effectué." />
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {scored.map((c) => (
        <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: 12, border: "1px solid #F0ECF8", background: "#FAFAFA", gap: 12, flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827", fontFamily: "var(--font-inter), sans-serif" }}>{c.name_estimated ?? "Candidat inconnu"}</p>
            {c.company && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif" }}>{c.company}</p>}
            {c.keywords && c.keywords.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {c.keywords.slice(0, 4).map((kw) => (
                  <span key={kw} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#F0ECF8", color: "#7C63C8", fontFamily: "var(--font-inter), sans-serif" }}>{kw}</span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: (c.relevance_score ?? 0) >= 80 ? "#22c55e" : "#F59E0B", fontFamily: "var(--font-space-grotesk), sans-serif" }}>{c.relevance_score ?? "—"}</span>
            <span style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>/100</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function MessagesSection({
  candidates, bookingLinks, agentLevel, hasBookingUrl, onGenerateLink,
}: {
  candidates: Candidate[]
  bookingLinks: BookingLink[]
  agentLevel: number
  hasBookingUrl: boolean
  onGenerateLink: (candidate: Candidate) => Promise<void>
}) {
  const [generating, setGenerating] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  if (candidates.length === 0) return <WaitingState label="Les messages générés apparaîtront ici." />

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleGenerate = async (candidate: Candidate) => {
    setGenerating(candidate.id)
    await onGenerateLink(candidate)
    setGenerating(null)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {!hasBookingUrl && agentLevel === 3 && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "#FEF3C7", border: "1px solid #FDE68A", fontSize: 13, color: "#92400E", fontFamily: "var(--font-inter), sans-serif" }}>
          Configurez votre lien de réservation depuis le dashboard pour générer des messages avec booking.
        </div>
      )}
      {candidates.map((c) => {
        const existingLink = bookingLinks.find((bl) => bl.candidate_id === c.id)
        const bookingPageUrl = existingLink ? buildBookingPageUrl(existingLink.token) : null
        const hasMessage = Boolean(c.message_draft)
        return (
          <div key={c.id} style={{ borderRadius: 12, border: "1px solid #F0ECF8", overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", background: "#F8F6FF", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827", fontFamily: "var(--font-inter), sans-serif" }}>
                {c.name_estimated ?? "Candidat"}{c.company ? ` — ${c.company}` : ""}
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {bookingPageUrl && (
                  <button onClick={() => copyText(bookingPageUrl, `url-${c.id}`)} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 8, border: "1px solid #E2DAF6", background: "white", color: "#7C63C8", cursor: "pointer", fontFamily: "var(--font-inter), sans-serif" }}>
                    {copied === `url-${c.id}` ? "Copié" : "Lien booking"}
                  </button>
                )}
                {agentLevel === 3 && !existingLink && hasBookingUrl && (
                  <button onClick={() => handleGenerate(c)} disabled={generating === c.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 8, border: "1px solid #E2DAF6", background: "white", color: "#7C63C8", cursor: generating === c.id ? "not-allowed" : "pointer", fontFamily: "var(--font-inter), sans-serif" }}>
                    {generating === c.id ? "Génération…" : "Générer message + lien"}
                  </button>
                )}
                {hasMessage && (
                  <button onClick={() => copyText(c.message_draft!, `msg-${c.id}`)} style={{ fontSize: 11, fontWeight: 600, color: "#7C63C8", background: "transparent", border: "1px solid #E2DAF6", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontFamily: "var(--font-inter), sans-serif" }}>
                    {copied === `msg-${c.id}` ? "Copié !" : "Copier message"}
                  </button>
                )}
              </div>
            </div>
            {hasMessage ? (
              <p style={{ margin: 0, padding: "14px 16px", fontSize: 13, color: "#374151", lineHeight: 1.75, fontFamily: "var(--font-inter), sans-serif", whiteSpace: "pre-wrap" }}>
                {c.message_draft}
              </p>
            ) : (
              <p style={{ margin: 0, padding: "14px 16px", fontSize: 13, color: "#9CA3AF", fontStyle: "italic", fontFamily: "var(--font-inter), sans-serif" }}>
                Aucun message généré.
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PipelineSection({ candidates, bookingLinks, onUpdateStatus }: {
  candidates: Candidate[]
  bookingLinks: BookingLink[]
  onUpdateStatus: (linkId: string, status: BookingLink["status"]) => Promise<void>
}) {
  const statuses: Candidate["status"][] = ["raw", "shortlisted", "rejected"]
  const statusLabels: Record<Candidate["status"], string> = { raw: "Brut", shortlisted: "Shortlist", rejected: "Rejeté" }
  const statusColors: Record<Candidate["status"], string> = { raw: "#6B7280", shortlisted: "#22c55e", rejected: "#EF4444" }
  if (candidates.length === 0) return <WaitingState label="Le pipeline de candidats s'affichera ici." />
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
      {statuses.map((status) => {
        const group = candidates.filter((c) => c.status === status)
        return (
          <div key={status} style={{ borderRadius: 12, border: "1px solid #F0ECF8", overflow: "hidden" }}>
            <div style={{ padding: "8px 14px", background: "#F8F6FF", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: statusColors[status], fontFamily: "var(--font-inter), sans-serif" }}>{statusLabels[status]}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: statusColors[status], background: `${statusColors[status]}14`, padding: "2px 7px", borderRadius: 999, fontFamily: "var(--font-inter), sans-serif" }}>{group.length}</span>
            </div>
            <div style={{ padding: "8px" }}>
              {group.length === 0 ? (
                <p style={{ margin: 0, padding: "8px 6px", fontSize: 12, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>Aucun candidat</p>
              ) : group.map((c) => {
                const link = bookingLinks.find((bl) => bl.candidate_id === c.id)
                return (
                  <div key={c.id} style={{ padding: "8px 10px", borderRadius: 8, marginBottom: 4, background: "white", border: "1px solid #F0ECF8" }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#111827", fontFamily: "var(--font-inter), sans-serif" }}>{c.name_estimated ?? "Inconnu"}</p>
                    {c.company && <p style={{ margin: 0, fontSize: 11, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>{c.company}</p>}
                    {link && (
                      <span style={{ marginTop: 4, display: "inline-block", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, color: BOOKING_STATUS_META[link.status].color, background: `${BOOKING_STATUS_META[link.status].color}14`, fontFamily: "var(--font-inter), sans-serif" }}>
                        {BOOKING_STATUS_META[link.status].label}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CalendarSection({ candidates, bookingLinks, onUpdateStatus }: {
  candidates: Candidate[]
  bookingLinks: BookingLink[]
  onUpdateStatus: (linkId: string, status: BookingLink["status"]) => Promise<void>
}) {
  const [copied, setCopied] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  if (bookingLinks.length === 0) return <WaitingState label="Les liens de booking apparaîtront ici une fois générés." />

  const STATUS_FLOW: Record<BookingLink["status"], BookingLink["status"][]> = {
    pending: ["reserved", "done"], reserved: ["done", "pending"], done: ["pending"],
  }
  const copyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }
  const handleStatus = async (linkId: string, status: BookingLink["status"]) => {
    setUpdating(linkId)
    await onUpdateStatus(linkId, status)
    setUpdating(null)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {bookingLinks.map((bl) => {
        const candidate = candidates.find((c) => c.id === bl.candidate_id)
        const bookingPageUrl = buildBookingPageUrl(bl.token)
        const statusInfo = BOOKING_STATUS_META[bl.status]
        return (
          <div key={bl.id} style={{ borderRadius: 14, border: "1px solid #F0ECF8", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#FAFAFA", flexWrap: "wrap", gap: 8 }}>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827", fontFamily: "var(--font-inter), sans-serif" }}>{candidate?.name_estimated ?? "Candidat inconnu"}</p>
                {candidate?.company && <p style={{ margin: 0, fontSize: 12, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif" }}>{candidate.company}</p>}
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 999, color: statusInfo.color, background: `${statusInfo.color}14`, fontFamily: "var(--font-inter), sans-serif" }}>{statusInfo.label}</span>
            </div>
            <div style={{ padding: "12px 16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <button onClick={() => copyUrl(bookingPageUrl, bl.id)} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#7C63C8", background: "#F8F6FF", border: "1px solid #E2DAF6", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontFamily: "var(--font-mono, monospace)", flex: 1, minWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {copied === bl.id ? "Copié !" : bookingPageUrl.replace("https://", "")}
              </button>
              <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                {STATUS_FLOW[bl.status].map((nextStatus) => (
                  <button key={nextStatus} onClick={() => handleStatus(bl.id, nextStatus)} disabled={updating === bl.id} style={{ fontSize: 11, fontWeight: 600, padding: "6px 12px", borderRadius: 8, border: `1px solid ${BOOKING_STATUS_META[nextStatus].color}30`, background: `${BOOKING_STATUS_META[nextStatus].color}10`, color: BOOKING_STATUS_META[nextStatus].color, cursor: updating === bl.id ? "not-allowed" : "pointer", fontFamily: "var(--font-inter), sans-serif" }}>
                    {updating === bl.id ? "…" : `→ ${BOOKING_STATUS_META[nextStatus].label}`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Shared utilities ─────────────────────────────────────────── */

function WaitingState({ label }: { label: string }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 0" }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: "#F8F6FF", border: "1px solid #E2DAF6",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 12px",
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#E2DAF6" strokeWidth="2"/>
          <path d="M12 7v5l3 3" stroke="#7C63C8" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>{label}</p>
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
