"use client"

/**
 * /workspace/pricing/[jobId] — Vue mission dédiée au pricing.
 *
 * Layout v2 :
 *   - Header compact (titre + tags + lien fiche mission)
 *   - Bandeau paramètres mission inline (1 ligne, éditable, auto-save)
 *   - Grid : left rail candidats compact (200px) + main full-width
 *   - Main : PricingWidget qui contient verdict hero + sliders + tabs charts
 *
 * Page large pour exploiter la largeur de l'écran (max-width: 1480).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { m, AnimatePresence } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import type { Candidate, Job, MatchTier } from "@/lib/database.types"
import NoraLoader from "@/components/workspace/NoraLoader"
import PricingWidget from "@/components/workspace/PricingWidget"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

interface PricingCandidate {
  matchId: string
  candidate: Candidate
  score: number | null
  matchTier: MatchTier | null
}

export default function PricingMissionPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const sb = useMemo(() => getSupabase(), [])

  const [job, setJob] = useState<Job | null>(null)
  const [candidates, setCandidates] = useState<PricingCandidate[]>([])
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: jobData, error } = await sb
        .from("jobs")
        .select("*")
        .eq("id", jobId)
        .single()
      if (!mounted) return
      if (error || !jobData) {
        setNotFound(true); setLoading(false); return
      }
      setJob(jobData as Job)

      const { data: matches } = await sb
        .from("match_assessments")
        .select("id, score, match_tier, candidate:candidates(*)")
        .eq("job_id", jobId)
        .eq("pipeline_stage", "pricing")
        .order("score", { ascending: false, nullsFirst: false })

      if (!mounted) return
      const rows: PricingCandidate[] = ((matches ?? []) as unknown as {
        id: string
        score: number | null
        match_tier: MatchTier | null
        candidate: Candidate | null
      }[])
        .filter((r) => r.candidate !== null)
        .map((r) => ({
          matchId: r.id,
          candidate: r.candidate as Candidate,
          score: r.score,
          matchTier: r.match_tier,
        }))
      setCandidates(rows)
      if (rows.length > 0) setSelectedMatchId(rows[0].matchId)
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [jobId, sb])

  if (loading) return <NoraLoader />
  if (notFound || !job) {
    return (
      <main style={mainStyle}>
        <div style={{ textAlign: "center", padding: "60px 24px", color: "#6B7280" }}>
          <p style={{ fontSize: 16, fontWeight: 600 }}>Mission introuvable.</p>
          <Link href="/workspace/pricing" style={{ color: "#7C63C8", textDecoration: "none", fontSize: 14 }}>
            ← Retour au pricing
          </Link>
        </div>
      </main>
    )
  }

  const selected = candidates.find((c) => c.matchId === selectedMatchId) ?? null

  return (
    <main style={mainStyle}>
      {/* Header compact — 1 ligne */}
      <CompactHeader job={job} />

      {/* Bandeau paramètres mission — inline éditable */}
      <MissionParamsBar
        job={job}
        onPatched={(next) => setJob(next)}
      />

      {/* Layout principal : left rail candidats + main widget */}
      <div className="pricing-mission-grid" style={{
        marginTop: 14,
        display: "grid",
        gridTemplateColumns: "minmax(0, 220px) minmax(0, 1fr)",
        gap: 14,
        alignItems: "start",
      }}>
        <aside style={{ alignSelf: "flex-start", position: "sticky", top: 80 }}>
          <CompactCandidatesList
            candidates={candidates}
            selectedMatchId={selectedMatchId}
            onSelect={setSelectedMatchId}
          />
        </aside>

        <section style={{ minWidth: 0 }}>
          <AnimatePresence mode="wait">
            {selected ? (
              <m.div
                key={selected.matchId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <PricingWidget candidate={selected.candidate} job={job} />
              </m.div>
            ) : (
              <NoCandidatesState jobId={job.id} />
            )}
          </AnimatePresence>
        </section>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .pricing-mission-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Compact header — 1 ligne titre + tags + actions
 * ────────────────────────────────────────────────────────────────────────── */

function CompactHeader({ job }: { job: Job }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      gap: 14, flexWrap: "wrap", marginBottom: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0, flex: 1 }}>
        <Link href="/workspace/pricing" title="Retour au pricing" style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 32, height: 32, borderRadius: 9,
          border: "1px solid rgba(124,99,200,0.20)", background: "white",
          color: "#7C63C8", textDecoration: "none", flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div style={{ minWidth: 0 }}>
          <h1 style={{
            margin: 0, fontSize: 20, fontWeight: 800, color: "#111827",
            letterSpacing: "-0.015em", lineHeight: 1.2,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            💰 {job.title}
          </h1>
          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            {job.location && <Chip>{job.location}</Chip>}
            {job.contract_type && <Chip>{job.contract_type}</Chip>}
            {job.duration_months && <Chip>{job.duration_months} mois</Chip>}
          </div>
        </div>
      </div>
      <Link href={`/workspace/missions/${job.id}`} style={{
        fontSize: 12, fontWeight: 700, color: "#7C63C8",
        background: "white", border: "1px solid rgba(124,99,200,0.25)",
        borderRadius: 9, padding: "8px 14px", textDecoration: "none",
        whiteSpace: "nowrap", flexShrink: 0,
      }}>
        Fiche mission →
      </Link>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 11, color: "#6B7280", fontWeight: 600,
      padding: "3px 9px", borderRadius: 100,
      background: "#F8F6FF", border: "1px solid #F0ECF8",
    }}>
      {children}
    </span>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Mission params bar — 1 ligne d'inputs auto-save, ne casse pas le flow
 * ────────────────────────────────────────────────────────────────────────── */

function MissionParamsBar({
  job,
  onPatched,
}: {
  job: Job
  onPatched: (next: Job) => void
}) {
  const numToStr = (n: number | null | undefined): string =>
    n == null ? "" : String(n)

  const [tjmMin, setTjmMin] = useState<string>(numToStr(job.client_tjm_min))
  const [tjmMax, setTjmMax] = useState<string>(numToStr(job.client_tjm_max))
  const [duration, setDuration] = useState<string>(numToStr(job.duration_months))
  const [targetGross, setTargetGross] = useState<string>(numToStr(job.target_gross_salary))
  const [startDate, setStartDate] = useState<string>(job.start_date ?? "")
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const saveTimerRef = useRef<number | null>(null)

  const parseNum = (s: string): number | null => {
    if (!s.trim()) return null
    const n = Number(s.replace(",", "."))
    return Number.isFinite(n) ? n : null
  }

  const schedulePatch = useCallback(
    (patch: Partial<Job>) => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
      setSaveState("saving")
      saveTimerRef.current = window.setTimeout(async () => {
        const res = await fetch(`/api/jobs/${job.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        })
        if (res.ok) {
          const data = await res.json()
          onPatched(data.job as Job)
          setSaveState("saved")
          window.setTimeout(() => setSaveState("idle"), 1800)
        } else {
          setSaveState("error")
        }
      }, 800)
    },
    [job.id, onPatched],
  )

  const updateField = useCallback(
    (key: keyof Job, raw: string, setter: (s: string) => void) => {
      setter(raw)
      schedulePatch({ [key]: parseNum(raw) } as Partial<Job>)
    },
    [schedulePatch],
  )

  const missing: string[] = []
  if (!tjmMin && !tjmMax) missing.push("TJM")
  if (!duration) missing.push("durée")
  if (!startDate) missing.push("démarrage")

  return (
    <div style={{
      background: "white",
      border: "1px solid rgba(217,119,6,0.18)",
      borderRadius: 12, padding: "10px 12px",
      display: "flex", alignItems: "center", gap: 8,
      flexWrap: "wrap",
    }}>
      <span style={{
        fontSize: 10.5, fontWeight: 700, color: "#92400E",
        letterSpacing: "0.06em", textTransform: "uppercase",
        marginRight: 4,
      }}>
        ⚙ Mission
      </span>

      <InlineField label="TJM min" value={tjmMin} suffix="€" onChange={(v) => updateField("client_tjm_min", v, setTjmMin)} placeholder="500" />
      <InlineField label="TJM max" value={tjmMax} suffix="€" onChange={(v) => updateField("client_tjm_max", v, setTjmMax)} placeholder="650" />
      <InlineField label="Durée" value={duration} suffix="m" onChange={(v) => updateField("duration_months", v, setDuration)} placeholder="12" max={120} />
      <InlineField label="Brut ciblé" value={targetGross} suffix="€/an" onChange={(v) => updateField("target_gross_salary", v, setTargetGross)} placeholder="45 000" step={500} wide />
      <InlineDateField
        label="Début"
        value={startDate}
        onChange={(v) => {
          setStartDate(v)
          schedulePatch({ start_date: v || null })
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }} />

      {missing.length > 0 && (
        <span style={{
          fontSize: 10.5, color: "#92400E", fontWeight: 600,
          padding: "3px 8px", borderRadius: 100,
          background: "rgba(217,119,6,0.08)",
        }}>
          ⚠ manque {missing.join(", ")}
        </span>
      )}
      <SaveBadge state={saveState} />
    </div>
  )
}

function InlineField({
  label, value, onChange, suffix, placeholder, max, step, wide,
}: {
  label: string
  value: string
  onChange: (s: string) => void
  suffix: string
  placeholder?: string
  max?: number
  step?: number
  wide?: boolean
}) {
  return (
    <label style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "5px 9px",
      background: "#FAFAFA", border: "1px solid #F0ECF8", borderRadius: 8,
    }}>
      <span style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>{label}</span>
      <input
        type="number" inputMode="decimal"
        min={0} max={max} step={step ?? 1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: wide ? 76 : 50,
          fontSize: 13, fontWeight: 700, color: "#111827",
          background: "transparent", border: "none", outline: "none",
          padding: 0, fontFamily: "inherit", textAlign: "right",
          fontVariantNumeric: "tabular-nums",
          appearance: "textfield",
        }}
      />
      <span style={{ fontSize: 10, color: "#9CA3AF" }}>{suffix}</span>
    </label>
  )
}

function InlineDateField({
  label, value, onChange,
}: {
  label: string
  value: string
  onChange: (s: string) => void
}) {
  return (
    <label style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "5px 9px",
      background: "#FAFAFA", border: "1px solid #F0ECF8", borderRadius: 8,
    }}>
      <span style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontSize: 12, fontWeight: 700, color: "#111827",
          background: "transparent", border: "none", outline: "none",
          padding: 0, fontFamily: "inherit",
        }}
      />
    </label>
  )
}

function SaveBadge({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "idle") return null
  const styles: Record<string, React.CSSProperties> = {
    saving: { background: "#F3F4F6", color: "#6B7280" },
    saved: { background: "rgba(34,197,94,0.10)", color: "#16a34a" },
    error: { background: "#FEF2F2", color: "#B91C1C" },
  }
  return (
    <span style={{
      ...styles[state],
      fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 100,
    }}>
      {state === "saving" ? "Enregistrement…" : state === "saved" ? "✓ Enregistré" : "⚠ Erreur"}
    </span>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Candidates list — compact (avatar + nom + score)
 * ────────────────────────────────────────────────────────────────────────── */

function CompactCandidatesList({
  candidates, selectedMatchId, onSelect,
}: {
  candidates: PricingCandidate[]
  selectedMatchId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <p style={{
        margin: "0 0 4px", fontSize: 10.5, fontWeight: 700, color: "#9CA3AF",
        letterSpacing: "0.06em", textTransform: "uppercase",
      }}>
        Candidats · {candidates.length}
      </p>
      {candidates.length === 0 && (
        <p style={{ margin: 0, fontSize: 11.5, color: "#6B7280", lineHeight: 1.5 }}>
          Aucun candidat à chiffrer.
        </p>
      )}
      {candidates.map((c, i) => {
        const active = c.matchId === selectedMatchId
        const initials = (c.candidate.full_name ?? "?")
          .split(" ").slice(0, 2).map((s) => s[0] ?? "").join("").toUpperCase()
        return (
          <m.button
            key={c.matchId}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.2), ease: EASE }}
            onClick={() => onSelect(c.matchId)}
            style={{
              textAlign: "left", cursor: "pointer", fontFamily: "inherit",
              background: active ? "linear-gradient(135deg, rgba(124,99,200,0.10), rgba(124,99,200,0.04))" : "white",
              border: active ? "1.5px solid rgba(124,99,200,0.40)" : "1px solid #F0ECF8",
              borderRadius: 10, padding: "8px 10px",
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <span style={{
              width: 28, height: 28, borderRadius: "50%",
              background: active ? "#7C63C8" : "#F4F1FB",
              color: active ? "white" : "#7C63C8",
              fontSize: 10, fontWeight: 800,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              {initials || "?"}
            </span>
            <span style={{
              fontSize: 12.5, fontWeight: active ? 700 : 600, color: "#111827",
              flex: 1, minWidth: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {c.candidate.full_name ?? "Sans nom"}
            </span>
            {c.score != null && (
              <span style={{
                fontSize: 10, fontWeight: 800, color: "#6B7280",
                padding: "1px 6px", borderRadius: 100,
                background: "#F4F1FB", flexShrink: 0,
              }}>
                {c.score}
              </span>
            )}
          </m.button>
        )
      })}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Empty state
 * ────────────────────────────────────────────────────────────────────────── */

function NoCandidatesState({ jobId }: { jobId: string }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      style={{
        background: "white", border: "2px dashed rgba(124,99,200,0.30)",
        borderRadius: 16, padding: "48px 28px", textAlign: "center",
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 14 }}>👥</div>
      <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800, color: "#111827" }}>
        Aucun candidat en stage Pricing
      </h3>
      <p style={{
        margin: "0 auto 16px", maxWidth: 460, fontSize: 13, color: "#6B7280",
        lineHeight: 1.6,
      }}>
        Pour chiffrer un candidat, déplacez-le dans la colonne <strong>Pricing</strong> du
        pipeline.
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <Link href={`/workspace/missions/${jobId}`} style={{
          fontSize: 12.5, fontWeight: 700, color: "#7C63C8",
          background: "white", border: "1px solid rgba(124,99,200,0.25)",
          borderRadius: 10, padding: "9px 16px", textDecoration: "none",
        }}>
          Fiche mission →
        </Link>
        <Link href="/workspace/pipeline" style={{
          fontSize: 12.5, fontWeight: 700, color: "white",
          background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
          borderRadius: 10, padding: "9px 16px", textDecoration: "none",
        }}>
          Ouvrir le pipeline →
        </Link>
      </div>
    </m.div>
  )
}

const mainStyle: React.CSSProperties = {
  minHeight: "calc(100vh - 60px)",
  padding: "24px 24px 80px",
  maxWidth: 1480, margin: "0 auto",
  fontFamily: "var(--font-inter), sans-serif",
}
