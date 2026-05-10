"use client"

import { useState, useEffect, useCallback, useRef, Suspense } from "react"
import { m, AnimatePresence } from "framer-motion"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { getSupabase } from "@/lib/supabase"
import { AGENT_LEVELS } from "@/lib/mock-store"
import { useWorkspace } from "./layout"
import ProvisioningScreen from "@/components/workspace/ProvisioningScreen"
import WorkspaceCentralChat, {
  type AttachedMission,
  titleToColor,
  EASE,
  Spinner,
} from "@/components/workspace/WorkspaceCentralChat"
import type { Database } from "@/lib/database.types"

type Mission = Database["public"]["Tables"]["missions"]["Row"]

/* ── Status meta ─────────────────────────────────────────────── */

const STATUS_META: Record<Mission["status"], { label: string; color: string }> = {
  preparation: { label: "Préparation", color: "#F59E0B" },
  in_progress: { label: "En cours",    color: "#22c55e" },
  completed:   { label: "Terminée",    color: "#6B7280" },
  error:       { label: "Erreur",      color: "#EF4444" },
}

/* ── Folder SVG icon ─────────────────────────────────────────── */

export function FolderIcon({ color, size = 48 }: { color: string; size?: number }) {
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
        background: "rgba(0,0,0,0.32)",
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
          boxShadow: "0 24px 64px rgba(0,0,0,0.16)", border: "1.5px solid #F0ECF8",
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

/* ── Mission folder card ─────────────────────────────────────── */

function MissionFolderCard({
  mission, index, onDelete, onAttach, agentColor,
}: {
  mission: Mission; index: number; onDelete: () => void; onAttach: () => void; agentColor: string
}) {
  const [hovered, setHovered] = useState(false)
  const color  = titleToColor(mission.title)
  const status = STATUS_META[mission.status]

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
            padding: "14px 10px 12px",
            display: "flex", flexDirection: "column",
            alignItems: "center", gap: 7,
            transition: "border-color 180ms, box-shadow 180ms, transform 180ms",
            transform: hovered ? "translateY(-2px)" : "translateY(0)",
            boxShadow: hovered ? `0 6px 20px ${color}18` : "none",
            cursor: "pointer",
            minHeight: 120,
          }}>
            <div style={{ position: "relative" }}>
              <FolderIcon color={color} size={44} />
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

        {/* Action buttons — visible on hover */}
        <AnimatePresence>
          {hovered && (
            <>
              {/* Attach button — top left */}
              <m.button
                key="attach"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.12 }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAttach() }}
                title="Attacher au chat"
                aria-label="Attacher au chat"
                style={{
                  position: "absolute", top: 6, left: 6,
                  width: 22, height: 22, borderRadius: 6,
                  border: `1px solid ${color}44`, background: "white",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color,
                  boxShadow: `0 2px 8px ${color}18`, zIndex: 2,
                  transition: "background 120ms",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = color + "12" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "white" }}
              >
                {/* Paperclip icon */}
                <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
                  <path d="M18 7.5l-9 9a5 5 0 01-7-7l9-9a3 3 0 014.24 4.24L6 14a1 1 0 01-1.42-1.42L13 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </m.button>

              {/* Delete button — top right */}
              <m.button
                key="delete"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.12 }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete() }}
                title="Supprimer"
                aria-label="Supprimer la mission"
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
            </>
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
  const [title,    setTitle]    = useState("")
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

/* ── InfoRow ─────────────────────────────────────────────────── */

/**
 * Free Léo auto-grant — no payment, no VPS, instant access.
 * Called when a logged-in user lands on /workspace without a subscription.
 * Posts to /api/subscribe with level='leo' which marks them ready immediately.
 */
function AutoGrantLeoScreen({ onReady, firstName }: { onReady: () => void; firstName: string }) {
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    ;(async () => {
      try {
        const res = await fetch("/api/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ level: "leo" }),
        })
        // 409 means already subscribed — just refetch
        if (res.ok || res.status === 409) onReady()
      } catch (e) {
        console.error("[auto-grant] failed:", e)
      }
    })()
  }, [onReady])

  return (
    <main style={{
      minHeight: "calc(100vh - 60px)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "40px 24px", textAlign: "center",
    }}>
      <m.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        style={{ maxWidth: 420 }}
      >
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: "#F8F6FF", border: "1.5px solid #E2DAF6",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, margin: "0 auto 20px",
        }}>👋</div>
        <h1 style={{
          fontSize: 22, fontWeight: 800, color: "#111827", margin: "0 0 10px",
          fontFamily: "var(--font-space-grotesk), sans-serif",
        }}>
          Bienvenue{firstName ? `, ${firstName}` : ""} !
        </h1>
        <p style={{
          fontSize: 14, color: "#6B7280", lineHeight: 1.6, margin: 0,
          fontFamily: "var(--font-inter), sans-serif",
        }}>
          On prépare votre espace de sourcing…
        </p>
      </m.div>
    </main>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ margin: "0 0 3px", fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-inter), sans-serif" }}>{label}</p>
      <p style={{ margin: 0, fontSize: 12, color: "#374151", fontFamily: "var(--font-inter), sans-serif", lineHeight: 1.4 }}>{value}</p>
    </div>
  )
}

/* ── Inner page (reads searchParams) ─────────────────────────── */

function WorkspacePageInner() {
  const router      = useRouter()
  const searchParams = useSearchParams()
  const { profile, userEmail, agentLevel, hasSubscription, isProvisioning, refetchProfile } = useWorkspace()
  const agent = AGENT_LEVELS[agentLevel] ?? AGENT_LEVELS[1]

  const [missions,       setMissions]       = useState<Mission[]>([])
  const [loadingMissions, setLoadingMissions] = useState(true)
  const [showNewForm,    setShowNewForm]    = useState(false)
  const [deleteTarget,   setDeleteTarget]   = useState<Mission | null>(null)
  const [deleting,       setDeleting]       = useState(false)
  const [attachedMission, setAttachedMission] = useState<AttachedMission | null>(null)

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

  // Auto-attach from ?mission=[id] URL param
  useEffect(() => {
    const missionId = searchParams.get("mission")
    if (!missionId) return

    getSupabase()
      .from("missions")
      .select("id, title")
      .eq("id", missionId)
      .single()
      .then(({ data }) => {
        if (data) {
          setAttachedMission({
            id: data.id,
            title: data.title,
            color: titleToColor(data.title),
          })
        }
      })
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .then(undefined, () => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run once on mount

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
      if (attachedMission?.id === deleteTarget.id) setAttachedMission(null)
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  const handleAttach = useCallback((mission: Mission) => {
    setAttachedMission({
      id: mission.id,
      title: mission.title,
      color: titleToColor(mission.title),
    })
  }, [])

  // Provisioning
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

  // No subscription → auto-grant free Léo (test phase, no payment).
  // The /api/subscribe endpoint sets subscription_level='leo' + vps_status='ready'
  // synchronously for Léo (no VPS provisioning needed in the new architecture).
  if (!hasSubscription) {
    return <AutoGrantLeoScreen onReady={refetchProfile} firstName={firstName} />
  }

  /* ── Main workspace layout ───────────────────────────────── */

  const attachedMissionData = attachedMission
    ? missions.find((m) => m.id === attachedMission.id) ?? null
    : null

  return (
    <div style={{ display: "flex", height: "calc(100vh - 60px)", overflow: "hidden" }}>

      {/* ── Left: Central Chat ──────────────────────────────── */}
      <WorkspaceCentralChat
        agentColor={agent.color}
        agentName={agent.agent}
        firstName={firstName}
        userEmail={userEmail}
        attachedMission={attachedMission}
        onAttachedMissionChange={setAttachedMission}
        onMissionCreated={() => fetchMissions()}
      />

      {/* ── Right: Panel ────────────────────────────────────── */}
      <div style={{
        width: attachedMission ? 380 : 300,
        flexShrink: 0,
        borderLeft: "1px solid #F0ECF8",
        background: "white",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        transition: "width 250ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}>
        <AnimatePresence mode="wait">
          {attachedMission ? (

            /* ── Mission preview panel ──────────────────────── */
            <m.div
              key="preview"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.22, ease: EASE }}
              style={{ display: "flex", flexDirection: "column", height: "100%" }}
            >
              <div style={{
                padding: "14px 16px 12px",
                borderBottom: "1px solid #F0ECF8",
                display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: attachedMission.color, flexShrink: 0 }} />
                <p style={{
                  margin: 0, fontSize: 12, fontWeight: 700, color: "#111827",
                  fontFamily: "var(--font-space-grotesk), sans-serif",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                }}>
                  {attachedMission.title}
                </p>
                <button
                  onClick={() => setAttachedMission(null)}
                  aria-label="Détacher la mission"
                  style={{
                    width: 22, height: 22, borderRadius: 6, border: "1px solid #E5E7EB",
                    background: "white", cursor: "pointer", color: "#9CA3AF",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
                    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
                {attachedMissionData?.brief ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <InfoRow label="Poste" value={attachedMissionData.brief.titre_poste} />
                    <InfoRow label="Localisation" value={attachedMissionData.brief.localisation} />
                    {attachedMissionData.brief.mots_cles?.length > 0 && (
                      <div>
                        <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-inter), sans-serif" }}>Mots-clés</p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {attachedMissionData.brief.mots_cles.map((kw: string) => (
                            <span key={kw} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: attachedMission.color + "15", color: attachedMission.color, fontWeight: 600, fontFamily: "var(--font-inter), sans-serif" }}>{kw}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {attachedMissionData.brief.criteres && (
                      <InfoRow label="Critères" value={attachedMissionData.brief.criteres} />
                    )}
                    {attachedMissionData.brief.ton && (
                      <InfoRow label="Ton" value={attachedMissionData.brief.ton} />
                    )}
                    {attachedMissionData.profiles_count > 0 && (
                      <div style={{ padding: "10px 12px", borderRadius: 10, background: attachedMission.color + "10", border: `1px solid ${attachedMission.color}30` }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: attachedMission.color, fontFamily: "var(--font-space-grotesk), sans-serif" }}>
                          {attachedMissionData.profiles_count} profils trouvés
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "32px 12px" }}>
                    <p style={{ margin: 0, fontSize: 12, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif", lineHeight: 1.6 }}>
                      Aucun brief défini.<br />Décrivez le poste dans le chat.
                    </p>
                  </div>
                )}
                <Link href={`/workspace/missions/${attachedMission.id}`} style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  marginTop: 16, padding: "9px 14px", borderRadius: 10,
                  border: `1.5px solid ${attachedMission.color}40`, background: attachedMission.color + "08",
                  color: attachedMission.color, fontSize: 12, fontWeight: 600, textDecoration: "none",
                  fontFamily: "var(--font-inter), sans-serif",
                }}>
                  Voir les résultats →
                </Link>
              </div>
            </m.div>

          ) : (

            /* ── Missions grid ──────────────────────────────── */
            <m.div
              key="grid"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18, ease: EASE }}
              style={{ display: "flex", flexDirection: "column", height: "100%" }}
            >
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

              {/* Missions grid */}
              <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
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
                      Aucune mission.<br />Décrivez votre besoin dans le chat.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <AnimatePresence>
                      {missions.map((mission, i) => (
                        <MissionFolderCard
                          key={mission.id}
                          mission={mission}
                          index={i}
                          agentColor={agent.color}
                          onDelete={() => setDeleteTarget(mission)}
                          onAttach={() => handleAttach(mission)}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* Drag hint */}
              <div style={{
                padding: "10px 16px",
                borderTop: "1px solid #F0ECF8",
                flexShrink: 0,
              }}>
                <p style={{
                  margin: 0, fontSize: 11, color: "#9CA3AF", textAlign: "center",
                  fontFamily: "var(--font-inter), sans-serif",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                }}>
                  <svg width="11" height="11" viewBox="0 0 20 20" fill="none" style={{ opacity: 0.5 }}>
                    <path d="M2 6C2 4.9 2.9 4 4 4h4l2 2h6c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6z"
                      stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinejoin="round"/>
                  </svg>
                  Glissez ou cliquez
                  <svg width="10" height="10" viewBox="0 0 20 20" fill="none" style={{ opacity: 0.4 }}>
                    <path d="M2 6C2 4.9 2.9 4 4 4h4l2 2h6c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6z"
                      stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinejoin="round"/>
                    <path d="M13 11l2 2-2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  pour attacher au chat
                </p>
              </div>
            </m.div>
          )}
        </AnimatePresence>
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

/* ── Page export (Suspense required for useSearchParams) ─────── */

export default function WorkspacePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "calc(100vh - 60px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spinner />
      </div>
    }>
      <WorkspacePageInner />
    </Suspense>
  )
}
