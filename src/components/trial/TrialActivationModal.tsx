"use client"

import { useState } from "react"
import { LazyMotion, domAnimation, m } from "framer-motion"
import { TRIAL_DURATION_DAYS } from "@/lib/trial"

/**
 * Modal shown to the cabinet owner the first time they visit /cabinet
 * after signup. Single CTA : activate the 15-day trial.
 *
 * The member never sees this : they wait for their owner to flip the
 * switch. Decisions about trials and billing live with the owner.
 */

interface Props {
  open: boolean
  onActivated: (trialEndsAt: string) => void
  onError?: (message: string) => void
}

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

export function TrialActivationModal({ open, onActivated, onError }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  if (!open) return null

  const activate = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/cabinet/activate-trial", { method: "POST" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body.error ?? "Activation impossible")
      }
      onActivated(body.trialEndsAt as string)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue"
      setError(msg)
      onError?.(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: EASE }}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(17,24,39,0.40)",
          backdropFilter: "blur(2px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          zIndex: 80,
        }}
      >
        <m.div
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: EASE }}
          role="dialog"
          aria-modal="true"
          style={{
            background: "white",
            borderRadius: 24,
            padding: "40px 36px 32px",
            maxWidth: 460,
            width: "100%",
            border: "1px solid #F0ECF8",
            boxShadow: "0 30px 80px -20px rgba(17,24,39,0.30)",
            fontFamily: "var(--font-inter), sans-serif",
            position: "relative",
          }}
        >
          <div
            aria-hidden
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "linear-gradient(135deg, #7C63C8 0%, #B8AEDE 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 22,
              boxShadow: "0 8px 24px -6px rgba(124,99,200,0.45)",
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15 14" />
            </svg>
          </div>

          <h2 style={{
            margin: "0 0 8px",
            fontSize: 22,
            fontWeight: 700,
            color: "#111827",
            letterSpacing: "-0.015em",
            lineHeight: 1.2,
          }}>
            Bienvenue dans Naywa Studio
          </h2>

          <p style={{
            margin: "0 0 24px",
            fontSize: 14.5,
            color: "#4B5563",
            lineHeight: 1.65,
          }}>
            Activez votre <strong style={{ color: "#7C63C8" }}>essai gratuit de {TRIAL_DURATION_DAYS} jours</strong> pour
            tester le workspace complet : vivier, missions, matching, anonymisation et pricing.
            Aucune carte n&apos;est demandée — vous prolongez ou non à la fin de l&apos;essai.
          </p>

          <ul style={{
            margin: "0 0 28px",
            padding: 0,
            listStyle: "none",
            display: "grid",
            gap: 10,
          }}>
            {[
              "Vivier illimité — upload, parsing IA, clustering automatique",
              "Missions, matching, anonymisation, pricing Syntec",
              "Toute l'équipe du cabinet incluse",
              "Aucune carte requise pour démarrer",
            ].map((label) => (
              <li key={label} style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                fontSize: 13.5,
                color: "#374151",
                lineHeight: 1.55,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C63C8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{label}</span>
              </li>
            ))}
          </ul>

          {error && (
            <div style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              color: "#B91C1C",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 13,
              marginBottom: 14,
              fontWeight: 500,
            }}>
              {error}
            </div>
          )}

          <button
            onClick={activate}
            disabled={submitting}
            style={{
              width: "100%",
              padding: "14px 24px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
              color: "white",
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "-0.005em",
              cursor: submitting ? "wait" : "pointer",
              opacity: submitting ? 0.7 : 1,
              boxShadow: "0 8px 24px -6px rgba(124,99,200,0.55)",
              transition: "transform 150ms ease",
              fontFamily: "inherit",
            }}
            onMouseEnter={(e) => {
              if (!submitting) e.currentTarget.style.transform = "translateY(-1px)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)"
            }}
          >
            {submitting ? "Activation en cours…" : `Activer mes ${TRIAL_DURATION_DAYS} jours gratuits`}
          </button>

          <p style={{
            margin: "16px 0 0",
            fontSize: 11.5,
            color: "#9CA3AF",
            textAlign: "center",
            lineHeight: 1.5,
          }}>
            Cet essai n&apos;est pas reconductible. À la fin, vous resterez libre d&apos;accéder à votre cabinet,
            mais nous vous proposerons un abonnement adapté à votre équipe.
          </p>
        </m.div>
      </m.div>
    </LazyMotion>
  )
}
