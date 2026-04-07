"use client"
export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { m } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import { Logo } from "@/components/ui/Logo"
import Link from "next/link"
import type { User } from "@supabase/supabase-js"

/* ─── Level Data (same as catalogue) ─────────────────────────── */

const LEVEL_META: Record<number, { name: string; agent: string; color: string; colorLight: string }> = {
  1: { name: "Niveau 1", agent: "Léo", color: "#22c55e", colorLight: "rgba(34,197,94,0.08)" },
  2: { name: "Niveau 2", agent: "Nora", color: "#3b82f6", colorLight: "rgba(59,130,246,0.08)" },
  3: { name: "Niveau 3", agent: "Alex", color: "#7C63C8", colorLight: "rgba(124,99,200,0.08)" },
}

/* ─── Page ────────────────────────────────────────────────────── */

export default function EspaceClientPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAuth, setShowAuth] = useState<"login" | "signup" | null>(null)
  const [form, setForm] = useState({ firstName: "", email: "", password: "" })
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [profile, setProfile] = useState<Record<string, string | null> | null>(null)

  useEffect(() => {
    const supabase = getSupabase()
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Fetch profile when user is set
  useEffect(() => {
    if (!user) return
    getSupabase()
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data as Record<string, string | null>)
      })
  }, [user])

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError(null)
    try {
      if (showAuth === "signup") {
        const { error } = await getSupabase().auth.signUp({
          email: form.email,
          password: form.password,
          options: { data: { first_name: form.firstName } },
        })
        if (error) throw error
      } else {
        const { error } = await getSupabase().auth.signInWithPassword({
          email: form.email,
          password: form.password,
        })
        if (error) throw error
      }
      setShowAuth(null)
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Erreur")
    } finally {
      setAuthLoading(false)
    }
  }

  const handleGoogleAuth = async () => {
    await getSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  const handleLogout = async () => {
    await getSupabase().auth.signOut()
    setUser(null)
    setProfile(null)
  }

  const firstName =
    profile?.first_name ??
    user?.user_metadata?.first_name ??
    user?.email?.split("@")[0] ??
    "Utilisateur"

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAFA" }}>
        <div style={{ width: 24, height: 24, border: "3px solid #E2DAF6", borderTopColor: "#7C63C8", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  /* ─── Not logged in ──────────────────────────────────── */
  if (!user) {
    return (
      <div style={{ background: "#FAFAFA", minHeight: "100vh" }}>
        {/* Header */}
        <header
          style={{
            position: "sticky", top: 0, zIndex: 40,
            background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)",
            borderBottom: "1px solid #F0ECF8", padding: "0 24px", height: 64,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}
        >
          <Link href="/" style={{ textDecoration: "none" }}><Logo size="md" /></Link>
          <Link href="/catalogue" style={{ fontSize: 14, fontWeight: 500, color: "#7C63C8", textDecoration: "none" }}>
            Voir le catalogue
          </Link>
        </header>

        <div style={{ maxWidth: 440, margin: "0 auto", padding: "80px 24px" }}>
          <m.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "#111827", textAlign: "center", marginBottom: 8 }}>
              Votre espace client
            </h1>
            <p style={{ fontSize: 15, color: "#6B7280", textAlign: "center", marginBottom: 36 }}>
              Connectez-vous ou créez un compte pour accéder à vos agents IA.
            </p>

            {/* Google */}
            <button
              type="button"
              onClick={handleGoogleAuth}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                width: "100%", padding: "13px", borderRadius: 10,
                border: "1.5px solid #E2DAF6", background: "white",
                fontSize: 14, fontWeight: 500, color: "#111827", cursor: "pointer",
                marginBottom: 16,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Continuer avec Google
            </button>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0", color: "#9CA3AF", fontSize: 12 }}>
              <div style={{ flex: 1, height: 1, background: "#E2DAF6" }} />
              ou par email
              <div style={{ flex: 1, height: 1, background: "#E2DAF6" }} />
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 0, marginBottom: 20, borderRadius: 10, overflow: "hidden", border: "1.5px solid #E2DAF6" }}>
              {(["signup", "login"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setShowAuth(m); setAuthError(null) }}
                  style={{
                    flex: 1, padding: "10px", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none",
                    background: showAuth === m ? "#7C63C8" : "white",
                    color: showAuth === m ? "white" : "#6B7280",
                    transition: "all 150ms",
                  }}
                >
                  {m === "signup" ? "Créer un compte" : "Se connecter"}
                </button>
              ))}
            </div>

            {/* Form */}
            <form onSubmit={handleEmailAuth} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {showAuth === "signup" && (
                <input
                  required placeholder="Votre prénom" value={form.firstName}
                  onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                  style={{ padding: "12px 14px", borderRadius: 10, border: "1.5px solid #E2DAF6", fontSize: 14, outline: "none", color: "#111827" }}
                />
              )}
              <input
                required type="email" placeholder="Email professionnel" value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                style={{ padding: "12px 14px", borderRadius: 10, border: "1.5px solid #E2DAF6", fontSize: 14, outline: "none", color: "#111827" }}
              />
              <input
                required type="password" placeholder="Mot de passe (min. 8 caractères)" minLength={8}
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                style={{ padding: "12px 14px", borderRadius: 10, border: "1.5px solid #E2DAF6", fontSize: 14, outline: "none", color: "#111827" }}
              />
              {authError && <p style={{ fontSize: 12, color: "#EF4444", margin: 0 }}>{authError}</p>}
              <button
                type="submit"
                disabled={authLoading}
                style={{
                  background: authLoading ? "#B8AEDE" : "#7C63C8", color: "white",
                  border: "none", borderRadius: 12, padding: "14px", fontSize: 15,
                  fontWeight: 600, cursor: authLoading ? "not-allowed" : "pointer",
                  marginTop: 4,
                }}
              >
                {authLoading ? "Chargement…" : showAuth === "signup" ? "Créer mon espace →" : "Se connecter →"}
              </button>
            </form>
          </m.div>
        </div>
      </div>
    )
  }

  /* ─── Logged in — Dashboard ──────────────────────────── */
  return (
    <div style={{ background: "#FAFAFA", minHeight: "100vh" }}>
      {/* Header */}
      <header
        style={{
          position: "sticky", top: 0, zIndex: 40,
          background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)",
          borderBottom: "1px solid #F0ECF8", padding: "0 24px", height: 64,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <Link href="/" style={{ textDecoration: "none" }}><Logo size="md" /></Link>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/catalogue" style={{ fontSize: 13, fontWeight: 500, color: "#6B7280", textDecoration: "none" }}>
            Catalogue
          </Link>
          <button
            onClick={handleLogout}
            style={{
              fontSize: 13, fontWeight: 500, color: "#9CA3AF",
              background: "none", border: "1px solid #E2DAF6", borderRadius: 8,
              padding: "6px 14px", cursor: "pointer",
            }}
          >
            Déconnexion
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px" }}>
        {/* Welcome */}
        <m.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#111827", marginBottom: 4 }}>
            Bienvenue, {firstName} 👋
          </h1>
          <p style={{ fontSize: 15, color: "#6B7280", marginBottom: 36 }}>
            Voici votre espace client Nawa Studio.
          </p>
        </m.div>

        {/* Dashboard cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 20,
          }}
        >
          {/* Agent card */}
          <m.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            style={{
              background: "white",
              borderRadius: 16,
              border: "1.5px solid #E2DAF6",
              padding: "28px 24px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: "#F0ECF8", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontSize: 18,
                }}
              >
                🤖
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "#111827", margin: 0 }}>Mon agent</h3>
                <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>Package actif</p>
              </div>
            </div>

            {profile?.agent_name ? (
              <div>
                <p style={{ fontSize: 14, color: "#4B5563", margin: "0 0 8px" }}>
                  <strong>{profile.agent_name}</strong>
                </p>
                <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>
                  {profile.agent_price}
                </p>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 14, color: "#9CA3AF", margin: "0 0 16px" }}>
                  Aucun package actif pour le moment.
                </p>
                <Link
                  href="/catalogue"
                  style={{
                    display: "inline-block", background: "#7C63C8", color: "white",
                    padding: "10px 20px", borderRadius: 10, fontSize: 13,
                    fontWeight: 600, textDecoration: "none",
                  }}
                >
                  Choisir un package →
                </Link>
              </div>
            )}
          </m.div>

          {/* Activity card */}
          <m.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            style={{
              background: "white",
              borderRadius: 16,
              border: "1.5px solid #E2DAF6",
              padding: "28px 24px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: "#F0ECF8", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontSize: 18,
                }}
              >
                📋
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "#111827", margin: 0 }}>Activité récente</h3>
                <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>Historique des actions</p>
              </div>
            </div>
            <p style={{ fontSize: 14, color: "#9CA3AF", margin: 0 }}>
              Aucune activité pour le moment. Votre historique apparaîtra ici une fois votre agent actif.
            </p>
          </m.div>

          {/* Quick actions */}
          <m.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            style={{
              background: "white",
              borderRadius: 16,
              border: "1.5px solid #E2DAF6",
              padding: "28px 24px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: "#F0ECF8", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontSize: 18,
                }}
              >
                ⚡
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "#111827", margin: 0 }}>Actions rapides</h3>
                <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>Raccourcis</p>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.entries(LEVEL_META).map(([key, lvl]) => (
                <Link
                  key={key}
                  href={`/catalogue`}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", borderRadius: 10,
                    background: lvl.colorLight, border: `1px solid ${lvl.color}20`,
                    fontSize: 13, fontWeight: 500, color: "#374151",
                    textDecoration: "none", transition: "transform 100ms",
                  }}
                >
                  <span style={{ color: lvl.color, fontWeight: 700 }}>{lvl.name}</span>
                  <span style={{ color: "#6B7280" }}>— {lvl.agent}</span>
                </Link>
              ))}
            </div>
          </m.div>
        </div>

        {/* Info banner */}
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          style={{
            marginTop: 32,
            background: "#F8F6FF",
            border: "1px solid #E2DAF6",
            borderRadius: 14,
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 20 }}>💡</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#111827", margin: "0 0 2px" }}>
              Besoin d&apos;aide pour choisir ?
            </p>
            <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>
              Notre équipe vous accompagne dans le choix du bon niveau pour vos besoins.
            </p>
          </div>
          <a
            href="mailto:contact@nawastudio.com"
            style={{
              fontSize: 13, fontWeight: 600, color: "#7C63C8",
              textDecoration: "none", padding: "8px 16px",
              border: "1.5px solid #7C63C8", borderRadius: 8,
            }}
          >
            Nous contacter
          </a>
        </m.div>
      </div>
    </div>
  )
}
