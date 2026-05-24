"use client"

/**
 * /workspace/pricing-ia — Agent IA pricing.
 *
 * Le sourceur choisit une mission + un candidat, l'agent prend la main :
 * il pose les questions manquantes, appelle les tools déterministes
 * (compute_employer_cost, compute_rupture_scenarios) et rend un verdict.
 *
 * V0 : chat simple, non-streaming. Pas de panneau récap droite pour
 * l'instant — le sourceur lit directement le verdict du dernier message.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { m } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import type { Candidate, Job } from "@/lib/database.types"
import NoraLoader from "@/components/workspace/NoraLoader"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

/* ──────────────────────────────────────────────────────────────────────────
 * Types pour le state de conversation
 * ────────────────────────────────────────────────────────────────────────── */

interface ToolCall {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

interface ChatMessage {
  role: "user" | "assistant" | "tool"
  content: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

interface AgentEvent {
  type: "assistant_text" | "tool_call" | "ask_user" | "error"
  content?: string
  tool?: string
  args?: unknown
  result_summary?: string
  question?: string
  options?: string[]
  reason?: string
  message?: string
}

/* ──────────────────────────────────────────────────────────────────────────
 * Page
 * ────────────────────────────────────────────────────────────────────────── */

export default function PricingIaPage() {
  const sb = useMemo(() => getSupabase(), [])

  // Mission + candidate selection
  const [missions, setMissions] = useState<Job[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [missionId, setMissionId] = useState<string>("")
  const [candidateId, setCandidateId] = useState<string>("")
  const [loadingLists, setLoadingLists] = useState(true)

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pendingEvents, setPendingEvents] = useState<AgentEvent[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  // Load missions + candidates once
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const [missionsRes, candidatesRes] = await Promise.all([
        sb.from("jobs").select("*").in("status", ["draft", "open"]).order("created_at", { ascending: false }).limit(50),
        sb.from("candidates").select("*").eq("parse_status", "parsed").order("created_at", { ascending: false }).limit(80),
      ])
      if (!mounted) return
      setMissions((missionsRes.data ?? []) as Job[])
      setCandidates((candidatesRes.data ?? []) as Candidate[])
      setLoadingLists(false)
    })()
    return () => { mounted = false }
  }, [sb])

  // Auto-scroll to bottom when new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, pendingEvents])

  const callAgent = useCallback(async (nextMessages: ChatMessage[]) => {
    setSending(true)
    setError(null)
    setPendingEvents([])
    try {
      const res = await fetch("/api/pricing-ia/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          missionId: missionId || undefined,
          candidateId: candidateId || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "unknown" }))
        throw new Error(err.message ?? err.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as {
        events: AgentEvent[]
        persisted_messages: ChatMessage[]
      }
      setPendingEvents(data.events)
      setMessages(data.persisted_messages)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSending(false)
    }
  }, [missionId, candidateId])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }]
    setMessages(next)
    setInput("")
    await callAgent(next)
  }, [messages, sending, callAgent])

  const startConversation = useCallback(async () => {
    const seed = "Bonjour Nora. Analyse ce candidat sur cette mission et donne-moi ton verdict de risque rupture. Pose-moi les questions s'il te manque des inputs."
    await sendMessage(seed)
  }, [sendMessage])

  const canStart = missionId !== "" && candidateId !== ""
  const conversationStarted = messages.length > 0

  if (loadingLists) return <NoraLoader />

  return (
    <main style={{
      minHeight: "calc(100vh - 60px)",
      padding: "32px 24px 80px",
      maxWidth: 920, margin: "0 auto",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      <Header />

      <ContextPicker
        missions={missions}
        candidates={candidates}
        missionId={missionId}
        candidateId={candidateId}
        onMissionChange={setMissionId}
        onCandidateChange={setCandidateId}
        disabled={conversationStarted}
      />

      {!conversationStarted ? (
        <m.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          style={{
            marginTop: 18, padding: "24px 22px",
            background: "white", border: "1px solid #F0ECF8", borderRadius: 16,
            textAlign: "center",
          }}
        >
          <p style={{ margin: "0 0 12px", fontSize: 14, color: "#6B7280", lineHeight: 1.55 }}>
            Sélectionne une mission et un candidat ci-dessus, puis démarre l&apos;analyse.
            L&apos;agent te posera les questions manquantes (statut Syntec, position, brut négocié…)
            et te rendra un verdict chiffré sur le risque rupture.
          </p>
          <button
            onClick={startConversation}
            disabled={!canStart || sending}
            style={{
              padding: "10px 22px", fontSize: 14, fontWeight: 700,
              color: "white", background: canStart && !sending
                ? "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)"
                : "#C7BFE3",
              border: "none", borderRadius: 10,
              cursor: canStart && !sending ? "pointer" : "not-allowed",
              fontFamily: "inherit",
            }}
          >
            {sending ? "Démarrage…" : "✨ Démarrer l'analyse"}
          </button>
          {!canStart && (
            <p style={{ margin: "12px 0 0", fontSize: 11.5, color: "#9CA3AF" }}>
              Mission et candidat requis.
            </p>
          )}
        </m.div>
      ) : (
        <div style={{
          marginTop: 18, padding: "20px 18px",
          background: "white", border: "1px solid #F0ECF8", borderRadius: 16,
          minHeight: 320,
        }}>
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
          {pendingEvents.map((ev, i) => (
            <EventLine key={`ev-${i}`} event={ev} />
          ))}
          {sending && (
            <div style={{ padding: "8px 12px", fontSize: 12, color: "#9CA3AF" }}>
              🤔 L&apos;agent réfléchit…
            </div>
          )}
          {error && (
            <div style={{
              marginTop: 10, padding: "9px 12px",
              background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 9,
              fontSize: 12, color: "#B91C1C",
            }}>
              ⚠ {error}
            </div>
          )}
          <div ref={bottomRef} />

          <ChatInput
            value={input}
            onChange={setInput}
            onSend={() => sendMessage(input)}
            disabled={sending}
          />
        </div>
      )}
    </main>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Components
 * ────────────────────────────────────────────────────────────────────────── */

function Header() {
  return (
    <div style={{ marginBottom: 20 }}>
      <Link href="/workspace" style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 13, color: "#7C63C8", textDecoration: "none", marginBottom: 14,
      }}>← Retour au workspace</Link>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{
          display: "inline-block",
          fontSize: 11, fontWeight: 700, color: "#7C63C8",
          background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.22)",
          padding: "4px 11px", borderRadius: 100,
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          ✨ Agent IA · Beta
        </span>
        <h1 style={{
          margin: 0, fontSize: "clamp(22px, 2.6vw, 28px)", fontWeight: 800,
          color: "#111827", letterSpacing: "-0.02em",
        }}>
          Pricing IA
        </h1>
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6B7280", lineHeight: 1.55, maxWidth: 720 }}>
        L&apos;agent suit la convention Syntec et appelle nos fonctions de calcul déterministes.
        Il ne fait <strong>jamais d&apos;arithmétique lui-même</strong> — les chiffres viennent
        tous du code, pas du modèle.
      </p>
    </div>
  )
}

function ContextPicker({
  missions, candidates, missionId, candidateId,
  onMissionChange, onCandidateChange, disabled,
}: {
  missions: Job[]
  candidates: Candidate[]
  missionId: string
  candidateId: string
  onMissionChange: (id: string) => void
  onCandidateChange: (id: string) => void
  disabled: boolean
}) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
      padding: 14,
      background: "white", border: "1px solid #F0ECF8", borderRadius: 12,
    }}>
      <PickerSelect
        label="Mission"
        value={missionId}
        onChange={onMissionChange}
        disabled={disabled}
        options={missions.map((m) => ({
          value: m.id,
          label: `${m.title}${m.location ? ` · ${m.location}` : ""}`,
        }))}
      />
      <PickerSelect
        label="Candidat"
        value={candidateId}
        onChange={onCandidateChange}
        disabled={disabled}
        options={candidates.map((c) => ({
          value: c.id,
          label: `${c.full_name ?? "Sans nom"}${c.current_title ? ` · ${c.current_title}` : ""}`,
        }))}
      />
    </div>
  )
}

function PickerSelect({
  label, value, onChange, options, disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{
        fontSize: 10.5, fontWeight: 700, color: "#9CA3AF",
        letterSpacing: "0.05em", textTransform: "uppercase",
      }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          padding: "8px 10px", fontSize: 13,
          color: "#111827", background: disabled ? "#FAFAFA" : "white",
          border: "1px solid #E5E7EB", borderRadius: 9,
          fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <option value="">— sélectionner —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "tool") return null    // tool results sont rendus via EventLine
  if (message.role === "assistant" && !message.content && message.tool_calls?.length) {
    // L'assistant n'a fait qu'un tool call sans texte — affiché via EventLine
    return null
  }
  const isUser = message.role === "user"
  return (
    <m.div
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
      style={{
        margin: "10px 0",
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
      }}
    >
      <div style={{
        maxWidth: "85%",
        padding: "10px 14px",
        background: isUser ? "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)" : "#F8F6FF",
        color: isUser ? "white" : "#111827",
        borderRadius: 12,
        fontSize: 13.5, lineHeight: 1.55,
        whiteSpace: "pre-wrap",
      }}>
        {message.content}
      </div>
    </m.div>
  )
}

function EventLine({ event }: { event: AgentEvent }) {
  if (event.type === "assistant_text") {
    return (
      <MessageBubble message={{ role: "assistant", content: event.content ?? "" }} />
    )
  }
  if (event.type === "tool_call") {
    return (
      <div style={{
        margin: "6px 0", padding: "6px 10px",
        background: "rgba(124,99,200,0.04)", border: "1px solid rgba(124,99,200,0.12)",
        borderRadius: 8, fontSize: 11, color: "#6B7280",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      }}>
        ⚙ <strong style={{ color: "#7C63C8" }}>{event.tool}</strong> — {event.result_summary}
      </div>
    )
  }
  if (event.type === "ask_user") {
    return (
      <m.div
        initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: EASE }}
        style={{
          margin: "10px 0", padding: "12px 14px",
          background: "rgba(217,119,6,0.05)", border: "1px solid rgba(217,119,6,0.22)",
          borderRadius: 12,
        }}
      >
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "#92400E" }}>
          ❓ {event.question}
        </p>
        {event.reason && (
          <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "#A16207" }}>
            {event.reason}
          </p>
        )}
        {event.options && event.options.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {event.options.map((opt) => (
              <span key={opt} style={{
                fontSize: 11, fontWeight: 600, color: "#92400E",
                padding: "4px 9px", borderRadius: 100,
                background: "white", border: "1px solid rgba(217,119,6,0.25)",
              }}>
                {opt}
              </span>
            ))}
          </div>
        )}
      </m.div>
    )
  }
  if (event.type === "error") {
    return (
      <div style={{
        margin: "10px 0", padding: "9px 12px",
        background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 9,
        fontSize: 12, color: "#B91C1C",
      }}>
        ⚠ {event.message}
      </div>
    )
  }
  return null
}

function ChatInput({
  value, onChange, onSend, disabled,
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  disabled: boolean
}) {
  return (
    <div style={{
      marginTop: 14, paddingTop: 14, borderTop: "1px solid #F0ECF8",
      display: "flex", gap: 8,
    }}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            onSend()
          }
        }}
        placeholder="Réponds à l'agent ou pose une nouvelle question…"
        disabled={disabled}
        rows={2}
        style={{
          flex: 1, padding: "10px 12px",
          fontSize: 13.5, color: "#111827",
          border: "1px solid #E5E7EB", borderRadius: 10,
          outline: "none", fontFamily: "inherit",
          resize: "vertical", minHeight: 44, maxHeight: 200,
        }}
      />
      <button
        onClick={onSend}
        disabled={disabled || !value.trim()}
        style={{
          padding: "10px 18px", fontSize: 13, fontWeight: 700,
          color: "white", background: disabled || !value.trim()
            ? "#C7BFE3"
            : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
          border: "none", borderRadius: 10,
          cursor: disabled || !value.trim() ? "not-allowed" : "pointer",
          fontFamily: "inherit",
          alignSelf: "flex-end",
        }}
      >
        ↑ Envoyer
      </button>
    </div>
  )
}
