"use client"

/**
 * MarginEvolutionChart — visualises the cumulative margin a mission yields
 * across three rupture scenarios. Plain SVG, no chart library.
 *
 * Three curves (ordered from "best case" to "worst case") :
 *   1. sansIntercontrat       — mission goes to term, no break (best case)
 *   2. avec1MoisIntercontrat  — 1 paid idle month (realistic mid-case)
 *   3. avecPreavisMax         — full Syntec préavis paid by employer (worst)
 *
 * Visual cues :
 *   - 🟥 Red band covering the période d'essai (employer carries the
 *     recruitment + onboarding sunk cost; rupture is least costly here)
 *   - Zero line for visibility (when a curve dips into negative margin)
 *   - Hover-tooltip on the X axis isn't worth the JS for V1 — labels
 *     under the curve endpoints give the key "at-the-end-of-mission"
 *     reading directly.
 */

import { useMemo } from "react"
import {
  computeRuptureScenarios,
  type PricingInputs,
} from "@/lib/pricing/syntec"

interface Props {
  /** Same payload used to drive the live triangle, minus the brut field
   *  (caller injects the active brut at render time). */
  inputs: PricingInputs
  /** Mission duration in months — the chart's X range. */
  dureeMois: number
  /** Daily rate billed to the client. Drives the revenue side of margin. */
  tjm: number
}

const W = 720          // viewBox width — scales fluidly via 100% width
const H = 320          // viewBox height
const PAD_L = 64       // left axis label
const PAD_R = 16
const PAD_T = 28       // legend
const PAD_B = 36       // X axis labels

const PLOT_W = W - PAD_L - PAD_R
const PLOT_H = H - PAD_T - PAD_B

export default function MarginEvolutionChart({ inputs, dureeMois, tjm }: Props) {
  const scenarios = useMemo(
    () => computeRuptureScenarios(inputs, Math.max(1, dureeMois), tjm),
    [inputs, dureeMois, tjm],
  )

  // Compute Y range — include 0 so the zero line is always visible.
  const allValues = [
    ...scenarios.sansIntercontrat.map((p) => p.margeCumulee),
    ...scenarios.avec1MoisIntercontrat.map((p) => p.margeCumulee),
    ...scenarios.avecPreavisMax.map((p) => p.margeCumulee),
    0,
  ]
  const yMin = Math.min(...allValues)
  const yMax = Math.max(...allValues)
  const yRange = yMax - yMin || 1

  // Coordinate mappers — bake the padding so callers see plot-space coords.
  const xOf = (mois: number): number =>
    PAD_L + (mois / Math.max(1, dureeMois)) * PLOT_W
  const yOf = (margin: number): number =>
    PAD_T + (1 - (margin - yMin) / yRange) * PLOT_H

  const pathFor = (points: { mois: number; margeCumulee: number }[]): string =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.mois).toFixed(2)} ${yOf(p.margeCumulee).toFixed(2)}`)
      .join(" ")

  const zeroY = yOf(0)
  const finEssaiX = xOf(Math.min(scenarios.finEssaiMois, dureeMois))

  // Pick ~5 X ticks evenly spaced
  const xTickCount = Math.min(6, dureeMois + 1)
  const xTicks = Array.from({ length: xTickCount }, (_, i) =>
    Math.round((i / (xTickCount - 1)) * dureeMois),
  )

  // 4 Y ticks evenly spaced
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + t * yRange)

  const endNomi = scenarios.sansIntercontrat.at(-1)
  const end1m = scenarios.avec1MoisIntercontrat.at(-1)
  const endPreavis = scenarios.avecPreavisMax.at(-1)

  return (
    <div style={{
      background: "white", borderRadius: 12, border: "1px solid #F0ECF8",
      padding: 16,
    }}>
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        flexWrap: "wrap", gap: 10, marginBottom: 8,
      }}>
        <div>
          <h4 style={{
            margin: 0, fontSize: 13, fontWeight: 800, color: "#111827",
          }}>
            Évolution de la marge — 3 scénarios
          </h4>
          <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "#6B7280" }}>
            Marge cumulée €, du jour 0 à la fin de la mission ({dureeMois} mois).
            Zone rouge : période d&apos;essai · zone verte : mission rentabilisée
          </p>
        </div>
        <Legend preavisMois={scenarios.preavisMois} />
      </header>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%" height="auto" role="img"
        aria-label="Graphique évolution de la marge sur la durée de la mission"
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Background bands */}
        <rect
          x={PAD_L} y={PAD_T}
          width={finEssaiX - PAD_L} height={PLOT_H}
          fill="rgba(220,38,38,0.05)"
        />
        <rect
          x={finEssaiX} y={PAD_T}
          width={W - PAD_R - finEssaiX} height={PLOT_H}
          fill="rgba(34,197,94,0.04)"
        />

        {/* Period-of-essai label */}
        <text
          x={(PAD_L + finEssaiX) / 2} y={PAD_T - 10}
          fontSize={10} fill="#B91C1C" textAnchor="middle" fontWeight={700}
        >
          Période d&apos;essai
        </text>

        {/* Y grid + ticks */}
        {yTicks.map((v) => (
          <g key={`y-${v}`}>
            <line
              x1={PAD_L} y1={yOf(v)} x2={W - PAD_R} y2={yOf(v)}
              stroke={v === 0 ? "#9CA3AF" : "#F0ECF8"}
              strokeWidth={v === 0 ? 1.2 : 1}
              strokeDasharray={v === 0 ? "none" : "2 4"}
            />
            <text
              x={PAD_L - 8} y={yOf(v) + 3}
              fontSize={10} fill="#6B7280" textAnchor="end"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatShortEur(v)}
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
              {m === 0 ? "0" : `${m}m`}
            </text>
          </g>
        ))}

        {/* Curves — order matters for hover ordering */}
        <path d={pathFor(scenarios.avecPreavisMax)}
          fill="none" stroke="#DC2626" strokeWidth={2.5}
          strokeLinejoin="round" strokeLinecap="round"
        />
        <path d={pathFor(scenarios.avec1MoisIntercontrat)}
          fill="none" stroke="#D97706" strokeWidth={2.5}
          strokeLinejoin="round" strokeLinecap="round"
        />
        <path d={pathFor(scenarios.sansIntercontrat)}
          fill="none" stroke="#16A34A" strokeWidth={2.5}
          strokeLinejoin="round" strokeLinecap="round"
        />

        {/* Endpoints — small circles + labels for the final values */}
        {endNomi && <EndDot color="#16A34A" x={xOf(endNomi.mois)} y={yOf(endNomi.margeCumulee)} label={formatShortEur(endNomi.margeCumulee)} />}
        {end1m && <EndDot color="#D97706" x={xOf(end1m.mois)} y={yOf(end1m.margeCumulee)} label={formatShortEur(end1m.margeCumulee)} />}
        {endPreavis && <EndDot color="#DC2626" x={xOf(endPreavis.mois)} y={yOf(endPreavis.margeCumulee)} label={formatShortEur(endPreavis.margeCumulee)} />}

        {/* Zero line — repaint on top of the bands */}
        {yMin < 0 && yMax > 0 && (
          <line
            x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY}
            stroke="#9CA3AF" strokeWidth={1.5}
          />
        )}
      </svg>

      <ScenarioSummary
        endNomi={endNomi?.margeCumulee ?? 0}
        end1m={end1m?.margeCumulee ?? 0}
        endPreavis={endPreavis?.margeCumulee ?? 0}
        preavisMois={scenarios.preavisMois}
      />
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────── */

function Legend({ preavisMois }: { preavisMois: number }) {
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
      fontSize: 11, color: "#6B7280",
    }}>
      <LegendDot color="#16A34A" label="Sans intercontrat" />
      <LegendDot color="#D97706" label="+1 mois intercontrat" />
      <LegendDot color="#DC2626" label={`+préavis (${preavisMois} mois)`} />
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{
        display: "inline-block", width: 16, height: 3, borderRadius: 2,
        background: color,
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
        x={x + 6} y={y + 4}
        fontSize={10.5} fill={color} fontWeight={700}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {label}
      </text>
    </g>
  )
}

function ScenarioSummary({
  endNomi, end1m, endPreavis, preavisMois,
}: {
  endNomi: number
  end1m: number
  endPreavis: number
  preavisMois: number
}) {
  const fmt = (v: number) =>
    `${v < 0 ? "−" : ""}${Math.abs(Math.round(v)).toLocaleString("fr-FR")} €`
  const tone = (v: number) =>
    v >= 0 ? "#15803d" : "#B91C1C"

  const rows = [
    { color: "#16A34A", label: "Best case — mission au terme, replacement immédiat", value: endNomi },
    { color: "#D97706", label: "Réaliste — 1 mois d'intercontrat avant replacement", value: end1m },
    { color: "#DC2626", label: `Worst case — licenciement employeur + ${preavisMois}m préavis`, value: endPreavis },
  ]

  return (
    <div style={{
      marginTop: 14, paddingTop: 12, borderTop: "1px solid #F0ECF8",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      {rows.map((r) => (
        <div key={r.label} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          fontSize: 12.5, color: "#374151",
        }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{
              display: "inline-block", width: 12, height: 12, borderRadius: 3,
              background: r.color,
            }} />
            {r.label}
          </span>
          <span style={{
            fontWeight: 800, color: tone(r.value),
            fontVariantNumeric: "tabular-nums",
          }}>
            {fmt(r.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** "12 345 €" → "12 k" / "1 234 567 €" → "1.2 M". Keeps Y-axis tight. */
function formatShortEur(v: number): string {
  const sign = v < 0 ? "−" : ""
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(1)} M`
  if (a >= 1_000) return `${sign}${Math.round(a / 1_000)} k`
  return `${sign}${Math.round(a)}`
}
