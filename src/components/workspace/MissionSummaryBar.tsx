"use client"

/**
 * Bandeau résumé mission horizontal collapsible (PR-Z).
 *
 * S'affiche en haut de /workspace/missions/[jobId] une fois les critères
 * configurés. Replié par défaut après le premier accès, garde le focus
 * sur la liste de candidats. Bouton "Modifier les critères" pour
 * rouvrir le wizard.
 */

import { useState } from "react"
import Link from "next/link"
import type { Job } from "@/lib/database.types"
import type { Criterion } from "@/lib/job-criteria-catalog"
import { shortCriterionName } from "@/lib/criterion-display"

interface Props {
  job: Job
  criteria: Criterion[]
  onEditCriteria: () => void
  onImportCvs: () => void
  onMatchVivier: () => void
  onAssignFromVivier: () => void
  onCreateForm?: () => void
  matching: boolean
  /** Lecture seule (lockdown / accès suspendu) : actions de mutation grisées. */
  readOnly?: boolean
}

export function MissionSummaryBar({
  job, criteria, onEditCriteria, onImportCvs, onMatchVivier, onAssignFromVivier, onCreateForm, matching, readOnly = false,
}: Props) {
  const [open, setOpen] = useState(false)

  const mainCriteria  = criteria.filter((c) => c.weight === "main")
  const bonusCriteria = criteria.filter((c) => c.weight === "bonus")

  return (
    <section style={{
      background: "white", borderRadius: 16,
      border: "1px solid var(--nw-border-soft)",
      marginBottom: 18,
      overflow: "hidden",
    }}>
      {/* Ligne du dessus — toujours visible */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 18px", flexWrap: "wrap",
      }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Replier la mission" : "Déplier la mission"}
          style={{
            fontSize: 11, fontWeight: 700, color: "var(--nw-text-muted)",
            background: "transparent", border: "none",
            cursor: "pointer", fontFamily: "inherit",
            padding: "4px 6px",
          }}
        >
          {open ? "▾" : "▸"}
        </button>
        <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 2 }}>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--nw-text)", letterSpacing: "-0.01em" }}>
            {job.role_name?.trim() || job.title}
          </h1>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 11.5, color: "var(--nw-text-muted)" }}>
            {job.location && <span>{job.location}</span>}
            {job.contract_type && <span>· {job.contract_type}</span>}
            {job.seniority && <span>· {job.seniority}</span>}
            {mainCriteria.length > 0 && (
              <span>· <strong style={{ color: "var(--nw-success)", fontWeight: 700 }}>{mainCriteria.length}</strong> critère{mainCriteria.length > 1 ? "s" : ""} principa{mainCriteria.length > 1 ? "ux" : "l"}</span>
            )}
          </div>
        </div>
        {!matching && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={onImportCvs} disabled={readOnly} title={readOnly ? RO_TITLE : undefined} style={readOnly ? btnGhostDisabled : btnGhost}>+ Importer des CVs</button>
            <button onClick={onMatchVivier} disabled={readOnly} title={readOnly ? RO_TITLE : undefined} style={readOnly ? btnGhostDisabled : btnGhost}>↻ Matcher le vivier</button>
            <button onClick={onAssignFromVivier} disabled={readOnly} title={readOnly ? RO_TITLE : undefined} style={readOnly ? btnGhostDisabled : btnGhost}>+ Assigner depuis le vivier</button>
            {/* Formulaire public (E2) : masqué tant que la feature n'est pas
                livrée — un bouton grisé "bientôt" fait produit inachevé. Il
                réapparaîtra dès que le parent passera onCreateForm. */}
            {onCreateForm && (
              <button onClick={onCreateForm} disabled={readOnly} title={readOnly ? RO_TITLE : undefined} style={readOnly ? btnGhostDisabled : btnGhost}>
                + Créer un formulaire
              </button>
            )}
            <button onClick={onEditCriteria} disabled={readOnly} title={readOnly ? RO_TITLE : undefined} style={readOnly ? btnPrimaryDisabled : btnPrimary}>
              Modifier les critères
            </button>
          </div>
        )}
      </div>

      {/* Détails dépliés */}
      {open && (
        <div style={{ padding: "0 18px 18px", borderTop: "1px solid #F4F1FA" }}>
          {/* Skills + description */}
          {job.required_skills && job.required_skills.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ margin: "0 0 6px", fontSize: 10.5, fontWeight: 800, color: "var(--nw-text-muted)", letterSpacing: "0.07em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase" }}>
                Compétences requises
              </p>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {job.required_skills.map((s) => (
                  <span key={s} style={{
                    fontSize: 11.5, color: "var(--nw-text-secondary)", background: "var(--nw-bg)",
                    border: "1px solid var(--nw-border-soft)", padding: "3px 8px", borderRadius: 7,
                  }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {job.description && (
            <p style={{
              margin: "14px 0 0", fontSize: 13, color: "var(--nw-text-secondary)",
              lineHeight: 1.65, whiteSpace: "pre-wrap",
            }}>
              {job.description}
            </p>
          )}

          {/* Critères principaux */}
          {mainCriteria.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ margin: "0 0 6px", fontSize: 10.5, fontWeight: 800, color: "var(--nw-success)", letterSpacing: "0.07em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase" }}>
                Critères principaux
              </p>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {mainCriteria.map((c) => (
                  <CriterionPill key={c.id} c={c} kind="main" />
                ))}
              </div>
            </div>
          )}

          {/* Bonus */}
          {bonusCriteria.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p style={{ margin: "0 0 6px", fontSize: 10.5, fontWeight: 800, color: "var(--nw-primary)", letterSpacing: "0.07em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase" }}>
                Bonus
              </p>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {bonusCriteria.map((c) => (
                  <CriterionPill key={c.id} c={c} kind="bonus" />
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
            <Link href={`/workspace/pricing/${job.id}`} style={{
              fontSize: 12, fontWeight: 700, color: "var(--nw-primary)", textDecoration: "none",
            }}>
              Chiffrer dans le pricing →
            </Link>
          </div>
        </div>
      )}
    </section>
  )
}

function CriterionPill({ c, kind }: { c: Criterion; kind: "main" | "bonus" }) {
  const palette = kind === "main"
    ? { color: "var(--nw-success)", bg: "rgba(34,197,94,0.08)", bd: "rgba(34,197,94,0.25)" }
    : { color: "var(--nw-primary)", bg: "rgba(124,99,200,0.08)", bd: "rgba(124,99,200,0.25)" }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11.5, fontWeight: 700,
      color: palette.color, background: palette.bg,
      border: `1px solid ${palette.bd}`,
      borderRadius: 99, padding: "3px 9px", whiteSpace: "nowrap",
    }}>
      {shortCriterionName(c)}
    </span>
  )
}

const RO_TITLE = "Lecture seule — souscrivez pour reprendre la main"

const btnGhost: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 9,
  background: "white", border: "1px solid rgba(124,99,200,0.30)",
  color: "var(--nw-primary)", fontSize: 12, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
}
const btnPrimary: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 9,
  background: "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
  border: "none", color: "white",
  fontSize: 12, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
}
const btnGhostDisabled: React.CSSProperties = {
  ...btnGhost,
  background: "#F3F0FA", border: "1px solid #E5E0F0",
  color: "#B8AEDE", cursor: "not-allowed",
}
const btnPrimaryDisabled: React.CSSProperties = {
  ...btnPrimary,
  background: "var(--nw-primary-200)", cursor: "not-allowed",
}
