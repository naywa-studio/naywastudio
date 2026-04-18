"use client"

/**
 * BriefChat — Conversational AI brief collection
 * Feels like a real AI chat (think Claude / ChatGPT) oriented toward
 * understanding the client's recruitment need.
 */

import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react"
import { m, AnimatePresence } from "framer-motion"
import type { MissionBrief } from "@/lib/database.types"

export interface BriefChatHandle {
  triggerExtend: (prefill?: string) => void
}

const PURPLE = "#7C63C8"
const PURPLE_LIGHT = "#F0ECF8"

interface ChatMsg {
  id: string
  role: "user" | "assistant"
  content: string
  brief?: MissionBrief
  chips?: string[]
  isExtend?: boolean
}

interface BriefChatProps {
  missionId: string
  firstName: string | null
  agentColor: string
  agentName: string
  isRunning: boolean
  completedCount?: number
  onLaunch: (brief: MissionBrief) => void
}

/* ── Helpers ─────────────────────────────────────────────────── */

function uid() {
  return Math.random().toString(36).slice(2)
}

function parseBrief(content: string): MissionBrief | null {
  const match = content.match(/<brief>([\s\S]*?)<\/brief>/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1].trim())
    if (!parsed.titre_poste || !parsed.localisation) return null
    return parsed as MissionBrief
  } catch {
    return null
  }
}

function stripBriefTag(content: string): string {
  return content.replace(/<brief>[\s\S]*?<\/brief>/g, "").trim()
}

function parseChips(content: string): string[] {
  return (content.match(/\[([^\]]+)\]/g) ?? []).map((m) => m.slice(1, -1))
}

function stripChips(content: string): string {
  return content.replace(/\[([^\]]+)\]/g, "").replace(/\s{2,}/g, " ").trim()
}

function renderContent(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  )
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
}

/* ── Nawa Avatar SVG ─────────────────────────────────────────── */

function NawaAvatar({ size = 30 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(135deg, ${PURPLE} 0%, #9B7FE8 100%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 2px 8px rgba(124,99,200,0.3)",
    }}>
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 14 14" fill="none">
        <path d="M2 12V2l4 7 4-7v10" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

/* ── Brief Card ──────────────────────────────────────────────── */

function BriefCard({
  brief, onLaunch, launched, isExtend,
}: {
  brief: MissionBrief
  onLaunch: () => void
  launched: boolean
  isExtend?: boolean
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      style={{
        marginTop: 8,
        borderRadius: 14,
        border: `1.5px solid ${PURPLE}25`,
        background: "white",
        overflow: "hidden",
        boxShadow: "0 4px 20px rgba(124,99,200,0.1)",
      }}
    >
      {/* Top gradient bar */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${PURPLE}, #A78BFA)` }} />

      {/* Header */}
      <div style={{ padding: "10px 14px 6px", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 7,
          background: isExtend ? "rgba(14,165,233,0.1)" : PURPLE_LIGHT,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
            {isExtend
              ? <circle cx="9" cy="9" r="6" stroke={PURPLE} strokeWidth="2"/>
              : <path d="M4 6h12M4 10h8M4 14h10" stroke={PURPLE} strokeWidth="1.8" strokeLinecap="round"/>
            }
          </svg>
        </div>
        <p style={{
          margin: 0, fontSize: 10, fontWeight: 700, color: PURPLE,
          textTransform: "uppercase", letterSpacing: "0.08em",
          fontFamily: "var(--font-inter), sans-serif",
        }}>
          {isExtend ? "Recherche étendue" : "Fiche de recherche"}
        </p>
      </div>

      {/* Fields */}
      <div style={{ padding: "4px 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
        <BriefField label="Poste" value={brief.titre_poste} />
        <BriefField label="Lieu" value={brief.localisation} />
        {Array.isArray(brief.mots_cles) && brief.mots_cles.length > 0 && (
          <div>
            <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-inter), sans-serif" }}>
              Compétences
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {brief.mots_cles.map((kw) => (
                <span key={kw} style={{
                  fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                  background: PURPLE_LIGHT, color: PURPLE,
                  fontFamily: "var(--font-inter), sans-serif",
                }}>{kw}</span>
              ))}
            </div>
          </div>
        )}
        {brief.criteres && <BriefField label="Critères" value={brief.criteres} />}
        {brief.ton && <BriefField label="Ton" value={brief.ton} />}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "#F0ECF8" }} />

      {/* Launch */}
      <div style={{ padding: "10px 14px" }}>
        {launched ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 7, fontSize: 13,
            color: "#16a34a", fontWeight: 600, fontFamily: "var(--font-inter), sans-serif",
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: "50%", background: "rgba(22,163,74,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
            }}>✓</span>
            {isExtend ? "Recherche étendue lancée !" : "Recherche lancée !"}
          </div>
        ) : (
          <button
            onClick={onLaunch}
            style={{
              width: "100%", padding: "10px 16px", borderRadius: 10,
              border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
              color: "white",
              background: `linear-gradient(135deg, ${PURPLE} 0%, #9B7FE8 100%)`,
              fontFamily: "var(--font-inter), sans-serif",
              boxShadow: `0 4px 16px rgba(124,99,200,0.35)`,
              transition: "transform 100ms, box-shadow 100ms",
              letterSpacing: -0.2,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)"
              e.currentTarget.style.boxShadow = "0 6px 20px rgba(124,99,200,0.45)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)"
              e.currentTarget.style.boxShadow = "0 4px 16px rgba(124,99,200,0.35)"
            }}
          >
            {isExtend ? "Lancer la recherche étendue →" : "Lancer la recherche →"}
          </button>
        )}
      </div>
    </m.div>
  )
}

function BriefField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ margin: "0 0 2px", fontSize: 10, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-inter), sans-serif" }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: 12, color: "#374151", fontFamily: "var(--font-inter), sans-serif", lineHeight: 1.5 }}>
        {value}
      </p>
    </div>
  )
}

/* ── Main component ────────────────────────────────────────────── */

const BriefChat = forwardRef<BriefChatHandle, BriefChatProps>(function BriefChat({
  missionId,
  firstName,
  agentColor,
  agentName,
  isRunning,
  completedCount,
  onLaunch,
}: BriefChatProps, ref) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [timestamps] = useState<Map<string, Date>>(new Map())
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [launchedBriefs, setLaunchedBriefs] = useState<Set<string>>(new Set())
  const [isFocused, setIsFocused] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const hasGreeted = useRef(false)
  const prevCompletedCount = useRef<number | undefined>(undefined)

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
    }, 60)
  }, [])

  const addMsg = useCallback((msg: ChatMsg) => {
    timestamps.set(msg.id, new Date())
    setMessages(prev => [...prev, msg])
  }, [timestamps])

  /* ── Auto-greet ───────────────────────────────────────────── */
  useEffect(() => {
    if (hasGreeted.current) return
    hasGreeted.current = true
    const name = firstName ? ` **${firstName}**` : ""
    const greeting: ChatMsg = {
      id: uid(),
      role: "assistant",
      content: `Bonjour${name} ! Pour trouver les meilleurs profils, j'ai besoin de bien comprendre votre contexte.\n\nQuel est le projet derrière ce recrutement ?`,
      chips: ["Renforcement d'équipe", "Nouveau poste créé", "Remplacement d'un départ", "Je vais vous expliquer"],
    }
    timestamps.set(greeting.id, new Date())
    setMessages([greeting])
  }, [firstName, timestamps])

  /* ── Run completed notification ─────────────────────────── */
  useEffect(() => {
    if (
      completedCount !== undefined &&
      prevCompletedCount.current !== undefined &&
      completedCount !== prevCompletedCount.current
    ) {
      const count = completedCount
      const msg: ChatMsg = {
        id: uid(),
        role: "assistant",
        content: `**${count} profil${count > 1 ? "s" : ""} trouvé${count > 1 ? "s" : ""}** — consultez les résultats à droite.\n\nVous voulez ajuster la recherche ?`,
        chips: ["Élargir la zone", "Critères alternatifs", "Plus de profils"],
      }
      addMsg(msg)
      scrollToBottom()
    }
    prevCompletedCount.current = completedCount
  }, [completedCount, scrollToBottom, addMsg])

  /* ── Send message ──────────────────────────────────────── */
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading || isRunning) return

    const userMsg: ChatMsg = { id: uid(), role: "user", content: trimmed }
    addMsg(userMsg)
    setInput("")
    setLoading(true)
    scrollToBottom()

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }

    try {
      const history = [...messages, userMsg].map((m) => ({
        role: m.role as "user" | "assistant",
        content: stripChips(stripBriefTag(m.content)),
      }))

      const res = await fetch(`/api/missions/${missionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      })

      const data = await res.json() as { content?: string; error?: string }
      const rawContent = data.content ?? "Désolé, une erreur est survenue."

      const brief = parseBrief(rawContent)
      const cleanContent = stripBriefTag(rawContent)
      const chips = parseChips(cleanContent)
      const displayContent = stripChips(cleanContent)

      const isExtend = Boolean(
        prevCompletedCount.current !== undefined &&
        (trimmed.toLowerCase().includes("élargi") ||
         trimmed.toLowerCase().includes("plus de profil") ||
         trimmed.toLowerCase().includes("alternatif") ||
         trimmed.toLowerCase().includes("plus large") ||
         trimmed === "Élargir la zone" ||
         trimmed === "Critères alternatifs" ||
         trimmed === "Plus de profils")
      )

      const assistantMsg: ChatMsg = {
        id: uid(),
        role: "assistant",
        content: displayContent,
        brief: brief ?? undefined,
        chips: chips.length > 0 ? chips : undefined,
        isExtend,
      }
      addMsg(assistantMsg)
    } catch {
      addMsg({
        id: uid(),
        role: "assistant",
        content: "Une erreur de connexion est survenue. Réessayez dans un instant.",
      })
    } finally {
      setLoading(false)
      scrollToBottom()
    }
  }, [messages, loading, isRunning, missionId, scrollToBottom, addMsg])

  /* ── Expose triggerExtend ──────────────────────────────── */
  useImperativeHandle(ref, () => ({
    triggerExtend: (prefill?: string) => sendMessage(prefill ?? "Plus de profils"),
  }), [sendMessage])

  const handleLaunch = (brief: MissionBrief, msgId: string) => {
    setLaunchedBriefs((prev) => new Set([...prev, msgId]))
    onLaunch(brief)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const canSend = input.trim().length > 0 && !loading && !isRunning

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "white",
      borderRadius: 18,
      border: `1.5px solid ${PURPLE_LIGHT}`,
      overflow: "hidden",
    }}>
      <style>{`
        @keyframes chatBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes chatPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
        .chat-msg-user:hover .chat-time,
        .chat-msg-ai:hover .chat-time {
          opacity: 1 !important;
        }
      `}</style>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{
        padding: "13px 16px",
        borderBottom: `1px solid ${PURPLE_LIGHT}`,
        display: "flex",
        alignItems: "center",
        gap: 11,
        flexShrink: 0,
        background: "#FDFCFF",
      }}>
        <NawaAvatar size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 13, fontWeight: 700, color: "#111827",
            fontFamily: "var(--font-space-grotesk), sans-serif",
          }}>
            Nawa AI
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
            <span style={{
              display: "inline-block", width: 6, height: 6, borderRadius: "50%",
              background: isRunning ? "#F59E0B" : "#22c55e",
              animation: isRunning ? "chatPulse 1.5s ease-in-out infinite" : "none",
            }} />
            <span style={{
              fontSize: 11, color: "#9CA3AF",
              fontFamily: "var(--font-inter), sans-serif",
            }}>
              {isRunning ? "Recherche en cours…" : "En ligne"}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 999,
              color: agentColor, background: `${agentColor}14`,
              border: `1px solid ${agentColor}25`,
              fontFamily: "var(--font-inter), sans-serif",
              marginLeft: 4,
            }}>
              {agentName}
            </span>
          </div>
        </div>
      </div>

      {/* ── Messages ───────────────────────────────────────── */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          scrollbarWidth: "thin",
          scrollbarColor: "#E2DAF6 transparent",
        }}
      >
        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => {
            const prevMsg = messages[idx - 1]
            const sameRole = prevMsg?.role === msg.role
            const ts = timestamps.get(msg.id)

            return (
              <m.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className={msg.role === "user" ? "chat-msg-user" : "chat-msg-ai"}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                  marginTop: sameRole ? 2 : 12,
                }}
              >
                {/* Avatar (only on first of a group) */}
                {msg.role === "assistant" && !sameRole && (
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                    <NawaAvatar size={22} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#374151", fontFamily: "var(--font-inter), sans-serif" }}>
                      Nawa AI
                    </span>
                    {ts && (
                      <span className="chat-time" style={{ fontSize: 10, color: "#D1D5DB", opacity: 0, transition: "opacity 150ms", fontFamily: "var(--font-inter), sans-serif" }}>
                        {formatTime(ts)}
                      </span>
                    )}
                  </div>
                )}

                <div style={{ maxWidth: "88%", minWidth: 0 }}>
                  {/* Bubble */}
                  <div style={{
                    padding: "10px 14px",
                    borderRadius: msg.role === "user"
                      ? (sameRole ? "16px 4px 4px 16px" : "16px 4px 16px 16px")
                      : (sameRole ? "4px 16px 16px 4px" : "4px 16px 16px 16px"),
                    background: msg.role === "user"
                      ? `linear-gradient(135deg, ${PURPLE} 0%, #9B7FE8 100%)`
                      : "#F5F3FF",
                    color: msg.role === "user" ? "white" : "#1F1535",
                    fontSize: 13,
                    lineHeight: 1.65,
                    fontFamily: "var(--font-inter), sans-serif",
                    whiteSpace: "pre-wrap",
                    boxShadow: msg.role === "user"
                      ? "0 2px 10px rgba(124,99,200,0.25)"
                      : "none",
                  }}>
                    {renderContent(msg.content)}
                  </div>

                  {/* User timestamp */}
                  {msg.role === "user" && ts && (
                    <div className="chat-time" style={{ textAlign: "right", marginTop: 3, opacity: 0, transition: "opacity 150ms" }}>
                      <span style={{ fontSize: 10, color: "#D1D5DB", fontFamily: "var(--font-inter), sans-serif" }}>
                        {formatTime(ts)}
                      </span>
                    </div>
                  )}

                  {/* Brief card */}
                  {msg.brief && (
                    <BriefCard
                      brief={msg.brief}
                      launched={launchedBriefs.has(msg.id)}
                      isExtend={msg.isExtend}
                      onLaunch={() => handleLaunch(msg.brief!, msg.id)}
                    />
                  )}

                  {/* Chips */}
                  {msg.chips && msg.chips.length > 0 && !msg.brief && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                      {msg.chips.map((chip) => (
                        <button
                          key={chip}
                          onClick={() => sendMessage(chip)}
                          disabled={loading || isRunning}
                          style={{
                            padding: "5px 12px", borderRadius: 20,
                            border: `1.5px solid ${PURPLE}30`,
                            background: "white", color: PURPLE,
                            fontSize: 12, fontWeight: 600,
                            cursor: loading || isRunning ? "not-allowed" : "pointer",
                            fontFamily: "var(--font-inter), sans-serif",
                            transition: "all 130ms",
                            opacity: loading || isRunning ? 0.5 : 1,
                          }}
                          onMouseEnter={(e) => {
                            if (!loading && !isRunning) {
                              e.currentTarget.style.background = PURPLE_LIGHT
                              e.currentTarget.style.borderColor = `${PURPLE}55`
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "white"
                            e.currentTarget.style.borderColor = `${PURPLE}30`
                          }}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </m.div>
            )
          })}

          {/* Typing indicator */}
          {loading && (
            <m.div
              key="typing"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}
            >
              <NawaAvatar size={22} />
              <div style={{
                padding: "10px 14px",
                borderRadius: "4px 16px 16px 16px",
                background: "#F5F3FF",
                display: "flex", gap: 5, alignItems: "center",
              }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: PURPLE, display: "inline-block",
                    animation: `chatBounce 1.2s ease-in-out ${i * 0.16}s infinite`,
                  }} />
                ))}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Input ──────────────────────────────────────────── */}
      <div style={{
        padding: "10px 14px 14px",
        borderTop: `1px solid ${PURPLE_LIGHT}`,
        flexShrink: 0,
        background: "white",
      }}>
        <div style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
          background: isFocused ? "#FDFCFF" : "#F8F5FF",
          borderRadius: 14,
          border: `1.5px solid ${isFocused ? PURPLE : "#E9E4F8"}`,
          padding: "9px 10px 9px 14px",
          transition: "border-color 180ms, background 180ms, box-shadow 180ms",
          boxShadow: isFocused ? `0 0 0 3px rgba(124,99,200,0.09)` : "none",
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={loading || isRunning}
            placeholder={isRunning ? "Recherche en cours…" : "Parlez-moi de votre besoin…"}
            rows={1}
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              resize: "none", fontSize: 13, color: "#111827",
              fontFamily: "var(--font-inter), sans-serif",
              lineHeight: 1.55, maxHeight: 110, overflow: "auto",
              opacity: isRunning ? 0.45 : 1,
            }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = "auto"
              el.style.height = `${Math.min(el.scrollHeight, 110)}px`
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!canSend}
            style={{
              flexShrink: 0, width: 32, height: 32, borderRadius: 10,
              border: "none", cursor: canSend ? "pointer" : "not-allowed",
              background: canSend
                ? `linear-gradient(135deg, ${PURPLE} 0%, #9B7FE8 100%)`
                : "#E9E4F8",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 150ms",
              boxShadow: canSend ? "0 2px 8px rgba(124,99,200,0.35)" : "none",
              transform: canSend ? "scale(1)" : "scale(0.9)",
            }}
            onMouseEnter={(e) => {
              if (canSend) e.currentTarget.style.transform = "scale(1.05)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = canSend ? "scale(1)" : "scale(0.9)"
            }}
          >
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <path d="M10 4v12M4 10l6-6 6 6" stroke="white" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <p style={{
          margin: "5px 0 0",
          fontSize: 10,
          color: "#C4B5FD",
          fontFamily: "var(--font-inter), sans-serif",
          textAlign: "center",
        }}>
          Entrée pour envoyer · Shift+Entrée pour sauter une ligne
        </p>
      </div>
    </div>
  )
})

export default BriefChat
