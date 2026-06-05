"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Logo } from "@/components/ui/Logo"
import { getSupabase } from "@/lib/supabase"

/**
 * /accept-invite?token={token}
 *
 * Landing page for someone who clicked an invite link in their email.
 * Three states:
 *   - Link invalid / expired / already used → friendly message + link to /
 *   - User not logged in (or wrong email) → instructions to sign in/up with
 *     the invited email
 *   - User logged in with the right email → button to confirm joining
 */

interface InvitePreview {
  email: string
  organization_name: string
  expires_at: string
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<Shell><Spinner /></Shell>}>
      <Inner />
    </Suspense>
  )
}

function Inner() {
  const sp = useSearchParams()
  const router = useRouter()
  const token = sp.get("token") ?? ""

  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(
    token ? null : "Lien invalide.",
  )
  const [currentEmail, setCurrentEmail] = useState<string | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch invite preview + current session in parallel.
  useEffect(() => {
    if (!token) return
    let mounted = true
    ;(async () => {
      // Preview
      try {
        const r = await fetch(`/api/cabinet/accept-invite?token=${encodeURIComponent(token)}`)
        if (!r.ok) {
          const j = await r.json().catch(() => ({} as { error?: string }))
          if (!mounted) return
          setPreviewError(({
            not_found:        "Ce lien d'invitation n'existe pas ou a été révoqué.",
            already_accepted: "Cette invitation a déjà été acceptée.",
            expired:          "Cette invitation a expiré. Demandez-en une nouvelle à votre cabinet.",
          } as Record<string, string>)[j.error ?? ""] ?? "Lien invalide.")
        } else {
          const data = (await r.json()) as InvitePreview
          if (mounted) setPreview(data)
        }
      } catch {
        if (mounted) setPreviewError("Erreur de chargement.")
      }

      // Session
      const { data: { user } } = await getSupabase().auth.getUser()
      if (mounted) setCurrentEmail(user?.email ?? null)
    })()
    return () => { mounted = false }
  }, [token])

  const accept = async () => {
    setBusy(true); setError(null)
    const r = await fetch("/api/cabinet/accept-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
    const j = await r.json().catch(() => ({} as { error?: string; ok?: boolean }))
    if (!r.ok || !j.ok) {
      setError(j.error ?? "Erreur lors de l'acceptation.")
      setBusy(false)
      return
    }
    router.replace("/workspace")
  }

  if (previewError) {
    return (
      <Shell>
        <Title>Lien indisponible.</Title>
        <p style={subTextStyle}>{previewError}</p>
        <Link href="/" style={btnGhost}>Retour à l&apos;accueil</Link>
      </Shell>
    )
  }

  if (!preview || currentEmail === undefined) {
    return <Shell><Spinner /></Shell>
  }

  const emailMatches = currentEmail && currentEmail.toLowerCase() === preview.email.toLowerCase()
  const expiresLabel = new Date(preview.expires_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })

  // Not logged in → invite them to log in / sign up with the right email.
  if (!currentEmail) {
    const next = encodeURIComponent(`/accept-invite?token=${token}`)
    return (
      <Shell>
        <Title>Vous êtes invité à rejoindre {preview.organization_name}.</Title>
        <p style={subTextStyle}>
          Pour rejoindre le cabinet, connectez-vous (ou créez votre compte) avec l&apos;adresse{" "}
          <strong style={{ color: "#111827" }}>{preview.email}</strong>.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
          <Link href={`/login?next=${next}`} style={btnPrimary}>Se connecter</Link>
          <Link href={`/login?mode=signup&next=${next}`} style={btnGhost}>Créer un compte</Link>
        </div>
        <p style={{ ...subTextStyle, marginTop: 22, fontSize: 12, color: "#9CA3AF" }}>
          Lien valable jusqu&apos;au {expiresLabel}, à usage unique.
        </p>
      </Shell>
    )
  }

  // Logged in with wrong email.
  if (!emailMatches) {
    return (
      <Shell>
        <Title>Mauvais compte.</Title>
        <p style={subTextStyle}>
          Cette invitation est pour <strong style={{ color: "#111827" }}>{preview.email}</strong>,
          mais vous êtes connecté en tant que <strong style={{ color: "#111827" }}>{currentEmail}</strong>.
          Déconnectez-vous et reconnectez-vous avec l&apos;adresse invitée.
        </p>
        <button onClick={async () => {
          await getSupabase().auth.signOut()
          window.location.reload()
        }} style={btnPrimary}>
          Se déconnecter
        </button>
      </Shell>
    )
  }

  // Happy path.
  return (
    <Shell>
      <Title>Rejoindre {preview.organization_name} ?</Title>
      <p style={subTextStyle}>
        En acceptant, vous quitterez votre cabinet personnel et accéderez au workspace
        partagé (vivier, missions, pipeline) de {preview.organization_name}.
      </p>
      {error && <p style={{ ...subTextStyle, color: "#EF4444" }}>{error}</p>}
      <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
        <button onClick={accept} disabled={busy} style={btnPrimary}>
          {busy ? "Acceptation…" : "Accepter et entrer"}
        </button>
        <Link href="/workspace" style={btnGhost}>Plus tard</Link>
      </div>
    </Shell>
  )
}

/* ─── Shared shell ──────────────────────────────────────────────── */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100vh", background: "#FAFAFA",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: "var(--font-inter), sans-serif",
    }}>
      <div style={{
        width: "100%", maxWidth: 480,
        background: "white", borderRadius: 20,
        border: "1px solid #F0ECF8",
        padding: "40px 36px",
        boxShadow: "0 8px 40px rgba(124,99,200,0.08)",
      }}>
        <div style={{ marginBottom: 24, textAlign: "center" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <Logo size="md" />
          </Link>
        </div>
        {children}
      </div>
    </div>
  )
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 style={{
      margin: 0, fontSize: 22, fontWeight: 800, color: "#111827",
      letterSpacing: "-0.02em", lineHeight: 1.2,
    }}>
      {children}
    </h1>
  )
}

const subTextStyle: React.CSSProperties = {
  margin: "10px 0 0", fontSize: 14, color: "#4B5563", lineHeight: 1.6,
}

const btnPrimary: React.CSSProperties = {
  display: "inline-block",
  padding: "11px 18px", borderRadius: 10,
  border: "none", color: "white",
  background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
  fontSize: 13.5, fontWeight: 700,
  cursor: "pointer", textDecoration: "none",
  fontFamily: "var(--font-inter), sans-serif",
}

const btnGhost: React.CSSProperties = {
  display: "inline-block",
  padding: "11px 18px", borderRadius: 10,
  border: "1px solid #E5E7EB", background: "white",
  color: "#374151",
  fontSize: 13.5, fontWeight: 600,
  cursor: "pointer", textDecoration: "none",
  fontFamily: "var(--font-inter), sans-serif",
}

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
      <svg width="28" height="28" viewBox="0 0 24 24" style={{ animation: "spin 0.8s linear infinite" }}>
        <circle cx="12" cy="12" r="10" stroke="#E2DAF6" strokeWidth="3" fill="none" />
        <path d="M12 2a10 10 0 0 1 10 10" stroke="#7C63C8" strokeWidth="3" fill="none" strokeLinecap="round" />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </svg>
    </div>
  )
}
