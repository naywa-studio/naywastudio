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
import type { Candidate, Job, MatchTier, Profile } from "@/lib/database.types"
import NoraLoader from "@/components/workspace/NoraLoader"
import PricingWidget from "@/components/workspace/PricingWidget"
import { computeQuickMargin } from "@/lib/pricing/quick-margin"
import { candidateRefLabel } from "@/lib/candidate-ref"

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
  const [profile, setProfile] = useState<Pick<Profile,
    | "pricing_billable_days_per_month" | "pricing_rtt_days_per_year" | "pricing_default_lieu" | "pricing_default_avantages"
  > | null>(null)
  const [candidates, setCandidates] = useState<PricingCandidate[]>([])
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  // Mode comparaison : le sourceur tape "⇆ Comparer" pour activer un picking
  // de 2 candidats à voir côte à côte. compareIds reste vide tant qu'il ne
  // clique pas — on passe en vue comparaison quand compareIds.length === 2.
  const [compareMode, setCompareMode] = useState<boolean>(false)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const toggleCompareId = useCallback((id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 2) return [prev[1], id] /* FIFO : la plus ancienne sort */
      return [...prev, id]
    })
  }, [])
  const exitCompareMode = useCallback(() => {
    setCompareMode(false)
    setCompareIds([])
  }, [])
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

      // Profil cabinet — sert au calcul de marge rapide par candidat dans
      // la liste de gauche (transparence sur qui est rentable d'un coup d'œil).
      const { data: { user } } = await sb.auth.getUser()
      if (user) {
        const { data: profileData } = await sb
          .from("profiles")
          .select("pricing_billable_days_per_month, pricing_rtt_days_per_year, pricing_default_lieu, pricing_default_avantages")
          .eq("user_id", user.id)
          .maybeSingle()
        if (mounted) setProfile(profileData ?? null)
      }

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
        // On exclut les candidats marqués "ancien" par le dédup — le vivier
        // les masque aussi, donc afficher leur match côté pricing crée le
        // même candidat en double dans la liste (une fois "ancien", une fois
        // "freshest"). Le tag est porté sur le candidat joint.
        .filter((r) => r.candidate !== null && !r.candidate.tags?.includes("ancien"))
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
            job={job}
            profile={profile}
            selectedMatchId={selectedMatchId}
            onSelect={setSelectedMatchId}
            compareMode={compareMode}
            compareIds={compareIds}
            onToggleCompareMode={() => {
              if (compareMode) exitCompareMode()
              else setCompareMode(true)
            }}
            onToggleCompareId={toggleCompareId}
          />
        </aside>

        <section style={{ minWidth: 0 }}>
          <AnimatePresence mode="wait">
            {!isMissionConfigured(job) ? (
              <MissionNotConfiguredCta onEdit={() => setMissionEditOpen(true)} />
            ) : compareMode ? (
              <m.div
                key={`compare:${compareIds.join(":")}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <ComparisonPanel
                  candidates={candidates}
                  compareIds={compareIds}
                  job={job}
                  profile={profile}
                  onExit={exitCompareMode}
                />
              </m.div>
            ) : selected ? (
              <m.div
                // Inclure target_gross_salary dans la key : tout changement de
                // brut ciblé mission remonte le widget → initialBrut recapturé
                // depuis job. Le sourceur voit la case "Brut candidat" se
                // mettre à jour automatiquement.
                key={`${selected.matchId}:${job.target_gross_salary ?? ""}`}
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
                  onPricingChange={(mid, t, b) => setCandidates((prev) =>
                    prev.map((c) => c.matchId === mid ? { ...c, pricingTjm: t, pricingBrut: b } : c)
                  )}
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
            {job.title}
          </h1>
          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            {job.location && <Chip>{job.location}</Chip>}
            {job.contract_type && <Chip>{job.contract_type}</Chip>}
            {job.duration_months && <Chip>{job.duration_months} mois</Chip>}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <Link href="/workspace/parametrage" style={{
          fontSize: 12, fontWeight: 700, color: "#7C63C8",
          background: "white", border: "1px solid rgba(124,99,200,0.25)",
          borderRadius: 9, padding: "8px 14px", textDecoration: "none",
          whiteSpace: "nowrap",
        }}>
          ⚙ Paramètres cabinet
        </Link>
        <Link href={`/workspace/missions/${job.id}`} style={{
          fontSize: 12, fontWeight: 700, color: "#7C63C8",
          background: "white", border: "1px solid rgba(124,99,200,0.25)",
          borderRadius: 9, padding: "8px 14px", textDecoration: "none",
          whiteSpace: "nowrap",
        }}>
          Fiche mission →
        </Link>
      </div>
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

  // Optionnels — le brut ciblé n'a plus de champ dédié dans le wizard mission
  // (dérivable depuis TJM + marge cible via les markers du widget pricing).
  // On préserve la valeur déjà persistée si elle existe.
  const [marginMin, setMarginMin] = useState<string>(numToStr(job.margin_min_pct))
  const [marginTarget, setMarginTarget] = useState<string>(numToStr(job.margin_target_pct))

  // Flags d'activation des tarifs cabinet
  const [grandDeplacement, setGrandDeplacement] = useState<boolean>(job.has_grand_deplacement)
  const [expatriated, setExpatriated] = useState<boolean>(job.is_expatriated)

  // Section avancée (overrides marges) repliable
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(
    job.margin_min_pct != null || job.margin_target_pct != null,
  )

  // Auto-save debounced — pas de bouton, les changements s'appliquent direct.
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const isFirstRenderRef = useRef(true)

  const parseNum = (s: string): number | null => {
    if (!s.trim()) return null
    const n = Number(s.replace(",", "."))
    return Number.isFinite(n) ? n : null
  }

  const tjmNum = parseNum(tjm)
  const durationNum = parseNum(duration)
  const marginMinNum = parseNum(marginMin)
  const marginTargetNum = parseNum(marginTarget)
  // Validation override marges si saisis : cible ≥ mini
  const marginsInvalid =
    marginMinNum != null && marginTargetNum != null && marginTargetNum < marginMinNum

  // Auto-save : 600 ms après le dernier changement, on PATCH la mission.
  useEffect(() => {
    if (isFirstRenderRef.current) { isFirstRenderRef.current = false; return }
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    setSaveState("saving"); setError(null)
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_tjm_min: tjmNum,
            client_tjm_max: null,
            duration_months: durationNum,
            target_gross_salary: job.target_gross_salary,
            contract_type: contractType,
            start_date: startDate || null,
            pricing_lieu: lieu,
            has_grand_deplacement: grandDeplacement,
            is_expatriated: expatriated,
            margin_min_pct: marginsInvalid ? null : marginMinNum,
            margin_target_pct: marginsInvalid ? null : marginTargetNum,
          }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        onPatched(data.job as Job)
        setSaveState("saved")
        window.setTimeout(() => setSaveState((s) => s === "saved" ? "idle" : s), 1500)
      } catch (err) {
        setError((err as Error).message); setSaveState("error")
      }
    }, 600)
    return () => { if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current) }
  }, [
    tjm, duration, contractType, startDate, lieu,
    grandDeplacement, expatriated, marginMin, marginTarget,
    tjmNum, durationNum, marginMinNum, marginTargetNum,
    marginsInvalid, job.id, job.target_gross_salary, onPatched,
  ])

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
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: "#7C63C8",
          letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          📋 Paramétrage mission
        </span>
        {saveState === "saving" && <SaveBadge tone="muted">Enregistrement…</SaveBadge>}
        {saveState === "saved"  && <SaveBadge tone="green">✓ Enregistré</SaveBadge>}
        {saveState === "error"  && <SaveBadge tone="red">⚠ {error ?? "Échec"}</SaveBadge>}
        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              marginLeft: "auto", fontSize: 11, fontWeight: 600, color: "#7C63C8",
              background: "white", border: "1px solid rgba(124,99,200,0.25)",
              borderRadius: 8, padding: "4px 10px", cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Fermer
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
        {/* Brut ciblé candidat retiré — il est dérivable à partir du TJM + de
            la marge cible. Le widget pricing propose un brut idéal et un brut
            max via ses markers de stepper, donc pas la peine de le saisir ici.
            La valeur déjà en base reste lue par le widget pour rétro-compat. */}
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

    </m.div>
  )
}

function SaveBadge({ tone, children }: { tone: "muted" | "green" | "red"; children: React.ReactNode }) {
  const colors = {
    muted: { fg: "#6B7280", bg: "#F3F4F6", bd: "#E5E7EB" },
    green: { fg: "#15803d", bg: "rgba(34,197,94,0.07)", bd: "rgba(34,197,94,0.25)" },
    red:   { fg: "#B91C1C", bg: "rgba(220,38,38,0.06)", bd: "rgba(220,38,38,0.25)" },
  }[tone]
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, color: colors.fg,
      background: colors.bg, border: `1px solid ${colors.bd}`,
      borderRadius: 100, padding: "2px 8px",
    }}>
      {children}
    </span>
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
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Input EN HAUT — toutes les cases s'alignent quelle que soit la longueur du libellé/hint. */}
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
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#374151" }}>
        {label} {required && <span style={{ color: "#B91C1C" }}>*</span>}
      </span>
      {hint && <span style={{ fontSize: 10.5, color: "#9CA3AF", lineHeight: 1.4 }}>{hint}</span>}
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
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#374151" }}>{label}</span>
      {hint && <span style={{ fontSize: 10.5, color: "#9CA3AF", lineHeight: 1.4 }}>{hint}</span>}
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
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#374151" }}>
        {label} {required && <span style={{ color: "#B91C1C" }}>*</span>}
      </span>
      {hint && <span style={{ fontSize: 10.5, color: "#9CA3AF", lineHeight: 1.4 }}>{hint}</span>}
    </label>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Candidates list — compact (avatar + nom + score)
 * ────────────────────────────────────────────────────────────────────────── */

function CompactCandidatesList({
  candidates, job, profile, selectedMatchId, onSelect,
  compareMode, compareIds, onToggleCompareMode, onToggleCompareId,
}: {
  candidates: PricingCandidate[]
  job: Job
  profile: Pick<Profile,
    | "pricing_billable_days_per_month" | "pricing_rtt_days_per_year" | "pricing_default_lieu" | "pricing_default_avantages"
  > | null
  selectedMatchId: string | null
  onSelect: (id: string) => void
  compareMode: boolean
  compareIds: string[]
  onToggleCompareMode: () => void
  onToggleCompareId: (id: string) => void
}) {
  // Tri par marge décroissante : les candidats les plus rentables en haut →
  // décision commerciale plus rapide (qui pousser en priorité au client).
  // Ceux sans marge calculable (mission pas paramétrée, etc.) restent en fin.
  const sorted = [...candidates].sort((a, b) => {
    const ma = computeQuickMargin({
      candidate: a.candidate, job, profile,
      persistedTjm: a.pricingTjm, persistedBrut: a.pricingBrut,
    })?.margePct ?? -Infinity
    const mb = computeQuickMargin({
      candidate: b.candidate, job, profile,
      persistedTjm: b.pricingTjm, persistedBrut: b.pricingBrut,
    })?.margePct ?? -Infinity
    return mb - ma
  })
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Header avec compteur + toggle comparaison */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 8, marginBottom: 4,
      }}>
        <p style={{
          margin: 0, fontSize: 10.5, fontWeight: 700, color: "#9CA3AF",
          letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          Candidats · {sorted.length}
        </p>
        {sorted.length >= 2 && (
          <button
            onClick={onToggleCompareMode}
            style={{
              fontFamily: "inherit", fontSize: 10, fontWeight: 700,
              padding: "3px 8px", borderRadius: 100,
              color: compareMode ? "white" : "#7C63C8",
              background: compareMode
                ? "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)"
                : "rgba(124,99,200,0.08)",
              border: compareMode
                ? "1px solid #7C63C8"
                : "1px solid rgba(124,99,200,0.25)",
              cursor: "pointer",
            }}
          >
            {compareMode ? "✕ Quitter" : "⇆ Comparer"}
          </button>
        )}
      </div>
      {compareMode && (
        <p style={{
          margin: "0 0 4px", fontSize: 11, color: "#7C63C8", lineHeight: 1.4,
          padding: "6px 10px",
          background: "rgba(124,99,200,0.06)",
          border: "1px solid rgba(124,99,200,0.18)",
          borderRadius: 8,
        }}>
          {compareIds.length === 0 && "Choisissez deux candidats à comparer."}
          {compareIds.length === 1 && "Encore un candidat à choisir."}
          {compareIds.length === 2 && "Comparaison affichée à droite."}
        </p>
      )}
      {sorted.length === 0 && (
        <p style={{ margin: 0, fontSize: 11.5, color: "#6B7280", lineHeight: 1.5 }}>
          Aucun candidat à chiffrer.
        </p>
      )}
      {sorted.map((c, i) => {
        const active = c.matchId === selectedMatchId
        const compareRank = compareMode ? compareIds.indexOf(c.matchId) : -1
        const inCompare = compareRank >= 0
        const initials = (c.candidate.full_name ?? "?")
          .split(" ").slice(0, 2).map((s) => s[0] ?? "").join("").toUpperCase()
        // Calcul rapide marge + brut pour le récap (réutilise les mêmes
        // fonctions que le widget, donc aucune divergence possible).
        const quick = computeQuickMargin({
          candidate: c.candidate, job, profile,
          persistedTjm: c.pricingTjm, persistedBrut: c.pricingBrut,
        })
        const margeColor = quick == null ? "#9CA3AF"
          : quick.margePct >= 22 ? "#15803d"
          : quick.margePct >= 15 ? "#B45309"
          : "#B91C1C"
        return (
          <m.button
            key={c.matchId}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.2), ease: EASE }}
            onClick={() => {
              if (compareMode) onToggleCompareId(c.matchId)
              else onSelect(c.matchId)
            }}
            style={{
              textAlign: "left", cursor: "pointer", fontFamily: "inherit",
              background: inCompare
                ? "linear-gradient(135deg, rgba(124,99,200,0.14), rgba(124,99,200,0.04))"
                : active
                  ? "linear-gradient(135deg, rgba(124,99,200,0.10), rgba(124,99,200,0.04))"
                  : "white",
              border: inCompare
                ? "1.5px solid #7C63C8"
                : active
                  ? "1.5px solid rgba(124,99,200,0.40)"
                  : "1px solid #F0ECF8",
              borderRadius: 10, padding: "9px 10px",
              display: "flex", flexDirection: "column", gap: 5,
              position: "relative",
            }}
          >
            {inCompare && (
              <span style={{
                position: "absolute", top: -7, right: -7,
                width: 18, height: 18, borderRadius: "50%",
                background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                color: "white", fontSize: 10, fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 6px rgba(124,99,200,0.30)",
              }}>
                {compareRank + 1}
              </span>
            )}
            {/* Ligne 1 : avatar + nom + score */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                width: 26, height: 26, borderRadius: "50%",
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
                  background: active ? "white" : "#F4F1FB", flexShrink: 0,
                }}>
                  {c.score}
                </span>
              )}
            </div>
            {/* Ligne 1.5 : ref candidate */}
            <div style={{
              paddingLeft: 34, fontSize: 9.5, color: "#9CA3AF",
              fontFamily: "var(--font-space-grotesk), monospace",
              letterSpacing: "0.04em", marginTop: -2,
            }}>
              {candidateRefLabel(c.candidate.id)}
            </div>
            {/* Ligne 2 : brut + marge — uniquement quand le sourceur a
                explicitement chiffré ce candidat (TJM ou brut persisté).
                Sinon, afficher la marge auto-calculée donne une fausse
                impression de "pricing fait" alors que c'est un défaut. */}
            {quick && (c.pricingTjm != null || c.pricingBrut != null) && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 6, paddingLeft: 34, fontSize: 10.5, color: "#9CA3AF",
                fontVariantNumeric: "tabular-nums",
              }}>
                <span>{Math.round(quick.brut / 1000)} k€</span>
                <span style={{ color: margeColor, fontWeight: 700 }}>
                  {quick.margePct.toFixed(1)} %
                </span>
              </div>
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

/** Affiché à la place du widget quand la mission n'est pas (encore) paramétrée :
 *  inutile d'afficher un chiffrage avec des charts faux — on guide vers le wizard. */
function MissionNotConfiguredCta({ onEdit }: { onEdit: () => void }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      style={{
        background: "white", border: "2px dashed rgba(124,99,200,0.30)",
        borderRadius: 16, padding: "48px 28px", textAlign: "center",
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 14 }}>📋</div>
      <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800, color: "#111827" }}>
        Mission à paramétrer
      </h3>
      <p style={{
        margin: "0 auto 16px", maxWidth: 460, fontSize: 13, color: "#6B7280",
        lineHeight: 1.6,
      }}>
        Renseigne le <strong>TJM</strong>, la <strong>durée</strong>, la <strong>date de démarrage</strong>
        {" "}et le <strong>lieu</strong> de la mission. Les graphiques et le verdict deviennent pertinents
        une fois ces paramètres saisis.
      </p>
      <button
        onClick={onEdit}
        style={{
          display: "inline-block",
          fontSize: 12.5, fontWeight: 700, color: "white",
          background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
          border: "none", borderRadius: 10, padding: "9px 18px",
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        ⚙ Paramétrer la mission
      </button>
    </m.div>
  )
}

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
  maxWidth: 1760, margin: "0 auto",
  fontFamily: "var(--font-inter), sans-serif",
}

/* ──────────────────────────────────────────────────────────────────────────
 * ComparisonPanel — 2 candidats côte à côte
 *
 * S'appuie strictement sur computeQuickMargin (mêmes fonctions que le widget)
 * pour qu'il n'y ait aucune divergence de chiffre. Affiche les KPI clés en
 * 2 colonnes : séniorité détectée, TJM, brut, marge %, marge mensuelle,
 * marge totale, et un verdict côte à côte.
 * ────────────────────────────────────────────────────────────────────────── */

function ComparisonPanel({
  candidates, compareIds, job, profile, onExit,
}: {
  candidates: PricingCandidate[]
  compareIds: string[]
  job: Job
  profile: Pick<Profile,
    | "pricing_billable_days_per_month" | "pricing_rtt_days_per_year" | "pricing_default_lieu" | "pricing_default_avantages"
  > | null
  onExit: () => void
}) {
  const picked = compareIds
    .map((id) => candidates.find((c) => c.matchId === id))
    .filter((x): x is PricingCandidate => !!x)

  return (
    <section style={{
      background: "white", borderRadius: 16, border: "1px solid #F0ECF8",
      padding: 18,
    }}>
      {/* Header — titre + close */}
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 14,
      }}>
        <div>
          <h3 style={{
            margin: 0, fontSize: 14, fontWeight: 800, color: "#111827",
          }}>
            Comparaison de candidats
          </h3>
          <p style={{
            margin: "3px 0 0", fontSize: 11, color: "#9CA3AF", lineHeight: 1.4,
          }}>
            {picked.length}/2 sélectionnés · choisis les candidats dans la liste à gauche pour les comparer côte à côte.
          </p>
        </div>
        <button onClick={onExit} style={{
          fontFamily: "inherit", fontSize: 11, fontWeight: 700, color: "#7C63C8",
          background: "rgba(124,99,200,0.06)",
          border: "1px solid rgba(124,99,200,0.20)",
          borderRadius: 8, padding: "5px 10px", cursor: "pointer",
        }}>
          ✕ Fermer
        </button>
      </header>

      {picked.length < 2 ? (
        <ComparisonEmptyState picked={picked.length} />
      ) : (
        <>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
          }}>
            {picked.map((p, idx) => (
              <ComparisonCard key={p.matchId} rank={idx + 1} pc={p} job={job} profile={profile} />
            ))}
          </div>
          <NoraVerdictBubble
            matchAId={picked[0].matchId}
            matchBId={picked[1].matchId}
            candidateAName={picked[0].candidate.full_name ?? "Candidat A"}
            candidateBName={picked[1].candidate.full_name ?? "Candidat B"}
          />
        </>
      )}
    </section>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * NoraVerdictBubble — bulle de chat "La reco de Nora" pour la comparaison
 *
 * On ne fait PAS l'appel LLM automatiquement (coût + quota) : le sourceur
 * clique "Demander l'avis de Nora" quand il veut. Le résultat est mis en
 * cache par paire de matchIds — re-cliquer sur la même paire ne re-tire pas.
 * ────────────────────────────────────────────────────────────────────────── */

function NoraVerdictBubble({
  matchAId, matchBId, candidateAName, candidateBName,
}: {
  matchAId: string
  matchBId: string
  candidateAName: string
  candidateBName: string
}) {
  type State =
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ok"; winner: "A" | "B" | "tie"; commentary: string }
    | { kind: "error"; message: string }
  const [state, setState] = useState<State>({ kind: "idle" })
  // Reset si la paire change
  const pairKey = `${matchAId}|${matchBId}`
  const lastKeyRef = useRef(pairKey)
  if (lastKeyRef.current !== pairKey && state.kind !== "loading") {
    lastKeyRef.current = pairKey
    if (state.kind !== "idle") setState({ kind: "idle" })
  }

  const ask = async () => {
    setState({ kind: "loading" })
    try {
      const res = await fetch(`/api/pricing/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchAId, matchBId }),
      })
      const data = await res.json().catch(() => null) as { winner?: string; commentary?: string; error?: string; message?: string } | null
      if (!res.ok || !data?.commentary) {
        throw new Error(data?.message ?? data?.error ?? `HTTP ${res.status}`)
      }
      const winner = (data.winner === "A" || data.winner === "B" || data.winner === "tie") ? data.winner : "tie"
      setState({ kind: "ok", winner, commentary: data.commentary })
    } catch (err) {
      setState({ kind: "error", message: (err as Error).message })
    }
  }

  return (
    <div style={{
      marginTop: 14,
      display: "flex", alignItems: "flex-start", gap: 10,
    }}>
      <div style={{
        width: 30, height: 30, flexShrink: 0,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #7C63C8 0%, #6B54B2 100%)",
        color: "white", fontSize: 12, fontWeight: 800,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 2px 8px rgba(124,99,200,0.25)",
      }}>
        N
      </div>

      <div style={{
        flex: 1,
        background: "#FFFFFF",
        border: "1px solid rgba(124,99,200,0.25)",
        borderRadius: 14, borderTopLeftRadius: 4,
        padding: "11px 14px",
        boxShadow: "0 1px 2px rgba(17,24,39,0.04)",
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: "#7C63C8",
          marginBottom: 4,
        }}>
          La reco de Nora
        </div>
        {state.kind === "idle" && (
          <>
            <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "#374151", lineHeight: 1.55 }}>
              Vous voulez un avis rapide sur le meilleur choix entre {candidateAName} et {candidateBName} ?
            </p>
            <button onClick={ask} style={{
              fontFamily: "inherit", fontSize: 11.5, fontWeight: 700,
              color: "white",
              padding: "6px 12px", borderRadius: 8,
              background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
              border: "1px solid rgba(124,99,200,0.40)",
              cursor: "pointer",
            }}>
              ✦ Demander l&apos;avis de Nora
            </button>
          </>
        )}
        {state.kind === "loading" && (
          <p style={{ margin: 0, fontSize: 12.5, color: "#9CA3AF", lineHeight: 1.55, fontStyle: "italic" }}>
            Nora analyse les deux candidats…
          </p>
        )}
        {state.kind === "ok" && (
          <>
            {state.winner !== "tie" && (
              <div style={{
                display: "inline-block",
                fontSize: 10, fontWeight: 800, color: "#15803d",
                background: "rgba(34,197,94,0.10)",
                border: "1px solid rgba(34,197,94,0.25)",
                borderRadius: 100, padding: "2px 8px", marginBottom: 6,
                letterSpacing: "0.05em", textTransform: "uppercase",
              }}>
                ✓ Préférence : {state.winner === "A" ? candidateAName : candidateBName}
              </div>
            )}
            <p style={{ margin: 0, fontSize: 12.5, color: "#374151", lineHeight: 1.55 }}>
              {state.commentary}
            </p>
          </>
        )}
        {state.kind === "error" && (
          <>
            <p style={{ margin: "0 0 6px", fontSize: 12.5, color: "#B91C1C", lineHeight: 1.55 }}>
              Désolée, je n&apos;ai pas pu donner d&apos;avis ({state.message}).
            </p>
            <button onClick={ask} style={{
              fontFamily: "inherit", fontSize: 11, fontWeight: 700,
              color: "#7C63C8", background: "rgba(124,99,200,0.06)",
              border: "1px solid rgba(124,99,200,0.25)",
              borderRadius: 7, padding: "4px 10px", cursor: "pointer",
            }}>
              Réessayer
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function ComparisonEmptyState({ picked }: { picked: number }) {
  return (
    <div style={{
      padding: "36px 18px", textAlign: "center",
      background: "#FAFAFA", border: "1px dashed #E5E7EB", borderRadius: 12,
    }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>⇆</div>
      <p style={{ margin: 0, fontSize: 13, color: "#374151", fontWeight: 600 }}>
        {picked === 0 ? "Choisissez 2 candidats à comparer." : "Encore un candidat à choisir."}
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "#9CA3AF", lineHeight: 1.5 }}>
        Cliquez dans la liste à gauche pour les ajouter à la comparaison.
      </p>
    </div>
  )
}

function ComparisonCard({
  rank, pc, job, profile,
}: {
  rank: number
  pc: PricingCandidate
  job: Job
  profile: Pick<Profile,
    | "pricing_billable_days_per_month" | "pricing_rtt_days_per_year" | "pricing_default_lieu" | "pricing_default_avantages"
  > | null
}) {
  const quick = computeQuickMargin({
    candidate: pc.candidate, job, profile,
    persistedTjm: pc.pricingTjm, persistedBrut: pc.pricingBrut,
  })
  const targetPct = job.margin_target_pct ?? 22
  const minPct = job.margin_min_pct ?? 15
  const status: { fg: string; bg: string; bd: string; label: string } =
    quick == null            ? { fg: "#6B7280", bg: "#FAFAFA",                bd: "#E5E7EB",                label: "Pricing en attente" }
    : quick.margePct >= targetPct ? { fg: "#15803d", bg: "rgba(34,197,94,0.06)",  bd: "rgba(34,197,94,0.25)",  label: "Mission rentable" }
    : quick.margePct >= minPct    ? { fg: "#B45309", bg: "rgba(217,119,6,0.06)",  bd: "rgba(217,119,6,0.25)",  label: "Sous la cible" }
    : quick.margePct >= 0         ? { fg: "#B91C1C", bg: "#FEF2F2",               bd: "#FECACA",                label: "Sous le plancher" }
                                  : { fg: "#B91C1C", bg: "#FEF2F2",               bd: "#FECACA",                label: "Mission en perte" }
  const margeMonth = quick ? quick.margeMensuelleEur : null
  const margeTotal = quick ? Math.round(quick.margeMensuelleEur * 12) : null
  const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR")

  return (
    <div style={{
      background: status.bg, border: `1.5px solid ${status.bd}`,
      borderRadius: 12, padding: 14,
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      {/* Identification candidat + badge rang */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          width: 24, height: 24, borderRadius: "50%",
          background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
          color: "white", fontSize: 11, fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          {rank}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 13, fontWeight: 800, color: "#111827",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {pc.candidate.full_name ?? "Sans nom"}
          </div>
          <div style={{ fontSize: 10.5, color: "#6B7280", marginTop: 1 }}>
            {pc.candidate.current_title ?? "—"}
            {pc.candidate.years_experience != null ? ` · ${pc.candidate.years_experience} ans XP` : ""}
          </div>
        </div>
      </div>

      {/* Verdict */}
      <div style={{
        fontSize: 10, fontWeight: 700, color: status.fg,
        letterSpacing: "0.06em", textTransform: "uppercase",
      }}>
        {status.label}
      </div>

      {/* KPIs — marge moyenne en gros, sub : marge mensuelle / totale */}
      <div style={{
        display: "flex", alignItems: "baseline", gap: 6,
      }}>
        <span style={{
          fontSize: 32, fontWeight: 800, color: status.fg,
          fontVariantNumeric: "tabular-nums", lineHeight: 1,
        }}>
          {quick == null ? "—" : `${quick.margePct.toFixed(1)}`}
        </span>
        <span style={{ fontSize: 14, color: status.fg, fontWeight: 700 }}>
          {quick == null ? "" : "% marge moyenne"}
        </span>
      </div>

      {/* Détail TJM / Brut / Marge mensuelle / totale */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
        paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.06)",
      }}>
        <CompareStat label="TJM" value={quick ? `${quick.tjm} €/j` : "—"} />
        <CompareStat label="Brut" value={quick ? `${fmt(quick.brut)} €/an` : "—"} />
        <CompareStat label="Marge / mois" value={margeMonth != null ? `${fmt(margeMonth)} €` : "—"} />
        <CompareStat label="Marge totale" value={margeTotal != null ? `${fmt(margeTotal)} €` : "—"} />
      </div>

      {/* Précision : si pas de pricing persisté, on prévient. */}
      {quick != null && pc.pricingTjm == null && pc.pricingBrut == null && (
        <p style={{
          margin: 0, fontSize: 10.5, color: "#9CA3AF", lineHeight: 1.4,
          fontStyle: "italic",
        }}>
          Valeurs auto-calculées (TJM mission + brut par défaut). Ouvre la
          fiche pricing du candidat pour ajuster.
        </p>
      )}
    </div>
  )
}

function CompareStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{
        fontSize: 9.5, fontWeight: 700, color: "#9CA3AF",
        letterSpacing: "0.05em", textTransform: "uppercase",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 13, fontWeight: 700, color: "#111827",
        fontVariantNumeric: "tabular-nums", marginTop: 2,
      }}>
        {value}
      </div>
    </div>
  )
}
