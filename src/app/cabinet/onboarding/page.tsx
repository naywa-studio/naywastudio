"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { LazyMotion, domAnimation, m } from "framer-motion"
import { useCabinet } from "../layout"
import { TRIAL_DURATION_DAYS } from "@/lib/trial"

/**
 * /cabinet/onboarding
 *
 * Two-step flow shown to the owner the first time they reach the
 * cabinet console. Once finished (either by activating the trial OR
 * skipping it), `cabinet_onboarded_at` is stamped on the org and the
 * redirect from /cabinet stops firing.
 *
 * Members never reach this route — the cabinet layout redirects them
 * straight to /cabinet if they wander in.
 *
 * Step 1 : pick a cabinet name (pre-filled with the auto-generated
 *          "Cabinet de {first_name}" placeholder).
 * Step 2 : present the Package Sourcing offer. Activate, or skip and
 *          activate later from the dashboard.
 */

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const PACKAGE_FEATURES = [
  "Vivier illimité — upload PDF, OCR + parsing IA",
  "Clustering Nora — vos candidats rangés en zones métier",
  "Matching IA contre vos missions avec score justifié",
  "Anonymisation PDF en 1 clic",
  "Pipeline candidat + suivi des interviews Calendly",
  "Pricing Syntec automatisé + export PDF",
]

export default function OnboardingPage() {
  const router = useRouter()
  const { profile, organization, isOwner, refetch } = useCabinet()

  const [step, setStep] = useState<1 | 2>(1)
  const [cabinetName, setCabinetName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Owner-only route. Bounce members back to /cabinet.
  useEffect(() => {
    if (!isOwner) router.replace("/cabinet")
  }, [isOwner, router])

  // Bail out if the owner already finished onboarding (e.g. browser
  // history landing). Avoids re-running activation by accident.
  useEffect(() => {
    if (organization?.cabinet_onboarded_at) {
      router.replace("/cabinet")
    }
  }, [organization?.cabinet_onboarded_at, router])

  // Seed the cabinet name with whatever the trigger generated.
  useEffect(() => {
    if (cabinetName === "" && organization?.name) {
      setCabinetName(organization.name)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.name])

  const greetingName = useMemo(() => {
    const first = profile?.first_name?.trim()
    return first ? first : ""
  }, [profile?.first_name])

  const finishStep1 = () => {
    setError(null)
    if (!cabinetName.trim()) {
      setError("Donnez un nom à votre cabinet pour continuer.")
      return
    }
    setStep(2)
  }

  const finalize = async (opts: { activateTrial: boolean }) => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      // 1. Persist the cabinet name and stamp onboarding done.
      const res = await fetch("/api/cabinet/onboarding-done", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cabinetName: cabinetName.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Onboarding impossible")
      }

      // 2. Optional trial activation.
      if (opts.activateTrial) {
        const tr = await fetch("/api/cabinet/activate-trial", { method: "POST" })
        if (!tr.ok) {
          const body = await tr.json().catch(() => ({}))
          throw new Error(body.error ?? "Activation impossible")
        }
      }

      await refetch()
      router.replace("/cabinet")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue")
      setSubmitting(false)
    }
  }

  return (
    <LazyMotion features={domAnimation}>
      <div
        style={{
          minHeight: "calc(100vh - 60px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 20px",
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        <m.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          style={{
            width: "100%",
            maxWidth: 620,
            background: "white",
            borderRadius: 24,
            border: "1px solid #F0ECF8",
            boxShadow: "0 24px 64px -24px rgba(17,24,39,0.18)",
            padding: "40px 36px 32px",
          }}
        >
          {/* Step indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
            <StepDot active={step >= 1} done={step > 1} />
            <div style={{ flex: 1, height: 1, background: step > 1 ? "#7C63C8" : "#E2DAF6" }} />
            <StepDot active={step >= 2} done={false} />
          </div>

          {/* STEP 1 — Cabinet name */}
          {step === 1 && (
            <m.div
              key="step-1"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
            >
              <h1 style={{
                margin: "0 0 8px",
                fontSize: 24,
                fontWeight: 700,
                color: "#111827",
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
              }}>
                {greetingName ? `Bienvenue ${greetingName}` : "Bienvenue"} sur Naywa
              </h1>
              <p style={{
                margin: "0 0 28px",
                fontSize: 14.5,
                color: "#4B5563",
                lineHeight: 1.65,
              }}>
                Commencez par donner un nom à votre cabinet. Ce nom sera
                visible par vos collègues, et apparaîtra sur les documents
                que vous générez (PDF anonymisé, fiche pricing…).
              </p>

              <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#374151",
                  letterSpacing: "0.01em",
                }}>
                  Nom du cabinet
                </span>
                <input
                  type="text"
                  value={cabinetName}
                  onChange={(e) => setCabinetName(e.target.value)}
                  placeholder="Cabinet Dupont"
                  maxLength={120}
                  autoFocus
                  style={{
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: "1px solid #E2DAF6",
                    background: "white",
                    fontSize: 15,
                    color: "#111827",
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
                <span style={{ fontSize: 11.5, color: "#9CA3AF" }}>
                  Vous pourrez le modifier à tout moment depuis votre console.
                </span>
              </label>

              {error && (
                <ErrorBox text={error} />
              )}

              <button
                onClick={finishStep1}
                style={primaryBtn(false)}
              >
                Continuer
              </button>
            </m.div>
          )}

          {/* STEP 2 — Package Sourcing */}
          {step === 2 && (
            <m.div
              key="step-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
            >
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#7C63C8",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
              }}>
                Choisissez un package
              </span>
              <h1 style={{
                margin: "10px 0 8px",
                fontSize: 24,
                fontWeight: 700,
                color: "#111827",
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
              }}>
                Package Sourcing —{" "}
                <span style={{
                  fontFamily: "var(--font-instrument-serif), serif",
                  fontWeight: 400,
                  fontStyle: "italic",
                  color: "#7C63C8",
                }}>
                  15 jours offerts
                </span>
              </h1>
              <p style={{
                margin: "0 0 24px",
                fontSize: 14.5,
                color: "#4B5563",
                lineHeight: 1.65,
              }}>
                Tout le workspace Nora pour votre cabinet : vivier illimité,
                missions, matching, anonymisation, pricing.{" "}
                <strong style={{ color: "#111827" }}>Aucune carte requise</strong>{" "}
                pour démarrer l&apos;essai.
              </p>

              {/* Package card */}
              <div style={{
                background: "linear-gradient(165deg, #F8F6FF 0%, #F0ECF8 100%)",
                border: "1px solid #E2DAF6",
                borderRadius: 16,
                padding: "22px 22px 24px",
                marginBottom: 24,
              }}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  marginBottom: 16,
                }}>
                  <div>
                    <p style={{
                      margin: "0 0 4px",
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#111827",
                      letterSpacing: "-0.01em",
                    }}>
                      Package Sourcing
                    </p>
                    <p style={{
                      margin: 0,
                      fontSize: 12,
                      color: "#7C63C8",
                      fontWeight: 600,
                    }}>
                      Nora — l&apos;assistante IA du sourceur
                    </p>
                  </div>
                  <span style={{
                    background: "white",
                    border: "1px solid rgba(124,99,200,0.30)",
                    color: "#7C63C8",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "5px 10px",
                    borderRadius: 999,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}>
                    Essai gratuit {TRIAL_DURATION_DAYS} j
                  </span>
                </div>

                <ul style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  display: "grid",
                  gap: 9,
                }}>
                  {PACKAGE_FEATURES.map((feat) => (
                    <li key={feat} style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      fontSize: 13.5,
                      color: "#374151",
                      lineHeight: 1.5,
                    }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C63C8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 3 }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {error && <ErrorBox text={error} />}

              <button
                onClick={() => finalize({ activateTrial: true })}
                disabled={submitting}
                style={primaryBtn(submitting)}
              >
                {submitting ? "Activation en cours…" : `Activer mes ${TRIAL_DURATION_DAYS} jours gratuits`}
              </button>

              <button
                onClick={() => finalize({ activateTrial: false })}
                disabled={submitting}
                style={{
                  width: "100%",
                  marginTop: 10,
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "1px solid transparent",
                  background: "transparent",
                  color: "#6B7280",
                  fontSize: 13.5,
                  fontWeight: 500,
                  cursor: submitting ? "wait" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                Continuer sans activer pour l&apos;instant
              </button>

              <p style={{
                margin: "16px 0 0",
                fontSize: 11.5,
                color: "#9CA3AF",
                textAlign: "center",
                lineHeight: 1.5,
              }}>
                Vous pourrez activer ou réactiver l&apos;essai à tout moment depuis votre console.
              </p>
            </m.div>
          )}
        </m.div>
      </div>
    </LazyMotion>
  )
}

/* ─────────────── small inline helpers ─────────────── */

function StepDot({ active, done }: { active: boolean; done: boolean }) {
  const bg = done
    ? "#7C63C8"
    : active
    ? "white"
    : "white"
  const border = done || active ? "#7C63C8" : "#E2DAF6"
  return (
    <span
      aria-hidden
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: bg,
        border: `2px solid ${border}`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {done && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </span>
  )
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div style={{
      marginTop: 14,
      background: "rgba(239,68,68,0.08)",
      border: "1px solid rgba(239,68,68,0.25)",
      color: "#B91C1C",
      borderRadius: 10,
      padding: "10px 12px",
      fontSize: 13,
      fontWeight: 500,
    }}>
      {text}
    </div>
  )
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    marginTop: 22,
    padding: "14px 24px",
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
    color: "white",
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "-0.005em",
    cursor: disabled ? "wait" : "pointer",
    opacity: disabled ? 0.7 : 1,
    boxShadow: "0 8px 24px -6px rgba(124,99,200,0.55)",
    fontFamily: "inherit",
  }
}
