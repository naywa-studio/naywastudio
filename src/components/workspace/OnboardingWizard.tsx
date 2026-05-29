"use client"

/**
 * OnboardingWizard — wizard cabinet pricing (1ère visite).
 *
 * Étape 1 : Bienvenue
 * Étape 2 : Marges (mini + cible, avec validation cible ≥ mini)
 * Étape 3 : Avantages standards (cabinet) — config dans avantages-meta.ts
 *
 * Tout ce qui dépend de la mission (TJM, durée, lieu, type de contrat,
 * date de démarrage) est demandé séparément dans le wizard Mission, pas
 * ici. Le sourceur ne renseigne ici QUE ce qui est récurrent à toutes
 * les missions.
 *
 * Une fois terminé : pricing_onboarded_at = now() → ne réapparaît plus.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { m, AnimatePresence } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import type { PricingDefaultAvantages } from "@/lib/database.types"
import {
  AVANTAGES_CONFIG,
  avantagesMonthlyTotal,
  type AvantageConfig,
  type AvantageKey,
} from "@/lib/pricing/avantages-meta"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

interface WizardState {
  pricing_margin_min_pct: number
  pricing_margin_target_pct: number
  pricing_default_avantages: PricingDefaultAvantages
  /** 13ᵉ mois — booléen séparé du config (pas un montant). */
  treiziemeMois: boolean
}

const DEFAULT_STATE: WizardState = {
  pricing_margin_min_pct: 15,
  pricing_margin_target_pct: 22,
  pricing_default_avantages: {
    mutuellePremium: 50,
    transport: 43,
    medecineDuTravailAnnuel: 100,
    treiziemeMois: false,
    ticketsResto: 6,
    // Le reste désactivé par défaut
    forfaitMobilite: 0,
    primeCooptationAnnuelle: 0,
    urssafIndemniteJour: 0,
    indemniteKilometriqueAnnuelle: 0,
    expatriationMensuelle: 0,
    autresMensuels: 0,
  },
  treiziemeMois: false,
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
          pricing_default_avantages: {
            ...next.pricing_default_avantages,
            treiziemeMois: next.treiziemeMois,
          },
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
          pricing_default_avantages: {
            ...state.pricing_default_avantages,
            treiziemeMois: state.treiziemeMois,
          },
          pricing_onboarded_at: new Date().toISOString(),
        })
        .eq("user_id", userIdRef.current)
    }
    onDone()
  }

  return (
    <div style={{
      maxWidth: 720, margin: "32px auto 0",
      background: "white", borderRadius: 18,
      border: "1px solid #F0ECF8",
      overflow: "hidden",
      boxShadow: "0 12px 40px -16px rgba(124,99,200,0.18)",
    }}>
      <ProgressHeader step={step} total={TOTAL_STEPS} saving={saving} />

      <div style={{ padding: "28px 32px 24px", minHeight: 360 }}>
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
            {step === 3 && (
              <StepAvantages
                state={state}
                update={update}
                updateAvantage={updateAvantage}
              />
            )}
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
      background: "linear-gradient(120deg, rgba(124,99,200,0.06), rgba(124,99,200,0.02))",
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
          🏢 Paramètres cabinet · Étape {step}/{total}
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
        En 1 minute, on cale les paramètres récurrents de ton <strong>cabinet</strong> —
        ce qui ne change pas d&apos;une mission à l&apos;autre : tes marges et les avantages
        que tu proposes à tes salariés.
      </p>
      <p style={{ ...leadStyle, marginTop: 14 }}>
        Tout ce qui dépend d&apos;une mission précise (TJM, durée, lieu, type de contrat)
        sera demandé séparément pour <strong>chaque mission</strong>.
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
  const mini = state.pricing_margin_min_pct
  const cible = state.pricing_margin_target_pct
  const invalid = cible < mini

  return (
    <div>
      <h2 style={titleStyle}>🎯 Seuils de marge</h2>
      <p style={leadStyle}>
        Le plancher et la cible de ton cabinet. Ils servent de repères dans tous
        les chiffrages et alimentent le verdict (rentable / pas rentable).
      </p>

      <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field
          label="Marge minimum acceptable"
          hint="En dessous, refus du chiffrage. Moyenne ESN : 12–18 %."
        >
          <NumberInput
            value={mini}
            onChange={(v) => update("pricing_margin_min_pct", v)}
            min={0} max={50} step={0.5}
            suffix="%"
          />
        </Field>
        <Field
          label="Marge cible"
          hint="L'objectif visé. Moyenne marché : 18–25 %."
        >
          <NumberInput
            value={cible}
            onChange={(v) => update("pricing_margin_target_pct", v)}
            min={0} max={50} step={0.5}
            suffix="%"
          />
        </Field>
      </div>

      {invalid && (
        <p style={{
          marginTop: 14, padding: "9px 12px", fontSize: 12.5, color: "#B91C1C",
          background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.25)",
          borderRadius: 9,
        }}>
          ⚠ La marge cible ({cible} %) doit être supérieure ou égale à la marge mini ({mini} %).
        </p>
      )}
    </div>
  )
}

function StepAvantages({
  state, update, updateAvantage,
}: {
  state: WizardState
  update: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void
  updateAvantage: <K extends keyof PricingDefaultAvantages>(key: K, value: PricingDefaultAvantages[K]) => void
}) {
  const av = state.pricing_default_avantages
  const monthly = avantagesMonthlyTotal({ ...av, treiziemeMois: state.treiziemeMois })

  return (
    <div>
      <h2 style={titleStyle}>🎁 Avantages standards du cabinet</h2>
      <p style={leadStyle}>
        Ce que ton cabinet propose à <strong>tous</strong> ses salariés, peu importe la mission.
        Active uniquement ceux qui s&apos;appliquent. Les plafonds URSSAF sont rappelés en hint.
      </p>

      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        {/* 13ᵉ mois — toggle simple, pas un montant */}
        <BooleanAvantageRow
          label="13ᵉ mois"
          hint="Non obligatoire Syntec. ~60 % des ESN le pratiquent. Équivaut à 1 mois de brut /12."
          enabled={state.treiziemeMois}
          onToggle={(on) => update("treiziemeMois", on)}
        />

        {/* Tous les autres avantages — config-driven */}
        {AVANTAGES_CONFIG.map((cfg) => (
          <SmartAvantageRow
            key={cfg.key}
            config={cfg}
            value={av[cfg.key as keyof PricingDefaultAvantages] as number | undefined}
            onChange={(v) => updateAvantage(cfg.key as keyof PricingDefaultAvantages, v as PricingDefaultAvantages[keyof PricingDefaultAvantages])}
          />
        ))}
      </div>

      {/* Récap coût mensuel total */}
      <div style={{
        marginTop: 18, padding: "13px 16px",
        background: "rgba(124,99,200,0.06)",
        border: "1px solid rgba(124,99,200,0.20)",
        borderRadius: 10,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
      }}>
        <div>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#7C63C8", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Coût mensuel estimé des avantages activés
          </p>
          <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "#6B7280" }}>
            Tickets resto × 21 j · annuels /12 · hors URSSAF grand déplacement (conditionnel).
          </p>
        </div>
        <span style={{ fontSize: 20, fontWeight: 800, color: "#7C63C8", fontVariantNumeric: "tabular-nums" }}>
          ~{Math.round(monthly)} €
        </span>
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

/**
 * BooleanAvantageRow — comme une ligne avantage mais sans montant.
 * Utilisé pour le 13ᵉ mois qui est purement on/off.
 */
function BooleanAvantageRow({
  label, hint, enabled, onToggle,
}: {
  label: string
  hint: string
  enabled: boolean
  onToggle: (on: boolean) => void
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
        <p style={{ margin: "2px 0 0", fontSize: 11, color: "#9CA3AF", lineHeight: 1.4 }}>{hint}</p>
      </div>
      <span style={{ fontSize: 11, color: "#9CA3AF", whiteSpace: "nowrap" }}>
        = 1 mois de brut /12
      </span>
    </div>
  )
}

/**
 * SmartAvantageRow — ligne avantage pilotée par AvantageConfig.
 * Affiche un warning orange en bas du champ si la valeur dépasse un plafond
 * URSSAF (hint contextuel, sans bloquer la saisie).
 */
function SmartAvantageRow({
  config, value, onChange,
}: {
  config: AvantageConfig
  value: number | undefined
  onChange: (v: number) => void
}) {
  const enabled = (value ?? 0) > 0
  const numericValue = value ?? 0
  const warningMsg = enabled && config.warning ? config.warning(numericValue) : null

  const toggle = (on: boolean) => onChange(on ? config.defaultValue : 0)

  return (
    <div style={{
      padding: "10px 12px",
      background: enabled ? "rgba(124,99,200,0.04)" : "#FAFAFA",
      border: enabled ? "1px solid rgba(124,99,200,0.18)" : "1px solid #F0ECF8",
      borderRadius: 9,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center" }}>
        <Checkbox checked={enabled} onChange={toggle} />
        <div>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "#111827" }}>{config.label}</p>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "#9CA3AF", lineHeight: 1.4 }}>{config.hint}</p>
        </div>
        <div style={{ width: 140 }}>
          <div style={inputBoxStyle}>
            <input
              type="number"
              value={numericValue}
              disabled={!enabled}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (!Number.isFinite(n)) return
                onChange(Math.min(config.max, Math.max(0, n)))
              }}
              style={{ ...inputInnerStyle, color: enabled ? "#111827" : "#9CA3AF" }}
              min={0}
              max={config.max}
              step={config.step ?? 1}
            />
            <span style={{ fontSize: 11, color: "#9CA3AF", paddingRight: 10 }}>{config.suffix}</span>
          </div>
        </div>
      </div>
      {warningMsg && (
        <p style={{
          margin: "8px 0 0", fontSize: 11.5, color: "#B45309",
          background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.25)",
          borderRadius: 7, padding: "5px 9px",
        }}>
          {warningMsg}
        </p>
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

// Export du type pour fixer lint si export non utilisé ailleurs.
export type { AvantageKey }
