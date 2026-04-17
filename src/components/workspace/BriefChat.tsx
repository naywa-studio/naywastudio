"use client"

/**
 * BriefChat — AI-guided brief collection chat
 * Always purple (#7C63C8) regardless of agent color.
 * agentColor is kept only for the agent badge reference.
 */

import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react"
import { m, AnimatePresence } from "framer-motion"
import type { MissionBrief } from "@/lib/database.types"

export interface BriefChatHandle {
  triggerExtend: () => void
}

const PURPLE = "#7C63C8"
const PURPLE_LIGHT = "#F0ECF8"
const PURPLE_MID = "rgba(124,99,200,0.12)"

interface ChatMsg {
  id: string
  role: "user" | "assistant"
  content: string
  brief?: MissionBrief
  chips?: string[]
  isExtend?: boolean  // flag for extend-search messages
}

interface BriefChatProps {
  missionId: string
  firstName: string | null
  agentColor: string   // kept for agent badge only
  agentName: string    // e.g. "Léo", "Nora"
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

/* ── Brief Card (purple always) ──────────────────────────────── */

function BriefCard({
  brief,
  onLaunch,
  launched,
  isExtend,
}: {
  brief: MissionBrief
  onLaunch: () => void
  launched: boolean
  isExtend?: boolean
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      style={{
        marginTop: 10,
        borderRadius: 14,
        border: `1.5px solid ${PURPLE}30`,
        background: "white",
        overflow: "hidden",
        boxShadow: "0 2px 16px rgba(124,99,200,0.1)",
      }}
    >
      {/* Colored top bar */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${PURPLE}, #A78BFA)` }} />

      {/* Header */}
      <div style={{ padding: "10px 14px 8px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14 }}>{isExtend ? "🔍" : "📋"}</span>
        <p style={{
          margin: 0, fontSize: 11, fontWeight: 700, color: PURPLE,
          textTransform: "uppercase", letterSpacing: "0.07em",
          fontFamily: "var(--font-inter), sans-serif",
        }}>
          {isExtend ? "Recherche étendue" : "Récapitulatif de recherche"}
        </p>
      </div>

      {/* Brief fields */}
      <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
        <BriefRow icon="💼" label={brief.titre_poste} />
        <BriefRow icon="📍" label={brief.localisation} />
        {Array.isArray(brief.mots_cles) && brief.mots_cles.length > 0 && (
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>🔑</span>
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
        {brief.criteres && <BriefRow icon="📋" label={brief.criteres} />}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "#F0ECF8", margin: "0 14px" }} />

      {/* Launch button */}
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
              width: "100%",
              padding: "10px 16px",
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
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
            {isExtend ? "🔍 Lancer la recherche étendue" : "🚀 Lancer la recherche"}
          </button>
        )}
      </div>
    </m.div>
  )
}

function BriefRow({ icon, label }: { icon: string; label: string }) {
  return (
    <div style={{ display: "flex", gap: 6, fontSize: 12, color: "#374151", fontFamily: "var(--font-inter), sans-serif", lineHeight: 1.5 }}>
      <span style={{ flexShrink: 0, fontSize: 13 }}>{icon}</span>
      <span>{label}</span>
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

  /* ── Auto-greet ───────────────────────────────────────────── */
  useEffect(() => {
    if (hasGreeted.current) return
    hasGreeted.current = true
    const name = firstName ? `, **${firstName}**` : ""
    setMessages([{
      id: uid(),
      role: "assistant",
      content: `Bonjour${name} ! 👋 Je suis votre assistant de sourcing.\n\nDécrivez-moi le poste que vous cherchez à pourvoir et je vous guiderai pour construire la recherche la plus précise possible sur LinkedIn.`,
    }])
  }, [firstName])

  /* ── Run completed notification ─────────────────────────── */
  useEffect(() => {
    if (
      completedCount !== undefined &&
      prevCompletedCount.current !== undefined &&
      completedCount !== prevCompletedCount.current
    ) {
      const count = completedCount
      setMessages((prev) => [...prev, {
        id: uid(),
        role: "assistant",
        content: `✅ **${count} profil${count > 1 ? "s" : ""} trouvé${count > 1 ? "s" : ""} !**\n\nConsultez les résultats dans le panneau à droite.\n\nVous souhaitez aller plus loin ?`,
        chips: ["🔍 Élargir la zone géo", "🎯 Critères alternatifs", "📈 Plus de profils"],
      }])
      scrollToBottom()
    }
    prevCompletedCount.current = completedCount
  }, [completedCount, scrollToBottom])

  /* ── Send message ──────────────────────────────────────── */
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading || isRunning) return

    const userMsg: ChatMsg = { id: uid(), role: "user", content: trimmed }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setLoading(true)
    scrollToBottom()

    // Reset textarea height
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

      // Detect extend search context
      const isExtend = Boolean(
        prevCompletedCount.current !== undefined &&
        (trimmed.toLowerCase().includes("élargi") ||
         trimmed.toLowerCase().includes("plus de profil") ||
         trimmed.toLowerCase().includes("alternatif") ||
         trimmed.toLowerCase().includes("plus large") ||
         trimmed === "🔍 Élargir la zone géo" ||
         trimmed === "🎯 Critères alternatifs" ||
         trimmed === "📈 Plus de profils")
      )

      setMessages((prev) => [...prev, {
        id: uid(),
        role: "assistant",
        content: displayContent,
        brief: brief ?? undefined,
        chips: chips.length > 0 ? chips : undefined,
        isExtend,
      }])
    } catch {
      setMessages((prev) => [...prev, {
        id: uid(),
        role: "assistant",
        content: "Une erreur de connexion est survenue. Réessayez dans un instant.",
      }])
    } finally {
      setLoading(false)
      scrollToBottom()
    }
  }, [messages, loading, isRunning, missionId, scrollToBottom])

  /* ── Expose triggerExtend to parent via ref ─────────────── */
  useImperativeHandle(ref, () => ({
    triggerExtend: () => sendMessage("📈 Plus de profils"),
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
      boxShadow: "0 4px 32px rgba(124,99,200,0.08)",
    }}>

      {/* Animated keyframes */}
      <style>{`
        @keyframes chatBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes chatPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{
        padding: "14px 18px",
        borderBottom: `1.5px solid ${PURPLE_LIGHT}`,
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexShrink: 0,
        background: "linear-gradient(135deg, #FDFCFF 0%, #F8F5FF 100%)",
      }}>
        {/* Purple avatar */}
        <div style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          background: `linear-gradient(135deg, ${PURPLE} 0%, #9B7FE8 100%)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          flexShrink: 0,
          boxShadow: `0 4px 12px rgba(124,99,200,0.3)`,
        }}>
          🤖
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 14, fontWeight: 700, color: "#111827",
            fontFamily: "var(--font-space-grotesk), sans-serif",
          }}>
            Assistant Nawa
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
              color: agentColor, background: `${agentColor}14`,
              border: `1px solid ${agentColor}30`,
              fontFamily: "var(--font-inter), sans-serif",
            }}>
              Agent {agentName}
            </span>
            <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
              Cadrage de recherche
            </span>
          </div>
        </div>

        {/* Running indicator */}
        {isRunning && (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%", background: "#22c55e",
              animation: "chatPulse 1.5s ease-in-out infinite",
            }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "#22c55e", fontFamily: "var(--font-inter), sans-serif" }}>
              En cours…
            </span>
          </div>
        )}
      </div>

      {/* ── Messages ───────────────────────────────────────── */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          scrollbarWidth: "thin",
          scrollbarColor: "#E2DAF6 transparent",
        }}
      >
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <m.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                alignItems: "flex-end",
                gap: 8,
              }}
            >
              {/* AI avatar dot */}
              {msg.role === "assistant" && (
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                  background: `linear-gradient(135deg, ${PURPLE} 0%, #9B7FE8 100%)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, marginBottom: 2,
                }}>
                  🤖
                </div>
              )}

              <div style={{ maxWidth: "84%", minWidth: 0 }}>
                {/* Bubble */}
                <div style={{
                  padding: "11px 14px",
                  borderRadius: msg.role === "user"
                    ? "16px 16px 4px 16px"
                    : "16px 16px 16px 4px",
                  background: msg.role === "user"
                    ? `linear-gradient(135deg, ${PURPLE} 0%, #9B7FE8 100%)`
                    : "#F8F5FF",
                  color: msg.role === "user" ? "white" : "#1F1535",
                  fontSize: 13,
                  lineHeight: 1.65,
                  fontFamily: "var(--font-inter), sans-serif",
                  whiteSpace: "pre-wrap",
                  boxShadow: msg.role === "user"
                    ? "0 3px 12px rgba(124,99,200,0.3)"
                    : "0 1px 4px rgba(0,0,0,0.04)",
                }}>
                  {renderContent(msg.content)}
                </div>

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
                          padding: "6px 12px",
                          borderRadius: 20,
                          border: `1.5px solid ${PURPLE}35`,
                          background: "white",
                          color: PURPLE,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: loading || isRunning ? "not-allowed" : "pointer",
                          fontFamily: "var(--font-inter), sans-serif",
                          transition: "all 130ms",
                          opacity: loading || isRunning ? 0.5 : 1,
                          boxShadow: "0 1px 4px rgba(124,99,200,0.08)",
                        }}
                        onMouseEnter={(e) => {
                          if (!loading && !isRunning) {
                            e.currentTarget.style.background = PURPLE_LIGHT
                            e.currentTarget.style.borderColor = `${PURPLE}60`
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "white"
                          e.currentTarget.style.borderColor = `${PURPLE}35`
                        }}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </m.div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <m.div
              key="typing"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{ display: "flex", alignItems: "flex-end", gap: 8 }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                background: `linear-gradient(135deg, ${PURPLE} 0%, #9B7FE8 100%)`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
              }}>🤖</div>
              <div style={{
                padding: "12px 16px",
                borderRadius: "16px 16px 16px 4px",
                background: "#F8F5FF",
                display: "flex",
                gap: 5,
                alignItems: "center",
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: PURPLE,
                    display: "inline-block",
                    animation: `chatBounce 1.3s ease-in-out ${i * 0.18}s infinite`,
                  }} />
                ))}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Input ──────────────────────────────────────────── */}
      <div style={{
        padding: "12px 14px 14px",
        borderTop: `1.5px solid ${PURPLE_LIGHT}`,
        flexShrink: 0,
        background: "white",
      }}>
        <div style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
          background: isFocused ? "#FDFCFF" : "#F8F5FF",
          borderRadius: 14,
          border: `1.5px solid ${isFocused ? PURPLE : PURPLE_LIGHT}`,
          padding: "9px 12px",
          transition: "border-color 200ms, background 200ms",
          boxShadow: isFocused ? `0 0 0 3px rgba(124,99,200,0.1)` : "none",
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={loading || isRunning}
            placeholder={isRunning ? "Recherche en cours…" : "Décrivez votre besoin… (↵ pour envoyer)"}
            rows={1}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              fontSize: 13,
              color: "#111827",
              fontFamily: "var(--font-inter), sans-serif",
              lineHeight: 1.55,
              maxHeight: 100,
              overflow: "auto",
              opacity: isRunning ? 0.45 : 1,
            }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = "auto"
              el.style.height = `${Math.min(el.scrollHeight, 100)}px`
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!canSend}
            style={{
              flexShrink: 0,
              width: 34,
              height: 34,
              borderRadius: 10,
              border: "none",
              cursor: canSend ? "pointer" : "not-allowed",
              background: canSend
                ? `linear-gradient(135deg, ${PURPLE} 0%, #9B7FE8 100%)`
                : "#E5E7EB",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 150ms",
              boxShadow: canSend ? "0 3px 10px rgba(124,99,200,0.35)" : "none",
              transform: canSend ? "scale(1)" : "scale(0.92)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path d="M4 10h12M11 5l5 5-5 5" stroke="white" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <p style={{
          margin: "6px 0 0",
          fontSize: 10,
          color: "#C4B5FD",
          fontFamily: "var(--font-inter), sans-serif",
          textAlign: "center",
        }}>
          Shift+↵ pour un saut de ligne
        </p>
      </div>
    </div>
  )
})

export default BriefChat
