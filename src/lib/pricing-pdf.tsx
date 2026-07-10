/* eslint-disable jsx-a11y/alt-text */
import React from "react"
import {
  Document, Page, View, Text, Image, StyleSheet,
} from "@react-pdf/renderer"

/**
 * Pricing scenario PDF — exhaustive textual snapshot of a candidate ×
 * mission pricing setup. No charts (heavy to render server-side); the
 * value of the PDF is the audit-grade detail.
 *
 * Two modes:
 *   - identified (anonymize=false) : full candidate name + title
 *   - anonymous (anonymize=true)   : ref only ("C-1A2B3C4D"), used when
 *     the PDF is shared with the end client
 *
 * Header carries the cabinet branding (logo + name) so the document
 * stands on its own outside the workspace.
 */

const COLORS = {
  primary: "#7C63C8",
  ink: "#111827",
  body: "#374151",
  muted: "#6B7280",
  faint: "#9CA3AF",
  rule: "#E5E7EB",
  surface: "#F8F6FF",
  good: "#15803d",
  warn: "#B45309",
  bad: "#B91C1C",
}

const S = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: COLORS.body, padding: 36 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.rule },
  brandBlock: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandLogo: { width: 38, height: 38, objectFit: "contain" },
  brandText: { fontSize: 13, fontWeight: 700, color: COLORS.ink },
  brandSub: { fontSize: 8, color: COLORS.muted, marginTop: 1 },
  docTitle: { fontSize: 9, fontWeight: 700, color: COLORS.primary, textTransform: "uppercase", letterSpacing: 1 },
  docDate: { fontSize: 8, color: COLORS.faint, marginTop: 2, textAlign: "right" },

  h1: { fontSize: 18, fontWeight: 700, color: COLORS.ink, marginBottom: 4 },
  h2: { fontSize: 11, fontWeight: 700, color: COLORS.ink, marginTop: 18, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 },

  meta: { fontSize: 9, color: COLORS.muted, marginBottom: 12 },

  verdictBlock: { flexDirection: "row", gap: 10, marginTop: 12 },
  kpi: { flex: 1, padding: "10 12", backgroundColor: COLORS.surface, borderRadius: 6 },
  kpiLabel: { fontSize: 7, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  kpiValue: { fontSize: 16, fontWeight: 700, color: COLORS.ink, marginTop: 3 },
  kpiHint: { fontSize: 7, color: COLORS.muted, marginTop: 2 },

  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COLORS.rule, paddingVertical: 5 },
  rowLabel: { flex: 1, color: COLORS.muted },
  rowValue: { color: COLORS.ink, fontWeight: 700, textAlign: "right" },

  twoCol: { flexDirection: "row", gap: 18 },
  col: { flex: 1 },

  footer: { position: "absolute", bottom: 24, left: 36, right: 36, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: COLORS.rule, fontSize: 7, color: COLORS.faint, textAlign: "center" },
})

export interface PricingPdfData {
  cabinet: {
    name: string
    logoBase64: string | null  // data URL or null
  }
  candidate: {
    label: string              // either full name or "Réf C-XXXXXXXX"
    title: string | null
  }
  mission: {
    title: string
    location: string | null
    startDate: string | null   // ISO
    durationMonths: number | null
    contractType: string | null
  }
  pricing: {
    tjm: number
    brutAnnuel: number
    margeAvgPct: number
    margeMensuelleEur: number
    margeTotaleEur: number
    margeMinPct: number | null
    margeTargetPct: number | null
    statut: string             // "ETAM" / "CADRE"
    position: string
    coefficient: number
    joursParMois: number
    rttJoursAn: number
  }
  avantages: Array<{ label: string; valueLabel: string }>
  generatedAt: string          // ISO
  generatedBy: string          // user email
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n)) + " €"
}
function formatPct(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n) + " %"
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
}

export function PricingScenarioPdf({ data }: { data: PricingPdfData }) {
  const verdict = verdictForMargin(data.pricing.margeAvgPct, data.pricing.margeMinPct, data.pricing.margeTargetPct)

  return (
    <Document title={`Pricing — ${data.candidate.label} × ${data.mission.title}`}>
      <Page size="A4" style={S.page}>
        {/* Header */}
        <View style={S.header}>
          <View style={S.brandBlock}>
            {data.cabinet.logoBase64 ? (
              <Image style={S.brandLogo} src={data.cabinet.logoBase64} />
            ) : null}
            {/* Pas de sous-titre codé en dur ("Cabinet de recrutement" était
                faux pour une ESN) — le nom + logo de l'organisation suffisent. */}
            <View>
              <Text style={S.brandText}>{data.cabinet.name}</Text>
            </View>
          </View>
          <View>
            <Text style={S.docTitle}>Fiche pricing</Text>
            <Text style={S.docDate}>{formatDate(data.generatedAt)}</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={S.h1}>{data.candidate.label}</Text>
        <Text style={S.meta}>
          {data.candidate.title ?? "—"}{" "}
          · Mission&nbsp;: {data.mission.title}
          {data.mission.contractType ? ` · ${data.mission.contractType}` : ""}
          {data.mission.location ? ` · ${data.mission.location}` : ""}
        </Text>

        {/* Verdict KPIs */}
        <View style={S.verdictBlock}>
          <View style={S.kpi}>
            <Text style={S.kpiLabel}>Marge moyenne</Text>
            <Text style={[S.kpiValue, { color: verdict.color }]}>{formatPct(data.pricing.margeAvgPct)}</Text>
            <Text style={S.kpiHint}>{verdict.label}</Text>
          </View>
          <View style={S.kpi}>
            <Text style={S.kpiLabel}>Marge mensuelle</Text>
            <Text style={S.kpiValue}>{formatEur(data.pricing.margeMensuelleEur)}</Text>
            <Text style={S.kpiHint}>par mois facturé</Text>
          </View>
          <View style={S.kpi}>
            <Text style={S.kpiLabel}>Total mission</Text>
            <Text style={S.kpiValue}>{formatEur(data.pricing.margeTotaleEur)}</Text>
            <Text style={S.kpiHint}>
              sur {data.mission.durationMonths ?? "—"} mois
            </Text>
          </View>
        </View>

        {/* Two-column detail block */}
        <View style={S.twoCol}>
          <View style={S.col}>
            <Text style={S.h2}>Paramètres mission</Text>
            <DetailRow label="Mission" value={data.mission.title} />
            <DetailRow label="Type de contrat" value={data.mission.contractType ?? "—"} />
            <DetailRow label="Lieu" value={data.mission.location ?? "—"} />
            <DetailRow label="Début" value={data.mission.startDate ? formatDate(data.mission.startDate) : "À définir"} />
            <DetailRow label="Durée" value={data.mission.durationMonths ? `${data.mission.durationMonths} mois` : "—"} />

            <Text style={S.h2}>Levier financier</Text>
            <DetailRow label="TJM client" value={`${formatEur(data.pricing.tjm)}/jour`} />
            <DetailRow label="Brut annuel candidat" value={formatEur(data.pricing.brutAnnuel)} />
            <DetailRow label="Marge minimale exigée" value={data.pricing.margeMinPct != null ? formatPct(data.pricing.margeMinPct) : "—"} />
            <DetailRow label="Marge cible" value={data.pricing.margeTargetPct != null ? formatPct(data.pricing.margeTargetPct) : "—"} />
          </View>

          <View style={S.col}>
            <Text style={S.h2}>Cadre Syntec</Text>
            <DetailRow label="Statut" value={data.pricing.statut} />
            <DetailRow label="Position" value={data.pricing.position} />
            <DetailRow label="Coefficient" value={String(data.pricing.coefficient)} />
            <DetailRow label="Jours facturables/mois" value={String(data.pricing.joursParMois)} />
            <DetailRow label="RTT cabinet (jours/an)" value={String(data.pricing.rttJoursAn)} />

            <Text style={S.h2}>Avantages inclus</Text>
            {data.avantages.length > 0 ? data.avantages.map((a, i) => (
              <DetailRow key={i} label={a.label} value={a.valueLabel} />
            )) : (
              <Text style={[S.rowLabel, { paddingVertical: 5 }]}>Aucun avantage configuré</Text>
            )}
          </View>
        </View>

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text>
            Document généré le {formatDate(data.generatedAt)} par {data.generatedBy} —
            Naywa Studio · L&apos;IA traite, vous décidez.
          </Text>
        </View>
      </Page>
    </Document>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={S.row}>
      <Text style={S.rowLabel}>{label}</Text>
      <Text style={S.rowValue}>{value}</Text>
    </View>
  )
}

function verdictForMargin(actual: number, min: number | null, target: number | null) {
  if (target != null && actual >= target) return { color: COLORS.good, label: "au-dessus de la cible" }
  if (min != null && actual >= min)         return { color: COLORS.warn, label: "au-dessus du seuil minimum" }
  return { color: COLORS.bad, label: "sous le seuil minimum" }
}
