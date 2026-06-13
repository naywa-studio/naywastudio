"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Logo } from "@/components/ui/Logo"
import { getSupabase } from "@/lib/supabase"

/**
 * /accept-invite?token={token}
 *
 * Self-contained acceptance flow with three branches:
 *
 *   1. Anonymous (not signed in):
 *        - Step "choose" : Accept / Refuser
 *        - On accept     : reveal form (first_name + password)
 *        - On refuse     : POST /api/cabinet/decline-invite, show closed UI
 *        - On submit     : POST /api/cabinet/accept-invite-signup → creates
 *                          auth user + joins org → signInWithPassword →
 *                          redirect /workspace
 *
 *   2. Signed in with matching email:
 *        - One button "Rejoindre {orgName}" → POST /api/cabinet/accept-invite
 *
 *   3. Signed in with the wrong email:
 *        - Friendly message + sign-out button
 */

interface InvitePreview {
  email: string
  organization_name: string
  expires_at: string
}

const PASSWORD_MIN_LENGTH = 6
const PASSWORD_SPECIAL = /[^a-zA-Z0-9]/

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

  // UI mode for the anonymous branch
  const [mode, setMode] = useState<"choose" | "form" | "declined">("choose")
  const [firstName, setFirstName] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let mounted = true
    ;(async () => {
      try {
        const r = await fetch(`/api/cabinet/accept-invite?token=${encodeURIComponent(token)}`)
        if (!r.ok) {
          const j = await r.json().catch(() => ({} as { error?: string }))
          if (mounted) setPreviewError(({
            not_found:        "Ce lien d'invitation n'existe pas ou a été révoqué.",
            already_accepted: "Cette invitation a déjà été acceptée.",
            expired:          "Cette invitation a expiré. Demandez-en une nouvelle à votre organisation.",
          } as Record<string, string>)[j.error ?? ""] ?? "Lien invalide.")
        } else {
          const data = (await r.json()) as InvitePreview
          if (mounted) setPreview(data)
        }
      } catch {
        if (mounted) setPreviewError("Erreur de chargement.")
      }
      const { data: { user } } = await getSupabase().auth.getUser()
      if (mounted) setCurrentEmail(user?.email ?? null)
    })()
    return () => { mounted = false }
  }, [token])

  /* ─── Anonymous branch helpers ─────────────────────────────── */

  const decline = async () => {
    setBusy(true); setError(null)
    await fetch("/api/cabinet/decline-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
    setBusy(false)
    setMode("declined")
  }

  const submitSignup = async () => {
    if (!preview) return
    setError(null)
    const trimmedName = firstName.trim()
    if (!trimmedName) { setError("Renseignez votre prénom."); return }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Mot de passe trop court (min ${PASSWORD_MIN_LENGTH} caractères).`); return
    }
    if (!PASSWORD_SPECIAL.test(password)) {
      setError("Ajoutez au moins un caractère spécial (!?@#…)."); return
    }
    setBusy(true)

    const r = await fetch("/api/cabinet/accept-invite-signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, first_name: trimmedName, password }),
    })
    const j = await r.json().catch(() => ({} as { error?: string; already_exists?: boolean; ok?: boolean; email?: string }))
    if (!r.ok || !j.ok) {
      if (j.already_exists) {
        setError("Un compte existe déjà pour cet email. Connectez-vous puis rouvrez ce lien.")
      } else {
        setError(j.error ?? "Erreur lors de l'inscription.")
      }
      setBusy(false)
      return
    }

    // Sign the user in client-side and bounce to /workspace.
    const { error: signInErr } = await getSupabase().auth.signInWithPassword({
      email: preview.email,
      password,
    })
    if (signInErr) {
      setError("Compte créé, mais la connexion automatique a échoué. Connectez-vous manuellement.")
      setBusy(false)
      return
    }
    router.replace("/workspace")
  }

  /* ─── Signed-in branch helper ──────────────────────────────── */

  const acceptAsLoggedInUser = async () => {
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

  /* ─── Render ───────────────────────────────────────────────── */

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

  // Signed in, wrong email
  if (currentEmail && !emailMatches) {
    return (
      <Shell>
        <Title>Mauvais compte.</Title>
        <p style={subTextStyle}>
          Cette invitation est pour <strong style={{ color: "#111827" }}>{preview.email}</strong>,
          mais vous êtes connecté en tant que <strong style={{ color: "#111827" }}>{currentEmail}</strong>.
          Déconnectez-vous et rouvrez ce lien.
        </p>
        <button onClick={async () => {
          await getSupabase().auth.signOut()
          window.location.reload()
        }} style={btnPrimary}>Se déconnecter</button>
      </Shell>
    )
  }

  // Signed in, right email — single-button confirm
  if (currentEmail && emailMatches) {
    return (
      <Shell>
        <Title>Rejoindre {preview.organization_name} ?</Title>
        <p style={subTextStyle}>
          En acceptant, vous quitterez votre organisation personnelle et accéderez au workspace
          partagé (vivier, missions, pipeline) de {preview.organization_name}.
        </p>
        {error && <p style={errorStyle}>{error}</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button onClick={acceptAsLoggedInUser} disabled={busy} style={btnPrimary}>
            {busy ? "Acceptation…" : "Accepter et entrer"}
          </button>
          <Link href="/workspace" style={btnGhost}>Plus tard</Link>
        </div>
      </Shell>
    )
  }

  // Anonymous branch
  if (mode === "declined") {
    return (
      <Shell>
        <Title>Invitation refusée.</Title>
        <p style={subTextStyle}>Ce lien est désormais invalide.</p>
        <Link href="/" style={btnGhost}>Retour à l&apos;accueil</Link>
      </Shell>
    )
  }

  if (mode === "choose") {
    return (
      <Shell>
        <Title>Vous êtes invité à rejoindre {preview.organization_name}.</Title>
        <p style={subTextStyle}>
          Adresse invitée&nbsp;: <strong style={{ color: "#111827" }}>{preview.email}</strong>.
          En acceptant, vous créerez votre compte et accéderez au workspace partagé de l&apos;organisation
          (vivier, missions, pipeline).
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
          <button onClick={() => setMode("form")} disabled={busy} style={btnPrimary}>
            Accepter
          </button>
          <button onClick={decline} disabled={busy} style={btnGhost}>
            {busy ? "…" : "Refuser"}
          </button>
        </div>
      </Shell>
    )
  }

  // mode === "form" → signup form (anonymous accept path)
  return (
    <Shell>
      <Title>Bienvenue chez {preview.organization_name}.</Title>
      <p style={subTextStyle}>
        Choisissez un mot de passe pour finaliser votre compte sur{" "}
        <strong style={{ color: "#111827" }}>{preview.email}</strong>.
      </p>

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <FormLabel>Prénom</FormLabel>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)}
            placeholder="Votre prénom" autoFocus disabled={busy}
            style={formInputStyle} autoComplete="given-name" />
        </div>
        <div>
          <FormLabel>Mot de passe</FormLabel>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 6 caractères, 1 caractère spécial"
            minLength={PASSWORD_MIN_LENGTH} disabled={busy}
            style={formInputStyle} autoComplete="new-password" />
          <p style={{ margin: "5px 0 0", fontSize: 11.5, color: "#9CA3AF" }}>
            Au moins 6 caractères et un caractère spécial (ex&nbsp;: !&nbsp;?&nbsp;@&nbsp;#&nbsp;…).
          </p>
        </div>
        {error && <p style={errorStyle}>{error}</p>}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
        <button onClick={submitSignup} disabled={busy} style={btnPrimary}>
          {busy ? "Création du compte…" : "Créer mon compte et rejoindre"}
        </button>
        <button onClick={() => setMode("choose")} disabled={busy} style={btnGhost}>
          Retour
        </button>
      </div>
    </Shell>
  )
}

/* ─── Shared shell + styles ─────────────────────────────────────── */

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

function FormLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display: "block", marginBottom: 6,
      fontSize: 12, fontWeight: 700, color: "#374151",
    }}>{children}</label>
  )
}

const subTextStyle: React.CSSProperties = {
  margin: "10px 0 0", fontSize: 14, color: "#4B5563", lineHeight: 1.6,
}
const errorStyle: React.CSSProperties = {
  margin: "12px 0 0", fontSize: 13, color: "#EF4444",
}
const formInputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px",
  borderRadius: 9, border: "1.5px solid #E5E7EB",
  fontSize: 14, color: "#111827",
  outline: "none", transition: "border-color 150ms",
  fontFamily: "var(--font-inter), sans-serif",
  boxSizing: "border-box",
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
