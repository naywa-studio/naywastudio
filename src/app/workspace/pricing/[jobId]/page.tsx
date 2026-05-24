"use client"

/**
 * /workspace/pricing/[jobId] — Vue mission dédiée au pricing.
 *
 * Affiche :
 *   - Le header mission + édition inline des params (TJM, marge, durée, brut ciblé)
 *     via un mini éditeur dédié à cette vue
 *   - La liste des candidats actuellement en stage "pricing" du kanban
 *   - Quand un candidat est sélectionné : le PricingWidget rebranché avec
 *     auto-détection statut/position/modalité depuis parsed_cv et le chiffrage
 *     en direct (triangle + KPI risque + graphique 2 courbes)
 *
 * Si la mission n'a aucun candidat en stage pricing, message d'incitation à
 * en déplacer un depuis le pipeline.
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
      <Header job={job} />

      <MissionPricingEditor
        job={job}
        onPatched={(next) => setJob(next)}
      />

      <div className="pricing-mission-grid" style={{
        marginTop: 18,
        display: "grid",
        gridTemplateColumns: "minmax(0, 320px) minmax(0, 1fr)",
        gap: 18,
        alignItems: "start",
      }}>
        <aside style={{
          alignSelf: "flex-start",
          position: "sticky", top: 80,
        }}>
          <CandidatesList
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
 * Header
 * ────────────────────────────────────────────────────────────────────────── */

function Header({ job }: { job: Job }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <Link href="/workspace/pricing" style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 13, color: "#7C63C8", textDecoration: "none", marginBottom: 16,
      }}>
        ← Retour au pricing
      </Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <span style={{
            display: "inline-block",
            fontSize: 11, fontWeight: 700, color: "#D97706",
            background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.22)",
            padding: "4px 11px", borderRadius: 100,
            letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10,
          }}>
            💰 Pricing — {job.title}
          </span>
          <h1 style={{
            margin: 0, fontSize: "clamp(22px, 2.6vw, 28px)", fontWeight: 800,
            color: "#111827", letterSpacing: "-0.02em", lineHeight: 1.2,
          }}>
            Chiffrer un candidat
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6B7280" }}>
            {job.location && <>{job.location} · </>}
            {job.contract_type && <>{job.contract_type} · </>}
            {job.duration_months && <>{job.duration_months} mois</>}
          </p>
        </div>
        <Link href={`/workspace/missions/${job.id}`} style={{
          fontSize: 12, fontWeight: 700, color: "#7C63C8",
          background: "white", border: "1px solid rgba(124,99,200,0.25)",
          borderRadius: 9, padding: "8px 14px", textDecoration: "none",
          whiteSpace: "nowrap",
        }}>
          Fiche mission complète →
        </Link>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Mission pricing inline editor — same pattern as MissionPricingBlock on
 * the mission detail page, repeated here so the sourceur can complete or
 * tweak the inputs without leaving the pricing view.
 * ────────────────────────────────────────────────────────────────────────── */

function MissionPricingEditor({
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
  const [marginMin, setMarginMin] = useState<string>(numToStr(job.margin_min_pct))
  const [marginTarget, setMarginTarget] = useState<string>(numToStr(job.margin_target_pct))
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

  // List of required fields not yet filled — surfaced as a reminder banner.
  const missing: string[] = []
  if (!tjmMin && !tjmMax) missing.push("TJM client")
  if (!marginMin) missing.push("marge minimum")
  if (!duration) missing.push("durée prévue")

  return (
    <div style={{
      background: "rgba(217,119,6,0.04)",
      border: "1px solid rgba(217,119,6,0.20)",
      borderRadius: 12, padding: 14,
    }}>
      <div style={{
        display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12,
        flexWrap: "wrap", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <p style={{
            margin: 0, fontSize: 11, fontWeight: 700, color: "#B45309",
            letterSpacing: "0.07em", textTransform: "uppercase",
          }}>
            ⚙ Paramètres de la mission
          </p>
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>
            — sauvegarde automatique
          </span>
        </div>
        <SaveBadge state={saveState} />
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 8,
      }}>
        <PricingField label="TJM min" value={tjmMin} onChange={(v) => updateField("client_tjm_min", v, setTjmMin)} suffix="€/j" placeholder="500" />
        <PricingField label="TJM max" value={tjmMax} onChange={(v) => updateField("client_tjm_max", v, setTjmMax)} suffix="€/j" placeholder="650" />
        <PricingField label="Marge min" value={marginMin} onChange={(v) => updateField("margin_min_pct", v, setMarginMin)} suffix="%" placeholder="défaut cabinet" max={100} />
        <PricingField label="Marge cible" value={marginTarget} onChange={(v) => updateField("margin_target_pct", v, setMarginTarget)} suffix="%" placeholder="défaut cabinet" max={100} />
        <PricingField label="Durée prévue" value={duration} onChange={(v) => updateField("duration_months", v, setDuration)} suffix="mois" placeholder="12" max={120} />
        <PricingField label="Brut ciblé" value={targetGross} onChange={(v) => updateField("target_gross_salary", v, setTargetGross)} suffix="€/an" placeholder="45000" step={500} />
        <DateField label="Démarrage" value={startDate} onChange={(v) => {
          setStartDate(v)
          schedulePatch({ start_date: v || null })
        }} />
      </div>

      {missing.length > 0 && (
        <p style={{
          margin: "10px 0 0", fontSize: 11.5, color: "#92400E", lineHeight: 1.5,
        }}>
          ⚠ <strong>Manquant pour un chiffrage précis :</strong> {missing.join(", ")}.
        </p>
      )}
    </div>
  )
}

function DateField({
  label, value, onChange,
}: {
  label: string
  value: string
  onChange: (next: string) => void
}) {
  return (
    <label style={{
      background: "white", border: "1px solid rgba(217,119,6,0.18)",
      borderRadius: 9, padding: "8px 11px",
      display: "flex", flexDirection: "column", gap: 4,
      cursor: "text",
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, color: "#92400E",
        letterSpacing: "0.05em", textTransform: "uppercase",
      }}>
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", minWidth: 0,
          fontSize: 13, fontWeight: 700, color: "#111827",
          background: "transparent", border: "none", outline: "none",
          padding: 0, fontFamily: "inherit",
        }}
      />
    </label>
  )
}

function PricingField({
  label, value, onChange, suffix, placeholder, max, step,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  suffix: string
  placeholder?: string
  max?: number
  step?: number
}) {
  return (
    <label style={{
      background: "white", border: "1px solid rgba(217,119,6,0.18)",
      borderRadius: 9, padding: "8px 11px",
      display: "flex", flexDirection: "column", gap: 4,
      cursor: "text",
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, color: "#92400E",
        letterSpacing: "0.05em", textTransform: "uppercase",
      }}>
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <input
          type="number" inputMode="decimal"
          min={0} max={max} step={step ?? 1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1, minWidth: 0,
            fontSize: 13.5, fontWeight: 700, color: "#111827",
            background: "transparent", border: "none", outline: "none",
            padding: 0, fontFamily: "inherit",
            fontVariantNumeric: "tabular-nums",
            appearance: "textfield",
          }}
        />
        <span style={{ fontSize: 11, color: "#9CA3AF", flexShrink: 0 }}>{suffix}</span>
      </div>
    </label>
  )
}

function SaveBadge({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "idle") return null
  const styles: Record<string, React.CSSProperties> = {
    saving: { background: "#F3F4F6", color: "#6B7280" },
    saved: { background: "rgba(34,197,94,0.10)", color: "#16a34a", border: "1px solid rgba(34,197,94,0.22)" },
    error: { background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA" },
  }
  return (
    <div style={{
      ...styles[state],
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 100,
    }}>
      {state === "saving" ? "Enregistrement…" : state === "saved" ? "✓ Enregistré" : "⚠ Erreur"}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Candidates list — left rail, sticky
 * ────────────────────────────────────────────────────────────────────────── */

function CandidatesList({
  candidates, selectedMatchId, onSelect,
}: {
  candidates: PricingCandidate[]
  selectedMatchId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{
        margin: 0, fontSize: 11, fontWeight: 700, color: "#9CA3AF",
        letterSpacing: "0.08em", textTransform: "uppercase",
      }}>
        Candidats en pricing · {candidates.length}
      </p>
      {candidates.length === 0 && (
        <p style={{ margin: 0, fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>
          Aucun candidat à chiffrer pour cette mission.
        </p>
      )}
      {candidates.map((c, i) => {
        const active = c.matchId === selectedMatchId
        return (
          <m.button
            key={c.matchId}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.25), ease: EASE }}
            onClick={() => onSelect(c.matchId)}
            style={{
              textAlign: "left", cursor: "pointer", fontFamily: "inherit",
              background: active ? "rgba(217,119,6,0.06)" : "white",
              border: active ? "1.5px solid rgba(217,119,6,0.40)" : "1px solid #F0ECF8",
              borderRadius: 12, padding: "11px 13px",
              display: "flex", flexDirection: "column", gap: 3,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "#111827" }}>
                {c.candidate.full_name ?? "Candidat sans nom"}
              </span>
              {c.score != null && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: "#6B7280",
                  padding: "2px 7px", borderRadius: 100,
                  background: "#F4F1FB", textTransform: "uppercase",
                }}>
                  {c.score}
                </span>
              )}
            </div>
            {c.candidate.current_title && (
              <span style={{ fontSize: 11.5, color: "#6B7280", lineHeight: 1.4 }}>
                {c.candidate.current_title}
              </span>
            )}
          </m.button>
        )
      })}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Empty state — no candidates in pricing stage for this mission
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
        pipeline. Le pricing apparaîtra ici dès que vous aurez au moins un candidat dans
        cette colonne.
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
  padding: "32px 24px 80px",
  maxWidth: 1280, margin: "0 auto",
  fontFamily: "var(--font-inter), sans-serif",
}
