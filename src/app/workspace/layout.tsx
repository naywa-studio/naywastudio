"use client"

import { createContext, useContext, useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Logo } from "@/components/ui/Logo"
import { getSupabase } from "@/lib/supabase"
import { AGENT_LEVELS } from "@/lib/mock-store"
import type { Database } from "@/lib/database.types"

type Profile = Database["public"]["Tables"]["profiles"]["Row"]
type SubscriptionLevel = NonNullable<Profile["subscription_level"]>

const IS_DEV = process.env.NODE_ENV === "development"
const ADMIN_EMAILS = ["elyas.malki1003@gmail.com"]
const DEV_LEVELS: { level: SubscriptionLevel; label: string; color: string }[] = [
  { level: "leo",  label: "Léo N1",  color: "#22c55e" },
  { level: "nora", label: "Nora N2", color: "#3b82f6" },
  { level: "alex", label: "Alex N3", color: "#7C63C8" },
]

/* ── Context ──────────────────────────────────────────────────── */

interface WorkspaceCtx {
  profile: Profile | null
  userEmail: string
  agentLevel: number
  hasSubscription: boolean
  isProvisioning: boolean
  refetchProfile: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceCtx | null>(null)

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error("useWorkspace must be inside WorkspaceLayout")
  return ctx
}

const LEVEL_MAP: Record<string, number> = { leo: 1, nora: 2, alex: 3 }

/* ── Layout ──────────────────────────────────────────────────── */

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [userEmail, setUserEmail] = useState("")
  const [ready, setReady] = useState(false)

  const fetchProfile = async () => {
    const sb = getSupabase()
    const { data: { user } } = await sb.auth.getUser()

    if (!user) {
      router.replace("/login")
      return
    }

    setUserEmail(user.email ?? "")

    const { data: prof } = await sb
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single()

    // Si le profil n'a pas de prénom (ex: Google OAuth), on le prend depuis user_metadata
    if (prof && !prof.first_name) {
      const meta = user.user_metadata ?? {}
      const fullName: string = meta.full_name ?? meta.name ?? ""
      const derivedFirst = fullName.split(" ")[0] ?? ""
      if (derivedFirst) {
        await sb.from("profiles").update({ first_name: derivedFirst }).eq("user_id", user.id)
        prof.first_name = derivedFirst
      }
    }

    setProfile(prof ?? null)
    setReady(true)
  }

  useEffect(() => {
    fetchProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const handleLogout = async () => {
    await getSupabase().auth.signOut()
    router.replace("/")
  }

  const handleDevSwitch = useCallback(async (level: SubscriptionLevel) => {
    const sb = getSupabase()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    await sb
      .from("profiles")
      .update({ subscription_level: level, vps_status: "ready", agent_status: "running" })
      .eq("user_id", user.id)
    await fetchProfile()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!ready) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#FAFAFA",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Spinner />
      </div>
    )
  }

  const hasSubscription = !!profile?.subscription_level
  const agentLevel = profile?.subscription_level ? (LEVEL_MAP[profile.subscription_level] ?? 1) : 0
  const agent = AGENT_LEVELS[agentLevel] ?? AGENT_LEVELS[1]
  const isAdmin = ADMIN_EMAILS.includes(userEmail)

  // Provisioning = subscribed but VPS not ready yet
  const isProvisioning =
    hasSubscription &&
    (profile?.vps_status === "pending" || profile?.vps_status === "provisioning")

  return (
    <WorkspaceContext.Provider value={{ profile, userEmail, agentLevel, hasSubscription, isProvisioning, refetchProfile: fetchProfile }}>
      <div style={{ minHeight: "100vh", background: "#FAFAFA" }}>
        {/* Header */}
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 40,
            height: 60,
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid #F0ECF8",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
          }}
        >
          {/* Left */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/" style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 32, height: 32, borderRadius: 8,
              border: "1.5px solid #E2DAF6", background: "white",
              color: "#7C63C8", textDecoration: "none", flexShrink: 0,
              transition: "background 150ms, border-color 150ms",
            }}
              title="Retour à l'accueil"
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                <path d="M3 10l7-7 7 7M5 8v7a1 1 0 001 1h3v-4h2v4h3a1 1 0 001-1V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
            <Link href="/workspace" style={{ textDecoration: "none" }}>
              <Logo size="md" />
            </Link>
          </div>

          {/* Right */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* ── LEVEL SWITCHER (dev + admin emails) ─────────────── */}
            {(IS_DEV || isAdmin) && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  background: "#1a1a2e",
                  border: "1px solid #333",
                  borderRadius: 10,
                  padding: "3px 4px",
                  fontFamily: "var(--font-inter), monospace",
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 700, color: "#666", letterSpacing: 1, padding: "0 4px", textTransform: "uppercase" }}>
                  DEV
                </span>
                {DEV_LEVELS.map(({ level, label, color }) => {
                  const active = profile?.subscription_level === level
                  return (
                    <button
                      key={level}
                      onClick={() => handleDevSwitch(level)}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "3px 9px",
                        borderRadius: 7,
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        transition: "all 0.15s",
                        background: active ? color : "transparent",
                        color: active ? "#fff" : "#666",
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Agent badge — visible uniquement si abonné */}
            {hasSubscription && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "5px 12px",
                  borderRadius: 999,
                  color: agent.color,
                  background: agent.colorLight,
                  border: `1px solid ${agent.borderColor}`,
                  fontFamily: "var(--font-inter), sans-serif",
                }}
              >
                <span>{agent.icon}</span>
                Mon agent&nbsp;: {agent.agent}
              </span>
            )}

            {/* Email */}
            <span
              style={{
                fontSize: 12,
                color: "#9CA3AF",
                fontFamily: "var(--font-inter), sans-serif",
                maxWidth: 180,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "none",
              }}
              className="workspace-email"
            >
              {userEmail}
            </span>

            {/* Logout */}
            <button
              onClick={handleLogout}
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "#9CA3AF",
                background: "transparent",
                border: "1px solid #E5E7EB",
                borderRadius: 8,
                padding: "6px 12px",
                cursor: "pointer",
                fontFamily: "var(--font-inter), sans-serif",
              }}
            >
              Déconnexion
            </button>
          </div>
        </header>

        <style>{`
          @media (min-width: 640px) {
            .workspace-email { display: block !important; }
          }
        `}</style>

        {children}
      </div>
    </WorkspaceContext.Provider>
  )
}

function Spinner() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" style={{ animation: "spin 0.8s linear infinite" }}>
      <circle cx="12" cy="12" r="10" stroke="#E2DAF6" strokeWidth="3" fill="none" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="#7C63C8" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  )
}
