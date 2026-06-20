"use client"

/**
 * Bouton + modale "Contactez le support".
 *
 * Visible dans le header workspace + dropdown profil organisation.
 * Au submit, on POST /api/support — l'API attache email, org, URL,
 * user-agent automatiquement (depuis la session côté server).
 */

import { useState } from "react"
import { LazyMotion, domAnimation, m } from "framer-motion"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

export function SupportButton({ variant = "compact" }: { variant?: "compact" | "ghost" }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Contactez le support"
        style={variant === "compact" ? compactStyle : ghostStyle}
      >
        <LifebuoyIcon />
        <span>Un bug, une question ?</span>
      </button>
      {open && <SupportModal onClose={() => setOpen(false)} />}
    </>
  )
}

function SupportModal({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const submit = async () => {
    if (message.trim().length === 0) return
    setBusy(true); setError(null)
    try {
      const r = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          url: typeof window !== "undefined" ? window.location.href : "",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({} as { error?: string }))
        throw new Error(j.error ?? `Erreur ${r.status}`)
      }
      setSent(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <LazyMotion features={domAnimation}>
      <div
        role="dialog" aria-modal="true"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(17,24,39,0.40)", backdropFilter: "blur(2px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }}
      >
        <m.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          style={{
            width: "100%", maxWidth: 520,
            background: "white", borderRadius: 16, padding: 24,
            fontFamily: "var(--font-inter), sans-serif",
            boxShadow: "0 24px 64px -24px rgba(17,24,39,0.30)",
          }}
        >
          {sent ? (
            <>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#111827", letterSpacing: "-0.01em" }}>
                Message envoyé
              </h2>
              <p style={{ margin: "10px 0 18px", fontSize: 13.5, color: "#6B7280", lineHeight: 1.6 }}>
                Notre équipe vous répondra par email dans les meilleurs délais.
                Merci pour votre retour.
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "10px 16px", borderRadius: 10,
                    border: "none",
                    background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                    color: "white", fontSize: 13, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Fermer
                </button>
              </div>
            </>
          ) : (
            <>
              <header style={{ marginBottom: 14 }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#7C63C8", letterSpacing: "0.10em", textTransform: "uppercase" }}>
                  Support
                </p>
                <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800, color: "#111827", letterSpacing: "-0.01em" }}>
                  Un bug, une question ? Contactez le support
                </h2>
                <p style={{ margin: "10px 0 0", fontSize: 13, color: "#6B7280", lineHeight: 1.55 }}>
                  Décrivez ce qui vous bloque. Votre email, votre organisation
                  et la page d&apos;où vous écrivez sont automatiquement
                  transmis pour faciliter le diagnostic.
                </p>
              </header>

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Je n'arrive pas à…"
                rows={7}
                maxLength={5000}
                autoFocus
                style={{
                  width: "100%", padding: "12px 14px",
                  borderRadius: 10, border: "1.5px solid #E5E7EB",
                  fontSize: 13.5, color: "#111827", outline: "none",
                  fontFamily: "var(--font-inter), sans-serif",
                  lineHeight: 1.55, resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "#9CA3AF" }}>
                <span>Visible uniquement par notre équipe.</span>
                <span>{message.length}/5000</span>
              </div>

              {error && (
                <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "#B91C1C" }}>{error}</p>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  style={{
                    padding: "10px 16px", borderRadius: 10,
                    border: "1px solid #E5E7EB", background: "white",
                    color: "#374151", fontSize: 13, fontWeight: 600,
                    cursor: busy ? "wait" : "pointer", fontFamily: "inherit",
                  }}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy || message.trim().length === 0}
                  style={{
                    padding: "10px 18px", borderRadius: 10,
                    border: "none", color: "white",
                    background: busy || message.trim().length === 0
                      ? "#C4B6E0"
                      : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                    fontSize: 13, fontWeight: 700,
                    cursor: busy || message.trim().length === 0 ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {busy ? "Envoi…" : "Envoyer"}
                </button>
              </div>
            </>
          )}
        </m.div>
      </div>
    </LazyMotion>
  )
}

function LifebuoyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M6.3 6.3l3 3M14.7 14.7l3 3M6.3 17.7l3-3M14.7 9.3l3-3" />
    </svg>
  )
}

const compactStyle: React.CSSProperties = {
  padding: "6px 11px", borderRadius: 8,
  border: "1px solid #E5E7EB", background: "white",
  color: "#6B7280", fontSize: 12, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
  display: "inline-flex", alignItems: "center", gap: 6,
  whiteSpace: "nowrap",
}

const ghostStyle: React.CSSProperties = {
  display: "flex", width: "100%", alignItems: "center", gap: 8,
  padding: "10px 12px", borderRadius: 8,
  border: "none", background: "transparent",
  color: "#374151", fontSize: 13, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
  textAlign: "left",
}
