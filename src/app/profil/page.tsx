"use client"

/**
 * /profil — page de gestion du compte utilisateur.
 *
 * Accessible à tout user connecté (owner ou member). Permet :
 *   - modifier son prénom,
 *   - voir son email (lecture seule, dérivé de l'auth),
 *   - voir son organisation (nom + rôle),
 *   - se déconnecter.
 *
 * Auth gate : src/proxy.ts redirige les non-connectés vers /login.
 */

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"
import { getSupabase } from "@/lib/supabase"

interface ProfileState {
  first_name:               string | null
  role:                     "owner" | "member"
  org_name:                 string | null
}

export default function ProfilPage() {
  const router = useRouter()
  const sb = useMemo(() => getSupabase(), [])

  const [loading,   setLoading]   = useState(true)
  const [email,     setEmail]     = useState("")
  const [profile,   setProfile]   = useState<ProfileState | null>(null)
  const [firstName, setFirstName] = useState("")
  const [saving,    setSaving]    = useState(false)
  const [savedAt,   setSavedAt]   = useState<number | null>(null)
  const [error,     setError]     = useState<string | null>(null)

  // Initial fetch
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!mounted) return
      if (!user) { router.push("/login?next=/profil"); return }

      setEmail(user.email ?? "")

      const { data: prof } = await sb
        .from("profiles")
        .select("first_name, role, organization_id")
        .eq("user_id", user.id)
        .single()

      let orgName: string | null = null
      if (prof?.organization_id) {
        const { data: org } = await sb
          .from("organizations")
          .select("name")
          .eq("id", prof.organization_id)
          .single()
        orgName = org?.name ?? null
      }

      if (!mounted) return
      if (prof) {
        const next: ProfileState = {
          first_name: prof.first_name ?? null,
          role:       prof.role as "owner" | "member",
          org_name:   orgName,
        }
        setProfile(next)
        setFirstName(next.first_name ?? "")
      }
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [sb, router])

  // Save first_name change
  const saveFirstName = async () => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const r = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: firstName }),
      })
      if (!r.ok) {
        setError("Impossible d'enregistrer le prénom. Réessayez.")
        return
      }
      setProfile((p) => p ? { ...p, first_name: firstName.trim() || null } : p)
      setSavedAt(Date.now())
      setTimeout(() => setSavedAt(null), 2200)
    } finally {
      setSaving(false)
    }
  }

  const signOut = async () => {
    await sb.auth.signOut()
    router.push("/")
  }

  const firstNameDirty = (profile?.first_name ?? "") !== firstName.trim()

  return (
    <>
      <Navbar />
      <main style={{ position: "relative", zIndex: 1, paddingTop: 110, paddingBottom: 80 }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px" }}>
          {/* Hero */}
          <header style={{ marginBottom: 40 }}>
            <span style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 11, fontWeight: 700, color: "#7C63C8",
              letterSpacing: "0.10em", textTransform: "uppercase",
            }}>
              Mon compte
            </span>
            <h1 style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: "clamp(28px, 4vw, 40px)",
              fontWeight: 800, color: "#111827",
              margin: "10px 0 0", lineHeight: 1.1, letterSpacing: "-0.025em",
            }}>
              Mon profil.
            </h1>
          </header>

          {loading ? (
            <Skeleton />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* ── Informations personnelles ─── */}
              <Card title="Informations personnelles" subtitle="Visible par vos collègues de l'organisation.">
                <Field label="Prénom">
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    maxLength={60}
                    placeholder="Votre prénom"
                    style={INPUT_STYLE}
                  />
                </Field>
                <Field label="Email" hint="Non modifiable. Pour changer d'email, contactez le support.">
                  <input
                    type="email"
                    value={email}
                    readOnly
                    style={{ ...INPUT_STYLE, background: "#F8F6FF", color: "#6B7280", cursor: "not-allowed" }}
                  />
                </Field>
                {error && (
                  <p style={{ fontSize: 13, color: "#B91C1C", margin: "4px 0 0" }}>{error}</p>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={saveFirstName}
                    disabled={!firstNameDirty || saving}
                    style={{
                      ...PRIMARY_BUTTON,
                      opacity: (!firstNameDirty || saving) ? 0.55 : 1,
                      cursor: (!firstNameDirty || saving) ? "default" : "pointer",
                    }}
                  >
                    {saving ? "Enregistrement…" : "Enregistrer"}
                  </button>
                  {savedAt && (
                    <span style={{ fontSize: 13, color: "#22C55E", fontWeight: 600 }}>
                      Enregistré
                    </span>
                  )}
                </div>
              </Card>

              {/* ── Cabinet ─── */}
              <Card title="Mon organisation" subtitle="Organisation à laquelle votre compte est rattaché.">
                <Field label="Nom de l&apos;organisation">
                  <input
                    type="text"
                    value={profile?.org_name ?? "—"}
                    readOnly
                    style={{ ...INPUT_STYLE, background: "#F8F6FF", color: "#6B7280", cursor: "not-allowed" }}
                  />
                </Field>
                <Field label="Mon rôle">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "5px 12px", borderRadius: 999,
                      background: profile?.role === "owner" ? "rgba(124,99,200,0.10)" : "rgba(34,197,94,0.10)",
                      border: profile?.role === "owner" ? "1px solid rgba(124,99,200,0.30)" : "1px solid rgba(34,197,94,0.30)",
                      color: profile?.role === "owner" ? "#7C63C8" : "#15803d",
                      fontSize: 12, fontWeight: 700,
                      letterSpacing: "0.04em", textTransform: "uppercase",
                      fontFamily: "var(--font-inter), sans-serif",
                    }}>
                      {profile?.role === "owner" ? "Owner" : "Membre"}
                    </span>
                    {profile?.role === "owner" && (
                      <Link href="/organisation" style={{ fontSize: 13, color: "#7C63C8", textDecoration: "none", fontWeight: 600 }}>
                        Gérer mon organisation →
                      </Link>
                    )}
                  </div>
                </Field>
              </Card>

              {/* ── Sécurité ─── */}
              <Card title="Sécurité" subtitle="Déconnectez-vous de tous vos onglets Naywa.">
                <button
                  type="button"
                  onClick={signOut}
                  style={SECONDARY_BUTTON_DANGER}
                >
                  Se déconnecter
                </button>
              </Card>

              {/* ── Suppression de compte ─── */}
              <DeleteAccountCard isOwner={profile?.role === "owner"} />
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}

function DeleteAccountCard({ isOwner }: { isOwner: boolean }) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canDelete = confirmText.trim().toUpperCase() === "SUPPRIMER" && !busy

  const doDelete = async () => {
    if (!canDelete) return
    setBusy(true); setError(null)
    const res = await fetch("/api/account/me", { method: "DELETE" })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? "Erreur lors de la suppression.")
      setBusy(false)
      return
    }
    await getSupabase().auth.signOut()
    router.replace("/")
  }

  return (
    <section style={{
      background: "white",
      border: "1px solid rgba(239,68,68,0.30)",
      borderRadius: 18,
      padding: "26px 28px 28px",
      boxShadow: "0 4px 18px rgba(239,68,68,0.05)",
    }}>
      <header style={{ marginBottom: 14 }}>
        <h2 style={{
          margin: 0, fontFamily: "var(--font-inter), sans-serif",
          fontSize: 17, fontWeight: 700, color: "#B91C1C",
          letterSpacing: "-0.01em",
        }}>
          Supprimer mon compte
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280", lineHeight: 1.55 }}>
          Suppression définitive de votre compte et de toutes les données
          associées. Cette action est irréversible.
        </p>
      </header>

      {isOwner && (
        <p style={{
          margin: "0 0 14px",
          padding: "10px 12px", borderRadius: 8,
          background: "rgba(245,158,11,0.08)",
          border: "1px solid rgba(245,158,11,0.25)",
          fontSize: 12.5, color: "#92400E", lineHeight: 1.55,
        }}>
          Vous êtes propriétaire d&apos;une organisation. Si d&apos;autres
          membres en font partie, vous devrez d&apos;abord les retirer
          (ou supprimer l&apos;organisation) depuis l&apos;onglet Sécurité de
          votre console. Si vous êtes seul, votre organisation sera supprimée
          en même temps que votre compte.
        </p>
      )}

      <button type="button" onClick={() => setShowModal(true)}
        style={{
          padding: "9px 16px", borderRadius: 9,
          border: "1px solid rgba(239,68,68,0.35)",
          background: "white", color: "#B91C1C",
          fontSize: 13, fontWeight: 700, cursor: "pointer",
          fontFamily: "var(--font-inter), sans-serif",
        }}>
        Supprimer mon compte
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
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#B91C1C" }}>
              Supprimer définitivement votre compte ?
            </h3>
            <p style={{ margin: "10px 0 16px", fontSize: 13.5, color: "#4B5563", lineHeight: 1.6 }}>
              Votre profil, vos préférences et votre accès au workspace seront
              supprimés. {isOwner ? "Votre organisation sera également supprimée si vous en êtes le seul membre." : ""}
            </p>
            <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: "#374151" }}>
              Tapez <strong>SUPPRIMER</strong> pour confirmer
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="SUPPRIMER"
              style={{
                width: "100%", padding: "9px 12px", borderRadius: 8,
                border: "1.5px solid #E5E7EB", fontSize: 14,
                color: "#111827", marginBottom: 12, boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
            {error && (
              <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#B91C1C" }}>{error}</p>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => { setShowModal(false); setConfirmText("") }}
                disabled={busy}
                style={{
                  padding: "8px 14px", borderRadius: 8,
                  border: "1px solid #E5E7EB", background: "white",
                  color: "#374151", fontSize: 13, fontWeight: 600,
                  cursor: busy ? "wait" : "pointer", fontFamily: "inherit",
                }}>
                Annuler
              </button>
              <button type="button" onClick={() => void doDelete()}
                disabled={!canDelete}
                style={{
                  padding: "8px 14px", borderRadius: 8,
                  border: "none",
                  background: canDelete ? "#DC2626" : "#FCA5A5",
                  color: "white", fontSize: 13, fontWeight: 700,
                  cursor: canDelete ? "pointer" : "not-allowed",
                  fontFamily: "inherit",
                }}>
                {busy ? "Suppression…" : "Confirmer la suppression"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

// ─── Petits helpers UI inlinés pour garder la page autonome ─────────────

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{
      background: "white",
      border: "1px solid #F0ECF8",
      borderRadius: 18,
      padding: "26px 28px 28px",
      boxShadow: "0 4px 18px rgba(124,99,200,0.05)",
    }}>
      <header style={{ marginBottom: 18 }}>
        <h2 style={{
          margin: 0, fontFamily: "var(--font-inter), sans-serif",
          fontSize: 17, fontWeight: 700, color: "#111827",
          letterSpacing: "-0.01em",
        }}>
          {title}
        </h2>
        {subtitle && (
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280", lineHeight: 1.55 }}>
            {subtitle}
          </p>
        )}
      </header>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {children}
      </div>
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{
        fontFamily: "var(--font-inter), sans-serif",
        fontSize: 12, fontWeight: 600, color: "#374151",
        letterSpacing: "-0.005em",
      }}>
        {label}
      </span>
      {children}
      {hint && (
        <span style={{ fontSize: 11.5, color: "#6B7280", lineHeight: 1.5 }}>
          {hint}
        </span>
      )}
    </label>
  )
}

function Skeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{
          background: "#F8F6FF",
          border: "1px solid #F0ECF8",
          borderRadius: 18,
          height: i === 0 ? 240 : 160,
        }} />
      ))}
    </div>
  )
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  background: "white",
  border: "1px solid #E2DAF6",
  borderRadius: 10,
  padding: "11px 13px",
  fontFamily: "var(--font-inter), sans-serif",
  fontSize: 14,
  color: "#111827",
  outline: "none",
  transition: "border-color 150ms",
}

const PRIMARY_BUTTON: React.CSSProperties = {
  background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
  color: "white",
  borderRadius: 10,
  padding: "10px 20px",
  border: "none",
  fontFamily: "var(--font-inter), sans-serif",
  fontSize: 13.5,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  boxShadow: "0 4px 16px -4px rgba(124,99,200,0.45)",
  letterSpacing: "-0.005em",
}

const SECONDARY_BUTTON_DANGER: React.CSSProperties = {
  background: "white",
  color: "#EF4444",
  borderRadius: 10,
  padding: "10px 18px",
  border: "1px solid rgba(239,68,68,0.30)",
  fontFamily: "var(--font-inter), sans-serif",
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  width: "fit-content",
}
