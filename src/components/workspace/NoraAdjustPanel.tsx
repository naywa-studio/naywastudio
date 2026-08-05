"use client"

/**
 * NoraAdjustPanel — panneau INLINE de proposition de réajustement (lot 3c v3).
 * Partagé par la Shortlist (retours client) et l'onglet Candidats (ajustement
 * général). Montre UNIQUEMENT ce que Nora change : diff avant (rouge) → après
 * (vert), critères inchangés masqués. Le sourceur garde la main (case par
 * changement). Appliquer = reconstruit la liste finale + relance le matching
 * (géré par le parent).
 */

import { useState, useMemo } from "react"
import type { Criterion } from "@/lib/job-criteria-catalog"
import { computeCriteriaDiff, applyCriteriaChanges, describeChange, type CriterionChange } from "@/lib/criteria-diff"

type Lang = "fr" | "en"

const RED = "#B42318"
const GREEN = "#15803D"
const PRIMARY = "#7C63C8"
const PRIMARY_DK = "#5b4aa8"

const copy = {
  fr: {
    titleFeedback: "Proposition de Nora",
    titleGeneral: "Ajustement proposé par Nora",
    subFeedback: "D'après les retours de votre client sur les candidats écartés.",
    subGeneral: "D'après votre consigne.",
    changesTitle: "Modifications",
    exclusionsTitle: "À proscrire",
    yourRequest: "Votre demande",
    add: "Nouveau",
    remove: "Retiré",
    reqValue: "requis",
    adjusted: "ajusté",
    pickHint: "Décochez un changement pour le laisser tel quel.",
    noChange: "Nora ne recommande aucun changement : les critères actuels restent adaptés.",
    dismissFeedback: "OK, ne plus me le proposer",
    close: "Fermer",
    apply: "Appliquer et relancer le matching",
    applying: "Application…",
    regenerate: "Regénérer",
    dismiss: "Ignorer",
    emptyPick: "Gardez au moins un changement pour appliquer.",
    whyTitle: "Pourquoi",
    refineLabel: "Affiner avec Nora",
    refinePlaceholder: "ex : ajoute aussi l'anglais, retire le diplôme…",
    refineSend: "Redemander",
  },
  en: {
    titleFeedback: "Nora's suggestion",
    titleGeneral: "Adjustment suggested by Nora",
    subFeedback: "Based on your client's feedback on the dropped candidates.",
    subGeneral: "Based on your instruction.",
    changesTitle: "Changes",
    exclusionsTitle: "To exclude",
    yourRequest: "Your request",
    add: "New",
    remove: "Removed",
    reqValue: "required",
    adjusted: "adjusted",
    pickHint: "Uncheck a change to leave it as is.",
    noChange: "Nora recommends no change: the current criteria still fit.",
    dismissFeedback: "OK, stop suggesting this",
    close: "Close",
    apply: "Apply and re-run matching",
    applying: "Applying…",
    regenerate: "Regenerate",
    dismiss: "Dismiss",
    emptyPick: "Keep at least one change to apply.",
    whyTitle: "Why",
    refineLabel: "Refine with Nora",
    refinePlaceholder: "e.g. also add English, drop the diploma…",
    refineSend: "Re-ask",
  },
}

export function NoraAdjustPanel({
  proposal, before, beforeExclusions = [], source, applying, lang, collapsible = false,
  onApply, onDismiss, onRegenerate, onDismissFeedback, onRefine,
}: {
  proposal: { summary: string; changes: string[]; criteria: Criterion[]; exclusions?: string[]; instruction?: string }
  before: Criterion[]
  /** Exclusions actuelles de la mission (pour détecter un changement). */
  beforeExclusions?: string[]
  source: "feedback" | "general"
  applying: boolean
  lang: Lang
  /** Rend l'en-tête pliable (chevron) — utile en Shortlist. */
  collapsible?: boolean
  onApply: (criteria: Criterion[]) => void
  onDismiss: () => void
  onRegenerate: () => void
  /** Feedback uniquement : avance le filigrane quand Nora ne change rien. */
  onDismissFeedback?: () => void
  /** Affiner avec une consigne libre (ajout/modif/retrait). */
  onRefine?: (instruction: string) => void
}) {
  const t = copy[lang]
  const diff = useMemo(() => computeCriteriaDiff(before, proposal.criteria), [before, proposal.criteria])
  // Changements acceptés (tous cochés par défaut). Remount via `key` parent au
  // changement de proposition → pas de setState-in-effect.
  const [accepted, setAccepted] = useState<Set<string>>(() => new Set(diff.map((d) => d.key)))
  const [open, setOpen] = useState(true)
  const [refine, setRefine] = useState("")
  const toggle = (k: string) => setAccepted((prev) => {
    const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n
  })

  const hasChanges = diff.length > 0
  // Exclusions proposées (Partie B) : liste complète révisée. Un changement de
  // la seule liste d'exclusions doit aussi rendre la proposition applicable.
  const proposedExclusions = proposal.exclusions
  const exclusionsChanged = proposedExclusions !== undefined
    && JSON.stringify([...proposedExclusions].sort()) !== JSON.stringify([...beforeExclusions].sort())
  const hasAnyChange = hasChanges || exclusionsChanged
  const finalCriteria = applyCriteriaChanges(before, diff, accepted)
  const canApply = hasAnyChange && !applying && (!hasChanges || accepted.size > 0)
  const refineTrim = refine.trim()

  return (
    <div style={{ marginBottom: 16, borderRadius: 16, background: "white", border: "1px solid #E1DAF4", overflow: "hidden", boxShadow: "0 6px 22px rgba(124,99,200,0.10)" }}>
      {/* En-tête (pliable si collapsible) */}
      {collapsible ? (
        <button type="button" onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "13px 16px", background: "rgba(124,99,200,0.05)", borderBottom: open ? "1px solid #ECE6F8" : "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
          <span style={{ fontSize: 15, color: PRIMARY }} aria-hidden="true">✦</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: "var(--nw-text)" }}>{source === "feedback" ? t.titleFeedback : t.titleGeneral}</span>
            <span style={{ display: "block", fontSize: 11.5, color: "var(--nw-text-muted)" }}>{source === "feedback" ? t.subFeedback : t.subGeneral}</span>
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--nw-text-muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
      ) : (
        <div style={{ padding: "14px 16px 12px", background: "rgba(124,99,200,0.05)", borderBottom: "1px solid #ECE6F8" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, color: PRIMARY }} aria-hidden="true">✦</span>
            <span style={{ fontSize: 14.5, fontWeight: 800, color: "var(--nw-text)" }}>{source === "feedback" ? t.titleFeedback : t.titleGeneral}</span>
          </div>
          <p style={{ margin: "4px 0 0 23px", fontSize: 11.5, color: "var(--nw-text-muted)" }}>{source === "feedback" ? t.subFeedback : t.subGeneral}</p>
        </div>
      )}

      {collapsible && !open ? null : (
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {proposal.instruction && (
          <div style={{ padding: "9px 12px", borderRadius: 10, background: "var(--nw-surface-muted, #FCFAF5)", borderLeft: "3px solid var(--nw-primary-200, #C4B6E0)" }}>
            <span style={{ display: "block", fontSize: 10, fontWeight: 700, color: "var(--nw-text-muted)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 2 }}>{t.yourRequest}</span>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--nw-text-body)", fontStyle: "italic", lineHeight: 1.5 }}>« {proposal.instruction} »</p>
          </div>
        )}
        {proposal.summary && (
          <p style={{ margin: 0, fontSize: 13, color: "var(--nw-text-body)", lineHeight: 1.6 }}>{proposal.summary}</p>
        )}

        {hasChanges && (
          <div>
            <p style={{ margin: "0 0 8px", fontSize: 10.5, fontWeight: 700, color: "var(--nw-text-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>{t.changesTitle}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {diff.map((ch) => (
                <ChangeRow key={ch.key} change={ch} on={accepted.has(ch.key)} disabled={applying} onToggle={() => toggle(ch.key)} t={t} lang={lang} />
              ))}
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 10.5, color: "var(--nw-text-muted)" }}>{t.pickHint}</p>
          </div>
        )}

        {/* Critères à proscrire proposés (Partie B) — appliqués en bloc avec la propale. */}
        {proposedExclusions && proposedExclusions.length > 0 && (
          <div>
            <p style={{ margin: "0 0 8px", fontSize: 10.5, fontWeight: 700, color: RED, letterSpacing: "0.04em", textTransform: "uppercase" }}>{t.exclusionsTitle}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {proposedExclusions.map((ex, i) => <Pill key={i} text={ex} tone="red" />)}
            </div>
          </div>
        )}

        {!hasAnyChange && (
          <div style={{ padding: "12px 14px", borderRadius: 12, background: "var(--nw-bg)", border: "1px solid var(--nw-border-soft)" }}>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--nw-text-secondary)", lineHeight: 1.5 }}>{t.noChange}</p>
          </div>
        )}

        {/* Rationnel Nora (secondaire) */}
        {hasChanges && proposal.changes.length > 0 && (
          <div>
            <p style={{ margin: "0 0 5px", fontSize: 10.5, fontWeight: 700, color: "var(--nw-text-muted)", letterSpacing: "0.03em", textTransform: "uppercase" }}>{t.whyTitle}</p>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
              {proposal.changes.map((c, i) => (
                <li key={i} style={{ fontSize: 12, color: "var(--nw-text-secondary)", lineHeight: 1.5 }}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", paddingTop: 2 }}>
          {hasChanges && accepted.size === 0 && (
            <span style={{ marginRight: "auto", fontSize: 11.5, color: "var(--nw-warn, #B45309)" }}>{t.emptyPick}</span>
          )}
          <button type="button" onClick={onRegenerate} disabled={applying} style={btnGhost(applying)}>{t.regenerate}</button>
          {!hasAnyChange ? (
            source === "feedback" && onDismissFeedback ? (
              <button type="button" onClick={onDismissFeedback} disabled={applying} style={btnPrimary(!applying)}>{t.dismissFeedback}</button>
            ) : (
              <button type="button" onClick={onDismiss} disabled={applying} style={btnPrimary(!applying)}>{t.close}</button>
            )
          ) : (
            <>
              <button type="button" onClick={onDismiss} disabled={applying} style={btnGhost(applying)}>{t.dismiss}</button>
              <button type="button" onClick={() => canApply && onApply(finalCriteria)} disabled={!canApply} style={btnPrimary(canApply)}>{applying ? t.applying : t.apply}</button>
            </>
          )}
        </div>

        {/* Affiner avec Nora : ajout / modif / retrait via consigne libre. */}
        {onRefine && (
          <div style={{ borderTop: "1px solid var(--nw-border-soft)", paddingTop: 12 }}>
            <p style={{ margin: "0 0 6px", fontSize: 10.5, fontWeight: 700, color: "var(--nw-text-muted)", letterSpacing: "0.03em", textTransform: "uppercase" }}>{t.refineLabel}</p>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <input
                type="text"
                value={refine}
                onChange={(e) => setRefine(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && refineTrim && !applying) { onRefine(refineTrim); setRefine("") } }}
                placeholder={t.refinePlaceholder}
                disabled={applying}
                style={{ flex: 1, minWidth: 0, boxSizing: "border-box", padding: "8px 11px", fontSize: 12.5, borderRadius: 9, border: "1px solid var(--nw-primary-100)", background: "#FBFAFE", outline: "none", fontFamily: "inherit" }}
              />
              <button type="button" onClick={() => { if (refineTrim) { onRefine(refineTrim); setRefine("") } }} disabled={applying || refineTrim.length === 0} style={btnPrimary(!applying && refineTrim.length > 0)}>{t.refineSend}</button>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  )
}

function ChangeRow({
  change, on, disabled, onToggle, t, lang,
}: {
  change: CriterionChange
  on: boolean
  disabled: boolean
  onToggle: () => void
  t: (typeof copy)[Lang]
  lang: Lang
}) {
  const d = describeChange(change, lang)
  const isList = d.addedItems !== undefined || d.removedItems !== undefined
  const added = d.addedItems ?? []
  const removed = d.removedItems ?? []

  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: disabled ? "default" : "pointer", opacity: on ? 1 : 0.5 }}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={onToggle} style={{ accentColor: PRIMARY, width: 14, height: 14, flexShrink: 0, marginTop: 3, cursor: disabled ? "default" : "pointer" }} />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "wrap", fontSize: 12.5 }}>
        {/* Nom du critère concerné */}
        <span style={{ fontWeight: 700, color: "var(--nw-text)" }}>{d.name}</span>

        {isList ? (
          <>
            {removed.map((it) => <Pill key={`r-${it}`} text={`− ${it}`} tone="red" strike />)}
            {added.map((it) => <Pill key={`a-${it}`} text={`+ ${it}`} tone="green" />)}
            {added.length === 0 && removed.length === 0 && (
              <Pill text={t.adjusted} tone="green" />
            )}
          </>
        ) : change.kind === "add" ? (
          <Pill text={d.afterValue ?? t.reqValue} tone="green" />
        ) : change.kind === "remove" ? (
          <Pill text={d.beforeValue ?? t.reqValue} tone="red" strike />
        ) : d.beforeValue === d.afterValue ? (
          // Modif dont la valeur affichée n'a pas bougé (ex : param interne) →
          // on ne montre pas un « X → X » trompeur.
          <Pill text={t.adjusted} tone="green" />
        ) : (
          <>
            <Pill text={d.beforeValue ?? t.reqValue} tone="red" strike />
            <Arrow />
            <Pill text={d.afterValue ?? t.reqValue} tone="green" />
          </>
        )}
      </span>
    </label>
  )
}

function Pill({ text, tone, strike }: { text: string; tone: "red" | "green"; strike?: boolean }) {
  const c = tone === "red"
    ? { color: RED, bg: "rgba(217,45,32,0.07)", bd: "rgba(217,45,32,0.22)" }
    : { color: GREEN, bg: "rgba(34,197,94,0.09)", bd: "rgba(34,197,94,0.28)" }
  return (
    <span style={{
      fontSize: 12, fontWeight: 700, color: c.color, background: c.bg,
      border: `1px solid ${c.bd}`, borderRadius: 8, padding: "2px 9px",
      textDecoration: strike ? "line-through" : "none",
    }}>{text}</span>
  )
}

function Arrow() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--nw-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

function btnGhost(disabled: boolean): React.CSSProperties {
  return { fontSize: 12.5, fontWeight: 600, padding: "8px 13px", borderRadius: 9, border: "1px solid var(--nw-border)", background: "white", color: "var(--nw-text-secondary)", cursor: disabled ? "default" : "pointer", fontFamily: "inherit" }
}
function btnPrimary(enabled: boolean): React.CSSProperties {
  return { fontSize: 12.5, fontWeight: 700, padding: "8px 16px", borderRadius: 9, border: "none", background: enabled ? PRIMARY : "var(--nw-primary-200, #C9BEEA)", color: "white", cursor: enabled ? "pointer" : "not-allowed", fontFamily: "inherit" }
}

export { PRIMARY as NORA_PRIMARY, PRIMARY_DK as NORA_PRIMARY_DK }
