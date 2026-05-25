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

import { useEffect, useMemo, useState } from "react"
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

      // On liste TOUS les candidats matchés sur la mission (triés par score),
      // pas seulement ceux du stage "pricing". Le sourceur choisit librement
      // qui chiffrer depuis cette vue — plus besoin de passer par le kanban.
      const { data: matches } = await sb
        .from("match_assessments")
        .select("id, score, match_tier, candidate:candidates(*)")
        .eq("job_id", jobId)
        .order("score", { ascending: false, nullsFirst: false })
        .limit(40)

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

      {/* Détection mission paramétrée : si non → wizard, sinon → résumé compact */}
      <MissionConfigZone
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
 * Zone config mission — wizard si non paramétrée, résumé compact sinon
 * ────────────────────────────────────────────────────────────────────────── */

/** Une mission est considérée "paramétrée" si elle a au moins :
 *  - TJM client (min ou max)
 *  - Durée prévue
 *  - Date de démarrage
 *  Le brut ciblé est optionnel (sert juste de point de départ pour le slider). */
function isMissionConfigured(job: Job): boolean {
  const hasTjm = job.client_tjm_min != null || job.client_tjm_max != null
  const hasDuration = job.duration_months != null
  const hasStart = job.start_date != null
  return hasTjm && hasDuration && hasStart
}

function MissionConfigZone({
  job, onPatched,
}: {
  job: Job
  onPatched: (next: Job) => void
}) {
  const [forceEdit, setForceEdit] = useState(false)
  const configured = isMissionConfigured(job)

  if (!configured || forceEdit) {
    return (
      <MissionConfigWizard
        job={job}
        onPatched={(next) => { onPatched(next); setForceEdit(false) }}
        onCancel={configured ? () => setForceEdit(false) : undefined}
      />
    )
  }

  return (
    <MissionConfigSummary
      job={job}
      onEdit={() => setForceEdit(true)}
    />
  )
}

/** Résumé compact d'une mission déjà paramétrée — 1 ligne discrète + bouton modifier. */
function MissionConfigSummary({
  job, onEdit,
}: {
  job: Job
  onEdit: () => void
}) {
  const startStr = job.start_date
    ? new Date(job.start_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
    : "?"
  const tjmStr = job.client_tjm_min != null && job.client_tjm_max != null
    ? `${job.client_tjm_min}-${job.client_tjm_max} €/j`
    : `${job.client_tjm_min ?? job.client_tjm_max ?? "?"} €/j`
  return (
    <div style={{
      background: "rgba(34,197,94,0.04)",
      border: "1px solid rgba(34,197,94,0.20)",
      borderRadius: 10, padding: "8px 12px",
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      fontSize: 12, color: "#374151",
    }}>
      <span style={{
        fontSize: 10.5, fontWeight: 700, color: "#15803d",
        letterSpacing: "0.06em", textTransform: "uppercase",
      }}>
        ✓ Mission paramétrée
      </span>
      <span>· TJM {tjmStr}</span>
      <span>· {job.duration_months} mois</span>
      <span>· début {startStr}</span>
      {job.target_gross_salary != null && (
        <span>· brut ciblé {Math.round(job.target_gross_salary).toLocaleString("fr-FR")} €/an</span>
      )}
      <div style={{ flex: 1 }} />
      <button
        onClick={onEdit}
        style={{
          fontSize: 11.5, fontWeight: 600, color: "#7C63C8",
          background: "transparent",
          border: "1px solid rgba(124,99,200,0.30)",
          borderRadius: 8, padding: "4px 10px", cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        ⚙ Modifier
      </button>
    </div>
  )
}

/** Wizard d'init / édition — formulaire centré avec strict nécessaire. */
function MissionConfigWizard({
  job, onPatched, onCancel,
}: {
  job: Job
  onPatched: (next: Job) => void
  onCancel?: () => void
}) {
  const numToStr = (n: number | null | undefined): string =>
    n == null ? "" : String(n)

  const [tjmMin, setTjmMin] = useState<string>(numToStr(job.client_tjm_min))
  const [tjmMax, setTjmMax] = useState<string>(numToStr(job.client_tjm_max))
  const [duration, setDuration] = useState<string>(numToStr(job.duration_months))
  const [targetGross, setTargetGross] = useState<string>(numToStr(job.target_gross_salary))
  const [startDate, setStartDate] = useState<string>(job.start_date ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parseNum = (s: string): number | null => {
    if (!s.trim()) return null
    const n = Number(s.replace(",", "."))
    return Number.isFinite(n) ? n : null
  }

  const tjmMinNum = parseNum(tjmMin)
  const tjmMaxNum = parseNum(tjmMax)
  const durationNum = parseNum(duration)
  const targetGrossNum = parseNum(targetGross)
  const valid = (tjmMinNum != null || tjmMaxNum != null) && durationNum != null && startDate !== ""

  const onSubmit = async () => {
    if (!valid || saving) return
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_tjm_min: tjmMinNum,
          client_tjm_max: tjmMaxNum,
          duration_months: durationNum,
          target_gross_salary: targetGrossNum,
          start_date: startDate || null,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      onPatched(data.job as Job)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      style={{
        background: "white",
        border: "1.5px solid rgba(217,119,6,0.30)",
        borderRadius: 14, padding: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: "#92400E",
          letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          ⚙ Paramétrage mission
        </span>
        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              marginLeft: "auto", fontSize: 11, color: "#9CA3AF",
              background: "transparent", border: "none", cursor: "pointer",
              padding: 0, textDecoration: "underline", fontFamily: "inherit",
            }}
          >
            annuler
          </button>
        )}
      </div>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "#6B7280", lineHeight: 1.5 }}>
        Pour chiffrer cette mission, on a besoin du strict nécessaire. Tu peux modifier
        ces valeurs plus tard via le bouton ⚙ Modifier.
      </p>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12,
      }}>
        <WizardField
          label="TJM client min"
          hint="prix journalier minimum négocié avec le client"
          value={tjmMin}
          onChange={setTjmMin}
          suffix="€/j"
          placeholder="500"
          required
        />
        <WizardField
          label="TJM client max"
          hint="optionnel — borne haute si négociation flexible"
          value={tjmMax}
          onChange={setTjmMax}
          suffix="€/j"
          placeholder="650"
        />
        <WizardField
          label="Durée prévue"
          hint="en mois calendaires"
          value={duration}
          onChange={setDuration}
          suffix="mois"
          placeholder="12"
          required
          max={120}
        />
        <WizardField
          label="Brut ciblé candidat"
          hint="optionnel — proposition de départ"
          value={targetGross}
          onChange={setTargetGross}
          suffix="€/an"
          placeholder="45 000"
          step={500}
        />
        <WizardDateField
          label="Date de démarrage"
          hint="ancre le calendrier de la mission"
          value={startDate}
          onChange={setStartDate}
          required
        />
      </div>

      {error && (
        <div style={{
          marginTop: 12, padding: "9px 12px",
          background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 9,
          fontSize: 12, color: "#B91C1C",
        }}>
          ⚠ {error}
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          onClick={onSubmit}
          disabled={!valid || saving}
          style={{
            padding: "10px 22px", fontSize: 13, fontWeight: 700,
            color: "white",
            background: valid && !saving
              ? "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)"
              : "#C7BFE3",
            border: "none", borderRadius: 10,
            cursor: valid && !saving ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}
        >
          {saving ? "Enregistrement…" : "✓ Valider et chiffrer"}
        </button>
      </div>
    </m.div>
  )
}

function WizardField({
  label, hint, value, onChange, suffix, placeholder, required, max, step,
}: {
  label: string
  hint?: string
  value: string
  onChange: (s: string) => void
  suffix: string
  placeholder?: string
  required?: boolean
  max?: number
  step?: number
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#374151" }}>
        {label} {required && <span style={{ color: "#B91C1C" }}>*</span>}
      </span>
      {hint && <span style={{ fontSize: 10.5, color: "#9CA3AF" }}>{hint}</span>}
      <div style={{
        display: "flex", alignItems: "baseline", gap: 6,
        padding: "10px 12px",
        background: "#FAFAFA", border: "1px solid #E5E7EB", borderRadius: 9,
      }}>
        <input
          type="number" inputMode="decimal"
          min={0} max={max} step={step ?? 1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1, minWidth: 0,
            fontSize: 14, fontWeight: 700, color: "#111827",
            background: "transparent", border: "none", outline: "none",
            padding: 0, fontFamily: "inherit",
            fontVariantNumeric: "tabular-nums",
            appearance: "textfield",
          }}
        />
        <span style={{ fontSize: 11.5, color: "#9CA3AF", flexShrink: 0 }}>{suffix}</span>
      </div>
    </label>
  )
}

function WizardDateField({
  label, hint, value, onChange, required,
}: {
  label: string
  hint?: string
  value: string
  onChange: (s: string) => void
  required?: boolean
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#374151" }}>
        {label} {required && <span style={{ color: "#B91C1C" }}>*</span>}
      </span>
      {hint && <span style={{ fontSize: 10.5, color: "#9CA3AF" }}>{hint}</span>}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "10px 12px",
          fontSize: 14, fontWeight: 700, color: "#111827",
          background: "#FAFAFA", border: "1px solid #E5E7EB", borderRadius: 9,
          outline: "none", fontFamily: "inherit",
        }}
      />
    </label>
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
