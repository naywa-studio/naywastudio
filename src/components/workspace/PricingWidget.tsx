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
  type Statut,
  type Modalite,
  type Lieu,
  type Avantages,
} from "@/lib/pricing/syntec"
import MonthlyMarginChart from "@/components/workspace/MonthlyMarginChart"
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
  ticketsResto: 6,             // €/jour travaillé
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
        .select("pricing_billable_days_per_month, pricing_margin_min_pct, pricing_margin_target_pct, pricing_default_lieu, pricing_default_modalite, pricing_default_avantages")
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
  // Jours/mois utilisés UNIQUEMENT par le KPI marge mensuelle moyenne et
  // par la résolution inverse brut max (les seuils). Le chart en bas utilise
  // les VRAIS jours du calendrier. 21 = moyenne France (252 j ouvrés/12).
  const joursParMois = profile?.pricing_billable_days_per_month ?? 21

  // Inputs the sourceur can edit — initial values derived from the mission so
  // the calculator is immediately useful. Pas de pivot : la marge est
  // toujours dérivée (TJM × jours − coût employeur). On expose donc 2
  // sliders (TJM, brut) et on affiche la marge en KPI read-only.
  const initialTjm = useMemo(() => {
    const min = job?.client_tjm_min
    const max = job?.client_tjm_max
    if (min != null && max != null) return Math.round((min + max) / 2)
    if (min != null) return min
    if (max != null) return max
    return 550
  }, [job?.client_tjm_min, job?.client_tjm_max])
  const initialBrut = job?.target_gross_salary ?? 45000

  const [tjm, setTjm] = useState<number>(initialTjm)
  const [brutAnnuel, setBrutAnnuel] = useState<number>(initialBrut)

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
    }),
    [preset, modalite, lieu, avantages, joursParMois],
  )

  // Live margin computation — la marge est toujours la résultante de
  // (TJM, brut). On la calcule avec computeTriangle(pivot="marge").
  const triangle = useMemo(() => {
    try {
      const inputs = buildInputs(brutAnnuel)
      const { brutAnnuel: _brut, ...baseInputs } = inputs
      void _brut
      return computeTriangle(
        "marge",
        { tjm, brutAnnuel, margeMensuelle: 0 },
        baseInputs,
      )
    } catch {
      return null
    }
  }, [tjm, brutAnnuel, buildInputs])

  const cost = useMemo(
    () => computeEmployerCost(buildInputs(brutAnnuel)),
    [brutAnnuel, buildInputs],
  )

  const minimumCheck = useMemo(
    () => validateAgainstMinimum(buildInputs(brutAnnuel)),
    [brutAnnuel, buildInputs],
  )

  // Seuils marge — UNIQUEMENT depuis les paramètres cabinet (pas de
  // surcharge par mission, c'est une règle de cabinet).
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
      // Brut minimum = max(minimum conventionnel Syntec, 0)
      const brutMinAnnuel = (minimumCheck.minimumMensuel ?? 0) * 12
      return {
        brutMax: brutMaxResult.brutAnnuel,
        brutIdeal: brutIdealResult.brutAnnuel,
        brutMin: brutMinAnnuel,
      }
    } catch {
      return null
    }
  }, [tjm, brutAnnuel, buildInputs, joursParMois, margeMinPct, margeTargetPct, minimumCheck.minimumMensuel])

  // Bornes des sliders. TJM = entre client_tjm_min et client_tjm_max si
  // définis sinon plage permissive autour de la valeur. Brut = entre le
  // minimum Syntec et le brut max proposable (marge mini respectée).
  const tjmMinBound = job?.client_tjm_min ?? Math.max(200, tjm - 300)
  const tjmMaxBound = job?.client_tjm_max ?? tjm + 400
  const brutMinBound = Math.max(
    Math.round((minimumCheck.minimumMensuel ?? 0) * 12),
    20000,
  )
  const brutMaxBound = limits?.brutMax
    ? Math.max(Math.round(limits.brutMax), brutMinBound + 5000)
    : Math.max(brutAnnuel + 20000, 80000)

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

      {/* Sliders TJM + Brut → la marge en résultante */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
        <SliderField
          label="TJM client"
          value={tjm}
          min={Math.max(100, Math.round(tjmMinBound))}
          max={Math.round(tjmMaxBound)}
          step={5}
          suffix="€/j"
          onChange={setTjm}
          range={job?.client_tjm_min != null || job?.client_tjm_max != null
            ? `mission : ${job?.client_tjm_min ?? "—"} → ${job?.client_tjm_max ?? "—"} €/j`
            : "aucune borne mission — entrez TJM min/max sur la fiche"}
        />
        <SliderField
          label="Brut candidat"
          value={brutAnnuel}
          min={brutMinBound}
          max={brutMaxBound}
          step={500}
          suffix="€/an"
          onChange={setBrutAnnuel}
          range={limits ? `min Syntec ${formatEur0(brutMinBound)} · max marge ${margeMinPct}% : ${formatEur0(limits.brutMax)} · idéal ${margeTargetPct}% : ${formatEur0(limits.brutIdeal)}` : ""}
          markers={limits ? [
            { value: Math.round(limits.brutIdeal), label: `💎 ${margeTargetPct}%`, color: "#16a34a" },
            { value: Math.round(limits.brutMax),   label: `🎯 ${margeMinPct}%`,    color: "#D97706" },
          ] : []}
        />

        {/* KPI marge résultante — readonly */}
        <MargeResultCard
          margeMensuelle={triangle?.margeMensuelle ?? 0}
          margePct={triangle?.margePct ?? 0}
          margeMinPct={margeMinPct}
          margeTargetPct={margeTargetPct}
        />
      </div>

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

      {/* Marge mensuelle réelle — calendrier français, mois par mois */}
      <div style={{ marginTop: 16 }}>
        <MonthlyMarginChart
          inputs={buildInputs(brutAnnuel)}
          startDate={job?.start_date ?? null}
          durationMonths={job?.duration_months ?? 12}
          tjm={tjm}
          margeMinPct={margeMinPct}
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

function formatEur0(v: number): string {
  return `${Math.round(v).toLocaleString("fr-FR")} €`
}

/* Slider + numeric input. Markers (dots) on the track help land on the
   "idéal" and "max" brut points. */
function SliderField({
  label, value, min, max, step, suffix, onChange, range, markers,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix: string
  onChange: (v: number) => void
  range?: string
  markers?: { value: number; label: string; color: string }[]
}) {
  const safeMin = Math.min(min, value)
  const safeMax = Math.max(max, value)
  const pct = (v: number) =>
    safeMax === safeMin ? 0 : ((v - safeMin) / (safeMax - safeMin)) * 100
  return (
    <div style={{
      background: "white", border: "1.5px solid #F0ECF8",
      borderRadius: 12, padding: 12,
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 10.5, fontWeight: 700, color: "#9CA3AF",
          letterSpacing: "0.05em", textTransform: "uppercase",
        }}>
          {label}
        </span>
        <div style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
          <input
            type="number"
            value={Math.round(value)}
            min={safeMin} max={safeMax} step={step}
            onChange={(e) => onChange(Number(e.target.value))}
            style={{
              fontSize: 18, fontWeight: 800, color: "#111827",
              background: "transparent", border: "none", outline: "none",
              padding: 0, width: 100, textAlign: "right",
              fontFamily: "inherit",
              fontVariantNumeric: "tabular-nums",
              appearance: "textfield",
            }}
          />
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>{suffix}</span>
        </div>
      </div>
      <div style={{ position: "relative", padding: "4px 0" }}>
        <input
          type="range"
          value={value}
          min={safeMin} max={safeMax} step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            width: "100%", appearance: "none", height: 4,
            background: "linear-gradient(to right, #C7BFE3, #7C63C8)",
            borderRadius: 100, outline: "none",
            cursor: "pointer",
          }}
        />
        {markers && markers.map((m) => {
          const left = pct(m.value)
          if (left < 0 || left > 100) return null
          return (
            <div key={m.label} style={{
              position: "absolute", left: `${left}%`, top: 14,
              transform: "translateX(-50%)",
              fontSize: 10, color: m.color, whiteSpace: "nowrap",
              fontWeight: 700, pointerEvents: "none",
            }}>
              <span style={{
                display: "block", width: 1.5, height: 8,
                background: m.color, margin: "0 auto",
              }} />
              <span style={{ display: "block", paddingTop: 2 }}>{m.label}</span>
            </div>
          )
        })}
      </div>
      {range && (
        <p style={{
          margin: markers && markers.length > 0 ? "18px 0 0" : 0,
          fontSize: 10.5, color: "#9CA3AF", lineHeight: 1.4,
        }}>
          {range}
        </p>
      )}
    </div>
  )
}

function MargeResultCard({
  margeMensuelle, margePct, margeMinPct, margeTargetPct,
}: {
  margeMensuelle: number
  margePct: number
  margeMinPct: number
  margeTargetPct: number
}) {
  const color =
    margePct >= margeTargetPct ? "#15803d" :
    margePct >= margeMinPct    ? "#B45309" :
                                 "#B91C1C"
  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(124,99,200,0.06), rgba(124,99,200,0.02))",
      border: "1.5px solid rgba(124,99,200,0.25)",
      borderRadius: 12, padding: "12px 14px",
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      gap: 8, flexWrap: "wrap",
    }}>
      <span style={{
        fontSize: 10.5, fontWeight: 700, color: "#7C63C8",
        letterSpacing: "0.05em", textTransform: "uppercase",
      }}>
        ⟲ Marge mensuelle (résultante)
      </span>
      <div style={{ display: "inline-flex", alignItems: "baseline", gap: 10 }}>
        <span style={{
          fontSize: 20, fontWeight: 800, color: "#111827",
          fontVariantNumeric: "tabular-nums",
        }}>
          {Math.round(margeMensuelle).toLocaleString("fr-FR")} €/mois
        </span>
        <span style={{
          fontSize: 14, fontWeight: 800, color,
          fontVariantNumeric: "tabular-nums",
        }}>
          {margePct.toFixed(1)} %
        </span>
      </div>
    </div>
  )
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
  // Le coût total est splitté en FIXE mensuel (ne dépend pas des jours) et
  // VARIABLE journalier (URSSAF + tickets, varient avec les jours réels du
  // mois). Le chart en bas applique le vrai split mois par mois ; ici on
  // détaille la composition.

  // Re-décomposition du coût fixe pour l'affichage
  const remunCotisable = cost.brutMensuel + cost.treiziemeMoisMensualise + cost.primeVacancesMensualisee
  // Avantages mensuels fixes = coutFixeMensuel − (brut + 13e + prime + charges + prime coopt)
  const avantagesFixesMensuels = cost.coutFixeMensuel
    - remunCotisable
    - cost.chargesPatronales
    - cost.primeCooptationMensualisee

  const fixedRows: { label: string; value: number; hint?: string }[] = [
    { label: "Brut mensuel", value: cost.brutMensuel },
    { label: "Prime de vacances (Art. 31)", value: cost.primeVacancesMensualisee, hint: "≈ 1% du brut, mensualisée" },
    { label: "13ᵉ mois mensualisé", value: cost.treiziemeMoisMensualise },
    { label: `Charges patronales (${(cost.tauxCharges * 100).toFixed(1)}%)`, value: cost.chargesPatronales },
    { label: "Mutuelle + transport + médecine + autres (mensuels fixes)", value: avantagesFixesMensuels },
    { label: "Prime cooptation mensualisée", value: cost.primeCooptationMensualisee },
  ]

  return (
    <div style={{
      marginTop: 10, padding: 14, background: "#FAFAFA",
      borderRadius: 10, border: "1px solid #F0ECF8",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      {/* Bloc FIXE */}
      <div style={{
        fontSize: 10.5, fontWeight: 700, color: "#9CA3AF",
        letterSpacing: "0.05em", textTransform: "uppercase",
        marginBottom: 2,
      }}>
        Coût fixe mensuel (constant chaque mois)
      </div>
      {fixedRows.filter((r) => r.value !== 0).map((r) => (
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
        marginTop: 4, paddingTop: 6, borderTop: "1px dashed #E5E7EB",
        display: "flex", justifyContent: "space-between",
        fontSize: 12.5, fontWeight: 700, color: "#374151",
      }}>
        <span>Sous-total fixe mensuel</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {Math.round(cost.coutFixeMensuel).toLocaleString("fr-FR")} € / mois
        </span>
      </div>

      {/* Bloc VARIABLE */}
      {cost.coutVariableJournalier > 0 && (
        <>
          <div style={{
            fontSize: 10.5, fontWeight: 700, color: "#9CA3AF",
            letterSpacing: "0.05em", textTransform: "uppercase",
            marginTop: 10, marginBottom: 2,
          }}>
            Coût variable journalier (× jours travaillés réels)
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            fontSize: 12.5, color: "#4B5563",
          }}>
            <span>
              URSSAF + tickets resto cumulés (par jour travaillé)
              <span style={{ color: "#9CA3AF", marginLeft: 6 }}>· variable selon le mois</span>
            </span>
            <span style={{ fontWeight: 700, color: "#111827", fontVariantNumeric: "tabular-nums" }}>
              {cost.coutVariableJournalier.toFixed(2)} € / jour
            </span>
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            fontSize: 11.5, color: "#9CA3AF",
          }}>
            <span>Ex : sur un mois à 21 jours ouvrés</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {Math.round(cost.coutVariableJournalier * 21).toLocaleString("fr-FR")} €
            </span>
          </div>
        </>
      )}

      {/* Total approximatif */}
      <div style={{
        marginTop: 8, paddingTop: 8, borderTop: "1px solid #E5E7EB",
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        fontSize: 13, fontWeight: 800, color: "#7C63C8",
      }}>
        <span>
          Coût total estimé
          <span style={{ fontSize: 11, fontWeight: 500, color: "#9CA3AF", marginLeft: 6 }}>
            · sur mois moyen 21 j
          </span>
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {Math.round(cost.coutFixeMensuel + cost.coutVariableJournalier * 21).toLocaleString("fr-FR")} € / mois
        </span>
      </div>
      <p style={{
        margin: "4px 0 0", fontSize: 11, color: "#9CA3AF",
        fontStyle: "italic", lineHeight: 1.4,
      }}>
        Le chart en bas applique le vrai nombre de jours travaillés de chaque
        mois calendaire (19 j en novembre, 23 j en octobre…) — le coût total
        réel varie donc légèrement chaque mois.
      </p>
    </div>
  )
}

// `PricingInputs` is used as a return type in buildInputs; no probe needed.
export type { PricingInputs }
