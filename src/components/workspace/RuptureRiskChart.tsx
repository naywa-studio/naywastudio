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
const H = 360
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
    const slotW = PLOT_W / points.length
    return PAD_L + slotW * i + slotW / 2
  }
  const yOf = (pct: number): number =>
    PAD_T + (1 - (pct - yMin) / yRange) * PLOT_H
  const zeroY = yOf(0)
  const slotW = PLOT_W / points.length
  const barW = Math.max(8, slotW * 0.7)

  // Y ticks — 5 paliers en %
  const yTickVals: number[] = []
  for (let t = 0; t <= 4; t++) {
    yTickVals.push(yMin + (yRange * t) / 4)
  }

  // Fin essai : entre le dernier mois pendant essai et le premier post-essai
  const finEssaiIdx = points.findIndex((p) => p.isPostEssai)   // 1er post-essai
  const finEssaiX = finEssaiIdx > 0
    ? PAD_L + (PLOT_W / points.length) * finEssaiIdx
    : null

  const barColor = (margePct: number): string => {
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
            ⚠ Risque rupture — marge si l&apos;employeur rompt à ce mois
          </h4>
          <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "#6B7280", maxWidth: 620, lineHeight: 1.5 }}>
            Pour chaque mois T, marge moyenne cumulée si l&apos;employeur rompt le contrat
            à ce moment-là. Inclut <strong>préavis Syntec ({profile.preavisMois} mois)</strong> +{" "}
            <strong>indemnité Art. 4.5</strong> (à partir de 8 mois d&apos;ancienneté) +{" "}
            <strong>indemnité compensatrice CP</strong> non pris. Pendant l&apos;essai
            (mois 1 à {profile.finEssaiMois}), la rupture est gratuite — les barres
            sont à la marge nominale.
          </p>
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

        {/* Seuil mini cabinet */}
        {margeMinPct !== undefined && (
          <>
            <line
              x1={PAD_L} y1={yOf(margeMinPct)} x2={W - PAD_R} y2={yOf(margeMinPct)}
              stroke="#D97706" strokeWidth={1.2} strokeDasharray="5 4" opacity={0.7}
            />
            <text
              x={W - PAD_R - 4} y={yOf(margeMinPct) - 4}
              fontSize={10} fill="#D97706" textAnchor="end" fontWeight={700}
            >
              seuil mini {margeMinPct.toFixed(0)} %
            </text>
          </>
        )}

        {/* Bars */}
        {points.map((p, i) => {
          const h = p.margePct >= 0 ? zeroY - yOf(p.margePct) : yOf(p.margePct) - zeroY
          const y = p.margePct >= 0 ? yOf(p.margePct) : zeroY
          return (
            <g key={p.monthIndex}>
              <rect
                x={xOf(i) - barW / 2}
                y={y}
                width={barW}
                height={Math.max(1, h)}
                fill={barColor(p.margePct)}
                opacity={0.85}
                rx={2}
              >
                <title>
                  {MONTH_ABBR_FR[p.calendarMonth]} {p.year} (mois {p.monthIndex})
                  {"\n"}Marge cumulée : {p.margePct.toFixed(1)} % ({formatEur(p.margeNetteEur)})
                  {"\n"}Cumul revenu : {formatEur(p.cumulRevenu)} | Coût employeur : {formatEur(p.cumulCost)}
                  {"\n"}Coût rupture : {p.coutRupture > 0 ? formatEur(p.coutRupture) : "0 € (essai)"}
                </title>
              </rect>
              {barW >= 18 && (
                <text
                  x={xOf(i)} y={y - 3}
                  fontSize={9} fill="#374151" textAnchor="middle" fontWeight={700}
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

      {/* Récap pire / meilleur mois */}
      <div style={{
        marginTop: 14, paddingTop: 12, borderTop: "1px solid #F0ECF8",
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 8,
      }}>
        {profile.worstMonth && (
          <StatTile
            label="Pire moment pour rompre"
            value={`${MONTH_ABBR_FR[profile.worstMonth.calendarMonth]} ${profile.worstMonth.year}`}
            hint={`Marge ${profile.worstMonth.margePct.toFixed(1)} % · ${formatEur(profile.worstMonth.margeNetteEur)}`}
            tone={profile.worstMonth.margePct < 0 ? "bad" : profile.worstMonth.margePct < (margeMinPct ?? 15) ? "warn" : undefined}
          />
        )}
        {profile.bestMonth && (
          <StatTile
            label="Meilleur moment pour rompre"
            value={`${MONTH_ABBR_FR[profile.bestMonth.calendarMonth]} ${profile.bestMonth.year}`}
            hint={`Marge ${profile.bestMonth.margePct.toFixed(1)} % · ${formatEur(profile.bestMonth.margeNetteEur)}`}
            tone="good"
          />
        )}
        <StatTile
          label="Préavis Syntec"
          value={`${profile.preavisMois} mois`}
          hint={`Coût pendant préavis ≈ ${formatEur(profile.preavisMois * (points[0]?.cumulCost / points[0]?.cumulDays * 21 || 0))}/mois (estim.)`}
        />
        <StatTile
          label="Fin période d'essai"
          value={`Mois ${profile.finEssaiMois}`}
          hint="Avant : rupture gratuite. Après : coût rupture appliqué."
        />
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────── */

function StatTile({
  label, value, hint, tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: "good" | "warn" | "bad"
}) {
  const color =
    tone === "good" ? "#16A34A" :
    tone === "warn" ? "#D97706" :
    tone === "bad"  ? "#DC2626" :
                      "#111827"
  return (
    <div style={{
      background: "#FAFAFA", border: "1px solid #F0ECF8", borderRadius: 9,
      padding: "9px 11px",
    }}>
      <div style={{
        fontSize: 10.5, fontWeight: 700, color: "#9CA3AF",
        letterSpacing: "0.04em", textTransform: "uppercase",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 14, fontWeight: 800, color,
        fontVariantNumeric: "tabular-nums", marginTop: 1,
      }}>
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 10.5, color: "#6B7280", marginTop: 1 }}>
          {hint}
        </div>
      )}
    </div>
  )
}

function formatEur(v: number): string {
  const sign = v < 0 ? "−" : ""
  return `${sign}${Math.abs(Math.round(v)).toLocaleString("fr-FR")} €`
}
