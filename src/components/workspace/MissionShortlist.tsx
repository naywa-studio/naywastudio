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

import { useMemo, useState } from "react"
import Link from "next/link"
import { m } from "framer-motion"
import type { Candidate, MatchAssessment, Job, PipelineStage } from "@/lib/database.types"
import { candidateRefLabel } from "@/lib/candidate-ref"
import { tierMeta } from "@/lib/criterion-display"
import RejectReasonPicker from "@/components/workspace/RejectReasonPicker"
import type { RejectReason } from "@/lib/reject-reasons"
import { rejectReasonLabel } from "@/lib/reject-reasons"
import type { Lang } from "@/lib/i18n/LanguageContext"

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
      offer: "Offre",
      hired: "Recruté",
      rejected: "Écarté",
    } as Record<PipelineStage, string>,
    stageAria: "Changer l'étape",
    open: "Ouvrir",
    profile: "Fiche",
    score: "Score",
    noName: "Sans nom",
    rejectedFor: "Écarté :",
    readOnly: "Lecture seule",
    readOnlyHint: "Lecture seule — souscrivez pour qualifier la shortlist",
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
      offer: "Offer",
      hired: "Hired",
      rejected: "Rejected",
    } as Record<PipelineStage, string>,
    stageAria: "Change stage",
    open: "Open",
    profile: "Match",
    score: "Score",
    noName: "No name",
    rejectedFor: "Rejected:",
    readOnly: "Read-only",
    readOnlyHint: "Read-only — subscribe to qualify the shortlist",
  },
}

/** Étapes proposées dans le sélecteur, dans l'ordre du tunnel. */
const STAGE_OPTIONS: PipelineStage[] = [
  "identified", "pricing", "contacted", "replied", "interview", "offer", "hired", "rejected",
]

interface Props {
  job: Job
  rows: AssessmentRow[]
  isReadOnly: boolean
  /** Rendu optimiste : la page mission met à jour sa propre liste `rows`. */
  onLocalUpdate: (rowId: string, patch: Partial<MatchAssessment>) => void
  lang: Lang
}

export function MissionShortlist({ job, rows, isReadOnly, onLocalUpdate, lang }: Props) {
  const t = copy[lang]
  const [filter, setFilter] = useState<"all" | Group>("all")
  const [saving, setSaving] = useState<Set<string>>(new Set())
  // Écartement en attente de raison : on garde la row ciblée le temps du picker.
  const [rejecting, setRejecting] = useState<AssessmentRow | null>(null)

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
      {/* En-tête */}
      <div style={{ marginBottom: 14 }}>
        <h2 style={{
          margin: 0, fontSize: 17, fontWeight: 800, color: "var(--nw-text)",
          letterSpacing: "-0.01em", fontFamily: "var(--font-inter), sans-serif",
        }}>
          {t.title(job.title)}
        </h2>
        <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--nw-text-muted)" }}>
          {t.subtitle(shortlisted.length)}
        </p>
      </div>

      {/* Filtres par statut */}
      {shortlisted.length > 0 && (
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
                  background: active ? "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)" : "white",
                  border: `1px solid ${active ? "transparent" : "var(--nw-border)"}`,
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
                    lang={lang}
                    t={t}
                  />
                ))}
              </div>
            </div>
          ))}
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
  row, isReadOnly, saving, onSelectStage, lang, t,
}: {
  row: AssessmentRow
  isReadOnly: boolean
  saving: boolean
  onSelectStage: (row: AssessmentRow, stage: PipelineStage) => void
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
        border: `1px solid ${style.cardBorder}`,
        borderLeft: `3px solid ${style.accent}`,
        borderRadius: 12,
        padding: "13px 14px",
        opacity: style.dim,
        display: "flex", flexDirection: "column", gap: 10,
      }}
    >
      {/* Ligne 1 : nom + tier */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
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
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5, color: "var(--nw-text-muted)" }}>
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
        <select
          aria-label={t.stageAria}
          value={row.pipeline_stage}
          disabled={isReadOnly || saving}
          title={isReadOnly ? t.readOnlyHint : undefined}
          onChange={(e) => onSelectStage(row, e.target.value as PipelineStage)}
          style={{
            flex: 1, minWidth: 0, fontFamily: "inherit", fontSize: 12, fontWeight: 600,
            color: "var(--nw-text-body)", background: "white",
            border: "1px solid var(--nw-border)", borderRadius: 8, padding: "6px 8px",
            cursor: isReadOnly ? "not-allowed" : "pointer",
          }}
        >
          {STAGE_OPTIONS.map((s) => (
            <option key={s} value={s}>{t.stageLabel[s]}</option>
          ))}
        </select>
        <Link
          href={`/workspace/vivier/${row.candidate_id}`}
          style={{
            fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, color: "var(--nw-primary)",
            textDecoration: "none", whiteSpace: "nowrap",
          }}
        >
          {t.open}
        </Link>
        <Link
          href={`/workspace/match/${row.id}`}
          style={{
            fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, color: "var(--nw-text-muted)",
            textDecoration: "none", whiteSpace: "nowrap",
          }}
        >
          {t.profile}
        </Link>
      </div>
    </m.article>
  )
}
