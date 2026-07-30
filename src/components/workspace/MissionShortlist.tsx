"use client"

/**
 * MissionShortlist (Lot A) — la vraie « shortlist » d'une mission.
 *
 * Contrairement à l'onglet « Candidats » (résultats de matching bruts, tout le
 * vivier scoré), cette vue ne montre QUE les candidats mis en pipeline
 * (`in_pipeline = true`) : ceux que le sourceur a retenus et qu'il va qualifier
 * — avancer dans les étapes, recruter ou écarter.
 *
 * Vue GALERIE (lot A) : cartes groupées par étape, avec 3 traitements couleur
 * seulement (à qualifier = accent violet · recruté = vert doux · écarté =
 * grisé estompé), le reste neutre — pas d'arc-en-ciel. Le toggle Kanban arrive
 * au lot A.2 ; l'anonymisation + le téléchargement groupé aux lots B/C.
 *
 * Les données viennent de la page mission (mêmes `rows` que le matching, aucun
 * fetch neuf). Les changements d'étape passent par PATCH /api/match/:id/stage
 * (déjà gardé serveur par requireActiveAccess) et remontent au parent via
 * `onLocalUpdate` pour un rendu optimiste.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { m } from "framer-motion"
import type { Candidate, MatchAssessment, Job, PipelineStage } from "@/lib/database.types"
import { candidateRefLabel } from "@/lib/candidate-ref"
import { tierMeta } from "@/lib/criterion-display"
import RejectReasonPicker from "@/components/workspace/RejectReasonPicker"
import type { RejectReason } from "@/lib/reject-reasons"
import { rejectReasonLabel } from "@/lib/reject-reasons"
import type { Lang } from "@/lib/i18n/LanguageContext"
import { AnonymizeSettings, type AnonymizeBranding } from "@/components/workspace/AnonymizeSettings"
import { type AnonymizeTemplate, readOrgDefaults } from "@/components/workspace/anonymize/types"
import { detectOffLimitsForCandidate, type OffLimitsClientRef } from "@/lib/off-limits"

type OffLimitsBadge = { verdict: "possible" | "confirmed"; clientName: string } | null

/** Off-limits d'un candidat vs l'annuaire clients (tenure-aware : employeurs
 *  ACTUELS seulement). Helper pur, réutilisé par carte. */
function offLimitsFor(candidate: Candidate | null, dir: OffLimitsClientRef[]): OffLimitsBadge {
  if (dir.length === 0 || !candidate) return null
  const res = detectOffLimitsForCandidate(candidate.parsed_cv, candidate.current_company, dir)
  if (res.verdict === "none" || !res.client) return null
  return { verdict: res.verdict, clientName: res.client.name }
}

const OFF_LIMITS_LABEL = {
  fr: {
    confirmed: (c: string) => `Off-limits — en poste chez ${c}`,
    possible: (c: string) => `Conflit possible — proche de ${c}`,
  },
  en: {
    confirmed: (c: string) => `Off-limits — currently at ${c}`,
    possible: (c: string) => `Possible conflict — close to ${c}`,
  },
} as const

/** Branding minimal de l'org nécessaire à l'anonymisation (gabarit + aperçu). */
export interface ShortlistOrg {
  name: string
  brand_name: string | null
  brand_color: string | null
  brand_color_secondary: string | null
  brand_slogan: string | null
  contact_email: string | null
  anonymize_defaults: { template?: string; watermark?: boolean; watermarkText?: string } | null
}

type AssessmentRow = MatchAssessment & { candidate: Candidate | null }

/** Regroupement des 8 étapes en 4 familles lisibles pour la shortlist. */
type Group = "to_qualify" | "in_progress" | "hired" | "rejected"

const STAGE_GROUP: Record<PipelineStage, Group> = {
  identified: "to_qualify",
  pricing: "in_progress",
  contacted: "in_progress",
  replied: "in_progress",
  interview: "in_progress",
  offer: "in_progress",
  hired: "hired",
  rejected: "rejected",
}

/** Ordre d'affichage des groupes + traitement visuel (anti arc-en-ciel). */
const GROUP_ORDER: Group[] = ["to_qualify", "in_progress", "hired", "rejected"]

const GROUP_STYLE: Record<Group, { accent: string; cardBg: string; cardBorder: string; dim: number }> = {
  // À qualifier = action attendue → fin accent violet, fond neutre.
  to_qualify: { accent: "var(--nw-primary)", cardBg: "white", cardBorder: "var(--nw-border)", dim: 1 },
  // En cours = neutre, aucune couleur.
  in_progress: { accent: "var(--nw-border-strong, var(--nw-border))", cardBg: "white", cardBorder: "var(--nw-border)", dim: 1 },
  // Recruté = voile vert doux.
  hired: { accent: "var(--nw-success)", cardBg: "rgba(34,197,94,0.06)", cardBorder: "rgba(34,197,94,0.28)", dim: 1 },
  // Écarté = grisé estompé, jamais rouge agressif.
  rejected: { accent: "var(--nw-text-muted)", cardBg: "var(--nw-neutral-100)", cardBorder: "var(--nw-border)", dim: 0.66 },
}

const copy = {
  fr: {
    title: (mission: string) => `Shortlist · ${mission}`,
    subtitle: (n: number) =>
      n === 0 ? "Aucun candidat retenu pour l'instant." : `${n} candidat${n > 1 ? "s" : ""} retenu${n > 1 ? "s" : ""}`,
    emptyTitle: "Votre shortlist est vide",
    emptyBody: "Ajoutez des candidats depuis l'onglet Candidats (bouton « Ajouter à la shortlist ») pour les qualifier ici.",
    emptyFiltered: "Aucun candidat dans cette catégorie.",
    filters: {
      all: "Tous",
      to_qualify: "À qualifier",
      in_progress: "En cours",
      hired: "Recruté",
      rejected: "Écarté",
    } as Record<"all" | Group, string>,
    groupTitles: {
      to_qualify: "À qualifier",
      in_progress: "En cours",
      hired: "Recruté",
      rejected: "Écarté",
    } as Record<Group, string>,
    stageLabel: {
      identified: "À qualifier",
      pricing: "Chiffrage",
      contacted: "Contacté",
      replied: "Réponse",
      interview: "Entretien",
      offer: "Présenté au client",
      hired: "Recruté",
      rejected: "Écarté",
    } as Record<PipelineStage, string>,
    stageAria: "Changer l'étape",
    profile: "Fiche match",
    score: "Score",
    noName: "Sans nom",
    rejectedFor: "Écarté :",
    readOnly: "Lecture seule",
    readOnlyHint: "Lecture seule — souscrivez pour qualifier la shortlist",
    viewGallery: "Galerie",
    viewKanban: "Kanban",
    kanbanHint: "Glissez une carte d'une colonne à l'autre pour faire avancer un candidat.",
    emptyColumn: "—",
    reactivate: "↩ Remettre à qualifier",
    terminalEmpty: (label: string) => `Aucun candidat dans « ${label} » pour l'instant.`,
    chipHint: (label: string) => `${label} — cliquez pour voir, ou glissez une carte ici`,
    downloadAll: "Télécharger tous les CV anonymisés",
    downloadAllShort: "Tout télécharger",
    downloadSelection: (n: number) => `Télécharger la sélection (${n})`,
    selectMode: "Sélectionner",
    selectCancel: "Annuler la sélection",
    selectCount: (n: number) => `${n} sélectionné${n > 1 ? "s" : ""}`,
    personalize: "Personnaliser",
    downloadOne: "Télécharger le CV anonymisé",
    downloading: "Génération…",
    anonError: "La génération a échoué. Réessayez.",
    downloadCapNote: (max: number) => `Téléchargement groupé limité à ${max} CV à la fois — utilisez « Sélectionner » pour les autres.`,
  },
  en: {
    title: (mission: string) => `Shortlist · ${mission}`,
    subtitle: (n: number) =>
      n === 0 ? "No candidate shortlisted yet." : `${n} shortlisted candidate${n > 1 ? "s" : ""}`,
    emptyTitle: "Your shortlist is empty",
    emptyBody: "Add candidates from the Candidates tab (“Add to shortlist” button) to qualify them here.",
    emptyFiltered: "No candidate in this category.",
    filters: {
      all: "All",
      to_qualify: "To qualify",
      in_progress: "In progress",
      hired: "Hired",
      rejected: "Rejected",
    } as Record<"all" | Group, string>,
    groupTitles: {
      to_qualify: "To qualify",
      in_progress: "In progress",
      hired: "Hired",
      rejected: "Rejected",
    } as Record<Group, string>,
    stageLabel: {
      identified: "To qualify",
      pricing: "Pricing",
      contacted: "Contacted",
      replied: "Replied",
      interview: "Interview",
      offer: "Presented to client",
      hired: "Hired",
      rejected: "Rejected",
    } as Record<PipelineStage, string>,
    stageAria: "Change stage",
    profile: "Match sheet",
    score: "Score",
    noName: "No name",
    rejectedFor: "Rejected:",
    readOnly: "Read-only",
    readOnlyHint: "Read-only — subscribe to qualify the shortlist",
    viewGallery: "Gallery",
    viewKanban: "Kanban",
    kanbanHint: "Drag a card from one column to another to move a candidate forward.",
    emptyColumn: "—",
    reactivate: "↩ Back to qualify",
    terminalEmpty: (label: string) => `No candidate in "${label}" yet.`,
    chipHint: (label: string) => `${label} — click to view, or drop a card here`,
    downloadAll: "Download all anonymized CVs",
    downloadAllShort: "Download all",
    downloadSelection: (n: number) => `Download selection (${n})`,
    selectMode: "Select",
    selectCancel: "Cancel selection",
    selectCount: (n: number) => `${n} selected`,
    personalize: "Customize",
    downloadOne: "Download anonymized CV",
    downloading: "Generating…",
    anonError: "Generation failed. Please try again.",
    downloadCapNote: (max: number) => `Batch download is limited to ${max} CVs at a time — use “Select” for the rest.`,
  },
}

/** Plafond serveur du téléchargement groupé (doit rester = MAX_BATCH de la route). */
const MAX_DOWNLOAD_BATCH = 25

/** Étapes proposées dans le sélecteur, dans l'ordre du tunnel. */
const STAGE_OPTIONS: PipelineStage[] = [
  "identified", "pricing", "contacted", "replied", "interview", "offer", "hired", "rejected",
]

/** Pastille couleur par étape (discrète) — repère visuel dans le dropdown. */
const STAGE_DOT: Record<PipelineStage, string> = {
  identified: "var(--nw-primary)",
  pricing: "var(--nw-text-muted)",
  contacted: "#2563EB",
  replied: "var(--nw-primary)",
  interview: "var(--nw-warn)",
  offer: "var(--nw-success)",
  hired: "#0F766E",
  rejected: "var(--nw-text-muted)",
}

interface Props {
  job: Job
  rows: AssessmentRow[]
  isReadOnly: boolean
  organization: ShortlistOrg
  /** Lien vers l'onglet Branding (owner/délégué) — null = masqué. */
  brandingHref?: string | null
  /** Rendu optimiste : la page mission met à jour sa propre liste `rows`. */
  onLocalUpdate: (rowId: string, patch: Partial<MatchAssessment>) => void
  /** Annuaire clients (cabinet/ESN) pour l'alerte off-limits. */
  clientDirectory?: OffLimitsClientRef[]
  lang: Lang
}

export function MissionShortlist({ job, rows, isReadOnly, organization, brandingHref, onLocalUpdate, clientDirectory = [], lang }: Props) {
  const t = copy[lang]
  const [filter, setFilter] = useState<"all" | Group>("all")
  const [viewMode, setViewMode] = useState<"gallery" | "kanban">("gallery")
  const [saving, setSaving] = useState<Set<string>>(new Set())
  // Écartement en attente de raison : on garde la row ciblée le temps du picker.
  const [rejecting, setRejecting] = useState<AssessmentRow | null>(null)

  // ── Anonymisation ──────────────────────────────────────────────────────
  // Gabarit org (template + filigrane) — valeurs contrôlées, envoyées en
  // surcharge live à la génération (voir/télécharger cohérents avant même
  // « Enregistrer le gabarit »).
  const orgDefaults = useMemo(() => readOrgDefaults(organization.anonymize_defaults), [organization.anonymize_defaults])
  const [template, setTemplate] = useState<AnonymizeTemplate>(orgDefaults.template)
  const [watermark, setWatermark] = useState(orgDefaults.watermark)
  const [watermarkText, setWatermarkText] = useState(orgDefaults.watermarkText)
  // Options mission (résumé Nora + message) — auto-sauvées.
  const [anonNora, setAnonNora] = useState(job.anonymize_options?.keepNoraSummary ?? false)
  const [anonMsg, setAnonMsg] = useState(job.anonymize_options?.customText ?? "")
  // Sélection + téléchargements.
  const [selectionMode, setSelectionMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showPanel, setShowPanel] = useState(false)
  const [downloading, setDownloading] = useState<"idle" | "all" | "selection" | string>("idle")
  const [anonErr, setAnonErr] = useState<string | null>(null)

  const anonBranding: AnonymizeBranding = useMemo(() => ({
    orgName: (organization.brand_name?.trim() || organization.name?.trim()) || "",
    logoUrl: null,
    color: organization.brand_color,
    colorSecondary: organization.brand_color_secondary,
    slogan: organization.brand_slogan,
    contactEmail: organization.contact_email,
  }), [organization])

  // Options live envoyées à la génération (surcharge le DB → voir == télécharger).
  const liveOptions = () => ({
    template, watermark, watermarkText: watermarkText.trim().slice(0, 40),
    keepNoraSummary: anonNora, customText: anonMsg.trim().slice(0, 600),
  })

  async function saveJobOptions(next: { keepNoraSummary: boolean; customText: string }) {
    try {
      await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonymize_options: next }),
      })
    } catch { /* best-effort */ }
  }

  // Persistance différée du message mission (le résumé Nora est sauvé au toggle).
  const msgMounted = useRef(false)
  useEffect(() => {
    if (!msgMounted.current) { msgMounted.current = true; return }
    const id = setTimeout(() => { void saveJobOptions({ keepNoraSummary: anonNora, customText: anonMsg }) }, 700)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anonMsg])

  function toggleSelect(candidateId: string) {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(candidateId)) n.delete(candidateId); else n.add(candidateId)
      return n
    })
  }

  function exitSelection() { setSelectionMode(false); setSelected(new Set()) }

  /** Télécharge 1 CV (PDF) ou N CV (zip). `tag` pilote le spinner. */
  async function download(ids: string[], tag: "all" | "selection" | string) {
    if (ids.length === 0 || downloading !== "idle") return
    setDownloading(tag); setAnonErr(null)
    try {
      const res = await fetch(`/api/jobs/${job.id}/anonymize-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      if (tag === "selection") exitSelection()
    } catch {
      setAnonErr(t.anonError)
    } finally {
      setDownloading("idle")
    }
  }

  const shortlisted = useMemo(
    () => rows.filter((r) => r.in_pipeline),
    [rows],
  )

  // Compteurs par groupe pour les filtres.
  const counts = useMemo(() => {
    const c: Record<"all" | Group, number> = {
      all: shortlisted.length, to_qualify: 0, in_progress: 0, hired: 0, rejected: 0,
    }
    for (const r of shortlisted) c[STAGE_GROUP[r.pipeline_stage]]++
    return c
  }, [shortlisted])

  const visible = useMemo(
    () => (filter === "all" ? shortlisted : shortlisted.filter((r) => STAGE_GROUP[r.pipeline_stage] === filter)),
    [shortlisted, filter],
  )

  // Regroupe les cartes visibles par groupe, dans l'ordre GROUP_ORDER.
  const grouped = useMemo(() => {
    const map = new Map<Group, AssessmentRow[]>()
    for (const g of GROUP_ORDER) map.set(g, [])
    for (const r of visible) map.get(STAGE_GROUP[r.pipeline_stage])!.push(r)
    return GROUP_ORDER.map((g) => ({ group: g, items: map.get(g)! })).filter((s) => s.items.length > 0)
  }, [visible])

  async function patchStage(row: AssessmentRow, stage: PipelineStage, reason?: RejectReason | null, note?: string | null) {
    if (isReadOnly) return
    const prevStage = row.pipeline_stage
    // Rendu optimiste.
    onLocalUpdate(row.id, { pipeline_stage: stage, in_pipeline: true })
    setSaving((s) => new Set(s).add(row.id))
    try {
      const res = await fetch(`/api/match/${row.id}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipeline_stage: stage,
          ...(stage === "rejected" ? { reject_reason: reason ?? null, reject_reason_note: note ?? null } : {}),
        }),
      })
      if (!res.ok) {
        onLocalUpdate(row.id, { pipeline_stage: prevStage }) // rollback
      } else if (stage === "rejected") {
        onLocalUpdate(row.id, { reject_reason: reason ?? null, reject_reason_note: note ?? null })
      }
    } catch {
      onLocalUpdate(row.id, { pipeline_stage: prevStage })
    } finally {
      setSaving((s) => { const n = new Set(s); n.delete(row.id); return n })
    }
  }

  function onSelectStage(row: AssessmentRow, stage: PipelineStage) {
    if (stage === row.pipeline_stage) return
    // Écarter passe par le picker de raison (comme la pipeline).
    if (stage === "rejected") { setRejecting(row); return }
    void patchStage(row, stage)
  }

  return (
    <section aria-label={t.title(job.title)}>
      {/* En-tête + toggle Galerie/Kanban */}
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        gap: 16, marginBottom: 14, flexWrap: "wrap",
      }}>
        <div>
          <h2 style={{
            margin: 0, fontSize: 17, fontWeight: 800, color: "var(--nw-text)",
            letterSpacing: "-0.01em", fontFamily: "var(--font-inter), sans-serif",
          }}>
            {t.title(job.title)}
          </h2>
          <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--nw-text-muted)" }}>
            {viewMode === "kanban" && shortlisted.length > 0 ? t.kanbanHint : t.subtitle(shortlisted.length)}
          </p>
        </div>
        {shortlisted.length > 0 && (
          <div style={{
            display: "inline-flex", background: "var(--nw-neutral-100)", borderRadius: 9, padding: 3, gap: 2,
          }}>
            {(["gallery", "kanban"] as const).map((mode) => {
              const on = viewMode === mode
              return (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{
                    fontFamily: "inherit", fontSize: 12, fontWeight: on ? 700 : 600,
                    color: on ? "var(--nw-primary)" : "var(--nw-text-muted)",
                    background: on ? "white" : "transparent",
                    border: "none", borderRadius: 7, padding: "5px 12px", cursor: "pointer",
                    boxShadow: on ? "0 1px 2px rgba(17,24,39,0.08)" : "none",
                  }}
                >
                  {mode === "gallery" ? t.viewGallery : t.viewKanban}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Filtres par statut (galerie uniquement — le kanban montre déjà les stades) */}
      {viewMode === "gallery" && shortlisted.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
          {(["all", ...GROUP_ORDER] as const).map((key) => {
            const active = filter === key
            const n = counts[key]
            if (key !== "all" && n === 0) return null
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                style={{
                  fontFamily: "inherit", fontSize: 12, fontWeight: active ? 700 : 600,
                  color: active ? "white" : "var(--nw-text-body)",
                  background: active ? "var(--nw-primary)" : "white",
                  border: `1px solid ${active ? "var(--nw-primary)" : "var(--nw-border)"}`,
                  borderRadius: 999, padding: "6px 13px", cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}
              >
                {t.filters[key]}
                <span style={{
                  fontSize: 10.5, fontWeight: 700,
                  color: active ? "rgba(255,255,255,0.85)" : "var(--nw-text-muted)",
                }}>
                  {n}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Barre d'anonymisation : télécharger tous / sélectionner / personnaliser */}
      {viewMode === "gallery" && !isReadOnly && shortlisted.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => void download(shortlisted.map((r) => r.candidate_id), "all")}
              disabled={downloading !== "idle"}
              style={{
                fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: "white",
                background: "var(--nw-primary)", border: "none", borderRadius: 9,
                padding: "9px 16px", cursor: downloading === "idle" ? "pointer" : "wait",
                opacity: downloading === "all" ? 0.7 : 1,
                display: "inline-flex", alignItems: "center", gap: 8,
              }}
            >
              <DownloadIcon />
              {downloading === "all" ? t.downloading : t.downloadAll}
            </button>
            <button
              onClick={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
              style={{
                fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                color: selectionMode ? "var(--nw-primary)" : "var(--nw-text-body)",
                background: "white", border: `1px solid ${selectionMode ? "var(--nw-primary)" : "var(--nw-border)"}`,
                borderRadius: 9, padding: "9px 14px", cursor: "pointer",
              }}
            >
              {selectionMode ? t.selectCancel : t.selectMode}
            </button>
            <button
              onClick={() => setShowPanel((v) => !v)}
              style={{
                fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "var(--nw-text-body)",
                background: "white", border: "1px solid var(--nw-border)", borderRadius: 9,
                padding: "9px 14px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              {t.personalize}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--nw-text-muted)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: showPanel ? "rotate(180deg)" : "none", transition: "transform .15s" }}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {anonErr && <span style={{ fontSize: 12, color: "var(--nw-danger-strong, #B91C1C)" }}>{anonErr}</span>}
          </div>

          {shortlisted.length > MAX_DOWNLOAD_BATCH && (
            <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--nw-text-muted)" }}>
              {t.downloadCapNote(MAX_DOWNLOAD_BATCH)}
            </p>
          )}

          {showPanel && (
            <div style={{ marginTop: 12 }}>
              <AnonymizeSettings
                branding={anonBranding}
                template={template}
                watermark={watermark}
                watermarkText={watermarkText}
                onTemplate={setTemplate}
                onWatermark={setWatermark}
                onWatermarkText={setWatermarkText}
                keepNoraSummary={anonNora}
                customText={anonMsg}
                onKeepNora={(v) => { setAnonNora(v); void saveJobOptions({ keepNoraSummary: v, customText: anonMsg }) }}
                onCustomText={(v) => setAnonMsg(v)}
                brandingHref={brandingHref}
                lang={lang}
              />
            </div>
          )}
        </div>
      )}

      {/* Empty state global */}
      {shortlisted.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "44px 20px", borderRadius: 14,
          border: "1px dashed var(--nw-border)", background: "var(--nw-surface, #FBFAFF)",
        }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--nw-text)" }}>{t.emptyTitle}</p>
          <p style={{ margin: "6px auto 0", fontSize: 12.5, color: "var(--nw-text-muted)", maxWidth: 380, lineHeight: 1.55 }}>
            {t.emptyBody}
          </p>
        </div>
      ) : viewMode === "kanban" ? (
        <ShortlistKanban
          rows={shortlisted}
          isReadOnly={isReadOnly}
          stageLabel={t.stageLabel}
          emptyColumn={t.emptyColumn}
          reactivateLabel={t.reactivate}
          terminalEmpty={t.terminalEmpty}
          chipHint={t.chipHint}
          onMove={(row, stage) => onSelectStage(row, stage)}
        />
      ) : visible.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--nw-text-muted)", padding: "20px 0" }}>{t.emptyFiltered}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {grouped.map(({ group, items }) => (
            <div key={group}>
              {/* Titre de groupe seulement en vue « Tous » (sinon le filtre le dit déjà) */}
              {filter === "all" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: 999, background: GROUP_STYLE[group].accent,
                  }} />
                  <h3 style={{
                    margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                    textTransform: "uppercase", color: "var(--nw-text-muted)",
                    fontFamily: "var(--nw-font-mono)",
                  }}>
                    {t.groupTitles[group]}
                  </h3>
                  <span style={{ fontSize: 11, color: "var(--nw-text-muted)" }}>{items.length}</span>
                </div>
              )}
              <div style={{
                display: "grid", gap: 12,
                gridTemplateColumns: "repeat(auto-fill, minmax(258px, 1fr))",
              }}>
                {items.map((row) => (
                  <ShortlistCard
                    key={row.id}
                    row={row}
                    isReadOnly={isReadOnly}
                    saving={saving.has(row.id)}
                    onSelectStage={onSelectStage}
                    selectMode={selectionMode}
                    isSelected={selected.has(row.candidate_id)}
                    onToggleSelect={() => toggleSelect(row.candidate_id)}
                    canDownload={!isReadOnly}
                    downloadingOne={downloading === row.candidate_id}
                    onDownloadOne={() => void download([row.candidate_id], row.candidate_id)}
                    offLimits={offLimitsFor(row.candidate, clientDirectory)}
                    lang={lang}
                    t={t}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Barre d'action « télécharger la sélection » (mode sélection) */}
      {!isReadOnly && selectionMode && selected.size > 0 && (
        <div style={{
          position: "sticky", bottom: 16, zIndex: 40, marginTop: 16,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          padding: "12px 16px", borderRadius: 12,
          background: "white", border: "1px solid var(--nw-primary-200)",
          boxShadow: "0 12px 32px rgba(17,24,39,0.14)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--nw-text)" }}>{t.selectCount(selected.size)}</span>
            <button
              onClick={exitSelection}
              style={{ fontFamily: "inherit", fontSize: 12, color: "var(--nw-text-muted)", background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline" }}
            >
              {t.selectCancel}
            </button>
            {anonErr && <span style={{ fontSize: 12, color: "var(--nw-danger-strong, #B91C1C)" }}>{anonErr}</span>}
          </div>
          <button
            onClick={() => void download(Array.from(selected), "selection")}
            disabled={downloading !== "idle"}
            style={{
              fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: "white",
              background: "var(--nw-primary)", border: "none", borderRadius: 9,
              padding: "10px 18px", cursor: downloading === "idle" ? "pointer" : "wait", opacity: downloading === "selection" ? 0.7 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {downloading === "selection" ? t.downloading : t.downloadSelection(selected.size)}
          </button>
        </div>
      )}

      {/* Picker de raison d'écart */}
      <RejectReasonPicker
        open={rejecting !== null}
        candidateName={rejecting?.candidate?.full_name ?? t.noName}
        onConfirm={(reason, note) => {
          const row = rejecting
          setRejecting(null)
          if (row) void patchStage(row, "rejected", reason, note)
        }}
        onCancel={() => setRejecting(null)}
      />
    </section>
  )
}

/* ── Carte shortlist ─────────────────────────────────────────────────── */

function ShortlistCard({
  row, isReadOnly, saving, onSelectStage, selectMode, isSelected, onToggleSelect,
  canDownload, downloadingOne, onDownloadOne, offLimits, lang, t,
}: {
  row: AssessmentRow
  isReadOnly: boolean
  saving: boolean
  onSelectStage: (row: AssessmentRow, stage: PipelineStage) => void
  selectMode: boolean
  isSelected: boolean
  onToggleSelect: () => void
  canDownload: boolean
  downloadingOne: boolean
  onDownloadOne: () => void
  offLimits: OffLimitsBadge
  lang: Lang
  t: (typeof copy)[Lang]
}) {
  const group = STAGE_GROUP[row.pipeline_stage]
  const style = GROUP_STYLE[group]
  const tier = tierMeta(row.match_tier, lang)
  const name = row.candidate?.full_name?.trim() || t.noName
  const ref = candidateRefLabel(row.candidate_id)
  const subtitle = row.candidate?.current_title?.trim() || ref

  return (
    <m.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: "relative",
        background: style.cardBg,
        border: `1px solid ${isSelected ? "var(--nw-primary)" : style.cardBorder}`,
        borderLeft: `3px solid ${style.accent}`,
        borderRadius: 12,
        padding: "13px 14px",
        opacity: style.dim,
        display: "flex", flexDirection: "column", gap: 10,
        boxShadow: isSelected ? "0 0 0 1px var(--nw-primary)" : "none",
      }}
    >
      {/* Ligne 1 : (checkbox) + nom + tier */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 9, minWidth: 0 }}>
          {selectMode && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              style={{ marginTop: 2, width: 15, height: 15, accentColor: "var(--nw-primary)", flexShrink: 0, cursor: "pointer" }}
            />
          )}
          <div style={{ minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--nw-text)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {name}
          </p>
          <p style={{
            margin: "2px 0 0", fontSize: 11.5, color: "var(--nw-text-muted)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {subtitle}
          </p>
          {offLimits && (
            <span
              title={OFF_LIMITS_LABEL[lang][offLimits.verdict](offLimits.clientName)}
              style={{
                marginTop: 5,
                display: "inline-flex", alignItems: "center", gap: 5, maxWidth: "100%",
                padding: "2px 8px", borderRadius: 99,
                fontSize: 10, fontWeight: 700, letterSpacing: "0.02em",
                color: offLimits.verdict === "confirmed" ? "#B42318" : "#B54708",
                background: offLimits.verdict === "confirmed" ? "rgba(217,45,32,0.08)" : "rgba(245,158,11,0.10)",
                border: `1px solid ${offLimits.verdict === "confirmed" ? "rgba(217,45,32,0.28)" : "rgba(245,158,11,0.32)"}`,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 16 16" style={{ flexShrink: 0 }} aria-hidden="true">
                <path d="M8 1.5L15 14H1L8 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M8 6.2v3.2M8 11.4h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {OFF_LIMITS_LABEL[lang][offLimits.verdict](offLimits.clientName)}
              </span>
            </span>
          )}
          </div>
        </div>
        {row.match_tier && (
          <span style={{
            flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
            textTransform: "uppercase", padding: "3px 7px", borderRadius: 6,
            color: tier.color, background: tier.bg, border: `1px solid ${tier.bd}`,
          }}>
            {tier.label}
          </span>
        )}
      </div>

      {/* Ligne 2 : score + réf */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5, color: "var(--nw-text-muted)", flexWrap: "wrap" }}>
        {typeof row.score === "number" && (
          <span><strong style={{ color: "var(--nw-text)", fontSize: 13 }}>{Math.round(row.score)}</strong> · {t.score}</span>
        )}
        <span style={{ fontFamily: "var(--nw-font-mono)", fontSize: 10.5 }}>{ref}</span>
      </div>

      {/* Raison d'écart si écarté */}
      {row.pipeline_stage === "rejected" && row.reject_reason && (
        <p style={{ margin: 0, fontSize: 11, color: "var(--nw-text-muted)", fontStyle: "italic" }}>
          {t.rejectedFor} {rejectReasonLabel(row.reject_reason, lang)}
        </p>
      )}

      {/* Ligne 3 : étape (sélecteur) + actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
        <StageDropdown
          value={row.pipeline_stage}
          disabled={isReadOnly || saving}
          readOnlyHint={isReadOnly ? t.readOnlyHint : undefined}
          ariaLabel={t.stageAria}
          stageLabel={t.stageLabel}
          onSelect={(s) => onSelectStage(row, s)}
        />
        <Link
          href={`/workspace/match/${row.id}`}
          style={{
            fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, color: "var(--nw-primary)",
            textDecoration: "none", whiteSpace: "nowrap",
          }}
        >
          {t.profile}
        </Link>
        {canDownload && (
          <button
            type="button"
            onClick={onDownloadOne}
            disabled={downloadingOne}
            title={t.downloadOne}
            aria-label={t.downloadOne}
            style={{
              marginLeft: "auto", display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 30, height: 30, borderRadius: 8, flexShrink: 0,
              background: "white", border: "1px solid var(--nw-border)",
              cursor: downloadingOne ? "wait" : "pointer", opacity: downloadingOne ? 0.6 : 1, color: "var(--nw-primary)",
            }}
          >
            {downloadingOne
              ? <Spinner />
              : <DownloadIcon />}
          </button>
        )}
      </div>
    </m.article>
  )
}

/* ── Icônes ──────────────────────────────────────────────────────────── */

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" style={{ animation: "nw-spin 0.7s linear infinite" }}>
      <path d="M21 12a9 9 0 1 1-6.2-8.5" />
      <style>{"@keyframes nw-spin{to{transform:rotate(360deg)}}"}</style>
    </svg>
  )
}

/* ── Sélecteur d'étape stylisé (remplace le <select> natif) ──────────── */

function StageDropdown({
  value, disabled, readOnlyHint, ariaLabel, stageLabel, onSelect,
}: {
  value: PipelineStage
  disabled: boolean
  readOnlyHint?: string
  ariaLabel: string
  stageLabel: Record<PipelineStage, string>
  onSelect: (stage: PipelineStage) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onEsc)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onEsc)
    }
  }, [open])

  return (
    <div ref={ref} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        title={readOnlyHint}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 7,
          fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: "var(--nw-text-body)",
          background: "white", border: "1px solid var(--nw-border)", borderRadius: 8,
          padding: "7px 10px", cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: 999, background: STAGE_DOT[value], flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {stageLabel[value]}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--nw-text-muted)"
          strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 40,
            background: "white", border: "1px solid var(--nw-border)", borderRadius: 10,
            boxShadow: "0 12px 32px rgba(17,24,39,0.14)", padding: 4,
            maxHeight: 280, overflowY: "auto",
          }}
        >
          {STAGE_OPTIONS.map((s) => {
            const sel = s === value
            return (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={sel}
                onClick={() => { setOpen(false); if (s !== value) onSelect(s) }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  fontFamily: "inherit", fontSize: 12.5, fontWeight: sel ? 700 : 500,
                  color: sel ? "var(--nw-primary)" : "var(--nw-text-body)",
                  background: sel ? "var(--nw-primary-50)" : "white",
                  border: "none", borderRadius: 7, padding: "8px 9px", cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: 999, background: STAGE_DOT[s], flexShrink: 0 }} />
                {stageLabel[s]}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── Vue Kanban (scopée à la mission, calquée sur /workspace/pipeline) ── */

type StageMeta = { key: PipelineStage; color: string; bg: string }

// Colonnes actives = le parcours relationnel. 'pricing' est fusionné dans
// 'identified' (stade rare, géré dans l'onglet Pricing). 'hired'/'rejected'
// ne sont PAS des colonnes : ce sont des issues, montrées en chips au-dessus.
const KANBAN_ACTIVE: StageMeta[] = [
  { key: "identified", color: "var(--nw-text-muted)", bg: "#F9FAFB" },
  { key: "contacted",  color: "#2563EB", bg: "rgba(37,99,235,0.05)" },
  { key: "replied",    color: "var(--nw-primary)", bg: "rgba(124,99,200,0.05)" },
  { key: "interview",  color: "var(--nw-warn)", bg: "rgba(245,158,11,0.06)" },
  { key: "offer",      color: "var(--nw-success)", bg: "rgba(34,197,94,0.06)" },
]

const KANBAN_TERMINAL: StageMeta[] = [
  { key: "hired",    color: "#0F766E", bg: "rgba(15,118,110,0.08)" },
  { key: "rejected", color: "var(--nw-text-muted)", bg: "var(--nw-neutral-100)" },
]

function kanbanColumnOf(stage: PipelineStage): PipelineStage {
  return stage === "pricing" ? "identified" : stage
}

function ShortlistKanban({
  rows, isReadOnly, stageLabel, emptyColumn, reactivateLabel, terminalEmpty, chipHint, onMove,
}: {
  rows: AssessmentRow[]
  isReadOnly: boolean
  stageLabel: Record<PipelineStage, string>
  emptyColumn: string
  reactivateLabel: string
  terminalEmpty: (label: string) => string
  chipHint: (label: string) => string
  onMove: (row: AssessmentRow, stage: PipelineStage) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<PipelineStage | null>(null)
  const [overTerminal, setOverTerminal] = useState<PipelineStage | null>(null)
  // Quand une issue terminale est sélectionnée, le board est remplacé par la
  // liste de ses candidats (comme /pipeline).
  const [terminalView, setTerminalView] = useState<PipelineStage | null>(null)

  const byColumn = useMemo(() => {
    const map = new Map<PipelineStage, AssessmentRow[]>()
    for (const c of KANBAN_ACTIVE) map.set(c.key, [])
    for (const r of rows) {
      const col = kanbanColumnOf(r.pipeline_stage)
      if (map.has(col)) map.get(col)!.push(r)
    }
    return map
  }, [rows])

  const terminalCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const s of KANBAN_TERMINAL) c[s.key] = rows.filter((r) => r.pipeline_stage === s.key).length
    return c
  }, [rows])

  const terminalRows = useMemo(
    () => (terminalView ? rows.filter((r) => r.pipeline_stage === terminalView) : []),
    [rows, terminalView],
  )

  function drop(stage: PipelineStage) {
    if (!dragId) return
    const row = rows.find((r) => r.id === dragId)
    setDragId(null); setOverCol(null); setOverTerminal(null)
    if (row && row.pipeline_stage !== stage) onMove(row, stage)
  }

  return (
    <div>
      {/* Chips issues terminales — cliquables + zones de drop */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {KANBAN_TERMINAL.map((s) => {
          const active = terminalView === s.key
          const isOver = overTerminal === s.key
          return (
            <button
              key={s.key}
              onClick={() => setTerminalView(active ? null : s.key)}
              onDragOver={(e) => { if (isReadOnly) return; e.preventDefault(); if (overTerminal !== s.key) setOverTerminal(s.key) }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setOverTerminal(null) }}
              onDrop={(e) => { e.preventDefault(); drop(s.key) }}
              title={chipHint(stageLabel[s.key])}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                color: active || isOver ? "white" : s.color,
                background: active || isOver ? s.color : s.bg,
                border: `1px solid ${active || isOver ? s.color : "transparent"}`,
                borderRadius: 9, padding: "7px 12px", cursor: "pointer", transition: "all 120ms",
              }}
            >
              {s.key === "hired" ? "✓" : "✕"} {stageLabel[s.key]}
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

      {terminalView ? (
        /* Liste des candidats d'une issue terminale */
        terminalRows.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--nw-text-muted)", padding: "24px 0", textAlign: "center" }}>
            {terminalEmpty(stageLabel[terminalView])}
          </p>
        ) : (
          <div style={{
            display: "grid", gap: 12,
            gridTemplateColumns: "repeat(auto-fill, minmax(258px, 1fr))",
          }}>
            {terminalRows.map((row) => (
              <KanbanCard
                key={row.id}
                row={row}
                isReadOnly={isReadOnly}
                dragging={false}
                onDragStart={() => {}}
                onDragEnd={() => {}}
                draggable={false}
                reactivate={isReadOnly ? undefined : { label: reactivateLabel, onClick: () => onMove(row, "identified") }}
              />
            ))}
          </div>
        )
      ) : (
        /* Board : colonnes actives */
        <div style={{ overflowX: "auto", paddingBottom: 8 }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${KANBAN_ACTIVE.length}, minmax(196px, 1fr))`,
            gap: 10, minWidth: KANBAN_ACTIVE.length * 196,
          }}>
            {KANBAN_ACTIVE.map((s) => {
              const cards = byColumn.get(s.key) ?? []
              const isOver = overCol === s.key
              return (
                <div
                  key={s.key}
                  onDragOver={(e) => { if (isReadOnly) return; e.preventDefault(); if (overCol !== s.key) setOverCol(s.key) }}
                  onDragLeave={(e) => { if (e.currentTarget === e.target) setOverCol(null) }}
                  onDrop={(e) => { e.preventDefault(); drop(s.key) }}
                  style={{
                    background: isOver ? "rgba(124,99,200,0.07)" : s.bg,
                    border: `1px solid ${isOver ? "var(--nw-primary-200)" : "var(--nw-border)"}`,
                    borderRadius: 12, padding: 8, minHeight: 140,
                    display: "flex", flexDirection: "column", gap: 8,
                    transition: "background 120ms",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "2px 4px 4px" }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: s.color, flexShrink: 0 }} />
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
                      color: s.color, fontFamily: "var(--nw-font-mono)",
                    }}>
                      {stageLabel[s.key]}
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "var(--nw-text-muted)" }}>
                      {cards.length}
                    </span>
                  </div>
                  {cards.length === 0 ? (
                    <span style={{ fontSize: 11, color: "var(--nw-border-strong, #C4B6E0)", textAlign: "center", padding: "12px 0" }}>
                      {emptyColumn}
                    </span>
                  ) : (
                    cards.map((row) => (
                      <KanbanCard
                        key={row.id}
                        row={row}
                        isReadOnly={isReadOnly}
                        dragging={dragId === row.id}
                        onDragStart={() => setDragId(row.id)}
                        onDragEnd={() => { setDragId(null); setOverCol(null) }}
                      />
                    ))
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function KanbanCard({
  row, isReadOnly, dragging, onDragStart, onDragEnd, draggable = true, reactivate,
}: {
  row: AssessmentRow
  isReadOnly: boolean
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  draggable?: boolean
  reactivate?: { label: string; onClick: () => void }
}) {
  const canDrag = draggable && !isReadOnly
  const name = row.candidate?.full_name?.trim() || candidateRefLabel(row.candidate_id)
  const subtitle = row.candidate?.current_title?.trim()
  return (
    <div
      draggable={canDrag}
      onDragStart={canDrag ? onDragStart : undefined}
      onDragEnd={canDrag ? onDragEnd : undefined}
      style={{
        background: "white", border: "1px solid var(--nw-border-soft, var(--nw-border))",
        borderRadius: 10, padding: "9px 10px",
        cursor: canDrag ? "grab" : "default", opacity: dragging ? 0.4 : 1,
        boxShadow: dragging ? "none" : "0 1px 2px rgba(17,24,39,0.04)",
        display: "flex", flexDirection: "column", gap: 5,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
        <Link
          href={`/workspace/match/${row.id}`}
          style={{
            margin: 0, fontSize: 12.5, fontWeight: 700, color: "var(--nw-text)",
            textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {name}
        </Link>
        {typeof row.score === "number" && (
          <span style={{
            flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: "var(--nw-text-muted)",
            background: "var(--nw-neutral-100)", borderRadius: 100, padding: "1px 7px",
          }}>{Math.round(row.score)}</span>
        )}
      </div>
      {subtitle && (
        <p style={{
          margin: 0, fontSize: 11, color: "var(--nw-text-muted)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{subtitle}</p>
      )}
      {reactivate && (
        <button
          onClick={reactivate.onClick}
          style={{
            alignSelf: "flex-start", marginTop: 2,
            fontFamily: "inherit", fontSize: 11, fontWeight: 600, color: "var(--nw-primary)",
            background: "transparent", border: "none", cursor: "pointer", padding: 0,
          }}
        >
          {reactivate.label}
        </button>
      )}
    </div>
  )
}
