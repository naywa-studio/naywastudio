"use client"

import { useState, useEffect, useCallback } from "react"
import { m, AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { getSupabase } from "@/lib/supabase"
import { AGENT_LEVELS } from "@/lib/mock-store"
import { useWorkspace } from "./layout"
import ProvisioningScreen from "@/components/workspace/ProvisioningScreen"
import WorkspaceCentralChat from "@/components/workspace/WorkspaceCentralChat"
import type { Database } from "@/lib/database.types"

type Mission = Database["public"]["Tables"]["missions"]["Row"]

/* ── Auto-color from title ──────────────────────────────────── */

const FOLDER_PALETTE = [
  "#7C63C8", "#0EA5E9", "#10B981", "#F59E0B",
  "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4",
  "#84CC16", "#F97316", "#6366F1", "#14B8A6",
]

export function titleToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return FOLDER_PALETTE[Math.abs(hash) % FOLDER_PALETTE.length]
}

/* ── Folder SVG icon ─────────────────────────────────────────── */

function FolderIcon({ color, size = 48 }: { color: string; size?: number }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 0.78)}
      viewBox="0 0 80 62"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2 18C2 14.686 4.686 12 8 12H28L34 6H72C75.314 6 78 8.686 78 12V18H2Z"
        fill={color} opacity="0.35"
      />
      <rect x="2" y="18" width="76" height="42" rx="7" fill={color} opacity="0.18" />
      <rect x="2" y="18" width="76" height="42" rx="7" stroke={color} strokeWidth="2" fill="none" opacity="0.55" />
      <rect x="10" y="24" width="24" height="3" rx="1.5" fill={color} opacity="0.25" />
    </svg>
  )
}

/* ── Status meta ─────────────────────────────────────────────── */

const STATUS_META: Record<Mission["status"], { label: string; color: string }> = {
  preparation: { label: "Préparation", color: "#F59E0B" },
  in_progress: { label: "En cours",    color: "#22c55e" },
  completed:   { label: "Terminée",    color: "#6B7280" },
  error:       { label: "Erreur",      color: "#EF4444" },
}

/* ── Delete dialog ───────────────────────────────────────────── */

function DeleteDialog({
  mission, onConfirm, onCancel, isDeleting,
}: {
  mission: Mission; onConfirm: () => void; onCancel: () => void; isDeleting?: boolean
}) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <m.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        style={{
          background: "white", borderRadius: 18, padding: "28px 28px 22px",
          maxWidth: 400, width: "100%",
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)", border: "1.5px solid #F0ECF8",
        }}
      >
        <p style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800, color: "#111827", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
          Supprimer cette mission ?
        </p>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6B7280", lineHeight: 1.6, fontFamily: "var(--font-inter), sans-serif" }}>
          <strong style={{ color: "#111827" }}>&ldquo;{mission.title}&rdquo;</strong> sera supprimée
          définitivement avec tous ses profils. Cette action est irréversible.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "9px 18px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "white", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer", fontFamily: "var(--font-inter), sans-serif" }}>
            Annuler
          </button>
          <button onClick={onConfirm} disabled={isDeleting} style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: "#EF4444", fontSize: 13, fontWeight: 700, color: "white", cursor: isDeleting ? "not-allowed" : "pointer", fontFamily: "var(--font-inter), sans-serif", opacity: isDeleting ? 0.65 : 1 }}>
            {isDeleting ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      </m.div>
    </div>
  )
}

/* ── Mission folder card (right panel) ───────────────────────── */

function MissionFolderCard({
  mission, index, onDelete, agentColor,
}: {
  mission: Mission; index: number; onDelete: () => void; agentColor: string
}) {
  const [hovered, setHovered] = useState(false)
  const color = titleToColor(mission.title)
  const status = STATUS_META[mission.status]
  const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/json", JSON.stringify({
      id: mission.id,
      title: mission.title,
      color,
    }))
    e.dataTransfer.effectAllowed = "copy"
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: "relative" }}
    >
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3, delay: index * 0.04, ease: EASE }}
      style={{ position: "relative" }}
    >
      <Link href={`/workspace/missions/${mission.id}`} style={{ textDecoration: "none", display: "block" }}>
        <div style={{
          background: "white",
          borderRadius: 14,
          border: `1.5px solid ${hovered ? color + "55" : "#F0ECF8"}`,
          padding: "16px 12px 14px",
          display: "flex", flexDirection: "column",
          alignItems: "center", gap: 8,
          transition: "border-color 180ms, box-shadow 180ms, transform 180ms",
          transform: hovered ? "translateY(-2px)" : "translateY(0)",
          boxShadow: hovered ? `0 6px 20px ${color}18` : "none",
          cursor: "grab",
          minHeight: 130,
        }}>
          <div style={{ position: "relative" }}>
            <FolderIcon color={color} size={48} />
            <span style={{
              position: "absolute", bottom: 2, right: -2,
              width: 8, height: 8, borderRadius: "50%",
              background: status.color, border: "2px solid white",
            }} />
          </div>
          <p style={{
            margin: 0, fontSize: 11, fontWeight: 600, color: "#111827",
            fontFamily: "var(--font-inter), sans-serif",
            textAlign: "center", lineHeight: 1.35,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as const,
            overflow: "hidden",
            wordBreak: "break-word",
            width: "100%",
          }}>
            {mission.title}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: status.color }} />
            <p style={{ margin: 0, fontSize: 10, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
              {status.label}
            </p>
          </div>
        </div>
      </Link>

      <AnimatePresence>
        {hovered && (
          <m.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.12 }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete() }}
            title="Supprimer"
            style={{
              position: "absolute", top: 6, right: 6,
              width: 22, height: 22, borderRadius: 6,
              border: "1px solid #FCA5A5", background: "white",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "#EF4444",
              boxShadow: "0 2px 8px rgba(239,68,68,0.12)", zIndex: 2,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </m.button>
        )}
      </AnimatePresence>
    </m.div>
    </div>
  )
}

/* ── New mission inline form ─────────────────────────────────── */

function NewMissionForm({
  agentColor, onCreate, onCancel,
}: {
  agentColor: string; onCreate: (title: string) => void; onCancel: () => void
}) {
  const [title, setTitle] = useState("")
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!title.trim()) return
    setCreating(true)
    await onCreate(title.trim())
    setCreating(false)
  }

  return (
    <m.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      style={{ overflow: "hidden", marginBottom: 12 }}
    >
      <div style={{
        background: "white", borderRadius: 12,
        border: `1.5px solid ${agentColor}44`, padding: "12px",
      }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") onCancel() }}
          placeholder="Nom de la mission…"
          autoFocus
          style={{
            width: "100%", padding: "8px 10px", borderRadius: 8,
            border: "1.5px solid #E5E7EB", fontSize: 12, color: "#111827",
            outline: "none", fontFamily: "var(--font-inter), sans-serif",
            boxSizing: "border-box", marginBottom: 8,
          }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || creating}
            style={{
              flex: 1, padding: "7px 0", borderRadius: 8, border: "none",
              background: title.trim() ? agentColor : "#D1D5DB",
              fontSize: 11, fontWeight: 700, color: "white",
              cursor: title.trim() && !creating ? "pointer" : "not-allowed",
              fontFamily: "var(--font-inter), sans-serif",
            }}
          >
            {creating ? "…" : "Créer →"}
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: "7px 12px", borderRadius: 8,
              border: "1px solid #E5E7EB", background: "transparent",
              fontSize: 11, color: "#6B7280", cursor: "pointer",
              fontFamily: "var(--font-inter), sans-serif",
            }}
          >
            ✕
          </button>
        </div>
      </div>
    </m.div>
  )
}

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

/* ── Main page ───────────────────────────────────────────────── */

export default function WorkspacePage() {
  const router = useRouter()
  const { profile, userEmail, agentLevel, hasSubscription, isProvisioning, refetchProfile } = useWorkspace()
  const agent = AGENT_LEVELS[agentLevel] ?? AGENT_LEVELS[1]

  const [missions, setMissions] = useState<Mission[]>([])
  const [loadingMissions, setLoadingMissions] = useState(true)
  const [showNewForm, setShowNewForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Mission | null>(null)
  const [deleting, setDeleting] = useState(false)

  const firstName = profile?.first_name ?? userEmail.split("@")[0]

  const fetchMissions = useCallback(async () => {
    const { data } = await getSupabase()
      .from("missions")
      .select("*")
      .order("created_at", { ascending: false })
    setMissions(data ?? [])
    setLoadingMissions(false)
  }, [])

  useEffect(() => { fetchMissions() }, [fetchMissions])

  const handleCreate = async (title: string) => {
    const sb = getSupabase()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    const agentLevelMap: Record<number, "leo" | "nora"> = { 1: "leo", 2: "nora", 3: "nora" }
    const missionAgentLevel = agentLevelMap[agentLevel] ?? "leo"
    const { data } = await sb
      .from("missions")
      .insert({ title, user_id: user.id, agent_level: missionAgentLevel })
      .select().single()
    if (data) {
      setShowNewForm(false)
      router.push(`/workspace/missions/${data.id}`)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await fetch(`/api/missions/${deleteTarget.id}`, { method: "DELETE" })
      setMissions((prev) => prev.filter((m) => m.id !== deleteTarget.id))
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  // Provisioning in progress
  if (isProvisioning && profile?.subscription_level) {
    return (
      <ProvisioningScreen
        initialVpsStatus={profile.vps_status ?? "pending"}
        initialAgentStatus={profile.agent_status ?? "not_deployed"}
        agentLevel={profile.subscription_level}
        onReady={refetchProfile}
      />
    )
  }

  // No subscription
  if (!hasSubscription) {
    return (
      <main style={{
        minHeight: "calc(100vh - 60px)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "40px 24px", textAlign: "center",
      }}>
        <m.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          style={{ maxWidth: 480 }}
        >
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: "#F8F6FF", border: "1.5px solid #E2DAF6",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 32, margin: "0 auto 28px",
          }}>🤖</div>
          <h1 style={{ fontSize: "clamp(22px, 4vw, 32px)", fontWeight: 800, color: "#111827", margin: "0 0 12px", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
            Bonjour{firstName ? `, ${firstName}` : ""} 👋
          </h1>
          <p style={{ fontSize: 16, color: "#6B7280", lineHeight: 1.65, margin: "0 0 36px", fontFamily: "var(--font-inter), sans-serif" }}>
            Votre espace est prêt. Choisissez un agent pour commencer à sourcer vos premiers candidats.
          </p>
          <Link href="/packages" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "16px 32px", borderRadius: 14,
            background: "#7C63C8", color: "white",
            fontSize: 16, fontWeight: 700, textDecoration: "none",
            fontFamily: "var(--font-space-grotesk), sans-serif",
            boxShadow: "0 8px 32px rgba(124,99,200,0.28)",
          }}>
            Trouver mon agent !
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </m.div>
      </main>
    )
  }

  // ── Main workspace layout ─────────────────────────────────────────────────

  return (
    <div style={{
      display: "flex",
      height: "calc(100vh - 60px)",
      overflow: "hidden",
    }}>
      {/* ── Left: Central Chat ─────────────────────────────────────────────── */}
      <WorkspaceCentralChat
        agentColor={agent.color}
        agentName={agent.agent}
        firstName={firstName}
        onMissionCreated={(id) => {
          fetchMissions()
        }}
      />

      {/* ── Right: Missions panel ──────────────────────────────────────────── */}
      <div style={{
        width: 320,
        flexShrink: 0,
        borderLeft: "1px solid #F0ECF8",
        background: "white",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}>
        {/* Panel header */}
        <div style={{
          padding: "16px 16px 12px",
          borderBottom: "1px solid #F0ECF8",
          display: "flex", alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <h2 style={{
            margin: 0, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.08em", textTransform: "uppercase",
            color: "#6B7280", fontFamily: "var(--font-inter), sans-serif",
          }}>
            Missions{missions.length > 0 ? ` · ${missions.length}` : ""}
          </h2>
          <button
            onClick={() => setShowNewForm((v) => !v)}
            style={{
              fontSize: 11, fontWeight: 700, color: "white",
              background: agent.color, border: "none", borderRadius: 8,
              padding: "5px 10px", cursor: "pointer",
              fontFamily: "var(--font-inter), sans-serif",
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Nouvelle
          </button>
        </div>

        {/* Scrollable missions grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
          {/* New mission form */}
          <AnimatePresence>
            {showNewForm && (
              <NewMissionForm
                agentColor={agent.color}
                onCreate={handleCreate}
                onCancel={() => setShowNewForm(false)}
              />
            )}
          </AnimatePresence>

          {loadingMissions ? (
            <div style={{ padding: "40px 0", display: "flex", justifyContent: "center" }}>
              <Spinner />
            </div>
          ) : missions.length === 0 && !showNewForm ? (
            <div style={{ padding: "40px 12px", textAlign: "center" }}>
              <FolderIcon color={agent.color} size={40} />
              <p style={{ margin: "12px 0 0", fontSize: 12, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
                Aucune mission.<br />Demandez à l&apos;IA d&apos;en créer une.
              </p>
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}>
              <AnimatePresence>
                {missions.map((mission, i) => (
                  <MissionFolderCard
                    key={mission.id}
                    mission={mission}
                    index={i}
                    agentColor={agent.color}
                    onDelete={() => setDeleteTarget(mission)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Panel footer — drag hint */}
        <div style={{
          padding: "10px 16px",
          borderTop: "1px solid #F0ECF8",
          flexShrink: 0,
        }}>
          <p style={{
            margin: 0, fontSize: 10, color: "#C4B5E8", textAlign: "center",
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            Glissez un dossier dans le chat →
          </p>
        </div>
      </div>

      {/* Delete dialog */}
      <AnimatePresence>
        {deleteTarget && (
          <DeleteDialog
            mission={deleteTarget}
            onConfirm={deleting ? () => {} : handleDelete}
            onCancel={() => !deleting && setDeleteTarget(null)}
            isDeleting={deleting}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function Spinner() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" style={{ animation: "spin 0.8s linear infinite" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" stroke="#E2DAF6" strokeWidth="3" fill="none" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="#7C63C8" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  )
}
