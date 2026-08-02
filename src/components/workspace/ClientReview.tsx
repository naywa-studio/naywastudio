"use client"

/**
 * Revue client — 3ᵉ niveau de l'entonnoir (segment cabinet/ESN).
 *
 * BOARD drag-and-drop à 4 colonnes : Anonymisé → Présenté → Recruté / Écarté.
 * Glisser une carte d'une colonne à l'autre = changer son stade. Menu « ⋯ »
 * de repli (clic / mobile / clavier). Cartes épurées : le détail d'écart
 * (motifs client + retour libre) vit dans une MODALE, ouverte quand une carte
 * arrive dans Écarté et ré-ouvrable via « + Motif ».
 *
 * APPARTENANCE = marqueur `anonymized_at` (anonymisation OU « Présenter »).
 * Colonne = stade : offer=Présenté, hired=Recruté, rejected=Écarté, sinon
 * Anonymisé. Motifs d'écart = multi, universels, non bloquants → matière Nora.
 */

import { useState } from "react"
import Link from "next/link"
import type { MatchAssessment, Candidate, PipelineStage } from "@/lib/database.types"
import { candidateRefLabel } from "@/lib/candidate-ref"
import { CLIENT_REJECT_REASONS, clientRejectReasonLabel, type ClientRejectReason } from "@/lib/client-reject-reasons"
import { useEscapeKey } from "@/components/ui/useEscapeKey"

type Lang = "fr" | "en"
type AssessmentRow = MatchAssessment & { candidate: Candidate | null }

type Section = "anonymises" | "presented" | "hired" | "rejected"
const SECTIONS: Section[] = ["anonymises", "presented", "hired", "rejected"]
const SECTION_TO_STAGE: Record<Section, PipelineStage> = {
  anonymises: "interview", presented: "offer", hired: "hired", rejected: "rejected",
}

const SECTION_META: Record<Section, { accent: string; soft: string }> = {
  anonymises: { accent: "var(--nw-text-muted)", soft: "#F9FAFB" },
  presented:  { accent: "var(--nw-primary)",    soft: "rgba(124,99,200,0.06)" },
  hired:      { accent: "#0F766E",              soft: "rgba(34,197,94,0.06)" },
  rejected:   { accent: "var(--nw-text-muted)", soft: "var(--nw-neutral-100)" },
}

const copy = {
  fr: {
    header: (client: string) => `Suivi du process client — ${client}`,
    intro: "Glissez une carte d'une colonne à l'autre pour la faire avancer (ou via le menu ⋯). Un candidat entre ici à l'anonymisation de son CV ou via « Présenter au client » depuis la Shortlist.",
    sectionLabels: { anonymises: "Anonymisés · à présenter", presented: "Présentés", hired: "Recrutés", rejected: "Écartés" } as Record<Section, string>,
    emptyTitle: "Aucun candidat dans le process client",
    emptyBody: "Anonymisez un CV, ou utilisez « Présenter au client » depuis la Shortlist.",
    dropHere: "Déposer ici",
    score: "Score",
    matchSheet: "Fiche match",
    menuPresent: "Présenter au client",
    menuRecruited: "Marquer recruté",
    menuDropped: "Écarter",
    menuBackToAnon: "Remettre à présenter",
    menuRemove: "Retirer de la revue client",
    addMotif: "+ Ajouter un motif",
    editMotif: "Modifier le motif",
    modalTitle: (name: string) => `Retour d'écart — ${name}`,
    modalReasons: "Motifs (facultatif, plusieurs possibles)",
    modalNote: "Retour libre du client",
    modalNotePlaceholder: "ex : à revoir sur l'expérience terrain, trop junior pour le poste…",
    modalNora: "Ces retours remontent dans la mission : Nora s'en sert pour ajuster le brief et proposer un meilleur matching.",
    modalClose: "Enregistrer",
    recapTitle: "Retours client agrégés",
    readOnly: "Lecture seule",
    noName: "Candidat sans nom",
  },
  en: {
    header: (client: string) => `Client process tracking — ${client}`,
    intro: "Drag a card between columns to move it forward (or via the ⋯ menu). A candidate enters here when their CV is anonymized or via “Present to client” from the Shortlist.",
    sectionLabels: { anonymises: "Anonymized · to present", presented: "Presented", hired: "Recruited", rejected: "Dropped" } as Record<Section, string>,
    emptyTitle: "No candidate in the client process",
    emptyBody: "Anonymize a CV, or use “Present to client” from the Shortlist.",
    dropHere: "Drop here",
    score: "Score",
    matchSheet: "Match sheet",
    menuPresent: "Present to client",
    menuRecruited: "Mark recruited",
    menuDropped: "Drop",
    menuBackToAnon: "Back to present",
    menuRemove: "Remove from client review",
    addMotif: "+ Add a reason",
    editMotif: "Edit reason",
    modalTitle: (name: string) => `Drop feedback — ${name}`,
    modalReasons: "Reasons (optional, multiple allowed)",
    modalNote: "Client's free feedback",
    modalNotePlaceholder: "e.g. needs more field experience, too junior for the role…",
    modalNora: "This feedback flows into the mission: Nora uses it to adjust the brief and suggest better matches.",
    modalClose: "Save",
    recapTitle: "Aggregated client feedback",
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

function sectionOf(row: AssessmentRow): Section {
  if (row.pipeline_stage === "hired") return "hired"
  if (row.pipeline_stage === "rejected") return "rejected"
  if (row.pipeline_stage === "offer") return "presented"
  return "anonymises"
}

export function ClientReview({ clientName, rows, isReadOnly, onLocalUpdate, lang }: Props) {
  const t = copy[lang]
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<Section | null>(null)
  const [motifRow, setMotifRow] = useState<AssessmentRow | null>(null)

  const clientRows = rows.filter((r) => r.anonymized_at != null)

  const recap = (() => {
    const counts = new Map<ClientRejectReason, number>()
    for (const r of clientRows) {
      if (r.pipeline_stage !== "rejected") continue
      for (const raw of r.client_reject_reasons ?? []) {
        if ((CLIENT_REJECT_REASONS as string[]).includes(raw)) {
          const k = raw as ClientRejectReason
          counts.set(k, (counts.get(k) ?? 0) + 1)
        }
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  })()

  const patchStage = async (row: AssessmentRow, stage: PipelineStage) => {
    if (isReadOnly || row.pipeline_stage === stage) return
    const prev = row.pipeline_stage
    onLocalUpdate(row.id, { pipeline_stage: stage })
    const res = await fetch(`/api/match/${row.id}/stage`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_stage: stage }),
    })
    if (!res.ok) onLocalUpdate(row.id, { pipeline_stage: prev })
  }

  const moveTo = (row: AssessmentRow, section: Section) => {
    if (isReadOnly) return
    void patchStage(row, SECTION_TO_STAGE[section])
    if (section === "rejected") setMotifRow(row)
  }

  const removeFromReview = async (row: AssessmentRow) => {
    if (isReadOnly) return
    onLocalUpdate(row.id, { anonymized_at: null, pipeline_stage: "interview" })
    await fetch(`/api/match/${row.id}/stage`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_stage: "interview" }),
    })
    await fetch(`/api/match/${row.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clear_review: true }),
    })
  }

  const drop = (section: Section) => {
    setOverCol(null)
    const row = clientRows.find((r) => r.id === dragId)
    setDragId(null)
    if (row && sectionOf(row) !== section) moveTo(row, section)
  }

  if (clientRows.length === 0) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center" }}>
        <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "var(--nw-text)" }}>{t.emptyTitle}</p>
        <p style={{ margin: 0, fontSize: 13, color: "var(--nw-text-muted)", maxWidth: 480, marginInline: "auto", lineHeight: 1.6 }}>{t.emptyBody}</p>
      </div>
    )
  }

  return (
    <div>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--nw-text-muted)", lineHeight: 1.6 }}>
        <strong style={{ color: "var(--nw-text-body)" }}>{t.header(clientName)}</strong>
        <br />{t.intro}
      </p>

      {recap.length > 0 && (
        <div style={{ margin: "0 0 18px", padding: "10px 14px", borderRadius: 12, background: "rgba(124,99,200,0.05)", border: "1px solid rgba(124,99,200,0.18)" }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--nw-primary)", fontFamily: "var(--nw-font-mono)" }}>{t.recapTitle}</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {recap.map(([reason, n]) => (
              <span key={reason} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--nw-text-body)", background: "white", border: "1px solid var(--nw-border)", borderRadius: 99, padding: "2px 10px" }}>
                {n}× {clientRejectReasonLabel(reason, lang)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        {SECTIONS.map((section) => {
          const meta = SECTION_META[section]
          const list = clientRows.filter((r) => sectionOf(r) === section)
          const over = overCol === section
          return (
            <section
              key={section}
              onDragOver={(e) => { if (isReadOnly || !dragId) return; e.preventDefault(); if (overCol !== section) setOverCol(section) }}
              onDragLeave={() => { if (overCol === section) setOverCol(null) }}
              onDrop={(e) => { e.preventDefault(); drop(section) }}
              style={{
                display: "flex", flexDirection: "column", gap: 10,
                padding: 8, borderRadius: 14, minHeight: 90,
                background: over ? meta.soft : "transparent",
                outline: over ? `2px dashed ${meta.accent}` : "2px dashed transparent",
                transition: "background 0.12s ease, outline-color 0.12s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 4px" }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: meta.accent }} />
                <h3 style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "var(--nw-text)", letterSpacing: "0.03em", textTransform: "uppercase", fontFamily: "var(--nw-font-mono)" }}>
                  {t.sectionLabels[section]}
                </h3>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--nw-text-muted)" }}>{list.length}</span>
              </div>
              {list.length === 0 ? (
                <div style={{ padding: "18px 12px", borderRadius: 12, border: "1px dashed var(--nw-border)", textAlign: "center", fontSize: 11.5, color: "var(--nw-text-muted)" }}>
                  {over ? t.dropHere : "—"}
                </div>
              ) : (
                list.map((row) => (
                  <ReviewCard
                    key={row.id} row={row} section={section} meta={meta} isReadOnly={isReadOnly}
                    lang={lang} t={t}
                    onDragStart={() => setDragId(row.id)}
                    onDragEnd={() => { setDragId(null); setOverCol(null) }}
                    onMove={(s) => moveTo(row, s)}
                    onRemove={() => void removeFromReview(row)}
                    onOpenMotif={() => setMotifRow(row)}
                  />
                ))
              )}
            </section>
          )
        })}
      </div>

      {motifRow && (
        <MotifModal
          row={clientRows.find((r) => r.id === motifRow.id) ?? motifRow}
          isReadOnly={isReadOnly} lang={lang} t={t}
          onLocalUpdate={onLocalUpdate}
          onClose={() => setMotifRow(null)}
        />
      )}
    </div>
  )
}

function ReviewCard({
  row, section, meta, isReadOnly, lang, t, onDragStart, onDragEnd, onMove, onRemove, onOpenMotif,
}: {
  row: AssessmentRow
  section: Section
  meta: { accent: string; soft: string }
  isReadOnly: boolean
  lang: Lang
  t: (typeof copy)[Lang]
  onDragStart: () => void
  onDragEnd: () => void
  onMove: (section: Section) => void
  onRemove: () => void
  onOpenMotif: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const name = row.candidate?.full_name?.trim() || t.noName
  const subtitle = row.candidate?.current_title?.trim() || ""
  const ref = candidateRefLabel(row.candidate_id)
  const reasons = (row.client_reject_reasons ?? []).filter((r): r is ClientRejectReason => (CLIENT_REJECT_REASONS as string[]).includes(r))

  const menuItems: { label: string; onClick: () => void; danger?: boolean }[] = [
    ...(section !== "presented" ? [{ label: t.menuPresent, onClick: () => onMove("presented") }] : []),
    ...(section !== "hired" ? [{ label: t.menuRecruited, onClick: () => onMove("hired") }] : []),
    ...(section !== "rejected" ? [{ label: t.menuDropped, onClick: () => onMove("rejected") }] : []),
    ...(section !== "anonymises" ? [{ label: t.menuBackToAnon, onClick: () => onMove("anonymises") }] : []),
    { label: t.menuRemove, onClick: onRemove, danger: true },
  ]

  return (
    <article
      draggable={!isReadOnly}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        display: "flex", flexDirection: "column", gap: 8,
        padding: 12, borderRadius: 12, position: "relative",
        background: "white", border: `1px solid var(--nw-border)`,
        borderLeft: `3px solid ${meta.accent}`,
        cursor: isReadOnly ? "default" : "grab",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--nw-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
          {subtitle && (
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--nw-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {typeof row.score === "number" && (
            <span style={{ fontSize: 11, color: "var(--nw-text-muted)" }}><strong style={{ color: "var(--nw-text)", fontSize: 12.5 }}>{Math.round(row.score)}</strong></span>
          )}
          {!isReadOnly && (
            <div style={{ position: "relative" }}>
              <button
                type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu"
                style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid var(--nw-border)", background: "white", color: "var(--nw-text-muted)", cursor: "pointer", fontSize: 14, lineHeight: "20px", padding: 0 }}
              >⋯</button>
              {menuOpen && (
                <>
                  <button type="button" aria-hidden onClick={() => setMenuOpen(false)}
                    style={{ position: "fixed", inset: 0, zIndex: 30, background: "transparent", border: "none", cursor: "default" }} />
                  <div style={{ position: "absolute", top: 27, right: 0, zIndex: 31, minWidth: 180, background: "white", border: "1px solid var(--nw-border)", borderRadius: 10, boxShadow: "0 8px 24px rgba(17,24,39,0.12)", padding: 4 }}>
                    {menuItems.map((it) => (
                      <button
                        key={it.label} type="button"
                        onClick={() => { setMenuOpen(false); it.onClick() }}
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", fontSize: 12.5, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", color: it.danger ? "#B42318" : "var(--nw-text-body)" }}
                      >{it.label}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Résumé du motif d'écart — colonne Écartés uniquement */}
      {section === "rejected" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
          {reasons.map((r) => (
            <span key={r} style={{ fontSize: 10.5, fontWeight: 600, color: "var(--nw-text-muted)", background: "var(--nw-neutral-100)", border: "1px solid var(--nw-border)", borderRadius: 99, padding: "2px 8px" }}>
              {clientRejectReasonLabel(r, lang)}
            </span>
          ))}
          {!isReadOnly && (
            <button
              type="button" onClick={onOpenMotif}
              style={{ fontSize: 11, fontWeight: 600, color: "var(--nw-primary)", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "2px 2px" }}
            >{reasons.length > 0 ? t.editMotif : t.addMotif}</button>
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 10.5, fontFamily: "var(--nw-font-mono)", color: "var(--nw-text-muted)" }}>{ref}</span>
        <Link href={`/workspace/match/${row.id}`} style={{ fontSize: 11, color: "var(--nw-primary)", textDecoration: "none", fontWeight: 600 }}>
          {t.matchSheet} →
        </Link>
      </div>
    </article>
  )
}

function MotifModal({
  row, isReadOnly, lang, t, onLocalUpdate, onClose,
}: {
  row: AssessmentRow
  isReadOnly: boolean
  lang: Lang
  t: (typeof copy)[Lang]
  onLocalUpdate: (rowId: string, patch: Partial<MatchAssessment>) => void
  onClose: () => void
}) {
  useEscapeKey(onClose)
  const [note, setNote] = useState(row.client_feedback_note ?? "")
  const name = row.candidate?.full_name?.trim() || t.noName
  const selected = new Set((row.client_reject_reasons ?? []).filter((r): r is ClientRejectReason => (CLIENT_REJECT_REASONS as string[]).includes(r)))

  const toggleReason = async (reason: ClientRejectReason) => {
    if (isReadOnly) return
    const next = new Set(selected)
    if (next.has(reason)) next.delete(reason); else next.add(reason)
    const arr = [...next]
    onLocalUpdate(row.id, { client_reject_reasons: arr })
    await fetch(`/api/match/${row.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_reject_reasons: arr }),
    })
  }

  const saveNote = async () => {
    if (isReadOnly) return
    const val = note.trim() === "" ? null : note.trim()
    if ((row.client_feedback_note ?? null) === val) return
    const res = await fetch(`/api/match/${row.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_feedback_note: val }),
    })
    if (res.ok) {
      const data = await res.json().catch(() => null)
      onLocalUpdate(row.id, { client_feedback_note: val, client_feedback_at: data?.match?.client_feedback_at ?? null })
    }
  }

  return (
    <div
      onClick={() => { void saveNote(); onClose() }}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(17,24,39,0.40)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 460, background: "white", borderRadius: 16, padding: 22, boxShadow: "0 20px 60px rgba(17,24,39,0.25)" }}
      >
        <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 800, color: "var(--nw-text)" }}>{t.modalTitle(name)}</h3>

        <p style={{ margin: "0 0 8px", fontSize: 11.5, fontWeight: 700, color: "var(--nw-text-muted)", letterSpacing: "0.03em" }}>{t.modalReasons}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {CLIENT_REJECT_REASONS.map((reason) => {
            const on = selected.has(reason)
            return (
              <button
                key={reason} type="button" onClick={() => void toggleReason(reason)} disabled={isReadOnly}
                style={{
                  fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 99,
                  cursor: isReadOnly ? "not-allowed" : "pointer", fontFamily: "inherit",
                  color: on ? "white" : "var(--nw-text-body)",
                  background: on ? "var(--nw-text-muted)" : "white",
                  border: `1px solid ${on ? "var(--nw-text-muted)" : "var(--nw-border)"}`,
                }}
              >{clientRejectReasonLabel(reason, lang)}</button>
            )
          })}
        </div>

        <p style={{ margin: "16px 0 6px", fontSize: 11.5, fontWeight: 700, color: "var(--nw-text-muted)", letterSpacing: "0.03em" }}>{t.modalNote}</p>
        <textarea
          value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote}
          readOnly={isReadOnly} disabled={isReadOnly} placeholder={t.modalNotePlaceholder} rows={3}
          style={{ width: "100%", padding: "9px 12px", fontSize: 13, borderRadius: 9, border: "1px solid var(--nw-primary-100)", outline: "none", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
        />

        <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--nw-primary)", lineHeight: 1.5 }}>{t.modalNora}</p>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button
            type="button" onClick={() => { void saveNote(); onClose() }}
            style={{ fontSize: 13, fontWeight: 700, padding: "8px 18px", borderRadius: 9, border: "none", background: "var(--nw-primary)", color: "white", cursor: "pointer", fontFamily: "inherit" }}
          >{t.modalClose}</button>
        </div>
      </div>
    </div>
  )
}
