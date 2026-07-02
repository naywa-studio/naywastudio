"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { AnimatePresence } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import type { Job, Candidate, MatchAssessment } from "@/lib/database.types"
import type { Criterion, CriterionEval } from "@/lib/job-criteria-catalog"
import { kindOf } from "@/lib/job-criteria-catalog"
import { shortCriterionName } from "@/lib/criterion-display"
import NoraLoader from "@/components/workspace/NoraLoader"
import { useEscapeKey } from "@/components/ui/useEscapeKey"
import { MissionCvUploadModal } from "@/components/workspace/MissionCvUploadModal"
import { CriteriaOnboarding } from "@/components/workspace/CriteriaOnboarding"
import { MissionSummaryBar } from "@/components/workspace/MissionSummaryBar"
import { MatchCard } from "@/components/workspace/MatchCard"
import { JobForm } from "../page"

type AssessmentRow = MatchAssessment & { candidate: Candidate | null }

/** Provenance d'un match — 3 onglets côté UI (vivier fusionne matched + assigned). */
type MatchSource = "applied" | "uploaded" | "vivier_matched" | "vivier_assigned"
type SourceTab = "all" | "applied" | "uploaded" | "vivier"

function sourcesForTab(tab: SourceTab): Set<MatchSource> {
  if (tab === "all")      return new Set(["applied", "uploaded", "vivier_matched", "vivier_assigned"])
  if (tab === "applied")  return new Set(["applied"])
  if (tab === "uploaded") return new Set(["uploaded"])
  return new Set(["vivier_matched", "vivier_assigned"])
}

export default function JobDetailPage() {
  const router = useRouter()
  const { jobId } = useParams<{ jobId: string }>()
  const sb = useMemo(() => getSupabase(), [])

  const [job, setJob] = useState<Job | null>(null)
  const [rows, setRows] = useState<AssessmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  /** Force le wizard à s'afficher (édition manuelle des critères). */
  const [editCriteriaMode, setEditCriteriaMode] = useState(false)
  const [activeTab, setActiveTab] = useState<SourceTab>("all")
  /** Filtres actifs : Set des critère IDs sur lesquels exiger un "fort match". */
  const [activeCritFilters, setActiveCritFilters] = useState<Set<string>>(new Set())

  const loadAll = useCallback(async () => {
    const res = await fetch(`/api/jobs/${jobId}`)
    if (res.status === 404) { setNotFound(true); setLoading(false); return }
    if (!res.ok) { setLoading(false); return }
    const data = await res.json()
    const j = data.job as Job
    setJob(j)
    setRows((data.assessments ?? []) as AssessmentRow[])
    setLoading(false)
  }, [jobId])

  useEffect(() => {
    let mounted = true
    let jobCh: ReturnType<typeof sb.channel> | null = null
    let maCh: ReturnType<typeof sb.channel> | null = null
    ;(async () => {
      await loadAll()
      if (!mounted) return
      jobCh = sb.channel(`job:${jobId}`)
        .on("postgres_changes",
          { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${jobId}` },
          (payload) => setJob(payload.new as Job),
        ).subscribe()
      maCh = sb.channel(`ma:${jobId}`)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "match_assessments", filter: `job_id=eq.${jobId}` },
          () => { loadAll() },
        ).subscribe()
    })()
    return () => {
      mounted = false
      if (jobCh) sb.removeChannel(jobCh)
      if (maCh) sb.removeChannel(maCh)
    }
  }, [jobId, sb, loadAll])

  // Polling safety net while matching is in flight.
  const isMatching = job?.match_status === "matching"
  useEffect(() => {
    if (!isMatching) return
    const interval = setInterval(() => { loadAll() }, 3000)
    return () => clearInterval(interval)
  }, [isMatching, loadAll])

  // Auto-récupération d'un job "matching" stale (>90 s sans bouger).
  useEffect(() => {
    if (!isMatching || !job?.updated_at) return
    const ageMs = Date.now() - new Date(job.updated_at).getTime()
    if (ageMs > 90_000) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setJob((prev) => prev ? { ...prev, match_status: "error" } : prev)
    }
  }, [isMatching, job?.updated_at])

  const runMatch = useCallback(async (opts?: { force?: boolean }) => {
    if (!job) return
    setMatchError(null)
    setJob({ ...job, match_status: "matching", updated_at: new Date().toISOString() })
    const qs = opts?.force ? "?force=1" : ""
    const res = await fetch(`/api/jobs/${job.id}/match${qs}`, { method: "POST" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 409) { setMatchError(null); return }
      setMatchError(data?.message ?? data?.detail ?? data?.error ?? "Le matching a échoué.")
      setJob((prev) => prev ? { ...prev, match_status: "error" } : prev)
      return
    }
    await loadAll()
  }, [job, loadAll])

  const handleDelete = async () => {
    if (!job) return
    if (!confirm("Supprimer cette mission ? Les matchs associés seront perdus.")) return
    const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" })
    if (res.ok) router.push("/workspace/missions")
  }

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
  const criteria = (job.criteria ?? []) as Criterion[]
  const mainCriteria = criteria.filter((c) => c.weight === "main")
  // criteria_locked_at est le flag AUTORITAIRE (posé en même temps que les
  // critères par PATCH /criteria). On ne se base PAS sur criteria.length :
  // un payload realtime transitoire (update de match_status) pouvait arriver
  // sans le jsonb critères → criteria=[] → le wizard flashait + déclenchait
  // un appel propose-criteria inutile. Le flag date/heure ne flanche pas.
  const needsOnboarding = !job.criteria_locked_at
  const showWizard = needsOnboarding || editCriteriaMode
  // Critères modifiés depuis le dernier matching : les cartes affichent
  // encore l'ancienne évaluation. On invite à relancer. (Édition de critères
  // ne relance plus le matching auto — cf. wizard onCancel/onDone.)
  const criteriaStale = !!(
    job.criteria_locked_at &&
    rows.length > 0 &&
    (!job.matched_at || new Date(job.criteria_locked_at).getTime() > new Date(job.matched_at).getTime())
  )

  // Compteurs par source pour les onglets.
  const tabCounts: Record<SourceTab, number> = (() => {
    const sc: Record<MatchSource, number> = { applied: 0, uploaded: 0, vivier_matched: 0, vivier_assigned: 0 }
    for (const r of rows) sc[(r.source as MatchSource) ?? "vivier_matched"]++
    return {
      all: rows.length,
      applied: sc.applied,
      uploaded: sc.uploaded,
      vivier: sc.vivier_matched + sc.vivier_assigned,
    }
  })()

  // Filtrage : onglet + critères actifs (≥ 70 si quant, "yes" si qual).
  const allowedSources = sourcesForTab(activeTab)
  const filteredRows = rows
    .filter((r) => allowedSources.has((r.source as MatchSource) ?? "vivier_matched"))
    .filter((r) => {
      if (activeCritFilters.size === 0) return true
      const evals = new Map((r.criteria_eval ?? []).map((e) => [e.id, e as CriterionEval]))
      for (const critId of activeCritFilters) {
        const crit = mainCriteria.find((c) => c.id === critId)
        if (!crit) continue
        const ev = evals.get(critId)
        if (!ev) return false
        if (kindOf(crit.type) === "quantitative") {
          if ((ev.score ?? 0) < 70) return false
        } else {
          if (ev.status !== "yes") return false
        }
      }
      return true
    })
    .sort((a, b) => {
      const av = a.score, bv = b.score
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return bv - av
    })

  const strongCount = rows.filter((r) => (r.score ?? 0) >= 55).length

  return (
    <main style={{
      padding: "32px 24px 80px", maxWidth: 1100, margin: "0 auto",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      {/* Lien retour + bouton supprimer */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 16, marginBottom: 18, flexWrap: "wrap",
      }}>
        <Link href="/workspace/missions" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 13, color: "#7C63C8", textDecoration: "none",
        }}>← Retour aux missions</Link>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowEdit(true)} title="Modifier la mission" style={{
            fontSize: 12, fontWeight: 600, color: "#7C63C8",
            background: "white", border: "1px solid rgba(124,99,200,0.30)",
            borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontFamily: "inherit",
          }}>Modifier la mission</button>
          <button onClick={handleDelete} title="Supprimer la mission" style={{
            fontSize: 12, fontWeight: 600, color: "#DC2626",
            background: "transparent", border: "1px solid #FCA5A5",
            borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontFamily: "inherit",
          }}>Supprimer</button>
        </div>
      </div>

      {/* Bandeau résumé (visible une fois critères configurés). */}
      {!showWizard && (
        <MissionSummaryBar
          job={job}
          criteria={criteria}
          onEditCriteria={() => setEditCriteriaMode(true)}
          onImportCvs={() => setUploadOpen(true)}
          onMatchVivier={() => void runMatch()}
          onAssignFromVivier={() => setAssignOpen(true)}
          onCreateForm={undefined}
          matching={matching}
        />
      )}

      {/* Progress + erreurs */}
      {matching && (
        <div style={{ marginBottom: 16 }}>
          <MatchingProgress
            total={job.match_progress_total}
            scored={job.match_progress_scored}
            partialCount={rows.length}
            startedAt={job.updated_at}
            onForceRetry={() => runMatch({ force: true })}
          />
        </div>
      )}
      {matchError && (
        <div style={{
          marginBottom: 16, padding: "10px 14px",
          background: "#FEF2F2", border: "1px solid #FECACA",
          borderRadius: 10, fontSize: 13, color: "#B91C1C",
        }}>{matchError}</div>
      )}

      {/* Wizard onboarding OU contenu principal */}
      {showWizard ? (
        <CriteriaOnboarding
          jobId={job.id}
          initialCriteria={editCriteriaMode ? criteria : null}
          // Bouton "Annuler" seulement en mode édition (au 1ᵉʳ onboarding il
          // FAUT configurer les critères avant de pouvoir matcher).
          onCancel={editCriteriaMode ? () => setEditCriteriaMode(false) : undefined}
          onDone={(updated) => {
            // On NE lance PAS le matching automatiquement (retour sourceur) :
            // après validation des critères, le sourceur choisit lui-même
            // l'action (Matcher le vivier / Importer des CVs / Assigner /
            // formulaire). On atterrit sur l'empty state avec les boutons.
            setJob((prev) => prev ? { ...prev, criteria: updated, criteria_locked_at: new Date().toISOString() } : prev)
            setEditCriteriaMode(false)
          }}
        />
      ) : rows.length === 0 ? (
        <div style={{
          padding: "56px 24px", textAlign: "center",
          background: "white", border: "1px dashed #E2DAF6", borderRadius: 16,
          color: "#6B7280",
        }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🎯</div>
          <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#111827" }}>Critères validés — à vous de jouer</p>
          <p style={{ margin: 0, fontSize: 13 }}>Depuis le bandeau ci-dessus : <strong>Matcher le vivier</strong>, <strong>Importer des CVs</strong> ou <strong>Assigner</strong> un candidat.</p>
        </div>
      ) : (
        <>
          {/* Récap rapide */}
          <div style={{ marginBottom: 12, fontSize: 13, color: "#6B7280" }}>
            <strong style={{ color: "#111827" }}>{strongCount}</strong> candidat{strongCount > 1 ? "s" : ""} pertinent{strongCount > 1 ? "s" : ""}
            <span style={{ color: "#9CA3AF" }}> · {rows.length} au total</span>
          </div>

          {criteriaStale && !matching && (
            <div style={{
              marginBottom: 12, padding: "10px 14px",
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              background: "rgba(217,119,6,0.06)", border: "1px solid rgba(217,119,6,0.25)",
              borderRadius: 11, fontSize: 12.5, color: "#374151",
            }}>
              <span style={{ flex: 1, minWidth: 200 }}>
                <strong style={{ color: "#B45309" }}>Critères modifiés</strong> depuis le dernier matching — les scores affichés datent de l&apos;évaluation précédente.
              </span>
              <button onClick={() => void runMatch()} style={{
                fontSize: 12, fontWeight: 700, color: "white",
                padding: "7px 14px", borderRadius: 9, border: "none",
                background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
              }}>
                Relancer le matching
              </button>
            </div>
          )}

          <SourceTabs active={activeTab} counts={tabCounts} onChange={setActiveTab} />

          {mainCriteria.length > 0 && (
            <DynamicCriteriaFilters
              criteria={mainCriteria}
              active={activeCritFilters}
              onToggle={(id) => setActiveCritFilters((prev) => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id); else next.add(id)
                return next
              })}
              onClear={() => setActiveCritFilters(new Set())}
            />
          )}

          {filteredRows.length === 0 ? (
            <div style={{
              padding: "32px 20px", textAlign: "center",
              background: "white", border: "1px dashed #E2DAF6", borderRadius: 14,
              color: "#6B7280", fontSize: 13,
            }}>
              {activeCritFilters.size > 0
                ? "Aucun candidat ne passe les filtres actifs."
                : tabCounts[activeTab] === 0
                  ? activeTab === "applied"
                    ? "Le formulaire de candidature public n'est pas encore activé."
                    : "Aucun candidat dans cette catégorie."
                  : "Aucun candidat à afficher."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filteredRows.map((r) => (
                <MatchCard
                  key={r.id}
                  row={r}
                  mainCriteria={mainCriteria}
                  onTogglePipeline={togglePipeline}
                />
              ))}
            </div>
          )}
        </>
      )}

      {assignOpen && (
        <AssignModal
          jobId={job.id}
          existingCandidateIds={new Set(rows.map((r) => r.candidate?.id).filter((x): x is string => !!x))}
          onClose={() => setAssignOpen(false)}
          onAssigned={() => { setAssignOpen(false); loadAll() }}
        />
      )}

      {uploadOpen && (
        <MissionCvUploadModal
          jobId={job.id}
          jobLabel={job.role_name?.trim() || job.title}
          onClose={() => setUploadOpen(false)}
          onAnyScored={() => { loadAll() }}
        />
      )}

      <AnimatePresence>
        {showEdit && (
          <JobForm
            initialJob={job}
            onClose={() => setShowEdit(false)}
            onCreated={async (updated) => {
              setJob(updated)
              setShowEdit(false)
              // Re-onboarding critères pertinent si description / skills ont changé.
              setEditCriteriaMode(true)
            }}
          />
        )}
      </AnimatePresence>
    </main>
  )
}

/* ─── Onglets par source ─────────────────────────────────────────── */

function SourceTabs({
  active, counts, onChange,
}: {
  active: SourceTab
  counts: Record<SourceTab, number>
  onChange: (t: SourceTab) => void
}) {
  const tabs: Array<{ key: SourceTab; label: string; hint?: string }> = [
    { key: "all",      label: "Tous" },
    { key: "applied",  label: "Ont postulé", hint: "Via le formulaire public (bientôt)" },
    { key: "uploaded", label: "Vos importations" },
    { key: "vivier",   label: "Depuis le vivier" },
  ]
  return (
    <div style={{
      display: "flex", gap: 4, flexWrap: "wrap",
      marginBottom: 10, padding: 4,
      background: "#F8F6FF", border: "1px solid #F0ECF8",
      borderRadius: 12,
    }}>
      {tabs.map((t) => {
        const isActive = active === t.key
        const n = counts[t.key]
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            title={t.hint}
            style={{
              flex: "1 1 auto", minWidth: 120,
              padding: "8px 12px", borderRadius: 9,
              fontSize: 12.5, fontWeight: 700,
              fontFamily: "inherit", cursor: "pointer", border: "none",
              background: isActive ? "white" : "transparent",
              color: isActive ? "#111827" : "#6B7280",
              boxShadow: isActive ? "0 1px 4px rgba(17,24,39,0.06)" : "none",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              transition: "all 120ms",
            }}
          >
            {t.label}
            <span style={{
              fontSize: 10.5, fontWeight: 800,
              color: isActive ? "#7C63C8" : "#9CA3AF",
              background: isActive ? "rgba(124,99,200,0.08)" : "transparent",
              border: `1px solid ${isActive ? "rgba(124,99,200,0.18)" : "transparent"}`,
              padding: "1px 7px", borderRadius: 99,
              fontVariantNumeric: "tabular-nums",
            }}>{n}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ─── Filtres dynamiques par critère main ────────────────────────── */

function DynamicCriteriaFilters({
  criteria, active, onToggle, onClear,
}: {
  criteria: Criterion[]
  active: Set<string>
  onToggle: (id: string) => void
  onClear: () => void
}) {
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6,
      marginBottom: 12,
    }}>
      <span style={{ fontSize: 11, color: "#9CA3AF", marginRight: 4 }}>
        Filtrer sur :
      </span>
      {criteria.map((c) => {
        const on = active.has(c.id)
        const isQuant = kindOf(c.type) === "quantitative"
        const hint = isQuant ? "(≥ 70)" : "(oui)"
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onToggle(c.id)}
            style={{
              fontSize: 11.5, fontWeight: 700,
              padding: "5px 11px", borderRadius: 99,
              border: on ? "1px solid rgba(34,197,94,0.35)" : "1px solid #E5E7EB",
              background: on ? "rgba(34,197,94,0.10)" : "white",
              color: on ? "#15803D" : "#374151",
              cursor: "pointer", fontFamily: "inherit",
              transition: "all 120ms",
            }}
          >
            {on ? "✓ " : ""}{shortCriterionName(c)}
            <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>{hint}</span>
          </button>
        )
      })}
      {active.size > 0 && (
        <button
          type="button"
          onClick={onClear}
          style={{
            fontSize: 11.5, fontWeight: 600,
            color: "#7C63C8", background: "transparent", border: "none",
            cursor: "pointer", fontFamily: "inherit", padding: "5px 8px",
          }}
        >
          Réinitialiser
        </button>
      )}
    </div>
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
  useEscapeKey(onClose)
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
            autoFocus type="search"
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
                  borderRadius: 8, padding: "4px 10px", flexShrink: 0,
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

/* ─── Matching progress ──────────────────────────────────────────── */

function MatchingProgress({
  total, scored, partialCount, startedAt, onForceRetry,
}: {
  total: number | null
  scored: number | null
  partialCount: number
  startedAt: string
  onForceRetry: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 800)
    return () => clearInterval(t)
  }, [])
  const elapsedMs = Math.max(0, now - new Date(startedAt).getTime())
  const elapsedSec = Math.round(elapsedMs / 1000)
  const safeTotal = total && total > 0 ? total : null
  const safeScored = Math.max(0, Math.min(scored ?? 0, safeTotal ?? Number.MAX_SAFE_INTEGER))
  const hasReal = safeTotal != null && safeScored >= 0
  const pct = hasReal && safeTotal ? Math.round((safeScored / safeTotal) * 100) : 0
  const stalling = elapsedMs > 60_000
  const canForceRetry = elapsedMs > 75_000

  const label =
    !hasReal ? "Préfiltrage du vivier…"
    : safeScored === 0 ? "Nora va scorer le pool…"
    : safeScored >= safeTotal! ? "Finalisation du classement…"
    : canForceRetry ? "Le matching a probablement été interrompu. Relancez."
    : stalling ? "Plus long que d'habitude, encore quelques secondes."
    : `Nora score ${safeScored}/${safeTotal} profils…`

  return (
    <div style={{
      background: "linear-gradient(120deg, rgba(124,99,200,0.06) 0%, rgba(124,99,200,0.02) 100%)",
      border: "1px solid rgba(124,99,200,0.22)",
      borderRadius: 12, padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{
          display: "inline-block", width: 16, height: 16, borderRadius: "50%",
          border: "2px solid rgba(124,99,200,0.25)", borderTopColor: "#7C63C8",
          animation: "matching-spin 0.9s linear infinite",
        }} />
        <span style={{ fontSize: 13.5, fontWeight: 800, color: "#7C63C8" }}>Matching en cours</span>
        {partialCount > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: "#7C63C8",
            background: "white", border: "1px solid rgba(124,99,200,0.22)",
            borderRadius: 100, padding: "1px 8px",
          }}>{partialCount} déjà remonté{partialCount > 1 ? "s" : ""}</span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "#9CA3AF", fontVariantNumeric: "tabular-nums" }}>
          {Math.round(pct)}% · {elapsedSec}s
        </span>
      </div>
      <div style={{
        position: "relative", height: 6, width: "100%",
        background: "rgba(124,99,200,0.12)", borderRadius: 100, overflow: "hidden",
      }}>
        {!hasReal ? (
          <div style={{
            position: "absolute", top: 0, bottom: 0, width: "40%",
            borderRadius: 100,
            background: "linear-gradient(90deg, rgba(124,99,200,0) 0%, #7C63C8 50%, rgba(124,99,200,0) 100%)",
            animation: "matching-indeterminate 1.6s ease-in-out infinite",
          }} />
        ) : (
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`,
            background: stalling
              ? "linear-gradient(90deg, #C4B6E0 0%, #B8AEDE 100%)"
              : "linear-gradient(90deg, #7C63C8 0%, #B8AEDE 100%)",
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
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, color: "#6B7280", flex: 1, minWidth: 200 }}>{label}</span>
        {canForceRetry && (
          <button onClick={onForceRetry} style={{
            fontSize: 11.5, fontWeight: 700, color: "#7C63C8",
            background: "white", border: "1px solid rgba(124,99,200,0.3)",
            borderRadius: 8, padding: "6px 11px", cursor: "pointer", fontFamily: "inherit",
          }}>
            Forcer la relance
          </button>
        )}
      </div>
      <style>{`
        @keyframes matching-spin { to { transform: rotate(360deg); } }
        @keyframes matching-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        @keyframes matching-indeterminate { 0% { left: -40%; } 100% { left: 100%; } }
      `}</style>
    </div>
  )
}

