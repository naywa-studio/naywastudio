"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { m } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import type { Candidate, MatchAssessment, Job, MatchTier, PipelineStage, ScoreDimensions } from "@/lib/database.types"
import ComposeBox from "@/components/workspace/ComposeBox"
import AnonymizeForJob from "@/components/workspace/AnonymizeForJob"
import CandidateMiniKanban from "@/components/workspace/CandidateMiniKanban"
import Select from "@/components/ui/Select"
import NoraLoader from "@/components/workspace/NoraLoader"

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
  // CV anonymisé replié par défaut — c'est l'élément le plus encombrant et le
  // moins consulté en continu ; on le déploie à la demande.
  const [cvOpen, setCvOpen] = useState(false)
  const cvSectionRef = useRef<HTMLElement | null>(null)
  // Ouvre le CV anonymisé ET fait descendre la page dessus (uniquement à
  // l'ouverture — pas à la fermeture).
  const openCv = () => {
    setCvOpen(true)
    // Laisse le temps au DOM de se déplier (la carte grandit) avant de
    // scroller dessus. rAF seul se déclenchait parfois avant le reflow.
    setTimeout(() => {
      cvSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 120)
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
        .select("id, job_id, score, match_tier, pipeline_stage, job:jobs(id, title)")
        .eq("candidate_id", candidate.id)
        .order("score", { ascending: false, nullsFirst: false })
      if (!mounted || !data) return
      setSiblingMatches(data as unknown as MatchSummary[])
    })()
    return () => { mounted = false }
  }, [candidate, sb])


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
          <Link href={`/workspace/vivier/${candidate.id}`} style={{
            fontSize: 12, fontWeight: 700, color: "#7C63C8",
            background: "white", border: "1px solid rgba(124,99,200,0.25)",
            borderRadius: 9, padding: "8px 12px", textDecoration: "none",
          }}>
            Fiche candidat →
          </Link>
        </div>
      </m.section>

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
          {!isManual && (match.justification || dimEntries.length > 0) && (
            <section style={{
              background: "rgba(34,197,94,0.06)",
              border: "1px solid rgba(34,197,94,0.25)",
              borderRadius: 16, padding: 16,
            }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 800, color: "#15803d", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                ✦ Pourquoi ça matche
              </h3>
              {dimEntries.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 8 }}>
                  {dimEntries.map(([k, v]) => (
                    <span key={k} style={{ fontSize: 11, color: "#15803d", fontWeight: 700 }}>
                      {SCORE_DIM_LABELS[k] ?? k} <strong style={{ fontSize: 14 }}>{v}</strong>
                    </span>
                  ))}
                </div>
              )}
              {match.justification && (
                <p style={{ margin: 0, fontSize: 12.5, color: "#374151", lineHeight: 1.55, fontStyle: "italic" }}>
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
                {candidate.skills.slice(0, 10).map((s) => (
                  <span key={s} style={{
                    fontSize: 11.5, color: "#4B5563",
                    background: "#F8F6FF", border: "1px solid #F0ECF8",
                    padding: "3px 9px", borderRadius: 6,
                  }}>{s}</span>
                ))}
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
            highlightMatchId={match.id}
            layout="vertical"
            onlyMatchId={match.id}
          />
        </aside>

        {/* RANGÉE 2 — CV anonymisé en grande carte sur toute la largeur des
            deux premières colonnes. Replié par défaut ; l'aperçu s'affiche en
            grand et centré une fois ouvert. */}
        <section ref={cvSectionRef} className="match-cv" style={{
          gridColumn: "1 / 3", gridRow: "2",
          background: "white", border: "1px solid #F0ECF8", borderRadius: 16, padding: 18,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <span style={{
                display: "block", fontSize: 12, fontWeight: 700, color: "#9CA3AF",
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}>
                🔒 CV anonymisé
              </span>
              {!cvOpen && (
                <span style={{ display: "block", marginTop: 4, fontSize: 12.5, color: "#6B7280" }}>
                  Générer un PDF présentable au client, identité retirée.
                </span>
              )}
            </div>
            <button
              onClick={() => (cvOpen ? setCvOpen(false) : openCv())}
              style={{
                flexShrink: 0, fontSize: 12, fontWeight: 700, color: "#7C63C8",
                background: "transparent", border: "none", cursor: "pointer",
                fontFamily: "inherit", whiteSpace: "nowrap", padding: 0,
              }}
            >
              {cvOpen ? "Masquer" : "Ouvrir ▾"}
            </button>
          </div>
          {cvOpen && (
            <div style={{ marginTop: 14 }}>
              <AnonymizeForJob
                candidateId={candidate.id}
                jobId={job?.id ?? null}
                jobTitle={job?.title ?? null}
                candidateParsed={candidate.parse_status === "parsed"}
                embedded
              />
            </div>
          )}
        </section>
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
