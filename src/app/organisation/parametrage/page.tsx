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
import { useCabinet } from "../layout"
import { getSupabase } from "@/lib/supabase"
import type { PricingDefaultAvantages } from "@/lib/database.types"
import { hasPricingAccess } from "@/lib/subscription"
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
  pricing_rtt_days_per_year: number
  pricing_default_avantages: PricingDefaultAvantages
  treiziemeMois: boolean
}

const DEFAULT_FORM: Form = {
  pricing_margin_min_pct: 15,
  pricing_margin_target_pct: 22,
  pricing_rtt_days_per_year: 0,
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
  const { isOwner, organization, refetch, profile } = useCabinet()
  // Dernière porte d'entrée de la Suite Pricing : cette page configure la
  // politique de marges/avantages du cabinet, qui n'a de sens QUE si l'option
  // est acquise. Elle était atteignable sans, via son URL.
  const canPricing = hasPricingAccess(organization, { isAdmin: profile?.is_admin === true })
  const sb = useMemo(() => getSupabase(), [])
  const [form, setForm] = useState<Form | null>(null)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const userIdRef = useRef<string | null>(null)
  const saveTimerRef = useRef<number | null>(null)

  const onboarded = !!organization.pricing_onboarded_at

  const confirmConfiguration = useCallback(async () => {
    if (!isOwner || confirming) return
    setConfirming(true)
    const res = await fetch("/api/cabinet", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pricing_onboarded_at: new Date().toISOString() }),
    })
    setConfirming(false)
    if (res.ok) {
      setSaveState("saved")
      setError(null)
      await refetch()
      window.setTimeout(() => setSaveState("idle"), 2000)
    } else {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setSaveState("error")
      setError(j.error ?? "Erreur lors de la confirmation.")
    }
  }, [isOwner, confirming, refetch])

  // Initial load — pricing config now lives on `organizations` (one
  // source of truth) and reaches the user via profile.organization_id.
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user || !mounted) return
      userIdRef.current = user.id
      const { data: profile } = await sb
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle()
      if (!mounted || !profile?.organization_id) return
      const { data: org } = await sb
        .from("organizations")
        .select("pricing_margin_min_pct, pricing_margin_target_pct, pricing_rtt_days_per_year, pricing_default_avantages")
        .eq("id", profile.organization_id)
        .maybeSingle()
      if (!mounted) return
      const av = (org?.pricing_default_avantages as PricingDefaultAvantages | null) ?? DEFAULT_FORM.pricing_default_avantages
      setForm({
        pricing_margin_min_pct:
          org?.pricing_margin_min_pct ?? DEFAULT_FORM.pricing_margin_min_pct,
        pricing_margin_target_pct:
          org?.pricing_margin_target_pct ?? DEFAULT_FORM.pricing_margin_target_pct,
        pricing_rtt_days_per_year:
          org?.pricing_rtt_days_per_year ?? DEFAULT_FORM.pricing_rtt_days_per_year,
        pricing_default_avantages: av,
        treiziemeMois: Boolean(av.treiziemeMois),
      })
    })()
    return () => { mounted = false }
  }, [sb])

  // Debounced auto-save through the owner-only /api/cabinet PATCH so the
  // org row is updated server-side under proper auth checks.
  // Member calls are silently ignored: inputs are disabled too, but the
  // no-op here is a belt + bracelets for any edge case.
  const scheduleSave = useCallback(
    (next: Form) => {
      if (!userIdRef.current) return
      if (!isOwner) return
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
      setSaveState("saving")
      saveTimerRef.current = window.setTimeout(async () => {
        const res = await fetch("/api/cabinet", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pricing_margin_min_pct: next.pricing_margin_min_pct,
            pricing_margin_target_pct: next.pricing_margin_target_pct,
            pricing_rtt_days_per_year: next.pricing_rtt_days_per_year,
            pricing_default_avantages: {
              ...next.pricing_default_avantages,
              treiziemeMois: next.treiziemeMois,
            },
          }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({} as { error?: string }))
          setSaveState("error")
          setError(j.error ?? "Erreur lors de la sauvegarde.")
        } else {
          setSaveState("saved")
          setError(null)
          window.setTimeout(() => setSaveState("idle"), 2000)
        }
      }, 800)
    },
    [isOwner],
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

  // Option non souscrite → écran d'activation, pas les réglages. Placé AVANT
  // le loader : sans l'option, on n'a aucune raison d'attendre un fetch.
  if (!canPricing) {
    return (
      <main style={{
        minHeight: "calc(100vh - 60px)",
        padding: "32px 28px 72px",
        maxWidth: 720, margin: "0 auto",
        fontFamily: "var(--font-inter), sans-serif",
      }}>
        <div style={{
          padding: "32px 28px", borderRadius: 16, textAlign: "center",
          background: "linear-gradient(120deg, var(--nw-bg) 0%, var(--nw-border-soft) 100%)",
          border: "1px solid var(--nw-primary-100)",
        }}>
          <p style={{
            margin: 0, fontSize: 11, fontWeight: 700, color: "var(--nw-primary)",
            letterSpacing: "0.10em", textTransform: "uppercase",
          }}>
            Option non activée
          </p>
          <h1 style={{
            margin: "8px 0 0", fontSize: 22, fontWeight: 800, color: "var(--nw-text)",
            letterSpacing: "-0.02em",
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            Politique de chiffrage
          </h1>
          <p style={{ margin: "12px auto 0", maxWidth: 440, fontSize: 14, lineHeight: 1.65, color: "var(--nw-text-secondary)" }}>
            Ces réglages — marges minimale et cible, RTT, avantages standards —
            servent au moteur Syntec. Ils n&apos;ont d&apos;effet qu&apos;avec la
            Suite Pricing.
          </p>
          <Link
            href="/organisation?tab=abonnement"
            style={{
              display: "inline-block", marginTop: 20,
              padding: "11px 20px", borderRadius: 12,
              background: "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
              color: "white", fontSize: 13.5, fontWeight: 700,
              textDecoration: "none",
              boxShadow: "0 8px 24px -6px rgba(124,99,200,0.55)",
            }}
          >
            {isOwner ? "Activer l'option →" : "Voir mon organisation →"}
          </Link>
        </div>
      </main>
    )
  }

  if (!form) return <NoraLoader />

  const monthly = avantagesMonthlyTotal({ ...form.pricing_default_avantages, treiziemeMois: form.treiziemeMois })
  const margesInvalid = form.pricing_margin_target_pct < form.pricing_margin_min_pct

  return (
    <main style={{
      minHeight: "calc(100vh - 60px)",
      padding: "32px 28px 72px",
      maxWidth: 1280, margin: "0 auto",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 26 }}>
        <Link href="/workspace/pricing" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 13, color: "var(--nw-primary)", textDecoration: "none", marginBottom: 18,
        }}>← Retour au pricing</Link>
        <span style={{
          display: "inline-block",
          fontSize: 11, fontWeight: 700, color: "var(--nw-primary)",
          background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.18)",
          padding: "4px 11px", borderRadius: 100,
          letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12,
        }}>
          Paramètres organisation
        </span>
        <h1 style={{ margin: 0, fontSize: "clamp(24px, 3vw, 30px)", fontWeight: 800, color: "var(--nw-text)", letterSpacing: "-0.025em", lineHeight: 1.15 }}>
          Réglages récurrents de votre organisation
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--nw-text-muted)", lineHeight: 1.6, maxWidth: 640 }}>
          Marges et avantages standards de votre organisation.
        </p>
        {isOwner && <SaveBadge state={saveState} error={error} />}
      </div>

      {!isOwner && (
        <div style={{
          padding: "12px 16px", marginBottom: 18,
          background: "rgba(124,99,200,0.06)",
          border: "1px solid rgba(124,99,200,0.20)",
          borderRadius: 12, fontSize: 13, color: "var(--nw-text-secondary)", lineHeight: 1.55,
        }}>
          <strong style={{ color: "var(--nw-primary)" }}>Lecture seule.</strong>{" "}
          Seul l&apos;owner de l&apos;organisation modifie ces paramètres. Vous les consultez pour
          comprendre comment vos chiffrages sont calculés.
        </div>
      )}

      <div style={{
        pointerEvents: isOwner ? "auto" : "none",
        opacity: isOwner ? 1 : 0.75,
        display: "grid",
        gridTemplateColumns: "minmax(0, 5fr) minmax(0, 7fr)",
        gap: 18,
      }}
      className="param-grid">

      {/* ── Colonne gauche : Marges + Jours non facturables ─────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      <m.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        style={sectionStyle}
      >
        <SectionHeader title="Seuils de marge" subtitle="Plancher et objectif de rentabilité de votre organisation." />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Marge minimum acceptable" hint="En dessous, refus du chiffrage.">
            <NumberInput
              value={form.pricing_margin_min_pct}
              onChange={(v) => update("pricing_margin_min_pct", v)}
              min={0} max={50} step={0.5}
              suffix="%"
            />
          </Field>
          <Field label="Marge cible" hint="Objectif visé.">
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
            marginTop: 12, padding: "9px 12px", fontSize: 12.5, color: "var(--nw-danger-strong)",
            background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.25)",
            borderRadius: 9,
          }}>
            La marge cible doit être supérieure ou égale à la marge mini.
          </p>
        )}
      </m.section>

      <m.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: EASE }}
        style={sectionStyle}
      >
        <SectionHeader
          title="Jours payés non facturables"
          subtitle="Jours rémunérés sans revenu. Baissent la marge mensuelle de chaque mission."
        />

        <Field
          label="RTT accordés par votre organisation"
          hint="0 si vous n'accordez pas de RTT."
        >
          <NumberInput
            value={form.pricing_rtt_days_per_year}
            onChange={(v) => update("pricing_rtt_days_per_year", v)}
            min={0} max={25} step={1}
            suffix="j/an"
          />
        </Field>
      </m.section>

      </div>

      {/* ── Colonne droite : Avantages ──────────────────────────────────── */}
      <m.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        style={sectionStyle}
      >
        <SectionHeader
          title="Avantages standards"
          subtitle="Avantages appliqués à toutes les missions."
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
            margin: "8px 0 -2px", fontSize: 10.5, fontWeight: 700, color: "var(--nw-text-muted)",
            letterSpacing: "0.08em", textTransform: "uppercase", padding: "0 4px",
          }}>
            Optionnels
          </p>

          <BooleanAvantageRow
            label="13ᵉ mois"
            hint="Non obligatoire. Équivaut à 1 mois de brut /12."
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
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "var(--nw-primary)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Coût mensuel estimé des avantages activés
            </p>
            <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--nw-text-muted)" }}>
              Tickets resto × 21 j · annuels /12 · hors URSSAF grand déplacement (conditionnel).
            </p>
          </div>
          <span style={{ fontSize: 20, fontWeight: 800, color: "var(--nw-primary)", fontVariantNumeric: "tabular-nums" }}>
            ~{Math.round(monthly)} €
          </span>
        </div>
      </m.section>
      </div>

      {/* Confirmation bar : stampe pricing_onboarded_at pour faire disparaître
          la bannière "Politique pricing pas encore configurée" sur /workspace/pricing. */}
      {isOwner && (
        <div style={{
          marginTop: 22,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 14, flexWrap: "wrap",
          padding: "16px 20px", borderRadius: 12,
          background: onboarded ? "rgba(34,197,94,0.06)" : "rgba(124,99,200,0.06)",
          border: onboarded ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(124,99,200,0.25)",
        }}>
          <div style={{ minWidth: 0, flex: "1 1 280px" }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--nw-text)" }}>
              {onboarded ? "Politique pricing confirmée" : "Confirmer ces paramètres"}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--nw-text-muted)", lineHeight: 1.5 }}>
              {onboarded
                ? "Vous pouvez modifier librement ; les changements sont enregistrés automatiquement."
                : "Vos chiffrages utiliseront ces valeurs. Confirmez pour marquer la politique comme configurée et masquer la bannière du pricing."}
            </p>
          </div>
          <button
            type="button"
            onClick={confirmConfiguration}
            disabled={confirming || margesInvalid}
            style={{
              padding: "10px 18px", borderRadius: 10,
              background: confirming || margesInvalid
                ? "var(--nw-border)"
                : onboarded
                  ? "white"
                  : "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
              color: confirming || margesInvalid
                ? "var(--nw-text-muted)"
                : onboarded ? "var(--nw-primary)" : "white",
              border: onboarded ? "1px solid rgba(124,99,200,0.30)" : "none",
              fontSize: 13, fontWeight: 700, fontFamily: "inherit",
              cursor: confirming || margesInvalid ? "default" : "pointer",
              whiteSpace: "nowrap",
              boxShadow: !onboarded && !confirming && !margesInvalid
                ? "0 6px 18px -8px rgba(124,99,200,0.55)" : "none",
            }}
          >
            {confirming
              ? "Enregistrement…"
              : onboarded
                ? "Re-confirmer"
                : "✓ Sauvegarder ces paramètres"}
          </button>
        </div>
      )}

      <style>{`
        @media (max-width: 1024px) {
          .param-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  )
}

/* ──────────────────────────────────────────────────────────────────────── */

const sectionStyle: React.CSSProperties = {
  marginBottom: 18,
  background: "white",
  borderRadius: 16,
  border: "1px solid var(--nw-border-soft)",
  padding: 22,
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--nw-text)", letterSpacing: "-0.01em" }}>
        {title}
      </h2>
      {subtitle && (
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--nw-text-muted)", lineHeight: 1.55 }}>{subtitle}</p>
      )}
    </div>
  )
}

function SaveBadge({ state, error }: { state: "idle" | "saving" | "saved" | "error"; error: string | null }) {
  if (state === "idle") return null
  const fg = state === "error" ? "var(--nw-danger-strong)" : state === "saved" ? "var(--nw-success)" : "var(--nw-text-muted)"
  const bg = state === "error" ? "rgba(220,38,38,0.06)" : state === "saved" ? "rgba(34,197,94,0.07)" : "var(--nw-neutral-100)"
  const bd = state === "error" ? "rgba(220,38,38,0.25)" : state === "saved" ? "rgba(34,197,94,0.25)" : "var(--nw-border)"
  const text =
    state === "saving" ? "Enregistrement…"
    : state === "saved" ? "Enregistré"
    : `Échec : ${error ?? "réessaie"}`
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
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--nw-text-body)" }}>{label}</span>
      {hint && <span style={{ fontSize: 11, color: "var(--nw-text-muted)", lineHeight: 1.4 }}>{hint}</span>}
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
      <span style={{ fontSize: 12, color: "var(--nw-text-muted)", paddingRight: 12 }}>{suffix}</span>
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
      background: enabled ? "rgba(124,99,200,0.04)" : "var(--nw-surface-muted)",
      border: enabled ? "1px solid rgba(124,99,200,0.18)" : "1px solid var(--nw-border-soft)",
      borderRadius: 9,
    }}>
      <Checkbox checked={enabled} onChange={onToggle} />
      <div>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--nw-text)" }}>{label}</p>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--nw-text-muted)", lineHeight: 1.4 }}>{hint}</p>
      </div>
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

  const [remembered, setRemembered] = useState<number>(
    externalValue > 0 ? externalValue : config.defaultValue,
  )

  // Input vide quand pas activé → placeholder grisé fantôme, on tape proprement.
  const inputValue = enabled ? String(Math.round(externalValue)) : ""
  const placeholderValue = enabled ? undefined : String(Math.round(remembered))
  const warningMsg = enabled && config.warning ? config.warning(externalValue) : null

  const handleToggle = (on: boolean) => {
    onChange(on ? (remembered > 0 ? remembered : config.defaultValue) : 0)
  }
  const handleInputChange = (raw: string) => {
    if (raw === "") { onChange(0); return }
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    const clamped = Math.min(config.max, Math.max(0, n))
    if (clamped > 0) setRemembered(clamped)
    onChange(clamped)
  }

  return (
    <div style={{
      padding: "10px 12px",
      background: enabled ? "rgba(124,99,200,0.04)" : "var(--nw-surface-muted)",
      border: enabled ? "1px solid rgba(124,99,200,0.18)" : "1px solid var(--nw-border-soft)",
      borderRadius: 9,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center" }}>
        {isRequired ? (
          <span style={{
            display: "inline-block", width: 8, height: 8, borderRadius: "50%",
            background: "var(--nw-primary)", margin: "0 6px",
          }} title="Obligation légale, toujours actif" />
        ) : (
          <Checkbox checked={enabled} onChange={handleToggle} />
        )}
        <div>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--nw-text)", display: "flex", alignItems: "center", gap: 6 }}>
            {config.label}
            {isRequired && (
              <span style={{
                fontSize: 9.5, fontWeight: 800, color: "var(--nw-primary)",
                background: "rgba(124,99,200,0.10)", border: "1px solid rgba(124,99,200,0.25)",
                borderRadius: 100, padding: "1px 7px",
                letterSpacing: "0.05em", textTransform: "uppercase",
              }}>
                Obligatoire
              </span>
            )}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--nw-text-muted)", lineHeight: 1.4 }}>{config.hint}</p>
        </div>
        <div style={{ width: 140 }}>
          <div style={inputBoxStyle}>
            <input
              type="number"
              value={inputValue}
              placeholder={placeholderValue}
              onChange={(e) => handleInputChange(e.target.value)}
              style={{ ...inputInnerStyle, color: "var(--nw-text)" }}
              min={0}
              max={config.max}
              step={config.step ?? 1}
            />
            <span style={{ fontSize: 11, color: "var(--nw-text-muted)", paddingRight: 10 }}>{config.suffix}</span>
          </div>
        </div>
      </div>
      {warningMsg && (
        <p style={{
          margin: "8px 0 0", fontSize: 11.5, color: "var(--nw-warn)",
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
        border: checked ? "none" : "1.5px solid var(--nw-border)",
        background: checked ? "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)" : "white",
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
  background: "white", border: "1px solid var(--nw-border)", borderRadius: 9,
  overflow: "hidden",
}

const inputInnerStyle: React.CSSProperties = {
  flex: 1, padding: "9px 12px",
  fontSize: 13, color: "var(--nw-text)",
  background: "transparent", border: "none", outline: "none",
  fontFamily: "inherit", minWidth: 0, width: "100%",
}
