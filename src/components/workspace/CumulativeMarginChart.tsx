"use client"

/**
 * CumulativeMarginChart — rentabilité cumulée de la mission, en € réels.
 *
 * Réponds à la question "à partir de quel mois la mission a-t-elle généré
 * autant en marge qu'elle me coûte si rupture employeur ?" — break-even.
 *
 *   margeCumulee_nominal(X) = Σ marge_nominale_t, t = 1..X
 *   margeCumulee_worst(X)   = Σ marge_worst_t,    t = 1..X
 *
 * Les CP et RTT sont déjà comptés (cf. MarginEvolutionChart). Pas besoin
 * d'ajouter quoi que ce soit ici, c'est juste la cumulative des points.
 */

import { useMemo } from "react"
import {
  computeRuptureScenarios,
  type PricingInputs,
} from "@/lib/pricing/syntec"

interface Props {
  inputs: PricingInputs
  dureeMois: number
  tjm: number
  typeContrat?: 'cdi' | 'cdd'
  dureeCDD?: number
  startMonthIndex?: number
}

const W = 720
const H = 280
const PAD_L = 70
const PAD_R = 16
const PAD_T = 28
const PAD_B = 40

const PLOT_W = W - PAD_L - PAD_R
const PLOT_H = H - PAD_T - PAD_B

const HORIZON_MOIS = 24
const MONTH_ABBR = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

export default function CumulativeMarginChart({
  inputs, dureeMois, tjm, typeContrat = 'cdi', dureeCDD, startMonthIndex,
}: Props) {
  const scenarios = useMemo(
    () => computeRuptureScenarios(inputs, HORIZON_MOIS, tjm, {
      typeContrat,
      dureeCDD: dureeCDD ?? dureeMois,
      startMonthIndex,
    }),
    [inputs, tjm, typeContrat, dureeCDD, dureeMois, startMonthIndex],
  )

  const nominal = scenarios.nominal
  const mild = scenarios.mild
  const worst = scenarios.worstCase

  const allValues = [
    ...nominal.map((p) => p.margeCumulee),
    ...mild.map((p) => p.margeCumulee),
    ...worst.map((p) => p.margeCumulee),
    0,
  ]
  const yMinRaw = Math.min(...allValues)
  const yMaxRaw = Math.max(...allValues)
  const span = Math.max(yMaxRaw - yMinRaw, 1)
  const yMin = yMinRaw - span * 0.08
  const yMax = yMaxRaw + span * 0.10
  const yRange = yMax - yMin || 1

  const xOf = (mois: number): number =>
    PAD_L + (mois / HORIZON_MOIS) * PLOT_W
  const yOf = (eur: number): number =>
    PAD_T + (1 - (eur - yMin) / yRange) * PLOT_H

  const pathFor = (points: { mois: number; margeCumulee: number }[]): string =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.mois).toFixed(2)} ${yOf(p.margeCumulee).toFixed(2)}`)
      .join(" ")

  const zeroY = yOf(0)
  const finMissionX = dureeMois > 0 && dureeMois < HORIZON_MOIS ? xOf(dureeMois) : null

  // Break-even : premier mois où chaque cumulative repasse au positif
  const breakEvenWorst = worst.find((p) => p.margeCumulee >= 0)
  const breakEvenMild = mild.find((p) => p.margeCumulee >= 0)
  const breakEvenNomi = nominal.find((p) => p.margeCumulee >= 0)

  const xTicks = [0, 3, 6, 9, 12, 15, 18, 21, 24]
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + t * yRange)

  const endNomi = nominal.at(-1)
  const endMild = mild.at(-1)
  const endWorst = worst.at(-1)

  const calendarLabel = (t: number): string => {
    if (t === 0 || nominal.length === 0) return ""
    const point = nominal[Math.min(t, nominal.length) - 1]
    return MONTH_ABBR[point.calendarMonthIndex] ?? ""
  }

  return (
    <div style={{
      background: "white", borderRadius: 12, border: "1px solid #F0ECF8",
      padding: 16, marginTop: 12,
    }}>
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        flexWrap: "wrap", gap: 10, marginBottom: 8,
      }}>
        <div>
          <h4 style={{
            margin: 0, fontSize: 13, fontWeight: 800, color: "#111827",
          }}>
            Marge cumulée — € depuis le démarrage
          </h4>
          <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "#6B7280", maxWidth: 580, lineHeight: 1.5 }}>
            Somme de la marge mensuelle depuis le mois 1. Tant que la courbe
            est sous zéro, la mission n&apos;a pas encore couvert son coût de
            rupture (worst case) ou ne génère rien (nominal). Le passage au
            positif = <strong>break-even</strong>.
          </p>
        </div>
        <Legend />
      </header>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%" height="auto" role="img"
        aria-label="Graphique marge cumulée en euros sur 24 mois"
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Y grid + ticks (en €) */}
        {yTicks.map((v) => (
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

        {/* X ticks */}
        {xTicks.map((m) => (
          <g key={`x-${m}`}>
            <line
              x1={xOf(m)} y1={PAD_T + PLOT_H} x2={xOf(m)} y2={PAD_T + PLOT_H + 4}
              stroke="#9CA3AF" strokeWidth={1}
            />
            <text
              x={xOf(m)} y={PAD_T + PLOT_H + 18}
              fontSize={10} fill="#6B7280" textAnchor="middle"
            >
              {m === 0 ? "Start" : `+${m}m`}
            </text>
            {m > 0 && (
              <text
                x={xOf(m)} y={PAD_T + PLOT_H + 32}
                fontSize={10} fill="#9CA3AF" textAnchor="middle" fontWeight={700}
              >
                {calendarLabel(m)}
              </text>
            )}
          </g>
        ))}

        {/* Fin de mission */}
        {finMissionX !== null && (
          <line
            x1={finMissionX} y1={PAD_T} x2={finMissionX} y2={PAD_T + PLOT_H}
            stroke="#7C63C8" strokeWidth={1.5} strokeDasharray="5 4"
          />
        )}

        {/* Curves — ordre de peinture : nominal en arrière, worst, mild devant */}
        <path d={pathFor(nominal)}
          fill="none" stroke="#2563EB" strokeWidth={2} opacity={0.85}
          strokeLinejoin="round" strokeLinecap="round"
          strokeDasharray="2 4"
        />
        <path d={pathFor(worst)}
          fill="none" stroke="#DC2626" strokeWidth={2.5}
          strokeLinejoin="round" strokeLinecap="round"
          strokeDasharray="6 4"
        />
        <path d={pathFor(mild)}
          fill="none" stroke="#16A34A" strokeWidth={2.8}
          strokeLinejoin="round" strokeLinecap="round"
        />

        {/* Break-even markers (mild only, le plus parlant pour le sourceur) */}
        {breakEvenMild && (
          <g>
            <circle cx={xOf(breakEvenMild.mois)} cy={zeroY} r={4} fill="#16A34A" stroke="white" strokeWidth={1.5} />
            <text x={xOf(breakEvenMild.mois)} y={zeroY - 8} fontSize={9.5} fill="#16A34A" textAnchor="middle" fontWeight={700}>
              break-even +{breakEvenMild.mois}m
            </text>
          </g>
        )}
        {breakEvenWorst && breakEvenWorst.mois !== breakEvenMild?.mois && (
          <g>
            <circle cx={xOf(breakEvenWorst.mois)} cy={zeroY} r={4} fill="#DC2626" stroke="white" strokeWidth={1.5} />
            <text x={xOf(breakEvenWorst.mois)} y={zeroY + 14} fontSize={9.5} fill="#DC2626" textAnchor="middle" fontWeight={700}>
              break-even worst +{breakEvenWorst.mois}m
            </text>
          </g>
        )}

        {/* Endpoints */}
        {endNomi && <EndDot color="#2563EB" x={xOf(endNomi.mois)} y={yOf(endNomi.margeCumulee)} label={formatEur(endNomi.margeCumulee)} />}
        {endMild && <EndDot color="#16A34A" x={xOf(endMild.mois)} y={yOf(endMild.margeCumulee)} label={formatEur(endMild.margeCumulee)} />}
        {endWorst && <EndDot color="#DC2626" x={xOf(endWorst.mois)} y={yOf(endWorst.margeCumulee)} label={formatEur(endWorst.margeCumulee)} />}

        {/* prévenir warning unused */}
        {breakEvenNomi !== undefined && null}

        {/* Zero line — toujours visible si on traverse */}
        {yMin < 0 && yMax > 0 && (
          <line
            x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY}
            stroke="#9CA3AF" strokeWidth={1.5}
          />
        )}
      </svg>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────── */

function Legend() {
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
      fontSize: 11, color: "#6B7280",
    }}>
      <LegendDot color="#16A34A" label="Cumul préavis 1 mois" />
      <LegendDot color="#DC2626" label="Cumul worst Syntec" dashed />
      <LegendDot color="#2563EB" label="Cumul sans rupture" dashed />
    </div>
  )
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{
        display: "inline-block", width: 18, height: 3, borderRadius: 2,
        background: dashed
          ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)`
          : color,
      }} />
      <span>{label}</span>
    </span>
  )
}

function EndDot({ color, x, y, label }: { color: string; x: number; y: number; label: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={3.5} fill={color} stroke="white" strokeWidth={1.5} />
      <text
        x={x - 6} y={y - 6}
        fontSize={10.5} fill={color} fontWeight={700} textAnchor="end"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {label}
      </text>
    </g>
  )
}

function formatEur(v: number): string {
  const sign = v < 0 ? "−" : ""
  const a = Math.abs(Math.round(v))
  return `${sign}${a.toLocaleString("fr-FR")} €`
}
function formatEurCompact(v: number): string {
  const sign = v < 0 ? "−" : ""
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(1)} M€`
  if (a >= 1_000) return `${sign}${(a / 1_000).toFixed(0)} k€`
  return `${sign}${Math.round(a)} €`
}
