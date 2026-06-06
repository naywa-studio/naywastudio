"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { m, AnimatePresence } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import type { Candidate, Job } from "@/lib/database.types"
import NoraLoader from "@/components/workspace/NoraLoader"
import { seniorityIntervalLabel } from "@/lib/seniority"
import { candidateClusters, clusterHue, hsl } from "@/lib/vivier-clusters"
import { rejectReasonLabel, type RejectReason } from "@/lib/reject-reasons"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

/** Pour chaque mission : couleurs dérivées de ses candidats matchés.
 *  - clusterBars : 1 ou 2 hues dominantes pour la bande verticale gauche.
 *  - top1Label / count : pour le badge contextuel sous le titre. */
interface MissionVisual {
  hues: number[]            // 0..2 éléments
  top1Label: string | null
  totalMatches: number
}

/** Stats sourcing affichées dans la sidebar (top motifs d'écart + activité
 *  réelle dont on a la donnée). Les mails ne sont pas encore intégrés. */
interface SidebarStatsData {
  topRejectReasons: Array<{ reason: RejectReason; count: number }>
  totalCandidatsMatches: number
  totalInPipeline: number
  totalRecruited: number
}

const MONTH_START_ISO = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - 30)
  return d.toISOString()
})()

export default function MissionsPage() {
  const sb = useMemo(() => getSupabase(), [])
  const [jobs, setJobs] = useState<Job[]>([])
  const [visuals, setVisuals] = useState<Record<string, MissionVisual>>({})
  const [stats, setStats] = useState<SidebarStatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [query, setQuery] = useState("")

  useEffect(() => {
    let mounted = true
    let channel: ReturnType<typeof sb.channel> | null = null
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user || !mounted) return

      // 1) Missions
      const { data: jobsData } = await sb
        .from("jobs").select("*").order("created_at", { ascending: false })
      if (!mounted) return
      const jobsRows = (jobsData ?? []) as Job[]
      setJobs(jobsRows)

      // 2) Matches scorés (score ≥ 50) → couleurs cluster par mission.
      //    On récupère uniquement ce dont a besoin (cluster + taxonomy).
      const { data: matchRows } = await sb
        .from("match_assessments")
        .select("job_id, candidate:candidates(id, cluster_assignments, taxonomy, parse_status, tags)")
        .gte("score", 50)
      if (!mounted) return
      const byJob = new Map<string, Array<Candidate>>()
      for (const r of (matchRows ?? []) as unknown as Array<{ job_id: string; candidate: Candidate | null }>) {
        const cand = r.candidate
        if (!cand || cand.parse_status !== "parsed") continue
        if (cand.tags?.includes("ancien")) continue
        const arr = byJob.get(r.job_id) ?? []
        arr.push(cand); byJob.set(r.job_id, arr)
      }
      const vMap: Record<string, MissionVisual> = {}
      for (const [jobId, cands] of byJob) {
        vMap[jobId] = computeMissionVisual(cands)
      }
      setVisuals(vMap)

      // 3) Stats sourcing : top motifs d'écart (30j) + compteurs pipeline.
      //    Pas de mails ici tant que l'intégration mail n'est pas en place.
      const { data: maRows } = await sb
        .from("match_assessments")
        .select("in_pipeline, pipeline_stage, reject_reason, updated_at")
      if (!mounted) return
      const reasonCount = new Map<RejectReason, number>()
      let inPipeline = 0
      let recruited = 0
      let totalMatches = 0
      for (const r of (maRows ?? []) as Array<{
        in_pipeline: boolean | null
        pipeline_stage: string | null
        reject_reason: RejectReason | null
        updated_at: string | null
      }>) {
        totalMatches++
        if (r.in_pipeline) inPipeline++
        if (r.pipeline_stage === "hired") recruited++
        if (r.reject_reason && r.updated_at && r.updated_at >= MONTH_START_ISO) {
          reasonCount.set(r.reject_reason, (reasonCount.get(r.reject_reason) ?? 0) + 1)
        }
      }
      const topRejectReasons = Array.from(reasonCount, ([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
      setStats({
        topRejectReasons,
        totalCandidatsMatches: totalMatches,
        totalInPipeline: inPipeline,
        totalRecruited: recruited,
      })

      setLoading(false)

      channel = sb
        .channel(`jobs:${user.id}`)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "jobs", filter: `user_id=eq.${user.id}` },
          (payload) => {
            setJobs((prev) => {
              if (payload.eventType === "DELETE") return prev.filter((j) => j.id !== (payload.old as Job).id)
              const next = payload.new as Job
              const idx = prev.findIndex((j) => j.id === next.id)
              if (idx === -1) return [next, ...prev]
              const copy = [...prev]; copy[idx] = next; return copy
            })
          },
        )
        .subscribe()
    })()
    return () => { mounted = false; if (channel) sb.removeChannel(channel) }
  }, [sb])

  const filteredJobs = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return jobs
    return jobs.filter((j) => {
      const hay = [
        j.title, j.role_name, j.location, j.seniority,
        ...(j.required_skills ?? []),
        ...(j.nice_to_have_skills ?? []),
      ].filter(Boolean).join(" ").toLowerCase()
      return hay.includes(q)
    })
  }, [jobs, query])

  const handleCreated = useCallback((job: Job) => {
    setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)])
    setFormOpen(false)
  }, [])

  return (
    <main style={{
      minHeight: "calc(100vh - 60px)",
      padding: "32px 24px 80px",
      maxWidth: 1640, margin: "0 auto",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      {/* Header — titre + bouton créer */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 22 }}>
        <div>
          <span style={{
            display: "inline-block",
            fontSize: 11, fontWeight: 700, color: "#7C63C8",
            background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.18)",
            padding: "4px 11px", borderRadius: 100,
            letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12,
          }}>
            Missions
          </span>
          <h1 style={{ margin: 0, fontSize: "clamp(26px, 3vw, 34px)", fontWeight: 800, color: "#111827", letterSpacing: "-0.025em", lineHeight: 1.1 }}>
            Vos missions
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "#6B7280", lineHeight: 1.6 }}>
            {jobs.length === 0
              ? "Décrivez une mission — Nora la matche avec votre vivier."
              : `${jobs.length} mission${jobs.length > 1 ? "s" : ""}.`}
          </p>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          style={{
            fontSize: 13, fontWeight: 700, color: "white",
            background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
            border: "none", borderRadius: 10, padding: "10px 18px", cursor: "pointer",
            boxShadow: "0 6px 20px -8px rgba(124,99,200,0.55)", fontFamily: "inherit",
          }}
        >
          + Créer une mission
        </button>
      </div>

      <AnimatePresence>
        {formOpen && <JobForm onClose={() => setFormOpen(false)} onCreated={handleCreated} />}
      </AnimatePresence>

      {loading ? (
        <NoraLoader />
      ) : jobs.length === 0 ? (
        <EmptyState onCreate={() => setFormOpen(true)} />
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 260px) minmax(0, 1fr)",
          gap: 16, alignItems: "start",
        }}>
          {/* Sidebar — récap activité + top motifs d'écart */}
          <SidebarStats stats={stats} totalJobs={jobs.length} />

          {/* Right — search bar pleine largeur + grid missions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <input
              type="search"
              placeholder="Rechercher par titre, lieu, compétence…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: "100%",
                fontSize: 13.5, color: "#111827",
                padding: "11px 14px",
                background: "white",
                border: "1px solid #E5E7EB",
                borderRadius: 10,
                outline: "none", fontFamily: "inherit",
                transition: "border-color 150ms, box-shadow 150ms",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#C4B6E0"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,99,200,0.10)" }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.boxShadow = "none" }}
            />
            {filteredJobs.length === 0 ? (
              <div style={{
                padding: "40px 24px", textAlign: "center",
                background: "white", border: "1px dashed #E5E7EB", borderRadius: 14,
                color: "#6B7280", fontSize: 14,
              }}>
                Aucune mission ne correspond.
              </div>
            ) : (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gridAutoRows: "1fr",
                gap: 12,
              }}>
                {filteredJobs.map((j, i) => (
                  <JobCard
                    key={j.id}
                    job={j}
                    visual={visuals[j.id]}
                    delay={Math.min(i * 0.03, 0.2)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

/* ─── Sidebar ──────────────────────────────────────────────────── */

function SidebarStats({ stats, totalJobs }: { stats: SidebarStatsData | null; totalJobs: number }) {
  return (
    <aside style={{
      position: "sticky", top: 16,
      display: "flex", flexDirection: "column", gap: 14,
      paddingTop: 38,  // aligne avec le bas de la recherche
    }}>
      <StatGroup title="Vue d'ensemble">
        <StatRow label="Missions"            value={totalJobs} />
        <StatRow label="Candidats matchés"   value={stats?.totalCandidatsMatches ?? 0} />
        <StatRow
          label="En pipeline"
          value={stats?.totalInPipeline ?? 0}
          tone={(stats?.totalInPipeline ?? 0) > 0 ? "good" : undefined}
        />
        <StatRow
          label="Recrutés"
          value={stats?.totalRecruited ?? 0}
          tone={(stats?.totalRecruited ?? 0) > 0 ? "good" : undefined}
        />
      </StatGroup>

      {stats && stats.topRejectReasons.length > 0 && (
        <StatGroup title="Top motifs d'écart (30 j)">
          {stats.topRejectReasons.map((r) => (
            <StatRow
              key={r.reason}
              label={rejectReasonLabel(r.reason)}
              value={r.count}
              tone="warn"
            />
          ))}
        </StatGroup>
      )}
    </aside>
  )
}

function StatGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "white", border: "1px solid #F0ECF8", borderRadius: 12,
      padding: 12,
    }}>
      <div style={{
        fontSize: 9.5, fontWeight: 700, color: "#9CA3AF",
        letterSpacing: "0.08em", textTransform: "uppercase",
        marginBottom: 8, padding: "0 2px",
      }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {children}
      </div>
    </div>
  )
}

function StatRow({ label, value, tone }: { label: string; value: number | string; tone?: "good" | "warn" }) {
  const valueColor = tone === "good" ? "#15803d" : tone === "warn" ? "#B45309" : "#111827"
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8,
      padding: "4px 2px",
      fontSize: 12,
    }}>
      <span style={{ color: "#6B7280" }}>{label}</span>
      <span style={{ fontWeight: 800, color: valueColor, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  )
}

/* ─── Cluster color helper ────────────────────────────────────── */

function computeMissionVisual(candidates: Candidate[]): MissionVisual {
  const counts = new Map<string, number>()
  for (const c of candidates) {
    const { primary } = candidateClusters(c)
    counts.set(primary, (counts.get(primary) ?? 0) + 1)
  }
  const sorted = Array.from(counts, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  if (sorted.length === 0) return { hues: [], top1Label: null, totalMatches: 0 }
  const top1 = sorted[0]
  const total = candidates.length
  const hues: number[] = [clusterHue(top1.label)]
  // Bicolore si le 2ᵉ représente ≥ 30 % du total — sinon couleur unique.
  if (sorted.length > 1 && sorted[1].count / total >= 0.3) {
    hues.push(clusterHue(sorted[1].label))
  }
  return { hues, top1Label: top1.label, totalMatches: total }
}

/* ─── Helpers ──────────────────────────────────────────────────── */

/** Human label for a mission's seniority — interval ("Mid → Senior") if the
 *  mission carries one in `normalized`, else the legacy free string. */
function seniorityLabel(job: Job): string | null {
  const n = job.normalized
  const iv = seniorityIntervalLabel(n?.seniority_min_years, n?.seniority_max_years)
  if (iv) {
    const lo = n?.seniority_min_years, hi = n?.seniority_max_years
    if (lo != null && hi != null) return `${iv} · ${lo}–${hi} ans`
    return iv
  }
  return job.seniority?.trim() || null
}

/* ─── Job card ─────────────────────────────────────────────────── */

function JobCard({ job, visual, delay }: {
  job: Job
  visual: MissionVisual | undefined
  delay: number
}) {
  const ms = job.match_status

  // Bande couleur secteur — dérivée des candidats matchés. Monochrome ou
  // bicolore en gradient selon la composition du matching. Gris si pas
  // encore de matching.
  const hues = visual?.hues ?? []
  const barBackground =
    hues.length === 0   ? "#E5E7EB" :
    hues.length === 1   ? hsl(hues[0], 60, 55) :
    `linear-gradient(180deg, ${hsl(hues[0], 60, 55)} 0%, ${hsl(hues[1], 60, 55)} 100%)`

  return (
    <m.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: EASE }}
      whileHover={{ y: -2 }}
      style={{
        background: "white", borderRadius: 12, border: "1px solid #F0ECF8",
        padding: "14px 16px 14px 20px",
        display: "flex", flexDirection: "column", gap: 9,
        position: "relative", overflow: "hidden",
      }}
    >
      {/* Bande verticale couleur secteur dominant */}
      <span style={{
        position: "absolute", top: 0, bottom: 0, left: 0, width: 4,
        background: barBackground,
      }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#111827", lineHeight: 1.3 }}>
            {job.role_name?.trim() || job.title}
          </h2>
          {job.role_name?.trim() && job.title && job.title !== job.role_name && (
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {job.title}
            </p>
          )}
        </div>
        <StatusChip status={job.status} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, fontSize: 11, color: "#6B7280" }}>
        {job.location && <Meta>{job.location}</Meta>}
        {seniorityLabel(job) && <Meta>{seniorityLabel(job)}</Meta>}
        {job.contract_type && <Meta>{job.contract_type}</Meta>}
      </div>

      {/* Badge cluster dominant — la "saveur" du sourcing pour cette mission */}
      {visual?.top1Label && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 10, fontWeight: 700,
            color: hsl(hues[0], 55, 35),
            background: hsl(hues[0], 70, 95),
            border: `1px solid ${hsl(hues[0], 50, 80)}`,
            borderRadius: 100, padding: "1.5px 8px",
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: "50%",
              background: hues.length > 1
                ? `linear-gradient(180deg, ${hsl(hues[0], 65, 55)} 0%, ${hsl(hues[1], 65, 55)} 100%)`
                : hsl(hues[0], 65, 55),
            }} />
            {visual.top1Label}
          </span>
          <span style={{ fontSize: 10, color: "#9CA3AF" }}>
            · {visual.totalMatches} match{visual.totalMatches > 1 ? "s" : ""}
          </span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: 2 }}>
        <span style={{ fontSize: 11, color: "#9CA3AF" }}>
          {ms === "matching" ? "✦ Matching en cours…"
            : ms === "done" ? "✓ Matché"
            : ms === "error" ? "Erreur matching"
            : "Pas encore matché"}
        </span>
        <Link href={`/workspace/missions/${job.id}`} style={{
          fontSize: 11, fontWeight: 600, color: "#7C63C8",
          padding: "5px 10px", borderRadius: 7,
          background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.16)",
          textDecoration: "none",
        }}>
          Ouvrir →
        </Link>
      </div>
    </m.div>
  )
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      background: "#F9FAFB", border: "1px solid #F0ECF8",
      padding: "3px 8px", borderRadius: 6,
    }}>{children}</span>
  )
}

function StatusChip({ status }: { status: Job["status"] }) {
  const map: Record<Job["status"], { label: string; bg: string; fg: string; bd: string }> = {
    draft:    { label: "Brouillon", bg: "#F3F4F6", fg: "#6B7280", bd: "#E5E7EB" },
    open:     { label: "Ouvert",    bg: "rgba(34,197,94,0.10)", fg: "#16a34a", bd: "rgba(34,197,94,0.22)" },
    filled:   { label: "Pourvu",    bg: "rgba(124,99,200,0.10)", fg: "#7C63C8", bd: "rgba(124,99,200,0.22)" },
    archived: { label: "Archivé",   bg: "#F3F4F6", fg: "#9CA3AF", bd: "#E5E7EB" },
  }
  const s = map[status]
  return (
    <span style={{
      flexShrink: 0,
      fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 100,
      background: s.bg, color: s.fg, border: `1px solid ${s.bd}`,
      letterSpacing: "0.04em", textTransform: "uppercase",
    }}>{s.label}</span>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      style={{
        marginTop: 40, padding: "72px 36px",
        background: "white", border: "2px dashed #E2DAF6", borderRadius: 22,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 56, marginBottom: 16 }}>📋</div>
      <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: "#111827", letterSpacing: "-0.015em" }}>
        Créez votre première mission
      </h2>
      <p style={{ margin: "0 auto 18px", maxWidth: 460, fontSize: 14, color: "#6B7280", lineHeight: 1.65 }}>
        Décrivez le besoin (titre, séniorité, compétences). Nora compare la mission
        à tout votre vivier et vous sort les candidats pertinents, classés et justifiés.
      </p>
      <button onClick={onCreate} style={{
        padding: "11px 22px", borderRadius: 12, border: "none", cursor: "pointer",
        background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
        color: "white", fontWeight: 700, fontSize: 14, fontFamily: "inherit",
        boxShadow: "0 8px 24px -8px rgba(124,99,200,0.5)",
      }}>
        Créer une mission
      </button>
    </m.div>
  )
}

/* ─── Create modal (centered) ──────────────────────────────────── */

type ContractType = "cdi" | "cdd" | "freelance" | "portage" | "alternance"
type PricingLieu = "paris_petite_couronne" | "idf_grande_couronne" | "lyon" | "province"

const CONTRACT_LABELS: Record<ContractType, string> = {
  cdi: "CDI",
  cdd: "CDD",
  freelance: "Freelance",
  portage: "Portage salarial",
  alternance: "Alternance",
}
const LIEU_LABELS: Record<PricingLieu, string> = {
  paris_petite_couronne: "Paris + petite couronne (92, 93, 94)",
  idf_grande_couronne: "Île-de-France grande couronne",
  lyon: "Lyon",
  province: "Province",
}

interface ExtractedFields {
  role_name: string | null
  seniority_min_years: number | null
  seniority_max_years: number | null
  contract_type: ContractType | null
  location: string | null
  pricing_lieu: PricingLieu | null
  required_skills: string[]
  nice_to_have_skills: string[]
  duration_months: number | null
  start_date: string | null
  client_tjm_min: number | null
  client_tjm_max: number | null
  target_gross_salary: number | null
  description: string | null
}

const EMPTY_EXTRACTED: ExtractedFields = {
  role_name: null,
  seniority_min_years: null,
  seniority_max_years: null,
  contract_type: null,
  location: null,
  pricing_lieu: null,
  required_skills: [],
  nice_to_have_skills: [],
  duration_months: null,
  start_date: null,
  client_tjm_min: null,
  client_tjm_max: null,
  target_gross_salary: null,
  description: null,
}

function JobForm({ onClose, onCreated }: { onClose: () => void; onCreated: (j: Job) => void }) {
  // Stage 1 : brief texte. Stage 2 : form pré-rempli.
  const [stage, setStage] = useState<"brief" | "form" | "manual">("brief")
  const [brief, setBrief] = useState("")
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [briefExpanded, setBriefExpanded] = useState(false)
  const [extracted, setExtracted] = useState<ExtractedFields>(EMPTY_EXTRACTED)

  // Form fields (initialement remplis depuis extracted, puis éditables).
  const [roleName, setRoleName] = useState("")
  const [contractType, setContractType] = useState<ContractType | "">("")
  const [location, setLocation] = useState("")
  const [pricingLieu, setPricingLieu] = useState<PricingLieu | "">("")
  const [seniorityMin, setSeniorityMin] = useState("")
  const [seniorityMax, setSeniorityMax] = useState("")
  const [reqSkills, setReqSkills] = useState<string[]>([])
  const [niceSkills, setNiceSkills] = useState<string[]>([])
  const [durationMonths, setDurationMonths] = useState("")
  const [startDate, setStartDate] = useState("")
  const [tjmMin, setTjmMin] = useState("")
  const [tjmMax, setTjmMax] = useState("")
  const [targetBrut, setTargetBrut] = useState("")
  const [description, setDescription] = useState("")

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const minNum = seniorityMin === "" ? null : Number(seniorityMin)
  const maxNum = seniorityMax === "" ? null : Number(seniorityMax)
  const detected = seniorityIntervalLabel(minNum, maxNum)

  const applyExtracted = (e: ExtractedFields) => {
    setExtracted(e)
    setRoleName(e.role_name ?? "")
    setContractType(e.contract_type ?? "")
    setLocation(e.location ?? "")
    setPricingLieu(e.pricing_lieu ?? "")
    setSeniorityMin(e.seniority_min_years != null ? String(e.seniority_min_years) : "")
    setSeniorityMax(e.seniority_max_years != null ? String(e.seniority_max_years) : "")
    setReqSkills(e.required_skills)
    setNiceSkills(e.nice_to_have_skills)
    setDurationMonths(e.duration_months != null ? String(e.duration_months) : "")
    setStartDate(e.start_date ?? "")
    setTjmMin(e.client_tjm_min != null ? String(e.client_tjm_min) : "")
    setTjmMax(e.client_tjm_max != null ? String(e.client_tjm_max) : "")
    setTargetBrut(e.target_gross_salary != null ? String(e.target_gross_salary) : "")
    setDescription(e.description ?? "")
  }

  const runExtract = async () => {
    if (!brief.trim()) { setExtractError("Collez votre brief, fiche de poste ou appel d'offre."); return }
    setExtracting(true); setExtractError(null)
    try {
      const res = await fetch("/api/jobs/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: brief.trim() }),
      })
      const data = await res.json() as { ok?: boolean; extracted?: ExtractedFields; message?: string; error?: string }
      if (!res.ok || !data.ok || !data.extracted) {
        setExtractError(data.message ?? data.error ?? "Erreur d'analyse.")
        setExtracting(false)
        return
      }
      applyExtracted(data.extracted)
      setStage("form")
      setBriefExpanded(false)
    } catch (err) {
      setExtractError((err as Error).message ?? "Erreur réseau.")
    } finally {
      setExtracting(false)
    }
  }

  const submitForm = async () => {
    // Obligatoires V1 : juste nom du poste + lieu + compétences. Tout le
    // reste peut être complété plus tard (mission "ASAP" sans date, type
    // de contrat à confirmer côté pricing, durée à voir avec le client…).
    if (!roleName.trim()) { setError("Le nom du poste est requis."); return }
    if (!location.trim()) { setError("Le lieu est requis."); return }
    if (reqSkills.length === 0) { setError("Au moins une compétence requise."); return }

    setSubmitting(true); setError(null)
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role_name: roleName,
          title: roleName,                            // on ne demande plus d'intitulé
          location,
          pricing_lieu: pricingLieu || null,
          contract_type: contractType,
          seniority_min_years: minNum,
          seniority_max_years: maxNum,
          required_skills: reqSkills,
          nice_to_have_skills: niceSkills,
          description,
          briefing: brief.trim() || null,             // on persiste le brief original
          duration_months: durationMonths ? Number(durationMonths) : null,
          start_date: startDate || null,
          client_tjm_min: tjmMin ? Number(tjmMin) : null,
          client_tjm_max: tjmMax ? Number(tjmMax) : null,
          target_gross_salary: targetBrut ? Number(targetBrut) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.job) {
        setError(data.message ?? data.error ?? "Erreur de création.")
        setSubmitting(false)
        return
      }
      onCreated(data.job as Job)
    } catch (err) {
      setError((err as Error).message ?? "Erreur réseau.")
      setSubmitting(false)
    }
  }

  /** Statut visuel d'un champ : "complet" / "manquant" / "à confirmer". */
  const statusOf = (value: unknown, llmWasNull: boolean): "ok" | "missing" | "review" => {
    const empty = value === "" || value == null || (Array.isArray(value) && value.length === 0)
    if (empty) return "missing"
    if (llmWasNull) return "ok"   // sourceur a complété → ok
    return "ok"                    // LLM a donné, ok par défaut
  }
  void statusOf // helper réservé si on veut afficher 3 états ; pour l'instant on affiche ⚠ uniquement sur manquant

  return (
    <>
      <m.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(17,24,39,0.40)", backdropFilter: "blur(2px)",
          display: "flex", alignItems: "flex-start", justifyContent: "center",
          padding: "5vh 20px", overflowY: "auto",
        }}
      >
        <m.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.3, ease: EASE }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%", maxWidth: 640,
            background: "white", borderRadius: 18,
            boxShadow: "0 30px 80px rgba(17,24,39,0.28)",
            display: "flex", flexDirection: "column",
            fontFamily: "var(--font-inter), sans-serif",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid #F0ECF8", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#7C63C8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Nouvelle mission
              </p>
              <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em" }}>
                {stage === "brief" ? "Donnez votre brief à Nora" : stage === "manual" ? "Saisie manuelle" : "Vérifiez et complétez"}
              </h2>
            </div>
            <button onClick={onClose} aria-label="Fermer" style={{
              background: "transparent", border: "none", cursor: "pointer",
              fontSize: 22, color: "#9CA3AF", lineHeight: 1, padding: 4,
            }}>✕</button>
          </div>

          {/* ─── STAGE 1 : brief texte ─── */}
          {stage === "brief" && (
            <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ margin: 0, fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>
                Collez votre brief, votre fiche de poste ou l&apos;appel d&apos;offre du client.
                Nora analyse, en extrait les détails et vous propose un formulaire pré-rempli
                — vous compléterez ce qui manque.
              </p>

              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Ex : On cherche un Data Engineer Senior pour un client banque à Paris, démarrage septembre, mission 12 mois, stack Python + Spark + AWS, TJM autour de 600€…"
                rows={briefExpanded ? 18 : 9}
                style={{
                  ...inputStyle, resize: "vertical", lineHeight: 1.6,
                  fontFamily: "var(--font-inter), sans-serif",
                  maxHeight: briefExpanded ? "60vh" : 280,
                  overflowY: "auto",
                }}
                autoFocus
              />

              {brief.length > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  fontSize: 11.5, color: "#9CA3AF",
                }}>
                  <button
                    type="button"
                    onClick={() => setBriefExpanded((v) => !v)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: 12, color: "#7C63C8", fontWeight: 600,
                      padding: 0, textDecoration: "underline",
                    }}
                  >
                    {briefExpanded ? "Réduire" : "Élargir la zone"}
                  </button>
                  <span>{brief.length.toLocaleString("fr-FR")} caractères · max 12 000</span>
                </div>
              )}

              {extractError && (
                <div style={{
                  padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA",
                  borderRadius: 10, fontSize: 13, color: "#B91C1C",
                }}>{extractError}</div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setStage("manual")}
                  style={{
                    fontSize: 12.5, color: "#6B7280", background: "none", border: "none",
                    cursor: "pointer", textDecoration: "underline", padding: 0,
                  }}
                >
                  Sans brief — saisie manuelle
                </button>
                <button
                  type="button"
                  onClick={runExtract}
                  disabled={extracting || !brief.trim()}
                  style={{
                    padding: "11px 22px", borderRadius: 10, border: "none",
                    background: extracting || !brief.trim()
                      ? "#C4B6E0"
                      : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                    color: "white", fontSize: 13, fontWeight: 700,
                    cursor: extracting || !brief.trim() ? "default" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {extracting ? "Analyse en cours…" : "Analyser avec Nora"}
                </button>
              </div>
            </div>
          )}

          {/* ─── STAGE 2 : formulaire pré-rempli ou manual ─── */}
          {(stage === "form" || stage === "manual") && (
            <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
              {stage === "form" && brief && (
                <details style={{
                  background: "#F8F6FF", border: "1px solid #E2DAF6", borderRadius: 10,
                  padding: "10px 14px", fontSize: 12.5,
                }}>
                  <summary style={{ cursor: "pointer", fontWeight: 600, color: "#6B54B2" }}>
                    Brief analysé par Nora ({brief.length} car.)
                  </summary>
                  <textarea
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    rows={6}
                    style={{ ...inputStyle, marginTop: 10, resize: "vertical", lineHeight: 1.5 }}
                  />
                  <button type="button" onClick={runExtract} disabled={extracting}
                    style={{
                      marginTop: 8, padding: "7px 14px", borderRadius: 8, border: "1px solid #7C63C8",
                      background: "white", color: "#7C63C8", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    }}>
                    {extracting ? "Re-analyse…" : "Re-analyser"}
                  </button>
                </details>
              )}

              <FormFieldGrid
                roleName={roleName} setRoleName={setRoleName}
                contractType={contractType} setContractType={setContractType}
                location={location} setLocation={setLocation}
                pricingLieu={pricingLieu} setPricingLieu={setPricingLieu}
                seniorityMin={seniorityMin} setSeniorityMin={setSeniorityMin}
                seniorityMax={seniorityMax} setSeniorityMax={setSeniorityMax}
                detected={detected}
                durationMonths={durationMonths} setDurationMonths={setDurationMonths}
                startDate={startDate} setStartDate={setStartDate}
                reqSkills={reqSkills} setReqSkills={setReqSkills}
                niceSkills={niceSkills} setNiceSkills={setNiceSkills}
                tjmMin={tjmMin} setTjmMin={setTjmMin}
                tjmMax={tjmMax} setTjmMax={setTjmMax}
                targetBrut={targetBrut} setTargetBrut={setTargetBrut}
                description={description} setDescription={setDescription}
                extracted={stage === "form" ? extracted : null}
              />

              {error && (
                <div style={{
                  padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA",
                  borderRadius: 10, fontSize: 13, color: "#B91C1C",
                }}>{error}</div>
              )}
            </div>
          )}

          {/* Footer */}
          {stage !== "brief" && (
            <div style={{ padding: "16px 28px", borderTop: "1px solid #F0ECF8", display: "flex", gap: 10, justifyContent: "space-between" }}>
              <button onClick={() => setStage("brief")} style={{
                padding: "11px 18px", borderRadius: 10,
                background: "white", border: "1px solid #E5E7EB", color: "#6B7280",
                fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>← Retour au brief</button>
              <button onClick={submitForm} disabled={submitting} style={{
                padding: "11px 24px", borderRadius: 10, border: "none",
                background: submitting ? "#C4B6E0" : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                color: "white", fontSize: 13, fontWeight: 700,
                cursor: submitting ? "default" : "pointer", fontFamily: "inherit",
              }}>
                {submitting ? "Création + matching…" : "Valider et lancer le matching"}
              </button>
            </div>
          )}
        </m.div>
      </m.div>
    </>
  )
}

/* ─── Form fields grid — partagé entre stages "form" (avec extracted) et "manual" ─── */

interface FormFieldGridProps {
  roleName: string; setRoleName: (v: string) => void
  contractType: ContractType | ""; setContractType: (v: ContractType | "") => void
  location: string; setLocation: (v: string) => void
  pricingLieu: PricingLieu | ""; setPricingLieu: (v: PricingLieu | "") => void
  seniorityMin: string; setSeniorityMin: (v: string) => void
  seniorityMax: string; setSeniorityMax: (v: string) => void
  detected: string | null
  durationMonths: string; setDurationMonths: (v: string) => void
  startDate: string; setStartDate: (v: string) => void
  reqSkills: string[]; setReqSkills: (v: string[]) => void
  niceSkills: string[]; setNiceSkills: (v: string[]) => void
  tjmMin: string; setTjmMin: (v: string) => void
  tjmMax: string; setTjmMax: (v: string) => void
  targetBrut: string; setTargetBrut: (v: string) => void
  description: string; setDescription: (v: string) => void
  extracted: ExtractedFields | null
}
function FormFieldGrid(p: FormFieldGridProps) {
  // États possibles d'un champ :
  //   - rempli + extrait par Nora     → bordure verte + pastille verte "Détecté"
  //   - rempli (manuel ou après edit) → bordure verte (pas de pastille)
  //   - vide + obligatoire            → bordure rouge
  //   - vide + optionnel              → bordure orange
  const stateOf = (current: unknown, llmValue: unknown, required: boolean): {
    border: string
    statusPill: React.ReactNode | null
  } => {
    const empty = current === "" || current == null || (Array.isArray(current) && current.length === 0)
    if (empty) {
      return required
        ? { border: BORDER.required, statusPill: <StatusPill kind="missing">À compléter</StatusPill> }
        : { border: BORDER.optional, statusPill: null }
    }
    const detected = !!(p.extracted && llmValue !== null && llmValue !== undefined &&
      (!Array.isArray(llmValue) || llmValue.length > 0))
    return {
      border: BORDER.ok,
      statusPill: detected ? <StatusPill kind="ok">Détecté</StatusPill> : null,
    }
  }
  const ringStyle = (border: string): React.CSSProperties => ({ ...inputStyle, borderColor: border })

  const role         = stateOf(p.roleName,        p.extracted?.role_name,           true)
  const ct           = stateOf(p.contractType,    p.extracted?.contract_type,       false)
  const loc          = stateOf(p.location,        p.extracted?.location,            true)
  const pricingState = stateOf(p.pricingLieu,     p.extracted?.pricing_lieu,        false)
  const senState     = stateOf(p.seniorityMin || p.seniorityMax, p.extracted?.seniority_min_years, false)
  const durState     = stateOf(p.durationMonths,  p.extracted?.duration_months,     false)
  const startState   = stateOf(p.startDate,       p.extracted?.start_date,          false)
  const reqState     = stateOf(p.reqSkills,       p.extracted?.required_skills,     true)
  const niceState    = stateOf(p.niceSkills,      p.extracted?.nice_to_have_skills, false)
  const tjmMinState  = stateOf(p.tjmMin,          p.extracted?.client_tjm_min,      false)
  const tjmMaxState  = stateOf(p.tjmMax,          p.extracted?.client_tjm_max,      false)
  const brutState    = stateOf(p.targetBrut,      p.extracted?.target_gross_salary, false)
  const descState    = stateOf(p.description,     p.extracted?.description,         false)

  return (
    <>
      <Field label="Nom du poste *" hint="signal principal du matching" status={role.statusPill}>
        <input value={p.roleName} onChange={(e) => p.setRoleName(e.target.value)}
          placeholder="Ex : Data Engineer" style={ringStyle(role.border)} autoFocus />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Type de contrat" hint="optionnel" status={ct.statusPill}>
          <StyledSelect value={p.contractType} onChange={(v) => p.setContractType(v as ContractType | "")}
            border={ct.border} placeholder="Sélectionner…"
            options={(Object.keys(CONTRACT_LABELS) as ContractType[]).map((k) => ({ value: k, label: CONTRACT_LABELS[k] }))} />
        </Field>
        <Field label="Expérience attendue" hint="optionnel — vide = matching ignore" status={senState.statusPill}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="number" min={0} max={40} value={p.seniorityMin}
              onChange={(e) => p.setSeniorityMin(e.target.value)}
              placeholder="5" style={{ ...ringStyle(senState.border), width: 64, textAlign: "center" }} />
            <span style={{ fontSize: 13, color: "#9CA3AF" }}>à</span>
            <input type="number" min={0} max={40} value={p.seniorityMax}
              onChange={(e) => p.setSeniorityMax(e.target.value)}
              placeholder="10" style={{ ...ringStyle(senState.border), width: 64, textAlign: "center" }} />
            <span style={{ fontSize: 13, color: "#9CA3AF" }}>ans</span>
          </div>
        </Field>
      </div>
      {p.detected && (
        <div style={{
          marginTop: -6, alignSelf: "flex-start",
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "5px 12px", borderRadius: 100,
          background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.20)",
          fontSize: 12, color: "#6B54B2",
        }}>
          Nora a compris : <strong style={{ color: "#7C63C8" }}>{p.detected}</strong>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Lieu *" hint="texte libre" status={loc.statusPill}>
          <input value={p.location} onChange={(e) => p.setLocation(e.target.value)}
            placeholder="Paris, Lyon, remote…" style={ringStyle(loc.border)} />
        </Field>
        <Field label="Zone pricing" hint="URSSAF / transport" status={pricingState.statusPill}>
          <StyledSelect value={p.pricingLieu} onChange={(v) => p.setPricingLieu(v as PricingLieu | "")}
            border={pricingState.border} placeholder="— non renseigné —"
            options={(Object.keys(LIEU_LABELS) as PricingLieu[]).map((k) => ({ value: k, label: LIEU_LABELS[k] }))} />
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Durée (mois)" hint="vide = à voir avec le client" status={durState.statusPill}>
          <input type="number" min={1} max={60} value={p.durationMonths}
            onChange={(e) => p.setDurationMonths(e.target.value)}
            placeholder="6" style={ringStyle(durState.border)} />
        </Field>
        <Field label="Date de début" hint="vide = ASAP" status={startState.statusPill}>
          <input type="date" value={p.startDate}
            onChange={(e) => p.setStartDate(e.target.value)}
            style={ringStyle(startState.border)} />
        </Field>
      </div>

      <Field label="Compétences requises *" hint="Entrée ou virgule pour ajouter" status={reqState.statusPill}>
        <TagInput tags={p.reqSkills} onChange={p.setReqSkills} placeholder="Python, Spark, AWS…"
          borderColor={reqState.border} />
      </Field>

      <Field label="Compétences souhaitées (nice to have)" hint="optionnel" status={niceState.statusPill}>
        <TagInput tags={p.niceSkills} onChange={p.setNiceSkills} placeholder="Terraform, Kafka…"
          borderColor={niceState.border} />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <Field label="TJM min (€/j HT)" hint="optionnel" status={tjmMinState.statusPill}>
          <input type="number" min={0} value={p.tjmMin}
            onChange={(e) => p.setTjmMin(e.target.value)} placeholder="500" style={ringStyle(tjmMinState.border)} />
        </Field>
        <Field label="TJM max (€/j HT)" hint="optionnel" status={tjmMaxState.statusPill}>
          <input type="number" min={0} value={p.tjmMax}
            onChange={(e) => p.setTjmMax(e.target.value)} placeholder="600" style={ringStyle(tjmMaxState.border)} />
        </Field>
        <Field label="Brut cible (€/an)" hint="optionnel" status={brutState.statusPill}>
          <input type="number" min={0} value={p.targetBrut}
            onChange={(e) => p.setTargetBrut(e.target.value)} placeholder="48000" style={ringStyle(brutState.border)} />
        </Field>
      </div>

      <Field label="Contexte / description" hint="affiché sur la fiche mission" status={descState.statusPill}>
        <textarea value={p.description} onChange={(e) => p.setDescription(e.target.value)}
          rows={3} placeholder="Contexte client, environnement technique, contraintes…"
          style={{ ...ringStyle(descState.border), resize: "vertical", lineHeight: 1.6 }} />
      </Field>
    </>
  )
}

/* ── Bordures par état ── */
const BORDER = {
  ok:       "#22C55E",   // vert
  required: "#EF4444",   // rouge — obligatoire manquant
  optional: "#F59E0B",   // orange — facultatif manquant
} as const

/* ── Select stylé (apparence custom + chevron) ── */
function StyledSelect({ value, onChange, options, placeholder, border }: {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
  placeholder: string
  border: string
}) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...inputStyle, borderColor: border,
          appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
          paddingRight: 36, cursor: "pointer",
          background: "#FAFAFA",
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <svg
        width="14" height="14" viewBox="0 0 20 20" fill="none"
        style={{
          position: "absolute", right: 12, top: "50%",
          transform: "translateY(-50%)", pointerEvents: "none",
          color: "#9CA3AF",
        }}
      >
        <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function StatusPill({ kind, children }: { kind: "ok" | "missing" | "review"; children: React.ReactNode }) {
  const map = {
    ok:      { bg: "rgba(34,197,94,0.10)",  fg: "#15803d", bd: "rgba(34,197,94,0.25)" },
    missing: { bg: "rgba(239,68,68,0.08)",  fg: "#B91C1C", bd: "rgba(239,68,68,0.22)" },
    review:  { bg: "rgba(245,158,11,0.10)", fg: "#B45309", bd: "rgba(245,158,11,0.25)" },
  }[kind]
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color: map.fg,
      background: map.bg, border: `1px solid ${map.bd}`,
      padding: "2px 7px", borderRadius: 100,
      textTransform: "uppercase", letterSpacing: "0.05em",
    }}>
      {children}
    </span>
  )
}

function Field({ label, hint, status, children }: { label: string; hint?: string; status?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span>{label}</span>
        {hint && <span style={{ fontWeight: 400, color: "#9CA3AF" }}>· {hint}</span>}
        {status}
      </span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  fontSize: 13.5, color: "#111827",
  padding: "9px 12px",
  background: "#FAFAFA", border: "1px solid #E5E7EB", borderRadius: 9,
  outline: "none", fontFamily: "inherit",
}

function TagInput({ tags, onChange, placeholder, borderColor }: { tags: string[]; onChange: (t: string[]) => void; placeholder?: string; borderColor?: string }) {
  const [draft, setDraft] = useState("")
  const commit = () => {
    const v = draft.trim().replace(/,$/, "").trim()
    if (v && !tags.some((t) => t.toLowerCase() === v.toLowerCase())) {
      onChange([...tags, v])
    }
    setDraft("")
  }
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
      padding: "7px 9px", background: "#FAFAFA",
      border: `1px solid ${borderColor ?? "#E5E7EB"}`, borderRadius: 9, minHeight: 38,
    }}>
      {tags.map((t) => (
        <span key={t} style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 12, color: "#4B5563",
          background: "white", border: "1px solid #F0ECF8",
          padding: "3px 6px 3px 9px", borderRadius: 6,
        }}>
          {t}
          <button onClick={() => onChange(tags.filter((x) => x !== t))} style={{
            background: "transparent", border: "none", cursor: "pointer",
            color: "#9CA3AF", fontSize: 13, lineHeight: 1, padding: 0,
          }}>✕</button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => {
          const val = e.target.value
          if (val.endsWith(",")) { setDraft(val); commit() }
          else setDraft(val)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit() }
          if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1))
        }}
        onBlur={commit}
        placeholder={tags.length === 0 ? placeholder : ""}
        style={{
          flex: 1, minWidth: 100, border: "none", outline: "none",
          background: "transparent", fontSize: 13, color: "#111827", fontFamily: "inherit",
        }}
      />
    </div>
  )
}
