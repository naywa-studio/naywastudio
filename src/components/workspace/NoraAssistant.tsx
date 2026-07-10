"use client"

import { useEffect, useRef, useState } from "react"
import { m, AnimatePresence } from "framer-motion"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

interface Msg { role: "user" | "assistant"; content: string }

const GREETING: Msg = {
  role: "assistant",
  content: "Salut ! Pose-moi une question sur ton vivier — par exemple « qui maîtrise React et a plus de 5 ans d'expérience ? » ou « résume-moi les profils data ».",
}

export function NoraAssistant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [input, setInput] = useState("")
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
      inputRef.current?.focus()
    }
  }, [open, messages, thinking])

  const send = async () => {
    const text = input.trim()
    if (!text || thinking) return
    const next: Msg[] = [...messages, { role: "user", content: text }]
    setMessages(next)
    setInput("")
    setThinking(true)
    setError(null)
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Drop the static greeting before sending — it's not real context.
        body: JSON.stringify({ messages: next.filter((m) => m !== GREETING) }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.detail ?? data?.error ?? "Nora n'a pas pu répondre.")
        setThinking(false)
        return
      }
      setMessages((prev) => [...prev, { role: "assistant", content: String(data.reply ?? "…") }])
    } catch (err) {
      setError((err as Error).message ?? "Erreur réseau.")
    } finally {
      setThinking(false)
    }
  }

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Assistant Nora"
        style={{
          position: "fixed", right: 22, bottom: 22, zIndex: 60,
          width: 54, height: 54, borderRadius: "50%",
          border: "none", cursor: "pointer",
          background: "linear-gradient(135deg, #7C63C8 0%, #6B54B2 100%)",
          color: "white", fontSize: 22,
          boxShadow: "0 10px 30px -6px rgba(124,99,200,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "transform 160ms ease",
          fontFamily: "var(--font-inter), sans-serif",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.06)" }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)" }}
      >
        {open ? "✕" : "✦"}
      </button>

      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.28, ease: EASE }}
            style={{
              position: "fixed", right: 22, bottom: 88, zIndex: 60,
              width: "min(390px, calc(100vw - 44px))",
              height: "min(540px, calc(100vh - 140px))",
              background: "white", borderRadius: 18,
              border: "1px solid #F0ECF8",
              boxShadow: "0 24px 64px -12px rgba(124,99,200,0.32)",
              display: "flex", flexDirection: "column", overflow: "hidden",
              fontFamily: "var(--font-inter), sans-serif",
            }}
          >
            {/* Header */}
            <div style={{
              padding: "14px 18px", borderBottom: "1px solid #F0ECF8",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{
                width: 30, height: 30, borderRadius: "50%",
                background: "linear-gradient(135deg, #F0ECF8 0%, #E2DAF6 100%)",
                color: "#7C63C8", fontWeight: 800, fontSize: 14,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>✦</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#111827" }}>Nora</p>
                <p style={{ margin: 0, fontSize: 11, color: "#6B7280" }}>Assistante vivier</p>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} style={{
              flex: 1, overflowY: "auto", padding: 16,
              display: "flex", flexDirection: "column", gap: 10,
            }}>
              {messages.map((mm, i) => (
                <div key={i} style={{
                  alignSelf: mm.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "86%",
                  background: mm.role === "user"
                    ? "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)"
                    : "#F4F1FB",
                  color: mm.role === "user" ? "white" : "#374151",
                  fontSize: 13.5, lineHeight: 1.55,
                  padding: "9px 12px",
                  borderRadius: mm.role === "user" ? "13px 13px 4px 13px" : "13px 13px 13px 4px",
                  whiteSpace: "pre-wrap",
                }}>
                  {mm.content}
                </div>
              ))}
              {thinking && (
                <div style={{
                  alignSelf: "flex-start", fontSize: 13, color: "#6B7280",
                  padding: "8px 12px", background: "#F4F1FB", borderRadius: "13px 13px 13px 4px",
                }}>
                  Nora cherche…
                </div>
              )}
              {error && (
                <div style={{
                  padding: "8px 11px", background: "#FEF2F2", border: "1px solid #FECACA",
                  borderRadius: 10, fontSize: 12.5, color: "#B91C1C",
                }}>{error}</div>
              )}
            </div>

            {/* Input */}
            <div style={{ padding: "12px 14px", borderTop: "1px solid #F0ECF8", display: "flex", gap: 8 }}>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Demande quelque chose…"
                disabled={thinking}
                style={{
                  flex: 1, fontSize: 13, color: "#111827",
                  padding: "9px 12px", borderRadius: 9,
                  background: "#FAFAFA", border: "1px solid #E5E7EB",
                  outline: "none", fontFamily: "inherit",
                }}
              />
              <button onClick={send} disabled={thinking || !input.trim()} style={{
                flexShrink: 0, padding: "0 14px", borderRadius: 9, border: "none",
                background: thinking || !input.trim()
                  ? "#E2DAF6" : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                color: "white", fontSize: 14, fontWeight: 700,
                cursor: thinking || !input.trim() ? "default" : "pointer", fontFamily: "inherit",
              }}>→</button>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  )
}
