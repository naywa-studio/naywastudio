"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { Logo } from "@/components/ui/Logo"
import { NoraAssistant } from "@/components/workspace/NoraAssistant"
import UndoToastHost from "@/components/ui/UndoToast"
import { getSupabase } from "@/lib/supabase"
import type { Database } from "@/lib/database.types"

type Profile = Database["public"]["Tables"]["profiles"]["Row"]

interface WorkspaceCtx {
  profile: Profile | null
  userEmail: string
  hasSubscription: boolean
  refetchProfile: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceCtx | null>(null)

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error("useWorkspace must be inside WorkspaceLayout")
  return ctx
}

const TABS: { href: string; label: string; live: boolean }[] = [
  { href: "/workspace",          label: "Accueil",  live: true },
  { href: "/workspace/vivier",   label: "Vivier",   live: true },
  { href: "/workspace/missions", label: "Missions", live: true },
  { href: "/workspace/pricing",  label: "Pricing",  live: true },
  { href: "/workspace/pipeline", label: "Pipeline", live: true },
]

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [userEmail, setUserEmail] = useState("")
  const [ready, setReady] = useState(false)

  const fetchProfile = async () => {
    const sb = getSupabase()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { router.replace("/login"); return }

    setUserEmail(user.email ?? "")

    const { data: prof } = await sb
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single()

    // Auto-derive first_name from Google OAuth metadata if missing
    if (prof && !prof.first_name) {
      const meta = user.user_metadata ?? {}
      const fullName: string = meta.full_name ?? meta.name ?? ""
      const derived = fullName.split(" ")[0] ?? ""
      if (derived) {
        await sb.from("profiles").update({ first_name: derived }).eq("user_id", user.id)
        prof.first_name = derived
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

  if (!ready) {
    return (
      <div style={{
        minHeight: "100vh", background: "#FAFAFA",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Spinner />
      </div>
    )
  }

  const hasSubscription = !!profile?.subscription_level
  const firstName = profile?.first_name?.trim() || null
  const initial = (firstName?.[0] ?? userEmail[0] ?? "?").toUpperCase()

  const isActive = (href: string) =>
    href === "/workspace" ? pathname === "/workspace" : pathname.startsWith(href)

  const tabLinks = TABS.map((t) => {
    const active = isActive(t.href)
    const disabled = !t.live
    return (
      <Link
        key={t.href}
        href={t.live ? t.href : "#"}
        onClick={(e) => { if (disabled) e.preventDefault() }}
        aria-disabled={disabled}
        style={{
          position: "relative",
          fontSize: 13,
          fontWeight: active ? 700 : 500,
          color: disabled ? "#C4B6E0" : active ? "#7C63C8" : "#4B5563",
          textDecoration: "none",
          padding: "8px 12px",
          borderRadius: 8,
          background: active ? "rgba(124,99,200,0.08)" : "transparent",
          cursor: disabled ? "not-allowed" : "pointer",
          display: "inline-flex", alignItems: "center", gap: 6,
          whiteSpace: "nowrap",
          transition: "background 150ms, color 150ms",
        }}
      >
        {t.label}
        {disabled && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: "#9CA3AF",
            background: "#F3F4F6", border: "1px solid #E5E7EB",
            padding: "2px 6px", borderRadius: 100,
            letterSpacing: "0.04em", textTransform: "uppercase",
          }}>
            Bientôt
          </span>
        )}
      </Link>
    )
  })

  return (
    <WorkspaceContext.Provider value={{ profile, userEmail, hasSubscription, refetchProfile: fetchProfile }}>
      <div style={{ minHeight: "100vh", background: "#FAFAFA", fontFamily: "var(--font-inter), sans-serif" }}>
        {/* Top bar */}
        <header
          style={{
            position: "sticky", top: 0, zIndex: 40,
            height: 60,
            background: "rgba(255,255,255,0.94)",
            backdropFilter: "blur(14px)",
            borderBottom: "1px solid #F0ECF8",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link href="/" title="Retour au site"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 30, height: 30, borderRadius: 8,
                border: "1px solid #E2DAF6", background: "white",
                color: "#7C63C8", textDecoration: "none",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
            <Link href="/workspace" style={{ textDecoration: "none" }}>
              <Logo size="md" />
            </Link>

            {/* Tabs — desktop (in header) */}
            <nav style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 18 }} className="ws-tabs">
              {tabLinks}
            </nav>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 11, fontWeight: 700, color: "#7C63C8",
              background: "rgba(124,99,200,0.08)",
              border: "1px solid rgba(124,99,200,0.18)",
              padding: "4px 10px", borderRadius: 100,
              letterSpacing: "0.08em", textTransform: "uppercase",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7C63C8" }} />
              Beta
            </span>

            <div title={userEmail}
              style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "linear-gradient(135deg, #F0ECF8 0%, #E2DAF6 100%)",
                border: "1px solid rgba(124,99,200,0.30)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#7C63C8", fontWeight: 700, fontSize: 13,
              }}>
              {initial}
            </div>

            <button
              onClick={handleLogout}
              style={{
                fontSize: 12, fontWeight: 500, color: "#6B7280",
                background: "transparent", border: "1px solid #E5E7EB",
                borderRadius: 8, padding: "6px 12px", cursor: "pointer",
              }}
            >
              Déconnexion
            </button>
          </div>
        </header>

        {/* Tabs — mobile (second sticky row, horizontally scrollable) */}
        <nav className="ws-tabs-mobile" style={{
          display: "none",
          position: "sticky", top: 60, zIndex: 39,
          background: "rgba(255,255,255,0.94)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid #F0ECF8",
          padding: "6px 12px",
          gap: 2,
          overflowX: "auto",
        }}>
          {tabLinks}
        </nav>

        <style>{`
          @media (max-width: 720px) {
            .ws-tabs { display: none !important; }
            .ws-tabs-mobile { display: flex !important; }
          }
        `}</style>

        {children}

        <NoraAssistant />
        <UndoToastHost />
      </div>
    </WorkspaceContext.Provider>
  )
}

function Spinner() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" style={{ animation: "spin 0.8s linear infinite" }}>
      <circle cx="12" cy="12" r="10" stroke="#E2DAF6" strokeWidth="3" fill="none" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="#7C63C8" strokeWidth="3" fill="none" strokeLinecap="round" />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  )
}
