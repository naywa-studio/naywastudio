"use client"

import Link from "next/link"
import { Logo } from "@/components/ui/Logo"
import { useMockStore, AGENT_LEVELS } from "@/lib/mock-store"

export default function EspaceClientLayout({ children }: { children: React.ReactNode }) {
  const { subscribedLevel } = useMockStore()
  const agent = subscribedLevel ? AGENT_LEVELS[subscribedLevel] : null

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* ── Shared sticky header ─────────────────────── */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-[var(--border)] bg-white/92 px-4 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-4 overflow-hidden">
          <Link href="/" className="shrink-0">
            <Logo size="md" />
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/catalogue"
            className="hidden text-[13px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] sm:block"
          >
            Catalogue
          </Link>

          {agent && (
            <div
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{
                color: agent.color,
                background: agent.colorLight,
                border: `1px solid ${agent.borderColor}`,
              }}
            >
              <span className="text-sm">{agent.icon}</span>
              {agent.agent}
            </div>
          )}

          {subscribedLevel && (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: agent?.color ?? "#7C63C8" }}
            >
              U
            </div>
          )}
        </div>
      </header>

      {children}
    </div>
  )
}
