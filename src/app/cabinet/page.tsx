"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { m } from "framer-motion"
import { useCabinet } from "./layout"
import { getSupabase } from "@/lib/supabase"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

/**
 * /cabinet — Console cabinet (owner area).
 *
 * Sections :
 *   1. Identité  : nom du cabinet + logo + mailing domain (masqué V1)
 *   2. Membres   : liste de l'équipe + bouton "Inviter" (UI seule pour V1,
 *                  l'API d'invitation arrive à l'étape suivante)
 *   3. Abonnement: statut Package Sourcing — placeholder tant que Stripe
 *                  n'est pas branché
 *   4. Danger    : supprimer le cabinet (immédiat si solo, grace 30 j sinon)
 */

interface MemberRow {
  user_id: string
  first_name: string | null
  role: "owner" | "member"
}

export default function CabinetPage() {
  const { profile, organization, userEmail, isOwner, refetch } = useCabinet()
  const router = useRouter()
  const sb = useMemo(() => getSupabase(), [])

  const [members, setMembers] = useState<MemberRow[]>([])
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  // Load org members
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await sb
        .from("profiles")
        .select("user_id, first_name, role")
        .eq("organization_id", organization.id)
        .order("role", { ascending: true })
      if (mounted) setMembers((data ?? []) as MemberRow[])
    })()
    return () => { mounted = false }
  }, [sb, organization.id])

  // Sign URL for the org logo
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

  const seatsUsed = members.length

  return (
    <main style={{
      maxWidth: 920, margin: "0 auto",
      padding: "44px 24px 80px",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      <m.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE }}
      >
        <h1 style={{
          margin: 0, fontSize: "clamp(24px, 3.2vw, 32px)", fontWeight: 800,
          color: "#111827", letterSpacing: "-0.025em", lineHeight: 1.15,
        }}>
          {organization.name}
        </h1>
        <p style={{ margin: "8px 0 32px", fontSize: 14, color: "#6B7280", lineHeight: 1.6 }}>
          Vous êtes <strong style={{ color: "#111827" }}>{profile.role === "owner" ? "owner" : "member"}</strong> de ce cabinet. {isOwner && "Vous pouvez modifier l'identité, gérer les membres et résilier."}
        </p>
      </m.div>

      <IdentitySection
        organization={organization}
        logoUrl={logoUrl}
        isOwner={isOwner}
        onUpdated={refetch}
      />

      <MembersSection
        members={members}
        seatsTotal={organization.seats_total}
        seatsUsed={seatsUsed}
        currentUserId={profile.user_id}
        userEmail={userEmail}
        isOwner={isOwner}
      />

      <SubscriptionSection organization={organization} />

      {isOwner && (
        <DangerSection
          organization={organization}
          seatsUsed={seatsUsed}
          onDeleted={() => router.replace("/")}
        />
      )}
    </main>
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
    if (!res.ok) {
      setError("Logo téléversé mais sauvegarde en échec.")
    } else {
      await onUpdated()
    }
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
    <Section title="Identité du cabinet" subtitle="Apparaît sur les CV anonymisés et dans tous vos emails sortants.">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 24, alignItems: "flex-start" }}>
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
          {busy === "saving" && <Hint>Sauvegarde…</Hint>}

          <div style={{ marginTop: 18 }}>
            <Label>Domaine d&apos;envoi (futur)</Label>
            <input
              value=""
              placeholder="Bientôt — envoi depuis votre propre domaine"
              disabled
              style={{ ...inputStyle, background: "#F8F6FF", color: "#9CA3AF", cursor: "not-allowed" }}
            />
            <Hint>Pour l&apos;instant, vos emails partent depuis le domaine partagé Naywa. Le routage sur votre propre nom de domaine arrive bientôt.</Hint>
          </div>
        </div>

        <div>
          <Label>Logo</Label>
          <div style={{
            width: "100%", aspectRatio: "1 / 1",
            borderRadius: 14, border: "1.5px dashed #E2DAF6",
            background: "#FAFAFA",
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden",
            position: "relative",
          }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 14 }} />
            ) : (
              <span style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: 10 }}>
                Aucun logo
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={!isOwner || busy !== "idle"}
              style={smallBtnPrimary}
            >
              {busy === "uploading" ? "Téléversement…" : logoUrl ? "Remplacer" : "Téléverser"}
            </button>
            {logoUrl && isOwner && (
              <button
                type="button"
                onClick={removeLogo}
                disabled={busy !== "idle"}
                style={smallBtnGhost}
              >
                Retirer
              </button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) { void uploadLogo(f); e.target.value = "" }
            }}
          />
        </div>
      </div>
      {error && <p style={{ margin: "12px 0 0", fontSize: 13, color: "#EF4444" }}>{error}</p>}
    </Section>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Membres                                                             */
/* ────────────────────────────────────────────────────────────────── */

function MembersSection({
  members, seatsTotal, seatsUsed, currentUserId, userEmail, isOwner,
}: {
  members: MemberRow[]
  seatsTotal: number
  seatsUsed: number
  currentUserId: string
  userEmail: string
  isOwner: boolean
}) {
  return (
    <Section
      title="Membres"
      subtitle={`${seatsUsed} sur ${Math.max(seatsTotal, seatsUsed)} sièges utilisés. Tous les membres partagent le même vivier.`}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {members.map((m) => (
          <div key={m.user_id} style={memberRowStyle}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: "linear-gradient(135deg, #F0ECF8 0%, #E2DAF6 100%)",
              border: "1px solid rgba(124,99,200,0.30)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#7C63C8", fontWeight: 700, fontSize: 13,
              flexShrink: 0,
            }}>
              {(m.first_name?.[0] ?? "?").toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                margin: 0, fontSize: 14, fontWeight: 600, color: "#111827",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {m.first_name ?? "Sans prénom"}
                {m.user_id === currentUserId && (
                  <span style={{ color: "#9CA3AF", fontWeight: 500 }}> · vous</span>
                )}
              </p>
              {m.user_id === currentUserId && (
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9CA3AF" }}>
                  {userEmail}
                </p>
              )}
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: m.role === "owner" ? "#7C63C8" : "#6B7280",
              background: m.role === "owner" ? "rgba(124,99,200,0.08)" : "#F3F4F6",
              border: m.role === "owner" ? "1px solid rgba(124,99,200,0.22)" : "1px solid #E5E7EB",
              borderRadius: 100, padding: "3px 10px",
              textTransform: "uppercase", letterSpacing: "0.06em",
              flexShrink: 0,
            }}>
              {m.role === "owner" ? "Owner" : "Member"}
            </span>
          </div>
        ))}
      </div>

      {isOwner && (
        <button
          type="button"
          disabled
          title="Le flow d'invitation arrive très bientôt"
          style={{
            ...smallBtnPrimary,
            marginTop: 14,
            opacity: 0.55, cursor: "not-allowed",
          }}
        >
          Inviter un membre · bientôt
        </button>
      )}
    </Section>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Abonnement                                                          */
/* ────────────────────────────────────────────────────────────────── */

function SubscriptionSection({ organization }: { organization: { package_sourcing_active: boolean; seats_total: number; pending_deletion_at: string | null } }) {
  if (organization.pending_deletion_at) {
    const date = new Date(organization.pending_deletion_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    return (
      <Section title="Abonnement" subtitle="Statut du Package Sourcing.">
        <div style={{
          padding: "14px 16px", borderRadius: 12,
          background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.25)",
        }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#D97706" }}>
            Résiliation en cours.
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#92400E", lineHeight: 1.5 }}>
            Le cabinet et toutes ses données seront supprimés le <strong>{date}</strong>.
          </p>
        </div>
      </Section>
    )
  }

  return (
    <Section title="Abonnement" subtitle="Statut du Package Sourcing.">
      <div style={{
        padding: "14px 16px", borderRadius: 12,
        background: "rgba(124,99,200,0.06)", border: "1px solid rgba(124,99,200,0.20)",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
      }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827" }}>
            Package Sourcing · actif
          </p>
          <p style={{ margin: "3px 0 0", fontSize: 13, color: "#6B7280" }}>
            {organization.seats_total} siège{organization.seats_total > 1 ? "s" : ""} · facturation pas encore active (beta)
          </p>
        </div>
        <button
          type="button"
          disabled
          title="Stripe arrivera bientôt"
          style={{ ...smallBtnGhost, opacity: 0.55, cursor: "not-allowed" }}
        >
          Gérer le paiement · bientôt
        </button>
      </div>
    </Section>
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
    // Sign out + bounce
    await getSupabase().auth.signOut()
    onDeleted()
  }

  if (organization.pending_deletion_at) return null

  return (
    <section style={{
      marginTop: 32,
      padding: "20px 22px",
      background: "white",
      border: "1px solid rgba(239,68,68,0.35)",
      borderRadius: 16,
    }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#B91C1C" }}>
        Zone de danger
      </h2>
      <p style={{ margin: "6px 0 16px", fontSize: 13.5, color: "#6B7280", lineHeight: 1.55 }}>
        Supprimer définitivement le cabinet et toutes ses données.{" "}
        {hasOtherMembers && (
          <>
            <strong style={{ color: "#111827" }}>{seatsUsed - 1} collègue{seatsUsed - 1 > 1 ? "s" : ""}</strong> garderont accès pendant 30 jours, puis tout sera supprimé.
          </>
        )}
        {!hasOtherMembers && "La suppression est immédiate et définitive."}
      </p>

      <button
        type="button"
        onClick={() => setShowModal(true)}
        style={{
          padding: "10px 18px", borderRadius: 10,
          border: "1px solid rgba(239,68,68,0.35)",
          background: "white", color: "#B91C1C",
          fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}
      >
        Supprimer mon cabinet
      </button>

      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
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
                <>
                  Vos collègues garderont l&apos;accès au workspace pendant <strong>30 jours</strong>. Passé ce délai, le cabinet et toutes ses données (vivier, missions, pipeline, emails) seront supprimés définitivement et sans retour possible.
                </>
              ) : (
                <>
                  Toutes vos données (vivier, missions, pipeline, emails, paramètres) seront supprimées <strong>immédiatement et définitivement</strong>. Cette action est irréversible.
                </>
              )}
            </p>

            <Label>Tapez le nom du cabinet pour confirmer&nbsp;: <code style={{ background: "#F3F4F6", padding: "1px 6px", borderRadius: 4, color: "#111827" }}>{expectedConfirm}</code></Label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={expectedConfirm}
              autoFocus
              style={inputStyle}
            />

            {error && <p style={{ margin: "12px 0 0", fontSize: 13, color: "#EF4444" }}>{error}</p>}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
              <button
                type="button"
                onClick={() => { setShowModal(false); setConfirmText(""); setError(null) }}
                disabled={busy}
                style={smallBtnGhost}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={doDelete}
                disabled={!canDelete}
                style={{
                  padding: "10px 18px", borderRadius: 10,
                  border: "none", color: "white",
                  background: canDelete ? "#B91C1C" : "#FCA5A5",
                  fontSize: 13, fontWeight: 700,
                  cursor: canDelete ? "pointer" : "not-allowed",
                }}
              >
                {busy ? "Suppression…" : "Confirmer la suppression"}
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

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section style={{
      marginTop: 22,
      padding: "22px 24px",
      background: "white",
      border: "1px solid #F0ECF8",
      borderRadius: 16,
    }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>{title}</h2>
      <p style={{ margin: "4px 0 18px", fontSize: 13, color: "#9CA3AF" }}>{subtitle}</p>
      {children}
    </section>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display: "block", marginBottom: 6,
      fontSize: 12, fontWeight: 700, color: "#6B7280",
      letterSpacing: "0.03em",
    }}>
      {children}
    </label>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: "6px 0 0", fontSize: 12, color: "#9CA3AF", lineHeight: 1.55 }}>{children}</p>
  )
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 13px",
  borderRadius: 9, border: "1.5px solid #E5E7EB",
  fontSize: 14, color: "#111827",
  outline: "none", transition: "border-color 150ms",
  fontFamily: "var(--font-inter), sans-serif",
  boxSizing: "border-box",
}

const smallBtnPrimary: React.CSSProperties = {
  padding: "9px 14px", borderRadius: 9,
  border: "none", color: "white",
  background: "#7C63C8",
  fontSize: 12.5, fontWeight: 700, cursor: "pointer",
  fontFamily: "var(--font-inter), sans-serif",
}

const smallBtnGhost: React.CSSProperties = {
  padding: "9px 14px", borderRadius: 9,
  border: "1px solid #E5E7EB", background: "white",
  color: "#374151",
  fontSize: 12.5, fontWeight: 600, cursor: "pointer",
  fontFamily: "var(--font-inter), sans-serif",
}

const memberRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12,
  padding: "10px 12px",
  background: "#FAFAFA",
  border: "1px solid #F0ECF8",
  borderRadius: 12,
}
