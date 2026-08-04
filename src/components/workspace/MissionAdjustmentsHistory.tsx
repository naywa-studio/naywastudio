"use client"

/**
 * MissionAdjustmentsHistory — carte "Ajustements de Nora" affichée sous le
 * brief dans l'onglet Candidats (lot 3c). Historise les réajustements de
 * critères appliqués d'après les retours client : à chaque application depuis
 * la Shortlist, une entrée { at, summary, changes[] } est ajoutée à
 * jobs.criteria_adjustments et rendue ici, du plus récent au plus ancien.
 *
 * But produit : garder une trace VISIBLE de comment la mission a évolué (le
 * brief original ne bouge jamais, cf. MissionBriefSection) sans que le
 * sourceur ait à deviner ce qui a changé après un re-matching.
 */

import { useState } from "react"
import type { CriteriaAdjustment } from "@/lib/job-criteria-catalog"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const copy = {
  fr: {
    title: "Ajustements de Nora",
    subtitle: (n: number) => `${n} réajustement${n > 1 ? "s" : ""} d'après les retours client`,
    collapse: "Replier",
    expand: "Voir",
  },
  en: {
    title: "Nora's adjustments",
    subtitle: (n: number) => `${n} adjustment${n > 1 ? "s" : ""} from client feedback`,
    collapse: "Collapse",
    expand: "View",
  },
}

export function MissionAdjustmentsHistory({ adjustments, lang }: { adjustments: CriteriaAdjustment[]; lang?: "fr" | "en" }) {
  const ctx = useLanguage()
  const l = lang ?? ctx.lang
  const t = copy[l]
  const [open, setOpen] = useState(true)

  if (!adjustments || adjustments.length === 0) return null
  // Plus récent en premier.
  const ordered = [...adjustments].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return (
    <section style={{
      marginBottom: 16, background: "rgba(124,99,200,0.035)",
      border: "1px solid #E6E0F4", borderRadius: 14, overflow: "hidden",
    }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: "12px 16px", background: "transparent", border: "none",
          cursor: "pointer", fontFamily: "inherit", textAlign: "left",
        }}
      >
        <span style={{ fontSize: 14, color: "#7C63C8", flexShrink: 0 }} aria-hidden="true">✦</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: "var(--nw-text)" }}>{t.title}</span>
          <span style={{ display: "block", fontSize: 11, color: "var(--nw-text-muted)" }}>{t.subtitle(ordered.length)}</span>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--nw-text-muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {ordered.map((adj, i) => (
            <div key={`${adj.at}-${i}`} style={{
              position: "relative", paddingLeft: 16,
              borderLeft: "2px solid #D9CFF0",
            }}>
              <span style={{
                position: "absolute", left: -5, top: 3, width: 8, height: 8,
                borderRadius: "50%", background: "#7C63C8",
              }} />
              <p style={{ margin: "0 0 3px", fontSize: 10.5, fontWeight: 700, color: "var(--nw-text-muted)", letterSpacing: "0.02em", fontVariantNumeric: "tabular-nums" }}>
                {new Date(adj.at).toLocaleDateString(l === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "short", year: "numeric" })}
                {" · "}
                {new Date(adj.at).toLocaleTimeString(l === "fr" ? "fr-FR" : "en-US", { hour: "2-digit", minute: "2-digit" })}
              </p>
              {adj.summary && (
                <p style={{ margin: "0 0 5px", fontSize: 12.5, color: "var(--nw-text-body)", lineHeight: 1.55 }}>{adj.summary}</p>
              )}
              {adj.changes.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 3 }}>
                  {adj.changes.map((c, j) => (
                    <li key={j} style={{ fontSize: 12, color: "var(--nw-text-secondary)", lineHeight: 1.5 }}>{c}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
