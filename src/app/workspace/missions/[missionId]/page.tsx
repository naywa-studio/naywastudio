"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { m } from "framer-motion"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { getSupabase } from "@/lib/supabase"
import { AGENT_LEVELS } from "@/lib/mock-store"
import { useWorkspace } from "../../layout"
import MissionRunPanel from "@/components/workspace/MissionRunPanel"
import { Spinner, EASE } from "@/components/workspace/WorkspaceCentralChat"
import { SOURCE_META } from "@/lib/candidate-meta"
import type { Database, ScoreDimensions, MissionBrief } from "@/lib/database.types"

type Mission   = Database["public"]["Tables"]["missions"]["Row"]
type Candidate = Database["public"]["Tables"]["candidates"]["Row"]
type BookingLink = Database["public"]["Tables"]["booking_links"]["Row"]

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nawastudio.com"
const fu = (d: number) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: d, ease: EASE } })

/* ── Status helpers ──────────────────────────────────────────── */

const STATUS_META: Record<Mission["status"], { label: string; color: string; bg: string }> = {
  preparation: { label: "Préparation", color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
  in_progress: { label: "En cours",    color: "#22c55e", bg: "rgba(34,197,94,0.08)"  },
  completed:   { label: "Terminée",    color: "#6B7280", bg: "rgba(107,114,128,0.08)"},
  error:       { label: "Erreur",      color: "#EF4444", bg: "rgba(239,68,68,0.08)"  },
}

const BOOKING_STATUS_META: Record<BookingLink["status"], { label: string; color: string }> = {
  pending:  { label: "En attente", color: "#F59E0B" },
  reserved: { label: "Réservé",    color: "#3b82f6" },
  done:     { label: "Effectué",   color: "#22c55e" },
}

type LeoTab = "results" | "scoring" | "messages" | "pipeline" | "calendar"

function getLeoSections(level: number): LeoTab[] {
  if (level >= 3) return ["results", "scoring", "messages", "pipeline", "calendar"]
  if (level >= 2) return ["results", "scoring", "messages"]
  return ["results"]
}

const LEO_TAB_META: Record<LeoTab, { label: string }> = {
  results:  { label: "Résultats" },
  scoring:  { label: "Scoring"   },
  messages: { label: "Messages"  },
  pipeline: { label: "Pipeline"  },
  calendar: { label: "Booking"   },
}

function buildBookingPageUrl(token: string) { return `${SITE_URL}/booking/${token}` }
function buildMessageTemplate(name: string | null, title: string, recruiter: string | null, url: string) {
  return `Bonjour ${name ?? "vous"},\n\nJe suis ${recruiter ?? "notre équipe"} et je recrute actuellement pour le poste de ${title}.\n\nVotre profil m'a particulièrement intéressé(e). Seriez-vous disponible pour un échange de 30 minutes ?\n\n→ Choisissez directement votre créneau : ${url}\n\nCordialement,\n${recruiter ?? "notre équipe"}`
}

/* ════════════════════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════════════════════ */

/* ── Mission empty state — no candidates yet ──────────────────────────── */

function MissionEmptyState({
  missionId, brief, agentColor, onLaunch,
}: {
  missionId: string
  brief: MissionBrief | null
  agentColor: string
  onLaunch: () => void
}) {
  const router    = useRouter()
  const [launching, setLaunching] = useState(false)

  const handleLaunch = () => {
    setLaunching(true)
    onLaunch()   // MissionRunPanel handles the actual /run call — no double-fetch
  }

  // No brief configured yet
  if (!brief?.titre_poste) {
    return (
      <m.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "48px 24px", textAlign: "center",
        }}
      >
        <div style={{
          width: 44, height: 44, borderRadius: 12, background: agentColor + "15",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 20,
        }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M2 6C2 4.9 2.9 4 4 4h4l2 2h6c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6z"
              stroke={agentColor} strokeWidth="1.6" fill="none" strokeLinejoin="round"/>
          </svg>
        </div>
        <p style={{
          margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "#111827",
          fontFamily: "var(--font-space-grotesk), sans-serif",
        }}>
          Aucun brief défini
        </p>
        <p style={{
          margin: "0 0 24px", fontSize: 13, color: "#6B7280", lineHeight: 1.6,
          maxWidth: 320, fontFamily: "var(--font-inter), sans-serif",
        }}>
          Décrivez votre besoin dans le chat pour que l'agent configure automatiquement cette mission.
        </p>
        <button
          onClick={() => router.push(`/workspace?mission=${missionId}`)}
          style={{
            padding: "10px 22px", borderRadius: 10, border: "none",
            background: agentColor, color: "white",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
            fontFamily: "var(--font-inter), sans-serif",
            display: "flex", alignItems: "center", gap: 7,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
            <path d="M10 2C5.58 2 2 5.58 2 10s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm1 13H9v-6h2v6zm0-8H9V5h2v2z"
              fill="currentColor"/>
          </svg>
          Configurer dans le chat
        </button>
      </m.div>
    )
  }

  // Brief defined — show summary + direct launch
  return (
    <m.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "40px 24px",
      }}
    >
      <div style={{
        background: "white", borderRadius: 16,
        border: "1.5px solid #E2DAF6",
        padding: "24px", maxWidth: 460, width: "100%",
        boxShadow: "0 2px 16px rgba(124,99,200,0.07)",
      }}>
        <p style={{
          margin: "0 0 16px", fontSize: 13, fontWeight: 700, color: "#6B7280",
          textTransform: "uppercase", letterSpacing: "0.07em",
          fontFamily: "var(--font-inter), sans-serif",
        }}>
          Brief configuré
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          <div>
            <p style={{ margin: "0 0 2px", fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-inter), sans-serif" }}>Poste</p>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#111827", fontFamily: "var(--font-space-grotesk), sans-serif" }}>{brief.titre_poste}</p>
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            {brief.localisation && (
              <div>
                <p style={{ margin: "0 0 2px", fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-inter), sans-serif" }}>Localisation</p>
                <p style={{ margin: 0, fontSize: 13, color: "#374151", fontFamily: "var(--font-inter), sans-serif" }}>{brief.localisation}</p>
              </div>
            )}
            {brief.criteres && (
              <div>
                <p style={{ margin: "0 0 2px", fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-inter), sans-serif" }}>Critères</p>
                <p style={{ margin: 0, fontSize: 13, color: "#374151", fontFamily: "var(--font-inter), sans-serif" }}>{brief.criteres}</p>
              </div>
            )}
          </div>
          {brief.mots_cles?.length > 0 && (
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-inter), sans-serif" }}>Mots-clés</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {brief.mots_cles.map((kw) => (
                  <span key={kw} style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 6,
                    background: agentColor + "15", color: agentColor,
                    fontWeight: 600, fontFamily: "var(--font-inter), sans-serif",
                  }}>{kw}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleLaunch}
            disabled={launching}
            style={{
              flex: 1, padding: "11px 0", borderRadius: 10, border: "none",
              background: launching ? "#D1D5DB" : agentColor,
              color: "white", fontSize: 13, fontWeight: 700,
              cursor: launching ? "not-allowed" : "pointer",
              fontFamily: "var(--font-inter), sans-serif",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              transition: "background 150ms",
            }}
          >
            {launching ? (
              <><Spinner size={14} color="rgba(255,255,255,0.7)" /> Lancement…</>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                  <path d="M6 4l10 6-10 6V4z" fill="currentColor"/>
                </svg>
                Lancer la recherche
              </>
            )}
          </button>
          <button
            onClick={() => router.push(`/workspace?mission=${missionId}`)}
            style={{
              padding: "11px 16px", borderRadius: 10,
              border: "1.5px solid #E2DAF6", background: "white",
              color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer",
              fontFamily: "var(--font-inter), sans-serif",
              transition: "border-color 150ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = agentColor }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E2DAF6" }}
          >
            Modifier
          </button>
        </div>
      </div>
    </m.div>
  )
}

export default function MissionDetailPage() {
  const params     = useParams()
  const missionId  = params.missionId as string
  const { agentLevel, profile } = useWorkspace()
  const agent = AGENT_LEVELS[agentLevel] ?? AGENT_LEVELS[1]

  const [mission,      setMission]      = useState<Mission | null>(null)
  const [candidates,   setCandidates]   = useState<Candidate[]>([])
  const [bookingLinks, setBookingLinks] = useState<BookingLink[]>([])
  const [loading,      setLoading]      = useState(true)
  const [leoTab,       setLeoTab]       = useState<LeoTab>("results")

  const [isRunning,    setIsRunning]    = useState(false)
  const [runResumed,   setRunResumed]   = useState(false)  // true when restoring in_progress from DB
  const [excelB64,     setExcelB64]     = useState<string | null>(null)
  const [reDownloading, setReDownloading] = useState(false)

  const fetchData = useCallback(async (isFirstLoad = false) => {
    const sb = getSupabase()
    const [{ data: m }, { data: c }, { data: bl }] = await Promise.all([
      sb.from("missions").select("*").eq("id", missionId).single(),
      sb.from("candidates").select("*").eq("mission_id", missionId).order("relevance_score", { ascending: false }),
      sb.from("booking_links").select("*").eq("mission_id", missionId),
    ])
    setMission(m)
    setCandidates(c ?? [])
    setBookingLinks(bl ?? [])
    // Restore running state if mission is still in_progress on page load
    if (isFirstLoad && m?.status === "in_progress") {
      setIsRunning(true)
      setRunResumed(true)
    }
    setLoading(false)
  }, [missionId])

  useEffect(() => { fetchData(true) }, [fetchData])

  /* ── Realtime : profils insérés par le worker extension ──── */
  useEffect(() => {
    const sb = getSupabase()

    const channel = sb
      .channel(`mission-${missionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "candidates", filter: `mission_id=eq.${missionId}` },
        (payload) => {
          const c = payload.new as Candidate
          setCandidates(prev => {
            if (prev.some(x => x.id === c.id)) return prev
            return [...prev, c].sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
          })
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "candidates", filter: `mission_id=eq.${missionId}` },
        (payload) => {
          const c = payload.new as Candidate
          setCandidates(prev => prev.map(x => x.id === c.id ? c : x))
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "missions", filter: `id=eq.${missionId}` },
        (payload) => {
          const m = payload.new as Mission
          setMission(m)
          if (m.status === "completed") {
            setIsRunning(false)
            setRunResumed(false)
            const eb = (m.brief as { __excel_b64?: string } | null)?.__excel_b64
            if (eb) setExcelB64(eb)
          } else if (m.status === "error") {
            setIsRunning(false)
            setRunResumed(false)
          } else if (m.status === "in_progress") {
            setIsRunning(true)
          }
        }
      )
      .subscribe()

    return () => { sb.removeChannel(channel) }
  }, [missionId])

  /* ── Run completed ───────────────────────────────────────── */
  const handleRunCompleted = (b64: string, count: number, researchReport?: string) => {
    setExcelB64(b64)
    setIsRunning(false)
    setRunResumed(false)
    setMission(prev => !prev ? prev : { ...prev, status: "completed", profiles_count: count, research_report: researchReport ?? prev.research_report ?? null })
    fetchData()
  }

  /* ── Excel ───────────────────────────────────────────────── */
  const downloadExcel = (b64?: string) => {
    const data = b64 ?? excelB64
    if (!data || !mission) return
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0))
    const blob  = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    const url   = URL.createObjectURL(blob)
    const a     = document.createElement("a"); a.href = url
    a.download  = `${mission.title.replace(/\s+/g, "_")}_${agentLevel >= 2 ? "nora" : "leo"}.xlsx`
    a.click(); URL.revokeObjectURL(url)
  }
  const reDownload = async () => {
    setReDownloading(true)
    try {
      const res  = await fetch(`/api/missions/${missionId}/download`, { method: "POST" })
      const data = await res.json() as { ok?: boolean; excel_b64?: string }
      if (data.ok && data.excel_b64) downloadExcel(data.excel_b64)
    } finally { setReDownloading(false) }
  }

  /* ── Candidate actions ───────────────────────────────────── */
  const handleContact = async (candidateId: string) => {
    const prev = candidates.find(c => c.id === candidateId)?.contacted_at ?? null
    const next = prev ? null : new Date().toISOString()
    setCandidates(cs => cs.map(c => c.id === candidateId ? { ...c, contacted_at: next } : c))
    try { await fetch(`/api/candidates/${candidateId}/contact`, { method: "PATCH" }) }
    catch { setCandidates(cs => cs.map(c => c.id === candidateId ? { ...c, contacted_at: prev } : c)) }
  }

  const handleDecision = async (id: string, decision: "validated" | "rejected", msgDraft?: string) => {
    if (decision === "validated") {
      setCandidates(cs => cs.map(c => c.id === id ? { ...c, status: "shortlisted" as const, message_draft: msgDraft ?? c.message_draft } : c))
    } else {
      setCandidates(cs => cs.map(c => c.id === id ? { ...c, status: "rejected" as const } : c))
      try { await getSupabase().from("candidates").update({ status: "rejected" }).eq("id", id) } catch { /* ignore */ }
    }
  }

  const handleNoteChange = useCallback((id: string, text: string) => {
    setCandidates(cs => cs.map(c => c.id === id ? { ...c, notes: text } : c))
  }, [])

  const handleConsult = async (candidateId: string) => {
    setCandidates(cs => cs.map(c => c.id === candidateId ? { ...c, consulted_at: new Date().toISOString() } : c))
    try { await fetch(`/api/candidates/${candidateId}/consult`, { method: "PATCH" }) }
    catch { setCandidates(cs => cs.map(c => c.id === candidateId ? { ...c, consulted_at: null } : c)) }
  }

  /* ── Booking ─────────────────────────────────────────────── */
  const generateBookingLink = async (candidate: Candidate) => {
    const sb = getSupabase()
    const { data: link } = await sb.from("booking_links").insert({ candidate_id: candidate.id, mission_id: missionId }).select().single()
    if (!link) return
    setBookingLinks(prev => [...prev, link])
    const url  = buildBookingPageUrl(link.token)
    const msg  = buildMessageTemplate(candidate.name_estimated, mission?.title ?? "", profile?.first_name ?? null, url)
    await sb.from("candidates").update({ message_draft: msg }).eq("id", candidate.id)
    setCandidates(cs => cs.map(c => c.id === candidate.id ? { ...c, message_draft: msg } : c))
  }
  const updateBookingStatus = async (linkId: string, status: BookingLink["status"]) => {
    await getSupabase().from("booking_links").update({ status }).eq("id", linkId)
    setBookingLinks(prev => prev.map(bl => bl.id === linkId ? { ...bl, status } : bl))
  }

  /* ── Render ──────────────────────────────────────────────── */
  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}><Spinner /></div>
  if (!mission) return (
    <div style={{ textAlign: "center", padding: "80px 24px" }}>
      <p style={{ color: "#6B7280", fontFamily: "var(--font-inter), sans-serif" }}>Mission introuvable.</p>
      <Link href="/workspace" style={{ color: "#7C63C8", fontFamily: "var(--font-inter), sans-serif" }}>← Retour</Link>
    </div>
  )

  const statusMeta  = STATUS_META[mission.status]
  const missionDate = new Date(mission.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 60px)", overflow: "hidden" }}>

        {/* Top bar */}
        <div style={{
          flexShrink: 0,
          padding: "12px 20px",
          borderBottom: "1.5px solid #F0ECF8",
          background: "white",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <Link href="/workspace" style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "5px 11px", borderRadius: 8,
              border: "1.5px solid #E2DAF6", background: "white",
              color: "#7C63C8", fontSize: 12, fontWeight: 600,
              textDecoration: "none", flexShrink: 0,
              fontFamily: "var(--font-inter), sans-serif",
            }}>
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                <path d="M15 10H5M9 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Workspace
            </Link>
            <div style={{ width: 1, height: 16, background: "#E5E7EB", flexShrink: 0 }} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
              <div style={{ width: 3, height: 16, borderRadius: 2, background: agent.color, flexShrink: 0 }} />
              <p style={{
                margin: 0, fontSize: 13, fontWeight: 700, color: "#111827",
                fontFamily: "var(--font-space-grotesk), sans-serif",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {mission.title}
              </p>
              <span style={{ fontSize: 11, color: "#9CA3AF", flexShrink: 0, fontFamily: "var(--font-inter), sans-serif" }}>
                · {missionDate}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {mission.status === "error" && !isRunning && (
              <button
                onClick={async () => {
                  setIsRunning(true)
                  setRunResumed(false)
                  setMission(prev => prev ? { ...prev, status: "in_progress" } : prev)
                  try {
                    const r = await fetch(`/api/missions/${missionId}/launch-extension`, { method: "POST" })
                    const d = await r.json() as { ok?: boolean; error?: string }
                    if (!d.ok) {
                      setIsRunning(false)
                      setMission(prev => prev ? { ...prev, status: "error" } : prev)
                    }
                  }
                  catch { setIsRunning(false); setMission(prev => prev ? { ...prev, status: "error" } : prev) }
                }}
                style={{
                  padding: "5px 12px", borderRadius: 8,
                  border: "1.5px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)",
                  color: "#EF4444", fontSize: 11, fontWeight: 600,
                  cursor: "pointer", fontFamily: "var(--font-inter), sans-serif",
                  display: "inline-flex", alignItems: "center", gap: 5,
                  transition: "background 150ms",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.12)" }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,0.06)" }}
              >
                <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
                  <path d="M4 10a6 6 0 1 1 1.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  <path d="M4 14V10h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Relancer
              </button>
            )}
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "3px 9px",
              borderRadius: 999, color: statusMeta.color, background: statusMeta.bg,
              fontFamily: "var(--font-inter), sans-serif",
            }}>
              {statusMeta.label}
            </span>
          </div>
        </div>

        {/* Error banner: surface mission.brief.__error if status=error */}
        {mission.status === "error" && !isRunning && (() => {
          const err = (mission.brief as { __error?: string } | null)?.__error
          if (!err) return null
          // Detect URL inside the error text and turn it into a link
          const urlMatch = err.match(/(https?:\/\/[^\s]+)/)
          const before   = urlMatch ? err.slice(0, urlMatch.index) : err
          const url      = urlMatch?.[1]
          const after    = urlMatch ? err.slice((urlMatch.index ?? 0) + (urlMatch[1] ?? "").length) : ""
          return (
            <div style={{
              margin: "0 20px 16px", padding: "12px 16px",
              borderRadius: 12, background: "rgba(239,68,68,0.06)",
              border: "1px solid rgba(239,68,68,0.20)",
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 13, color: "#7F1D1D", lineHeight: 1.5,
              display: "flex", alignItems: "flex-start", gap: 10,
            }}>
              <span style={{ fontSize: 16, lineHeight: 1, marginTop: 1 }}>⚠️</span>
              <span style={{ flex: 1 }}>
                {before}
                {url && (
                  <a href={url} target="_blank" rel="noreferrer"
                     style={{ color: "#B91C1C", textDecoration: "underline", fontWeight: 600 }}>
                    {url}
                  </a>
                )}
                {after}
              </span>
            </div>
          )
        })()}

        {/* Scrollable content */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

          {isRunning && (
            <div style={{ padding: "20px" }}>
              <MissionRunPanel
                missionId={missionId}
                agentColor={agent.color}
                agentName={agent.agent}
                skipLaunch={runResumed}
                onCompleted={handleRunCompleted}
                onError={() => { setIsRunning(false); setRunResumed(false); setMission(prev => prev ? { ...prev, status: "error" } : prev) }}
              />
            </div>
          )}

          {!isRunning && candidates.length === 0 && (
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <MissionEmptyState
                missionId={missionId}
                brief={(mission.brief as MissionBrief | null) ?? null}
                agentColor={agent.color}
                onLaunch={() => {
                  setIsRunning(true)
                  setRunResumed(false)
                }}
              />
            </div>
          )}

          {!isRunning && candidates.length > 0 && (
            agentLevel >= 2
              ? <NoraSections
                  mission={mission}
                  candidates={candidates}
                  missionId={missionId}
                  agentColor={agent.color}
                  agentLevel={agentLevel}
                  excelB64={excelB64}
                  reDownloading={reDownloading}
                  onDownload={() => mission.status === "completed" && !excelB64 ? reDownload() : downloadExcel()}
                  onDecision={handleDecision}
                  onContact={handleContact}
                  onNoteChange={handleNoteChange}
                />
              : <LeoSections
                  candidates={candidates}
                  bookingLinks={bookingLinks}
                  agentLevel={agentLevel}
                  agent={agent}
                  profile={profile}
                  activeTab={leoTab}
                  onTabChange={setLeoTab}
                  onConsult={handleConsult}
                  onGenerateLink={generateBookingLink}
                  onUpdateBookingStatus={updateBookingStatus}
                />
          )}
        </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════
   NORA SECTIONS  — bandeau stats + tabs horizontales
   ════════════════════════════════════════════════════════════════ */

type NoraTab = "fiches" | "tableur" | "contact" | "pipeline" | "relances"

interface ScoringWeights { competences: number; seniorite: number; localisation: number; qualite: number }

const DEFAULT_WEIGHTS: ScoringWeights = { competences: 40, seniorite: 25, localisation: 20, qualite: 15 }

const DIM_META = {
  competences:  { label: "Compétences", color: "#7C63C8" },
  seniorite:    { label: "Séniorité",   color: "#0EA5E9" },
  localisation: { label: "Localisation",color: "#10B981" },
  qualite:      { label: "Qualité",     color: "#F59E0B" },
} as const

function getAdjustedScore(c: Candidate, w: ScoringWeights): number {
  const d = c.score_dimensions as ScoreDimensions | null
  if (!d) return c.relevance_score ?? 0
  const total = w.competences + w.seniorite + w.localisation + w.qualite
  if (total === 0) return c.relevance_score ?? 0
  return Math.round((d.competences * w.competences + d.seniorite * w.seniorite + d.localisation * w.localisation + d.qualite * w.qualite) / total)
}

function NoraSections({
  mission, candidates, missionId, agentColor, agentLevel, excelB64, reDownloading,
  onDownload, onDecision, onContact, onNoteChange,
}: {
  mission: Mission
  candidates: Candidate[]
  missionId: string
  agentColor: string
  agentLevel: number
  excelB64: string | null
  reDownloading: boolean
  onDownload: () => void
  onDecision: (id: string, decision: "validated" | "rejected", msgDraft?: string) => void
  onContact: (id: string) => void
  onNoteChange: (id: string, text: string) => void
}) {
  const router         = useRouter()
  const [activeTab,    setActiveTab]    = useState<NoraTab>("tableur")
  const [weights,      setWeights]      = useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [showWeights,  setShowWeights]  = useState(false)
  const [threshold,    setThreshold]    = useState(7)
  const [showOthers,   setShowOthers]   = useState(false)
  const [showReport,   setShowReport]   = useState(false)

  /* ── Computed ──────────────────────────────────────────── */
  const scored    = candidates.filter(c => c.relevance_score != null)
  // Only show Top % count when we actually have scored candidates
  const shortlistN = scored.length > 0 ? Math.max(3, Math.ceil(scored.length * threshold / 100)) : 0

  const sorted = [...scored].sort((a, b) => getAdjustedScore(b, weights) - getAdjustedScore(a, weights))
  const topN   = sorted.slice(0, shortlistN)
  const others = sorted.slice(shortlistN).filter(c => c.status !== "rejected")

  const validated  = candidates.filter(c => c.status === "shortlisted")
  const rejected   = candidates.filter(c => c.status === "rejected")
  const contacted  = validated.filter(c => c.contacted_at)
  const noMsg      = validated.filter(c => !c.message_draft)

  /* ── Export CSV ─────────────────────────────────────────── */
  const exportCSV = () => {
    const rows = validated.map(c => ({
      Nom:       c.name_estimated ?? "",
      Titre:     c.title_estimated ?? "",
      Entreprise:c.company ?? "",
      Source:    c.source ?? "",
      Score:     String(c.relevance_score ?? ""),
      Séniorité: c.seniority_level ?? "",
      Message:   (c.message_draft ?? "").replace(/\n/g, " "),
      Contacté:  c.contacted_at ? "Oui" : "Non",
      Notes:     (c.notes ?? "").replace(/\n/g, " "),
    }))
    if (rows.length === 0) return
    const header = Object.keys(rows[0]).join(";")
    const body   = rows.map(r => Object.values(r).map(v => `"${v.replace(/"/g, '""')}"`).join(";")).join("\n")
    const blob   = new Blob(["\uFEFF" + header + "\n" + body], { type: "text/csv;charset=utf-8;" })
    const url    = URL.createObjectURL(blob)
    const a      = document.createElement("a"); a.href = url
    a.download   = `shortlist_${mission.title.replace(/\s+/g, "_")}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── STATS BANDEAU ────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        padding: "10px 20px",
        borderBottom: "1.5px solid #F0ECF8",
        background: "#FDFCFF",
        display: "flex", alignItems: "center", gap: 0,
        overflowX: "auto",
      }}>
        {[
          { value: candidates.length, label: "Profils",   color: "#111827" },
          { value: shortlistN,         label: `Top ${threshold}%`, color: agentColor },
          { value: validated.length,   label: "Validés",  color: "#16a34a" },
          { value: rejected.length,    label: "Refusés",  color: "#EF4444", hide: rejected.length === 0 },
          { value: contacted.length,   label: "Contactés",color: "#0EA5E9" },
        ].filter(s => !s.hide).map((s, i, arr) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ padding: "0 18px", textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: s.color, fontFamily: "var(--font-space-grotesk), sans-serif", lineHeight: 1 }}>{s.value}</p>
              <p style={{ margin: "2px 0 0", fontSize: 10, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif", whiteSpace: "nowrap" }}>{s.label}</p>
            </div>
            {i < arr.length - 1 && <div style={{ width: 1, height: 28, background: "#E5E7EB", flexShrink: 0 }} />}
          </div>
        ))}

        <div style={{ marginLeft: "auto", display: "flex", gap: 6, paddingLeft: 16, flexShrink: 0 }}>
          {/* Research report — inline expandable panel */}
          {mission.research_report && (
            <button
              onClick={() => setShowReport(p => !p)}
              style={{
                padding: "5px 11px", borderRadius: 8,
                border: `1.5px solid ${showReport ? agentColor + "60" : agentColor + "30"}`,
                background: showReport ? `${agentColor}12` : `${agentColor}08`,
                color: agentColor, fontSize: 11, fontWeight: 600,
                cursor: "pointer", fontFamily: "var(--font-inter), sans-serif",
                display: "inline-flex", alignItems: "center", gap: 5,
                transition: "background 150ms, border-color 150ms",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M10 9v5M10 7h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              Analyse
              <svg width="10" height="10" viewBox="0 0 20 20" fill="none"
                style={{ transform: showReport ? "rotate(180deg)" : "rotate(0)", transition: "transform 180ms" }}>
                <path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
          {/* Export CSV */}
          {validated.length > 0 && (
            <button onClick={exportCSV} style={{
              padding: "5px 11px", borderRadius: 8,
              border: "1.5px solid #BBF7D0", background: "rgba(22,163,74,0.06)",
              color: "#16a34a", fontSize: 11, fontWeight: 600,
              cursor: "pointer", fontFamily: "var(--font-inter), sans-serif",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}>
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                <path d="M10 3v10M6 9l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              Export CSV
            </button>
          )}
          {/* Excel */}
          <button onClick={onDownload} disabled={reDownloading || (!excelB64 && mission.status !== "completed")}
            style={{
              padding: "5px 11px", borderRadius: 8,
              border: "1.5px solid #E2DAF6", background: "white",
              color: "#7C63C8", fontSize: 11, fontWeight: 600,
              cursor: (!excelB64 && mission.status !== "completed") ? "not-allowed" : "pointer",
              opacity: (!excelB64 && mission.status !== "completed") ? 0.45 : 1,
              fontFamily: "var(--font-inter), sans-serif",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}>
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
              <path d="M10 3v10M6 9l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            {reDownloading ? "…" : "Excel"}
          </button>
        </div>
      </div>

      {/* ── ANALYSE PANEL (collapsible) ──────────────────────── */}
      {showReport && mission.research_report && (
        <div style={{
          flexShrink: 0,
          padding: "12px 20px",
          borderBottom: "1.5px solid #F0ECF8",
          background: `${agentColor}06`,
          display: "flex", gap: 10,
        }}>
          <div style={{ flexShrink: 0, marginTop: 1 }}>
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="8" stroke={agentColor} strokeWidth="1.8"/>
              <path d="M10 9v5M10 7h.01" stroke={agentColor} strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <p style={{
            margin: 0, fontSize: 12, color: "#374151", lineHeight: 1.65,
            fontFamily: "var(--font-inter), sans-serif",
            whiteSpace: "pre-wrap",
          }}>
            {mission.research_report}
          </p>
        </div>
      )}

      {/* ── HORIZONTAL TABS STRIP ────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: "0 20px", borderBottom: "1.5px solid #F0ECF8", background: "white", display: "flex", alignItems: "center", gap: 0, overflowX: "auto" }}>
        {(["fiches", "tableur", "contact", ...(agentLevel >= 3 ? ["pipeline", "relances"] as NoraTab[] : [])] as NoraTab[]).map(tab => {
          const candidatesWithStage = candidates.filter(c => c.pipeline_stage != null)
          const relancesCount = validated.filter(c => c.contacted_at && !c.pipeline_stage?.match(/replied|interview|offer/)).length
          const labels: Record<NoraTab, string> = {
            fiches:   "Fiches candidats",
            tableur:  "Tableur",
            contact:  "Contact",
            pipeline: "Pipeline",
            relances: "Relances",
          }
          const counts: Partial<Record<NoraTab, string | number>> = {
            fiches:   topN.length,
            tableur:  candidates.length,
            contact:  `${contacted.length}/${validated.length}`,
            pipeline: candidatesWithStage.length,
            relances: relancesCount,
          }
          const active = activeTab === tab
          return (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: "10px 16px", background: "none", border: "none",
              borderBottom: active ? `2px solid ${agentColor}` : "2px solid transparent",
              color: active ? agentColor : "#6B7280",
              fontSize: 13, fontWeight: active ? 700 : 500,
              cursor: "pointer", fontFamily: "var(--font-inter), sans-serif",
              display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
            }}>
              {labels[tab]}
              <span style={{
                fontSize: 10, fontWeight: 700,
                padding: "1px 6px", borderRadius: 999,
                background: active ? `${agentColor}18` : (tab === "relances" && Number(counts[tab] ?? 0) > 0 ? "rgba(239,68,68,0.12)" : "#F0ECF8"),
                color: active ? agentColor : (tab === "relances" && Number(counts[tab] ?? 0) > 0 ? "#EF4444" : "#9CA3AF"),
              }}>
                {counts[tab] ?? ""}
              </span>
            </button>
          )
        })}

        {/* Push "Chercher plus" and scoring weights to the right */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, padding: "8px 0", alignItems: "center", flexShrink: 0 }}>
          {/* Scoring weights */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowWeights(p => !p)} style={{
              padding: "5px 11px", borderRadius: 8,
              border: `1.5px solid ${showWeights ? agentColor + "44" : "#E5E7EB"}`,
              background: showWeights ? `${agentColor}08` : "white",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              fontSize: 11, fontWeight: 600, color: showWeights ? agentColor : "#6B7280",
              fontFamily: "var(--font-inter), sans-serif",
            }}>
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                <circle cx="6" cy="10" r="2" stroke="currentColor" strokeWidth="1.6"/>
                <circle cx="14" cy="6" r="2" stroke="currentColor" strokeWidth="1.6"/>
                <circle cx="14" cy="14" r="2" stroke="currentColor" strokeWidth="1.6"/>
                <path d="M8 10h9M3 10H4M16 6H3M16 14H3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              Pondération
            </button>
            {showWeights && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 30,
                background: "white", borderRadius: 10, border: "1.5px solid #E2DAF6",
                boxShadow: "0 4px 20px rgba(0,0,0,0.10)", padding: "12px 14px",
                minWidth: 200, display: "flex", flexDirection: "column", gap: 8,
              }}>
                {(Object.keys(DEFAULT_WEIGHTS) as Array<keyof ScoringWeights>).map(dim => (
                  <div key={dim}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                      <span style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>{DIM_META[dim].label}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: DIM_META[dim].color, fontFamily: "var(--font-inter), sans-serif" }}>{weights[dim]}</span>
                    </div>
                    <input type="range" min={0} max={60} step={5} value={weights[dim]}
                      onChange={e => setWeights(w => ({ ...w, [dim]: Number(e.target.value) }))}
                      style={{ width: "100%", accentColor: DIM_META[dim].color, height: 3 }}
                    />
                  </div>
                ))}
                <button onClick={() => setWeights(DEFAULT_WEIGHTS)} style={{
                  fontSize: 10, color: "#9CA3AF", background: "none", border: "none",
                  cursor: "pointer", textAlign: "center", padding: "2px 0",
                  fontFamily: "var(--font-inter), sans-serif",
                }}>
                  Réinitialiser
                </button>
              </div>
            )}
          </div>
          {/* Chercher plus */}
          <button onClick={() => router.push(`/workspace?mission=${missionId}`)} style={{
            padding: "5px 11px", borderRadius: 8,
            border: `1.5px solid ${agentColor}30`,
            background: `${agentColor}08`,
            cursor: "pointer", fontSize: 11, fontWeight: 600,
            color: agentColor, fontFamily: "var(--font-inter), sans-serif",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M13.5 13.5l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              <path d="M9 6v6M6 9h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            Chercher plus
          </button>
        </div>
      </div>

      {/* ── CONTENT AREA — full width ─────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>

          {/* ── FICHES TAB ─────────────────────────────────── */}
          {activeTab === "fiches" && (
            <div>
              {/* Header row with threshold slider */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "var(--font-inter), sans-serif" }}>
                  Top {threshold}% · {topN.length} profil{topN.length !== 1 ? "s" : ""}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                  <span style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif", whiteSpace: "nowrap" }}>Sélection</span>
                  <input type="range" min={5} max={25} step={1} value={threshold}
                    onChange={e => setThreshold(Number(e.target.value))}
                    style={{ width: 80, accentColor: agentColor, height: 3 }}
                  />
                  <span style={{ fontSize: 10, color: agentColor, fontWeight: 700, fontFamily: "var(--font-inter), sans-serif", minWidth: 20 }}>{threshold}%</span>
                </div>
              </div>

              {/* Candidate cards */}
              {topN.length === 0 ? (
                <EmptySlate label="Aucun profil scoré dans la sélection." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {topN.map(c => (
                    <CandidateFiche key={c.id} candidate={c} weights={weights} agentColor={agentColor}
                      onDecision={onDecision} onNoteChange={onNoteChange}
                      onSimilar={() => {}}
                    />
                  ))}
                </div>
              )}

              {/* Others toggle */}
              {others.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <button onClick={() => setShowOthers(p => !p)} style={{
                    width: "100%", padding: "9px 14px", borderRadius: 10,
                    border: "1.5px solid #E5E7EB", background: "white",
                    cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#6B7280",
                    fontFamily: "var(--font-inter), sans-serif",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <span>Autres profils pertinents ({others.length})</span>
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="none"
                      style={{ transform: showOthers ? "rotate(180deg)" : "rotate(0)", transition: "transform 220ms" }}>
                      <path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  {showOthers && (
                    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                      {others.map(c => (
                        <CandidateFiche key={c.id} candidate={c} weights={weights} agentColor={agentColor}
                          dimmed onDecision={onDecision} onNoteChange={onNoteChange}
                          onSimilar={() => {}}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── TABLEUR TAB ───────────────────────────────── */}
          {activeTab === "tableur" && (
            <div>
              {/* Stats grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
                {[
                  { label: "Profils trouvés",  value: candidates.length,  color: "#111827" },
                  { label: `Top ${threshold}%`, value: shortlistN,         color: agentColor },
                  { label: "Validés",           value: validated.length,   color: "#16a34a" },
                  { label: "Refusés",           value: rejected.length,    color: "#EF4444" },
                  { label: "Contactés",         value: contacted.length,   color: "#0EA5E9" },
                  { label: "Sans message",      value: noMsg.length,       color: "#F59E0B" },
                ].map(s => (
                  <div key={s.label} style={{ background: "white", borderRadius: 12, border: "1.5px solid #F0ECF8", padding: "14px 16px" }}>
                    <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: s.color, fontFamily: "var(--font-space-grotesk), sans-serif", lineHeight: 1 }}>{s.value}</p>
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Source breakdown */}
              <div style={{ background: "white", borderRadius: 12, border: "1.5px solid #F0ECF8", padding: "14px 16px", marginBottom: 16 }}>
                <p style={{ margin: "0 0 10px", fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "var(--font-inter), sans-serif" }}>Sources</p>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {(["linkedin", "malt", "apec"] as const).map(src => {
                    const sm = SOURCE_META[src]
                    const n  = candidates.filter(c => (c.source ?? "linkedin") === src).length
                    if (!n) return null
                    return (
                      <div key={src} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ width: 22, height: 22, borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: sm.color, background: sm.bg, fontFamily: "var(--font-inter), sans-serif" }}>{sm.icon}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#111827", fontFamily: "var(--font-inter), sans-serif" }}>{n}</span>
                        <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>{src}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Download buttons */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
                <button onClick={onDownload} disabled={reDownloading || (!excelB64 && mission.status !== "completed")}
                  style={{
                    padding: "10px 18px", borderRadius: 10, border: "none",
                    background: (!excelB64 && mission.status !== "completed") ? "#F0ECF8" : "#7C63C8",
                    color: (!excelB64 && mission.status !== "completed") ? "#9CA3AF" : "white",
                    fontSize: 13, fontWeight: 700, cursor: "pointer",
                    fontFamily: "var(--font-inter), sans-serif",
                    display: "inline-flex", alignItems: "center", gap: 7,
                  }}>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                    <path d="M10 3v10M6 9l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                  {reDownloading ? "Chargement…" : "Télécharger Excel complet"}
                </button>
                {validated.length > 0 && (
                  <button onClick={exportCSV} style={{
                    padding: "10px 18px", borderRadius: 10,
                    border: "1.5px solid #BBF7D0", background: "rgba(22,163,74,0.06)",
                    color: "#16a34a", fontSize: 13, fontWeight: 700, cursor: "pointer",
                    fontFamily: "var(--font-inter), sans-serif",
                    display: "inline-flex", alignItems: "center", gap: 7,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                      <path d="M10 3v10M6 9l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                    Export shortlist CSV ({validated.length})
                  </button>
                )}
              </div>

              {/* Candidate list — same as Leo results */}
              <TableurCandidateList candidates={candidates} agentColor={agentColor} />
            </div>
          )}

          {/* ── CONTACT TAB ───────────────────────────────── */}
          {activeTab === "contact" && (
            <div>
              {validated.length === 0 ? (
                <EmptySlate label="Validez des candidats dans l'onglet Fiches pour les retrouver ici." />
              ) : (
                <div>
                  {/* Progress */}
                  <div style={{ background: "white", borderRadius: 12, border: "1.5px solid #BAE6FD", padding: "14px 16px", marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#0EA5E9", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
                        {contacted.length} / {validated.length} contacté{contacted.length !== 1 ? "s" : ""}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#0EA5E9", fontFamily: "var(--font-inter), sans-serif" }}>
                        {validated.length > 0 ? Math.round((contacted.length / validated.length) * 100) : 0}%
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: "#E0F2FE", overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 999, background: "#0EA5E9",
                        width: `${validated.length > 0 ? (contacted.length / validated.length) * 100 : 0}%`,
                        transition: "width 400ms ease",
                      }} />
                    </div>
                  </div>

                  {/* Contact list */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {validated.map(c => {
                      const sm         = SOURCE_META[(c.source ?? "linkedin") as keyof typeof SOURCE_META] ?? SOURCE_META.linkedin
                      const isContacted = Boolean(c.contacted_at)
                      return (
                        <div key={c.id} style={{
                          borderRadius: 11, border: `1.5px solid ${isContacted ? "#BAE6FD" : "#F0ECF8"}`,
                          background: isContacted ? "#F0F9FF" : "white",
                          overflow: "hidden", transition: "all 180ms",
                        }}>
                          {/* Header */}
                          <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                            <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: sm.color, background: sm.bg, fontFamily: "var(--font-inter), sans-serif" }}>{sm.icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#111827", fontFamily: "var(--font-inter), sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {c.name_estimated ?? "Candidat"}
                                {c.company && <span style={{ fontWeight: 400, color: "#6B7280" }}> · {c.company}</span>}
                              </p>
                              {c.title_estimated && <p style={{ margin: 0, fontSize: 11, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title_estimated}</p>}
                            </div>
                            {c.linkedin_url && (
                              <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
                                style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 7, textDecoration: "none", color: sm.color, background: sm.bg, fontFamily: "var(--font-inter), sans-serif" }}>
                                Profil
                              </a>
                            )}
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
                              <input type="checkbox" checked={isContacted} onChange={() => onContact(c.id)} style={{ width: 13, height: 13, accentColor: "#0EA5E9", cursor: "pointer" }} />
                              Contacté
                            </label>
                          </div>

                          {/* Message preview */}
                          {c.message_draft && (
                            <div style={{ borderTop: "1px solid #E0F2FE", padding: "8px 14px" }}>
                              <p style={{ margin: 0, fontSize: 11, color: "#374151", lineHeight: 1.65, fontFamily: "var(--font-inter), sans-serif", whiteSpace: "pre-wrap",
                                display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                                {c.message_draft}
                              </p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PIPELINE TAB (Alex N3) ─────────────────────── */}
          {activeTab === "pipeline" && agentLevel >= 3 && (
            <AlexPipelineSection
              candidates={candidates}
              missionId={missionId}
              agentColor={agentColor}
            />
          )}

          {/* ── RELANCES TAB (Alex N3) ─────────────────────── */}
          {activeTab === "relances" && agentLevel >= 3 && (
            <RelancesSection
              candidates={validated}
              missionId={missionId}
              mission={mission}
              agentColor={agentColor}
            />
          )}

        </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════
   PIPELINE SECTION (Alex N3)
   ════════════════════════════════════════════════════════════════ */

type PipelineStage = "identified" | "contacted" | "replied" | "interview" | "offer"

const STAGE_META: Record<PipelineStage, { label: string; color: string; bg: string }> = {
  identified: { label: "Identifié",  color: "#7C63C8", bg: "rgba(124,99,200,0.07)" },
  contacted:  { label: "Contacté",   color: "#0EA5E9", bg: "rgba(14,165,233,0.07)" },
  replied:    { label: "Répondu",    color: "#F59E0B", bg: "rgba(245,158,11,0.07)" },
  interview:  { label: "Entretien",  color: "#10B981", bg: "rgba(16,185,129,0.07)" },
  offer:      { label: "Offre",      color: "#EF4444", bg: "rgba(239,68,68,0.07)"  },
}
const STAGE_ORDER: PipelineStage[] = ["identified", "contacted", "replied", "interview", "offer"]

function AlexPipelineSection({
  candidates, missionId, agentColor,
}: {
  candidates: Candidate[]
  missionId: string
  agentColor: string
}) {
  const [localCandidates, setLocalCandidates] = useState<Candidate[]>(candidates)
  const [movingId, setMovingId] = useState<string | null>(null)

  // sync when parent candidates change
  useEffect(() => { setLocalCandidates(candidates) }, [candidates])

  const shortlisted = localCandidates.filter(c => c.status === "shortlisted")

  // Auto-assign stage to shortlisted without one
  const withStage = shortlisted.map(c => ({
    ...c,
    pipeline_stage: c.pipeline_stage ?? (c.contacted_at ? "contacted" : "identified") as PipelineStage,
  }))

  const byStage = STAGE_ORDER.reduce<Record<PipelineStage, typeof withStage>>(
    (acc, s) => ({ ...acc, [s]: withStage.filter(c => c.pipeline_stage === s) }),
    {} as Record<PipelineStage, typeof withStage>
  )

  const moveToStage = async (candidateId: string, stage: PipelineStage) => {
    setMovingId(candidateId)
    setLocalCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, pipeline_stage: stage } : c))
    try {
      await fetch(`/api/candidates/${candidateId}/pipeline-stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      })
    } finally {
      setMovingId(null)
    }
  }

  if (shortlisted.length === 0) {
    return <EmptySlate label="Validez des candidats dans l'onglet Fiches pour les voir ici." />
  }

  return (
    <div>
      <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "var(--font-inter), sans-serif" }}>
        Pipeline de recrutement · {shortlisted.length} candidat{shortlisted.length > 1 ? "s" : ""}
      </p>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
        {STAGE_ORDER.map(stage => {
          const meta = STAGE_META[stage]
          const cards = byStage[stage] ?? []
          return (
            <div key={stage} style={{
              minWidth: 180, flex: "0 0 180px",
              background: meta.bg,
              border: `1.5px solid ${meta.color}22`,
              borderRadius: 12, padding: "10px 8px",
            }}>
              {/* Column header */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, fontFamily: "var(--font-inter), sans-serif" }}>{meta.label}</span>
                <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: meta.color, background: `${meta.color}18`, borderRadius: 999, padding: "1px 7px", fontFamily: "var(--font-inter), sans-serif" }}>{cards.length}</span>
              </div>

              {/* Cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {cards.map(c => (
                  <div key={c.id} style={{
                    background: "white", borderRadius: 9,
                    border: "1.5px solid #F0ECF8",
                    padding: "8px 10px",
                    opacity: movingId === c.id ? 0.5 : 1,
                    transition: "opacity 150ms",
                  }}>
                    <p style={{ margin: "0 0 2px", fontSize: 11, fontWeight: 700, color: "#1F2937", fontFamily: "var(--font-inter), sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.name_estimated ?? "Profil anonyme"}
                    </p>
                    <p style={{ margin: "0 0 6px", fontSize: 10, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.title_estimated ?? c.company ?? "—"}
                    </p>
                    {/* Stage arrows */}
                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                      {STAGE_ORDER.filter(s => s !== stage).map(s => (
                        <button key={s} onClick={() => moveToStage(c.id, s)} style={{
                          fontSize: 9, fontWeight: 600, padding: "2px 6px",
                          borderRadius: 6, border: `1px solid ${STAGE_META[s].color}44`,
                          background: "transparent", color: STAGE_META[s].color,
                          cursor: "pointer", fontFamily: "var(--font-inter), sans-serif",
                        }}>
                          → {STAGE_META[s].label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {cards.length === 0 && (
                  <p style={{ fontSize: 10, color: "#C4B5FD", textAlign: "center", padding: "8px 0", fontFamily: "var(--font-inter), sans-serif", margin: 0 }}>Vide</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════
   RELANCES SECTION (Alex N3)
   ════════════════════════════════════════════════════════════════ */

function RelancesSection({
  candidates, missionId, mission, agentColor,
}: {
  candidates: Candidate[]
  missionId: string
  mission: Mission
  agentColor: string
}) {
  const brief = mission.brief as { nom_recruteur?: string } | null
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState<string | null>(null)

  // Candidates contacted but no reply detected (not in replied/interview/offer)
  const toRelance = candidates.filter(c =>
    c.contacted_at &&
    !["replied", "interview", "offer"].includes(c.pipeline_stage ?? "")
  )

  const daysSince = (dateStr: string) =>
    Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)

  const generateRelance = async (c: Candidate) => {
    setGenerating(p => ({ ...p, [c.id]: true }))
    try {
      const res = await fetch(`/api/missions/${missionId}/followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_name: c.name_estimated,
          original_message: c.message_draft ?? "",
          days_since_contact: c.contacted_at ? daysSince(c.contacted_at) : 7,
          recruiter_name: brief?.nom_recruteur ?? null,
        }),
      })
      const data = await res.json() as { draft?: string; error?: string }
      if (data.draft) setDrafts(p => ({ ...p, [c.id]: data.draft! }))
    } finally {
      setGenerating(p => ({ ...p, [c.id]: false }))
    }
  }

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id); setTimeout(() => setCopied(null), 2000)
    })
  }

  if (toRelance.length === 0) {
    return (
      <EmptySlate label="Aucun candidat à relancer pour le moment. Contactez des profils via l'onglet Contact." />
    )
  }

  return (
    <div>
      <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "var(--font-inter), sans-serif" }}>
        À relancer · {toRelance.length} candidat{toRelance.length > 1 ? "s" : ""}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {toRelance.map(c => {
          const days = c.contacted_at ? daysSince(c.contacted_at) : 0
          const draft = drafts[c.id]
          const isGenerating = generating[c.id]
          return (
            <div key={c.id} style={{
              background: "white", borderRadius: 12,
              border: "1.5px solid #F0ECF8", padding: "14px 16px",
            }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
                <div>
                  <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: "#1F2937", fontFamily: "var(--font-inter), sans-serif" }}>
                    {c.name_estimated ?? "Profil anonyme"}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
                    {c.title_estimated ?? ""}{c.company ? ` · ${c.company}` : ""}
                  </p>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 999, flexShrink: 0,
                  background: days > 10 ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)",
                  color: days > 10 ? "#EF4444" : "#D97706",
                  border: `1px solid ${days > 10 ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)"}`,
                  fontFamily: "var(--font-inter), sans-serif",
                }}>
                  {days}j sans réponse
                </span>
              </div>

              {/* Original message preview */}
              {c.message_draft && (
                <div style={{ marginBottom: 10, padding: "8px 10px", background: "#F9FAFB", borderRadius: 8, border: "1px solid #F0ECF8" }}>
                  <p style={{ margin: "0 0 3px", fontSize: 9, fontWeight: 700, color: "#C4B5FD", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-inter), sans-serif" }}>
                    Message initial
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif", lineHeight: 1.5,
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden",
                  }}>
                    {c.message_draft}
                  </p>
                </div>
              )}

              {/* Draft relance */}
              {draft && (
                <div style={{ marginBottom: 10, padding: "10px 12px", background: "rgba(124,99,200,0.04)", borderRadius: 9, border: "1.5px solid rgba(124,99,200,0.18)" }}>
                  <p style={{ margin: "0 0 3px", fontSize: 9, fontWeight: 700, color: agentColor, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-inter), sans-serif" }}>
                    Message de relance
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: "#374151", fontFamily: "var(--font-inter), sans-serif", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                    {draft}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => generateRelance(c)}
                  disabled={isGenerating}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: "6px 12px", borderRadius: 8,
                    border: `1.5px solid ${agentColor}33`,
                    background: isGenerating ? "#F5F3FF" : "white", color: agentColor,
                    cursor: isGenerating ? "not-allowed" : "pointer",
                    fontFamily: "var(--font-inter), sans-serif",
                    display: "flex", alignItems: "center", gap: 5,
                  }}
                >
                  {isGenerating ? (
                    <>
                      <svg width="10" height="10" viewBox="0 0 24 24" style={{ animation: "spin 0.8s linear infinite" }}>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.3"/>
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round"/>
                      </svg>
                      Génération…
                    </>
                  ) : (
                    <>{draft ? "↺ Régénérer" : "✦ Générer relance"}</>
                  )}
                </button>
                {draft && (
                  <button
                    onClick={() => copyToClipboard(c.id, draft)}
                    style={{
                      fontSize: 11, fontWeight: 600, padding: "6px 12px", borderRadius: 8,
                      border: "1.5px solid #E5E7EB", background: "white",
                      color: copied === c.id ? "#10B981" : "#6B7280",
                      cursor: "pointer", fontFamily: "var(--font-inter), sans-serif",
                    }}
                  >
                    {copied === c.id ? "✓ Copié" : "Copier"}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════
   CANDIDATE FICHE
   ════════════════════════════════════════════════════════════════ */

function CandidateFiche({
  candidate: c, weights, agentColor, dimmed = false,
  onDecision, onNoteChange, onSimilar,
}: {
  candidate: Candidate
  weights: ScoringWeights
  agentColor: string
  dimmed?: boolean
  onDecision: (id: string, decision: "validated" | "rejected", msgDraft?: string) => void
  onNoteChange: (id: string, text: string) => void
  onSimilar: () => void
}) {
  const [generating, setGenerating] = useState(false)
  const [copied,     setCopied]     = useState(false)
  const [showNotes,  setShowNotes]  = useState(false)
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sm          = SOURCE_META[(c.source ?? "linkedin") as keyof typeof SOURCE_META] ?? SOURCE_META.linkedin
  const dims        = c.score_dimensions as ScoreDimensions | null
  const adjScore    = getAdjustedScore(c, weights)
  const isStrong    = adjScore >= 85
  const isValidated = c.status === "shortlisted"
  const isRejected  = c.status === "rejected"
  const scoreColor  = adjScore >= 80 ? "#16a34a" : adjScore >= 60 ? "#F59E0B" : "#EF4444"

  const handleValidate = async () => {
    if (isValidated || isRejected || generating) return
    setGenerating(true)
    try {
      const res  = await fetch(`/api/candidates/${c.id}/generate-message`, { method: "POST" })
      const data = await res.json() as { message_draft?: string }
      onDecision(c.id, "validated", data.message_draft)
    } catch {
      onDecision(c.id, "validated")
    } finally {
      setGenerating(false)
    }
  }

  const handleRetryMessage = async () => {
    if (generating) return
    setGenerating(true)
    try {
      const res  = await fetch(`/api/candidates/${c.id}/generate-message`, { method: "POST" })
      const data = await res.json() as { message_draft?: string }
      if (data.message_draft) onDecision(c.id, "validated", data.message_draft)
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

  const handleNoteInput = (text: string) => {
    onNoteChange(c.id, text)
    if (noteTimer.current) clearTimeout(noteTimer.current)
    noteTimer.current = setTimeout(() => {
      fetch(`/api/candidates/${c.id}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: text }),
      }).catch(() => {})
    }, 800)
  }

  return (
    <m.div
      layout
      style={{
        borderRadius: 12,
        border: `1.5px solid ${isValidated ? "#BBF7D0" : isRejected ? "#FECACA" : isStrong ? `${agentColor}40` : "#F0ECF8"}`,
        background: isValidated ? "#F0FDF4" : isRejected ? "#FFF5F5" : isStrong ? `${agentColor}04` : "white",
        opacity: isRejected ? 0.55 : dimmed ? 0.72 : 1,
        overflow: "hidden",
        transition: "border-color 200ms, background 200ms, opacity 200ms",
      }}
    >
      {/* ── Top row ───────────────────────────────────────── */}
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "flex-start", gap: 10 }}>

        {/* Source badge */}
        <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 7, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: sm.color, background: sm.bg, fontFamily: "var(--font-inter), sans-serif", marginTop: 1 }}>{sm.icon}</span>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 1 }}>
            {isStrong && (
              <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 4, color: "white", background: agentColor, letterSpacing: "0.04em", fontFamily: "var(--font-inter), sans-serif" }}>TOP</span>
            )}
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#111827", fontFamily: "var(--font-inter), sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
              {c.name_estimated ?? "Profil anonyme"}
            </p>
            {c.company && <span style={{ fontSize: 12, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {c.company}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            {c.title_estimated && <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>{c.title_estimated}</span>}
            {c.seniority_level && c.seniority_level !== "Inconnu" && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999,
                color: c.seniority_level === "Senior" ? "#7C63C8" : c.seniority_level === "Confirmé" ? "#F59E0B" : "#16a34a",
                background: c.seniority_level === "Senior" ? "#F0ECF8" : c.seniority_level === "Confirmé" ? "rgba(245,158,11,0.1)" : "rgba(22,163,74,0.1)",
                fontFamily: "var(--font-inter), sans-serif",
              }}>{c.seniority_level}</span>
            )}
            {isValidated && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, color: "#16a34a", background: "rgba(22,163,74,0.1)", fontFamily: "var(--font-inter), sans-serif" }}>Validé</span>}
            {isRejected  && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, color: "#EF4444", background: "rgba(239,68,68,0.1)", fontFamily: "var(--font-inter), sans-serif" }}>Refusé</span>}
          </div>
        </div>

        {/* Score */}
        <div style={{ flexShrink: 0, textAlign: "center", marginTop: 2 }}>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 800, color: scoreColor, fontFamily: "var(--font-space-grotesk), sans-serif", lineHeight: 1 }}>{adjScore}</p>
          <p style={{ margin: "1px 0 0", fontSize: 9, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>/100</p>
        </div>
      </div>

      {/* ── Score dimensions ──────────────────────────────── */}
      {dims && !isRejected && (
        <div style={{ padding: "0 14px 8px", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(Object.entries(dims) as Array<[keyof typeof DIM_META, number]>).map(([dim, val]) => {
            const dm = DIM_META[dim]
            if (!dm) return null
            return (
              <div key={dim} style={{ flex: 1, minWidth: 55 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontSize: 9, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>{dm.label}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: dm.color, fontFamily: "var(--font-inter), sans-serif" }}>{val}</span>
                </div>
                <div style={{ height: 3, borderRadius: 999, background: "#F0ECF8", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 999, background: dm.color, width: `${val}%`, opacity: 0.7 }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Actions ───────────────────────────────────────── */}
      {!isRejected && (
        <div style={{ padding: "0 14px 10px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {c.linkedin_url && (
            <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 7, textDecoration: "none", color: sm.color, background: sm.bg, fontFamily: "var(--font-inter), sans-serif" }}>
              Profil
            </a>
          )}

          {!isValidated && (
            <>
              <button onClick={() => onDecision(c.id, "rejected")} style={{
                padding: "4px 10px", borderRadius: 7, border: "1.5px solid #FECACA",
                background: "white", color: "#EF4444", fontSize: 11, fontWeight: 600,
                cursor: "pointer", fontFamily: "var(--font-inter), sans-serif",
              }}>
                Rejeter
              </button>
              <button onClick={handleValidate} disabled={generating} style={{
                padding: "4px 12px", borderRadius: 7, border: "none",
                background: generating ? "#D1D5DB" : agentColor, color: "white",
                fontSize: 11, fontWeight: 700, cursor: generating ? "not-allowed" : "pointer",
                fontFamily: "var(--font-inter), sans-serif",
                display: "inline-flex", alignItems: "center", gap: 5,
              }}>
                {generating
                  ? <><span style={{ width: 11, height: 11, border: "1.5px solid rgba(255,255,255,0.4)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />Génération…</>
                  : "Valider + message"
                }
              </button>
            </>
          )}

          {isValidated && (
            <>
              {c.message_draft
                ? <button onClick={copyMessage} style={{
                    padding: "4px 10px", borderRadius: 7,
                    border: `1.5px solid ${copied ? "#86EFAC" : "#E2DAF6"}`,
                    background: copied ? "rgba(22,163,74,0.07)" : "white",
                    color: copied ? "#16a34a" : "#7C63C8", fontSize: 11, fontWeight: 600,
                    cursor: "pointer", fontFamily: "var(--font-inter), sans-serif", transition: "all 150ms",
                  }}>
                    {copied ? "Copié" : "Copier message"}
                  </button>
                : <button onClick={handleRetryMessage} disabled={generating} style={{
                    padding: "4px 10px", borderRadius: 7,
                    border: "1.5px solid #FDE68A", background: "rgba(245,158,11,0.07)",
                    color: "#F59E0B", fontSize: 11, fontWeight: 600,
                    cursor: generating ? "not-allowed" : "pointer",
                    fontFamily: "var(--font-inter), sans-serif",
                    display: "inline-flex", alignItems: "center", gap: 5,
                  }}>
                    {generating
                      ? <><span style={{ width: 11, height: 11, border: "1.5px solid rgba(245,158,11,0.4)", borderTopColor: "#F59E0B", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />…</>
                      : "Générer message"
                    }
                  </button>
              }
            </>
          )}

          {/* Similar profiles */}
          <button onClick={onSimilar} title="Trouver des profils similaires" style={{
            padding: "4px 9px", borderRadius: 7,
            border: "1.5px solid #E5E7EB", background: "white",
            color: "#9CA3AF", fontSize: 11, cursor: "pointer",
            fontFamily: "var(--font-inter), sans-serif",
            display: "inline-flex", alignItems: "center", gap: 4,
          }}>
            <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
              <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M13.5 13.5l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              <path d="M9 6.5v5M6.5 9h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            Similaires
          </button>

          {/* Notes toggle */}
          <button onClick={() => setShowNotes(p => !p)} style={{
            padding: "4px 9px", borderRadius: 7,
            border: `1.5px solid ${c.notes ? "#E2DAF6" : "#E5E7EB"}`,
            background: c.notes ? "#F8F6FF" : "white",
            color: c.notes ? "#7C63C8" : "#9CA3AF",
            fontSize: 11, cursor: "pointer",
            fontFamily: "var(--font-inter), sans-serif",
            display: "inline-flex", alignItems: "center", gap: 4,
          }}>
            <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
              <path d="M4 4h12v9H4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
              <path d="M7 8h6M7 11h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            Notes{c.notes ? " ·" : ""}
          </button>
        </div>
      )}

      {/* ── Notes ─────────────────────────────────────────── */}
      {showNotes && !isRejected && (
        <div style={{ padding: "0 14px 12px" }}>
          <textarea
            value={c.notes ?? ""}
            onChange={e => handleNoteInput(e.target.value)}
            placeholder="Ajouter une note sur ce candidat…"
            rows={3}
            style={{
              width: "100%", borderRadius: 8, border: "1.5px solid #E2DAF6",
              padding: "8px 10px", fontSize: 12, color: "#374151",
              fontFamily: "var(--font-inter), sans-serif", resize: "vertical",
              outline: "none", background: "#FDFAFF", boxSizing: "border-box",
              lineHeight: 1.6,
            }}
          />
        </div>
      )}

      {/* ── Message preview (validated) ───────────────────── */}
      {isValidated && c.message_draft && (
        <div style={{ borderTop: "1px solid #E7FAF0", padding: "8px 14px 10px" }}>
          <p style={{
            margin: 0, fontSize: 11, color: "#374151",
            fontFamily: "var(--font-inter), sans-serif", lineHeight: 1.65,
            whiteSpace: "pre-wrap",
            display: "-webkit-box", WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical" as const, overflow: "hidden",
          }}>
            {c.message_draft}
          </p>
        </div>
      )}

      {/* ── Justification ─────────────────────────────────── */}
      {c.score_justification && !isRejected && !isValidated && (
        <div style={{ borderTop: "1px solid #F0ECF8", padding: "6px 14px 8px" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif", lineHeight: 1.5, fontStyle: "italic" }}>
            {c.score_justification}
          </p>
        </div>
      )}

    </m.div>
  )
}

/* ════════════════════════════════════════════════════════════════
   LÉO SECTIONS (tab-based, unchanged)
   ════════════════════════════════════════════════════════════════ */

function LeoSections({
  candidates, bookingLinks, agentLevel, agent, profile,
  activeTab, onTabChange, onConsult, onGenerateLink, onUpdateBookingStatus,
}: {
  candidates: Candidate[]
  bookingLinks: BookingLink[]
  agentLevel: number
  agent: (typeof AGENT_LEVELS)[number]
  profile: { first_name?: string | null; booking_url?: string | null } | null
  activeTab: LeoTab
  onTabChange: (t: LeoTab) => void
  onConsult: (id: string) => void
  onGenerateLink: (c: Candidate) => Promise<void>
  onUpdateBookingStatus: (linkId: string, status: BookingLink["status"]) => Promise<void>
}) {
  const sections = getLeoSections(agentLevel)
  return (
    <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
      <div style={{ flexShrink: 0, display: "flex", gap: 5, padding: "12px 20px 0", overflowX: "auto" }}>
        {sections.map(key => {
          const isActive = activeTab === key
          return (
            <button key={key} onClick={() => onTabChange(key)} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "7px 13px", borderRadius: 9, whiteSpace: "nowrap",
              border: isActive ? `1.5px solid ${agent.borderColor}` : "1.5px solid #F0ECF8",
              cursor: "pointer", fontSize: 12, fontWeight: isActive ? 700 : 500,
              color: isActive ? agent.color : "#6B7280",
              background: isActive ? agent.colorLight : "white",
              fontFamily: "var(--font-inter), sans-serif", transition: "all 150ms",
            }}>
              {LEO_TAB_META[key].label}
            </button>
          )
        })}
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "12px 20px 24px" }}>
        <div style={{ background: "white", borderRadius: 14, border: "1.5px solid #F0ECF8", padding: "20px" }}>
          {activeTab === "results"  && <ResultsSection candidates={candidates} onConsult={onConsult} agentColor={agent.color} />}
          {activeTab === "scoring"  && <ScoringSection candidates={candidates} />}
          {activeTab === "messages" && <MessagesSection candidates={candidates} bookingLinks={bookingLinks} agentLevel={agentLevel} hasBookingUrl={Boolean(profile?.booking_url)} onGenerateLink={onGenerateLink} />}
          {activeTab === "pipeline" && <LeoPipelineSection candidates={candidates} bookingLinks={bookingLinks} />}
          {activeTab === "calendar" && <CalendarSection candidates={candidates} bookingLinks={bookingLinks} onUpdateStatus={onUpdateBookingStatus} />}
        </div>
      </div>
    </div>
  )
}

/* ── Tableur candidate list (Nora/Alex) ────────────────────── */
function TableurCandidateList({ candidates, agentColor }: { candidates: Candidate[]; agentColor: string }) {
  const [filter, setFilter] = useState<"all" | "linkedin" | "malt" | "apec">("all")
  const [search, setSearch] = useState("")

  const liCount   = candidates.filter(c => (c.source ?? "linkedin") === "linkedin").length
  const maltCount = candidates.filter(c => c.source === "malt").length
  const apecCount = candidates.filter(c => c.source === "apec").length

  const filtered = candidates.filter(c => {
    const ms = filter === "all" || (c.source ?? "linkedin") === filter
    const mq = !search || [c.name_estimated, c.title_estimated, c.company].some(v => v?.toLowerCase().includes(search.toLowerCase()))
    return ms && mq
  })

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "var(--font-inter), sans-serif" }}>
          Tous les profils
        </p>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {[
            { key: "all",      label: `Tous (${candidates.length})`,  color: agentColor, bg: "#F0ECF8" },
            ...(liCount   ? [{ key: "linkedin", label: `LinkedIn (${liCount})`,        color: "#0A66C2", bg: "rgba(10,102,194,0.08)" }] : []),
            ...(maltCount ? [{ key: "malt",     label: `Malt (${maltCount})`,          color: "#FC5757", bg: "rgba(252,87,87,0.08)" }] : []),
            ...(apecCount ? [{ key: "apec",     label: `APEC (${apecCount})`,          color: "#E87722", bg: "rgba(232,119,34,0.08)" }] : []),
          ].map(({ key, label, color, bg }) => (
            <button key={key} onClick={() => setFilter(key as typeof filter)} style={{ padding: "4px 10px", borderRadius: 999, border: `1.5px solid ${filter === key ? color : "#E5E7EB"}`, background: filter === key ? bg : "white", color: filter === key ? color : "#6B7280", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-inter), sans-serif" }}>{label}</button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", position: "relative" }}>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }}>
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M13.5 13.5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" style={{ paddingLeft: 26, paddingRight: 10, paddingTop: 5, paddingBottom: 5, borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, color: "#111827", outline: "none", background: "white", width: 150, fontFamily: "var(--font-inter), sans-serif" }} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {filtered.map((c, i) => {
          const sm = SOURCE_META[(c.source ?? "linkedin") as keyof typeof SOURCE_META] ?? SOURCE_META.linkedin
          const score = c.relevance_score
          const isShortlisted = c.status === "shortlisted"
          const isRejected    = c.status === "rejected"
          return (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${isShortlisted ? "#D1FAE5" : isRejected ? "#FEE2E2" : "#F0ECF8"}`, background: isShortlisted ? "#F0FDF4" : isRejected ? "#FEF2F2" : "white", opacity: isRejected ? 0.6 : 1 }}>
              <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#9CA3AF", background: "#F8F6FF", fontFamily: "var(--font-inter), sans-serif" }}>{i + 1}</span>
              <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: sm.color, background: sm.bg, fontFamily: "var(--font-inter), sans-serif" }}>{sm.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#111827", fontFamily: "var(--font-inter), sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name_estimated ?? "—"}</p>
                <p style={{ margin: 0, fontSize: 11, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[c.title_estimated, c.company].filter(Boolean).join(" · ") || "—"}</p>
              </div>
              {c.seniority_level && <span style={{ flexShrink: 0, fontSize: 10, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>{c.seniority_level}</span>}
              {score != null && <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 6, color: score >= 80 ? "#16a34a" : score >= 60 ? "#F59E0B" : "#EF4444", background: score >= 80 ? "rgba(22,163,74,0.08)" : score >= 60 ? "rgba(245,158,11,0.08)" : "rgba(239,68,68,0.08)", fontFamily: "var(--font-inter), sans-serif" }}>{score}</span>}
              {isShortlisted && <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: "#16a34a", fontFamily: "var(--font-inter), sans-serif" }}>✓</span>}
              {c.linkedin_url
                ? <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, textDecoration: "none", color: sm.color, background: sm.bg, fontFamily: "var(--font-inter), sans-serif" }}>{sm.urlLabel}</a>
                : <span style={{ flexShrink: 0, fontSize: 11, color: "#D1D5DB" }}>—</span>
              }
            </div>
          )
        })}
        {filtered.length === 0 && (
          <p style={{ textAlign: "center", color: "#9CA3AF", fontSize: 13, padding: "24px 0", fontFamily: "var(--font-inter), sans-serif", margin: 0 }}>Aucun profil trouvé.</p>
        )}
      </div>
    </div>
  )
}

/* ── Results section (Léo) ─────────────────────────────────── */
function ResultsSection({ candidates, onConsult, agentColor }: { candidates: Candidate[]; onConsult: (id: string) => void; agentColor: string }) {
  const [filter, setFilter] = useState<"all" | "linkedin" | "malt" | "apec">("all")
  const [search, setSearch] = useState("")
  if (candidates.length === 0) return <WaitingState label="Les profils identifiés apparaîtront ici." />

  const liCount   = candidates.filter(c => (c.source ?? "linkedin") === "linkedin").length
  const maltCount = candidates.filter(c => c.source === "malt").length
  const apecCount = candidates.filter(c => c.source === "apec").length

  const filtered = candidates.filter(c => {
    const ms = filter === "all" || (c.source ?? "linkedin") === filter
    const mq = !search || [c.name_estimated, c.title_estimated, c.company].some(v => v?.toLowerCase().includes(search.toLowerCase()))
    return ms && mq
  })

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {[
          { key: "all",      label: `Tous (${candidates.length})`,  color: "#7C63C8", bg: "#F0ECF8" },
          { key: "linkedin", label: `LinkedIn (${liCount})`,        color: "#0A66C2", bg: "rgba(10,102,194,0.08)" },
          { key: "malt",     label: `Malt (${maltCount})`,          color: "#FC5757", bg: "rgba(252,87,87,0.08)" },
          { key: "apec",     label: `APEC (${apecCount})`,          color: "#E87722", bg: "rgba(232,119,34,0.08)" },
        ].map(({ key, label, color, bg }) => (
          <button key={key} onClick={() => setFilter(key as typeof filter)} style={{ padding: "5px 12px", borderRadius: 999, border: `1.5px solid ${filter === key ? color : "#E5E7EB"}`, background: filter === key ? bg : "white", color: filter === key ? color : "#6B7280", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-inter), sans-serif" }}>{label}</button>
        ))}
        <div style={{ marginLeft: "auto", position: "relative" }}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }}>
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M13.5 13.5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" style={{ paddingLeft: 28, paddingRight: 10, paddingTop: 6, paddingBottom: 6, borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 12, color: "#111827", outline: "none", background: "white", width: 160, fontFamily: "var(--font-inter), sans-serif" }} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {filtered.map((c, i) => {
          const sm = SOURCE_META[(c.source ?? "linkedin") as keyof typeof SOURCE_META] ?? SOURCE_META.linkedin
          const isConsulted = Boolean(c.consulted_at)
          return (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${isConsulted ? "#E2DAF6" : "#F0ECF8"}`, background: isConsulted ? "#FDFAFF" : "white", opacity: isConsulted ? 0.72 : 1 }}>
              <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: isConsulted ? "#7C63C8" : "#9CA3AF", background: isConsulted ? "#EDE8FB" : "#F8F6FF", fontFamily: "var(--font-inter), sans-serif" }}>{isConsulted ? "✓" : i + 1}</span>
              <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: sm.color, background: sm.bg, fontFamily: "var(--font-inter), sans-serif" }}>{sm.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#111827", fontFamily: "var(--font-inter), sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name_estimated ?? "—"}</p>
                <p style={{ margin: 0, fontSize: 11, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[c.title_estimated, c.company].filter(Boolean).join(" · ") || "—"}</p>
              </div>
              {c.relevance_score != null && <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 6, color: c.relevance_score >= 80 ? "#16a34a" : "#F59E0B", background: c.relevance_score >= 80 ? "rgba(22,163,74,0.08)" : "rgba(245,158,11,0.08)", fontFamily: "var(--font-inter), sans-serif" }}>{c.relevance_score}</span>}
              {c.linkedin_url
                ? <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={() => !isConsulted && onConsult(c.id)} style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: "4px 9px", borderRadius: 7, textDecoration: "none", color: isConsulted ? "#9CA3AF" : sm.color, background: isConsulted ? "#F3F4F6" : sm.bg, fontFamily: "var(--font-inter), sans-serif" }}>{sm.urlLabel}</a>
                : <span style={{ flexShrink: 0, fontSize: 11, color: "#D1D5DB" }}>—</span>
              }
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ScoringSection({ candidates }: { candidates: Candidate[] }) {
  const scored = candidates.filter(c => c.relevance_score != null).sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
  if (!scored.length) return <WaitingState label="Les scores apparaîtront ici." />
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {scored.map(c => (
        <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 11, border: "1px solid #F0ECF8", background: "#FAFAFA", gap: 12, flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827", fontFamily: "var(--font-inter), sans-serif" }}>{c.name_estimated ?? "Candidat"}</p>
            {c.company && <p style={{ margin: "2px 0 0", fontSize: 11, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif" }}>{c.company}</p>}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: (c.relevance_score ?? 0) >= 80 ? "#22c55e" : "#F59E0B", fontFamily: "var(--font-space-grotesk), sans-serif" }}>{c.relevance_score ?? "—"}</span>
            <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>/100</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function MessagesSection({ candidates, bookingLinks, agentLevel, hasBookingUrl, onGenerateLink }: { candidates: Candidate[]; bookingLinks: BookingLink[]; agentLevel: number; hasBookingUrl: boolean; onGenerateLink: (c: Candidate) => Promise<void> }) {
  const [generating, setGenerating] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  if (!candidates.length) return <WaitingState label="Les messages générés apparaîtront ici." />

  const copy = (text: string, id: string) => { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 2000) }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {candidates.map(c => {
        const link = bookingLinks.find(bl => bl.candidate_id === c.id)
        const url  = link ? buildBookingPageUrl(link.token) : null
        return (
          <div key={c.id} style={{ borderRadius: 11, border: "1px solid #F0ECF8", overflow: "hidden" }}>
            <div style={{ padding: "9px 14px", background: "#F8F6FF", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 7 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827", fontFamily: "var(--font-inter), sans-serif" }}>{c.name_estimated ?? "Candidat"}{c.company ? ` — ${c.company}` : ""}</p>
              <div style={{ display: "flex", gap: 5 }}>
                {url && <button onClick={() => copy(url, `url-${c.id}`)} style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 7, border: "1px solid #E2DAF6", background: "white", color: "#7C63C8", cursor: "pointer", fontFamily: "var(--font-inter), sans-serif" }}>{copied === `url-${c.id}` ? "Copié" : "Lien booking"}</button>}
                {agentLevel === 3 && !link && hasBookingUrl && <button onClick={async () => { setGenerating(c.id); await onGenerateLink(c); setGenerating(null) }} disabled={generating === c.id} style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 7, border: "1px solid #E2DAF6", background: "white", color: "#7C63C8", cursor: "pointer", fontFamily: "var(--font-inter), sans-serif" }}>{generating === c.id ? "…" : "Générer + lien"}</button>}
                {c.message_draft && <button onClick={() => copy(c.message_draft!, `msg-${c.id}`)} style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 7, border: "1px solid #E2DAF6", background: "white", color: "#7C63C8", cursor: "pointer", fontFamily: "var(--font-inter), sans-serif" }}>{copied === `msg-${c.id}` ? "Copié !" : "Copier"}</button>}
              </div>
            </div>
            {c.message_draft
              ? <p style={{ margin: 0, padding: "12px 14px", fontSize: 12, color: "#374151", lineHeight: 1.75, fontFamily: "var(--font-inter), sans-serif", whiteSpace: "pre-wrap" }}>{c.message_draft}</p>
              : <p style={{ margin: 0, padding: "12px 14px", fontSize: 12, color: "#9CA3AF", fontStyle: "italic", fontFamily: "var(--font-inter), sans-serif" }}>Aucun message.</p>
            }
          </div>
        )
      })}
    </div>
  )
}

function LeoPipelineSection({ candidates, bookingLinks }: { candidates: Candidate[]; bookingLinks: BookingLink[] }) {
  const statuses: Candidate["status"][] = ["raw", "shortlisted", "rejected"]
  const labels: Record<Candidate["status"], string> = { raw: "Brut", shortlisted: "Shortlist", rejected: "Rejeté" }
  const colors: Record<Candidate["status"], string> = { raw: "#6B7280", shortlisted: "#22c55e", rejected: "#EF4444" }
  if (!candidates.length) return <WaitingState label="Le pipeline s'affichera ici." />
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
      {statuses.map(s => {
        const group = candidates.filter(c => c.status === s)
        return (
          <div key={s} style={{ borderRadius: 11, border: "1px solid #F0ECF8", overflow: "hidden" }}>
            <div style={{ padding: "7px 12px", background: "#F8F6FF", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: colors[s], fontFamily: "var(--font-inter), sans-serif" }}>{labels[s]}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: colors[s], background: `${colors[s]}14`, padding: "1px 6px", borderRadius: 999, fontFamily: "var(--font-inter), sans-serif" }}>{group.length}</span>
            </div>
            <div style={{ padding: "6px" }}>
              {group.length === 0
                ? <p style={{ margin: 0, padding: "6px", fontSize: 11, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>Aucun</p>
                : group.map(c => (
                    <div key={c.id} style={{ padding: "7px 9px", borderRadius: 7, marginBottom: 3, background: "white", border: "1px solid #F0ECF8" }}>
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "#111827", fontFamily: "var(--font-inter), sans-serif" }}>{c.name_estimated ?? "Inconnu"}</p>
                      {c.company && <p style={{ margin: 0, fontSize: 10, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>{c.company}</p>}
                    </div>
                  ))
              }
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CalendarSection({ candidates, bookingLinks, onUpdateStatus }: { candidates: Candidate[]; bookingLinks: BookingLink[]; onUpdateStatus: (id: string, status: BookingLink["status"]) => Promise<void> }) {
  const [copied, setCopied]   = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  if (!bookingLinks.length) return <WaitingState label="Les liens de booking apparaîtront ici." />
  const STATUS_FLOW: Record<BookingLink["status"], BookingLink["status"][]> = { pending: ["reserved", "done"], reserved: ["done", "pending"], done: ["pending"] }
  const copy = (url: string, id: string) => { navigator.clipboard.writeText(url); setCopied(id); setTimeout(() => setCopied(null), 2000) }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {bookingLinks.map(bl => {
        const candidate = candidates.find(c => c.id === bl.candidate_id)
        const url = buildBookingPageUrl(bl.token)
        const si = BOOKING_STATUS_META[bl.status]
        return (
          <div key={bl.id} style={{ borderRadius: 12, border: "1px solid #F0ECF8", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#FAFAFA", flexWrap: "wrap", gap: 7 }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827", fontFamily: "var(--font-inter), sans-serif" }}>{candidate?.name_estimated ?? "Candidat"}</p>
                {candidate?.company && <p style={{ margin: 0, fontSize: 11, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif" }}>{candidate.company}</p>}
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, color: si.color, background: `${si.color}14`, fontFamily: "var(--font-inter), sans-serif" }}>{si.label}</span>
            </div>
            <div style={{ padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: 7, alignItems: "center" }}>
              <button onClick={() => copy(url, bl.id)} style={{ flex: 1, minWidth: 160, fontSize: 11, color: "#7C63C8", background: "#F8F6FF", border: "1px solid #E2DAF6", borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontFamily: "var(--font-mono, monospace)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>
                {copied === bl.id ? "Copié !" : url.replace("https://", "")}
              </button>
              {STATUS_FLOW[bl.status].map(ns => (
                <button key={ns} onClick={async () => { setUpdating(bl.id); await onUpdateStatus(bl.id, ns); setUpdating(null) }} disabled={updating === bl.id} style={{ fontSize: 11, fontWeight: 600, padding: "5px 11px", borderRadius: 7, border: `1px solid ${BOOKING_STATUS_META[ns].color}30`, background: `${BOOKING_STATUS_META[ns].color}10`, color: BOOKING_STATUS_META[ns].color, cursor: "pointer", fontFamily: "var(--font-inter), sans-serif" }}>
                  {updating === bl.id ? "…" : `→ ${BOOKING_STATUS_META[ns].label}`}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Shared ──────────────────────────────────────────────────── */

function EmptySlate({ label }: { label: string }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 0" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: "#F8F6FF", border: "1px solid #E2DAF6", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#E2DAF6" strokeWidth="2"/>
          <path d="M12 7v5l3 3" stroke="#7C63C8" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>{label}</p>
    </div>
  )
}

function WaitingState({ label }: { label: string }) {
  return <EmptySlate label={label} />
}

// Spinner imported from WorkspaceCentralChat
