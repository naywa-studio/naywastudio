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
          <span style={{ fontSize: 18 }}>📅</span>
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
              flex: 1,
              minWidth: 220,
              padding: "9px 14px",
              borderRadius: 9,
              border: `1.5px solid ${error ? "#EF4444" : "#E2DAF6"}`,
              fontSize: 13,
              color: "#111827",
              outline: "none",
              fontFamily: "var(--font-inter), sans-serif",
              background: "white",
            }}
          />
          <button
            onClick={save}
            disabled={!url.trim() || saving}
            style={{
              padding: "9px 18px",
              borderRadius: 9,
              border: "none",
              cursor: url.trim() && !saving ? "pointer" : "not-allowed",
              fontSize: 13,
              fontWeight: 700,
              color: "white",
              background: url.trim() ? "#7C63C8" : "#D1D5DB",
              fontFamily: "var(--font-inter), sans-serif",
              whiteSpace: "nowrap",
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

const STATUS_META: Record<Mission["status"], { label: string; color: string; bg: string }> = {
  preparation: { label: "Préparation",  color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
  in_progress: { label: "En cours",     color: "#22c55e", bg: "rgba(34,197,94,0.08)" },
  completed:   { label: "Terminée",     color: "#6B7280", bg: "rgba(107,114,128,0.08)" },
  error:       { label: "Erreur",       color: "#EF4444", bg: "rgba(239,68,68,0.08)" },
}

export default function WorkspacePage() {
  const router = useRouter()
  const { profile, userEmail, agentLevel, hasSubscription, isProvisioning, refetchProfile } = useWorkspace()
  const agent = AGENT_LEVELS[agentLevel] ?? AGENT_LEVELS[1]

  const [missions, setMissions] = useState<Mission[]>([])
  const [loadingMissions, setLoadingMissions] = useState(true)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [creating, setCreating] = useState(false)

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

    // Map numeric agentLevel → DB enum ('leo' | 'nora')
    const agentLevelMap: Record<number, 'leo' | 'nora'> = { 1: 'leo', 2: 'nora' }
    const missionAgentLevel = agentLevelMap[agentLevel] ?? 'leo'

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
      <main
        style={{
          minHeight: "calc(100vh - 60px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 24px",
          textAlign: "center",
        }}
      >
        <m.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{ maxWidth: 480 }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: "#F8F6FF",
              border: "1.5px solid #E2DAF6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              margin: "0 auto 28px",
            }}
          >
            🤖
          </div>
          <h1
            style={{
              fontSize: "clamp(22px, 4vw, 32px)",
              fontWeight: 800,
              color: "#111827",
              margin: "0 0 12px",
              fontFamily: "var(--font-space-grotesk), sans-serif",
              letterSpacing: -0.3,
            }}
          >
            Bonjour{firstName ? `, ${firstName}` : ""} 👋
          </h1>
          <p
            style={{
              fontSize: 16,
              color: "#6B7280",
              lineHeight: 1.65,
              margin: "0 0 36px",
              fontFamily: "var(--font-inter), sans-serif",
            }}
          >
            Votre espace est prêt. Choisissez un agent pour commencer à sourcer
            vos premiers candidats.
          </p>
          <Link
            href="/packages"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "16px 32px",
              borderRadius: 14,
              background: "#7C63C8",
              color: "white",
              fontSize: 16,
              fontWeight: 700,
              textDecoration: "none",
              fontFamily: "var(--font-space-grotesk), sans-serif",
              boxShadow: "0 8px 32px rgba(124,99,200,0.28)",
              transition: "transform 150ms, box-shadow 150ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)"
              e.currentTarget.style.boxShadow = "0 12px 40px rgba(124,99,200,0.38)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)"
              e.currentTarget.style.boxShadow = "0 8px 32px rgba(124,99,200,0.28)"
            }}
          >
            Trouver mon agent !
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <p
            style={{
              marginTop: 20,
              fontSize: 12,
              color: "#9CA3AF",
              fontFamily: "var(--font-inter), sans-serif",
            }}
          >
            Setup en 48h · VPS dédié · Sans engagement
          </p>
        </m.div>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 80px" }}>
      {/* Welcome */}
      <m.div {...fu(0)} style={{ marginBottom: 36 }}>
        <h1
          style={{
            fontSize: "clamp(22px, 3vw, 32px)",
            fontWeight: 800,
            color: "#111827",
            margin: "0 0 6px",
            fontFamily: "var(--font-space-grotesk), sans-serif",
          }}
        >
          Bonjour{firstName ? `, ${firstName}` : ""} 👋
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: "#6B7280", fontFamily: "var(--font-inter), sans-serif" }}>
          Gérez vos missions de sourcing depuis cet espace.
        </p>
      </m.div>

      {/* Booking URL setup — Alex only, when not yet configured */}
      <AnimatePresence>
        {showBookingSetup && (
          <BookingSetupCard onSaved={(url) => setBookingUrl(url)} />
        )}
      </AnimatePresence>

      {/* Agent card */}
      <m.div
        {...fu(0.06)}
        style={{
          background: "white",
          borderRadius: 16,
          border: `1.5px solid ${agent.borderColor}`,
          overflow: "hidden",
          marginBottom: 32,
        }}
      >
        <div style={{ height: 3, background: agent.color }} />
        <div
          style={{
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                background: agent.colorLight,
                border: `1px solid ${agent.borderColor}`,
              }}
            >
              {agent.icon}
            </div>
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#111827",
                  fontFamily: "var(--font-space-grotesk), sans-serif",
                }}
              >
                Package Sourcing
              </p>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: 13,
                  color: "#6B7280",
                  fontFamily: "var(--font-inter), sans-serif",
                }}
              >
                Agent souscrit :{" "}
                <strong style={{ color: agent.color }}>{agent.agent}</strong>{" "}
                ({agent.name})
              </p>
            </div>
          </div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              padding: "5px 12px",
              borderRadius: 999,
              color: agent.color,
              background: agent.colorLight,
              border: `1px solid ${agent.borderColor}`,
              fontFamily: "var(--font-inter), sans-serif",
            }}
          >
            <span
              style={{ width: 6, height: 6, borderRadius: "50%", background: agent.color }}
            />
            Actif
          </span>
        </div>
      </m.div>

      {/* Missions */}
      <m.div {...fu(0.12)}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#6B7280",
              fontFamily: "var(--font-inter), sans-serif",
            }}
          >
            Mes missions{missions.length > 0 && ` (${missions.length})`}
          </h2>
          <button
            onClick={() => setShowNewForm(true)}
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "white",
              background: agent.color,
              border: "none",
              borderRadius: 10,
              padding: "9px 16px",
              cursor: "pointer",
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
              style={{ overflow: "hidden", marginBottom: 12 }}
            >
              <div
                style={{
                  background: "white",
                  borderRadius: 14,
                  border: `1.5px solid ${agent.borderColor}`,
                  padding: "18px 20px",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "flex-end",
                  gap: 10,
                }}
              >
                <div style={{ flex: 1, minWidth: 220 }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#374151",
                      fontFamily: "var(--font-inter), sans-serif",
                    }}
                  >
                    Nom de la mission
                  </label>
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    placeholder="Ex : Dev Full-Stack Senior — Paris"
                    autoFocus
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 9,
                      border: "1.5px solid #E5E7EB",
                      fontSize: 14,
                      color: "#111827",
                      outline: "none",
                      fontFamily: "var(--font-inter), sans-serif",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <button
                  onClick={handleCreate}
                  disabled={!newTitle.trim() || creating}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 9,
                    border: "none",
                    cursor: newTitle.trim() && !creating ? "pointer" : "not-allowed",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "white",
                    background: newTitle.trim() ? agent.color : "#D1D5DB",
                    fontFamily: "var(--font-inter), sans-serif",
                  }}
                >
                  {creating ? "Création…" : "Créer →"}
                </button>
                <button
                  onClick={() => { setShowNewForm(false); setNewTitle("") }}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 9,
                    border: "1px solid #E5E7EB",
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: 13,
                    color: "#6B7280",
                    fontFamily: "var(--font-inter), sans-serif",
                  }}
                >
                  Annuler
                </button>
              </div>
            </m.div>
          )}
        </AnimatePresence>

        {/* List */}
        {loadingMissions ? (
          <div style={{ padding: "40px 0", textAlign: "center" }}>
            <Spinner />
          </div>
        ) : missions.length === 0 ? (
          <div
            style={{
              background: "white",
              borderRadius: 16,
              border: "1.5px solid #F0ECF8",
              padding: "48px 24px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: "#F8F6FF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
                margin: "0 auto 16px",
              }}
            >
              📂
            </div>
            <p
              style={{
                margin: "0 0 6px",
                fontSize: 16,
                fontWeight: 600,
                color: "#111827",
                fontFamily: "var(--font-space-grotesk), sans-serif",
              }}
            >
              Aucune mission pour le moment
            </p>
            <p
              style={{
                margin: "0 0 20px",
                fontSize: 14,
                color: "#6B7280",
                fontFamily: "var(--font-inter), sans-serif",
              }}
            >
              Créez votre première mission pour commencer à travailler avec {agent.agent}.
            </p>
            <button
              onClick={() => setShowNewForm(true)}
              style={{
                padding: "12px 24px",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 700,
                color: "white",
                background: agent.color,
                fontFamily: "var(--font-inter), sans-serif",
              }}
            >
              Créer une mission →
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {missions.map((mission, i) => {
              const meta = STATUS_META[mission.status]
              const date = new Date(mission.created_at).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
              return (
                <m.div key={mission.id} {...fu(0.04 + i * 0.05)}>
                  <Link href={`/workspace/missions/${mission.id}`} style={{ textDecoration: "none" }}>
                    <div
                      style={{
                        background: "white",
                        borderRadius: 14,
                        border: "1.5px solid #F0ECF8",
                        padding: "16px 20px",
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        transition: "border-color 150ms, box-shadow 150ms",
                      }}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget as HTMLElement
                        el.style.borderColor = agent.borderColor
                        el.style.boxShadow = `0 4px 20px ${agent.colorMid}`
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget as HTMLElement
                        el.style.borderColor = "#F0ECF8"
                        el.style.boxShadow = "none"
                      }}
                    >
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 12,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 20,
                          flexShrink: 0,
                          background: agent.colorLight,
                          border: `1px solid ${agent.borderColor}`,
                        }}
                      >
                        📁
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            margin: 0,
                            fontSize: 14,
                            fontWeight: 600,
                            color: "#111827",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontFamily: "var(--font-inter), sans-serif",
                          }}
                        >
                          {mission.title}
                        </p>
                        <p
                          style={{
                            margin: "2px 0 0",
                            fontSize: 12,
                            color: "#9CA3AF",
                            fontFamily: "var(--font-inter), sans-serif",
                          }}
                        >
                          Agent {agent.agent} · {date}
                        </p>
                      </div>
                      <span
                        style={{
                          flexShrink: 0,
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "4px 10px",
                          borderRadius: 999,
                          color: meta.color,
                          background: meta.bg,
                          fontFamily: "var(--font-inter), sans-serif",
                        }}
                      >
                        {meta.label}
                      </span>
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, color: "#D1D5DB" }}>
                        <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </Link>
                </m.div>
              )
            })}
          </div>
        )}
      </m.div>
    </main>
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
