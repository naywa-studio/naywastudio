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
  AVANTAGES_LABELS,
  avantageSuffixLabel,
  avantagesMonthlyTotal,
  type AvantageConfig,
} from "@/lib/pricing/avantages-meta"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const copy = {
  fr: {
    backToPricing: "← Retour au pricing",
    badge: "Paramètres organisation",
    title: "Réglages récurrents de votre organisation",
    subtitle: "Marges et avantages standards de votre organisation.",
    readOnlyBadge: "Lecture seule.",
    readOnlyBody: "Seul l'owner de l'organisation modifie ces paramètres. Vous les consultez pour comprendre comment vos chiffrages sont calculés.",
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
    optionNotActive: "Option non activée",
    pricingPolicyTitle: "Politique de chiffrage",
    pricingPolicyGateBody: "Ces réglages — marges minimale et cible, RTT, avantages standards — servent au moteur Syntec. Ils n'ont d'effet qu'avec la Suite Pricing.",
    activateOption: "Activer l'option →",
    viewMyOrg: "Voir mon organisation →",
  },
  en: {
    backToPricing: "← Back to pricing",
    badge: "Organization settings",
    title: "Recurring settings for your organization",
    subtitle: "Standard margins and benefits for your organization.",
    readOnlyBadge: "Read-only.",
    readOnlyBody: "Only the organization owner can edit these settings. You can review them to understand how your pricing is calculated.",
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
    optionNotActive: "Option not activated",
    pricingPolicyTitle: "Pricing policy",
    pricingPolicyGateBody: "These settings — minimum and target margins, RTT, standard benefits — feed the Syntec engine. They only take effect with Suite Pricing.",
    activateOption: "Activate the option →",
    viewMyOrg: "View my organization →",
  },
}

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
  const { lang } = useLanguage()
  const t = copy[lang]
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
      setError(j.error ?? t.confirmErrorGeneric)
    }
  }, [isOwner, confirming, refetch, t.confirmErrorGeneric])

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
          setError(j.error ?? t.saveErrorGeneric)
        } else {
          setSaveState("saved")
          setError(null)
          window.setTimeout(() => setSaveState("idle"), 2000)
        }
      }, 800)
    },
    [isOwner, t.saveErrorGeneric],
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
          background: "linear-gradient(120deg, #F8F6FF 0%, #F0ECF8 100%)",
          border: "1px solid #E2DAF6",
        }}>
          <p style={{
            margin: 0, fontSize: 11, fontWeight: 700, color: "#7C63C8",
            letterSpacing: "0.10em", textTransform: "uppercase",
          }}>
            {t.optionNotActive}
          </p>
          <h1 style={{
            margin: "8px 0 0", fontSize: 22, fontWeight: 800, color: "#111827",
            letterSpacing: "-0.02em",
            fontFamily: "var(--font-space-grotesk), sans-serif",
          }}>
            {t.pricingPolicyTitle}
          </h1>
          <p style={{ margin: "12px auto 0", maxWidth: 440, fontSize: 14, lineHeight: 1.65, color: "#4B5563" }}>
            {t.pricingPolicyGateBody}
          </p>
          <Link
            href="/organisation?tab=abonnement"
            style={{
              display: "inline-block", marginTop: 20,
              padding: "11px 20px", borderRadius: 12,
              background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
              color: "white", fontSize: 13.5, fontWeight: 700,
              textDecoration: "none",
              boxShadow: "0 8px 24px -6px rgba(124,99,200,0.55)",
            }}
          >
            {isOwner ? t.activateOption : t.viewMyOrg}
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
          fontSize: 13, color: "#7C63C8", textDecoration: "none", marginBottom: 18,
        }}>{t.backToPricing}</Link>
        <span style={{
          display: "inline-block",
          fontSize: 11, fontWeight: 700, color: "#7C63C8",
          background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.18)",
          padding: "4px 11px", borderRadius: 100,
          letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12,
        }}>
          {t.badge}
        </span>
        <h1 style={{ margin: 0, fontSize: "clamp(24px, 3vw, 30px)", fontWeight: 800, color: "#111827", letterSpacing: "-0.025em", lineHeight: 1.15 }}>
          {t.title}
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "#6B7280", lineHeight: 1.6, maxWidth: 640 }}>
          {t.subtitle}
        </p>
        {isOwner && <SaveBadge state={saveState} error={error} lang={lang} />}
      </div>

      {!isOwner && (
        <div style={{
          padding: "12px 16px", marginBottom: 18,
          background: "rgba(124,99,200,0.06)",
          border: "1px solid rgba(124,99,200,0.20)",
          borderRadius: 12, fontSize: 13, color: "#4B5563", lineHeight: 1.55,
        }}>
          <strong style={{ color: "#7C63C8" }}>{t.readOnlyBadge}</strong>{" "}
          {t.readOnlyBody}
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
        <SectionHeader title={t.marginThresholdsTitle} subtitle={t.marginThresholdsSubtitle} />
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
            marginTop: 12, padding: "9px 12px", fontSize: 12.5, color: "#B91C1C",
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
          title={t.nonBillableTitle}
          subtitle={t.nonBillableSubtitle}
        />

        <Field
          label={t.rttLabel}
          hint={t.rttHint}
        >
          <NumberInput
            value={form.pricing_rtt_days_per_year}
            onChange={(v) => update("pricing_rtt_days_per_year", v)}
            min={0} max={25} step={1}
            suffix={t.perYearAbbr}
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
          title={t.benefitsTitle}
          subtitle={t.benefitsSubtitle}
        />
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
            margin: "8px 0 -2px", fontSize: 10.5, fontWeight: 700, color: "#6B7280",
            letterSpacing: "0.08em", textTransform: "uppercase", padding: "0 4px",
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
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#7C63C8", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {t.monthlyEstimateTitle}
            </p>
            <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "#6B7280" }}>
              {t.monthlyEstimateHint}
            </p>
          </div>
          <span style={{ fontSize: 20, fontWeight: 800, color: "#7C63C8", fontVariantNumeric: "tabular-nums" }}>
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
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "#111827" }}>
              {onboarded ? t.confirmedTitle : t.unconfirmedTitle}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#6B7280", lineHeight: 1.5 }}>
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
                ? "#E5E7EB"
                : onboarded
                  ? "white"
                  : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
              color: confirming || margesInvalid
                ? "#6B7280"
                : onboarded ? "#7C63C8" : "white",
              border: onboarded ? "1px solid rgba(124,99,200,0.30)" : "none",
              fontSize: 13, fontWeight: 700, fontFamily: "inherit",
              cursor: confirming || margesInvalid ? "default" : "pointer",
              whiteSpace: "nowrap",
              boxShadow: !onboarded && !confirming && !margesInvalid
                ? "0 6px 18px -8px rgba(124,99,200,0.55)" : "none",
            }}
          >
            {confirming
              ? t.saving
              : onboarded
                ? t.reconfirm
                : t.saveButton}
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

function SaveBadge({ state, error, lang }: { state: "idle" | "saving" | "saved" | "error"; error: string | null; lang: "fr" | "en" }) {
  if (state === "idle") return null
  const t = copy[lang]
  const fg = state === "error" ? "#B91C1C" : state === "saved" ? "#15803d" : "#6B7280"
  const bg = state === "error" ? "rgba(220,38,38,0.06)" : state === "saved" ? "rgba(34,197,94,0.07)" : "#F3F4F6"
  const bd = state === "error" ? "rgba(220,38,38,0.25)" : state === "saved" ? "rgba(34,197,94,0.25)" : "#E5E7EB"
  const text =
    state === "saving" ? t.saving
    : state === "saved" ? t.saved
    : t.saveFailed(error ?? t.saveFailedFallback)
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
      {hint && <span style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.4 }}>{hint}</span>}
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
      <span style={{ fontSize: 12, color: "#6B7280", paddingRight: 12 }}>{suffix}</span>
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
        <p style={{ margin: "2px 0 0", fontSize: 11, color: "#6B7280", lineHeight: 1.4 }}>{hint}</p>
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
      background: enabled ? "rgba(124,99,200,0.04)" : "#FAFAFA",
      border: enabled ? "1px solid rgba(124,99,200,0.18)" : "1px solid #F0ECF8",
      borderRadius: 9,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center" }}>
        {isRequired ? (
          <span style={{
            display: "inline-block", width: 8, height: 8, borderRadius: "50%",
            background: "#7C63C8", margin: "0 6px",
          }} title={t.legalObligation} />
        ) : (
          <Checkbox checked={enabled} onChange={handleToggle} />
        )}
        <div>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "#111827", display: "flex", alignItems: "center", gap: 6 }}>
            {labels.label}
            {isRequired && (
              <span style={{
                fontSize: 9.5, fontWeight: 800, color: "#7C63C8",
                background: "rgba(124,99,200,0.10)", border: "1px solid rgba(124,99,200,0.25)",
                borderRadius: 100, padding: "1px 7px",
                letterSpacing: "0.05em", textTransform: "uppercase",
              }}>
                {t.required}
              </span>
            )}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "#6B7280", lineHeight: 1.4 }}>{labels.hint}</p>
        </div>
        <div style={{ width: 140 }}>
          <div style={inputBoxStyle}>
            <input
              type="number"
              value={inputValue}
              placeholder={placeholderValue}
              onChange={(e) => handleInputChange(e.target.value)}
              style={{ ...inputInnerStyle, color: "#111827" }}
              min={0}
              max={config.max}
              step={config.step ?? 1}
            />
            <span style={{ fontSize: 11, color: "#6B7280", paddingRight: 10 }}>{suffixLabel}</span>
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
