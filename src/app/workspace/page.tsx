"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { m } from "framer-motion"
import { useWorkspace } from "./layout"
import CalendlyCard from "@/components/workspace/CalendlyCard"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

interface TodayInterview {
  id: string
  start_time: string
  end_time: string
  candidate_id: string | null
  candidate_name: string | null
  candidate_title: string | null
  job_title: string | null
  join_url: string | null
  location_text: string | null
}
interface RecentReply {
  id: string
  created_at: string
  candidate_id: string | null
  candidate_name: string | null
  subject: string | null
  ai_summary: string | null
  ai_sentiment: string | null
  ai_suggested_stage: string | null
}
interface PendingFollowup {
  candidate_id: string
  candidate_name: string | null
  job_title: string | null
  contacted_at: string
  days_since: number
}
interface WeekStats {
  sent: number
  replies: number
  response_rate: number
  interviews: number
}
interface TodayPayload {
  interviews: TodayInterview[]
  replies: RecentReply[]
  followups: PendingFollowup[]
  stats: WeekStats
}

export default function WorkspaceHome() {
  const { profile, hasSubscription, refetchProfile } = useWorkspace()
  const granted = useRef(false)
  const [data, setData] = useState<TodayPayload | null>(null)
  const [loading, setLoading] = useState(true)

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

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const r = await fetch("/api/dashboard/today", { cache: "no-store" })
        if (!r.ok) return
        const json = await r.json() as TodayPayload
        if (mounted) setData(json)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  const firstName = profile?.first_name?.trim() || null
  const todayStr = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })

  return (
    <main style={{
      maxWidth: 980, margin: "0 auto",
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
          Aujourd&apos;hui · {todayStr}
        </span>
        <h1 style={{
          margin: 0, fontSize: "clamp(26px, 3.4vw, 34px)", fontWeight: 800,
          color: "#111827", letterSpacing: "-0.025em", lineHeight: 1.1,
        }}>
          Bonjour{firstName ? `, ${firstName}` : ""} 👋
        </h1>
        <p style={{ margin: "8px 0 28px", fontSize: 14.5, color: "#6B7280", lineHeight: 1.65 }}>
          {loading ? "Nora prépare ton récap…" : describeWorkload(data)}
        </p>
      </m.div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 18 }}>
        {/* Interviews */}
        <Section
          icon="📅"
          title="Entretiens du jour"
          count={data?.interviews.length ?? 0}
          loading={loading}
          empty="Aucun entretien programmé aujourd'hui."
          delay={0.05}
        >
          {data?.interviews.map((iv) => <InterviewRow key={iv.id} iv={iv} />)}
        </Section>

        {/* Replies */}
        <Section
          icon="✉"
          title="Nouvelles réponses"
          count={data?.replies.length ?? 0}
          loading={loading}
          empty="Aucune réponse récente."
          delay={0.1}
        >
          {data?.replies.map((r) => <ReplyRow key={r.id} r={r} />)}
        </Section>

        {/* Follow-ups */}
        <Section
          icon="⏰"
          title="Relances à faire"
          subtitle="(>5 jours sans réponse)"
          count={data?.followups.length ?? 0}
          loading={loading}
          empty="Tout est à jour — pas de relance en attente."
          delay={0.15}
        >
          {data?.followups.map((f) => <FollowupRow key={f.candidate_id} f={f} />)}
        </Section>

        {/* Week stats */}
        {data && (
          <m.div
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.22, ease: EASE }}
            style={{
              background: "white", border: "1px solid #F0ECF8", borderRadius: 16,
              padding: "18px 22px",
              display: "flex", gap: 28, flexWrap: "wrap", alignItems: "center",
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Cette semaine
            </span>
            <Stat label="Envoyés" value={data.stats.sent} />
            <Stat label="Réponses" value={data.stats.replies} />
            <Stat label="Taux" value={`${data.stats.response_rate}%`} />
            <Stat label="Entretiens" value={data.stats.interviews} />
          </m.div>
        )}

        {/* Calendly card — secondary, kept for setup convenience */}
        <Suspense fallback={null}>
          <CalendlyCard />
        </Suspense>
      </div>
    </main>
  )
}

function describeWorkload(data: TodayPayload | null): string {
  if (!data) return ""
  const { interviews, replies, followups } = data
  const bits: string[] = []
  if (interviews.length) bits.push(`${interviews.length} entretien${interviews.length > 1 ? "s" : ""} aujourd'hui`)
  if (replies.length) bits.push(`${replies.length} réponse${replies.length > 1 ? "s" : ""} à traiter`)
  if (followups.length) bits.push(`${followups.length} relance${followups.length > 1 ? "s" : ""} à faire`)
  if (bits.length === 0) return "Rien d'urgent. C'est le bon moment pour sourcer de nouveaux profils."
  return bits.join(" · ")
}

function Section({
  icon, title, subtitle, count, loading, empty, delay, children,
}: {
  icon: string; title: string; subtitle?: string
  count: number; loading: boolean; empty: string; delay: number
  children: React.ReactNode
}) {
  return (
    <m.section
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: EASE }}
      style={{
        background: "white", border: "1px solid #F0ECF8", borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <header style={{
        padding: "16px 20px",
        borderBottom: count > 0 ? "1px solid #F0ECF8" : "none",
        display: "flex", alignItems: "baseline", gap: 10,
      }}>
        <span style={{ fontSize: 17 }}>{icon}</span>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#111827" }}>
          {title}
        </h2>
        {subtitle && (
          <span style={{ fontSize: 12, color: "#9CA3AF" }}>{subtitle}</span>
        )}
        <span style={{
          marginLeft: "auto",
          fontSize: 12, fontWeight: 700,
          color: count > 0 ? "#7C63C8" : "#9CA3AF",
          background: count > 0 ? "rgba(124,99,200,0.08)" : "transparent",
          padding: "2px 9px", borderRadius: 100,
        }}>
          {count}
        </span>
      </header>
      <div>
        {loading ? (
          <p style={{ margin: 0, padding: "18px 20px", fontSize: 13, color: "#9CA3AF" }}>
            Chargement…
          </p>
        ) : count === 0 ? (
          <p style={{ margin: 0, padding: "18px 20px", fontSize: 13, color: "#9CA3AF" }}>
            {empty}
          </p>
        ) : (
          children
        )}
      </div>
    </m.section>
  )
}

function InterviewRow({ iv }: { iv: TodayInterview }) {
  const hh = new Date(iv.start_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  const isVideo = !!iv.join_url
  return (
    <div style={{
      padding: "12px 20px", borderTop: "1px solid #F8F6FF",
      display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
    }}>
      <span style={{
        fontSize: 13, fontWeight: 800, color: "#7C63C8",
        minWidth: 52,
      }}>
        {hh}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {iv.candidate_name ?? "Candidat inconnu"}
          {iv.candidate_title && <span style={{ color: "#9CA3AF", fontWeight: 400 }}> · {iv.candidate_title}</span>}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#6B7280" }}>
          {iv.job_title ?? "Sans poste"} · {isVideo ? "Visio" : (iv.location_text ?? "Présentiel")}
        </p>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {iv.join_url && (
          <a href={iv.join_url} target="_blank" rel="noreferrer" style={pillBtn(true)}>
            Rejoindre
          </a>
        )}
        {iv.candidate_id && (
          <Link href={`/workspace/vivier/${iv.candidate_id}`} style={pillBtn(false)}>
            Fiche →
          </Link>
        )}
      </div>
    </div>
  )
}

function ReplyRow({ r }: { r: RecentReply }) {
  const sentiment = sentimentMeta(r.ai_sentiment)
  return (
    <div style={{
      padding: "12px 20px", borderTop: "1px solid #F8F6FF",
      display: "flex", alignItems: "flex-start", gap: 12,
    }}>
      <span title={sentiment.label} style={{
        marginTop: 3, width: 8, height: 8, borderRadius: "50%",
        background: sentiment.color, flexShrink: 0,
      }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "#111827" }}>
          {r.candidate_name ?? "Candidat inconnu"}
          <span style={{ color: "#9CA3AF", fontWeight: 400, fontSize: 11.5, marginLeft: 8 }}>
            {timeAgo(r.created_at)}
          </span>
        </p>
        {r.ai_summary && (
          <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "#4B5563", lineHeight: 1.55 }}>
            {r.ai_summary}
          </p>
        )}
        {r.ai_suggested_stage && (
          <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "#7C63C8", fontWeight: 600 }}>
            ✦ Suggéré : avancer vers <em style={{ fontStyle: "normal", textTransform: "lowercase" }}>{r.ai_suggested_stage}</em>
          </p>
        )}
      </div>
      {r.candidate_id && (
        <Link href={`/workspace/vivier/${r.candidate_id}`} style={pillBtn(false)}>
          Voir →
        </Link>
      )}
    </div>
  )
}

function FollowupRow({ f }: { f: PendingFollowup }) {
  return (
    <div style={{
      padding: "12px 20px", borderTop: "1px solid #F8F6FF",
      display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {f.candidate_name ?? "Candidat inconnu"}
          {f.job_title && <span style={{ color: "#9CA3AF", fontWeight: 400 }}> · {f.job_title}</span>}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#92400E" }}>
          Contacté il y a {f.days_since} jour{f.days_since > 1 ? "s" : ""} — sans réponse
        </p>
      </div>
      <Link href={`/workspace/vivier/${f.candidate_id}`} style={pillBtn(true)}>
        Relancer →
      </Link>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em", lineHeight: 1 }}>
        {value}
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 11, color: "#9CA3AF", letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label}
      </p>
    </div>
  )
}

function pillBtn(primary: boolean): React.CSSProperties {
  return {
    fontSize: 12, fontWeight: 600,
    color: primary ? "white" : "#7C63C8",
    background: primary ? "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)" : "rgba(124,99,200,0.08)",
    border: primary ? "none" : "1px solid rgba(124,99,200,0.16)",
    padding: "7px 12px", borderRadius: 8,
    textDecoration: "none",
    fontFamily: "inherit",
    cursor: "pointer",
    display: "inline-flex", alignItems: "center",
  }
}

function sentimentMeta(s: string | null): { color: string; label: string } {
  switch (s) {
    case "interested":     return { color: "#16a34a", label: "Intéressé" }
    case "not_interested": return { color: "#9CA3AF", label: "Pas intéressé" }
    case "question":       return { color: "#F59E0B", label: "Question" }
    case "negotiation":    return { color: "#7C63C8", label: "Négociation" }
    default:               return { color: "#D1D5DB", label: "Neutre" }
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 60) return `il y a ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h}h`
  const d = Math.floor(h / 24)
  return `il y a ${d}j`
}
