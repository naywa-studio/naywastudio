"use client"

/**
 * RuptureRiskChart — analyse "et si je dois rompre à T ?"
 *
 * Scénario principal modélisé : RUPTURE CONVENTIONNELLE (CDI).
 * C'est ce que l'employeur choisit dans la quasi-totalité des cas : pas de
 * préavis non travaillé, indemnité spécifique RC (≥ indemnité légale) +
 * indemnité compensatrice CP non pris. En pratique l'employeur ne se prive
 * jamais des 3 mois de préavis cadre Syntec — sauf rupture vraiment houleuse.
 *
 * Lecture combinée :
 *
 *   - BARRES (background) = marge cumulée nominale en € à T
 *     (Σ revenu 1..T − Σ coût 1..T). C'est la marge qu'on garde si la
 *     mission s'arrête naturellement à T, sans rupture.
 *
 *   - COURBE VIOLETTE pleine = marge restante si RUPTURE CONVENTIONNELLE
 *     à T (cumulRevenu − cumulCost − coûtRC(T)).
 *
 *   - COURBE GRISE pointillée = marge restante si LICENCIEMENT worst case
 *     (préavis 3 mois intégral + indemnité Art 4.5 + CP). Borne haute
 *     indicative pour info.
 *
 *   - HALO VIOLET (au survol) entre la courbe RC et le sommet de la barre =
 *     coût RC isolé, empilé en 2 segments : indemnité RC (clair) + CP
 *     non pris (foncé).
 */

import { useMemo, useState } from "react"
import {
  computeRuptureRiskProfile,
  type PricingInputs,
} from "@/lib/pricing/syntec"
import { MONTH_ABBR_FR, MONTH_ABBR_EN } from "@/lib/pricing/calendar"
import { ChartLegend } from "./MonthlyMarginChart"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const copy = {
  fr: {
    needsMission: "Renseigne la mission pour afficher l'analyse de risque rupture.",
    chartTitle: "Coût de rupture conventionnelle",
    chartSubtitle: "Marge restante si l'employeur négocie une RC à chaque mois T",
    chartAriaLabel: (n: number) => `Coût rupture conventionnelle sur ${n} mois`,
    trialPeriod: "Période d'essai",
    noCostRupture: "rupture sans coût",
    trialEnd: "fin essai",
    cumulMargin: "Marge cumulée",
    rcCost: "Coût RC",
    rcAllowance: "Indemnité RC",
    unusedLeave: "CP non pris",
    netIfRc: "Net si RC",
    ifDismissal: "Si licenciement",
    ruptureCost: "Coût rupture",
    inTrialPeriod: "En période d'essai — rupture sans coût",
    legendRc: "marge si rupture conventionnelle",
    legendDismissal: "marge si licenciement (worst case)",
  },
  en: {
    needsMission: "Fill in the mission to display the termination risk analysis.",
    chartTitle: "Mutual termination cost (RC)",
    chartSubtitle: "Remaining margin if the employer negotiates a mutual termination (RC) at month T",
    chartAriaLabel: (n: number) => `Mutual termination cost over ${n} months`,
    trialPeriod: "Trial period",
    noCostRupture: "no-cost termination",
    trialEnd: "trial end",
    cumulMargin: "Cumulative margin",
    rcCost: "RC cost",
    rcAllowance: "RC allowance",
    unusedLeave: "Unused paid leave",
    netIfRc: "Net if RC",
    ifDismissal: "If dismissal",
    ruptureCost: "Termination cost",
    inTrialPeriod: "In trial period — no-cost termination",
    legendRc: "margin if mutual termination",
    legendDismissal: "margin if dismissal (worst case)",
  },
}

interface Props {
  inputs: PricingInputs
  startDate: Date | string | null
  durationMonths: number
  tjm: number
  margeMinPct?: number
  /** Type de contrat de la mission. Défaut CDI. */
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
  const { lang } = useLanguage()
  const t = copy[lang]
  const locale = lang === "fr" ? "fr-FR" : "en-US"
  const monthAbbr = lang === "fr" ? MONTH_ABBR_FR : MONTH_ABBR_EN
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

  const rows = useMemo(() => points.map((p) => ({
    ...p,
    margeCumulNominaleEur: p.cumulRevenu - p.cumulCost,
  })), [points])

  if (rows.length === 0) {
    return (
      <div style={{
        background: "white", borderRadius: 12, border: "1px solid #F0ECF8",
        padding: 20, color: "#6B7280", fontSize: 13, textAlign: "center",
      }}>
        {t.needsMission}
      </div>
    )
  }

  // Y range — axe €. Couvre les 3 séries : barres, courbe RC, courbe licenciement.
  const allBarVals = rows.map((r) => r.margeCumulNominaleEur)
  const allRcVals = rows.map((r) => r.margeNetteEur)
  const allLicVals = rows.map((r) => r.margeNetteLicenciementEur)
  const seuilPct = margeMinPct ?? 15
  const yMinRaw = Math.min(0, ...allRcVals, ...allLicVals, ...allBarVals)
  const yMaxRaw = Math.max(0, ...allBarVals, ...allRcVals, ...allLicVals)
  const span = Math.max(yMaxRaw - yMinRaw, 1000)
  const padded = span * 0.10
  const tickStep = niceStep((span + 2 * padded) / 6)
  const yMin = Math.floor((yMinRaw - padded) / tickStep) * tickStep
  const yMax = Math.ceil((yMaxRaw + padded) / tickStep) * tickStep
  const yRange = yMax - yMin

  const xOf = (i: number): number => {
    const slotW = PLOT_W / rows.length
    return PAD_L + slotW * i + slotW / 2
  }
  const yOf = (val: number): number =>
    PAD_T + (1 - (val - yMin) / yRange) * PLOT_H
  const zeroY = yOf(0)
  const slotW = PLOT_W / rows.length
  const barW = Math.max(8, slotW * 0.7)

  const yTickVals: number[] = []
  for (let v = yMin; v <= yMax + tickStep * 0.001; v += tickStep) {
    yTickVals.push(Math.round(v))
  }

  // Couleur de barre = santé en cas de RC. RC bien moins chère que
  // licenciement → la grande majorité des mois passent au vert.
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

  // Courbes lissées (splines Bezier cubiques via Catmull-Rom).
  const curveRcXys = rows.map((r, i) => ({ x: xOf(i), y: yOf(r.margeNetteEur) }))
  const curveLicXys = rows.map((r, i) => ({ x: xOf(i), y: yOf(r.margeNetteLicenciementEur) }))
  const curveRcPath = buildSmoothPath(curveRcXys)
  const curveLicPath = buildSmoothPath(curveLicXys)

  return (
    <div style={{
      background: "white", borderRadius: 12, border: "1px solid #F0ECF8",
      padding: 16, marginTop: 14, position: "relative",
    }}>
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: 10, marginBottom: 10,
      }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#111827" }}>
            {t.chartTitle}
          </h4>
          <p style={{ margin: "3px 0 0", fontSize: 10.5, color: "#6B7280" }}>
            {t.chartSubtitle}
          </p>
        </div>
        {margeMinPct !== undefined && (
          <ChartLegend margeMinPct={margeMinPct} showRuptureSwatch />
        )}
      </header>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%" height="auto" role="img"
        aria-label={t.chartAriaLabel(rows.length)}
        style={{ display: "block", overflow: "visible" }}
        onMouseLeave={() => setHoveredIdx(null)}
      >
        {/* Zone essai (rose pâle) + ligne fin d'essai + label. */}
        {finEssaiX !== null && (
          <>
            <rect
              x={PAD_L} y={PAD_T}
              width={finEssaiX - PAD_L} height={PLOT_H}
              fill="rgba(220,38,38,0.07)"
            />
            <text
              x={PAD_L + (finEssaiX - PAD_L) / 2}
              y={PAD_T + 12}
              fontSize={10}
              fontWeight={700}
              fill="#B91C1C"
              textAnchor="middle"
              letterSpacing="0.04em"
              style={{ textTransform: "uppercase" }}
            >
              {t.trialPeriod}
            </text>
            <text
              x={PAD_L + (finEssaiX - PAD_L) / 2}
              y={PAD_T + 24}
              fontSize={9}
              fill="#B91C1C"
              textAnchor="middle"
              opacity={0.75}
            >
              {t.noCostRupture}
            </text>
            <line
              x1={finEssaiX} y1={PAD_T} x2={finEssaiX} y2={PAD_T + PLOT_H}
              stroke="#B91C1C" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6}
            />
            <text
              x={finEssaiX + 4} y={PAD_T + PLOT_H - 4}
              fontSize={9} fill="#B91C1C" opacity={0.8}
            >
              {t.trialEnd}
            </text>
          </>
        )}

        {/* Y grid + ticks (€). */}
        {yTickVals.map((v) => (
          <g key={`y-${v}`}>
            <line
              x1={PAD_L} y1={yOf(v)} x2={W - PAD_R} y2={yOf(v)}
              stroke={v === 0 ? "#6B7280" : "#F0ECF8"}
              strokeWidth={v === 0 ? 1.2 : 1}
              strokeDasharray={v === 0 ? "none" : "2 4"}
            />
            <text
              x={PAD_L - 8} y={yOf(v) + 3}
              fontSize={10} fill="#6B7280" textAnchor="end"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {compactEur(v, locale)}
            </text>
          </g>
        ))}

        {/* BARRES = marge cumulée nominale. */}
        {rows.map((r, i) => {
          const barH = r.margeCumulNominaleEur >= 0
            ? zeroY - yOf(r.margeCumulNominaleEur)
            : yOf(r.margeCumulNominaleEur) - zeroY
          const barY = r.margeCumulNominaleEur >= 0 ? yOf(r.margeCumulNominaleEur) : zeroY
          const isHovered = hoveredIdx === i

          // Halo violet décomposé : indemnité RC + CP non pris empilés.
          // Hauteur en pixels proportionnelle au montant. Affiché entre
          // sommet barre (haut) et courbe RC (bas).
          const curveY = yOf(r.margeNetteEur)
          const haloTop = barY
          const haloBottom = Math.min(PAD_T + PLOT_H, Math.max(curveY, barY))
          const haloH = haloBottom - haloTop
          const showHalo = isHovered && haloH > 1 && r.coutRupture > 0
          // Ratio pour le split visuel
          const total = Math.max(1, r.coutRupture)
          const hRC = haloH * (r.breakdown.indemniteRC / total)
          const hCp = haloH * (r.breakdown.indemniteCp / total)

          return (
            <g key={r.monthIndex}>
              {showHalo && (
                <>
                  {/* Segment haut : indemnité RC (violet clair) */}
                  <rect
                    x={xOf(i) - barW / 2 - 2}
                    y={haloTop}
                    width={barW + 4}
                    height={hRC}
                    fill="rgba(184,174,222,0.55)"
                    rx={2}
                    style={{ pointerEvents: "none" }}
                  />
                  {/* Segment bas : CP non pris (violet foncé) */}
                  <rect
                    x={xOf(i) - barW / 2 - 2}
                    y={haloTop + hRC}
                    width={barW + 4}
                    height={hCp}
                    fill="rgba(124,99,200,0.55)"
                    rx={2}
                    style={{ pointerEvents: "none" }}
                  />
                </>
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
                  {compactEur(r.margeCumulNominaleEur, locale)}
                </text>
              )}
            </g>
          )
        })}

        {/* Courbe LICENCIEMENT (worst case) — pointillée grise, en dessous. */}
        <path
          d={curveLicPath}
          fill="none"
          stroke="#6B7280"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ pointerEvents: "none" }}
        />

        {/* Courbe RC (scénario principal) — violette pleine, au-dessus. */}
        <path
          d={curveRcPath}
          fill="none"
          stroke="#7C63C8"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ pointerEvents: "none" }}
        />

        {/* Points sur la courbe RC. */}
        {rows.map((r, i) => {
          const cy = yOf(r.margeNetteEur)
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

        {/* X labels */}
        {rows.map((r, i) => {
          const everyN = rows.length <= 12 ? 1 : rows.length <= 24 ? 2 : 3
          if (i % everyN !== 0 && i !== rows.length - 1) return null
          return (
            <g key={`x-${r.monthIndex}`}>
              <text
                x={xOf(i)} y={PAD_T + PLOT_H + 16}
                fontSize={10} fill="#6B7280" textAnchor="middle" fontWeight={600}
              >
                {monthAbbr[r.calendarMonth]}
              </text>
              <text
                x={xOf(i)} y={PAD_T + PLOT_H + 30}
                fontSize={9} fill="#6B7280" textAnchor="middle"
              >
                {r.year}
              </text>
              <text
                x={xOf(i)} y={PAD_T + PLOT_H + 44}
                fontSize={9} fill="#6B7280" textAnchor="middle" fontStyle="italic"
              >
                m{r.monthIndex}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Tooltip survol — overlay HTML positionné dans le coin opposé au
          curseur pour ne JAMAIS chevaucher la colonne survolée. Comme ça
          on voit en même temps la décomposition (halo violet dans la barre)
          et le détail chiffré (tooltip). */}
      {hoveredIdx !== null && rows[hoveredIdx] && (() => {
        const r = rows[hoveredIdx]
        const margeColor = r.margePct < 0 ? "#B91C1C" : "#15803D"
        // Si la barre survolée est dans la moitié gauche, le tooltip va à
        // droite (et vice-versa). Évite tout chevauchement quelle que soit
        // la position du curseur.
        const onLeftHalf = hoveredIdx < rows.length / 2
        return (
          <div style={{
            position: "absolute",
            top: 60,
            ...(onLeftHalf ? { right: 24 } : { left: 80 }),
            background: "white",
            border: "1px solid #E2DAF6",
            borderRadius: 10,
            boxShadow: "0 10px 24px -8px rgba(17,24,39,0.25)",
            padding: "10px 14px",
            fontFamily: "var(--font-inter), sans-serif",
            fontVariantNumeric: "tabular-nums",
            display: "flex", flexDirection: "column", gap: 4,
            minWidth: 230,
            pointerEvents: "none",
            zIndex: 5,
          }}>
            <div style={{
              fontSize: 10, color: "#6B7280", fontWeight: 700,
              letterSpacing: "0.05em", textTransform: "uppercase",
            }}>
              {monthAbbr[r.calendarMonth]} {r.year} · m{r.monthIndex}
            </div>
            <Row label={t.cumulMargin} value={formatEur(r.margeCumulNominaleEur, locale)} color="#374151" />
            {r.coutRupture > 0 ? (
              <>
                <div style={{ borderTop: "1px solid #F0ECF8", margin: "3px 0" }} />
                <Row label={t.rcCost} value={`− ${formatEur(r.coutRupture, locale)}`} color="#7C63C8" />
                <RowSmall label={t.rcAllowance} value={formatEur(r.breakdown.indemniteRC, locale)} swatch="rgba(184,174,222,0.85)" />
                <RowSmall label={t.unusedLeave} value={formatEur(r.breakdown.indemniteCp, locale)} swatch="rgba(124,99,200,0.85)" />
                <div style={{ borderTop: "1px solid #F0ECF8", margin: "3px 0" }} />
                <Row label={t.netIfRc} value={`${formatEur(r.margeNetteEur, locale)} · ${r.margePct.toFixed(0)}%`} color={margeColor} bold />
                <RowSmall label={t.ifDismissal} value={formatEur(r.margeNetteLicenciementEur, locale)} swatch="#6B7280" dashed />
              </>
            ) : (
              <>
                <Row label={t.ruptureCost} value="—" color="#6B7280" />
                <div style={{ fontSize: 10, color: "#6B7280", fontStyle: "italic", marginTop: 2 }}>
                  {t.inTrialPeriod}
                </div>
              </>
            )}
          </div>
        )
      })()}

      {/* Mini-légende sous le chart pour distinguer les 2 courbes. */}
      <div style={{
        display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap",
        marginTop: 8, fontSize: 10.5, color: "#6B7280",
      }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 16, height: 2.5, background: "#7C63C8", borderRadius: 2 }} />
          {t.legendRc}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{
            width: 16, height: 2,
            background: "repeating-linear-gradient(to right, #6B7280 0 5px, transparent 5px 9px)",
          }} />
          {t.legendDismissal}
        </span>
      </div>

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

function RowSmall({
  label, value, swatch, dashed = false,
}: { label: string; value: string; swatch: string; dashed?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, paddingLeft: 8,
    }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9.5, color: "#6B7280" }}>
        <span style={{
          display: "inline-block",
          width: 10, height: dashed ? 1.5 : 8,
          background: dashed
            ? "repeating-linear-gradient(to right, #6B7280 0 3px, transparent 3px 5px)"
            : swatch,
          borderRadius: dashed ? 0 : 2,
        }} />
        {label}
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: "#6B7280" }}>{value}</span>
    </div>
  )
}

function formatEur(v: number, locale = "fr-FR"): string {
  const sign = v < 0 ? "−" : ""
  return `${sign}${Math.abs(Math.round(v)).toLocaleString(locale)} €`
}

function compactEur(v: number, locale = "fr-FR"): string {
  const sign = v < 0 ? "−" : ""
  const abs = Math.abs(v)
  if (abs < 1000) return `${sign}${Math.round(abs)} €`
  const kEur = abs / 1000
  const digits = kEur >= 10 ? 0 : 1
  return `${sign}${kEur.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })} k€`
}

function niceStep(roughStep: number): number {
  if (roughStep <= 0) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(roughStep)))
  const ratio = roughStep / mag
  let niceRatio: number
  if (ratio < 1.5) niceRatio = 1
  else if (ratio < 3) niceRatio = 2
  else if (ratio < 7) niceRatio = 5
  else niceRatio = 10
  return niceRatio * mag
}

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
