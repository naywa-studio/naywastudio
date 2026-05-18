"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { m } from "framer-motion"
import type { Candidate, MatchAssessment, Job, PipelineStage, MatchTier, ScoreDimensions } from "@/lib/database.types"
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

const STAGE_OPTIONS: { value: PipelineStage; label: string }[] = [
  { value: "identified", label: "Identifié" },
  { value: "contacted",  label: "Contacté" },
  { value: "replied",    label: "Réponse reçue" },
  { value: "interview",  label: "Entretien" },
  { value: "offer",      label: "Offre" },
  { value: "hired",      label: "Recruté" },
  { value: "rejected",   label: "Écarté" },
]

const SCORE_DIM_LABELS: Record<keyof ScoreDimensions, string> = {
  skills_match:   "Skills",
  seniority_fit:  "Séniorité",
  location_fit:   "Lieu",
  experience_fit: "Expérience",
  language_fit:   "Langue",
}

/**
 * Fiche match — the post-refactor sourcer workspace, one URL per
 * (candidate × job) pair. Hosts the compose / anonymise / pricing-soon
 * actions in one place, with the match reason + mini pipeline on top.
 */
export default function MatchPage() {
  const { matchId } = useParams<{ matchId: string }>()

  const [match, setMatch] = useState<LoadedMatch | null>(null)
  const [candidate, setCandidate] = useState<Candidate | null>(null)
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

  const updateStage = async (next: string) => {
    if (!match) return
    const stage = next as PipelineStage
    if (match.pipeline_stage === stage) return
    setMatch({ ...match, pipeline_stage: stage })
    await fetch(`/api/match/${match.id}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_stage: stage }),
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
      maxWidth: 1280, margin: "0 auto",
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

      {/* Header band */}
      <m.section
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        style={{
          background: "white", borderRadius: 16, border: "1px solid #F0ECF8",
          padding: "18px 22px", marginBottom: 16,
          display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center",
        }}
        className="match-band"
      >
        <div>
          <h1 style={{
            margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "#111827",
          }}>
            {candidate.full_name ?? "Candidat sans nom"}
            <span style={{ fontWeight: 500, color: "#9CA3AF", fontSize: 15 }}> — pour le poste </span>
            {job?.title ?? "—"}
          </h1>
          <div style={{ marginTop: 6, fontSize: 12.5, color: "#6B7280", display: "flex", gap: 10, flexWrap: "wrap" }}>
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
          <div style={{ minWidth: 180 }}>
            <Select
              value={match.pipeline_stage}
              onChange={updateStage}
              options={STAGE_OPTIONS}
            />
          </div>
          <Link href={`/workspace/vivier/${candidate.id}`} style={{
            fontSize: 12, fontWeight: 700, color: "#7C63C8",
            background: "white", border: "1px solid rgba(124,99,200,0.25)",
            borderRadius: 9, padding: "8px 12px", textDecoration: "none",
          }}>
            Fiche candidat →
          </Link>
        </div>
      </m.section>

      {/* Two columns: left = résumé + raison + anonymisation (toutes les
          choses qu'on veut voir sans scroller). Right = message d'approche.
          Le mini-kanban du candidat passe en bas, c'est de la consultation
          pas une action prioritaire. */}
      <div className="match-grid" style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18,
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
      </div>

      {/* Mini kanban — ce candidat à travers tous ses postes. Placé en bas
          parce que c'est de la consultation ("où en est-il ailleurs ?"),
          pas une action prioritaire pour le poste affiché ici. */}
      <div style={{ marginTop: 18 }}>
        <CandidateMiniKanban candidateId={candidate.id} highlightMatchId={match.id} />
      </div>

      <style>{`
        @media (max-width: 980px) {
          .match-band { grid-template-columns: 1fr !important; }
          .match-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  )
}
