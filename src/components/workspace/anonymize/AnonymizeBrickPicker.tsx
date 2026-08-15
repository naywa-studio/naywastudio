"use client"

/**
 * Choix des briques qui partent dans le CV anonymisé de CETTE mission.
 *
 * Ce panneau ne corrige RIEN. Il ne touche ni le vivier, ni le matching, ni
 * les autres missions : il décide seulement de ce que ce client-ci verra. La
 * correction d'une donnée fausse se fait sur la fiche candidat, une fois, et
 * se répercute partout.
 *
 * Tout est inclus par défaut. Un `−` masque la brique, un `+` la remet. Rien
 * n'est jamais supprimé : la ligne masquée reste affichée, barrée, à portée de
 * clic — le sourceur voit ce qu'il cache, ce qu'un simple retrait de la liste
 * ne permettrait pas.
 */

import { useMemo } from "react"
import type { ParsedCv } from "@/lib/database.types"
import {
  experienceKey, educationKey, sectionKey,
  type AnonymizeSelection,
} from "@/lib/anonymize-selection"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const copy = {
  fr: {
    title: "Ce qui part dans le CV anonymisé",
    hint: "Choix propre à cette mission. Corriger une information se fait sur la fiche candidat, où la correction vaut pour tout le monde.",
    experiences: "Parcours",
    education: "Formation",
    sections: "Autres rubriques",
    hidden: "masquée",
    hiddenCount: (n: number) => `${n} brique${n > 1 ? "s" : ""} masquée${n > 1 ? "s" : ""}`,
    showAll: "Tout réafficher",
    hideOne: "Masquer",
    restoreOne: "Réafficher",
    saving: "Enregistrement…",
    saved: "Enregistré",
    empty: "Rien à choisir : ce CV n'a ni parcours, ni formation, ni rubrique libre.",
    ongoing: "en cours",
    regenerateHint: "Regénérez le document pour appliquer ces changements.",
  },
  en: {
    title: "What goes into the anonymized CV",
    hint: "Specific to this job opening. To fix information, edit the candidate sheet — that correction applies everywhere.",
    experiences: "Experience",
    education: "Education",
    sections: "Other sections",
    hidden: "hidden",
    hiddenCount: (n: number) => `${n} block${n > 1 ? "s" : ""} hidden`,
    showAll: "Show all again",
    hideOne: "Hide",
    restoreOne: "Show again",
    saving: "Saving…",
    saved: "Saved",
    empty: "Nothing to choose from: this CV has no experience, education or free-form section.",
    ongoing: "ongoing",
    regenerateHint: "Regenerate the document to apply these changes.",
  },
}

type Bucket = keyof AnonymizeSelection

interface Brick {
  key: string
  label: string
  detail: string | null
}

export interface AnonymizeBrickPickerProps {
  cv: ParsedCv | null
  selection: AnonymizeSelection
  onChange: (next: AnonymizeSelection) => void
  disabled?: boolean
  saving?: boolean
}

export function AnonymizeBrickPicker({
  cv, selection, onChange, disabled = false, saving = false,
}: AnonymizeBrickPickerProps) {
  const { lang } = useLanguage()
  const t = copy[lang]

  const groups = useMemo(() => {
    const dates = (start?: string | null, end?: string | null, ongoing?: boolean) => {
      const parts = [start ?? "", ongoing ? t.ongoing : (end ?? "")].filter(Boolean)
      return parts.length ? parts.join(" – ") : null
    }
    return [
      {
        bucket: "experiences" as Bucket,
        title: t.experiences,
        bricks: (cv?.experience ?? []).map<Brick>((e) => ({
          key: experienceKey(e),
          label: [e.title, e.company].filter(Boolean).join(" — ") || "—",
          detail: dates(e.start, e.end, e.end === null),
        })),
      },
      {
        bucket: "education" as Bucket,
        title: t.education,
        bricks: (cv?.education ?? []).map<Brick>((ed) => ({
          key: educationKey(ed),
          label: [ed.degree, ed.school].filter(Boolean).join(" — ") || "—",
          detail: dates(ed.start, ed.end),
        })),
      },
      {
        bucket: "sections" as Bucket,
        title: t.sections,
        bricks: (cv?.other_sections ?? []).map<Brick>((s) => ({
          key: sectionKey(s),
          label: s.title,
          detail: s.content.slice(0, 70) + (s.content.length > 70 ? "…" : ""),
        })),
      },
    ].filter((g) => g.bricks.length > 0)
  }, [cv, t])

  // Ne compte que les clés encore présentes au CV : une brique disparue depuis
  // laisserait sinon un compteur qui annonce plus de masquées qu'il n'y en a.
  const present = useMemo(() => {
    const set = new Set<string>()
    for (const g of groups) for (const b of g.bricks) set.add(`${g.bucket}:${b.key}`)
    return set
  }, [groups])

  const hiddenCount = (["experiences", "education", "sections"] as Bucket[])
    .reduce((n, b) => n + selection[b].filter((k) => present.has(`${b}:${k}`)).length, 0)

  const toggle = (bucket: Bucket, key: string) => {
    if (disabled) return
    const current = selection[bucket]
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key]
    onChange({ ...selection, [bucket]: next })
  }

  const showAll = () => {
    if (disabled) return
    onChange({ experiences: [], education: [], sections: [] })
  }

  return (
    <div style={{
      border: "1px solid var(--nw-border-soft)", borderRadius: 12,
      background: "var(--nw-surface-muted)", padding: 16,
    }}>
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap", marginBottom: 6,
      }}>
        <h4 style={{
          margin: 0, fontSize: 11, fontWeight: 700, color: "var(--nw-text-muted)",
          letterSpacing: "0.08em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
        }}>
          {t.title}
        </h4>
        <span style={{ fontSize: 11, color: "var(--nw-text-muted)", fontWeight: 600 }}>
          {saving ? t.saving : hiddenCount > 0 ? t.hiddenCount(hiddenCount) : null}
        </span>
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--nw-text-muted)", lineHeight: 1.55 }}>
        {t.hint}
      </p>

      {groups.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--nw-text-muted)" }}>{t.empty}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {groups.map((g) => (
            <div key={g.bucket}>
              <p style={{
                margin: "0 0 7px", fontSize: 10.5, fontWeight: 700, color: "var(--nw-primary)",
                letterSpacing: "0.06em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
              }}>
                {g.title}
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
                {g.bricks.map((b, i) => {
                  const hidden = selection[g.bucket].includes(b.key)
                  return (
                    <li
                      key={`${b.key}#${i}`}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "7px 10px", borderRadius: 8,
                        background: hidden ? "transparent" : "white",
                        border: `1px solid ${hidden ? "var(--nw-border)" : "var(--nw-border-soft)"}`,
                        opacity: hidden ? 0.55 : 1,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(g.bucket, b.key)}
                        disabled={disabled}
                        title={hidden ? t.restoreOne : t.hideOne}
                        aria-label={`${hidden ? t.restoreOne : t.hideOne} — ${b.label}`}
                        style={{
                          flexShrink: 0,
                          width: 22, height: 22, borderRadius: 6,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          border: `1px solid ${hidden ? "rgba(124,99,200,0.35)" : "var(--nw-border)"}`,
                          background: hidden ? "rgba(124,99,200,0.08)" : "transparent",
                          color: hidden ? "var(--nw-primary)" : "var(--nw-text-muted)",
                          cursor: disabled ? "not-allowed" : "pointer",
                          fontFamily: "inherit", fontSize: 14, fontWeight: 700, lineHeight: 1,
                          padding: 0,
                        }}
                      >
                        {hidden ? "+" : "−"}
                      </button>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{
                          display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--nw-text)",
                          textDecoration: hidden ? "line-through" : "none",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {b.label}
                        </span>
                        {b.detail && (
                          <span style={{
                            display: "block", fontSize: 11, color: "var(--nw-text-muted)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {b.detail}
                          </span>
                        )}
                      </span>
                      {hidden && (
                        <span style={{
                          flexShrink: 0, fontSize: 10, fontWeight: 700, color: "var(--nw-text-muted)",
                          letterSpacing: "0.04em", textTransform: "uppercase",
                          fontFamily: "var(--nw-font-mono)",
                        }}>
                          {t.hidden}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {hiddenCount > 0 && (
        <div style={{
          marginTop: 14, display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 10, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 11.5, color: "var(--nw-text-muted)", fontStyle: "italic" }}>
            {t.regenerateHint}
          </span>
          <button
            type="button"
            onClick={showAll}
            disabled={disabled}
            style={{
              fontFamily: "inherit", fontSize: 11.5, fontWeight: 600,
              color: "var(--nw-primary)", background: "transparent",
              border: "1px solid rgba(124,99,200,0.3)", borderRadius: 8,
              padding: "5px 11px", cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            {t.showAll}
          </button>
        </div>
      )}
    </div>
  )
}
