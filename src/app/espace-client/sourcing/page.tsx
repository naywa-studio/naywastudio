"use client"

import { useState } from "react"
import { m, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMockStore, AGENT_LEVELS } from "@/lib/mock-store"
import type { MissionStatus } from "@/lib/mock-store"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]
const fu = (delay: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: EASE },
})

const STATUS_LABELS: Record<MissionStatus, { label: string; color: string; bg: string }> = {
  preparation: { label: "Préparation", color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
  "en-cours": { label: "En cours", color: "#22c55e", bg: "rgba(34,197,94,0.08)" },
  terminee: { label: "Terminée", color: "#6B7280", bg: "rgba(107,114,128,0.08)" },
}

export default function SourcingMissionsPage() {
  const router = useRouter()
  const { subscribedLevel, missions, createMission } = useMockStore()
  const [showNewMission, setShowNewMission] = useState(false)
  const [newMissionName, setNewMissionName] = useState("")

  const agent = subscribedLevel ? AGENT_LEVELS[subscribedLevel] : null

  if (!subscribedLevel || !agent) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <p className="mb-5 text-base text-[var(--text-muted)]">
            Vous devez d&apos;abord activer un agent.
          </p>
          <Link
            href="/espace-client"
            className="rounded-xl bg-[var(--accent-blue)] px-6 py-3 text-sm font-semibold text-white no-underline"
          >
            Retour à l&apos;espace client →
          </Link>
        </div>
      </div>
    )
  }

  const handleCreateMission = () => {
    if (!newMissionName.trim()) return
    const id = createMission(newMissionName.trim())
    setNewMissionName("")
    setShowNewMission(false)
    router.push(`/espace-client/sourcing/${id}`)
  }

  return (
    <main className="mx-auto max-w-[900px] px-4 py-8 pb-20 sm:px-6 sm:py-10">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-[13px] text-[var(--text-muted)]">
        <Link href="/espace-client" className="text-[var(--text-muted)] no-underline hover:text-[var(--text-primary)]">
          Espace client
        </Link>
        <span>/</span>
        <span className="font-medium text-[var(--text-primary)]">Missions de sourcing</span>
      </nav>

      {/* Title row */}
      <m.div
        {...fu(0)}
        className="mb-8 flex flex-wrap items-center justify-between gap-4"
      >
        <div>
          <h1 className="font-heading text-[clamp(22px,3vw,30px)] font-bold text-[var(--text-primary)]">
            Missions de sourcing
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {missions.length} mission{missions.length !== 1 ? "s" : ""} — Agent {agent.agent}
          </p>
        </div>
        <button
          onClick={() => setShowNewMission(true)}
          className="cursor-pointer rounded-xl px-5 py-3 text-sm font-semibold text-white transition-all"
          style={{ background: agent.color, boxShadow: `0 4px 16px ${agent.colorMid}` }}
        >
          + Créer une mission
        </button>
      </m.div>

      {/* New mission form */}
      <AnimatePresence>
        {showNewMission && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 overflow-hidden"
          >
            <div
              className="flex flex-wrap items-end gap-3 rounded-2xl border-[1.5px] bg-white p-5 sm:p-6"
              style={{ borderColor: agent.borderColor }}
            >
              <div className="min-w-[240px] flex-1">
                <label className="mb-2 block text-[13px] font-semibold text-[var(--text-secondary)]">
                  Nom de la mission
                </label>
                <input
                  value={newMissionName}
                  onChange={(e) => setNewMissionName(e.target.value)}
                  placeholder="Ex : Dev Full-Stack Senior — Paris"
                  onKeyDown={(e) => e.key === "Enter" && handleCreateMission()}
                  className="w-full rounded-[10px] border-[1.5px] border-[var(--border)] px-3.5 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-blue)]"
                  autoFocus
                />
              </div>
              <button
                onClick={handleCreateMission}
                disabled={!newMissionName.trim()}
                className="cursor-pointer rounded-[10px] px-6 py-3 text-sm font-semibold text-white transition-all disabled:cursor-not-allowed disabled:bg-gray-300"
                style={{ background: newMissionName.trim() ? agent.color : undefined }}
              >
                Créer →
              </button>
              <button
                onClick={() => { setShowNewMission(false); setNewMissionName("") }}
                className="cursor-pointer rounded-[10px] border border-[var(--border)] bg-transparent px-4 py-3 text-[13px] text-[var(--text-muted)]"
              >
                Annuler
              </button>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* Missions list */}
      {missions.length === 0 ? (
        <m.div
          {...fu(0.1)}
          className="rounded-[20px] border-[1.5px] border-[var(--border)] bg-white px-8 py-16 text-center"
        >
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] bg-[var(--surface)] text-[28px]">
            📂
          </div>
          <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">
            Aucune mission pour le moment
          </h2>
          <p className="mx-auto mb-7 max-w-[40ch] text-sm text-[var(--text-muted)]">
            Créez votre première mission de sourcing pour commencer à travailler avec {agent.agent}.
          </p>
          <button
            onClick={() => setShowNewMission(true)}
            className="cursor-pointer rounded-xl px-7 py-3.5 text-[15px] font-semibold text-white"
            style={{ background: agent.color, boxShadow: `0 4px 16px ${agent.colorMid}` }}
          >
            Créer une mission de sourcing →
          </button>
        </m.div>
      ) : (
        <div className="flex flex-col gap-3">
          {missions.map((mission, i) => {
            const status = STATUS_LABELS[mission.status]
            return (
              <m.div key={mission.id} {...fu(0.08 + i * 0.06)}>
                <Link
                  href={`/espace-client/sourcing/${mission.id}`}
                  className="group block no-underline"
                >
                  <div className="flex items-center gap-4 rounded-2xl border-[1.5px] border-[var(--border)] bg-white px-5 py-5 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg sm:gap-5 sm:px-7">
                    {/* Folder icon */}
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-[22px]"
                      style={{ background: agent.colorLight, border: `1px solid ${agent.borderColor}` }}
                    >
                      📁
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-[var(--text-primary)]">
                        {mission.name}
                      </p>
                      <p className="mt-1 text-[13px] text-[var(--text-muted)]">
                        Agent {agent.agent} · Créée le {mission.createdAt}
                      </p>
                    </div>

                    {/* Status badge */}
                    <span
                      className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold sm:inline-flex"
                      style={{ color: status.color, background: status.bg }}
                    >
                      <span
                        className="h-[5px] w-[5px] rounded-full"
                        style={{ background: status.color }}
                      />
                      {status.label}
                    </span>

                    {/* Arrow */}
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="shrink-0 text-gray-300">
                      <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </Link>
              </m.div>
            )
          })}
        </div>
      )}
    </main>
  )
}
