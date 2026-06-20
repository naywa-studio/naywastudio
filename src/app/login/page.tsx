"use client"

import { Suspense, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Logo } from "@/components/ui/Logo"
import { getSupabase } from "@/lib/supabase"
import { resolvePostLoginDestination } from "@/lib/post-login-destination"

type Mode = "login" | "signup"

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#FAFAFA" }} />}>
      <LoginInner />
    </Suspense>
  )
}

function LoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // ?next= éventuel, brut. La sanitization + le choix final entre
  // /workspace, /organisation et /onboarding sont délégués à
  // resolvePostLoginDestination() qui lit le profil pour éviter la
  // bounce visuelle "workspace → organisation" pour un owner sans siège.
  const requestedNext = searchParams.get("next")

  const expired = searchParams.get("expired") === "1"
  const initialMode = (searchParams.get("mode") === "signup" || expired ? "signup" : "login") as Mode
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(
    expired
      ? "Le lien de confirmation a expiré ou a déjà été utilisé. Recommencez l'inscription pour recevoir un nouveau lien."
      : null,
  )
  const [success, setSuccess] = useState<string | null>(null)

  // Redirect if already logged in : on résout la destination via le
  // helper pour ne pas envoyer un owner sans siège vers /workspace
  // (qui le rebounce immédiatement vers /organisation).
  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) return
      const dest = await resolvePostLoginDestination(sb, session.user.id, requestedNext)
      router.replace(dest)
    })
  }, [router, requestedNext])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const sb = getSupabase()

    if (mode === "login") {
      const { data: signInData, error: err } = await sb.auth.signInWithPassword({ email, password })
      if (err) {
        setError("Email ou mot de passe incorrect.")
        setLoading(false)
        return
      }
      const dest = signInData.user
        ? await resolvePostLoginDestination(sb, signInData.user.id, requestedNext)
        : "/workspace"
      router.replace(dest)
    } else {
      const trimmedFirstName = firstName.trim()
      const { data, error: err } = await sb.auth.signUp({
        email,
        password,
        options: {
          // New signups land on /cabinet — no sourcing seat yet, the owner
          // must choose to allocate one (or invite a colleague to use it).
          emailRedirectTo: `${window.location.origin}/cabinet`,
          // Picked up by handle_new_auth_user() and used to seed the
          // profile's first_name + the "Cabinet de {prénom}" org name.
          data: trimmedFirstName ? { first_name: trimmedFirstName } : undefined,
        },
      })
      if (err) {
        setError(err.message)
        setLoading(false)
        return
      }
      // Defensive: also persist first_name on the profile in case the
      // trigger wasn't picking up metadata for any reason.
      if (data.user && trimmedFirstName) {
        await sb.from("profiles").update({ first_name: trimmedFirstName }).eq("user_id", data.user.id)
      }
      if (data.session && data.user) {
        const dest = await resolvePostLoginDestination(sb, data.user.id, requestedNext)
        router.replace(dest)
      } else {
        setSuccess("Vérifiez votre email pour confirmer votre compte.")
        setLoading(false)
      }
    }
  }

  const handleGoogle = async () => {
    setError(null)
    setLoading(true)
    // Stash first_name so the /auth/callback page picks it up after redirect
    if (mode === "signup" && firstName.trim()) {
      sessionStorage.setItem("nawa_pending_profile", JSON.stringify({ first_name: firstName.trim() }))
    }
    const { error: err } = await getSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (err) {
      setError(err.message)
      setLoading(false)
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

        {/* Google OAuth */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          style={{
            width: "100%", padding: "12px",
            borderRadius: 10,
            border: "1.5px solid #E5E7EB", background: "white",
            color: "#374151", fontSize: 14, fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 10, marginBottom: 14,
            transition: "border-color 150ms, background 150ms",
            fontFamily: "var(--font-inter), sans-serif",
          }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.borderColor = "#7C63C8" }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E5E7EB" }}
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C33.6 5.6 29 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.2-2.4-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C33.6 5.6 29 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5 0 9.5-1.9 13-5l-6-5c-2 1.4-4.5 2.2-7 2.2-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2-2 3.8-3.6 5l6 5c-.4.4 6.4-4.7 6.4-14 0-1.3-.2-2.4-.5-3.5z"/>
          </svg>
          {mode === "login" ? "Se connecter avec Google" : "Continuer avec Google"}
        </button>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1, height: 1, background: "#F0ECF8" }} />
          <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600, fontFamily: "var(--font-inter), sans-serif" }}>OU</span>
          <div style={{ flex: 1, height: 1, background: "#F0ECF8" }} />
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
