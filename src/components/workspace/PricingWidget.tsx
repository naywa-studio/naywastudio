"use client"

/**
 * PricingWidget — chiffrage en direct sur la fiche match.
 *
 * Layout v3 (verdict-first + tabs) :
 *   - VERDICT HERO : 3 KPI cards (marge moyenne %, marge € totale, status go/no-go)
 *   - CONTEXT BAR : candidat sélectionné + séniorité (compact)
 *   - LEVIERS : sliders TJM + Brut en 2 colonnes
 *   - TABS : Marge mensuelle | Risque rupture | Détail coût
 *
 * Toute la logique métier est conservée (computeEmployerCost, computeMissionMargin,
 * computeTriangle, validateAgainstMinimum). Seul le rendu UI change.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  computeEmployerCost,
  computeTriangle,
  computeMissionMargin,
  validateAgainstMinimum,
  type PricingInputs,
  type Statut,
  type Modalite,
  type Lieu,
  type Avantages,
} from "@/lib/pricing/syntec"
import MonthlyMarginChart from "@/components/workspace/MonthlyMarginChart"
import RuptureRiskChart from "@/components/workspace/RuptureRiskChart"
import type { Candidate, Job, ParsedCv, Profile } from "@/lib/database.types"
import { getSupabase } from "@/lib/supabase"

/* ──────────────────────────────────────────────────────────────────────────
 * Auto-detect séniorité from the parsed CV
 * ────────────────────────────────────────────────────────────────────────── */

type SenioritePreset = "junior" | "confirme" | "senior" | "lead_expert"

const PRESETS: Record<SenioritePreset, { statut: Statut; position: string; coefficient: number; modalite: Modalite; label: string; short: string }> = {
  junior:      { statut: "cadre", position: "1.2", coefficient: 100, modalite: "modalite_1", label: "Junior (0-3 ans XP)",      short: "Junior" },
  confirme:    { statut: "cadre", position: "2.1", coefficient: 115, modalite: "modalite_1", label: "Confirmé (4-7 ans XP)",    short: "Confirmé" },
  senior:      { statut: "cadre", position: "2.2", coefficient: 130, modalite: "modalite_3", label: "Senior (8-11 ans XP)",     short: "Senior" },
  lead_expert: { statut: "cadre", position: "3.1", coefficient: 170, modalite: "modalite_3", label: "Lead / Expert (12+ ans XP)", short: "Lead/Expert" },
}

function detectSeniority(parsed: ParsedCv | null, currentTitle: string | null): SenioritePreset {
  const title = (parsed?.current_title ?? currentTitle ?? "").toLowerCase()
  const years = parsed?.years_experience ?? 0
  if (/principal|staff|head\b|cto|directeur tech/.test(title)) return "lead_expert"
  if (/lead|architect|expert|manager principal/.test(title)) return "lead_expert"
  if (/senior|sr\.|sr\b|tech lead/.test(title) && years >= 7) return "senior"
  if (years >= 12) return "lead_expert"
  if (years >= 8) return "senior"
  if (years >= 4) return "confirme"
  return "junior"
}

/* ──────────────────────────────────────────────────────────────────────────
 * Defaults
 * ────────────────────────────────────────────────────────────────────────── */

const FALLBACK_AVANTAGES: Avantages = {
  ticketsResto: 6,
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

/* ──────────────────────────────────────────────────────────────────────────
 * Outer wrapper — loads profile defaults
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
  candidate, job, onEditMission,
}: {
  candidate: Candidate
  job: Job | null
  /** Callback déclenché par le bouton "⚙ Modifier mission" — la page parent
   *  ouvre le wizard mission (MissionConfigWizard) avec les valeurs courantes. */
  onEditMission?: () => void
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
  return <PricingWidgetInner candidate={candidate} job={job} profile={profile} onEditMission={onEditMission} />
}

/* ──────────────────────────────────────────────────────────────────────────
 * Inner widget — full logic + new layout
 * ────────────────────────────────────────────────────────────────────────── */

function PricingWidgetInner({
  candidate, job, profile, onEditMission,
}: {
  candidate: Candidate
  job: Job | null
  profile: PricingProfile
  onEditMission?: () => void
}) {
  const detectedPreset = useMemo(
    () => detectSeniority(candidate.parsed_cv, candidate.current_title),
    [candidate.parsed_cv, candidate.current_title],
  )
  const [seniority, setSeniority] = useState<SenioritePreset>(detectedPreset)
  const preset = PRESETS[seniority]

  // Priorité au lieu typé renseigné par mission (wizard) ; fallback sur la
  // détection legacy via job.location (texte libre) puis sur le défaut
  // cabinet (peut disparaître à terme).
  const lieu: Lieu = (job?.pricing_lieu as Lieu | undefined)
    ?? (job?.location?.toLowerCase().includes("paris") ? "paris_petite_couronne"
      : job?.location?.toLowerCase().includes("lyon")  ? "lyon"
      : profile?.pricing_default_lieu as Lieu | undefined)
    ?? "paris_petite_couronne"

  const modalite: Modalite = preset.modalite
  const joursParMois = profile?.pricing_billable_days_per_month ?? 21

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

  // Avantages = base cabinet, avec deux tarifs conditionnels mis à 0 si la
  // mission ne les déclenche pas. Le tarif (€/jour, €/mois) est défini en
  // paramètres cabinet (politique uniforme), l'activation est par mission.
  const avantages = useMemo<Avantages>(() => {
    const base: Avantages = {
      ...FALLBACK_AVANTAGES,
      ...(profile?.pricing_default_avantages ?? {}),
    }
    if (!job?.has_grand_deplacement) base.urssafIndemniteJour = 0
    if (!job?.is_expatriated)        base.expatriationMensuelle = 0
    return base
  }, [profile?.pricing_default_avantages, job?.has_grand_deplacement, job?.is_expatriated])

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

  // Triangle (résultante TJM/brut/marge) — pour le KPI marge mensuelle estim
  const triangle = useMemo(() => {
    try {
      const inputs = buildInputs(brutAnnuel)
      const { brutAnnuel: _brut, ...baseInputs } = inputs
      void _brut
      return computeTriangle("marge", { tjm, brutAnnuel, margeMensuelle: 0 }, baseInputs)
    } catch {
      return null
    }
  }, [tjm, brutAnnuel, buildInputs])

  const cost = useMemo(() => computeEmployerCost(buildInputs(brutAnnuel)), [brutAnnuel, buildInputs])
  const minimumCheck = useMemo(() => validateAgainstMinimum(buildInputs(brutAnnuel)), [brutAnnuel, buildInputs])

  const margeMinPct = profile?.pricing_margin_min_pct ?? 15
  const margeTargetPct = profile?.pricing_margin_target_pct ?? 22

  // Marge RÉELLE de la mission (calendrier français)
  const missionMargin = useMemo(() => {
    const startDate = job?.start_date ? new Date(job.start_date) : new Date()
    const durationMonths = job?.duration_months ?? 12
    if (Number.isNaN(startDate.getTime())) return null
    try {
      return computeMissionMargin(buildInputs(brutAnnuel), tjm, startDate, durationMonths)
    } catch {
      return null
    }
  }, [job?.start_date, job?.duration_months, brutAnnuel, tjm, buildInputs])

  // Brut max / idéal (pour les marqueurs du slider brut)
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
      const brutMax = computeTriangle("brut", { tjm, margeMensuelle: margeMinMensuelle }, baseInputs).brutAnnuel
      const brutIdeal = computeTriangle("brut", { tjm, margeMensuelle: margeTargetMensuelle }, baseInputs).brutAnnuel
      return { brutMax, brutIdeal, brutMin: Math.max(Math.round((minimumCheck.minimumMensuel ?? 0) * 12), 20000) }
    } catch {
      return null
    }
  }, [tjm, brutAnnuel, buildInputs, joursParMois, margeMinPct, margeTargetPct, minimumCheck.minimumMensuel])

  // Sliders ADAPTATIFS — bornes intelligentes autour de la valeur courante.
  // TJM : ±35% autour de la valeur courante (min 200 €/j, max 1500 €/j absolus)
  //   → si TJM=600 → range [400, 800]. Si TJM=900 → range [600, 1200].
  // Brut : ±35% autour de la valeur courante, clampé pour rester réaliste
  //   → si brut=45k → range [30k, 60k]. Si brut=70k → range [46k, 95k].
  // Les marqueurs (min Syntec, brut max/idéal) tombent dans la plage car ils
  // sont calculés à partir du même TJM courant.
  const tjmMinBound = Math.max(200, Math.round(tjm * 0.65 / 5) * 5)
  const tjmMaxBound = Math.min(1500, Math.round(tjm * 1.4 / 5) * 5)
  const brutMinBound = Math.max(
    20000,
    Math.round((brutAnnuel * 0.65) / 500) * 500,
    Math.round((limits?.brutMin ?? 0) - 5000),
  )
  const brutMaxBound = Math.max(
    Math.round((brutAnnuel * 1.4) / 500) * 500,
    Math.round((limits?.brutMax ?? 0) + 5000),
  )

  // Tab actif
  type Tab = "monthly" | "rupture" | "detail"
  const [tab, setTab] = useState<Tab>("monthly")

  // KPIs hero — sources : missionMargin si dispo (vrai calendrier), sinon triangle estim 21j
  const margePct = missionMargin?.margePct ?? triangle?.margePct ?? 0
  const margeMensuelleEur = missionMargin?.margeMoyenneEur ?? triangle?.margeMensuelle ?? 0
  const margeTotaleEur = missionMargin?.margeTotaleEur ?? margeMensuelleEur * 12

  return (
    <section style={{
      background: "white", borderRadius: 16, border: "1px solid #F0ECF8",
      padding: 18,
    }}>
      {/* ═══ VERDICT HERO ═══ */}
      <VerdictHero
        candidateName={candidate.full_name ?? "Sans nom"}
        candidateTitle={candidate.current_title ?? ""}
        candidateYears={candidate.years_experience ?? null}
        margePct={margePct}
        margeMensuelleEur={margeMensuelleEur}
        margeTotaleEur={margeTotaleEur}
        margeMinPct={margeMinPct}
        margeTargetPct={margeTargetPct}
        monthCount={missionMargin?.monthCount ?? 12}
        seniority={seniority}
        detectedPreset={detectedPreset}
        onSenioritySelect={setSeniority}
      />

      {/* ═══ CONTEXT BAR — statut / position / lieu ═══ */}
      <div style={{
        marginTop: 12,
        display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
        padding: "8px 12px", background: "#FAFAFA", borderRadius: 10,
        fontSize: 11, color: "#6B7280",
      }}>
        <strong style={{ color: "#374151" }}>{preset.short}</strong>
        <span>·</span>
        <span>Cadre · Pos. {preset.position} · coef {preset.coefficient}</span>
        <span>·</span>
        <span>{LIEU_LABELS[lieu]}</span>
        <span style={{ flex: 1 }} />
        {onEditMission && (
          <button
            onClick={onEditMission}
            style={{
              fontSize: 11, fontWeight: 600, color: "#92400E",
              background: "rgba(217,119,6,0.06)",
              border: "1px solid rgba(217,119,6,0.25)",
              borderRadius: 6, padding: "3px 9px",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            ⚙ Modifier la mission
          </button>
        )}
        <Link href="/workspace/parametrage" style={{
          fontSize: 11, fontWeight: 600, color: "#7C63C8", textDecoration: "none",
        }}>
          ⚙ Paramètres cabinet
        </Link>
      </div>

      {/* ═══ LEVIERS — 2 sliders en grille ═══ */}
      <div style={{
        marginTop: 12,
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
      }}>
        <SliderField
          label="TJM client"
          value={tjm}
          min={Math.round(tjmMinBound)}
          max={Math.round(tjmMaxBound)}
          step={5}
          suffix="€/j"
          onChange={setTjm}
          range={`plage ${Math.round(tjmMinBound)} → ${Math.round(tjmMaxBound)} €/j · adaptive autour du TJM courant`}
          markers={job?.client_tjm_min != null ? [
            { value: job.client_tjm_min, label: "cible mission", color: "#D97706" },
          ] : []}
        />
        <SliderField
          label="Brut candidat"
          value={brutAnnuel}
          min={brutMinBound}
          max={brutMaxBound}
          step={500}
          suffix="€/an"
          onChange={setBrutAnnuel}
          range={limits ? `min Syntec ${formatEur0(limits.brutMin)} · marge ${margeMinPct}% : ${formatEur0(limits.brutMax)} · marge ${margeTargetPct}% : ${formatEur0(limits.brutIdeal)}` : ""}
          markers={limits ? [
            { value: Math.round(limits.brutMin), label: `⚖ Syntec`, color: "#B91C1C" },
            { value: Math.round(limits.brutIdeal), label: `💎 ${margeTargetPct}%`, color: "#16a34a" },
            { value: Math.round(limits.brutMax),   label: `🎯 ${margeMinPct}%`,    color: "#D97706" },
          ] : []}
        />
      </div>

      {/* ═══ ALERTE MINIMUM SYNTEC si dépassement ═══ */}
      {!minimumCheck.ok && (
        <div style={{
          marginTop: 10, padding: "8px 12px",
          background: "#FEF2F2", border: "1px solid #FECACA",
          borderRadius: 9, fontSize: 12, color: "#B91C1C", lineHeight: 1.5,
        }}>
          ⚠ {minimumCheck.message}
        </div>
      )}

      {/* ═══ TABS CHARTS ═══ */}
      <div style={{
        marginTop: 14,
        display: "flex", gap: 4, borderBottom: "1px solid #F0ECF8",
      }}>
        <TabButton active={tab === "monthly"} onClick={() => setTab("monthly")}>
          📈 Marge mensuelle
        </TabButton>
        <TabButton active={tab === "rupture"} onClick={() => setTab("rupture")}>
          ⚠ Risque rupture
        </TabButton>
        <TabButton active={tab === "detail"} onClick={() => setTab("detail")}>
          📋 Détail coût employeur
        </TabButton>
      </div>

      <div style={{ marginTop: 12 }}>
        {tab === "monthly" && (
          <MonthlyMarginChart
            inputs={buildInputs(brutAnnuel)}
            startDate={job?.start_date ?? null}
            durationMonths={job?.duration_months ?? 12}
            tjm={tjm}
            margeMinPct={margeMinPct}
          />
        )}
        {tab === "rupture" && (
          <RuptureRiskChart
            inputs={buildInputs(brutAnnuel)}
            startDate={job?.start_date ?? null}
            durationMonths={job?.duration_months ?? 12}
            tjm={tjm}
            margeMinPct={margeMinPct}
          />
        )}
        {tab === "detail" && (
          <CostBreakdown cost={cost} avantages={avantages} />
        )}
      </div>
    </section>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * VerdictHero — 3 KPI cards en plein écran (1ère chose qu'on voit)
 * ────────────────────────────────────────────────────────────────────────── */

function VerdictHero({
  candidateName, candidateTitle, candidateYears,
  margePct, margeMensuelleEur, margeTotaleEur,
  margeMinPct, margeTargetPct, monthCount,
  seniority, detectedPreset, onSenioritySelect,
}: {
  candidateName: string
  candidateTitle: string
  candidateYears: number | null
  margePct: number
  margeMensuelleEur: number
  margeTotaleEur: number
  margeMinPct: number
  margeTargetPct: number
  monthCount: number
  seniority: SenioritePreset
  detectedPreset: SenioritePreset
  onSenioritySelect: (s: SenioritePreset) => void
}) {
  const status: { color: string; bg: string; bd: string; label: string; icon: string } =
    margePct >= margeTargetPct
      ? { color: "#15803d", bg: "rgba(34,197,94,0.06)",  bd: "rgba(34,197,94,0.25)",  label: "Mission rentable", icon: "✓" }
      : margePct >= margeMinPct
        ? { color: "#B45309", bg: "rgba(217,119,6,0.07)", bd: "rgba(217,119,6,0.25)",  label: "Marge sous la cible", icon: "⚠" }
        : margePct >= 0
          ? { color: "#B91C1C", bg: "#FEF2F2",            bd: "#FECACA",                label: "Marge sous le plancher", icon: "🚨" }
          : { color: "#B91C1C", bg: "#FEF2F2",            bd: "#FECACA",                label: "Mission en perte",       icon: "🚨" }

  return (
    <div style={{
      background: status.bg, border: `1.5px solid ${status.bd}`,
      borderRadius: 14, padding: "14px 16px",
      display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) auto auto auto",
      gap: 14, alignItems: "center",
    }}>
      {/* Bloc candidat + verdict */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 10.5, fontWeight: 700, color: status.color,
          letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4,
        }}>
          {status.icon} {status.label}
        </div>
        <div style={{
          fontSize: 16, fontWeight: 800, color: "#111827",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {candidateName}
        </div>
        <div style={{ fontSize: 11.5, color: "#6B7280", marginTop: 2 }}>
          {candidateTitle && <>{candidateTitle}{candidateYears != null && ` · ${candidateYears} ans XP`}</>}
        </div>
        {/* Sélecteur séniorité, compact */}
        <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          {(Object.keys(PRESETS) as SenioritePreset[]).map((k) => (
            <button
              key={k}
              onClick={() => onSenioritySelect(k)}
              title={PRESETS[k].label}
              style={{
                fontSize: 10.5, fontWeight: 600,
                padding: "3px 8px", borderRadius: 100, cursor: "pointer",
                border: seniority === k ? "none" : "1px solid #E5E7EB",
                background: seniority === k
                  ? "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)"
                  : "white",
                color: seniority === k ? "white" : "#6B7280",
                fontFamily: "inherit",
              }}
            >
              {PRESETS[k].short}
            </button>
          ))}
          {detectedPreset !== seniority && (
            <button
              onClick={() => onSenioritySelect(detectedPreset)}
              style={{
                fontSize: 10, color: "#7C63C8",
                background: "transparent", border: "none", cursor: "pointer",
                textDecoration: "underline", padding: 0,
              }}
            >
              ↺ détecté : {PRESETS[detectedPreset].short}
            </button>
          )}
        </div>
      </div>

      {/* KPI 1 — Marge moyenne % */}
      <HeroKpi
        label="Marge moyenne"
        value={`${margePct.toFixed(1)} %`}
        sub={`cible ${margeTargetPct}% · plancher ${margeMinPct}%`}
        color={status.color}
      />

      {/* KPI 2 — Marge mensuelle */}
      <HeroKpi
        label="Marge mensuelle"
        value={`${formatEurInt(margeMensuelleEur)} €`}
        sub={`moyenne sur ${monthCount} mois`}
        color="#111827"
      />

      {/* KPI 3 — Marge totale mission */}
      <HeroKpi
        label="Marge totale mission"
        value={`${formatEurInt(margeTotaleEur)} €`}
        sub={`sur ${monthCount} mois`}
        color="#111827"
      />
    </div>
  )
}

function HeroKpi({
  label, value, sub, color,
}: {
  label: string
  value: string
  sub: string
  color: string
}) {
  return (
    <div style={{
      background: "white", border: "1px solid rgba(255,255,255,0.6)",
      borderRadius: 10, padding: "10px 12px",
      minWidth: 130,
      display: "flex", flexDirection: "column", gap: 2,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: "#9CA3AF",
        letterSpacing: "0.04em", textTransform: "uppercase",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 22, fontWeight: 800, color,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}>
        {value}
      </div>
      <div style={{ fontSize: 10.5, color: "#9CA3AF" }}>
        {sub}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Tabs button
 * ────────────────────────────────────────────────────────────────────────── */

function TabButton({
  active, onClick, children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "9px 14px",
        fontSize: 12.5,
        fontWeight: active ? 700 : 600,
        color: active ? "#7C63C8" : "#6B7280",
        background: "transparent",
        border: "none",
        borderBottom: active ? "2px solid #7C63C8" : "2px solid transparent",
        cursor: "pointer",
        fontFamily: "inherit",
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Slider component
 * ────────────────────────────────────────────────────────────────────────── */

function formatEur0(v: number): string {
  return `${Math.round(v).toLocaleString("fr-FR")} €`
}

function formatEurInt(v: number): string {
  const sign = v < 0 ? "−" : ""
  return `${sign}${Math.abs(Math.round(v)).toLocaleString("fr-FR")}`
}

function formatEurSmart(v: number): string {
  const rounded = Math.round(v * 10) / 10
  const hasDecimal = Math.abs(rounded - Math.round(rounded)) >= 0.05
  return `${rounded.toLocaleString("fr-FR", {
    minimumFractionDigits: hasDecimal ? 1 : 0,
    maximumFractionDigits: 1,
  })} €`
}

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
            width: "100%", appearance: "none", height: 6,
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
              <span style={{ display: "block", width: 1.5, height: 8, background: m.color, margin: "0 auto" }} />
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

/* ──────────────────────────────────────────────────────────────────────────
 * CostBreakdown — détail par ligne (now as a tab)
 * ────────────────────────────────────────────────────────────────────────── */

function CostBreakdown({
  cost, avantages,
}: {
  cost: ReturnType<typeof computeEmployerCost>
  avantages: Avantages
}) {
  const medecineMens = (avantages.medecineDuTravailAnnuel ?? 0) / 12
  const kmMens = (avantages.indemniteKilometriqueAnnuelle ?? 0) / 12
  const assiette = cost.brutMensuel + cost.treiziemeMoisMensualise + cost.primeVacancesMensualisee

  const fixedRows: { label: string; value: number; hint?: string }[] = [
    { label: "Brut mensuel", value: cost.brutMensuel },
    { label: "Prime de vacances (Art. 31)", value: cost.primeVacancesMensualisee, hint: "1 % du brut, mensualisée" },
    { label: "13ᵉ mois mensualisé", value: cost.treiziemeMoisMensualise, hint: "brut ÷ 12, si activé" },
    { label: `Charges patronales (${(cost.tauxCharges * 100).toFixed(1)} %)`, value: cost.chargesPatronales, hint: `assiette = brut + prime + 13e = ${formatEurSmart(assiette)}` },
    { label: "Mutuelle (part employeur)", value: avantages.mutuellePremium ?? 0 },
    { label: "Transport / Navigo (50 %)", value: avantages.transport ?? 0 },
    { label: "Forfait mobilité durable", value: avantages.forfaitMobilite ?? 0 },
    { label: "Médecine du travail", value: medecineMens, hint: `${avantages.medecineDuTravailAnnuel ?? 0} €/an ÷ 12` },
    { label: "Indemnité kilométrique", value: kmMens, hint: `${avantages.indemniteKilometriqueAnnuelle ?? 0} €/an ÷ 12` },
    { label: "Indemnité expatriation", value: avantages.expatriationMensuelle ?? 0 },
    { label: "Autres avantages mensuels", value: avantages.autresMensuels ?? 0 },
  ]

  return (
    <div style={{
      padding: 16, background: "white",
      borderRadius: 12, border: "1px solid #F0ECF8",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{
        fontSize: 10.5, fontWeight: 700, color: "#9CA3AF",
        letterSpacing: "0.05em", textTransform: "uppercase",
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
            {formatEurSmart(r.value)}
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
          {formatEurSmart(cost.coutFixeMensuel)} / mois
        </span>
      </div>

      {cost.coutVariableJournalier > 0 && (
        <>
          <div style={{
            fontSize: 10.5, fontWeight: 700, color: "#9CA3AF",
            letterSpacing: "0.05em", textTransform: "uppercase",
            marginTop: 10,
          }}>
            Coût variable par jour travaillé
          </div>
          {(avantages.urssafIndemniteJour ?? 0) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#4B5563" }}>
              <span>Indemnité URSSAF grand déplacement <span style={{ color: "#9CA3AF" }}>· exonérée</span></span>
              <span style={{ fontWeight: 700, color: "#111827", fontVariantNumeric: "tabular-nums" }}>
                {(avantages.urssafIndemniteJour ?? 0).toFixed(2)} € / jour
              </span>
            </div>
          )}
          {(avantages.ticketsResto ?? 0) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#4B5563" }}>
              <span>Tickets restaurant (part employeur) <span style={{ color: "#9CA3AF" }}>· URSSAF strict</span></span>
              <span style={{ fontWeight: 700, color: "#111827", fontVariantNumeric: "tabular-nums" }}>
                {(avantages.ticketsResto ?? 0).toFixed(2)} € / jour
              </span>
            </div>
          )}
          <div style={{
            marginTop: 4, paddingTop: 6, borderTop: "1px dashed #E5E7EB",
            display: "flex", justifyContent: "space-between",
            fontSize: 12.5, fontWeight: 700, color: "#374151",
          }}>
            <span>Sous-total variable / jour</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {cost.coutVariableJournalier.toFixed(2)} € / jour
            </span>
          </div>
        </>
      )}

      <div style={{
        marginTop: 8, paddingTop: 8, borderTop: "1px solid #E5E7EB",
        display: "flex", justifyContent: "space-between",
        fontSize: 13, fontWeight: 800, color: "#7C63C8",
      }}>
        <span>
          Coût total estimé
          <span style={{ fontSize: 11, fontWeight: 500, color: "#9CA3AF", marginLeft: 6 }}>
            · mois moyen 21 j
          </span>
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatEurSmart(cost.coutFixeMensuel + cost.coutVariableJournalier * 21)} / mois
        </span>
      </div>
      <p style={{
        margin: "4px 0 0", fontSize: 11, color: "#9CA3AF",
        fontStyle: "italic", lineHeight: 1.4,
      }}>
        Le chart « Marge mensuelle » applique le vrai nombre de jours travaillés de chaque
        mois calendaire (19 j en novembre, 23 j en octobre…) — le coût total réel varie
        donc légèrement chaque mois.
      </p>
    </div>
  )
}

export type { PricingInputs }
