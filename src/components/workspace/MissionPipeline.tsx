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
import type { Criterion } from "@/lib/job-criteria-catalog"
import { candidateRefLabel } from "@/lib/candidate-ref"
import { CLIENT_REJECT_REASONS, clientRejectReasonLabel, type ClientRejectReason } from "@/lib/client-reject-reasons"
import { CLIENT_LIKED_REASONS, clientLikedReasonLabel, type ClientLikedReason } from "@/lib/client-liked-reasons"
import { detectOffLimitsForCandidate, type OffLimitsClientRef } from "@/lib/off-limits"
import { AnonymizeSettings, type AnonymizeBranding } from "@/components/workspace/AnonymizeSettings"
import { readOrgDefaults, type AnonymizeTemplate } from "@/components/workspace/anonymize/types"
/** Sous-ensemble de l'organisation nécessaire à l'anonymisation (marque +
 *  gabarit par défaut). Défini ici depuis la suppression de `MissionShortlist`,
 *  dont ce type était le dernier vestige utile. */
export interface ShortlistOrg {
  name: string
  brand_name: string | null
  brand_color: string | null
  brand_color_secondary: string | null
  brand_slogan: string | null
  contact_email: string | null
  anonymize_defaults: { template?: string; watermark?: boolean; watermarkText?: string } | null
}
import { countHidden, readSelection } from "@/lib/anonymize-selection"
import { NoraAdjustPanel } from "@/components/workspace/NoraAdjustPanel"

/** Proposition de réajustement de mission par Nora (lot 3c). Vit dans l'état
 *  de la page (persiste tant que non appliquée/ignorée), rendue INLINE — jamais
 *  en modale. `source` distingue retours client vs consigne libre du sourceur. */
export type AdjustProposal = {
  summary: string
  changes: string[]
  criteria: Criterion[]
  source: "feedback" | "general"
  /** Feedback : filigrane capturé à la génération (max client_feedback_at). */
  feedbackWatermark?: string | null
  /** General : consigne libre du sourceur. */
  instruction?: string
  /** Critères à PROSCRIRE proposés (Partie B). Liste complète révisée. */
  exclusions?: string[]
}

type Lang = "fr" | "en"
type AssessmentRow = MatchAssessment & { candidate: Candidate | null }

type Filter = "all" | "to_contact" | "in_progress" | "presented" | "hired" | "rejected"

const PRIMARY = "#7C63C8"
const PRIMARY_DK = "#5b4aa8"

type Step = "identified" | "contacted" | "interview" | "offer" | "hired" | "rejected"

// Progression de VIOLETS (charte) le long du funnel : la barre se remplit
// dans un violet de plus en plus profond au fur et à mesure que le candidat
// avance. Doux, harmonieux, sans arc-en-ciel. Seuls les terminaux prennent
// une teinte distincte : vert (recruté), gris (écarté).
const STAGE_COLOR: Record<Step, string> = {
  identified: "#C3B9E6", // À contacter — violet clair
  contacted:  "#A594DA", // Contacté
  interview:  "#8A76CE", // Entretien
  offer:      "#7059BE", // Présenté au client — violet profond
  hired:      "#3F9C86", // Recruté — vert doux
  rejected:   "#C2C6D0", // Écarté — gris doux
}
// Couleur du LIBELLÉ (lisible sur blanc) — les stades violets partagent un
// même violet foncé, les terminaux gardent leur teinte.
const STAGE_TEXT: Record<Step, string> = {
  identified: "#5b4aa8", contacted: "#5b4aa8", interview: "#5b4aa8", offer: "#4a3a85",
  hired: "#0F766E", rejected: "#6B7280",
}
// Teinte douce (fond d'avatar) : la couleur du stade à ~14 % d'opacité.
function softTint(hex: string): string { return `${hex}24` }

const STAGE_LABELS: Record<Lang, Record<"identified" | "contacted" | "interview" | "offer" | "hired" | "rejected", string>> = {
  fr: { identified: "À contacter", contacted: "Contacté", interview: "Entretien", offer: "Présenté", hired: "Recruté", rejected: "Écarté" },
  en: { identified: "To contact", contacted: "Contacted", interview: "Interview", offer: "Presented", hired: "Recruited", rejected: "Dropped" },
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
    likedTitle: "Ce qui a plu au client (facultatif, plusieurs possibles)",
    clientPositive: "Retour positif du client",
    clientPositivePh: "ex : très bon relationnel, exactement la séniorité recherchée…",
    recapPlu: "Ce qui a plu",
    recapBloque: "Ce qui a bloqué",
    recapNone: "—",
    noraCta: "Voir la proposition de Nora",
    noraBanner: (n: number) => `Nora peut réajuster la mission d'après ${n} retour${n > 1 ? "s" : ""} client`,
    noraPanelTitle: "Proposition de Nora",
    noraPanelSubtitle: "D'après les retours de votre client sur les candidats écartés.",
    noraLoading: "Nora analyse les retours client…",
    noraChangesTitle: "Ce que Nora ajuste",
    noraBefore: "Critères actuels",
    noraAfter: "Nouveaux critères proposés",
    noraPickHint: "Décochez un critère pour l'exclure de la nouvelle configuration.",
    noraApply: "Appliquer et relancer le matching",
    noraApplying: "Application…",
    noraDismiss: "Ignorer",
    noraRegenerate: "Regénérer",
    noraErr: "Nora n'a pas pu générer de proposition. Réessayez.",
    noraNoFeedback: "Pas encore assez de retours pour proposer un ajustement.",
    noraEmptyPick: "Gardez au moins un critère pour appliquer.",
    adjustedBadge: (n: number) => `${n} bloc${n > 1 ? "s" : ""} masqué${n > 1 ? "s" : ""}`,
    adjustedTitle: "Des blocs du CV de ce candidat ne partiront pas dans le document de cette mission. Ouvrez la fiche match pour revoir ce qui part.",
    adjustedReview: "Revoir ce qui part",
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
    likedTitle: "What the client liked (optional, multiple allowed)",
    clientPositive: "Positive client feedback",
    clientPositivePh: "e.g. great interpersonal skills, exactly the seniority we wanted…",
    recapPlu: "What worked",
    recapBloque: "What blocked",
    recapNone: "—",
    noraCta: "See Nora's suggestion",
    noraBanner: (n: number) => `Nora can adjust the mission based on ${n} client ${n > 1 ? "responses" : "response"}`,
    noraPanelTitle: "Nora's suggestion",
    noraPanelSubtitle: "Based on your client's feedback on the dropped candidates.",
    noraLoading: "Nora is analyzing the client feedback…",
    noraChangesTitle: "What Nora adjusts",
    noraBefore: "Current criteria",
    noraAfter: "Proposed new criteria",
    noraPickHint: "Uncheck a criterion to exclude it from the new configuration.",
    noraApply: "Apply and re-run matching",
    noraApplying: "Applying…",
    noraDismiss: "Dismiss",
    noraRegenerate: "Regenerate",
    noraErr: "Nora couldn't generate a suggestion. Try again.",
    noraNoFeedback: "Not enough feedback yet to suggest an adjustment.",
    noraEmptyPick: "Keep at least one criterion to apply.",
    adjustedBadge: (n: number) => `${n} block${n > 1 ? "s" : ""} hidden`,
    adjustedTitle: "Some blocks of this candidate CV will not go out in this job opening's document. Open the match sheet to review what goes out.",
    adjustedReview: "Review what goes out",
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
  // Réajustement Nora (lot 3c) — état porté par la PAGE pour survivre au
  // changement d'onglet et piloter le redirect + relance du matching.
  adjust?: AdjustProposal | null
  adjustLoading?: boolean
  adjustError?: string | null
  applyingAdjust?: boolean
  onGenerateAdjust?: () => void
  onApplyAdjust?: (criteria: Criterion[], summary: string, changes: string[]) => void
  onDismissAdjust?: () => void
  /** Feedback : Nora ne change rien → avance le filigrane sans re-matcher. */
  onDismissFeedback?: () => void
  /** Affiner la proposition avec une consigne libre (add/modif/retrait). */
  onRefineAdjust?: (instruction: string) => void
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

export function MissionPipeline({
  job, rows, isReadOnly, organization, brandingHref, clientDirectory = [], clientReviewEnabled = false, onLocalUpdate, lang,
  adjust = null, adjustLoading = false, adjustError = null, applyingAdjust = false,
  onGenerateAdjust, onApplyAdjust, onDismissAdjust, onDismissFeedback, onRefineAdjust,
}: Props) {
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
      void fetch(`/api/jobs/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anonymize_options: {
        keepNoraSummary: anonNora,
        // Preserve : ce panneau ne regle PAS l'accroche du candidat (elle se
        // decoche depuis l'atelier). L'omettre ici la remettrait a son defaut
        // a chaque enregistrement de la shortlist, en silence.
        keepCandidateSummary: job.anonymize_options?.keepCandidateSummary ?? true,
        customText: anonMsg,
      } }) }).catch(() => {})
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

  // Retours client exploitables (écartés avec motif ou commentaire) → Nora
  // peut proposer un réajustement de la mission.
  const feedbackRows = useMemo(
    () => shortlisted.filter((r) => r.pipeline_stage === "rejected"
      && ((r.client_reject_reasons?.length ?? 0) > 0 || (r.client_feedback_note ?? "").trim() !== "")),
    [shortlisted],
  )
  const feedbackCount = feedbackRows.length
  // Ne re-proposer que s'il y a du retour PLUS RÉCENT que le filigrane
  // `feedback_consumed_until` (retours déjà absorbés par un ajustement, ou
  // écartés via « OK ne plus proposer »). Évite de re-proposer en boucle et de
  // brider le matching.
  const consumedUntil = useMemo(
    () => job.feedback_consumed_until ? new Date(job.feedback_consumed_until).getTime() : 0,
    [job.feedback_consumed_until],
  )
  const hasNewFeedback = useMemo(
    () => feedbackRows.some((r) => {
      const at = r.client_feedback_at ? new Date(r.client_feedback_at).getTime() : 0
      return at === 0 || at > consumedUntil
    }),
    [feedbackRows, consumedUntil],
  )

  // Récap 2 colonnes (positifs / négatifs) — de quoi Nora part. Agrège les
  // motifs des candidats retenus (ce qui a plu) et écartés (ce qui a bloqué).
  const feedbackRecap = useMemo(() => {
    const liked = new Map<ClientLikedReason, number>()
    const blocked = new Map<ClientRejectReason, number>()
    for (const r of shortlisted) {
      const step = stepOf(r.pipeline_stage)
      if (step === "rejected") {
        for (const raw of (r.client_reject_reasons ?? [])) {
          if ((CLIENT_REJECT_REASONS as string[]).includes(raw)) {
            const k = raw as ClientRejectReason
            blocked.set(k, (blocked.get(k) ?? 0) + 1)
          }
        }
      } else if (step === "interview" || step === "offer" || step === "hired") {
        for (const raw of (r.client_liked_reasons ?? [])) {
          if ((CLIENT_LIKED_REASONS as string[]).includes(raw)) {
            const k = raw as ClientLikedReason
            liked.set(k, (liked.get(k) ?? 0) + 1)
          }
        }
      }
    }
    return {
      liked: [...liked.entries()].sort((a, b) => b[1] - a[1]),
      blocked: [...blocked.entries()].sort((a, b) => b[1] - a[1]),
    }
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

      {/* Nora réajuste la mission (lot 3c) — INLINE, jamais en modale. */}
      {clientReviewEnabled && !isReadOnly && (
        <>
          {/* Récap 2 colonnes : de quoi Nora part (ce qui a plu / ce qui a bloqué). */}
          {(feedbackRecap.liked.length > 0 || feedbackRecap.blocked.length > 0) && (
            <div style={{ marginBottom: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              <div style={{ padding: "11px 13px", borderRadius: 12, background: "var(--nw-success-bg, #E4EFE1)", border: "1px solid rgba(47,107,51,0.18)" }}>
                <p style={{ margin: "0 0 7px", fontSize: 10.5, fontWeight: 700, color: "var(--nw-success, #2F6B33)", letterSpacing: "0.04em", textTransform: "uppercase" }}>{t.recapPlu}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {feedbackRecap.liked.length > 0 ? feedbackRecap.liked.map(([r, n]) => (
                    <span key={r} style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 99, color: "var(--nw-success, #2F6B33)", background: "white", border: "1px solid rgba(47,107,51,0.25)" }}>{clientLikedReasonLabel(r, lang)}{n > 1 ? ` · ${n}` : ""}</span>
                  )) : <span style={{ fontSize: 11.5, color: "var(--nw-text-muted)" }}>{t.recapNone}</span>}
                </div>
              </div>
              <div style={{ padding: "11px 13px", borderRadius: 12, background: "rgba(217,45,32,0.05)", border: "1px solid rgba(217,45,32,0.16)" }}>
                <p style={{ margin: "0 0 7px", fontSize: 10.5, fontWeight: 700, color: "#B42318", letterSpacing: "0.04em", textTransform: "uppercase" }}>{t.recapBloque}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {feedbackRecap.blocked.length > 0 ? feedbackRecap.blocked.map(([r, n]) => (
                    <span key={r} style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 99, color: "#B42318", background: "white", border: "1px solid rgba(217,45,32,0.22)" }}>{clientRejectReasonLabel(r, lang)}{n > 1 ? ` · ${n}` : ""}</span>
                  )) : <span style={{ fontSize: 11.5, color: "var(--nw-text-muted)" }}>{t.recapNone}</span>}
                </div>
              </div>
            </div>
          )}

          {/* Bannière : proposer un réajustement quand du retour récent existe
              et qu'aucune proposition n'est déjà à l'écran. */}
          {!adjust && !adjustLoading && !adjustError && hasNewFeedback && (
            <div style={{ marginBottom: 14, padding: "11px 14px", borderRadius: 12, background: "rgba(124,99,200,0.06)", border: "1px solid #E1DAF4", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: PRIMARY_DK }}>
                <span style={{ fontSize: 14 }}>✦</span> {t.noraBanner(feedbackCount)}
              </span>
              <button type="button" onClick={() => onGenerateAdjust?.()} style={{ fontSize: 12.5, fontWeight: 700, padding: "6px 13px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", color: "white", background: PRIMARY, border: "none" }}>{t.noraCta} →</button>
            </div>
          )}

          {adjustLoading && (
            <div style={{ marginBottom: 14, padding: "13px 15px", borderRadius: 14, background: "rgba(124,99,200,0.05)", border: "1px solid #E1DAF4", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ display: "inline-block", width: 15, height: 15, borderRadius: "50%", border: "2px solid rgba(124,99,200,0.25)", borderTopColor: PRIMARY, animation: "nora-adjust-spin 0.9s linear infinite" }} />
              <span style={{ fontSize: 12.5, color: PRIMARY_DK }}>{t.noraLoading}</span>
              <style>{`@keyframes nora-adjust-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {adjustError && !adjustLoading && (
            <div style={{ marginBottom: 14, padding: "11px 14px", borderRadius: 12, background: "#FEF2F2", border: "1px solid var(--nw-danger-border, #FCA5A5)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: "var(--nw-danger-strong, #B42318)" }}>{adjustError === "empty" ? t.noraNoFeedback : t.noraErr}</span>
              {adjustError !== "empty" && (
                <button type="button" onClick={() => onGenerateAdjust?.()} style={{ fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", color: "white", background: PRIMARY, border: "none" }}>{t.noraRegenerate}</button>
              )}
            </div>
          )}

          {adjust && (
            <NoraAdjustPanel
              // Remount à chaque nouvelle proposition (ids régénérés) → réinit
              // des cases cochées sans setState-in-effect.
              key={adjust.criteria.map((c) => c.id).join("|")}
              proposal={adjust}
              before={(job.criteria ?? []) as Criterion[]}
              beforeExclusions={(job.exclusions ?? []) as string[]}
              source="feedback"
              applying={applyingAdjust}
              lang={lang}
              collapsible
              onApply={(criteria) => onApplyAdjust?.(criteria, adjust.summary, adjust.changes)}
              onDismiss={() => onDismissAdjust?.()}
              onRegenerate={() => onGenerateAdjust?.()}
              onDismissFeedback={onDismissFeedback}
              onRefine={onRefineAdjust}
            />
          )}
        </>
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
  const [posNote, setPosNote] = useState(row.client_positive_note ?? "")
  const name = row.candidate?.full_name?.trim() || t.noName
  const subtitle = row.candidate?.current_title?.trim() || candidateRefLabel(row.candidate_id)
  const step = stepOf(row.pipeline_stage)
  const isHired = step === "hired"
  const isRejected = step === "rejected"
  const cvReady = row.candidate?.anonymized_at != null
  // Blocs masqués pour CETTE mission depuis la fiche match. On ne compte que
  // les clés encore présentes au CV : une brique disparue depuis annoncerait
  // un ajustement qui n'existe plus.
  const parsedForBadge = row.candidate?.parsed_cv ?? null
  const adjustedCount = parsedForBadge
    ? countHidden(parsedForBadge, readSelection(row.anonymize_excluded))
    : 0

  const steps: PipelineStage[] = clientReviewEnabled
    ? ["identified", "contacted", "interview", "offer"]
    : ["identified", "contacted", "interview"]
  const activeIdx = isHired ? steps.length : isRejected ? -1 : steps.indexOf(step as PipelineStage)
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?"

  const stageLabel = STAGE_LABELS[lang][step]
  const stageColor = STAGE_COLOR[step]
  const stageText = STAGE_TEXT[step]

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

  // Candidat RETENU (avance dans le funnel) = signal positif. Symétrique de
  // l'écart : Nora RENFORCE les critères que ces candidats satisfont.
  const isRetained = step === "interview" || step === "offer" || isHired

  const saveLiked = async (arr: string[] | null) => {
    onLocalUpdate(row.id, { client_liked_reasons: arr })
    await fetch(`/api/match/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_liked_reasons: arr }) })
  }
  const toggleLiked = (reason: ClientLikedReason) => {
    const cur = new Set((row.client_liked_reasons ?? []).filter((r): r is ClientLikedReason => (CLIENT_LIKED_REASONS as string[]).includes(r)))
    if (cur.has(reason)) cur.delete(reason); else cur.add(reason)
    void saveLiked([...cur])
  }
  const savePosNote = async () => {
    if (isReadOnly) return
    const val = posNote.trim() === "" ? null : posNote.trim()
    if ((row.client_positive_note ?? null) === val) return
    const res = await fetch(`/api/match/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_positive_note: val }) })
    if (res.ok) onLocalUpdate(row.id, { client_positive_note: val })
  }
  const liked = new Set((row.client_liked_reasons ?? []).filter((r): r is ClientLikedReason => (CLIENT_LIKED_REASONS as string[]).includes(r)))

  return (
    <div style={{
      background: isRejected ? "var(--nw-neutral-100)" : "white",
      border: `1px solid ${step === "offer" ? "#E1DAF4" : "var(--nw-border)"}`,
      borderRadius: 14, padding: "13px 15px",
      transition: "background 0.2s ease, border-color 0.2s ease",
    }}>
      <button
        type="button" onClick={onToggleExpand}
        style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: 0, textAlign: "left", fontFamily: "inherit" }}
      >
        <span style={{ width: 36, height: 36, borderRadius: "50%", background: softTint(stageColor), color: stageText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0, transition: "background 0.2s ease, color 0.2s ease" }}>{initials}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--nw-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {name}
              {offLimits.verdict !== "none" && offLimits.client && (
                <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 99, color: "#B42318", background: "rgba(217,45,32,0.08)", border: "1px solid rgba(217,45,32,0.24)" }}>Off-limits</span>
              )}
              {/* Dans l'EN-TÊTE, pas dans le repli : les cartes sont fermées
                  par défaut, et le sourceur qui télécharge tout le lot ne
                  déplie pas chacune d'elles. Un ajustement invisible n'avertit
                  personne — il se découvrirait en ouvrant le PDF chez le
                  client. */}
              {adjustedCount > 0 && (
                <span
                  title={t.adjustedTitle}
                  style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 99, color: "var(--nw-warn-strong)", background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.32)" }}
                >
                  {t.adjustedBadge(adjustedCount)}
                </span>
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
                <span key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: (!isRejected && (isHired || i <= activeIdx)) ? stageColor : "var(--nw-border)", transition: "background 0.25s ease" }} />
              ))}
            </span>
            <span style={{ fontSize: 11, color: stageText, fontWeight: 600, whiteSpace: "nowrap" }}>{stageLabel}</span>
          </span>
        </span>
      </button>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--nw-border)", display: "flex", flexDirection: "column", gap: 12 }}>
          {!isReadOnly && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {stageBtns.map((s) => {
                const active = stepOf(row.pipeline_stage) === stepOf(s)
                const tone = STAGE_TEXT[stepOf(s)]
                return (
                  <button
                    key={s} type="button" onClick={() => void patchStage(s)}
                    style={{ fontSize: 11.5, fontWeight: active ? 700 : 500, padding: "5px 11px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", color: active ? "white" : "var(--nw-text-secondary)", background: active ? tone : "white", border: `1px solid ${active ? tone : "var(--nw-border)"}`, transition: "all 0.15s ease" }}
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
            {/* Carte dépliée : on redonne le lien vers l'atelier, là où le
                sourceur peut agir. Le badge de l'en-tête, lui, alerte. */}
            {adjustedCount > 0 && (
              <Link
                href={`/workspace/match/${row.id}#anonymize`}
                style={{ color: "var(--nw-warn-strong)", textDecoration: "none", fontWeight: 600 }}
              >
                {t.adjustedReview} →
              </Link>
            )}
            <Link href={`/workspace/match/${row.id}`} style={{ color: PRIMARY_DK, textDecoration: "none", fontWeight: 600 }}>{t.matchSheet} →</Link>
            {!isReadOnly && (
              <button type="button" onClick={removeShort} style={{ fontSize: 12, color: "var(--nw-text-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "inherit", padding: 0, marginLeft: "auto" }}>{t.removeShort}</button>
            )}
          </div>

          {clientReviewEnabled && isRejected && (
            <div>
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
              <p style={{ margin: "0 0 5px", fontSize: 11, color: "var(--nw-text-secondary)" }}>{t.clientFeedback}</p>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} readOnly={isReadOnly} disabled={isReadOnly} placeholder={t.clientFeedbackPh} rows={2}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 12.5, borderRadius: 8, border: "1px solid var(--nw-primary-100)", outline: "none", fontFamily: "inherit", resize: "vertical" }} />
            </div>
          )}

          {clientReviewEnabled && isRetained && (
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: "var(--nw-text-muted)" }}>{t.likedTitle}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                {CLIENT_LIKED_REASONS.map((reason) => {
                  const on = liked.has(reason)
                  return (
                    <button key={reason} type="button" onClick={() => toggleLiked(reason)} disabled={isReadOnly}
                      style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 99, cursor: isReadOnly ? "not-allowed" : "pointer", fontFamily: "inherit", color: on ? "white" : "var(--nw-text-secondary)", background: on ? "var(--nw-success)" : "white", border: `1px solid ${on ? "var(--nw-success)" : "var(--nw-border)"}` }}>{clientLikedReasonLabel(reason, lang)}</button>
                  )
                })}
              </div>
              <p style={{ margin: "0 0 5px", fontSize: 11, color: "var(--nw-text-secondary)" }}>{t.clientPositive}</p>
              <textarea value={posNote} onChange={(e) => setPosNote(e.target.value)} onBlur={savePosNote} readOnly={isReadOnly} disabled={isReadOnly} placeholder={t.clientPositivePh} rows={2}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 12.5, borderRadius: 8, border: "1px solid var(--nw-success-bg)", outline: "none", fontFamily: "inherit", resize: "vertical" }} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
