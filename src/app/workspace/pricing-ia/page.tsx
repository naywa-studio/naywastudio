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

interface DeductionField {
  field: string
  label?: string
  value: unknown
  reasoning: string
  confidence?: "haute" | "moyenne" | "faible"
  source?: string
}

interface AgentEvent {
  type: "assistant_text" | "tool_call" | "ask_user" | "propose_deductions" | "error"
  content?: string
  tool?: string
  args?: unknown
  result_summary?: string
  question?: string
  options?: string[]
  reason?: string
  message?: string
  summary?: string
  fields?: DeductionField[]
}

/* ──────────────────────────────────────────────────────────────────────────
 * Page
 * ────────────────────────────────────────────────────────────────────────── */

export default function PricingIaPage() {
  const sb = useMemo(() => getSupabase(), [])

  // Mission + candidate selection. Le candidat est filtré dynamiquement
  // sur la mission sélectionnée (via match_assessments) — on ne propose que
  // les candidats déjà matchés sur la mission, triés par score décroissant.
  const [missions, setMissions] = useState<Job[]>([])
  const [matchedCandidates, setMatchedCandidates] = useState<Array<{ candidate: Candidate; score: number | null; tier: string | null }>>([])
  const [missionId, setMissionId] = useState<string>("")
  const [candidateId, setCandidateId] = useState<string>("")
  const [loadingLists, setLoadingLists] = useState(true)
  const [loadingCandidates, setLoadingCandidates] = useState(false)

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pendingEvents, setPendingEvents] = useState<AgentEvent[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  // Load missions list once at mount
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await sb
        .from("jobs")
        .select("*")
        .in("status", ["draft", "open"])
        .order("created_at", { ascending: false })
        .limit(50)
      if (!mounted) return
      setMissions((data ?? []) as Job[])
      setLoadingLists(false)
    })()
    return () => { mounted = false }
  }, [sb])

  // Charge les candidats matchés sur la mission sélectionnée
  useEffect(() => {
    if (!missionId) {
      setMatchedCandidates([])
      setCandidateId("")
      return
    }
    let mounted = true
    setLoadingCandidates(true)
    setCandidateId("")
    ;(async () => {
      const { data } = await sb
        .from("match_assessments")
        .select("score, match_tier, candidate:candidates(*)")
        .eq("job_id", missionId)
        .order("score", { ascending: false, nullsFirst: false })
        .limit(40)
      if (!mounted) return
      const rows = ((data ?? []) as unknown as {
        score: number | null
        match_tier: string | null
        candidate: Candidate | null
      }[])
        .filter((r) => r.candidate !== null)
        .map((r) => ({ candidate: r.candidate as Candidate, score: r.score, tier: r.match_tier }))
      setMatchedCandidates(rows)
      setLoadingCandidates(false)
    })()
    return () => { mounted = false }
  }, [missionId, sb])

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
    // Seed message neutre — le system prompt force le workflow "propose_deductions
    // d'abord" donc on ne biaise pas avec "pose-moi des questions".
    const seed = "Analyse ce candidat sur cette mission. Présente-moi tes déductions pour validation."
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
        matchedCandidates={matchedCandidates}
        loadingCandidates={loadingCandidates}
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
            <EventLine key={`ev-${i}`} event={ev} onSubmitText={(text) => sendMessage(text)} />
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
  missions, matchedCandidates, loadingCandidates, missionId, candidateId,
  onMissionChange, onCandidateChange, disabled,
}: {
  missions: Job[]
  matchedCandidates: Array<{ candidate: Candidate; score: number | null; tier: string | null }>
  loadingCandidates: boolean
  missionId: string
  candidateId: string
  onMissionChange: (id: string) => void
  onCandidateChange: (id: string) => void
  disabled: boolean
}) {
  const candidatePlaceholder = !missionId
    ? "— sélectionne d'abord une mission —"
    : loadingCandidates
      ? "Chargement des candidats matchés…"
      : matchedCandidates.length === 0
        ? "Aucun candidat matché sur cette mission — lance un matching d'abord"
        : "— sélectionner —"
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
        label={`Candidat matché ${matchedCandidates.length > 0 ? `(${matchedCandidates.length})` : ""}`}
        value={candidateId}
        onChange={onCandidateChange}
        disabled={disabled || !missionId || loadingCandidates || matchedCandidates.length === 0}
        placeholder={candidatePlaceholder}
        options={matchedCandidates.map(({ candidate, score }) => ({
          value: candidate.id,
          label: `${score != null ? `[${score}] ` : ""}${candidate.full_name ?? "Sans nom"}${candidate.current_title ? ` · ${candidate.current_title}` : ""}`,
        }))}
      />
    </div>
  )
}

function PickerSelect({
  label, value, onChange, options, disabled, placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
  placeholder?: string
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
          color: disabled ? "#9CA3AF" : "#111827", background: disabled ? "#FAFAFA" : "white",
          border: "1px solid #E5E7EB", borderRadius: 9,
          fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <option value="">{placeholder ?? "— sélectionner —"}</option>
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

function EventLine({ event, onSubmitText }: { event: AgentEvent; onSubmitText: (text: string) => void }) {
  // assistant_text est déjà rendu via persisted_messages → ne pas dupliquer.
  if (event.type === "assistant_text") return null
  if (event.type === "propose_deductions" && event.fields) {
    return <DeductionsCard summary={event.summary} fields={event.fields} onSubmit={onSubmitText} />
  }
  if (event.type === "tool_call") {
    const friendlyLabel: Record<string, string> = {
      get_syntec_rule:               "📖 Consulte la convention Syntec",
      compute_employer_cost:         "💼 Calcule le coût employeur",
      compute_rupture_scenarios:     "📈 Simule les scénarios de rupture",
      validate_minimum_conventionnel: "⚖ Vérifie le minimum conventionnel",
      propose_deductions:            "📋 Prépare ses déductions",
      ask_user:                      "❓ Pose une question",
    }
    const label = friendlyLabel[event.tool ?? ""] ?? `⚙ ${event.tool}`
    return (
      <div style={{
        margin: "6px 0", padding: "5px 10px",
        background: "rgba(124,99,200,0.04)", border: "1px solid rgba(124,99,200,0.10)",
        borderRadius: 8, fontSize: 11, color: "#9CA3AF",
        display: "inline-flex", alignItems: "center", gap: 6,
      }}>
        <span>{label}</span>
        <span style={{ fontSize: 9.5, opacity: 0.7 }}>✓</span>
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

function DeductionsCard({
  summary, fields, onSubmit,
}: {
  summary?: string
  fields: DeductionField[]
  onSubmit: (text: string) => void
}) {
  // Local state — chaque champ est éditable avant validation.
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const f of fields) initial[f.field] = String(f.value ?? "")
    return initial
  })

  const confidenceColor = (c?: DeductionField["confidence"]) =>
    c === "haute" ? "#16a34a" : c === "moyenne" ? "#D97706" : c === "faible" ? "#DC2626" : "#9CA3AF"

  const submitConfirmAll = () => {
    const lines = fields.map((f) => {
      const newValue = values[f.field]
      const original = String(f.value ?? "")
      const tag = newValue !== original ? " (corrigé)" : ""
      return `- ${f.label ?? f.field} : ${newValue}${tag}`
    })
    onSubmit(`Validé. Voici les valeurs finales :\n${lines.join("\n")}\n\nTu peux maintenant lancer les calculs.`)
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      style={{
        margin: "12px 0", padding: "16px 18px",
        background: "linear-gradient(135deg, rgba(124,99,200,0.05), rgba(124,99,200,0.02))",
        border: "1.5px solid rgba(124,99,200,0.30)", borderRadius: 14,
      }}
    >
      <p style={{ margin: "0 0 12px", fontSize: 13.5, fontWeight: 700, color: "#7C63C8" }}>
        📋 {summary ?? "Voici ce que je déduis de ce profil — confirme ou corrige :"}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {fields.map((f) => (
          <div key={f.field} style={{
            display: "grid", gridTemplateColumns: "1fr auto auto",
            gap: 10, alignItems: "center",
            padding: "8px 10px",
            background: "white", border: "1px solid #F0ECF8", borderRadius: 9,
          }}>
            <div>
              <div style={{
                fontSize: 10.5, fontWeight: 700, color: "#9CA3AF",
                letterSpacing: "0.04em", textTransform: "uppercase",
              }}>
                {f.label ?? f.field}
              </div>
              <input
                type="text"
                value={values[f.field] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.field]: e.target.value }))}
                style={{
                  width: "100%", marginTop: 2,
                  fontSize: 13.5, fontWeight: 600, color: "#111827",
                  background: "transparent", border: "none", outline: "none",
                  padding: 0, fontFamily: "inherit",
                }}
              />
              <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2, lineHeight: 1.4 }}>
                {f.reasoning}
              </div>
            </div>
            {f.confidence && (
              <span style={{
                fontSize: 9.5, fontWeight: 700,
                color: confidenceColor(f.confidence),
                background: `${confidenceColor(f.confidence)}15`,
                padding: "3px 7px", borderRadius: 100,
                letterSpacing: "0.04em", textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}>
                Conf. {f.confidence}
              </span>
            )}
            {f.source && (
              <span style={{
                fontSize: 9.5, color: "#9CA3AF",
                whiteSpace: "nowrap",
              }}>
                {f.source}
              </span>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          onClick={submitConfirmAll}
          style={{
            padding: "8px 18px", fontSize: 13, fontWeight: 700,
            color: "white",
            background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
            border: "none", borderRadius: 9, cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ✓ Valider et lancer les calculs
        </button>
      </div>
    </m.div>
  )
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
