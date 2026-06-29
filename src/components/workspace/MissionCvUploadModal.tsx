"use client"

/**
 * Modale "Importer des CVs pour cette mission" (E1).
 *
 * Workflow par CV (concurrence 5) :
 *   1. POST /api/cv/upload        → crée la fiche candidat (parse_status="parsing")
 *   2. POST /api/cv/[id]/parse    → parse PDF + LLM (~5-10 s)
 *   3. POST /api/match/score-one  → score contre cette mission spécifique
 *
 * Une fois un CV scoré, la fiche mission le voit apparaître via realtime
 * sur match_assessments. La modale affiche l'état de chaque fichier en
 * temps réel (uploading → parsing → scoring → done/error).
 */

import { useCallback, useRef, useState } from "react"
import { useEscapeKey } from "@/components/ui/useEscapeKey"

const MAX_BYTES = 10 * 1024 * 1024
const CONCURRENCY = 5

type Stage = "uploading" | "parsing" | "scoring" | "done" | "duplicate" | "error"
interface FileJob {
  id: string
  fileName: string
  size: number
  stage: Stage
  error?: string
  score?: number
  tier?: "excellent" | "good" | "fair" | "poor"
}

export function MissionCvUploadModal({
  jobId, jobLabel, onClose, onAnyScored,
}: {
  jobId: string
  jobLabel: string
  onClose: () => void
  /** Fired after at least one CV has been scored, so the parent can
   *  refetch match_assessments without waiting for realtime. */
  onAnyScored?: () => void
}) {
  useEscapeKey(onClose)

  const [jobs, setJobs] = useState<FileJob[]>([])
  const [busy, setBusy] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const patch = useCallback((id: string, p: Partial<FileJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...p } : j)))
  }, [])

  const processOne = useCallback(async (id: string, file: File) => {
    try {
      // 1) Upload — crée la candidate row.
      patch(id, { stage: "uploading" })
      const fd = new FormData()
      fd.append("file", file, file.name)
      const uploadRes = await fetch("/api/cv/upload", { method: "POST", body: fd })
      const uploadData = await uploadRes.json().catch(() => ({} as Record<string, unknown>))
      if (!uploadRes.ok || uploadData?.error) {
        throw new Error(String(uploadData?.message ?? uploadData?.error ?? `Upload échoué (${uploadRes.status})`))
      }
      const cand = (uploadData as { candidate?: { id?: string; parse_status?: string } }).candidate
      const candId = cand?.id
      const isDuplicate = (uploadData as { duplicate?: boolean }).duplicate === true
      if (!candId) throw new Error("candidate_id manquant")

      // 2) Parse — uniquement si nouveau candidat ET pas déjà parsé.
      //    Un doublon parsé saute direct au scoring (gain ~5-10 s).
      if (!isDuplicate && cand?.parse_status !== "parsed") {
        patch(id, { stage: "parsing" })
        const parseRes = await fetch(`/api/cv/${candId}/parse`, { method: "POST" })
        const parseData = await parseRes.json().catch(() => ({} as Record<string, unknown>))
        if (!parseRes.ok || parseData?.error) {
          throw new Error(String(parseData?.message ?? parseData?.error ?? "Parse échoué"))
        }
      }

      // 3) Score contre cette mission spécifiquement.
      patch(id, { stage: "scoring" })
      const scoreRes = await fetch("/api/match/score-one", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: candId, job_id: jobId }),
      })
      const scoreData = await scoreRes.json().catch(() => ({} as Record<string, unknown>))
      if (!scoreRes.ok || scoreData?.error) {
        throw new Error(String(scoreData?.message ?? scoreData?.error ?? "Scoring échoué"))
      }
      const result = (scoreData as { result?: { score?: number; tier?: FileJob["tier"] } }).result
      patch(id, {
        stage: isDuplicate ? "duplicate" : "done",
        score: result?.score,
        tier: result?.tier,
      })
      onAnyScored?.()
    } catch (err) {
      patch(id, { stage: "error", error: (err as Error).message })
    }
  }, [jobId, onAnyScored, patch])

  const enqueue = useCallback(async (files: File[]) => {
    const pending: Array<{ id: string; file: File }> = []
    const invalid: FileJob[] = []
    for (const f of files) {
      const id = crypto.randomUUID()
      const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
      if (!isPdf) {
        invalid.push({ id, fileName: f.name, size: f.size, stage: "error", error: "Format non supporté (PDF uniquement)." })
        continue
      }
      if (f.size > MAX_BYTES) {
        invalid.push({ id, fileName: f.name, size: f.size, stage: "error", error: "Fichier > 10 Mo." })
        continue
      }
      pending.push({ id, file: f })
    }

    setJobs((prev) => [
      ...invalid,
      ...pending.map<FileJob>(({ id, file }) => ({
        id, fileName: file.name, size: file.size, stage: "uploading",
      })),
      ...prev,
    ].slice(0, 500))

    if (pending.length === 0) return
    setBusy(true)
    const queue = [...pending]
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const next = queue.shift()
        if (!next) return
        await processOne(next.id, next.file)
      }
    })
    await Promise.all(workers)
    setBusy(false)
  }, [processOne])

  const onPick = (files: FileList | null) => {
    if (!files || files.length === 0) return
    void enqueue(Array.from(files))
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const files = Array.from(e.dataTransfer?.files ?? [])
    if (files.length) void enqueue(files)
  }
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!isDragging) setIsDragging(true)
  }
  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setIsDragging(false)
  }

  const doneCount = jobs.filter((j) => j.stage === "done").length
  const errorCount = jobs.filter((j) => j.stage === "error").length

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(17,24,39,0.40)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: "var(--font-inter), sans-serif",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 640, maxHeight: "90vh",
        background: "white", borderRadius: 16, padding: 24,
        boxShadow: "0 20px 50px -20px rgba(17,24,39,0.30)",
        display: "flex", flexDirection: "column",
      }}>
        <header style={{ marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#111827", letterSpacing: "-0.01em" }}>
            Importer des CVs
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#6B7280", lineHeight: 1.55 }}>
            Pour la mission <strong>{jobLabel}</strong>. Chaque CV est ajouté au vivier
            et scoré immédiatement contre cette mission.
          </p>
        </header>

        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => inputRef.current?.click()}
          style={{
            padding: "28px 18px",
            borderRadius: 12,
            border: `2px dashed ${isDragging ? "#7C63C8" : "#E2DAF6"}`,
            background: isDragging ? "rgba(124,99,200,0.05)" : "#FAFAFA",
            textAlign: "center", cursor: "pointer",
            transition: "all 150ms",
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
          <p style={{ margin: "0 0 4px", fontSize: 13.5, fontWeight: 700, color: "#111827" }}>
            Glissez vos PDFs ici ou cliquez pour parcourir
          </p>
          <p style={{ margin: 0, fontSize: 11.5, color: "#9CA3AF" }}>
            PDF uniquement · 10 Mo max · jusqu&apos;à 500 CVs par lot
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            onChange={(e) => onPick(e.target.files)}
            style={{ display: "none" }}
          />
        </div>

        {jobs.length > 0 && (
          <>
            <div style={{
              display: "flex", gap: 12, marginBottom: 10,
              fontSize: 12, color: "#6B7280",
            }}>
              <span><strong style={{ color: "#15803D" }}>{doneCount}</strong> traités</span>
              {errorCount > 0 && <span><strong style={{ color: "#B91C1C" }}>{errorCount}</strong> en erreur</span>}
              <span style={{ marginLeft: "auto", color: "#9CA3AF" }}>{jobs.length} fichier{jobs.length > 1 ? "s" : ""}</span>
            </div>
            <ul style={{
              listStyle: "none", margin: 0, padding: 0,
              maxHeight: 320, overflowY: "auto",
              border: "1px solid #F0ECF8", borderRadius: 10,
            }}>
              {jobs.map((j) => (
                <li key={j.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 12px",
                  borderBottom: "1px solid #F4F1FA",
                  fontSize: 12.5,
                }}>
                  <span style={{ flex: 1, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {j.fileName}
                  </span>
                  <StageBadge stage={j.stage} score={j.score} tier={j.tier} error={j.error} />
                </li>
              ))}
            </ul>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "9px 16px", borderRadius: 9,
              border: "1px solid #E5E7EB", background: "white",
              color: "#374151", fontSize: 13, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {busy ? "Fermer (en cours)" : "Fermer"}
          </button>
        </div>
      </div>
    </div>
  )
}

function StageBadge({
  stage, score, tier, error,
}: { stage: Stage; score?: number; tier?: FileJob["tier"]; error?: string }) {
  if ((stage === "done" || stage === "duplicate") && score !== undefined && tier) {
    const palette = TIER_COLORS[tier]
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        {stage === "duplicate" && (
          <span title="Ce CV était déjà dans votre vivier. Il a juste été scoré contre cette mission." style={{
            fontSize: 9.5, fontWeight: 700, color: "#B45309",
            background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.28)",
            borderRadius: 999, padding: "1px 6px",
            letterSpacing: "0.04em", textTransform: "uppercase",
          }}>
            Doublon
          </span>
        )}
        <span style={{
          fontSize: 11, fontWeight: 700, color: palette.color,
          background: palette.bg, border: `1px solid ${palette.border}`,
          borderRadius: 999, padding: "2px 9px",
          whiteSpace: "nowrap",
        }}>
          {score}/100 · {TIER_LABELS[tier]}
        </span>
      </span>
    )
  }
  if (stage === "error") {
    return (
      <span title={error} style={{
        fontSize: 11, fontWeight: 700, color: "#B91C1C",
        background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.25)",
        borderRadius: 999, padding: "2px 9px",
        whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis",
      }}>
        ✕ {error?.slice(0, 30) ?? "erreur"}
      </span>
    )
  }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 11, fontWeight: 600, color: "#7C63C8",
    }}>
      <span style={{
        width: 9, height: 9, borderRadius: "50%",
        border: "2px solid rgba(124,99,200,0.25)",
        borderTopColor: "#7C63C8",
        animation: "miss-upload-spin 0.9s linear infinite",
        display: "inline-block",
      }} />
      {STAGE_LABELS[stage]}
      <style>{`@keyframes miss-upload-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  )
}

const STAGE_LABELS: Record<Stage, string> = {
  uploading: "Upload…",
  parsing: "Lecture du CV…",
  scoring: "Scoring…",
  done: "Fait",
  duplicate: "Doublon",
  error: "Erreur",
}
const TIER_LABELS: Record<NonNullable<FileJob["tier"]>, string> = {
  excellent: "Excellent",
  good: "Bon",
  fair: "Moyen",
  poor: "Faible",
}
const TIER_COLORS: Record<NonNullable<FileJob["tier"]>, { color: string; bg: string; border: string }> = {
  excellent: { color: "#15803D", bg: "rgba(34,197,94,0.10)", border: "rgba(34,197,94,0.30)" },
  good:      { color: "#15803D", bg: "rgba(34,197,94,0.06)", border: "rgba(34,197,94,0.20)" },
  fair:      { color: "#B45309", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)" },
  poor:      { color: "#6B7280", bg: "#F3F4F6",                border: "#E5E7EB" },
}
