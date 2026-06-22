"use client"

/**
 * Jauges quota stockage + LLM, pour le panneau "Mes packages" dans
 * /organisation et la section accueil du workspace.
 *
 * Affichage : barre + % (toujours visible), valeur absolue "X utilisés
 * ce mois" (toujours), valeur "X / Y" seulement au-delà de 70%.
 * Tooltip "Voir détail" ouvre une mini-modale avec le plan + extras.
 *
 * Couleur : verte 0-70%, ambrée 70-90%, rouge 90-100%.
 *
 * Refetch toutes les 60s pour suivre l'usage en temps quasi-réel sans
 * spammer l'API.
 */

import { useEffect, useState } from "react"
import { formatBytes, quotaPercent } from "@/lib/quota-tiers"

interface QuotaResponse {
  storage: { used_bytes: number; limit_bytes: number }
  llm: { used: number; limit: number; period_start: string }
  plan: { source: string; label: string }
}

const REFRESH_MS = 60_000

export function QuotaGauges({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<QuotaResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState<"storage" | "llm" | null>(null)

  useEffect(() => {
    let cancelled = false
    const fetchQuota = async () => {
      try {
        const res = await fetch("/api/quota", { cache: "no-store" })
        if (!res.ok) return
        const j = await res.json() as QuotaResponse
        if (!cancelled) { setData(j); setError(null) }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "erreur")
      }
    }
    void fetchQuota()
    const t = window.setInterval(fetchQuota, REFRESH_MS)
    return () => { cancelled = true; window.clearInterval(t) }
  }, [])

  if (error || !data) return null

  const storagePct = quotaPercent(data.storage.used_bytes, data.storage.limit_bytes)
  const llmPct = quotaPercent(data.llm.used, data.llm.limit)

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: compact ? 12 : 18,
      padding: compact ? 14 : 18,
      borderRadius: 14,
      border: "1px solid #F0ECF8",
      background: "white",
    }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h3 style={{
          margin: 0, fontSize: 13, fontWeight: 700, color: "#111827",
          letterSpacing: "-0.005em",
        }}>
          Utilisation ce mois
        </h3>
        <span style={{
          fontSize: 10.5, fontWeight: 700, color: "#7C63C8",
          letterSpacing: "0.04em", textTransform: "uppercase",
        }}>
          {data.plan.label}
        </span>
      </header>

      <Gauge
        label="Stockage"
        percent={storagePct}
        usedLabel={formatBytes(data.storage.used_bytes)}
        limitLabel={formatBytes(data.storage.limit_bytes)}
        showLimit={storagePct >= 70}
        onDetail={() => setDetailOpen("storage")}
      />

      <Gauge
        label="Crédits IA"
        percent={llmPct}
        usedLabel={`${data.llm.used.toLocaleString("fr-FR")} crédits`}
        limitLabel={`${data.llm.limit.toLocaleString("fr-FR")} max`}
        showLimit={llmPct >= 70}
        onDetail={() => setDetailOpen("llm")}
      />

      {detailOpen && (
        <DetailModal
          kind={detailOpen}
          plan={data.plan}
          storage={data.storage}
          llm={data.llm}
          onClose={() => setDetailOpen(null)}
        />
      )}
    </div>
  )
}

function Gauge({
  label, percent, usedLabel, limitLabel, showLimit, onDetail,
}: {
  label: string; percent: number; usedLabel: string; limitLabel: string
  showLimit: boolean; onDetail: () => void
}) {
  const color = percent >= 90 ? "#EF4444"
              : percent >= 70 ? "#F59E0B"
              : "#7C63C8"
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
      }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "#4B5563" }}>
          {label}
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: color }}>
          {percent}%
        </span>
      </div>
      <div style={{
        height: 8, borderRadius: 999,
        background: "rgba(229,231,235,0.6)",
        overflow: "hidden",
      }}>
        <div style={{
          width: `${percent}%`,
          height: "100%",
          background: color,
          transition: "width 400ms ease",
          borderRadius: 999,
        }} />
      </div>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        fontSize: 11.5, color: "#9CA3AF",
      }}>
        <span>
          {usedLabel}{showLimit ? ` / ${limitLabel}` : ""}
        </span>
        <button
          type="button"
          onClick={onDetail}
          style={{
            background: "none", border: "none", padding: 0,
            color: "#7C63C8", fontSize: 11.5, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Voir détail
        </button>
      </div>
    </div>
  )
}

function DetailModal({
  kind, plan, storage, llm, onClose,
}: {
  kind: "storage" | "llm"
  plan: { source: string; label: string }
  storage: { used_bytes: number; limit_bytes: number }
  llm: { used: number; limit: number; period_start: string }
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const title = kind === "storage" ? "Stockage" : "Crédits IA"
  const used = kind === "storage" ? formatBytes(storage.used_bytes) : llm.used.toLocaleString("fr-FR")
  const limit = kind === "storage" ? formatBytes(storage.limit_bytes) : llm.limit.toLocaleString("fr-FR")

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(17,24,39,0.40)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: "var(--font-inter), sans-serif",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 440,
        background: "white", borderRadius: 16, padding: 24,
        boxShadow: "0 20px 50px -20px rgba(17,24,39,0.30)",
      }}>
        <h2 style={{
          margin: "0 0 6px", fontSize: 18, fontWeight: 800, color: "#111827",
          letterSpacing: "-0.01em",
        }}>
          {title} — détail
        </h2>
        <p style={{
          margin: "0 0 18px", fontSize: 12.5, fontWeight: 600, color: "#7C63C8",
          letterSpacing: "0.04em", textTransform: "uppercase",
        }}>
          {plan.label}
        </p>

        <div style={{
          padding: "14px 16px", borderRadius: 12, background: "#F8F6FF",
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#111827", lineHeight: 1 }}>
            {used}<span style={{ fontSize: 14, fontWeight: 500, color: "#9CA3AF" }}> / {limit}</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: "#6B7280" }}>
            {kind === "storage"
              ? "Espace total occupé par vos CV. Le nettoyage des CV anciens libère du quota."
              : `Crédits réinitialisés le 1er de chaque mois. Période en cours depuis le ${formatDateFr(llm.period_start)}.`}
          </div>
        </div>

        <div style={{
          padding: "12px 14px", borderRadius: 10, background: "#FEFCE8",
          border: "1px solid #FDE68A",
          fontSize: 12.5, color: "#854D0E", lineHeight: 1.55,
        }}>
          <strong>Besoin de plus ?</strong> Contactez-nous via le bouton support
          dans le header — nous proposons des extensions sur mesure
          (+5 GB, +2 000 crédits IA, etc.).
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px", borderRadius: 9,
              border: "1px solid #E5E7EB", background: "white",
              color: "#374151", fontSize: 13, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

function formatDateFr(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric", month: "long", year: "numeric",
    })
  } catch { return iso }
}
