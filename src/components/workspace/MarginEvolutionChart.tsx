"use client"

/**
 * MarginEvolutionChart — pour chaque mois X entre 1 et 24, marge moyenne
 * effective générée par la mission depuis le démarrage si rupture à ce
 * mois-là, exprimée en % du revenu cumulé.
 *
 *   marge_pct(X) = ( Σ revenu_1..X  −  coût_emp × X  −  coût_rupture(X) )
 *                  ÷  Σ revenu_1..X
 *
 * 3 scénarios distincts, alignés sur l'Excel de référence du sourceur :
 *
 *   - VERTE pleine — « préavis 1 mois » (mild) — rupture amiable,
 *     transaction rapide, scénario réaliste si la séparation est anticipée
 *   - ROUGE pointillée — « préavis max Syntec » (worst case) — préavis
 *     intégral 3 mois cadre / 2 mois ETAM + indemnité Art. 4.5
 *   - BLEUE pointillée — « sans intercontrat » (nominal) — pas de rupture,
 *     le candidat enchaîne sur une autre mission sans temps mort
 *
 * Le cumul lisse naturellement les variations mensuelles (creux d'août,
 * pic d'octobre) au lieu de les amplifier comme la formule instantanée.
 * Les CP et RTT restent comptés via la baisse des jours facturables.
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
  const mild = scenarios.mild
  const worst = scenarios.worstCase

  // Y range FIXE pour comparabilité d'une mission à l'autre. Si le worst
  // case descend sous −50%, on l'écrête visuellement (la valeur reste
  // calculée et est signalée dans un badge dédié) — sinon les missions
  // pathologiques (TJM bas par rapport au brut) écrasent visuellement
  // toutes les courbes utiles entre 0 et 50%.
  const Y_FLOOR = -50
  const Y_CEIL = 80
  const yMin = Y_FLOOR
  const yMax = Y_CEIL
  const yRange = yMax - yMin
  const clampPct = (v: number): number => Math.max(yMin, Math.min(yMax, v))

  // Détection des dépassements pour le badge d'alerte sous le chart
  const offScaleWorst = worst.find((p) => p.margePct < Y_FLOOR)

  const xOf = (mois: number): number =>
    PAD_L + (mois / HORIZON_MOIS) * PLOT_W
  const yOf = (pct: number): number =>
    PAD_T + (1 - (pct - yMin) / yRange) * PLOT_H

  const pathFor = (points: { mois: number; margePct: number }[]): string =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.mois).toFixed(2)} ${yOf(clampPct(p.margePct)).toFixed(2)}`)
      .join(" ")

  const zeroY = yOf(0)
  const seuilY = margeMinPct !== undefined ? yOf(margeMinPct) : null
  const finEssaiX = xOf(Math.min(scenarios.finEssaiMois, HORIZON_MOIS))
  const finMissionX = dureeMois > 0 && dureeMois < HORIZON_MOIS ? xOf(dureeMois) : null

  // X ticks every 3 months
  const xTicks = [0, 3, 6, 9, 12, 15, 18, 21, 24]
  // Y ticks fixes — alignés sur la plage clampée [−50%, +80%]
  const yTickVals = [-50, -25, 0, 25, 50, 80]

  const endNomi = nominal.at(-1)
  const endMild = mild.at(-1)
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
            Évolution de la marge en cas de rupture du contrat
          </h4>
          <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "#6B7280", maxWidth: 600, lineHeight: 1.5 }}>
            À chaque mois, marge moyenne du projet en % du revenu cumulé si
            rupture à ce moment-là. Lissage par cumul — les variations
            mensuelles (CP août, pic octobre) sont absorbées plutôt
            qu&apos;amplifiées. La <strong style={{ color: "#16A34A" }}>verte</strong> = préavis
            1 mois (amiable) · la <strong style={{ color: "#DC2626" }}>rouge</strong> = préavis
            Syntec intégral (worst case) · la <strong style={{ color: "#2563EB" }}>bleue</strong> =
            sans rupture (candidat enchaîné sur autre mission).
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

        {/* Curves — ordre de peinture : nominal en arrière (bleu pointillé),
            worst au milieu (rouge tireté), mild devant (vert plein) */}
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

        {/* Endpoints (clamp Y pour rester sur l'aire visible) */}
        {endNomi && <EndDot color="#2563EB" x={xOf(endNomi.mois)} y={yOf(clampPct(endNomi.margePct))} label={`${endNomi.margePct.toFixed(1)} %`} />}
        {endMild && <EndDot color="#16A34A" x={xOf(endMild.mois)} y={yOf(clampPct(endMild.margePct))} label={`${endMild.margePct.toFixed(1)} %`} />}
        {endWorst && <EndDot color="#DC2626" x={xOf(endWorst.mois)} y={yOf(clampPct(endWorst.margePct))} label={`${endWorst.margePct.toFixed(1)} %`} />}

        {/* Zero line — always paint on top so it's visible */}
        {yMin < 0 && yMax > 0 && (
          <line
            x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY}
            stroke="#9CA3AF" strokeWidth={1.5}
          />
        )}
      </svg>

      {/* Badge d'alerte : worst case sorti de l'aire visible vers le bas */}
      {offScaleWorst && (
        <div style={{
          marginTop: 10, padding: "8px 12px",
          background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 9,
          fontSize: 11.5, color: "#B91C1C", lineHeight: 1.5,
        }}>
          ⚠ <strong>Worst case hors échelle</strong> — marge à{" "}
          <strong>{offScaleWorst.margePct.toFixed(0)} %</strong> au mois{" "}
          <strong>{offScaleWorst.mois}</strong>. Le candidat est structurellement
          déficitaire en cas de rupture rapide (TJM trop bas par rapport au brut /
          coût employeur). À examiner : remonter le TJM client, baisser le brut
          candidat, ou refuser le candidat sur cette mission.
        </div>
      )}
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
      <LegendDot color="#16A34A" label="Préavis 1 mois (amiable)" />
      <LegendDot color="#DC2626" label="Préavis max Syntec (worst)" dashed />
      <LegendDot color="#2563EB" label="Sans intercontrat (nominal)" dashed />
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
        x={x + 6} y={y + 4}
        fontSize={10.5} fill={color} fontWeight={700}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {label}
      </text>
    </g>
  )
}
