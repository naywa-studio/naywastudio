"use client"

/**
 * Bouton + modale "Contactez le support".
 *
 * Visible dans le header workspace + organisation. Modale structurée :
 *   - rappel de l'email connecté (lecture seule)
 *   - dropdown "Où est le problème ?" : Vivier / Missions / Pricing /
 *     Pipeline / Workspace / Organisation / Onboarding / Autre. Si Autre
 *     → champ texte libre apparaît.
 *   - textarea message libre (obligatoire)
 *
 * Au submit, POST /api/support — l'API attache l'email, l'org, l'URL,
 * le user-agent automatiquement (depuis la session côté server). Le
 * "topic" sélectionné est passé en plus dans le body et préfixe le
 * sujet du mail.
 */

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { LazyMotion, domAnimation, m } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import { useEscapeKey } from "@/components/ui/useEscapeKey"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

interface TopicOption {
  value: string
  label: string
}
const TOPIC_OPTIONS: TopicOption[] = [
  { value: "vivier",       label: "Vivier candidats" },
  { value: "missions",     label: "Missions" },
  { value: "pricing",      label: "Pricing / Chiffrage" },
  { value: "pipeline",     label: "Pipeline candidats" },
  { value: "workspace",    label: "Workspace (général)" },
  { value: "organisation", label: "Organisation / Abonnement" },
  { value: "onboarding",   label: "Onboarding / Premier accès" },
  { value: "nouveautes",   label: "Nouveautés" },
  { value: "compte",       label: "Mon compte / Connexion" },
  { value: "facturation",  label: "Facturation / Paiement" },
  { value: "other",        label: "Autre" },
]

export function SupportButton({ variant = "compact" }: { variant?: "compact" | "ghost" }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Un bug, une question ? Contactez le support"
        style={variant === "compact" ? compactStyle : ghostStyle}
      >
        <LifebuoyIcon />
        <span>Un bug, une question ?</span>
      </button>
      {open && <SupportModal onClose={() => setOpen(false)} />}
    </>
  )
}

function SupportModal({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose)
  const [topic, setTopic] = useState<string>("workspace")
  const [topicOther, setTopicOther] = useState("")
  const [message, setMessage] = useState("")
  const [email, setEmail] = useState<string>("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  // Vrai après le 1er render — autorise createPortal qui n'existe que
  // côté client. Évite les warnings SSR.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Pré-affiche l'email connecté. Lecture seule — c'est juste de
  // l'info pour rassurer l'user que ses coordonnées sont transmises.
  // Subscription à un système externe (auth Supabase) → setState
  // depuis l'effet est ici le pattern correct.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const sb = getSupabase()
      const { data: { user } } = await sb.auth.getUser()
      if (cancelled) return
      setEmail(user?.email ?? "")
    })()
    return () => { cancelled = true }
  }, [])

  // Bloque le scroll du body pendant que la modale est ouverte —
  // évite que la modale apparaisse "coupée" en haut si l'utilisateur
  // était en train de scroller.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [])

  const canSubmit = message.trim().length > 0 && (topic !== "other" || topicOther.trim().length > 0)

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true); setError(null)
    try {
      const topicLabel = topic === "other"
        ? `Autre : ${topicOther.trim()}`
        : TOPIC_OPTIONS.find((t) => t.value === topic)?.label ?? topic
      const r = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          topic: topicLabel,
          url: typeof window !== "undefined" ? window.location.href : "",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({} as { error?: string }))
        throw new Error(j.error ?? `Erreur ${r.status}`)
      }
      setSent(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Le bouton support vit dans un <header position:sticky> qui crée son
  // propre contexte d'empilement → un position:fixed à l'intérieur
  // serait contraint par cet ancêtre. createPortal rend la modale
  // directement dans <body>, ce qui la sort de tout stacking context
  // parent et garantit qu'elle couvre bien tout le viewport.
  if (!mounted) return null
  const portalTarget = typeof document !== "undefined" ? document.body : null
  if (!portalTarget) return null

  return createPortal(
    <LazyMotion features={domAnimation}>
      <div
        role="dialog" aria-modal="true"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        style={{
          position: "fixed", inset: 0, zIndex: 9000,
          background: "rgba(17,24,39,0.45)", backdropFilter: "blur(2px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24, overflowY: "auto",
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
          {sent ? (
            <>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#111827", letterSpacing: "-0.01em" }}>
                Message envoyé
              </h2>
              <p style={{ margin: "10px 0 18px", fontSize: 13.5, color: "#6B7280", lineHeight: 1.6 }}>
                Notre équipe vous répondra par email dans les meilleurs délais.
                Merci pour votre retour.
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "10px 16px", borderRadius: 10,
                    border: "none",
                    background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                    color: "white", fontSize: 13, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Fermer
                </button>
              </div>
            </>
          ) : (
            <>
              <header style={{ marginBottom: 18 }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#7C63C8", letterSpacing: "0.10em", textTransform: "uppercase" }}>
                  Support
                </p>
                <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800, color: "#111827", letterSpacing: "-0.01em" }}>
                  Un bug, une question ?
                </h2>
                <p style={{ margin: "10px 0 0", fontSize: 13, color: "#6B7280", lineHeight: 1.55 }}>
                  Décrivez ce qui vous bloque. Nous vous répondons à
                  l&apos;adresse de votre compte.
                </p>
              </header>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Email connecté (read-only) */}
                <div>
                  <Label>Réponse envoyée à</Label>
                  <div style={readOnlyField}>
                    <MailIcon />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {email || "(en cours de chargement…)"}
                    </span>
                  </div>
                </div>

                {/* Topic */}
                <div>
                  <Label>Où est le problème ?</Label>
                  <select
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    style={inputStyle}
                  >
                    {TOPIC_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Topic libre si "Autre" */}
                {topic === "other" && (
                  <div>
                    <Label>Précisez</Label>
                    <input
                      value={topicOther}
                      onChange={(e) => setTopicOther(e.target.value)}
                      placeholder="Ex : import LinkedIn, export RGPD…"
                      maxLength={120}
                      style={inputStyle}
                    />
                  </div>
                )}

                {/* Message */}
                <div>
                  <Label>Votre message</Label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Décrivez le bug, votre question ou votre suggestion…"
                    rows={6}
                    maxLength={5000}
                    style={{
                      ...inputStyle,
                      resize: "vertical", minHeight: 110,
                      lineHeight: 1.55,
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11, color: "#6B7280" }}>
                    <span>Visible uniquement par notre équipe.</span>
                    <span>{message.length}/5000</span>
                  </div>
                </div>

                {error && (
                  <p style={{ margin: 0, fontSize: 12.5, color: "#B91C1C" }}>{error}</p>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  style={{
                    padding: "10px 16px", borderRadius: 10,
                    border: "1px solid #E5E7EB", background: "white",
                    color: "#374151", fontSize: 13, fontWeight: 600,
                    cursor: busy ? "wait" : "pointer", fontFamily: "inherit",
                  }}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy || !canSubmit}
                  style={{
                    padding: "10px 18px", borderRadius: 10,
                    border: "none", color: "white",
                    background: busy || !canSubmit
                      ? "#C4B6E0"
                      : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                    fontSize: 13, fontWeight: 700,
                    cursor: busy || !canSubmit ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {busy ? "Envoi…" : "Envoyer"}
                </button>
              </div>
            </>
          )}
        </m.div>
      </div>
    </LazyMotion>,
    portalTarget,
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

function LifebuoyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M6.3 6.3l3 3M14.7 14.7l3 3M6.3 17.7l3-3M14.7 9.3l3-3" />
    </svg>
  )
}
function MailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px",
  borderRadius: 8, border: "1.5px solid #E5E7EB",
  fontSize: 13.5, color: "#111827",
  outline: "none", transition: "border-color 150ms",
  fontFamily: "var(--font-inter), sans-serif",
  boxSizing: "border-box",
  background: "white",
}

const readOnlyField: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  padding: "9px 11px", borderRadius: 8,
  background: "#FAFAFA", border: "1.5px solid #F0ECF8",
  fontSize: 13, color: "#374151", fontWeight: 500,
}

const compactStyle: React.CSSProperties = {
  padding: "6px 11px", borderRadius: 8,
  border: "1px solid #E5E7EB", background: "white",
  color: "#6B7280", fontSize: 12, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
  display: "inline-flex", alignItems: "center", gap: 6,
  whiteSpace: "nowrap",
}

const ghostStyle: React.CSSProperties = {
  display: "flex", width: "100%", alignItems: "center", gap: 8,
  padding: "10px 12px", borderRadius: 8,
  border: "none", background: "transparent",
  color: "#374151", fontSize: 13, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
  textAlign: "left",
}
