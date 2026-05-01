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
  brief?: Record<string, unknown> | null
  status?: string
  profilesCount?: number
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

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

export const FOLDER_PALETTE = [
  "#7C63C8", "#0EA5E9", "#10B981", "#F59E0B",
  "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4",
  "#84CC16", "#F97316", "#6366F1", "#14B8A6",
]
export function titleToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return FOLDER_PALETTE[Math.abs(hash) % FOLDER_PALETTE.length]
}

function renderMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  )
}

/* ── Sub-components ──────────────────────────────────────────── */

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
      background: "#7C63C8",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M2 12V2l4 7 4-7v10" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
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
          style={{ width: 6, height: 6, borderRadius: "50%", background: "#9CA3AF" }}
        />
      ))}
    </div>
  )
}

/** Chip flottant affiché dans l'input quand une mission est attachée */
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
        aria-label="Détacher la mission"
        style={{
          width: 16, height: 16, borderRadius: 4, border: "none",
          background: "transparent", cursor: "pointer",
          color: "#9CA3AF", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
          <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </m.div>
  )
}

/** Carte de notification inline (mission créée / recherche lancée) */
function ActionCard({
  type, title, color, missionId, onLaunch, launching,
}: {
  type: "mission_created" | "search_launched"
  title: string
  color: string
  missionId?: string
  onLaunch?: (id: string) => void
  launching?: boolean
}) {
  const isMission = type === "mission_created"

  return (
    <m.div
      initial={{ opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: EASE }}
      style={{
        display: "flex", flexDirection: "column", gap: 8,
        background: isMission ? color + "10" : "rgba(34,197,94,0.07)",
        border: `1.5px solid ${isMission ? color + "30" : "rgba(34,197,94,0.22)"}`,
        borderRadius: 12, padding: "10px 14px",
        marginTop: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* SVG icon — no emojis */}
        <span style={{
          width: 22, height: 22, borderRadius: 7, flexShrink: 0,
          background: isMission ? color + "20" : "rgba(34,197,94,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {isMission ? (
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
              <path d="M2 6C2 4.9 2.9 4 4 4h4l2 2h6c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6z"
                stroke={color} strokeWidth="1.6" fill="none" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
              <circle cx="9" cy="9" r="6" stroke="#16a34a" strokeWidth="1.6"/>
              <path d="M13.5 13.5L17 17" stroke="#16a34a" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          )}
        </span>
        <div>
          <p style={{
            margin: 0, fontSize: 11, fontWeight: 700,
            color: isMission ? color : "#16a34a",
            fontFamily: "var(--font-inter), sans-serif",
            textTransform: "uppercase", letterSpacing: "0.06em",
          }}>
            {isMission ? "Dossier créé" : "Recherche lancée"}
          </p>
          <p style={{
            margin: 0, fontSize: 12, color: "#374151",
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            {title}
          </p>
        </div>
      </div>

      {/* CTA direct — uniquement sur mission_created */}
      {isMission && missionId && onLaunch && (
        <button
          onClick={() => onLaunch(missionId)}
          disabled={launching}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "8px 14px", borderRadius: 9, border: "none",
            background: launching ? "#D1D5DB" : color,
            color: "white", fontSize: 12, fontWeight: 700,
            cursor: launching ? "not-allowed" : "pointer",
            fontFamily: "var(--font-inter), sans-serif",
            transition: "background 150ms",
            width: "100%",
          }}
        >
          {launching ? (
            <>
              <Spinner size={12} color="rgba(255,255,255,0.7)" />
              Lancement en cours…
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                <path d="M6 4l10 6-10 6V4z" fill="currentColor"/>
              </svg>
              Lancer la recherche
            </>
          )}
        </button>
      )}
    </m.div>
  )
}

/** État vide — première ouverture */
function WelcomeState({
  firstName, agentColor, onNewMission,
}: {
  firstName: string | null
  agentColor: string
  onNewMission: () => void
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
      {/* Icon — solid, no gradient, no glow */}
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: agentColor,
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 20,
      }}>
        <svg width="22" height="22" viewBox="0 0 14 14" fill="none">
          <path d="M2 12V2l4 7 4-7v10" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      <h2 style={{
        fontSize: 20, fontWeight: 800, color: "#111827",
        margin: "0 0 8px",
        fontFamily: "var(--font-space-grotesk), sans-serif",
        letterSpacing: -0.3,
      }}>
        Bonjour{firstName ? `, ${firstName}` : ""} 👋
      </h2>
      <p style={{
        fontSize: 14, color: "#6B7280", margin: "0 0 28px", lineHeight: 1.6,
        maxWidth: 340, fontFamily: "var(--font-inter), sans-serif",
      }}>
        Décrivez votre besoin de recrutement — ou attachez une mission existante depuis le panneau de droite.
      </p>

      <button
        onClick={onNewMission}
        style={{
          padding: "11px 24px", borderRadius: 12, border: "none",
          background: agentColor, color: "white",
          fontSize: 14, fontWeight: 700, cursor: "pointer",
          fontFamily: "var(--font-inter), sans-serif",
          boxShadow: `0 4px 16px ${agentColor}35`,
          transition: "transform 120ms, box-shadow 120ms",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = `0 8px 24px ${agentColor}45` }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = `0 4px 16px ${agentColor}35` }}
      >
        ✦ Nouvelle mission
      </button>
    </m.div>
  )
}

/* ── Reset confirm popover ───────────────────────────────────── */

function ResetConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <m.div
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -4 }}
      transition={{ duration: 0.15, ease: EASE }}
      style={{
        position: "absolute", top: 44, right: 16, zIndex: 20,
        background: "white", borderRadius: 12,
        border: "1.5px solid #F0ECF8",
        boxShadow: "0 8px 32px rgba(0,0,0,0.10)",
        padding: "12px 14px",
        minWidth: 220,
      }}
    >
      <p style={{
        margin: "0 0 10px", fontSize: 13, color: "#111827", fontWeight: 600,
        fontFamily: "var(--font-inter), sans-serif",
      }}>
        Effacer la conversation ?
      </p>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1, padding: "7px 0", borderRadius: 8,
            border: "1.5px solid #E5E7EB", background: "white",
            fontSize: 12, fontWeight: 600, color: "#374151",
            cursor: "pointer", fontFamily: "var(--font-inter), sans-serif",
          }}
        >
          Annuler
        </button>
        <button
          onClick={onConfirm}
          style={{
            flex: 1, padding: "7px 0", borderRadius: 8,
            border: "none", background: "#EF4444",
            fontSize: 12, fontWeight: 700, color: "white",
            cursor: "pointer", fontFamily: "var(--font-inter), sans-serif",
          }}
        >
          Effacer
        </button>
      </div>
    </m.div>
  )
}

/* ── Extended message type (UI only) ─────────────────────────── */

interface UIMsg extends WorkspaceMsg {
  actionCard?: {
    type: "mission_created" | "search_launched"
    title: string
    color: string
    missionId?: string
  }
}

/* ── Main component ──────────────────────────────────────────── */

export default function WorkspaceCentralChat({
  agentColor, agentName, firstName,
  attachedMission, onAttachedMissionChange,
  onMissionCreated,
}: Props) {
  const router = useRouter()
  const [messages, setMessages] = useState<UIMsg[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [isDragOver, setIsDragOver] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [launchingMissionId, setLaunchingMissionId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load message history on mount
  useEffect(() => {
    fetch("/api/workspace/chat")
      .then((r) => r.json())
      .then((data: { messages: WorkspaceMsg[] }) => {
        setMessages(data.messages ?? [])
      })
      .catch(() => {})
      .finally(() => setInitialLoading(false))
  }, [])

  // Auto-scroll to bottom
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

  // Close reset confirm when clicking outside
  useEffect(() => {
    if (!showResetConfirm) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest("[data-reset-zone]")) setShowResetConfirm(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showResetConfirm])

  /* ── Extension dispatch ───────────────────────────────────── */
  /**
   * Tries to launch the search via the Chrome extension worker.
   * Returns true on ACK (extension installed + accepted), false on timeout
   * (extension not installed, blocked, or refused).
   */
  /**
   * Returns:
   *   "ok"            — Léo done server-side, or Nora handed off to extension
   *   "no-extension"  — Nora needed but extension not detected
   *   "no-results"    — search returned 0 LinkedIn profiles
   *   "server-error"  — /launch-extension itself failed (quota, no brief, etc.)
   */
  type LaunchOutcome =
    | { kind: "ok" }
    | { kind: "no-extension" }
    | { kind: "no-results"; error?: string }
    | { kind: "server-error"; error?: string }

  const launchMission = useCallback(async (mId: string): Promise<LaunchOutcome> => {
    // 1. Server prepares mission + queries (sets status=in_progress)
    let data: {
      ok?: boolean
      missionId?: string
      level?: "leo" | "nora"
      brief?: { titre_poste: string; localisation: string; criteres: string; mots_cles: string[] }
      queries?: string[]
      error?: string
    }
    try {
      const res = await fetch(`/api/missions/${mId}/launch-extension`, { method: "POST" })
      data = await res.json()
      if (!res.ok || !data.ok || !data.queries?.length || !data.brief || !data.missionId) {
        console.warn("[chat] launch http error:", res.status, data?.error)
        return { kind: "server-error", error: data?.error }
      }
    } catch (e) {
      console.warn("[chat] launch network error:", e)
      return { kind: "server-error" }
    }

    // 2. Try extension first (silent fetch from user's browser, no tab)
    const extPayload = {
      missionId: data.missionId,
      brief:     data.brief,
      queries:   data.queries,
      level:     data.level || "leo",
    }
    const extOk = await new Promise<boolean>((resolve) => {
      let settled = false
      const handler = (event: MessageEvent) => {
        if (event.source !== window) return
        const d = event.data as { source?: string; type?: string; ok?: boolean }
        if (d?.source !== "nawa-extension") return
        if (d.type === "RUN_SEARCH_ACK") {
          settled = true
          window.removeEventListener("message", handler)
          resolve(!!d.ok)
        }
      }
      window.addEventListener("message", handler)
      window.postMessage(
        { source: "nawa-page", type: "RUN_SEARCH", payload: extPayload },
        window.location.origin
      )
      setTimeout(() => {
        if (!settled) {
          window.removeEventListener("message", handler)
          resolve(false)
        }
      }, 4000)
    })

    if (extOk) return { kind: "ok" }

    // 3. No extension → fall back to server-side Custom Search API
    try {
      const res = await fetch(`/api/missions/${mId}/run-server-search`, { method: "POST" })
      const fb = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) return { kind: "server-error", error: fb?.error }
      if (!fb.ok) {
        if (fb.error && /aucun profil/i.test(fb.error)) return { kind: "no-results", error: fb.error }
        return { kind: "server-error", error: fb.error }
      }
      return { kind: "ok" }
    } catch (e) {
      console.warn("[chat] fallback search error:", e)
      return { kind: "server-error" }
    }
  }, [])

  /* ── Direct launch (from ActionCard CTA) ──────────────────── */
  const handleLaunch = useCallback(async (mId: string) => {
    setLaunchingMissionId(mId)
    const outcome = await launchMission(mId)
    if (outcome.kind === "no-extension") {
      alert("Extension Nawa non détectée — Nora a besoin de l'extension installée pour enrichir les profils LinkedIn.")
    } else if (outcome.kind === "no-results") {
      alert(outcome.error || "Aucun profil LinkedIn trouvé pour ce brief. Affinez les mots-clés et relancez.")
    } else if (outcome.kind === "server-error") {
      alert(outcome.error || "Erreur lors du lancement. Vérifie ton quota mensuel ou réessaie.")
    }
    router.push(`/workspace/missions/${mId}`)
  }, [router, launchMission])

  const sendMessage = useCallback(async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || loading) return

    const userMsg: UIMsg = {
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
        action?: { type: string; missionId?: string; title?: string; brief?: unknown }
        compacted?: boolean
      }

      const assistantMsg: UIMsg = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.content,
      }

      // ── create_mission ─────────────────────────────────────
      if (data.action?.type === "create_mission" && data.action.missionId) {
        const mId    = data.action.missionId
        const mTitle = (data.action.title as string | undefined) ?? "Nouvelle mission"
        const color  = titleToColor(mTitle)

        // Brief is embedded — show CTA "Lancer" directly
        assistantMsg.actionCard = { type: "mission_created", title: mTitle, color, missionId: mId }

        onAttachedMissionChange({ id: mId, title: mTitle, color })
        onMissionCreated?.(mId)
        setMessages((prev) => [...prev, assistantMsg])
        setLoading(false)
        return
      }

      // ── run_mission ────────────────────────────────────────
      if (data.action?.type === "run_mission") {
        const rawMId      = data.action.missionId as string | undefined
        const isPlaceholder = !rawMId || !rawMId.includes("-") || rawMId.includes("CONTEXTE") || rawMId.includes("COLLER") || rawMId.includes("EXACT") || rawMId.includes("UUID") || rawMId === "..."
        const mId = isPlaceholder ? attachedMission?.id : rawMId
        if (mId) {
          const mTitle = attachedMission?.title ?? agentName
          assistantMsg.actionCard = { type: "search_launched", title: mTitle, color: "#22c55e" }
          setMessages((prev) => [...prev, assistantMsg])
          setLoading(false)

          // Server runs the search via Custom Search API; for Nora the
          // extension is invoked afterwards to enrich LinkedIn profiles.
          const outcome = await launchMission(mId)
          if (outcome.kind === "server-error") {
            setMessages((prev) => [...prev, {
              id: crypto.randomUUID(),
              role: "assistant",
              content: "❌ " + (outcome.error || "Impossible de lancer la recherche. Vérifie ton quota mensuel ou réessaie."),
            }])
            return
          }
          if (outcome.kind === "no-results") {
            setMessages((prev) => [...prev, {
              id: crypto.randomUUID(),
              role: "assistant",
              content: "🔍 " + (outcome.error || "Aucun profil LinkedIn trouvé pour ce brief. Reformule avec des mots-clés plus larges et réessaie."),
            }])
            router.push(`/workspace/missions/${mId}`)
            return
          }
          if (outcome.kind === "no-extension") {
            setMessages((prev) => [...prev, {
              id: crypto.randomUUID(),
              role: "assistant",
              content: "⚠️ Nora a besoin de l'extension Nawa Studio pour enrichir les profils LinkedIn. Recharge-la dans **chrome://extensions** puis recharge la page.",
            }])
            router.push(`/workspace/missions/${mId}`)
            return
          }
          router.push(`/workspace/missions/${mId}`)
          return
        }
      }

      setMessages((prev) => [...prev, assistantMsg])

      // ── update_brief ───────────────────────────────────────
      if (data.action?.type === "update_brief") {
        onMissionCreated?.("")
      }

      // ── Compaction: reload messages ────────────────────────
      if (data.compacted) {
        const reloadRes  = await fetch("/api/workspace/chat")
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
  }, [input, loading, attachedMission, onAttachedMissionChange, onMissionCreated, router, agentName, launchMission])

  // Drag & drop handlers
  const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true) }
  const handleDragLeave = () => setIsDragOver(false)
  const handleDrop      = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    try {
      const mission = JSON.parse(e.dataTransfer.getData("application/json")) as AttachedMission
      onAttachedMissionChange(mission)
    } catch { /* ignore */ }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const isEmpty = messages.length === 0 && !initialLoading

  const handleReset = useCallback(async () => {
    setShowResetConfirm(false)
    setMessages([])
    onAttachedMissionChange(null)
    await fetch("/api/workspace/chat", { method: "DELETE" }).catch(() => {})
  }, [onAttachedMissionChange])

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
              background: "rgba(124,99,200,0.05)",
              border: "1.5px solid #D4CAEF",
              display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <div style={{
              background: "white", borderRadius: 14, padding: "14px 22px",
              boxShadow: "0 4px 20px rgba(124,99,200,0.12)",
              border: "1.5px solid #E2DAF6",
              fontSize: 13, fontWeight: 600, color: "#7C63C8",
              fontFamily: "var(--font-inter), sans-serif",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                <path d="M2 6C2 4.9 2.9 4 4 4h4l2 2h6c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6z"
                  stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinejoin="round"/>
              </svg>
              Déposer la mission ici
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* Reset button — visible only when conversation has started */}
      <AnimatePresence>
        {!isEmpty && !initialLoading && (
          <m.div
            data-reset-zone
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: EASE }}
            style={{ position: "absolute", top: 12, right: 16, zIndex: 5 }}
          >
            <button
              onClick={() => setShowResetConfirm((v) => !v)}
              aria-label="Nouvelle conversation"
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 10px", borderRadius: 8,
                border: "1px solid #E5E7EB", background: "white",
                fontSize: 11, fontWeight: 600, color: "#9CA3AF",
                cursor: "pointer", fontFamily: "var(--font-inter), sans-serif",
                transition: "border-color 150ms, color 150ms, background 150ms",
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#7C63C8"
                e.currentTarget.style.color = "#7C63C8"
                e.currentTarget.style.background = "#F8F6FF"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#E5E7EB"
                e.currentTarget.style.color = "#9CA3AF"
                e.currentTarget.style.background = "white"
              }}
            >
              <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
                <path d="M4 4v5h5M16 16v-5h-5M4.93 14.07A8 8 0 1 0 5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Nouvelle conversation
            </button>

            <AnimatePresence>
              {showResetConfirm && (
                <ResetConfirm
                  onConfirm={handleReset}
                  onCancel={() => setShowResetConfirm(false)}
                />
              )}
            </AnimatePresence>
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
            <Spinner size={28} />
          </div>
        ) : isEmpty ? (
          <WelcomeState
            firstName={firstName}
            agentColor={agentColor}
            onNewMission={() => sendMessage("Je veux lancer une nouvelle recherche de profils.")}
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
                  <div style={{ maxWidth: "78%", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                    {/* Mission attachment label */}
                    {msg.attachedMissionTitle && (
                      <div style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        fontSize: 11, fontWeight: 600, color: "#7C63C8",
                        background: "#F0ECF8", borderRadius: 6, padding: "2px 8px",
                        marginBottom: 2, width: "fit-content",
                        fontFamily: "var(--font-inter), sans-serif",
                      }}>
                        <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
                          <path d="M2 6C2 4.9 2.9 4 4 4h4l2 2h6c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6z"
                            stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinejoin="round"/>
                        </svg>
                        {msg.attachedMissionTitle}
                      </div>
                    )}

                    {/* Bubble */}
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
                      {renderMarkdown(msg.content)}
                    </div>

                    {/* Action card */}
                    {msg.actionCard && (
                      <ActionCard
                        type={msg.actionCard.type}
                        title={msg.actionCard.title}
                        color={msg.actionCard.color}
                        missionId={msg.actionCard.missionId}
                        onLaunch={handleLaunch}
                        launching={launchingMissionId === msg.actionCard.missionId}
                      />
                    )}
                  </div>
                </m.div>
              ))}
            </AnimatePresence>

            {/* Typing indicator */}
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
        padding: "14px 24px 18px",
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
          }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                attachedMission
                  ? `Que voulez-vous faire avec "${attachedMission.title}" ?`
                  : "Décrivez votre besoin de recrutement…"
              }
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
              aria-label="Envoyer"
              style={{
                width: 36, height: 36, borderRadius: 10, border: "none",
                background: input.trim() && !loading ? agentColor : "#D1D5DB",
                cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, transition: "background 150ms",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <path d="M10 4v12M4 10l6-6 6 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <p style={{
            margin: "7px 0 0", fontSize: 11, color: "#B0B7C3",
            fontFamily: "var(--font-inter), sans-serif", textAlign: "center",
          }}>
            Glissez un dossier depuis le panneau de droite · Entrée pour envoyer
          </p>
        </div>
      </div>
    </div>
  )
}

/* ── Spinner ─────────────────────────────────────────────────── */

export function Spinner({ size = 24, color = "#7C63C8" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: "spin 0.8s linear infinite" }}>
      <circle cx="12" cy="12" r="10" stroke="#E2DAF6" strokeWidth="3" fill="none" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  )
}
