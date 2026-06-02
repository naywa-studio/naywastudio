"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { m, AnimatePresence } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import type { Job, Candidate, MatchAssessment, MatchTier } from "@/lib/database.types"
import NoraLoader from "@/components/workspace/NoraLoader"
import { seniorityIntervalLabel } from "@/lib/seniority"
import { rejectReasonLabel, type RejectReason } from "@/lib/reject-reasons"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

/** Human seniority label — interval ("Mid → Senior · 5–10 ans") if present
 *  in normalized, else the legacy free string. */
function jobSeniorityLabel(job: Job): string | null {
  const n = job.normalized
  const iv = seniorityIntervalLabel(n?.seniority_min_years, n?.seniority_max_years)
  if (iv) {
    const lo = n?.seniority_min_years, hi = n?.seniority_max_years
    if (lo != null && hi != null) return `${iv} · ${lo}–${hi} ans`
    return iv
  }
  return job.seniority?.trim() || null
}

type AssessmentRow = MatchAssessment & { candidate: Candidate | null }

const TIER_META: Record<MatchTier, { label: string; color: string; bg: string; bd: string }> = {
  excellent: { label: "Excellent match", color: "#15803d", bg: "rgba(34,197,94,0.07)", bd: "rgba(34,197,94,0.25)" },
  good:      { label: "Bon match",       color: "#7C63C8", bg: "rgba(124,99,200,0.07)", bd: "rgba(124,99,200,0.22)" },
  fair:      { label: "Match moyen",     color: "#B45309", bg: "rgba(245,158,11,0.07)", bd: "rgba(245,158,11,0.22)" },
  poor:      { label: "Match faible",    color: "#6B7280", bg: "#F9FAFB", bd: "#E5E7EB" },
}
const TIER_ORDER: MatchTier[] = ["excellent", "good", "fair", "poor"]

export default function JobDetailPage() {
  const router = useRouter()
  const { jobId } = useParams<{ jobId: string }>()
  const sb = useMemo(() => getSupabase(), [])

  const [job, setJob] = useState<Job | null>(null)
  const [rows, setRows] = useState<AssessmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [showWeak, setShowWeak] = useState(false)
  // Si on a moins de 3 matchs forts (≥60), c'est que le vivier n'a pas de
  // profil 100% aligné — on déplie automatiquement les matchs plus faibles
  // pour ne pas laisser le sourceur croire qu'il n'y a "rien". Idée : mieux
  // vaut montrer ce qu'on a et l'assumer qu'afficher une page vide.
  const SCARCE_THRESHOLD = 3
  const [assignOpen, setAssignOpen] = useState(false)
  const [briefing, setBriefing] = useState("")
  const [briefingSaving, setBriefingSaving] = useState<"idle" | "saving" | "saved">("idle")

  const loadAll = useCallback(async () => {
    const res = await fetch(`/api/jobs/${jobId}`)
    if (res.status === 404) { setNotFound(true); setLoading(false); return }
    if (!res.ok) { setLoading(false); return }
    const data = await res.json()
    const j = data.job as Job
    setJob(j)
    setBriefing(j.briefing ?? "")
    setRows((data.assessments ?? []) as AssessmentRow[])
    setLoading(false)
  }, [jobId])

  const saveBriefing = async () => {
    if (!job) return
    if ((briefing ?? "") === (job.briefing ?? "")) return
    setBriefingSaving("saving")
    const res = await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ briefing }),
    })
    if (res.ok) {
      setJob((prev) => prev ? { ...prev, briefing } : prev)
      setBriefingSaving("saved")
      setTimeout(() => setBriefingSaving("idle"), 1600)
    } else {
      setBriefingSaving("idle")
    }
  }

  useEffect(() => {
    let mounted = true
    let jobCh: ReturnType<typeof sb.channel> | null = null
    let maCh: ReturnType<typeof sb.channel> | null = null
    ;(async () => {
      await loadAll()
      if (!mounted) return
      jobCh = sb
        .channel(`job:${jobId}`)
        .on("postgres_changes",
          { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${jobId}` },
          (payload) => setJob(payload.new as Job),
        )
        .subscribe()
      maCh = sb
        .channel(`ma:${jobId}`)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "match_assessments", filter: `job_id=eq.${jobId}` },
          () => { loadAll() },
        )
        .subscribe()
    })()
    return () => {
      mounted = false
      if (jobCh) sb.removeChannel(jobCh)
      if (maCh) sb.removeChannel(maCh)
    }
  }, [jobId, sb, loadAll])

  // Polling safety net — Realtime is the primary mechanism but when the
  // server creates many match_assessments in one batch the websocket can
  // occasionally lag or skip events, and the UI stays on "matching…" with
  // an empty list until a manual refresh. While the job is in "matching"
  // status we refetch every 3 s; as soon as it flips to "done" or "error"
  // we stop. Cheap, idempotent.
  const isMatching = job?.match_status === "matching"
  useEffect(() => {
    if (!isMatching) return
    const interval = setInterval(() => { loadAll() }, 3000)
    return () => clearInterval(interval)
  }, [isMatching, loadAll])

  const runMatch = async (opts?: { force?: boolean }) => {
    if (!job) return
    setMatchError(null)
    // Stamp updated_at locally so the progress bar starts from now even
    // if the server hasn't bounced its own updated_at yet.
    setJob({ ...job, match_status: "matching", updated_at: new Date().toISOString() })
    const qs = opts?.force ? "?force=1" : ""
    const res = await fetch(`/api/jobs/${job.id}/match${qs}`, { method: "POST" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      // 409 "already_matching" isn't really an error — it just means the
      // previous run is still in flight. We keep the progress bar going
      // and let the polling effect detect completion. Anything else is
      // a real failure.
      if (res.status === 409) {
        setMatchError(null)
        return
      }
      setMatchError(data?.message ?? data?.detail ?? data?.error ?? "Le matching a échoué.")
      setJob((prev) => prev ? { ...prev, match_status: "error" } : prev)
      return
    }
    await loadAll()
  }

  const handleDelete = async () => {
    if (!job) return
    if (!confirm("Supprimer cette mission ? Les matchs associés seront perdus.")) return
    const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" })
    if (res.ok) router.push("/workspace/missions")
  }

  // Ajoute / retire un candidat de la pipeline (liste curatée). Optimiste.
  const togglePipeline = async (rowId: string, next: boolean) => {
    setRows((prev) => prev.map((r) => r.id === rowId ? { ...r, in_pipeline: next } : r))
    const res = await fetch(`/api/match/${rowId}/pipeline`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ in_pipeline: next }),
    })
    if (!res.ok) {
      setRows((prev) => prev.map((r) => r.id === rowId ? { ...r, in_pipeline: !next } : r))
    }
  }

  if (loading) return <NoraLoader />
  if (notFound || !job) {
    return (
      <div style={{ padding: "60px 24px", textAlign: "center", color: "#6B7280" }}>
        <p style={{ fontSize: 16, fontWeight: 600 }}>Mission introuvable.</p>
        <Link href="/workspace/missions" style={{ color: "#7C63C8", textDecoration: "none", fontSize: 14 }}>
          ← Retour aux missions
        </Link>
      </div>
    )
  }

  const matching = job.match_status === "matching"
  // Manually assigned matches have score === null. Pinned at the top of
  // the page so the sourcer never loses track of who they pushed in by hand.
  const manualRows = rows
    .filter((r) => r.score == null)
    .sort((a, b) => (a.candidate?.full_name ?? "").localeCompare(b.candidate?.full_name ?? ""))
  const scoredRows = rows.filter((r) => r.score != null)
  const grouped = TIER_ORDER.map((tier) => ({
    tier,
    rows: scoredRows
      .filter((r) => (r.match_tier ?? "poor") === tier)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
  }))
  const strong = grouped.filter((g) => g.tier === "excellent" || g.tier === "good")
  const weak = grouped.filter((g) => g.tier === "fair" || g.tier === "poor")
  const strongCount = strong.reduce((n, g) => n + g.rows.length, 0)
  const weakCount = weak.reduce((n, g) => n + g.rows.length, 0)

  // Stats sourcing — vu / retenu / écarté + raison dominante des rejets.
  // "Vu" = tous les matchs scorés (le sourceur a parcouru les profils que
  // Nora a remontés). "Retenu" = ceux en pipeline. "Écarté" = stage rejected.
  const sourcingStats = (() => {
    const seen = rows.filter((r) => r.score != null).length
    const retained = rows.filter((r) => r.in_pipeline && r.pipeline_stage !== "rejected").length
    const rejected = rows.filter((r) => r.pipeline_stage === "rejected")
    const reasonCounts = new Map<RejectReason | "null", number>()
    for (const r of rejected) {
      const key = (r.reject_reason ?? "null") as RejectReason | "null"
      reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1)
    }
    let topReason: { key: RejectReason | "null"; count: number } | null = null
    for (const [key, count] of reasonCounts) {
      if (!topReason || count > topReason.count) topReason = { key, count }
    }
    return { seen, retained, rejected: rejected.length, topReason }
  })()

  return (
    <main style={{
      padding: "32px 24px 80px", maxWidth: 1320, margin: "0 auto",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      <Link href="/workspace/missions" style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 13, color: "#7C63C8", textDecoration: "none", marginBottom: 22,
      }}>← Retour aux missions</Link>

      <div className="mission-grid" style={{
        display: "grid",
        gridTemplateColumns: "minmax(320px, 380px) minmax(0, 1fr)",
        gap: 22, alignItems: "start",
      }}>
      {/* ── Colonne gauche : définition mission + actions (sticky) ── */}
      <m.section
        className="mission-left"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        style={{ background: "white", borderRadius: 16, border: "1px solid #F0ECF8", padding: 24, position: "sticky", top: 24 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
              {job.role_name?.trim() || job.title}
            </h1>
            {job.role_name?.trim() && job.title && job.title !== job.role_name && (
              <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "#9CA3AF" }}>{job.title}</p>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, fontSize: 12, color: "#6B7280" }}>
              {job.location && <Meta>{job.location}</Meta>}
              {jobSeniorityLabel(job) && <Meta>{jobSeniorityLabel(job)}</Meta>}
              {job.contract_type && <Meta>{job.contract_type}</Meta>}
            </div>
          </div>
          <button onClick={handleDelete} title="Supprimer la mission" style={{
            flexShrink: 0,
            fontSize: 12, fontWeight: 600, color: "#DC2626",
            background: "transparent", border: "1px solid #FCA5A5",
            borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontFamily: "inherit",
          }}>Supprimer</button>
        </div>

        {job.required_skills && job.required_skills.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.07em", textTransform: "uppercase" }}>
              Compétences requises
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {job.required_skills.map((s) => (
                <span key={s} style={{ fontSize: 12, color: "#4B5563", background: "#F8F6FF", border: "1px solid #F0ECF8", padding: "4px 9px", borderRadius: 7 }}>{s}</span>
              ))}
            </div>
          </div>
        )}

        {job.description && (
          <p style={{ margin: "16px 0 0", fontSize: 13.5, color: "#4B5563", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {job.description}
          </p>
        )}

        {/* Briefing / contraintes — injected into matching + compose */}
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#7C63C8", letterSpacing: "0.07em", textTransform: "uppercase" }}>
              Briefing / contraintes
            </p>
            <span style={{ fontSize: 11, color: "#9CA3AF" }}>
              — pris en compte par Nora pour le matching et les messages
            </span>
            {briefingSaving === "saving" && <span style={{ fontSize: 11, color: "#7C63C8", marginLeft: "auto" }}>Enregistrement…</span>}
            {briefingSaving === "saved"   && <span style={{ fontSize: 11, color: "#16a34a", marginLeft: "auto" }}>✓ Sauvegardé</span>}
          </div>
          <textarea
            value={briefing}
            onChange={(e) => setBriefing(e.target.value)}
            onBlur={saveBriefing}
            placeholder="Ex : pas de profils <3 ans XP, démarrage septembre, budget max 55k, pas d'ESN, client préfère un profil hybride Paris…"
            rows={3}
            style={{
              width: "100%", boxSizing: "border-box",
              fontSize: 13, color: "#111827",
              padding: 11,
              background: "#FAFAFA",
              border: "1px solid #F0ECF8", borderRadius: 10,
              outline: "none", resize: "vertical",
              fontFamily: "inherit", lineHeight: 1.6,
            }}
          />
        </div>

        {/* Pricing géré dans l'onglet Pricing dédié — pas affiché ici pour
            ne pas dupliquer. Lien rapide ci-dessous si besoin. */}
        <Link href={`/workspace/pricing/${job.id}`} style={{
          marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 12.5, fontWeight: 700, color: "#7C63C8",
          background: "white",
          border: "1px solid rgba(124,99,200,0.25)",
          borderRadius: 9, padding: "8px 14px",
          textDecoration: "none", alignSelf: "flex-start",
        }}>
          Chiffrer dans le pricing →
        </Link>

        {/* Match action */}
        <div style={{
          marginTop: 20, paddingTop: 18, borderTop: "1px solid #F0ECF8",
        }}>
          {matching ? (
            <MatchingProgress
              startedAt={job.updated_at}
              partialCount={rows.length}
              onForceRetry={() => runMatch({ force: true })}
            />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <button onClick={() => runMatch()} style={{
                padding: "11px 20px", borderRadius: 11, border: "none",
                background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                color: "white", fontSize: 13.5, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
                boxShadow: "0 6px 20px -8px rgba(124,99,200,0.55)",
              }}>
                {rows.length > 0 ? "Relancer le matching" : "Matcher le vivier"}
              </button>
              <button onClick={() => setAssignOpen(true)} style={{
                padding: "10px 16px", borderRadius: 11,
                background: "white", border: "1px solid rgba(124,99,200,0.3)",
                color: "#7C63C8", fontSize: 13, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
              }}>
                + Assigner un candidat
              </button>
              <span style={{ fontSize: 12.5, color: "#9CA3AF" }}>
                {job.matched_at
                  ? `Dernier matching : ${new Date(job.matched_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}`
                  : "Lancez le matching pour voir les candidats pertinents."}
              </span>
            </div>
          )}
        </div>
        {matchError && (
          <div style={{
            marginTop: 12, padding: "10px 14px",
            background: "#FEF2F2", border: "1px solid #FECACA",
            borderRadius: 10, fontSize: 13, color: "#B91C1C",
          }}>{matchError}</div>
        )}
      </m.section>

      {/* ── Colonne droite : résultats du matching ── */}
      <div className="mission-right">
      {/* Results */}
      {rows.length === 0 ? (
        <div style={{
          padding: "56px 24px", textAlign: "center",
          background: "white", border: "1px dashed #E2DAF6", borderRadius: 16,
          color: "#6B7280",
        }}>
          {matching ? (
            <>
              <div style={{ fontSize: 40, marginBottom: 10 }}>✦</div>
              <p style={{ margin: 0, fontSize: 14 }}>Nora analyse votre vivier…</p>
            </>
          ) : (
            <>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🎯</div>
              <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#111827" }}>Aucun candidat matché pour l&apos;instant</p>
              <p style={{ margin: 0, fontSize: 13 }}>Lancez le matching — Nora ne remontera que les profils pertinents.</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 16, fontSize: 13, color: "#6B7280" }}>
            <strong style={{ color: "#111827" }}>{strongCount}</strong> candidat{strongCount > 1 ? "s" : ""} pertinent{strongCount > 1 ? "s" : ""}
            {manualRows.length > 0 && <> · <strong style={{ color: "#7C63C8" }}>{manualRows.length}</strong> assigné{manualRows.length > 1 ? "s" : ""} manuellement</>}
            {weakCount > 0 && <> · {weakCount} autre{weakCount > 1 ? "s" : ""} à plus faible affinité</>}
          </div>

          {/* Stats sourcing — vue d'ensemble pour reporter au client + signal
              de calibration interne (quel motif d'écart domine). */}
          {(sourcingStats.seen > 0 || sourcingStats.rejected > 0) && (
            <div style={{
              marginBottom: 16,
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 8,
            }}>
              <SourcingStatTile label="Vus" value={String(sourcingStats.seen)} />
              <SourcingStatTile
                label="Retenus"
                value={String(sourcingStats.retained)}
                tone={sourcingStats.retained > 0 ? "good" : undefined}
              />
              <SourcingStatTile
                label="Écartés"
                value={String(sourcingStats.rejected)}
                tone={sourcingStats.rejected > 0 ? "warn" : undefined}
              />
              {sourcingStats.topReason && sourcingStats.topReason.key !== "null" && (
                <SourcingStatTile
                  label="Top motif d'écart"
                  value={rejectReasonLabel(sourcingStats.topReason.key as RejectReason)}
                  hint={`${sourcingStats.topReason.count} candidat${sourcingStats.topReason.count > 1 ? "s" : ""}`}
                />
              )}
            </div>
          )}

          {/* Manually assigned — always first, no score by definition */}
          {manualRows.length > 0 && (
            <ManualBlock rows={manualRows} />
          )}

          {strong.map((g) => g.rows.length > 0 && (
            <TierBlock key={g.tier} tier={g.tier} rows={g.rows} onTogglePipeline={togglePipeline} />
          ))}

          {weakCount > 0 && (() => {
            const scarce = strongCount < SCARCE_THRESHOLD
            const expanded = scarce || showWeak
            return (
              <div style={{ marginTop: 8 }}>
                {/* Bannière de transparence quand le vivier ne sort pas de
                    profil très aligné : on déplie d'office et on l'assume. */}
                {scarce && (
                  <div style={{
                    margin: "10px 0 14px", padding: "11px 14px",
                    background: "rgba(217,119,6,0.06)",
                    border: "1px solid rgba(217,119,6,0.25)",
                    borderRadius: 11,
                    fontSize: 12.5, color: "#374151", lineHeight: 1.55,
                  }}>
                    <strong style={{ color: "#B45309" }}>Peu de profils correspondent à 100 %.</strong>{" "}
                    Voici les meilleurs candidats de votre vivier sur cette mission — l&apos;affinité est moindre mais à examiner.
                  </div>
                )}
                {!scarce && (
                  <button onClick={() => setShowWeak((v) => !v)} style={{
                    fontSize: 12.5, fontWeight: 600, color: "#7C63C8",
                    background: "transparent", border: "none", cursor: "pointer",
                    padding: "8px 0", fontFamily: "inherit",
                  }}>
                    {showWeak ? "▾ Masquer" : "▸ Afficher"} les {weakCount} match{weakCount > 1 ? "s" : ""} à plus faible affinité
                  </button>
                )}
                <AnimatePresence>
                  {expanded && (
                    <m.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
                      {weak.map((g) => g.rows.length > 0 && <TierBlock key={g.tier} tier={g.tier} rows={g.rows} onTogglePipeline={togglePipeline} />)}
                    </m.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })()}
        </>
      )}
      </div>{/* /mission-right */}
      </div>{/* /mission-grid */}

      {assignOpen && (
        <AssignModal
          jobId={job.id}
          existingCandidateIds={new Set(rows.map((r) => r.candidate?.id).filter((x): x is string => !!x))}
          onClose={() => setAssignOpen(false)}
          onAssigned={() => { setAssignOpen(false); loadAll() }}
        />
      )}

      {/* Sur écran étroit, on repasse en une colonne et la définition n'est
          plus sticky (sinon elle masquerait les résultats au scroll). */}
      <style>{`
        @media (max-width: 1023px) {
          .mission-grid { grid-template-columns: 1fr !important; }
          .mission-left { position: static !important; }
        }
      `}</style>
    </main>
  )
}

/* ─── Assign modal ─────────────────────────────────────────────── */

function AssignModal({
  jobId, existingCandidateIds, onClose, onAssigned,
}: {
  jobId: string
  existingCandidateIds: Set<string>
  onClose: () => void
  onAssigned: () => void
}) {
  const sb = useMemo(() => getSupabase(), [])
  const [query, setQuery] = useState("")
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await sb
        .from("candidates")
        .select("id, full_name, current_title, current_company, cv_file_name, location, seniority_level")
        .eq("parse_status", "parsed")
        .order("created_at", { ascending: false })
        .limit(200)
      if (!mounted) return
      setCandidates((data ?? []) as unknown as Candidate[])
      setLoadingList(false)
    })()
    return () => { mounted = false }
  }, [sb])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return candidates
      .filter((c) => !existingCandidateIds.has(c.id))
      .filter((c) => {
        if (!q) return true
        const hay = [c.full_name, c.current_title, c.current_company, c.location, c.cv_file_name]
          .filter(Boolean).join(" ").toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 50)
  }, [candidates, query, existingCandidateIds])

  const assign = async (candidateId: string) => {
    setAssigning(candidateId); setErr(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: candidateId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(data?.detail ?? data?.error ?? "L'assignation a échoué.")
        setAssigning(null)
        return
      }
      onAssigned()
    } catch (e) {
      setErr((e as Error).message ?? "Erreur réseau.")
      setAssigning(null)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(17,24,39,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white", borderRadius: 16,
          width: "100%", maxWidth: 560,
          maxHeight: "85vh", display: "flex", flexDirection: "column",
          boxShadow: "0 24px 60px rgba(17,24,39,0.25)",
        }}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #F0ECF8" }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Assigner manuellement
          </p>
          <h3 style={{ margin: "4px 0 10px", fontSize: 17, fontWeight: 800, color: "#111827" }}>
            Choisir un candidat
          </h3>
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher par nom, poste, entreprise…"
            style={{
              width: "100%", boxSizing: "border-box",
              fontSize: 13.5, color: "#111827", padding: "10px 12px",
              background: "#FAFAFA", border: "1px solid #E5E7EB", borderRadius: 10,
              outline: "none", fontFamily: "inherit",
            }}
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
          {loadingList ? (
            <div style={{ padding: 20 }}><NoraLoader inline /></div>
          ) : filtered.length === 0 ? (
            <p style={{ padding: 20, fontSize: 13, color: "#9CA3AF", textAlign: "center" }}>
              {query ? "Aucun candidat ne correspond." : "Tous les candidats du vivier sont déjà matchés."}
            </p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => assign(c.id)}
                disabled={assigning !== null}
                style={{
                  width: "100%", textAlign: "left",
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px", borderRadius: 10,
                  background: "transparent", border: "1px solid transparent",
                  cursor: assigning === c.id ? "default" : "pointer",
                  fontFamily: "inherit",
                  opacity: assigning && assigning !== c.id ? 0.4 : 1,
                }}
                onMouseEnter={(e) => { if (!assigning) e.currentTarget.style.background = "#F8F6FF" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.full_name ?? c.cv_file_name ?? "Sans nom"}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.current_title ?? "—"}
                    {c.current_company ? ` · ${c.current_company}` : ""}
                    {c.location ? ` · ${c.location}` : ""}
                  </p>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: "#7C63C8",
                  background: "rgba(124,99,200,0.08)",
                  border: "1px solid rgba(124,99,200,0.18)",
                  borderRadius: 8, padding: "4px 10px",
                  flexShrink: 0,
                }}>
                  {assigning === c.id ? "…" : "Assigner"}
                </span>
              </button>
            ))
          )}
        </div>
        {err && (
          <div style={{ padding: "10px 16px", fontSize: 12.5, color: "#B91C1C", background: "#FEF2F2", borderTop: "1px solid #FECACA" }}>
            {err}
          </div>
        )}
        <div style={{ padding: "12px 16px", borderTop: "1px solid #F0ECF8", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            fontSize: 12.5, fontWeight: 700, color: "#6B7280",
            background: "white", border: "1px solid #E5E7EB",
            borderRadius: 9, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit",
          }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Matching progress ──────────────────────────────────────────
 * Realistic progress bar driven by elapsed time since the run started.
 * Curve `1 - exp(-t/22000)` rises fast then asymptotes near 96 % — the
 * average run takes 20-40 s, so 22 s as the time constant matches reality.
 * Partial results arrive in batches, so we also show "X profils déjà
 * remontés" when applicable.
 * Past 90 s without completion we surface a "Relancer" escape hatch —
 * the server-side stale check (>2 min) will accept the new run.
 */
function MatchingProgress({
  startedAt, partialCount, onForceRetry,
}: { startedAt: string; partialCount: number; onForceRetry: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 600)
    return () => clearInterval(t)
  }, [])
  const startMs = new Date(startedAt).getTime()
  const elapsedMs = Math.max(0, now - startMs)
  const elapsedSec = Math.round(elapsedMs / 1000)
  const pct = Math.min(96, 100 * (1 - Math.exp(-elapsedMs / 22000)))
  // Beyond Vercel's 60 s budget the server has very likely been killed.
  // We show "Forcer la relance" the moment we cross the server's stale
  // window (75 s) so the user can unblock immediately.
  const stalling = elapsedMs > 60_000
  const canForceRetry = elapsedMs > 75_000
  // Subtle pulse on the bar past 80 % so the user feels things are alive
  // even though the asymptote makes the width crawl.
  const nearAsymptote = pct > 80

  const label =
    elapsedSec < 4 ? "Préfiltrage du vivier…"
    : elapsedSec < 14 ? "Nora score les profils pertinents…"
    : elapsedSec < 28 ? "Comparaison taxonomies et expérience…"
    : !stalling ? "Finalisation du classement…"
    : canForceRetry ? "Le matching a probablement été interrompu — relancez."
    : "Plus long que d'habitude — encore quelques secondes."

  return (
    <div style={{
      background: "linear-gradient(120deg, rgba(124,99,200,0.06) 0%, rgba(124,99,200,0.02) 100%)",
      border: "1px solid rgba(124,99,200,0.22)",
      borderRadius: 12,
      padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{
          display: "inline-block", width: 16, height: 16, borderRadius: "50%",
          border: "2px solid rgba(124,99,200,0.25)",
          borderTopColor: "#7C63C8",
          animation: "matching-spin 0.9s linear infinite",
        }} />
        <span style={{ fontSize: 13.5, fontWeight: 800, color: "#7C63C8" }}>
          Matching en cours
        </span>
        {partialCount > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: "#7C63C8",
            background: "white", border: "1px solid rgba(124,99,200,0.22)",
            borderRadius: 100, padding: "1px 8px",
          }}>{partialCount} déjà remonté{partialCount > 1 ? "s" : ""}</span>
        )}
        <span style={{
          marginLeft: "auto", fontSize: 11.5, color: "#9CA3AF",
          fontVariantNumeric: "tabular-nums",
        }}>
          {Math.round(pct)}% · {elapsedSec}s
        </span>
      </div>
      <div style={{
        position: "relative",
        height: 6, width: "100%",
        background: "rgba(124,99,200,0.12)",
        borderRadius: 100, overflow: "hidden",
      }}>
        {nearAsymptote ? (
          <div style={{
            position: "absolute", top: 0, bottom: 0,
            width: "40%",
            borderRadius: 100,
            background: stalling
              ? "linear-gradient(90deg, rgba(124,99,200,0) 0%, #C4B6E0 50%, rgba(124,99,200,0) 100%)"
              : "linear-gradient(90deg, rgba(124,99,200,0) 0%, #7C63C8 50%, rgba(124,99,200,0) 100%)",
            animation: "matching-indeterminate 1.6s ease-in-out infinite",
          }} />
        ) : (
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: `${pct}%`,
            background: "linear-gradient(90deg, #7C63C8 0%, #B8AEDE 100%)",
            borderRadius: 100,
            transition: "width 600ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}>
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
              animation: "matching-shimmer 1.4s linear infinite",
            }} />
          </div>
        )}
      </div>
      <div style={{
        marginTop: 10, display: "flex", alignItems: "center",
        gap: 12, flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 12.5, color: "#6B7280", flex: 1, minWidth: 200 }}>
          {label}
        </span>
        {canForceRetry && (
          <button onClick={onForceRetry} style={{
            fontSize: 11.5, fontWeight: 700, color: "#7C63C8",
            background: "white",
            border: "1px solid rgba(124,99,200,0.3)",
            borderRadius: 8, padding: "6px 11px",
            cursor: "pointer", fontFamily: "inherit",
          }}>
            Forcer la relance
          </button>
        )}
      </div>
      <style>{`
        @keyframes matching-spin { to { transform: rotate(360deg); } }
        @keyframes matching-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%);  }
        }
        @keyframes matching-indeterminate {
          0%   { left: -40%; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  )
}

/* ─── Tier block ───────────────────────────────────────────────── */

function TierBlock({ tier, rows, onTogglePipeline }: { tier: MatchTier; rows: AssessmentRow[]; onTogglePipeline: (id: string, next: boolean) => void }) {
  const meta = TIER_META[tier]
  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{
          fontSize: 11, fontWeight: 800, color: meta.color,
          letterSpacing: "0.04em", textTransform: "uppercase",
        }}>{meta.label}</span>
        <span style={{ fontSize: 11, color: "#9CA3AF" }}>· {rows.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r, i) => <MatchRow key={r.id} row={r} tier={tier} delay={Math.min(i * 0.03, 0.2)} onTogglePipeline={onTogglePipeline} />)}
      </div>
    </section>
  )
}

function MatchRow({ row, tier, delay, onTogglePipeline }: { row: AssessmentRow; tier: MatchTier; delay: number; onTogglePipeline: (id: string, next: boolean) => void }) {
  const meta = TIER_META[tier]
  const c = row.candidate
  const name = c?.full_name ?? c?.cv_file_name ?? "Candidat"
  const initials = name.split(/\s+/).slice(0, 2).map((s) => s[0] ?? "").join("").toUpperCase() || "?"

  return (
    <m.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: EASE }}
      style={{
        background: meta.bg, border: `1px solid ${meta.bd}`,
        borderRadius: 13, padding: "14px 16px",
        display: "flex", gap: 14, alignItems: "flex-start",
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
        background: "white", border: `1px solid ${meta.bd}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: meta.color, fontWeight: 800, fontSize: 13,
      }}>{initials}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: "#111827" }}>{name}</p>
          <span style={{
            fontSize: 12, fontWeight: 800, color: meta.color,
            background: "white", border: `1px solid ${meta.bd}`,
            padding: "1px 8px", borderRadius: 100,
          }}>{row.score ?? "—"}</span>
        </div>
        {c?.current_title && (
          <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#6B7280" }}>
            {c.current_title}{c.current_company ? ` · ${c.current_company}` : ""}
          </p>
        )}
        {row.justification && (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "#4B5563", lineHeight: 1.6 }}>
            {row.justification}
          </p>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0, alignSelf: "center" }}>
        <button
          onClick={() => onTogglePipeline(row.id, !row.in_pipeline)}
          title={row.in_pipeline ? "Retirer de la pipeline" : "Suivre ce candidat dans la pipeline"}
          style={{
            fontSize: 11.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
            padding: "6px 11px", borderRadius: 8,
            color: row.in_pipeline ? "#15803d" : "#7C63C8",
            background: row.in_pipeline ? "rgba(34,197,94,0.08)" : "white",
            border: `1px solid ${row.in_pipeline ? "rgba(34,197,94,0.3)" : "rgba(124,99,200,0.3)"}`,
            whiteSpace: "nowrap",
          }}
        >
          {row.in_pipeline ? "✓ Dans le pipeline" : "+ Pipeline"}
        </button>
        <Link href={`/workspace/match/${row.id}`} style={{
          fontSize: 12, fontWeight: 700, color: "white",
          padding: "6px 12px", borderRadius: 8,
          background: `linear-gradient(120deg, ${meta.color} 0%, ${meta.color} 100%)`,
          textDecoration: "none",
        }}>
          Ouvrir ▶
        </Link>
        {c && (
          <Link href={`/workspace/vivier/${c.id}`} title="Fiche candidat (identité)" style={{
            fontSize: 11, color: "#9CA3AF", textDecoration: "none",
          }}>
            👤 Fiche
          </Link>
        )}
      </div>
    </m.div>
  )
}

/* ─── Manual block ─────────────────────────────────────────────── */

function ManualBlock({ rows }: { rows: AssessmentRow[] }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{
          fontSize: 11, fontWeight: 800, color: "#7C63C8",
          letterSpacing: "0.04em", textTransform: "uppercase",
        }}>
          ✋ Assignés manuellement
        </span>
        <span style={{ fontSize: 11, color: "#9CA3AF" }}>· {rows.length}</span>
        <span style={{ fontSize: 11, color: "#9CA3AF", fontStyle: "italic" }}>
          — en dehors du matching auto
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r) => {
          const c = r.candidate
          const name = c?.full_name ?? c?.cv_file_name ?? "Candidat"
          const init = name.split(/\s+/).slice(0, 2).map((s) => s[0] ?? "").join("").toUpperCase() || "?"
          return (
            <div key={r.id} style={{
              background: "rgba(124,99,200,0.07)",
              border: "1px solid rgba(124,99,200,0.25)",
              borderRadius: 13, padding: "14px 16px",
              display: "flex", gap: 14, alignItems: "flex-start",
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                background: "white", border: "1px solid rgba(124,99,200,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#7C63C8", fontWeight: 800, fontSize: 13,
              }}>{init}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: "#111827" }}>{name}</p>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: "#7C63C8",
                    background: "white", border: "1px solid rgba(124,99,200,0.25)",
                    padding: "1px 8px", borderRadius: 100,
                  }}>Manuel</span>
                </div>
                {c?.current_title && (
                  <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#6B7280" }}>
                    {c.current_title}{c.current_company ? ` · ${c.current_company}` : ""}
                  </p>
                )}
                {r.justification && (
                  <p style={{ margin: "8px 0 0", fontSize: 13, color: "#4B5563", lineHeight: 1.6 }}>
                    {r.justification}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end", flexShrink: 0, alignSelf: "center" }}>
                <Link href={`/workspace/match/${r.id}`} style={{
                  fontSize: 12, fontWeight: 700, color: "white",
                  padding: "6px 12px", borderRadius: 8,
                  background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                  textDecoration: "none",
                }}>
                  Ouvrir ▶
                </Link>
                {c && (
                  <Link href={`/workspace/vivier/${c.id}`} title="Fiche candidat (identité)" style={{
                    fontSize: 11, color: "#9CA3AF", textDecoration: "none",
                  }}>
                    👤 Fiche
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ background: "#F9FAFB", border: "1px solid #F0ECF8", padding: "3px 8px", borderRadius: 6 }}>
      {children}
    </span>
  )
}

/* ───────────────────────── Sourcing stats ─────────────────────────────────
 * Tuile récap sourcing (vus / retenus / écartés + top motif d'écart).
 * Ton neutre par défaut, "good" si les retenus existent, "warn" si on rejette
 * beaucoup. Volontairement minimaliste — la valeur est dans le chiffre.
 */
function SourcingStatTile({
  label, value, hint, tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: "good" | "warn"
}) {
  const palette = tone === "good"
    ? { fg: "#15803d", bg: "rgba(34,197,94,0.06)",  bd: "rgba(34,197,94,0.22)" }
    : tone === "warn"
      ? { fg: "#B45309", bg: "rgba(217,119,6,0.06)", bd: "rgba(217,119,6,0.22)" }
      : { fg: "#111827", bg: "white",                bd: "#F0ECF8" }
  return (
    <div style={{
      background: palette.bg, border: `1px solid ${palette.bd}`,
      borderRadius: 10, padding: "10px 12px",
      display: "flex", flexDirection: "column", gap: 2,
    }}>
      <div style={{
        fontSize: 9.5, fontWeight: 700, color: "#9CA3AF",
        letterSpacing: "0.05em", textTransform: "uppercase",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 17, fontWeight: 800, color: palette.fg,
        fontVariantNumeric: "tabular-nums", lineHeight: 1.2,
      }}>
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 10.5, color: "#9CA3AF" }}>
          {hint}
        </div>
      )}
    </div>
  )
}

/* ───────────────────────── Pricing inline editor ─────────────────────────
 * Inline-editable pricing inputs directly on the mission detail page.
 * Auto-save debounced (800 ms) so the sourceur doesn't have to click
 * any save button — the badge confirms persistence. Calls back to the
 * parent so the cached `job` state stays in sync after each save.
 */
