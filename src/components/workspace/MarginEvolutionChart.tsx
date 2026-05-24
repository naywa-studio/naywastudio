"use client"

/**
 * MarginEvolutionChart — pour chaque mois X entre 1 et 24, marge
 * MENSUELLE effective générée par la mission si rupture à ce mois-là,
 * exprimée en % du revenu mensuel.
 *
 *   marge_pct(X) = ( revenu(X) − coût_employeur − coût_rupture(X)/X ) / revenu(X)
 *
 * Le creux d'août et le pic d'octobre que tu vois sont la traduction
 * directe des CP / RTT du candidat : ils sont déjà comptés dans la
 * baisse des jours facturables ce mois-là (et le brut + charges continuent
 * d'être payés). Pas besoin de ligne séparée "coût CP".
 *
 * Comportement attendu :
 * - Pendant la période d'essai : pas d'indemnité légalement payable
 *   → les deux courbes se confondent sur le plateau nominal qui ondule
 * - À la fin de la période d'essai : CHUTE brutale de la rouge (worst case)
 *   → préavis + indemnité Article 4.5 deviennent payables, amortis sur peu
 *     de mois → impact maximum
 * - Mois suivants : remontée progressive — même coût rupture amorti sur
 *   plus de mois pèse moins lourd mensuellement
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
  /** Type de contrat — drives which branch of the decision tree applies. */
  typeContrat?: 'cdi' | 'cdd'
  /** CDD duration in months — required when typeContrat is 'cdd'. */
  dureeCDD?: number
  /** Mois calendaire de démarrage (0=Jan … 11=Déc). Par défaut : mois courant. */
  startMonthIndex?: number
  /** Seuil marge mini cabinet (%) — tracé en pointillé pour visualiser
   *  la zone "sous le seuil" en post-essai. */
  margeMinPct?: number
}

const W = 720          // viewBox width — scales fluidly via 100% width
const H = 340          // viewBox height
const PAD_L = 56       // left axis label
const PAD_R = 16
const PAD_T = 28       // legend
const PAD_B = 56       // X axis labels + month/year row

const PLOT_W = W - PAD_L - PAD_R
const PLOT_H = H - PAD_T - PAD_B

const HORIZON_MOIS = 24

const MONTH_ABBR = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

export default function MarginEvolutionChart({
  inputs, dureeMois, tjm, typeContrat = 'cdi', dureeCDD,
  startMonthIndex, margeMinPct,
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
  const worst = scenarios.worstCase

  // Y range in PERCENT — include 0 always, include the seuil if defined
  const pctValues = [
    ...nominal.map((p) => p.margePct),
    ...worst.map((p) => p.margePct),
    0,
    ...(margeMinPct !== undefined ? [margeMinPct] : []),
  ]
  const yMinRaw = Math.min(...pctValues)
  const yMaxRaw = Math.max(...pctValues)
  const span = Math.max(yMaxRaw - yMinRaw, 1)
  const yMin = yMinRaw - span * 0.10
  const yMax = yMaxRaw + span * 0.10
  const yRange = yMax - yMin || 1

  const xOf = (mois: number): number =>
    PAD_L + (mois / HORIZON_MOIS) * PLOT_W
  const yOf = (pct: number): number =>
    PAD_T + (1 - (pct - yMin) / yRange) * PLOT_H

  const pathFor = (points: { mois: number; margePct: number }[]): string =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.mois).toFixed(2)} ${yOf(p.margePct).toFixed(2)}`)
      .join(" ")

  const zeroY = yOf(0)
  const seuilY = margeMinPct !== undefined ? yOf(margeMinPct) : null
  const finEssaiX = xOf(Math.min(scenarios.finEssaiMois, HORIZON_MOIS))
  const finMissionX = dureeMois > 0 && dureeMois < HORIZON_MOIS ? xOf(dureeMois) : null

  // X ticks every 3 months
  const xTicks = [0, 3, 6, 9, 12, 15, 18, 21, 24]
  // 5 Y ticks evenly spaced (always integer percents)
  const yTickVals = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + t * yRange)

  const endNomi = nominal.at(-1)
  const endWorst = worst.at(-1)

  // Calendar month label for any horizon month t (1..24)
  const calendarLabel = (t: number): string => {
    if (t === 0 || nominal.length === 0) return ""
    const point = nominal[Math.min(t, nominal.length) - 1]
    return MONTH_ABBR[point.calendarMonthIndex] ?? ""
  }

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
            Évolution de la marge — % mensuel
          </h4>
          <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "#6B7280", maxWidth: 580, lineHeight: 1.5 }}>
            Pour chaque mois, marge mensuelle effective en % du revenu. Les
            courbes ondulent avec les <strong>jours facturables réels</strong> du
            mois calendaire (creux août pour CP, pic octobre, fériés
            mai/novembre). <strong>Les CP et RTT du candidat sont déjà comptés ici</strong>
            {" "}— quand il prend ses congés, on facture moins de jours mais on paye
            le brut + les charges en plein. À la fin de l&apos;essai, cliff sur la
            rouge : préavis + indemnités Syntec deviennent payables.
            {dureeMois > 0 && <> Ligne violette : fin prévue ({dureeMois} mois).</>}
          </p>
        </div>
        <Legend />
      </header>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%" height="auto" role="img"
        aria-label="Graphique évolution de la marge en pourcentage sur 24 mois"
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Background bands — essai (rouge léger) vs post-essai (vert léger) */}
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

        <text
          x={(PAD_L + finEssaiX) / 2} y={PAD_T - 10}
          fontSize={10} fill="#B91C1C" textAnchor="middle" fontWeight={700}
        >
          Période d&apos;essai
        </text>

        {/* Y grid + ticks (en %) */}
        {yTickVals.map((v) => (
          <g key={`y-${v}`}>
            <line
              x1={PAD_L} y1={yOf(v)} x2={W - PAD_R} y2={yOf(v)}
              stroke={Math.abs(v) < 0.01 ? "#9CA3AF" : "#F0ECF8"}
              strokeWidth={Math.abs(v) < 0.01 ? 1.2 : 1}
              strokeDasharray={Math.abs(v) < 0.01 ? "none" : "2 4"}
            />
            <text
              x={PAD_L - 8} y={yOf(v) + 3}
              fontSize={10} fill="#6B7280" textAnchor="end"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {`${v.toFixed(0)} %`}
            </text>
          </g>
        ))}

        {/* Seuil marge mini cabinet — ligne horizontale pointillée orange */}
        {seuilY !== null && margeMinPct !== undefined && (
          <>
            <line
              x1={PAD_L} y1={seuilY} x2={W - PAD_R} y2={seuilY}
              stroke="#D97706" strokeWidth={1.2} strokeDasharray="4 4" opacity={0.7}
            />
            <text
              x={W - PAD_R - 4} y={seuilY - 4}
              fontSize={10} fill="#D97706" textAnchor="end" fontWeight={700}
            >
              seuil mini {margeMinPct.toFixed(0)} %
            </text>
          </>
        )}

        {/* X ticks — every 3 months, calendar label + horizon month */}
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
            {(m === 12 || m === 24) && (
              <text
                x={xOf(m)} y={PAD_T + PLOT_H + 46}
                fontSize={9} fill="#C7BFE3" textAnchor="middle" fontStyle="italic"
              >
                {m === 12 ? "1 an" : "2 ans"}
              </text>
            )}
          </g>
        ))}

        {/* Seuil indemnité Article 4.5 — 8 mois */}
        <line
          x1={xOf(8)} y1={PAD_T} x2={xOf(8)} y2={PAD_T + PLOT_H}
          stroke="#9CA3AF" strokeWidth={1} strokeDasharray="3 3" opacity={0.5}
        />
        <text
          x={xOf(8)} y={PAD_T - 4}
          fontSize={9} fill="#9CA3AF" textAnchor="middle"
        >
          ┐ 8m
        </text>

        {/* Fin de mission prévue */}
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

        {/* Curves */}
        <path d={pathFor(worst)}
          fill="none" stroke="#DC2626" strokeWidth={2.5}
          strokeLinejoin="round" strokeLinecap="round"
        />
        <path d={pathFor(nominal)}
          fill="none" stroke="#16A34A" strokeWidth={2.5}
          strokeLinejoin="round" strokeLinecap="round"
        />

        {/* Endpoints */}
        {endNomi && <EndDot color="#16A34A" x={xOf(endNomi.mois)} y={yOf(endNomi.margePct)} label={`${endNomi.margePct.toFixed(1)} %`} />}
        {endWorst && <EndDot color="#DC2626" x={xOf(endWorst.mois)} y={yOf(endWorst.margePct)} label={`${endWorst.margePct.toFixed(1)} %`} />}

        {/* Zero line — always paint on top so it's visible */}
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
      <LegendDot color="#16A34A" label="Nominale (sans rupture)" />
      <LegendDot color="#DC2626" label="Worst case (rupture employeur)" />
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
