"use client"

import { useEffect, useState } from "react"
import { m } from "framer-motion"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"
import { ShaderBackground } from "@/components/ui/ShaderBackground"
import { getSupabase } from "@/lib/supabase"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

type Status = "idle" | "sending" | "sent" | "error"

const content = {
  fr: {
    badge: "Contact",
    titlePre: "Parlons de votre ",
    titleItalic: "structure",
    titleSuffix: ".",
    intro: "Une question, un essai à organiser, un retour à nous faire ? Écrivez-nous directement, nous revenons vers vous sous 48h ouvrées.",
    nameLabel: "Votre nom",
    namePlaceholder: "Jean Dupont",
    emailLabel: "Votre email",
    emailPlaceholder: "jean@entreprise.fr",
    subjectLabel: "Objet",
    subjectPlaceholder: "Demande de démo / Essai gratuit / Question…",
    messageLabel: "Votre message",
    messagePlaceholder: "Décrivez votre besoin, votre structure, ou ce que vous aimeriez tester…",
    sent: "Message envoyé. Nous revenons vers vous sous 48h ouvrées.",
    errorFallback: "Impossible d'envoyer pour le moment. Réessayez ou utilisez l'email ci-dessus.",
    sendError: "Impossible d'envoyer le message",
    unknownError: "Erreur inconnue",
    sending: "Envoi en cours…",
    submit: "Envoyer le message",
  },
  en: {
    badge: "Contact",
    titlePre: "Let's talk about your ",
    titleItalic: "team",
    titleSuffix: ".",
    intro: "A question, a trial to set up, feedback to share? Write to us directly, we'll get back to you within 48 business hours.",
    nameLabel: "Your name",
    namePlaceholder: "Jane Smith",
    emailLabel: "Your email",
    emailPlaceholder: "jane@company.com",
    subjectLabel: "Subject",
    subjectPlaceholder: "Demo request / Free trial / Question…",
    messageLabel: "Your message",
    messagePlaceholder: "Describe your needs, your team, or what you'd like to test…",
    sent: "Message sent. We'll get back to you within 48 business hours.",
    errorFallback: "Unable to send right now. Please try again or use the email above.",
    sendError: "Unable to send the message",
    unknownError: "Unknown error",
    sending: "Sending…",
    submit: "Send message",
  },
}

export default function ContactPage() {
  const { lang } = useLanguage()
  const t = content[lang]
  const [email, setEmail]     = useState("")
  const [name,  setName]      = useState("")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [status, setStatus]   = useState<Status>("idle")
  const [errorMsg, setErrorMsg] = useState<string>("")

  // Pre-fill email when the visitor is signed in.
  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session?.user.email) setEmail(session.user.email)
    })
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (status === "sending") return
    setStatus("sending")
    setErrorMsg("")
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, subject, message }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? t.sendError)
      }
      setStatus("sent")
      setName("")
      setSubject("")
      setMessage("")
    } catch (err: unknown) {
      setStatus("error")
      setErrorMsg(err instanceof Error ? err.message : t.unknownError)
    }
  }

  const disabled = status === "sending"

  return (
    <>
      <ShaderBackground />
      <Navbar />

      <main style={{ position: "relative", zIndex: 1, paddingTop: 120 }}>
        <section style={{ padding: "0 24px 96px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <m.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                marginBottom: 40,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#7C63C8",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  fontFamily: "var(--font-inter), sans-serif",
                }}
              >
                {t.badge}
              </span>
              <h1
                style={{
                  fontFamily: "var(--font-fraunces), serif",
                  fontSize: "clamp(34px, 4.5vw, 52px)",
                  fontWeight: 800,
                  color: "#111827",
                  margin: 0,
                  lineHeight: 1.05,
                  letterSpacing: "-0.025em",
                }}
              >
                {t.titlePre}
                <span
                  style={{
                    fontFamily: "var(--font-instrument-serif), serif",
                    fontWeight: 400,
                    fontStyle: "italic",
                    color: "#7C63C8",
                  }}
                >
                  {t.titleItalic}
                </span>
                {t.titleSuffix}
              </h1>
              <p
                style={{
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 16,
                  color: "#4B5563",
                  lineHeight: 1.7,
                  maxWidth: "55ch",
                  margin: 0,
                }}
              >
                {t.intro}
              </p>

              <a
                href="mailto:contact@naywastudio.com"
                style={{
                  display: "inline-flex",
                  alignSelf: "flex-start",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 8,
                  padding: "10px 16px",
                  borderRadius: 999,
                  border: "1px solid rgba(124,99,200,0.25)",
                  background: "rgba(124,99,200,0.05)",
                  color: "#7C63C8",
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 13.5,
                  fontWeight: 600,
                  textDecoration: "none",
                  transition: "background 150ms",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(124,99,200,0.10)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(124,99,200,0.05)"
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                contact@naywastudio.com
              </a>
            </m.div>

            <m.form
              onSubmit={submit}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.10, ease: EASE }}
              style={{
                background: "rgba(255,255,255,0.72)",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                border: "1px solid rgba(226,218,246,0.7)",
                borderRadius: 20,
                padding: 32,
                boxShadow: "0 4px 24px rgba(124,99,200,0.06)",
                display: "flex",
                flexDirection: "column",
                gap: 18,
              }}
            >
              <Field label={t.nameLabel} required>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.namePlaceholder}
                  required
                  disabled={disabled}
                  style={inputStyle}
                />
              </Field>

              <Field label={t.emailLabel} required>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.emailPlaceholder}
                  required
                  disabled={disabled}
                  style={inputStyle}
                />
              </Field>

              <Field label={t.subjectLabel} required>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t.subjectPlaceholder}
                  required
                  disabled={disabled}
                  style={inputStyle}
                />
              </Field>

              <Field label={t.messageLabel} required>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t.messagePlaceholder}
                  required
                  disabled={disabled}
                  rows={6}
                  style={{ ...inputStyle, resize: "vertical", minHeight: 130 }}
                />
              </Field>

              {status === "sent" && (
                <div
                  style={{
                    background: "rgba(34,197,94,0.08)",
                    border: "1px solid rgba(34,197,94,0.25)",
                    color: "#15803D",
                    borderRadius: 12,
                    padding: "12px 14px",
                    fontSize: 13.5,
                    fontFamily: "var(--font-inter), sans-serif",
                    fontWeight: 500,
                  }}
                >
                  {t.sent}
                </div>
              )}
              {status === "error" && (
                <div
                  style={{
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.25)",
                    color: "#B91C1C",
                    borderRadius: 12,
                    padding: "12px 14px",
                    fontSize: 13.5,
                    fontFamily: "var(--font-inter), sans-serif",
                    fontWeight: 500,
                  }}
                >
                  {errorMsg || t.errorFallback}
                </div>
              )}

              <button
                type="submit"
                disabled={disabled}
                style={{
                  marginTop: 6,
                  background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: 12,
                  padding: "14px 28px",
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: disabled ? "wait" : "pointer",
                  opacity: disabled ? 0.7 : 1,
                  boxShadow: "0 6px 20px -6px rgba(124,99,200,0.55)",
                  fontFamily: "var(--font-inter), sans-serif",
                  letterSpacing: "-0.005em",
                  transition: "transform 150ms ease",
                }}
                onMouseEnter={(e) => {
                  if (!disabled) e.currentTarget.style.transform = "translateY(-1px)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)"
                }}
              >
                {status === "sending" ? t.sending : t.submit}
              </button>
            </m.form>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontFamily: "var(--font-inter), sans-serif",
          fontSize: 12,
          fontWeight: 600,
          color: "#374151",
          letterSpacing: "0.01em",
        }}
      >
        {label}
        {required && <span style={{ color: "#EF4444", marginLeft: 4 }}>*</span>}
      </span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: 10,
  border: "1px solid #E2DAF6",
  background: "white",
  fontSize: 14,
  fontFamily: "var(--font-inter), sans-serif",
  color: "#111827",
  outline: "none",
  transition: "border-color 150ms ease, box-shadow 150ms ease",
}
