"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { m } from "framer-motion"
import { useCabinet } from "./layout"
import { getSupabase } from "@/lib/supabase"
import { trialStatus, TRIAL_DURATION_DAYS } from "@/lib/trial"
import type { Organization } from "@/lib/database.types"

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
  const sb = useMemo(() => getSupabase(), [])

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
      .select("user_id, first_name, role")
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

  const seatsUsed = members.length + invites.length
  const trial = trialStatus(organization)
  const showPricingPolicy = trial.state !== "pending"

  return (
    <main style={{
      maxWidth: 1440, margin: "0 auto",
      padding: "24px 28px 56px",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      {!emailConfirmed && (
        <EmailConfirmationBanner email={userEmail} />
      )}

      {/* ── Hero ──────────────────────────────────────────── */}
      <m.section
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        style={{
          display: "flex", alignItems: "center", gap: 18,
          marginBottom: 18,
        }}
      >
        <HeroAvatar logoUrl={logoUrl} name={organization.brand_name ?? organization.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{
            margin: 0, fontSize: "clamp(22px, 2.4vw, 28px)", fontWeight: 800,
            color: "#111827", letterSpacing: "-0.02em", lineHeight: 1.1,
          }}>
            {organization.brand_name ?? organization.name}
          </h1>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <HeroPill kind="primary">Owner</HeroPill>
            <HeroPill kind="neutral">
              {members.length} membre{members.length > 1 ? "s" : ""}
            </HeroPill>
            {invites.length > 0 && (
              <HeroPill kind="warn">
                {invites.length} invitation{invites.length > 1 ? "s" : ""} en attente
              </HeroPill>
            )}
            {organization.pending_deletion_at ? (
              <HeroPill kind="warn">Résiliation en cours</HeroPill>
            ) : trial.state === "active" ? (
              <HeroPill kind="success">Essai · {trial.daysLeft} j restants</HeroPill>
            ) : trial.state === "expired" ? (
              <HeroPill kind="warn">Essai terminé</HeroPill>
            ) : (
              <HeroPill kind="neutral">Essai non activé</HeroPill>
            )}
          </div>
        </div>
      </m.section>

      {/* ── Mon siège — bandeau au-dessus du dashboard ─────── */}
      <MySeatBanner
        hasSeat={profile.has_sourcing_seat}
        onToggle={refetch}
        isOwner={isOwner}
      />

      {/* ── Grid principale 3 col ─────────────────────────── */}
      <div className="cab-grid-3" style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 16,
        marginTop: 14,
      }}>
        <SubscriptionCard
          organization={organization}
          onActivated={refetch}
          isOwner={isOwner}
        />
        <MembersSection
          members={members}
          invites={invites}
          seatsUsed={seatsUsed}
          seatsTotal={organization.seats_total}
          currentUserId={profile.user_id}
          userEmail={userEmail}
          isOwner={isOwner}
          onChange={() => { void loadInvites() }}
        />
        <IdentitySection
          organization={organization}
          logoUrl={logoUrl}
          isOwner={isOwner}
          onUpdated={refetch}
        />
      </div>

      {/* ── Grid secondaire 2 col ─────────────────────────── */}
      <div className="cab-grid-2" style={{
        display: "grid",
        gridTemplateColumns: showPricingPolicy ? "repeat(2, minmax(0, 1fr))" : "1fr",
        gap: 16,
        marginTop: 16,
      }}>
        {showPricingPolicy && <PricingPolicyCard />}
        <DangerSection
          organization={organization}
          seatsUsed={seatsUsed}
          onDeleted={() => router.replace("/")}
        />
      </div>

      <style>{`
        @media (max-width: 1100px) {
          .cab-grid-3 { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 720px) {
          .cab-grid-3, .cab-grid-2 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Email confirmation                                                   */
/* ────────────────────────────────────────────────────────────────── */

function EmailConfirmationBanner({ email }: { email: string }) {
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resend = async () => {
    setBusy(true); setError(null)
    try {
      const { error: err } = await getSupabase().auth.resend({
        type: "signup",
        email,
      })
      if (err) throw err
      setSent(true)
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
      {sent ? (
        <span style={{ fontSize: 12, fontWeight: 600, color: "#15803D" }}>
          Email renvoyé.
        </span>
      ) : (
        <button
          type="button"
          onClick={resend}
          disabled={busy}
          style={{
            padding: "6px 12px", borderRadius: 8,
            border: "1px solid rgba(217,119,6,0.40)",
            background: "white", color: "#92400E",
            fontSize: 12, fontWeight: 700, cursor: busy ? "wait" : "pointer",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
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

function HeroAvatar({ logoUrl, name }: { logoUrl: string | null; name: string | null }) {
  const initials = (name ?? "")
    .split(/\s+/).slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "").join("") || "?"
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl} alt=""
        style={{
          width: 60, height: 60, borderRadius: 14,
          objectFit: "cover",
          border: "1px solid #F0ECF8", background: "white",
          flexShrink: 0,
        }}
      />
    )
  }
  return (
    <div style={{
      width: 60, height: 60, borderRadius: 14,
      background: "linear-gradient(135deg, #F0ECF8 0%, #E2DAF6 100%)",
      border: "1px solid rgba(124,99,200,0.30)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#7C63C8", fontWeight: 800, fontSize: 20,
      flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}

type PillKind = "primary" | "neutral" | "success" | "warn"
const PILL_STYLE: Record<PillKind, React.CSSProperties> = {
  primary: { color: "#7C63C8", background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.22)" },
  neutral: { color: "#6B7280", background: "#F3F4F6",               border: "1px solid #E5E7EB" },
  success: { color: "#15803d", background: "rgba(34,197,94,0.10)",  border: "1px solid rgba(34,197,94,0.30)" },
  warn:    { color: "#B45309", background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.30)" },
}
function HeroPill({ kind, children }: { kind: PillKind; children: React.ReactNode }) {
  return (
    <span style={{
      ...PILL_STYLE[kind],
      fontSize: 11, fontWeight: 700,
      padding: "3px 10px", borderRadius: 100,
      letterSpacing: "0.04em", textTransform: "uppercase",
    }}>
      {children}
    </span>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Subscription (trial-aware)                                          */
/* ────────────────────────────────────────────────────────────────── */

function SubscriptionCard({
  organization, onActivated, isOwner,
}: {
  organization: Organization
  onActivated: () => Promise<void>
  isOwner: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const status = trialStatus(organization)

  if (organization.pending_deletion_at) {
    const date = new Date(organization.pending_deletion_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    return (
      <Card title="Abonnement" subtitle="Statut du Package Sourcing.">
        <Panel tone="warn">
          <p style={panelTitle("#D97706")}>Résiliation en cours</p>
          <p style={panelBody("#92400E")}>
            Le cabinet et toutes ses données seront supprimés le <strong>{date}</strong>.
          </p>
        </Panel>
      </Card>
    )
  }

  const activate = async () => {
    if (!isOwner) return
    setBusy(true); setError(null)
    try {
      const res = await fetch("/api/cabinet/activate-trial", { method: "POST" })
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(j.error ?? "Activation impossible")
      }
      await onActivated()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Abonnement" subtitle="Package Sourcing : votre essai et votre formule.">
      {status.state === "pending" && (
        <Panel tone="brand">
          <p style={panelTitle("#7C63C8")}>Essai non activé</p>
          <p style={panelBody("#374151")}>
            Activez vos {TRIAL_DURATION_DAYS} jours d&apos;essai gratuit pour
            débloquer le workspace.
          </p>
          <button
            type="button"
            onClick={activate}
            disabled={busy || !isOwner}
            style={{
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
            }}
          >
            {busy ? "Activation…" : `Activer mes ${TRIAL_DURATION_DAYS} jours gratuits`}
          </button>
        </Panel>
      )}

      {status.state === "active" && (
        <Panel tone="success">
          <p style={panelTitle("#15803D")}>
            Essai actif · {status.daysLeft} jour{status.daysLeft > 1 ? "s" : ""} restant{status.daysLeft > 1 ? "s" : ""}
          </p>
          <p style={panelBody("#166534")}>
            Termine le{" "}
            <strong>
              {status.endsAt?.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
            </strong>
            . Discutons d&apos;un abonnement adapté à votre équipe.
          </p>
          <Link
            href="/contact"
            style={{
              display: "inline-block",
              marginTop: 10,
              padding: "9px 14px",
              borderRadius: 10,
              border: "1px solid rgba(124,99,200,0.30)",
              background: "white",
              color: "#7C63C8",
              fontSize: 12.5,
              fontWeight: 700,
              textDecoration: "none",
              textAlign: "center",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            Discuter abonnement →
          </Link>
        </Panel>
      )}

      {status.state === "expired" && (
        <Panel tone="warn">
          <p style={panelTitle("#B91C1C")}>Période d&apos;essai terminée</p>
          <p style={panelBody("#7F1D1D")}>
            Vous gardez l&apos;accès à votre organisation, mais nous aimerions
            convenir d&apos;un abonnement avant d&apos;aller plus loin.
          </p>
          <Link
            href="/contact"
            style={{
              display: "inline-block",
              marginTop: 10,
              padding: "9px 14px",
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(120deg, #DC2626 0%, #B91C1C 100%)",
              color: "white",
              fontSize: 12.5,
              fontWeight: 700,
              textDecoration: "none",
              textAlign: "center",
              width: "100%",
              boxSizing: "border-box",
              boxShadow: "0 6px 16px -4px rgba(220,38,38,0.40)",
            }}
          >
            Contactez-nous pour activer →
          </Link>
        </Panel>
      )}

      {error && (
        <p style={{ margin: "10px 0 0", fontSize: 12, color: "#B91C1C" }}>{error}</p>
      )}

      <div style={{ marginTop: 14, fontSize: 11.5, color: "#9CA3AF", lineHeight: 1.55 }}>
        Facturation Stripe à venir. {organization.seats_total} siège{organization.seats_total > 1 ? "s" : ""} alloué{organization.seats_total > 1 ? "s" : ""}.
      </div>
    </Card>
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

function IdentitySection({
  organization, logoUrl, isOwner, onUpdated,
}: {
  organization: { id: string; name: string; brand_name: string | null; brand_logo_path: string | null; mailing_domain: string | null }
  logoUrl: string | null
  isOwner: boolean
  onUpdated: () => Promise<void>
}) {
  const sb = useMemo(() => getSupabase(), [])
  const [name, setName] = useState(organization.brand_name ?? organization.name)
  const [busy, setBusy] = useState<"idle" | "saving" | "uploading" | "deleting">("idle")
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const saveName = async () => {
    if (!isOwner) return
    setBusy("saving"); setError(null)
    const res = await fetch("/api/cabinet", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim() || null, brand_name: name.trim() || null }),
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
    const res = await fetch("/api/cabinet", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brand_logo_path: path }),
    })
    if (!res.ok) setError("Logo téléversé mais sauvegarde en échec.")
    else await onUpdated()
    setBusy("idle")
  }

  const removeLogo = async () => {
    if (!isOwner) return
    setBusy("deleting"); setError(null)
    if (organization.brand_logo_path) {
      await sb.storage.from("brand-logos").remove([organization.brand_logo_path])
    }
    await fetch("/api/cabinet", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brand_logo_path: null }),
    })
    await onUpdated()
    setBusy("idle")
  }

  return (
    <Card title="Identité du cabinet" subtitle="Apparaît sur les CV anonymisés et vos emails sortants.">
      <Label>Nom du cabinet</Label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Organisation Dupont"
        disabled={!isOwner || busy === "saving"}
        onBlur={saveName}
        style={inputStyle}
      />
      <Hint>
        {busy === "saving" ? "Sauvegarde…" : "Sauvegarde automatique"}
      </Hint>

      <div style={{ marginTop: 14 }}>
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
        </div>
        <input ref={fileInput} type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) { void uploadLogo(f); e.target.value = "" }
          }}
        />
      </div>

      {error && <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "#EF4444" }}>{error}</p>}
    </Card>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Membres + invitations                                               */
/* ────────────────────────────────────────────────────────────────── */

function MembersSection({
  members, invites, seatsUsed, seatsTotal, currentUserId, userEmail, isOwner, onChange,
}: {
  members: MemberRow[]
  invites: PendingInvite[]
  seatsUsed: number
  seatsTotal: number
  currentUserId: string
  userEmail: string
  isOwner: boolean
  onChange: () => void
}) {
  const [inviteEmail, setInviteEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMessage, setOkMessage] = useState<string | null>(null)

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

  const removeMember = async (userId: string, label: string) => {
    if (!confirm(`Retirer ${label} du cabinet ? Son compte et son accès au workspace seront supprimés.`)) return
    setBusy(true); setError(null); setOkMessage(null)
    const res = await fetch(`/api/cabinet/members/${encodeURIComponent(userId)}`, { method: "DELETE" })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? "Erreur lors du retrait.")
    } else {
      setOkMessage(`${label} a été retiré du cabinet.`)
      onChange()
    }
    setBusy(false)
  }

  return (
    <Card title="Membres" subtitle={`${seatsUsed} sur ${Math.max(seatsTotal, seatsUsed)} sièges · vivier partagé`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 230, overflow: "auto" }}>
        {members.map((m) => {
          const canRemove = isOwner && m.role !== "owner" && m.user_id !== currentUserId
          return (
            <div key={m.user_id} style={memberRowStyle}>
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
              {canRemove && (
                <button
                  type="button"
                  onClick={() => void removeMember(m.user_id, m.first_name ?? "ce membre")}
                  disabled={busy}
                  title="Retirer du cabinet"
                  style={iconBtnStyle}
                >
                  Retirer
                </button>
              )}
            </div>
          )
        })}

        {invites.map((inv) => (
          <div key={inv.id} style={{
            ...memberRowStyle,
            background: "rgba(245,158,11,0.04)",
            border: "1px solid rgba(245,158,11,0.20)",
          }}>
            <Avatar letter={inv.email[0]?.toUpperCase() ?? "?"} dim />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={memberNameStyle}>{inv.email}</p>
              <p style={memberSubStyle}>Invitation envoyée · en attente</p>
            </div>
            {isOwner && (
              <button type="button" onClick={() => void revokeInvite(inv.id)} disabled={busy} style={iconBtnStyle}>
                Annuler
              </button>
            )}
          </div>
        ))}
      </div>

      {isOwner && (
        <div style={{ marginTop: 12 }}>
          <Label>Inviter par email</Label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="collegue@cabinet.com"
              disabled={busy}
              onKeyDown={(e) => { if (e.key === "Enter") void sendInvite() }}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button type="button" onClick={sendInvite} disabled={busy || !inviteEmail.trim()} style={{
              ...smallBtnPrimary,
              opacity: busy || !inviteEmail.trim() ? 0.5 : 1,
              cursor: busy || !inviteEmail.trim() ? "not-allowed" : "pointer",
            }}>
              {busy ? "…" : "Inviter"}
            </button>
          </div>
          {error && <p style={{ margin: "7px 0 0", fontSize: 12, color: "#EF4444" }}>{error}</p>}
          {okMessage && <p style={{ margin: "7px 0 0", fontSize: 12, color: "#15803d" }}>{okMessage}</p>}
        </div>
      )}
    </Card>
  )
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
/* Politique pricing                                                    */
/* ────────────────────────────────────────────────────────────────── */

function PricingPolicyCard() {
  return (
    <Card title="Politique pricing" subtitle="Marges cibles + avantages standards du cabinet.">
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
            Réutilisé sur chaque chiffrage candidat × mission.
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
    </Card>
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
    <section style={{
      padding: "16px 18px",
      background: "white",
      border: "1px solid rgba(239,68,68,0.30)",
      borderRadius: 14,
      height: "100%",
      boxSizing: "border-box",
    }}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#B91C1C" }}>
        Zone de danger
      </h2>
      <p style={{ margin: "4px 0 12px", fontSize: 12.5, color: "#6B7280", lineHeight: 1.55 }}>
        Supprimer définitivement le cabinet et toutes ses données.{" "}
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
        Supprimer mon cabinet
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
                <>Vos collègues garderont l&apos;accès au workspace pendant <strong>30 jours</strong>. Passé ce délai, le cabinet et toutes ses données seront supprimés définitivement.</>
              ) : (
                <>Toutes vos données (vivier, missions, pipeline, emails, paramètres) seront supprimées <strong>immédiatement et définitivement</strong>. Cette action est irréversible.</>
              )}
            </p>
            <Label>Tapez le nom du cabinet pour confirmer&nbsp;: <code style={{ background: "#F3F4F6", padding: "1px 6px", borderRadius: 4, color: "#111827" }}>{expectedConfirm}</code></Label>
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
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Shared building blocks                                              */
/* ────────────────────────────────────────────────────────────────── */

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
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
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827" }}>{title}</h2>
      <p style={{ margin: "4px 0 12px", fontSize: 12, color: "#9CA3AF" }}>{subtitle}</p>
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
