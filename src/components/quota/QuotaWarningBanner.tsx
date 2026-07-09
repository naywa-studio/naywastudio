"use client"

/**
 * Banner discret en haut du workspace quand la capacité du vivier (nombre
 * de CV) dépasse 80%. Disparaît sous 80% (refetch toutes les 60s).
 *
 * À mettre dans le layout workspace + organisation. Reste muet en
 * dessous du seuil pour ne pas être anxiogène.
 */

import { useEffect, useState } from "react"
import Link from "next/link"

interface QuotaResponse {
  cv: { used: number; limit: number }
  plan?: { source: string }
}

const REFRESH_MS = 60_000
const WARN_PCT = 80
const CRIT_PCT = 100

function pct(used: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min(100, Math.round((used / limit) * 100))
}

export function QuotaWarningBanner() {
  const [data, setData] = useState<QuotaResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    const fetchQuota = async () => {
      try {
        const res = await fetch("/api/quota", { cache: "no-store" })
        if (!res.ok) return
        const j = await res.json() as QuotaResponse
        if (!cancelled) setData(j)
      } catch { /* silent */ }
    }
    void fetchQuota()
    const t = window.setInterval(fetchQuota, REFRESH_MS)
    return () => { cancelled = true; window.clearInterval(t) }
  }, [])

  if (!data) return null
  // Admin Naywa : capacité ~illimitée, pas de bannière.
  if (data.plan?.source === "admin") return null
  const max = pct(data.cv.used, data.cv.limit)

  if (max < WARN_PCT) return null

  const critical = max >= CRIT_PCT
  const kindLabel = "capacité de vivier"

  return (
    <div style={{
      padding: "10px 16px",
      marginBottom: 14,
      borderRadius: 10,
      background: critical
        ? "linear-gradient(90deg, rgba(254,202,202,0.85) 0%, rgba(254,202,202,0.95) 100%)"
        : "linear-gradient(90deg, rgba(254,243,199,0.95) 0%, rgba(253,230,138,0.85) 100%)",
      border: critical
        ? "1px solid rgba(220,38,38,0.30)"
        : "1px solid rgba(217,119,6,0.30)",
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      fontSize: 13,
      color: critical ? "#7F1D1D" : "#92400E",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke={critical ? "#B91C1C" : "#D97706"} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ flexShrink: 0 }} aria-hidden>
        <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>
        <path d="M12 9v4"/><path d="M12 17h.01"/>
      </svg>
      <span style={{ flex: 1, minWidth: 220 }}>
        <strong>
          {critical ? "Quota atteint" : "Quota proche de la limite"}
        </strong>
        {" — "}
        {critical
          ? `Vous avez atteint votre ${kindLabel}. Supprimez d'anciens CV ou contactez-nous pour un palier supérieur.`
          : `Vous approchez de votre ${kindLabel} (${max}%).`}
      </span>
      <Link
        href="/organisation"
        style={{
          padding: "6px 12px", borderRadius: 8,
          border: critical ? "1px solid rgba(220,38,38,0.40)" : "1px solid rgba(217,119,6,0.40)",
          background: "white",
          color: critical ? "#B91C1C" : "#92400E",
          fontSize: 12, fontWeight: 700, textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        Voir mes quotas →
      </Link>
    </div>
  )
}
