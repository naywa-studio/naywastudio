/**
 * pricing-pdf — synthèse pricing PDF d'une page envoyée au client / partagée
 * en interne.
 *
 * Construit à partir des sorties syntec.ts (computeMissionMargin +
 * computeEmployerCost + computeRuptureRiskProfile) — aucun calcul nouveau
 * ici. Le PDF reflète exactement ce que le sourceur voit dans le widget,
 * pour une cible (TJM, Brut) fixée au moment de l'export.
 *
 * Header marqué du cabinet (brand_name + brand_logo_path du profil) ; si
 * absent, fallback "Naywa Studio".
 */

import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer"
import type {
  MissionMarginSummary,
  EmployerCostBreakdown,
  Avantages,
  Lieu,
  PricingInputs,
} from "./syntec"
import type { MonthProfile } from "./calendar"

const PURPLE = "#7C63C8"
const PURPLE_SOFT = "#F4F1FB"
const INK = "#1F2937"
const MUTED = "#6B7280"
const LINE = "#E5E1F2"
const GREEN = "#15803D"
const ORANGE = "#B45309"
const RED = "#B91C1C"

const DEFAULT_BRAND = "NAYWA STUDIO"

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 44, paddingHorizontal: 44, fontSize: 9.5, color: INK, fontFamily: "Helvetica" },

  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  brandLeft: { flexDirection: "row", alignItems: "center" },
  brandLogo: { width: 30, height: 30, marginRight: 10 },
  brand: { fontSize: 11, fontFamily: "Helvetica-Bold", color: PURPLE, letterSpacing: 1 },
  brandTag: { fontSize: 8, color: MUTED, letterSpacing: 0.5 },
  rule: { borderBottomWidth: 1.4, borderBottomColor: PURPLE, marginTop: 8, marginBottom: 16 },

  headline: { fontSize: 18, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 4 },
  subhead: { fontSize: 10, color: MUTED, marginBottom: 14 },

  /* Two-column blocks (Mission / Candidat) */
  blockRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
  block: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 10 },
  blockTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: PURPLE, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 },
  blockLine: { flexDirection: "row", marginBottom: 3 },
  blockLabel: { fontSize: 9, color: MUTED, width: 90 },
  blockValue: { fontSize: 9.5, color: INK, fontFamily: "Helvetica-Bold", flex: 1 },

  /* Verdict KPI strip */
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  kpi: { flex: 1, borderWidth: 1.4, borderRadius: 8, padding: 10 },
  kpiLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: MUTED, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 3 },
  kpiValue: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  kpiSub: { fontSize: 7.5, color: MUTED, marginTop: 2 },

  /* Section titles + lists */
  sectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: MUTED, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, marginTop: 4 },

  /* Avantages chips */
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
  chip: { flexDirection: "row", backgroundColor: PURPLE_SOFT, borderWidth: 1, borderColor: LINE, borderRadius: 3, paddingVertical: 2.5, paddingHorizontal: 6, marginRight: 5, marginBottom: 5 },
  chipLabel: { fontSize: 8, color: MUTED, marginRight: 4 },
  chipValue: { fontSize: 8, color: INK, fontFamily: "Helvetica-Bold" },

  /* Monthly margin table */
  tableHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 4, marginBottom: 2 },
  tableRow: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: "#F4F1FB" },
  th: { fontSize: 7.5, color: MUTED, fontFamily: "Helvetica-Bold", letterSpacing: 0.6, textTransform: "uppercase" },
  td: { fontSize: 9, color: INK },
  thMonth: { flex: 2 },
  thNum: { flex: 1, textAlign: "right" },

  footer: { position: "absolute", bottom: 24, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 7.5, color: MUTED },
})

const MONTH_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"]

function formatEur(v: number): string {
  const sign = v < 0 ? "−" : ""
  return `${sign}${Math.abs(Math.round(v)).toLocaleString("fr-FR")} €`
}
function formatEurInt(v: number): string {
  return Math.round(v).toLocaleString("fr-FR")
}

const LIEU_LABELS: Record<Lieu, string> = {
  paris_petite_couronne: "Paris / Petite Couronne",
  idf_grande_couronne: "Île-de-France",
  lyon: "Lyon",
  province: "Province",
}

export interface PricingPdfProps {
  brand: { name: string | null; logoUrl: string | null }
  mission: {
    title: string
    location: string | null
    contract: string | null
    durationMonths: number
    startDate: string | null /* ISO */
  }
  candidate: {
    fullName: string
    currentTitle: string | null
    yearsExperience: number | null
  }
  pricing: {
    tjm: number
    brutAnnuel: number
    inputs: PricingInputs
    seniorityLabel: string
    lieu: Lieu
  }
  margins: {
    margeMinPct: number
    margeTargetPct: number
  }
  /** Mois calendaires avec leur marge € (issus de syntec.ts). */
  monthly: Array<MonthProfile & { revenu: number; coutTotal: number; marge: number; margePct: number }>
  summary: MissionMarginSummary
  cost: EmployerCostBreakdown
  avantages: Avantages
}

export default function PricingPdf({
  brand, mission, candidate, pricing, margins, monthly, summary, cost, avantages,
}: PricingPdfProps) {
  const brandName = brand.name ?? DEFAULT_BRAND
  const dateStr = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })

  // Verdict status (matches widget logic)
  const status = summary.margePct >= margins.margeTargetPct ? "ok"
                : summary.margePct >= margins.margeMinPct   ? "warn"
                : summary.margePct >= 0                     ? "alert"
                                                            : "alert"
  const statusColor = status === "ok" ? GREEN : status === "warn" ? ORANGE : RED
  const statusLabel = status === "ok"    ? "Mission rentable"
                    : status === "warn"  ? "Marge sous la cible"
                    : summary.margePct >= 0 ? "Marge sous le plancher"
                                            : "Mission en perte"

  /* Build chip list from active avantages */
  const chips: { label: string; value: string }[] = []
  if ((avantages.mutuellePremium ?? 0) > 0)               chips.push({ label: "Mutuelle",           value: `${avantages.mutuellePremium} €/mois` })
  if ((avantages.medecineDuTravailAnnuel ?? 0) > 0)       chips.push({ label: "Médecine",            value: `${avantages.medecineDuTravailAnnuel} €/an` })
  if ((avantages.transport ?? 0) > 0)                     chips.push({ label: "Transport",           value: `${avantages.transport} €/mois` })
  if ((avantages.ticketsResto ?? 0) > 0)                  chips.push({ label: "Tickets resto",       value: `${avantages.ticketsResto} €/j` })
  if ((avantages.forfaitMobilite ?? 0) > 0)               chips.push({ label: "Mobilité durable",    value: `${avantages.forfaitMobilite} €/mois` })
  if ((avantages.indemniteKilometriqueAnnuelle ?? 0) > 0) chips.push({ label: "Indemnité km",        value: `${avantages.indemniteKilometriqueAnnuelle} €/an` })
  if (avantages.treiziemeMois)                            chips.push({ label: "13ᵉ mois",            value: "actif" })
  if ((avantages.urssafIndemniteJour ?? 0) > 0)           chips.push({ label: "Grand déplacement",   value: `${avantages.urssafIndemniteJour} €/j` })
  if ((avantages.expatriationMensuelle ?? 0) > 0)         chips.push({ label: "Expatriation",        value: `${avantages.expatriationMensuelle} €/mois` })
  if ((avantages.autresMensuels ?? 0) > 0)                chips.push({ label: "Autres",              value: `${avantages.autresMensuels} €/mois` })

  /* Cap monthly table to 24 rows max to fit one page */
  const rows = monthly.slice(0, 24)

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Brand header */}
        <View style={s.brandRow}>
          <View style={s.brandLeft}>
            {brand.logoUrl && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={brand.logoUrl} style={s.brandLogo} />
            )}
            <Text style={s.brand}>{brandName.toUpperCase()}</Text>
          </View>
          <Text style={s.brandTag}>SYNTHÈSE PRICING · {dateStr}</Text>
        </View>
        <View style={s.rule} />

        <Text style={s.headline}>Pricing — {candidate.fullName}</Text>
        <Text style={s.subhead}>
          {candidate.currentTitle ?? ""}
          {candidate.yearsExperience != null ? `  ·  ${candidate.yearsExperience} ans d'expérience` : ""}
        </Text>

        {/* Mission / Candidat */}
        <View style={s.blockRow}>
          <View style={s.block}>
            <Text style={s.blockTitle}>Mission</Text>
            <View style={s.blockLine}><Text style={s.blockLabel}>Intitulé</Text><Text style={s.blockValue}>{mission.title}</Text></View>
            <View style={s.blockLine}><Text style={s.blockLabel}>Lieu</Text><Text style={s.blockValue}>{mission.location ?? LIEU_LABELS[pricing.lieu]}</Text></View>
            <View style={s.blockLine}><Text style={s.blockLabel}>Contrat</Text><Text style={s.blockValue}>{mission.contract ?? "—"}</Text></View>
            <View style={s.blockLine}><Text style={s.blockLabel}>Durée</Text><Text style={s.blockValue}>{mission.durationMonths} mois</Text></View>
            {mission.startDate && (
              <View style={s.blockLine}>
                <Text style={s.blockLabel}>Démarrage</Text>
                <Text style={s.blockValue}>{new Date(mission.startDate).toLocaleDateString("fr-FR")}</Text>
              </View>
            )}
          </View>
          <View style={s.block}>
            <Text style={s.blockTitle}>Cadrage Syntec</Text>
            <View style={s.blockLine}><Text style={s.blockLabel}>Séniorité</Text><Text style={s.blockValue}>{pricing.seniorityLabel}</Text></View>
            <View style={s.blockLine}><Text style={s.blockLabel}>Position</Text><Text style={s.blockValue}>Cadre · {pricing.inputs.position} · coef {pricing.inputs.coefficient}</Text></View>
            <View style={s.blockLine}><Text style={s.blockLabel}>TJM client</Text><Text style={s.blockValue}>{pricing.tjm} €/j HT</Text></View>
            <View style={s.blockLine}><Text style={s.blockLabel}>Brut proposé</Text><Text style={s.blockValue}>{formatEurInt(pricing.brutAnnuel)} €/an</Text></View>
            <View style={s.blockLine}><Text style={s.blockLabel}>Coût employeur</Text><Text style={s.blockValue}>{formatEur(cost.coutFixeMensuel + cost.coutVariableJournalier * 21)}/mois (≈)</Text></View>
          </View>
        </View>

        {/* Verdict KPIs */}
        <View style={s.kpiRow}>
          <View style={[s.kpi, { borderColor: statusColor, backgroundColor: status === "ok" ? "rgba(34,197,94,0.06)" : status === "warn" ? "rgba(217,119,6,0.05)" : "rgba(220,38,38,0.05)" }]}>
            <Text style={[s.kpiLabel, { color: statusColor }]}>Marge moyenne · {statusLabel}</Text>
            <Text style={[s.kpiValue, { color: statusColor }]}>{summary.margePct.toFixed(1)} %</Text>
            <Text style={s.kpiSub}>cible {margins.margeTargetPct}% · plancher {margins.margeMinPct}%</Text>
          </View>
          <View style={[s.kpi, { borderColor: LINE }]}>
            <Text style={s.kpiLabel}>Marge mensuelle moyenne</Text>
            <Text style={[s.kpiValue, { color: INK }]}>{formatEur(summary.margeMoyenneEur)}</Text>
            <Text style={s.kpiSub}>sur {summary.monthCount} mois</Text>
          </View>
          <View style={[s.kpi, { borderColor: LINE }]}>
            <Text style={s.kpiLabel}>Marge totale mission</Text>
            <Text style={[s.kpiValue, { color: INK }]}>{formatEur(summary.margeTotaleEur)}</Text>
            <Text style={s.kpiSub}>{summary.totalWorkingDays} j travaillés</Text>
          </View>
        </View>

        {/* Avantages */}
        {chips.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Avantages appliqués</Text>
            <View style={s.chipRow}>
              {chips.map((c) => (
                <View key={c.label} style={s.chip}>
                  <Text style={s.chipLabel}>{c.label}</Text>
                  <Text style={s.chipValue}>{c.value}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Monthly margin table */}
        <Text style={s.sectionTitle}>Marge mensuelle (calendrier réel)</Text>
        <View style={s.tableHead}>
          <Text style={[s.th, s.thMonth]}>Mois</Text>
          <Text style={[s.th, s.thNum]}>Jours</Text>
          <Text style={[s.th, s.thNum]}>Revenu</Text>
          <Text style={[s.th, s.thNum]}>Coût</Text>
          <Text style={[s.th, s.thNum]}>Marge €</Text>
          <Text style={[s.th, s.thNum]}>Marge %</Text>
        </View>
        {rows.map((r) => (
          <View key={`${r.year}-${r.calendarMonth}`} style={s.tableRow}>
            <Text style={[s.td, s.thMonth]}>{MONTH_FR[r.calendarMonth]} {r.year}{r.isPartial ? " ·partiel" : ""}</Text>
            <Text style={[s.td, s.thNum]}>{r.workingDays}</Text>
            <Text style={[s.td, s.thNum]}>{formatEur(r.revenu)}</Text>
            <Text style={[s.td, s.thNum]}>{formatEur(r.coutTotal)}</Text>
            <Text style={[s.td, s.thNum, { color: r.marge < 0 ? RED : INK }]}>{formatEur(r.marge)}</Text>
            <Text style={[s.td, s.thNum, { color: r.margePct < margins.margeMinPct ? ORANGE : INK }]}>{r.margePct.toFixed(1)} %</Text>
          </View>
        ))}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            Calculs Syntec 2026 · {brandName} · {dateStr}
          </Text>
          <Text style={s.footerText}>Document interne</Text>
        </View>
      </Page>
    </Document>
  )
}
