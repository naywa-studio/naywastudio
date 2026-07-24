"use client"

/**
 * CguGate — acceptation des CGU côté app (monté dans les shells authentifiés :
 * workspace + organisation). Deux rôles :
 *
 *  1. Synchronisation SILENCIEUSE : un compte qui a coché la case au signup
 *     porte `cgu_version` dans ses metadata auth (email) ; on stampe alors le
 *     profil sans rien afficher (le stamp Google est fait dans /auth/callback).
 *  2. RAPPEL non bloquant : un compte antérieur à la fonctionnalité (ex. GMH)
 *     n'a ni profil stampé ni metadata → bandeau bas d'écran l'invitant à
 *     accepter, avec CGU + confidentialité consultables. Non bloquant : il
 *     peut continuer à utiliser l'app, le bandeau reste jusqu'à acceptation.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { getSupabase } from "@/lib/supabase"
import { CURRENT_CGU_VERSION } from "@/lib/cgu"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const copy = {
  fr: {
    title: "Merci d'accepter nos conditions",
    body: "Pour continuer à utiliser Naywa Studio, veuillez accepter nos",
    terms: "CGU",
    and: "et notre",
    privacy: "politique de confidentialité",
    accept: "J'accepte",
    accepting: "…",
  },
  en: {
    title: "Please accept our terms",
    body: "To keep using Naywa Studio, please accept our",
    terms: "Terms",
    and: "and our",
    privacy: "privacy policy",
    accept: "I accept",
    accepting: "…",
  },
}

export function CguGate() {
  const { lang } = useLanguage()
  const t = copy[lang]
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      const sb = getSupabase()
      const { data: { user } } = await sb.auth.getUser()
      if (!user || !alive) return

      const { data: profile } = await sb
        .from("profiles")
        .select("cgu_version")
        .eq("user_id", user.id)
        .maybeSingle()
      if (!alive) return
      if (profile?.cgu_version === CURRENT_CGU_VERSION) return

      // Accepté au signup (porté par les metadata email) → stamp silencieux.
      const metaVersion = (user.user_metadata as { cgu_version?: string } | null)?.cgu_version
      if (metaVersion === CURRENT_CGU_VERSION) {
        try { await fetch("/api/cgu/accept", { method: "POST" }) } catch { /* rappel au prochain load */ }
        return
      }

      // Compte antérieur, jamais accepté → rappel.
      if (alive) setShow(true)
    })()
    return () => { alive = false }
  }, [])

  const accept = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch("/api/cgu/accept", { method: "POST" })
      if (r.ok) setShow(false)
    } finally {
      setBusy(false)
    }
  }

  if (!show) return null

  return (
    <div
      role="dialog"
      aria-label={t.title}
      style={{
        position: "fixed", left: 16, right: 16, bottom: 16, zIndex: 300,
        maxWidth: 720, margin: "0 auto",
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
        padding: "14px 18px", borderRadius: 14,
        background: "var(--nw-surface)",
        border: "1px solid var(--nw-primary-100)",
        boxShadow: "0 10px 30px -12px rgba(124,99,200,0.28)",
        fontFamily: "var(--font-inter), sans-serif",
      }}
    >
      <div style={{ minWidth: 0, flex: "1 1 320px" }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--nw-text)" }}>
          {t.title}
        </p>
        <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--nw-text-muted)", lineHeight: 1.5 }}>
          {t.body}{" "}
          <Link href="/cgu" target="_blank" style={{ color: "var(--nw-primary)", fontWeight: 600, textDecoration: "underline" }}>
            {t.terms}
          </Link>{" "}
          {t.and}{" "}
          <Link href="/politique-confidentialite" target="_blank" style={{ color: "var(--nw-primary)", fontWeight: 600, textDecoration: "underline" }}>
            {t.privacy}
          </Link>.
        </p>
      </div>
      <button
        type="button"
        onClick={accept}
        disabled={busy}
        style={{
          flexShrink: 0,
          padding: "10px 18px", borderRadius: 10, border: "none",
          background: "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
          color: "white", fontSize: 13, fontWeight: 700,
          cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1,
          fontFamily: "inherit",
        }}
      >
        {busy ? t.accepting : t.accept}
      </button>
    </div>
  )
}
