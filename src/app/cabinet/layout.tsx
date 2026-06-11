"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { Logo } from "@/components/ui/Logo"
import UndoToastHost from "@/components/ui/UndoToast"
import { TrialBanner } from "@/components/trial/TrialBanner"
import { getSupabase } from "@/lib/supabase"
import type { Organization, Profile } from "@/lib/database.types"

/**
 * Cabinet console — admin area for the org owner.
 *
 * Sits at /cabinet (top-level), distinct from the sourcing /workspace.
 * Header lets the owner switch back to the workspace tool with one click.
 *
 * Anyone signed-in can reach it (proxy guards the route). Pages inside
 * decide what they expose based on `profile.role`.
 */

interface CabinetCtx {
  profile: Profile
  organization: Organization
  userEmail: string
  emailConfirmed: boolean
  isOwner: boolean
  refetch: () => Promise<void>
}

const CabinetContext = createContext<CabinetCtx | null>(null)

export function useCabinet() {
  const ctx = useContext(CabinetContext)
  if (!ctx) throw new Error("useCabinet must be inside CabinetLayout")
  return ctx
}

export default function CabinetLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ctx, setCtx] = useState<CabinetCtx | null>(null)
  const [ready, setReady] = useState(false)

  const fetchAll = async () => {
    const sb = getSupabase()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { router.replace("/login"); return }

    const { data: profile } = await sb
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single()

    if (!profile) { router.replace("/login"); return }

    const { data: org } = await sb
      .from("organizations")
      .select("*")
      .eq("id", profile.organization_id)
      .single()

    if (!org) { router.replace("/workspace"); return }

    // Gate is per-page now: the dashboard (/cabinet) stays owner-only,
    // but /cabinet/parametrage is open to members in read-only so they
    // can consult the cabinet's pricing policy.
    setCtx({
      profile,
      organization: org,
      userEmail: user.email ?? "",
      emailConfirmed: !!user.email_confirmed_at,
      isOwner: profile.role === "owner",
      refetch: fetchAll,
    })
    setReady(true)
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  // First-time onboarding redirect : owners that never finished the
  // two-step flow are pushed to /cabinet/onboarding on every visit
  // until they either activate the trial or skip it. Members are
  // never redirected.
  useEffect(() => {
    if (!ctx) return
    if (!ctx.isOwner) return
    if (ctx.organization.cabinet_onboarded_at) return
    if (pathname === "/cabinet/onboarding") return
    router.replace("/cabinet/onboarding")
  }, [ctx, pathname, router])

  const handleLogout = async () => {
    await getSupabase().auth.signOut()
    router.replace("/")
  }

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [menuOpen])

  if (!ready || !ctx) {
    return (
      <div style={{
        minHeight: "100vh", background: "#FAFAFA",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Spinner />
      </div>
    )
  }

  const initial = (ctx.profile.first_name?.[0] ?? ctx.userEmail[0] ?? "?").toUpperCase()

  return (
    <CabinetContext.Provider value={ctx}>
      <div style={{ minHeight: "100vh", background: "#FAFAFA", fontFamily: "var(--font-inter), sans-serif" }}>
        <header style={{
          position: "sticky", top: 0, zIndex: 40,
          height: 60,
          background: "rgba(255,255,255,0.94)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid #F0ECF8",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link href="/workspace" title="Retour au workspace"
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
            <span style={{
              fontSize: 12, fontWeight: 700, color: "#7C63C8",
              background: "rgba(124,99,200,0.08)",
              border: "1px solid rgba(124,99,200,0.18)",
              padding: "4px 10px", borderRadius: 100,
              letterSpacing: "0.08em", textTransform: "uppercase",
              marginLeft: 12,
            }}>
              Console cabinet
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div ref={menuRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Mon profil"
                title={ctx.userEmail}
                style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: "linear-gradient(135deg, #F0ECF8 0%, #E2DAF6 100%)",
                  border: "1px solid rgba(124,99,200,0.30)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#7C63C8", fontWeight: 700, fontSize: 13,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {initial}
              </button>
              {menuOpen && (
                <div style={{
                  position: "absolute", top: 42, right: 0,
                  minWidth: 220, background: "white",
                  border: "1px solid #F0ECF8", borderRadius: 12,
                  boxShadow: "0 12px 32px rgba(124,99,200,0.18)",
                  padding: 6, zIndex: 50,
                  fontFamily: "var(--font-inter), sans-serif",
                }}>
                  <div style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid #F0ECF8", marginBottom: 4,
                  }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                      Connecté en tant que
                    </p>
                    <p style={{
                      margin: "2px 0 0", fontSize: 13, fontWeight: 600, color: "#111827",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {ctx.userEmail}
                    </p>
                  </div>
                  <Link href="/profil" onClick={() => setMenuOpen(false)} style={MENU_ITEM}>
                    Mon profil
                  </Link>
                  {ctx.profile.has_sourcing_seat && (
                    <Link href="/workspace" onClick={() => setMenuOpen(false)} style={MENU_ITEM}>
                      Mon workspace
                    </Link>
                  )}
                  <button
                    onClick={() => { setMenuOpen(false); handleLogout() }}
                    style={MENU_ITEM_DANGER}
                  >
                    Se déconnecter
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Hide the trial banner on the onboarding page itself — the
            owner is mid-flow and doesn't need a redundant nudge. */}
        {pathname !== "/cabinet/onboarding" && (
          <TrialBanner organization={ctx.organization} />
        )}
        {children}
        <UndoToastHost />
      </div>
    </CabinetContext.Provider>
  )
}

const MENU_ITEM: React.CSSProperties = {
  display: "block", padding: "9px 12px", borderRadius: 8,
  fontSize: 13, fontWeight: 500, color: "#374151",
  textDecoration: "none", transition: "background 150ms",
  cursor: "pointer",
}

const MENU_ITEM_DANGER: React.CSSProperties = {
  display: "block", width: "100%", padding: "9px 12px",
  borderRadius: 8, fontSize: 13, fontWeight: 500,
  color: "#EF4444", background: "transparent", border: "none",
  textAlign: "left", cursor: "pointer",
  fontFamily: "inherit", transition: "background 150ms",
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
