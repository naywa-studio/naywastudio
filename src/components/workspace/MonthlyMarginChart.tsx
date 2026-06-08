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
import { missionMonthProfile, MONTH_ABBR_FR } from "@/lib/pricing/calendar"

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
        background: "white", borderRadius: 12, border: "1px solid #F0ECF8",
        padding: 20, color: "#9CA3AF", fontSize: 13, textAlign: "center",
      }}>
        Renseigne <strong>la date de démarrage</strong> et <strong>la durée</strong> de
        la mission pour afficher l&apos;évolution de la marge mensuelle.
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
    if (margePct < 0) return "#DC2626"
    if (margePct < seuilPct) return "#EA580C"
    if (margePct < seuilPct + 10) return "#F59E0B"
    return "#16A34A"
  }

  return (
    <div style={{
      background: "white", borderRadius: 12, border: "1px solid #F0ECF8",
      padding: 16,
    }}>
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        flexWrap: "wrap", gap: 10, marginBottom: 10,
      }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#111827" }}>
            Marge mensuelle
          </h4>
        </div>
      </header>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%" height="auto" role="img"
        aria-label={`Évolution marge mensuelle sur ${points.length} mois`}
        style={{ display: "block", overflow: "visible" }}
        onMouseLeave={() => setHoveredIdx(null)}
      >
        {/* Y grid + ticks — multiples de 10 % */}
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

        {/* Seuil mini cabinet — ligne pointillée ambre. Maintenant que l'axe
            est en %, le seuil tombe pile sur sa valeur en %, plus besoin de
            convertir en € via le revenu moyen (ce qui faussait sur les mois
            partiels). */}
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
              seuil mini {margeMinPct} %
            </text>
          </g>
        )}

        {/* Bars : hauteur = marge %. Au survol on agrandit légèrement la
            barre (scale 1.04 ancré sur le bas) et on rend une infobulle
            HTML via foreignObject — auto-scalée par le viewBox SVG. */}
        {points.map((p, i) => {
          const h = p.margePct >= 0 ? zeroY - yOf(p.margePct) : yOf(p.margePct) - zeroY
          const y = p.margePct >= 0 ? yOf(p.margePct) : zeroY
          const isHovered = hoveredIdx === i
          return (
            <g key={p.monthIndex}>
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
              {/* % label au sommet de la barre si la barre est assez large
                  (redondant avec l'axe Y mais aide à lire d'un coup d'œil). */}
              {barW >= 18 && (
                <text
                  x={xOf(i)} y={y - 4}
                  fontSize={9.5} fill="#374151" textAnchor="middle" fontWeight={700}
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
            stroke="#9CA3AF" strokeWidth={1.5}
          />
        )}

        {/* Tooltip HTML survol — 4 infos clés, calé au-dessus de la barre,
            redirigé sous la barre quand la barre est trop haute pour laisser
            la place. */}
        {hoveredIdx !== null && points[hoveredIdx] && (() => {
          const p = points[hoveredIdx]
          const barTopY = p.margePct >= 0 ? yOf(p.margePct) : zeroY
          const tooltipW = 200
          const tooltipH = 96
          // Ancrage X avec contraintes pour ne pas déborder du SVG.
          let tx = xOf(hoveredIdx) - tooltipW / 2
          tx = Math.max(PAD_L, Math.min(W - PAD_R - tooltipW, tx))
          // Si la barre est dans le tiers haut du chart, on bascule en
          // dessous de la barre plutôt qu'au-dessus.
          const aboveOk = barTopY - tooltipH - 14 > PAD_T
          const ty = aboveOk
            ? barTopY - tooltipH - 12
            : Math.min(barTopY + 14, H - PAD_B - tooltipH)
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
                  borderRadius: 10,
                  boxShadow: "0 8px 24px -8px rgba(17,24,39,0.25)",
                  padding: "10px 12px",
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 12,
                  color: "#111827",
                }}
              >
                <p style={{
                  margin: 0, fontSize: 11.5, fontWeight: 700,
                  color: "#7C63C8", letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}>
                  {MONTH_ABBR_FR[p.calendarMonth]} {p.year}
                  {p.isPartial && (
                    <span style={{
                      marginLeft: 6, fontSize: 10, color: "#D97706",
                      letterSpacing: 0, textTransform: "none",
                    }}>· partiel</span>
                  )}
                </p>
                <div style={{ marginTop: 6, display: "grid", gap: 3 }}>
                  <Row label="Jours" value={`${p.workingDays} j`} />
                  <Row label="Revenu" value={formatEur(p.revenu)} />
                  <Row label="Coût" value={formatEur(p.coutTotal)} />
                  <Row
                    label="Marge"
                    value={`${formatEur(p.marge)} · ${p.margePct.toFixed(1)} %`}
                    strong
                    color={p.margePct < 0 ? "#B91C1C" : "#15803D"}
                  />
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
                fontSize={10} fill="#6B7280" textAnchor="middle"
                fontWeight={p.isPartial ? 400 : 600}
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
                fontSize={9.5} fill="#7C63C8" textAnchor="middle" fontWeight={700}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {p.workingDays}j
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
  label, value, strong, color,
}: {
  label: string
  value: string
  strong?: boolean
  color?: string
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between",
      gap: 10, alignItems: "baseline",
    }}>
      <span style={{ color: "#9CA3AF", fontSize: 11 }}>{label}</span>
      <span style={{
        color: color ?? "#111827",
        fontSize: strong ? 12.5 : 11.5,
        fontWeight: strong ? 700 : 500,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </span>
    </div>
  )
}

function formatEur(v: number): string {
  const sign = v < 0 ? "−" : ""
  return `${sign}${Math.abs(Math.round(v)).toLocaleString("fr-FR")} €`
}
