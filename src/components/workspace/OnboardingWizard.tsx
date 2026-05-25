"use client"

/**
 * OnboardingWizard — wizard cabinet pricing.
 *
 * Apparaît la 1ère fois que le sourceur arrive sur /workspace/pricing
 * (détection via profiles.pricing_onboarded_at NULL). Demande SEULEMENT
 * les paramètres systématiques du cabinet (pas par mission) :
 *
 *   Étape 1 : Bienvenue
 *   Étape 2 : Seuils de marge + modalité Syntec par défaut
 *   Étape 3 : Avantages standards mensuels (mutuelle, transport, médecine,
 *             13ᵉ mois, tickets resto)
 *
 * Une fois fini, marque pricing_onboarded_at = now() pour ne plus le
 * réafficher. L'user peut rejouer le wizard depuis la page paramétrage
 * ou via "Reconfigurer" — pas implémenté ici.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { m, AnimatePresence } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import type { PricingDefaultAvantages } from "@/lib/database.types"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

type Modalite = "modalite_1" | "modalite_2" | "modalite_3"

interface WizardState {
  pricing_margin_min_pct: number
  pricing_margin_target_pct: number
  pricing_default_modalite: Modalite
  pricing_default_avantages: PricingDefaultAvantages
}

const DEFAULT_STATE: WizardState = {
  pricing_margin_min_pct: 15,
  pricing_margin_target_pct: 22,
  pricing_default_modalite: "modalite_1",
  pricing_default_avantages: {
    mutuellePremium: 50,
    transport: 42,
    medecineDuTravailAnnuel: 100,
    treiziemeMois: false,
    ticketsResto: 6,
    // Le reste reste à 0 ou non défini — pas pertinent au niveau cabinet
    forfaitMobilite: 0,
    primeCooptationAnnuelle: 0,
    urssafIndemniteJour: 0,
    indemniteKilometriqueAnnuelle: 0,
    expatriationMensuelle: 0,
    autresMensuels: 0,
  },
}

const TOTAL_STEPS = 3

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

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (mounted) userIdRef.current = user?.id ?? null
    })()
    return () => { mounted = false }
  }, [sb])

  const scheduleSave = useCallback((next: WizardState) => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    setSaving(true)
    saveTimerRef.current = window.setTimeout(async () => {
      if (!userIdRef.current) return
      await sb
        .from("profiles")
        .update({
          pricing_margin_min_pct: next.pricing_margin_min_pct,
          pricing_margin_target_pct: next.pricing_margin_target_pct,
          pricing_default_modalite: next.pricing_default_modalite,
          pricing_default_avantages: next.pricing_default_avantages,
        })
        .eq("user_id", userIdRef.current)
      setSaving(false)
    }, 600)
  }, [sb])

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
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (userIdRef.current) {
      await sb
        .from("profiles")
        .update({
          pricing_margin_min_pct: state.pricing_margin_min_pct,
          pricing_margin_target_pct: state.pricing_margin_target_pct,
          pricing_default_modalite: state.pricing_default_modalite,
          pricing_default_avantages: state.pricing_default_avantages,
          pricing_onboarded_at: new Date().toISOString(),
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
            {step === 2 && <StepMarges state={state} update={update} />}
            {step === 3 && <StepAvantages state={state} updateAvantage={updateAvantage} />}
          </m.div>
        </AnimatePresence>
      </div>

      <Footer step={step} total={TOTAL_STEPS} onBack={back} onNext={next} onFinish={finish} />
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────── */

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
          ⚙ Paramètres cabinet · Étape {step}/{total}
        </span>
        {saving && (
          <span style={{ fontSize: 10.5, color: "#9CA3AF", fontStyle: "italic" }}>
            Enregistrement…
          </span>
        )}
      </div>
      <div style={{ height: 4, borderRadius: 4, background: "rgba(124,99,200,0.10)", overflow: "hidden" }}>
        <m.div
          animate={{ width: `${(step / total) * 100}%` }}
          transition={{ duration: 0.35, ease: EASE }}
          style={{ height: "100%", background: "linear-gradient(120deg, #7C63C8, #6B54B2)", borderRadius: 4 }}
        />
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────── */

function StepWelcome() {
  return (
    <div style={{ textAlign: "center", paddingTop: 16 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>👋</div>
      <h2 style={titleStyle}>Bienvenue dans le pricing Naywa</h2>
      <p style={leadStyle}>
        En 1 minute, on cale les paramètres récurrents de ton cabinet — ce qui ne
        change pas d&apos;une mission à l&apos;autre. Tout le reste (TJM, durée, brut, lieu)
        se renseigne par mission.
      </p>
      <p style={{ ...leadStyle, marginTop: 14, fontSize: 12.5, color: "#9CA3AF" }}>
        Tu pourras tout modifier plus tard depuis ⚙ Paramètres cabinet.
      </p>
    </div>
  )
}

function StepMarges({
  state, update,
}: {
  state: WizardState
  update: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void
}) {
  return (
    <div>
      <h2 style={titleStyle}>🎯 Seuils de marge</h2>
      <p style={leadStyle}>
        Le plancher et la cible de ton cabinet. Ils servent de repères dans
        tous les chiffrages.
      </p>

      <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Marge minimum acceptable" hint="En dessous, refus du chiffrage">
          <NumberInput
            value={state.pricing_margin_min_pct}
            onChange={(v) => update("pricing_margin_min_pct", v)}
            min={0} max={100} step={0.5}
            suffix="%"
          />
        </Field>
        <Field label="Marge cible" hint="L'objectif visé">
          <NumberInput
            value={state.pricing_margin_target_pct}
            onChange={(v) => update("pricing_margin_target_pct", v)}
            min={0} max={100} step={0.5}
            suffix="%"
          />
        </Field>
      </div>

      <div style={{ marginTop: 22 }}>
        <Field
          label="Modalité Syntec par défaut"
          hint="Modalité 3 = forfait jours 218 j/an (cadres autonomes). Modalité 1 = standard 35h."
        >
          <Select
            value={state.pricing_default_modalite}
            onChange={(v) => update("pricing_default_modalite", v as Modalite)}
            options={[
              { value: "modalite_1", label: "Modalité 1 — Standard 35h" },
              { value: "modalite_2", label: "Modalité 2 — Forfait hebdo 38h30 (+15% mini)" },
              { value: "modalite_3", label: "Modalité 3 — Forfait jours 218 j (+20% mini)" },
            ]}
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
  updateAvantage: <K extends keyof PricingDefaultAvantages>(key: K, value: PricingDefaultAvantages[K]) => void
}) {
  const av = state.pricing_default_avantages
  return (
    <div>
      <h2 style={titleStyle}>🎁 Avantages standards cabinet</h2>
      <p style={leadStyle}>
        Ce que ton cabinet propose à TOUS ses salariés (peu importe la mission).
        Les avantages variables par mission (URSSAF déplacement, indemnité km) se
        renseignent au niveau de chaque mission.
      </p>

      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <AvantageRow
          label="Mutuelle santé"
          hint="Part employeur, au-delà des 50 % minimum légaux"
          enabled={(av.mutuellePremium ?? 0) > 0}
          onToggle={(on) => updateAvantage("mutuellePremium", on ? 50 : 0)}
          value={av.mutuellePremium ?? 0}
          onValueChange={(v) => updateAvantage("mutuellePremium", v)}
          suffix="€/mois"
          max={500}
        />
        <AvantageRow
          label="Transport (Navigo / TCL)"
          hint="50 % du Navigo Paris = 42 € · Lyon TCL = 32 € · ailleurs = à saisir"
          enabled={(av.transport ?? 0) > 0}
          onToggle={(on) => updateAvantage("transport", on ? 42 : 0)}
          value={av.transport ?? 0}
          onValueChange={(v) => updateAvantage("transport", v)}
          suffix="€/mois"
          max={300}
        />
        <AvantageRow
          label="Médecine du travail"
          hint="Cotisation obligatoire au SST. Typique 80-150 €/an/salarié."
          enabled={(av.medecineDuTravailAnnuel ?? 0) > 0}
          onToggle={(on) => updateAvantage("medecineDuTravailAnnuel", on ? 100 : 0)}
          value={av.medecineDuTravailAnnuel ?? 0}
          onValueChange={(v) => updateAvantage("medecineDuTravailAnnuel", v)}
          suffix="€/an"
          max={500}
        />
        <AvantageRow
          label="13ᵉ mois"
          hint="Non obligatoire Syntec, mais ~60 % des ESN le pratiquent"
          enabled={av.treiziemeMois === true}
          onToggle={(on) => updateAvantage("treiziemeMois", on)}
          valueLocked
          lockedLabel="= 1 mois de brut / 12"
        />
        <AvantageRow
          label="Tickets restaurant"
          hint="Part employeur €/jour travaillé. Plafond URSSAF 2026 ≈ 7,18 €/jour."
          enabled={(av.ticketsResto ?? 0) > 0}
          onToggle={(on) => updateAvantage("ticketsResto", on ? 6 : 0)}
          value={av.ticketsResto ?? 0}
          onValueChange={(v) => updateAvantage("ticketsResto", v)}
          suffix="€/jour"
          max={8}
          step={0.1}
        />
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────── */

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
      display: "flex", justifyContent: "space-between", alignItems: "center",
      gap: 10, flexWrap: "wrap",
    }}>
      <button
        onClick={onBack}
        disabled={step === 1}
        style={{
          fontSize: 12.5, fontWeight: 600, color: step === 1 ? "#C7BFE3" : "#7C63C8",
          background: "transparent", border: "none", cursor: step === 1 ? "not-allowed" : "pointer",
          padding: "8px 12px", fontFamily: "inherit",
        }}
      >
        ← Retour
      </button>
      {step < total ? (
        <button
          onClick={onNext}
          style={{
            fontSize: 13, fontWeight: 700, color: "white",
            background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
            border: "none", borderRadius: 9, padding: "10px 20px",
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Continuer →
        </button>
      ) : (
        <button
          onClick={onFinish}
          style={{
            fontSize: 13, fontWeight: 700, color: "white",
            background: "linear-gradient(120deg, #16a34a 0%, #15803d 100%)",
            border: "none", borderRadius: 9, padding: "10px 22px",
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          ✓ Terminer
        </button>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────── */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#374151" }}>{label}</span>
      {hint && <span style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.4 }}>{hint}</span>}
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
    <div style={inputBoxStyle}>
      <input
        type="number"
        value={value}
        min={min} max={max} step={step}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)))
        }}
        style={inputInnerStyle}
      />
      <span style={{ fontSize: 12, color: "#9CA3AF", paddingRight: 12 }}>{suffix}</span>
    </div>
  )
}

function Select({
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
        ...inputBoxStyle, padding: "10px 12px", fontSize: 13, color: "#111827",
        fontFamily: "inherit", appearance: "none",
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

function AvantageRow({
  label, hint, enabled, onToggle, value, onValueChange, suffix, valueLocked, lockedLabel, max, step,
}: {
  label: string
  hint?: string
  enabled: boolean
  onToggle: (on: boolean) => void
  value?: number
  onValueChange?: (v: number) => void
  suffix?: string
  valueLocked?: boolean
  lockedLabel?: string
  max?: number
  step?: number
}) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center",
      padding: "10px 12px",
      background: enabled ? "rgba(124,99,200,0.04)" : "#FAFAFA",
      border: enabled ? "1px solid rgba(124,99,200,0.18)" : "1px solid #F0ECF8",
      borderRadius: 9,
    }}>
      <Checkbox checked={enabled} onChange={onToggle} />
      <div>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "#111827" }}>{label}</p>
        {hint && <p style={{ margin: "2px 0 0", fontSize: 11, color: "#9CA3AF", lineHeight: 1.4 }}>{hint}</p>}
      </div>
      {valueLocked ? (
        <span style={{ fontSize: 11, color: "#9CA3AF", whiteSpace: "nowrap" }}>{lockedLabel}</span>
      ) : (
        <div style={{ width: 130 }}>
          <div style={inputBoxStyle}>
            <input
              type="number"
              value={value ?? 0}
              disabled={!enabled}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (!Number.isFinite(n)) return
                const clamped = max != null ? Math.min(max, Math.max(0, n)) : Math.max(0, n)
                onValueChange?.(clamped)
              }}
              style={{ ...inputInnerStyle, color: enabled ? "#111827" : "#9CA3AF" }}
              min={0}
              max={max}
              step={step ?? 1}
            />
            <span style={{ fontSize: 11, color: "#9CA3AF", paddingRight: 10 }}>{suffix}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 20, height: 20, borderRadius: 6, cursor: "pointer",
        border: checked ? "none" : "1.5px solid #D1D5DB",
        background: checked ? "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)" : "white",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        padding: 0,
      }}
    >
      {checked && (
        <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
          <path d="M1 4.5L4 7.5L10 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

/* ──────────────────────────────────────────────────────────────────────── */

const titleStyle: React.CSSProperties = {
  margin: "0 0 8px", fontSize: 19, fontWeight: 800, color: "#111827",
  letterSpacing: "-0.015em", lineHeight: 1.25,
}

const leadStyle: React.CSSProperties = {
  margin: 0, fontSize: 13.5, color: "#6B7280", lineHeight: 1.55,
}

const inputBoxStyle: React.CSSProperties = {
  display: "flex", alignItems: "center",
  background: "white", border: "1px solid #E5E7EB", borderRadius: 9,
  overflow: "hidden",
}

const inputInnerStyle: React.CSSProperties = {
  flex: 1, padding: "9px 12px",
  fontSize: 13, color: "#111827",
  background: "transparent", border: "none", outline: "none",
  fontFamily: "inherit", minWidth: 0, width: "100%",
}
