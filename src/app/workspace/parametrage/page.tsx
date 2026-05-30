"use client"

/**
 * /workspace/parametrage — Paramètres pricing du cabinet (récurrents).
 *
 * Miroir du wizard d'onboarding : mêmes champs, mêmes hints/alertes URSSAF,
 * structure visuelle similaire. La différence : pas d'étapes, tout est sur
 * la même page, auto-save debounced (800 ms).
 *
 * Ce qui n'est plus ici :
 *   - Modalité Syntec (dérivée du preset séniorité dans le widget)
 *   - Lieu (demandé par mission, pas au niveau cabinet)
 *   - Jours facturables / mois (calendrier réel utilisé pour les charts)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { m } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import type { PricingDefaultAvantages, Profile } from "@/lib/database.types"
import NoraLoader from "@/components/workspace/NoraLoader"
import {
  AVANTAGES_CONFIG,
  avantagesMonthlyTotal,
  type AvantageConfig,
} from "@/lib/pricing/avantages-meta"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

interface Form {
  pricing_margin_min_pct: number
  pricing_margin_target_pct: number
  pricing_default_avantages: PricingDefaultAvantages
  treiziemeMois: boolean
}

const DEFAULT_FORM: Form = {
  pricing_margin_min_pct: 15,
  pricing_margin_target_pct: 22,
  pricing_default_avantages: {
    mutuellePremium: 50,
    transport: 43,
    medecineDuTravailAnnuel: 100,
    treiziemeMois: false,
    ticketsResto: 6,
    forfaitMobilite: 0,
    primeCooptationAnnuelle: 0,
    urssafIndemniteJour: 0,
    indemniteKilometriqueAnnuelle: 0,
    expatriationMensuelle: 0,
    autresMensuels: 0,
  },
  treiziemeMois: false,
}

export default function ParametragePage() {
  const sb = useMemo(() => getSupabase(), [])
  const [form, setForm] = useState<Form | null>(null)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const userIdRef = useRef<string | null>(null)
  const saveTimerRef = useRef<number | null>(null)

  // Initial load
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user || !mounted) return
      userIdRef.current = user.id
      const { data } = await sb
        .from("profiles")
        .select("pricing_margin_min_pct, pricing_margin_target_pct, pricing_default_avantages")
        .eq("user_id", user.id)
        .maybeSingle()
      if (!mounted) return
      const profile = data as Partial<Profile> | null
      const av = (profile?.pricing_default_avantages as PricingDefaultAvantages | null) ?? DEFAULT_FORM.pricing_default_avantages
      setForm({
        pricing_margin_min_pct:
          profile?.pricing_margin_min_pct ?? DEFAULT_FORM.pricing_margin_min_pct,
        pricing_margin_target_pct:
          profile?.pricing_margin_target_pct ?? DEFAULT_FORM.pricing_margin_target_pct,
        pricing_default_avantages: av,
        treiziemeMois: Boolean(av.treiziemeMois),
      })
    })()
    return () => { mounted = false }
  }, [sb])

  // Debounced auto-save: schedule a save 800 ms after the last change.
  const scheduleSave = useCallback(
    (next: Form) => {
      if (!userIdRef.current) return
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
      setSaveState("saving")
      saveTimerRef.current = window.setTimeout(async () => {
        const { error: upErr } = await sb
          .from("profiles")
          .update({
            pricing_margin_min_pct: next.pricing_margin_min_pct,
            pricing_margin_target_pct: next.pricing_margin_target_pct,
            pricing_default_avantages: {
              ...next.pricing_default_avantages,
              treiziemeMois: next.treiziemeMois,
            },
          })
          .eq("user_id", userIdRef.current!)
        if (upErr) {
          setSaveState("error")
          setError(upErr.message)
        } else {
          setSaveState("saved")
          setError(null)
          window.setTimeout(() => setSaveState("idle"), 2000)
        }
      }, 800)
    },
    [sb],
  )

  const update = useCallback(
    <K extends keyof Form>(key: K, value: Form[K]) => {
      setForm((prev) => {
        if (!prev) return prev
        const next = { ...prev, [key]: value }
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave],
  )

  const updateAvantage = useCallback(
    <K extends keyof PricingDefaultAvantages>(key: K, value: PricingDefaultAvantages[K]) => {
      setForm((prev) => {
        if (!prev) return prev
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

  if (!form) return <NoraLoader />

  const monthly = avantagesMonthlyTotal({ ...form.pricing_default_avantages, treiziemeMois: form.treiziemeMois })
  const margesInvalid = form.pricing_margin_target_pct < form.pricing_margin_min_pct

  return (
    <main style={{
      minHeight: "calc(100vh - 60px)",
      padding: "40px 24px 80px",
      maxWidth: 880, margin: "0 auto",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 26 }}>
        <Link href="/workspace/pricing" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 13, color: "#7C63C8", textDecoration: "none", marginBottom: 18,
        }}>← Retour au pricing</Link>
        <span style={{
          display: "inline-block",
          fontSize: 11, fontWeight: 700, color: "#7C63C8",
          background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.18)",
          padding: "4px 11px", borderRadius: 100,
          letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12,
        }}>
          🏢 Paramètres cabinet
        </span>
        <h1 style={{ margin: 0, fontSize: "clamp(24px, 3vw, 30px)", fontWeight: 800, color: "#111827", letterSpacing: "-0.025em", lineHeight: 1.15 }}>
          Réglages récurrents de votre cabinet
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "#6B7280", lineHeight: 1.6, maxWidth: 640 }}>
          Tout ce qui ne change pas d&apos;une mission à l&apos;autre : vos marges et les avantages
          standards que vous proposez à vos salariés. Les paramètres mission (TJM, durée,
          lieu, type de contrat) se renseignent au niveau de chaque mission.
        </p>
        <SaveBadge state={saveState} error={error} />
      </div>

      {/* Section 1 — Marges */}
      <m.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        style={sectionStyle}
      >
        <SectionHeader title="🎯 Seuils de marge" subtitle="Plancher et objectif de rentabilité de votre cabinet." />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Marge minimum acceptable" hint="En dessous, refus du chiffrage. Moyenne ESN : 12–18 %.">
            <NumberInput
              value={form.pricing_margin_min_pct}
              onChange={(v) => update("pricing_margin_min_pct", v)}
              min={0} max={50} step={0.5}
              suffix="%"
            />
          </Field>
          <Field label="Marge cible" hint="Objectif visé. Moyenne marché : 18–25 %.">
            <NumberInput
              value={form.pricing_margin_target_pct}
              onChange={(v) => update("pricing_margin_target_pct", v)}
              min={0} max={50} step={0.5}
              suffix="%"
            />
          </Field>
        </div>
        {margesInvalid && (
          <p style={{
            marginTop: 12, padding: "9px 12px", fontSize: 12.5, color: "#B91C1C",
            background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.25)",
            borderRadius: 9,
          }}>
            ⚠ La marge cible doit être supérieure ou égale à la marge mini.
          </p>
        )}
      </m.section>

      {/* Section 2 — Avantages */}
      <m.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        style={sectionStyle}
      >
        <SectionHeader
          title="🎁 Avantages standards"
          subtitle="Ce que votre cabinet propose à tous ses salariés, peu importe la mission."
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Obligatoires groupés en tête */}
          {AVANTAGES_CONFIG.filter((c) => c.required).map((cfg) => (
            <SmartAvantageRow
              key={cfg.key}
              config={cfg}
              value={form.pricing_default_avantages[cfg.key as keyof PricingDefaultAvantages] as number | undefined}
              onChange={(v) => updateAvantage(cfg.key as keyof PricingDefaultAvantages, v as PricingDefaultAvantages[keyof PricingDefaultAvantages])}
            />
          ))}

          <p style={{
            margin: "8px 0 -2px", fontSize: 10.5, fontWeight: 700, color: "#9CA3AF",
            letterSpacing: "0.08em", textTransform: "uppercase", padding: "0 4px",
          }}>
            Optionnels
          </p>

          <BooleanAvantageRow
            label="13ᵉ mois"
            hint="Non obligatoire Syntec. ~60 % des ESN le pratiquent. Équivaut à 1 mois de brut /12."
            enabled={form.treiziemeMois}
            onToggle={(on) => update("treiziemeMois", on)}
          />

          {AVANTAGES_CONFIG.filter((c) => !c.required).map((cfg) => (
            <SmartAvantageRow
              key={cfg.key}
              config={cfg}
              value={form.pricing_default_avantages[cfg.key as keyof PricingDefaultAvantages] as number | undefined}
              onChange={(v) => updateAvantage(cfg.key as keyof PricingDefaultAvantages, v as PricingDefaultAvantages[keyof PricingDefaultAvantages])}
            />
          ))}
        </div>

        {/* Récap mensuel */}
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
      </m.section>
    </main>
  )
}

/* ──────────────────────────────────────────────────────────────────────── */

const sectionStyle: React.CSSProperties = {
  marginBottom: 18,
  background: "white",
  borderRadius: 16,
  border: "1px solid #F0ECF8",
  padding: 22,
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#111827", letterSpacing: "-0.01em" }}>
        {title}
      </h2>
      {subtitle && (
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280", lineHeight: 1.55 }}>{subtitle}</p>
      )}
    </div>
  )
}

function SaveBadge({ state, error }: { state: "idle" | "saving" | "saved" | "error"; error: string | null }) {
  if (state === "idle") return null
  const fg = state === "error" ? "#B91C1C" : state === "saved" ? "#15803d" : "#6B7280"
  const bg = state === "error" ? "rgba(220,38,38,0.06)" : state === "saved" ? "rgba(34,197,94,0.07)" : "#F3F4F6"
  const bd = state === "error" ? "rgba(220,38,38,0.25)" : state === "saved" ? "rgba(34,197,94,0.25)" : "#E5E7EB"
  const text =
    state === "saving" ? "Enregistrement…"
    : state === "saved" ? "✓ Enregistré"
    : `⚠ Échec : ${error ?? "réessaie"}`
  return (
    <span style={{
      marginTop: 14, display: "inline-block",
      fontSize: 11.5, fontWeight: 600, color: fg,
      background: bg, border: `1px solid ${bd}`,
      borderRadius: 100, padding: "4px 10px",
    }}>
      {text}
    </span>
  )
}

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
      <span style={{ fontSize: 11, color: "#9CA3AF", whiteSpace: "nowrap" }}>= 1 mois /12</span>
    </div>
  )
}

function SmartAvantageRow({
  config, value, onChange,
}: {
  config: AvantageConfig
  value: number | undefined
  onChange: (v: number) => void
}) {
  const isRequired = config.required === true
  const externalValue = value ?? 0
  const enabled = isRequired || externalValue > 0

  // Mémoire locale de la dernière valeur > 0 (parent charge avant render).
  const [remembered, setRemembered] = useState<number>(
    externalValue > 0 ? externalValue : config.defaultValue,
  )

  const displayValue = enabled ? externalValue : remembered
  const warningMsg = enabled && config.warning ? config.warning(externalValue) : null

  const handleToggle = (on: boolean) => {
    onChange(on ? (remembered > 0 ? remembered : config.defaultValue) : 0)
  }
  const handleInputChange = (n: number) => {
    const clamped = Math.min(config.max, Math.max(0, n))
    if (clamped > 0) setRemembered(clamped)
    onChange(clamped)
  }

  return (
    <div style={{
      padding: "10px 12px",
      background: enabled ? "rgba(124,99,200,0.04)" : "#FAFAFA",
      border: enabled ? "1px solid rgba(124,99,200,0.18)" : "1px solid #F0ECF8",
      borderRadius: 9,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center" }}>
        {isRequired ? (
          <span style={{
            display: "inline-block", width: 8, height: 8, borderRadius: "50%",
            background: "#7C63C8", margin: "0 6px",
          }} title="Obligation légale — toujours actif" />
        ) : (
          <Checkbox checked={enabled} onChange={handleToggle} />
        )}
        <div>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "#111827", display: "flex", alignItems: "center", gap: 6 }}>
            {config.label}
            {isRequired && (
              <span style={{
                fontSize: 9.5, fontWeight: 800, color: "#7C63C8",
                background: "rgba(124,99,200,0.10)", border: "1px solid rgba(124,99,200,0.25)",
                borderRadius: 100, padding: "1px 7px",
                letterSpacing: "0.05em", textTransform: "uppercase",
              }}>
                Obligatoire
              </span>
            )}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "#9CA3AF", lineHeight: 1.4 }}>{config.hint}</p>
        </div>
        <div style={{ width: 140 }}>
          <div style={inputBoxStyle}>
            <input
              type="number"
              value={displayValue}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n)) handleInputChange(n)
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
