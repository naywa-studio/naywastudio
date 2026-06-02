"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { m } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import type { MatchAssessment, PipelineStage } from "@/lib/database.types"
import Select from "@/components/ui/Select"
import NoraLoader from "@/components/workspace/NoraLoader"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

type Row = MatchAssessment & {
  candidate: { id: string; full_name: string | null; current_title: string | null; cv_file_name: string | null } | null
  job: { id: string; title: string } | null
}

type StageMeta = { key: PipelineStage; label: string; color: string; bg: string }

// Active board columns — the relational journey. Pricing was removed (handled
// in the dedicated Pricing tab) and the terminal states live outside the board.
const ACTIVE_STAGES: StageMeta[] = [
  { key: "identified", label: "Identifié", color: "#6B7280", bg: "#F9FAFB" },
  { key: "contacted",  label: "Contacté",  color: "#2563EB", bg: "rgba(37,99,235,0.05)" },
  { key: "replied",    label: "Réponse",   color: "#7C63C8", bg: "rgba(124,99,200,0.05)" },
  { key: "interview",  label: "Entretien", color: "#B45309", bg: "rgba(245,158,11,0.06)" },
  { key: "offer",      label: "Offre",     color: "#15803d", bg: "rgba(34,197,94,0.06)" },
]

// Terminal states — outcomes, not steps. Shown as clickable + droppable chips
// above the board, never as columns (they'd just add horizontal scroll).
const TERMINAL_STAGES: StageMeta[] = [
  { key: "hired",    label: "Recruté", color: "#0F766E", bg: "rgba(15,118,110,0.08)" },
  { key: "rejected", label: "Écarté",  color: "#9CA3AF", bg: "#F3F4F6" },
]

/** Legacy 'pricing' rows (column removed) are shown in 'identified'. */
function displayStage(s: PipelineStage): PipelineStage {
  return s === "pricing" ? "identified" : s
}

/** Sticky header cell shared by the "Mission" label and the stage columns. */
const headerCellStyle: React.CSSProperties = {
  position: "sticky", top: 0, zIndex: 2,
  background: "#FFFFFF",
  borderBottom: "1px solid #E2DAF6",
  padding: "10px 12px",
  fontSize: 11, fontWeight: 800,
  letterSpacing: "0.06em", textTransform: "uppercase",
}

/* Days a card can sit in a stage before Nora suggests a relance. */
const RELANCE_AFTER_DAYS: Partial<Record<PipelineStage, number>> = {
  contacted: 5,
  interview: 7,
  offer: 7,
}

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000
}
function timeAgo(iso: string): string {
  const d = daysSince(iso)
  if (d < 1) return "aujourd'hui"
  if (d < 2) return "hier"
  if (d < 30) return `il y a ${Math.floor(d)} j`
  return `il y a ${Math.floor(d / 30)} mois`
}
function needsRelance(row: Row): boolean {
  const threshold = RELANCE_AFTER_DAYS[row.pipeline_stage]
  if (threshold == null) return false
  return daysSince(row.updated_at) >= threshold
}

export default function PipelinePage() {
  const sb = useMemo(() => getSupabase(), [])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCell, setOverCell] = useState<string | null>(null) // `${jobId}:${stage}`
  const [overTerminal, setOverTerminal] = useState<PipelineStage | null>(null)
  const [jobFilter, setJobFilter] = useState<string>("")
  // Les candidats dans la pipeline ont été ajoutés explicitement par le
  // sourceur — on ne re-filtre PAS par score ici. La notion de "matchs
  // faibles" n'a de sens qu'au niveau du matching (fiche mission), pas du
  // pipeline. Le toggle a donc été retiré.
  // Lanes (missions) are collapsed by default — click a mission to reveal its
  // candidates. We track the OPEN ones so new missions appear collapsed.
  const [expandedLanes, setExpandedLanes] = useState<Set<string>>(new Set())
  // When set, the board is replaced by a read-only list of that terminal
  // state's candidates (Recruté / Écarté).
  const [terminalView, setTerminalView] = useState<PipelineStage | null>(null)

  const toggleLane = (jobId: string) => {
    setExpandedLanes((prev) => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId); else next.add(jobId)
      return next
    })
  }

  const load = useCallback(async () => {
    const { data } = await sb
      .from("match_assessments")
      .select("*, candidate:candidates(id, full_name, current_title, cv_file_name), job:jobs(id, title)")
      // Seuls les candidats explicitement suivis (choix sourceur ou contact
      // auto) apparaissent — la pipeline n'est pas un déversoir du matching.
      .eq("in_pipeline", true)
      .order("updated_at", { ascending: false })
    setRows((data ?? []) as Row[])
    setLoading(false)
  }, [sb])

  useEffect(() => {
    let mounted = true
    let channel: ReturnType<typeof sb.channel> | null = null
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user || !mounted) return
      await load()
      channel = sb
        .channel(`pipeline:${user.id}`)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "match_assessments", filter: `user_id=eq.${user.id}` },
          () => { load() },
        )
        .subscribe()
    })()
    return () => { mounted = false; if (channel) sb.removeChannel(channel) }
  }, [sb, load])

  const moveCard = async (rowId: string, stage: PipelineStage) => {
    const row = rows.find((r) => r.id === rowId)
    if (!row || row.pipeline_stage === stage) return
    // Optimistic
    setRows((prev) => prev.map((r) =>
      r.id === rowId ? { ...r, pipeline_stage: stage, updated_at: new Date().toISOString() } : r,
    ))
    const res = await fetch(`/api/match/${rowId}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_stage: stage }),
    })
    if (!res.ok) load() // revert via re-fetch on failure
  }

  // Unique jobs across all rows — used by the filter selector.
  const allJobs = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of rows) {
      if (r.job && !seen.has(r.job.id)) seen.set(r.job.id, r.job.title)
    }
    return Array.from(seen, ([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [rows])

  // Filter by job (if user selected one), then by score, then bucket by stage.
  // Manually assigned matches have score === null and are always kept.
  const filteredRows = useMemo(() => {
    return jobFilter ? rows.filter((r) => r.job?.id === jobFilter) : rows
  }, [rows, jobFilter])

  // Swimlanes : one lane per mission, each lane bucketed by active stage.
  // Terminal rows (hired/rejected) are excluded — they live in the chips.
  type Lane = {
    jobId: string
    jobTitle: string
    byStage: Map<PipelineStage, Row[]>
    activeTotal: number
  }
  const lanes = useMemo<Lane[]>(() => {
    const map = new Map<string, Lane>()
    for (const r of filteredRows) {
      const stage = displayStage(r.pipeline_stage)
      if (!ACTIVE_STAGES.some((s) => s.key === stage)) continue // skip terminal
      const id = r.job?.id ?? "_none"
      const title = r.job?.title ?? "Sans mission"
      let lane = map.get(id)
      if (!lane) { lane = { jobId: id, jobTitle: title, byStage: new Map(), activeTotal: 0 }; map.set(id, lane) }
      const arr = lane.byStage.get(stage)
      if (arr) arr.push(r); else lane.byStage.set(stage, [r])
      lane.activeTotal++
    }
    return Array.from(map.values())
      .sort((a, b) => b.activeTotal - a.activeTotal || a.jobTitle.localeCompare(b.jobTitle))
  }, [filteredRows])

  // Terminal counts (respect the job filter, ignore the weak filter so an
  // outcome is never hidden). Keyed by stage.
  const terminalCounts = useMemo(() => {
    const scoped = jobFilter ? rows.filter((r) => r.job?.id === jobFilter) : rows
    const counts: Record<string, number> = {}
    for (const s of TERMINAL_STAGES) {
      counts[s.key] = scoped.filter((r) => r.pipeline_stage === s.key).length
    }
    return counts
  }, [rows, jobFilter])

  // Rows shown in the terminal list view (when a chip is selected).
  const terminalRows = useMemo(() => {
    if (!terminalView) return []
    const scoped = jobFilter ? rows.filter((r) => r.job?.id === jobFilter) : rows
    return scoped.filter((r) => r.pipeline_stage === terminalView)
  }, [rows, jobFilter, terminalView])

  // Relance only counts active rows (terminal candidates are done).
  const relanceCount = useMemo(
    () => filteredRows.filter((r) => !["hired", "rejected"].includes(r.pipeline_stage) && needsRelance(r)).length,
    [filteredRows],
  )

  if (loading) {
    return <NoraLoader />
  }

  return (
    <main style={{
      height: "calc(100vh - 60px)",
      padding: "26px 24px 0",
      fontFamily: "var(--font-inter), sans-serif",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{
        maxWidth: 1400, margin: "0 auto", width: "100%",
        flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
      }}>
        {/* Header (compact) */}
        <div style={{ flexShrink: 0 }}>
          <h1 style={{ margin: 0, fontSize: "clamp(22px, 2.4vw, 28px)", fontWeight: 800, color: "#111827", letterSpacing: "-0.025em", lineHeight: 1.1 }}>
            Suivi candidat
          </h1>
          <p style={{ margin: "5px 0 0", fontSize: 13, color: "#6B7280" }}>
            {rows.length === 0
              ? "Vos candidats matchés apparaîtront ici, étape par étape."
              : terminalView
                ? "Issues finales — glissez une carte vers le pipeline pour la réactiver."
                : "Glissez une carte d'une colonne à l'autre pour faire avancer un candidat."}
          </p>
        </div>

        {/* Controls row : filtres à gauche · issues terminales à droite */}
        {rows.length > 0 && (
          <div style={{
            flexShrink: 0, marginTop: 14, marginBottom: 4,
            display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
          }}>
            {allJobs.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  Mission
                </label>
                <Select
                  value={jobFilter}
                  onChange={setJobFilter}
                  options={[
                    { value: "", label: `Toutes les missions (${allJobs.length})` },
                    ...allJobs.map((j) => ({ value: j.id, label: j.title })),
                  ]}
                  style={{ minWidth: 220 }}
                />
              </div>
            )}
            {/* Issues terminales — chips cliquables + zones de drop */}
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {TERMINAL_STAGES.map((s) => {
                const active = terminalView === s.key
                const isOver = overTerminal === s.key
                return (
                  <button
                    key={s.key}
                    onClick={() => setTerminalView(active ? null : s.key)}
                    onDragOver={(e) => { e.preventDefault(); if (overTerminal !== s.key) setOverTerminal(s.key) }}
                    onDragLeave={(e) => { if (e.currentTarget === e.target) setOverTerminal(null) }}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (dragId) moveCard(dragId, s.key)
                      setDragId(null); setOverTerminal(null)
                    }}
                    title={`${s.label} — cliquez pour voir, ou glissez une carte ici`}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 7,
                      fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                      color: active || isOver ? "white" : s.color,
                      background: active || isOver ? s.color : s.bg,
                      border: `1px solid ${isOver ? s.color : active ? s.color : "transparent"}`,
                      borderRadius: 9, padding: "7px 12px", cursor: "pointer",
                      transition: "all 120ms",
                    }}
                  >
                    {s.key === "hired" ? "✓" : "✕"} {s.label}
                    <span style={{
                      fontSize: 10.5, fontWeight: 800,
                      color: active || isOver ? "white" : s.color,
                      background: active || isOver ? "rgba(255,255,255,0.22)" : "white",
                      borderRadius: 100, padding: "1px 7px",
                    }}>
                      {terminalCounts[s.key] ?? 0}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {relanceCount > 0 && !terminalView && (
          <div style={{
            flexShrink: 0, marginTop: 10, padding: "9px 14px",
            background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
            borderRadius: 10, display: "flex", alignItems: "center", gap: 9,
            fontSize: 12.5, color: "#92400E",
          }}>
            <span style={{ fontSize: 14 }}>⏰</span>
            <span>
              <strong>{relanceCount} relance{relanceCount > 1 ? "s" : ""} suggérée{relanceCount > 1 ? "s" : ""}</strong>
              {" — "}des candidats stagnent dans une étape (badge ⏰ sur les cartes).
            </span>
          </div>
        )}

        {/* Corps : board · vue terminale · vide */}
        {rows.length === 0 ? (
          <EmptyState />
        ) : terminalView ? (
          <TerminalListView
            stage={TERMINAL_STAGES.find((s) => s.key === terminalView)!}
            rows={terminalRows}
            onReactivate={(id) => moveCard(id, "identified")}
          />
        ) : lanes.length === 0 ? (
          <div style={{
            flex: 1, marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center",
            textAlign: "center", color: "#9CA3AF",
          }}>
            <div>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📥</div>
              <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#111827" }}>
                Aucun candidat dans la pipeline
              </p>
              <p style={{ margin: 0, fontSize: 13, maxWidth: 420 }}>
                Depuis une mission, cliquez <strong>+ Pipeline</strong> sur les candidats à suivre — ils
                apparaîtront ici, par mission.
              </p>
            </div>
          </div>
        ) : (
          /* Swimlanes : mission en ligne × étape en colonne */
          <div style={{ flex: 1, minHeight: 0, marginTop: 14, overflow: "auto", paddingBottom: 14 }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: `200px repeat(${ACTIVE_STAGES.length}, minmax(190px, 1fr))`,
              minWidth: 200 + ACTIVE_STAGES.length * 190,
            }}>
              {/* En-tête de colonnes — figé en haut */}
              <div style={{ ...headerCellStyle, color: "#9CA3AF" }}>Mission</div>
              {ACTIVE_STAGES.map((s) => (
                <div key={s.key} style={{ ...headerCellStyle, display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, display: "inline-block" }} />
                  <span style={{ color: s.color }}>{s.label}</span>
                </div>
              ))}

              {/* Un couloir par mission */}
              {lanes.map((lane) => {
                const open = expandedLanes.has(lane.jobId)
                return (
                  <Fragment key={lane.jobId}>
                    {/* Cellule libellé mission (cliquable) */}
                    <button
                      onClick={() => toggleLane(lane.jobId)}
                      style={{
                        gridColumn: "1",
                        display: "flex", alignItems: "flex-start", gap: 7,
                        textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                        background: "#FBFAFE", border: "none",
                        borderBottom: "1px solid #F0ECF8", borderRight: "1px solid #F0ECF8",
                        padding: "12px 12px",
                      }}
                    >
                      <span style={{
                        fontSize: 11, color: "#7C63C8", marginTop: 1,
                        transform: open ? "rotate(90deg)" : "none",
                        transition: "transform 140ms", display: "inline-block", width: 9,
                      }}>›</span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{
                          display: "block", fontSize: 12.5, fontWeight: 700, color: "#111827",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3,
                        }}>{lane.jobTitle}</span>
                        <span style={{ fontSize: 10.5, color: "#9CA3AF" }}>
                          {lane.activeTotal} candidat{lane.activeTotal > 1 ? "s" : ""}
                        </span>
                      </span>
                    </button>

                    {/* Cellules d'étape */}
                    {ACTIVE_STAGES.map((s) => {
                      const cards = lane.byStage.get(s.key) ?? []
                      const cellKey = `${lane.jobId}:${s.key}`
                      const isOver = overCell === cellKey
                      return (
                        <div
                          key={cellKey}
                          onDragOver={(e) => { e.preventDefault(); if (overCell !== cellKey) setOverCell(cellKey) }}
                          onDragLeave={(e) => { if (e.currentTarget === e.target) setOverCell(null) }}
                          onDrop={(e) => {
                            e.preventDefault()
                            if (dragId) moveCard(dragId, s.key)
                            setDragId(null); setOverCell(null)
                          }}
                          style={{
                            borderBottom: "1px solid #F0ECF8",
                            borderRight: "1px solid #F5F3FB",
                            background: isOver ? "rgba(124,99,200,0.07)" : open ? s.bg : "white",
                            padding: open ? 8 : 0,
                            minHeight: open ? 56 : 40,
                            display: "flex", flexDirection: "column",
                            gap: 8,
                            alignItems: open ? "stretch" : "center",
                            justifyContent: "center",
                            transition: "background 120ms",
                          }}
                        >
                          {open ? (
                            cards.length > 0 ? (
                              cards.map((row) => (
                                <Card
                                  key={row.id}
                                  row={row}
                                  dragging={dragId === row.id}
                                  onDragStart={() => setDragId(row.id)}
                                  onDragEnd={() => { setDragId(null); setOverCell(null) }}
                                  hideJobBadge
                                />
                              ))
                            ) : (
                              <span style={{ fontSize: 11, color: "#D6CCEC" }}>—</span>
                            )
                          ) : (
                            <span style={{
                              fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                              color: cards.length > 0 ? s.color : "#D1D5DB",
                            }}>
                              {cards.length}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </Fragment>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </main>
  )
}

/* ─── Terminal list view (Recruté / Écarté) ─────────────────────── */

function TerminalListView({
  stage, rows, onReactivate,
}: {
  stage: StageMeta
  rows: Row[]
  onReactivate: (id: string) => void
}) {
  return (
    <div style={{ flex: 1, minHeight: 0, marginTop: 14, display: "flex", flexDirection: "column" }}>
      {rows.length === 0 ? (
        <div style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          color: "#9CA3AF", fontSize: 14,
        }}>
          Aucun candidat dans « {stage.label} » pour l&apos;instant.
        </div>
      ) : (
        <div style={{
          flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: 20,
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
          gap: 12, alignContent: "start",
        }}>
          {rows.map((row) => {
            const c = row.candidate
            const name = c?.full_name ?? c?.cv_file_name ?? "Candidat"
            return (
              <div key={row.id} style={{
                background: "white", border: "1px solid #F0ECF8", borderRadius: 12,
                padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                    </p>
                    {c?.current_title && (
                      <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.current_title}
                      </p>
                    )}
                  </div>
                  {row.score != null && (
                    <span style={{
                      flexShrink: 0, fontSize: 11, fontWeight: 800, color: stage.color,
                      background: stage.bg, borderRadius: 100, padding: "1px 8px",
                    }}>{row.score}</span>
                  )}
                </div>
                {row.job && (
                  <span style={{
                    alignSelf: "flex-start", fontSize: 10.5, color: "#6B7280",
                    background: "#F8F6FF", border: "1px solid #F0ECF8",
                    borderRadius: 6, padding: "2px 7px", maxWidth: "100%",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{row.job.title}</span>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 2 }}>
                  <button
                    onClick={() => onReactivate(row.id)}
                    style={{
                      fontSize: 11, fontWeight: 600, color: "#7C63C8",
                      background: "transparent", border: "none", cursor: "pointer",
                      fontFamily: "inherit", padding: 0,
                    }}
                  >
                    ↩ Remettre dans le pipeline
                  </button>
                  <Link href={`/workspace/match/${row.id}`} style={{
                    fontSize: 11, fontWeight: 700, color: "#7C63C8", textDecoration: "none",
                  }}>Ouvrir ▶</Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── Card ─────────────────────────────────────────────────────── */

function Card({
  row, dragging, onDragStart, onDragEnd, hideJobBadge = false,
}: {
  row: Row
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  hideJobBadge?: boolean
}) {
  const c = row.candidate
  const name = c?.full_name ?? c?.cv_file_name ?? "Candidat"
  const relance = needsRelance(row)
  const scoreColor = (row.score ?? 0) >= 80 ? "#15803d" : (row.score ?? 0) >= 60 ? "#7C63C8" : "#B45309"

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        background: "white",
        border: relance ? "1px solid rgba(245,158,11,0.4)" : "1px solid #F0ECF8",
        borderRadius: 11,
        padding: "10px 11px",
        cursor: "grab",
        opacity: dragging ? 0.4 : 1,
        boxShadow: dragging ? "none" : "0 1px 2px rgba(17,24,39,0.04)",
        display: "flex", flexDirection: "column", gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <p style={{
          margin: 0, fontSize: 13, fontWeight: 700, color: "#111827", lineHeight: 1.3,
          overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {name}
        </p>
        {row.score != null && (
          <span style={{
            flexShrink: 0, fontSize: 11, fontWeight: 800, color: scoreColor,
            background: "#F8F6FF", border: "1px solid #F0ECF8",
            borderRadius: 100, padding: "1px 7px",
          }}>
            {row.score}
          </span>
        )}
      </div>

      {c?.current_title && (
        <p style={{
          margin: 0, fontSize: 11.5, color: "#9CA3AF",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {c.current_title}
        </p>
      )}

      {row.job && !hideJobBadge && (
        <span style={{
          alignSelf: "flex-start",
          fontSize: 10.5, color: "#6B7280",
          background: "#F8F6FF", border: "1px solid #F0ECF8",
          borderRadius: 6, padding: "2px 7px",
          maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {row.job.title}
        </span>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 2 }}>
        <span style={{ fontSize: 10.5, color: "#9CA3AF" }}>{timeAgo(row.updated_at)}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {relance && (
            <span title="À relancer — stagne dans cette étape" style={{
              fontSize: 10, fontWeight: 700, color: "#92400E",
              background: "rgba(245,158,11,0.14)", border: "1px solid rgba(245,158,11,0.3)",
              borderRadius: 100, padding: "1px 6px",
            }}>
              ⏰ à relancer
            </span>
          )}
          {/* Primary: open the match workspace for this candidate × job */}
          <Link href={`/workspace/match/${row.id}`} style={{
            fontSize: 10.5, fontWeight: 700, color: "#7C63C8", textDecoration: "none",
          }}>
            Ouvrir ▶
          </Link>
          {/* Secondary: discreet shortcut to the bare candidate identity */}
          {c && (
            <Link href={`/workspace/vivier/${c.id}`} title="Fiche candidat (identité)" style={{
              fontSize: 12, color: "#9CA3AF", textDecoration: "none",
            }}>
              👤
            </Link>
          )}
        </div>
      </div>

    </div>
  )
}

function EmptyState() {
  return (
    <m.div
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      style={{
        marginTop: 40, padding: "72px 36px",
        background: "white", border: "2px dashed #E2DAF6", borderRadius: 22,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 56, marginBottom: 16 }}>📊</div>
      <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: "#111827", letterSpacing: "-0.015em" }}>
        Votre pipeline est vide
      </h2>
      <p style={{ margin: "0 auto 18px", maxWidth: 460, fontSize: 14, color: "#6B7280", lineHeight: 1.65 }}>
        Les candidats apparaissent ici dès qu&apos;ils sont matchés à une mission.
        Créez une mission et lancez le matching pour démarrer.
      </p>
      <Link href="/workspace/missions" style={{
        display: "inline-block",
        padding: "11px 22px", borderRadius: 12,
        background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
        color: "white", fontWeight: 700, fontSize: 14, textDecoration: "none",
        boxShadow: "0 8px 24px -8px rgba(124,99,200,0.5)",
      }}>
        Aller aux missions
      </Link>
    </m.div>
  )
}
