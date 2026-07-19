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

import { useMemo, useState } from "react"
import {
  computeEmployerCost,
  cpRttRevenueHaircutMonthly,
  type PricingInputs,
} from "@/lib/pricing/syntec"
import { missionMonthProfile, MONTH_ABBR_FR, MONTH_ABBR_EN } from "@/lib/pricing/calendar"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const copy = {
  fr: {
    needsDates: (
      <>Renseigne <strong>la date de démarrage</strong> et <strong>la durée</strong> de
      la mission pour afficher l&apos;évolution de la marge mensuelle.</>
    ),
    monthlyMargin: "Marge mensuelle",
    chartAriaLabel: (n: number) => `Évolution marge mensuelle sur ${n} mois`,
    margin: "Marge",
    employerCost: "Coût emp.",
    workingDaysAbbr: (n: number) => `${n} j ouvrés`,
    revenue: (v: string) => `${v} revenu`,
    daysAbbr: (n: number) => `${n}j`,
    legendOk: "OK",
    legendWatch: "à surveiller",
    legendBelow: "sous seuil",
    legendMinThreshold: (p: number) => `seuil mini ${p} %`,
    legendRuptureCost: "coût rupture (survol)",
  },
  en: {
    needsDates: (
      <>Enter <strong>the start date</strong> and <strong>the duration</strong> of
      the mission to display the monthly margin evolution.</>
    ),
    monthlyMargin: "Monthly margin",
    chartAriaLabel: (n: number) => `Monthly margin evolution over ${n} months`,
    margin: "Margin",
    employerCost: "Employer cost",
    workingDaysAbbr: (n: number) => `${n} working days`,
    revenue: (v: string) => `${v} revenue`,
    daysAbbr: (n: number) => `${n}d`,
    legendOk: "OK",
    legendWatch: "to watch",
    legendBelow: "below threshold",
    legendMinThreshold: (p: number) => `min. threshold ${p}%`,
    legendRuptureCost: "termination cost (hover)",
  },
}

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
const H = 280
const PAD_L = 56
const PAD_R = 16
const PAD_T = 30
const PAD_B = 70

const PLOT_W = W - PAD_L - PAD_R
const PLOT_H = H - PAD_T - PAD_B

export default function MonthlyMarginChart({
  inputs, startDate, durationMonths, tjm, margeMinPct,
}: Props) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const locale = lang === "fr" ? "fr-FR" : "en-US"
  const monthAbbr = lang === "fr" ? MONTH_ABBR_FR : MONTH_ABBR_EN
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
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

  // Haircut mensuel CP+RTT : revenu en moins car jours payés non facturables.
  const cpRttHaircut = useMemo(() => cpRttRevenueHaircutMonthly(tjm, inputs), [tjm, inputs])

  // Pour chaque mois : revenu, coût, marge €, marge %
  // Les coûts fixes mensuels (salaire chargé, haircut CP+RTT) sont pro-ratés
  // par la fraction du mois effectivement travaillée. Sans ça, un mois qui
  // démarre le 21 facture un mois plein de salaire pour ~8 jours de revenu
  // et la marge plonge artificiellement à -50 %.
  const points = useMemo(() => monthProfiles.map((mp) => {
    const prorata = mp.fullMonthWorkingDays > 0
      ? mp.workingDays / mp.fullMonthWorkingDays
      : 1
    const revenu = tjm * mp.workingDays - cpRttHaircut * prorata
    const coutTotal =
      cost.coutFixeMensuel * prorata +
      cost.coutVariableJournalier * mp.workingDays
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
  }), [monthProfiles, tjm, cost, cpRttHaircut])

  if (points.length === 0) {
    return (
      <div style={{
        background: "white", borderRadius: 12, border: "1px solid var(--nw-border-soft)",
        padding: 20, color: "var(--nw-text-muted)", fontSize: 13, textAlign: "center",
      }}>
        {t.needsDates}
      </div>
    )
  }

  // Y range — l'axe est en % de marge.
  // Inclut 0 + seuil mini + extrêmes. On cale ensuite sur des paliers
  // arrondis (multiples de 10) pour que les labels Y soient lisibles
  // sans décimales hasardeuses.
  const allPcts = points.map((p) => p.margePct)
  const seuilPct = margeMinPct ?? 15
  const yMinRaw = Math.min(0, ...allPcts)
  const yMaxRaw = Math.max(seuilPct, ...allPcts)
  const span = Math.max(yMaxRaw - yMinRaw, 10)
  const yMin = Math.floor((yMinRaw - span * 0.05) / 10) * 10
  const yMax = Math.ceil((yMaxRaw + span * 0.10) / 10) * 10
  const yRange = yMax - yMin

  const xOf = (i: number): number => {
    // Bars centered on their slot
    const slotW = PLOT_W / points.length
    return PAD_L + slotW * i + slotW / 2
  }
  const yOf = (pct: number): number =>
    PAD_T + (1 - (pct - yMin) / yRange) * PLOT_H
  const zeroY = yOf(0)
  const slotW = PLOT_W / points.length
  const barW = Math.max(8, slotW * 0.7)

  // Y ticks — multiples de 10 % entre yMin et yMax inclus.
  const yTickVals: number[] = []
  for (let v = yMin; v <= yMax; v += 10) yTickVals.push(v)

  // Color pour chaque barre : gradient selon marge %
  const barColor = (margePct: number): string => {
    if (margePct < 0) return "var(--nw-danger-strong)"
    if (margePct < seuilPct) return "#EA580C"
    if (margePct < seuilPct + 10) return "#F59E0B"
    return "#16A34A"
  }

  return (
    <div style={{
      background: "white", borderRadius: 12, border: "1px solid var(--nw-border-soft)",
      padding: 16,
    }}>
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: 10, marginBottom: 10,
      }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "var(--nw-text)" }}>
          {t.monthlyMargin}
        </h4>
        {margeMinPct !== undefined && (
          <ChartLegend margeMinPct={margeMinPct} />
        )}
      </header>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%" height="auto" role="img"
        aria-label={t.chartAriaLabel(points.length)}
        style={{ display: "block", overflow: "visible" }}
        onMouseLeave={() => setHoveredIdx(null)}
      >
        {/* Y grid + ticks — multiples de 10 % */}
        {yTickVals.map((v) => (
          <g key={`y-${v}`}>
            <line
              x1={PAD_L} y1={yOf(v)} x2={W - PAD_R} y2={yOf(v)}
              stroke={v === 0 ? "var(--nw-text-muted)" : "var(--nw-border-soft)"}
              strokeWidth={v === 0 ? 1.2 : 1}
              strokeDasharray={v === 0 ? "none" : "2 4"}
            />
            <text
              x={PAD_L - 8} y={yOf(v) + 3}
              fontSize={10} fill="var(--nw-text-muted)" textAnchor="end"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {v} %
            </text>
          </g>
        ))}

        {/* Seuil mini organisation — ligne pointillée ambre sans label
            inline (chevauchait les barres). Le seuil est repris dans la
            légende au-dessus du chart. */}
        {margeMinPct !== undefined && (
          <line
            x1={PAD_L} y1={yOf(margeMinPct)} x2={W - PAD_R} y2={yOf(margeMinPct)}
            stroke="#D97706" strokeWidth={1.2} strokeDasharray="5 4" opacity={0.7}
          />
        )}

        {/* Bars : hauteur = marge %. Au survol :
            1) halo violet pâle derrière la barre représentant le coût
               employeur ce mois-là (proportionnel à la hauteur pleine 0..100%)
               pour matérialiser visuellement la part coût;
            2) légère scaleY sur la barre + drop-shadow. */}
        {points.map((p, i) => {
          const h = p.margePct >= 0 ? zeroY - yOf(p.margePct) : yOf(p.margePct) - zeroY
          const y = p.margePct >= 0 ? yOf(p.margePct) : zeroY
          const isHovered = hoveredIdx === i
          // Coût en % du revenu (100 - marge%). Le halo violet pâle au-dessus
          // de la barre matérialise visuellement la part coût employeur.
          const coutPct = Math.max(0, 100 - p.margePct)
          const coutHeight = (coutPct / 100) * PLOT_H * 0.6
          return (
            <g key={p.monthIndex}>
              {isHovered && coutHeight > 0 && (
                <rect
                  x={xOf(i) - barW / 2 - 2}
                  y={Math.max(PAD_T, y - coutHeight)}
                  width={barW + 4}
                  height={Math.min(coutHeight, y - PAD_T)}
                  fill="rgba(124,99,200,0.18)"
                  rx={3}
                  style={{ pointerEvents: "none" }}
                />
              )}
              <rect
                className="nw-bar"
                x={xOf(i) - barW / 2}
                y={y}
                width={barW}
                height={Math.max(1, h)}
                fill={barColor(p.margePct)}
                rx={2}
                onMouseEnter={() => setHoveredIdx(i)}
                style={{
                  transformBox: "fill-box",
                  transformOrigin: "center bottom",
                  transform: isHovered ? "scaleY(1.05) scaleX(1.10)" : "scaleY(1) scaleX(1)",
                  filter: isHovered ? "drop-shadow(0 3px 8px rgba(17,24,39,0.25))" : "none",
                }}
              />
              {/* % label au sommet de la barre si la barre est assez large. */}
              {barW >= 18 && (
                <text
                  x={xOf(i)} y={y - 4}
                  fontSize={9.5} fill="var(--nw-text-body)" textAnchor="middle" fontWeight={700}
                  style={{ pointerEvents: "none" }}
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
            stroke="var(--nw-text-muted)" strokeWidth={1.5}
          />
        )}

        {/* Tooltip survol : marge € (couleur santé), coût employeur €
            (violet, fait écho au halo derrière la barre), jours travaillés. */}
        {hoveredIdx !== null && points[hoveredIdx] && (() => {
          const p = points[hoveredIdx]
          const barTopY = p.margePct >= 0 ? yOf(p.margePct) : zeroY
          const tooltipW = 150
          const tooltipH = 64
          let tx = xOf(hoveredIdx) - tooltipW / 2
          tx = Math.max(PAD_L, Math.min(W - PAD_R - tooltipW, tx))
          const aboveOk = barTopY - tooltipH - 10 > PAD_T
          const ty = aboveOk
            ? barTopY - tooltipH - 8
            : Math.min(barTopY + 8, H - PAD_B - tooltipH)
          const margeColor = p.margePct < 0 ? "var(--nw-danger-strong)" : "var(--nw-success)"
          return (
            <foreignObject
              x={tx} y={ty}
              width={tooltipW} height={tooltipH}
              style={{ overflow: "visible", pointerEvents: "none" }}
            >
              <div
                style={{
                  background: "white",
                  border: "1px solid var(--nw-primary-100)",
                  borderRadius: 8,
                  boxShadow: "0 6px 16px -6px rgba(17,24,39,0.22)",
                  padding: "7px 11px",
                  fontFamily: "var(--font-inter), sans-serif",
                  fontVariantNumeric: "tabular-nums",
                  display: "flex", flexDirection: "column", gap: 3,
                }}
              >
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8,
                }}>
                  <span style={{ fontSize: 10.5, color: "var(--nw-text-muted)", fontWeight: 600 }}>{t.margin}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: margeColor }}>
                    {formatEur(p.marge, locale)}
                  </span>
                </div>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8,
                }}>
                  <span style={{ fontSize: 10.5, color: "var(--nw-text-muted)", fontWeight: 600 }}>{t.employerCost}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--nw-primary)" }}>
                    {formatEur(p.coutTotal, locale)}
                  </span>
                </div>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8,
                  marginTop: 1,
                }}>
                  <span style={{ fontSize: 10, color: "var(--nw-text-muted)" }}>{t.workingDaysAbbr(p.workingDays)}</span>
                  <span style={{ fontSize: 10, color: "var(--nw-text-muted)" }}>{t.revenue(formatEur(p.revenu, locale))}</span>
                </div>
              </div>
            </foreignObject>
          )
        })()}

        {/* X labels — chaque N mois selon densité */}
        {points.map((p, i) => {
          const everyN = points.length <= 12 ? 1 : points.length <= 24 ? 2 : 3
          if (i % everyN !== 0 && i !== points.length - 1) return null
          return (
            <g key={`x-${p.monthIndex}`}>
              <text
                x={xOf(i)} y={PAD_T + PLOT_H + 16}
                fontSize={10} fill="var(--nw-text-muted)" textAnchor="middle"
                fontWeight={p.isPartial ? 400 : 600}
              >
                {monthAbbr[p.calendarMonth]}
              </text>
              <text
                x={xOf(i)} y={PAD_T + PLOT_H + 30}
                fontSize={9} fill="var(--nw-text-muted)" textAnchor="middle"
              >
                {p.year}
              </text>
              <text
                x={xOf(i)} y={PAD_T + PLOT_H + 44}
                fontSize={9.5} fill="var(--nw-primary)" textAnchor="middle" fontWeight={700}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {t.daysAbbr(p.workingDays)}
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

function formatEur(v: number, locale = "fr-FR"): string {
  const sign = v < 0 ? "−" : ""
  return `${sign}${Math.abs(Math.round(v)).toLocaleString(locale)} €`
}

/** Légende partagée par MonthlyMarginChart et RuptureRiskChart : explique
 *  les codes couleurs sans surcharger le SVG (avant on avait des "seuil
 *  mini X %" inscrits dans le chart qui chevauchaient les barres). */
export function ChartLegend({
  margeMinPct, showRuptureSwatch = false,
}: { margeMinPct: number; showRuptureSwatch?: boolean }) {
  const { lang } = useLanguage()
  const t = copy[lang]
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      fontFamily: "var(--font-inter), sans-serif",
      fontSize: 10.5, color: "var(--nw-text-muted)",
    }}>
      <LegendItem color="#16A34A" label={t.legendOk} />
      <LegendItem color="#F59E0B" label={t.legendWatch} />
      <LegendItem color="var(--nw-danger-strong)" label={t.legendBelow} />
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
      }}>
        <span style={{
          width: 14, height: 0, borderTop: "1.5px dashed #D97706",
          display: "inline-block",
        }} />
        <span>{t.legendMinThreshold(margeMinPct)}</span>
      </span>
      {showRuptureSwatch && <LegendItem color="rgba(124,99,200,0.55)" label={t.legendRuptureCost} />}
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{
        width: 9, height: 9, borderRadius: 2, background: color,
        display: "inline-block",
      }} />
      <span>{label}</span>
    </span>
  )
}
