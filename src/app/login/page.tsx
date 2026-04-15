"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Logo } from "@/components/ui/Logo"
import { getSupabase } from "@/lib/supabase"

type Mode = "login" | "signup"

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get("next") ?? "/workspace"

  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Redirect if already logged in
  useEffect(() => {
    getSupabase().auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace(nextPath)
    })
  }, [router, nextPath])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const sb = getSupabase()

    if (mode === "login") {
      const { error: err } = await sb.auth.signInWithPassword({ email, password })
      if (err) {
        setError("Email ou mot de passe incorrect.")
        setLoading(false)
        return
      }
      router.replace(nextPath)
    } else {
      const { data, error: err } = await sb.auth.signUp({ email, password })
      if (err) {
        setError(err.message)
        setLoading(false)
        return
      }
      // Save first_name to profile
      if (data.user && firstName.trim()) {
        await sb.from("profiles").update({ first_name: firstName.trim() }).eq("user_id", data.user.id)
      }
      if (data.session) {
        router.replace(nextPath)
      } else {
        setSuccess("Vérifiez votre email pour confirmer votre compte.")
        setLoading(false)
      }
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#FAFAFA",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      {/* Card */}
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "white",
          borderRadius: 20,
          border: "1px solid #F0ECF8",
          padding: "40px 36px",
          boxShadow: "0 8px 40px rgba(124,99,200,0.08)",
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <Link href="/" style={{ textDecoration: "none", display: "inline-block" }}>
            <Logo size="md" />
          </Link>
        </div>

        {/* Mode toggle */}
        <div
          style={{
            display: "flex",
            background: "#F8F6FF",
            borderRadius: 10,
            padding: 4,
            marginBottom: 28,
          }}
        >
          {(["login", "signup"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); setSuccess(null) }}
              style={{
                flex: 1,
                padding: "9px 0",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                transition: "all 150ms",
                fontFamily: "var(--font-inter), sans-serif",
                background: mode === m ? "white" : "transparent",
                color: mode === m ? "#7C63C8" : "#9CA3AF",
                boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {m === "login" ? "Se connecter" : "Créer un compte"}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {mode === "signup" && (
            <div>
              <label style={labelStyle}>Prénom</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Votre prénom"
                style={inputStyle}
                autoComplete="given-name"
              />
            </div>
          )}

          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
              required
              style={inputStyle}
              autoComplete="email"
            />
          </div>

          <div>
            <label style={labelStyle}>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "Minimum 6 caractères" : "••••••••"}
              required
              minLength={6}
              style={inputStyle}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          {error && (
            <p style={{ margin: 0, fontSize: 13, color: "#EF4444", fontFamily: "var(--font-inter), sans-serif" }}>
              {error}
            </p>
          )}
          {success && (
            <p style={{ margin: 0, fontSize: 13, color: "#22c55e", fontFamily: "var(--font-inter), sans-serif" }}>
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              padding: "13px",
              borderRadius: 10,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: 14,
              fontWeight: 700,
              color: "white",
              background: loading
                ? "#C4B8E8"
                : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
              transition: "all 150ms",
              fontFamily: "var(--font-inter), sans-serif",
            }}
          >
            {loading
              ? "Chargement…"
              : mode === "login"
              ? "Se connecter →"
              : "Créer mon compte →"}
          </button>
        </form>

        {/* Back to home */}
        <p
          style={{
            marginTop: 20,
            textAlign: "center",
            fontSize: 12,
            color: "#9CA3AF",
            fontFamily: "var(--font-inter), sans-serif",
          }}
        >
          <Link href="/" style={{ color: "#9CA3AF", textDecoration: "none" }}>
            ← Retour à l&apos;accueil
          </Link>
        </p>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 600,
  color: "#374151",
  fontFamily: "var(--font-inter), sans-serif",
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: 9,
  border: "1.5px solid #E5E7EB",
  fontSize: 14,
  color: "#111827",
  outline: "none",
  transition: "border-color 150ms",
  fontFamily: "var(--font-inter), sans-serif",
  boxSizing: "border-box",
}
