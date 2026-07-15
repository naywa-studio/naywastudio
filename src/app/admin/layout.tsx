"use client"

/**
 * Layout console admin Naywa. Protégé côté server via une vérification
 * is_admin avant rendu — un non-admin est redirigé vers /workspace.
 *
 * Header dédié (différent de workspace + organisation) avec :
 *   - badge ADMIN (rappel permanent qu'on est dans la console)
 *   - 4 onglets : Tableau de bord / Nouveautés / Recherche / Demandes
 *   - dropdown profil pour sortir vite vers workspace ou se déco
 */

import { createContext, useContext, useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { Logo } from "@/components/ui/Logo"
import { ShaderBackground } from "@/components/ui/ShaderBackground"
import { getSupabase } from "@/lib/supabase"
import type { Profile } from "@/lib/database.types"
import { useLanguage, type Lang } from "@/lib/i18n/LanguageContext"

interface AdminCtx {
  profile: Profile
  userEmail: string
}

const AdminContext = createContext<AdminCtx | null>(null)

export function useAdmin() {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error("useAdmin must be inside AdminLayout")
  return ctx
}

const TABS: Record<Lang, { href: string; label: string }[]> = {
  fr: [
    { href: "/admin",          label: "Tableau de bord" },
    { href: "/admin/maj",      label: "Nouveautés" },
    { href: "/admin/recherche", label: "Recherche" },
    { href: "/admin/demandes", label: "Demandes" },
  ],
  en: [
    { href: "/admin",          label: "Dashboard" },
    { href: "/admin/maj",      label: "Updates" },
    { href: "/admin/recherche", label: "Search" },
    { href: "/admin/demandes", label: "Requests" },
  ],
}

const copy = {
  fr: {
    loading: "Chargement…",
    homeTitle: "Accueil naywastudio.com",
    workspace: "Workspace →",
    loggedInAs: (email: string) => `Connecté en tant que ${email}. Déconnexion`,
  },
  en: {
    loading: "Loading…",
    homeTitle: "naywastudio.com home",
    workspace: "Workspace →",
    loggedInAs: (email: string) => `Signed in as ${email}. Sign out`,
  },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { lang } = useLanguage()
  const t = copy[lang]
  const tabs = TABS[lang]
  const [ctx, setCtx] = useState<AdminCtx | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const sb = getSupabase()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { router.replace("/login?next=/admin"); return }
      const { data: profile } = await sb
        .from("profiles").select("*").eq("user_id", user.id).maybeSingle()
      if (cancelled) return
      if (!profile?.is_admin) {
        router.replace("/workspace")
        return
      }
      setCtx({ profile, userEmail: user.email ?? "" })
      setReady(true)
    })()
    return () => { cancelled = true }
  }, [router])

  const handleLogout = async () => {
    await getSupabase().auth.signOut()
    router.replace("/")
  }

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href)

  if (!ready || !ctx) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAFA" }}>
        <span style={{ color: "#6B7280", fontSize: 14, fontFamily: "var(--font-inter), sans-serif" }}>
          {t.loading}
        </span>
      </div>
    )
  }

  const initial = (ctx.profile.first_name?.[0] ?? ctx.userEmail[0] ?? "?").toUpperCase()

  return (
    <AdminContext.Provider value={ctx}>
      <ShaderBackground />
      <div style={{
        minHeight: "100vh", background: "transparent",
        position: "relative", zIndex: 2,
        fontFamily: "var(--font-inter), sans-serif",
      }}>
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
            <Link href="/" style={{ textDecoration: "none" }} title={t.homeTitle}>
              <Logo size="md" />
            </Link>
            <span style={{
              fontSize: 11, fontWeight: 800, color: "white",
              background: "linear-gradient(135deg, #7C63C8 0%, #6B54B2 100%)",
              padding: "4px 10px", borderRadius: 100,
              letterSpacing: "0.10em", textTransform: "uppercase",
              marginLeft: 8,
            }}>
              Admin
            </span>
            <nav style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 16 }}>
              {tabs.map((tab) => {
                const active = isActive(tab.href)
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    style={{
                      position: "relative",
                      fontSize: 13,
                      fontWeight: active ? 700 : 500,
                      color: active ? "#7C63C8" : "#4B5563",
                      textDecoration: "none",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: active ? "rgba(124,99,200,0.08)" : "transparent",
                      whiteSpace: "nowrap",
                      transition: "background 150ms, color 150ms",
                    }}
                  >
                    {tab.label}
                  </Link>
                )
              })}
            </nav>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link href="/workspace" style={{
              fontSize: 12, fontWeight: 600, color: "#6B7280",
              textDecoration: "none", padding: "6px 10px",
              border: "1px solid #E5E7EB", borderRadius: 8, background: "white",
            }}>
              {t.workspace}
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              aria-label={t.loggedInAs(ctx.userEmail)}
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
          </div>
        </header>
        {children}
      </div>
    </AdminContext.Provider>
  )
}
