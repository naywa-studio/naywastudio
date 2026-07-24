"use client"
export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getSupabase } from "@/lib/supabase"
import { resolvePostLoginDestination } from "@/lib/post-login-destination"

type Status = "loading" | "done" | "error"

export default function AuthCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState<Status>("loading")
  // Le même callback sert au signup ET au login Google. On distingue les
  // deux via l'âge du compte : créé il y a moins de 5 min = nouveau compte.
  // Sans ça, un user qui se RECONNECTE lisait "Compte créé avec succès !".
  const [isNewAccount, setIsNewAccount] = useState(false)

  useEffect(() => {
    const handleCallback = async () => {
      // Supabase exchanges the code for a session automatically via PKCE.
      const { data: { session }, error } = await getSupabase().auth.getSession()

      if (error || !session) {
        setStatus("error")
        return
      }

      const createdMs = new Date(session.user.created_at).getTime()
      setIsNewAccount(Number.isFinite(createdMs) && Date.now() - createdMs < 5 * 60_000)

      // Persist the first_name if the signup form stashed one before the
      // OAuth redirect. The on_auth_user_created trigger already inserted
      // the profile + org with a derived first_name; we only override if
      // the user explicitly typed one in the signup form.
      const pending = sessionStorage.getItem("nawa_pending_profile")
      if (pending) {
        try {
          const p = JSON.parse(pending) as { first_name?: string; cgu_version?: string }
          if (p.first_name?.trim()) {
            const { error: profileError } = await getSupabase()
              .from("profiles")
              .update({ first_name: p.first_name.trim() })
              .eq("user_id", session.user.id)
            if (profileError) console.error("Profile save error:", profileError.message)
          }
          // Signup Google : l'acceptation CGU cochée avant l'OAuth est stampée
          // côté serveur (auditable). OAuth ne passe pas par options.data, d'où
          // le relais via sessionStorage.
          if (p.cgu_version) {
            try { await fetch("/api/cgu/accept", { method: "POST" }) } catch { /* CguGate rattrapera */ }
          }
        } catch { /* ignore malformed payload */ }
        sessionStorage.removeItem("nawa_pending_profile")
      }

      setStatus("done")
      // Choisit la destination en fonction du profil (évite la bounce
      // /workspace → /organisation pour un owner sans siège).
      const dest = await resolvePostLoginDestination(getSupabase(), session.user.id, null)
      setTimeout(() => router.push(dest), 1200)
    }

    handleCallback()
  }, [router])

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        // Surface violette claire du design system (au lieu d'un gris neutre
        // hors-charte) — la page fait partie de l'expérience Naywa.
        background: "#F8F6FF",
        gap: 14,
        fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
      }}
    >
      {/* Wordmark — la page n'a ni navbar ni layout, sans lui elle est anonyme. */}
      <span
        style={{
          fontFamily: "var(--font-space-grotesk), ui-sans-serif, sans-serif",
          fontSize: 22, fontWeight: 700, color: "#111827",
          letterSpacing: "-0.02em", marginBottom: 10,
        }}
      >
        Naywa<span style={{ color: "#7C63C8" }}> Studio</span>
      </span>

      {status === "loading" && (
        <>
          <Spinner />
          <p style={{ margin: 0, color: "#4B5563", fontSize: 15 }}>Connexion en cours…</p>
        </>
      )}
      {status === "done" && (
        <>
          <span
            aria-hidden
            style={{
              width: 44, height: 44, borderRadius: "50%",
              background: "rgba(34,197,94,0.10)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22C55E"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <p style={{ margin: 0, color: "#111827", fontWeight: 700, fontSize: 16 }}>
            {isNewAccount ? "Compte créé avec succès !" : "Connexion réussie !"}
          </p>
          <p style={{ margin: 0, color: "#6B7280", fontSize: 14 }}>
            {isNewAccount ? "Préparation de votre espace…" : "Ouverture de votre espace…"}
          </p>
        </>
      )}
      {status === "error" && (
        <>
          <p style={{ margin: 0, color: "#EF4444", fontSize: 15 }}>
            Une erreur est survenue lors de la connexion.
          </p>
          <button
            onClick={() => router.push("/login")}
            style={{
              color: "#7C63C8", background: "none", border: "none",
              cursor: "pointer", fontSize: 14, textDecoration: "underline",
              fontFamily: "inherit",
            }}
          >
            Réessayer de me connecter
          </button>
        </>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <svg
      width="32" height="32" viewBox="0 0 24 24"
      style={{ animation: "spin 0.8s linear infinite" }}
      aria-label="Chargement"
    >
      <circle cx="12" cy="12" r="10" stroke="#E2DAF6" strokeWidth="3" fill="none" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="#7C63C8" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  )
}
