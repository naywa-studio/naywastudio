"use client"

/**
 * RuptureRiskChart — marge moyenne cumulée si l'employeur ROMPT le contrat
 * à un mois T donné, sur toute la durée de la mission.
 *
 * Pour chaque mois T :
 *
 *   margePct(T) = ( Σ revenu_1..T  −  Σ coût_1..T  −  coût_rupture(T) ) ÷ Σ revenu_1..T
 *
 *   coût_rupture(T) = 0                                                  si T ≤ fin_essai
 *                   = préavis × coût_salarial_chargé
 *                     + indemnité_Art_4.5(anc)
 *                     + indemnité_compensatrice_CP(T)                    sinon
 *
 * Comportement :
 * - Pendant essai (T ≤ 7 mois cadre) : barres alignées sur la marge moyenne
 *   cumulée nominale (pas de coût rupture)
 * - À fin_essai + 1 : CLIFF vers le bas — coût rupture lourd amorti sur peu
 *   de mois
 * - Mois suivants : remontée progressive — même coût amorti sur de plus en
 *   plus de mois pèse moins
 * - Près de la fin de mission : se rapproche de la marge moyenne nominale
 *
 * Couleurs des barres : vert >25%, orange [seuil_min, 25%], rouge < seuil_min
 * ou marge négative.
 */

import { useMemo } from "react"
import {
  computeRuptureRiskProfile,
  type PricingInputs,
} from "@/lib/pricing/syntec"
import { MONTH_ABBR_FR } from "@/lib/pricing/calendar"

interface Props {
  inputs: PricingInputs
  startDate: Date | string | null
  durationMonths: number
  tjm: number
  margeMinPct?: number
}

const W = 760
const H = 260
const PAD_L = 60
const PAD_R = 16
const PAD_T = 32
const PAD_B = 70

const PLOT_W = W - PAD_L - PAD_R
const PLOT_H = H - PAD_T - PAD_B

export default function RuptureRiskChart({
  inputs, startDate, durationMonths, tjm, margeMinPct,
}: Props) {
  const start = useMemo(() => {
    if (!startDate) return new Date()
    if (startDate instanceof Date) return startDate
    const d = new Date(startDate)
    return Number.isNaN(d.getTime()) ? new Date() : d
  }, [startDate])

  const profile = useMemo(
    () => computeRuptureRiskProfile(inputs, tjm, start, Math.max(1, durationMonths || 12)),
    [inputs, tjm, start, durationMonths],
  )

  const points = profile.points

  if (points.length === 0) {
    return (
      <div style={{
        background: "white", borderRadius: 12, border: "1px solid #F0ECF8",
        padding: 20, color: "#9CA3AF", fontSize: 13, textAlign: "center",
      }}>
        Renseigne la mission pour afficher l&apos;analyse de risque rupture.
      </div>
    )
  }

  // Y range — inclut 0 et seuil mini
  const allPct = points.map((p) => p.margePct)
  const yMinRaw = Math.min(0, ...allPct, margeMinPct ?? 0)
  const yMaxRaw = Math.max(0, ...allPct)
  const span = Math.max(yMaxRaw - yMinRaw, 1)
  const yMin = yMinRaw - span * 0.10
  const yMax = yMaxRaw + span * 0.12
  const yRange = yMax - yMin

  const xOf = (i: number): number => {
    // Pour une courbe, on centre chaque point dans son "slot" pour avoir
    // une courbe régulière qui couvre toute la largeur.
    if (points.length === 1) return PAD_L + PLOT_W / 2
    return PAD_L + (PLOT_W * i) / (points.length - 1)
  }
  const yOf = (pct: number): number =>
    PAD_T + (1 - (pct - yMin) / yRange) * PLOT_H
  const zeroY = yOf(0)

  // Y ticks — 5 paliers en %
  const yTickVals: number[] = []
  for (let t = 0; t <= 4; t++) {
    yTickVals.push(yMin + (yRange * t) / 4)
  }

  // Fin essai — milieu entre le dernier mois en essai et le premier post-essai
  const finEssaiIdx = points.findIndex((p) => p.isPostEssai)   // 1er post-essai
  const finEssaiX = finEssaiIdx > 0
    ? (xOf(finEssaiIdx - 1) + xOf(finEssaiIdx)) / 2
    : null

  // Path SVG de la courbe lissée via splines de Bezier cubiques
  // (Catmull-Rom → Bezier conversion). Effet organique sans avoir à
  // calculer chaque semaine — la formule mensuelle reste source de vérité.
  const xys = points.map((p, i) => ({ x: xOf(i), y: yOf(p.margePct) }))
  const linePath = buildSmoothPath(xys)

  // Path SVG de l'aire sous la courbe (mêmes splines, refermées sur l'axe zéro)
  const areaPath = xys.length > 0
    ? linePath +
      ` L ${xys[xys.length - 1].x.toFixed(2)} ${zeroY.toFixed(2)}` +
      ` L ${xys[0].x.toFixed(2)} ${zeroY.toFixed(2)} Z`
    : ""

  const pointColor = (margePct: number): string => {
    if (margePct < 0) return "#DC2626"
    const seuil = margeMinPct ?? 15
    if (margePct < seuil) return "#EA580C"
    if (margePct < seuil + 10) return "#F59E0B"
    return "#16A34A"
  }

  return (
    <div style={{
      background: "white", borderRadius: 12, border: "1px solid #F0ECF8",
      padding: 16, marginTop: 14,
    }}>
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        flexWrap: "wrap", gap: 10, marginBottom: 10,
      }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#111827" }}>
            Risque rupture employeur
          </h4>
        </div>
      </header>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%" height="auto" role="img"
        aria-label={`Risque rupture marge sur ${points.length} mois`}
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Zone essai (background rose pâle) */}
        {finEssaiX !== null && (
          <>
            <rect
              x={PAD_L} y={PAD_T}
              width={finEssaiX - PAD_L} height={PLOT_H}
              fill="rgba(220,38,38,0.04)"
            />
            <text
              x={(PAD_L + finEssaiX) / 2} y={PAD_T - 14}
              fontSize={10} fill="#B91C1C" textAnchor="middle" fontWeight={700}
            >
              Période d&apos;essai (rupture gratuite)
            </text>
            <line
              x1={finEssaiX} y1={PAD_T} x2={finEssaiX} y2={PAD_T + PLOT_H}
              stroke="#B91C1C" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6}
            />
            <text
              x={finEssaiX + 4} y={PAD_T - 4}
              fontSize={10} fill="#B91C1C" fontWeight={700}
            >
              fin essai
            </text>
          </>
        )}

        {/* Y grid + ticks */}
        {yTickVals.map((v) => (
          <g key={`y-${v}`}>
            <line
              x1={PAD_L} y1={yOf(v)} x2={W - PAD_R} y2={yOf(v)}
              stroke={Math.abs(v) < 0.5 ? "#9CA3AF" : "#F0ECF8"}
              strokeWidth={Math.abs(v) < 0.5 ? 1.2 : 1}
              strokeDasharray={Math.abs(v) < 0.5 ? "none" : "2 4"}
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

        {/* Seuil mini cabinet — label collé à GAUCHE (zone vide près de l'axe Y)
            pour ne jamais chevaucher la courbe ou les labels % en fin de
            mission. Pastille blanche en arrière-plan pour la lisibilité. */}
        {margeMinPct !== undefined && (
          <g>
            <line
              x1={PAD_L} y1={yOf(margeMinPct)} x2={W - PAD_R} y2={yOf(margeMinPct)}
              stroke="#D97706" strokeWidth={1.2} strokeDasharray="5 4" opacity={0.7}
            />
            <rect
              x={PAD_L + 4} y={yOf(margeMinPct) - 13}
              width={92} height={14} rx={3}
              fill="white" opacity={0.92}
            />
            <text
              x={PAD_L + 8} y={yOf(margeMinPct) - 3}
              fontSize={10} fill="#D97706" textAnchor="start" fontWeight={700}
            >
              seuil mini {margeMinPct.toFixed(0)} %
            </text>
          </g>
        )}

        {/* Aire sous la courbe (fond violet pâle) */}
        <path
          d={areaPath}
          fill="rgba(124,99,200,0.08)"
          stroke="none"
        />

        {/* Courbe principale */}
        <path
          d={linePath}
          fill="none"
          stroke="#7C63C8"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Points + labels (un point coloré par mois selon la valeur) */}
        {points.map((p, i) => {
          const showLabel = points.length <= 18 || i % 2 === 0 || i === points.length - 1
          return (
            <g key={p.monthIndex}>
              <circle
                className="nw-point"
                cx={xOf(i)}
                cy={yOf(p.margePct)}
                r={4}
                fill={pointColor(p.margePct)}
                stroke="white"
                strokeWidth={2}
              >
                <title>
                  {MONTH_ABBR_FR[p.calendarMonth]} {p.year} (mois {p.monthIndex})
                  {"\n"}Marge cumulée : {p.margePct.toFixed(1)} % ({formatEur(p.margeNetteEur)})
                  {"\n"}Cumul revenu : {formatEur(p.cumulRevenu)} | Coût employeur : {formatEur(p.cumulCost)}
                  {"\n"}Coût rupture : {p.coutRupture > 0 ? formatEur(p.coutRupture) : "0 € (essai)"}
                </title>
              </circle>
              {showLabel && (
                <text
                  x={xOf(i)} y={yOf(p.margePct) - 9}
                  fontSize={9.5} fill={pointColor(p.margePct)} textAnchor="middle" fontWeight={700}
                  style={{ fontVariantNumeric: "tabular-nums" }}
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

        {/* X labels */}
        {points.map((p, i) => {
          const everyN = points.length <= 12 ? 1 : points.length <= 24 ? 2 : 3
          if (i % everyN !== 0 && i !== points.length - 1) return null
          return (
            <g key={`x-${p.monthIndex}`}>
              <text
                x={xOf(i)} y={PAD_T + PLOT_H + 16}
                fontSize={10} fill="#6B7280" textAnchor="middle" fontWeight={600}
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
                fontSize={9} fill="#9CA3AF" textAnchor="middle" fontStyle="italic"
              >
                m{p.monthIndex}
              </text>
            </g>
          )
        })}
      </svg>

      {/* La carte « Pire moment pour rompre » est rendue par le widget dans la
          colonne gauche (sous Meilleur/Pire mois calendaire) — pas besoin de
          dupliquer ici. */}
      <style jsx>{`
        :global(.nw-point) {
          transition: r 140ms ease, filter 140ms ease;
          cursor: pointer;
        }
        :global(.nw-point:hover) {
          r: 6;
          filter: drop-shadow(0 2px 6px rgba(17, 24, 39, 0.25));
        }
      `}</style>
    </div>
  )
}


function formatEur(v: number): string {
  const sign = v < 0 ? "−" : ""
  return `${sign}${Math.abs(Math.round(v)).toLocaleString("fr-FR")} €`
}

/** Construit un path SVG smooth (splines Bezier cubiques) qui passe
 *  exactement par tous les points fournis. Algorithme Catmull-Rom →
 *  Bezier : pour chaque segment Pi → Pi+1, on calcule 2 points de
 *  contrôle basés sur les pentes locales (Pi-1, Pi+2). Donne un effet
 *  organique sans changer les valeurs source. Tension = 0.4 (entre 0
 *  = anguleux et 0.5 = très bombé). */
function buildSmoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return ""
  if (pts.length === 1) return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`
  if (pts.length === 2) {
    return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)} L ${pts[1].x.toFixed(2)} ${pts[1].y.toFixed(2)}`
  }
  const t = 0.4
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) * t / 3
    const c1y = p1.y + (p2.y - p0.y) * t / 3
    const c2x = p2.x - (p3.x - p1.x) * t / 3
    const c2y = p2.y - (p3.y - p1.y) * t / 3
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  return d
}
