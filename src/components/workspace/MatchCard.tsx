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

type MatchSource = "applied" | "uploaded" | "vivier_matched" | "vivier_assigned"
type AssessmentRow = MatchAssessment & { candidate: Candidate | null }

const SOURCE_META: Record<MatchSource, { label: string; color: string; bg: string; bd: string }> = {
  applied:         { label: "Postulé",  color: "#15803d", bg: "rgba(34,197,94,0.08)",  bd: "rgba(34,197,94,0.25)" },
  uploaded:        { label: "Importé",  color: "#1D4ED8", bg: "rgba(59,130,246,0.08)", bd: "rgba(59,130,246,0.25)" },
  vivier_matched:  { label: "Vivier",   color: "#7C63C8", bg: "rgba(124,99,200,0.08)", bd: "rgba(124,99,200,0.25)" },
  vivier_assigned: { label: "Assigné",  color: "#6B7280", bg: "#F3F4F6",                bd: "#E5E7EB" },
}

interface Props {
  row: AssessmentRow
  /** Critères main de la mission, dans l'ordre choisi par le sourceur. */
  mainCriteria: Criterion[]
  onTogglePipeline: (id: string, next: boolean) => void
}

export function MatchCard({ row, mainCriteria, onTogglePipeline }: Props) {
  const c = row.candidate
  const name = c?.full_name ?? c?.cv_file_name ?? "Candidat"
  const initials = name.split(/\s+/).slice(0, 2).map((s) => s[0] ?? "").join("").toUpperCase() || "?"
  const source = (row.source as MatchSource) ?? "vivier_matched"
  const srcMeta = SOURCE_META[source]
  const tier = tierMeta(row.match_tier)
  const evalById = new Map((row.criteria_eval ?? []).map((e) => [e.id, e as CriterionEval]))

  return (
    <m.article
      whileHover={{ y: -2, boxShadow: ui.shadowMd, borderColor: ui.borderBrand }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      style={{
        background: ui.surface, border: `1px solid ${ui.borderSoft}`, borderRadius: ui.radiusMd,
        padding: "14px 16px", boxShadow: ui.shadowSm,
        display: "flex", flexDirection: "column", gap: 10,
      }}
    >
      {/* Header — identité + provenance + avis + actions */}
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
          background: "rgba(124,99,200,0.08)",
          border: "1px solid rgba(124,99,200,0.18)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#7C63C8", fontWeight: 800, fontSize: 13,
        }}>{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              {tier.label}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 11, color: ui.textMuted, fontStyle: "italic", flexShrink: 0 }}>Non scoré</span>
        )}
      </header>

      {/* Critères main — rendu compact, chaque critère = jauge ou badge Y/N/? */}
      {mainCriteria.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 8,
        }}>
          {mainCriteria.map((crit) => (
            <CriterionEvalRow key={crit.id} criterion={crit} ev={evalById.get(crit.id)} />
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
        <button
          onClick={() => onTogglePipeline(row.id, !row.in_pipeline)}
          title={row.in_pipeline ? "Retirer de la pipeline" : "Suivre dans la pipeline"}
          style={{
            fontSize: 11.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
            padding: "6px 11px", borderRadius: 8,
            color: row.in_pipeline ? "#15803d" : "#7C63C8",
            background: row.in_pipeline ? "rgba(34,197,94,0.08)" : "white",
            border: `1px solid ${row.in_pipeline ? "rgba(34,197,94,0.3)" : "rgba(124,99,200,0.3)"}`,
            whiteSpace: "nowrap",
          }}
        >
          {row.in_pipeline ? "✓ Dans le pipeline" : "+ Ajouter à la pipeline"}
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
            Fiche
          </Link>
        )}
        <Link href={`/workspace/match/${row.id}`} style={{
          fontSize: 12, fontWeight: 700, color: "white",
          padding: "6px 14px", borderRadius: 8,
          background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
          textDecoration: "none",
        }}>
          Ouvrir
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 5, verticalAlign: "-1px" }} aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
    </m.article>
  )
}

/** Une ligne critère = nom court + jauge remplie (quant) ou badge ✓/✗/? (qual).
 *  Le tooltip garde le label complet + l'evidence pour le détail. */
function CriterionEvalRow({ criterion, ev }: { criterion: Criterion; ev: CriterionEval | undefined }) {
  const isQuant = kindOf(criterion.type) === "quantitative"
  const score = isQuant ? (ev?.score ?? null) : null
  const status = isQuant ? undefined : ev?.status
  const name = criterionHeaderLabel(criterion)
  const fullLabel = shortCriterionLabel(criterion)
  const tooltip = ev?.evidence ? `${fullLabel} — ${ev.evidence}` : fullLabel

  if (isQuant) {
    const p = dimColor(score)
    const pct = score != null ? Math.max(0, Math.min(100, score)) : 0
    return (
      <div title={tooltip} style={{
        padding: "7px 10px",
        background: "#FAFAFB", border: "1px solid #F0ECF8",
        borderRadius: 8, minWidth: 0,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6, marginBottom: 5 }}>
          <span style={{
            fontSize: 11, color: "#6B7280", fontWeight: 600,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
          }}>
            {name}
          </span>
          <span style={{
            fontSize: 12, fontWeight: 800, color: p.color,
            fontVariantNumeric: "tabular-nums", flexShrink: 0,
          }}>
            {score != null ? score : "—"}
          </span>
        </div>
        {/* Jauge remplie proportionnelle au score */}
        <div style={{ height: 5, borderRadius: 99, background: "#EFEBF8", overflow: "hidden" }}>
          <div style={{
            width: `${pct}%`, height: "100%", borderRadius: 99,
            background: p.color,
            transition: "width 400ms cubic-bezier(0.22,1,0.36,1)",
          }} />
        </div>
      </div>
    )
  }

  // Qualitatif → conteneur identique (hauteur alignée) : nom + ✓/✗/?
  const p = statusColor(status)
  return (
    <div
      title={tooltip}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 10px",
        background: p.bg, border: `1px solid ${p.bd}`,
        borderRadius: 8, minWidth: 0,
      }}
    >
      <span style={{
        fontSize: 11, color: "#6B7280", fontWeight: 600,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        flex: 1, minWidth: 0,
      }}>
        {name}
      </span>
      <span style={{
        fontSize: 12, fontWeight: 800, color: p.color,
        width: 18, height: 18, borderRadius: "50%",
        background: "white", border: `1px solid ${p.bd}`,
        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {p.icon}
      </span>
    </div>
  )
}
