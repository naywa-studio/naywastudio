"use client"

/**
 * Jauge de capacité du vivier (nombre de CV), pour le panneau "Mes packages"
 * dans /organisation et l'en-tête de /workspace/vivier.
 *
 * MODÈLE CLIENT : un SEUL plafond montré = la capacité du vivier en CV.
 * Matchings + anonymisations restent illimités (on l'affiche comme argument).
 * Le stockage bytes + le cap LLM existent toujours en filet interne mais ne
 * sont PLUS montrés au client (opaques + fragiles).
 *
 * Deux variantes :
 *   - "card"   : bloc encadré (colonne "Mes packages" de /organisation).
 *   - "inline" : barre fine sur une ligne (en-tête du vivier).
 *
 * Refetch toutes les 60s pour suivre l'usage en quasi temps réel.
 */

import { useEffect, useState } from "react"
import { useLanguage } from "@/lib/i18n/LanguageContext"

interface QuotaResponse {
  cv: { used: number; limit: number }
  plan: { source: string; label: string }
}

const REFRESH_MS = 60_000

const copy = {
  fr: {
    talentPool: "Vivier",
    unlimitedShort: " CV · illimité",
    viewCapacityDetail: "Voir le détail de votre capacité vivier",
    capacityTitle: "Capacité du vivier",
    importedCvs: "CV importés",
    unlimited: "illimité",
    viewDetail: "Voir détail",
    unlimitedMatching: "Matchings et anonymisations illimités",
    unlimitedCapacity: " CV · capacité illimitée",
    adminUnlimitedBody: (
      <>Compte administrateur Naywa — capacité illimitée. Les matchings et
      anonymisations sont eux aussi <strong>illimités</strong>.</>
    ),
    remainingBody: (remaining: string) => (
      <>Il vous reste <strong>{remaining} CV</strong> à importer. Supprimer d&apos;anciens
      CV libère de la capacité. Les matchings et anonymisations sont <strong>illimités</strong>.</>
    ),
    needMore: "Besoin de plus de place ?",
    needMoreBody: " Contactez-nous via le bouton support dans le header — nous augmentons votre capacité sur mesure.",
    close: "Fermer",
  },
  en: {
    talentPool: "Talent pool",
    unlimitedShort: " CVs · unlimited",
    viewCapacityDetail: "See your talent pool capacity in detail",
    capacityTitle: "Talent pool capacity",
    importedCvs: "Imported CVs",
    unlimited: "unlimited",
    viewDetail: "View detail",
    unlimitedMatching: "Unlimited matching and anonymization",
    unlimitedCapacity: " CVs · unlimited capacity",
    adminUnlimitedBody: (
      <>Naywa admin account — unlimited capacity. Matching and
      anonymization are also <strong>unlimited</strong>.</>
    ),
    remainingBody: (remaining: string) => (
      <>You have <strong>{remaining} CVs</strong> left to import. Deleting old
      CVs frees up capacity. Matching and anonymization are <strong>unlimited</strong>.</>
    ),
    needMore: "Need more room?",
    needMoreBody: " Contact us via the support button in the header — we'll scale your capacity up.",
    close: "Close",
  },
}

function pct(used: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min(100, Math.round((used / limit) * 100))
}

function colorFor(p: number): string {
  return p >= 90 ? "#EF4444" : p >= 70 ? "#F59E0B" : "var(--nw-primary)"
}

function useQuota(): QuotaResponse | null {
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
  return data
}

export function QuotaGauges({
  variant = "card",
  compact = false,
  showPlan = true,
  showUnlimitedNote = true,
  title,
}: {
  variant?: "card" | "inline"
  compact?: boolean
  /** Affiche le libellé du plan (ex. "Package Sourcing — 2 personnes"). */
  showPlan?: boolean
  /** Affiche la ligne "Matchings et anonymisations illimités". */
  showUnlimitedNote?: boolean
  /** Remplace le titre "Capacité du vivier". */
  title?: string
}) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const data = useQuota()
  const [detailOpen, setDetailOpen] = useState(false)

  if (!data) return null

  const { used, limit } = data.cv
  // Comptes admin Naywa : capacité effectivement illimitée. On affiche quand
  // même la jauge (compteur + "illimité") plutôt que de la masquer — utile
  // pour vérifier le rendu, et honnête (pas de faux pourcentage).
  const isUnlimited = data.plan.source === "admin"
  const p = isUnlimited ? 0 : pct(used, limit)
  const color = colorFor(p)
  const locale = lang === "fr" ? "fr-FR" : "en-US"
  const usedFmt = used.toLocaleString(locale)
  const limitFmt = limit.toLocaleString(locale)

  if (variant === "inline") {
    return (
      <>
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "6px 12px", borderRadius: 10,
            border: "1px solid var(--nw-border-soft)", background: "white",
            cursor: "pointer", fontFamily: "inherit",
          }}
          title={t.viewCapacityDetail}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--nw-text-muted)", whiteSpace: "nowrap" }}>
            {t.talentPool}
          </span>
          {!isUnlimited && (
            <span style={{
              width: 90, height: 6, borderRadius: 999,
              background: "rgba(229,231,235,0.7)", overflow: "hidden",
            }}>
              <span style={{
                display: "block", width: `${p}%`, height: "100%",
                background: color, borderRadius: 999, transition: "width 400ms ease",
              }} />
            </span>
          )}
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--nw-text)", whiteSpace: "nowrap" }}>
            {usedFmt}
            <span style={{ color: "var(--nw-text-muted)", fontWeight: 500 }}>
              {isUnlimited ? t.unlimitedShort : ` / ${limitFmt} CV`}
            </span>
          </span>
        </button>
        {detailOpen && (
          <DetailModal used={used} limit={limit} plan={data.plan} onClose={() => setDetailOpen(false)} />
        )}
      </>
    )
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: compact ? 12 : 16,
      padding: compact ? 14 : 18,
      borderRadius: 14, border: "1px solid var(--nw-border-soft)", background: "white",
    }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--nw-text)", letterSpacing: "-0.005em" }}>
          {title ?? t.capacityTitle}
        </h3>
        {showPlan && (
          <span style={{
            fontSize: 10.5, fontWeight: 700, color: "var(--nw-primary)",
            letterSpacing: "0.04em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
          }}>
            {data.plan.label}
          </span>
        )}
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--nw-text-secondary)" }}>{t.importedCvs}</span>
          <span style={{ fontSize: 13.5, fontWeight: 800, color }}>
            {isUnlimited ? t.unlimited : `${p}%`}
          </span>
        </div>
        {!isUnlimited && (
          <div style={{ height: 8, borderRadius: 999, background: "rgba(229,231,235,0.6)", overflow: "hidden" }}>
            <div style={{
              width: `${p}%`, height: "100%", background: color,
              transition: "width 400ms ease", borderRadius: 999,
            }} />
          </div>
        )}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          fontSize: 11.5, color: "var(--nw-text-muted)",
        }}>
          <span>{isUnlimited ? `${usedFmt} CV` : `${usedFmt} / ${limitFmt} CV`}</span>
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            style={{
              background: "none", border: "none", padding: 0,
              color: "var(--nw-primary)", fontSize: 11.5, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {t.viewDetail}
          </button>
        </div>
      </div>

      {showUnlimitedNote && (
        <p style={{
          margin: 0, fontSize: 11.5, color: "var(--nw-text-muted)", lineHeight: 1.5,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22C55E"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {t.unlimitedMatching}
        </p>
      )}

      {detailOpen && (
        <DetailModal used={used} limit={limit} plan={data.plan} onClose={() => setDetailOpen(false)} />
      )}
    </div>
  )
}

function DetailModal({
  used, limit, plan, onClose,
}: {
  used: number; limit: number
  plan: { source: string; label: string }
  onClose: () => void
}) {
  const { lang } = useLanguage()
  const t = copy[lang]
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const isUnlimited = plan.source === "admin"
  const locale = lang === "fr" ? "fr-FR" : "en-US"
  const usedFmt = used.toLocaleString(locale)
  const limitFmt = limit.toLocaleString(locale)
  const remaining = Math.max(0, limit - used).toLocaleString(locale)

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
      }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{
          margin: "0 0 6px", fontSize: 18, fontWeight: 800, color: "var(--nw-text)", letterSpacing: "-0.01em",
        }}>
          {t.capacityTitle}
        </h2>
        <p style={{
          margin: "0 0 18px", fontSize: 12.5, fontWeight: 600, color: "var(--nw-primary)",
          letterSpacing: "0.04em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
        }}>
          {plan.label}
        </p>

        <div style={{ padding: "14px 16px", borderRadius: 12, background: "var(--nw-bg)", marginBottom: 16 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--nw-text)", lineHeight: 1 }}>
            {usedFmt}<span style={{ fontSize: 14, fontWeight: 500, color: "var(--nw-text-muted)" }}>
              {isUnlimited ? t.unlimitedCapacity : ` / ${limitFmt} CV`}
            </span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--nw-text-muted)" }}>
            {isUnlimited ? t.adminUnlimitedBody : t.remainingBody(remaining)}
          </div>
        </div>

        {!isUnlimited && (
          <div style={{
            padding: "12px 14px", borderRadius: 10, background: "#FEFCE8",
            border: "1px solid #FDE68A", fontSize: 12.5, color: "#854D0E", lineHeight: 1.55,
          }}>
            <strong>{t.needMore}</strong>{t.needMoreBody}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px", borderRadius: 9,
              border: "1px solid var(--nw-border)", background: "white",
              color: "var(--nw-text-body)", fontSize: 13, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  )
}
