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

import { useMemo, useState } from "react"
import {
  computeRuptureRiskProfile,
  type PricingInputs,
} from "@/lib/pricing/syntec"
import { MONTH_ABBR_FR } from "@/lib/pricing/calendar"
import { ChartLegend } from "./MonthlyMarginChart"

interface Props {
  inputs: PricingInputs
  startDate: Date | string | null
  durationMonths: number
  tjm: number
  margeMinPct?: number
  /** Type de contrat de la mission. Défaut CDI. Le coût rupture varie
   *  beaucoup entre les deux : CDI = préavis + indemnité licenciement,
   *  CDD = salaires restants + prime précarité 10 %. */
  typeContrat?: 'cdi' | 'cdd'
}

// Dimensions alignées sur MonthlyMarginChart pour que le switch d'onglet
// (Marge mensuelle ↔ Risque rupture) donne l'impression d'une continuité,
// pas d'un saut de hauteur / padding.
const W = 760
const H = 280
const PAD_L = 56
const PAD_R = 16
const PAD_T = 30
const PAD_B = 70

const PLOT_W = W - PAD_L - PAD_R
const PLOT_H = H - PAD_T - PAD_B

type ChartMode = "pct" | "eur"

export default function RuptureRiskChart({
  inputs, startDate, durationMonths, tjm, margeMinPct, typeContrat = 'cdi',
}: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [mode, setMode] = useState<ChartMode>("pct")
  const start = useMemo(() => {
    if (!startDate) return new Date()
    if (startDate instanceof Date) return startDate
    const d = new Date(startDate)
    return Number.isNaN(d.getTime()) ? new Date() : d
  }, [startDate])

  const profile = useMemo(
    () => computeRuptureRiskProfile(
      inputs, tjm, start,
      Math.max(1, durationMonths || 12),
      { typeContrat },
    ),
    [inputs, tjm, start, durationMonths, typeContrat],
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

  // Y range — selon le mode courant (% ou marge cumulée €).
  // Le mode % inclut le seuil mini cabinet ; le mode € prend la ligne
  // zéro comme seuil implicite (« ne pas perdre d'argent »).
  const valueOf = (p: typeof points[number]): number =>
    mode === "pct" ? p.margePct : p.margeNetteEur
  const allVals = points.map(valueOf)
  const seuilVal = mode === "pct" ? (margeMinPct ?? 0) : 0
  const yMinRaw = Math.min(0, ...allVals, seuilVal)
  const yMaxRaw = Math.max(0, ...allVals)
  const span = Math.max(yMaxRaw - yMinRaw, mode === "pct" ? 1 : 1000)
  const yMin = yMinRaw - span * 0.10
  const yMax = yMaxRaw + span * 0.12
  const yRange = yMax - yMin

  const xOf = (i: number): number => {
    // Pour une courbe, on centre chaque point dans son "slot" pour avoir
    // une courbe régulière qui couvre toute la largeur.
    if (points.length === 1) return PAD_L + PLOT_W / 2
    return PAD_L + (PLOT_W * i) / (points.length - 1)
  }
  const yOf = (val: number): number =>
    PAD_T + (1 - (val - yMin) / yRange) * PLOT_H
  const zeroY = yOf(0)
  const fmtY = (v: number): string =>
    mode === "pct" ? `${v.toFixed(0)} %` : compactEur(v)

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
  const xys = points.map((p, i) => ({ x: xOf(i), y: yOf(valueOf(p)) }))
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
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: 10, marginBottom: 10,
      }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#111827" }}>
          Risque rupture employeur
        </h4>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          {margeMinPct !== undefined && mode === "pct" && (
            <ChartLegend margeMinPct={margeMinPct} />
          )}
          <div style={{
            display: "inline-flex", borderRadius: 8,
            border: "1px solid #E2DAF6", overflow: "hidden",
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            {(["pct", "eur"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  padding: "4px 11px",
                  background: mode === m ? "#7C63C8" : "white",
                  color: mode === m ? "white" : "#6B7280",
                  border: "none",
                  fontSize: 11, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "all 140ms",
                }}
              >
                {m === "pct" ? "Marge %" : "Marge cumulée"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%" height="auto" role="img"
        aria-label={`Risque rupture marge sur ${points.length} mois`}
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Zone essai (background rose pâle) + ligne fin d'essai.
            Labels "Période d'essai" et "fin essai" retirés : la zone
            rose suffit, et le sourceur connaît le terme essai. */}
        {finEssaiX !== null && (
          <>
            <rect
              x={PAD_L} y={PAD_T}
              width={finEssaiX - PAD_L} height={PLOT_H}
              fill="rgba(220,38,38,0.04)"
            />
            <line
              x1={finEssaiX} y1={PAD_T} x2={finEssaiX} y2={PAD_T + PLOT_H}
              stroke="#B91C1C" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6}
            />
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
              {fmtY(v)}
            </text>
          </g>
        ))}

        {/* Seuil mini organisation — uniquement en mode %. Label retiré
            (chevauchait la courbe) → repris dans la légende ChartLegend. */}
        {mode === "pct" && margeMinPct !== undefined && (
          <line
            x1={PAD_L} y1={yOf(margeMinPct)} x2={W - PAD_R} y2={yOf(margeMinPct)}
            stroke="#D97706" strokeWidth={1.2} strokeDasharray="5 4" opacity={0.7}
          />
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

        {/* Points + labels (couleur basée sur margePct, valeur Y selon le
            mode courant). */}
        {points.map((p, i) => {
          const showLabel = points.length <= 18 || i % 2 === 0 || i === points.length - 1
          const y = yOf(valueOf(p))
          const color = pointColor(p.margePct)
          return (
            <g key={p.monthIndex}>
              <circle
                className="nw-point"
                cx={xOf(i)}
                cy={y}
                r={hoveredIdx === i ? 6 : 4}
                fill={color}
                stroke="white"
                strokeWidth={2}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{ cursor: "pointer", transition: "r 140ms ease" }}
              />
              {showLabel && (
                <text
                  x={xOf(i)} y={y - 9}
                  fontSize={9.5} fill={color} textAnchor="middle" fontWeight={700}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {mode === "pct" ? `${p.margePct.toFixed(0)}%` : compactEur(p.margeNetteEur)}
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

        {/* Mini-tooltip survol : montre TOUJOURS les 2 vues (marge cumulée
            € + marge %) pour que le sourceur voie l'impact projet et le
            seuil simultanément, quel que soit le mode du graphique. */}
        {hoveredIdx !== null && points[hoveredIdx] && (() => {
          const p = points[hoveredIdx]
          const tooltipW = 130
          const tooltipH = 44
          let tx = xOf(hoveredIdx) - tooltipW / 2
          tx = Math.max(PAD_L, Math.min(W - PAD_R - tooltipW, tx))
          const pointY = yOf(valueOf(p))
          const aboveOk = pointY - tooltipH - 12 > PAD_T
          const ty = aboveOk ? pointY - tooltipH - 12 : Math.min(pointY + 14, H - PAD_B - tooltipH)
          const color = p.margePct < 0 ? "#B91C1C" : "#15803D"
          return (
            <foreignObject
              x={tx} y={ty}
              width={tooltipW} height={tooltipH}
              style={{ overflow: "visible", pointerEvents: "none" }}
            >
              <div
                style={{
                  background: "white",
                  border: "1px solid #E2DAF6",
                  borderRadius: 8,
                  boxShadow: "0 6px 16px -6px rgba(17,24,39,0.22)",
                  padding: "6px 10px",
                  fontFamily: "var(--font-inter), sans-serif",
                  textAlign: "center",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color }}>
                  {formatEur(p.margeNetteEur)}
                </div>
                <div style={{ fontSize: 11, color: "#6B7280", marginTop: 1 }}>
                  {p.margePct.toFixed(1)} %
                </div>
              </div>
            </foreignObject>
          )
        })()}
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

/** Format compact pour les labels d'axe Y et les markers en mode €
 *  (12 k€, 1.2 k€, −3 k€). Sous 1000 €, on garde les chiffres ronds
 *  (impossible de scaler en k€ sans perdre la précision). */
function compactEur(v: number): string {
  const sign = v < 0 ? "−" : ""
  const abs = Math.abs(v)
  if (abs < 1000) return `${sign}${Math.round(abs)} €`
  const kEur = abs / 1000
  const digits = kEur >= 10 ? 0 : 1
  return `${sign}${kEur.toFixed(digits)} k€`
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
