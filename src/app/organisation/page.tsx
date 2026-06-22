"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { m } from "framer-motion"
import { useCabinet } from "./layout"
import { getSupabase } from "@/lib/supabase"
import { trialStatus, TRIAL_DURATION_DAYS, TRIAL_SEAT_CAP } from "@/lib/trial"
import { subscriptionAccess, hasActiveAccess } from "@/lib/subscription"
import { PLAN_PRICES_EUR, lookupKey, type PlanTier, type PlanSeats } from "@/lib/stripe"
import { QUOTAS_BY_PLAN, formatBytes } from "@/lib/quota-tiers"
import type { Organization } from "@/lib/database.types"
import { PricingOnboardingWizard } from "@/components/organisation/PricingOnboardingWizard"
import { BrandColorPicker } from "@/components/organisation/BrandColorPicker"
import { UpdatesHeroCard } from "@/components/updates/UpdatesHeroCard"
import { useEscapeKey } from "@/components/ui/useEscapeKey"
import { QuotaGauges } from "@/components/quota/QuotaGauges"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

/**
 * /cabinet — owner-facing console.
 *
 * Reworked layout : we drop the old 7/5 split that pushed Subscription
 * and Pricing Policy below the fold. The console now spreads on a
 * 1440-wide canvas, three balanced columns at desktop sizes :
 *
 *   row 1 (12) : EmailConfirmation banner (only if user.email_confirmed_at null)
 *   row 2 (12) : Hero — cabinet identity + KPI pills
 *   row 3 (12) : MySeat banner
 *   row 4      : Subscription (4) | Members (4) | Identity (4)
 *   row 5      : Pricing Policy* (6) | Danger zone (6)
 *
 *   * Pricing Policy is hidden until the trial is activated — there's no
 *     point configuring margins before you can use the workspace.
 *
 * Down at <= 1100px we collapse to 2 columns, then 1 column on mobile.
 */

interface MemberRow {
  user_id: string
  first_name: string | null
  role: "owner" | "member"
  has_sourcing_seat: boolean
}

interface PendingInvite {
  id: string
  email: string
  role: "owner" | "member"
  expires_at: string
  created_at: string
}

export default function CabinetPage() {
  const { profile, organization, userEmail, emailConfirmed, isOwner, refetch } = useCabinet()
  const router = useRouter()
  const searchParams = useSearchParams()
  const sb = useMemo(() => getSupabase(), [])

  const rawTab = searchParams.get("tab")
  const action = searchParams.get("action")
  const initialTab: OrgTab = (() => {
    // Si ?action=subscribe (deep-link depuis la bannière lockdown ou un
    // mail Stripe), on force l'onglet Abonnement où le SubscriptionCard
    // détectera le param et ouvrira directement le PlanPicker.
    if (action === "subscribe") return "abonnement"
    if (rawTab === "abonnement" || rawTab === "securite") return rawTab
    return "org"
  })()
  // L'onglet actif est piloté par un state local plutôt que dérivé live
  // de searchParams. Raison : en Next 16, router.replace avec un
  // pathname identique ne re-rend pas toujours les client components,
  // ce qui figeait le tab affiché après un refresh sur ?tab=abonnement
  // puis un clic sur le premier onglet. State local = UI réactive
  // instantanément, l'URL est synchronisée en background pour les
  // deep-links et le partage de lien.
  const [activeTab, setActiveTab] = useState<OrgTab>(initialTab)
  // Si l'URL change pour une raison externe (deep-link ?tab=…,
  // bouton retour navigateur), on resynchronise le state.
  useEffect(() => {
    setActiveTab(initialTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawTab, action])

  // Dashboard reste owner-only. /cabinet/parametrage gère les members
  // séparément en read-only.
  useEffect(() => {
    if (!isOwner) router.replace("/workspace")
  }, [isOwner, router])

  const [members, setMembers] = useState<MemberRow[]>([])
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  const loadMembers = async () => {
    const { data } = await sb
      .from("profiles")
      .select("user_id, first_name, role, has_sourcing_seat")
      .eq("organization_id", organization.id)
      .order("role", { ascending: true })
    setMembers((data ?? []) as MemberRow[])
  }
  const loadInvites = async () => {
    const { data } = await sb
      .from("org_invites")
      .select("id, email, role, expires_at, created_at")
      .eq("organization_id", organization.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false })
    setInvites((data ?? []) as PendingInvite[])
  }

  useEffect(() => {
    void loadMembers()
    void loadInvites()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, organization.id])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!organization.brand_logo_path) { setLogoUrl(null); return }
      const { data } = await sb.storage.from("brand-logos")
        .createSignedUrl(organization.brand_logo_path, 60 * 60)
      if (mounted) setLogoUrl(data?.signedUrl ?? null)
    })()
    return () => { mounted = false }
  }, [sb, organization.brand_logo_path])

  // Seats used = members AYANT un siège alloué + invitations en attente.
  // Un owner sans siège alloué ne compte pas. Le toggle siège est piloté
  // par la MembersSection (allocation explicite).
  const seatsUsed = members.filter((m) => m.has_sourcing_seat).length + invites.length
  const trial = trialStatus(organization)
  // La politique pricing est visible dès qu'on a un accès actif :
  //   - trial app-side actif (legacy, avant migration Stripe natif)
  //   - sub Stripe active OR trialing
  // Avant on bloquait à trial.state !== "pending", ce qui cachait la
  // carte aux comptes qui souscrivent direct sans utiliser le trial.
  const hasAnyAccess =
    trial.state === "active" ||
    organization.subscription_status === "active" ||
    organization.subscription_status === "trialing"
  void hasAnyAccess // legacy : pricing policy est désormais inline dans Branding

  // La visite guidée 6 étapes Package Sourcing est désormais déclenchée
  // sur /workspace (premier accès après souscription), pas ici --
  // c'est dans le workspace que les CTAs des étapes ont du sens.

  const orgDisplayName = organization.brand_name ?? organization.name

  return (
    <main style={{
      maxWidth: 1320, margin: "0 auto",
      padding: "28px 32px 64px",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      {!emailConfirmed && (
        <EmailConfirmationBanner email={userEmail} />
      )}

      {/* ── Tabs ──────────────────────────────────────────── */}
      <OrgTabs
        activeTab={activeTab}
        orgLabel={orgDisplayName}
        onChange={setActiveTab}
      />

      {/* ── Tab content ───────────────────────────────────── */}
      <div style={{ marginTop: 24 }}>
        <UpdatesHeroCard />
        {activeTab === "org" && (
          <div className="org-tab-grid" style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
            gap: 18,
            // alignItems "stretch" + Card `height: 100%` font que les
            // deux cartes d'une même ligne s'alignent sur la plus grande.
            // Évite les décalages quand l'une est repliée et l'autre pas.
            alignItems: "stretch",
          }}>
            {/* Row 1 : Identité (vitrine read-only) | Membres */}
            <IdentitySection
              organization={organization}
              logoUrl={logoUrl}
            />
            <MembersSection
              members={members}
              invites={invites}
              seatsBudget={organization.subscription_seats ?? Math.max(organization.seats_total, seatsUsed, 1)}
              currentUserId={profile.user_id}
              userEmail={userEmail}
              isOwner={isOwner}
              onChange={() => { void loadInvites() }}
            />
            {/* Row 2 : Branding pleine largeur (la politique pricing
                vit désormais dans l'onglet "Mes packages"). */}
            <div style={{ gridColumn: "1 / -1" }}>
              <BrandingSection
                organization={organization}
                logoUrl={logoUrl}
                isOwner={isOwner}
                onUpdated={refetch}
              />
            </div>
            {isOwner && (
              <div style={{ gridColumn: "1 / -1" }}>
                <PreviewToolsCard />
              </div>
            )}
            <style>{`
              @media (max-width: 980px) {
                .org-tab-grid { grid-template-columns: 1fr !important; }
              }
            `}</style>
          </div>
        )}

        {activeTab === "abonnement" && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 340px)",
            gap: 20,
            alignItems: "start",
          }}>
            {/* Colonne gauche : siège + abonnement + politique pricing */}
            <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
              <MySeatBanner
                hasSeat={profile.has_sourcing_seat}
                onToggle={refetch}
                isOwner={isOwner}
              />
              <SubscriptionCard
                organization={organization}
                onActivated={refetch}
                isOwner={isOwner}
                autoOpenPicker={action === "subscribe"}
              />
              <PricingPolicySectionCollapsible />
            </div>
            {/* Colonne droite : utilisation (sticky pour rester visible
                pendant le scroll des cartes de gauche) */}
            <div style={{ position: "sticky", top: 16 }}>
              <QuotaGauges />
            </div>
          </div>
        )}

        {activeTab === "securite" && (
          <div style={{ maxWidth: 720 }}>
            <DangerSection
              organization={organization}
              seatsUsed={seatsUsed}
              onDeleted={() => router.replace("/")}
            />
          </div>
        )}
      </div>

      <PricingOnboardingGate organization={organization} onDone={refetch} />
    </main>
  )
}

/**
 * Affiche le wizard pricing une fois pour l'owner après souscription.
 * Conditions cumulatives :
 *   - cabinet_onboarded_at non null (l'onboarding org est fini)
 *   - pricing_onboarded_at null (jamais configuré le pricing)
 *   - hasActiveAccess vrai (trial actif OU sub active OU trialing Stripe)
 *
 * Le wizard est dismissable ("Plus tard") sans stamper — il revient à la
 * prochaine visite tant que pricing_onboarded_at est NULL.
 */
function PricingOnboardingGate({
  organization, onDone,
}: { organization: Organization; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!organization.cabinet_onboarded_at) return
    if (organization.pricing_onboarded_at) return
    if (!hasActiveAccess(organization)) return
    // Léger délai pour ne pas afficher la modale à la frame 0 après un
    // signup/checkout : laisse la page s'installer + évite le clignement.
    const t = window.setTimeout(() => setOpen(true), 700)
    return () => window.clearTimeout(t)
  }, [organization])

  return (
    <PricingOnboardingWizard
      open={open}
      initial={{
        margeMin: organization.pricing_margin_min_pct,
        margeTarget: organization.pricing_margin_target_pct,
        rttDays: organization.pricing_rtt_days_per_year,
        avantages: organization.pricing_default_avantages,
      }}
      onClose={() => setOpen(false)}
      onDone={onDone}
    />
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* OrgTabs — barre d'onglets de la console                              */
/* ────────────────────────────────────────────────────────────────── */

type OrgTab = "org" | "abonnement" | "securite"

function OrgTabs({
  activeTab, orgLabel, onChange,
}: {
  activeTab: OrgTab
  orgLabel: string
  /** Bascule le state d'activeTab dans le parent. La synchro URL se fait
   *  en plus via history.replaceState pour ne pas casser le partage de
   *  lien / les deep-links, mais sans dépendre du re-render Next. */
  onChange: (next: OrgTab) => void
}) {
  // L'URL param reste "abonnement" pour ne pas casser les deep-links
  // historiques (mails Stripe, lockdown banner) — seul le label change.
  const tabs: { id: OrgTab; label: string }[] = [
    { id: "org", label: orgLabel || "Organisation" },
    { id: "abonnement", label: "Mes packages" },
    { id: "securite", label: "Sécurité" },
  ]

  // Source de vérité = state parent (réactif instantanément).
  // On met à jour l'URL en parallèle via history.replaceState pour
  // garder le query string en phase pour les deep-links, MAIS sans
  // déclencher router.replace : Next 16 a un cache agressif qui peut
  // figer le render quand le pathname est identique. history natif
  // contourne ça sans toucher au rendu.
  const goTo = (id: OrgTab) => {
    onChange(id)
    const href = id === "org" ? "/organisation" : `/organisation?tab=${id}`
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", href)
    }
  }

  return (
    <nav
      role="tablist"
      style={{
        display: "flex", gap: 4,
        borderBottom: "1px solid #E5E7EB",
        overflowX: "auto",
      }}
    >
      {tabs.map((t) => {
        const active = activeTab === t.id
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => goTo(t.id)}
            style={{
              position: "relative",
              padding: "12px 18px",
              fontSize: 14,
              fontWeight: active ? 700 : 500,
              color: active ? "#111827" : "#6B7280",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
              transition: "color 140ms",
              letterSpacing: t.id === "org" ? "-0.01em" : "0",
            }}
          >
            {t.label}
            {active && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: 14, right: 14, bottom: -1,
                  height: 2,
                  background: "#7C63C8",
                  borderRadius: 2,
                }}
              />
            )}
          </button>
        )
      })}
    </nav>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Email confirmation                                                   */
/* ────────────────────────────────────────────────────────────────── */

function EmailConfirmationBanner({ email }: { email: string }) {
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Cooldown : empêche un user de spammer le bouton "Renvoyer". Sinon
  // 50 clics = 50 emails Resend = risque blacklist du domaine d'envoi.
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => window.clearTimeout(t)
  }, [cooldown])

  const resend = async () => {
    if (cooldown > 0 || busy) return
    setBusy(true); setError(null)
    try {
      const { error: err } = await getSupabase().auth.resend({
        type: "signup",
        email,
      })
      if (err) throw err
      setSent(true)
      setCooldown(30)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Impossible de renvoyer")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={{
      padding: "11px 16px",
      marginBottom: 14,
      borderRadius: 12,
      background: "linear-gradient(90deg, rgba(254,243,199,0.95) 0%, rgba(253,230,138,0.85) 100%)",
      border: "1px solid rgba(217,119,6,0.30)",
      display: "flex", alignItems: "center", gap: 12,
      flexWrap: "wrap",
      fontSize: 13,
      color: "#92400E",
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden>
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
      <span style={{ flex: 1, minWidth: 220 }}>
        <strong style={{ color: "#7C2D12" }}>Confirmez votre adresse</strong>
        {" : "}
        un email a été envoyé à <strong>{email}</strong>. Vérifiez votre boîte
        de réception (et le dossier spam) pour valider votre compte.
      </span>
      {sent && cooldown > 0 ? (
        <span style={{ fontSize: 12, fontWeight: 600, color: "#15803D", whiteSpace: "nowrap" }}>
          Email renvoyé. Réessayez dans {cooldown}s.
        </span>
      ) : (
        <button
          type="button"
          onClick={resend}
          disabled={busy || cooldown > 0}
          style={{
            padding: "6px 12px", borderRadius: 8,
            border: "1px solid rgba(217,119,6,0.40)",
            background: "white", color: "#92400E",
            fontSize: 12, fontWeight: 700,
            cursor: busy ? "wait" : cooldown > 0 ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
            opacity: cooldown > 0 ? 0.6 : 1,
          }}
        >
          {busy ? "Envoi…" : "Renvoyer le lien"}
        </button>
      )}
      {error && (
        <span style={{ width: "100%", fontSize: 12, color: "#B91C1C", marginTop: 4 }}>
          {error}
        </span>
      )}
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Mon siège                                                            */
/* ────────────────────────────────────────────────────────────────── */

function MySeatBanner({ hasSeat, onToggle, isOwner }: {
  hasSeat: boolean
  onToggle: () => Promise<void>
  isOwner: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allocate = async () => {
    setBusy(true); setError(null)
    const res = await fetch("/api/cabinet/seat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ allocate: true }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? "Erreur lors de l'allocation.")
      setBusy(false)
      return
    }
    await onToggle()
    router.replace("/workspace")
  }

  const release = async () => {
    if (!confirm("Libérer votre siège ? Vous perdrez l'accès au workspace jusqu'à ce que vous vous en allouiez un nouveau.")) return
    setBusy(true); setError(null)
    const res = await fetch("/api/cabinet/seat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ allocate: false }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? "Erreur.")
    } else {
      await onToggle()
    }
    setBusy(false)
  }

  if (hasSeat) {
    return (
      <section style={{
        padding: "12px 18px",
        background: "rgba(34,197,94,0.06)",
        border: "1px solid rgba(34,197,94,0.25)",
        borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        flexWrap: "wrap",
      }}>
        <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "#22C55E", flexShrink: 0,
          }} />
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#15803d" }}>
              Vous occupez un siège du Package Sourcing.
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#166534" }}>
              Accès complet au workspace (vivier, missions, pricing, pipeline).
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => router.push("/workspace")} style={smallBtnPrimary}>
            Ouvrir le workspace →
          </button>
          {isOwner && (
            <button type="button" onClick={release} disabled={busy} style={smallBtnGhost}>
              {busy ? "…" : "Libérer le siège"}
            </button>
          )}
        </div>
        {error && <p style={{ width: "100%", margin: 0, fontSize: 12, color: "#EF4444" }}>{error}</p>}
      </section>
    )
  }

  return (
    <section style={{
      padding: "14px 18px",
      background: "linear-gradient(135deg, rgba(124,99,200,0.06) 0%, rgba(184,174,222,0.10) 100%)",
      border: "1px solid rgba(124,99,200,0.25)",
      borderRadius: 12,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      flexWrap: "wrap",
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: "#111827" }}>
          Vous n&apos;avez pas encore alloué de siège du Package Sourcing.
        </p>
        <p style={{ margin: "3px 0 0", fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>
          Allouez-vous un siège pour accéder au workspace, ou invitez un collègue pour qu&apos;il utilise un siège à votre place.
        </p>
      </div>
      <button type="button" onClick={allocate} disabled={busy || !isOwner}
        style={{
          ...smallBtnPrimary,
          padding: "10px 16px", fontSize: 12.5,
          opacity: !isOwner ? 0.5 : 1,
        }}>
        {busy ? "Allocation…" : "M'allouer un siège"}
      </button>
      {error && <p style={{ width: "100%", margin: 0, fontSize: 12, color: "#EF4444" }}>{error}</p>}
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Hero bits                                                            */
/* ────────────────────────────────────────────────────────────────── */

// HeroAvatar / HeroPill supprimés avec le hero — l'org info est désormais
// portée par l'onglet org lui-même.

/* ────────────────────────────────────────────────────────────────── */
/* Subscription (trial-aware)                                          */
/* ────────────────────────────────────────────────────────────────── */

function SubscriptionCard({
  organization, onActivated, isOwner, autoOpenPicker = false,
}: {
  organization: Organization
  onActivated: () => Promise<void>
  isOwner: boolean
  /** Si true (deep-link ?action=subscribe), ouvre le PlanPicker en mode
   *  paid dès le mount. Évite à l'owner de cliquer 2x après un lockdown. */
  autoOpenPicker?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerMode, setPickerMode] = useState<"closed" | "paid">(
    autoOpenPicker && isOwner ? "paid" : "closed",
  )

  // Activation directe du trial app-side. Aucun appel Stripe — la
  // structure reçoit 15 jours d'accès complet plafonnés à 2 sièges.
  // Au-delà, l'owner doit cliquer "Souscrire" pour passer au paid.
  const activateTrial = async () => {
    setBusy(true); setError(null)
    try {
      const r = await fetch("/api/cabinet/activate-trial", { method: "POST" })
      if (!r.ok) {
        const j = await r.json().catch(() => ({} as { error?: string }))
        throw new Error(j.error ?? "Activation impossible")
      }
      await onActivated()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur")
    } finally {
      setBusy(false)
    }
  }
  const trial = trialStatus(organization)
  const access = subscriptionAccess(organization)
  const hasStripeSub =
    organization.subscription_status === "active" ||
    organization.subscription_status === "trialing" ||
    organization.subscription_status === "past_due"

  if (organization.pending_deletion_at) {
    const date = new Date(organization.pending_deletion_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    return (
      <Card title="Abonnement" subtitle="Statut du Package Sourcing.">
        <Panel tone="warn">
          <p style={panelTitle("#D97706")}>Résiliation en cours</p>
          <p style={panelBody("#92400E")}>
            L&apos;organisation et toutes ses données seront supprimées le <strong>{date}</strong>.
          </p>
        </Panel>
      </Card>
    )
  }

  const openPortal = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" })
      const j = await res.json().catch(() => ({} as { url?: string; error?: string }))
      if (!res.ok || !j.url) throw new Error(j.error ?? "Portail indisponible")
      window.location.href = j.url
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur")
      setBusy(false)
    }
  }

  return (
    <>
      <Card title="Abonnement" subtitle="Package Sourcing : votre essai et votre formule.">
        {/* Stripe sub — affichage prioritaire si présente */}
        {hasStripeSub && (
          <Panel tone={access.state === "paid" ? "success" : access.state === "trialing" ? "brand" : "warn"}>
            <p style={panelTitle(access.state === "paid" ? "#15803D" : access.state === "trialing" ? "#7C63C8" : "#B91C1C")}>
              {planLabel(organization)}
            </p>
            <p style={panelBody("#374151")}>
              {organization.subscription_status === "past_due"
                ? "Échec du dernier paiement. Mettez à jour votre moyen de paiement."
                : access.state === "trialing" && "until" in access
                  ? <>Période d&apos;essai jusqu&apos;au <strong>{access.until?.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</strong>.</>
                  : access.state === "paid" && "until" in access
                    ? <>Prochain prélèvement le <strong>{access.until?.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</strong>.</>
                    : null}
            </p>
            <button
              type="button"
              onClick={openPortal}
              disabled={busy || !isOwner}
              style={ctaSecondaryBtn(busy)}
            >
              {busy ? "Ouverture du portail…" : "Gérer mon abonnement"}
            </button>
          </Panel>
        )}

        {/* Pas de Stripe sub — pending : pas encore d'essai activé. */}
        {!hasStripeSub && trial.state === "pending" && (
          <Panel tone="brand">
            <p style={panelTitle("#7C63C8")}>Aucun abonnement actif</p>
            <p style={panelBody("#374151")}>
              Démarrez votre essai gratuit {TRIAL_DURATION_DAYS} jours
              (jusqu&apos;à {TRIAL_SEAT_CAP} sièges, sans carte bancaire)
              ou souscrivez directement pour aller plus loin.
            </p>
            <button
              type="button"
              onClick={activateTrial}
              disabled={!isOwner || busy}
              style={ctaPrimaryBtn(busy)}
            >
              {busy ? "Activation…" : `Démarrer mes ${TRIAL_DURATION_DAYS} jours gratuits →`}
            </button>
            <button
              type="button"
              onClick={() => setPickerMode("paid")}
              disabled={!isOwner || busy}
              style={{ ...ctaSecondaryBtn(false), marginTop: 8 }}
            >
              Souscrire à un abonnement
            </button>
          </Panel>
        )}

        {/* Trial actif — l'owner peut souscrire pour passer au paid (et
            débloquer plus de 2 sièges). */}
        {!hasStripeSub && trial.state === "active" && (
          <Panel tone="success">
            <p style={panelTitle("#15803D")}>
              Essai actif · {trial.daysLeft} jour{trial.daysLeft > 1 ? "s" : ""} restant{trial.daysLeft > 1 ? "s" : ""}
            </p>
            <p style={panelBody("#166534")}>
              Termine le{" "}
              <strong>
                {trial.endsAt?.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
              </strong>
              . Plafonné à {TRIAL_SEAT_CAP} sièges — souscrivez pour ajouter plus de membres ou continuer après l&apos;essai.
            </p>
            <button
              type="button"
              onClick={() => setPickerMode("paid")}
              disabled={!isOwner}
              style={ctaPrimaryBtn(false)}
            >
              Souscrire à un abonnement →
            </button>
          </Panel>
        )}

        {!hasStripeSub && trial.state === "expired" && (
          <Panel tone="warn">
            <p style={panelTitle("#B91C1C")}>Période d&apos;essai terminée</p>
            <p style={panelBody("#7F1D1D")}>
              Souscrivez pour reprendre l&apos;accès à votre workspace.
            </p>
            <button
              type="button"
              onClick={() => setPickerMode("paid")}
              disabled={!isOwner}
              style={{
                ...ctaPrimaryBtn(false),
                background: "linear-gradient(120deg, #DC2626 0%, #B91C1C 100%)",
                boxShadow: "0 6px 16px -4px rgba(220,38,38,0.40)",
              }}
            >
              Souscrire au Package Sourcing →
            </button>
          </Panel>
        )}

        {error && (
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "#B91C1C" }}>{error}</p>
        )}

        <div style={{ marginTop: 14, fontSize: 11.5, color: "#9CA3AF", lineHeight: 1.55 }}>
          {organization.seats_total} siège{organization.seats_total > 1 ? "s" : ""} alloué{organization.seats_total > 1 ? "s" : ""}.
        </div>
      </Card>

      {pickerMode === "paid" && (
        <PlanPickerModal
          initialTier={organization.subscription_has_pricing ? "sourcing_pro" : "sourcing"}
          initialSeats={(organization.subscription_seats as PlanSeats) ?? 1}
          onClose={() => setPickerMode("closed")}
        />
      )}
    </>
  )
}

function planLabel(org: Organization): string {
  const tier = org.subscription_has_pricing ? "Package Sourcing Pro" : "Package Sourcing"
  const seats = org.subscription_seats ?? 1
  return `${tier} · ${seats} siège${seats > 1 ? "s" : ""}`
}

const ctaPrimaryBtn = (busy: boolean): React.CSSProperties => ({
  marginTop: 10,
  padding: "10px 16px",
  borderRadius: 10,
  border: "none",
  background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
  color: "white",
  fontSize: 13,
  fontWeight: 700,
  cursor: busy ? "wait" : "pointer",
  opacity: busy ? 0.7 : 1,
  boxShadow: "0 6px 16px -4px rgba(124,99,200,0.45)",
  fontFamily: "inherit",
  width: "100%",
})
const ctaSecondaryBtn = (busy: boolean): React.CSSProperties => ({
  marginTop: 10,
  padding: "9px 14px",
  borderRadius: 10,
  border: "1px solid rgba(124,99,200,0.30)",
  background: "white",
  color: "#7C63C8",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: busy ? "wait" : "pointer",
  opacity: busy ? 0.7 : 1,
  fontFamily: "inherit",
  width: "100%",
})

/* ────────────────────────────────────────────────────────────────── */
/* Plan Picker Modal — Stripe Checkout entry point                     */
/* ────────────────────────────────────────────────────────────────── */

function PlanPickerModal({
  initialTier, initialSeats, onClose,
}: {
  initialTier: PlanTier
  initialSeats: PlanSeats
  onClose: () => void
}) {
  useEscapeKey(onClose)
  const [tier, setTier] = useState<PlanTier>(initialTier)
  const [seats, setSeats] = useState<PlanSeats>(initialSeats)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const price = PLAN_PRICES_EUR[tier][seats]

  const subscribe = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, seats }),
      })
      const j = await res.json().catch(() => ({} as { url?: string; error?: string }))
      if (!res.ok || !j.url) throw new Error(j.error ?? "Checkout indisponible")
      window.location.href = j.url
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur")
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(17,24,39,0.40)",
        backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <m.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        style={{
          background: "white",
          borderRadius: 20,
          padding: "28px 28px 24px",
          maxWidth: 520,
          width: "100%",
          boxShadow: "0 24px 64px -24px rgba(17,24,39,0.30)",
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        <header style={{ marginBottom: 18 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#7C63C8", letterSpacing: "0.10em", textTransform: "uppercase" }}>
            Souscrire au Package Sourcing
          </p>
          <h2 style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em" }}>
            Choisissez votre formule
          </h2>
        </header>

        {/* Tier toggle */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18,
        }}>
          {(["sourcing", "sourcing_pro"] as const).map((t) => {
            const active = tier === t
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTier(t)}
                style={{
                  padding: "14px 12px",
                  borderRadius: 14,
                  border: active ? "2px solid #7C63C8" : "1px solid #E2DAF6",
                  background: active ? "rgba(124,99,200,0.08)" : "white",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#111827" }}>
                  {t === "sourcing" ? "Package Sourcing" : "Package Sourcing Pro"}
                </p>
                <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "#6B7280", lineHeight: 1.45 }}>
                  {t === "sourcing"
                    ? "Vivier, matching, anonymisation."
                    : "+ Suite Pricing Syntec (engine + chart + PDF)."}
                </p>
              </button>
            )
          })}
        </div>

        {/* Seats picker */}
        <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "#374151", letterSpacing: "0.01em" }}>
          Nombre de sièges
        </p>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 18,
        }}>
          {([1, 2, 3, 4] as const).map((s) => {
            const active = seats === s
            const featured = s === 3
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSeats(s)}
                style={{
                  position: "relative",
                  padding: "12px 6px",
                  borderRadius: 12,
                  border: active ? "2px solid #7C63C8" : "1px solid #E2DAF6",
                  background: active ? "rgba(124,99,200,0.08)" : "white",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "center",
                }}
              >
                {featured && (
                  <span style={{
                    position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)",
                    background: "#7C63C8", color: "white",
                    fontSize: 8.5, fontWeight: 800, padding: "2px 6px",
                    borderRadius: 999, letterSpacing: "0.06em", textTransform: "uppercase",
                  }}>
                    Reco
                  </span>
                )}
                <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#111827" }}>{s}</p>
                <p style={{ margin: 0, fontSize: 10.5, color: "#6B7280" }}>
                  siège{s > 1 ? "s" : ""}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 10.5, color: "#7C63C8", fontWeight: 700 }}>
                  {PLAN_PRICES_EUR[tier][s].toFixed(2)} €
                </p>
              </button>
            )
          })}
        </div>

        {/* Price + quotas inclus summary */}
        {(() => {
          const q = QUOTAS_BY_PLAN[lookupKey(tier, seats)]
          return (
            <div style={{
              background: "linear-gradient(120deg, #F8F6FF 0%, #F0ECF8 100%)",
              border: "1px solid #E2DAF6",
              borderRadius: 14,
              padding: "14px 16px",
              marginBottom: 16,
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
              }}>
                <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>
                  Total mensuel HT
                </span>
                <span style={{ fontSize: 22, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                  {price.toFixed(2)} €
                </span>
              </div>
              {q && (
                <div style={{
                  marginTop: 10, paddingTop: 10,
                  borderTop: "1px solid rgba(124,99,200,0.18)",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  fontSize: 11.5, color: "#5C46A0", fontWeight: 600,
                  flexWrap: "wrap", gap: 6,
                }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7"/>
                      <path d="M3 7l9 6 9-6"/>
                      <rect x="3" y="5" width="18" height="2"/>
                    </svg>
                    {formatBytes(q.storageBytes)} stockage
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 2v4"/><path d="M12 18v4"/>
                      <path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/>
                      <path d="M2 12h4"/><path d="M18 12h4"/>
                      <path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/>
                    </svg>
                    {q.llmMonthly.toLocaleString("fr-FR")} crédits IA / mois
                  </span>
                </div>
              )}
            </div>
          )
        })()}

        <p style={{ margin: "0 0 16px", fontSize: 11.5, color: "#6B7280", lineHeight: 1.55 }}>
          Pas de TVA appliquée (micro-entreprise). Annulation à tout moment depuis votre portail Stripe.
          {seats >= 4 && " Au-delà de 4 sièges, contactez-nous pour un devis."}
        </p>

        {error && (
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "#B91C1C" }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid #E2DAF6",
              background: "white",
              color: "#6B7280",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: busy ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={subscribe}
            disabled={busy}
            style={{
              flex: 2,
              padding: "12px 16px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
              color: "white",
              fontSize: 14,
              fontWeight: 700,
              cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.7 : 1,
              boxShadow: "0 8px 24px -6px rgba(124,99,200,0.55)",
              fontFamily: "inherit",
            }}
          >
            {busy ? "Redirection…" : "Continuer vers le paiement →"}
          </button>
        </div>
      </m.div>
    </div>
  )
}

function Panel({ tone, children }: { tone: "brand" | "success" | "warn"; children: React.ReactNode }) {
  const styles: Record<typeof tone, { bg: string; border: string }> = {
    brand:   { bg: "rgba(124,99,200,0.06)", border: "rgba(124,99,200,0.22)" },
    success: { bg: "rgba(34,197,94,0.07)",  border: "rgba(34,197,94,0.28)" },
    warn:    { bg: "rgba(220,38,38,0.06)",  border: "rgba(220,38,38,0.25)" },
  }
  const t = styles[tone]
  return (
    <div style={{
      padding: "12px 14px", borderRadius: 10,
      background: t.bg, border: `1px solid ${t.border}`,
    }}>
      {children}
    </div>
  )
}

const panelTitle = (color: string): React.CSSProperties => ({
  margin: 0, fontSize: 13.5, fontWeight: 700, color,
})
const panelBody = (color: string): React.CSSProperties => ({
  margin: "4px 0 0", fontSize: 12.5, color, lineHeight: 1.55,
})

/* ────────────────────────────────────────────────────────────────── */
/* Identité                                                            */
/* ────────────────────────────────────────────────────────────────── */

/**
 * Vitrine read-only de l'identité de l'organisation : logo + nom +
 * slogan + email de contact + pastilles couleur(s). Tout est édité
 * depuis BrandingSection plus bas. Cette carte ne fait que présenter
 * l'identité telle qu'elle apparaîtra sur les CV anonymisés.
 */
function IdentitySection({
  organization, logoUrl,
}: {
  organization: {
    name: string
    brand_name: string | null
    brand_slogan: string | null
    brand_color: string | null
    brand_color_secondary: string | null
    contact_email: string | null
  }
  logoUrl: string | null
}) {
  const displayName = (organization.brand_name?.trim() || organization.name?.trim()) || "Organisation"
  const initials = displayName
    .split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
  const colors = [organization.brand_color, organization.brand_color_secondary].filter(Boolean) as string[]

  return (
    <Card
      title="Identité de l'organisation"
      subtitle="Vitrine telle qu'elle apparaîtra sur les CV anonymisés. Modifiable dans Branding."
    >
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <div style={{
          flexShrink: 0,
          width: 72, height: 72,
          borderRadius: 14,
          border: "1px solid #E2DAF6",
          background: "#FAFAFA",
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
        }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 6 }} />
          ) : (
            <span style={{ fontSize: 16, color: "#C4B6E0", fontWeight: 800, letterSpacing: "0.04em" }}>
              {initials}
            </span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 17, fontWeight: 800, color: "#111827",
            letterSpacing: "-0.01em",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {displayName}
          </p>
          {organization.brand_slogan ? (
            <p style={{
              margin: "3px 0 0", fontSize: 12.5, color: "#6B7280",
              fontStyle: "italic",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {organization.brand_slogan}
            </p>
          ) : (
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#C4B6E0" }}>
              Pas de slogan
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            {/* Pastilles couleur(s) */}
            <div style={{ display: "flex", gap: 4 }}>
              {colors.length === 0 ? (
                <span style={{
                  display: "inline-block", width: 14, height: 14, borderRadius: 7,
                  background: "#000000", border: "1px solid rgba(0,0,0,0.10)",
                }} title="Couleur par défaut (noir)" />
              ) : (
                colors.map((c) => (
                  <span key={c} style={{
                    display: "inline-block", width: 14, height: 14, borderRadius: 7,
                    background: c, border: "1px solid rgba(0,0,0,0.10)",
                  }} title={c.toUpperCase()} />
                ))
              )}
            </div>
            <span style={{
              fontSize: 11.5, color: "#6B7280",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {organization.contact_email || <span style={{ color: "#C4B6E0" }}>Aucun email de contact</span>}
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Branding cabinet — logo + couleur + slogan                          */
/*                                                                     */
/* Ces 3 champs nourrissent le PDF anonymisé candidat : le client      */
/* final reçoit un document à l'identité visuelle du cabinet, pas      */
/* Naywa. Owner-only en édition, lecture seule pour les members.       */
/* ────────────────────────────────────────────────────────────────── */

interface BrandingRequestRow {
  id: string
  field: "name" | "brand_logo_path" | "contact_email"
  current_value: string | null
  requested_value: string
  status: "pending" | "approved" | "rejected" | "cancelled"
  decision_note: string | null
  decided_at: string | null
  created_at: string
  request_batch_id: string
}

function BrandingSection({
  organization, logoUrl, isOwner, onUpdated,
}: {
  organization: {
    id: string
    name: string
    brand_name: string | null
    brand_logo_path: string | null
    brand_color: string | null
    brand_color_secondary: string | null
    brand_slogan: string | null
    contact_email: string | null
    branding_locked_at: string | null
  }
  logoUrl: string | null
  isOwner: boolean
  onUpdated: () => Promise<void>
}) {
  const sb = useMemo(() => getSupabase(), [])
  const [open, setOpen] = useState(true) // pliable, ouvert par défaut
  const [orgName, setOrgName] = useState(organization.brand_name ?? organization.name ?? "")
  const [slogan, setSlogan] = useState(organization.brand_slogan ?? "")
  const [email, setEmail] = useState(organization.contact_email ?? "")
  const [busy, setBusy] = useState<"idle" | "saving" | "uploading" | "deleting">("idle")
  const [error, setError] = useState<string | null>(null)
  // Boolean : la modale globale (multi-champs) est ouverte ou non.
  // L'owner coche dans la modale les champs qu'il veut modifier.
  const [requestModalOpen, setRequestModalOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const emailValid = email.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  // Identité forte verrouillée si la grâce est passée. Couleurs + slogan
  // restent libres en permanence (faible enjeu de fraude).
  // useState + useEffect pour ne pas violer la règle de pureté du render
  // (Date.now() est non-déterministe et interdit pendant le render React 19).
  // L'horloge est essentiellement une "subscription à un système externe"
  // — on accepte le set-state-in-effect ici, c'est le pattern correct
  // pour exposer un timestamp dépendant de Date.now().
  const [brandingLocked, setBrandingLocked] = useState(false)
  useEffect(() => {
    // L'horloge (Date.now) est une "subscription à un système externe"
    // — on accepte le set-state-in-effect ici, c'est le pattern correct
    // pour exposer un timestamp dépendant de Date.now().
    const locked =
      !!organization.branding_locked_at &&
      new Date(organization.branding_locked_at).getTime() <= Date.now()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBrandingLocked(locked)
  }, [organization.branding_locked_at])

  // Statut des demandes en cours / récemment décidées. Affiché sous
  // chaque champ verrouillé pour que l'owner suive l'état de ses
  // soumissions sans aller chercher dans ses mails.
  const [requestsByField, setRequestsByField] =
    useState<Record<"name" | "brand_logo_path" | "contact_email", BrandingRequestRow | null>>({
      name: null, brand_logo_path: null, contact_email: null,
    })
  // refreshTick : utilisé par les flows post-soumission pour redéclencher
  // l'effet de fetch sans définir un useCallback (qui plante la règle
  // react-hooks/set-state-in-effect).
  const [requestsRefreshTick, setRequestsRefreshTick] = useState(0)
  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    void (async () => {
      try {
        const r = await fetch("/api/cabinet/branding/requests", { cache: "no-store" })
        if (!r.ok || cancelled) return
        const j = await r.json() as { requests: BrandingRequestRow[] }
        // On garde la plus récente par champ — c'est celle qui reflète
        // le statut courant aux yeux de l'owner (les anciennes sont des
        // demandes annulées/refusées déjà notifiées par mail).
        const latest: Record<"name" | "brand_logo_path" | "contact_email", BrandingRequestRow | null> = {
          name: null, brand_logo_path: null, contact_email: null,
        }
        for (const req of j.requests ?? []) {
          if (!latest[req.field]) latest[req.field] = req
        }
        if (cancelled) return
        setRequestsByField(latest)
      } catch {
        /* silencieux : pas de statut si l'API tombe, l'UI reste utilisable */
      }
    })()
    return () => { cancelled = true }
  }, [isOwner, requestsRefreshTick])

  const patch = async (body: Record<string, unknown>, kind: "saving" | "uploading" | "deleting" = "saving") => {
    setBusy(kind); setError(null)
    const res = await fetch("/api/cabinet", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? "Erreur lors de la sauvegarde.")
    } else {
      await onUpdated()
    }
    setBusy("idle")
  }

  const uploadLogo = async (file: File) => {
    if (!isOwner) return
    setBusy("uploading"); setError(null)
    const ext = file.name.split(".").pop() || "png"
    const path = `${organization.id}/${Date.now()}.${ext}`
    const { error: upErr } = await sb.storage.from("brand-logos").upload(path, file, { upsert: true })
    if (upErr) { setError(upErr.message); setBusy("idle"); return }
    await patch({ brand_logo_path: path }, "uploading")
  }

  const removeLogo = async () => {
    if (!isOwner) return
    if (organization.brand_logo_path) {
      await sb.storage.from("brand-logos").remove([organization.brand_logo_path])
    }
    await patch({ brand_logo_path: null }, "deleting")
  }

  const saveEmail = async () => {
    if (!isOwner) return
    const next = email.trim() || null
    if ((organization.contact_email ?? null) === next) return
    if (!emailValid) return
    await patch({ contact_email: next })
  }

  const saveName = async () => {
    if (!isOwner) return
    const next = orgName.trim()
    if (!next) return
    const currentName = (organization.brand_name ?? organization.name ?? "").trim()
    if (currentName === next) return
    await patch({ name: next, brand_name: next })
  }

  // Résumé visible quand la carte est repliée — pastilles + label
  const summary = (() => {
    const parts: string[] = []
    if (logoUrl) parts.push("Logo")
    if (organization.brand_color) parts.push("Couleur")
    if (organization.brand_color_secondary) parts.push("Bicolore")
    if (organization.brand_slogan) parts.push("Slogan")
    if (organization.contact_email) parts.push("Contact")
    return parts.length > 0 ? parts.join(" · ") : "À configurer"
  })()

  return (
    <Card
      title="Branding"
      subtitle="Logo, couleurs, slogan et contact qui apparaissent sur les CV anonymisés."
      // Header : bouton 'Modifier vos informations verrouillées' visible
      // uniquement quand l'identité forte est verrouillée + bouton repli.
      headerRight={
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {brandingLocked && isOwner && (
            <button
              type="button"
              onClick={() => setRequestModalOpen(true)}
              style={{
                fontSize: 11.5, fontWeight: 700, color: "#7C63C8",
                background: "white",
                border: "1px solid rgba(124,99,200,0.30)",
                padding: "6px 11px", borderRadius: 8,
                cursor: "pointer", fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", gap: 6,
                whiteSpace: "nowrap",
              }}
              title="Demander une modification du nom, du logo ou de l'email de contact"
            >
              <LockIcon size={11} />
              Modifier vos informations verrouillées
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{
              fontSize: 12, fontWeight: 700, color: "#7C63C8",
              background: "transparent", border: "none",
              padding: "4px 8px", cursor: "pointer", fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", gap: 4,
            }}
          >
            {open ? "Replier ▴" : "Déplier ▾"}
          </button>
        </div>
      }
    >
      {!open && (
        <p style={{ margin: 0, fontSize: 12.5, color: "#6B7280" }}>
          <span style={{ color: organization.brand_color || "#000000", marginRight: 6, fontWeight: 700 }}>●</span>
          {summary}
        </p>
      )}

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {/* Nom de l'organisation */}
          <div>
            <Label>Nom de l&apos;organisation</Label>
            {brandingLocked ? (
              <>
                <LockedField value={orgName || "(non défini)"} />
                <RequestStatusInline request={requestsByField.name} />
              </>
            ) : (
              <>
                <input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  onBlur={saveName}
                  placeholder="Cabinet Dupont"
                  disabled={!isOwner || busy === "saving"}
                  style={inputStyle}
                />
                <Hint>{busy === "saving" ? "Sauvegarde…" : "Sauvegarde automatique"}</Hint>
              </>
            )}
          </div>

          {/* Logo */}
          <div>
            <Label>Logo</Label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 64, height: 64,
                borderRadius: 12, border: "1.5px dashed #E2DAF6",
                background: "#FAFAFA",
                display: "flex", alignItems: "center", justifyContent: "center",
                overflow: "hidden",
                flexShrink: 0,
              }}>
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 6 }} />
                ) : (
                  <span style={{ fontSize: 10, color: "#9CA3AF" }}>Aucun</span>
                )}
              </div>
              {brandingLocked ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                  <LockedBadge />
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <button type="button" onClick={() => fileInput.current?.click()}
                    disabled={!isOwner || busy !== "idle"}
                    style={smallBtnPrimary}>
                    {busy === "uploading" ? "…" : logoUrl ? "Remplacer" : "Téléverser"}
                  </button>
                  {logoUrl && isOwner && (
                    <button type="button" onClick={removeLogo} disabled={busy !== "idle"} style={smallBtnGhost}>
                      Retirer
                    </button>
                  )}
                </div>
              )}
            </div>
            <input ref={fileInput} type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) { void uploadLogo(f); e.target.value = "" }
              }}
            />
            {brandingLocked && <RequestStatusInline request={requestsByField.brand_logo_path} />}
          </div>

          {/* Couleurs — picker complet avec palette + extraction logo + bicolore */}
          <div>
            <Label>Couleurs de marque</Label>
            <Hint>
              Non configurée = rendu en noir sur le PDF anonymisé. Choisissez
              une couleur de votre logo ou de la palette suggérée.
            </Hint>
            <div style={{ marginTop: 10 }}>
              <BrandColorPicker
                primary={organization.brand_color}
                secondary={organization.brand_color_secondary}
                isOwner={isOwner}
                logoUrl={logoUrl}
                saving={busy === "saving"}
                onSave={(body) => patch(body)}
              />
            </div>
          </div>

          {/* Slogan */}
          <div>
            <Label>Slogan <span style={{ color: "#9CA3AF", fontWeight: 400 }}>(optionnel)</span></Label>
            <input
              value={slogan}
              onChange={(e) => setSlogan(e.target.value.slice(0, 120))}
              onBlur={() => {
                if (!isOwner) return
                const next = slogan.trim() || null
                if ((organization.brand_slogan ?? null) === next) return
                void patch({ brand_slogan: next })
              }}
              placeholder="Recruter, c'est notre métier"
              disabled={!isOwner || busy === "saving"}
              maxLength={120}
              style={inputStyle}
            />
            <Hint>{slogan.length}/120 caractères</Hint>
          </div>

          {/* Email de contact */}
          <div>
            <Label>Email de contact</Label>
            {brandingLocked ? (
              <>
                <LockedField value={email || "(non défini)"} />
                <RequestStatusInline request={requestsByField.contact_email} />
              </>
            ) : (
              <>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={saveEmail}
                  placeholder="contact@votre-cabinet.com"
                  disabled={!isOwner || busy === "saving"}
                  style={{
                    ...inputStyle,
                    borderColor: email && !emailValid ? "#EF4444" : inputStyle.borderColor,
                  }}
                />
                <Hint>
                  {email && !emailValid
                    ? "Format d'email invalide"
                    : "Ajouté en pied de page du CV anonymisé. Permet au client final de vous recontacter."}
                </Hint>
              </>
            )}
          </div>

          {requestModalOpen && (
            <BrandingChangeRequestModal
              organizationId={organization.id}
              currentName={orgName}
              currentLogoPath={organization.brand_logo_path}
              currentLogoUrl={logoUrl}
              currentEmail={email}
              onClose={() => setRequestModalOpen(false)}
              onSubmitted={() => {
                setRequestModalOpen(false)
                void onUpdated()
                setRequestsRefreshTick((t) => t + 1)
              }}
            />
          )}

          {error && <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#EF4444" }}>{error}</p>}
        </div>
      )}
    </Card>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Champs branding verrouillés post-onboarding                         */
/* ────────────────────────────────────────────────────────────────── */

function LockedField({ value }: { value: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "9px 11px",
      borderRadius: 8,
      background: "#FAFAFA",
      border: "1.5px solid #E5E7EB",
    }}>
      <LockIcon />
      <span style={{
        flex: 1, minWidth: 0,
        fontSize: 13.5, color: "#374151", fontWeight: 500,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {value}
      </span>
    </div>
  )
}

/**
 * Statut d'une demande affiché sous un champ verrouillé pour que
 * l'owner suive l'état de sa soumission sans aller chercher dans
 * ses mails (pending / approved récent / rejected avec raison).
 *
 * Les demandes "cancelled" (annulées par l'owner lui-même en re-
 * soumettant une nouvelle demande sur le même champ) ne sont pas
 * affichées : silence utile.
 */
function RequestStatusInline({ request }: { request: BrandingRequestRow | null }) {
  if (!request) return null
  if (request.status === "cancelled") return null

  const dateLabel = (iso: string | null) => iso
    ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : ""

  if (request.status === "pending") {
    return (
      <div style={{
        marginTop: 8, padding: "8px 11px",
        background: "rgba(245,158,11,0.06)",
        border: "1px solid rgba(245,158,11,0.25)",
        borderRadius: 8,
        display: "flex", alignItems: "center", gap: 9,
      }}>
        <DotIndicator color="#B45309" />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#92400E", lineHeight: 1.5 }}>
          <strong>Demande en cours de traitement.</strong>{" "}
          Soumise le {dateLabel(request.created_at)}. Vous recevrez un email
          dès qu&apos;elle est validée ou refusée.
        </span>
      </div>
    )
  }

  if (request.status === "approved") {
    return (
      <div style={{
        marginTop: 8, padding: "8px 11px",
        background: "rgba(34,197,94,0.06)",
        border: "1px solid rgba(34,197,94,0.25)",
        borderRadius: 8,
        display: "flex", alignItems: "center", gap: 9,
      }}>
        <DotIndicator color="#15803D" />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#166534", lineHeight: 1.5 }}>
          <strong>Modification validée</strong>
          {request.decided_at ? ` le ${dateLabel(request.decided_at)}` : ""}.
        </span>
      </div>
    )
  }

  // rejected
  return (
    <div style={{
      marginTop: 8, padding: "9px 12px",
      background: "rgba(220,38,38,0.05)",
      border: "1px solid rgba(220,38,38,0.25)",
      borderRadius: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: request.decision_note ? 4 : 0 }}>
        <DotIndicator color="#B91C1C" />
        <span style={{ flex: 1, fontSize: 12, color: "#991B1B", lineHeight: 1.5 }}>
          <strong>Demande refusée</strong>
          {request.decided_at ? ` le ${dateLabel(request.decided_at)}` : ""}.
        </span>
      </div>
      {request.decision_note && (
        <p style={{
          margin: "0 0 0 18px",
          fontSize: 12, color: "#991B1B",
          lineHeight: 1.55, fontStyle: "italic",
        }}>
          « {request.decision_note} »
        </p>
      )}
    </div>
  )
}

function DotIndicator({ color }: { color: string }) {
  return (
    <span aria-hidden style={{
      width: 9, height: 9, borderRadius: "50%",
      background: color, flexShrink: 0,
      boxShadow: `0 0 0 3px ${color}1A`,
    }} />
  )
}

function LockedBadge() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 10.5, fontWeight: 700, color: "#6B7280",
      background: "#F3F4F6", border: "1px solid #E5E7EB",
      padding: "3px 7px", borderRadius: 100,
      letterSpacing: "0.05em", textTransform: "uppercase",
    }}>
      <LockIcon size={10} />
      Verrouillé
    </span>
  )
}

function LockIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="#7C63C8" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden
      style={{ flexShrink: 0, marginTop: 1 }}>
      <path d="M12 3l8 3v6c0 4.5-3.4 8.5-8 9-4.6-.5-8-4.5-8-9V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

/**
 * Modale globale "Demande de modification" — multi-champs.
 *
 * L'owner coche les champs qu'il veut modifier (nom, logo, email
 * contact) parmi les 3 verrouillés. Pour chaque coché, un sous-form
 * apparaît pour saisir la nouvelle valeur. Une seule `reason` couvre
 * toute la demande.
 *
 * Tout est soumis en une fois → 1 batch côté DB (1 row par champ).
 * Côté /admin/demandes, le batch s'affiche groupé mais chaque champ
 * reste décidable indépendamment (j'accepte le nom, je refuse le
 * logo).
 */
function BrandingChangeRequestModal({
  organizationId, currentName, currentLogoPath, currentLogoUrl, currentEmail, onClose, onSubmitted,
}: {
  /** Org du caller — sert à respecter la RLS Storage brand-logos qui
   *  exige `{org_id}/...` comme premier segment du path. */
  organizationId: string
  currentName: string
  currentLogoPath: string | null
  currentLogoUrl: string | null
  currentEmail: string
  onClose: () => void
  onSubmitted: () => void
}) {
  useEscapeKey(onClose)
  const sb = useMemo(() => getSupabase(), [])
  // Cases cochées par l'owner.
  const [editName, setEditName] = useState(false)
  const [editLogo, setEditLogo] = useState(false)
  const [editEmail, setEditEmail] = useState(false)
  // Valeurs saisies.
  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [uploadedLogoPath, setUploadedLogoPath] = useState<string | null>(null)
  const [uploadedLogoLocalUrl, setUploadedLogoLocalUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const emailValid = newEmail === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())

  const handleLogoPick = async (file: File) => {
    setUploading(true); setError(null)
    try {
      // Path = `{org_id}/pending/{ts}.ext`. La RLS Storage du bucket
      // brand-logos (migration 025) exige `{current_org_id()}` comme
      // 1er segment — un path racine "pending/..." est refusé. Le
      // sous-folder "pending" distingue ces fichiers en cours de
      // validation des logos déjà approuvés (`{org_id}/{ts}.ext`).
      const ext = file.name.split(".").pop() || "png"
      const path = `${organizationId}/pending/${Date.now()}.${ext}`
      const { error: upErr } = await sb.storage.from("brand-logos").upload(path, file, { upsert: true })
      if (upErr) throw new Error(upErr.message)
      setUploadedLogoPath(path)
      // Aperçu local instantané (avant que la signed URL existe).
      setUploadedLogoLocalUrl(URL.createObjectURL(file))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const canSubmit = (() => {
    if (uploading) return false
    if (editName && !newName.trim()) return false
    if (editLogo && !uploadedLogoPath) return false
    if (editEmail && (!newEmail.trim() || !emailValid)) return false
    return editName || editLogo || editEmail
  })()

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true); setError(null)
    try {
      const changes: Array<{ field: string; requested_value: string }> = []
      if (editName) changes.push({ field: "name", requested_value: newName.trim() })
      if (editLogo && uploadedLogoPath) changes.push({ field: "brand_logo_path", requested_value: uploadedLogoPath })
      if (editEmail) changes.push({ field: "contact_email", requested_value: newEmail.trim() })
      const r = await fetch("/api/cabinet/branding/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes, reason: reason.trim() || null }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({} as { error?: string }))
        throw new Error(j.error ?? `Erreur ${r.status}`)
      }
      onSubmitted()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(17,24,39,0.40)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        overflowY: "auto",
      }}
    >
      <m.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        style={{
          width: "100%", maxWidth: 560,
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          background: "white", borderRadius: 16, padding: 24,
          fontFamily: "var(--font-inter), sans-serif",
          boxShadow: "0 24px 64px -24px rgba(17,24,39,0.30)",
          margin: "auto",
        }}
      >
        <header style={{ marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#7C63C8", letterSpacing: "0.10em", textTransform: "uppercase" }}>
            Demande de modification
          </p>
          <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800, color: "#111827", letterSpacing: "-0.01em" }}>
            Modifier vos informations verrouillées
          </h2>
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "#6B7280", lineHeight: 1.55 }}>
            Cochez les informations que vous souhaitez modifier, puis indiquez
            la nouvelle valeur pour chacune. Notre équipe examinera votre
            demande sous 24 à 48 heures ouvrées et vous répondra par email.
          </p>
          <div style={{
            margin: "12px 0 0",
            padding: "10px 12px",
            background: "rgba(124,99,200,0.05)",
            border: "1px solid rgba(124,99,200,0.18)",
            borderRadius: 8,
            display: "flex", gap: 9, alignItems: "flex-start",
          }}>
            <ShieldIcon />
            <p style={{ margin: 0, fontSize: 11.5, color: "#4B5563", lineHeight: 1.5 }}>
              <strong style={{ color: "#374151" }}>Pourquoi cette étape ?</strong>{" "}
              Le nom, le logo et l&apos;email de contact apparaissent sur les
              CV anonymisés que vous présentez à vos clients. Pour éviter
              l&apos;usurpation d&apos;identité d&apos;un cabinet, ces
              informations sont verrouillées 24 heures après la fin de votre
              onboarding et leur modification passe par une validation manuelle.
            </p>
          </div>
        </header>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Nom */}
          <ChangeBlock
            checked={editName}
            onToggle={() => setEditName((v) => !v)}
            title="Nom de l'organisation"
            currentSummary={currentName || "(non défini)"}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Cabinet Dupont"
              maxLength={200}
              autoFocus
              style={inputStyle}
            />
          </ChangeBlock>

          {/* Logo */}
          <ChangeBlock
            checked={editLogo}
            onToggle={() => setEditLogo((v) => !v)}
            title="Logo"
            currentSummary={currentLogoPath ? "Logo actuel" : "Aucun logo"}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              {/* Logo actuel */}
              <div style={{ flex: 1 }}>
                <p style={miniLabel}>Actuel</p>
                <LogoFrame src={currentLogoUrl} placeholder="Aucun" />
              </div>
              {/* Logo demandé */}
              <div style={{ flex: 1 }}>
                <p style={miniLabel}>Nouveau</p>
                <LogoFrame src={uploadedLogoLocalUrl} placeholder="À choisir" highlight />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                style={smallBtnPrimary}
              >
                {uploading ? "Upload…" : uploadedLogoPath ? "Remplacer le fichier" : "Choisir un fichier"}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) { void handleLogoPick(f); e.target.value = "" }
                }}
              />
            </div>
          </ChangeBlock>

          {/* Email */}
          <ChangeBlock
            checked={editEmail}
            onToggle={() => setEditEmail((v) => !v)}
            title="Email de contact"
            currentSummary={currentEmail || "(non défini)"}
          >
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="contact@votre-cabinet.com"
              maxLength={200}
              style={{
                ...inputStyle,
                borderColor: newEmail && !emailValid ? "#EF4444" : inputStyle.borderColor,
              }}
            />
            {newEmail && !emailValid && (
              <p style={{ margin: "5px 0 0", fontSize: 11.5, color: "#EF4444" }}>
                Format d&apos;email invalide
              </p>
            )}
          </ChangeBlock>

          <div>
            <Label>
              Raison de la demande{" "}
              <span style={{ color: "#9CA3AF", fontWeight: 400 }}>(optionnel)</span>
            </Label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex : nouveau positionnement de la marque, fusion, faute de frappe lors de l'inscription…"
              maxLength={500}
              rows={3}
              style={{
                ...inputStyle, resize: "vertical", minHeight: 70,
                fontFamily: "var(--font-inter), sans-serif",
              }}
            />
          </div>

          {error && (
            <p style={{ margin: 0, fontSize: 12.5, color: "#B91C1C" }}>{error}</p>
          )}

          {!editName && !editLogo && !editEmail && (
            <p style={{ margin: 0, fontSize: 12.5, color: "#9CA3AF", fontStyle: "italic" }}>
              Cochez au moins une information à modifier.
            </p>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <button type="button" onClick={onClose} disabled={busy} style={smallBtnGhost}>
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !canSubmit}
            style={{
              padding: "10px 16px", borderRadius: 10,
              border: "none", color: "white",
              background: busy || !canSubmit
                ? "#C4B6E0"
                : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
              fontSize: 13, fontWeight: 700,
              cursor: busy || !canSubmit ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {busy ? "Envoi…" : "Envoyer la demande"}
          </button>
        </div>
      </m.div>
    </div>
  )
}

/**
 * Bloc accordeon dans la modale : checkbox + titre + résumé valeur
 * actuelle. Une fois coché, on déplie le sous-formulaire (children).
 */
function ChangeBlock({
  checked, onToggle, title, currentSummary, children,
}: {
  checked: boolean
  onToggle: () => void
  title: string
  currentSummary: string
  children: React.ReactNode
}) {
  return (
    <div style={{
      borderRadius: 12,
      border: checked ? "1.5px solid rgba(124,99,200,0.30)" : "1px solid #F0ECF8",
      background: checked ? "rgba(124,99,200,0.03)" : "white",
      padding: 12,
    }}>
      <label style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        cursor: "pointer",
      }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          style={{
            marginTop: 3, accentColor: "#7C63C8",
            width: 16, height: 16, cursor: "pointer",
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 13.5, fontWeight: 700,
            color: "#111827", letterSpacing: "-0.005em",
          }}>
            {title}
          </p>
          <p style={{
            margin: "2px 0 0", fontSize: 12, color: "#6B7280",
            fontStyle: "italic",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            Actuel : {currentSummary}
          </p>
        </div>
      </label>
      {checked && (
        <div style={{ marginTop: 12, paddingLeft: 26 }}>
          {children}
        </div>
      )}
    </div>
  )
}

function LogoFrame({ src, placeholder, highlight }: { src: string | null | undefined; placeholder: string; highlight?: boolean }) {
  return (
    <div style={{
      width: "100%", aspectRatio: "2 / 1",
      borderRadius: 8,
      border: highlight ? "1px solid rgba(124,99,200,0.30)" : "1px solid #F0ECF8",
      background: "#FAFAFA",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", padding: 6 }} />
      ) : (
        <span style={{ fontSize: 11.5, color: "#9CA3AF", fontStyle: "italic" }}>{placeholder}</span>
      )}
    </div>
  )
}

const miniLabel: React.CSSProperties = {
  margin: "0 0 4px",
  fontSize: 10.5, fontWeight: 700,
  color: "#9CA3AF", letterSpacing: "0.05em", textTransform: "uppercase",
}

/**
 * Carte standalone pliable "Politique pricing" — vit dans la grille
 * /organisation à côté de Branding/Identité. Repliée par défaut pour
 * ne pas alourdir la page (le contenu n'est qu'un CTA "Configurer").
 */
function PricingPolicySectionCollapsible() {
  const [open, setOpen] = useState(false)
  return (
    <Card
      title="Politique pricing"
      subtitle="Marges cibles + avantages standards de l'organisation."
      headerRight={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            fontSize: 12, fontWeight: 700, color: "#7C63C8",
            background: "transparent", border: "none",
            padding: "4px 8px", cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {open ? "Replier ▴" : "Déplier ▾"}
        </button>
      }
    >
      {!open ? (
        <p style={{ margin: 0, fontSize: 12.5, color: "#6B7280" }}>
          Réutilisé sur chaque chiffrage candidat × mission.
        </p>
      ) : (
        <div style={{
          padding: "12px 14px", borderRadius: 10,
          background: "rgba(124,99,200,0.06)", border: "1px solid rgba(124,99,200,0.20)",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
          flexWrap: "wrap",
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "#111827" }}>
              Marges, avantages, lieux
            </p>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "#6B7280" }}>
              Configurez les paramètres détaillés.
            </p>
          </div>
          <a
            href="/organisation/parametrage"
            style={{
              padding: "8px 13px", borderRadius: 8,
              background: "#7C63C8", color: "white",
              fontSize: 12, fontWeight: 700,
              textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            Configurer →
          </a>
        </div>
      )}
    </Card>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Preview tools — visible UNIQUEMENT sur déploiements preview Vercel  */
/*                                                                     */
/* Permet à Elyas de re-déclencher des flows (onboarding, etc.) à      */
/* volonté pour tester les modifs avant merge. Inactif sur la prod     */
/* (le composant se retire tout seul si hostname != *.vercel.app).     */
/* ────────────────────────────────────────────────────────────────── */

function PreviewToolsCard() {
  const router = useRouter()
  const [isPreview, setIsPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Détection côté client : on n'affiche le composant que sur un
    // sous-domaine Vercel preview. Sur naywastudio.com il reste null.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPreview(window.location.hostname.endsWith(".vercel.app"))
  }, [])

  if (!isPreview) return null

  const resetOnboarding = async () => {
    if (busy) return
    if (!window.confirm("Recommencer l'onboarding ? Aucune donnée vivier/missions ne sera supprimée.")) return
    setBusy(true); setError(null)
    const res = await fetch("/api/cabinet/reset-onboarding", { method: "POST" })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? "Erreur lors de la réinitialisation.")
      setBusy(false)
      return
    }
    // Le proxy va re-rediriger vers /onboarding au prochain hit
    // /organisation. router.push direct sur /onboarding pour le confort.
    router.push("/onboarding")
  }

  return (
    <div style={{
      background: "linear-gradient(165deg, #FEF3C7 0%, #FDE68A 100%)",
      border: "1px solid #F59E0B",
      borderRadius: 14,
      padding: "16px 18px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      flexWrap: "wrap",
    }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <p style={{
          margin: "0 0 4px",
          fontSize: 11,
          fontWeight: 700,
          color: "#92400E",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}>
          Outils de preview
        </p>
        <p style={{
          margin: 0,
          fontSize: 13,
          color: "#78350F",
          lineHeight: 1.55,
        }}>
          Réservé aux déploiements preview Vercel. Recommencer
          l&apos;onboarding remet <code>cabinet_onboarded_at</code> à
          NULL — aucune donnée n&apos;est supprimée.
        </p>
        {error && (
          <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#B91C1C", fontWeight: 600 }}>
            {error}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={resetOnboarding}
        disabled={busy}
        style={{
          padding: "10px 16px",
          borderRadius: 10,
          border: "1px solid #92400E",
          background: "#92400E",
          color: "#FEF3C7",
          fontSize: 13,
          fontWeight: 700,
          cursor: busy ? "wait" : "pointer",
          fontFamily: "inherit",
          letterSpacing: "0.01em",
          whiteSpace: "nowrap",
        }}
      >
        {busy ? "Réinitialisation…" : "Recommencer l'onboarding"}
      </button>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Membres + invitations                                               */
/* ────────────────────────────────────────────────────────────────── */

function MembersSection({
  members, invites, seatsBudget, currentUserId, userEmail, isOwner, onChange,
}: {
  members: MemberRow[]
  invites: PendingInvite[]
  /** Nombre total de sièges payés (sub Stripe) ou alloués (legacy). */
  seatsBudget: number
  currentUserId: string
  userEmail: string
  isOwner: boolean
  onChange: () => void
}) {
  // Index du siège vide actuellement "ouvert" (en mode saisie email).
  // -1 = aucun siège en édition.
  const [editingSlot, setEditingSlot] = useState<number>(-1)
  const [inviteEmail, setInviteEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMessage, setOkMessage] = useState<string | null>(null)

  // Seats used = uniquement les membres ALLOUÉS + invitations en
  // attente. Owner sans siège alloué = pas comptabilisé.
  const seatsUsed = members.filter((m) => m.has_sourcing_seat).length + invites.length
  // Members sans siège alloué : peuvent être listés dans le menu
  // "+ Allouer un membre existant" sur les sièges vides.
  const unallocatedMembers = members.filter((m) => !m.has_sourcing_seat)
  // On affiche au moins `seatsBudget`, et plus si pour une raison
  // historique l'organisation a déjà plus de monde alloué que de sièges
  // payés (cas peu courant mais qu'on ne veut pas cacher).
  const seatsTotal = Math.max(seatsBudget, seatsUsed, 1)

  const sendInvite = async () => {
    const trimmed = inviteEmail.trim().toLowerCase()
    if (!trimmed || !trimmed.includes("@")) {
      setError("Adresse email invalide."); return
    }
    setBusy(true); setError(null); setOkMessage(null)
    const res = await fetch("/api/cabinet/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: trimmed }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? "Erreur lors de l'envoi.")
    } else {
      setInviteEmail("")
      setEditingSlot(-1)
      setOkMessage(`Invitation envoyée à ${trimmed}.`)
      onChange()
    }
    setBusy(false)
  }

  const revokeInvite = async (id: string) => {
    setBusy(true); setError(null); setOkMessage(null)
    const res = await fetch(`/api/cabinet/invite?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? "Erreur lors de la révocation.")
    } else {
      onChange()
    }
    setBusy(false)
  }

  // removeMember conservé pour les workflows admin futurs (retrait
  // total d'un membre, pas juste libération de siège). Pour l'instant
  // l'UI passe par deallocateMember : libérer un siège ne supprime pas
  // le profil. Le retrait full restera dispo via le bouton "Retirer
  // de l'organisation" sur la fiche membre individuelle si on l'ajoute
  // un jour.
  void (async (userId: string, label: string) => {
    if (!confirm(`Retirer ${label} de l'organisation ?`)) return
    await fetch(`/api/cabinet/members/${encodeURIComponent(userId)}`, { method: "DELETE" })
    onChange()
  })

  // Construction de la liste des sièges :
  //   1. Membres ALLOUÉS (owner alloué first), peu importe leur rôle
  //   2. Invitations en attente
  //   3. Sièges vides jusqu'au budget
  // Les membres sans siège alloué (typiquement l'owner par défaut) ne
  // sont PAS rendus comme occupant un siège — ils apparaissent dans
  // la liste de sélection "Allouer un membre existant" sur les sièges
  // vides.
  type Slot =
    | { kind: "member"; member: MemberRow }
    | { kind: "invite"; invite: PendingInvite }
    | { kind: "empty"; index: number }

  const allocatedMembers = members.filter((m) => m.has_sourcing_seat)
  const orderedAllocated: MemberRow[] = [
    ...allocatedMembers.filter((m) => m.role === "owner"),
    ...allocatedMembers.filter((m) => m.role !== "owner"),
  ]
  const slots: Slot[] = [
    ...orderedAllocated.map((m): Slot => ({ kind: "member", member: m })),
    ...invites.map((inv): Slot => ({ kind: "invite", invite: inv })),
  ]
  for (let i = slots.length; i < seatsTotal; i++) {
    slots.push({ kind: "empty", index: i })
  }

  /** Alloue un siège à un membre existant (owner ou member sans siège).
   *  Endpoint partagé avec le toggle self-seat owner. */
  const allocateExistingMember = async (userId: string) => {
    setBusy(true); setError(null); setOkMessage(null)
    const res = await fetch("/api/cabinet/seat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, allocate: true }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? "Allocation impossible.")
    } else {
      onChange()
    }
    setBusy(false)
  }

  /** Désalloue un siège (owner peut désallouer n'importe qui ; un member
   *  peut désallouer son propre siège). */
  const deallocateMember = async (userId: string, label: string) => {
    if (!confirm(`Libérer le siège de ${label} ? L'utilisateur reste dans l'organisation mais perd l'accès au workspace.`)) return
    setBusy(true); setError(null); setOkMessage(null)
    const res = await fetch("/api/cabinet/seat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, allocate: false }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? "Libération impossible.")
    } else {
      setOkMessage(`Siège de ${label} libéré.`)
      onChange()
    }
    setBusy(false)
  }

  return (
    <Card title="Membres" subtitle={`${seatsUsed} sur ${seatsTotal} sièges · vivier partagé`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflow: "auto" }}>
        {slots.map((slot, idx) => {
          if (slot.kind === "member") {
            const m = slot.member
            const canDeallocate = isOwner
            return (
              <div key={`m-${m.user_id}`} style={memberRowStyle}>
                <Avatar letter={(m.first_name?.[0] ?? "?").toUpperCase()} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={memberNameStyle}>
                    {m.first_name ?? "Sans prénom"}
                    {m.user_id === currentUserId && (
                      <span style={{ color: "#9CA3AF", fontWeight: 500 }}> · vous</span>
                    )}
                  </p>
                  {m.user_id === currentUserId && (
                    <p style={memberSubStyle}>{userEmail}</p>
                  )}
                </div>
                <RolePill role={m.role} />
                {canDeallocate && (
                  <button
                    type="button"
                    onClick={() => void deallocateMember(m.user_id, m.first_name ?? "ce membre")}
                    disabled={busy}
                    title="Libérer ce siège"
                    style={iconBtnStyle}
                  >
                    Libérer
                  </button>
                )}
              </div>
            )
          }

          if (slot.kind === "invite") {
            const inv = slot.invite
            return (
              <div key={`i-${inv.id}`} style={{
                ...memberRowStyle,
                background: "rgba(245,158,11,0.04)",
                border: "1px solid rgba(245,158,11,0.20)",
              }}>
                <Avatar letter={inv.email[0]?.toUpperCase() ?? "?"} dim />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={memberNameStyle}>{inv.email}</p>
                  <p style={memberSubStyle}>Invitation envoyée par email · en attente</p>
                </div>
                {isOwner && (
                  <button type="button" onClick={() => void revokeInvite(inv.id)} disabled={busy} style={iconBtnStyle}>
                    Annuler
                  </button>
                )}
              </div>
            )
          }

          // Siège vide — affichage CTA ou mode édition inline.
          const isEditing = editingSlot === slot.index
          if (isEditing) {
            return (
              <div key={`e-${idx}`} style={emptySeatRowStyle(true)}>
                <Avatar letter="+" dim />
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email@organisation.com"
                  autoFocus
                  disabled={busy}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void sendInvite()
                    if (e.key === "Escape") { setEditingSlot(-1); setInviteEmail("") }
                  }}
                  style={{ ...inputStyle, flex: 1, fontSize: 13, padding: "7px 10px" }}
                />
                <button
                  type="button"
                  onClick={sendInvite}
                  disabled={busy || !inviteEmail.trim()}
                  style={{
                    ...smallBtnPrimary,
                    opacity: busy || !inviteEmail.trim() ? 0.5 : 1,
                    cursor: busy || !inviteEmail.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  {busy ? "…" : "Envoyer"}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingSlot(-1); setInviteEmail(""); setError(null) }}
                  disabled={busy}
                  style={iconBtnStyle}
                  title="Annuler"
                >
                  ✕
                </button>
              </div>
            )
          }

          return (
            <div key={`e-${idx}`} style={emptySeatRowStyle(false)}>
              <Avatar letter="·" dim />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ ...memberNameStyle, color: "#9CA3AF", fontWeight: 600 }}>
                  Siège vide
                </p>
              </div>
              {isOwner && (
                <EmptySeatActions
                  unallocated={unallocatedMembers}
                  currentUserId={currentUserId}
                  busy={busy}
                  onInviteEmail={() => { setEditingSlot(slot.index); setError(null); setOkMessage(null) }}
                  onAllocate={(userId) => void allocateExistingMember(userId)}
                />
              )}
            </div>
          )
        })}
      </div>

      {error && <p style={{ margin: "10px 0 0", fontSize: 12, color: "#EF4444" }}>{error}</p>}
      {okMessage && <p style={{ margin: "10px 0 0", fontSize: 12, color: "#15803d" }}>{okMessage}</p>}

      <p style={{
        margin: "12px 0 0",
        fontSize: 11.5, color: "#9CA3AF", lineHeight: 1.55,
      }}>
        Les invitations sont envoyées par email. Le membre clique sur le lien
        reçu, choisit son mot de passe, et accède directement au workspace.
      </p>
    </Card>
  )
}

const emptySeatRowStyle = (editing: boolean): React.CSSProperties => ({
  display: "flex", alignItems: "center", gap: 10,
  padding: editing ? "8px 10px" : "10px 12px",
  borderRadius: 10,
  background: editing ? "rgba(124,99,200,0.06)" : "rgba(243,244,246,0.55)",
  border: editing ? "1px solid rgba(124,99,200,0.30)" : "1px dashed #E5E7EB",
})

/** Menu d'action sur un siège vide.
 *
 *  Si aucun membre sans siège n'existe -> simple bouton "+ Ajouter un
 *  membre" (invite par mail).
 *  Sinon -> dropdown qui propose :
 *    - "+ Ajouter un membre" (invite email, comme avant)
 *    - "M'allouer un siège" si l'owner courant n'a pas de siège
 *    - "Allouer à {first_name}" pour chaque membre non-alloué
 */
function EmptySeatActions({
  unallocated, currentUserId, busy, onInviteEmail, onAllocate,
}: {
  unallocated: MemberRow[]
  currentUserId: string
  busy: boolean
  onInviteEmail: () => void
  onAllocate: (userId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [open])

  // Aucun membre disponible -> bouton simple, pas de dropdown.
  if (unallocated.length === 0) {
    return (
      <button
        type="button"
        onClick={onInviteEmail}
        disabled={busy}
        style={addMemberBtnStyle}
      >
        + Ajouter un membre
      </button>
    )
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        style={addMemberBtnStyle}
      >
        + Allouer un siège ▾
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 240,
            background: "white",
            border: "1px solid #E5E7EB",
            borderRadius: 10,
            boxShadow: "0 12px 32px -8px rgba(17,24,39,0.20)",
            padding: 5,
            zIndex: 10,
            fontFamily: "var(--font-inter), sans-serif",
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onInviteEmail() }}
            style={dropdownItemStyle}
          >
            + Inviter un nouveau membre (email)
          </button>
          <div style={{ height: 1, background: "#F0ECF8", margin: "4px 0" }} />
          {unallocated.map((m) => {
            const isSelf = m.user_id === currentUserId
            return (
              <button
                key={m.user_id}
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); onAllocate(m.user_id) }}
                style={dropdownItemStyle}
              >
                {isSelf ? "M'allouer un siège" : `Allouer à ${m.first_name ?? "Sans prénom"}`}
                {m.role === "owner" && !isSelf && (
                  <span style={{ marginLeft: 6, fontSize: 10.5, color: "#9CA3AF", fontWeight: 500 }}>
                    (owner)
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const dropdownItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "8px 10px",
  borderRadius: 6,
  border: "none",
  background: "transparent",
  color: "#374151",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
}

const addMemberBtnStyle: React.CSSProperties = {
  padding: "6px 11px",
  borderRadius: 8,
  border: "1px solid rgba(124,99,200,0.30)",
  background: "white",
  color: "#7C63C8",
  fontSize: 11.5,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
}

function Avatar({ letter, dim }: { letter: string; dim?: boolean }) {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: "50%",
      background: dim ? "#F3F4F6" : "linear-gradient(135deg, #F0ECF8 0%, #E2DAF6 100%)",
      border: dim ? "1px solid #E5E7EB" : "1px solid rgba(124,99,200,0.30)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: dim ? "#9CA3AF" : "#7C63C8",
      fontWeight: 700, fontSize: 11.5,
      flexShrink: 0,
    }}>
      {letter}
    </div>
  )
}

function RolePill({ role }: { role: "owner" | "member" }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700,
      color: role === "owner" ? "#7C63C8" : "#6B7280",
      background: role === "owner" ? "rgba(124,99,200,0.08)" : "#F3F4F6",
      border: role === "owner" ? "1px solid rgba(124,99,200,0.22)" : "1px solid #E5E7EB",
      borderRadius: 100, padding: "2px 7px",
      textTransform: "uppercase", letterSpacing: "0.06em",
      flexShrink: 0,
    }}>
      {role === "owner" ? "Owner" : "Member"}
    </span>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Zone de danger                                                      */
/* ────────────────────────────────────────────────────────────────── */

function DangerSection({
  organization, seatsUsed, onDeleted,
}: {
  organization: { id: string; name: string; pending_deletion_at: string | null }
  seatsUsed: number
  onDeleted: () => void
}) {
  const [showModal, setShowModal] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const expectedConfirm = (organization.name || "").trim()
  const canDelete = confirmText.trim() === expectedConfirm && !busy
  const hasOtherMembers = seatsUsed > 1

  const doDelete = async () => {
    if (!canDelete) return
    setBusy(true); setError(null)
    const res = await fetch("/api/cabinet", { method: "DELETE" })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? "Erreur lors de la suppression.")
      setBusy(false)
      return
    }
    await getSupabase().auth.signOut()
    onDeleted()
  }

  if (organization.pending_deletion_at) return null

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <ExportDataCard />

      <section style={{
        padding: "16px 18px",
        background: "white",
        border: "1px solid rgba(239,68,68,0.30)",
        borderRadius: 14,
        boxSizing: "border-box",
      }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#B91C1C" }}>
          Zone de danger
        </h2>
        <p style={{ margin: "4px 0 12px", fontSize: 12.5, color: "#6B7280", lineHeight: 1.55 }}>
          Supprimer définitivement l&apos;organisation et toutes ses données.{" "}
          {hasOtherMembers
            ? <>Les autres membres garderont accès 30 jours.</>
            : <>La suppression est immédiate.</>}
        </p>
        <button type="button" onClick={() => setShowModal(true)}
          style={{
            padding: "8px 14px", borderRadius: 9,
            border: "1px solid rgba(239,68,68,0.35)",
            background: "white", color: "#B91C1C",
            fontSize: 12.5, fontWeight: 700, cursor: "pointer",
          }}>
          Supprimer mon organisation
        </button>

      {showModal && (
        <div role="dialog" aria-modal="true"
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(17,24,39,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div style={{
            width: "100%", maxWidth: 480,
            background: "white", borderRadius: 16, padding: 28,
            border: "1px solid rgba(239,68,68,0.25)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
          }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#B91C1C" }}>
              Supprimer {organization.name} ?
            </h3>
            <p style={{ margin: "10px 0 18px", fontSize: 13.5, color: "#4B5563", lineHeight: 1.6 }}>
              {hasOtherMembers ? (
                <>Vos collègues garderont l&apos;accès au workspace pendant <strong>30 jours</strong>. Passé ce délai, l&apos;organisation et toutes ses données seront supprimées définitivement.</>
              ) : (
                <>Toutes vos données (vivier, missions, pipeline, emails, paramètres) seront supprimées <strong>immédiatement et définitivement</strong>. Cette action est irréversible.</>
              )}
            </p>
            <Label>Tapez le nom de l&apos;organisation pour confirmer&nbsp;: <code style={{ background: "#F3F4F6", padding: "1px 6px", borderRadius: 4, color: "#111827" }}>{expectedConfirm}</code></Label>
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
              placeholder={expectedConfirm} autoFocus style={inputStyle} />
            {error && <p style={{ margin: "12px 0 0", fontSize: 13, color: "#EF4444" }}>{error}</p>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
              <button type="button" onClick={() => { setShowModal(false); setConfirmText(""); setError(null) }}
                disabled={busy} style={smallBtnGhost}>
                Annuler
              </button>
              <button type="button" onClick={doDelete} disabled={!canDelete}
                style={{
                  padding: "10px 18px", borderRadius: 10,
                  border: "none", color: "white",
                  background: canDelete ? "#B91C1C" : "#FCA5A5",
                  fontSize: 13, fontWeight: 700,
                  cursor: canDelete ? "pointer" : "not-allowed",
                }}>
                {busy ? "Suppression…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
      </section>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Export RGPD — bouton de téléchargement                              */
/* ────────────────────────────────────────────────────────────────── */

function ExportDataCard() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const download = () => {
    setBusy(true); setError(null)
    // Le navigateur déclenche le download via Content-Disposition. On
    // utilise un anchor invisible pour porter les credentials cookies.
    const a = document.createElement("a")
    a.href = "/api/export/me"
    a.download = ""
    a.rel = "noopener"
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      document.body.removeChild(a)
      setBusy(false)
    }, 1500)
  }

  return (
    <section style={{
      padding: "16px 18px",
      background: "white",
      border: "1px solid #F0ECF8",
      borderRadius: 14,
      boxSizing: "border-box",
    }}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827" }}>
        Exporter mes données
      </h2>
      <p style={{ margin: "4px 0 12px", fontSize: 12.5, color: "#6B7280", lineHeight: 1.55 }}>
        Téléchargez un fichier JSON avec l&apos;intégralité de votre organisation :
        candidats, missions, matches, mails et paramétrage. Conservez-le
        comme archive.
      </p>
      <p style={{ margin: "0 0 14px", fontSize: 11.5, color: "#9CA3AF", lineHeight: 1.55 }}>
        En raison des mises à jour produit, nous ne pouvons pas garantir la
        restauration complète de ces données dans une future version du service.
      </p>
      <button
        type="button"
        onClick={download}
        disabled={busy}
        style={{
          padding: "8px 14px", borderRadius: 9,
          border: "1px solid rgba(124,99,200,0.30)",
          background: "white", color: "#7C63C8",
          fontSize: 12.5, fontWeight: 700,
          cursor: busy ? "wait" : "pointer",
        }}
      >
        {busy ? "Préparation…" : "Télécharger l'export JSON"}
      </button>
      {error && <p style={{ margin: "10px 0 0", fontSize: 12, color: "#B91C1C" }}>{error}</p>}
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Shared building blocks                                              */
/* ────────────────────────────────────────────────────────────────── */

function Card({ title, subtitle, children, headerRight }: {
  title: string
  subtitle: string
  children: React.ReactNode
  /** Action optionnelle alignée à droite du titre (bouton Replier, etc.) */
  headerRight?: React.ReactNode
}) {
  return (
    <section style={{
      padding: "16px 18px",
      background: "white",
      border: "1px solid #F0ECF8",
      borderRadius: 14,
      height: "100%",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8,
        marginBottom: 4,
      }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827" }}>{title}</h2>
        {headerRight}
      </div>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "#9CA3AF" }}>{subtitle}</p>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </section>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display: "block", marginBottom: 5,
      fontSize: 11.5, fontWeight: 700, color: "#6B7280",
      letterSpacing: "0.03em",
    }}>
      {children}
    </label>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: "5px 0 0", fontSize: 11.5, color: "#9CA3AF", lineHeight: 1.5 }}>{children}</p>
  )
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 11px",
  borderRadius: 8, border: "1.5px solid #E5E7EB",
  fontSize: 13.5, color: "#111827",
  outline: "none", transition: "border-color 150ms",
  fontFamily: "var(--font-inter), sans-serif",
  boxSizing: "border-box",
}

const smallBtnPrimary: React.CSSProperties = {
  padding: "8px 13px", borderRadius: 8,
  border: "none", color: "white",
  background: "#7C63C8",
  fontSize: 12, fontWeight: 700, cursor: "pointer",
  fontFamily: "var(--font-inter), sans-serif",
  whiteSpace: "nowrap",
}

const smallBtnGhost: React.CSSProperties = {
  padding: "8px 13px", borderRadius: 8,
  border: "1px solid #E5E7EB", background: "white",
  color: "#374151",
  fontSize: 12, fontWeight: 600, cursor: "pointer",
  fontFamily: "var(--font-inter), sans-serif",
  whiteSpace: "nowrap",
}

const iconBtnStyle: React.CSSProperties = {
  padding: "5px 9px", borderRadius: 7,
  border: "1px solid #E5E7EB", background: "white",
  color: "#6B7280", fontSize: 11, fontWeight: 600,
  cursor: "pointer", flexShrink: 0,
  fontFamily: "var(--font-inter), sans-serif",
}

const memberRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 9,
  padding: "7px 9px",
  background: "#FAFAFA",
  border: "1px solid #F0ECF8",
  borderRadius: 10,
}
const memberNameStyle: React.CSSProperties = {
  margin: 0, fontSize: 12.5, fontWeight: 600, color: "#111827",
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
}
const memberSubStyle: React.CSSProperties = {
  margin: "1px 0 0", fontSize: 11, color: "#9CA3AF",
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
}
