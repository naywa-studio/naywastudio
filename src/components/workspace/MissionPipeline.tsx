"use client"

/**
 * Suivi de mission — liste unique de candidats en shortlist, chacun avec une
 * BARRE DE PROGRESSION du process de recrutement. Remplace l'ancien duo
 * Shortlist (kanban) + Revue client.
 *
 * Objectifs : clarté (barre visuelle), qualification simple (clic sur une
 * étape = avancer), feedback client facile (carte dépliable → retour + motifs
 * + proposition Nora sur approbation).
 *
 * Étapes process : À contacter → Contacté → Entretien → Présenté au client
 * (dernière uniquement pour les orgs cabinet/ESN). Issues : Recruté / Écarté.
 * Mappe sur pipeline_stage : identified/pricing→à contacter, contacted/replied
 * →contacté, interview→entretien, offer→présenté, hired→recruté, rejected→écarté.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import type { MatchAssessment, Candidate, Job, PipelineStage } from "@/lib/database.types"
import { candidateRefLabel } from "@/lib/candidate-ref"
import { CLIENT_REJECT_REASONS, clientRejectReasonLabel, type ClientRejectReason } from "@/lib/client-reject-reasons"
import { detectOffLimitsForCandidate, type OffLimitsClientRef } from "@/lib/off-limits"
import { AnonymizeSettings, type AnonymizeBranding } from "@/components/workspace/AnonymizeSettings"
import { readOrgDefaults, type AnonymizeTemplate } from "@/components/workspace/anonymize/types"
import type { ShortlistOrg } from "@/components/workspace/MissionShortlist"

type Lang = "fr" | "en"
type AssessmentRow = MatchAssessment & { candidate: Candidate | null }

type Filter = "all" | "to_contact" | "in_progress" | "presented" | "hired" | "rejected"

const PRIMARY = "#7C63C8"
const PRIMARY_DK = "#5b4aa8"

const STAGE_LABELS: Record<Lang, Record<"identified" | "contacted" | "interview" | "offer" | "hired" | "rejected", string>> = {
  fr: { identified: "À contacter", contacted: "Contacté", interview: "Entretien", offer: "Présenté au client", hired: "Recruté", rejected: "Écarté" },
  en: { identified: "To contact", contacted: "Contacted", interview: "Interview", offer: "Presented to client", hired: "Recruited", rejected: "Dropped" },
}

const copy = {
  fr: {
    title: "Suivi",
    downloadAll: "CV anonymisés",
    settings: "Réglages du CV",
    downloading: "Génération…",
    anonError: "Échec du téléchargement.",
    filters: { all: "Tous", to_contact: "À contacter", in_progress: "En cours", presented: "Présentés", hired: "Recrutés", rejected: "Écartés" } as Record<Filter, string>,
    emptyTitle: "Aucun candidat en shortlist",
    emptyBody: "Depuis l'onglet Candidats, ajoutez à la shortlist les profils que vous voulez travailler.",
    advance: "Avancer",
    reasonsTitle: "Motifs de l'écart (facultatif, plusieurs possibles)",
    clientFeedback: "Retour du client",
    clientFeedbackPh: "ex : profil intéressant mais à revoir sur l'expérience terrain…",
    noraTeaser: "Nora peut réajuster la mission d'après ces retours",
    noraCta: "Voir la proposition",
    cvReady: "CV anonymisé prêt",
    salary: "Prétention",
    matchSheet: "Fiche match complète",
    removeShort: "Retirer de la shortlist",
    score: "Score",
    readOnly: "Lecture seule",
    noName: "Candidat sans nom",
    tier: { excellent: "Excellent", good: "Bon", fair: "Moyen", poor: "Faible" } as Record<string, string>,
  },
  en: {
    title: "Tracking",
    downloadAll: "Anonymized CVs",
    settings: "CV settings",
    downloading: "Generating…",
    anonError: "Download failed.",
    filters: { all: "All", to_contact: "To contact", in_progress: "In progress", presented: "Presented", hired: "Recruited", rejected: "Dropped" } as Record<Filter, string>,
    emptyTitle: "No candidate shortlisted",
    emptyBody: "From the Candidates tab, add the profiles you want to work to the shortlist.",
    advance: "Advance",
    reasonsTitle: "Drop reasons (optional, multiple allowed)",
    clientFeedback: "Client feedback",
    clientFeedbackPh: "e.g. interesting profile but needs more field experience…",
    noraTeaser: "Nora can adjust the mission based on this feedback",
    noraCta: "See the suggestion",
    cvReady: "Anonymized CV ready",
    salary: "Expectation",
    matchSheet: "Full match sheet",
    removeShort: "Remove from shortlist",
    score: "Score",
    readOnly: "Read-only",
    noName: "Unnamed candidate",
    tier: { excellent: "Excellent", good: "Good", fair: "Fair", poor: "Weak" } as Record<string, string>,
  },
}

interface Props {
  job: Job
  rows: AssessmentRow[]
  isReadOnly: boolean
  organization: ShortlistOrg
  brandingHref?: string | null
  clientDirectory?: OffLimitsClientRef[]
  clientReviewEnabled?: boolean
  onLocalUpdate: (rowId: string, patch: Partial<MatchAssessment>) => void
  lang: Lang
}

function stepOf(stage: PipelineStage): "identified" | "contacted" | "interview" | "offer" | "hired" | "rejected" {
  if (stage === "hired") return "hired"
  if (stage === "rejected") return "rejected"
  if (stage === "offer") return "offer"
  if (stage === "interview") return "interview"
  if (stage === "contacted" || stage === "replied") return "contacted"
  return "identified"
}

function filterOf(stage: PipelineStage): Filter {
  const s = stepOf(stage)
  if (s === "hired") return "hired"
  if (s === "rejected") return "rejected"
  if (s === "offer") return "presented"
  if (s === "identified") return "to_contact"
  return "in_progress"
}

export function MissionPipeline({ job, rows, isReadOnly, organization, brandingHref, clientDirectory = [], clientReviewEnabled = false, onLocalUpdate, lang }: Props) {
  const t = copy[lang]
  const [filter, setFilter] = useState<Filter>("all")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const orgDefaults = useMemo(() => readOrgDefaults(organization.anonymize_defaults), [organization.anonymize_defaults])
  const [template, setTemplate] = useState<AnonymizeTemplate>(orgDefaults.template)
  const [watermark, setWatermark] = useState(orgDefaults.watermark)
  const [watermarkText, setWatermarkText] = useState(orgDefaults.watermarkText)
  const [anonNora, setAnonNora] = useState(job.anonymize_options?.keepNoraSummary ?? false)
  const [anonMsg, setAnonMsg] = useState(job.anonymize_options?.customText ?? "")
  const [showSettings, setShowSettings] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [anonErr, setAnonErr] = useState<string | null>(null)

  const anonBranding: AnonymizeBranding = useMemo(() => ({
    orgName: (organization.brand_name?.trim() || organization.name?.trim()) || "",
    logoUrl: null,
    color: organization.brand_color,
    colorSecondary: organization.brand_color_secondary,
    slogan: organization.brand_slogan,
    contactEmail: organization.contact_email,
  }), [organization])

  const liveOptions = () => ({
    template, watermark, watermarkText: watermarkText.trim().slice(0, 40),
    keepNoraSummary: anonNora, customText: anonMsg.trim().slice(0, 600),
  })

  const msgMounted = useRef(false)
  useEffect(() => {
    if (!msgMounted.current) { msgMounted.current = true; return }
    const id = setTimeout(() => {
      void fetch(`/api/jobs/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anonymize_options: { keepNoraSummary: anonNora, customText: anonMsg } }) }).catch(() => {})
    }, 700)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anonMsg, anonNora])

  const shortlisted = useMemo(() => rows.filter((r) => r.in_pipeline), [rows])
  const visible = useMemo(
    () => shortlisted.filter((r) => filter === "all" || filterOf(r.pipeline_stage) === filter),
    [shortlisted, filter],
  )
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: shortlisted.length, to_contact: 0, in_progress: 0, presented: 0, hired: 0, rejected: 0 }
    for (const r of shortlisted) c[filterOf(r.pipeline_stage)]++
    return c
  }, [shortlisted])

  async function downloadAll() {
    const ids = shortlisted.map((r) => r.candidate_id)
    if (ids.length === 0 || downloading) return
    setDownloading(true); setAnonErr(null)
    try {
      const res = await fetch(`/api/jobs/${job.id}/anonymize-batch`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_ids: ids, options: liveOptions() }),
      })
      if (!res.ok) throw new Error("batch_failed")
      const blob = await res.blob()
      const single = ids.length === 1
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = single ? `cv-anonymise-${job.title}.pdf` : `cv-anonymises-${job.title}.zip`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch { setAnonErr(t.anonError) } finally { setDownloading(false) }
  }

  const FILTER_ORDER: Filter[] = ["all", "to_contact", "in_progress", ...(clientReviewEnabled ? ["presented" as const] : []), "hired", "rejected"]

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FILTER_ORDER.map((f) => {
            const on = filter === f
            return (
              <button
                key={f} type="button" onClick={() => setFilter(f)}
                style={{
                  fontSize: 12, fontWeight: on ? 700 : 500, padding: "5px 12px", borderRadius: 99,
                  cursor: "pointer", fontFamily: "inherit",
                  color: on ? "white" : "var(--nw-text-secondary)",
                  background: on ? PRIMARY : "white",
                  border: `1px solid ${on ? PRIMARY : "var(--nw-border)"}`,
                }}
              >{t.filters[f]} · {counts[f]}</button>
            )
          })}
        </div>
        {!isReadOnly && shortlisted.length > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" onClick={() => setShowSettings((v) => !v)} style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", color: showSettings ? PRIMARY_DK : "var(--nw-text-body)", background: "white", border: `1px solid ${showSettings ? PRIMARY : "var(--nw-border)"}` }}>{t.settings}</button>
            <button type="button" onClick={downloadAll} disabled={downloading} style={{ fontSize: 12.5, fontWeight: 700, padding: "7px 14px", borderRadius: 8, cursor: downloading ? "wait" : "pointer", fontFamily: "inherit", color: "white", background: PRIMARY, border: "none" }}>{downloading ? t.downloading : t.downloadAll}</button>
          </div>
        )}
      </div>

      {anonErr && <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--nw-error, #B42318)" }}>{anonErr}</p>}

      {showSettings && (
        <div style={{ marginBottom: 14, padding: 14, borderRadius: 12, background: "var(--nw-bg)", border: "1px solid var(--nw-border)" }}>
          <AnonymizeSettings
            branding={anonBranding}
            template={template} watermark={watermark} watermarkText={watermarkText}
            onTemplate={setTemplate} onWatermark={setWatermark} onWatermarkText={setWatermarkText}
            keepNoraSummary={anonNora} customText={anonMsg}
            onKeepNora={setAnonNora} onCustomText={setAnonMsg}
            brandingHref={brandingHref} lang={lang}
          />
        </div>
      )}

      {visible.length === 0 ? (
        <div style={{ padding: "44px 24px", textAlign: "center" }}>
          <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "var(--nw-text)" }}>{t.emptyTitle}</p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--nw-text-muted)", maxWidth: 460, marginInline: "auto", lineHeight: 1.6 }}>{t.emptyBody}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visible.map((row) => (
            <PipelineCard
              key={row.id} row={row} isReadOnly={isReadOnly} clientReviewEnabled={clientReviewEnabled}
              offLimits={clientDirectory.length > 0 ? detectOffLimitsForCandidate(row.candidate?.parsed_cv, row.candidate?.current_company, clientDirectory) : { verdict: "none", client: null }}
              expanded={expanded.has(row.id)}
              onToggleExpand={() => setExpanded((prev) => { const n = new Set(prev); if (n.has(row.id)) n.delete(row.id); else n.add(row.id); return n })}
              onLocalUpdate={onLocalUpdate} lang={lang} t={t}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PipelineCard({
  row, isReadOnly, clientReviewEnabled, offLimits, expanded, onToggleExpand, onLocalUpdate, lang, t,
}: {
  row: AssessmentRow
  isReadOnly: boolean
  clientReviewEnabled: boolean
  offLimits: { verdict: string; client: { name: string } | null }
  expanded: boolean
  onToggleExpand: () => void
  onLocalUpdate: (rowId: string, patch: Partial<MatchAssessment>) => void
  lang: Lang
  t: (typeof copy)[Lang]
}) {
  const [note, setNote] = useState(row.client_feedback_note ?? "")
  const name = row.candidate?.full_name?.trim() || t.noName
  const subtitle = row.candidate?.current_title?.trim() || candidateRefLabel(row.candidate_id)
  const step = stepOf(row.pipeline_stage)
  const isHired = step === "hired"
  const isRejected = step === "rejected"
  const cvReady = row.candidate?.anonymized_at != null

  const steps: PipelineStage[] = clientReviewEnabled
    ? ["identified", "contacted", "interview", "offer"]
    : ["identified", "contacted", "interview"]
  const activeIdx = isHired ? steps.length : isRejected ? -1 : steps.indexOf(step as PipelineStage)
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?"

  const stageLabel = isHired ? STAGE_LABELS[lang].hired : isRejected ? STAGE_LABELS[lang].rejected : STAGE_LABELS[lang][step]
  const stageColor = isHired ? "#0F766E" : isRejected ? "var(--nw-text-muted)" : PRIMARY_DK

  const patchStage = async (stage: PipelineStage, reasons?: string[] | null) => {
    if (isReadOnly) return
    const prev = row.pipeline_stage
    onLocalUpdate(row.id, { pipeline_stage: stage })
    const res = await fetch(`/api/match/${row.id}/stage`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_stage: stage }),
    })
    if (!res.ok) { onLocalUpdate(row.id, { pipeline_stage: prev }); return }
    if (reasons !== undefined) void saveReasons(reasons)
  }

  const saveReasons = async (arr: string[] | null) => {
    onLocalUpdate(row.id, { client_reject_reasons: arr })
    await fetch(`/api/match/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_reject_reasons: arr }) })
  }
  const toggleReason = (reason: ClientRejectReason) => {
    const cur = new Set((row.client_reject_reasons ?? []).filter((r): r is ClientRejectReason => (CLIENT_REJECT_REASONS as string[]).includes(r)))
    if (cur.has(reason)) cur.delete(reason); else cur.add(reason)
    void saveReasons([...cur])
  }
  const saveNote = async () => {
    if (isReadOnly) return
    const val = note.trim() === "" ? null : note.trim()
    if ((row.client_feedback_note ?? null) === val) return
    const res = await fetch(`/api/match/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_feedback_note: val }) })
    if (res.ok) onLocalUpdate(row.id, { client_feedback_note: val })
  }
  const removeShort = async () => {
    if (isReadOnly) return
    onLocalUpdate(row.id, { in_pipeline: false })
    await fetch(`/api/match/${row.id}/pipeline`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ in_pipeline: false }) })
  }

  const reasons = new Set((row.client_reject_reasons ?? []).filter((r): r is ClientRejectReason => (CLIENT_REJECT_REASONS as string[]).includes(r)))
  const stageBtns: PipelineStage[] = [...steps, "hired", "rejected"]

  return (
    <div style={{ background: "white", border: `1px solid ${step === "offer" ? "#c9bff0" : "var(--nw-border)"}`, borderRadius: 12, padding: "11px 13px" }}>
      <button
        type="button" onClick={onToggleExpand}
        style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: 0, textAlign: "left", fontFamily: "inherit" }}
      >
        <span style={{ width: 34, height: 34, borderRadius: "50%", background: step === "offer" || isHired ? PRIMARY : "#EEEBF8", color: step === "offer" || isHired ? "white" : PRIMARY_DK, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{initials}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--nw-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {name}
              {offLimits.verdict !== "none" && offLimits.client && (
                <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 99, color: "#B42318", background: "rgba(217,45,32,0.08)", border: "1px solid rgba(217,45,32,0.24)" }}>Off-limits</span>
              )}
            </span>
            {typeof row.score === "number" && (
              <span style={{ fontSize: 11.5, color: "var(--nw-text-muted)", flexShrink: 0 }}>{Math.round(row.score)}{row.match_tier ? ` · ${t.tier[row.match_tier]}` : ""}</span>
            )}
          </span>
          {subtitle && <span style={{ display: "block", fontSize: 11, color: "var(--nw-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</span>}
          <span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
            <span style={{ flex: 1, display: "flex", gap: 3 }}>
              {steps.map((_, i) => (
                <span key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: (!isRejected && (isHired || i <= activeIdx)) ? PRIMARY : "var(--nw-border)" }} />
              ))}
            </span>
            <span style={{ fontSize: 11, color: stageColor, fontWeight: 600, whiteSpace: "nowrap" }}>{stageLabel}</span>
          </span>
        </span>
      </button>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--nw-border)", display: "flex", flexDirection: "column", gap: 12 }}>
          {!isReadOnly && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {stageBtns.map((s) => {
                const active = stepOf(row.pipeline_stage) === stepOf(s)
                const tone = s === "hired" ? "#0F766E" : s === "rejected" ? "var(--nw-text-muted)" : PRIMARY
                return (
                  <button
                    key={s} type="button" onClick={() => void patchStage(s)}
                    style={{ fontSize: 11.5, fontWeight: active ? 700 : 500, padding: "5px 11px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", color: active ? "white" : "var(--nw-text-secondary)", background: active ? tone : "white", border: `1px solid ${active ? tone : "var(--nw-border)"}` }}
                  >{STAGE_LABELS[lang][stepOf(s)]}</button>
                )
              })}
            </div>
          )}

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "var(--nw-text-secondary)", alignItems: "center" }}>
            {row.salary_expectation_brut != null && (
              <span>{t.salary} <strong style={{ color: "var(--nw-text)", fontWeight: 600 }}>{row.salary_expectation_brut.toLocaleString(lang === "fr" ? "fr-FR" : "en-US")} €</strong></span>
            )}
            {cvReady && <span style={{ color: PRIMARY_DK }}>{t.cvReady}</span>}
            <Link href={`/workspace/match/${row.id}`} style={{ color: PRIMARY_DK, textDecoration: "none", fontWeight: 600 }}>{t.matchSheet} →</Link>
            {!isReadOnly && (
              <button type="button" onClick={removeShort} style={{ fontSize: 12, color: "var(--nw-text-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "inherit", padding: 0, marginLeft: "auto" }}>{t.removeShort}</button>
            )}
          </div>

          {clientReviewEnabled && (step === "offer" || isHired || isRejected) && (
            <div>
              {isRejected && (
                <>
                  <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: "var(--nw-text-muted)" }}>{t.reasonsTitle}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                    {CLIENT_REJECT_REASONS.map((reason) => {
                      const on = reasons.has(reason)
                      return (
                        <button key={reason} type="button" onClick={() => toggleReason(reason)} disabled={isReadOnly}
                          style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 99, cursor: isReadOnly ? "not-allowed" : "pointer", fontFamily: "inherit", color: on ? "white" : "var(--nw-text-secondary)", background: on ? PRIMARY : "white", border: `1px solid ${on ? PRIMARY : "var(--nw-border)"}` }}>{clientRejectReasonLabel(reason, lang)}</button>
                      )
                    })}
                  </div>
                </>
              )}
              <p style={{ margin: "0 0 5px", fontSize: 11, color: "var(--nw-text-secondary)" }}>{t.clientFeedback}</p>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} readOnly={isReadOnly} disabled={isReadOnly} placeholder={t.clientFeedbackPh} rows={2}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 12.5, borderRadius: 8, border: "1px solid var(--nw-primary-100)", outline: "none", fontFamily: "inherit", resize: "vertical" }} />
              {(reasons.size > 0 || note.trim() !== "") && (
                <div style={{ marginTop: 8, background: "rgba(124,99,200,0.06)", border: "1px solid #d8d0f0", borderRadius: 8, padding: "9px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: PRIMARY_DK }}>{t.noraTeaser}</span>
                  <button type="button" disabled title="Bientôt" style={{ fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 8, color: PRIMARY_DK, background: "white", border: `1px solid ${PRIMARY}`, cursor: "not-allowed", opacity: 0.7, fontFamily: "inherit" }}>{t.noraCta} ↗</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
