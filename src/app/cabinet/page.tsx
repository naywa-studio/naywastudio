"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { m } from "framer-motion"
import { useCabinet } from "./layout"
import { getSupabase } from "@/lib/supabase"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

/**
 * /cabinet — Console cabinet (owner area), dashboard-style.
 *
 * 12-col landscape grid:
 *   Hero (12)
 *   Identité (7)              | Membres (5)
 *   Abonnement (7)            | Zone de danger (5)
 *
 * Designed to fit on a single screen at 1440×900 without scrolling.
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
  const { profile, organization, userEmail, isOwner, refetch } = useCabinet()
  const router = useRouter()
  const sb = useMemo(() => getSupabase(), [])

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

  return (
    <main style={{
      maxWidth: 1280, margin: "0 auto",
      padding: "28px 24px 48px",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      {/* ── Hero ──────────────────────────────────────────── */}
      <m.section
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        style={{
          display: "flex", alignItems: "center", gap: 18,
          marginBottom: 22,
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
            <HeroPill kind={profile.role === "owner" ? "primary" : "neutral"}>
              {profile.role === "owner" ? "Owner" : "Member"}
            </HeroPill>
            <HeroPill kind="neutral">
              {members.length} membre{members.length > 1 ? "s" : ""}
            </HeroPill>
            {invites.length > 0 && (
              <HeroPill kind="warn">
                {invites.length} invitation{invites.length > 1 ? "s" : ""} en attente
              </HeroPill>
            )}
            <HeroPill kind={organization.package_sourcing_active && !organization.pending_deletion_at ? "success" : "warn"}>
              {organization.pending_deletion_at ? "Résiliation en cours" : "Package Sourcing actif"}
            </HeroPill>
          </div>
        </div>
      </m.section>

      {/* ── 12-col grid ───────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
        gap: 16,
      }}>
        <div style={{ gridColumn: "span 7" }}>
          <IdentitySection
            organization={organization}
            logoUrl={logoUrl}
            isOwner={isOwner}
            onUpdated={refetch}
          />
        </div>
        <div style={{ gridColumn: "span 5" }}>
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
        </div>

        <div style={{ gridColumn: "span 7" }}>
          <SubscriptionSection organization={organization} />
        </div>
        <div style={{ gridColumn: "span 5" }}>
          {isOwner && (
            <DangerSection
              organization={organization}
              seatsUsed={seatsUsed}
              onDeleted={() => router.replace("/")}
            />
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 880px) {
          [data-cabinet-grid] > div { grid-column: span 12 !important; }
        }
      `}</style>
    </main>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Hero bits                                                            */
/* ────────────────────────────────────────────────────────────────── */

function HeroAvatar({ logoUrl, name }: { logoUrl: string | null; name: string | null }) {
  const initials = (name ?? "")
    .split(/\s+/).slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "").join("") || "—"
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
      fontSize: 11.5, fontWeight: 700,
      padding: "3px 10px", borderRadius: 100,
      letterSpacing: "0.04em", textTransform: "uppercase",
    }}>
      {children}
    </span>
  )
}

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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 16, alignItems: "flex-start" }}>
        <div>
          <Label>Nom du cabinet</Label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Cabinet Dupont Recrutement"
            disabled={!isOwner || busy === "saving"}
            onBlur={saveName}
            style={inputStyle}
          />
          <Hint>
            {busy === "saving" ? "Sauvegarde…" : "Sauvegarde automatique"}
          </Hint>

          <div style={{ marginTop: 14 }}>
            <Label>Domaine d&apos;envoi</Label>
            <input
              value=""
              placeholder="Bientôt — envoi depuis votre propre domaine"
              disabled
              style={{ ...inputStyle, background: "#F8F6FF", color: "#9CA3AF", cursor: "not-allowed" }}
            />
            <Hint>Pour l&apos;instant, vos emails partent depuis le domaine partagé Naywa.</Hint>
          </div>
        </div>

        <div>
          <Label>Logo</Label>
          <div style={{
            width: 130, height: 130,
            borderRadius: 14, border: "1.5px dashed #E2DAF6",
            background: "#FAFAFA",
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden",
          }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 10 }} />
            ) : (
              <span style={{ fontSize: 11, color: "#9CA3AF" }}>Aucun logo</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
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
          <input ref={fileInput} type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) { void uploadLogo(f); e.target.value = "" }
            }}
          />
        </div>
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

  return (
    <Card title="Membres" subtitle={`${seatsUsed} sur ${Math.max(seatsTotal, seatsUsed)} sièges · vivier partagé`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflow: "auto" }}>
        {members.map((m) => (
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
          </div>
        ))}

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
        <div style={{ marginTop: 14 }}>
          <Label>Inviter un membre par email</Label>
          <div style={{ display: "flex", gap: 8 }}>
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
              {busy ? "Envoi…" : "Inviter"}
            </button>
          </div>
          {error && <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#EF4444" }}>{error}</p>}
          {okMessage && <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#15803d" }}>{okMessage}</p>}
        </div>
      )}
    </Card>
  )
}

function Avatar({ letter, dim }: { letter: string; dim?: boolean }) {
  return (
    <div style={{
      width: 30, height: 30, borderRadius: "50%",
      background: dim ? "#F3F4F6" : "linear-gradient(135deg, #F0ECF8 0%, #E2DAF6 100%)",
      border: dim ? "1px solid #E5E7EB" : "1px solid rgba(124,99,200,0.30)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: dim ? "#9CA3AF" : "#7C63C8",
      fontWeight: 700, fontSize: 12,
      flexShrink: 0,
    }}>
      {letter}
    </div>
  )
}

function RolePill({ role }: { role: "owner" | "member" }) {
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700,
      color: role === "owner" ? "#7C63C8" : "#6B7280",
      background: role === "owner" ? "rgba(124,99,200,0.08)" : "#F3F4F6",
      border: role === "owner" ? "1px solid rgba(124,99,200,0.22)" : "1px solid #E5E7EB",
      borderRadius: 100, padding: "2px 8px",
      textTransform: "uppercase", letterSpacing: "0.06em",
      flexShrink: 0,
    }}>
      {role === "owner" ? "Owner" : "Member"}
    </span>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Abonnement                                                          */
/* ────────────────────────────────────────────────────────────────── */

function SubscriptionSection({ organization }: {
  organization: { package_sourcing_active: boolean; seats_total: number; pending_deletion_at: string | null }
}) {
  if (organization.pending_deletion_at) {
    const date = new Date(organization.pending_deletion_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    return (
      <Card title="Abonnement" subtitle="Statut du Package Sourcing.">
        <div style={{
          padding: "12px 14px", borderRadius: 10,
          background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.25)",
        }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "#D97706" }}>
            Résiliation en cours
          </p>
          <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "#92400E", lineHeight: 1.5 }}>
            Le cabinet et toutes ses données seront supprimés le <strong>{date}</strong>.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card title="Abonnement" subtitle="Statut du Package Sourcing.">
      <div style={{
        padding: "12px 14px", borderRadius: 10,
        background: "rgba(124,99,200,0.06)", border: "1px solid rgba(124,99,200,0.20)",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
        flexWrap: "wrap",
      }}>
        <div>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "#111827" }}>
            Package Sourcing · actif
          </p>
          <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "#6B7280" }}>
            {organization.seats_total} siège{organization.seats_total > 1 ? "s" : ""} · facturation pas encore active (beta)
          </p>
        </div>
        <button type="button" disabled title="Stripe arrivera bientôt"
          style={{ ...smallBtnGhost, opacity: 0.55, cursor: "not-allowed" }}>
          Gérer · bientôt
        </button>
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
      padding: "18px 20px",
      background: "white",
      border: "1px solid rgba(239,68,68,0.30)",
      borderRadius: 14,
    }}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#B91C1C" }}>
        Zone de danger
      </h2>
      <p style={{ margin: "5px 0 12px", fontSize: 12.5, color: "#6B7280", lineHeight: 1.55 }}>
        Supprimer définitivement le cabinet et toutes ses données.{" "}
        {hasOtherMembers
          ? <>Les autres membres garderont accès 30 jours.</>
          : <>La suppression est immédiate et définitive.</>}
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
      padding: "18px 20px",
      background: "white",
      border: "1px solid #F0ECF8",
      borderRadius: 14,
      height: "100%",
      boxSizing: "border-box",
    }}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827" }}>{title}</h2>
      <p style={{ margin: "4px 0 14px", fontSize: 12.5, color: "#9CA3AF" }}>{subtitle}</p>
      {children}
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
  padding: "5px 10px", borderRadius: 7,
  border: "1px solid #E5E7EB", background: "white",
  color: "#6B7280", fontSize: 11.5, fontWeight: 600,
  cursor: "pointer", flexShrink: 0,
  fontFamily: "var(--font-inter), sans-serif",
}

const memberRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10,
  padding: "8px 10px",
  background: "#FAFAFA",
  border: "1px solid #F0ECF8",
  borderRadius: 10,
}
const memberNameStyle: React.CSSProperties = {
  margin: 0, fontSize: 13, fontWeight: 600, color: "#111827",
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
}
const memberSubStyle: React.CSSProperties = {
  margin: "1px 0 0", fontSize: 11.5, color: "#9CA3AF",
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
}
