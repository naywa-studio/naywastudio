"use client"

/**
 * MonthlyMarginChart — marge mensuelle réelle sur la durée de la mission.
 *
 * Pour chaque mois calendaire de la mission, on calcule :
 *
 *   marge(mois) = TJM × jours_travaillés_réels(mois)
 *               − ( coût_fixe_mensuel + coût_variable_journalier × jours_réels )
 *
 * Les jours travaillés viennent du VRAI calendrier français (Lun-Ven hors
 * fériés), pas d'un profil statistique. Le creux d'août, le pic d'octobre
 * et tous les fériés sont reflétés à l'euro près.
 *
 * Comportement attendu :
 * - Pic à octobre 2025 (22-23 jours ouvrés) → marge max
 * - Creux à mai 2025 (3 fériés) → marge mid
 * - Creux à août 2025 (15/08 férié + tradition CP non modélisés ici) → marge basse
 * - Mois partiels (début/fin de mission mi-mois) gérés précisément
 */

import { useMemo } from "react"
import {
  computeEmployerCost,
  type PricingInputs,
} from "@/lib/pricing/syntec"
import { missionMonthProfile, MONTH_ABBR_FR } from "@/lib/pricing/calendar"

interface Props {
  inputs: PricingInputs
  /** Date de début de la mission (ISO string ou Date). */
  startDate: Date | string | null
  /** Durée de la mission en mois calendaires. */
  durationMonths: number
  /** TJM client (€/jour HT). */
  tjm: number
  /** Seuil marge mini cabinet (%) — affiché en pointillé. */
  margeMinPct?: number
}

const W = 760
const H = 380
const PAD_L = 56
const PAD_R = 16
const PAD_T = 30
const PAD_B = 70

const PLOT_W = W - PAD_L - PAD_R
const PLOT_H = H - PAD_T - PAD_B

export default function MonthlyMarginChart({
  inputs, startDate, durationMonths, tjm, margeMinPct,
}: Props) {
  // Parse start date robustly (string ISO ou Date)
  const start = useMemo(() => {
    if (!startDate) return new Date()
    if (startDate instanceof Date) return startDate
    const d = new Date(startDate)
    return Number.isNaN(d.getTime()) ? new Date() : d
  }, [startDate])

  const cost = useMemo(() => computeEmployerCost(inputs), [inputs])

  const monthProfiles = useMemo(
    () => missionMonthProfile(start, Math.max(1, durationMonths || 12)),
    [start, durationMonths],
  )

  // Pour chaque mois : revenu, coût, marge €, marge %
  const points = useMemo(() => monthProfiles.map((mp) => {
    const revenu = tjm * mp.workingDays
    const coutTotal = cost.coutFixeMensuel + cost.coutVariableJournalier * mp.workingDays
    const marge = revenu - coutTotal
    const margePct = revenu > 0 ? (marge / revenu) * 100 : 0
    return {
      monthIndex: mp.monthIndex,
      year: mp.year,
      calendarMonth: mp.calendarMonth,
      workingDays: mp.workingDays,
      isPartial: mp.isPartial,
      revenu,
      coutTotal,
      marge,
      margePct,
    }
  }), [monthProfiles, tjm, cost])

  if (points.length === 0) {
    return (
      <div style={{
        background: "white", borderRadius: 12, border: "1px solid #F0ECF8",
        padding: 20, color: "#9CA3AF", fontSize: 13, textAlign: "center",
      }}>
        Renseigne <strong>la date de démarrage</strong> et <strong>la durée</strong> de
        la mission pour afficher l&apos;évolution de la marge mensuelle.
      </div>
    )
  }

  // Y range — inclut 0 et marge mini si défini
  const allMargins = points.map((p) => p.marge)
  const yMinRaw = Math.min(0, ...allMargins)
  const yMaxRaw = Math.max(0, ...allMargins)
  const span = Math.max(yMaxRaw - yMinRaw, 1)
  const yMin = yMinRaw - span * 0.08
  const yMax = yMaxRaw + span * 0.12
  const yRange = yMax - yMin

  const xOf = (i: number): number => {
    // Bars centered on their slot
    const slotW = PLOT_W / points.length
    return PAD_L + slotW * i + slotW / 2
  }
  const yOf = (eur: number): number =>
    PAD_T + (1 - (eur - yMin) / yRange) * PLOT_H
  const zeroY = yOf(0)
  const slotW = PLOT_W / points.length
  const barW = Math.max(8, slotW * 0.7)

  // Y ticks — 5 paliers
  const yTickVals: number[] = []
  for (let t = 0; t <= 4; t++) {
    yTickVals.push(yMin + (yRange * t) / 4)
  }

  // Marge mini en € si seuil défini → assets sur revenu moyen
  const revenuMoyen = points.reduce((s, p) => s + p.revenu, 0) / points.length
  const seuilMinEuros = margeMinPct !== undefined ? revenuMoyen * (margeMinPct / 100) : null

  // Color pour chaque barre : gradient selon marge %
  const barColor = (margePct: number): string => {
    if (margePct < 0) return "#DC2626"
    if (margePct < (margeMinPct ?? 15)) return "#EA580C"
    if (margePct < (margeMinPct ?? 15) + 10) return "#F59E0B"
    return "#16A34A"
  }

  return (
    <div style={{
      background: "white", borderRadius: 12, border: "1px solid #F0ECF8",
      padding: 16,
    }}>
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        flexWrap: "wrap", gap: 10, marginBottom: 10,
      }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#111827" }}>
            Évolution de la marge mensuelle (calendrier réel)
          </h4>
          <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "#6B7280", maxWidth: 600, lineHeight: 1.5 }}>
            Marge = <strong>TJM × jours travaillés du mois</strong> − coût employeur.
            Jours = vrais jours ouvrés français (Lun-Ven hors fériés). Pic en octobre
            (22-23 j), creux en mai (3 fériés) et août (15/08). CP/RTT du candidat
            non modélisés en V1 — on suppose qu&apos;il travaille tous les jours ouvrés.
          </p>
        </div>
      </header>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%" height="auto" role="img"
        aria-label={`Évolution marge mensuelle sur ${points.length} mois`}
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Y grid + ticks */}
        {yTickVals.map((v) => (
          <g key={`y-${v}`}>
            <line
              x1={PAD_L} y1={yOf(v)} x2={W - PAD_R} y2={yOf(v)}
              stroke={Math.abs(v) < 1 ? "#9CA3AF" : "#F0ECF8"}
              strokeWidth={Math.abs(v) < 1 ? 1.2 : 1}
              strokeDasharray={Math.abs(v) < 1 ? "none" : "2 4"}
            />
            <text
              x={PAD_L - 8} y={yOf(v) + 3}
              fontSize={10} fill="#6B7280" textAnchor="end"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatEurCompact(v)}
            </text>
          </g>
        ))}

        {/* Seuil mini cabinet */}
        {seuilMinEuros !== null && margeMinPct !== undefined && (
          <>
            <line
              x1={PAD_L} y1={yOf(seuilMinEuros)} x2={W - PAD_R} y2={yOf(seuilMinEuros)}
              stroke="#D97706" strokeWidth={1.2} strokeDasharray="5 4" opacity={0.7}
            />
            <text
              x={W - PAD_R - 4} y={yOf(seuilMinEuros) - 4}
              fontSize={10} fill="#D97706" textAnchor="end" fontWeight={700}
            >
              seuil mini {margeMinPct} %
            </text>
          </>
        )}

        {/* Bars */}
        {points.map((p, i) => {
          const h = p.marge >= 0 ? zeroY - yOf(p.marge) : yOf(p.marge) - zeroY
          const y = p.marge >= 0 ? yOf(p.marge) : zeroY
          return (
            <g key={p.monthIndex}>
              <rect
                x={xOf(i) - barW / 2}
                y={y}
                width={barW}
                height={Math.max(1, h)}
                fill={barColor(p.margePct)}
                opacity={0.85}
                rx={2}
              >
                <title>
                  {MONTH_ABBR_FR[p.calendarMonth]} {p.year} — {p.workingDays} j ouvrés
                  {"\n"}Revenu : {formatEur(p.revenu)} | Coût : {formatEur(p.coutTotal)}
                  {"\n"}Marge : {formatEur(p.marge)} ({p.margePct.toFixed(1)} %)
                  {p.isPartial ? "\n(mois partiel)" : ""}
                </title>
              </rect>
              {/* % label au sommet de la barre si la barre est assez large */}
              {barW >= 18 && (
                <text
                  x={xOf(i)} y={y - 3}
                  fontSize={9} fill="#374151" textAnchor="middle" fontWeight={700}
                >
                  {p.margePct.toFixed(0)}%
                </text>
              )}
            </g>
          )
        })}

        {/* Zero line */}
        {yMin < 0 && yMax > 0 && (
          <line
            x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY}
            stroke="#9CA3AF" strokeWidth={1.5}
          />
        )}

        {/* X labels — chaque N mois selon densité */}
        {points.map((p, i) => {
          const everyN = points.length <= 12 ? 1 : points.length <= 24 ? 2 : 3
          if (i % everyN !== 0 && i !== points.length - 1) return null
          return (
            <g key={`x-${p.monthIndex}`}>
              <text
                x={xOf(i)} y={PAD_T + PLOT_H + 16}
                fontSize={10} fill="#6B7280" textAnchor="middle"
                fontWeight={p.isPartial ? 400 : 600}
              >
                {MONTH_ABBR_FR[p.calendarMonth]}
              </text>
              <text
                x={xOf(i)} y={PAD_T + PLOT_H + 30}
                fontSize={9} fill="#9CA3AF" textAnchor="middle"
              >
                {p.year}
              </text>
              <text
                x={xOf(i)} y={PAD_T + PLOT_H + 44}
                fontSize={9.5} fill="#7C63C8" textAnchor="middle" fontWeight={700}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {p.workingDays}j
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────── */

function formatEur(v: number): string {
  const sign = v < 0 ? "−" : ""
  return `${sign}${Math.abs(Math.round(v)).toLocaleString("fr-FR")} €`
}
function formatEurCompact(v: number): string {
  const sign = v < 0 ? "−" : ""
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(1)} M€`
  if (a >= 1_000) return `${sign}${(a / 1_000).toFixed(0)} k€`
  return `${sign}${Math.round(a)} €`
}
