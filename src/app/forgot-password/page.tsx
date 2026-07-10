"use client"

/**
 * /forgot-password — saisie de l'email pour déclencher un mail de
 * réinitialisation. Supabase envoie via Resend (SMTP configuré côté
 * Supabase Auth → Templates → Reset Password). Le lien magique
 * renvoie sur /reset-password où l'utilisateur saisit son nouveau MDP.
 *
 * Pas d'auth requise — c'est précisément le but. La page reste
 * accessible si l'utilisateur est déjà connecté (rare cas où il
 * veut juste changer son MDP sans connaître l'ancien).
 */

import { useState } from "react"
import Link from "next/link"
import { Logo } from "@/components/ui/Logo"
import { getSupabase } from "@/lib/supabase"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    try {
      const { error: err } = await getSupabase().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (err) throw err
      setSent(true)
    } catch (err: unknown) {
      // Volontairement vague : on ne dit pas "email non trouvé" pour
      // éviter l'énumération des comptes — on dit toujours "si l'email
      // existe, un lien a été envoyé". Le sent state ne dépend pas
      // de l'existence du compte côté Supabase.
      setError(err instanceof Error ? err.message : "Impossible d'envoyer le lien")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#FAFAFA",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      <div style={{
        width: "100%", maxWidth: 420,
        background: "white", borderRadius: 20,
        border: "1px solid #F0ECF8",
        padding: "40px 36px",
        boxShadow: "0 8px 40px rgba(124,99,200,0.08)",
      }}>
        <div style={{ marginBottom: 24, textAlign: "center" }}>
          <Link href="/" style={{ textDecoration: "none", display: "inline-block" }}>
            <Logo size="md" />
          </Link>
        </div>

        <h1 style={{
          margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: "#111827",
          letterSpacing: "-0.01em", textAlign: "center",
          fontFamily: "var(--font-space-grotesk), sans-serif",
        }}>
          Mot de passe oublié
        </h1>
        <p style={{
          margin: "0 0 24px", fontSize: 13.5, color: "#6B7280", lineHeight: 1.6,
          textAlign: "center",
          fontFamily: "var(--font-inter), sans-serif",
        }}>
          Saisissez votre email. Si un compte existe, nous vous enverrons un lien
          pour réinitialiser votre mot de passe.
        </p>

        {sent ? (
          <div style={{
            padding: "14px 16px", borderRadius: 12,
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.25)",
            color: "#166534", fontSize: 13,
            fontFamily: "var(--font-inter), sans-serif",
            lineHeight: 1.55,
          }}>
            <strong>Email envoyé.</strong> Vérifiez votre boîte de réception
            (et le dossier spam) pour le lien de réinitialisation.
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
                required
                autoComplete="email"
                style={inputStyle}
              />
            </div>

            {error && (
              <p role="alert" aria-live="polite" style={{
                margin: 0, fontSize: 13, color: "#EF4444",
                fontFamily: "var(--font-inter), sans-serif",
              }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              style={{
                marginTop: 4,
                padding: "13px",
                borderRadius: 10,
                border: "none",
                cursor: busy ? "not-allowed" : "pointer",
                fontSize: 14,
                fontWeight: 700,
                color: "white",
                background: busy
                  ? "#C4B8E8"
                  : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                fontFamily: "var(--font-inter), sans-serif",
              }}
            >
              {busy ? "Envoi…" : "Envoyer le lien"}
            </button>
          </form>
        )}

        <p style={{
          marginTop: 22, textAlign: "center",
          fontSize: 12, color: "#6B7280",
          fontFamily: "var(--font-inter), sans-serif",
        }}>
          <Link href="/login" style={{ color: "#6B7280", textDecoration: "none" }}>
            ← Retour à la connexion
          </Link>
        </p>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: "block", marginBottom: 6,
  fontSize: 12, fontWeight: 600, color: "#374151",
  fontFamily: "var(--font-inter), sans-serif",
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px",
  borderRadius: 9, border: "1.5px solid #E5E7EB",
  fontSize: 14, color: "#111827",
  outline: "none", transition: "border-color 150ms",
  fontFamily: "var(--font-inter), sans-serif",
  boxSizing: "border-box",
}
