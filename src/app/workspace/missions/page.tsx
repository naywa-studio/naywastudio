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

/** Stats globales sourcing pour la sidebar gauche — fenêtre "cette semaine". */
interface WeeklyStats {
  mailsSent: number
  replies: number
  interviews: number
  topRejectReasons: Array<{ reason: RejectReason; count: number }>
}

const WEEK_START_ISO = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay() + 1) // lundi
  return d.toISOString()
})()
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
  const [stats, setStats] = useState<WeeklyStats | null>(null)
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

      // 3) Stats hebdo : mails in/out, entretiens, top motifs d'écart (30j).
      const [mailsRes, interviewsRes, rejectsRes] = await Promise.all([
        sb.from("email_messages").select("id, direction").gte("created_at", WEEK_START_ISO),
        sb.from("match_assessments").select("id").gte("interview_at", WEEK_START_ISO).not("interview_at", "is", null),
        sb.from("match_assessments").select("reject_reason").not("reject_reason", "is", null).gte("updated_at", MONTH_START_ISO),
      ])
      if (!mounted) return
      const mails = (mailsRes.data ?? []) as Array<{ direction: string }>
      const mailsSent = mails.filter((m) => m.direction === "outbound").length
      const replies = mails.filter((m) => m.direction === "inbound").length
      const interviews = (interviewsRes.data ?? []).length
      const reasonCount = new Map<RejectReason, number>()
      for (const r of (rejectsRes.data ?? []) as Array<{ reject_reason: RejectReason | null }>) {
        if (!r.reject_reason) continue
        reasonCount.set(r.reject_reason, (reasonCount.get(r.reject_reason) ?? 0) + 1)
      }
      const topRejectReasons = Array.from(reasonCount, ([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
      setStats({ mailsSent, replies, interviews, topRejectReasons })

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

function SidebarStats({ stats, totalJobs }: { stats: WeeklyStats | null; totalJobs: number }) {
  return (
    <aside style={{
      position: "sticky", top: 16,
      display: "flex", flexDirection: "column", gap: 14,
      paddingTop: 38,  // aligne avec le bas de la recherche
    }}>
      <StatGroup title="Cette semaine">
        <StatRow label="Mails envoyés"     value={stats?.mailsSent ?? 0} />
        <StatRow label="Réponses"          value={stats?.replies ?? 0} tone={(stats?.replies ?? 0) > 0 ? "good" : undefined} />
        <StatRow label="Entretiens passés" value={stats?.interviews ?? 0} tone={(stats?.interviews ?? 0) > 0 ? "good" : undefined} />
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

      <StatGroup title="Vivier mission">
        <StatRow label="Missions totales" value={totalJobs} />
      </StatGroup>
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

function JobForm({ onClose, onCreated }: { onClose: () => void; onCreated: (j: Job) => void }) {
  const [roleName, setRoleName] = useState("")
  const [title, setTitle] = useState("")
  const [location, setLocation] = useState("")
  const [seniorityMin, setSeniorityMin] = useState("")
  const [seniorityMax, setSeniorityMax] = useState("")
  const [reqSkills, setReqSkills] = useState<string[]>([])
  const [description, setDescription] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Live, deterministic seniority detection from the experience interval.
  const minNum = seniorityMin === "" ? null : Number(seniorityMin)
  const maxNum = seniorityMax === "" ? null : Number(seniorityMax)
  const detected = seniorityIntervalLabel(minNum, maxNum)

  const submitForm = async () => {
    if (!roleName.trim()) { setError("Le nom du poste est requis."); return }
    setSubmitting(true); setError(null)
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role_name: roleName,
          title: title.trim() || roleName,
          location,
          seniority_min_years: minNum,
          seniority_max_years: maxNum,
          required_skills: reqSkills,
          description,
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
                Décrire le besoin
              </h2>
            </div>
            <button onClick={onClose} aria-label="Fermer" style={{
              background: "transparent", border: "none", cursor: "pointer",
              fontSize: 22, color: "#9CA3AF", lineHeight: 1, padding: 4,
            }}>✕</button>
          </div>

          {/* Body */}
          <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Nom du poste + intitulé sur la même ligne */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label="Nom du poste *" hint="utilisé par Nora pour matcher">
                <input value={roleName} onChange={(e) => setRoleName(e.target.value)}
                  placeholder="Ex : Data Engineer" style={inputStyle} autoFocus />
              </Field>
              <Field label="Intitulé de la mission" hint="indicatif, pour vous">
                <input value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex : DataLake — client BNP" style={inputStyle} />
              </Field>
            </div>

            {/* Lieu + séniorité intervalle */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label="Localisation">
                <input value={location} onChange={(e) => setLocation(e.target.value)}
                  placeholder="Paris, remote…" style={inputStyle} />
              </Field>
              <Field label="Expérience attendue" hint="en années">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="number" min={0} max={40} value={seniorityMin}
                    onChange={(e) => setSeniorityMin(e.target.value)}
                    placeholder="5" style={{ ...inputStyle, width: 64, textAlign: "center" }}
                  />
                  <span style={{ fontSize: 13, color: "#9CA3AF" }}>à</span>
                  <input
                    type="number" min={0} max={40} value={seniorityMax}
                    onChange={(e) => setSeniorityMax(e.target.value)}
                    placeholder="10" style={{ ...inputStyle, width: 64, textAlign: "center" }}
                  />
                  <span style={{ fontSize: 13, color: "#9CA3AF" }}>ans</span>
                </div>
              </Field>
            </div>

            {/* Détection séniorité live */}
            {detected && (
              <div style={{
                marginTop: -6,
                display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start",
                padding: "7px 13px", borderRadius: 100,
                background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.20)",
              }}>
                <span style={{ fontSize: 13 }}>✦</span>
                <span style={{ fontSize: 12.5, color: "#6B54B2" }}>
                  Nora a compris : <strong style={{ color: "#7C63C8" }}>{detected}</strong>
                </span>
              </div>
            )}

            <Field label="Compétences requises" hint="Entrée ou virgule pour ajouter">
              <TagInput tags={reqSkills} onChange={setReqSkills} placeholder="Python, Spark, AWS…" />
            </Field>

            <Field label="Contexte de la mission" hint="optionnel — aide Nora à affiner">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                rows={4} placeholder="Contexte client, contraintes, environnement technique…"
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
            </Field>

            <p style={{
              margin: 0, padding: "10px 12px", fontSize: 11.5, color: "#6B7280",
              background: "#F8F6FF", border: "1px solid #F0ECF8", borderRadius: 9,
              lineHeight: 1.5,
            }}>
              💡 <strong>Type de contrat, TJM, durée, brut, démarrage</strong> : à renseigner
              au moment du chiffrage, dans l&apos;onglet Pricing.
            </p>

            {error && (
              <div style={{
                padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA",
                borderRadius: 10, fontSize: 13, color: "#B91C1C",
              }}>{error}</div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: "16px 28px", borderTop: "1px solid #F0ECF8", display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={onClose} style={{
              padding: "11px 18px", borderRadius: 10,
              background: "white", border: "1px solid #E5E7EB", color: "#6B7280",
              fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}>Annuler</button>
            <button onClick={submitForm} disabled={submitting} style={{
              padding: "11px 24px", borderRadius: 10, border: "none",
              background: submitting ? "#C4B6E0" : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
              color: "white", fontSize: 13, fontWeight: 700,
              cursor: submitting ? "default" : "pointer", fontFamily: "inherit",
            }}>
              {submitting ? "Création + analyse…" : "Créer la mission"}
            </button>
          </div>
        </m.div>
      </m.div>
    </>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: "#9CA3AF", marginLeft: 6 }}>· {hint}</span>}
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

function TagInput({ tags, onChange, placeholder }: { tags: string[]; onChange: (t: string[]) => void; placeholder?: string }) {
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
      border: "1px solid #E5E7EB", borderRadius: 9, minHeight: 38,
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
