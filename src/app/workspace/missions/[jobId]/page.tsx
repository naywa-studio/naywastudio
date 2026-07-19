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
import { DetailSkeleton } from "@/components/workspace/PageSkeletons"
import { useEscapeKey } from "@/components/ui/useEscapeKey"
import { MissionCvUploadModal } from "@/components/workspace/MissionCvUploadModal"
import { CriteriaOnboarding } from "@/components/workspace/CriteriaOnboarding"
import { MissionSummaryBar } from "@/components/workspace/MissionSummaryBar"
import { MissionBriefSection } from "@/components/workspace/MissionBriefSection"
import { MatchVivierPanel } from "@/components/workspace/MatchVivierPanel"
import type { MatchMode } from "@/lib/sector-gate"
import { sectorColors } from "@/lib/sector-color"
import { sectorDisplayName } from "@/lib/sector-i18n"
import { useLanguage, type Lang } from "@/lib/i18n/LanguageContext"

const MATCH_MODE_LABEL: Record<Lang, Record<MatchMode, string>> = {
  fr: {
    intelligent: "Intelligent",
    personnalise: "Personnalisé",
    complet: "Complet",
  },
  en: {
    intelligent: "Smart",
    personnalise: "Custom",
    complet: "Full",
  },
}
import { MatchCard } from "@/components/workspace/MatchCard"
import { JobForm } from "../page"
import { useWorkspace } from "../../layout"

const copy = {
  fr: {
    confirmDelete: "Supprimer cette mission ? Les matchs associés seront perdus.",
    matchingFailed: "Le matching a échoué.",
    loadingMission: "Chargement de la mission",
    notFound: "Mission introuvable.",
    backToMissions: "← Retour aux missions",
    editMission: "Modifier la mission",
    delete: "Supprimer",
    oldAssessment: "Ancienne évaluation.",
    legacyBanner: (n: number) => `Configurez les critères de matching pour une analyse enrichie — la position pipeline de vos ${n} candidat${n > 1 ? "s" : ""} sera conservée.`,
    configureCriteria: "Configurer les critères",
    canaryBanner: (n: number) => `${n} profil${n > 1 ? "s" : ""} hors périmètre ${n > 1 ? "sont ressortis" : "est ressorti"} pertinent${n > 1 ? "s" : ""}. Élargissez peut-être la recherche.`,
    broaden: "Élargir",
    criteriaValidated: "Critères validés — à vous de jouer",
    fromBarAbove: (
      <>Depuis le bandeau ci-dessus : <strong>Matcher le vivier</strong>, <strong>Importer des CVs</strong> ou <strong>Assigner</strong> un candidat.</>
    ),
    relevantRecap: (n: number) => `${n} candidat${n > 1 ? "s" : ""} pertinent${n > 1 ? "s" : ""}`,
    totalRecap: (n: number) => ` · ${n} au total`,
    lastMatching: "Dernier matching : ",
    modePrefix: " · mode ",
    sectorsPrefix: " · secteurs : ",
    criteriaChanged: "Critères modifiés",
    criteriaChangedRest: " depuis le dernier matching — les scores affichés datent de l'évaluation précédente.",
    rerunMatching: "Relancer le matching",
    noCandidatesFiltered: "Aucun candidat ne passe les filtres actifs.",
    formNotActive: "Le formulaire de candidature public n'est pas encore activé.",
    noCandidatesCategory: "Aucun candidat dans cette catégorie.",
    noCandidatesToShow: "Aucun candidat à afficher.",
    noRelevantProfiles: "Aucun profil pertinent sur ce vivier pour cette mission. Les profils ci-dessous sont à faible affinité.",
    weakToggle: (show: boolean, n: number) => `${show ? "▲ Masquer" : "▼ Voir"} les ${n} profil${n > 1 ? "s" : ""} à faible affinité`,
    tabAll: "Tous",
    tabApplied: "Ont postulé",
    tabAppliedHint: "Via le formulaire public",
    tabUploaded: "Vos importations",
    tabVivier: "Depuis le vivier",
    filterBy: "Filtrer sur :",
    yesHint: "(oui)",
    reset: "Réinitialiser",
    assignmentFailed: "L'assignation a échoué.",
    networkError: "Erreur réseau.",
    assignManually: "Assigner manuellement",
    chooseCandidate: "Choisir un candidat",
    searchPlaceholder: "Chercher par nom, poste, entreprise…",
    noCandidateMatches: "Aucun candidat ne correspond.",
    allAlreadyMatched: "Tous les candidats du vivier sont déjà matchés.",
    noName: "Sans nom",
    assign: "Assigner",
    close: "Fermer",
    prefiltering: "Préfiltrage du vivier…",
    aboutToScore: "Nora va scorer le pool…",
    finalizing: "Finalisation du classement…",
    probablyInterrupted: "Le matching a probablement été interrompu. Relancez.",
    slowerThanUsual: "Plus long que d'habitude, encore quelques secondes.",
    scoringProfiles: (scored: number, total: number) => `Nora score ${scored}/${total} profils…`,
    matchingInProgress: "Matching en cours",
    alreadySurfaced: (n: number) => `${n} déjà remonté${n > 1 ? "s" : ""}`,
    forceRetry: "Forcer la relance",
  },
  en: {
    confirmDelete: "Delete this mission? The associated matches will be lost.",
    matchingFailed: "Matching failed.",
    loadingMission: "Loading mission",
    notFound: "Mission not found.",
    backToMissions: "← Back to missions",
    editMission: "Edit mission",
    delete: "Delete",
    oldAssessment: "Old assessment.",
    legacyBanner: (n: number) => `Configure the matching criteria for a richer analysis — the pipeline position of your ${n} candidate${n > 1 ? "s" : ""} will be preserved.`,
    configureCriteria: "Configure the criteria",
    canaryBanner: (n: number) => `${n} out-of-scope profile${n > 1 ? "s" : ""} came back relevant. You might want to broaden the search.`,
    broaden: "Broaden",
    criteriaValidated: "Criteria validated — your move",
    fromBarAbove: (
      <>From the bar above: <strong>Match the talent pool</strong>, <strong>Import CVs</strong>, or <strong>Assign</strong> a candidate.</>
    ),
    relevantRecap: (n: number) => `${n} relevant candidate${n > 1 ? "s" : ""}`,
    totalRecap: (n: number) => ` · ${n} total`,
    lastMatching: "Last matching: ",
    modePrefix: " · mode ",
    sectorsPrefix: " · sectors: ",
    criteriaChanged: "Criteria changed",
    criteriaChangedRest: " since the last matching — the scores shown are from the previous assessment.",
    rerunMatching: "Re-run matching",
    noCandidatesFiltered: "No candidate passes the active filters.",
    formNotActive: "The public application form isn't activated yet.",
    noCandidatesCategory: "No candidate in this category.",
    noCandidatesToShow: "No candidate to display.",
    noRelevantProfiles: "No relevant profile in this talent pool for this mission. The profiles below have low affinity.",
    weakToggle: (show: boolean, n: number) => `${show ? "▲ Hide" : "▼ Show"} the ${n} low-affinity profile${n > 1 ? "s" : ""}`,
    tabAll: "All",
    tabApplied: "Applied",
    tabAppliedHint: "Via the public form",
    tabUploaded: "Your imports",
    tabVivier: "From the talent pool",
    filterBy: "Filter by:",
    yesHint: "(yes)",
    reset: "Reset",
    assignmentFailed: "Assignment failed.",
    networkError: "Network error.",
    assignManually: "Assign manually",
    chooseCandidate: "Choose a candidate",
    searchPlaceholder: "Search by name, role, company…",
    noCandidateMatches: "No candidate matches.",
    allAlreadyMatched: "All talent pool candidates are already matched.",
    noName: "No name",
    assign: "Assign",
    close: "Close",
    prefiltering: "Pre-filtering the talent pool…",
    aboutToScore: "Nora is about to score the pool…",
    finalizing: "Finalizing the ranking…",
    probablyInterrupted: "Matching was probably interrupted. Try again.",
    slowerThanUsual: "Taking longer than usual, a few more seconds.",
    scoringProfiles: (scored: number, total: number) => `Nora is scoring ${scored}/${total} profiles…`,
    matchingInProgress: "Matching in progress",
    alreadySurfaced: (n: number) => `${n} already surfaced`,
    forceRetry: "Force retry",
  },
}

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
  const { lang } = useLanguage()
  const t = copy[lang]
  const { jobId } = useParams<{ jobId: string }>()
  const sb = useMemo(() => getSupabase(), [])
  // Lecture seule (lockdown / accès suspendu) : toute mutation est bloquée côté
  // serveur (requireActiveAccess). On grise l'UI pour éviter les 403 déroutants.
  const { isReadOnly } = useWorkspace()

  const [job, setJob] = useState<Job | null>(null)
  const [rows, setRows] = useState<AssessmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [matchPanelOpen, setMatchPanelOpen] = useState(false)
  /** Canary : nb de profils hors périmètre ressortis bons au dernier run. */
  const [canaryHits, setCanaryHits] = useState(0)
  const [showEdit, setShowEdit] = useState(false)
  /** Force le wizard à s'afficher (édition manuelle des critères). */
  const [editCriteriaMode, setEditCriteriaMode] = useState(false)
  const [activeTab, setActiveTab] = useState<SourceTab>("all")
  /** Filtres actifs : Set des critère IDs sur lesquels exiger un "fort match". */
  const [activeCritFilters, setActiveCritFilters] = useState<Set<string>>(new Set())
  /** Déplie les profils à faible affinité (tier "poor", score < 35), masqués
   *  par défaut : le matching score tout le vivier pour ne rien rater, mais on
   *  ne remonte que les profils pertinents. */
  const [showWeak, setShowWeak] = useState(false)

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

  const runMatch = useCallback(async (opts?: { force?: boolean; mode?: MatchMode; sectors?: string[] }) => {
    if (!job || isReadOnly) return
    setMatchError(null)
    setCanaryHits(0)
    setJob({ ...job, match_status: "matching", updated_at: new Date().toISOString() })
    const qs = opts?.force ? "?force=1" : ""
    const res = await fetch(`/api/jobs/${job.id}/match${qs}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(opts?.mode ? { mode: opts.mode, target_sectors: opts.sectors ?? [] } : {}),
        lang,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 409) { setMatchError(null); return }
      setMatchError(data?.message ?? data?.detail ?? data?.error ?? t.matchingFailed)
      setJob((prev) => prev ? { ...prev, match_status: "error" } : prev)
      return
    }
    if (typeof data?.canary_hits === "number" && data.canary_hits > 0) {
      setCanaryHits(data.canary_hits)
    }
    await loadAll()
  }, [job, loadAll, t, lang, isReadOnly])

  const handleDelete = async () => {
    if (!job) return
    if (!confirm(t.confirmDelete)) return
    const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" })
    if (res.ok) router.push("/workspace/missions")
  }

  const togglePipeline = async (rowId: string, next: boolean) => {
    if (isReadOnly) return
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

  if (loading) return <DetailSkeleton label={t.loadingMission} />
  if (notFound || !job) {
    return (
      <div style={{ padding: "60px 24px", textAlign: "center", color: "var(--nw-text-muted)" }}>
        <p style={{ fontSize: 16, fontWeight: 600 }}>{t.notFound}</p>
        <Link href="/workspace/missions" style={{ color: "var(--nw-primary)", textDecoration: "none", fontSize: 14 }}>
          {t.backToMissions}
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
  // Onboarding forcé UNIQUEMENT sur une mission vierge (aucun match). Une
  // mission "legacy" (créée avant PR-Z : pas de critères mais des matchs déjà
  // présents, éventuellement en pipeline) ne doit PAS voir ses matchs masqués
  // derrière le wizard. On affiche ses matchs + une bannière non destructive
  // qui propose de configurer les critères (ré-évaluation = upsert, la
  // position pipeline est préservée).
  const needsOnboarding = !job.criteria_locked_at && rows.length === 0
  const legacyNoCriteria = !job.criteria_locked_at && rows.length > 0
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

  // Séparation pertinents / faible affinité. Les non-scorés (assignés
  // manuellement, score null) sont toujours pertinents (choix explicite du
  // sourceur). Seuil "poor" = score < 35 → masqués derrière un dépliable.
  const WEAK_BELOW = 35
  const relevantRows = filteredRows.filter((r) => r.score == null || r.score >= WEAK_BELOW)
  const weakRows = filteredRows.filter((r) => r.score != null && r.score < WEAK_BELOW)

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
          fontSize: 13, color: "var(--nw-primary)", textDecoration: "none",
        }}>{t.backToMissions}</Link>
        {/* Actions de mutation masquées en lecture seule (consultation only). */}
        {!isReadOnly && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowEdit(true)} title={t.editMission} style={{
              fontSize: 12, fontWeight: 600, color: "var(--nw-primary)",
              background: "white", border: "1px solid rgba(124,99,200,0.30)",
              borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontFamily: "inherit",
            }}>{t.editMission}</button>
            <button onClick={handleDelete} title={t.delete} style={{
              fontSize: 12, fontWeight: 600, color: "var(--nw-danger-strong)",
              background: "transparent", border: "1px solid #FCA5A5",
              borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontFamily: "inherit",
            }}>{t.delete}</button>
          </div>
        )}
      </div>

      {/* Bandeau résumé (visible une fois critères configurés). */}
      {!showWizard && (
        <MissionSummaryBar
          job={job}
          criteria={criteria}
          onEditCriteria={() => setEditCriteriaMode(true)}
          onImportCvs={() => setUploadOpen(true)}
          onMatchVivier={() => setMatchPanelOpen(true)}
          onAssignFromVivier={() => setAssignOpen(true)}
          onCreateForm={undefined}
          matching={matching}
          readOnly={isReadOnly}
        />
      )}

      {/* Brief de la mission — brief original + brief client (appel d'offre). */}
      {!showWizard && (
        <MissionBriefSection
          job={job}
          onSaved={(patch) => setJob((prev) => prev ? { ...prev, ...patch } : prev)}
        />
      )}

      {/* Mission "legacy" (créée avant les critères flexibles) : matchs
          présents mais aucun critère. On ne masque rien — bannière opt-in. */}
      {legacyNoCriteria && !matching && (
        <div style={{
          marginBottom: 16, padding: "12px 16px",
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          background: "rgba(124,99,200,0.05)", border: "1px solid rgba(124,99,200,0.22)",
          borderRadius: 12, fontSize: 13, color: "var(--nw-text-body)",
        }}>
          <span style={{ flex: 1, minWidth: 220 }}>
            <strong style={{ color: "var(--nw-text)" }}>{t.oldAssessment}</strong> {t.legacyBanner(rows.length)}
          </span>
          <button onClick={() => setEditCriteriaMode(true)} disabled={isReadOnly} title={isReadOnly ? "Lecture seule" : undefined} style={{
            fontSize: 12.5, fontWeight: 700, color: "white", fontFamily: "inherit",
            background: isReadOnly ? "var(--nw-primary-200)" : "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
            border: "none", borderRadius: 9, padding: "8px 14px", cursor: isReadOnly ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}>{t.configureCriteria}</button>
        </div>
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
          background: "#FEF2F2", border: "1px solid var(--nw-danger-border)",
          borderRadius: 10, fontSize: 13, color: "var(--nw-danger-strong)",
        }}>{matchError}</div>
      )}
      {canaryHits > 0 && !matching && (
        <div style={{
          marginBottom: 16, padding: "11px 15px",
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          background: "rgba(217,119,6,0.06)", border: "1px solid rgba(217,119,6,0.28)",
          borderRadius: 11, fontSize: 12.5, color: "var(--nw-text-body)",
        }}>
          <span style={{ flex: 1, minWidth: 220 }}>
            {t.canaryBanner(canaryHits)}
          </span>
          <button onClick={() => { setCanaryHits(0); setMatchPanelOpen(true) }} disabled={isReadOnly} title={isReadOnly ? "Lecture seule" : undefined} style={{
            fontSize: 12, fontWeight: 700, color: isReadOnly ? "#B8AEDE" : "var(--nw-warn)",
            background: isReadOnly ? "#F3F0FA" : "white", border: isReadOnly ? "1px solid #E5E0F0" : "1px solid rgba(217,119,6,0.35)",
            borderRadius: 8, padding: "6px 12px", cursor: isReadOnly ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          }}>
            {t.broaden}
          </button>
        </div>
      )}

      {/* Wizard onboarding OU contenu principal */}
      {showWizard ? (
        <CriteriaOnboarding
          jobId={job.id}
          initialCriteria={editCriteriaMode && criteria.length > 0 ? criteria : null}
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
          background: "white", border: "1px dashed var(--nw-primary-100)", borderRadius: 16,
          color: "var(--nw-text-muted)",
        }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--nw-primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", margin: "0 auto 12px" }} aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="4.5" />
            <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
          </svg>
          <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "var(--nw-text)" }}>{t.criteriaValidated}</p>
          <p style={{ margin: 0, fontSize: 13 }}>{t.fromBarAbove}</p>
        </div>
      ) : (
        <>
          {/* Récap rapide */}
          <div style={{ marginBottom: 8, fontSize: 13, color: "var(--nw-text-muted)" }}>
            <strong style={{ color: "var(--nw-text)" }}>{strongCount}</strong> {t.relevantRecap(strongCount)}
            <span style={{ color: "var(--nw-text-muted)" }}>{t.totalRecap(rows.length)}</span>
          </div>

          {/* Rappel du dernier matching : date + mode + secteurs ciblés. */}
          {job.matched_at && !matching && (
            <div style={{
              marginBottom: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
              fontSize: 11.5, color: "var(--nw-text-muted)",
            }}>
              <span>
                {t.lastMatching}{new Date(job.matched_at).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "short", year: "numeric" })}
                {job.last_match_mode && <>{t.modePrefix}{MATCH_MODE_LABEL[lang][job.last_match_mode] ?? job.last_match_mode}</>}
              </span>
              {job.last_match_mode !== "complet" && (job.target_sectors ?? []).length > 0 && (
                <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
                  {t.sectorsPrefix}
                  {(job.target_sectors ?? []).map((s) => (
                    <span key={s} style={{
                      fontSize: 10.5, fontWeight: 600,
                      color: sectorColors(s).text, background: sectorColors(s).bg,
                      border: `1px solid ${sectorColors(s).border}`,
                      borderRadius: 99, padding: "1px 7px",
                    }}>{sectorDisplayName(s, lang)}</span>
                  ))}
                </span>
              )}
            </div>
          )}

          {criteriaStale && !matching && (
            <div style={{
              marginBottom: 12, padding: "10px 14px",
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              background: "rgba(217,119,6,0.06)", border: "1px solid rgba(217,119,6,0.25)",
              borderRadius: 11, fontSize: 12.5, color: "var(--nw-text-body)",
            }}>
              <span style={{ flex: 1, minWidth: 200 }}>
                <strong style={{ color: "var(--nw-warn)" }}>{t.criteriaChanged}</strong>{t.criteriaChangedRest}
              </span>
              <button onClick={() => setMatchPanelOpen(true)} disabled={isReadOnly} title={isReadOnly ? "Lecture seule" : undefined} style={{
                fontSize: 12, fontWeight: 700, color: "white",
                padding: "7px 14px", borderRadius: 9, border: "none",
                background: isReadOnly ? "var(--nw-primary-200)" : "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
                cursor: isReadOnly ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
              }}>
                {t.rerunMatching}
              </button>
            </div>
          )}

          {/* Onglets + filtres collés en haut pendant le scroll de la liste
              (top: 60 = hauteur du header sticky). Fond opaque + blur pour
              que les cartes ne transparaissent pas dessous. */}
          <div style={{
            position: "sticky", top: 60, zIndex: 30,
            background: "rgba(248,246,255,0.92)",
            backdropFilter: "blur(10px)",
            margin: "0 -8px", padding: "8px 8px 2px",
            borderRadius: "0 0 12px 12px",
          }}>
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
          </div>

          {filteredRows.length === 0 ? (
            <div style={{
              padding: "32px 20px", textAlign: "center",
              background: "white", border: "1px dashed var(--nw-primary-100)", borderRadius: 14,
              color: "var(--nw-text-muted)", fontSize: 13,
            }}>
              {activeCritFilters.size > 0
                ? t.noCandidatesFiltered
                : tabCounts[activeTab] === 0
                  ? activeTab === "applied"
                    ? t.formNotActive
                    : t.noCandidatesCategory
                  : t.noCandidatesToShow}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {relevantRows.map((r) => (
                <MatchCard
                  key={r.id}
                  row={r}
                  mainCriteria={mainCriteria}
                  onTogglePipeline={togglePipeline}
                  readOnly={isReadOnly}
                />
              ))}

              {relevantRows.length === 0 && weakRows.length > 0 && (
                <div style={{
                  padding: "24px 20px", textAlign: "center",
                  background: "white", border: "1px dashed var(--nw-primary-100)", borderRadius: 14,
                  color: "var(--nw-text-muted)", fontSize: 13,
                }}>
                  {t.noRelevantProfiles}
                </div>
              )}

              {/* Profils à faible affinité (tier "poor") — masqués par défaut :
                  le matching a tout scoré mais on ne remonte que le pertinent. */}
              {weakRows.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <button
                    onClick={() => setShowWeak((v) => !v)}
                    style={{
                      width: "100%", padding: "10px 14px", borderRadius: 10,
                      background: "#FAFAFB", border: "1px solid var(--nw-border-soft)",
                      color: "var(--nw-text-muted)", fontSize: 12.5, fontWeight: 600,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    {t.weakToggle(showWeak, weakRows.length)}
                  </button>
                  {showWeak && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10, opacity: 0.75 }}>
                      {weakRows.map((r) => (
                        <MatchCard
                          key={r.id}
                          row={r}
                          mainCriteria={mainCriteria}
                          onTogglePipeline={togglePipeline}
                          readOnly={isReadOnly}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
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

      {matchPanelOpen && (
        <MatchVivierPanel
          job={job}
          onClose={() => setMatchPanelOpen(false)}
          onLaunch={(mode, sectors) => void runMatch({ mode, sectors })}
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
  const { lang } = useLanguage()
  const t = copy[lang]
  // "Ont postulé" (formulaire public E2, pas encore livré) : l'onglet ne
  // s'affiche que s'il existe au moins une candidature — un onglet "0" en
  // permanence fait produit inachevé. Réapparaîtra tout seul avec E2.
  const tabs: Array<{ key: SourceTab; label: string; hint?: string }> = [
    { key: "all",      label: t.tabAll },
    ...(counts.applied > 0
      ? [{ key: "applied" as const, label: t.tabApplied, hint: t.tabAppliedHint }]
      : []),
    { key: "uploaded", label: t.tabUploaded },
    { key: "vivier",   label: t.tabVivier },
  ]
  return (
    <div style={{
      display: "flex", gap: 4, flexWrap: "wrap",
      marginBottom: 10, padding: 4,
      background: "var(--nw-bg)", border: "1px solid var(--nw-border-soft)",
      borderRadius: 12,
    }}>
      {tabs.map((tab) => {
        const isActive = active === tab.key
        const n = counts[tab.key]
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            title={tab.hint}
            style={{
              flex: "1 1 auto", minWidth: 120,
              padding: "8px 12px", borderRadius: 9,
              fontSize: 12.5, fontWeight: 700,
              fontFamily: "inherit", cursor: "pointer", border: "none",
              background: isActive ? "white" : "transparent",
              color: isActive ? "var(--nw-text)" : "var(--nw-text-muted)",
              boxShadow: isActive ? "0 1px 4px rgba(17,24,39,0.06)" : "none",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              transition: "all 120ms",
            }}
          >
            {tab.label}
            <span style={{
              fontSize: 10.5, fontWeight: 800,
              color: isActive ? "var(--nw-primary)" : "var(--nw-text-muted)",
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
  const { lang } = useLanguage()
  const t = copy[lang]
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6,
      marginBottom: 12,
    }}>
      <span style={{ fontSize: 11, color: "var(--nw-text-muted)", marginRight: 4 }}>
        {t.filterBy}
      </span>
      {criteria.map((c) => {
        const on = active.has(c.id)
        const isQuant = kindOf(c.type) === "quantitative"
        const hint = isQuant ? "(≥ 70)" : t.yesHint
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onToggle(c.id)}
            style={{
              fontSize: 11.5, fontWeight: 700,
              padding: "5px 11px", borderRadius: 99,
              border: on ? "1px solid rgba(124,99,200,0.35)" : "1px solid var(--nw-border)",
              background: on ? "rgba(124,99,200,0.10)" : "white",
              color: on ? "var(--nw-primary-dark)" : "var(--nw-text-body)",
              cursor: "pointer", fontFamily: "inherit",
              transition: "all 120ms",
            }}
          >
            {on ? "✓ " : ""}{shortCriterionName(c, lang)}
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
            color: "var(--nw-primary)", background: "transparent", border: "none",
            cursor: "pointer", fontFamily: "inherit", padding: "5px 8px",
          }}
        >
          {t.reset}
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
  const { lang } = useLanguage()
  const t = copy[lang]
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
        setErr(data?.detail ?? data?.error ?? t.assignmentFailed)
        setAssigning(null)
        return
      }
      onAssigned()
    } catch (e) {
      setErr((e as Error).message ?? t.networkError)
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
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--nw-border-soft)" }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "var(--nw-text-muted)", letterSpacing: "0.08em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase" }}>
            {t.assignManually}
          </p>
          <h3 style={{ margin: "4px 0 10px", fontSize: 17, fontWeight: 800, color: "var(--nw-text)" }}>
            {t.chooseCandidate}
          </h3>
          <input
            autoFocus type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            style={{
              width: "100%", boxSizing: "border-box",
              fontSize: 13.5, color: "var(--nw-text)", padding: "10px 12px",
              background: "var(--nw-surface-muted)", border: "1px solid var(--nw-border)", borderRadius: 10,
              outline: "none", fontFamily: "inherit",
            }}
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
          {loadingList ? (
            <div style={{ padding: 20 }}><NoraLoader inline /></div>
          ) : filtered.length === 0 ? (
            <p style={{ padding: 20, fontSize: 13, color: "var(--nw-text-muted)", textAlign: "center" }}>
              {query ? t.noCandidateMatches : t.allAlreadyMatched}
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
                onMouseEnter={(e) => { if (!assigning) e.currentTarget.style.background = "var(--nw-bg)" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "var(--nw-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.full_name ?? c.cv_file_name ?? t.noName}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--nw-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.current_title ?? "—"}
                    {c.current_company ? ` · ${c.current_company}` : ""}
                    {c.location ? ` · ${c.location}` : ""}
                  </p>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: "var(--nw-primary)",
                  background: "rgba(124,99,200,0.08)",
                  border: "1px solid rgba(124,99,200,0.18)",
                  borderRadius: 8, padding: "4px 10px", flexShrink: 0,
                }}>
                  {assigning === c.id ? "…" : t.assign}
                </span>
              </button>
            ))
          )}
        </div>
        {err && (
          <div style={{ padding: "10px 16px", fontSize: 12.5, color: "var(--nw-danger-strong)", background: "#FEF2F2", borderTop: "1px solid var(--nw-danger-border)" }}>
            {err}
          </div>
        )}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--nw-border-soft)", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            fontSize: 12.5, fontWeight: 700, color: "var(--nw-text-muted)",
            background: "white", border: "1px solid var(--nw-border)",
            borderRadius: 9, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit",
          }}>
            {t.close}
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
  const { lang } = useLanguage()
  const t = copy[lang]
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
    !hasReal ? t.prefiltering
    : safeScored === 0 ? t.aboutToScore
    : safeScored >= safeTotal! ? t.finalizing
    : canForceRetry ? t.probablyInterrupted
    : stalling ? t.slowerThanUsual
    : t.scoringProfiles(safeScored, safeTotal!)

  return (
    <div style={{
      background: "linear-gradient(120deg, rgba(124,99,200,0.06) 0%, rgba(124,99,200,0.02) 100%)",
      border: "1px solid rgba(124,99,200,0.22)",
      borderRadius: 12, padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{
          display: "inline-block", width: 16, height: 16, borderRadius: "50%",
          border: "2px solid rgba(124,99,200,0.25)", borderTopColor: "var(--nw-primary)",
          animation: "matching-spin 0.9s linear infinite",
        }} />
        <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--nw-primary)" }}>{t.matchingInProgress}</span>
        {partialCount > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: "var(--nw-primary)",
            background: "white", border: "1px solid rgba(124,99,200,0.22)",
            borderRadius: 100, padding: "1px 8px",
          }}>{t.alreadySurfaced(partialCount)}</span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--nw-text-muted)", fontVariantNumeric: "tabular-nums" }}>
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
            background: "linear-gradient(90deg, rgba(124,99,200,0) 0%, var(--nw-primary) 50%, rgba(124,99,200,0) 100%)",
            animation: "matching-indeterminate 1.6s ease-in-out infinite",
          }} />
        ) : (
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`,
            background: stalling
              ? "linear-gradient(90deg, var(--nw-primary-200) 0%, #B8AEDE 100%)"
              : "linear-gradient(90deg, var(--nw-primary) 0%, #B8AEDE 100%)",
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
        <span style={{ fontSize: 12.5, color: "var(--nw-text-muted)", flex: 1, minWidth: 200 }}>{label}</span>
        {canForceRetry && (
          <button onClick={onForceRetry} style={{
            fontSize: 11.5, fontWeight: 700, color: "var(--nw-primary)",
            background: "white", border: "1px solid rgba(124,99,200,0.3)",
            borderRadius: 8, padding: "6px 11px", cursor: "pointer", fontFamily: "inherit",
          }}>
            {t.forceRetry}
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

