"use client"

/**
 * /workspace/parametrage — Paramètres pricing du cabinet.
 *
 * Page volontairement non listée dans la nav principale. Accessible via le
 * lien ⚙ "Paramètres pricing" qui apparaîtra sur le widget de chiffrage
 * sur la fiche match. Le sourceur la visite une fois en arrivant pour caler
 * ses valeurs par défaut, puis n'y revient que rarement.
 *
 * Auto-save debounced (1s) — pas de bouton "Enregistrer", les changements
 * persistent silencieusement et un petit indicateur "✓ enregistré" confirme.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { m } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import type { PricingDefaultAvantages, Profile } from "@/lib/database.types"
import NoraLoader from "@/components/workspace/NoraLoader"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

/* ──────────────────────────────────────────────────────────────────────────
 * Type-safe form state — mirrors the profiles pricing_* columns.
 * ────────────────────────────────────────────────────────────────────────── */

type Lieu = "paris_petite_couronne" | "idf_grande_couronne" | "lyon" | "province"
type Modalite = "modalite_1" | "modalite_2" | "modalite_3"

interface Form {
  pricing_billable_days_per_month: number
  pricing_margin_min_pct: number
  pricing_margin_target_pct: number
  pricing_default_lieu: Lieu
  pricing_default_modalite: Modalite
  pricing_default_avantages: PricingDefaultAvantages
}

const DEFAULT_FORM: Form = {
  pricing_billable_days_per_month: 18,
  pricing_margin_min_pct: 15,
  pricing_margin_target_pct: 22,
  pricing_default_lieu: "paris_petite_couronne",
  pricing_default_modalite: "modalite_1",
  pricing_default_avantages: {
    ticketsResto: 6,           // €/jour travaillé (URSSAF 2026 plafond exonération employeur ≈ 7.18€)
    mutuellePremium: 45,
    transport: 42,
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

const MODALITE_LABELS: Record<Modalite, string> = {
  modalite_1: "Modalité 1 — Standard 35h",
  modalite_2: "Modalité 2 — Forfait hebdo 38h30 (+15% mini)",
  modalite_3: "Modalité 3 — Forfait jours 218j (+20% mini)",
}

/* ──────────────────────────────────────────────────────────────────────────
 * Page
 * ────────────────────────────────────────────────────────────────────────── */

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
        .select(
          "pricing_billable_days_per_month, pricing_margin_min_pct, pricing_margin_target_pct, pricing_default_lieu, pricing_default_modalite, pricing_default_avantages",
        )
        .eq("user_id", user.id)
        .maybeSingle()
      if (!mounted) return
      const profile = data as Partial<Profile> | null
      setForm({
        pricing_billable_days_per_month:
          profile?.pricing_billable_days_per_month ?? DEFAULT_FORM.pricing_billable_days_per_month,
        pricing_margin_min_pct:
          profile?.pricing_margin_min_pct ?? DEFAULT_FORM.pricing_margin_min_pct,
        pricing_margin_target_pct:
          profile?.pricing_margin_target_pct ?? DEFAULT_FORM.pricing_margin_target_pct,
        pricing_default_lieu:
          (profile?.pricing_default_lieu as Lieu) ?? DEFAULT_FORM.pricing_default_lieu,
        pricing_default_modalite:
          (profile?.pricing_default_modalite as Modalite) ?? DEFAULT_FORM.pricing_default_modalite,
        pricing_default_avantages:
          (profile?.pricing_default_avantages as PricingDefaultAvantages) ??
          DEFAULT_FORM.pricing_default_avantages,
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
            pricing_billable_days_per_month: next.pricing_billable_days_per_month,
            pricing_margin_min_pct: next.pricing_margin_min_pct,
            pricing_margin_target_pct: next.pricing_margin_target_pct,
            pricing_default_lieu: next.pricing_default_lieu,
            pricing_default_modalite: next.pricing_default_modalite,
            pricing_default_avantages: next.pricing_default_avantages,
          })
          .eq("user_id", userIdRef.current!)
        if (upErr) {
          setSaveState("error")
          setError(upErr.message)
        } else {
          setSaveState("saved")
          setError(null)
          // Fade the "saved" badge after 2 seconds.
          window.setTimeout(() => setSaveState("idle"), 2000)
        }
      }, 800)
    },
    [sb],
  )

  // Convenience updater that schedules a save automatically.
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

  return (
    <main style={{
      minHeight: "calc(100vh - 60px)",
      padding: "40px 24px 80px",
      maxWidth: 880, margin: "0 auto",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 26 }}>
        <Link href="/workspace" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 13, color: "#7C63C8", textDecoration: "none", marginBottom: 18,
        }}>← Retour au workspace</Link>
        <span style={{
          display: "inline-block",
          fontSize: 11, fontWeight: 700, color: "#7C63C8",
          background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.18)",
          padding: "4px 11px", borderRadius: 100,
          letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12,
        }}>
          ⚙ Paramètres pricing
        </span>
        <h1 style={{ margin: 0, fontSize: "clamp(24px, 3vw, 30px)", fontWeight: 800, color: "#111827", letterSpacing: "-0.025em", lineHeight: 1.15 }}>
          Réglages du chiffrage de votre cabinet
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "#6B7280", lineHeight: 1.6, maxWidth: 600 }}>
          Ces valeurs alimentent par défaut chaque chiffrage candidat sur la fiche match.
          Vous pourrez toujours les ajuster mission par mission.
        </p>

        {/* Save indicator */}
        <SaveBadge state={saveState} error={error} />
      </div>

      {/* Section 1 — Seuils de marge */}
      <Section title="Seuils de marge" icon="📊">
        <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#6B7280", lineHeight: 1.55 }}>
          Les jours travaillés mois par mois sont calculés depuis le <strong>vrai calendrier
          français</strong> (Lun-Ven hors fériés) — plus besoin d&apos;une valeur théorique
          mensuelle. Le chart marge mensuelle reflète directement les creux d&apos;août et les
          pics d&apos;octobre.
        </p>

        <Row>
          <Field label="Marge minimum acceptable" hint="En dessous, refus du chiffrage">
            <NumberInput
              value={form.pricing_margin_min_pct}
              onChange={(v) => update("pricing_margin_min_pct", v)}
              min={0} max={100} step={0.5}
              suffix="%"
            />
          </Field>
          <Field label="Marge cible standard" hint="L'objectif visé par le cabinet">
            <NumberInput
              value={form.pricing_margin_target_pct}
              onChange={(v) => update("pricing_margin_target_pct", v)}
              min={0} max={100} step={0.5}
              suffix="%"
            />
          </Field>
        </Row>
      </Section>

      {/* Section 2 — Mission par défaut */}
      <Section title="Modalité par défaut" icon="📐">
        <Field
          label="Modalité Syntec par défaut"
          hint="La modalité 3 (forfait jours) impose un minimum +20% (cadres autonomes uniquement). Le lieu, lui, se renseigne sur chaque mission individuellement."
        >
          <Select
            value={form.pricing_default_modalite}
            onChange={(v) => update("pricing_default_modalite", v as Modalite)}
            options={Object.entries(MODALITE_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </Field>
      </Section>

      {/* Section 4 — Avantages par défaut */}
      <Section title="Avantages par défaut" icon="🎁">
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#6B7280", lineHeight: 1.55 }}>
          Ces avantages s&apos;ajouteront au coût employeur. Sur chaque chiffrage, vous pourrez les
          ajuster individuellement.
        </p>

        <AvantageRow
          label="Tickets restaurant (€/jour travaillé)"
          hint="Part employeur par jour. Plafond URSSAF 2026 ≈ 7,18 € (60% × 11,97 €). Variable selon les jours réels du mois."
        enabled={(form.pricing_default_avantages.ticketsResto ?? 0) > 0}
        onToggle={(on) => updateAvantage("ticketsResto", on ? 6 : 0)}
        value={form.pricing_default_avantages.ticketsResto ?? 0}
        onValueChange={(v) => updateAvantage("ticketsResto", v)}
        suffix="€/jour"
        />

        <AvantageRow
          label="Mutuelle premium"
          hint="Part employeur au-delà du minimum légal (50%)"
          enabled={(form.pricing_default_avantages.mutuellePremium ?? 0) > 0}
          onToggle={(on) => updateAvantage("mutuellePremium", on ? 45 : 0)}
          value={form.pricing_default_avantages.mutuellePremium ?? 0}
          onValueChange={(v) => updateAvantage("mutuellePremium", v)}
          suffix="€/mois"
        />

        <AvantageRow
          label="Transport"
          hint="Remboursement 50% Navigo / TCL (obligatoire si pris en charge)"
          enabled={(form.pricing_default_avantages.transport ?? 0) > 0}
          onToggle={(on) => updateAvantage("transport", on ? 42 : 0)}
          value={form.pricing_default_avantages.transport ?? 0}
          onValueChange={(v) => updateAvantage("transport", v)}
          suffix="€/mois"
        />

        <AvantageRow
          label="Forfait mobilité durable"
          hint="Vélo, covoiturage, trottinette électrique — exo jusqu'à 700 €/an"
          enabled={(form.pricing_default_avantages.forfaitMobilite ?? 0) > 0}
          onToggle={(on) => updateAvantage("forfaitMobilite", on ? 30 : 0)}
          value={form.pricing_default_avantages.forfaitMobilite ?? 0}
          onValueChange={(v) => updateAvantage("forfaitMobilite", v)}
          suffix="€/mois"
        />

        <AvantageRow
          label="Indemnité URSSAF (grand déplacement)"
          hint="€/jour travaillé. Plafonds 2026 : Paris+PC 117,10 €/j · autres zones 97,90 €/j"
          enabled={(form.pricing_default_avantages.urssafIndemniteJour ?? 0) > 0}
          onToggle={(on) => updateAvantage("urssafIndemniteJour", on ? 97.90 : 0)}
          value={form.pricing_default_avantages.urssafIndemniteJour ?? 0}
          onValueChange={(v) => updateAvantage("urssafIndemniteJour", v)}
          suffix="€/jour"
        />

        <AvantageRow
          label="Médecine du travail (obligatoire)"
          hint="Cotisation annuelle au Service de Santé au Travail. Coût typique 80-150 €/an/salarié"
          enabled={(form.pricing_default_avantages.medecineDuTravailAnnuel ?? 0) > 0}
          onToggle={(on) => updateAvantage("medecineDuTravailAnnuel", on ? 100 : 0)}
          value={form.pricing_default_avantages.medecineDuTravailAnnuel ?? 0}
          onValueChange={(v) => updateAvantage("medecineDuTravailAnnuel", v)}
          suffix="€/an"
        />

        <AvantageRow
          label="Indemnité kilométrique (annuelle estimée)"
          hint="Si véhicule perso pour déplacements pro. Barème URSSAF 2026 dans la page Pricing"
          enabled={(form.pricing_default_avantages.indemniteKilometriqueAnnuelle ?? 0) > 0}
          onToggle={(on) => updateAvantage("indemniteKilometriqueAnnuelle", on ? 1200 : 0)}
          value={form.pricing_default_avantages.indemniteKilometriqueAnnuelle ?? 0}
          onValueChange={(v) => updateAvantage("indemniteKilometriqueAnnuelle", v)}
          suffix="€/an"
        />

        <AvantageRow
          label="Indemnité d'expatriation (mensuelle)"
          hint="Si mission expatrié. Calcul simplifié V1 — à valider expert paie pour conventions bilatérales et CFE"
          enabled={(form.pricing_default_avantages.expatriationMensuelle ?? 0) > 0}
          onToggle={(on) => updateAvantage("expatriationMensuelle", on ? 2000 : 0)}
          value={form.pricing_default_avantages.expatriationMensuelle ?? 0}
          onValueChange={(v) => updateAvantage("expatriationMensuelle", v)}
          suffix="€/mois"
        />

        <AvantageRow
          label="13ᵉ mois"
          hint="Non obligatoire Syntec, mais ~60% des ESN le pratiquent"
          enabled={form.pricing_default_avantages.treiziemeMois === true}
          onToggle={(on) => updateAvantage("treiziemeMois", on)}
          valueLocked
          lockedLabel="= 1 mois de brut / 12"
        />

        <AvantageRow
          label="Autres avantages"
          hint="Champ libre pour tout ce qui n'est pas listé"
          enabled={(form.pricing_default_avantages.autresMensuels ?? 0) > 0}
          onToggle={(on) => updateAvantage("autresMensuels", on ? 50 : 0)}
          value={form.pricing_default_avantages.autresMensuels ?? 0}
          onValueChange={(v) => updateAvantage("autresMensuels", v)}
          suffix="€/mois"
        />
      </Section>

      <p style={{
        marginTop: 28, fontSize: 11.5, color: "#9CA3AF", lineHeight: 1.6, textAlign: "center",
      }}>
        Convention collective : <strong>Syntec IDCC 1486</strong>, avenant salaires du 27 novembre 2025
        (applicable depuis le 1ᵉʳ janvier 2026).
      </p>
    </main>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Layout helpers
 * ────────────────────────────────────────────────────────────────────────── */

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <m.section
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      style={{
        background: "white", borderRadius: 16, border: "1px solid #F0ECF8",
        padding: 22, marginBottom: 14,
      }}
    >
      <h2 style={{
        margin: "0 0 16px", fontSize: 13, fontWeight: 700, color: "#7C63C8",
        letterSpacing: "0.06em", textTransform: "uppercase",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {children}
      </div>
    </m.section>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {children}
    </div>
  )
}

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

/* ──────────────────────────────────────────────────────────────────────────
 * Form widgets
 * ────────────────────────────────────────────────────────────────────────── */

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
          if (Number.isFinite(n)) onChange(n)
        }}
        style={inputInnerStyle}
      />
      <span style={{ fontSize: 12.5, color: "#9CA3AF", paddingRight: 12 }}>{suffix}</span>
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
        ...inputBoxStyle, padding: "9px 12px", fontSize: 13.5, color: "#111827",
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
  label, hint, enabled, onToggle, value, onValueChange, suffix, valueLocked, lockedLabel,
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
}) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center",
      padding: "10px 0", borderBottom: "1px solid #F4F1FB",
    }}>
      <Checkbox checked={enabled} onChange={onToggle} />
      <div>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827" }}>{label}</p>
        {hint && <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#9CA3AF", lineHeight: 1.5 }}>{hint}</p>}
      </div>
      {valueLocked ? (
        <span style={{ fontSize: 12, color: "#9CA3AF", whiteSpace: "nowrap" }}>{lockedLabel}</span>
      ) : (
        <div style={{ width: 160 }}>
          <div style={inputBoxStyle}>
            <input
              type="number"
              value={value ?? 0}
              disabled={!enabled}
              onChange={(e) => onValueChange?.(Number(e.target.value))}
              style={{ ...inputInnerStyle, color: enabled ? "#111827" : "#9CA3AF" }}
              min={0} step={1}
            />
            <span style={{ fontSize: 11.5, color: "#9CA3AF", paddingRight: 10 }}>{suffix}</span>
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

function SaveBadge({ state, error }: { state: "idle" | "saving" | "saved" | "error"; error: string | null }) {
  if (state === "idle") return null
  const style: React.CSSProperties = {
    marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6,
    fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 100,
  }
  if (state === "saving") {
    return (
      <div style={{ ...style, background: "#F3F4F6", color: "#6B7280" }}>
        Enregistrement…
      </div>
    )
  }
  if (state === "saved") {
    return (
      <div style={{ ...style, background: "rgba(34,197,94,0.10)", color: "#16a34a", border: "1px solid rgba(34,197,94,0.22)" }}>
        ✓ Enregistré
      </div>
    )
  }
  return (
    <div style={{ ...style, background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA" }}>
      ⚠ Erreur : {error ?? "réessayer"}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Reused input styles
 * ────────────────────────────────────────────────────────────────────────── */

const inputBoxStyle: React.CSSProperties = {
  display: "flex", alignItems: "center",
  background: "#FAFAFA", border: "1px solid #E5E7EB", borderRadius: 9,
  overflow: "hidden",
}

const inputInnerStyle: React.CSSProperties = {
  flex: 1, padding: "9px 12px",
  fontSize: 13.5, color: "#111827",
  background: "transparent", border: "none", outline: "none",
  fontFamily: "inherit", minWidth: 0, width: "100%",
}
