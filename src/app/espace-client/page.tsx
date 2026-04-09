"use client"

import { useState } from "react"
import { m } from "framer-motion"
import { useRouter } from "next/navigation"
import { useMockStore, AGENT_LEVELS } from "@/lib/mock-store"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]
const fu = (delay: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: EASE },
})

export default function EspaceClientPage() {
  const router = useRouter()
  const { subscribedLevel, subscribe } = useMockStore()
  const [showAgentPicker, setShowAgentPicker] = useState(false)

  const agent = subscribedLevel ? AGENT_LEVELS[subscribedLevel] : null

  /* ═══ NO AGENT — Welcome + Picker ═══════════════════ */
  if (!subscribedLevel) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <m.div {...fu(0)} className="mb-14 text-center">
          <div className="mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-violet)] text-[32px] shadow-lg shadow-[var(--accent-blue)]/20">
            🏢
          </div>
          <h1 className="font-heading text-2xl font-bold text-[var(--text-primary)] sm:text-4xl">
            Votre espace client
          </h1>
          <p className="mx-auto mt-2.5 max-w-[48ch] text-[15px] text-[var(--text-muted)]">
            Activez un agent pour accéder à vos missions de sourcing et commencer à travailler.
          </p>
        </m.div>

        <m.div {...fu(0.15)} className="mb-10">
          <h2 className="font-heading mb-5 text-center text-lg font-semibold text-[var(--text-primary)]">
            Choisissez votre agent
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((level, i) => {
              const a = AGENT_LEVELS[level]
              return (
                <m.button
                  key={level}
                  {...fu(0.2 + i * 0.08)}
                  onClick={() => {
                    subscribe(level)
                    router.push("/espace-client")
                  }}
                  className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border bg-white p-7 transition-all duration-200"
                  style={{ borderColor: a.borderColor }}
                  whileHover={{ y: -4, boxShadow: `0 12px 40px ${a.colorMid}` }}
                >
                  <div
                    className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl text-2xl"
                    style={{ background: a.colorLight, border: `1px solid ${a.borderColor}` }}
                  >
                    {a.icon}
                  </div>
                  <div>
                    <p className="text-lg font-bold text-[var(--text-primary)]">{a.agent}</p>
                    <p className="text-xs text-[var(--text-muted)]">{a.name}</p>
                  </div>
                  <p className="text-center text-xs leading-relaxed text-[var(--text-muted)]">
                    {a.role}
                  </p>
                  <span
                    className="rounded-[10px] px-5 py-2 text-[13px] font-semibold transition-all"
                    style={{
                      color: a.color,
                      background: a.colorLight,
                      border: `1px solid ${a.borderColor}`,
                    }}
                  >
                    Activer {a.agent} →
                  </span>
                </m.button>
              )
            })}
          </div>
        </m.div>

        <m.p {...fu(0.4)} className="text-center text-[13px] text-[var(--text-muted)]">
          Vous pourrez changer d&apos;agent à tout moment depuis votre espace.
        </m.p>
      </div>
    )
  }

  /* ═══ AGENT SUBSCRIBED — Dashboard ══════════════════ */
  return (
    <main className="mx-auto max-w-[900px] px-4 py-10 sm:px-6 sm:pb-20">
      {/* Welcome */}
      <m.div {...fu(0)} className="mb-10">
        <h1 className="font-heading text-2xl font-bold text-[var(--text-primary)] sm:text-[32px]">
          Bienvenue dans votre espace
        </h1>
        <p className="mt-1.5 text-[15px] text-[var(--text-muted)]">
          Gérez vos packages et suivez vos missions depuis cet espace.
        </p>
      </m.div>

      {/* Mes packages */}
      <m.div {...fu(0.1)}>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Mes packages
        </h2>

        <div
          className="overflow-hidden rounded-[20px] border-[1.5px] bg-white transition-shadow"
          style={{ borderColor: agent!.borderColor }}
        >
          <div className="h-1" style={{ background: agent!.color }} />
          <div className="p-5 sm:p-7">
            {/* Package info */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-[26px]"
                  style={{ background: agent!.colorLight, border: `1px solid ${agent!.borderColor}` }}
                >
                  {agent!.icon}
                </div>
                <div>
                  <h3 className="font-heading text-xl font-bold text-[var(--text-primary)]">
                    Package Sourcing
                  </h3>
                  <p className="text-sm text-[var(--text-muted)]">
                    Agent souscrit :{" "}
                    <strong style={{ color: agent!.color }}>{agent!.agent}</strong>{" "}
                    <span className="text-[var(--text-muted)]">({agent!.name})</span>
                  </p>
                </div>
              </div>

              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold"
                style={{
                  color: agent!.color,
                  background: agent!.colorLight,
                  border: `1px solid ${agent!.borderColor}`,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: agent!.color }}
                />
                Actif
              </span>
            </div>

            <hr className="my-5 border-[var(--border)]" />

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <a
                href="/espace-client/sourcing"
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white no-underline transition-all"
                style={{
                  background: agent!.color,
                  boxShadow: `0 4px 16px ${agent!.colorMid}`,
                }}
              >
                Accéder aux missions →
              </a>
              <button
                onClick={() => setShowAgentPicker(!showAgentPicker)}
                className="cursor-pointer rounded-xl border-[1.5px] border-[var(--border)] bg-transparent px-5 py-3 text-[13px] font-medium text-[var(--text-muted)] transition-all hover:border-[var(--accent-blue)]"
              >
                Changer d&apos;agent
              </button>
            </div>
          </div>
        </div>
      </m.div>

      {/* Agent picker toggle */}
      {showAgentPicker && (
        <m.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 rounded-2xl border-[1.5px] border-[var(--border)] bg-white p-6"
        >
          <p className="mb-4 text-sm font-semibold text-[var(--text-primary)]">
            Changer d&apos;agent
          </p>
          <div className="flex flex-wrap gap-3">
            {[1, 2, 3].map((level) => {
              const a = AGENT_LEVELS[level]
              const isActive = level === subscribedLevel
              return (
                <button
                  key={level}
                  onClick={() => {
                    subscribe(level)
                    setShowAgentPicker(false)
                  }}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl border-[1.5px] px-5 py-3 transition-all"
                  style={{
                    borderColor: isActive ? a.color : a.borderColor,
                    background: isActive ? a.colorLight : "white",
                  }}
                >
                  <span className="text-lg">{a.icon}</span>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{a.agent}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">{a.name}</p>
                  </div>
                  {isActive && (
                    <span className="ml-1 text-[11px] font-semibold" style={{ color: a.color }}>
                      Actif
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </m.div>
      )}
    </main>
  )
}
