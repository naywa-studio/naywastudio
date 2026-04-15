"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Logo } from "@/components/ui/Logo"
import { getSupabase } from "@/lib/supabase"
import { AGENT_LEVELS } from "@/lib/mock-store"
import type { Database } from "@/lib/database.types"

type Profile = Database["public"]["Tables"]["profiles"]["Row"]

/* ── Context ──────────────────────────────────────────────────── */

interface WorkspaceCtx {
  profile: Profile | null
  userEmail: string
  agentLevel: number
  hasSubscription: boolean
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

  useEffect(() => {
    const init = async () => {
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

      setProfile(prof ?? null)
      setReady(true)
    }
    init()
  }, [router])

  const handleLogout = async () => {
    await getSupabase().auth.signOut()
    router.replace("/")
  }

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

  return (
    <WorkspaceContext.Provider value={{ profile, userEmail, agentLevel, hasSubscription }}>
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
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link href="/workspace" style={{ textDecoration: "none" }}>
              <Logo size="md" />
            </Link>
            <Link
              href="/workspace"
              style={{
                fontSize: 13,
                color: "#6B7280",
                textDecoration: "none",
                fontFamily: "var(--font-inter), sans-serif",
              }}
            >
              Workspace
            </Link>
          </div>

          {/* Right */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" stroke="#E2DAF6" strokeWidth="3" fill="none" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="#7C63C8" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  )
}
