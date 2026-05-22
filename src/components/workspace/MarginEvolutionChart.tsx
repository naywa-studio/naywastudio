"use client"

/**
 * MarginEvolutionChart — pour chaque mois X entre 1 et 24, montre la
 * marge JOURNALIÈRE moyenne effective qu'aura généré la mission si le
 * contrat est rompu à ce mois-là. C'est un graphique de RISQUE.
 *
 * Formule : marge_jour(X) = marge_cumulée_nette(X) / jours_écoulés(X)
 *
 * Sur l'horizon 24 mois (fixé pour cadrer les deux seuils Syntec :
 * 8 mois entrée indemnité Article 4.5, 24 mois saut 1/4→1/3 cadre).
 *
 * Trois scénarios :
 *   1. Sans intercontrat (rupture amiable) — converge vers la marge
 *      nominale (TJM − coût employeur / jours) quasi instantanément
 *   2. +1 mois intercontrat — démarrage négatif, remonte vers le
 *      plateau nominal en quelques mois
 *   3. +préavis Syntec — plongeon initial le plus profond (préavis
 *      3 mois cadre + indemnité Article 4.5 qui croît avec
 *      l'ancienneté), remontée plus lente, cassures aux seuils
 *
 * Au mois 1, les courbes 2 et 3 sont très négatives — c'est
 * exactement la zone de risque que le sourceur doit voir.
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
  /** Mission duration in months — drawn as a vertical "fin prévue" marker.
   *  The chart itself always spans 24 months for risk-horizon consistency. */
  dureeMois: number
  /** Daily rate billed to the client. Drives the revenue side of margin. */
  tjm: number
}

const W = 720          // viewBox width — scales fluidly via 100% width
const H = 340          // viewBox height
const PAD_L = 64       // left axis label
const PAD_R = 16
const PAD_T = 28       // legend
const PAD_B = 48       // X axis labels + month/year row

const PLOT_W = W - PAD_L - PAD_R
const PLOT_H = H - PAD_T - PAD_B

/** Risk horizon — 24 months covers both seniority thresholds (8 mois and
 *  2 ans) where Article 4.5 indemnity formula changes for cadres. */
const HORIZON_MOIS = 24

export default function MarginEvolutionChart({ inputs, dureeMois, tjm }: Props) {
  const scenarios = useMemo(
    () => computeRuptureScenarios(inputs, HORIZON_MOIS, tjm),
    [inputs, tjm],
  )

  // Convert cumulative euros → daily margin € (over elapsed worked days).
  // Skip month 0 (division by zero) and start at month 1 instead.
  const joursParMois = inputs.joursFacturablesParMois
  const toDaily = (points: { mois: number; margeCumulee: number }[]) =>
    points
      .filter((p) => p.mois >= 1)
      .map((p) => ({
        mois: p.mois,
        margeJour: p.margeCumulee / (p.mois * joursParMois),
      }))
  const sansDaily = toDaily(scenarios.sansIntercontrat)
  const oneMoDaily = toDaily(scenarios.avec1MoisIntercontrat)
  const preavisDaily = toDaily(scenarios.avecPreavisMax)

  // Compute Y range — include 0 so the zero line is always visible.
  const allValues = [
    ...sansDaily.map((p) => p.margeJour),
    ...oneMoDaily.map((p) => p.margeJour),
    ...preavisDaily.map((p) => p.margeJour),
    0,
  ]
  // Clip absurd outliers from very-low-month divisions — keep within ±2× the
  // max stable margin so the curve readability isn't ruined by month-1 noise.
  const stableMax = Math.max(...sansDaily.map((p) => p.margeJour), 0)
  const clipMin = -2 * Math.abs(stableMax || 1000)
  const clamped = allValues.map((v) => Math.max(v, clipMin))
  const yMin = Math.min(...clamped)
  const yMax = Math.max(...clamped)
  const yRange = yMax - yMin || 1

  // Coordinate mappers — X axis is the 24-month risk horizon, fixed.
  const xOf = (mois: number): number =>
    PAD_L + (mois / HORIZON_MOIS) * PLOT_W
  const yOf = (margin: number): number =>
    PAD_T + (1 - (margin - yMin) / yRange) * PLOT_H

  const pathFor = (points: { mois: number; margeJour: number }[]): string =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.mois).toFixed(2)} ${yOf(Math.max(p.margeJour, clipMin)).toFixed(2)}`)
      .join(" ")

  const zeroY = yOf(0)
  const finEssaiX = xOf(Math.min(scenarios.finEssaiMois, HORIZON_MOIS))
  const finMissionX = dureeMois > 0 && dureeMois < HORIZON_MOIS ? xOf(dureeMois) : null

  // X ticks every 3 months (0, 3, 6, 9, 12, 15, 18, 21, 24)
  const xTicks = [0, 3, 6, 9, 12, 15, 18, 21, 24]

  // 4 Y ticks evenly spaced
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + t * yRange)

  const endNomi = sansDaily.at(-1)
  const end1m = oneMoDaily.at(-1)
  const endPreavis = preavisDaily.at(-1)

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
          <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "#6B7280", maxWidth: 540 }}>
            Pour chaque mois X, marge <strong>journalière moyenne</strong> que vous
            auriez générée <strong>si le contrat est rompu à ce moment-là</strong>.
            Au début, les scénarios coûteux plongent en négatif (les indemnités
            n&apos;ont pas encore été amorties).
            {dureeMois > 0 && <> Ligne violette : fin prévue ({dureeMois} mois).</>}
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
              {formatEurPerDay(v)}
            </text>
          </g>
        ))}

        {/* X ticks — every 3 months, with year labels at 12 and 24 */}
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
            {(m === 12 || m === 24) && (
              <text
                x={xOf(m)} y={PAD_T + PLOT_H + 32}
                fontSize={10} fill="#9CA3AF" textAnchor="middle" fontStyle="italic"
              >
                {m === 12 ? "1 an" : "2 ans"}
              </text>
            )}
          </g>
        ))}

        {/* Seuil indemnité Article 4.5 — 8 mois (entrée du droit à indemnité) */}
        <line
          x1={xOf(8)} y1={PAD_T} x2={xOf(8)} y2={PAD_T + PLOT_H}
          stroke="#9CA3AF" strokeWidth={1} strokeDasharray="3 3" opacity={0.6}
        />
        <text
          x={xOf(8)} y={PAD_T - 4}
          fontSize={9} fill="#6B7280" textAnchor="middle"
        >
          ┐ 8m
        </text>

        {/* Fin de mission prévue — ligne pointillée violette */}
        {finMissionX !== null && (
          <>
            <line
              x1={finMissionX} y1={PAD_T} x2={finMissionX} y2={PAD_T + PLOT_H}
              stroke="#7C63C8" strokeWidth={1.5} strokeDasharray="5 4"
            />
            <text
              x={finMissionX} y={PAD_T - 4}
              fontSize={10} fill="#7C63C8" textAnchor="middle" fontWeight={700}
            >
              fin prévue
            </text>
          </>
        )}

        {/* Curves — paint worst-case first so best-case stays on top */}
        <path d={pathFor(preavisDaily)}
          fill="none" stroke="#DC2626" strokeWidth={2.5}
          strokeLinejoin="round" strokeLinecap="round"
        />
        <path d={pathFor(oneMoDaily)}
          fill="none" stroke="#D97706" strokeWidth={2.5}
          strokeLinejoin="round" strokeLinecap="round"
        />
        <path d={pathFor(sansDaily)}
          fill="none" stroke="#16A34A" strokeWidth={2.5}
          strokeLinejoin="round" strokeLinecap="round"
        />

        {/* Endpoints at month 24 — daily margin labels */}
        {endNomi && <EndDot color="#16A34A" x={xOf(endNomi.mois)} y={yOf(endNomi.margeJour)} label={`${Math.round(endNomi.margeJour)} €/j`} />}
        {end1m && <EndDot color="#D97706" x={xOf(end1m.mois)} y={yOf(end1m.margeJour)} label={`${Math.round(end1m.margeJour)} €/j`} />}
        {endPreavis && <EndDot color="#DC2626" x={xOf(endPreavis.mois)} y={yOf(Math.max(endPreavis.margeJour, clipMin))} label={`${Math.round(endPreavis.margeJour)} €/j`} />}

        {/* Zero line — repaint on top of the bands */}
        {yMin < 0 && yMax > 0 && (
          <line
            x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY}
            stroke="#9CA3AF" strokeWidth={1.5}
          />
        )}
      </svg>

      <ScenarioSummary
        endNomi={endNomi?.margeJour ?? 0}
        end1m={end1m?.margeJour ?? 0}
        endPreavis={endPreavis?.margeJour ?? 0}
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
    `${v < 0 ? "−" : ""}${Math.abs(Math.round(v)).toLocaleString("fr-FR")} €/j`
  const tone = (v: number) =>
    v >= 0 ? "#15803d" : "#B91C1C"

  const rows = [
    { color: "#16A34A", label: "Best case — rupture amiable à 24 mois", value: endNomi },
    { color: "#D97706", label: "Réaliste — 1 mois d'intercontrat à 24 mois", value: end1m },
    { color: "#DC2626", label: `Worst case — licenciement + ${preavisMois}m préavis à 24 mois`, value: endPreavis },
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

/** Daily-rate-style formatter — values typically range -300 € to +250 €/jour. */
function formatEurPerDay(v: number): string {
  const sign = v < 0 ? "−" : ""
  const a = Math.abs(v)
  return `${sign}${Math.round(a)} €`
}
