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
  /** Derniers réglages persistés par le sourceur sur ce candidat × mission. */
  pricingTjm: number | null
  pricingBrut: number | null
}

export default function PricingMissionPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const sb = useMemo(() => getSupabase(), [])

  const [job, setJob] = useState<Job | null>(null)
  const [candidates, setCandidates] = useState<PricingCandidate[]>([])
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  // Wizard mission piloté par la page parent — permet au widget pricing de
  // demander une réouverture du wizard via le bouton "⚙ Modifier la mission".
  const [missionEditOpen, setMissionEditOpen] = useState(false)

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

      // Seuls les candidats explicitement ajoutés à la pipeline pour cette
      // mission sont chiffrables. On évite ainsi le déversoir de tous les
      // matchs ≥60 — le sourceur ne chiffre que ce qu'il poursuit vraiment.
      const { data: matches } = await sb
        .from("match_assessments")
        .select("id, score, match_tier, pricing_tjm, pricing_brut, candidate:candidates(*)")
        .eq("job_id", jobId)
        .eq("in_pipeline", true)
        .order("score", { ascending: false, nullsFirst: false })

      if (!mounted) return
      const rows: PricingCandidate[] = ((matches ?? []) as unknown as {
        id: string
        score: number | null
        match_tier: MatchTier | null
        pricing_tjm: number | null
        pricing_brut: number | null
        candidate: Candidate | null
      }[])
        .filter((r) => r.candidate !== null)
        .map((r) => ({
          matchId: r.id,
          candidate: r.candidate as Candidate,
          score: r.score,
          matchTier: r.match_tier,
          pricingTjm: r.pricing_tjm,
          pricingBrut: r.pricing_brut,
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

      {/* Détection mission paramétrée : si non OU si force édition → wizard, sinon → résumé compact */}
      <MissionConfigZone
        job={job}
        onPatched={(next) => setJob(next)}
        forceEdit={missionEditOpen}
        onCloseEdit={() => setMissionEditOpen(false)}
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
                <PricingWidget
                  candidate={selected.candidate}
                  job={job}
                  matchId={selected.matchId}
                  initialTjm={selected.pricingTjm}
                  initialBrut={selected.pricingBrut}
                  onEditMission={() => setMissionEditOpen(true)}
                />
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
 *  - Lieu typé (pour les plafonds URSSAF)
 *  Le brut ciblé et les overrides marges sont optionnels. */
function isMissionConfigured(job: Job): boolean {
  const hasTjm = job.client_tjm_min != null || job.client_tjm_max != null
  const hasDuration = job.duration_months != null
  const hasStart = job.start_date != null
  const hasLieu = job.pricing_lieu != null
  return hasTjm && hasDuration && hasStart && hasLieu
}

const LIEU_LABELS: Record<NonNullable<Job["pricing_lieu"]>, string> = {
  paris_petite_couronne: "Paris / Petite Couronne",
  idf_grande_couronne:   "Île-de-France (grande couronne)",
  lyon:                  "Lyon",
  province:              "Province",
}

function MissionConfigZone({
  job, onPatched, forceEdit, onCloseEdit,
}: {
  job: Job
  onPatched: (next: Job) => void
  forceEdit?: boolean
  onCloseEdit?: () => void
}) {
  const [internalEdit, setInternalEdit] = useState(false)
  const configured = isMissionConfigured(job)
  const showWizard = !configured || forceEdit || internalEdit

  if (showWizard) {
    return (
      <MissionConfigWizard
        job={job}
        onPatched={(next) => {
          onPatched(next)
          setInternalEdit(false)
          onCloseEdit?.()
        }}
        onCancel={configured ? () => {
          setInternalEdit(false)
          onCloseEdit?.()
        } : undefined}
      />
    )
  }

  return (
    <MissionConfigSummary
      job={job}
      onEdit={() => setInternalEdit(true)}
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
  const tjm = job.client_tjm_min ?? job.client_tjm_max
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
      <span>· TJM {tjm ?? "?"} €/j</span>
      <span>· {job.duration_months} mois</span>
      {job.contract_type && <span>· {job.contract_type}</span>}
      {job.pricing_lieu && <span>· {LIEU_LABELS[job.pricing_lieu]}</span>}
      <span>· début {startStr}</span>
      {job.target_gross_salary != null && (
        <span>· brut ciblé {Math.round(job.target_gross_salary).toLocaleString("fr-FR")} €/an</span>
      )}
      {(job.has_grand_deplacement || job.is_expatriated) && (
        <span style={{
          fontSize: 10.5, fontWeight: 700, color: "#7C63C8",
          background: "rgba(124,99,200,0.10)", border: "1px solid rgba(124,99,200,0.22)",
          borderRadius: 100, padding: "1px 8px",
        }}>
          {job.has_grand_deplacement && "Grand déplacement"}
          {job.has_grand_deplacement && job.is_expatriated && " · "}
          {job.is_expatriated && "Expatrié"}
        </span>
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

/** Wizard de paramétrage mission — strict nécessaire + activations conditionnelles. */
function MissionConfigWizard({
  job, onPatched, onCancel,
}: {
  job: Job
  onPatched: (next: Job) => void
  onCancel?: () => void
}) {
  const numToStr = (n: number | null | undefined): string =>
    n == null ? "" : String(n)

  // Champs requis
  const [tjm, setTjm] = useState<string>(numToStr(job.client_tjm_min ?? job.client_tjm_max))
  const [duration, setDuration] = useState<string>(numToStr(job.duration_months))
  const [contractType, setContractType] = useState<string>(job.contract_type ?? "CDI")
  const [startDate, setStartDate] = useState<string>(job.start_date ?? "")
  const [lieu, setLieu] = useState<string>(job.pricing_lieu ?? "paris_petite_couronne")

  // Optionnels
  const [targetGross, setTargetGross] = useState<string>(numToStr(job.target_gross_salary))
  const [marginMin, setMarginMin] = useState<string>(numToStr(job.margin_min_pct))
  const [marginTarget, setMarginTarget] = useState<string>(numToStr(job.margin_target_pct))

  // Flags d'activation des tarifs cabinet
  const [grandDeplacement, setGrandDeplacement] = useState<boolean>(job.has_grand_deplacement)
  const [expatriated, setExpatriated] = useState<boolean>(job.is_expatriated)

  // Section avancée (overrides marges) repliable
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(
    job.margin_min_pct != null || job.margin_target_pct != null,
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parseNum = (s: string): number | null => {
    if (!s.trim()) return null
    const n = Number(s.replace(",", "."))
    return Number.isFinite(n) ? n : null
  }

  const tjmNum = parseNum(tjm)
  const durationNum = parseNum(duration)
  const targetGrossNum = parseNum(targetGross)
  const marginMinNum = parseNum(marginMin)
  const marginTargetNum = parseNum(marginTarget)
  const valid = tjmNum != null && durationNum != null && startDate !== "" && lieu !== ""
  // Validation override marges si saisis : cible ≥ mini
  const marginsInvalid =
    marginMinNum != null && marginTargetNum != null && marginTargetNum < marginMinNum

  const onSubmit = async () => {
    if (!valid || marginsInvalid || saving) return
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_tjm_min: tjmNum,
          client_tjm_max: null,  // plus utilisé — TJM unique
          duration_months: durationNum,
          target_gross_salary: targetGrossNum,
          contract_type: contractType,
          start_date: startDate || null,
          pricing_lieu: lieu,
          has_grand_deplacement: grandDeplacement,
          is_expatriated: expatriated,
          margin_min_pct: marginMinNum,
          margin_target_pct: marginTargetNum,
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
        border: "1.5px solid rgba(124,99,200,0.30)",
        borderRadius: 14, padding: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: "#7C63C8",
          letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          📋 Paramétrage mission
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
        Renseigne ce qui dépend de cette mission. Les avantages cabinet sont déjà appliqués
        d&apos;office ; les deux toggles plus bas activent les tarifs conditionnels (grand
        déplacement, expatriation).
      </p>

      {/* Champs essentiels */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12,
      }}>
        <WizardField
          label="TJM client cible"
          hint="prix journalier négocié — le slider explorera autour"
          value={tjm}
          onChange={setTjm}
          suffix="€/j"
          placeholder="600"
          required
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
        <WizardDateField
          label="Date de démarrage"
          hint="ancre le calendrier de la mission"
          value={startDate}
          onChange={setStartDate}
          required
        />
        <WizardSelectField
          label="Type de contrat"
          hint="détermine essai (3/5/7 mois) et scénario rupture"
          value={contractType}
          onChange={setContractType}
          options={[
            { value: "CDI", label: "CDI" },
            { value: "CDD", label: "CDD" },
          ]}
        />
        <WizardSelectField
          label="Lieu de mission"
          hint="impacte le plafond URSSAF grand déplacement"
          value={lieu}
          onChange={setLieu}
          options={[
            { value: "paris_petite_couronne", label: "Paris / Petite Couronne" },
            { value: "idf_grande_couronne",   label: "Île-de-France (grande couronne)" },
            { value: "lyon",                  label: "Lyon" },
            { value: "province",              label: "Province" },
          ]}
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
      </div>

      {/* Activations conditionnelles — tarifs cabinet appliqués si oui */}
      <div style={{
        marginTop: 16,
        padding: "12px 14px",
        background: "rgba(124,99,200,0.04)",
        border: "1px solid #F0ECF8", borderRadius: 10,
      }}>
        <p style={{
          margin: "0 0 10px", fontSize: 10.5, fontWeight: 700, color: "#7C63C8",
          letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          Activations conditionnelles
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <WizardToggleRow
            label="Mission avec grand déplacement"
            hint="active le tarif URSSAF grand déplacement défini en paramètres cabinet"
            enabled={grandDeplacement}
            onToggle={setGrandDeplacement}
          />
          <WizardToggleRow
            label="Mission expatriée"
            hint="active la prime d'expatriation définie en paramètres cabinet"
            enabled={expatriated}
            onToggle={setExpatriated}
          />
        </div>
      </div>

      {/* Section avancée : overrides marges */}
      <div style={{ marginTop: 14 }}>
        <button
          onClick={() => setAdvancedOpen((v) => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 11.5, fontWeight: 600, color: "#7C63C8",
            background: "transparent", border: "none", cursor: "pointer",
            padding: "4px 0", fontFamily: "inherit",
          }}
        >
          <span style={{
            display: "inline-block", width: 9, fontSize: 11,
            transform: advancedOpen ? "rotate(90deg)" : "none",
            transition: "transform 140ms",
          }}>›</span>
          Overrides marges <span style={{ color: "#9CA3AF", fontWeight: 400 }}>· optionnel, défaut = cabinet</span>
        </button>
        {advancedOpen && (
          <div style={{
            marginTop: 8, padding: "12px 14px",
            background: "#FAFAFA", border: "1px solid #F0ECF8", borderRadius: 10,
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
          }}>
            <WizardField
              label="Marge mini override"
              hint="vide = défaut cabinet"
              value={marginMin}
              onChange={setMarginMin}
              suffix="%"
              placeholder="vide = cabinet"
              max={50}
              step={0.5}
            />
            <WizardField
              label="Marge cible override"
              hint="vide = défaut cabinet"
              value={marginTarget}
              onChange={setMarginTarget}
              suffix="%"
              placeholder="vide = cabinet"
              max={50}
              step={0.5}
            />
            {marginsInvalid && (
              <p style={{
                gridColumn: "1 / -1", margin: 0,
                padding: "8px 10px", fontSize: 11.5, color: "#B91C1C",
                background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.25)",
                borderRadius: 8,
              }}>
                ⚠ La marge cible doit être ≥ la marge mini.
              </p>
            )}
          </div>
        )}
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
          disabled={!valid || marginsInvalid || saving}
          style={{
            padding: "10px 22px", fontSize: 13, fontWeight: 700,
            color: "white",
            background: valid && !marginsInvalid && !saving
              ? "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)"
              : "#C7BFE3",
            border: "none", borderRadius: 10,
            cursor: valid && !marginsInvalid && !saving ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}
        >
          {saving ? "Enregistrement…" : "✓ Valider et chiffrer"}
        </button>
      </div>
    </m.div>
  )
}

/** Toggle row pour les flags d'activation conditionnelle. */
function WizardToggleRow({
  label, hint, enabled, onToggle,
}: {
  label: string
  hint: string
  enabled: boolean
  onToggle: (on: boolean) => void
}) {
  return (
    <button
      onClick={() => onToggle(!enabled)}
      style={{
        display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center",
        padding: "9px 12px",
        background: enabled ? "rgba(124,99,200,0.08)" : "white",
        border: enabled ? "1px solid rgba(124,99,200,0.30)" : "1px solid #F0ECF8",
        borderRadius: 9, cursor: "pointer", textAlign: "left", fontFamily: "inherit",
      }}
    >
      <span style={{
        width: 20, height: 20, borderRadius: 6,
        border: enabled ? "none" : "1.5px solid #D1D5DB",
        background: enabled ? "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)" : "white",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        {enabled && (
          <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
            <path d="M1 4.5L4 7.5L10 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <div>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "#111827" }}>{label}</p>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: "#9CA3AF", lineHeight: 1.4 }}>{hint}</p>
      </div>
      <span style={{ fontSize: 10.5, color: enabled ? "#7C63C8" : "#9CA3AF", fontWeight: 700 }}>
        {enabled ? "Actif" : "Inactif"}
      </span>
    </button>
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

function WizardSelectField({
  label, hint, value, onChange, options,
}: {
  label: string
  hint?: string
  value: string
  onChange: (s: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#374151" }}>{label}</span>
      {hint && <span style={{ fontSize: 10.5, color: "#9CA3AF" }}>{hint}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "10px 12px",
          fontSize: 14, fontWeight: 700, color: "#111827",
          background: "#FAFAFA", border: "1px solid #E5E7EB", borderRadius: 9,
          outline: "none", fontFamily: "inherit", appearance: "none",
          backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'><path fill=\'%239CA3AF\' d=\'M5 6L0 0h10z\'/></svg>")',
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 14px center",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
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
        Aucun candidat à chiffrer
      </h3>
      <p style={{
        margin: "0 auto 16px", maxWidth: 460, fontSize: 13, color: "#6B7280",
        lineHeight: 1.6,
      }}>
        Seuls les candidats <strong>ajoutés à la pipeline</strong> apparaissent ici.
        Depuis la fiche mission, clique <strong>+ Pipeline</strong> sur les profils que
        tu veux chiffrer.
      </p>
      <Link href={`/workspace/missions/${jobId}`} style={{
        display: "inline-block",
        fontSize: 12.5, fontWeight: 700, color: "white",
        background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
        borderRadius: 10, padding: "9px 16px", textDecoration: "none",
      }}>
        Fiche mission →
      </Link>
    </m.div>
  )
}

const mainStyle: React.CSSProperties = {
  minHeight: "calc(100vh - 60px)",
  padding: "24px 24px 80px",
  maxWidth: 1480, margin: "0 auto",
  fontFamily: "var(--font-inter), sans-serif",
}
