"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { m, AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import type { WorkspaceMsg } from "@/lib/database.types"

/* ── Types ───────────────────────────────────────────────────── */

export interface AttachedMission {
  id: string
  title: string
  color: string
}

interface Props {
  agentColor: string
  agentName: string
  firstName: string | null
  attachedMission: AttachedMission | null
  onAttachedMissionChange: (mission: AttachedMission | null) => void
  onMissionCreated?: (missionId: string) => void
}

/* ── Helpers ─────────────────────────────────────────────────── */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

function Avatar({ role }: { role: "user" | "assistant" }) {
  if (role === "user") {
    return (
      <div style={{
        width: 30, height: 30, borderRadius: "50%",
        background: "#E2DAF6",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 700, color: "#7C63C8", flexShrink: 0,
      }}>U</div>
    )
  }
  return (
    <div style={{
      width: 30, height: 30, borderRadius: "50%",
      background: "linear-gradient(135deg, #7C63C8 0%, #A78BFA 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 4, padding: "4px 0" }}>
      {[0, 1, 2].map((i) => (
        <m.div
          key={i}
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
          style={{
            width: 6, height: 6, borderRadius: "50%", background: "#9CA3AF",
          }}
        />
      ))}
    </div>
  )
}

function MissionChip({ mission, onRemove }: { mission: AttachedMission; onRemove: () => void }) {
  return (
    <m.div
      initial={{ opacity: 0, scale: 0.9, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.18 }}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: mission.color + "18",
        border: `1.5px solid ${mission.color}44`,
        borderRadius: 8, padding: "4px 10px 4px 8px",
        marginBottom: 6,
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: 2, background: mission.color }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", fontFamily: "var(--font-inter), sans-serif" }}>
        {mission.title}
      </span>
      <button
        onClick={onRemove}
        style={{
          width: 16, height: 16, borderRadius: 4, border: "none",
          background: "transparent", cursor: "pointer",
          color: "#9CA3AF", display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
          <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </m.div>
  )
}

/* ── Welcome state ───────────────────────────────────────────── */

function WelcomeState({
  firstName,
  agentColor,
  onNewMission,
  onContinueMission,
}: {
  firstName: string | null
  agentColor: string
  onNewMission: () => void
  onContinueMission: () => void
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "40px 24px", textAlign: "center",
      }}
    >
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: "linear-gradient(135deg, #7C63C8 0%, #A78BFA 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 24,
        boxShadow: "0 8px 32px rgba(124,99,200,0.25)",
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <h2 style={{
        fontSize: 22, fontWeight: 800, color: "#111827",
        margin: "0 0 8px",
        fontFamily: "var(--font-space-grotesk), sans-serif",
        letterSpacing: -0.3,
      }}>
        Bonjour{firstName ? `, ${firstName}` : ""} 👋
      </h2>
      <p style={{
        fontSize: 14, color: "#6B7280", margin: "0 0 32px", lineHeight: 1.6,
        maxWidth: 360, fontFamily: "var(--font-inter), sans-serif",
      }}>
        Je suis votre assistant sourcing. Que souhaitez-vous faire ?
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={onNewMission}
          style={{
            padding: "12px 24px", borderRadius: 12, border: "none",
            background: agentColor, color: "white",
            fontSize: 14, fontWeight: 700, cursor: "pointer",
            fontFamily: "var(--font-inter), sans-serif",
            boxShadow: `0 4px 16px ${agentColor}40`,
            transition: "transform 120ms, box-shadow 120ms",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = `0 8px 24px ${agentColor}50` }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = `0 4px 16px ${agentColor}40` }}
        >
          ✦ Démarrer une nouvelle mission
        </button>
        <button
          onClick={onContinueMission}
          style={{
            padding: "12px 24px", borderRadius: 12,
            border: "1.5px solid #E2DAF6", background: "white",
            fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#374151",
            fontFamily: "var(--font-inter), sans-serif",
            transition: "border-color 120ms, background 120ms",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = agentColor; e.currentTarget.style.background = "#F8F6FF" }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E2DAF6"; e.currentTarget.style.background = "white" }}
        >
          Continuer une mission existante →
        </button>
      </div>
    </m.div>
  )
}

/* ── Main component ──────────────────────────────────────────── */

export default function WorkspaceCentralChat({
  agentColor, agentName, firstName,
  attachedMission, onAttachedMissionChange,
  onMissionCreated,
}: Props) {
  const router = useRouter()
  const [messages, setMessages] = useState<WorkspaceMsg[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [isDragOver, setIsDragOver] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load message history
  useEffect(() => {
    fetch("/api/workspace/chat")
      .then((r) => r.json())
      .then((data: { messages: WorkspaceMsg[] }) => {
        setMessages(data.messages ?? [])
      })
      .catch(() => {})
      .finally(() => setInitialLoading(false))
  }, [])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px"
  }, [input])

  const sendMessage = useCallback(async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || loading) return

    const userMsg: WorkspaceMsg = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      ...(attachedMission ? { attachedMissionId: attachedMission.id, attachedMissionTitle: attachedMission.title } : {}),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setLoading(true)

    try {
      const res = await fetch("/api/workspace/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          attachedMissionId: attachedMission?.id,
          attachedMissionTitle: attachedMission?.title,
        }),
      })

      const data = await res.json() as {
        content: string
        action?: { type: string; missionId?: string; title?: string; brief?: string }
        compacted?: boolean
      }

      const assistantMsg: WorkspaceMsg = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.content,
      }
      setMessages((prev) => [...prev, assistantMsg])

      // Handle actions
      if (data.action?.type === "create_mission" && data.action.missionId) {
        onMissionCreated?.(data.action.missionId)
      }

      if (data.action?.type === "run_mission") {
        const mId = data.action.missionId ?? attachedMission?.id
        if (mId && mId !== "...") {
          // Trigger the run then navigate to mission page
          await fetch(`/api/missions/${mId}/run`, { method: "POST" })
          setTimeout(() => router.push(`/workspace/missions/${mId}`), 800)
        }
      }

      if (data.action?.type === "update_brief") {
        // Brief was saved — refresh missions list
        onMissionCreated?.("") // trigger a missions refresh
      }

      if (data.compacted) {
        const reloadRes = await fetch("/api/workspace/chat")
        const reloadData = await reloadRes.json() as { messages: WorkspaceMsg[] }
        setMessages(reloadData.messages ?? [])
      }
    } catch {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Désolé, une erreur est survenue. Veuillez réessayer.",
      }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, attachedMission, onMissionCreated, router])

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }
  const handleDragLeave = () => setIsDragOver(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const data = e.dataTransfer.getData("application/json")
    if (!data) return
    try {
      const mission = JSON.parse(data) as AttachedMission
      onAttachedMissionChange(mission)
    } catch { /* ignore */ }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const isEmpty = messages.length === 0 && !initialLoading

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: isDragOver ? "#F8F6FF" : "#FAFAFA",
        transition: "background 150ms",
        position: "relative",
        overflow: "hidden",
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {isDragOver && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "absolute", inset: 0, zIndex: 10,
              background: "rgba(124,99,200,0.06)",
              border: "2px dashed #7C63C8",
              borderRadius: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <div style={{
              background: "white", borderRadius: 14, padding: "16px 24px",
              boxShadow: "0 8px 32px rgba(124,99,200,0.18)",
              border: "1.5px solid #E2DAF6",
              fontSize: 14, fontWeight: 600, color: "#7C63C8",
              fontFamily: "var(--font-inter), sans-serif",
            }}>
              Déposer la mission ici
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* Messages area */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "24px 0 8px",
        display: "flex", flexDirection: "column",
      }}>
        {initialLoading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Spinner />
          </div>
        ) : isEmpty ? (
          <WelcomeState
            firstName={firstName}
            agentColor={agentColor}
            onNewMission={() => sendMessage("Je veux démarrer une nouvelle mission de recrutement.")}
            onContinueMission={() => sendMessage("Je veux continuer une mission existante.")}
          />
        ) : (
          <div style={{ maxWidth: 720, width: "100%", margin: "0 auto", padding: "0 24px" }}>
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <m.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  style={{
                    display: "flex",
                    gap: 12,
                    marginBottom: 20,
                    flexDirection: msg.role === "user" ? "row-reverse" : "row",
                  }}
                >
                  <Avatar role={msg.role} />
                  <div style={{ maxWidth: "78%", display: "flex", flexDirection: "column", gap: 4 }}>
                    {msg.attachedMissionTitle && (
                      <div style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        fontSize: 11, fontWeight: 600, color: "#7C63C8",
                        background: "#F0ECF8", borderRadius: 6, padding: "2px 8px",
                        marginBottom: 2, width: "fit-content",
                        fontFamily: "var(--font-inter), sans-serif",
                      }}>
                        📎 {msg.attachedMissionTitle}
                      </div>
                    )}
                    <div style={{
                      background: msg.role === "user" ? agentColor : "white",
                      color: msg.role === "user" ? "white" : "#111827",
                      borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                      padding: "12px 16px",
                      fontSize: 14, lineHeight: 1.6,
                      fontFamily: "var(--font-inter), sans-serif",
                      boxShadow: msg.role === "user" ? "none" : "0 1px 8px rgba(0,0,0,0.06)",
                      border: msg.role === "user" ? "none" : "1px solid #F0ECF8",
                      whiteSpace: "pre-wrap",
                    }}>
                      {msg.content}
                    </div>
                  </div>
                </m.div>
              ))}
            </AnimatePresence>

            {loading && (
              <m.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ display: "flex", gap: 12, marginBottom: 20 }}
              >
                <Avatar role="assistant" />
                <div style={{
                  background: "white", borderRadius: "18px 18px 18px 4px",
                  padding: "12px 16px",
                  boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
                  border: "1px solid #F0ECF8",
                }}>
                  <TypingDots />
                </div>
              </m.div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div style={{
        borderTop: "1px solid #F0ECF8",
        background: "white",
        padding: "16px 24px 20px",
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {/* Attached mission chip */}
          <AnimatePresence>
            {attachedMission && (
              <MissionChip
                mission={attachedMission}
                onRemove={() => onAttachedMissionChange(null)}
              />
            )}
          </AnimatePresence>

          <div style={{
            display: "flex", alignItems: "flex-end", gap: 10,
            background: "#F8F6FF", borderRadius: 16,
            border: "1.5px solid #E2DAF6",
            padding: "10px 10px 10px 16px",
            transition: "border-color 150ms, box-shadow 150ms",
          }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={attachedMission ? `Que voulez-vous faire avec "${attachedMission.title}" ?` : "Posez une question ou décrivez votre besoin…"}
              rows={1}
              style={{
                flex: 1, border: "none", background: "transparent",
                resize: "none", outline: "none",
                fontSize: 14, color: "#111827", lineHeight: 1.5,
                fontFamily: "var(--font-inter), sans-serif",
                minHeight: 24, maxHeight: 160,
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              style={{
                width: 36, height: 36, borderRadius: 10, border: "none",
                background: input.trim() && !loading ? agentColor : "#D1D5DB",
                cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, transition: "background 150ms",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <path d="M3 10l7-7 7 7M10 3v14" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="rotate(90 10 10)" />
              </svg>
            </button>
          </div>

          <p style={{
            margin: "8px 0 0", fontSize: 11, color: "#9CA3AF",
            fontFamily: "var(--font-inter), sans-serif", textAlign: "center",
          }}>
            Glissez un dossier-mission depuis le panneau de droite pour travailler dessus
          </p>
        </div>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" style={{ animation: "spin 0.8s linear infinite" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" stroke="#E2DAF6" strokeWidth="3" fill="none" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="#7C63C8" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  )
}
