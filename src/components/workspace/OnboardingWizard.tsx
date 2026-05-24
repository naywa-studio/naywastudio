"use client"

/**
 * OnboardingWizard — premier passage sur /workspace/pricing.
 *
 * 5 étapes guidées qui sauvegardent automatiquement dans profiles à
 * chaque interaction. Quand le sourceur arrive sur le pricing pour la
 * première fois (pricing_billable_days_per_month NULL), ce wizard
 * remplace l'écran liste-missions. Une fois fini, la liste apparaît.
 *
 * Skip possible à tout moment via "Configurer plus tard" qui pointe
 * vers la page Paramétrage complète (où tous les champs sont éditables).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { m, AnimatePresence } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import type { PricingDefaultAvantages } from "@/lib/database.types"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

type Lieu = "paris_petite_couronne" | "idf_grande_couronne" | "lyon" | "province"
type Modalite = "modalite_1" | "modalite_2" | "modalite_3"

interface WizardState {
  pricing_billable_days_per_month: number
  pricing_margin_min_pct: number
  pricing_margin_target_pct: number
  pricing_default_lieu: Lieu
  pricing_default_modalite: Modalite
  pricing_default_avantages: PricingDefaultAvantages
}

const DEFAULT_STATE: WizardState = {
  pricing_billable_days_per_month: 18,
  pricing_margin_min_pct: 15,
  pricing_margin_target_pct: 22,
  pricing_default_lieu: "paris_petite_couronne",
  pricing_default_modalite: "modalite_1",
  pricing_default_avantages: {
    ticketsResto: 0,
    mutuellePremium: 0,
    transport: 0,
    forfaitMobilite: 0,
    treiziemeMois: false,
    primeCooptationAnnuelle: 0,
    urssafIndemniteJour: 0,
    medecineDuTravailAnnuel: 100,
    indemniteKilometriqueAnnuelle: 0,
    expatriationMensuelle: 0,
    autresMensuels: 0,
  },
}

const TOTAL_STEPS = 5

export default function OnboardingWizard({
  onDone,
}: {
  onDone: () => void
}) {
  const sb = useMemo(() => getSupabase(), [])
  const [step, setStep] = useState(1)
  const [state, setState] = useState<WizardState>(DEFAULT_STATE)
  const [saving, setSaving] = useState(false)
  const userIdRef = useRef<string | null>(null)
  const saveTimerRef = useRef<number | null>(null)

  // Capture user id once for save calls.
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (mounted) userIdRef.current = user?.id ?? null
    })()
    return () => { mounted = false }
  }, [sb])

  // Debounced save: when state changes, schedule a write after 600 ms.
  const scheduleSave = useCallback(
    (next: WizardState) => {
      if (!userIdRef.current) return
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
      setSaving(true)
      saveTimerRef.current = window.setTimeout(async () => {
        await sb
          .from("profiles")
          .update({
            pricing_billable_days_per_month: next.pricing_billable_days_per_month,
            pricing_margin_min_pct: next.pricing_margin_min_pct,
            pricing_margin_target_pct: next.pricing_margin_target_pct,
            pricing_default_lieu: next.pricing_default_lieu,
            pricing_default_modalite: next.pricing_default_modalite,
            pricing_default_avantages: next.pricing_default_avantages,
          })
          .eq("user_id", userIdRef.current!)
        setSaving(false)
      }, 600)
    },
    [sb],
  )

  const update = useCallback(
    <K extends keyof WizardState>(key: K, value: WizardState[K]) => {
      setState((prev) => {
        const next = { ...prev, [key]: value }
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave],
  )

  const updateAvantage = useCallback(
    <K extends keyof PricingDefaultAvantages>(key: K, value: PricingDefaultAvantages[K]) => {
      setState((prev) => {
        const next = {
          ...prev,
          pricing_default_avantages: { ...prev.pricing_default_avantages, [key]: value },
        }
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave],
  )

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  const back = () => setStep((s) => Math.max(s - 1, 1))

  const finish = async () => {
    // Make sure the last debounce wrote before we hand off.
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (userIdRef.current) {
      await sb
        .from("profiles")
        .update({
          pricing_billable_days_per_month: state.pricing_billable_days_per_month,
          pricing_margin_min_pct: state.pricing_margin_min_pct,
          pricing_margin_target_pct: state.pricing_margin_target_pct,
          pricing_default_lieu: state.pricing_default_lieu,
          pricing_default_modalite: state.pricing_default_modalite,
          pricing_default_avantages: state.pricing_default_avantages,
        })
        .eq("user_id", userIdRef.current)
    }
    onDone()
  }

  return (
    <div style={{
      maxWidth: 640, margin: "32px auto 0",
      background: "white", borderRadius: 18,
      border: "1px solid #F0ECF8",
      overflow: "hidden",
      boxShadow: "0 12px 40px -16px rgba(124,99,200,0.18)",
    }}>
      <ProgressHeader step={step} total={TOTAL_STEPS} saving={saving} />

      <div style={{ padding: "28px 32px 24px", minHeight: 320 }}>
        <AnimatePresence mode="wait">
          <m.div
            key={step}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            {step === 1 && <StepWelcome />}
            {step === 2 && (
              <StepHypotheses state={state} update={update} />
            )}
            {step === 3 && (
              <StepMissionDefaults state={state} update={update} />
            )}
            {step === 4 && (
              <StepAvantages state={state} updateAvantage={updateAvantage} />
            )}
            {step === 5 && <StepDone />}
          </m.div>
        </AnimatePresence>
      </div>

      <Footer
        step={step} total={TOTAL_STEPS}
        onBack={back} onNext={next} onFinish={finish}
      />
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Progress header
 * ────────────────────────────────────────────────────────────────────────── */

function ProgressHeader({ step, total, saving }: { step: number; total: number; saving: boolean }) {
  return (
    <div style={{
      background: "linear-gradient(120deg, rgba(124,99,200,0.06), rgba(217,119,6,0.04))",
      padding: "14px 32px",
      borderBottom: "1px solid #F0ECF8",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 8,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: "#7C63C8",
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          ⚙ Configuration · Étape {step}/{total}
        </span>
        {saving && (
          <span style={{ fontSize: 10.5, color: "#9CA3AF", fontStyle: "italic" }}>
            Enregistrement…
          </span>
        )}
      </div>
      <div style={{
        height: 4, borderRadius: 4, background: "rgba(124,99,200,0.10)",
        overflow: "hidden",
      }}>
        <m.div
          animate={{ width: `${(step / total) * 100}%` }}
          transition={{ duration: 0.35, ease: EASE }}
          style={{
            height: "100%",
            background: "linear-gradient(120deg, #7C63C8, #6B54B2)",
            borderRadius: 4,
          }}
        />
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Steps
 * ────────────────────────────────────────────────────────────────────────── */

function StepWelcome() {
  return (
    <div style={{ textAlign: "center", paddingTop: 16 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>👋</div>
      <h2 style={titleStyle}>Bienvenue dans le pricing Naywa</h2>
      <p style={leadStyle}>
        En 2 minutes, vous configurez les paramètres récurrents de votre cabinet
        pour que chaque chiffrage candidat soit calculé automatiquement.
      </p>
      <p style={{ ...leadStyle, marginTop: 14, fontSize: 12.5, color: "#9CA3AF" }}>
        Vous pourrez tout modifier plus tard depuis ⚙ Paramètres.
      </p>
    </div>
  )
}

function StepHypotheses({
  state, update,
}: {
  state: WizardState
  update: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void
}) {
  return (
    <div>
      <h2 style={titleStyle}>📊 Vos hypothèses commerciales</h2>
      <p style={leadStyle}>
        Trois valeurs qui structurent tous vos chiffrages.
      </p>

      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <Field
          label="Jours facturables par mois en moyenne"
          hint="Standard ESN : 17-18 jours (après congés, RTT, fériés, intercontrats)"
        >
          <NumberInput
            value={state.pricing_billable_days_per_month}
            onChange={(v) => update("pricing_billable_days_per_month", v)}
            min={10} max={22} step={0.5}
            suffix="jours"
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Marge minimum acceptable" hint="Plancher en dessous duquel vous refusez">
            <NumberInput
              value={state.pricing_margin_min_pct}
              onChange={(v) => update("pricing_margin_min_pct", v)}
              min={0} max={100} step={0.5}
              suffix="%"
            />
          </Field>
          <Field label="Marge cible standard" hint="L'objectif visé par le cabinet">
            <NumberInput
              value={state.pricing_margin_target_pct}
              onChange={(v) => update("pricing_margin_target_pct", v)}
              min={0} max={100} step={0.5}
              suffix="%"
            />
          </Field>
        </div>
      </div>
    </div>
  )
}

function StepMissionDefaults({
  state, update,
}: {
  state: WizardState
  update: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void
}) {
  const lieuOptions: { value: Lieu; label: string }[] = [
    { value: "paris_petite_couronne", label: "Paris + petite couronne (75/92/93/94)" },
    { value: "idf_grande_couronne", label: "Île-de-France grande couronne" },
    { value: "lyon", label: "Lyon métropole" },
    { value: "province", label: "Province (autres communes)" },
  ]
  const modOptions: { value: Modalite; label: string }[] = [
    { value: "modalite_1", label: "Modalité 1 — Standard 35h" },
    { value: "modalite_2", label: "Modalité 2 — 38h30 (+15% mini)" },
    { value: "modalite_3", label: "Modalité 3 — Forfait jours 218j (+20% mini)" },
  ]
  return (
    <div>
      <h2 style={titleStyle}>🌍 Mission par défaut</h2>
      <p style={leadStyle}>
        Ce que vous voyez le plus souvent — modifiable mission par mission après.
      </p>

      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="Lieu de mission le plus fréquent" hint="Détermine le versement mobilité par défaut">
          <NativeSelect
            value={state.pricing_default_lieu}
            onChange={(v) => update("pricing_default_lieu", v as Lieu)}
            options={lieuOptions}
          />
        </Field>

        <Field label="Modalité Syntec par défaut" hint="La modalité 3 (forfait jours) impose un minimum +20%">
          <NativeSelect
            value={state.pricing_default_modalite}
            onChange={(v) => update("pricing_default_modalite", v as Modalite)}
            options={modOptions}
          />
        </Field>
      </div>
    </div>
  )
}

function StepAvantages({
  state, updateAvantage,
}: {
  state: WizardState
  updateAvantage: <K extends keyof PricingDefaultAvantages>(
    key: K, value: PricingDefaultAvantages[K]
  ) => void
}) {
  return (
    <div>
      <h2 style={titleStyle}>🎁 Avantages que vous offrez</h2>
      <p style={leadStyle}>
        Cochez ce que votre cabinet propose. Vous pourrez ajuster les montants
        précis depuis ⚙ Paramètres plus tard.
      </p>

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column" }}>
        <AvantageToggle
          label="🍽 Tickets restaurant"
          hint="≈ 100 €/mois part employeur (60% × 9 € × 18 j)"
          checked={(state.pricing_default_avantages.ticketsResto ?? 0) > 0}
          onToggle={(on) => updateAvantage("ticketsResto", on ? 100 : 0)}
        />
        <AvantageToggle
          label="🏥 Mutuelle premium"
          hint="Part employeur au-delà du minimum légal (45 €/mois par défaut)"
          checked={(state.pricing_default_avantages.mutuellePremium ?? 0) > 0}
          onToggle={(on) => updateAvantage("mutuellePremium", on ? 45 : 0)}
        />
        <AvantageToggle
          label="🚆 Transport en commun (50%)"
          hint="Remboursement Navigo / TCL — 42 €/mois par défaut"
          checked={(state.pricing_default_avantages.transport ?? 0) > 0}
          onToggle={(on) => updateAvantage("transport", on ? 42 : 0)}
        />
        <AvantageToggle
          label="🩺 Médecine du travail (obligatoire)"
          hint="Cotisation SST, ~100 €/an par salarié — généralement payée par toutes les entreprises"
          checked={(state.pricing_default_avantages.medecineDuTravailAnnuel ?? 0) > 0}
          onToggle={(on) => updateAvantage("medecineDuTravailAnnuel", on ? 100 : 0)}
        />
        <AvantageToggle
          label="🧳 Indemnité URSSAF (grand déplacement)"
          hint="Si vos consultants sont souvent en déplacement (97,90 €/j province)"
          checked={(state.pricing_default_avantages.urssafIndemniteJour ?? 0) > 0}
          onToggle={(on) => updateAvantage("urssafIndemniteJour", on ? 97.90 : 0)}
        />
        <AvantageToggle
          label="🎁 13ᵉ mois"
          hint="Si votre cabinet le pratique (~60% des ESN)"
          checked={state.pricing_default_avantages.treiziemeMois === true}
          onToggle={(on) => updateAvantage("treiziemeMois", on)}
        />
      </div>
    </div>
  )
}

function StepDone() {
  return (
    <div style={{ textAlign: "center", paddingTop: 16 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
      <h2 style={titleStyle}>Tout est configuré !</h2>
      <p style={leadStyle}>
        Vous pouvez maintenant chiffrer vos missions. Sélectionnez une mission
        dans la liste pour commencer.
      </p>
      <p style={{ ...leadStyle, marginTop: 14, fontSize: 12.5, color: "#9CA3AF" }}>
        Tous ces paramètres restent ajustables depuis ⚙ Paramètres entreprise.
      </p>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Footer with nav buttons
 * ────────────────────────────────────────────────────────────────────────── */

function Footer({
  step, total, onBack, onNext, onFinish,
}: {
  step: number
  total: number
  onBack: () => void
  onNext: () => void
  onFinish: () => void
}) {
  return (
    <div style={{
      padding: "14px 32px",
      borderTop: "1px solid #F0ECF8",
      background: "#FAFAFA",
      display: "flex", justifyContent: "space-between", alignItems: "center",
      gap: 10, flexWrap: "wrap",
    }}>
      <div>
        {step > 1 && step < total && (
          <button onClick={onBack} style={btnSecondaryStyle}>
            ← Précédent
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Link href="/workspace/parametrage" style={{
          fontSize: 11.5, fontWeight: 600, color: "#9CA3AF",
          textDecoration: "underline",
        }}>
          Configurer plus tard
        </Link>
        {step < total && (
          <button onClick={onNext} style={btnPrimaryStyle}>
            Suivant →
          </button>
        )}
        {step === total && (
          <button onClick={onFinish} style={btnPrimaryStyle}>
            Commencer le pricing →
          </button>
        )}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Reusable form widgets
 * ────────────────────────────────────────────────────────────────────────── */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#374151" }}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: "#9CA3AF", marginLeft: 6 }}>· {hint}</span>}
      </span>
      {children}
    </label>
  )
}

function NumberInput({
  value, onChange, min, max, step, suffix,
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  suffix: string
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      background: "white", border: "1px solid #E5E7EB", borderRadius: 9,
      overflow: "hidden",
    }}>
      <input
        type="number"
        value={value}
        min={min} max={max} step={step}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
        style={{
          flex: 1, padding: "9px 12px",
          fontSize: 14, fontWeight: 600, color: "#111827",
          background: "transparent", border: "none", outline: "none",
          fontFamily: "inherit", minWidth: 0, width: "100%",
          fontVariantNumeric: "tabular-nums",
        }}
      />
      <span style={{ fontSize: 12.5, color: "#9CA3AF", paddingRight: 12 }}>{suffix}</span>
    </div>
  )
}

function NativeSelect({
  value, onChange, options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: "white", border: "1px solid #E5E7EB", borderRadius: 9,
        padding: "10px 12px", fontSize: 13.5, color: "#111827",
        fontFamily: "inherit", appearance: "none", cursor: "pointer",
        backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'><path fill=\'%239CA3AF\' d=\'M5 6L0 0h10z\'/></svg>")',
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 14px center",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function AvantageToggle({
  label, hint, checked, onToggle,
}: {
  label: string
  hint?: string
  checked: boolean
  onToggle: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!checked)}
      style={{
        display: "grid", gridTemplateColumns: "auto 1fr", gap: 12,
        textAlign: "left", cursor: "pointer", fontFamily: "inherit",
        padding: "10px 0", border: "none", background: "transparent",
        borderBottom: "1px solid #F4F1FB",
      }}
    >
      <span
        role="checkbox"
        aria-checked={checked}
        style={{
          width: 20, height: 20, borderRadius: 6,
          border: checked ? "none" : "1.5px solid #D1D5DB",
          background: checked ? "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)" : "white",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {checked && (
          <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
            <path d="M1 4.5L4 7.5L10 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <div>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827" }}>{label}</p>
        {hint && <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#9CA3AF", lineHeight: 1.45 }}>{hint}</p>}
      </div>
    </button>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Shared styles
 * ────────────────────────────────────────────────────────────────────────── */

const titleStyle: React.CSSProperties = {
  margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: "#111827",
  letterSpacing: "-0.015em", textAlign: "center",
}
const leadStyle: React.CSSProperties = {
  margin: 0, fontSize: 13.5, color: "#6B7280", lineHeight: 1.6,
  textAlign: "center", maxWidth: 480, marginInline: "auto",
}
const btnPrimaryStyle: React.CSSProperties = {
  padding: "10px 18px", borderRadius: 10, border: "none",
  background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
  color: "white", fontSize: 13, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit",
}
const btnSecondaryStyle: React.CSSProperties = {
  padding: "10px 16px", borderRadius: 10,
  background: "white", border: "1px solid #E5E7EB", color: "#6B7280",
  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
}
