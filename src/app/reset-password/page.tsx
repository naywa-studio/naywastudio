"use client"

/**
 * /reset-password — page d'atterrissage du lien magique envoyé par
 * /forgot-password. Supabase Auth crée automatiquement une session
 * "recovery" quand le lien est cliqué (via le hash dans l'URL). On
 * laisse l'utilisateur saisir son nouveau mot de passe, puis on le
 * redirige vers /login.
 *
 * Si l'utilisateur arrive sans session de recovery valide (lien expiré
 * ou direct accès), on affiche un message + lien vers /forgot-password.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Logo } from "@/components/ui/Logo"
import { getSupabase } from "@/lib/supabase"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const sb = getSupabase()
      // Supabase parse le hash de l'URL automatiquement au chargement
      // de la page et crée la session si le token est valide. On attend
      // un tick puis on lit la session.
      await new Promise((r) => setTimeout(r, 100))
      const { data: { session } } = await sb.auth.getSession()
      if (cancelled) return
      setHasSession(!!session)
    })()
    return () => { cancelled = true }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (password.length < 6) {
      setError("Le mot de passe doit faire au moins 6 caractères.")
      return
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.")
      return
    }
    setBusy(true); setError(null)
    try {
      const { error: err } = await getSupabase().auth.updateUser({ password })
      if (err) throw err
      setDone(true)
      // Redirection vers /login après 2s pour que l'user reconnecte avec
      // son nouveau MDP — on déconnecte la session de recovery au passage.
      await getSupabase().auth.signOut()
      setTimeout(() => router.replace("/login"), 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Impossible de mettre à jour le mot de passe")
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
          Nouveau mot de passe
        </h1>

        {hasSession === null && (
          <p style={{
            textAlign: "center", fontSize: 13, color: "#6B7280",
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            Chargement…
          </p>
        )}

        {hasSession === false && (
          <>
            <p style={{
              margin: "0 0 16px", fontSize: 13.5, color: "#B91C1C", lineHeight: 1.6,
              textAlign: "center",
              fontFamily: "var(--font-inter), sans-serif",
            }}>
              Lien invalide ou expiré. Demandez un nouveau lien de réinitialisation.
            </p>
            <Link href="/forgot-password" style={{
              display: "block", textAlign: "center",
              padding: "11px", borderRadius: 10,
              background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
              color: "white", fontSize: 13, fontWeight: 700,
              textDecoration: "none",
              fontFamily: "var(--font-inter), sans-serif",
            }}>
              Demander un nouveau lien
            </Link>
          </>
        )}

        {hasSession === true && done && (
          <div style={{
            padding: "14px 16px", borderRadius: 12,
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.25)",
            color: "#166534", fontSize: 13,
            fontFamily: "var(--font-inter), sans-serif",
            textAlign: "center", lineHeight: 1.55,
          }}>
            <strong>Mot de passe mis à jour.</strong>
            <div style={{ marginTop: 6 }}>
              Redirection vers la connexion…
            </div>
          </div>
        )}

        {hasSession === true && !done && (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{
              margin: "0 0 4px", fontSize: 13, color: "#6B7280", lineHeight: 1.55,
              fontFamily: "var(--font-inter), sans-serif",
            }}>
              Saisissez un nouveau mot de passe pour votre compte.
            </p>
            <div>
              <label style={labelStyle}>Nouveau mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 caractères"
                required
                minLength={6}
                autoComplete="new-password"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Confirmer</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                autoComplete="new-password"
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
                fontSize: 14, fontWeight: 700, color: "white",
                background: busy
                  ? "#C4B8E8"
                  : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                fontFamily: "var(--font-inter), sans-serif",
              }}
            >
              {busy ? "Mise à jour…" : "Valider le nouveau mot de passe"}
            </button>
          </form>
        )}
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
