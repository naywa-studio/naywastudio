"use client"

/**
 * PricingPolicyForm — réglages pricing récurrents du cabinet, embarqués
 * DIRECTEMENT dans la section « Politique de pricing » de /organisation.
 *
 * Fusion de l'ancienne page autonome /organisation/parametrage (désormais
 * une simple redirection). On garde exactement les mêmes champs, hints et
 * alertes URSSAF ; on retire seulement le chrome de page (main, header,
 * lien retour) puisque la console /organisation fournit déjà le cadre.
 *
 * Droits : éditable dès que la capacité `canPricing` est accordée (owner ou
 * délégué habilité). L'écriture passe par le PATCH owner/caps de /api/cabinet,
 * qui ré-applique le contrôle field-level côté serveur — l'UI n'est qu'un
 * garde-fou de confort.
 *
 * Les valeurs initiales viennent de `organization` (déjà chargé par le layout,
 * pricing_* inclus) : aucun fetch Supabase supplémentaire, aucun loader.
 */

import { useCallback, useRef, useState } from "react"
import Link from "next/link"
import { m } from "framer-motion"
import { useCabinet } from "@/app/organisation/layout"
import type { PricingDefaultAvantages } from "@/lib/database.types"
import {
  AVANTAGES_CONFIG,
  AVANTAGES_LABELS,
  avantageSuffixLabel,
  avantagesMonthlyTotal,
  type AvantageConfig,
} from "@/lib/pricing/avantages-meta"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const copy = {
  fr: {
    introTitle: "Politique de pricing",
    introBody: "Ces réglages alimentent le moteur de chiffrage Syntec : marge plancher et cible, jours payés non facturables et avantages standards appliqués à chacune de vos missions.",
    syntecDocCta: "Référence Syntec",
    stepMargins: "Étape 1",
    stepNonBillable: "Étape 2",
    stepBenefits: "Étape 3",
    readOnlyBadge: "Lecture seule.",
    readOnlyBody: "Vous consultez ces paramètres pour comprendre comment vos chiffrages sont calculés. Seuls l'owner et les membres habilités au pricing les modifient.",
    marginThresholdsTitle: "Seuils de marge",
    marginThresholdsSubtitle: "Plancher et objectif de rentabilité de votre organisation.",
    marginMinLabel: "Marge minimum acceptable",
    marginMinHint: "En dessous, refus du chiffrage.",
    marginTargetLabel: "Marge cible",
    marginTargetHint: "Objectif visé.",
    marginInvalid: "La marge cible doit être supérieure ou égale à la marge mini.",
    nonBillableTitle: "Jours payés non facturables",
    nonBillableSubtitle: "Jours rémunérés sans revenu. Baissent la marge mensuelle de chaque mission.",
    rttLabel: "RTT accordés par votre organisation",
    rttHint: "0 si vous n'accordez pas de RTT.",
    perYearAbbr: "j/an",
    benefitsTitle: "Avantages standards",
    benefitsSubtitle: "Avantages appliqués à toutes les missions.",
    optional: "Optionnels",
    thirteenthLabel: "13ᵉ mois",
    thirteenthHint: "Non obligatoire. Équivaut à 1 mois de brut /12.",
    monthlyEstimateTitle: "Coût mensuel estimé des avantages activés",
    monthlyEstimateHint: "Tickets resto × 21 j · annuels /12 · hors URSSAF grand déplacement (conditionnel).",
    confirmedTitle: "Politique pricing confirmée",
    unconfirmedTitle: "Confirmer ces paramètres",
    confirmedBody: "Vous pouvez modifier librement ; les changements sont enregistrés automatiquement.",
    unconfirmedBody: "Vos chiffrages utiliseront ces valeurs. Confirmez pour marquer la politique comme configurée et masquer la bannière du pricing.",
    saving: "Enregistrement…",
    reconfirm: "Re-confirmer",
    saveButton: "✓ Sauvegarder ces paramètres",
    saved: "Enregistré",
    saveFailed: (err: string) => `Échec : ${err}`,
    saveFailedFallback: "réessaie",
    saveErrorGeneric: "Erreur lors de la sauvegarde.",
    confirmErrorGeneric: "Erreur lors de la confirmation.",
    legalObligation: "Obligation légale, toujours actif",
    required: "Obligatoire",
  },
  en: {
    introTitle: "Pricing policy",
    introBody: "These settings feed the Syntec pricing engine: floor and target margins, paid non-billable days and standard benefits applied to every mission.",
    syntecDocCta: "Syntec reference",
    stepMargins: "Step 1",
    stepNonBillable: "Step 2",
    stepBenefits: "Step 3",
    readOnlyBadge: "Read-only.",
    readOnlyBody: "You can review these settings to understand how your pricing is calculated. Only the owner and members granted pricing rights can edit them.",
    marginThresholdsTitle: "Margin thresholds",
    marginThresholdsSubtitle: "Your organization's profitability floor and target.",
    marginMinLabel: "Minimum acceptable margin",
    marginMinHint: "Below this, the pricing is rejected.",
    marginTargetLabel: "Target margin",
    marginTargetHint: "Goal to aim for.",
    marginInvalid: "The target margin must be greater than or equal to the minimum margin.",
    nonBillableTitle: "Paid non-billable days",
    nonBillableSubtitle: "Paid days with no revenue. Lower the monthly margin of every mission.",
    rttLabel: "RTT days granted by your organization",
    rttHint: "0 if you don't grant RTT days.",
    perYearAbbr: "days/yr",
    benefitsTitle: "Standard benefits",
    benefitsSubtitle: "Benefits applied to every mission.",
    optional: "Optional",
    thirteenthLabel: "13th month",
    thirteenthHint: "Not mandatory. Equivalent to 1 month of gross salary /12.",
    monthlyEstimateTitle: "Estimated monthly cost of enabled benefits",
    monthlyEstimateHint: "Meal vouchers × 21 days · yearly ones /12 · excludes URSSAF extended-travel allowance (conditional).",
    confirmedTitle: "Pricing policy confirmed",
    unconfirmedTitle: "Confirm these settings",
    confirmedBody: "You can edit freely; changes are saved automatically.",
    unconfirmedBody: "Your pricing will use these values. Confirm to mark the policy as configured and hide the banner on the pricing page.",
    saving: "Saving…",
    reconfirm: "Re-confirm",
    saveButton: "✓ Save these settings",
    saved: "Saved",
    saveFailed: (err: string) => `Failed: ${err}`,
    saveFailedFallback: "try again",
    saveErrorGeneric: "Error while saving.",
    confirmErrorGeneric: "Error while confirming.",
    legalObligation: "Legal obligation, always active",
    required: "Required",
  },
}

interface Form {
  pricing_margin_min_pct: number
  pricing_margin_target_pct: number
  pricing_rtt_days_per_year: number
  pricing_default_avantages: PricingDefaultAvantages
  treiziemeMois: boolean
}

const DEFAULT_AVANTAGES: PricingDefaultAvantages = {
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
}

export default function PricingPolicyForm() {
  const { organization, refetch, caps } = useCabinet()
  const { lang } = useLanguage()
  const t = copy[lang]
  // Éditable dès que la capacité pricing est accordée (owner ou délégué
  // habilité). Le serveur ré-applique le contrôle sur les champs pricing.
  const canEdit = caps.canPricing
  const saveTimerRef = useRef<number | null>(null)

  // Valeurs initiales lues une seule fois depuis l'organization déjà chargée
  // par le layout — pas de fetch, pas de loader.
  const [form, setForm] = useState<Form>(() => {
    const av = organization.pricing_default_avantages ?? DEFAULT_AVANTAGES
    return {
      pricing_margin_min_pct: organization.pricing_margin_min_pct ?? 15,
      pricing_margin_target_pct: organization.pricing_margin_target_pct ?? 22,
      pricing_rtt_days_per_year: organization.pricing_rtt_days_per_year ?? 0,
      pricing_default_avantages: av,
      treiziemeMois: Boolean(av.treiziemeMois),
    }
  })
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const onboarded = !!organization.pricing_onboarded_at

  const confirmConfiguration = useCallback(async () => {
    if (!canEdit || confirming) return
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
      setError(j.error ?? t.confirmErrorGeneric)
    }
  }, [canEdit, confirming, refetch, t.confirmErrorGeneric])

  // Auto-save debounced (800 ms) via le PATCH owner/caps de /api/cabinet.
  const scheduleSave = useCallback(
    (next: Form) => {
      if (!canEdit) return
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
          setError(j.error ?? t.saveErrorGeneric)
        } else {
          setSaveState("saved")
          setError(null)
          window.setTimeout(() => setSaveState("idle"), 2000)
        }
      }, 800)
    },
    [canEdit, t.saveErrorGeneric],
  )

  const update = useCallback(
    <K extends keyof Form>(key: K, value: Form[K]) => {
      setForm((prev) => {
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

  const monthly = avantagesMonthlyTotal({ ...form.pricing_default_avantages, treiziemeMois: form.treiziemeMois })
  const margesInvalid = form.pricing_margin_target_pct < form.pricing_margin_min_pct

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {canEdit && <SaveBadge state={saveState} error={error} lang={lang} />}

      {!canEdit && (
        <div style={{
          padding: "12px 16px",
          background: "rgba(124,99,200,0.06)",
          border: "1px solid rgba(124,99,200,0.20)",
          borderRadius: 12, fontSize: 13, color: "var(--nw-text-secondary)", lineHeight: 1.55,
        }}>
          <strong style={{ color: "var(--nw-primary)" }}>{t.readOnlyBadge}</strong>{" "}
          {t.readOnlyBody}
        </div>
      )}

      {/* Intro : à quoi servent ces réglages + accès direct à la doc Syntec.
          Hors du wrapper désactivé → le lien reste cliquable en lecture seule. */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 14, flexWrap: "wrap",
        padding: "14px 18px", borderRadius: 14,
        background: "rgba(124,99,200,0.06)",
        border: "1px solid rgba(124,99,200,0.20)",
      }}>
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--nw-text)", letterSpacing: "-0.01em" }}>
            {t.introTitle}
          </h2>
          <p style={{ margin: "5px 0 0", fontSize: 12.5, color: "var(--nw-text-muted)", lineHeight: 1.55 }}>
            {t.introBody}
          </p>
        </div>
        <Link
          href="/workspace/pricing/reference"
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "9px 15px", borderRadius: 10,
            background: "white", border: "1px solid var(--nw-primary-100)",
            color: "var(--nw-primary)", fontSize: 12.5, fontWeight: 700,
            textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
          }}
        >
          <span aria-hidden>📖</span> {t.syntecDocCta}
        </Link>
      </div>

      <div style={{
        pointerEvents: canEdit ? "auto" : "none",
        opacity: canEdit ? 1 : 0.75,
        display: "grid", gap: 16,
      }}>

      {/* Étapes 1 & 2 — Marges + Jours non facturables, compactes côte à côte. */}
      <div className="pricing-top-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

      <m.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        style={sectionStyle}
      >
        <SectionHeader step={t.stepMargins} title={t.marginThresholdsTitle} subtitle={t.marginThresholdsSubtitle} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label={t.marginMinLabel} hint={t.marginMinHint}>
            <NumberInput
              value={form.pricing_margin_min_pct}
              onChange={(v) => update("pricing_margin_min_pct", v)}
              min={0} max={50} step={0.5}
              suffix="%"
            />
          </Field>
          <Field label={t.marginTargetLabel} hint={t.marginTargetHint}>
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
            {t.marginInvalid}
          </p>
        )}
      </m.section>

      <m.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: EASE }}
        style={sectionStyle}
      >
        <SectionHeader
          step={t.stepNonBillable}
          title={t.nonBillableTitle}
          subtitle={t.nonBillableSubtitle}
        />
        <Field label={t.rttLabel} hint={t.rttHint}>
          <NumberInput
            value={form.pricing_rtt_days_per_year}
            onChange={(v) => update("pricing_rtt_days_per_year", v)}
            min={0} max={25} step={1}
            suffix={t.perYearAbbr}
          />
        </Field>
      </m.section>

      </div>

      {/* Étape 3 — Avantages standards, pleine largeur (liste longue). */}
      <m.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        style={sectionStyle}
      >
        <SectionHeader step={t.stepBenefits} title={t.benefitsTitle} subtitle={t.benefitsSubtitle} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Obligatoires groupés en tête */}
          {AVANTAGES_CONFIG.filter((c) => c.required).map((cfg) => (
            <SmartAvantageRow
              key={cfg.key}
              config={cfg}
              lang={lang}
              t={t}
              value={form.pricing_default_avantages[cfg.key as keyof PricingDefaultAvantages] as number | undefined}
              onChange={(v) => updateAvantage(cfg.key as keyof PricingDefaultAvantages, v as PricingDefaultAvantages[keyof PricingDefaultAvantages])}
            />
          ))}

          <p style={{
            margin: "8px 0 -2px", fontSize: 10.5, fontWeight: 700, color: "var(--nw-text-muted)",
            letterSpacing: "0.08em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase", padding: "0 4px",
          }}>
            {t.optional}
          </p>

          <BooleanAvantageRow
            label={t.thirteenthLabel}
            hint={t.thirteenthHint}
            enabled={form.treiziemeMois}
            onToggle={(on) => update("treiziemeMois", on)}
          />

          {AVANTAGES_CONFIG.filter((c) => !c.required).map((cfg) => (
            <SmartAvantageRow
              key={cfg.key}
              config={cfg}
              lang={lang}
              t={t}
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
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "var(--nw-primary)", letterSpacing: "0.06em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase" }}>
              {t.monthlyEstimateTitle}
            </p>
            <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--nw-text-muted)" }}>
              {t.monthlyEstimateHint}
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
      {canEdit && (
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 14, flexWrap: "wrap",
          padding: "16px 20px", borderRadius: 12,
          background: onboarded ? "rgba(34,197,94,0.06)" : "rgba(124,99,200,0.06)",
          border: onboarded ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(124,99,200,0.25)",
        }}>
          <div style={{ minWidth: 0, flex: "1 1 280px" }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--nw-text)" }}>
              {onboarded ? t.confirmedTitle : t.unconfirmedTitle}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--nw-text-muted)", lineHeight: 1.5 }}>
              {onboarded ? t.confirmedBody : t.unconfirmedBody}
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
            {confirming ? t.saving : onboarded ? t.reconfirm : t.saveButton}
          </button>
        </div>
      )}

      <style>{`
        @media (max-width: 720px) {
          .pricing-top-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────── */

const sectionStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 16,
  border: "1px solid var(--nw-border-soft)",
  padding: 22,
}

function SectionHeader({ title, subtitle, step }: { title: string; subtitle?: string; step?: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: subtitle ? 4 : 0 }}>
        {step && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: "var(--nw-primary)",
            background: "rgba(124,99,200,0.10)", border: "1px solid rgba(124,99,200,0.22)",
            borderRadius: 100, padding: "2px 9px",
            letterSpacing: "0.06em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
            whiteSpace: "nowrap", flexShrink: 0,
          }}>
            {step}
          </span>
        )}
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--nw-text)", letterSpacing: "-0.01em" }}>
          {title}
        </h2>
      </div>
      {subtitle && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--nw-text-muted)", lineHeight: 1.55 }}>{subtitle}</p>
      )}
    </div>
  )
}

function SaveBadge({ state, error, lang }: { state: "idle" | "saving" | "saved" | "error"; error: string | null; lang: "fr" | "en" }) {
  if (state === "idle") return null
  const t = copy[lang]
  const fg = state === "error" ? "var(--nw-danger-strong)" : state === "saved" ? "var(--nw-success)" : "var(--nw-text-muted)"
  const bg = state === "error" ? "rgba(220,38,38,0.06)" : state === "saved" ? "rgba(34,197,94,0.07)" : "var(--nw-neutral-100)"
  const bd = state === "error" ? "rgba(220,38,38,0.25)" : state === "saved" ? "rgba(34,197,94,0.25)" : "var(--nw-border)"
  const text =
    state === "saving" ? t.saving
    : state === "saved" ? t.saved
    : t.saveFailed(error ?? t.saveFailedFallback)
  return (
    <span style={{
      justifySelf: "start",
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
  config, value, onChange, lang, t,
}: {
  config: AvantageConfig
  value: number | undefined
  onChange: (v: number) => void
  lang: "fr" | "en"
  t: (typeof copy)["fr"]
}) {
  const labels = AVANTAGES_LABELS[lang][config.key]
  const suffixLabel = avantageSuffixLabel(config.suffix, lang)
  const isRequired = config.required === true
  const externalValue = value ?? 0
  const enabled = isRequired || externalValue > 0

  const [remembered, setRemembered] = useState<number>(
    externalValue > 0 ? externalValue : config.defaultValue,
  )

  // Input vide quand pas activé → placeholder grisé fantôme, on tape proprement.
  const inputValue = enabled ? String(Math.round(externalValue)) : ""
  const placeholderValue = enabled ? undefined : String(Math.round(remembered))
  const warningMsg = enabled && labels.warning ? labels.warning(externalValue) : null

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
          }} title={t.legalObligation} />
        ) : (
          <Checkbox checked={enabled} onChange={handleToggle} />
        )}
        <div>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--nw-text)", display: "flex", alignItems: "center", gap: 6 }}>
            {labels.label}
            {isRequired && (
              <span style={{
                fontSize: 9.5, fontWeight: 800, color: "var(--nw-primary)",
                background: "rgba(124,99,200,0.10)", border: "1px solid rgba(124,99,200,0.25)",
                borderRadius: 100, padding: "1px 7px",
                letterSpacing: "0.05em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
              }}>
                {t.required}
              </span>
            )}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--nw-text-muted)", lineHeight: 1.4 }}>{labels.hint}</p>
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
            <span style={{ fontSize: 11, color: "var(--nw-text-muted)", paddingRight: 10 }}>{suffixLabel}</span>
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
