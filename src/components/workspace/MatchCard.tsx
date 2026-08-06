"use client"

/**
 * Carte d'un match (PR-Z) — remplace l'ancienne MatchRow tableau.
 *
 * Affiche pour CHAQUE critère main de la mission la valeur évaluée :
 *   - quantitatif → barre pondération 0-100 colorée
 *   - qualitatif  → badge ✓ / ✗ / ? avec evidence en tooltip
 *
 * Bouton Pipeline + Ouvrir + Fiche à droite, badge source + avis Nora
 * (tier) en haut.
 */

import Link from "next/link"
import { m } from "framer-motion"
import type { Candidate, MatchAssessment } from "@/lib/database.types"
import type { Criterion, CriterionEval } from "@/lib/job-criteria-catalog"
import { kindOf } from "@/lib/job-criteria-catalog"
import { ui } from "@/lib/ui-tokens"
import {
  criterionHeaderLabel, shortCriterionLabel, dimColor, statusColor, tierMeta,
} from "@/lib/criterion-display"
import { useLanguage, type Lang } from "@/lib/i18n/LanguageContext"

type MatchSource = "applied" | "uploaded" | "vivier_matched" | "vivier_assigned"
type AssessmentRow = MatchAssessment & { candidate: Candidate | null }

const SOURCE_META: Record<Lang, Record<MatchSource, { label: string; color: string; bg: string; bd: string }>> = {
  fr: {
    applied:         { label: "Postulé",  color: "var(--nw-success)", bg: "rgba(34,197,94,0.08)",  bd: "rgba(34,197,94,0.25)" },
    uploaded:        { label: "Importé",  color: "#1D4ED8", bg: "rgba(59,130,246,0.08)", bd: "rgba(59,130,246,0.25)" },
    vivier_matched:  { label: "Vivier",   color: "var(--nw-primary)", bg: "rgba(124,99,200,0.08)", bd: "rgba(124,99,200,0.25)" },
    vivier_assigned: { label: "Assigné",  color: "var(--nw-text-muted)", bg: "var(--nw-neutral-100)",                bd: "var(--nw-border)" },
  },
  en: {
    applied:         { label: "Applied",  color: "var(--nw-success)", bg: "rgba(34,197,94,0.08)",  bd: "rgba(34,197,94,0.25)" },
    uploaded:        { label: "Imported", color: "#1D4ED8", bg: "rgba(59,130,246,0.08)", bd: "rgba(59,130,246,0.25)" },
    vivier_matched:  { label: "Talent pool", color: "var(--nw-primary)", bg: "rgba(124,99,200,0.08)", bd: "rgba(124,99,200,0.25)" },
    vivier_assigned: { label: "Assigned", color: "var(--nw-text-muted)", bg: "var(--nw-neutral-100)",                bd: "var(--nw-border)" },
  },
}

const copy = {
  fr: {
    candidateFallback: "Candidat",
    notScored: "Non scoré",
    removeFromPipeline: "Retirer de la shortlist",
    trackInPipeline: "Ajouter à la shortlist",
    inPipeline: "✓ Dans la shortlist",
    addToPipeline: "+ Ajouter à la shortlist",
    profile: "Fiche",
    open: "Ouvrir",
    readOnlyPipeline: "Lecture seule — souscrivez pour gérer la shortlist",
  },
  en: {
    candidateFallback: "Candidate",
    notScored: "Not scored",
    removeFromPipeline: "Remove from shortlist",
    trackInPipeline: "Add to shortlist",
    inPipeline: "✓ In shortlist",
    addToPipeline: "+ Add to shortlist",
    profile: "Profile",
    open: "Open",
    readOnlyPipeline: "Read-only — subscribe to manage the shortlist",
  },
}

interface Props {
  row: AssessmentRow
  /** Critères main de la mission, dans l'ordre choisi par le sourceur. */
  mainCriteria: Criterion[]
  onTogglePipeline: (id: string, next: boolean) => void
  /** Lecture seule : le toggle pipeline est grisé (mutation bloquée serveur). */
  readOnly?: boolean
  /** Conflit off-limits : le candidat travaille chez un de nos clients. */
  offLimits?: { verdict: "possible" | "confirmed"; clientName: string } | null
}

const OFF_LIMITS_COPY = {
  fr: {
    confirmed: (c: string) => `Off-limits — en poste chez ${c}`,
    possible: (c: string) => `Conflit possible — proche de ${c}`,
  },
  en: {
    confirmed: (c: string) => `Off-limits — currently at ${c}`,
    possible: (c: string) => `Possible conflict — close to ${c}`,
  },
} as const

export function MatchCard({ row, mainCriteria, onTogglePipeline, readOnly = false, offLimits = null }: Props) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const c = row.candidate
  const name = c?.full_name ?? c?.cv_file_name ?? t.candidateFallback
  const initials = name.split(/\s+/).slice(0, 2).map((s) => s[0] ?? "").join("").toUpperCase() || "?"
  const source = (row.source as MatchSource) ?? "vivier_matched"
  const srcMeta = SOURCE_META[lang][source]
  const tier = tierMeta(row.match_tier, lang)
  const evalById = new Map((row.criteria_eval ?? []).map((e) => [e.id, e as CriterionEval]))

  return (
    <m.article
      whileHover={{ y: -2, boxShadow: ui.shadowMd, borderColor: ui.borderBrand }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      style={{
        background: ui.surface, border: `1px solid ${ui.borderSoft}`, borderRadius: ui.radiusMd,
        padding: "11px 14px", boxShadow: ui.shadowSm,
        display: "flex", flexDirection: "column", gap: 8,
      }}
    >
      {/* Header — identité + provenance + avis + actions */}
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
          background: "rgba(124,99,200,0.08)",
          border: "1px solid rgba(124,99,200,0.18)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--nw-primary)", fontWeight: 800, fontSize: 13,
        }}>{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: "var(--nw-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {name}
            </p>
            <span style={{
              fontSize: 10.5, fontWeight: 700,
              color: srcMeta.color, background: srcMeta.bg,
              border: `1px solid ${srcMeta.bd}`,
              borderRadius: 99, padding: "2px 8px",
              letterSpacing: "0.03em", whiteSpace: "nowrap",
            }}>{srcMeta.label}</span>
          </div>
          {c?.current_title && (
            <p style={{ margin: "2px 0 0", fontSize: 11.5, color: ui.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.current_title}{c.current_company ? ` · ${c.current_company}` : ""}
            </p>
          )}
          {offLimits && (
            <span
              title={OFF_LIMITS_COPY[lang][offLimits.verdict](offLimits.clientName)}
              style={{
                marginTop: 4,
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "2px 8px", borderRadius: 99, maxWidth: "100%",
                fontSize: 10.5, fontWeight: 700, letterSpacing: "0.02em",
                color: offLimits.verdict === "confirmed" ? "#B42318" : "#B54708",
                background: offLimits.verdict === "confirmed" ? "rgba(217,45,32,0.08)" : "rgba(245,158,11,0.10)",
                border: `1px solid ${offLimits.verdict === "confirmed" ? "rgba(217,45,32,0.28)" : "rgba(245,158,11,0.32)"}`,
              }}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" style={{ flexShrink: 0 }} aria-hidden="true">
                <path d="M8 1.5L15 14H1L8 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M8 6.2v3.2M8 11.4h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {OFF_LIMITS_COPY[lang][offLimits.verdict](offLimits.clientName)}
              </span>
            </span>
          )}
        </div>
        {/* Score = héros de la carte : gros chiffre + tier en dessous. */}
        {row.score != null ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
            minWidth: 62, padding: "5px 10px", borderRadius: ui.radiusMd,
            color: tier.color, background: tier.bg, border: `1px solid ${tier.bd}`,
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              {row.score}
            </span>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase" }}>
              {tier.label}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 11, color: ui.textMuted, fontStyle: "italic", flexShrink: 0 }}>{t.notScored}</span>
        )}
      </header>

      {/* Critères main — rangée compacte de mini-pastilles (coup d'œil de tri).
          Le détail encadré des jauges vit sur la fiche match. */}
      {mainCriteria.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {mainCriteria.map((crit) => (
            <CriterionEvalChip key={crit.id} criterion={crit} ev={evalById.get(crit.id)} />
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
        <button
          onClick={() => onTogglePipeline(row.id, !row.in_pipeline)}
          disabled={readOnly}
          title={readOnly ? t.readOnlyPipeline : (row.in_pipeline ? t.removeFromPipeline : t.trackInPipeline)}
          style={{
            fontSize: 11.5, fontWeight: 700, fontFamily: "inherit",
            cursor: readOnly ? "not-allowed" : "pointer",
            padding: "6px 11px", borderRadius: 8,
            color: readOnly ? "#B8AEDE" : (row.in_pipeline ? "var(--nw-success)" : "var(--nw-primary)"),
            background: readOnly ? "#F3F0FA" : (row.in_pipeline ? "rgba(34,197,94,0.08)" : "white"),
            border: `1px solid ${readOnly ? "#E5E0F0" : (row.in_pipeline ? "rgba(34,197,94,0.3)" : "rgba(124,99,200,0.3)")}`,
            whiteSpace: "nowrap",
          }}
        >
          {row.in_pipeline ? t.inPipeline : t.addToPipeline}
        </button>
        <div style={{ flex: 1 }} />
        {c && (
          <Link href={`/workspace/vivier/${c.id}`} style={{
            fontSize: 11.5, color: ui.textMuted, textDecoration: "none",
            display: "inline-flex", alignItems: "center", gap: 5,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {t.profile}
          </Link>
        )}
        <Link href={`/workspace/match/${row.id}`} style={{
          fontSize: 12, fontWeight: 700, color: "white",
          padding: "6px 14px", borderRadius: 8,
          background: "var(--nw-primary)",
          textDecoration: "none",
        }}>
          {t.open}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 5, verticalAlign: "-1px" }} aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
    </m.article>
  )
}

/** Mini-pastille critère = nom court + valeur (quant : score coloré + micro-jauge ;
 *  qual : ✓/✗/?). Rangée compacte pour le tri. Le tooltip garde label + evidence. */
function CriterionEvalChip({ criterion, ev }: { criterion: Criterion; ev: CriterionEval | undefined }) {
  const { lang } = useLanguage()
  const isQuant = kindOf(criterion.type) === "quantitative"
  const score = isQuant ? (ev?.score ?? null) : null
  const status = isQuant ? undefined : ev?.status
  const name = criterionHeaderLabel(criterion, lang)
  const fullLabel = shortCriterionLabel(criterion, lang)
  const tooltip = ev?.evidence ? `${fullLabel} — ${ev.evidence}` : fullLabel

  if (isQuant) {
    const p = dimColor(score)
    const pct = score != null ? Math.max(0, Math.min(100, score)) : 0
    return (
      <span title={tooltip} style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        padding: "3px 9px", borderRadius: 99, maxWidth: "100%",
        background: "#FAFAFB", border: "1px solid var(--nw-border-soft)",
      }}>
        <span style={{
          fontSize: 11, color: "var(--nw-text-muted)", fontWeight: 600,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130,
        }}>
          {name}
        </span>
        {/* Micro-jauge (24px) pour lire le niveau sans occuper de hauteur. */}
        <span style={{ width: 24, height: 4, borderRadius: 99, background: "#EFEBF8", overflow: "hidden", flexShrink: 0 }}>
          <span style={{ display: "block", width: `${pct}%`, height: "100%", background: p.color }} />
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: p.color, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
          {score != null ? score : "—"}
        </span>
      </span>
    )
  }

  // Qualitatif → nom + pastille ✓/✗/?
  const p = statusColor(status)
  return (
    <span title={tooltip} style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 9px", borderRadius: 99, maxWidth: "100%",
      background: p.bg, border: `1px solid ${p.bd}`,
    }}>
      <span style={{
        fontSize: 11, color: "var(--nw-text-muted)", fontWeight: 600,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130,
      }}>
        {name}
      </span>
      <span style={{
        fontSize: 11, fontWeight: 800, color: p.color,
        width: 16, height: 16, borderRadius: "50%",
        background: "white", border: `1px solid ${p.bd}`,
        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {p.icon}
      </span>
    </span>
  )
}
