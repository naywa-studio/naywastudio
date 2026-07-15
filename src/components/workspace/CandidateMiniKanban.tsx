"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { getSupabase } from "@/lib/supabase"
import type { MatchAssessment, PipelineStage } from "@/lib/database.types"
import RejectReasonPicker from "@/components/workspace/RejectReasonPicker"
import type { RejectReason } from "@/lib/reject-reasons"

/**
 * Mini horizontal kanban scoped to one candidate.
 *
 * Renders every match the candidate has against any job, distributed across
 * the 6 pipeline stages so the sourcer can see "where is this person in
 * every pipeline at a glance" — and drag cards to advance / rewind, just
 * like the main /pipeline view. The currently-open match (the one whose
 * page hosts this kanban) is visually highlighted.
 *
 * Drag-and-drop reuses the same PATCH /api/match/:id/stage endpoint used
 * elsewhere; we update local state optimistically.
 */

type Row = Pick<MatchAssessment, "id" | "job_id" | "score" | "match_tier" | "pipeline_stage" | "updated_at"> & {
  job: { id: string; title: string } | null
}

// Étapes alignées sur la pipeline (colonne Pricing retirée). 'hired' et
// 'rejected' sont conservés ici pour qu'un candidat à une issue terminale
// reste visible dans ce mini-kanban contextuel.
const STAGES: { key: PipelineStage; label: string; color: string; bg: string }[] = [
  { key: "identified", label: "Identifié", color: "#6B7280", bg: "#F9FAFB" },
  { key: "contacted",  label: "Contacté",  color: "#2563EB", bg: "rgba(37,99,235,0.05)" },
  { key: "replied",    label: "Réponse",   color: "#7C63C8", bg: "rgba(124,99,200,0.05)" },
  { key: "interview",  label: "Entretien", color: "#B45309", bg: "rgba(245,158,11,0.06)" },
  { key: "offer",      label: "Offre",     color: "#15803d", bg: "rgba(34,197,94,0.06)" },
  { key: "hired",      label: "Recruté",   color: "#0F766E", bg: "rgba(15,118,110,0.06)" },
  { key: "rejected",   label: "Écarté",    color: "#6B7280", bg: "#F3F4F6" },
]

/** Legacy 'pricing' rows (colonne supprimée) → rangées dans 'identified'. */
function displayStage(s: PipelineStage): PipelineStage {
  return s === "pricing" ? "identified" : s
}

export default function CandidateMiniKanban({
  candidateId,
  candidateName = null,
  highlightMatchId,
  layout = "horizontal",
  onlyMatchId,
  readOnly = false,
}: {
  candidateId: string
  /** Nom du candidat — utilisé dans la modale "raison du rejet" pour
   *  personnaliser la question. */
  candidateName?: string | null
  /** The current match's id — that card gets the purple "vous êtes ici" treatment. */
  highlightMatchId: string
  /** "horizontal" = column-per-stage scrolling row (default).
   *  "vertical"   = stages stacked top-to-bottom, fits a sidebar. */
  layout?: "horizontal" | "vertical"
  /** When set, only the card for this match id is shown — the other
   *  matches the candidate has are hidden so the rail mirrors the job
   *  picker upstream. */
  onlyMatchId?: string
  /** Lecture seule : le drag & drop est désactivé (mutation bloquée serveur). */
  readOnly?: boolean
}) {
  const sb = useMemo(() => getSupabase(), [])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<PipelineStage | null>(null)
  /** Quand on déclenche un passage vers 'rejected', on n'écrit pas tout de
   *  suite : on ouvre une modale qui collecte la raison, puis on commit. */
  const [pendingReject, setPendingReject] = useState<{ rowId: string; name: string } | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await sb
        .from("match_assessments")
        .select("id, job_id, score, match_tier, pipeline_stage, updated_at, job:jobs(id, title)")
        .eq("candidate_id", candidateId)
      if (!mounted) return
      setRows((data ?? []) as unknown as Row[])
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [candidateId, sb])

  const commitMove = async (
    rowId: string,
    stage: PipelineStage,
    extra: { reject_reason?: RejectReason | null; reject_reason_note?: string | null } = {},
  ) => {
    setRows((prev) => prev.map((r) =>
      r.id === rowId ? { ...r, pipeline_stage: stage, updated_at: new Date().toISOString() } : r,
    ))
    const res = await fetch(`/api/match/${rowId}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_stage: stage, ...extra }),
    })
    if (!res.ok) {
      const { data } = await sb
        .from("match_assessments")
        .select("id, job_id, score, match_tier, pipeline_stage, updated_at, job:jobs(id, title)")
        .eq("candidate_id", candidateId)
      setRows((data ?? []) as unknown as Row[])
    }
  }

  const moveCard = async (rowId: string, stage: PipelineStage) => {
    if (readOnly) return
    const row = rows.find((r) => r.id === rowId)
    if (!row || row.pipeline_stage === stage) return
    // Passage vers 'rejected' : on diffère le commit, on ouvre la modale
    // qui collecte la raison et appelle commitMove avec l'extra.
    if (stage === "rejected") {
      setPendingReject({
        rowId,
        name: candidateName?.trim() || "ce candidat",
      })
      return
    }
    void commitMove(rowId, stage)
  }

  const visibleRows = useMemo(
    () => onlyMatchId ? rows.filter((r) => r.id === onlyMatchId) : rows,
    [rows, onlyMatchId],
  )

  const byStage = useMemo(() => {
    const map = new Map<PipelineStage, Row[]>()
    for (const s of STAGES) map.set(s.key, [])
    for (const r of visibleRows) {
      const arr = map.get(displayStage(r.pipeline_stage))
      if (arr) arr.push(r)
    }
    return map
  }, [visibleRows])

  if (loading) {
    return <div style={{ padding: 14, fontSize: 12, color: "#6B7280" }}>Chargement du pipeline…</div>
  }

  const vertical = layout === "vertical"

  return (
    <section style={{
      background: "white", borderRadius: 14, border: "1px solid #F0ECF8",
      padding: vertical ? 12 : 14,
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: vertical ? "flex-start" : "center",
        flexDirection: vertical ? "column" : "row",
        gap: vertical ? 4 : 0,
        marginBottom: 10, padding: "0 4px",
      }}>
        <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#6B7280", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {onlyMatchId
            ? "Pipeline de ce match"
            : `Dans le pipeline · ${rows.length} poste${rows.length > 1 ? "s" : ""}`}
        </h3>
        <span style={{ fontSize: 10.5, color: "#6B7280", fontStyle: "italic" }}>
          {readOnly ? "Lecture seule" : vertical ? "Glissez pour avancer" : "Glissez une carte pour avancer / reculer"}
        </span>
      </div>
      <div style={{
        display: "flex",
        gap: vertical ? 6 : 8,
        overflowX: vertical ? "visible" : "auto",
        flexDirection: vertical ? "column" : "row",
        paddingBottom: vertical ? 0 : 4,
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
                flex: vertical ? "0 0 auto" : "0 0 168px",
                background: isOver ? "rgba(124,99,200,0.08)" : stage.bg,
                border: isOver ? "1.5px dashed #7C63C8" : "1px solid #F0ECF8",
                borderRadius: 9, padding: vertical ? 7 : 8,
                display: "flex", flexDirection: "column", gap: 6,
                minHeight: vertical ? 0 : 90,
                transition: "background 120ms, border-color 120ms",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 4px" }}>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: stage.color }}>{stage.label}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: "#6B7280",
                  background: "white", borderRadius: 100, padding: "0 6px", border: "1px solid #F0ECF8",
                }}>
                  {cards.length}
                </span>
              </div>
              {cards.map((r) => {
                const isCurrent = r.id === highlightMatchId
                return (
                  <div
                    key={r.id}
                    draggable={!readOnly}
                    onDragStart={readOnly ? undefined : () => setDragId(r.id)}
                    onDragEnd={readOnly ? undefined : () => { setDragId(null); setOverStage(null) }}
                    style={{
                      background: isCurrent ? "rgba(124,99,200,0.10)" : "white",
                      border: isCurrent ? "1px solid #7C63C8" : "1px solid #F0ECF8",
                      borderRadius: 7,
                      padding: "7px 9px",
                      cursor: readOnly ? "default" : "grab",
                      opacity: dragId === r.id ? 0.5 : 1,
                      boxShadow: isCurrent ? "0 2px 8px -2px rgba(124,99,200,0.25)" : "none",
                    }}
                  >
                    {isCurrent ? (
                      <div style={{ fontSize: 9, fontWeight: 800, color: "#7C63C8", letterSpacing: "0.04em", marginBottom: 2 }}>● ICI</div>
                    ) : null}
                    <div style={{
                      fontSize: 11.5, fontWeight: 700, color: "#111827",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {r.job?.title ?? "Sans poste"}
                    </div>
                    <div style={{
                      fontSize: 10.5, color: "#6B7280", marginTop: 1,
                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6,
                    }}>
                      <span>{r.score != null ? `${r.score}` : "manuel"}</span>
                      {!isCurrent && r.id && (
                        <Link href={`/workspace/match/${r.id}`} style={{ color: "#7C63C8", fontWeight: 700 }}>→</Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <RejectReasonPicker
        open={pendingReject !== null}
        candidateName={pendingReject?.name ?? "ce candidat"}
        onCancel={() => setPendingReject(null)}
        onConfirm={(reason, note) => {
          const target = pendingReject
          setPendingReject(null)
          if (!target) return
          void commitMove(target.rowId, "rejected", {
            reject_reason: reason,
            reject_reason_note: note,
          })
        }}
      />
    </section>
  )
}
