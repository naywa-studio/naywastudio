"use client"

/**
 * Revue client — 3ᵉ niveau de l'entonnoir (segment cabinet/ESN).
 *
 * Candidats > Shortlist > Revue client. Entonnoir à 4 colonnes :
 *   Anonymisé (à présenter) → Présenté → Recruté / Écarté.
 *
 * APPARTENANCE : un candidat est dans la Revue client dès que
 * `anonymized_at` est posé — soit par anonymisation du CV (= préparé pour le
 * client), soit par le bouton « Présenter au client » (1 clic). Le stade
 * kanban donne la colonne (offer=Présenté, hired=Recruté, rejected=Écarté).
 *
 * ÉCART : motifs CLIENT multi-select (universels, non bloquants) + retour
 * libre → matière pour Nora (ajustement mission + meilleur matching).
 */

import { useState } from "react"
import Link from "next/link"
import type { MatchAssessment, Candidate, PipelineStage } from "@/lib/database.types"
import { candidateRefLabel } from "@/lib/candidate-ref"
import { CLIENT_REJECT_REASONS, clientRejectReasonLabel, type ClientRejectReason } from "@/lib/client-reject-reasons"

type Lang = "fr" | "en"
type AssessmentRow = MatchAssessment & { candidate: Candidate | null }

type Section = "anonymises" | "presented" | "hired" | "rejected"
const SECTIONS: Section[] = ["anonymises", "presented", "hired", "rejected"]

const SECTION_META: Record<Section, { accent: string; bg: string; bd: string }> = {
  anonymises: { accent: "var(--nw-text-muted)", bg: "#F9FAFB",                 bd: "var(--nw-border)" },
  presented:  { accent: "var(--nw-primary)",    bg: "rgba(124,99,200,0.06)",   bd: "rgba(124,99,200,0.22)" },
  hired:      { accent: "#0F766E",              bg: "rgba(34,197,94,0.06)",    bd: "rgba(34,197,94,0.24)" },
  rejected:   { accent: "var(--nw-text-muted)", bg: "var(--nw-neutral-100)",   bd: "var(--nw-border)" },
}

const copy = {
  fr: {
    header: (client: string) => `Suivi du process client — ${client}`,
    intro: "Un candidat entre ici dès que son CV est anonymisé (= préparé pour le client) ou via « Présenter au client » depuis la Shortlist. Faites-le avancer jusqu'à l'issue.",
    sectionLabels: { anonymises: "Anonymisés · à présenter", presented: "Présentés", hired: "Recrutés", rejected: "Écartés" } as Record<Section, string>,
    emptyTitle: "Aucun candidat dans le process client",
    emptyBody: "Anonymisez un CV, ou utilisez « Présenter au client » depuis la Shortlist : le candidat apparaîtra ici.",
    score: "Score",
    matchSheet: "Fiche match",
    present: "Présenter au client",
    recruited: "Recruté",
    dropped: "Écarté",
    cancel: "Annuler",
    remove: "Retirer de la revue client",
    reasonsTitle: "Motifs de l'écart (facultatif, plusieurs possibles)",
    noraHint: "Ces retours remontent dans la mission : Nora s'en sert pour ajuster le brief et proposer un meilleur matching.",
    notePlaceholder: "Retour du client (facultatif) — ex : à revoir sur l'expérience terrain…",
    saving: "Enregistrement…",
    readOnly: "Lecture seule",
    noName: "Candidat sans nom",
    recapTitle: "Retours client agrégés",
  },
  en: {
    header: (client: string) => `Client process tracking — ${client}`,
    intro: "A candidate enters here as soon as their CV is anonymized (= prepared for the client) or via “Present to client” from the Shortlist. Move them to the outcome.",
    sectionLabels: { anonymises: "Anonymized · to present", presented: "Presented", hired: "Recruited", rejected: "Dropped" } as Record<Section, string>,
    emptyTitle: "No candidate in the client process",
    emptyBody: "Anonymize a CV, or use “Present to client” from the Shortlist: the candidate will show up here.",
    score: "Score",
    matchSheet: "Match sheet",
    present: "Present to client",
    recruited: "Recruited",
    dropped: "Dropped",
    cancel: "Undo",
    remove: "Remove from client review",
    reasonsTitle: "Drop reasons (optional, multiple allowed)",
    noraHint: "This feedback flows back into the mission: Nora uses it to adjust the brief and suggest better matches.",
    notePlaceholder: "Client's feedback (optional) — e.g. needs more field experience…",
    saving: "Saving…",
    readOnly: "Read-only",
    noName: "Unnamed candidate",
    recapTitle: "Aggregated client feedback",
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

  // Appartenance à la Revue client = marqueur anonymized_at posé.
  const clientRows = rows.filter((r) => r.anonymized_at != null)

  // Récap agrégé des motifs d'écart (matière Nora + valeur immédiate).
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
        <br />
        {t.intro}
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
        {SECTIONS.map((section) => {
          const meta = SECTION_META[section]
          const list = clientRows.filter((r) => sectionOf(r) === section)
          return (
            <section key={section} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: meta.accent }} />
                <h3 style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "var(--nw-text)", letterSpacing: "0.03em", textTransform: "uppercase", fontFamily: "var(--nw-font-mono)" }}>
                  {t.sectionLabels[section]}
                </h3>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--nw-text-muted)" }}>{list.length}</span>
              </div>
              {list.length === 0 ? (
                <div style={{ padding: "18px 12px", borderRadius: 12, border: "1px dashed var(--nw-border)", textAlign: "center", fontSize: 12, color: "var(--nw-text-muted)" }}>—</div>
              ) : (
                list.map((row) => (
                  <ReviewCard key={row.id} row={row} section={section} meta={meta} isReadOnly={isReadOnly} onLocalUpdate={onLocalUpdate} lang={lang} t={t} />
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
  row, section, meta, isReadOnly, onLocalUpdate, lang, t,
}: {
  row: AssessmentRow
  section: Section
  meta: { accent: string; bg: string; bd: string }
  isReadOnly: boolean
  onLocalUpdate: (rowId: string, patch: Partial<MatchAssessment>) => void
  lang: Lang
  t: (typeof copy)[Lang]
}) {
  const [note, setNote] = useState(row.client_feedback_note ?? "")
  const [saving, setSaving] = useState(false)
  const name = row.candidate?.full_name?.trim() || t.noName
  const subtitle = row.candidate?.current_title?.trim() || ""
  const ref = candidateRefLabel(row.candidate_id)
  const reasons = new Set((row.client_reject_reasons ?? []).filter((r): r is ClientRejectReason => (CLIENT_REJECT_REASONS as string[]).includes(r)))

  // Change de stade (issue). Optimiste.
  const patchStage = async (stage: PipelineStage) => {
    if (isReadOnly) return
    const prev = row.pipeline_stage
    onLocalUpdate(row.id, { pipeline_stage: stage })
    const res = await fetch(`/api/match/${row.id}/stage`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_stage: stage }),
    })
    if (!res.ok) onLocalUpdate(row.id, { pipeline_stage: prev })
  }

  // Retrait de la Revue client : efface le marqueur + repasse en « en cours ».
  const removeFromReview = async () => {
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

  // Bascule un motif d'écart (multi). Optimiste.
  const toggleReason = async (reason: ClientRejectReason) => {
    if (isReadOnly) return
    const next = new Set(reasons)
    if (next.has(reason)) next.delete(reason); else next.add(reason)
    const arr = [...next]
    onLocalUpdate(row.id, { client_reject_reasons: arr })
    await fetch(`/api/match/${row.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_reject_reasons: arr }),
    })
  }

  // Sauvegarde le retour libre du client. No-op si inchangé.
  const saveNote = async () => {
    if (isReadOnly) return
    const val = note.trim() === "" ? null : note.trim()
    if ((row.client_feedback_note ?? null) === val) return
    setSaving(true)
    const res = await fetch(`/api/match/${row.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_feedback_note: val }),
    })
    setSaving(false)
    if (res.ok) {
      const data = await res.json().catch(() => null)
      onLocalUpdate(row.id, { client_feedback_note: val, client_feedback_at: data?.match?.client_feedback_at ?? null })
    }
  }

  const btn = (label: string, onClick: () => void, tone: "primary" | "hired" | "muted" | "ghost", active = false) => {
    const tones: Record<string, { fg: string; bg: string; bd: string }> = {
      primary: { fg: active ? "white" : "var(--nw-primary)", bg: active ? "var(--nw-primary)" : "white", bd: "var(--nw-primary)" },
      hired:   { fg: active ? "white" : "#0F766E", bg: active ? "#0F766E" : "white", bd: "#0F766E" },
      muted:   { fg: active ? "white" : "var(--nw-text-muted)", bg: active ? "var(--nw-text-muted)" : "white", bd: "var(--nw-border)" },
      ghost:   { fg: "var(--nw-text-muted)", bg: "transparent", bd: "var(--nw-border)" },
    }
    const c = tones[tone]
    return (
      <button
        type="button" onClick={onClick} disabled={isReadOnly}
        title={isReadOnly ? t.readOnly : undefined}
        style={{
          flex: 1, fontSize: 11.5, fontWeight: 700, padding: "6px 6px", borderRadius: 8,
          cursor: isReadOnly ? "not-allowed" : "pointer",
          color: c.fg, background: c.bg, border: `1px solid ${c.bd}`,
          fontFamily: "inherit", transition: "all 0.12s ease", lineHeight: 1.2,
        }}
      >{label}</button>
    )
  }

  return (
    <article style={{
      display: "flex", flexDirection: "column", gap: 10,
      padding: 14, borderRadius: 14, position: "relative",
      background: meta.bg, border: `1px solid ${meta.bd}`,
    }}>
      {!isReadOnly && (
        <button
          type="button" onClick={removeFromReview} title={t.remove} aria-label={t.remove}
          style={{ position: "absolute", top: 8, right: 8, width: 20, height: 20, lineHeight: "18px", textAlign: "center", borderRadius: 6, border: "1px solid var(--nw-border)", background: "white", color: "var(--nw-text-muted)", cursor: "pointer", fontSize: 13, padding: 0 }}
        >×</button>
      )}

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, paddingRight: 22 }}>
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

      {/* Actions selon la colonne */}
      {section === "anonymises" && (
        <div style={{ display: "flex", gap: 6 }}>
          {btn(t.present, () => void patchStage("offer"), "primary")}
          {btn(t.dropped, () => void patchStage("rejected"), "muted")}
        </div>
      )}
      {section === "presented" && (
        <div style={{ display: "flex", gap: 6 }}>
          {btn(t.recruited, () => void patchStage("hired"), "hired")}
          {btn(t.dropped, () => void patchStage("rejected"), "muted")}
        </div>
      )}
      {section === "hired" && (
        <div style={{ display: "flex", gap: 6 }}>
          {btn(`✓ ${t.recruited}`, () => {}, "hired", true)}
          {btn(t.cancel, () => void patchStage("offer"), "ghost")}
        </div>
      )}
      {section === "rejected" && (
        <div style={{ display: "flex", gap: 6 }}>
          {btn(`✕ ${t.dropped}`, () => {}, "muted", true)}
          {btn(t.cancel, () => void patchStage("offer"), "ghost")}
        </div>
      )}

      {/* Motifs d'écart (multi, inline) + hint Nora — colonne Écartés only */}
      {section === "rejected" && (
        <div>
          <p style={{ margin: "0 0 6px", fontSize: 10.5, fontWeight: 700, color: "var(--nw-text-muted)", letterSpacing: "0.03em" }}>{t.reasonsTitle}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {CLIENT_REJECT_REASONS.map((reason) => {
              const on = reasons.has(reason)
              return (
                <button
                  key={reason} type="button" onClick={() => void toggleReason(reason)} disabled={isReadOnly}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 99,
                    cursor: isReadOnly ? "not-allowed" : "pointer", fontFamily: "inherit",
                    color: on ? "white" : "var(--nw-text-muted)",
                    background: on ? "var(--nw-text-muted)" : "white",
                    border: `1px solid ${on ? "var(--nw-text-muted)" : "var(--nw-border)"}`,
                  }}
                >{clientRejectReasonLabel(reason, lang)}</button>
              )
            })}
          </div>
        </div>
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
      {section === "rejected" && (
        <p style={{ margin: "-2px 0 0", fontSize: 10.5, color: "var(--nw-primary)", lineHeight: 1.5 }}>{t.noraHint}</p>
      )}

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
