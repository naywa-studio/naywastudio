"use client"
import { useState } from "react"
import { m } from "framer-motion"
import { getSupabase } from "@/lib/supabase"

interface Answers {
  [key: string]: string | undefined
}

interface Props {
  answers: Answers
  agentName: string
  agentPrice: string
  onDone: () => void
  defaultMode?: "signup" | "login"
}

type AuthMode = "signup" | "login"

const inputStyle: React.CSSProperties = {
  padding: "11px 14px",
  borderRadius: 8,
  border: "1px solid #E2DAF6",
  fontSize: 14,
  outline: "none",
  color: "#111827",
  width: "100%",
  boxSizing: "border-box",
}

export default function SignupForm({ answers, agentName, agentPrice, onDone, defaultMode = "signup" }: Props) {
  const [mode, setMode] = useState<AuthMode>(defaultMode)
  const [form, setForm] = useState({ firstName: "", email: "", password: "" })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const profileMeta = {
    first_name: form.firstName,
    sector: answers.volume ?? answers.sector ?? "",
    need: answers.pain ?? answers.need ?? "",
    budget: answers.autonomy ?? answers.budget ?? "",
    agent_name: agentName,
    agent_price: agentPrice,
  }

  // Called after OAuth redirect — the callback page handles profile insert.
  // Called after email auth — we insert the profile directly.
  const saveProfile = async (userId: string) => {
    const { error } = await getSupabase().from("profiles").upsert({
      user_id: userId,
      ...profileMeta,
    })
    if (error) console.error("Profile save error:", error.message)
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (mode === "signup") {
        const { data, error } = await getSupabase().auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            // Store onboarding data in user_metadata so the DB trigger can
            // create the profile even if the user hasn't confirmed their email yet.
            data: profileMeta,
          },
        })
        if (error) throw error
        // If email confirmation is disabled, session is available immediately.
        if (data.session && data.user) {
          await saveProfile(data.user.id)
        }
      } else {
        const { data, error } = await getSupabase().auth.signInWithPassword({
          email: form.email,
          password: form.password,
        })
        if (error) throw error
        if (data.user) await saveProfile(data.user.id)
      }
      onDone()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue")
    } finally {
      setLoading(false)
    }
  }

  const handleOAuth = async (provider: "google") => {
    // Persist onboarding data across the OAuth redirect
    sessionStorage.setItem("nawa_pending_profile", JSON.stringify(profileMeta))
    await getSupabase().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <p style={{ fontSize: 14, color: "#4B5563", margin: 0 }}>
        {mode === "signup"
          ? "Créez votre espace Nawa Studio pour accéder à votre agent."
          : "Connectez-vous pour accéder à votre espace."}
      </p>

      {/* OAuth buttons */}
      <button
        type="button"
        onClick={() => handleOAuth("google")}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          padding: "11px 14px", borderRadius: 8, border: "1px solid #E2DAF6",
          fontSize: 14, cursor: "pointer", background: "white", color: "#111827", fontWeight: 500,
        }}
      >
        {/* Google logo */}
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        Continuer avec Google
      </button>

      {/* Divider */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#9CA3AF", fontSize: 12 }}>
        <div style={{ flex: 1, height: 1, background: "#E2DAF6" }} />
        ou
        <div style={{ flex: 1, height: 1, background: "#E2DAF6" }} />
      </div>

      {/* Email/password form */}
      <form onSubmit={handleEmailAuth} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {mode === "signup" && (
          <input
            required
            placeholder="Votre prénom"
            value={form.firstName}
            onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))}
            style={inputStyle}
          />
        )}
        <input
          required
          type="email"
          placeholder="Email professionnel"
          value={form.email}
          onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
          style={inputStyle}
        />
        <input
          required
          type="password"
          placeholder="Mot de passe (min. 8 caractères)"
          minLength={8}
          value={form.password}
          onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
          style={inputStyle}
        />

        {error && (
          <p style={{ fontSize: 12, color: "#EF4444", margin: 0 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            background: loading ? "#B8AEDE" : "#7C63C8",
            color: "white", border: "none", borderRadius: 10,
            padding: "14px", fontSize: 15, fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading
            ? "Chargement…"
            : mode === "signup"
            ? "Créer mon espace →"
            : "Se connecter →"}
        </button>
      </form>

      <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", margin: 0 }}>
        {mode === "signup" ? (
          <>
            Déjà un compte ?{" "}
            <button
              type="button"
              onClick={() => setMode("login")}
              style={{ color: "#7C63C8", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}
            >
              Se connecter
            </button>
          </>
        ) : (
          <>
            Pas encore de compte ?{" "}
            <button
              type="button"
              onClick={() => setMode("signup")}
              style={{ color: "#7C63C8", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}
            >
              S&apos;inscrire
            </button>
          </>
        )}
      </p>
    </m.div>
  )
}
