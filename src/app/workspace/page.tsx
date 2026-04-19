"use client"

import { useState, useEffect, useCallback } from "react"
import { m, AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { getSupabase } from "@/lib/supabase"
import { AGENT_LEVELS } from "@/lib/mock-store"
import { useWorkspace } from "./layout"
import ProvisioningScreen from "@/components/workspace/ProvisioningScreen"
import type { Database } from "@/lib/database.types"

type Mission = Database["public"]["Tables"]["missions"]["Row"]

/* ── Auto-color from title ──────────────────────────────────── */

const FOLDER_PALETTE = [
  "#7C63C8", "#0EA5E9", "#10B981", "#F59E0B",
  "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4",
  "#84CC16", "#F97316", "#6366F1", "#14B8A6",
]

function titleToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return FOLDER_PALETTE[Math.abs(hash) % FOLDER_PALETTE.length]
}

/* ── Folder SVG icon ─────────────────────────────────────────── */

function FolderIcon({ color, size = 64 }: { color: string; size?: number }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 0.78)}
      viewBox="0 0 80 62"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Folder back tab */}
      <path
        d="M2 18C2 14.686 4.686 12 8 12H28L34 6H72C75.314 6 78 8.686 78 12V18H2Z"
        fill={color}
        opacity="0.35"
      />
      {/* Folder body */}
      <rect x="2" y="18" width="76" height="42" rx="7" fill={color} opacity="0.18" />
      <rect x="2" y="18" width="76" height="42" rx="7" stroke={color} strokeWidth="2" fill="none" opacity="0.55" />
      {/* Shine */}
      <rect x="10" y="24" width="24" height="3" rx="1.5" fill={color} opacity="0.25" />
    </svg>
  )
}

/* ── Delete confirm dialog ───────────────────────────────────── */

function DeleteDialog({
  mission,
  onConfirm,
  onCancel,
  isDeleting,
}: {
  mission: Mission
  onConfirm: () => void
  onCancel: () => void
  isDeleting?: boolean
}) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <m.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        style={{
          background: "white",
          borderRadius: 18,
          padding: "28px 28px 22px",
          maxWidth: 400,
          width: "100%",
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
          border: "1.5px solid #F0ECF8",
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <p style={{
            margin: "0 0 8px",
            fontSize: 16,
            fontWeight: 800,
            color: "#111827",
            fontFamily: "var(--font-space-grotesk), sans-serif",
          }}>
            Supprimer cette mission ?
          </p>
          <p style={{
            margin: 0,
            fontSize: 13,
            color: "#6B7280",
            lineHeight: 1.6,
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            La mission <strong style={{ color: "#111827" }}>&ldquo;{mission.title}&rdquo;</strong> sera
            supprimée définitivement, ainsi que tous les profils et données associés.
            Cette action est irréversible.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "9px 18px", borderRadius: 10,
              border: "1.5px solid #E5E7EB", background: "white",
              fontSize: 13, fontWeight: 600, color: "#374151",
              cursor: "pointer", fontFamily: "var(--font-inter), sans-serif",
            }}
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            style={{
              padding: "9px 18px", borderRadius: 10,
              border: "none", background: "#EF4444",
              fontSize: 13, fontWeight: 700, color: "white",
              cursor: isDeleting ? "not-allowed" : "pointer",
              fontFamily: "var(--font-inter), sans-serif",
              opacity: isDeleting ? 0.65 : 1,
            }}
          >
            {isDeleting ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      </m.div>
    </div>
  )
}

/* ── Status dot ──────────────────────────────────────────────── */

const STATUS_META: Record<Mission["status"], { label: string; color: string }> = {
  preparation: { label: "Préparation",  color: "#F59E0B" },
  in_progress: { label: "En cours",     color: "#22c55e" },
  completed:   { label: "Terminée",     color: "#6B7280" },
  error:       { label: "Erreur",       color: "#EF4444" },
}

/* ── Booking URL setup card (Alex only) ──────────────────────── */

function BookingSetupCard({ onSaved }: { onSaved: (url: string) => void }) {
  const [url, setUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const save = async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    if (!trimmed.startsWith("http")) {
      setError("L'URL doit commencer par http:// ou https://")
      return
    }
    setSaving(true)
    const sb = getSupabase()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    const { error: err } = await sb
      .from("profiles")
      .update({ booking_url: trimmed })
      .eq("user_id", user.id)
    if (err) {
      setError("Erreur lors de la sauvegarde.")
      setSaving(false)
      return
    }
    onSaved(trimmed)
    setSaving(false)
  }

  return (
    <m.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      style={{
        background: "linear-gradient(135deg, #F8F6FF 0%, #F0ECF8 100%)",
        border: "1.5px solid #E2DAF6",
        borderRadius: 16,
        padding: "20px 24px",
        marginBottom: 24,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-start",
        gap: 16,
      }}
    >
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
            Configurez votre outil de réservation
          </p>
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif" }}>
          Collez votre lien Calendly ou MS Bookings pour activer les liens de booking candidats.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError("") }}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="https://calendly.com/votre-lien"
            style={{
              flex: 1, minWidth: 220,
              padding: "9px 14px", borderRadius: 9,
              border: `1.5px solid ${error ? "#EF4444" : "#E2DAF6"}`,
              fontSize: 13, color: "#111827", outline: "none",
              fontFamily: "var(--font-inter), sans-serif", background: "white",
            }}
          />
          <button
            onClick={save}
            disabled={!url.trim() || saving}
            style={{
              padding: "9px 18px", borderRadius: 9, border: "none",
              cursor: url.trim() && !saving ? "pointer" : "not-allowed",
              fontSize: 13, fontWeight: 700, color: "white",
              background: url.trim() ? "#7C63C8" : "#D1D5DB",
              fontFamily: "var(--font-inter), sans-serif", whiteSpace: "nowrap",
            }}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
        {error && (
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#EF4444", fontFamily: "var(--font-inter), sans-serif" }}>
            {error}
          </p>
        )}
      </div>
    </m.div>
  )
}

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]
const fu = (delay: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: EASE },
})

/* ── Main page ───────────────────────────────────────────────── */

export default function WorkspacePage() {
  const router = useRouter()
  const { profile, userEmail, agentLevel, hasSubscription, isProvisioning, refetchProfile } = useWorkspace()
  const agent = AGENT_LEVELS[agentLevel] ?? AGENT_LEVELS[1]

  const [missions, setMissions] = useState<Mission[]>([])
  const [loadingMissions, setLoadingMissions] = useState(true)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Mission | null>(null)
  const [deleting, setDeleting] = useState(false)

  const firstName = profile?.first_name ?? userEmail.split("@")[0]
  const [bookingUrl, setBookingUrl] = useState<string | null>(profile?.booking_url ?? null)
  const showBookingSetup = agentLevel === 3 && !bookingUrl

  const fetchMissions = useCallback(async () => {
    const { data } = await getSupabase()
      .from("missions")
      .select("*")
      .order("created_at", { ascending: false })
    setMissions(data ?? [])
    setLoadingMissions(false)
  }, [])

  useEffect(() => { fetchMissions() }, [fetchMissions])

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    const sb = getSupabase()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return

    // Alex (3) runs the same Nora pipeline on VPS
    const agentLevelMap: Record<number, "leo" | "nora"> = { 1: "leo", 2: "nora", 3: "nora" }
    const missionAgentLevel = agentLevelMap[agentLevel] ?? "leo"

    const { data } = await sb
      .from("missions")
      .insert({ title: newTitle.trim(), user_id: user.id, agent_level: missionAgentLevel })
      .select()
      .single()

    if (data) {
      setNewTitle("")
      setShowNewForm(false)
      router.push(`/workspace/missions/${data.id}`)
    }
    setCreating(false)
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

  // ── Provisioning in progress ─────────────────────────────────────────────
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
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{ maxWidth: 480 }}
        >
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: "#F8F6FF", border: "1.5px solid #E2DAF6",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 32, margin: "0 auto 28px",
          }}>
            🤖
          </div>
          <h1 style={{
            fontSize: "clamp(22px, 4vw, 32px)", fontWeight: 800,
            color: "#111827", margin: "0 0 12px",
            fontFamily: "var(--font-space-grotesk), sans-serif", letterSpacing: -0.3,
          }}>
            Bonjour{firstName ? `, ${firstName}` : ""} 👋
          </h1>
          <p style={{
            fontSize: 16, color: "#6B7280", lineHeight: 1.65,
            margin: "0 0 36px", fontFamily: "var(--font-inter), sans-serif",
          }}>
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
          <p style={{ marginTop: 20, fontSize: 12, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>
            Setup en 48h · VPS dédié · Sans engagement
          </p>
        </m.div>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 1020, margin: "0 auto", padding: "40px 24px 80px" }}>
      {/* Welcome */}
      <m.div {...fu(0)} style={{ marginBottom: 32 }}>
        <h1 style={{
          fontSize: "clamp(20px, 3vw, 28px)", fontWeight: 800,
          color: "#111827", margin: "0 0 4px",
          fontFamily: "var(--font-space-grotesk), sans-serif",
        }}>
          Bonjour{firstName ? `, ${firstName}` : ""}
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif" }}>
          Gérez vos missions de sourcing depuis cet espace.
        </p>
      </m.div>

      {/* Booking URL setup — Alex only */}
      <AnimatePresence>
        {showBookingSetup && (
          <BookingSetupCard onSaved={(url) => setBookingUrl(url)} />
        )}
      </AnimatePresence>

      {/* Agent info strip */}
      <m.div
        {...fu(0.06)}
        style={{
          background: "white", borderRadius: 14,
          border: `1.5px solid ${agent.borderColor}`,
          overflow: "hidden", marginBottom: 32,
        }}
      >
        <div style={{ height: 2.5, background: agent.color }} />
        <div style={{
          padding: "14px 20px",
          display: "flex", alignItems: "center",
          justifyContent: "space-between", flexWrap: "wrap", gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, background: agent.colorLight, border: `1px solid ${agent.borderColor}`,
            }}>
              {agent.icon}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#111827", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
                Package Sourcing
              </p>
              <p style={{ margin: "1px 0 0", fontSize: 12, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif" }}>
                Agent souscrit : <strong style={{ color: agent.color }}>{agent.agent}</strong> ({agent.name})
              </p>
            </div>
          </div>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 11, fontWeight: 600, padding: "4px 11px",
            borderRadius: 999, color: agent.color, background: agent.colorLight,
            border: `1px solid ${agent.borderColor}`, fontFamily: "var(--font-inter), sans-serif",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: agent.color }} />
            Actif
          </span>
        </div>
      </m.div>

      {/* Missions header */}
      <m.div {...fu(0.10)}>
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between", marginBottom: 18,
          flexWrap: "wrap", gap: 10,
        }}>
          <h2 style={{
            margin: 0, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.08em", textTransform: "uppercase",
            color: "#6B7280", fontFamily: "var(--font-inter), sans-serif",
          }}>
            Mes missions{missions.length > 0 && ` (${missions.length})`}
          </h2>
          <button
            onClick={() => setShowNewForm(true)}
            style={{
              fontSize: 13, fontWeight: 700, color: "white",
              background: agent.color, border: "none", borderRadius: 10,
              padding: "8px 15px", cursor: "pointer",
              fontFamily: "var(--font-inter), sans-serif",
            }}
          >
            + Nouvelle mission
          </button>
        </div>

        {/* New mission form */}
        <AnimatePresence>
          {showNewForm && (
            <m.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: "hidden", marginBottom: 18 }}
            >
              <div style={{
                background: "white", borderRadius: 14,
                border: `1.5px solid ${agent.borderColor}`,
                padding: "16px 18px",
                display: "flex", flexWrap: "wrap",
                alignItems: "flex-end", gap: 10,
              }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <label style={{
                    display: "block", marginBottom: 6,
                    fontSize: 11, fontWeight: 600, color: "#374151",
                    fontFamily: "var(--font-inter), sans-serif", textTransform: "uppercase", letterSpacing: "0.05em",
                  }}>
                    Nom de la mission
                  </label>
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    placeholder="Ex : Dev Full-Stack Senior — Paris"
                    autoFocus
                    style={{
                      width: "100%", padding: "10px 14px",
                      borderRadius: 9, border: "1.5px solid #E5E7EB",
                      fontSize: 13, color: "#111827", outline: "none",
                      fontFamily: "var(--font-inter), sans-serif", boxSizing: "border-box",
                    }}
                  />
                </div>
                <button
                  onClick={handleCreate}
                  disabled={!newTitle.trim() || creating}
                  style={{
                    padding: "10px 20px", borderRadius: 9, border: "none",
                    cursor: newTitle.trim() && !creating ? "pointer" : "not-allowed",
                    fontSize: 13, fontWeight: 700, color: "white",
                    background: newTitle.trim() ? agent.color : "#D1D5DB",
                    fontFamily: "var(--font-inter), sans-serif",
                  }}
                >
                  {creating ? "Création…" : "Créer →"}
                </button>
                <button
                  onClick={() => { setShowNewForm(false); setNewTitle("") }}
                  style={{
                    padding: "10px 16px", borderRadius: 9,
                    border: "1px solid #E5E7EB", background: "transparent",
                    cursor: "pointer", fontSize: 13, color: "#6B7280",
                    fontFamily: "var(--font-inter), sans-serif",
                  }}
                >
                  Annuler
                </button>
              </div>
            </m.div>
          )}
        </AnimatePresence>

        {/* Mission folder grid */}
        {loadingMissions ? (
          <div style={{ padding: "48px 0", textAlign: "center" }}>
            <Spinner />
          </div>
        ) : missions.length === 0 ? (
          <EmptyState agentColor={agent.color} agentName={agent.agent} onNew={() => setShowNewForm(true)} />
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
            gap: 12,
          }}>
            <AnimatePresence>
              {missions.map((mission, i) => (
                <MissionFolderCard
                  key={mission.id}
                  mission={mission}
                  index={i}
                  onDelete={() => setDeleteTarget(mission)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </m.div>

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
    </main>
  )
}

/* ── Mission folder card ─────────────────────────────────────── */

function MissionFolderCard({
  mission,
  index,
  onDelete,
}: {
  mission: Mission
  index: number
  onDelete: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const color = titleToColor(mission.title)
  const status = STATUS_META[mission.status]
  const date = new Date(mission.created_at).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short",
  })
  const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.35, delay: index * 0.04, ease: EASE }}
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link href={`/workspace/missions/${mission.id}`} style={{ textDecoration: "none" }}>
        <div
          style={{
            background: "white",
            borderRadius: 16,
            border: `1.5px solid ${hovered ? color + "55" : "#F0ECF8"}`,
            padding: "20px 14px 16px",
            display: "flex", flexDirection: "column",
            alignItems: "center", gap: 10,
            transition: "border-color 180ms, box-shadow 180ms, transform 180ms",
            transform: hovered ? "translateY(-2px)" : "translateY(0)",
            boxShadow: hovered ? `0 8px 28px ${color}18` : "none",
            cursor: "pointer",
            minHeight: 160,
          }}
        >
          {/* Folder icon */}
          <div style={{ position: "relative" }}>
            <FolderIcon color={color} size={64} />
            {/* Status dot */}
            <span style={{
              position: "absolute", bottom: 4, right: 0,
              width: 9, height: 9, borderRadius: "50%",
              background: status.color,
              border: "2px solid white",
            }} />
          </div>

          {/* Title */}
          <p style={{
            margin: 0, fontSize: 12, fontWeight: 600, color: "#111827",
            fontFamily: "var(--font-inter), sans-serif",
            textAlign: "center", lineHeight: 1.4,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as const,
            overflow: "hidden",
            wordBreak: "break-word",
          }}>
            {mission.title}
          </p>

          {/* Date + status */}
          <p style={{
            margin: 0, fontSize: 10, color: "#9CA3AF",
            fontFamily: "var(--font-inter), sans-serif",
            textAlign: "center",
          }}>
            {date}
          </p>
        </div>
      </Link>

      {/* Delete button — appears on hover */}
      <AnimatePresence>
        {hovered && (
          <m.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.14 }}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDelete()
            }}
            title="Supprimer la mission"
            style={{
              position: "absolute", top: 8, right: 8,
              width: 26, height: 26, borderRadius: 7,
              border: "1px solid #FCA5A5",
              background: "white",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "#EF4444",
              boxShadow: "0 2px 8px rgba(239,68,68,0.15)",
              zIndex: 2,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </m.button>
        )}
      </AnimatePresence>
    </m.div>
  )
}

/* ── Empty state ─────────────────────────────────────────────── */

function EmptyState({
  agentColor,
  agentName,
  onNew,
}: {
  agentColor: string
  agentName: string
  onNew: () => void
}) {
  return (
    <div style={{
      background: "white", borderRadius: 16, border: "1.5px solid #F0ECF8",
      padding: "60px 24px", textAlign: "center",
    }}>
      <div style={{
        width: 56, height: 48, margin: "0 auto 16px",
        opacity: 0.3,
      }}>
        <FolderIcon color={agentColor} size={56} />
      </div>
      <p style={{
        margin: "0 0 6px", fontSize: 15, fontWeight: 600, color: "#111827",
        fontFamily: "var(--font-space-grotesk), sans-serif",
      }}>
        Aucune mission pour le moment
      </p>
      <p style={{
        margin: "0 0 20px", fontSize: 13, color: "#6B7280",
        fontFamily: "var(--font-inter), sans-serif",
      }}>
        Créez votre première mission pour commencer à travailler avec {agentName}.
      </p>
      <button
        onClick={onNew}
        style={{
          padding: "11px 22px", borderRadius: 10, border: "none",
          cursor: "pointer", fontSize: 13, fontWeight: 700,
          color: "white", background: agentColor,
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        Créer une mission →
      </button>
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
