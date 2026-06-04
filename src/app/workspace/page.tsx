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
 * Workspace home — un coup d'œil sur les 4 piliers du cabinet
 * (vivier · missions · pricing · pipeline) avec :
 *   - hero d'identité (logo + nom société + bonjour {prénom})
 *   - 5 raccourcis d'action vers les usages les plus fréquents
 *   - 4 indicateurs avec delta sur 7 jours
 *   - 3 panneaux d'activité récente (candidats / matches / à chiffrer)
 *   - BrandingCard en bas tant qu'il n'y a pas de page compte entreprise
 */

interface Stats {
  candidates: number
  candidatesDelta: number
  openJobs: number
  strongMatches: number
  strongMatchesDelta: number
  pricingPool: number
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

interface MissionToPrice {
  id: string
  title: string
  candidatesCount: number
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
  const [missionsToPrice, setMissionsToPrice] = useState<MissionToPrice[]>([])
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null)
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

  // Brand logo — signed URL for 1 h preview, mirrors BrandingCard.
  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!profile?.brand_logo_path) { setBrandLogoUrl(null); return }
      const { data: signed } = await sb.storage.from("brand-logos")
        .createSignedUrl(profile.brand_logo_path, 60 * 60)
      if (mounted) setBrandLogoUrl(signed?.signedUrl ?? null)
    })()
    return () => { mounted = false }
  }, [sb, profile?.brand_logo_path])

  // Load stats + recent activity in parallel.
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      const [
        candRes, candDeltaRes,
        jobsRes,
        matchesRes, matchesDeltaRes,
        pricingPoolRes,
        recentCandsRes, recentMatchesRes,
        pricingMissionsRes,
      ] = await Promise.all([
        sb.from("candidates").select("id", { count: "exact", head: true })
          .not("tags", "cs", "{ancien}"),
        sb.from("candidates").select("id", { count: "exact", head: true })
          .not("tags", "cs", "{ancien}")
          .gte("created_at", sevenDaysAgo),
        sb.from("jobs").select("id", { count: "exact", head: true })
          .eq("status", "open"),
        sb.from("match_assessments").select("id", { count: "exact", head: true })
          .in("match_tier", ["excellent", "good"]),
        sb.from("match_assessments").select("id", { count: "exact", head: true })
          .in("match_tier", ["excellent", "good"])
          .gte("created_at", sevenDaysAgo),
        sb.from("match_assessments").select("id", { count: "exact", head: true })
          .eq("in_pipeline", true),
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
        sb.from("match_assessments")
          .select(`job_id, job:jobs(id, title)`)
          .eq("in_pipeline", true),
      ])

      if (!mounted) return

      // Aggregate pricing missions by job.
      type PricingRow = { job_id: string; job: { id: string; title: string } | null }
      const byJob = new Map<string, MissionToPrice>()
      for (const row of (pricingMissionsRes.data ?? []) as unknown as PricingRow[]) {
        if (!row.job) continue
        const cur = byJob.get(row.job_id)
        if (cur) cur.candidatesCount += 1
        else byJob.set(row.job_id, { id: row.job.id, title: row.job.title, candidatesCount: 1 })
      }
      const missionsList = Array.from(byJob.values())
        .sort((a, b) => b.candidatesCount - a.candidatesCount)
        .slice(0, 5)

      setStats({
        candidates: candRes.count ?? 0,
        candidatesDelta: candDeltaRes.count ?? 0,
        openJobs: jobsRes.count ?? 0,
        strongMatches: matchesRes.count ?? 0,
        strongMatchesDelta: matchesDeltaRes.count ?? 0,
        pricingPool: pricingPoolRes.count ?? 0,
      })
      setRecentCandidates((recentCandsRes.data ?? []) as RecentCandidate[])
      setRecentMatches((recentMatchesRes.data ?? []) as unknown as RecentMatch[])
      setMissionsToPrice(missionsList)
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [sb])

  const firstName = profile?.first_name?.trim() || null
  const brandName = profile?.brand_name?.trim() || null
  const brandInitials = brandName
    ? brandName.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")
    : null

  return (
    <main style={{
      maxWidth: 1080, margin: "0 auto",
      padding: "44px 24px 80px",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      {/* ── Hero identité ─────────────────────────────────────── */}
      <m.section
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE }}
        style={{
          display: "flex", alignItems: "center", gap: 18,
          marginBottom: 32,
        }}
      >
        <BrandAvatar logoUrl={brandLogoUrl} initials={brandInitials} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 12, fontWeight: 700, color: "#9CA3AF",
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            {brandName ?? "Cabinet sans nom"}
          </p>
          <h1 style={{
            margin: "4px 0 0", fontSize: "clamp(26px, 3.4vw, 34px)", fontWeight: 800,
            color: "#111827", letterSpacing: "-0.025em", lineHeight: 1.15,
          }}>
            Bonjour{firstName ? `, ${firstName}` : ""}
          </h1>
          {!brandName && (
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6B7280" }}>
              <a href="#identite" style={{ color: "#7C63C8", fontWeight: 600, textDecoration: "none" }}>
                Définir l&apos;identité de votre cabinet
              </a>{" "}
              · apparaît sur les CV anonymisés
            </p>
          )}
        </div>
      </m.section>

      {/* ── Raccourcis d'action ───────────────────────────────── */}
      <m.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE, delay: 0.05 }}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 10, marginBottom: 28,
        }}
      >
        <ActionTile href="/workspace/vivier" label="Ajouter un CV"  icon={<IconUpload />} />
        <ActionTile href="/workspace/missions" label="Créer une mission" icon={<IconPlus />} />
        <ActionTile href="/workspace/missions" label="Lancer un matching" icon={<IconTarget />} />
        <ActionTile href="/workspace/pricing" label="Chiffrer une mission" icon={<IconEuro />} />
        <ActionTile href="/workspace/pipeline" label="Suivre le pipeline" icon={<IconKanban />} />
      </m.div>

      {/* ── Indicateurs ───────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 12, marginBottom: 28,
      }}>
        <StatTile href="/workspace/vivier"
          label="Vivier"
          value={stats?.candidates ?? null}
          delta={stats?.candidatesDelta ?? null}
          loading={loading}
        />
        <StatTile href="/workspace/missions"
          label="Missions ouvertes"
          value={stats?.openJobs ?? null}
          delta={null}
          loading={loading}
        />
        <StatTile href="/workspace/pipeline"
          label="Matches forts"
          value={stats?.strongMatches ?? null}
          delta={stats?.strongMatchesDelta ?? null}
          loading={loading}
        />
        <StatTile href="/workspace/pricing"
          label="Candidats en pricing"
          value={stats?.pricingPool ?? null}
          delta={null}
          loading={loading}
        />
      </div>

      {/* ── Activité récente ──────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: 14, marginBottom: 28,
      }}>
        <RecentPanel
          title="Récemment ajoutés au vivier"
          loading={loading}
          empty="Aucun CV ajouté pour l'instant."
          actionLabel="Voir le vivier"
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
          empty="Aucun match excellent ou bon pour l'instant."
          actionLabel="Voir le pipeline"
          actionHref="/workspace/pipeline"
        >
          {recentMatches.map((mm) => {
            const tier = mm.match_tier ? TIER_COLOR[mm.match_tier] : null
            return (
              <Link key={mm.id} href={`/workspace/match/${mm.id}`} style={rowLinkStyle}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={rowTitleStyle}>
                    {mm.candidate?.full_name ?? "Candidat"}
                    <span style={{ color: "#9CA3AF", fontWeight: 500 }}> · {mm.job?.title ?? "—"}</span>
                  </p>
                  <p style={rowSubStyle}>{mm.candidate?.current_title ?? ""}</p>
                </div>
                {mm.score != null && tier && (
                  <span style={{
                    fontSize: 11, fontWeight: 800, color: tier.fg,
                    background: tier.bg, border: `1px solid ${tier.bd}`,
                    borderRadius: 100, padding: "2px 9px", flexShrink: 0,
                  }}>
                    {mm.score}
                  </span>
                )}
              </Link>
            )
          })}
        </RecentPanel>

        <RecentPanel
          title="Missions à chiffrer"
          loading={loading}
          empty="Aucun candidat n'attend de chiffrage."
          actionLabel="Ouvrir le pricing"
          actionHref="/workspace/pricing"
        >
          {missionsToPrice.map((mm) => (
            <Link key={mm.id} href={`/workspace/pricing/${mm.id}`} style={rowLinkStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={rowTitleStyle}>{mm.title}</p>
                <p style={rowSubStyle}>
                  {mm.candidatesCount} candidat{mm.candidatesCount > 1 ? "s" : ""} en attente
                </p>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 800, color: "#D97706",
                background: "rgba(217,119,6,0.10)", border: "1px solid rgba(217,119,6,0.25)",
                borderRadius: 100, padding: "2px 9px", flexShrink: 0,
              }}>
                {mm.candidatesCount}
              </span>
            </Link>
          ))}
        </RecentPanel>
      </div>

      <div id="identite">
        <BrandingCard />
      </div>
    </main>
  )
}

/* ─── Sub-components ──────────────────────────────────────────── */

function BrandAvatar({ logoUrl, initials }: { logoUrl: string | null; initials: string | null }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        style={{
          width: 56, height: 56, borderRadius: 14,
          objectFit: "cover",
          border: "1px solid #F0ECF8",
          background: "white",
        }}
      />
    )
  }
  return (
    <div style={{
      width: 56, height: 56, borderRadius: 14,
      background: "linear-gradient(135deg, #F0ECF8 0%, #E2DAF6 100%)",
      border: "1px solid rgba(124,99,200,0.30)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#7C63C8", fontWeight: 800, fontSize: 18,
      letterSpacing: "0.02em",
    }}>
      {initials ?? "—"}
    </div>
  )
}

function ActionTile({ href, label, icon }: {
  href: string
  label: string
  icon: React.ReactNode
}) {
  return (
    <Link href={href} style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "12px 14px",
      background: "white", border: "1px solid #F0ECF8", borderRadius: 12,
      textDecoration: "none",
      transition: "border-color 160ms, box-shadow 160ms, transform 160ms",
    }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#E2DAF6"
        e.currentTarget.style.boxShadow = "0 4px 14px -8px rgba(124,99,200,0.25)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#F0ECF8"
        e.currentTarget.style.boxShadow = "none"
      }}
    >
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 32, height: 32, borderRadius: 8,
        background: "rgba(124,99,200,0.08)", color: "#7C63C8",
        flexShrink: 0,
      }}>
        {icon}
      </span>
      <span style={{
        fontSize: 13, fontWeight: 600, color: "#111827",
        lineHeight: 1.25,
      }}>
        {label}
      </span>
    </Link>
  )
}

function StatTile({ href, label, value, delta, loading }: {
  href: string
  label: string
  value: number | null
  delta: number | null
  loading: boolean
}) {
  return (
    <Link href={href} style={{
      display: "block", padding: "16px 18px",
      background: "white", border: "1px solid #F0ECF8", borderRadius: 14,
      textDecoration: "none",
      transition: "border-color 160ms, box-shadow 160ms",
    }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#E2DAF6"
        e.currentTarget.style.boxShadow = "0 4px 14px -8px rgba(124,99,200,0.25)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#F0ECF8"
        e.currentTarget.style.boxShadow = "none"
      }}
    >
      <p style={{
        margin: 0, fontSize: 11, fontWeight: 700, color: "#9CA3AF",
        letterSpacing: "0.07em", textTransform: "uppercase",
      }}>
        {label}
      </p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
        <p style={{
          margin: 0, fontSize: 28, fontWeight: 800, color: "#111827",
          letterSpacing: "-0.02em", lineHeight: 1,
        }}>
          {loading ? "—" : value ?? 0}
        </p>
        {!loading && delta != null && delta > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: "#15803d",
          }}>
            +{delta} cette semaine
          </span>
        )}
      </div>
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
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
      }}>
        <h2 style={{
          margin: 0, fontSize: 12, fontWeight: 700, color: "#9CA3AF",
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          {title}
        </h2>
        <Link href={actionHref} style={{
          fontSize: 11.5, fontWeight: 700, color: "#7C63C8", textDecoration: "none",
          whiteSpace: "nowrap",
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

/* ─── Icons (16 px, sober line-art) ───────────────────────────── */

const ICON_PROPS = {
  width: 16, height: 16, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 1.8,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
}

function IconUpload() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
    </svg>
  )
}
function IconPlus() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}
function IconTarget() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  )
}
function IconEuro() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M18 6.5A6.5 6.5 0 0 0 8.5 12 6.5 6.5 0 0 0 18 17.5" />
      <path d="M5 10h8M5 14h8" />
    </svg>
  )
}
function IconKanban() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="4" y="4" width="4" height="16" rx="1.2" />
      <rect x="10" y="4" width="4" height="10" rx="1.2" />
      <rect x="16" y="4" width="4" height="13" rx="1.2" />
    </svg>
  )
}

/* ─── Row styles ───────────────────────────────────────────────── */

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
