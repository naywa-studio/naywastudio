"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { Logo } from "@/components/ui/Logo"
import { ui } from "@/lib/ui-tokens"
import PendingDeletionBanner from "@/components/workspace/PendingDeletionBanner"
import { LockdownBanner } from "@/components/workspace/LockdownBanner"
import { MemberWaitingBanner } from "@/components/workspace/MemberWaitingBanner"
import { SeatReadOnlyBanner } from "@/components/workspace/SeatReadOnlyBanner"
import { TrialBanner } from "@/components/trial/TrialBanner"
import { QuotaWarningBanner } from "@/components/quota/QuotaWarningBanner"
import { NavUnreadDot, UpdatesNavBadge } from "@/components/updates/UpdatesNavItem"
import { SupportButton } from "@/components/support/SupportButton"
import { isWorkspaceReadOnly, hasActiveAccess, graceInfo, hasPricingAccess } from "@/lib/subscription"
import { getCapabilities } from "@/lib/capabilities"
import UndoToastHost from "@/components/ui/UndoToast"
import { getSupabase } from "@/lib/supabase"
import type { Database } from "@/lib/database.types"
import { useLanguage, type Lang } from "@/lib/i18n/LanguageContext"

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

const TABS: Record<Lang, { href: string; label: string; showUnreadBadge?: boolean; requiresPricing?: boolean }[]> = {
  fr: [
    { href: "/workspace",          label: "Accueil" },
    // Missions en 2e (E1, juin 2026) : c'est l'entrée principale du
    // sourceur — d'abord ouvrir une mission, puis y rattacher des CVs
    // (upload direct ou matcher le vivier).
    { href: "/workspace/missions", label: "Missions" },
    { href: "/workspace/vivier",   label: "Vivier" },
    // Onglet gaté : la Suite Pricing est une option payante. Il était codé en
    // dur, donc visible par tous les clients Sourcing — la porte d'entrée de la
    // fuite de monétisation.
    { href: "/workspace/pricing",  label: "Pricing", requiresPricing: true },
    { href: "/workspace/pipeline", label: "Pipeline" },
    { href: "/nouveautes",         label: "Nouveautés", showUnreadBadge: true },
  ],
  en: [
    { href: "/workspace",          label: "Home" },
    { href: "/workspace/missions", label: "Missions" },
    { href: "/workspace/vivier",   label: "Talent pool" },
    { href: "/workspace/pricing",  label: "Pricing", requiresPricing: true },
    { href: "/workspace/pipeline", label: "Pipeline" },
    { href: "/nouveautes",         label: "Updates", showUnreadBadge: true },
  ],
}

const copy = {
  fr: {
    backToSite: "Retour au site",
    homeTitle: "Accueil naywastudio.com",
    orgConsole: "Console organisation",
    organization: "Organisation",
    myProfileAria: "Mon profil",
    loggedInAs: "Connecté en tant que",
    myProfile: "Mon profil",
    myOrganization: "Mon organisation",
    adminConsole: "Console admin",
    logout: "Se déconnecter",
  },
  en: {
    backToSite: "Back to site",
    homeTitle: "naywastudio.com home",
    orgConsole: "Organization console",
    organization: "Organization",
    myProfileAria: "My profile",
    loggedInAs: "Signed in as",
    myProfile: "My profile",
    myOrganization: "My organization",
    adminConsole: "Admin console",
    logout: "Sign out",
  },
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { lang } = useLanguage()
  const t = copy[lang]
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

    // Accès workspace :
    //
    //   - Admin Naywa : bypass total (ni siège ni paywall).
    //   - Tout membre de l'org (owner comme member) PEUT entrer. Sans siège, il
    //     y est en LECTURE SEULE : il est invité dans l'org, il consulte sans
    //     pouvoir muter (mutations bloquées serveur via requireActiveAccess ET
    //     UI grisée via isReadOnly). Avec un siège : accès complet.
    //   - Seul bounce vers /organisation : une org SANS accès actif ET SANS
    //     fenêtre de grâce (essai jamais activé, mi-onboarding) — il n'y a rien
    //     à consulter, l'owner doit d'abord activer / souscrire.
    //
    // (Avant : owner sans siège était bounce, ce qui l'empêchait de consulter
    // le workspace de sa propre organisation.)
    const isOwner = prof?.role === "owner"

    // Bypass admin Naywa : pas de gate de siège ni de paywall.
    if (prof?.is_admin) {
      setProfile(prof)
      setOrganization(org)
      setUserEmail(user.email ?? "")
      setReady(true)
      return
    }

    // Owner avec siège mais sans accès actif : on ne le bounce vers
    // /organisation QUE s'il n'y a AUCUNE fenêtre de grâce en cours. En grâce
    // (résiliation / impayé / essai expiré / suppression programmée) il reste
    // dans le workspace en LECTURE SEULE pour consulter, exporter et réactiver
    // / annuler depuis les bannières. Le cas "aucun accès + aucune grâce" =
    // essai jamais activé (mid-onboarding) → retour /organisation.
    if (isOwner && org && !hasActiveAccess(org) && !graceInfo(org).cause) {
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
        minHeight: "100vh", background: "var(--nw-bg)",
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

  // L'onglet Pricing ne s'affiche que si l'option est acquise. Le vrai
  // périmètre de sécurité reste serveur (requirePricingAccess) : masquer un
  // lien n'empêche personne de taper l'URL.
  const canPricing = hasPricingAccess(organization, { isAdmin: profile?.is_admin === true })

  // Accès à la console organisation = a une raison d'y aller : owner/admin, ou
  // membre habilité au branding et/ou au pricing. Source unique = getCapabilities.
  // (Distinct de `canPricing` ci-dessus, qui est l'ENTITLEMENT Suite Pricing.)
  const orgCaps = getCapabilities(profile)
  const canReachOrgConsole = orgCaps.isOrgAdmin || orgCaps.canBranding || orgCaps.canPricing
  // Calculé une fois : réutilisé pour isReadOnly. Éviter de recomparer
  // `profile?.is_admin === true` à l'intérieur d'une expression déjà gardée par
  // `!== true` (TS narrow le type et rejette la 2ᵉ comparaison comme impossible).
  const isAdminUser = profile?.is_admin === true

  const tabLinks = TABS[lang].filter((tab) => !tab.requiresPricing || canPricing).map((tab) => {
    const active = isActive(tab.href)
    return (
      <Link
        key={tab.href}
        href={tab.href}
        data-active={active || undefined}
        style={{
          position: "relative",
          fontSize: 13,
          fontWeight: active ? 700 : 500,
          color: active ? "var(--nw-primary)" : "var(--nw-text-secondary)",
          textDecoration: "none",
          padding: "8px 12px",
          borderRadius: 8,
          background: active ? "rgba(124,99,200,0.08)" : "transparent",
          cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 6,
          whiteSpace: "nowrap",
          transition: "background 150ms, color 150ms",
        }}
      >
        {tab.label}
        {tab.showUnreadBadge && <UpdatesNavBadge />}
        {!tab.showUnreadBadge && <NavUnreadDot href={tab.href} />}
      </Link>
    )
  })

  return (
    <WorkspaceContext.Provider value={{
      profile, organization, userEmail, hasSubscription,
      // Lecture seule si : suppression programmée / plus d'accès actif
      // (isWorkspaceReadOnly), OU pas de siège alloué (membre invité qui
      // consulte sans muter). Admin Naywa = jamais en lecture seule.
      isReadOnly:
        !isAdminUser &&
        (isWorkspaceReadOnly(organization, { isAdmin: isAdminUser }) ||
          profile?.has_sourcing_seat !== true),
      refetchProfile: fetchProfile,
    }}>
      {/* Fond calme sur l'app connectée (dense) : on réserve le shader animé
          aux pages marketing. Un léger halo statique suffit à garder l'âme
          de la marque sans concurrencer le contenu. */}
      <div aria-hidden style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        // Voile violet très léger en haut à droite. Le point d'arrivée est
        // transparent (et non l'ancien lavande opaque #F8F6FF) : sur le fond
        // papier, une couleur froide en fin de dégradé faisait une tache.
        background: `${ui.bg} radial-gradient(120% 80% at 100% 0%, rgba(123,99,200,0.07) 0%, rgba(123,99,200,0) 55%)`,
      }} />
      <div style={{ minHeight: "100vh", background: "transparent", position: "relative", zIndex: 2, fontFamily: "var(--font-inter), sans-serif" }}>
        {/* Top bar */}
        <header
          style={{
            position: "sticky", top: 0, zIndex: 40,
            height: 60,
            background: "rgba(255,255,255,0.94)",
            backdropFilter: "blur(14px)",
            borderBottom: "1px solid var(--nw-border-soft)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link href="/" title={t.backToSite}
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 30, height: 30, borderRadius: 8,
                border: "1px solid var(--nw-primary-100)", background: "white",
                color: "var(--nw-primary)", textDecoration: "none",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
            <Link href="/" style={{ textDecoration: "none" }} title={t.homeTitle}>
              <Logo size="md" />
            </Link>

            {/* Tabs — desktop (in header) */}
            <nav style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 18 }} className="ws-tabs">
              {tabLinks}
            </nav>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Pont vers la console organisation. Ouvert à l'owner, à l'admin,
                ET au membre habilité (branding/pricing) — sans ce lien, un
                délégué n'aurait AUCUN moyen d'atteindre la page depuis l'UI. */}
            {canReachOrgConsole && (
              <Link
                href="/organisation"
                className="ws-org-link"
                title={t.orgConsole}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "7px 12px", borderRadius: 9,
                  border: "1px solid rgba(124,99,200,0.30)", background: "white",
                  color: "var(--nw-primary)", fontSize: 12.5, fontWeight: 700,
                  textDecoration: "none", whiteSpace: "nowrap",
                  transition: "background 150ms",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" />
                  <path d="M9 21v-6h6v6" />
                </svg>
                {t.organization}
              </Link>
            )}
            <SupportButton variant="compact" />

            <div ref={menuRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label={t.myProfileAria}
                title={userEmail}
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
                      {userEmail}
                    </p>
                  </div>
                  <Link href="/profil" onClick={() => setMenuOpen(false)} style={MENU_ITEM}>
                    {t.myProfile}
                  </Link>
                  {canReachOrgConsole && (
                    <Link href="/organisation" onClick={() => setMenuOpen(false)} style={MENU_ITEM}>
                      {t.myOrganization}
                    </Link>
                  )}
                  {profile?.is_admin && (
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

        {/* Tabs — mobile (second sticky row, horizontally scrollable) */}
        <nav className="ws-tabs-mobile" style={{
          display: "none",
          position: "sticky", top: 60, zIndex: 39,
          background: "rgba(255,255,255,0.94)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid var(--nw-border-soft)",
          padding: "6px 12px",
          gap: 2,
          overflowX: "auto",
        }}>
          {tabLinks}
        </nav>

        <style>{`
          /* Hover violet doux sur les onglets (le background est posé inline
             → !important requis ; on épargne l'onglet actif et les disabled). */
          .ws-tabs a:not([data-active]):not([aria-disabled="true"]):hover,
          .ws-tabs-mobile a:not([data-active]):not([aria-disabled="true"]):hover {
            background: rgba(124,99,200,0.07) !important;
            color: var(--nw-primary) !important;
          }
          .ws-org-link:hover { background: rgba(124,99,200,0.08) !important; }
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
            <SeatReadOnlyBanner
              organization={organization}
              hasSeat={profile?.has_sourcing_seat === true}
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
