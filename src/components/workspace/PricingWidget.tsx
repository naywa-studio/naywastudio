"use client"

/**
 * PricingWidget — chiffrage en direct sur la fiche match.
 *
 * Donné un candidat + une mission, le widget :
 *   - auto-détecte la séniorité depuis le parsed_cv (XP + titre keywords)
 *   - laisse le sourceur ajuster statut / position / coefficient / modalité
 *   - pré-remplit les avantages depuis profiles.pricing_default_avantages
 *   - calcule en direct le triangle TJM / brut / marge avec un pivot
 *   - affiche le détail du coût employeur et l'alerte minimum conventionnel
 *
 * Le graphique des 3 scénarios rupture (tâche #7) viendra dans une seconde
 * passe, et la sauvegarde des chiffrages (#8) après ça.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  computeEmployerCost,
  computeTriangle,
  validateAgainstMinimum,
  type PricingInputs,
  type TrianglePivot,
  type Statut,
  type Modalite,
  type Lieu,
  type Avantages,
} from "@/lib/pricing/syntec"
import MarginEvolutionChart from "@/components/workspace/MarginEvolutionChart"
import type { Candidate, Job, ParsedCv, Profile } from "@/lib/database.types"
import { getSupabase } from "@/lib/supabase"

/* ──────────────────────────────────────────────────────────────────────────
 * Auto-detect séniorité from the parsed CV
 * ────────────────────────────────────────────────────────────────────────── */

type SenioritePreset = "junior" | "confirme" | "senior" | "lead_expert"

const PRESETS: Record<SenioritePreset, { statut: Statut; position: string; coefficient: number; modalite: Modalite; label: string }> = {
  junior:      { statut: "cadre", position: "1.2", coefficient: 100, modalite: "modalite_1", label: "Junior (0-3 ans XP)" },
  confirme:    { statut: "cadre", position: "2.1", coefficient: 115, modalite: "modalite_1", label: "Confirmé (4-7 ans XP)" },
  senior:      { statut: "cadre", position: "2.2", coefficient: 130, modalite: "modalite_3", label: "Senior (8-11 ans XP)" },
  lead_expert: { statut: "cadre", position: "3.1", coefficient: 170, modalite: "modalite_3", label: "Lead / Expert (12+ ans XP)" },
}

function detectSeniority(parsed: ParsedCv | null, currentTitle: string | null): SenioritePreset {
  const title = (parsed?.current_title ?? currentTitle ?? "").toLowerCase()
  const years = parsed?.years_experience ?? 0

  // Title keywords beat raw years when both signals exist
  if (/principal|staff|head\b|cto|directeur tech/.test(title)) return "lead_expert"
  if (/lead|architect|expert|manager principal/.test(title)) return "lead_expert"
  if (/senior|sr\.|sr\b|tech lead/.test(title) && years >= 7) return "senior"

  if (years >= 12) return "lead_expert"
  if (years >= 8) return "senior"
  if (years >= 4) return "confirme"
  return "junior"
}

/* ──────────────────────────────────────────────────────────────────────────
 * Defaults helpers
 * ────────────────────────────────────────────────────────────────────────── */

const FALLBACK_AVANTAGES: Avantages = {
  ticketsResto: 100,
  mutuellePremium: 45,
  transport: 42,
  forfaitMobilite: 0,
  treiziemeMois: false,
  primeCooptationAnnuelle: 0,
  autresMensuels: 0,
}

const LIEU_LABELS: Record<Lieu, string> = {
  paris_petite_couronne: "Paris + PC",
  idf_grande_couronne: "IDF grande couronne",
  lyon: "Lyon",
  province: "Province",
}

const STATUT_LABELS: Record<Statut, string> = {
  etam: "ETAM",
  etam_assimile_cadre: "ETAM Assimilé Cadre",
  cadre: "Cadre (Ingénieurs & Cadres)",
}

/* ──────────────────────────────────────────────────────────────────────────
 * Outer component — loads the profile defaults then mounts the inner widget.
 * Splitting in two avoids the "setState in useEffect" anti-pattern: the
 * inner component's useState initialisers see the profile via props.
 * ────────────────────────────────────────────────────────────────────────── */

type PricingProfile = Pick<Profile,
  | "pricing_billable_days_per_month"
  | "pricing_margin_min_pct"
  | "pricing_margin_target_pct"
  | "pricing_charges_rate_override"
  | "pricing_default_lieu"
  | "pricing_default_modalite"
  | "pricing_default_avantages"
> | null

export default function PricingWidget({
  candidate, job,
}: {
  candidate: Candidate
  job: Job | null
}) {
  const sb = useMemo(() => getSupabase(), [])
  const [profile, setProfile] = useState<PricingProfile | undefined>(undefined)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user || !mounted) return
      const { data } = await sb
        .from("profiles")
        .select("pricing_billable_days_per_month, pricing_margin_min_pct, pricing_margin_target_pct, pricing_charges_rate_override, pricing_default_lieu, pricing_default_modalite, pricing_default_avantages")
        .eq("user_id", user.id)
        .maybeSingle()
      if (mounted) setProfile(data ?? null)
    })()
    return () => { mounted = false }
  }, [sb])

  // Don't mount the inner widget until the profile has been loaded — keeps
  // the form initial values stable instead of jumping after the first paint.
  if (profile === undefined) {
    return (
      <section style={{
        background: "white", borderRadius: 16, border: "1px solid #F0ECF8",
        padding: 18, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, color: "#9CA3AF",
      }}>
        Chargement du chiffrage…
      </section>
    )
  }
  return <PricingWidgetInner candidate={candidate} job={job} profile={profile} />
}

function PricingWidgetInner({
  candidate, job, profile,
}: {
  candidate: Candidate
  job: Job | null
  profile: PricingProfile
}) {
  // Detected from parsed_cv at mount
  const detectedPreset = useMemo(
    () => detectSeniority(candidate.parsed_cv, candidate.current_title),
    [candidate.parsed_cv, candidate.current_title],
  )
  const [seniority, setSeniority] = useState<SenioritePreset>(detectedPreset)
  const preset = PRESETS[seniority]

  // Mission-context defaults pre-filled from the job + profile
  const lieu: Lieu = (job?.location?.toLowerCase().includes("paris")
    ? "paris_petite_couronne"
    : job?.location?.toLowerCase().includes("lyon")
      ? "lyon"
      : profile?.pricing_default_lieu as Lieu | undefined) ?? "paris_petite_couronne"

  const modalite: Modalite = preset.modalite
  const joursParMois = profile?.pricing_billable_days_per_month ?? 18

  // Inputs the sourceur can edit — initial values derived from the mission so
  // the calculator is immediately useful. The triangle has a "pivot" — the
  // field we SOLVE for; the two others are entered by the sourceur.
  // - TJM : mid of client_tjm_min/max if both exist, else either one, else 550
  // - Brut : target_gross_salary if set, else 45 000 €/an placeholder
  // - Marge : becomes the default pivot so we surface the value the sourceur
  //   actually needs to decide.
  const initialTjm = useMemo(() => {
    const min = job?.client_tjm_min
    const max = job?.client_tjm_max
    if (min != null && max != null) return Math.round((min + max) / 2)
    if (min != null) return min
    if (max != null) return max
    return 550
  }, [job?.client_tjm_min, job?.client_tjm_max])
  const initialBrut = job?.target_gross_salary ?? 45000

  const [pivot, setPivot] = useState<TrianglePivot>("marge")
  const [tjm, setTjm] = useState<number>(initialTjm)
  const [brutAnnuel, setBrutAnnuel] = useState<number>(initialBrut)
  const [margeMensuelle, setMargeMensuelle] = useState<number>(2000)

  // Initialise avantages from the profile defaults at mount. Subsequent
  // edits stay local — the paramétrage page is the only place where the
  // profile-level defaults are updated.
  const [avantages] = useState<Avantages>(() => ({
    ...FALLBACK_AVANTAGES,
    ...(profile?.pricing_default_avantages ?? {}),
  }))

  // Build the input object for the calculator
  const buildInputs = useCallback(
    (brut: number): PricingInputs => ({
      brutAnnuel: brut,
      statut: preset.statut,
      position: preset.position,
      coefficient: preset.coefficient,
      modalite,
      lieu,
      avantages,
      joursFacturablesParMois: joursParMois,
      tauxChargesPatronalesOverride:
        profile?.pricing_charges_rate_override ?? undefined,
    }),
    [preset, modalite, lieu, avantages, joursParMois, profile?.pricing_charges_rate_override],
  )

  // Live triangle computation — re-runs whenever any pinned input changes
  const triangle = useMemo(() => {
    try {
      const inputs = buildInputs(brutAnnuel)
      const { brutAnnuel: _brut, ...baseInputs } = inputs
      void _brut
      return computeTriangle(
        pivot,
        { tjm, brutAnnuel, margeMensuelle },
        baseInputs,
      )
    } catch {
      return null
    }
  }, [pivot, tjm, brutAnnuel, margeMensuelle, buildInputs])

  // Cost breakdown for the detail panel (uses the triangle's brut when pivot = brut)
  const cost = useMemo(() => {
    const finalBrut = triangle?.brutAnnuel ?? brutAnnuel
    return computeEmployerCost(buildInputs(finalBrut))
  }, [triangle, brutAnnuel, buildInputs])

  const minimumCheck = useMemo(() => {
    const finalBrut = triangle?.brutAnnuel ?? brutAnnuel
    return validateAgainstMinimum(buildInputs(finalBrut))
  }, [triangle, brutAnnuel, buildInputs])

  // "Brut maximum proposable" — la plus haute rémunération brute qu'on peut
  // proposer au candidat tout en préservant la marge minimum du cabinet.
  // Inversion du triangle : on fixe TJM + marge_min et on résout le brut.
  // Calculé uniquement quand le pivot N'EST PAS le brut (sinon doublon).
  const margeMinPct = profile?.pricing_margin_min_pct ?? 15
  const margeTargetPct = profile?.pricing_margin_target_pct ?? 22
  const limits = useMemo(() => {
    try {
      const baseInputs = (() => {
        const inputs = buildInputs(brutAnnuel)
        const { brutAnnuel: _b, ...rest } = inputs
        void _b
        return rest
      })()
      const revenuMensuel = tjm * joursParMois
      const margeMinMensuelle = revenuMensuel * (margeMinPct / 100)
      const margeTargetMensuelle = revenuMensuel * (margeTargetPct / 100)
      const brutMaxResult = computeTriangle("brut", { tjm, margeMensuelle: margeMinMensuelle }, baseInputs)
      const brutIdealResult = computeTriangle("brut", { tjm, margeMensuelle: margeTargetMensuelle }, baseInputs)
      return {
        brutMax: brutMaxResult.brutAnnuel,
        brutIdeal: brutIdealResult.brutAnnuel,
      }
    } catch {
      return null
    }
  }, [tjm, brutAnnuel, buildInputs, joursParMois, margeMinPct, margeTargetPct])

  const [showDetail, setShowDetail] = useState(false)

  return (
    <section style={{
      background: "white", borderRadius: 16, border: "1px solid #F0ECF8",
      padding: 18,
    }}>
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 12, gap: 10, flexWrap: "wrap",
      }}>
        <h3 style={{
          margin: 0, fontSize: 12, fontWeight: 700, color: "#9CA3AF",
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          💰 Chiffrage de la mission
        </h3>
        <Link href="/workspace/parametrage" style={{
          fontSize: 11.5, fontWeight: 600, color: "#7C63C8",
          textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4,
        }}>
          ⚙ Paramètres pricing
        </Link>
      </header>

      {/* Profile / candidate */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: "#6B7280" }}>Séniorité :</span>
        {(Object.keys(PRESETS) as SenioritePreset[]).map((k) => (
          <button
            key={k}
            onClick={() => setSeniority(k)}
            style={{
              fontSize: 12, fontWeight: 600,
              padding: "5px 11px", borderRadius: 100, cursor: "pointer",
              border: seniority === k ? "none" : "1px solid #E5E7EB",
              background: seniority === k
                ? "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)"
                : "white",
              color: seniority === k ? "white" : "#6B7280",
              fontFamily: "inherit",
            }}
          >
            {PRESETS[k].label.split(" ")[0]}
          </button>
        ))}
        {detectedPreset !== seniority && (
          <button
            onClick={() => setSeniority(detectedPreset)}
            style={{
              fontSize: 11, color: "#7C63C8",
              background: "transparent", border: "none", cursor: "pointer",
              textDecoration: "underline", padding: 0,
            }}
          >
            ↺ détecté : {PRESETS[detectedPreset].label.split(" ")[0]}
          </button>
        )}
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
        gap: 8, marginBottom: 14, fontSize: 11.5, color: "#6B7280",
      }}>
        <Pill label="Statut" value={STATUT_LABELS[preset.statut].split(" ")[0]} />
        <Pill label="Position" value={`${preset.position} · coef ${preset.coefficient}`} />
        <Pill label="Lieu" value={LIEU_LABELS[lieu]} />
      </div>

      {/* Triangle KPI — pivot mechanism */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8,
        marginBottom: 12,
      }}>
        <TriangleCard
          label="TJM client"
          value={triangle?.tjm}
          suffix="€ / j"
          isPivot={pivot === "tjm"}
          editable={pivot !== "tjm"}
          onPin={() => setPivot("tjm")}
          onChange={(v) => setTjm(v)}
        />
        <TriangleCard
          label="Brut candidat"
          value={triangle?.brutAnnuel}
          suffix="€ / an"
          isPivot={pivot === "brut"}
          editable={pivot !== "brut"}
          onPin={() => setPivot("brut")}
          onChange={(v) => setBrutAnnuel(v)}
        />
        <TriangleCard
          label="Marge mensuelle"
          value={triangle?.margeMensuelle}
          suffix="€ / mois"
          isPivot={pivot === "marge"}
          editable={pivot !== "marge"}
          onPin={() => setPivot("marge")}
          onChange={(v) => setMargeMensuelle(v)}
          marginPct={triangle?.margePct}
        />
      </div>

      {/* Brut limits — what the sourceur can actually propose */}
      {limits && tjm > 0 && (
        <BrutLimits
          brutMax={limits.brutMax}
          brutIdeal={limits.brutIdeal}
          margeMinPct={margeMinPct}
          margeTargetPct={margeTargetPct}
          onApplyIdeal={() => { setPivot("marge"); setBrutAnnuel(Math.round(limits.brutIdeal)) }}
          onApplyMax={() => { setPivot("marge"); setBrutAnnuel(Math.round(limits.brutMax)) }}
        />
      )}

      {/* Margin verdict */}
      {triangle && (
        <MarginVerdict
          margePct={triangle.margePct}
          margeMin={margeMinPct}
          margeCible={margeTargetPct}
        />
      )}

      {/* Convention minimum check */}
      {!minimumCheck.ok && (
        <div style={{
          marginTop: 10,
          padding: "9px 12px",
          background: "#FEF2F2", border: "1px solid #FECACA",
          borderRadius: 10, fontSize: 12, color: "#B91C1C", lineHeight: 1.5,
        }}>
          ⚠ {minimumCheck.message}
        </div>
      )}

      {/* Cost detail (collapsible) */}
      <button
        onClick={() => setShowDetail((v) => !v)}
        style={{
          marginTop: 12, fontSize: 12, fontWeight: 600, color: "#7C63C8",
          background: "transparent", border: "none", cursor: "pointer",
          fontFamily: "inherit", padding: 0,
        }}
      >
        {showDetail ? "▼ Masquer le détail coût employeur" : "▶ Voir le détail coût employeur"}
      </button>
      {showDetail && <CostBreakdown cost={cost} />}

      {/* Margin evolution chart — always shown, runs on a fixed 24-month
          horizon. When duration_months is set on the mission, it's drawn as
          a vertical "fin prévue" marker but doesn't constrain the X axis. */}
      <div style={{ marginTop: 16 }}>
        <MarginEvolutionChart
          inputs={buildInputs(triangle?.brutAnnuel ?? brutAnnuel)}
          dureeMois={job?.duration_months ?? 0}
          tjm={triangle?.tjm ?? tjm}
        />
      </div>
    </section>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Sub-components
 * ────────────────────────────────────────────────────────────────────────── */

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "#F8F6FF", border: "1px solid #F0ECF8",
      borderRadius: 8, padding: "6px 10px",
      display: "flex", flexDirection: "column", gap: 1,
    }}>
      <span style={{ fontSize: 10, color: "#9CA3AF", letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "#374151" }}>{value}</span>
    </div>
  )
}

function TriangleCard({
  label, value, suffix, isPivot, editable, onPin, onChange, marginPct,
}: {
  label: string
  value: number | undefined
  suffix: string
  isPivot: boolean
  editable: boolean
  onPin: () => void
  onChange: (v: number) => void
  marginPct?: number
}) {
  const display = value !== undefined && Number.isFinite(value)
    ? Math.round(value).toLocaleString("fr-FR")
    : "—"

  return (
    <div style={{
      background: isPivot ? "rgba(124,99,200,0.07)" : "white",
      border: `1.5px solid ${isPivot ? "rgba(124,99,200,0.35)" : "#F0ECF8"}`,
      borderRadius: 12, padding: 12,
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: isPivot ? "#7C63C8" : "#9CA3AF",
          letterSpacing: "0.05em", textTransform: "uppercase",
        }}>
          {label}
        </span>
        {!isPivot && (
          <button
            onClick={onPin}
            title="Calculer ce KPI à partir des deux autres"
            style={{
              fontSize: 10, color: "#9CA3AF", background: "transparent",
              border: "none", cursor: "pointer", padding: 0,
              textDecoration: "underline",
            }}
          >
            calculer
          </button>
        )}
        {isPivot && (
          <span style={{ fontSize: 10, color: "#7C63C8", fontWeight: 700 }}>
            ⟲ auto
          </span>
        )}
      </div>
      {editable ? (
        <input
          type="number"
          value={value !== undefined ? Math.round(value) : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            fontSize: 18, fontWeight: 800, color: "#111827",
            background: "transparent", border: "none", outline: "none",
            padding: 0, width: "100%", fontFamily: "inherit",
            // Hide spinner arrows for cleaner look
            appearance: "textfield",
          }}
        />
      ) : (
        <span style={{ fontSize: 18, fontWeight: 800, color: "#7C63C8" }}>
          {display}
        </span>
      )}
      <span style={{ fontSize: 10.5, color: "#9CA3AF" }}>{suffix}</span>
      {marginPct !== undefined && Number.isFinite(marginPct) && (
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: marginPct >= 20 ? "#15803d" : marginPct >= 10 ? "#B45309" : "#B91C1C",
        }}>
          {marginPct.toFixed(1)} % de marge
        </span>
      )}
    </div>
  )
}

function BrutLimits({
  brutMax, brutIdeal, margeMinPct, margeTargetPct, onApplyIdeal, onApplyMax,
}: {
  brutMax: number
  brutIdeal: number
  margeMinPct: number
  margeTargetPct: number
  onApplyIdeal: () => void
  onApplyMax: () => void
}) {
  const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €"
  return (
    <div style={{
      marginBottom: 10,
      padding: "10px 12px",
      background: "linear-gradient(135deg, rgba(124,99,200,0.05), rgba(217,119,6,0.04))",
      border: "1px solid rgba(124,99,200,0.18)",
      borderRadius: 12,
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
    }}>
      <button
        onClick={onApplyIdeal}
        title={`Applique ${fmt(brutIdeal)} comme brut candidat`}
        style={limitChipStyle("ideal")}
      >
        <span style={limitLabelStyle}>💎 Brut idéal</span>
        <span style={limitValueStyle}>{fmt(brutIdeal)}</span>
        <span style={limitHintStyle}>marge cible {margeTargetPct}%</span>
      </button>
      <button
        onClick={onApplyMax}
        title={`Applique ${fmt(brutMax)} comme brut candidat — plafond`}
        style={limitChipStyle("max")}
      >
        <span style={limitLabelStyle}>🎯 Brut max proposable</span>
        <span style={limitValueStyle}>{fmt(brutMax)}</span>
        <span style={limitHintStyle}>marge mini {margeMinPct}%</span>
      </button>
    </div>
  )
}

const limitLabelStyle: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: "#7C63C8",
  letterSpacing: "0.04em", textTransform: "uppercase",
}
const limitValueStyle: React.CSSProperties = {
  fontSize: 16, fontWeight: 800, color: "#111827",
  fontVariantNumeric: "tabular-nums",
}
const limitHintStyle: React.CSSProperties = {
  fontSize: 10.5, color: "#9CA3AF",
}
function limitChipStyle(kind: "ideal" | "max"): React.CSSProperties {
  return {
    cursor: "pointer", textAlign: "left", fontFamily: "inherit",
    background: "white",
    border: `1px solid ${kind === "ideal" ? "rgba(34,197,94,0.25)" : "rgba(217,119,6,0.30)"}`,
    borderRadius: 9, padding: "8px 11px",
    display: "flex", flexDirection: "column", gap: 1,
  }
}

function MarginVerdict({ margePct, margeMin, margeCible }: { margePct: number; margeMin: number; margeCible: number }) {
  let bg = "#F9FAFB"
  let bd = "#E5E7EB"
  let fg = "#6B7280"
  let label = ""
  if (margePct >= margeCible) {
    bg = "rgba(34,197,94,0.07)"; bd = "rgba(34,197,94,0.25)"; fg = "#15803d"
    label = `🎯 Marge ≥ cible (${margeCible}%) — mission rentable`
  } else if (margePct >= margeMin) {
    bg = "rgba(245,158,11,0.07)"; bd = "rgba(245,158,11,0.22)"; fg = "#B45309"
    label = `⚠ Marge sous la cible (${margeCible}%) mais au-dessus du plancher (${margeMin}%)`
  } else if (margePct >= 0) {
    bg = "#FEF2F2"; bd = "#FECACA"; fg = "#B91C1C"
    label = `🚨 Marge sous le plancher minimum (${margeMin}%)`
  } else {
    bg = "#FEF2F2"; bd = "#FECACA"; fg = "#B91C1C"
    label = `🚨 Mission en perte — refaire le chiffrage`
  }
  return (
    <div style={{
      padding: "8px 12px", background: bg, border: `1px solid ${bd}`,
      borderRadius: 10, fontSize: 12, color: fg, fontWeight: 600,
    }}>
      {label}
    </div>
  )
}

function CostBreakdown({ cost }: { cost: ReturnType<typeof computeEmployerCost> }) {
  const rows: { label: string; value: number; hint?: string }[] = [
    { label: "Brut mensuel", value: cost.brutMensuel },
    { label: "Prime de vacances (Art. 31)", value: cost.primeVacancesMensualisee, hint: "≈ 1% du brut, mensualisée" },
    { label: "13ᵉ mois mensualisé", value: cost.treiziemeMoisMensualise },
    { label: `Charges patronales (${(cost.tauxCharges * 100).toFixed(1)}%)`, value: cost.chargesPatronales },
    { label: "Avantages (tickets, mutuelle, transport…)", value: cost.avantagesMensuels },
    { label: "Prime cooptation mensualisée", value: cost.primeCooptationMensualisee },
  ]
  return (
    <div style={{
      marginTop: 10, padding: 14, background: "#FAFAFA",
      borderRadius: 10, border: "1px solid #F0ECF8",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      {rows.filter((r) => r.value !== 0).map((r) => (
        <div key={r.label} style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          fontSize: 12.5, color: "#4B5563",
        }}>
          <span>
            {r.label}
            {r.hint && <span style={{ color: "#9CA3AF", marginLeft: 6 }}>· {r.hint}</span>}
          </span>
          <span style={{ fontWeight: 700, color: "#111827", fontVariantNumeric: "tabular-nums" }}>
            {Math.round(r.value).toLocaleString("fr-FR")} €
          </span>
        </div>
      ))}
      <div style={{
        marginTop: 6, paddingTop: 8, borderTop: "1px solid #E5E7EB",
        display: "flex", justifyContent: "space-between",
        fontSize: 13, fontWeight: 800, color: "#7C63C8",
      }}>
        <span>Coût employeur total</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {Math.round(cost.coutTotalMensuel).toLocaleString("fr-FR")} € / mois
        </span>
      </div>
    </div>
  )
}

// `PricingInputs` is used as a return type in buildInputs; no probe needed.
export type { PricingInputs }
