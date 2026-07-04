"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { m } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import type { Candidate, MatchAssessment, Job, MatchTier, PipelineStage, ScoreDimensions } from "@/lib/database.types"
import { kindOf, type Criterion, type CriterionEval } from "@/lib/job-criteria-catalog"
import { criterionHeaderLabel, shortCriterionLabel, dimColor, statusColor } from "@/lib/criterion-display"
import ComposeBox from "@/components/workspace/ComposeBox"
import { AnonymizeControls } from "@/components/workspace/anonymize/AnonymizeControls"
import { AnonymizePreview } from "@/components/workspace/anonymize/AnonymizePreview"
import {
  INITIAL_ANONYMIZE_OPTIONS,
  INITIAL_ANONYMIZE_STATUS,
  type AnonymizeOptions,
  type AnonymizeStatus,
} from "@/components/workspace/anonymize/types"
import CandidateMiniKanban from "@/components/workspace/CandidateMiniKanban"
import Select from "@/components/ui/Select"
import NoraLoader from "@/components/workspace/NoraLoader"
import { candidateRefLabel } from "@/lib/candidate-ref"

/* Bouton "Voir le pricing" — direct si 1 mission en pipeline, dropdown si N. */
function PricingShortcut({ targets }: {
  targets: Array<{ job: { id: string; title: string } | null; score: number | null }>
}) {
  const [open, setOpen] = useState(false)
  const withJob = targets.filter((t) => t.job?.id)
  if (withJob.length === 0) return null

  const btnStyle: React.CSSProperties = {
    fontFamily: "inherit", fontSize: 12, fontWeight: 700,
    color: "white",
    padding: "8px 12px", borderRadius: 9,
    background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
    border: "1px solid rgba(124,99,200,0.40)",
    cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none",
  }

  if (withJob.length === 1) {
    const only = withJob[0]
    return (
      <Link href={`/workspace/pricing/${only.job!.id}`} style={btnStyle}>
        € Voir le pricing
      </Link>
    )
  }

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} style={btnStyle}>
        € Voir le pricing
        <span style={{ fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60,
            background: "white", border: "1px solid #E9E2F7", borderRadius: 10,
            boxShadow: "0 8px 28px rgba(124,99,200,0.18)",
            padding: 6, minWidth: 260, maxHeight: 320, overflowY: "auto",
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "#9CA3AF",
              letterSpacing: "0.05em", textTransform: "uppercase",
              padding: "6px 10px 4px",
            }}>
              Choisir la mission
            </div>
            {withJob.map((t) => (
              <Link key={t.job!.id} href={`/workspace/pricing/${t.job!.id}`} style={{
                display: "block", fontSize: 12.5, color: "#374151", fontWeight: 600,
                padding: "8px 10px", borderRadius: 7, textDecoration: "none",
              }}>
                {t.job!.title}
                {t.score != null && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: "#9CA3AF" }}>· {t.score}</span>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* Réf candidat — même valeur que celle imprimée dans le PDF anonymisé.
 * Permet au sourceur de retrouver instantanément qui est derrière une ref
 * quand le client en mentionne une au téléphone. */
function RefBadge({ candidateId }: { candidateId: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10.5, fontWeight: 700, color: "#7C63C8",
      letterSpacing: "0.04em",
      background: "rgba(124,99,200,0.08)",
      border: "1px solid rgba(124,99,200,0.22)",
      borderRadius: 7,
      padding: "2px 8px",
      fontFamily: "var(--font-space-grotesk), monospace",
    }}>
      Ref · {candidateRefLabel(candidateId)}
    </span>
  )
}

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

type LoadedMatch = MatchAssessment & { job: Job | null }

const TIER_META: Record<MatchTier, { label: string; fg: string; bg: string; bd: string }> = {
  excellent: { label: "Excellent match", fg: "#15803d", bg: "rgba(34,197,94,0.07)", bd: "rgba(34,197,94,0.25)" },
  good:      { label: "Bon match",       fg: "#7C63C8", bg: "rgba(124,99,200,0.07)", bd: "rgba(124,99,200,0.22)" },
  fair:      { label: "Match moyen",     fg: "#B45309", bg: "rgba(245,158,11,0.07)", bd: "rgba(245,158,11,0.22)" },
  poor:      { label: "Match faible",    fg: "#6B7280", bg: "#F9FAFB", bd: "#E5E7EB" },
}

const SCORE_DIM_LABELS: Record<keyof ScoreDimensions, string> = {
  skills_match:   "Skills",
  seniority_fit:  "Séniorité",
  location_fit:   "Lieu",
  experience_fit: "Expérience",
  language_fit:   "Langue",
}

interface MatchSummary {
  id: string
  job_id: string
  score: number | null
  match_tier: MatchTier | null
  pipeline_stage: PipelineStage
  in_pipeline: boolean
  job: { id: string; title: string } | null
}

/**
 * Fiche match — the post-refactor sourcer workspace, one URL per
 * (candidate × job) pair. Hosts the compose / anonymise / pricing-soon
 * actions in one place, with the match reason + mini pipeline on top.
 */
export default function MatchPage() {
  const { matchId } = useParams<{ matchId: string }>()
  const router = useRouter()
  const sb = useMemo(() => getSupabase(), [])

  const [match, setMatch] = useState<LoadedMatch | null>(null)
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [siblingMatches, setSiblingMatches] = useState<MatchSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [pipelineSaving, setPipelineSaving] = useState(false)

  // État anonymisation lifté ici pour piloter en même temps les
  // contrôles haut de page (AnonymizeControls) et l'aperçu bas de page
  // (AnonymizePreview). Les deux composants ne se voient pas, c'est
  // MatchPage qui orchestre.
  const [anonymizeStatus, setAnonymizeStatus] = useState<AnonymizeStatus>(INITIAL_ANONYMIZE_STATUS)
  const [anonymizeOptions, setAnonymizeOptions] = useState<AnonymizeOptions>(INITIAL_ANONYMIZE_OPTIONS)
  const previewSectionRef = useRef<HTMLElement | null>(null)
  const scrollToPreview = () => {
    previewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const res = await fetch(`/api/match/${matchId}`)
      if (!mounted) return
      if (res.status === 404) { setNotFound(true); setLoading(false); return }
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      setMatch(data.match as LoadedMatch)
      setCandidate(data.candidate as Candidate)
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [matchId])

  // Once we know who the candidate is, fetch all their matches so the
  // header dropdown can list every job they're paired with.
  useEffect(() => {
    if (!candidate) return
    let mounted = true
    ;(async () => {
      const { data } = await sb
        .from("match_assessments")
        .select("id, job_id, score, match_tier, pipeline_stage, in_pipeline, job:jobs(id, title)")
        .eq("candidate_id", candidate.id)
        .order("score", { ascending: false, nullsFirst: false })
      if (!mounted || !data) return
      setSiblingMatches(data as unknown as MatchSummary[])
    })()
    return () => { mounted = false }
  }, [candidate, sb])

  // Fetch existing anonymised PDF URL on mount (if there is one) so the
  // preview shows up immediately when the sourceur opens the page.
  useEffect(() => {
    if (!candidate) return
    let cancelled = false
    ;(async () => {
      const res = await fetch(`/api/cv/${candidate.id}/anonymize`)
      if (cancelled || !res.ok) return
      const j = await res.json().catch(() => ({}))
      const preview = j?.preview_url ?? j?.url ?? null
      const download = j?.download_url ?? j?.url ?? null
      if (preview) {
        setAnonymizeStatus({
          state: "ready",
          previewUrl: preview,
          downloadUrl: download,
          error: null,
        })
      }
    })()
    return () => { cancelled = true }
  }, [candidate])

  const generateAnonymized = async () => {
    if (!candidate || anonymizeStatus.state === "working") return
    setAnonymizeStatus((prev) => ({ ...prev, state: "working", error: null }))
    try {
      const res = await fetch(`/api/cv/${candidate.id}/anonymize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: match?.job?.id ?? null,
          options: {
            template: anonymizeOptions.template,
            keep_nora_summary: anonymizeOptions.keepNoraSummary,
            custom_text: anonymizeOptions.customText.trim() || null,
            watermark: anonymizeOptions.watermark,
          },
        }),
      })
      const rawText = await res.text()
      if (!rawText) {
        setAnonymizeStatus({
          state: "error",
          previewUrl: null,
          downloadUrl: null,
          error: `Réponse vide du serveur (${res.status}).`,
        })
        return
      }
      let data: { ok?: boolean; preview_url?: string; download_url?: string; url?: string; message?: string; error?: string }
      try {
        data = JSON.parse(rawText)
      } catch {
        setAnonymizeStatus({
          state: "error",
          previewUrl: null,
          downloadUrl: null,
          error: "Réponse serveur illisible.",
        })
        return
      }
      if (!res.ok || !data.ok) {
        setAnonymizeStatus({
          state: "error",
          previewUrl: null,
          downloadUrl: null,
          error: data.message ?? data.error ?? "Échec de l'anonymisation.",
        })
        return
      }
      setAnonymizeStatus({
        state: "ready",
        previewUrl: data.preview_url ?? data.url ?? null,
        downloadUrl: data.download_url ?? data.url ?? null,
        error: null,
      })
      // Scroll vers la preview dès que le serveur a renvoyé l'URL.
      // L'iframe charge en différé mais la carte est déjà visible.
      setTimeout(scrollToPreview, 120)
    } catch (err) {
      setAnonymizeStatus({
        state: "error",
        previewUrl: null,
        downloadUrl: null,
        error: (err as Error).message ?? "Erreur réseau.",
      })
    }
  }


  if (loading) {
    return <NoraLoader />
  }
  if (notFound || !match || !candidate) {
    return (
      <div style={{ padding: "60px 24px", textAlign: "center", color: "#6B7280" }}>
        <p style={{ fontSize: 16, fontWeight: 600 }}>Match introuvable.</p>
        <Link href="/workspace/pipeline" style={{ color: "#7C63C8", textDecoration: "none", fontSize: 14 }}>
          ← Retour au pipeline
        </Link>
      </div>
    )
  }

  const job = match.job
  const cv = candidate.parsed_cv ?? null

  // Ajoute / retire ce candidat de la pipeline (liste curatée). Optimiste.
  const togglePipeline = async () => {
    const next = !match.in_pipeline
    setPipelineSaving(true)
    setMatch((prev) => prev ? { ...prev, in_pipeline: next } : prev)
    const res = await fetch(`/api/match/${match.id}/pipeline`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ in_pipeline: next }),
    })
    if (!res.ok) setMatch((prev) => prev ? { ...prev, in_pipeline: !next } : prev)
    setPipelineSaving(false)
  }
  const tier = match.match_tier ? TIER_META[match.match_tier] : null
  // PR-Z : critères flexibles. Pour les anciens matchs (avant PR-Z), on
  // retombe sur score_dimensions pour ne pas perdre l'info.
  const jobCriteria = ((job?.criteria ?? []) as Criterion[])
  const mainCriteria = jobCriteria.filter((c) => c.weight === "main")
  const bonusCriteria = jobCriteria.filter((c) => c.weight === "bonus")
  const evalById = new Map((match.criteria_eval ?? []).map((e) => [e.id, e as CriterionEval]))
  const hasCriteriaEval = mainCriteria.length > 0 && (match.criteria_eval ?? []).length > 0
  const dims = match.score_dimensions ?? {}
  const dimEntries = Object.entries(dims).filter(([, v]) => typeof v === "number") as [keyof ScoreDimensions, number][]
  const isManual = match.score == null

  return (
    <main style={{
      padding: "32px 24px 80px",
      maxWidth: 1440, margin: "0 auto",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      <div style={{ marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, fontSize: 12.5 }}>
        {/* Gauche : retour à la mission (origine du candidat) */}
        {job ? (
          <Link href={`/workspace/missions/${job.id}`} style={{ color: "#7C63C8", textDecoration: "none" }}>
            ← Mission : {job.title}
          </Link>
        ) : <span />}
        {/* Droite : avancer vers la pipeline (sens de progression du workspace) */}
        <Link href="/workspace/pipeline" style={{ color: "#7C63C8", textDecoration: "none" }}>
          Pipeline →
        </Link>
      </div>

      {/* Header band — one fiche match per candidate. The job picker
          replaces the static title: switching jobs navigates to the
          corresponding matchId, page re-renders with the right content. */}
      <m.section
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        style={{
          background: "white", borderRadius: 16, border: "1px solid #F0ECF8",
          padding: "18px 22px", marginBottom: 14,
          display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center",
        }}
        className="match-band"
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1 style={{
              margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "#111827",
            }}>
              {candidate.full_name ?? "Candidat sans nom"}
              <span style={{ fontWeight: 500, color: "#9CA3AF", fontSize: 15 }}> — pour </span>
            </h1>
            <RefBadge candidateId={candidate.id} />
            <div style={{ minWidth: 280, maxWidth: 420 }}>
              <Select
                value={match.id}
                onChange={(nextId) => router.push(`/workspace/match/${nextId}`)}
                options={siblingMatches.length > 0
                  ? siblingMatches.map((m) => ({
                      value: m.id,
                      label: m.job?.title ?? "Sans mission",
                      hint: m.score != null
                        ? `${m.score} · ${m.match_tier ?? ""}`.trim()
                        : "manuel",
                    }))
                  : [{ value: match.id, label: job?.title ?? "Sans mission" }]
                }
              />
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 12.5, color: "#6B7280", display: "flex", gap: 10, flexWrap: "wrap" }}>
            {candidate.current_title && <span>{candidate.current_title}</span>}
            {candidate.location && <span>· {candidate.location}</span>}
            {candidate.seniority_level && <span>· {candidate.seniority_level}</span>}
            {job?.location && <span>· {job.location}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {/* Action principale : suivre dans la pipeline */}
          <button
            onClick={togglePipeline}
            disabled={pipelineSaving}
            title={match.in_pipeline ? "Retirer de la pipeline" : "Suivre ce candidat dans la pipeline"}
            style={{
              fontSize: 13, fontWeight: 700, fontFamily: "inherit",
              cursor: pipelineSaving ? "default" : "pointer",
              borderRadius: 10, padding: "9px 16px",
              ...(match.in_pipeline
                ? { color: "#15803d", background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.35)" }
                : { color: "white", background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)", border: "none", boxShadow: "0 6px 18px -8px rgba(124,99,200,0.6)" }),
            }}
          >
            {match.in_pipeline ? "✓ Dans le pipeline" : "+ Ajouter à la pipeline"}
          </button>
          {isManual ? (
            <span style={{
              fontSize: 12, fontWeight: 700, color: "#7C63C8",
              background: "rgba(124,99,200,0.08)",
              border: "1px solid rgba(124,99,200,0.22)",
              borderRadius: 10, padding: "8px 12px",
            }}>
              Assigné manuellement
            </span>
          ) : tier && (
            <span style={{
              fontSize: 14, fontWeight: 800, color: tier.fg,
              background: tier.bg, border: `1px solid ${tier.bd}`,
              borderRadius: 10, padding: "8px 14px",
            }}>
              {match.score} · {tier.label}
            </span>
          )}
          {/* Raccourci pricing — si ce match est en pipeline, on permet
              d'ouvrir directement la fiche pricing de la mission. Si le
              candidat est dans la pipeline sur plusieurs missions, on
              propose un mini-dropdown. */}
          {(() => {
            const pipelineSiblings = siblingMatches.filter((m) => m.in_pipeline && m.job?.id)
            if (pipelineSiblings.length === 0 && !match.in_pipeline) return null
            const targets = pipelineSiblings.length > 0
              ? pipelineSiblings
              : [{ id: match.id, job: job ? { id: job.id, title: job.title } : null, score: match.score, match_tier: match.match_tier, in_pipeline: true }]
            return <PricingShortcut targets={targets} />
          })()}
          <Link href={`/workspace/vivier/${candidate.id}`} style={{
            fontSize: 12, fontWeight: 700, color: "#7C63C8",
            background: "white", border: "1px solid rgba(124,99,200,0.25)",
            borderRadius: 9, padding: "8px 12px", textDecoration: "none",
          }}>
            Fiche candidat →
          </Link>
        </div>
      </m.section>

      {/* Bloc anonymisation — contrôles juste sous l'identité candidat.
          La carte d'aperçu du PDF reste en bas pour pas pousser les
          autres cartes ; un bouton "Voir le PDF ↓" apparaît ici une
          fois la génération terminée. */}
      <AnonymizeControls
        candidateId={candidate.id}
        jobId={job?.id ?? null}
        jobTitle={job?.title ?? null}
        candidateParsed={candidate.parse_status === "parsed"}
        status={anonymizeStatus}
        options={anonymizeOptions}
        onOptionsChange={setAnonymizeOptions}
        onGenerate={generateAnonymized}
        onScrollToPreview={scrollToPreview}
      />

      {/* Three-column layout:
         - left : résumé candidat, pourquoi ça matche, CV anonymisé
         - mid  : message d'approche, conversation placeholder
         - right: vertical kanban — view of where this candidate sits
                  across ALL their matched jobs (not the same role as the
                  header dropdown: dropdown switches focus, kanban gives
                  context "où en est-il ailleurs ?"). */}
      <div className="match-grid" style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) 240px",
        gap: 18,
        alignItems: "stretch",
      }}>
        {/* COL 1 (rangée 1) — pourquoi ça matche + résumé candidat */}
        <div style={{ gridColumn: "1", gridRow: "1", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Match reason — featured, en premier : info de décision n°1 */}
          {!isManual && (hasCriteriaEval || dimEntries.length > 0) && (
            <section style={{
              background: "white",
              border: "1px solid #F0ECF8",
              borderRadius: 16,
              padding: 16,
            }}>
              <h3 style={{
                margin: 0, fontSize: 11, fontWeight: 800, color: "#15803d",
                letterSpacing: "0.06em", textTransform: "uppercase",
              }}>
                ✦ Critères de cette mission
              </h3>

              {/* PR-Z : critères flexibles. Affiche main + bonus séparément. */}
              {hasCriteriaEval ? (
                <>
                  <div style={{ marginTop: 10 }}>
                    <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                      Principaux
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 6 }}>
                      {mainCriteria.map((crit) => (
                        <CriteriaEvalLine key={crit.id} criterion={crit} ev={evalById.get(crit.id)} />
                      ))}
                    </div>
                  </div>
                  {bonusCriteria.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                        Bonus
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 6 }}>
                        {bonusCriteria.map((crit) => (
                          <CriteriaEvalLine key={crit.id} criterion={crit} ev={evalById.get(crit.id)} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Fallback legacy — matchs scorés avant PR-Z. */
                dimEntries.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 10 }}>
                    {dimEntries.map(([k, v]) => (
                      <span key={k} style={{ fontSize: 11, color: "#15803d", fontWeight: 700 }}>
                        {SCORE_DIM_LABELS[k] ?? k} <strong style={{ fontSize: 14 }}>{v}</strong>
                      </span>
                    ))}
                  </div>
                )
              )}

              {match.justification && (
                <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "#374151", lineHeight: 1.55, fontStyle: "italic" }}>
                  &ldquo;{match.justification}&rdquo;
                </p>
              )}
            </section>
          )}
          {isManual && (
            <section style={{
              background: "rgba(124,99,200,0.06)",
              border: "1px solid rgba(124,99,200,0.22)",
              borderRadius: 16, padding: 16,
            }}>
              <h3 style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 800, color: "#7C63C8", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                ✋ Assignation manuelle
              </h3>
              <p style={{ margin: 0, fontSize: 12.5, color: "#374151", lineHeight: 1.55 }}>
                {match.justification ?? "Ajouté par le sourceur en dehors du matching automatique."}
              </p>
            </section>
          )}

          <section style={{ flex: 1, background: "white", border: "1px solid #F0ECF8", borderRadius: 16, padding: 18 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Résumé candidat
            </h3>
            {cv?.summary && (
              <p style={{ margin: "0 0 10px", fontSize: 13.5, color: "#374151", lineHeight: 1.65 }}>
                {cv.summary}
              </p>
            )}
            {candidate.skills && candidate.skills.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {candidate.skills.slice(0, 12).map((s) => (
                  <span key={s} style={{
                    fontSize: 11.5, color: "#4B5563",
                    background: "#F8F6FF", border: "1px solid #F0ECF8",
                    padding: "3px 9px", borderRadius: 6,
                  }}>{s}</span>
                ))}
              </div>
            )}

            {/* Méta : années d'XP + langues */}
            {(cv?.years_experience != null || (cv?.languages?.length ?? 0) > 0) && (
              <div style={{
                display: "flex", flexWrap: "wrap", gap: 16, marginTop: 14,
                fontSize: 12, color: "#6B7280",
              }}>
                {cv?.years_experience != null && (
                  <span>📈 <strong style={{ color: "#374151" }}>{cv.years_experience} an{cv.years_experience > 1 ? "s" : ""}</strong> d&apos;expérience</span>
                )}
                {(cv?.languages?.length ?? 0) > 0 && (
                  <span>🌐 {cv!.languages!.join(", ")}</span>
                )}
              </div>
            )}

            {/* Parcours — remplit la carte avec du concret plutôt que du vide */}
            {(cv?.experience?.length ?? 0) > 0 && (
              <div style={{ marginTop: 16 }}>
                <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Parcours
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {cv!.experience!.slice(0, 6).map((xp, i) => {
                    const end = xp.end === null ? "auj." : (xp.end ?? "")
                    const period = [xp.start ?? "", end].filter(Boolean).join(" – ")
                    return (
                      <div key={i} style={{ display: "flex", gap: 10 }}>
                        <span style={{
                          flexShrink: 0, width: 7, height: 7, borderRadius: "50%",
                          background: "#C4B6E0", marginTop: 5,
                        }} />
                        <div style={{ minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "#374151", lineHeight: 1.4 }}>
                            {xp.title}{xp.company ? <span style={{ fontWeight: 400, color: "#6B7280" }}> · {xp.company}</span> : null}
                          </p>
                          {period && (
                            <p style={{ margin: "1px 0 0", fontSize: 11, color: "#9CA3AF" }}>{period}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* COL 2 (rangée 1) — message d'approche */}
        <div style={{ gridColumn: "2", gridRow: "1", display: "flex", flexDirection: "column", gap: 14 }}>
          <section style={{ flex: 1, background: "white", border: "1px solid #F0ECF8", borderRadius: 16, padding: 18 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              ✉ Message d&apos;approche
            </h3>
            {candidate.parse_status === "parsed" ? (
              <ComposeBox
                candidate={candidate}
                selectedJobId={job?.id ?? ""}
                jobTitle={job?.title ?? null}
                showJobBadge={false}
              />
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF" }}>
                Disponible une fois le CV parsé.
              </p>
            )}
          </section>

        </div>

        {/* COL 3 (rangée 1) — mini-kanban vertical (sticky) */}
        <aside className="match-rail" style={{
          gridColumn: "3", gridRow: "1",
          position: "sticky", top: 80, alignSelf: "flex-start",
        }}>
          <CandidateMiniKanban
            candidateId={candidate.id}
            candidateName={candidate.full_name}
            highlightMatchId={match.id}
            layout="vertical"
            onlyMatchId={match.id}
          />
        </aside>

        {/* RANGÉE 2 — Aperçu du PDF anonymisé sur toute la largeur des
            deux premières colonnes. Affiche un empty state si aucun PDF
            n'a été généré, ou l'iframe sinon. L'utilisateur déclenche
            la génération via les contrôles tout en haut (sous le
            bandeau d'identité). */}
        <div className="match-cv" style={{ gridColumn: "1 / 3", gridRow: "2" }}>
          <AnonymizePreview
            ref={previewSectionRef}
            status={anonymizeStatus}
          />
        </div>
      </div>

      <style>{`
        @media (max-width: 1180px) {
          .match-band { grid-template-columns: 1fr !important; }
          .match-grid { grid-template-columns: 1fr !important; }
          /* En mono-colonne, on remet tout en flux automatique sinon les
             placements explicites (col 2/3, row 2, span) cassent l'empilement. */
          .match-grid > * { grid-column: 1 / -1 !important; grid-row: auto !important; }
          .match-rail { position: static !important; }
        }
      `}</style>
    </main>
  )
}

/* ─── Critère évalué (PR-Z) ────────────────────────────────────────
 * Affiche un critère avec sa valeur évaluée :
 *  - quantitatif → score 0-100 avec couleur tier
 *  - qualitatif  → badge ✓ / ✗ / ? avec evidence en tooltip
 * Conçu pour s'aligner verticalement dans une grid auto-fit responsive.
 */
function CriteriaEvalLine({ criterion, ev }: { criterion: Criterion; ev: CriterionEval | undefined }) {
  const isQuant = kindOf(criterion.type) === "quantitative"
  const score = isQuant ? (ev?.score ?? null) : null
  const status = isQuant ? undefined : ev?.status
  const name = criterionHeaderLabel(criterion)
  const fullLabel = shortCriterionLabel(criterion)
  const tooltip = ev?.evidence ? `${fullLabel} — ${ev.evidence}` : fullLabel

  if (isQuant) {
    const p = dimColor(score)
    const pct = score != null ? Math.max(0, Math.min(100, score)) : 0
    return (
      <div title={tooltip} style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
          <span style={{
            fontSize: 11, color: "#6B7280", fontWeight: 600,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
          }}>{name}</span>
          <span style={{
            fontSize: 12, fontWeight: 800, color: p.color,
            fontVariantNumeric: "tabular-nums", flexShrink: 0,
          }}>{score != null ? score : "—"}</span>
        </div>
        <div style={{ height: 5, borderRadius: 99, background: "#EFEBF8", overflow: "hidden" }}>
          <div style={{
            width: `${pct}%`, height: "100%", borderRadius: 99,
            background: p.color, transition: "width 400ms cubic-bezier(0.22,1,0.36,1)",
          }} />
        </div>
      </div>
    )
  }

  const p = statusColor(status)
  return (
    <div
      title={tooltip}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 10px",
        background: p.bg, border: `1px solid ${p.bd}`,
        borderRadius: 8, minWidth: 0,
      }}
    >
      <span style={{
        fontSize: 11.5, color: "#4B5563", fontWeight: 600,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        flex: 1, minWidth: 0,
      }}>{name}</span>
      <span style={{
        fontSize: 13, fontWeight: 800, color: p.color,
        width: 18, height: 18, borderRadius: "50%",
        background: "white", border: `1px solid ${p.bd}`,
        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {p.icon}
      </span>
    </div>
  )
}
