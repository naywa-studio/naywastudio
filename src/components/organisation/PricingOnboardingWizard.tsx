"use client"

/**
 * PricingOnboardingWizard — modal 4 étapes qui apparaît une fois pour
 * l'owner après qu'il a souscrit (ou activé son trial). Objectif : lui
 * éviter de tomber d'un coup sur /organisation/parametrage qui est
 * verbeux. On lui pose juste les questions nécessaires :
 *
 *   1. Welcome (1 écran)
 *   2. Seuils de marge (mini + cible)
 *   3. RTT accordés par an
 *   4. Avantages essentiels (mutuelle + transport + tickets resto)
 *
 * Au submit final → PATCH /api/cabinet avec les valeurs + stamp
 * pricing_onboarded_at. La modale disparait et le bandeau "Politique
 * pricing pas encore configurée" sur /workspace/pricing aussi.
 *
 * On peut "Plus tard" : ferme la modale sans stamper, elle reviendra
 * à la prochaine visite tant que pricing_onboarded_at est NULL.
 */

import { useState } from "react"
import { m, AnimatePresence } from "framer-motion"
import type { PricingDefaultAvantages } from "@/lib/database.types"
import { useEscapeKey } from "@/components/ui/useEscapeKey"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

interface Props {
  open: boolean
  /** Valeurs initiales depuis l'organisation (peuvent être null si pas
   *  encore touchées — on retombe sur les defaults raisonnables). */
  initial: {
    margeMin: number | null
    margeTarget: number | null
    rttDays: number | null
    avantages: PricingDefaultAvantages | null
  }
  onClose: () => void
  /** Appelé après PATCH OK. Le parent re-fetch l'org pour refresh l'UI. */
  onDone: () => void | Promise<void>
}

/** Defaults raisonnables si l'org n'a rien réglé encore. */
const DEFAULTS = {
  margeMin: 15,
  margeTarget: 22,
  rttDays: 0,
  mutuelle: 50,
  transport: 43,
  ticketsResto: 6,
}

export function PricingOnboardingWizard({ open, initial, onClose, onDone }: Props) {
  useEscapeKey(onClose, open)
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initAv = initial.avantages ?? ({} as PricingDefaultAvantages)
  const [margeMin, setMargeMin] = useState<number>(initial.margeMin ?? DEFAULTS.margeMin)
  const [margeTarget, setMargeTarget] = useState<number>(initial.margeTarget ?? DEFAULTS.margeTarget)
  const [rttDays, setRttDays] = useState<number>(initial.rttDays ?? DEFAULTS.rttDays)
  const [mutuelle, setMutuelle] = useState<number>(initAv.mutuellePremium ?? DEFAULTS.mutuelle)
  const [transport, setTransport] = useState<number>(initAv.transport ?? DEFAULTS.transport)
  const [ticketsResto, setTicketsResto] = useState<number>(initAv.ticketsResto ?? DEFAULTS.ticketsResto)

  const margesInvalid = margeTarget < margeMin

  const next = () => setStep((s) => Math.min(4, s + 1))
  const prev = () => setStep((s) => Math.max(1, s - 1))

  const submit = async () => {
    if (busy || margesInvalid) return
    setBusy(true); setError(null)
    try {
      // PATCH cabinet + stamp pricing_onboarded_at en un seul call.
      const res = await fetch("/api/cabinet", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pricing_margin_min_pct: margeMin,
          pricing_margin_target_pct: margeTarget,
          pricing_rtt_days_per_year: rttDays,
          pricing_default_avantages: {
            ...initAv,
            mutuellePremium: mutuelle,
            transport,
            ticketsResto,
          },
          pricing_onboarded_at: new Date().toISOString(),
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(j.error ?? "Erreur lors de l'enregistrement")
      }
      await onDone()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur")
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(17,24,39,0.40)",
        backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        fontFamily: "var(--font-inter), sans-serif",
      }}
    >
      <m.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        style={{
          background: "white",
          borderRadius: 20,
          width: "100%", maxWidth: 540,
          boxShadow: "0 24px 64px -24px rgba(17,24,39,0.30)",
          overflow: "hidden",
        }}
      >
        {/* Header avec progression */}
        <div style={{
          padding: "20px 28px 14px",
          borderBottom: "1px solid #F0ECF8",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {[1, 2, 3, 4].map((n) => (
              <span
                key={n}
                style={{
                  width: n === step ? 22 : 8,
                  height: 8,
                  borderRadius: 100,
                  background: n <= step ? "#7C63C8" : "#E2DAF6",
                  transition: "all 240ms ease",
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontSize: 12, fontWeight: 600, color: "#6B7280",
              background: "transparent", border: "none", cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Plus tard
          </button>
        </div>

        {/* Contenu animé */}
        <div style={{ padding: "26px 28px 0", minHeight: 280 }}>
          <AnimatePresence mode="wait">
            {step === 1 && (
              <StepWrapper key="s1">
                <h2 style={titleStyle}>
                  Configurons votre <span style={italicStyle}>politique pricing</span>.
                </h2>
                <p style={leadStyle}>
                  Une minute pour régler vos marges et avantages standards.
                  Vos chiffrages futurs s&apos;appuieront sur ces valeurs.
                  Tout reste modifiable plus tard depuis la console.
                </p>
                <ul style={listStyle}>
                  <li>Seuils de marge (mini + cible)</li>
                  <li>RTT que vous accordez</li>
                  <li>Mutuelle, transport, tickets resto</li>
                </ul>
              </StepWrapper>
            )}

            {step === 2 && (
              <StepWrapper key="s2">
                <h2 style={titleStyle}>Seuils de marge</h2>
                <p style={leadStyle}>Plancher et objectif de rentabilité pour vos chiffrages.</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 18 }}>
                  <FieldNum
                    label="Marge minimum acceptable"
                    hint="En dessous, refus du chiffrage"
                    value={margeMin}
                    onChange={setMargeMin}
                    min={0} max={50} step={0.5} suffix="%"
                  />
                  <FieldNum
                    label="Marge cible"
                    hint="Objectif visé"
                    value={margeTarget}
                    onChange={setMargeTarget}
                    min={0} max={50} step={0.5} suffix="%"
                  />
                </div>
                {margesInvalid && (
                  <p style={errorBoxStyle}>
                    La marge cible doit être supérieure ou égale à la marge mini.
                  </p>
                )}
              </StepWrapper>
            )}

            {step === 3 && (
              <StepWrapper key="s3">
                <h2 style={titleStyle}>RTT accordés</h2>
                <p style={leadStyle}>
                  Jours rémunérés non facturables. 0 si vous n&apos;accordez pas de RTT.
                </p>
                <div style={{ marginTop: 18, maxWidth: 240 }}>
                  <FieldNum
                    label="RTT par an et par salarié"
                    value={rttDays}
                    onChange={setRttDays}
                    min={0} max={25} step={1} suffix="j/an"
                  />
                </div>
              </StepWrapper>
            )}

            {step === 4 && (
              <StepWrapper key="s4">
                <h2 style={titleStyle}>Avantages essentiels</h2>
                <p style={leadStyle}>
                  Les avantages standards que vous proposez à vos salariés.
                  Vous pourrez ajouter les autres plus tard.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                  <FieldNum
                    label="Mutuelle (part employeur)"
                    value={mutuelle}
                    onChange={setMutuelle}
                    min={0} max={200} step={5} suffix="€/mois"
                  />
                  <FieldNum
                    label="Transport (50 % abonnement)"
                    value={transport}
                    onChange={setTransport}
                    min={0} max={200} step={1} suffix="€/mois"
                  />
                  <FieldNum
                    label="Tickets resto (part employeur)"
                    value={ticketsResto}
                    onChange={setTicketsResto}
                    min={0} max={15} step={0.5} suffix="€/jour"
                  />
                </div>
              </StepWrapper>
            )}
          </AnimatePresence>
        </div>

        {error && (
          <p style={{ ...errorBoxStyle, margin: "12px 28px 0" }}>{error}</p>
        )}

        {/* Footer actions */}
        <div style={{
          marginTop: 24,
          padding: "16px 28px 24px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 12,
        }}>
          {step > 1 ? (
            <button
              type="button"
              onClick={prev}
              disabled={busy}
              style={ghostBtnStyle}
            >
              ← Retour
            </button>
          ) : <span />}

          {step < 4 ? (
            <button
              type="button"
              onClick={next}
              disabled={step === 2 && margesInvalid}
              style={{
                ...primaryBtnStyle,
                opacity: step === 2 && margesInvalid ? 0.5 : 1,
                cursor: step === 2 && margesInvalid ? "not-allowed" : "pointer",
              }}
            >
              {step === 1 ? "C'est parti →" : "Suivant →"}
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              style={{
                ...primaryBtnStyle,
                opacity: busy ? 0.6 : 1,
                cursor: busy ? "default" : "pointer",
              }}
            >
              {busy ? "Enregistrement…" : "✓ Valider ma politique"}
            </button>
          )}
        </div>
      </m.div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────── */

function StepWrapper({ children }: { children: React.ReactNode }) {
  return (
    <m.div
      initial={{ opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -14 }}
      transition={{ duration: 0.28, ease: EASE }}
    >
      {children}
    </m.div>
  )
}

function FieldNum({
  label, hint, value, onChange, min, max, step, suffix,
}: {
  label: string
  hint?: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  suffix: string
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#374151" }}>{label}</span>
      {hint && <span style={{ fontSize: 11, color: "#6B7280" }}>{hint}</span>}
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
            if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)))
          }}
          style={{
            flex: 1, padding: "9px 12px",
            fontSize: 13, color: "#111827",
            background: "transparent", border: "none", outline: "none",
            fontFamily: "inherit", minWidth: 0, width: "100%",
          }}
        />
        <span style={{ fontSize: 12, color: "#6B7280", paddingRight: 12 }}>{suffix}</span>
      </div>
    </label>
  )
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 22, fontWeight: 800, color: "#111827",
  letterSpacing: "-0.02em", lineHeight: 1.2,
  fontFamily: "var(--font-space-grotesk), sans-serif",
}

const italicStyle: React.CSSProperties = {
  fontFamily: "var(--font-instrument-serif), serif",
  fontStyle: "italic", fontWeight: 400,
  color: "#7C63C8",
}

const leadStyle: React.CSSProperties = {
  margin: "8px 0 0",
  fontSize: 13.5, color: "#6B7280", lineHeight: 1.6,
}

const listStyle: React.CSSProperties = {
  margin: "16px 0 0", paddingLeft: 18,
  fontSize: 13, color: "#374151", lineHeight: 1.7,
}

const primaryBtnStyle: React.CSSProperties = {
  padding: "10px 18px", borderRadius: 10,
  background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
  color: "white", fontSize: 13, fontWeight: 700,
  border: "none", cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 6px 18px -8px rgba(124,99,200,0.55)",
}

const ghostBtnStyle: React.CSSProperties = {
  padding: "10px 16px", borderRadius: 10,
  background: "white", color: "#6B7280",
  fontSize: 12.5, fontWeight: 600,
  border: "1px solid #E5E7EB", cursor: "pointer",
  fontFamily: "inherit",
}

const errorBoxStyle: React.CSSProperties = {
  margin: "14px 0 0",
  padding: "9px 12px", fontSize: 12.5, color: "#B91C1C",
  background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.25)",
  borderRadius: 9, lineHeight: 1.5,
}
