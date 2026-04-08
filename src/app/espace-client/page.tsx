"use client"
export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { m, AnimatePresence } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import { Logo } from "@/components/ui/Logo"
import Link from "next/link"
import type { User } from "@supabase/supabase-js"

/* ─── Agent level data ───────────────────────────────────────── */

interface AgentLevel {
  name: string
  agent: string
  role: string
  color: string
  colorLight: string
  colorMid: string
  borderColor: string
  features: string[]
  result: string
  icon: string
}

const LEVELS: Record<number, AgentLevel> = {
  1: {
    name: "Niveau 1",
    agent: "Léo",
    role: "Agent de tri & nettoyage",
    color: "#22c55e",
    colorLight: "rgba(34,197,94,0.06)",
    colorMid: "rgba(34,197,94,0.12)",
    borderColor: "rgba(34,197,94,0.25)",
    features: [
      "Upload de tableur (export Walaxy, CSV…)",
      "Définition du profil cible en langage naturel",
      "Tableur nettoyé avec profils pertinents mis en évidence",
    ],
    result: "Un tableur propre et exploitable, prêt à l'usage.",
    icon: "🧹",
  },
  2: {
    name: "Niveau 2",
    agent: "Nora",
    role: "Agent maître de sourcing",
    color: "#3b82f6",
    colorLight: "rgba(59,130,246,0.06)",
    colorMid: "rgba(59,130,246,0.12)",
    borderColor: "rgba(59,130,246,0.25)",
    features: [
      "Analyse fine du besoin de recrutement",
      "Tri automatique et nettoyage des listes",
      "Scoring & priorisation des candidats",
      "Shortlist prête à l'usage",
    ],
    result: "Une shortlist priorisée de candidats qualifiés.",
    icon: "🎯",
  },
  3: {
    name: "Niveau 3",
    agent: "Alex",
    role: "Agent orchestrateur de recrutement",
    color: "#7C63C8",
    colorLight: "rgba(124,99,200,0.06)",
    colorMid: "rgba(124,99,200,0.12)",
    borderColor: "rgba(124,99,200,0.25)",
    features: [
      "Analyse du besoin & rédaction d'offres",
      "Sourcing & chasse active de candidats",
      "Filtrage, scoring et priorisation",
      "Prise de contact & booking d'entretiens",
      "Transcription d'appels & synthèse candidat",
      "Reporting complet à chaque étape",
    ],
    result: "Dossiers candidats complets, prêts à être présentés au client final.",
    icon: "🚀",
  },
}

/* ─── Helpers ─────────────────────────────────────────────────── */

function detectLevel(profile: Record<string, string | null> | null): number | null {
  if (!profile?.agent_price) return null
  const price = profile.agent_price.toLowerCase()
  if (price.includes("3")) return 3
  if (price.includes("2")) return 2
  if (price.includes("1")) return 1
  // Try agent name
  const name = (profile.agent_name ?? "").toLowerCase()
  if (name.includes("alex")) return 3
  if (name.includes("nora")) return 2
  if (name.includes("léo") || name.includes("leo")) return 1
  return null
}

const inputStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1.5px solid #E2DAF6",
  fontSize: 14,
  outline: "none",
  color: "#111827",
  width: "100%",
  boxSizing: "border-box",
  transition: "border-color 150ms",
}

/* ─── Page ────────────────────────────────────────────────────── */

export default function EspaceClientPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAuth, setShowAuth] = useState<"login" | "signup">("login")
  const [form, setForm] = useState({ firstName: "", email: "", password: "" })
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [profile, setProfile] = useState<Record<string, string | null> | null>(null)
  const [activeTab, setActiveTab] = useState<"overview" | "agent" | "activity">("overview")

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
      setShowAuth("login")
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

  const userLevel = detectLevel(profile)
  const agent = userLevel ? LEVELS[userLevel] : null

  /* ─── Loading ──────────────────────────────────────── */
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAFA" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ width: 32, height: 32, border: "3px solid #E2DAF6", borderTopColor: "#7C63C8", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <p style={{ fontSize: 14, color: "#9CA3AF" }}>Chargement...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════════
     NOT LOGGED IN — Auth Page
     ═══════════════════════════════════════════════════════ */
  if (!user) {
    return (
      <div style={{ background: "#FAFAFA", minHeight: "100vh" }}>
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
            {/* Icon */}
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{
                width: 64, height: 64, borderRadius: 20, margin: "0 auto 16px",
                background: "linear-gradient(135deg, #7C63C8, #B8AEDE)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28, boxShadow: "0 8px 32px rgba(124,99,200,0.2)",
              }}>
                🔐
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: "#111827", marginBottom: 8 }}>
                Votre espace client
              </h1>
              <p style={{ fontSize: 15, color: "#6B7280", margin: 0 }}>
                Connectez-vous pour accéder à vos agents IA et suivre votre activité.
              </p>
            </div>

            {/* Google */}
            <button
              type="button"
              onClick={handleGoogleAuth}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                width: "100%", padding: "13px", borderRadius: 10,
                border: "1.5px solid #E2DAF6", background: "white",
                fontSize: 14, fontWeight: 500, color: "#111827", cursor: "pointer",
                marginBottom: 16, transition: "all 150ms",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#7C63C8"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(124,99,200,0.1)" }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E2DAF6"; e.currentTarget.style.boxShadow = "none" }}
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
              {(["login", "signup"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => { setShowAuth(tab); setAuthError(null) }}
                  style={{
                    flex: 1, padding: "10px", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none",
                    background: showAuth === tab ? "#7C63C8" : "white",
                    color: showAuth === tab ? "white" : "#6B7280",
                    transition: "all 150ms",
                  }}
                >
                  {tab === "signup" ? "Créer un compte" : "Se connecter"}
                </button>
              ))}
            </div>

            {/* Form */}
            <form onSubmit={handleEmailAuth} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {showAuth === "signup" && (
                <input
                  required placeholder="Votre prénom" value={form.firstName}
                  onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                  style={inputStyle}
                  onFocus={(e) => e.currentTarget.style.borderColor = "#7C63C8"}
                  onBlur={(e) => e.currentTarget.style.borderColor = "#E2DAF6"}
                />
              )}
              <input
                required type="email" placeholder="Email professionnel" value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                style={inputStyle}
                onFocus={(e) => e.currentTarget.style.borderColor = "#7C63C8"}
                onBlur={(e) => e.currentTarget.style.borderColor = "#E2DAF6"}
              />
              <input
                required type="password" placeholder="Mot de passe (min. 8 caractères)" minLength={8}
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                style={inputStyle}
                onFocus={(e) => e.currentTarget.style.borderColor = "#7C63C8"}
                onBlur={(e) => e.currentTarget.style.borderColor = "#E2DAF6"}
              />
              {authError && <p style={{ fontSize: 12, color: "#EF4444", margin: 0 }}>{authError}</p>}
              <button
                type="submit"
                disabled={authLoading}
                style={{
                  background: authLoading ? "#B8AEDE" : "linear-gradient(135deg, #7C63C8, #6B54B2)",
                  color: "white", border: "none", borderRadius: 12, padding: "14px",
                  fontSize: 15, fontWeight: 600, cursor: authLoading ? "not-allowed" : "pointer",
                  marginTop: 4, transition: "opacity 150ms",
                  boxShadow: "0 4px 16px rgba(124,99,200,0.2)",
                }}
              >
                {authLoading ? "Chargement…" : showAuth === "signup" ? "Créer mon espace →" : "Se connecter →"}
              </button>
            </form>

            <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", marginTop: 20 }}>
              En vous inscrivant, vous acceptez nos conditions d&apos;utilisation.
            </p>
          </m.div>
        </div>
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════════
     LOGGED IN — Full Dashboard
     ═══════════════════════════════════════════════════════ */

  const hasAgent = !!agent

  return (
    <div style={{ background: "#FAFAFA", minHeight: "100vh" }}>

      {/* ── Sticky Header ───────────────────────────────── */}
      <header
        style={{
          position: "sticky", top: 0, zIndex: 40,
          background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)",
          borderBottom: "1px solid #F0ECF8", padding: "0 20px", height: 64,
          display: "flex", alignItems: "center", gap: 16,
        }}
      >
        <Link href="/" style={{ textDecoration: "none", flexShrink: 0 }}>
          <Logo size="md" />
        </Link>

        {/* Nav tabs (desktop) */}
        <nav className="hidden sm:flex" style={{ marginLeft: 24, gap: 4, display: "flex" }}>
          {([
            { key: "overview" as const, label: "Vue d'ensemble" },
            { key: "agent" as const, label: "Mon agent" },
            { key: "activity" as const, label: "Activité" },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                cursor: "pointer", border: "none", transition: "all 150ms",
                background: activeTab === tab.key ? "rgba(124,99,200,0.1)" : "transparent",
                color: activeTab === tab.key ? "#7C63C8" : "#6B7280",
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        <Link href="/catalogue" style={{
          fontSize: 13, fontWeight: 500, color: "#6B7280", textDecoration: "none",
          padding: "6px 12px", borderRadius: 8, transition: "color 150ms",
        }}>
          Catalogue
        </Link>

        {/* User avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            background: agent ? agent.color : "#7C63C8",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700, color: "white",
          }}>
            {firstName.charAt(0).toUpperCase()}
          </div>
          <button
            onClick={handleLogout}
            style={{
              fontSize: 12, fontWeight: 500, color: "#9CA3AF",
              background: "none", border: "1px solid #E5E7EB", borderRadius: 8,
              padding: "5px 12px", cursor: "pointer", transition: "all 150ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#EF4444"; e.currentTarget.style.color = "#EF4444" }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.color = "#9CA3AF" }}
          >
            Déconnexion
          </button>
        </div>
      </header>

      {/* ── Mobile Tab Bar ──────────────────────────────── */}
      <div className="sm:hidden" style={{
        display: "flex", gap: 0, borderBottom: "1px solid #F0ECF8",
        background: "white", position: "sticky", top: 64, zIndex: 39,
      }}>
        {([
          { key: "overview" as const, label: "Accueil", icon: "◻" },
          { key: "agent" as const, label: "Agent", icon: "🤖" },
          { key: "activity" as const, label: "Activité", icon: "📋" },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1, padding: "10px 8px", fontSize: 12, fontWeight: 500,
              cursor: "pointer", border: "none", background: "transparent",
              color: activeTab === tab.key ? "#7C63C8" : "#9CA3AF",
              borderBottom: activeTab === tab.key ? "2px solid #7C63C8" : "2px solid transparent",
              transition: "all 150ms",
            }}
          >
            <span style={{ display: "block", fontSize: 16, marginBottom: 2 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Main Content ────────────────────────────────── */}
      <main style={{ maxWidth: 1060, margin: "0 auto", padding: "32px 20px 80px" }}>

        {/* Welcome */}
        <m.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ marginBottom: 32 }}
        >
          <h1 style={{
            fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 700, color: "#111827",
            fontFamily: "var(--font-space-grotesk), sans-serif",
            marginBottom: 4,
          }}>
            Bonjour, {firstName} 👋
          </h1>
          <p style={{ fontSize: 15, color: "#6B7280", margin: 0 }}>
            {hasAgent
              ? `Votre agent ${agent.agent} est prêt. Gérez votre sourcing depuis cet espace.`
              : "Bienvenue dans votre espace Nawa Studio. Choisissez un agent pour commencer."}
          </p>
        </m.div>

        <AnimatePresence mode="wait">
          {/* ═══ TAB: OVERVIEW ═══════════════════════════════ */}
          {activeTab === "overview" && (
            <m.div
              key="overview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {/* Status banner */}
              {hasAgent ? (
                <m.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  style={{
                    background: `linear-gradient(135deg, ${agent.colorLight}, ${agent.colorMid})`,
                    border: `1.5px solid ${agent.borderColor}`,
                    borderRadius: 16, padding: "24px 28px",
                    display: "flex", alignItems: "center", gap: 20,
                    flexWrap: "wrap", marginBottom: 24,
                  }}
                >
                  <div style={{
                    width: 56, height: 56, borderRadius: 16,
                    background: `linear-gradient(135deg, ${agent.color}, ${agent.color}cc)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 26, boxShadow: `0 4px 16px ${agent.color}30`,
                    flexShrink: 0,
                  }}>
                    {agent.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>
                        {agent.agent}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: agent.color,
                        background: "white", padding: "3px 10px", borderRadius: 100,
                        border: `1px solid ${agent.borderColor}`,
                      }}>
                        {agent.name}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: "#22c55e",
                        background: "rgba(34,197,94,0.08)", padding: "3px 10px", borderRadius: 100,
                      }}>
                        ● Actif
                      </span>
                    </div>
                    <p style={{ fontSize: 14, color: "#4B5563", margin: 0 }}>{agent.role}</p>
                  </div>
                  <Link
                    href="/catalogue"
                    style={{
                      fontSize: 13, fontWeight: 600, color: agent.color,
                      textDecoration: "none", padding: "9px 18px",
                      borderRadius: 10, border: `1.5px solid ${agent.borderColor}`,
                      background: "white", transition: "all 150ms",
                    }}
                  >
                    Changer de niveau
                  </Link>
                </m.div>
              ) : (
                <m.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  style={{
                    background: "linear-gradient(135deg, rgba(124,99,200,0.06), rgba(124,99,200,0.12))",
                    border: "1.5px solid rgba(124,99,200,0.2)",
                    borderRadius: 16, padding: "32px 28px",
                    textAlign: "center", marginBottom: 24,
                  }}
                >
                  <div style={{
                    width: 60, height: 60, borderRadius: 16, margin: "0 auto 16px",
                    background: "linear-gradient(135deg, #7C63C8, #B8AEDE)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 28, boxShadow: "0 4px 16px rgba(124,99,200,0.2)",
                  }}>
                    🤖
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>
                    Aucun agent actif
                  </h3>
                  <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 20px", maxWidth: 400, marginLeft: "auto", marginRight: "auto" }}>
                    Choisissez un package pour activer votre agent IA et commencer à automatiser votre sourcing.
                  </p>
                  <Link
                    href="/catalogue"
                    style={{
                      display: "inline-block",
                      background: "linear-gradient(135deg, #7C63C8, #6B54B2)",
                      color: "white", padding: "12px 28px", borderRadius: 12,
                      fontSize: 14, fontWeight: 600, textDecoration: "none",
                      boxShadow: "0 4px 16px rgba(124,99,200,0.25)",
                    }}
                  >
                    Choisir mon agent →
                  </Link>
                </m.div>
              )}

              {/* Stats Grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 16, marginBottom: 24,
              }}>
                {[
                  { label: "Candidats sourcés", value: hasAgent ? "—" : "0", icon: "👤", change: null },
                  { label: "Shortlists générées", value: hasAgent ? "—" : "0", icon: "📋", change: null },
                  { label: "Entretiens planifiés", value: hasAgent ? "—" : "0", icon: "📅", change: null },
                  { label: "Temps économisé", value: hasAgent ? "—" : "0h", icon: "⏱", change: null },
                ].map((stat, i) => (
                  <m.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.05 }}
                    style={{
                      background: "white",
                      borderRadius: 14,
                      border: "1px solid #F0ECF8",
                      padding: "20px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <span style={{ fontSize: 22 }}>{stat.icon}</span>
                    </div>
                    <p style={{ fontSize: 28, fontWeight: 700, color: "#111827", margin: "0 0 4px", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
                      {stat.value}
                    </p>
                    <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>{stat.label}</p>
                  </m.div>
                ))}
              </div>

              {/* Two-column layout */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                gap: 20,
              }}>
                {/* Recent Activity */}
                <m.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  style={{
                    background: "white", borderRadius: 16,
                    border: "1px solid #F0ECF8", padding: "24px",
                  }}
                >
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: "#111827", margin: "0 0 16px" }}>
                    Activité récente
                  </h3>
                  {hasAgent ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {[
                        { time: "Aujourd'hui", text: `${agent.agent} a été activé sur votre espace`, dot: agent.color },
                        { time: "Aujourd'hui", text: "Votre compte Nawa Studio a été créé", dot: "#22c55e" },
                      ].map((item, i) => (
                        <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                          <div style={{
                            width: 8, height: 8, borderRadius: "50%",
                            background: item.dot, flexShrink: 0, marginTop: 6,
                          }} />
                          <div>
                            <p style={{ fontSize: 13, color: "#374151", margin: "0 0 2px" }}>{item.text}</p>
                            <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{item.time}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "24px 0" }}>
                      <p style={{ fontSize: 32, marginBottom: 8 }}>📭</p>
                      <p style={{ fontSize: 14, color: "#9CA3AF", margin: 0 }}>
                        Aucune activité pour le moment.
                      </p>
                    </div>
                  )}
                </m.div>

                {/* Quick Actions */}
                <m.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  style={{
                    background: "white", borderRadius: 16,
                    border: "1px solid #F0ECF8", padding: "24px",
                  }}
                >
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: "#111827", margin: "0 0 16px" }}>
                    Actions rapides
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      { icon: "📊", label: "Voir le catalogue", desc: "Comparer les niveaux d'agents", href: "/catalogue" },
                      { icon: "💬", label: "Contacter l'équipe", desc: "Besoin d'aide ou d'un conseil ?", href: "mailto:contact@nawastudio.com" },
                      { icon: "📖", label: "Guide de démarrage", desc: "Comment utiliser votre agent", href: "#" },
                    ].map((action, i) => (
                      <Link
                        key={i}
                        href={action.href}
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "12px 14px", borderRadius: 12,
                          border: "1px solid #F0ECF8",
                          textDecoration: "none", transition: "all 150ms",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#E2DAF6"; e.currentTarget.style.background = "#FAFAFE" }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#F0ECF8"; e.currentTarget.style.background = "transparent" }}
                      >
                        <span style={{ fontSize: 20 }}>{action.icon}</span>
                        <div>
                          <p style={{ fontSize: 14, fontWeight: 600, color: "#111827", margin: 0 }}>{action.label}</p>
                          <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>{action.desc}</p>
                        </div>
                        <span style={{ marginLeft: "auto", color: "#D1D5DB", fontSize: 16 }}>→</span>
                      </Link>
                    ))}
                  </div>
                </m.div>
              </div>
            </m.div>
          )}

          {/* ═══ TAB: AGENT DETAILS ═════════════════════════ */}
          {activeTab === "agent" && (
            <m.div
              key="agent"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {hasAgent ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
                  {/* Agent profile card */}
                  <m.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      background: "white", borderRadius: 20,
                      border: `1.5px solid ${agent.borderColor}`,
                      overflow: "hidden",
                    }}
                  >
                    {/* Agent header */}
                    <div style={{
                      background: `linear-gradient(135deg, ${agent.colorLight}, ${agent.colorMid})`,
                      padding: "32px 28px", textAlign: "center",
                    }}>
                      <div style={{
                        width: 80, height: 80, borderRadius: 24,
                        background: `linear-gradient(135deg, ${agent.color}, ${agent.color}cc)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 36, margin: "0 auto 16px",
                        boxShadow: `0 8px 24px ${agent.color}30`,
                      }}>
                        {agent.icon}
                      </div>
                      <h2 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: "0 0 4px", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
                        {agent.agent}
                      </h2>
                      <p style={{ fontSize: 14, color: "#4B5563", margin: "0 0 12px" }}>{agent.role}</p>
                      <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                        <span style={{
                          fontSize: 12, fontWeight: 600, color: agent.color,
                          background: "white", padding: "4px 14px", borderRadius: 100,
                          border: `1px solid ${agent.borderColor}`,
                        }}>
                          {agent.name}
                        </span>
                        <span style={{
                          fontSize: 12, fontWeight: 600, color: "#22c55e",
                          background: "rgba(34,197,94,0.08)", padding: "4px 14px", borderRadius: 100,
                        }}>
                          ● Actif
                        </span>
                      </div>
                    </div>

                    {/* Agent details */}
                    <div style={{ padding: "28px" }}>
                      <h4 style={{ fontSize: 14, fontWeight: 600, color: "#111827", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Fonctionnalités incluses
                      </h4>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {agent.features.map((f, i) => (
                          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                            <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0, marginTop: 1 }}>
                              <circle cx="9" cy="9" r="9" fill={agent.colorLight} />
                              <path d="M5.5 9l2.5 2.5 4.5-4.5" stroke={agent.color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span style={{ fontSize: 14, color: "#374151" }}>{f}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 20, padding: "14px 16px", background: agent.colorLight, borderRadius: 12, border: `1px solid ${agent.borderColor}` }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: agent.color, margin: "0 0 4px" }}>Résultat</p>
                        <p style={{ fontSize: 14, color: "#374151", margin: 0 }}>{agent.result}</p>
                      </div>
                    </div>
                  </m.div>

                  {/* Configuration & Info */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {/* Status card */}
                    <m.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      style={{
                        background: "white", borderRadius: 16,
                        border: "1px solid #F0ECF8", padding: "24px",
                      }}
                    >
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: "#111827", margin: "0 0 20px" }}>
                        Statut de l&apos;agent
                      </h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        {[
                          { label: "État", value: "Actif", valueColor: "#22c55e" },
                          { label: "Agent", value: `${agent.agent} (${agent.name})`, valueColor: agent.color },
                          { label: "Email", value: user?.email ?? "—", valueColor: "#374151" },
                          { label: "Membre depuis", value: new Date(user?.created_at ?? "").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }), valueColor: "#374151" },
                        ].map((row, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 13, color: "#6B7280" }}>{row.label}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: row.valueColor }}>{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </m.div>

                    {/* Upgrade card */}
                    {userLevel && userLevel < 3 && (
                      <m.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        style={{
                          background: "linear-gradient(135deg, #F8F6FF, #EEE9FB)",
                          borderRadius: 16, border: "1.5px solid #E2DAF6",
                          padding: "24px", textAlign: "center",
                        }}
                      >
                        <p style={{ fontSize: 24, margin: "0 0 8px" }}>⬆️</p>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>
                          Passer au {LEVELS[userLevel + 1]?.name}
                        </h3>
                        <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 16px" }}>
                          Débloquez plus de fonctionnalités avec {LEVELS[userLevel + 1]?.agent}.
                        </p>
                        <Link
                          href="/catalogue"
                          style={{
                            display: "inline-block", background: "linear-gradient(135deg, #7C63C8, #6B54B2)",
                            color: "white", padding: "10px 24px", borderRadius: 10,
                            fontSize: 13, fontWeight: 600, textDecoration: "none",
                            boxShadow: "0 4px 16px rgba(124,99,200,0.25)",
                          }}
                        >
                          Voir les options →
                        </Link>
                      </m.div>
                    )}

                    {/* Help */}
                    <m.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      style={{
                        background: "white", borderRadius: 16,
                        border: "1px solid #F0ECF8", padding: "24px",
                      }}
                    >
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: "#111827", margin: "0 0 12px" }}>
                        Besoin d&apos;aide ?
                      </h3>
                      <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 16px" }}>
                        Notre équipe est disponible pour vous accompagner dans l&apos;utilisation de votre agent.
                      </p>
                      <a
                        href="mailto:contact@nawastudio.com"
                        style={{
                          display: "inline-block", fontSize: 13, fontWeight: 600,
                          color: "#7C63C8", textDecoration: "none",
                          padding: "9px 18px", borderRadius: 10,
                          border: "1.5px solid #E2DAF6", transition: "all 150ms",
                        }}
                      >
                        Contacter le support →
                      </a>
                    </m.div>
                  </div>
                </div>
              ) : (
                /* No agent — show catalogue link */
                <m.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ textAlign: "center", padding: "60px 20px" }}
                >
                  <div style={{
                    width: 80, height: 80, borderRadius: 24, margin: "0 auto 20px",
                    background: "#F0ECF8", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 36,
                  }}>
                    🤖
                  </div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>
                    Pas encore d&apos;agent
                  </h2>
                  <p style={{ fontSize: 15, color: "#6B7280", margin: "0 0 24px", maxWidth: 400, marginLeft: "auto", marginRight: "auto" }}>
                    Découvrez nos agents IA et choisissez celui qui correspond à vos besoins de sourcing.
                  </p>

                  {/* Agent preview cards */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, maxWidth: 700, margin: "0 auto 28px" }}>
                    {Object.entries(LEVELS).map(([key, lvl]) => (
                      <div
                        key={key}
                        style={{
                          background: lvl.colorLight, border: `1.5px solid ${lvl.borderColor}`,
                          borderRadius: 14, padding: "20px 16px", textAlign: "center",
                        }}
                      >
                        <div style={{ fontSize: 28, marginBottom: 8 }}>{lvl.icon}</div>
                        <p style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 2px" }}>{lvl.agent}</p>
                        <p style={{ fontSize: 12, color: lvl.color, fontWeight: 600, margin: "0 0 4px" }}>{lvl.name}</p>
                        <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>{lvl.role}</p>
                      </div>
                    ))}
                  </div>

                  <Link
                    href="/catalogue"
                    style={{
                      display: "inline-block",
                      background: "linear-gradient(135deg, #7C63C8, #6B54B2)",
                      color: "white", padding: "14px 32px", borderRadius: 12,
                      fontSize: 15, fontWeight: 600, textDecoration: "none",
                      boxShadow: "0 4px 16px rgba(124,99,200,0.25)",
                    }}
                  >
                    Choisir mon agent →
                  </Link>
                </m.div>
              )}
            </m.div>
          )}

          {/* ═══ TAB: ACTIVITY ══════════════════════════════ */}
          {activeTab === "activity" && (
            <m.div
              key="activity"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <m.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  background: "white", borderRadius: 16,
                  border: "1px solid #F0ECF8", padding: "28px",
                }}
              >
                <h3 style={{ fontSize: 18, fontWeight: 600, color: "#111827", margin: "0 0 24px" }}>
                  Historique d&apos;activité
                </h3>

                {/* Timeline */}
                <div style={{ position: "relative", paddingLeft: 28 }}>
                  {/* Vertical line */}
                  <div style={{
                    position: "absolute", left: 5, top: 8, bottom: 8,
                    width: 2, background: "#F0ECF8",
                  }} />

                  {[
                    ...(hasAgent ? [
                      { date: "Aujourd'hui", text: `Agent ${agent.agent} activé (${agent.name})`, color: agent.color, type: "success" as const },
                    ] : []),
                    { date: "Aujourd'hui", text: "Compte créé sur Nawa Studio", color: "#7C63C8", type: "info" as const },
                    ...(profile?.sector ? [
                      { date: "Aujourd'hui", text: `Besoin qualifié : ${profile.sector}`, color: "#6B7280", type: "info" as const },
                    ] : []),
                  ].map((item, i) => (
                    <m.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      style={{
                        position: "relative", marginBottom: 24,
                        paddingBottom: 0,
                      }}
                    >
                      {/* Dot */}
                      <div style={{
                        position: "absolute", left: -28, top: 4,
                        width: 12, height: 12, borderRadius: "50%",
                        background: item.color,
                        border: "2px solid white",
                        boxShadow: `0 0 0 2px ${item.color}30`,
                      }} />
                      <p style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {item.date}
                      </p>
                      <p style={{ fontSize: 14, color: "#374151", margin: 0 }}>{item.text}</p>
                    </m.div>
                  ))}

                  {/* Placeholder for future activity */}
                  <m.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    style={{
                      position: "relative",
                      background: "#FAFAFA", borderRadius: 12,
                      border: "1.5px dashed #E2DAF6", padding: "24px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{
                      position: "absolute", left: -28, top: 20,
                      width: 12, height: 12, borderRadius: "50%",
                      background: "#E5E7EB", border: "2px solid white",
                    }} />
                    <p style={{ fontSize: 14, color: "#9CA3AF", margin: "0 0 4px" }}>
                      Les prochaines actions de votre agent apparaîtront ici.
                    </p>
                    <p style={{ fontSize: 12, color: "#D1D5DB", margin: 0 }}>
                      Sourcing, shortlists, entretiens, rapports...
                    </p>
                  </m.div>
                </div>
              </m.div>

              {/* Weekly summary placeholder */}
              <m.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                style={{
                  marginTop: 20,
                  background: "white", borderRadius: 16,
                  border: "1px solid #F0ECF8", padding: "28px",
                }}
              >
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "#111827", margin: "0 0 16px" }}>
                  Résumé hebdomadaire
                </h3>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 12,
                }}>
                  {[
                    { label: "Candidats identifiés", value: "—" },
                    { label: "Profils qualifiés", value: "—" },
                    { label: "Contacts envoyés", value: "—" },
                    { label: "Réponses reçues", value: "—" },
                  ].map((s, i) => (
                    <div key={i} style={{
                      background: "#FAFAFA", borderRadius: 12,
                      padding: "16px", textAlign: "center",
                      border: "1px solid #F0ECF8",
                    }}>
                      <p style={{ fontSize: 24, fontWeight: 700, color: "#D1D5DB", margin: "0 0 4px", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
                        {s.value}
                      </p>
                      <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </m.div>
            </m.div>
          )}
        </AnimatePresence>

        {/* ── Bottom Help Banner ─────────────────────────── */}
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          style={{
            marginTop: 40,
            background: "linear-gradient(135deg, #F8F6FF, #EEE9FB)",
            border: "1px solid #E2DAF6",
            borderRadius: 16,
            padding: "24px 28px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 24 }}>💡</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "#111827", margin: "0 0 4px" }}>
              Besoin d&apos;aide pour configurer votre agent ?
            </p>
            <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>
              Notre équipe vous accompagne à chaque étape. Réponse garantie sous 24h.
            </p>
          </div>
          <a
            href="mailto:contact@nawastudio.com"
            style={{
              fontSize: 13, fontWeight: 600, color: "#7C63C8",
              textDecoration: "none", padding: "10px 20px",
              border: "1.5px solid #7C63C8", borderRadius: 10,
              transition: "all 150ms", background: "white",
            }}
          >
            Nous contacter
          </a>
        </m.div>
      </main>
    </div>
  )
}
