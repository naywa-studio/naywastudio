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

  useEffect(() => {
    const handleCallback = async () => {
      // Supabase exchanges the code for a session automatically via PKCE.
      const { data: { session }, error } = await getSupabase().auth.getSession()

      if (error || !session) {
        setStatus("error")
        return
      }

      // Persist the first_name if the signup form stashed one before the
      // OAuth redirect. The on_auth_user_created trigger already inserted
      // the profile + org with a derived first_name; we only override if
      // the user explicitly typed one in the signup form.
      const pending = sessionStorage.getItem("nawa_pending_profile")
      if (pending) {
        try {
          const p = JSON.parse(pending) as { first_name?: string }
          if (p.first_name?.trim()) {
            const { error: profileError } = await getSupabase()
              .from("profiles")
              .update({ first_name: p.first_name.trim() })
              .eq("user_id", session.user.id)
            if (profileError) console.error("Profile save error:", profileError.message)
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
        background: "#FAFAFA",
        gap: 16,
      }}
    >
      {status === "loading" && (
        <>
          <Spinner />
          <p style={{ color: "#4B5563", fontSize: 15 }}>Connexion en cours…</p>
        </>
      )}
      {status === "done" && (
        <>
          <span style={{ fontSize: 40 }}>✓</span>
          <p style={{ color: "#7C63C8", fontWeight: 600, fontSize: 16 }}>
            Compte créé avec succès !
          </p>
          <p style={{ color: "#9CA3AF", fontSize: 14 }}>Redirection…</p>
        </>
      )}
      {status === "error" && (
        <>
          <p style={{ color: "#EF4444", fontSize: 15 }}>
            Une erreur est survenue lors de la connexion.
          </p>
          <button
            onClick={() => router.push("/")}
            style={{
              color: "#7C63C8", background: "none", border: "none",
              cursor: "pointer", fontSize: 14, textDecoration: "underline",
            }}
          >
            Retour à l&apos;accueil
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
