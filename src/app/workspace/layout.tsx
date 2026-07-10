"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { Logo } from "@/components/ui/Logo"
import { ui } from "@/lib/ui-tokens"
import PendingDeletionBanner from "@/components/workspace/PendingDeletionBanner"
import { LockdownBanner } from "@/components/workspace/LockdownBanner"
import { MemberWaitingBanner } from "@/components/workspace/MemberWaitingBanner"
import { TrialBanner } from "@/components/trial/TrialBanner"
import { QuotaWarningBanner } from "@/components/quota/QuotaWarningBanner"
import { NavUnreadDot, UpdatesNavBadge } from "@/components/updates/UpdatesNavItem"
import { SupportButton } from "@/components/support/SupportButton"
import { hasActiveAccess, isInLockdown } from "@/lib/subscription"
import UndoToastHost from "@/components/ui/UndoToast"
import { getSupabase } from "@/lib/supabase"
import type { Database } from "@/lib/database.types"

type Profile = Database["public"]["Tables"]["profiles"]["Row"]
type Organization = Database["public"]["Tables"]["organizations"]["Row"]

interface WorkspaceCtx {
  profile: Profile | null
  organization: Organization | null
  userEmail: string
  hasSubscription: boolean
  /** En lockdown (sub past_due / canceled, dans la fenêtre de 15 j
   *  avant wipe). True = workspace en lecture seule : les composants
   *  doivent masquer leurs CTAs de mutation et désactiver les actions. */
  isReadOnly: boolean
  refetchProfile: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceCtx | null>(null)

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error("useWorkspace must be inside WorkspaceLayout")
  return ctx
}

const TABS: { href: string; label: string; live: boolean; showUnreadBadge?: boolean }[] = [
  { href: "/workspace",          label: "Accueil",  live: true },
  // Missions en 2e (E1, juin 2026) : c'est l'entrée principale du
  // sourceur — d'abord ouvrir une mission, puis y rattacher des CVs
  // (upload direct ou matcher le vivier).
  { href: "/workspace/missions", label: "Missions", live: true },
  { href: "/workspace/vivier",   label: "Vivier",   live: true },
  { href: "/workspace/pricing",  label: "Pricing",  live: true },
  { href: "/workspace/pipeline", label: "Pipeline", live: true },
  { href: "/nouveautes",         label: "Nouveautés", live: true, showUnreadBadge: true },
]

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
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

    let org: Organization | null = null
    if (prof?.organization_id) {
      const { data } = await sb
        .from("organizations")
        .select("*")
        .eq("id", prof.organization_id)
        .single()
      org = data ?? null
    }

    // Gates accès workspace, différents selon rôle :
    //
    //   OWNER
    //     - Pas de siège alloué -> bounce /organisation (il s'alloue)
    //     - Org sans accès actif ET pas en lockdown -> bounce /organisation
    //       (il souscrit ou réactive l'essai)
    //
    //   MEMBER
    //     - Toujours autorisé à entrer dans /workspace. Si org sans accès
    //       il voit le workspace nu avec un MemberWaitingBanner. Il ne
    //       peut pas modifier ce qui n'est pas là ; pas de risque produit.
    //     - Si pas de siège alloué : workspace en lecture seule (le member
    //       a accepté l'invite donc has_sourcing_seat=true par défaut ;
    //       cas où l'owner le désalloue plus tard).
    //
    // Sans cette différenciation, owner sans sub + member redirigé
    // /organisation -> /workspace -> /organisation -> ... boucle infinie.
    const isOwner = prof?.role === "owner"

    // Bypass admin Naywa : pas de gate de siège ni de paywall.
    if (prof?.is_admin) {
      setProfile(prof)
      setOrganization(org)
      setUserEmail(user.email ?? "")
      setReady(true)
      return
    }

    if (isOwner && prof && !prof.has_sourcing_seat) {
      router.replace("/organisation")
      return
    }

    if (isOwner && org && !hasActiveAccess(org) && !isInLockdown(org)) {
      router.replace("/organisation")
      return
    }

    setProfile(prof ?? null)
    setOrganization(org)
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

  // Whether the cabinet has reached the workspace at all. Real gating
  // (trial / Stripe subscription) is done above in the fetch effect.
  const hasSubscription = !!profile?.organization_id
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
        {t.showUnreadBadge && <UpdatesNavBadge />}
        {!t.showUnreadBadge && <NavUnreadDot href={t.href} />}
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
    <WorkspaceContext.Provider value={{
      profile, organization, userEmail, hasSubscription,
      // Read-only si :
      //   - lockdown actif (sub past_due / canceled, 15 j grace)
      //   - OU member dont l'org n'a pas d'accès actif (l'owner n'a pas
      //     encore souscrit) -> le member peut explorer mais rien créer.
      isReadOnly:
        // Les admins n'ont jamais de mode lecture seule (bypass paywall).
        !profile?.is_admin && (
          isInLockdown(organization) ||
          (profile?.role === "member" && !!organization && !hasActiveAccess(organization))
        ),
      refetchProfile: fetchProfile,
    }}>
      {/* Fond calme sur l'app connectée (dense) : on réserve le shader animé
          aux pages marketing. Un léger halo statique suffit à garder l'âme
          de la marque sans concurrencer le contenu. */}
      <div aria-hidden style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        background: `${ui.bg} radial-gradient(120% 80% at 100% 0%, rgba(184,174,222,0.10) 0%, rgba(248,246,255,0) 55%)`,
      }} />
      <div style={{ minHeight: "100vh", background: "transparent", position: "relative", zIndex: 2, fontFamily: "var(--font-inter), sans-serif" }}>
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
            <Link href="/" style={{ textDecoration: "none" }} title="Accueil naywastudio.com">
              <Logo size="md" />
            </Link>

            {/* Tabs — desktop (in header) */}
            <nav style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 18 }} className="ws-tabs">
              {tabLinks}
            </nav>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <SupportButton variant="compact" />

            <div ref={menuRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Mon profil"
                title={userEmail}
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
                      {userEmail}
                    </p>
                  </div>
                  <Link href="/profil" onClick={() => setMenuOpen(false)} style={MENU_ITEM}>
                    Mon profil
                  </Link>
                  {profile?.role === "owner" && (
                    <Link href="/organisation" onClick={() => setMenuOpen(false)} style={MENU_ITEM}>
                      Mon organisation
                    </Link>
                  )}
                  {profile?.is_admin && (
                    <Link href="/admin" onClick={() => setMenuOpen(false)} style={MENU_ITEM}>
                      Console admin
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

        <PendingDeletionBanner />
        {!profile?.is_admin && (
          <>
            <LockdownBanner
              organization={organization}
              isOwner={profile?.role === "owner"}
            />
            <MemberWaitingBanner
              organization={organization}
              role={profile?.role}
            />
          </>
        )}
        <TrialBanner
          organization={organization}
          isOwner={profile?.role === "owner"}
          isAdmin={!!profile?.is_admin}
        />
        <QuotaWarningBanner />
        {children}

        <UndoToastHost />
      </div>
    </WorkspaceContext.Provider>
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
