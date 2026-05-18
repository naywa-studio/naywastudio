"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { m } from "framer-motion"
import { useWorkspace } from "./layout"
import BrandingCard from "@/components/workspace/BrandingCard"
import NoraLoader from "@/components/workspace/NoraLoader"
import { getSupabase } from "@/lib/supabase"
import type { MatchTier } from "@/lib/database.types"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

/**
 * Workspace home — overview centred on the three things that actually
 * matter day-to-day with the current scope (mail + calendar are parked):
 *   - 3 stat tiles  : candidats au vivier, postes ouverts, matches forts
 *   - "Récemment ajoutés" : the last 5 parsed CVs
 *   - "Meilleurs matches récents" : the last 5 high-tier matches
 *
 * No "Aujourd'hui" replays / interviews / replies until mailing is back.
 */

interface Stats {
  candidates: number
  openJobs: number
  strongMatches: number
}

interface RecentCandidate {
  id: string
  full_name: string | null
  current_title: string | null
  current_company: string | null
  created_at: string
}

interface RecentMatch {
  id: string
  score: number | null
  match_tier: MatchTier | null
  created_at: string
  candidate: { id: string; full_name: string | null; current_title: string | null } | null
  job: { id: string; title: string } | null
}

const TIER_COLOR: Record<MatchTier, { fg: string; bg: string; bd: string }> = {
  excellent: { fg: "#15803d", bg: "rgba(34,197,94,0.10)",  bd: "rgba(34,197,94,0.3)" },
  good:      { fg: "#7C63C8", bg: "rgba(124,99,200,0.08)", bd: "rgba(124,99,200,0.22)" },
  fair:      { fg: "#B45309", bg: "rgba(245,158,11,0.10)", bd: "rgba(245,158,11,0.3)" },
  poor:      { fg: "#9CA3AF", bg: "#F3F4F6",               bd: "#E5E7EB" },
}

export default function WorkspaceHome() {
  const { profile, hasSubscription, refetchProfile } = useWorkspace()
  const sb = useMemo(() => getSupabase(), [])
  const granted = useRef(false)

  const [stats, setStats] = useState<Stats | null>(null)
  const [recentCandidates, setRecentCandidates] = useState<RecentCandidate[]>([])
  const [recentMatches, setRecentMatches] = useState<RecentMatch[]>([])
  const [loading, setLoading] = useState(true)

  // Grant the subscription if missing — first visit after signup.
  useEffect(() => {
    if (granted.current || hasSubscription) return
    granted.current = true
    ;(async () => {
      try {
        const r = await fetch("/api/subscribe", { method: "POST" })
        if (r.ok || r.status === 409) await refetchProfile()
      } catch { /* ignore */ }
    })()
  }, [hasSubscription, refetchProfile])

  // Load stats + recent activity in parallel.
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const [candRes, jobsRes, matchesRes, recentCandsRes, recentMatchesRes] = await Promise.all([
        sb.from("candidates").select("id", { count: "exact", head: true })
          .not("tags", "cs", "{ancien}"),
        sb.from("jobs").select("id", { count: "exact", head: true })
          .eq("status", "open"),
        sb.from("match_assessments").select("id", { count: "exact", head: true })
          .in("match_tier", ["excellent", "good"]),
        sb.from("candidates")
          .select("id, full_name, current_title, current_company, created_at")
          .eq("parse_status", "parsed")
          .not("tags", "cs", "{ancien}")
          .order("created_at", { ascending: false })
          .limit(5),
        sb.from("match_assessments")
          .select(`
            id, score, match_tier, created_at,
            candidate:candidates(id, full_name, current_title),
            job:jobs(id, title)
          `)
          .in("match_tier", ["excellent", "good"])
          .order("created_at", { ascending: false })
          .limit(5),
      ])

      if (!mounted) return
      setStats({
        candidates: candRes.count ?? 0,
        openJobs: jobsRes.count ?? 0,
        strongMatches: matchesRes.count ?? 0,
      })
      setRecentCandidates((recentCandsRes.data ?? []) as RecentCandidate[])
      setRecentMatches((recentMatchesRes.data ?? []) as unknown as RecentMatch[])
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [sb])

  const firstName = profile?.first_name?.trim() || null

  return (
    <main style={{
      maxWidth: 1080, margin: "0 auto",
      padding: "44px 24px 80px",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      <m.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE }}
      >
        <span style={{
          display: "inline-block",
          fontSize: 11, fontWeight: 700, color: "#7C63C8",
          background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.18)",
          padding: "4px 11px", borderRadius: 100,
          letterSpacing: "0.08em", textTransform: "uppercase",
          marginBottom: 14,
        }}>
          Accueil
        </span>
        <h1 style={{
          margin: 0, fontSize: "clamp(28px, 3.8vw, 38px)", fontWeight: 800,
          color: "#111827", letterSpacing: "-0.025em", lineHeight: 1.1,
        }}>
          Bonjour{firstName ? `, ${firstName}` : ""} 👋
        </h1>
        <p style={{ margin: "10px 0 28px", fontSize: 14.5, color: "#6B7280", lineHeight: 1.65, maxWidth: "58ch" }}>
          Votre espace Nora en un coup d&apos;œil — vivier, postes ouverts, matches récents.
        </p>
      </m.div>

      {/* 3 stat tiles, each a shortcut to its workspace */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 14, marginBottom: 28,
      }}>
        <StatTile href="/workspace/vivier"
          label="Candidats au vivier"
          value={stats?.candidates ?? null}
          loading={loading}
          tint="#7C63C8"
        />
        <StatTile href="/workspace/postes"
          label="Postes ouverts"
          value={stats?.openJobs ?? null}
          loading={loading}
          tint="#2563EB"
        />
        <StatTile href="/workspace/pipeline"
          label="Matches forts · excellent + bon"
          value={stats?.strongMatches ?? null}
          loading={loading}
          tint="#15803d"
        />
      </div>

      {/* Two-column recent activity */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: 16, marginBottom: 28,
      }}>
        <RecentPanel
          title="Récemment ajoutés au vivier"
          loading={loading}
          empty="Aucun CV ajouté pour l'instant."
          actionLabel="Voir le vivier →"
          actionHref="/workspace/vivier"
        >
          {recentCandidates.map((c) => (
            <Link key={c.id} href={`/workspace/vivier/${c.id}`} style={rowLinkStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={rowTitleStyle}>{c.full_name ?? "Sans nom"}</p>
                <p style={rowSubStyle}>
                  {c.current_title ?? "—"}
                  {c.current_company ? ` · ${c.current_company}` : ""}
                </p>
              </div>
              <span style={rowDateStyle}>{timeAgo(c.created_at)}</span>
            </Link>
          ))}
        </RecentPanel>

        <RecentPanel
          title="Meilleurs matches récents"
          loading={loading}
          empty="Aucun match excellent / bon pour l'instant."
          actionLabel="Voir le pipeline →"
          actionHref="/workspace/pipeline"
        >
          {recentMatches.map((m) => {
            const tier = m.match_tier ? TIER_COLOR[m.match_tier] : null
            return (
              <Link key={m.id} href={`/workspace/match/${m.id}`} style={rowLinkStyle}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={rowTitleStyle}>
                    {m.candidate?.full_name ?? "Candidat"}
                    <span style={{ color: "#9CA3AF", fontWeight: 500 }}> · {m.job?.title ?? "—"}</span>
                  </p>
                  <p style={rowSubStyle}>{m.candidate?.current_title ?? ""}</p>
                </div>
                {m.score != null && tier && (
                  <span style={{
                    fontSize: 11, fontWeight: 800, color: tier.fg,
                    background: tier.bg, border: `1px solid ${tier.bd}`,
                    borderRadius: 100, padding: "2px 9px", flexShrink: 0,
                  }}>
                    {m.score}
                  </span>
                )}
              </Link>
            )
          })}
        </RecentPanel>
      </div>

      <BrandingCard />
    </main>
  )
}

/* ─── Sub-components ──────────────────────────────────────────── */

function StatTile({ href, label, value, loading, tint }: {
  href: string
  label: string
  value: number | null
  loading: boolean
  tint: string
}) {
  return (
    <Link href={href} style={{
      display: "block", padding: "18px 20px",
      background: "white", border: "1px solid #F0ECF8", borderRadius: 16,
      textDecoration: "none",
      transition: "border-color 160ms, box-shadow 160ms",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#E2DAF6"; e.currentTarget.style.boxShadow = "0 4px 14px -8px rgba(124,99,200,0.25)" }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#F0ECF8"; e.currentTarget.style.boxShadow = "none" }}
    >
      <p style={{
        margin: 0, fontSize: 11, fontWeight: 700, color: "#9CA3AF",
        letterSpacing: "0.07em", textTransform: "uppercase",
      }}>
        {label}
      </p>
      <p style={{
        margin: "8px 0 0", fontSize: 32, fontWeight: 800, color: tint,
        letterSpacing: "-0.02em", lineHeight: 1,
      }}>
        {loading ? "—" : value ?? 0}
      </p>
    </Link>
  )
}

function RecentPanel({
  title, loading, empty, actionLabel, actionHref, children,
}: {
  title: string
  loading: boolean
  empty: string
  actionLabel: string
  actionHref: string
  children: React.ReactNode
}) {
  const items = Array.isArray(children) ? children : children ? [children] : []
  return (
    <section style={{
      background: "white", border: "1px solid #F0ECF8", borderRadius: 16,
      overflow: "hidden",
    }}>
      <div style={{
        padding: "14px 18px", borderBottom: "1px solid #F0ECF8",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <h2 style={{
          margin: 0, fontSize: 12, fontWeight: 700, color: "#9CA3AF",
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          {title}
        </h2>
        <Link href={actionHref} style={{
          fontSize: 11.5, fontWeight: 700, color: "#7C63C8", textDecoration: "none",
        }}>
          {actionLabel}
        </Link>
      </div>
      <div style={{ padding: 6 }}>
        {loading ? (
          <div style={{ padding: "20px 12px" }}><NoraLoader inline /></div>
        ) : items.length === 0 ? (
          <p style={{ margin: 0, padding: "20px 12px", fontSize: 13, color: "#9CA3AF" }}>
            {empty}
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  )
}

const rowLinkStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10,
  padding: "10px 12px", borderRadius: 10,
  textDecoration: "none",
}
const rowTitleStyle: React.CSSProperties = {
  margin: 0, fontSize: 13.5, fontWeight: 700, color: "#111827",
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
}
const rowSubStyle: React.CSSProperties = {
  margin: "2px 0 0", fontSize: 11.5, color: "#9CA3AF",
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
}
const rowDateStyle: React.CSSProperties = {
  fontSize: 11, color: "#9CA3AF", flexShrink: 0,
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 60) return `il y a ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `il y a ${d}j`
  const mo = Math.floor(d / 30)
  return `il y a ${mo}mois`
}
