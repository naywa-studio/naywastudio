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

const TABS: { href: string; label: string }[] = [
  { href: "/admin",          label: "Tableau de bord" },
  { href: "/admin/maj",      label: "Nouveautés" },
  { href: "/admin/recherche", label: "Recherche" },
  { href: "/admin/demandes", label: "Demandes" },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
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
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--nw-surface-muted)" }}>
        <span style={{ color: "var(--nw-text-muted)", fontSize: 14, fontFamily: "var(--font-inter), sans-serif" }}>
          Chargement…
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
          borderBottom: "1px solid var(--nw-border-soft)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link href="/" style={{ textDecoration: "none" }} title="Accueil naywastudio.com">
              <Logo size="md" />
            </Link>
            <span style={{
              fontSize: 11, fontWeight: 800, color: "white",
              background: "linear-gradient(135deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
              padding: "4px 10px", borderRadius: 100,
              letterSpacing: "0.10em", textTransform: "uppercase",
              marginLeft: 8,
            }}>
              Admin
            </span>
            <nav style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 16 }}>
              {TABS.map((t) => {
                const active = isActive(t.href)
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    style={{
                      position: "relative",
                      fontSize: 13,
                      fontWeight: active ? 700 : 500,
                      color: active ? "var(--nw-primary)" : "var(--nw-text-secondary)",
                      textDecoration: "none",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: active ? "rgba(124,99,200,0.08)" : "transparent",
                      whiteSpace: "nowrap",
                      transition: "background 150ms, color 150ms",
                    }}
                  >
                    {t.label}
                  </Link>
                )
              })}
            </nav>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link href="/workspace" style={{
              fontSize: 12, fontWeight: 600, color: "var(--nw-text-muted)",
              textDecoration: "none", padding: "6px 10px",
              border: "1px solid var(--nw-border)", borderRadius: 8, background: "white",
            }}>
              Workspace →
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              aria-label={`Connecté en tant que ${ctx.userEmail}. Déconnexion`}
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
          </div>
        </header>
        {children}
      </div>
    </AdminContext.Provider>
  )
}
