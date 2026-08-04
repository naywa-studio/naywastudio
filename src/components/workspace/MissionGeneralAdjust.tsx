"use client"

/**
 * MissionGeneralAdjust — section « Ajuster la mission avec Nora » (lot 3c v3).
 * Repliée par défaut dans l'onglet Candidats. Le sourceur donne une consigne
 * libre (« monte l'exigence sur l'anglais, on cible plutôt du senior ») → Nora
 * propose un diff de critères (même panneau que les retours client) → apply
 * relance le matching. Indépendant des retours client (pas de filigrane).
 */

import { useState } from "react"
import type { Criterion } from "@/lib/job-criteria-catalog"
import { NoraAdjustPanel } from "@/components/workspace/NoraAdjustPanel"

type Lang = "fr" | "en"

const copy = {
  fr: {
    title: "Ajuster la mission avec Nora",
    hint: "Décrivez ce que vous voulez changer, Nora vous proposera l'ajustement des critères.",
    placeholder: "ex : on cible plutôt du senior, et l'anglais courant devient indispensable…",
    ask: "Demander à Nora",
    asking: "Nora réfléchit…",
    err: "Nora n'a pas pu générer de proposition. Réessayez.",
    empty: "Précisez une consigne pour que Nora puisse proposer un ajustement.",
  },
  en: {
    title: "Adjust the mission with Nora",
    hint: "Describe what you want to change and Nora will suggest the criteria adjustment.",
    placeholder: "e.g. we're targeting senior profiles now, and fluent English becomes a must…",
    ask: "Ask Nora",
    asking: "Nora is thinking…",
    err: "Nora couldn't generate a suggestion. Try again.",
    empty: "Give an instruction so Nora can suggest an adjustment.",
  },
}

export function MissionGeneralAdjust({
  jobCriteria, proposal, loading, error, applying, readOnly, lang,
  onGenerate, onApply, onDismiss,
}: {
  jobCriteria: Criterion[]
  /** Proposition générale en cours (null sinon). */
  proposal: { summary: string; changes: string[]; criteria: Criterion[] } | null
  loading: boolean
  error: string | null
  applying: boolean
  readOnly: boolean
  lang: Lang
  onGenerate: (instruction: string) => void
  onApply: (criteria: Criterion[], summary: string, changes: string[]) => void
  onDismiss: () => void
}) {
  const t = copy[lang]
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const trimmed = text.trim()

  if (readOnly) return null

  return (
    <section style={{ marginBottom: 16, background: "white", border: "1px solid var(--nw-border-soft)", borderRadius: 14, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
      >
        <span style={{ fontSize: 14, color: "#7C63C8", flexShrink: 0 }} aria-hidden="true">✦</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: "var(--nw-text)" }}>{t.title}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--nw-text-muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Proposition en cours → panneau diff. Sinon composer. */}
          {proposal ? (
            <NoraAdjustPanel
              key={proposal.criteria.map((c) => c.id).join("|")}
              proposal={proposal}
              before={jobCriteria}
              source="general"
              applying={applying}
              lang={lang}
              onApply={(criteria) => onApply(criteria, proposal.summary, proposal.changes)}
              onDismiss={onDismiss}
              onRegenerate={() => onGenerate(trimmed || text)}
            />
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--nw-text-muted)", lineHeight: 1.5 }}>{t.hint}</p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t.placeholder}
                rows={3}
                disabled={loading}
                style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", fontSize: 12.5, borderRadius: 10, border: "1px solid var(--nw-primary-100)", background: "#FBFAFE", outline: "none", fontFamily: "inherit", resize: "vertical", lineHeight: 1.5 }}
              />
              {error && (
                <p style={{ margin: 0, fontSize: 12, color: "var(--nw-danger-strong, #B42318)" }}>{error === "empty" ? t.empty : t.err}</p>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => trimmed && onGenerate(trimmed)}
                  disabled={loading || trimmed.length === 0}
                  style={{
                    fontSize: 12.5, fontWeight: 700, padding: "8px 15px", borderRadius: 9, border: "none",
                    background: (loading || trimmed.length === 0) ? "var(--nw-primary-200, #C9BEEA)" : "#7C63C8",
                    color: "white", cursor: (loading || trimmed.length === 0) ? "not-allowed" : "pointer", fontFamily: "inherit",
                  }}
                >{loading ? t.asking : t.ask}</button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}
