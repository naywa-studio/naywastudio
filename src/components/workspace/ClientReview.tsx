"use client"

/**
 * Revue client — 3ᵉ niveau de l'entonnoir (segment cabinet/ESN).
 *
 * Candidats > Shortlist > Revue client. Vue focalisée sur les candidats qui
 * ont atteint le client, avec une vision globale exploitable : présentés,
 * recrutés, écartés + les motifs.
 *
 * ENTRÉE SANS FRICTION : anonymiser un CV = le préparer pour le client. Dès
 * qu'un candidat est anonymisé (batch shortlist ou fiche match), il apparaît
 * ici dans « Anonymisés » — pas de bouton manuel « présenter ».
 *
 * ISSUES (verdict) = stade kanban : Recruté (`hired`) / Écarté (`rejected`,
 * avec motif via le picker partagé). Un candidat sans issue reste dans
 * « Anonymisés ». Le retour libre du client vit dans `client_feedback_note`.
 */

import { useState } from "react"
import Link from "next/link"
import type { MatchAssessment, Candidate, PipelineStage } from "@/lib/database.types"
import { candidateRefLabel } from "@/lib/candidate-ref"
import { rejectReasonLabel, type RejectReason } from "@/lib/reject-reasons"
import RejectReasonPicker from "@/components/workspace/RejectReasonPicker"

type Lang = "fr" | "en"
type AssessmentRow = MatchAssessment & { candidate: Candidate | null }

type Section = "anonymises" | "hired" | "rejected"
const SECTIONS: Section[] = ["anonymises", "hired", "rejected"]

const SECTION_META: Record<Section, { accent: string; bg: string; bd: string }> = {
  anonymises: { accent: "var(--nw-primary)", bg: "rgba(124,99,200,0.06)", bd: "rgba(124,99,200,0.22)" },
  hired:      { accent: "#0F766E",           bg: "rgba(34,197,94,0.06)",  bd: "rgba(34,197,94,0.24)" },
  rejected:   { accent: "var(--nw-text-muted)", bg: "var(--nw-neutral-100)", bd: "var(--nw-border)" },
}

const copy = {
  fr: {
    header: (client: string) => `Suivi du process client — ${client}`,
    intro: "Un candidat apparaît ici dès que son CV est anonymisé (depuis la Shortlist ou une fiche match) — l'anonymisation vaut présentation. Marquez ensuite l'issue.",
    sectionLabels: { anonymises: "Anonymisés · à présenter", hired: "Recrutés", rejected: "Écartés" } as Record<Section, string>,
    emptyTitle: "Aucun candidat présenté au client",
    emptyBody: "Anonymisez un CV depuis la Shortlist ou une fiche match : le candidat apparaîtra ici automatiquement.",
    score: "Score",
    matchSheet: "Fiche match",
    recruited: "Recruté",
    dropped: "Écarté",
    notePlaceholder: "Retour du client (optionnel) — ex : à ajuster, revoir la fourchette…",
    saving: "Enregistrement…",
    readOnly: "Lecture seule",
    noName: "Candidat sans nom",
    droppedFor: "Motif :",
  },
  en: {
    header: (client: string) => `Client process tracking — ${client}`,
    intro: "A candidate shows up here as soon as their CV is anonymized (from the Shortlist or a match sheet) — anonymizing means presenting. Then record the outcome.",
    sectionLabels: { anonymises: "Anonymized · to present", hired: "Recruited", rejected: "Dropped" } as Record<Section, string>,
    emptyTitle: "No candidate presented to the client",
    emptyBody: "Anonymize a CV from the Shortlist or a match sheet: the candidate will appear here automatically.",
    score: "Score",
    matchSheet: "Match sheet",
    recruited: "Recruited",
    dropped: "Dropped",
    notePlaceholder: "Client's feedback (optional) — e.g. to adjust, revise the range…",
    saving: "Saving…",
    readOnly: "Read-only",
    noName: "Unnamed candidate",
    droppedFor: "Reason:",
  },
}

interface Props {
  clientName: string
  rows: AssessmentRow[]
  isReadOnly: boolean
  onLocalUpdate: (rowId: string, patch: Partial<MatchAssessment>) => void
  lang: Lang
}

function sectionOf(row: AssessmentRow): Section {
  if (row.pipeline_stage === "hired") return "hired"
  if (row.pipeline_stage === "rejected") return "rejected"
  return "anonymises"
}

export function ClientReview({ clientName, rows, isReadOnly, onLocalUpdate, lang }: Props) {
  const t = copy[lang]
  const [rejecting, setRejecting] = useState<AssessmentRow | null>(null)

  // Candidats ayant atteint le client = anonymisés, OU déjà tranchés
  // (recruté/écarté) même sans anonymisation formelle.
  const clientRows = rows.filter(
    (r) => r.anonymized_at != null || r.pipeline_stage === "hired" || r.pipeline_stage === "rejected",
  )

  // Passe un candidat à un stade (issue). Optimiste.
  const patchStage = async (row: AssessmentRow, stage: PipelineStage, reason?: RejectReason | null, note?: string | null) => {
    if (isReadOnly) return
    const prev = row.pipeline_stage
    onLocalUpdate(row.id, {
      pipeline_stage: stage,
      ...(stage === "rejected" ? { reject_reason: reason ?? null, reject_reason_note: note ?? null } : {}),
    })
    const res = await fetch(`/api/match/${row.id}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_stage: stage, ...(stage === "rejected" ? { reject_reason: reason, reject_reason_note: note } : {}) }),
    })
    if (!res.ok) onLocalUpdate(row.id, { pipeline_stage: prev })
  }

  // Bascule une issue : Recruté / Écarté (picker) ; reclic sur l'issue active
  // = retour dans « Anonymisés » (stade en cours).
  const toggleOutcome = (row: AssessmentRow, outcome: "hired" | "rejected") => {
    if (isReadOnly) return
    if (row.pipeline_stage === outcome) { void patchStage(row, "interview"); return }
    if (outcome === "rejected") { setRejecting(row); return }
    void patchStage(row, "hired")
  }

  if (clientRows.length === 0) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center" }}>
        <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "var(--nw-text)" }}>{t.emptyTitle}</p>
        <p style={{ margin: 0, fontSize: 13, color: "var(--nw-text-muted)", maxWidth: 460, marginInline: "auto", lineHeight: 1.6 }}>{t.emptyBody}</p>
      </div>
    )
  }

  return (
    <div>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--nw-text-muted)", lineHeight: 1.6 }}>
        <strong style={{ color: "var(--nw-text-body)" }}>{t.header(clientName)}</strong>
        <br />
        {t.intro}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {SECTIONS.map((section) => {
          const meta = SECTION_META[section]
          const list = clientRows.filter((r) => sectionOf(r) === section)
          return (
            <section key={section} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: meta.accent }} />
                <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: "var(--nw-text)", letterSpacing: "0.03em", textTransform: "uppercase", fontFamily: "var(--nw-font-mono)" }}>
                  {t.sectionLabels[section]}
                </h3>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--nw-text-muted)" }}>{list.length}</span>
              </div>
              {list.length === 0 ? (
                <div style={{ padding: "18px 12px", borderRadius: 12, border: "1px dashed var(--nw-border)", textAlign: "center", fontSize: 12, color: "var(--nw-text-muted)" }}>—</div>
              ) : (
                list.map((row) => (
                  <ReviewCard key={row.id} row={row} meta={meta} isReadOnly={isReadOnly} onLocalUpdate={onLocalUpdate} onToggle={toggleOutcome} lang={lang} t={t} />
                ))
              )}
            </section>
          )
        })}
      </div>

      <RejectReasonPicker
        open={rejecting != null}
        candidateName={rejecting?.candidate?.full_name?.trim() || t.noName}
        onConfirm={(reason, note) => {
          const row = rejecting
          setRejecting(null)
          if (row) void patchStage(row, "rejected", reason, note)
        }}
        onCancel={() => setRejecting(null)}
      />
    </div>
  )
}

function ReviewCard({
  row, meta, isReadOnly, onLocalUpdate, onToggle, lang, t,
}: {
  row: AssessmentRow
  meta: { accent: string; bg: string; bd: string }
  isReadOnly: boolean
  onLocalUpdate: (rowId: string, patch: Partial<MatchAssessment>) => void
  onToggle: (row: AssessmentRow, outcome: "hired" | "rejected") => void
  lang: Lang
  t: (typeof copy)[Lang]
}) {
  const [note, setNote] = useState(row.client_feedback_note ?? "")
  const [saving, setSaving] = useState(false)
  const name = row.candidate?.full_name?.trim() || t.noName
  const subtitle = row.candidate?.current_title?.trim() || ""
  const ref = candidateRefLabel(row.candidate_id)
  const isHired = row.pipeline_stage === "hired"
  const isRejected = row.pipeline_stage === "rejected"

  // Sauvegarde le retour libre du client. No-op si inchangé.
  const saveNote = async () => {
    if (isReadOnly) return
    const val = note.trim() === "" ? null : note.trim()
    if ((row.client_feedback_note ?? null) === val) return
    setSaving(true)
    const res = await fetch(`/api/match/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_feedback_note: val }),
    })
    setSaving(false)
    if (res.ok) {
      const data = await res.json().catch(() => null)
      onLocalUpdate(row.id, { client_feedback_note: val, client_feedback_at: data?.match?.client_feedback_at ?? null })
    }
  }

  const outcomeBtn = (outcome: "hired" | "rejected", label: string, active: boolean) => (
    <button
      type="button"
      onClick={() => onToggle(row, outcome)}
      disabled={isReadOnly}
      title={isReadOnly ? t.readOnly : undefined}
      style={{
        flex: 1, fontSize: 11.5, fontWeight: 700, padding: "6px 6px", borderRadius: 8,
        cursor: isReadOnly ? "not-allowed" : "pointer",
        color: active ? "white" : "var(--nw-text-muted)",
        background: active ? (outcome === "hired" ? "#0F766E" : "var(--nw-text-muted)") : "white",
        border: `1px solid ${active ? (outcome === "hired" ? "#0F766E" : "var(--nw-text-muted)") : "var(--nw-border)"}`,
        fontFamily: "inherit", transition: "all 0.12s ease", lineHeight: 1.2,
      }}
    >
      {label}
    </button>
  )

  return (
    <article style={{
      display: "flex", flexDirection: "column", gap: 10,
      padding: 14, borderRadius: 14,
      background: meta.bg, border: `1px solid ${meta.bd}`,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--nw-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
          {subtitle && (
            <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--nw-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</p>
          )}
        </div>
        {typeof row.score === "number" && (
          <span style={{ flexShrink: 0, fontSize: 11.5, color: "var(--nw-text-muted)" }}>
            <strong style={{ color: "var(--nw-text)", fontSize: 13 }}>{Math.round(row.score)}</strong> · {t.score}
          </span>
        )}
      </div>

      {/* Issue : Recruté / Écarté (reclic = retour dans Anonymisés) */}
      <div style={{ display: "flex", gap: 6 }}>
        {outcomeBtn("hired", t.recruited, isHired)}
        {outcomeBtn("rejected", t.dropped, isRejected)}
      </div>

      {/* Motif d'écart (picker partagé) */}
      {isRejected && row.reject_reason && (
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--nw-text-muted)", fontStyle: "italic" }}>
          {t.droppedFor} {rejectReasonLabel(row.reject_reason, lang)}
          {row.reject_reason_note ? ` — ${row.reject_reason_note}` : ""}
        </p>
      )}

      {/* Retour libre du client */}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={saveNote}
        readOnly={isReadOnly}
        disabled={isReadOnly}
        placeholder={t.notePlaceholder}
        rows={2}
        style={{
          width: "100%", padding: "8px 10px", fontSize: 12.5,
          borderRadius: 8, border: "1px solid var(--nw-border)", outline: "none",
          fontFamily: "inherit", resize: "vertical", boxSizing: "border-box",
          background: isReadOnly ? "var(--nw-neutral-100)" : "white",
          cursor: isReadOnly ? "not-allowed" : "text",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 10.5, fontFamily: "var(--nw-font-mono)", color: "var(--nw-text-muted)" }}>{ref}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          {saving && <span style={{ fontSize: 10.5, color: "var(--nw-text-muted)" }}>{t.saving}</span>}
          <Link href={`/workspace/match/${row.id}`} style={{ fontSize: 11.5, color: "var(--nw-primary)", textDecoration: "none", fontWeight: 600 }}>
            {t.matchSheet} →
          </Link>
        </span>
      </div>
    </article>
  )
}
