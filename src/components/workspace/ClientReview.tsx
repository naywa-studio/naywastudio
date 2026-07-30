"use client"

/**
 * Revue client — 3ᵉ niveau de l'entonnoir (segment cabinet/ESN).
 *
 * Candidats > Shortlist > Revue client. Vue focalisée sur les candidats qui
 * ont atteint le client : présentés, recrutés, écartés — avec le retour du
 * client et les motifs, pour une vision globale exploitable.
 *
 * Le VERDICT est le stade kanban (un seul entonnoir) :
 *   - Présenté au client = `offer`
 *   - Recruté            = `hired`
 *   - Écarté             = `rejected`
 * Le RETOUR libre du client vit dans `client_feedback_note` (indépendant du
 * verdict : un candidat « à ajuster » reste Présenté + une note).
 */

import { useState } from "react"
import Link from "next/link"
import type { MatchAssessment, Candidate } from "@/lib/database.types"
import { candidateRefLabel } from "@/lib/candidate-ref"

type Lang = "fr" | "en"
type AssessmentRow = MatchAssessment & { candidate: Candidate | null }

/** Les 3 stades « côté client » de l'entonnoir. */
type ClientStage = "offer" | "hired" | "rejected"
const CLIENT_STAGES: ClientStage[] = ["offer", "hired", "rejected"]

const STAGE_META: Record<ClientStage, { accent: string; bg: string; bd: string }> = {
  offer:    { accent: "var(--nw-primary)", bg: "rgba(124,99,200,0.06)", bd: "rgba(124,99,200,0.22)" },
  hired:    { accent: "#0F766E",           bg: "rgba(34,197,94,0.06)",  bd: "rgba(34,197,94,0.24)" },
  rejected: { accent: "var(--nw-text-muted)", bg: "var(--nw-neutral-100)", bd: "var(--nw-border)" },
}

const copy = {
  fr: {
    header: (client: string) => `Suivi du process client — ${client}`,
    intro: "Les candidats présentés au client et leur issue. Passez un candidat au stade « Présenté au client » depuis la Shortlist pour l'afficher ici.",
    stageLabels: { offer: "Présenté au client", hired: "Recruté", rejected: "Écarté" } as Record<ClientStage, string>,
    emptyTitle: "Aucun candidat présenté au client",
    emptyBody: "Dans la Shortlist, faites passer un candidat au stade « Présenté au client » pour le suivre ici.",
    score: "Score",
    matchSheet: "Fiche match",
    notePlaceholder: "Retour du client (optionnel) — ex : profil trop junior, à ajuster, revoir la fourchette…",
    noteLabel: "Retour du client",
    saving: "Enregistrement…",
    readOnly: "Lecture seule",
    noName: "Candidat sans nom",
  },
  en: {
    header: (client: string) => `Client process tracking — ${client}`,
    intro: "Candidates presented to the client and their outcome. Move a candidate to the “Presented to client” stage from the Shortlist to show them here.",
    stageLabels: { offer: "Presented to client", hired: "Recruited", rejected: "Dropped" } as Record<ClientStage, string>,
    emptyTitle: "No candidate presented to the client",
    emptyBody: "In the Shortlist, move a candidate to the “Presented to client” stage to track them here.",
    score: "Score",
    matchSheet: "Match sheet",
    notePlaceholder: "Client's feedback (optional) — e.g. too junior, to adjust, revise the range…",
    noteLabel: "Client feedback",
    saving: "Saving…",
    readOnly: "Read-only",
    noName: "Unnamed candidate",
  },
}

interface Props {
  clientName: string
  rows: AssessmentRow[]
  isReadOnly: boolean
  onLocalUpdate: (rowId: string, patch: Partial<MatchAssessment>) => void
  lang: Lang
}

export function ClientReview({ clientName, rows, isReadOnly, onLocalUpdate, lang }: Props) {
  const t = copy[lang]

  // Candidats ayant atteint le client = stades présenté / recruté / écarté.
  const clientRows = rows.filter((r) => CLIENT_STAGES.includes(r.pipeline_stage as ClientStage))

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
        {CLIENT_STAGES.map((stage) => {
          const meta = STAGE_META[stage]
          const list = clientRows.filter((r) => r.pipeline_stage === stage)
          return (
            <section key={stage} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: meta.accent }} />
                <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: "var(--nw-text)", letterSpacing: "0.03em", textTransform: "uppercase", fontFamily: "var(--nw-font-mono)" }}>
                  {t.stageLabels[stage]}
                </h3>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--nw-text-muted)" }}>{list.length}</span>
              </div>
              {list.length === 0 ? (
                <div style={{ padding: "18px 12px", borderRadius: 12, border: "1px dashed var(--nw-border)", textAlign: "center", fontSize: 12, color: "var(--nw-text-muted)" }}>—</div>
              ) : (
                list.map((row) => (
                  <ReviewCard key={row.id} row={row} meta={meta} isReadOnly={isReadOnly} onLocalUpdate={onLocalUpdate} t={t} />
                ))
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function ReviewCard({
  row, meta, isReadOnly, onLocalUpdate, t,
}: {
  row: AssessmentRow
  meta: { accent: string; bg: string; bd: string }
  isReadOnly: boolean
  onLocalUpdate: (rowId: string, patch: Partial<MatchAssessment>) => void
  t: (typeof copy)[Lang]
}) {
  const [note, setNote] = useState(row.client_feedback_note ?? "")
  const [saving, setSaving] = useState(false)
  const name = row.candidate?.full_name?.trim() || t.noName
  const subtitle = row.candidate?.current_title?.trim() || ""
  const ref = candidateRefLabel(row.candidate_id)

  // Change de stade (verdict client = kanban). Optimiste.
  const moveStage = async (stage: ClientStage) => {
    if (isReadOnly || row.pipeline_stage === stage) return
    const prev = row.pipeline_stage
    onLocalUpdate(row.id, { pipeline_stage: stage })
    const res = await fetch(`/api/match/${row.id}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_stage: stage }),
    })
    if (!res.ok) onLocalUpdate(row.id, { pipeline_stage: prev })
  }

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

      {/* Sélecteur de verdict = stade kanban */}
      <div style={{ display: "flex", gap: 6 }}>
        {CLIENT_STAGES.map((st) => {
          const active = row.pipeline_stage === st
          const m = STAGE_META[st]
          return (
            <button
              key={st}
              type="button"
              onClick={() => moveStage(st)}
              disabled={isReadOnly}
              title={isReadOnly ? t.readOnly : undefined}
              style={{
                flex: 1, fontSize: 11, fontWeight: 700, padding: "6px 4px", borderRadius: 8,
                cursor: isReadOnly ? "not-allowed" : "pointer",
                color: active ? "white" : "var(--nw-text-muted)",
                background: active ? m.accent : "white",
                border: `1px solid ${active ? m.accent : "var(--nw-border)"}`,
                fontFamily: "inherit", transition: "all 0.12s ease", lineHeight: 1.2,
              }}
            >
              {t.stageLabels[st]}
            </button>
          )
        })}
      </div>

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
