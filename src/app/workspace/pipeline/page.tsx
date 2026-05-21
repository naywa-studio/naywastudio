"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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

const STAGES: { key: PipelineStage; label: string; color: string; bg: string }[] = [
  { key: "identified", label: "Identifié", color: "#6B7280", bg: "#F9FAFB" },
  { key: "contacted",  label: "Contacté",  color: "#2563EB", bg: "rgba(37,99,235,0.05)" },
  { key: "replied",    label: "Réponse",   color: "#7C63C8", bg: "rgba(124,99,200,0.05)" },
  { key: "interview",  label: "Entretien", color: "#B45309", bg: "rgba(245,158,11,0.06)" },
  { key: "offer",      label: "Offre",     color: "#15803d", bg: "rgba(34,197,94,0.06)" },
  { key: "hired",      label: "Recruté",   color: "#0F766E", bg: "rgba(15,118,110,0.06)" },
  { key: "rejected",   label: "Écarté",    color: "#9CA3AF", bg: "#F9FAFB" },
]

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

type GroupMode = "by-job" | "flat"

export default function PipelinePage() {
  const sb = useMemo(() => getSupabase(), [])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<PipelineStage | null>(null)
  const [groupMode, setGroupMode] = useState<GroupMode>("by-job")
  const [jobFilter, setJobFilter] = useState<string>("")
  const [showWeak, setShowWeak] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  /** Below-threshold matches clutter the pipeline. Manually assigned
   *  candidates (score === null) are always kept visible. */
  const SCORE_THRESHOLD = 60

  const toggleCollapsed = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const load = useCallback(async () => {
    const { data } = await sb
      .from("match_assessments")
      .select("*, candidate:candidates(id, full_name, current_title, cv_file_name), job:jobs(id, title)")
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
    let out = jobFilter ? rows.filter((r) => r.job?.id === jobFilter) : rows
    if (!showWeak) {
      out = out.filter((r) => r.score == null || r.score >= SCORE_THRESHOLD)
    }
    return out
  }, [rows, jobFilter, showWeak])

  const weakCount = useMemo(
    () => (jobFilter ? rows.filter((r) => r.job?.id === jobFilter) : rows)
      .filter((r) => r.score != null && r.score < SCORE_THRESHOLD).length,
    [rows, jobFilter],
  )

  const byStage = useMemo(() => {
    const map = new Map<PipelineStage, Row[]>()
    for (const s of STAGES) map.set(s.key, [])
    for (const r of filteredRows) {
      const arr = map.get(r.pipeline_stage)
      if (arr) arr.push(r)
    }
    return map
  }, [filteredRows])

  const relanceCount = useMemo(() => filteredRows.filter(needsRelance).length, [filteredRows])

  if (loading) {
    return <NoraLoader />
  }

  return (
    <main style={{
      minHeight: "calc(100vh - 60px)",
      padding: "40px 24px 60px",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ marginBottom: 8 }}>
          <span style={{
            display: "inline-block",
            fontSize: 11, fontWeight: 700, color: "#7C63C8",
            background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.18)",
            padding: "4px 11px", borderRadius: 100,
            letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12,
          }}>
            Pipeline
          </span>
          <h1 style={{ margin: 0, fontSize: "clamp(26px, 3vw, 34px)", fontWeight: 800, color: "#111827", letterSpacing: "-0.025em", lineHeight: 1.1 }}>
            Suivi candidat
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "#6B7280", lineHeight: 1.6 }}>
            {rows.length === 0
              ? "Vos candidats matchés apparaîtront ici, étape par étape."
              : "Glissez une carte d'une colonne à l'autre pour faire avancer un candidat."}
          </p>
        </div>

        {/* Controls: filter + grouping toggle */}
        {rows.length > 0 && allJobs.length > 0 && (
          <div style={{
            marginTop: 18, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
          }}>
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
            <div style={{ display: "flex", border: "1px solid #E5E7EB", borderRadius: 9, overflow: "hidden" }}>
              {([
                { key: "by-job" as GroupMode, label: "Groupé par mission" },
                { key: "flat"   as GroupMode, label: "Vue à plat" },
              ]).map((m) => (
                <button
                  key={m.key}
                  onClick={() => setGroupMode(m.key)}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: "7px 12px",
                    border: "none", cursor: "pointer", fontFamily: "inherit",
                    background: groupMode === m.key ? "#7C63C8" : "white",
                    color: groupMode === m.key ? "white" : "#6B7280",
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {weakCount > 0 && (
              <button
                onClick={() => setShowWeak((v) => !v)}
                title="Les matches < 60 sont masqués par défaut pour ne pas parasiter le pipeline"
                style={{
                  fontSize: 12, fontWeight: 600,
                  color: showWeak ? "#7C63C8" : "#9CA3AF",
                  background: showWeak ? "rgba(124,99,200,0.08)" : "white",
                  border: `1px solid ${showWeak ? "rgba(124,99,200,0.25)" : "#E5E7EB"}`,
                  borderRadius: 9, padding: "7px 12px",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {showWeak ? "✓ " : ""}Inclure les {weakCount} match{weakCount > 1 ? "s" : ""} faible{weakCount > 1 ? "s" : ""} (&lt;60)
              </button>
            )}
          </div>
        )}

        {relanceCount > 0 && (
          <m.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            style={{
              marginTop: 18, padding: "12px 16px",
              background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
              borderRadius: 12, display: "flex", alignItems: "center", gap: 10,
              fontSize: 13.5, color: "#92400E",
            }}
          >
            <span style={{ fontSize: 16 }}>⏰</span>
            <span>
              <strong>{relanceCount} relance{relanceCount > 1 ? "s" : ""} suggérée{relanceCount > 1 ? "s" : ""}</strong>
              {" — "}des candidats stagnent dans une étape. Repérez le badge ⏰ sur les cartes.
            </span>
          </m.div>
        )}

        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{
            marginTop: 22,
            display: "flex", gap: 14,
            overflowX: "auto", paddingBottom: 16,
          }}>
            {STAGES.map((stage) => {
              const cards = byStage.get(stage.key) ?? []
              const isOver = overStage === stage.key
              return (
                <div
                  key={stage.key}
                  onDragOver={(e) => { e.preventDefault(); if (overStage !== stage.key) setOverStage(stage.key) }}
                  onDragLeave={(e) => { if (e.currentTarget === e.target) setOverStage(null) }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragId) moveCard(dragId, stage.key)
                    setDragId(null); setOverStage(null)
                  }}
                  style={{
                    flex: "0 0 248px",
                    background: isOver ? "rgba(124,99,200,0.06)" : stage.bg,
                    border: isOver ? "1.5px dashed #7C63C8" : "1px solid #F0ECF8",
                    borderRadius: 14,
                    padding: 10,
                    display: "flex", flexDirection: "column", gap: 8,
                    minHeight: 200,
                    transition: "background 120ms, border-color 120ms",
                  }}
                >
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "4px 6px 6px",
                  }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: stage.color, letterSpacing: "0.02em" }}>
                      {stage.label}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: "#9CA3AF",
                      background: "white", border: "1px solid #F0ECF8",
                      borderRadius: 100, padding: "1px 7px",
                    }}>
                      {cards.length}
                    </span>
                  </div>

                  {groupMode === "by-job" ? (
                    groupByJob(cards).map(({ jobId, jobTitle, jobCards }) => {
                      const key = `${stage.key}:${jobId}`
                      const open = !collapsed.has(key)
                      return (
                        <div key={key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <button
                            onClick={() => toggleCollapsed(key)}
                            style={{
                              display: "flex", alignItems: "center", gap: 6,
                              background: "transparent", border: "none",
                              padding: "4px 6px", cursor: "pointer", fontFamily: "inherit",
                              textAlign: "left",
                            }}
                          >
                            <span style={{
                              fontSize: 10, color: "#7C63C8",
                              transform: open ? "rotate(90deg)" : "none",
                              transition: "transform 140ms",
                              display: "inline-block", width: 8,
                            }}>
                              ›
                            </span>
                            <span style={{
                              fontSize: 10.5, fontWeight: 700, color: "#4B5563",
                              flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {jobTitle}
                            </span>
                            <span style={{
                              fontSize: 10, fontWeight: 700, color: "#9CA3AF",
                              background: "white", border: "1px solid #F0ECF8",
                              borderRadius: 100, padding: "0 6px",
                            }}>
                              {jobCards.length}
                            </span>
                          </button>
                          {open && jobCards.map((row) => (
                            <Card
                              key={row.id}
                              row={row}
                              dragging={dragId === row.id}
                              onDragStart={() => setDragId(row.id)}
                              onDragEnd={() => { setDragId(null); setOverStage(null) }}
                              hideJobBadge
                            />
                          ))}
                        </div>
                      )
                    })
                  ) : (
                    cards.map((row) => (
                      <Card
                        key={row.id}
                        row={row}
                        dragging={dragId === row.id}
                        onDragStart={() => setDragId(row.id)}
                        onDragEnd={() => { setDragId(null); setOverStage(null) }}
                      />
                    ))
                  )}

                  {cards.length === 0 && (
                    <div style={{
                      padding: "16px 8px", textAlign: "center",
                      fontSize: 11.5, color: "#C4B6E0",
                    }}>
                      Déposez ici
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

      </div>
    </main>
  )
}

/* ─── Grouping helpers ──────────────────────────────────────────── */

function groupByJob(rows: Row[]): { jobId: string; jobTitle: string; jobCards: Row[] }[] {
  const map = new Map<string, { jobTitle: string; jobCards: Row[] }>()
  for (const r of rows) {
    const id = r.job?.id ?? "_none"
    const title = r.job?.title ?? "Sans mission"
    const entry = map.get(id)
    if (entry) entry.jobCards.push(r)
    else map.set(id, { jobTitle: title, jobCards: [r] })
  }
  // Stable order: most cards first, then alphabetical.
  return Array.from(map, ([jobId, v]) => ({ jobId, jobTitle: v.jobTitle, jobCards: v.jobCards }))
    .sort((a, b) => b.jobCards.length - a.jobCards.length || a.jobTitle.localeCompare(b.jobTitle))
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
