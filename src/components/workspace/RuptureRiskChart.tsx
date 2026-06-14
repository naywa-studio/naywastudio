"use client"

/**
 * RuptureRiskChart — analyse "et si je dois rompre à T ?"
 *
 * Lecture combinée :
 *
 *   - BARRES (background) = marge cumulée NOMINALE en % à T
 *       = (Σ revenu 1..T − Σ coût 1..T) / Σ revenu 1..T
 *     C'est la marge qu'on aurait gardée si la mission s'arrête naturellement
 *     à T, sans rupture. Reprend visuellement les barres de Marge mensuelle
 *     pour donner une continuité entre les deux onglets.
 *
 *   - COURBE (foreground) = marge en cas de rupture à T en %
 *       = (cumulRevenu − cumulCost − coûtRupture(T)) / cumulRevenu
 *     Pendant essai → confondue avec le sommet des barres (coûtRupture = 0).
 *     Cliff à fin d'essai → préavis + indemnité licenciement (CDI) ou
 *     salaires restants + précarité (CDD).
 *
 *   - HALO VIOLET (au survol) entre la courbe et le sommet de la barre =
 *     coût rupture isolé du mois, exprimé en % du revenu cumulé. Visualise
 *     ce que la rupture coûterait à ce moment précis.
 *
 * Couleur des barres : statut de la marge nette EN CAS de rupture
 *   - vert  : ≥ seuil + 10
 *   - orange : entre seuil et seuil + 10
 *   - rouge : sous seuil ou négatif
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

// Dimensions strictement alignées sur MonthlyMarginChart.
const W = 760
const H = 280
const PAD_L = 56
const PAD_R = 16
const PAD_T = 30
const PAD_B = 70

const PLOT_W = W - PAD_L - PAD_R
const PLOT_H = H - PAD_T - PAD_B

export default function RuptureRiskChart({
  inputs, startDate, durationMonths, tjm, margeMinPct, typeContrat = 'cdi',
}: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
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

  // Pour chaque point on dérive la marge cumulée nominale en %
  // (la barre) et on garde margePct (la courbe = en cas de rupture).
  // Note : margePct utilise cumulRevenu comme dénominateur, cf. fix Q3.
  const rows = useMemo(() => points.map((p) => ({
    ...p,
    margeCumulNominaleEur: p.cumulRevenu - p.cumulCost,
    margeCumulNominalePct: p.cumulRevenu > 0
      ? ((p.cumulRevenu - p.cumulCost) / p.cumulRevenu) * 100
      : 0,
  })), [points])

  if (rows.length === 0) {
    return (
      <div style={{
        background: "white", borderRadius: 12, border: "1px solid #F0ECF8",
        padding: 20, color: "#9CA3AF", fontSize: 13, textAlign: "center",
      }}>
        Renseigne la mission pour afficher l&apos;analyse de risque rupture.
      </div>
    )
  }

  // Y range — axe unique en %. Inclut barres nominales + courbe rupture
  // + seuil mini. On floor / ceil sur des dizaines pour lisibilité.
  const allBarPcts = rows.map((r) => r.margeCumulNominalePct)
  const allCurvePcts = rows.map((r) => r.margePct)
  const seuilPct = margeMinPct ?? 15
  const yMinRaw = Math.min(0, ...allCurvePcts, ...allBarPcts)
  const yMaxRaw = Math.max(seuilPct, ...allBarPcts, ...allCurvePcts)
  const span = Math.max(yMaxRaw - yMinRaw, 10)
  const yMin = Math.floor((yMinRaw - span * 0.05) / 10) * 10
  const yMax = Math.ceil((yMaxRaw + span * 0.10) / 10) * 10
  const yRange = yMax - yMin

  const xOf = (i: number): number => {
    const slotW = PLOT_W / rows.length
    return PAD_L + slotW * i + slotW / 2
  }
  const yOf = (pct: number): number =>
    PAD_T + (1 - (pct - yMin) / yRange) * PLOT_H
  const zeroY = yOf(0)
  const slotW = PLOT_W / rows.length
  const barW = Math.max(8, slotW * 0.7)

  // Y ticks — multiples de 10 % entre yMin et yMax inclus.
  const yTickVals: number[] = []
  for (let v = yMin; v <= yMax; v += 10) yTickVals.push(v)

  // Couleur de barre basée sur la marge nette EN CAS de rupture (margePct),
  // pas sur la marge nominale. L'œil cherche en priorité « est-ce safe si
  // ça casse ? ».
  const barColor = (margePct: number): string => {
    if (margePct < 0) return "#DC2626"
    if (margePct < seuilPct) return "#EA580C"
    if (margePct < seuilPct + 10) return "#F59E0B"
    return "#16A34A"
  }

  // Fin essai — milieu entre le dernier mois en essai et le premier post-essai.
  const finEssaiIdx = rows.findIndex((r) => r.isPostEssai)
  const finEssaiX = finEssaiIdx > 0
    ? (xOf(finEssaiIdx - 1) + xOf(finEssaiIdx)) / 2
    : null

  // Courbe lissée (splines Bezier cubiques via Catmull-Rom).
  const curveXys = rows.map((r, i) => ({ x: xOf(i), y: yOf(r.margePct) }))
  const curvePath = buildSmoothPath(curveXys)

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
        {margeMinPct !== undefined && (
          <ChartLegend margeMinPct={margeMinPct} showRuptureSwatch />
        )}
      </header>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%" height="auto" role="img"
        aria-label={`Risque rupture marge sur ${rows.length} mois`}
        style={{ display: "block", overflow: "visible" }}
        onMouseLeave={() => setHoveredIdx(null)}
      >
        {/* Zone essai (rose pâle) + ligne fin d'essai. */}
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

        {/* Y grid + ticks (% — axe unique). */}
        {yTickVals.map((v) => (
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
              {v} %
            </text>
          </g>
        ))}

        {/* Seuil mini organisation — ligne pointillée ambre.
            Label en légende au-dessus du chart, pas ici (chevauchait). */}
        {margeMinPct !== undefined && (
          <line
            x1={PAD_L} y1={yOf(margeMinPct)} x2={W - PAD_R} y2={yOf(margeMinPct)}
            stroke="#D97706" strokeWidth={1.2} strokeDasharray="5 4" opacity={0.7}
          />
        )}

        {/* BARRES = marge cumulée nominale (sans coût rupture). Couleur
            calée sur margePct (santé en cas de rupture). Au survol, on
            ajoute un halo violet pâle entre la courbe et le sommet de la
            barre pour matérialiser le coût rupture du mois. */}
        {rows.map((r, i) => {
          const barH = r.margeCumulNominalePct >= 0
            ? zeroY - yOf(r.margeCumulNominalePct)
            : yOf(r.margeCumulNominalePct) - zeroY
          const barY = r.margeCumulNominalePct >= 0 ? yOf(r.margeCumulNominalePct) : zeroY
          const isHovered = hoveredIdx === i

          // Halo violet : entre courbe (rupture) et sommet barre (nominal).
          // En CDD post-essai, la courbe peut plonger très bas → on clip au
          // bord visible du chart pour rester propre.
          const curveY = yOf(r.margePct)
          const haloTop = barY
          const haloBottom = Math.min(PAD_T + PLOT_H, Math.max(curveY, barY))
          const showHalo = isHovered && haloBottom > haloTop + 1

          return (
            <g key={r.monthIndex}>
              {showHalo && (
                <rect
                  x={xOf(i) - barW / 2 - 2}
                  y={haloTop}
                  width={barW + 4}
                  height={haloBottom - haloTop}
                  fill="rgba(124,99,200,0.30)"
                  rx={3}
                  style={{ pointerEvents: "none" }}
                />
              )}
              <rect
                className="nw-bar"
                x={xOf(i) - barW / 2}
                y={barY}
                width={barW}
                height={Math.max(1, barH)}
                fill={barColor(r.margePct)}
                rx={2}
                onMouseEnter={() => setHoveredIdx(i)}
                style={{
                  transformBox: "fill-box",
                  transformOrigin: "center bottom",
                  transform: isHovered ? "scaleY(1.05) scaleX(1.10)" : "scaleY(1) scaleX(1)",
                  filter: isHovered ? "drop-shadow(0 3px 8px rgba(17,24,39,0.25))" : "none",
                }}
              />
              {barW >= 18 && (
                <text
                  x={xOf(i)} y={barY - 4}
                  fontSize={9.5} fill="#374151" textAnchor="middle" fontWeight={700}
                  style={{ pointerEvents: "none" }}
                >
                  {r.margeCumulNominalePct.toFixed(0)}%
                </text>
              )}
            </g>
          )
        })}

        {/* Courbe = marge en cas de rupture (margePct). Posée par-dessus
            les barres pour visualiser l'écart cumul nominal ↔ rupture. */}
        <path
          d={curvePath}
          fill="none"
          stroke="#7C63C8"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ pointerEvents: "none" }}
        />

        {/* Points sur la courbe — petits, pour ne pas voler la vedette
            aux barres. Couleur = santé en cas de rupture. */}
        {rows.map((r, i) => {
          const cy = yOf(r.margePct)
          // Clip vertical pour rester visible quand margePct est très bas
          // (CDD post-essai par ex.).
          if (cy < PAD_T || cy > PAD_T + PLOT_H + 1) return null
          return (
            <circle
              key={`pt-${r.monthIndex}`}
              cx={xOf(i)}
              cy={cy}
              r={3}
              fill={barColor(r.margePct)}
              stroke="white"
              strokeWidth={1.4}
              style={{ pointerEvents: "none" }}
            />
          )
        })}

        {/* Tooltip survol : montre marge cumulée nominale (sommet barre),
            coût rupture (halo violet) et marge nette résultante. */}
        {hoveredIdx !== null && rows[hoveredIdx] && (() => {
          const r = rows[hoveredIdx]
          const barTopY = r.margeCumulNominalePct >= 0
            ? yOf(r.margeCumulNominalePct)
            : zeroY
          const tooltipW = 180
          const tooltipH = 80
          let tx = xOf(hoveredIdx) - tooltipW / 2
          tx = Math.max(PAD_L, Math.min(W - PAD_R - tooltipW, tx))
          const aboveOk = barTopY - tooltipH - 10 > PAD_T
          const ty = aboveOk
            ? barTopY - tooltipH - 8
            : Math.min(barTopY + 8, H - PAD_B - tooltipH)
          const margeColor = r.margePct < 0 ? "#B91C1C" : "#15803D"
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
                  padding: "7px 11px",
                  fontFamily: "var(--font-inter), sans-serif",
                  fontVariantNumeric: "tabular-nums",
                  display: "flex", flexDirection: "column", gap: 3,
                }}
              >
                <Row label="Marge cumulée" value={formatEur(r.margeCumulNominaleEur)} color="#374151" />
                <Row label="Coût rupture" value={r.coutRupture > 0 ? `− ${formatEur(r.coutRupture)}` : "—"} color="#7C63C8" />
                <div style={{ borderTop: "1px solid #F0ECF8", margin: "1px 0" }} />
                <Row label="Net si rupture" value={`${formatEur(r.margeNetteEur)}  ·  ${r.margePct.toFixed(0)}%`} color={margeColor} bold />
              </div>
            </foreignObject>
          )
        })()}

        {/* X labels — mois + année + mNN */}
        {rows.map((r, i) => {
          const everyN = rows.length <= 12 ? 1 : rows.length <= 24 ? 2 : 3
          if (i % everyN !== 0 && i !== rows.length - 1) return null
          return (
            <g key={`x-${r.monthIndex}`}>
              <text
                x={xOf(i)} y={PAD_T + PLOT_H + 16}
                fontSize={10} fill="#6B7280" textAnchor="middle" fontWeight={600}
              >
                {MONTH_ABBR_FR[r.calendarMonth]}
              </text>
              <text
                x={xOf(i)} y={PAD_T + PLOT_H + 30}
                fontSize={9} fill="#9CA3AF" textAnchor="middle"
              >
                {r.year}
              </text>
              <text
                x={xOf(i)} y={PAD_T + PLOT_H + 44}
                fontSize={9} fill="#9CA3AF" textAnchor="middle" fontStyle="italic"
              >
                m{r.monthIndex}
              </text>
            </g>
          )
        })}
      </svg>
      <style jsx>{`
        :global(.nw-bar) {
          opacity: 0.88;
          cursor: pointer;
          transition: transform 140ms ease, filter 140ms ease, opacity 140ms ease;
        }
        :global(.nw-bar:hover) {
          opacity: 1;
        }
      `}</style>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────── */

function Row({
  label, value, color, bold = false,
}: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8,
    }}>
      <span style={{ fontSize: 10.5, color: "#6B7280", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: bold ? 13 : 12, fontWeight: bold ? 800 : 600, color }}>
        {value}
      </span>
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
