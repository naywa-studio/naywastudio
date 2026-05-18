"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { m } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import type { Candidate, MatchAssessment, Job, MatchTier, PipelineStage, ScoreDimensions } from "@/lib/database.types"
import ComposeBox from "@/components/workspace/ComposeBox"
import AnonymizeForJob from "@/components/workspace/AnonymizeForJob"
import CandidateMiniKanban from "@/components/workspace/CandidateMiniKanban"
import Select from "@/components/ui/Select"

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

const STAGE_STEPS: { key: PipelineStage; label: string; fg: string; bg: string }[] = [
  { key: "identified", label: "Identifié", fg: "#6B7280", bg: "rgba(107,114,128,0.10)" },
  { key: "contacted",  label: "Contacté",  fg: "#2563EB", bg: "rgba(37,99,235,0.10)" },
  { key: "replied",    label: "Réponse",   fg: "#7C63C8", bg: "rgba(124,99,200,0.10)" },
  { key: "interview",  label: "Entretien", fg: "#B45309", bg: "rgba(245,158,11,0.12)" },
  { key: "offer",      label: "Offre",     fg: "#15803d", bg: "rgba(34,197,94,0.10)" },
  { key: "hired",      label: "Recruté",   fg: "#0F766E", bg: "rgba(15,118,110,0.10)" },
  { key: "rejected",   label: "Écarté",    fg: "#9CA3AF", bg: "#F3F4F6" },
]

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

  const updateStage = async (next: PipelineStage) => {
    if (!match || match.pipeline_stage === next) return
    setMatch({ ...match, pipeline_stage: next })
    setSiblingMatches((prev) => prev.map((m) =>
      m.id === match.id ? { ...m, pipeline_stage: next } : m,
    ))
    await fetch(`/api/match/${match.id}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_stage: next }),
    })
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: "center", color: "#9CA3AF" }}>Chargement…</div>
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
      <div style={{ marginBottom: 18, display: "flex", gap: 14, fontSize: 12.5 }}>
        <Link href="/workspace/pipeline" style={{ color: "#7C63C8", textDecoration: "none" }}>← Pipeline</Link>
        {job && (
          <Link href={`/workspace/postes/${job.id}`} style={{ color: "#7C63C8", textDecoration: "none" }}>
            ← Poste : {job.title}
          </Link>
        )}
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
                      label: m.job?.title ?? "Sans poste",
                      hint: m.score != null
                        ? `${m.score} · ${m.match_tier ?? ""}`.trim()
                        : "manuel",
                    }))
                  : [{ value: match.id, label: job?.title ?? "Sans poste" }]
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

      {/* Stage stepper — horizontal pills, click to advance / rewind the
          current match. Replaces the vertical kanban now that the job
          picker handles multi-match navigation. */}
      <div style={{
        background: "white", borderRadius: 14, border: "1px solid #F0ECF8",
        padding: "12px 16px", marginBottom: 18,
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: "#9CA3AF",
          letterSpacing: "0.07em", textTransform: "uppercase", marginRight: 4,
        }}>
          Stage
        </span>
        {STAGE_STEPS.map((s) => {
          const active = match.pipeline_stage === s.key
          return (
            <button
              key={s.key}
              onClick={() => updateStage(s.key)}
              style={{
                fontSize: 12, fontWeight: active ? 800 : 600,
                color: active ? "white" : s.fg,
                background: active
                  ? `linear-gradient(120deg, ${s.fg} 0%, ${s.fg} 100%)`
                  : s.bg,
                border: `1px solid ${active ? s.fg : "transparent"}`,
                borderRadius: 100, padding: "5px 12px",
                cursor: "pointer", fontFamily: "inherit",
                transition: "all 140ms",
              }}
            >
              {s.label}
            </button>
          )
        })}
      </div>

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
      }}>
        {/* LEFT — candidat, raison du match, anonymisation */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <section style={{ background: "white", border: "1px solid #F0ECF8", borderRadius: 16, padding: 18 }}>
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

          {/* Match reason — featured */}
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

          <AnonymizeForJob
            candidateId={candidate.id}
            jobId={job?.id ?? null}
            jobTitle={job?.title ?? null}
            candidateParsed={candidate.parse_status === "parsed"}
          />
        </div>

        {/* RIGHT — message d'approche */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <section style={{ background: "white", border: "1px solid #F0ECF8", borderRadius: 16, padding: 18 }}>
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

          {/* Conversation placeholder — réactivée quand le mailing revient */}
          <section style={{
            background: "white", border: "1px dashed #F0ECF8", borderRadius: 16, padding: 16,
            opacity: 0.6,
          }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              💬 Conversation
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: "#9CA3AF" }}>
              Réactivée quand le mailing multi-domaine sera en place.
            </p>
          </section>
        </div>

        {/* Right rail — vertical mini-kanban (sticky). Stays here on top
            of the dropdown because it gives the at-a-glance view of where
            this candidate is across every job they're matched to. */}
        <aside className="match-rail" style={{
          position: "sticky", top: 80, alignSelf: "flex-start",
        }}>
          <CandidateMiniKanban
            candidateId={candidate.id}
            highlightMatchId={match.id}
            layout="vertical"
          />
        </aside>
      </div>

      <style>{`
        @media (max-width: 1180px) {
          .match-band { grid-template-columns: 1fr !important; }
          .match-grid { grid-template-columns: 1fr !important; }
          .match-rail { position: static !important; }
        }
      `}</style>
    </main>
  )
}
