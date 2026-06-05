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

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  computeEmployerCost,
  computeTriangle,
  computeMissionMargin,
  computeRuptureRiskProfile,
  cpRttRevenueHaircutMonthly,
  validateAgainstMinimum,
  type PricingInputs,
  type Modalite,
  type Lieu,
  type Avantages,
} from "@/lib/pricing/syntec"
import MonthlyMarginChart from "@/components/workspace/MonthlyMarginChart"
import RuptureRiskChart from "@/components/workspace/RuptureRiskChart"
import type { Candidate, Job } from "@/lib/database.types"
import { getCabinetPricingConfig, type CabinetPricingConfig } from "@/lib/cabinet-config"
import { PRESETS, detectSeniority, type SenioritePreset } from "@/lib/pricing/preset"
import { missionMonthProfile, MONTH_ABBR_FR } from "@/lib/pricing/calendar"
import { getSupabase } from "@/lib/supabase"
import { candidateRefLabel } from "@/lib/candidate-ref"

/* ──────────────────────────────────────────────────────────────────────────
 * Preset séniorité — extraits dans @/lib/pricing/preset pour partage avec
 * la page parent (calcul de marge par candidat dans la liste).
 * ────────────────────────────────────────────────────────────────────────── */

// Re-exports for backwards compat with the rest of this file.

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

/* Grille cadres Syntec 2026 — utilisée pour le sélecteur position/coef
 * dans la context bar (override manuel du preset séniorité). */
const SYNTEC_CADRE_ROWS: { position: string; coefficient: number; label: string }[] = [
  { position: "1.1", coefficient: 95,  label: "1.1 · coef 95 — Jeune diplômé Bac+5" },
  { position: "1.2", coefficient: 100, label: "1.2 · coef 100 — Ingénieur débutant 1-2 ans" },
  { position: "2.1", coefficient: 105, label: "2.1 · coef 105 — Junior <26 ans" },
  { position: "2.1", coefficient: 115, label: "2.1 · coef 115 — Confirmé ≥26 ans" },
  { position: "2.2", coefficient: 130, label: "2.2 · coef 130 — Senior / lead" },
  { position: "2.3", coefficient: 150, label: "2.3 · coef 150 — Senior confirmé" },
  { position: "3.1", coefficient: 170, label: "3.1 · coef 170 — Manager / chef de projet" },
  { position: "3.2", coefficient: 210, label: "3.2 · coef 210 — Senior manager / expert" },
  { position: "3.3", coefficient: 270, label: "3.3 · coef 270 — Director / partner" },
]

/* ──────────────────────────────────────────────────────────────────────────
 * Outer wrapper — loads profile defaults
 * ────────────────────────────────────────────────────────────────────────── */

type PricingProfile = Pick<CabinetPricingConfig,
  | "pricing_billable_days_per_month"
  | "pricing_rtt_days_per_year"
  | "pricing_margin_min_pct"
  | "pricing_margin_target_pct"
  | "pricing_default_lieu"
  | "pricing_default_modalite"
  | "pricing_default_avantages"
> | null

export default function PricingWidget({
  candidate, job, matchId,
  initialTjm: persistedTjm, initialBrut: persistedBrut,
  onPricingChange,
}: {
  candidate: Candidate
  job: Job | null
  /** Id du match — sert à persister les réglages TJM/Brut côté serveur. */
  matchId?: string
  /** Dernier TJM ajusté par le sourceur sur ce match (override de la mission). */
  initialTjm?: number | null
  /** Dernier Brut ajusté par le sourceur sur ce match (override de la mission). */
  initialBrut?: number | null
  /** Remontée à la page parent à chaque sauvegarde — permet de mettre à jour
   *  la liste de candidats en mémoire sans refetch, donc de garder ses
   *  derniers réglages en revenant sur ce candidat. */
  onPricingChange?: (matchId: string, tjm: number, brut: number) => void
}) {
  const sb = useMemo(() => getSupabase(), [])
  const [profile, setProfile] = useState<PricingProfile | undefined>(undefined)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user || !mounted) return
      const cfg = await getCabinetPricingConfig(sb, user.id)
      if (mounted) setProfile(cfg)
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
  return (
    <PricingWidgetInner
      candidate={candidate}
      job={job}
      profile={profile}
      matchId={matchId}
      persistedTjm={persistedTjm ?? null}
      persistedBrut={persistedBrut ?? null}
      onPricingChange={onPricingChange}
    />
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Inner widget — full logic + new layout
 * ────────────────────────────────────────────────────────────────────────── */

function PricingWidgetInner({
  candidate, job, profile, matchId, persistedTjm, persistedBrut,
  onPricingChange,
}: {
  candidate: Candidate
  job: Job | null
  profile: PricingProfile
  matchId?: string
  persistedTjm: number | null
  persistedBrut: number | null
  onPricingChange?: (matchId: string, tjm: number, brut: number) => void
}) {
  const detectedPreset = useMemo(
    () => detectSeniority(candidate.parsed_cv, candidate.current_title),
    [candidate.parsed_cv, candidate.current_title],
  )
  const [seniority, setSeniority] = useState<SenioritePreset>(detectedPreset)
  const preset = PRESETS[seniority]

  // Override manuel position/coef Syntec — si le sourceur n'est pas d'accord
  // avec le preset auto. Tant que null, on suit le preset séniorité.
  // Note : on ne reset pas automatiquement sur changement de séniorité — le
  // sourceur a explicitement choisi une ligne, on la respecte tant qu'il ne
  // clique pas "réinitialiser".
  const [syntecOverride, setSyntecOverride] = useState<{ position: string; coefficient: number } | null>(null)
  const effectivePosition = syntecOverride?.position ?? preset.position
  const effectiveCoef = syntecOverride?.coefficient ?? preset.coefficient

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

  // Priorité : valeur persistée par le sourceur > valeur mission > défaut.
  const initialTjm = useMemo(() => {
    if (persistedTjm != null) return persistedTjm
    const min = job?.client_tjm_min
    const max = job?.client_tjm_max
    if (min != null && max != null) return Math.round((min + max) / 2)
    if (min != null) return min
    if (max != null) return max
    return 550
  }, [persistedTjm, job?.client_tjm_min, job?.client_tjm_max])
  const initialBrut = persistedBrut ?? job?.target_gross_salary ?? 45000

  const [tjm, setTjm] = useState<number>(initialTjm)
  const [brutAnnuel, setBrutAnnuel] = useState<number>(initialBrut)

  // NB : le parent utilise `key={matchId}:${target_gross_salary}` sur le
  // wrapper du widget. Conséquence : changement de candidat OU de salaire
  // ciblé mission → remount → useState recapture la bonne valeur initiale
  // (persistedBrut > job.target_gross_salary > défaut). Pas besoin de
  // useEffect de sync (qui poserait des soucis de lint setState-in-effect).

  // Persistance debounced — sauvegarde ~600 ms après le dernier ajustement.
  // Après écriture, on remonte les nouvelles valeurs au parent pour qu'il
  // garde son state candidat à jour (évite la perte des réglages en switchant
  // de candidat puis en revenant).
  const saveTimerRef = useRef<number | null>(null)
  useEffect(() => {
    if (!matchId) return
    if (tjm === initialTjm && brutAnnuel === initialBrut) return
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    const tjmToSave = tjm
    const brutToSave = brutAnnuel
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/match/${matchId}/pricing-params`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pricing_tjm: tjmToSave, pricing_brut: brutToSave }),
        })
        if (res.ok) onPricingChange?.(matchId, tjmToSave, brutToSave)
      } catch { /* best-effort */ }
    }, 600)
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    }
  }, [matchId, tjm, brutAnnuel, initialTjm, initialBrut, onPricingChange])

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

  const rttDaysPerYear = profile?.pricing_rtt_days_per_year ?? 0

  const buildInputs = useCallback(
    (brut: number): PricingInputs => ({
      brutAnnuel: brut,
      statut: preset.statut,
      position: effectivePosition,
      coefficient: effectiveCoef,
      modalite,
      lieu,
      avantages,
      joursFacturablesParMois: joursParMois,
      rttDaysPerYear,
    }),
    [preset.statut, effectivePosition, effectiveCoef, modalite, lieu, avantages, joursParMois, rttDaysPerYear],
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

  // Priorité aux overrides de la mission (saisis dans le wizard mission),
  // sinon valeurs par défaut cabinet (paramétrage).
  const margeMinPct = job?.margin_min_pct ?? profile?.pricing_margin_min_pct ?? 15
  const margeTargetPct = job?.margin_target_pct ?? profile?.pricing_margin_target_pct ?? 22

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

  // Pic / Creux — meilleur et pire mois en marge €. Reuse des helpers calendrier
  // déjà utilisés par MonthlyMarginChart : aucune logique métier nouvelle ici.
  const extremeMonths = useMemo(() => {
    if (!job?.start_date || !job?.duration_months) return null
    const start = new Date(job.start_date)
    if (Number.isNaN(start.getTime())) return null
    try {
      const months = missionMonthProfile(start, Math.max(1, job.duration_months))
      if (months.length === 0) return null
      const haircut = cpRttRevenueHaircutMonthly(tjm, { rttDaysPerYear })
      const points = months.map((m) => {
        const revenu = tjm * m.workingDays - haircut
        const coutTotal = cost.coutFixeMensuel + cost.coutVariableJournalier * m.workingDays
        return {
          calendarMonth: m.calendarMonth, year: m.year,
          workingDays: m.workingDays,
          marge: revenu - coutTotal,
        }
      })
      const best = points.reduce((a, b) => (b.marge > a.marge ? b : a), points[0])
      const worst = points.reduce((a, b) => (b.marge < a.marge ? b : a), points[0])
      return { best, worst }
    } catch {
      return null
    }
  }, [job?.start_date, job?.duration_months, tjm, cost, rttDaysPerYear])

  // Pire moment pour rompre — issu du profil de risque rupture (recompute
  // côté widget pour pouvoir l'afficher dans la colonne gauche sans dépendre
  // de l'onglet actif).
  const worstRuptureMonth = useMemo(() => {
    if (!job?.start_date || !job?.duration_months) return null
    const start = new Date(job.start_date)
    if (Number.isNaN(start.getTime())) return null
    try {
      const profile = computeRuptureRiskProfile(
        buildInputs(brutAnnuel),
        tjm,
        start,
        Math.max(1, job.duration_months),
      )
      return profile.worstMonth
    } catch {
      return null
    }
  }, [job?.start_date, job?.duration_months, brutAnnuel, tjm, buildInputs])

  // Brut max / idéal (pour les marqueurs du slider brut).
  //
  // Le sourceur règle un pourcentage de marge ; il veut que ce % soit
  // atteignable APRÈS l'haircut CP+RTT (sinon les markers seraient trompeurs).
  // On calcule donc :
  //   - revenu net = TJM × jours − haircut
  //   - marge cible nette = revenu net × %  (ce que veut le sourceur)
  //   - margeMensuelle pour computeTriangle = marge nette + haircut
  //     (parce que computeTriangle raisonne en formule sans haircut).
  const limits = useMemo(() => {
    try {
      const baseInputs = (() => {
        const inputs = buildInputs(brutAnnuel)
        const { brutAnnuel: _b, ...rest } = inputs
        void _b
        return rest
      })()
      const haircut = cpRttRevenueHaircutMonthly(tjm, { rttDaysPerYear })
      const revenuMensuelNet = tjm * joursParMois - haircut
      const margeMinNette = revenuMensuelNet * (margeMinPct / 100)
      const margeTargetNette = revenuMensuelNet * (margeTargetPct / 100)
      const brutMax = computeTriangle("brut", { tjm, margeMensuelle: margeMinNette + haircut }, baseInputs).brutAnnuel
      const brutIdeal = computeTriangle("brut", { tjm, margeMensuelle: margeTargetNette + haircut }, baseInputs).brutAnnuel
      return { brutMax, brutIdeal, brutMin: Math.max(Math.round((minimumCheck.minimumMensuel ?? 0) * 12), 20000) }
    } catch {
      return null
    }
  }, [tjm, brutAnnuel, buildInputs, joursParMois, margeMinPct, margeTargetPct, minimumCheck.minimumMensuel, rttDaysPerYear])

  // Onglets : Marge mensuelle / Risque rupture / Détail coût — chacun à
  // 1 clic. Préférable au scroll long pour balayer rapidement les 3 angles.
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
        candidateRef={candidateRefLabel(candidate.id)}
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

      {/* La bulle "La reco de Nora" est déplacée dans la colonne droite,
          sous le chart, pour :
          - libérer l'espace vertical au-dessus du 2-col layout (l'abscisse
            des graphes reste visible sans scroller)
          - combler le vide qui apparaissait sous le chart côté droit. */}

      {/* ═══ DASHBOARD 2 COLONNES — leviers à gauche, charts à droite ═══
       *  Objectif : voir le graphe et le coût sans scroller. À <1100 px on
       *  empile (mobile/tablette). */}
      <div className="pricing-dash" style={{
        marginTop: 12,
        display: "grid",
        gridTemplateColumns: "minmax(320px, 0.8fr) minmax(0, 1.6fr)",
        gap: 14, alignItems: "start",
      }}>
        {/* ─── COLONNE GAUCHE — contexte + leviers ─── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          {/* Context bar — paramètres Syntec appliqués + lieu. La position et
              le coefficient sont ajustables manuellement si le preset auto ne
              correspond pas au profil exact du candidat. */}
          <SyntecContextBar
            seniorityLabel={preset.short}
            position={effectivePosition}
            coefficient={effectiveCoef}
            isOverridden={syntecOverride != null}
            lieuLabel={LIEU_LABELS[lieu]}
            onChange={(p, c) => setSyntecOverride({ position: p, coefficient: c })}
            onReset={() => setSyntecOverride(null)}
          />

          {/* Avantages appliqués */}
          <ActiveAvantagesStrip avantages={avantages} job={job} />

          {/* Leviers — steppers TJM / Brut (empilés en colonne unique) */}
          <StepperField
            label="TJM client (€/j HT)"
            value={tjm}
            /* Step adaptatif : ±10 € sous 800 €/j (granularité fine sur les
             *  juniors / confirmés), ±25 € au-dessus (les TJM seniors+
             *  bougent rarement par tranches inférieures à 25 €). */
            step={tjm < 800 ? 10 : 25}
            max={2000}
            suffix="€/j"
            onChange={setTjm}
            markers={job?.client_tjm_min != null ? [
              { value: job.client_tjm_min, label: "cible mission", color: "#D97706" },
            ] : []}
          />
          <StepperField
            label="Salaire brut annuel"
            value={brutAnnuel}
            step={500}
            max={150000}
            suffix="€/an"
            onChange={setBrutAnnuel}
            markers={limits ? [
              { value: Math.round(limits.brutMin),   label: "min Syntec",                 color: "#B91C1C" },
              { value: Math.round(limits.brutIdeal), label: `cible ${margeTargetPct}%`,   color: "#15803d" },
              { value: Math.round(limits.brutMax),   label: `plancher ${margeMinPct}%`,   color: "#D97706" },
            ] : []}
          />

          {/* Pic / Creux mission + Pire moment pour rompre — clés contextuelles
              du calendrier mission, indépendantes de l'onglet actif. */}
          {(extremeMonths || worstRuptureMonth) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {extremeMonths && (
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
                }}>
                  <ExtremeMonthCard
                    label="Meilleur mois"
                    month={extremeMonths.best}
                    tone="good"
                  />
                  <ExtremeMonthCard
                    label="Mois le plus faible"
                    month={extremeMonths.worst}
                    tone={extremeMonths.worst.marge < 0 ? "bad" : "warn"}
                  />
                </div>
              )}
              {worstRuptureMonth && (
                <ExtremeMonthCard
                  label="Pire moment pour rompre"
                  month={{
                    calendarMonth: worstRuptureMonth.calendarMonth,
                    year: worstRuptureMonth.year,
                    workingDays: worstRuptureMonth.workingDays,
                    marge: worstRuptureMonth.margeNetteEur,
                  }}
                  tone={
                    worstRuptureMonth.margePct < 0
                      ? "bad"
                      : worstRuptureMonth.margePct < margeMinPct
                        ? "warn"
                        : "good"
                  }
                  subValue={`Marge ${worstRuptureMonth.margePct.toFixed(1)} %`}
                />
              )}
            </div>
          )}

          {/* Alerte minimum Syntec si dépassement */}
          {!minimumCheck.ok && (
            <div style={{
              padding: "8px 12px",
              background: "#FEF2F2", border: "1px solid #FECACA",
              borderRadius: 9, fontSize: 12, color: "#B91C1C", lineHeight: 1.5,
            }}>
              ⚠ {minimumCheck.message}
            </div>
          )}
        </div>

        {/* ─── COLONNE DROITE — tabs charts ─── */}
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{
            display: "flex", gap: 4, borderBottom: "1px solid #F0ECF8",
            flexWrap: "wrap",
          }}>
            <TabButton active={tab === "monthly"} onClick={() => setTab("monthly")}>
              📈 Marge mensuelle
            </TabButton>
            <TabButton active={tab === "rupture"} onClick={() => setTab("rupture")}>
              ⚠ Risque rupture
            </TabButton>
            <TabButton active={tab === "detail"} onClick={() => setTab("detail")}>
              📋 Détail coût
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
              <CostBreakdown
                cost={cost}
                avantages={avantages}
                cpRttHaircutMensuel={cpRttRevenueHaircutMonthly(tjm, { rttDaysPerYear })}
                rttDaysPerYear={rttDaysPerYear}
              />
            )}
          </div>

          {/* Reco de Nora — sous le chart, comble l'espace blanc qu'il y avait
              et libère le haut du widget pour laisser voir l'axe X. */}
          {limits && (
            <div style={{ marginTop: 12 }}>
              <RecommendationBanner
                margePct={margePct}
                margeMinPct={margeMinPct}
                margeTargetPct={margeTargetPct}
                brutAnnuel={brutAnnuel}
                brutMin={limits.brutMin}
                brutIdeal={limits.brutIdeal}
                brutMax={limits.brutMax}
                tjm={tjm}
              />
            </div>
          )}
        </div>
      </div>

      {/* ═══ TOOLBAR — réinitialiser + export PDF ═══ */}
      {matchId && (
        <PricingToolbar
          matchId={matchId}
          onReset={() => {
            // Replay the auto-derive logic: TJM from mission midpoint,
            // brut from target gross. Then the debounced save effect
            // pushes pricing_tjm=null and pricing_brut=null upstream.
            const min = job?.client_tjm_min
            const max = job?.client_tjm_max
            const newTjm =
              min != null && max != null ? Math.round((min + max) / 2)
              : min ?? max ?? 550
            setTjm(newTjm)
            setBrutAnnuel(job?.target_gross_salary ?? 45000)
            // Persist a clean wipe alongside the debounced numeric save so
            // the next visit really starts from defaults.
            void fetch(`/api/match/${matchId}/pricing-params`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                pricing_tjm: null,
                pricing_brut: null,
                pricing_avantages_override: null,
              }),
            }).then(() => onPricingChange?.(matchId, newTjm, job?.target_gross_salary ?? 45000))
          }}
        />
      )}

      {/* Stack en colonne unique sur écran étroit pour garder la lisibilité. */}
      <style jsx>{`
        @media (max-width: 1100px) {
          .pricing-dash {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </section>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Toolbar — réinitialiser + export PDF
 * Affichée seulement quand on a un matchId (donc en contexte fiche pricing).
 * ────────────────────────────────────────────────────────────────────────── */

function PricingToolbar({ matchId, onReset }: { matchId: string; onReset: () => void }) {
  return (
    <div style={{
      marginTop: 14, paddingTop: 14,
      borderTop: "1px solid #F0ECF8",
      display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap",
    }}>
      <button
        type="button"
        onClick={() => {
          if (confirm("Réinitialiser ce chiffrage aux valeurs par défaut de la mission ?")) onReset()
        }}
        style={toolbarBtnGhost}
      >
        Réinitialiser
      </button>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a
          href={`/api/match/${matchId}/pricing-pdf`}
          target="_blank" rel="noopener noreferrer"
          style={toolbarBtnPrimary}
        >
          Télécharger PDF
        </a>
        <a
          href={`/api/match/${matchId}/pricing-pdf?anonymize=1`}
          target="_blank" rel="noopener noreferrer"
          style={toolbarBtnGhost}
          title="Le candidat sera identifié par sa référence courte (C-XXXXXXXX) — version partageable au client"
        >
          Version anonymisée
        </a>
      </div>
    </div>
  )
}

const toolbarBtnPrimary: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 9,
  border: "none", background: "#7C63C8", color: "white",
  fontSize: 12.5, fontWeight: 700, cursor: "pointer",
  textDecoration: "none",
  fontFamily: "var(--font-inter), sans-serif",
}

const toolbarBtnGhost: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 9,
  border: "1px solid #E5E7EB", background: "white", color: "#374151",
  fontSize: 12.5, fontWeight: 600, cursor: "pointer",
  textDecoration: "none",
  fontFamily: "var(--font-inter), sans-serif",
}

/* ──────────────────────────────────────────────────────────────────────────
 * VerdictHero — 3 KPI cards en plein écran (1ère chose qu'on voit)
 * ────────────────────────────────────────────────────────────────────────── */

function VerdictHero({
  candidateName, candidateRef, candidateTitle, candidateYears,
  margePct, margeMensuelleEur, margeTotaleEur,
  margeMinPct, margeTargetPct, monthCount,
  seniority, detectedPreset, onSenioritySelect,
}: {
  candidateName: string
  candidateRef: string
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
        <div style={{
          fontSize: 10, fontWeight: 700, color: "#9CA3AF",
          letterSpacing: "0.04em", marginTop: 3,
          fontFamily: "var(--font-space-grotesk), monospace",
        }}>
          {candidateRef}
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
 * RecommendationBanner — phrase d'aide à la décision sous le verdict
 *
 * Traduit en français clair ce que les KPI veulent dire et propose une action :
 *   - où monter le brut sans franchir le seuil
 *   - quel TJM permettrait de respecter le seuil avec le brut actuel
 *
 * Pas de calculs nouveaux ici, juste de la formulation à partir de `limits`.
 * ────────────────────────────────────────────────────────────────────────── */

function RecommendationBanner({
  margePct, margeMinPct, margeTargetPct,
  brutAnnuel, brutMin, brutIdeal, brutMax, tjm,
}: {
  margePct: number
  margeMinPct: number
  margeTargetPct: number
  brutAnnuel: number
  brutMin: number
  brutIdeal: number
  brutMax: number
  tjm: number
}) {
  const fmt = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €/an`
  const reco = (() => {
    // Au-dessus de la cible : marge confortable, marge de manœuvre disponible.
    if (margePct >= margeTargetPct) {
      return {
        tone: "success" as const,
        text:
          `Belle marge sur cette mission. Vous pouvez remonter le brut jusqu'à ${fmt(brutIdeal)} ` +
          `pour rester sur la cible ${margeTargetPct}%, ou jusqu'à ${fmt(brutMax)} ` +
          `pour rester au-dessus du plancher ${margeMinPct}%.`,
      }
    }
    // Entre plancher et cible : encore rentable, mais sous-optimal.
    if (margePct >= margeMinPct) {
      return {
        tone: "warn" as const,
        text:
          `La marge est sous la cible ${margeTargetPct}%. Pour l'atteindre, il faut descendre ` +
          `le brut à ${fmt(brutIdeal)} (actuel ${fmt(brutAnnuel)}), ou conserver le brut et ` +
          `négocier un TJM plus haut.`,
      }
    }
    // Sous le plancher : danger commercial.
    if (margePct >= 0) {
      return {
        tone: "alert" as const,
        text:
          `Attention, la marge passe sous le plancher ${margeMinPct}%. Brut max acceptable ` +
          `à ce TJM : ${fmt(brutMax)} (actuel ${fmt(brutAnnuel)}). Sinon, il faudrait remonter ` +
          `le TJM (${tjm} €/j aujourd'hui).`,
      }
    }
    // Perte sèche.
    return {
      tone: "alert" as const,
      text:
        `Cette mission est en perte : le coût employeur dépasse le revenu. ` +
        `Plancher Syntec ${fmt(brutMin)} ; brut max à la marge mini ${fmt(brutMax)}. ` +
        `Il faut revoir le TJM ou le brut avant d'engager le candidat.`,
    }
  })()

  const palette = {
    success: { fg: "#15803d", bg: "#FFFFFF",                bd: "rgba(34,197,94,0.25)" },
    warn:    { fg: "#B45309", bg: "#FFFFFF",                bd: "rgba(217,119,6,0.25)" },
    alert:   { fg: "#B91C1C", bg: "#FFFFFF",                bd: "rgba(220,38,38,0.25)" },
  }[reco.tone]

  return (
    <div style={{
      marginTop: 12,
      display: "flex", alignItems: "flex-start", gap: 10,
    }}>
      {/* Avatar Nora — pastille violette avec initiale */}
      <div style={{
        width: 30, height: 30, flexShrink: 0,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #7C63C8 0%, #6B54B2 100%)",
        color: "white", fontSize: 12, fontWeight: 800,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 2px 8px rgba(124,99,200,0.25)",
        letterSpacing: "0.02em",
      }}>
        N
      </div>

      {/* Bulle de message style chat */}
      <div style={{
        position: "relative",
        flex: 1,
        background: palette.bg,
        border: `1px solid ${palette.bd}`,
        borderRadius: 14,
        borderTopLeftRadius: 4,
        padding: "10px 14px",
        boxShadow: "0 1px 2px rgba(17,24,39,0.04)",
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: palette.fg,
          marginBottom: 4, letterSpacing: "0.01em",
        }}>
          La reco de Nora
        </div>
        <p style={{
          margin: 0, fontSize: 12.5, color: "#374151", lineHeight: 1.55,
          fontWeight: 400,
        }}>
          {reco.text}
        </p>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * ActiveAvantagesStrip — récap visible des avantages appliqués à la mission
 *
 * Liste discrète sous la context bar : ce qui pèse aujourd'hui dans le coût
 * employeur (montants > 0), avec une mention des activations conditionnelles
 * (grand déplacement, expatriation) si la mission les déclenche.
 * ────────────────────────────────────────────────────────────────────────── */

function ActiveAvantagesStrip({ avantages, job }: {
  avantages: Avantages
  job: Job | null
}) {
  type Chip = { label: string; value: string }
  const chips: Chip[] = []
  if ((avantages.mutuellePremium ?? 0) > 0)        chips.push({ label: "Mutuelle",        value: `${avantages.mutuellePremium} €/mois` })
  if ((avantages.medecineDuTravailAnnuel ?? 0) > 0) chips.push({ label: "Médecine",        value: `${avantages.medecineDuTravailAnnuel} €/an` })
  if ((avantages.transport ?? 0) > 0)              chips.push({ label: "Transport",       value: `${avantages.transport} €/mois` })
  if ((avantages.ticketsResto ?? 0) > 0)           chips.push({ label: "Tickets resto",   value: `${avantages.ticketsResto} €/j` })
  if ((avantages.forfaitMobilite ?? 0) > 0)        chips.push({ label: "Mobilité durable", value: `${avantages.forfaitMobilite} €/mois` })
  if ((avantages.indemniteKilometriqueAnnuelle ?? 0) > 0) chips.push({ label: "Indemnité km", value: `${avantages.indemniteKilometriqueAnnuelle} €/an` })
  if (avantages.treiziemeMois) chips.push({ label: "13ᵉ mois", value: "actif" })
  if (job?.has_grand_deplacement && (avantages.urssafIndemniteJour ?? 0) > 0) {
    chips.push({ label: "Grand déplacement", value: `${avantages.urssafIndemniteJour} €/j` })
  }
  if (job?.is_expatriated && (avantages.expatriationMensuelle ?? 0) > 0) {
    chips.push({ label: "Expatriation", value: `${avantages.expatriationMensuelle} €/mois` })
  }
  if ((avantages.autresMensuels ?? 0) > 0) chips.push({ label: "Autres", value: `${avantages.autresMensuels} €/mois` })

  if (chips.length === 0) return null

  return (
    <div style={{
      marginTop: 8, padding: "8px 12px",
      background: "white", border: "1px solid #F0ECF8", borderRadius: 10,
      display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, color: "#9CA3AF",
        letterSpacing: "0.05em", textTransform: "uppercase", marginRight: 4,
      }}>
        Avantages appliqués
      </span>
      {chips.map((c) => (
        <span key={c.label} style={{
          fontSize: 11, color: "#374151",
          background: "#F8F6FF", border: "1px solid #F0ECF8",
          padding: "2px 8px", borderRadius: 100,
          display: "inline-flex", gap: 5, alignItems: "baseline",
        }}>
          <span style={{ color: "#6B7280" }}>{c.label}</span>
          <strong style={{ color: "#111827", fontVariantNumeric: "tabular-nums" }}>{c.value}</strong>
        </span>
      ))}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * SyntecContextBar — barre contextuelle Syntec avec sélecteur position/coef
 *
 * Le sourceur peut surcharger la position/coef proposée par le preset si le
 * profil exact du candidat est plus subtil (ex. coef 115 vs 105 sur 2.1
 * selon l'âge, ou ingénieur Bac+5 reclassé 2.2 plus tôt que prévu).
 * ────────────────────────────────────────────────────────────────────────── */

function SyntecContextBar({
  seniorityLabel, position, coefficient, isOverridden, lieuLabel,
  onChange, onReset,
}: {
  seniorityLabel: string
  position: string
  coefficient: number
  isOverridden: boolean
  lieuLabel: string
  onChange: (position: string, coefficient: number) => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{
      position: "relative",
      display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
      padding: "8px 12px", background: "#FAFAFA", borderRadius: 10,
      fontSize: 11, color: "#6B7280",
    }}>
      <strong style={{ color: "#374151" }}>{seniorityLabel}</strong>
      <span>·</span>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          fontFamily: "inherit", fontSize: 11, color: "#374151",
          background: isOverridden ? "rgba(124,99,200,0.10)" : "white",
          border: `1px solid ${isOverridden ? "rgba(124,99,200,0.30)" : "#E5E7EB"}`,
          borderRadius: 7, padding: "3px 8px", cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 5,
        }}
      >
        Cadre · Pos. {position} · coef {coefficient}
        <span style={{ color: "#7C63C8", fontSize: 10 }}>▾</span>
      </button>
      {isOverridden && (
        <button
          onClick={onReset}
          style={{
            fontFamily: "inherit", fontSize: 10.5, color: "#7C63C8",
            background: "transparent", border: "none", cursor: "pointer",
            textDecoration: "underline", padding: 0,
          }}
        >
          réinitialiser
        </button>
      )}
      <span>·</span>
      <span>{lieuLabel}</span>

      {open && (
        <>
          {/* overlay pour fermer au clic externe */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 50, background: "transparent",
            }}
          />
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", left: 12, zIndex: 60,
            background: "white", border: "1px solid #E9E2F7", borderRadius: 10,
            boxShadow: "0 8px 28px rgba(124,99,200,0.18), 0 1px 2px rgba(17,24,39,0.04)",
            padding: 6, minWidth: 320, maxHeight: 320, overflowY: "auto",
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "#9CA3AF",
              letterSpacing: "0.05em", textTransform: "uppercase",
              padding: "6px 10px 4px",
            }}>
              Choisir une position Syntec
            </div>
            {SYNTEC_CADRE_ROWS.map((row) => {
              const isActive = row.position === position && row.coefficient === coefficient
              return (
                <button
                  key={`${row.position}-${row.coefficient}`}
                  onClick={() => { onChange(row.position, row.coefficient); setOpen(false) }}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    fontFamily: "inherit", fontSize: 12,
                    color: isActive ? "#7C63C8" : "#374151",
                    fontWeight: isActive ? 700 : 500,
                    background: isActive ? "rgba(124,99,200,0.08)" : "transparent",
                    border: "none", borderRadius: 7, padding: "7px 10px",
                    cursor: "pointer",
                  }}
                >
                  {row.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * ExtremeMonthCard — mini-tuile Pic / Creux mois (calendrier réel)
 * ────────────────────────────────────────────────────────────────────────── */

function ExtremeMonthCard({
  label, month, tone, subValue,
}: {
  label: string
  month: { calendarMonth: number; year: number; workingDays: number; marge: number }
  tone: "good" | "warn" | "bad"
  /** Optionnel : remplace le sub-text "marge € · X j" par une autre info
   *  (ex. marge % pour la carte rupture). */
  subValue?: string
}) {
  const palette = {
    good: { fg: "#15803d", bg: "rgba(34,197,94,0.06)",  bd: "rgba(34,197,94,0.25)" },
    warn: { fg: "#B45309", bg: "rgba(217,119,6,0.06)",  bd: "rgba(217,119,6,0.25)" },
    bad:  { fg: "#B91C1C", bg: "#FEF2F2",               bd: "#FECACA"               },
  }[tone]
  const sign = month.marge < 0 ? "−" : ""
  return (
    <div style={{
      background: palette.bg, border: `1px solid ${palette.bd}`,
      borderRadius: 10, padding: "9px 11px",
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: palette.fg,
        letterSpacing: "0.05em", textTransform: "uppercase",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 14, fontWeight: 800, color: "#111827", marginTop: 2,
      }}>
        {MONTH_ABBR_FR[month.calendarMonth]} {month.year}
      </div>
      <div style={{ fontSize: 10.5, color: "#6B7280", marginTop: 1, fontVariantNumeric: "tabular-nums" }}>
        {subValue ?? `${sign}${Math.abs(Math.round(month.marge)).toLocaleString("fr-FR")} € · ${month.workingDays} j`}
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
 * Lever / format helpers
 * ────────────────────────────────────────────────────────────────────────── */

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

const stepperBtnStyle: React.CSSProperties = {
  width: 32, fontSize: 16, fontWeight: 800,
  color: "#7C63C8", background: "rgba(124,99,200,0.06)",
  border: "1px solid rgba(124,99,200,0.20)", borderRadius: 8,
  cursor: "pointer", fontFamily: "inherit",
  padding: "0 4px",
}

/**
 * StepperField — saisie directe d'un montant avec boutons −/+ et markers cliquables.
 *
 * Plus de slider draggable (peu précis aux niveaux de granularité du pricing).
 * À la place : le sourceur tape la valeur exacte, ajuste par pas (−10/+10 sur
 * TJM, −500/+500 sur Brut), ou clique sur un marker pour aller directement à
 * une valeur de référence (cible mission, plancher Syntec, marge cible/mini).
 */
function StepperField({
  label, value, step, max, suffix, onChange, markers,
}: {
  label: string
  value: number
  step: number
  max: number
  suffix: string
  onChange: (v: number) => void
  markers?: { value: number; label: string; color: string }[]
}) {
  const display = Math.round(value)
  const nudge = (delta: number) => {
    const raw = value + delta
    const clamped = Math.max(0, Math.min(max, raw))
    onChange(Math.round(clamped / step) * step)
  }

  return (
    <div style={{
      background: "white", border: "1.5px solid #F0ECF8",
      borderRadius: 12, padding: "12px 14px",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 10.5, fontWeight: 700, color: "#9CA3AF",
          letterSpacing: "0.05em", textTransform: "uppercase",
        }}>
          {label}
        </span>
        <div style={{ display: "inline-flex", alignItems: "stretch", gap: 6 }}>
          <button
            onClick={() => nudge(-step)}
            aria-label={`Diminuer de ${step}`}
            style={stepperBtnStyle}
          >−</button>
          <div style={{
            display: "inline-flex", alignItems: "baseline", gap: 5,
            background: "#FAFAFA", border: "1px solid #E5E7EB", borderRadius: 8,
            padding: "5px 12px", minWidth: 120,
          }}>
            <input
              type="number"
              value={display}
              step={step}
              max={max}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n)) onChange(Math.max(0, Math.min(max, n)))
              }}
              style={{
                flex: 1, minWidth: 0, width: "100%",
                fontSize: 18, fontWeight: 800, color: "#111827",
                background: "transparent", border: "none", outline: "none",
                padding: 0, textAlign: "right",
                fontFamily: "inherit", fontVariantNumeric: "tabular-nums",
                appearance: "textfield",
              }}
            />
            <span style={{ fontSize: 12, color: "#9CA3AF" }}>{suffix}</span>
          </div>
          <button
            onClick={() => nudge(step)}
            aria-label={`Augmenter de ${step}`}
            style={stepperBtnStyle}
          >+</button>
        </div>
      </div>

      {markers && markers.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {markers.map((m) => {
            const isActive = Math.abs(m.value - value) < step
            return (
              <button
                key={m.label}
                onClick={() => onChange(Math.round(m.value / step) * step)}
                title={`Mettre à ${m.value.toLocaleString("fr-FR")} ${suffix}`}
                style={{
                  fontSize: 10.5, fontWeight: 700,
                  color: isActive ? "white" : m.color,
                  background: isActive ? m.color : `${m.color}14`,
                  border: `1px solid ${isActive ? m.color : m.color + "40"}`,
                  borderRadius: 7, padding: "4px 9px", cursor: "pointer",
                  fontFamily: "inherit",
                  display: "inline-flex", alignItems: "baseline", gap: 5,
                }}
              >
                <span>{m.label}</span>
                <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                  {m.value.toLocaleString("fr-FR")}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * CostBreakdown — détail par ligne (now as a tab)
 * ────────────────────────────────────────────────────────────────────────── */

function CostBreakdown({
  cost, avantages, cpRttHaircutMensuel, rttDaysPerYear,
}: {
  cost: ReturnType<typeof computeEmployerCost>
  avantages: Avantages
  /** Revenu manqué chaque mois à cause des jours CP+RTT non facturables. */
  cpRttHaircutMensuel: number
  rttDaysPerYear: number
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

      {cpRttHaircutMensuel > 0 && (
        <div style={{
          marginTop: 8, paddingTop: 8, borderTop: "1px dashed #E5E7EB",
          display: "flex", justifyContent: "space-between",
          fontSize: 12.5, color: "#B45309",
        }}>
          <span>
            Impact CP{rttDaysPerYear > 0 ? " + RTT" : ""} non facturés
            <span style={{ color: "#9CA3AF", marginLeft: 6 }}>
              · 25 CP{rttDaysPerYear > 0 ? ` + ${rttDaysPerYear} RTT` : ""}/an payés non facturables au client
            </span>
          </span>
          <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            − {formatEurSmart(cpRttHaircutMensuel)} / mois
          </span>
        </div>
      )}

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
