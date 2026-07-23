"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Logo } from "@/components/ui/Logo"
import { ShaderBackground } from "@/components/ui/ShaderBackground"
import UndoToastHost from "@/components/ui/UndoToast"
import { TrialBanner } from "@/components/trial/TrialBanner"
import { SupportButton } from "@/components/support/SupportButton"
import { getSupabase } from "@/lib/supabase"
import type { Organization, Profile } from "@/lib/database.types"
import { getCapabilities, type Capabilities } from "@/lib/capabilities"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const copy = {
  fr: {
    openWorkspace: "Ouvrir le workspace",
    workspace: "Workspace",
    homeTitle: "Accueil naywastudio.com",
    orgConsole: "Console organisation",
    myProfileAria: "Mon profil",
    loggedInAs: "Connecté en tant que",
    myProfile: "Mon profil",
    myWorkspace: "Mon workspace",
    updates: "Nouveautés",
    adminConsole: "Console admin",
    logout: "Se déconnecter",
  },
  en: {
    openWorkspace: "Open workspace",
    workspace: "Workspace",
    homeTitle: "naywastudio.com home",
    orgConsole: "Organization console",
    myProfileAria: "My profile",
    loggedInAs: "Signed in as",
    myProfile: "My profile",
    myWorkspace: "My workspace",
    updates: "Updates",
    adminConsole: "Admin console",
    logout: "Sign out",
  },
}

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
  /** Capacités calculées (source unique getCapabilities) — chaque section de
   *  la console gate son affichage dessus (branding / pricing / équipe /
   *  facturation…). */
  caps: Capabilities
  /** Rétro-compat : « peut gérer une config » = a au moins une cap de config
   *  (branding OU pricing). Ne vaut PAS facturation, sièges ni zone de danger. */
  canManageSettings: boolean
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
  const { lang } = useLanguage()
  const t = copy[lang]
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
    const caps = getCapabilities(profile)
    setCtx({
      profile,
      organization: org,
      userEmail: user.email ?? "",
      emailConfirmed: !!user.email_confirmed_at,
      isOwner: profile.role === "owner",
      caps,
      canManageSettings: caps.canBranding || caps.canPricing,
      refetch: fetchAll,
    })
    setReady(true)
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  // First-time onboarding redirect : owners that never finished the
  // 3-step flow are pushed to /onboarding on every visit until they
  // either activate the trial or skip it. Members are never redirected.
  useEffect(() => {
    if (!ctx) return
    if (!ctx.isOwner) return
    if (ctx.organization.cabinet_onboarded_at) return
    router.replace("/onboarding")
  }, [ctx, router])

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
        minHeight: "100vh", background: "var(--nw-bg)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Spinner />
      </div>
    )
  }

  const initial = (ctx.profile.first_name?.[0] ?? ctx.userEmail[0] ?? "?").toUpperCase()

  return (
    <CabinetContext.Provider value={ctx}>
      <ShaderBackground />
      <div style={{ minHeight: "100vh", background: "transparent", position: "relative", zIndex: 2, fontFamily: "var(--font-inter), sans-serif" }}>
        <header style={{
          position: "sticky", top: 0, zIndex: 40,
          height: 60,
          background: "rgba(255,255,255,0.94)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid var(--nw-border-soft)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Pont vers le workspace — labellisé. Ouvert à tout membre de
                l'org : avec un siège = accès complet, sans siège = lecture
                seule (il consulte). Sans ce lien, un owner sans siège n'aurait
                AUCUN chemin vers le workspace de sa propre organisation. */}
            {ctx.caps.canViewWorkspace && (
              <Link href="/workspace" title={t.openWorkspace}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "7px 12px", borderRadius: 9,
                  border: "1px solid rgba(124,99,200,0.30)", background: "white",
                  color: "var(--nw-primary)", fontSize: 12.5, fontWeight: 700,
                  textDecoration: "none", whiteSpace: "nowrap",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {t.workspace}
              </Link>
            )}
            <Link href="/" style={{ textDecoration: "none" }} title={t.homeTitle}>
              <Logo size="md" />
            </Link>
            <span style={{
              fontSize: 12, fontWeight: 700, color: "var(--nw-primary)",
              background: "rgba(124,99,200,0.08)",
              border: "1px solid rgba(124,99,200,0.18)",
              padding: "4px 10px", borderRadius: 100,
              letterSpacing: "0.08em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
              marginLeft: 12,
            }}>
              {t.orgConsole}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <SupportButton variant="compact" />
            <div ref={menuRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label={t.myProfileAria}
                title={ctx.userEmail}
                style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: "linear-gradient(135deg, var(--nw-border-soft) 0%, var(--nw-primary-100) 100%)",
                  border: "1px solid rgba(124,99,200,0.30)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--nw-primary)", fontWeight: 700, fontSize: 13,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {initial}
              </button>
              {menuOpen && (
                <div style={{
                  position: "absolute", top: 42, right: 0,
                  minWidth: 220, background: "white",
                  border: "1px solid var(--nw-border-soft)", borderRadius: 12,
                  boxShadow: "0 12px 32px rgba(124,99,200,0.18)",
                  padding: 6, zIndex: 50,
                  fontFamily: "var(--font-inter), sans-serif",
                }}>
                  <div style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid var(--nw-border-soft)", marginBottom: 4,
                  }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "var(--nw-text-muted)", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                      {t.loggedInAs}
                    </p>
                    <p style={{
                      margin: "2px 0 0", fontSize: 13, fontWeight: 600, color: "var(--nw-text)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {ctx.userEmail}
                    </p>
                  </div>
                  <Link href="/profil" onClick={() => setMenuOpen(false)} style={MENU_ITEM}>
                    {t.myProfile}
                  </Link>
                  {ctx.caps.canViewWorkspace && (
                    <Link href="/workspace" onClick={() => setMenuOpen(false)} style={MENU_ITEM}>
                      {t.myWorkspace}
                    </Link>
                  )}
                  <Link href="/nouveautes" onClick={() => setMenuOpen(false)} style={MENU_ITEM}>
                    {t.updates}
                  </Link>
                  {ctx.profile.is_admin && (
                    <Link href="/admin" onClick={() => setMenuOpen(false)} style={MENU_ITEM}>
                      {t.adminConsole}
                    </Link>
                  )}
                  <button
                    onClick={() => { setMenuOpen(false); handleLogout() }}
                    style={MENU_ITEM_DANGER}
                  >
                    {t.logout}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <TrialBanner organization={ctx.organization} isOwner={ctx.isOwner} isAdmin={!!ctx.profile.is_admin} />
        {children}
        <UndoToastHost />
      </div>
    </CabinetContext.Provider>
  )
}

const MENU_ITEM: React.CSSProperties = {
  display: "block", padding: "9px 12px", borderRadius: 8,
  fontSize: 13, fontWeight: 500, color: "var(--nw-text-body)",
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
      <circle cx="12" cy="12" r="10" stroke="var(--nw-primary-100)" strokeWidth="3" fill="none" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--nw-primary)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  )
}
