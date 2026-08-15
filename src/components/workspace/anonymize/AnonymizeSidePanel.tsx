"use client"

/**
 * Réglages généraux du document, posés à CÔTÉ de l'aperçu vivant.
 *
 * Ce panneau ne touche jamais au contenu — pas un poste, pas une rubrique. Il
 * ne règle que ce qui vaut pour la page entière : le gabarit, le filigrane, le
 * résumé, le message d'accompagnement. Le contenu, lui, se manipule dans
 * l'aperçu, sur le bloc concerné.
 *
 * Cette séparation est le sens de la mise en page : à gauche ce que le client
 * lira, à droite la façon dont c'est habillé. Le panneau « Personnaliser » du
 * haut de fiche est masqué quand celui-ci est monté — deux endroits pour régler
 * la même chose, c'est un endroit de trop.
 */

import {
  CUSTOM_TEXT_MAX, TEMPLATE_META, TEMPLATE_META_EN,
  type AnonymizeOptions, type AnonymizeTemplate,
} from "./types"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const copy = {
  fr: {
    title: "Réglages du document",
    hint: "S'appliquent à toute la page. Le contenu se règle dans l'aperçu, bloc par bloc.",
    template: "Gabarit",
    templateScope: "Vaut pour cette génération. Le gabarit du cabinet se règle depuis la shortlist.",
    missionScope: "Enregistré sur la mission — vaut pour tous ses candidats.",
    noraSummary: "Résumé Nora",
    noraSummaryHint: "Deux ou trois phrases factuelles orientées mission, rédigées à la génération.",
    watermark: "Filigrane",
    watermarkHint: "Le nom de votre organisation en fond de chaque page.",
    watermarkPlaceholder: "Nom affiché en filigrane",
    customMessage: "Message d'accompagnement",
    optional: "optionnel",
    customPlaceholder: "Votre angle sur ce profil : positionnement, contexte, points d'attention. S'affiche sous le résumé, ou seul si le résumé Nora est décoché.",
    charsLeft: (n: number) => `${n} caractères restants`,
    readOnly: "Lecture seule.",
  },
  en: {
    title: "Document settings",
    hint: "They apply to the whole page. Content is adjusted in the preview, block by block.",
    template: "Template",
    templateScope: "Applies to this generation. The organization's template is set from the shortlist.",
    missionScope: "Saved on the job opening — applies to all its candidates.",
    noraSummary: "Nora summary",
    noraSummaryHint: "Two or three factual, job-oriented sentences, written at generation time.",
    watermark: "Watermark",
    watermarkHint: "Your organization's name behind every page.",
    watermarkPlaceholder: "Name shown in the watermark",
    customMessage: "Accompanying message",
    optional: "optional",
    customPlaceholder: "Your angle on this profile: positioning, context, things to watch. Shows under the summary, or alone if the Nora summary is off.",
    charsLeft: (n: number) => `${n} characters left`,
    readOnly: "Read only.",
  },
}

export interface AnonymizeSidePanelProps {
  options: AnonymizeOptions
  onChange: (next: AnonymizeOptions) => void
  readOnly?: boolean
  /** Actions rendues en bas du panneau (générer, télécharger). */
  footer?: React.ReactNode
}

export function AnonymizeSidePanel({ options, onChange, readOnly = false, footer }: AnonymizeSidePanelProps) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const templateMeta = lang === "fr" ? TEMPLATE_META : TEMPLATE_META_EN

  // Patch explicite plutôt qu'une clé générique : `{ ...options, [k]: v }`
  // fait perdre à TypeScript le type exact de la clé calculée.
  const set = (patch: Partial<AnonymizeOptions>) => {
    if (readOnly) return
    onChange({ ...options, ...patch })
  }

  return (
    <aside style={{
      background: "white", borderRadius: 16,
      border: "1px solid var(--nw-border-soft)", overflow: "hidden",
      alignSelf: "flex-start",
    }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--nw-border-soft)" }}>
        <h3 style={{
          margin: 0, fontSize: 12, fontWeight: 700, color: "var(--nw-text-muted)",
          letterSpacing: "0.08em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
        }}>
          {t.title}
        </h3>
        <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--nw-text-muted)", lineHeight: 1.5 }}>
          {readOnly ? t.readOnly : t.hint}
        </p>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Gabarit — liste compacte, pas des grandes cartes : la colonne est
            étroite et le choix se relit d'un coup d'œil. */}
        <div>
          <FieldLabel>{t.template}</FieldLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {(Object.keys(TEMPLATE_META) as AnonymizeTemplate[]).map((tpl) => {
              const active = (options.template ?? "classic") === tpl
              return (
                <button
                  key={tpl}
                  type="button"
                  onClick={() => set({ template: tpl })}
                  disabled={readOnly}
                  style={{
                    textAlign: "left", fontFamily: "inherit",
                    padding: "8px 10px", borderRadius: 9,
                    border: `1.5px solid ${active ? "var(--nw-primary)" : "var(--nw-border)"}`,
                    background: active ? "rgba(124,99,200,0.05)" : "white",
                    cursor: readOnly ? "not-allowed" : "pointer",
                  }}
                >
                  <span style={{
                    display: "block", fontSize: 12.5, fontWeight: 700,
                    color: active ? "var(--nw-primary)" : "var(--nw-text)",
                  }}>
                    {templateMeta[tpl].label}
                  </span>
                  <span style={{ display: "block", fontSize: 11, color: "var(--nw-text-muted)", lineHeight: 1.4 }}>
                    {templateMeta[tpl].hint}
                  </span>
                </button>
              )
            })}
          </div>
          {/* La portée de chaque réglage est dite ici : le gabarit ne suit pas
              le candidat, le message éditorial suit la mission. Sans ça, le
              sourceur ne peut pas deviner ce qui persiste. */}
          <Scope>{t.templateScope}</Scope>
        </div>

        <div>
          <Toggle
            label={t.noraSummary}
            hint={t.noraSummaryHint}
            checked={options.keepNoraSummary ?? false}
            disabled={readOnly}
            onChange={(v) => set({ keepNoraSummary: v })}
          />
          <Scope>{t.missionScope}</Scope>
        </div>

        <div>
          <Toggle
            label={t.watermark}
            hint={t.watermarkHint}
            checked={options.watermark ?? false}
            disabled={readOnly}
            onChange={(v) => set({ watermark: v })}
          />
          {options.watermark && (
            <input
              type="text"
              value={options.watermarkText ?? ""}
              maxLength={40}
              disabled={readOnly}
              placeholder={t.watermarkPlaceholder}
              onChange={(e) => set({ watermarkText: e.target.value })}
              style={{
                marginTop: 8, width: "100%", boxSizing: "border-box",
                fontFamily: "inherit", fontSize: 12.5, color: "var(--nw-text)",
                padding: "7px 10px", background: "white",
                border: "1px solid var(--nw-border)", borderRadius: 8, outline: "none",
              }}
            />
          )}
        </div>

        <div>
          <FieldLabel>
            {t.customMessage}{" "}
            <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>({t.optional})</span>
          </FieldLabel>
          <textarea
            value={options.customText ?? ""}
            rows={5}
            maxLength={CUSTOM_TEXT_MAX}
            disabled={readOnly}
            placeholder={t.customPlaceholder}
            onChange={(e) => set({ customText: e.target.value })}
            style={{
              width: "100%", boxSizing: "border-box",
              fontFamily: "inherit", fontSize: 12.5, color: "var(--nw-text)",
              padding: "8px 10px", background: "white",
              border: "1px solid var(--nw-border)", borderRadius: 8,
              outline: "none", resize: "vertical", lineHeight: 1.55,
            }}
          />
          <span style={{ display: "block", marginTop: 4, fontSize: 10.5, color: "var(--nw-text-muted)" }}>
            {t.charsLeft(CUSTOM_TEXT_MAX - (options.customText ?? "").length)}
          </span>
          <Scope>{t.missionScope}</Scope>
        </div>
      </div>

      {footer && (
        <div style={{
          padding: 16, borderTop: "1px solid var(--nw-border-soft)",
          background: "var(--nw-surface-muted)",
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          {footer}
        </div>
      )}
    </aside>
  )
}

/** Mention de portée sous un réglage : ce qui persiste, et où. */
function Scope({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: "block", marginTop: 6, fontSize: 10.5, lineHeight: 1.45,
      color: "var(--nw-text-muted)", fontStyle: "italic",
    }}>
      {children}
    </span>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: "block", marginBottom: 7,
      fontSize: 10.5, fontWeight: 700, color: "var(--nw-text-muted)",
      letterSpacing: "0.05em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
    }}>
      {children}
    </span>
  )
}

function Toggle({ label, hint, checked, onChange, disabled }: {
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label style={{
      display: "flex", gap: 9, alignItems: "flex-start",
      cursor: disabled ? "not-allowed" : "pointer",
    }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2, flexShrink: 0 }}
      />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "var(--nw-text)" }}>
          {label}
        </span>
        <span style={{ display: "block", fontSize: 11, color: "var(--nw-text-muted)", lineHeight: 1.45 }}>
          {hint}
        </span>
      </span>
    </label>
  )
}
