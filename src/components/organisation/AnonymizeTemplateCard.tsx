"use client"

/**
 * AnonymizeTemplateCard — carte « Vos CV anonymisés » dans /organisation → Branding.
 *
 * Le cabinet règle ICI le GABARIT appliqué à tous ses CV anonymisés :
 *   - template (classique / 2 colonnes / exécutif / bento),
 *   - filigrane on/off + texte (par défaut le nom de l'organisation).
 *
 * Le contenu éditorial (résumé Nora, message) se décide mission par mission
 * dans la shortlist — pas ici.
 *
 * Deux aides visuelles :
 *   - un APERÇU HTML instantané (couleurs, logo, filigrane, email) qui reflète
 *     les réglages en direct ;
 *   - un bouton « Télécharger un exemple » qui génère le VRAI PDF (route
 *     /api/cabinet/anonymize-sample) avec un candidat fictif → rendu exact.
 *
 * Gaté sur l'accès actif (package payé ou essai) : sans accès, la carte affiche
 * une note et ne permet aucune édition.
 */

import { useMemo, useRef, useState } from "react"
import {
  type AnonymizeTemplate, readOrgDefaults, TEMPLATE_META, TEMPLATE_META_EN,
} from "@/components/workspace/anonymize/types"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

const copy = {
  fr: {
    title: "Vos CV anonymisés",
    subtitle: "Choisissez l'allure des CV que vous envoyez à vos clients. Ces réglages s'appliquent à tous vos CV anonymisés.",
    templateLabel: "Modèle",
    watermarkLabel: "Filigrane de protection",
    watermarkHint: "Imprime votre nom en diagonale sur toutes les pages — décourage la réutilisation du CV sans passer par vous.",
    watermarkTextLabel: "Texte du filigrane",
    watermarkPlaceholder: "Nom de votre organisation",
    save: "Enregistrer le gabarit",
    saving: "Enregistrement…",
    saved: "Gabarit enregistré",
    downloadSample: "Télécharger un exemple",
    generating: "Génération…",
    previewLabel: "Aperçu · exemple",
    previewNote: "Aperçu indicatif. Téléchargez l'exemple pour le rendu exact.",
    lockedTitle: "Réservé à votre package",
    lockedBody: "La personnalisation des CV anonymisés est disponible avec un abonnement actif ou pendant votre essai.",
    error: "Une erreur est survenue. Réessayez.",
    sampleRole: "Chef de projet digital",
    sampleSummary: "Profil orienté pilotage de projets digitaux, à l'aise sur le cadrage et la coordination d'équipes.",
    sampleSkills: "Compétences",
    sampleExp: "Expérience",
    confidential: "Profil confidentiel",
  },
  en: {
    title: "Your anonymized CVs",
    subtitle: "Choose how the CVs you send to your clients look. These settings apply to all your anonymized CVs.",
    templateLabel: "Template",
    watermarkLabel: "Protection watermark",
    watermarkHint: "Prints your name diagonally across every page — discourages reuse of the CV without going through you.",
    watermarkTextLabel: "Watermark text",
    watermarkPlaceholder: "Your organization name",
    save: "Save template",
    saving: "Saving…",
    saved: "Template saved",
    downloadSample: "Download a sample",
    generating: "Generating…",
    previewLabel: "Preview · sample",
    previewNote: "Indicative preview. Download the sample for the exact rendering.",
    lockedTitle: "Part of your package",
    lockedBody: "Customizing anonymized CVs is available with an active subscription or during your trial.",
    error: "Something went wrong. Please try again.",
    sampleRole: "Digital project manager",
    sampleSummary: "Profile focused on leading digital projects, comfortable with scoping and coordinating teams.",
    sampleSkills: "Skills",
    sampleExp: "Experience",
    confidential: "Confidential profile",
  },
}

const SAMPLE_SKILLS = ["Gestion de projet", "Agile / Scrum", "Analyse de données", "Cadrage produit"]
const SAMPLE_EXP = [
  { role: "Chef de projet digital", org: "Groupe agroalimentaire", years: "2021 – présent" },
  { role: "Consultant junior", org: "Cabinet de conseil", years: "2019 – 2021" },
]

interface Props {
  organization: {
    id: string
    name: string
    brand_name: string | null
    brand_color: string | null
    brand_slogan: string | null
    contact_email: string | null
    anonymize_defaults: { template?: string; watermark?: boolean; watermarkText?: string } | null
  }
  logoUrl: string | null
  hasAccess: boolean
  onSaved: () => Promise<void>
}

export function AnonymizeTemplateCard({ organization, logoUrl, hasAccess, onSaved }: Props) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const meta = lang === "fr" ? TEMPLATE_META : TEMPLATE_META_EN
  const orgName = (organization.brand_name?.trim() || organization.name?.trim()) || ""

  const initial = useMemo(() => readOrgDefaults(organization.anonymize_defaults), [organization.anonymize_defaults])
  const [template, setTemplate] = useState<AnonymizeTemplate>(initial.template)
  const [watermark, setWatermark] = useState(initial.watermark)
  const [watermarkText, setWatermarkText] = useState(initial.watermarkText)
  const [busy, setBusy] = useState<"idle" | "saving" | "sample">("idle")
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const accent = organization.brand_color && HEX.test(organization.brand_color) ? organization.brand_color : "#111827"
  const effectiveWatermark = (watermarkText.trim() || orgName || "").toUpperCase()

  const payload = () => ({ template, watermark, watermarkText: watermarkText.trim().slice(0, 40) })

  async function save() {
    if (!hasAccess) return
    setBusy("saving"); setError(null)
    try {
      const res = await fetch("/api/cabinet", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonymize_defaults: payload() }),
      })
      if (!res.ok) throw new Error("save_failed")
      await onSaved()
      setSaved(true)
      if (savedTimer.current) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setSaved(false), 2500)
    } catch {
      setError(t.error)
    } finally {
      setBusy("idle")
    }
  }

  async function downloadSample() {
    if (!hasAccess) return
    setBusy("sample"); setError(null)
    try {
      const res = await fetch("/api/cabinet/anonymize-sample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonymize_defaults: payload() }),
      })
      if (!res.ok) throw new Error("sample_failed")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "exemple-cv-anonymise.pdf"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError(t.error)
    } finally {
      setBusy("idle")
    }
  }

  if (!hasAccess) {
    return (
      <div style={cardStyle}>
        <CardHeader title={t.title} subtitle={t.subtitle} />
        <div style={{
          marginTop: 12, padding: "16px 18px", borderRadius: 12,
          background: "var(--nw-neutral-100)", border: "1px solid var(--nw-border)",
        }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--nw-text)" }}>{t.lockedTitle}</p>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--nw-text-muted)", lineHeight: 1.55 }}>{t.lockedBody}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={cardStyle}>
      <CardHeader title={t.title} subtitle={t.subtitle} />

      <div style={{
        display: "grid", gap: 22, marginTop: 16,
        gridTemplateColumns: "minmax(0, 1fr) minmax(240px, 300px)",
        alignItems: "start",
      }} className="anon-tpl-grid">
        {/* Colonne réglages */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          {/* Modèle */}
          <div>
            <label style={fieldLabel}>{t.templateLabel}</label>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
              {(Object.keys(meta) as AnonymizeTemplate[]).map((k) => {
                const on = template === k
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTemplate(k)}
                    style={{
                      textAlign: "left", fontFamily: "inherit", cursor: "pointer",
                      padding: "10px 12px", borderRadius: 10,
                      border: `1.5px solid ${on ? "var(--nw-primary)" : "var(--nw-border)"}`,
                      background: on ? "var(--nw-primary-50)" : "white",
                    }}
                  >
                    <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: on ? "var(--nw-primary)" : "var(--nw-text)" }}>
                      {meta[k].label}
                    </span>
                    <span style={{ display: "block", fontSize: 10.5, color: "var(--nw-text-muted)", marginTop: 2, lineHeight: 1.4 }}>
                      {meta[k].hint}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Filigrane */}
          <div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={watermark}
                onChange={(e) => setWatermark(e.target.checked)}
                style={{ marginTop: 2, width: 16, height: 16, accentColor: "var(--nw-primary)" }}
              />
              <span>
                <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--nw-text)" }}>{t.watermarkLabel}</span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--nw-text-muted)", marginTop: 2, lineHeight: 1.5 }}>{t.watermarkHint}</span>
              </span>
            </label>
            {watermark && (
              <div style={{ marginTop: 10, paddingLeft: 26 }}>
                <label style={fieldLabel}>{t.watermarkTextLabel}</label>
                <input
                  type="text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value.slice(0, 40))}
                  placeholder={orgName || t.watermarkPlaceholder}
                  style={{
                    marginTop: 6, width: "100%", boxSizing: "border-box",
                    padding: "8px 11px", fontSize: 13, fontFamily: "inherit", color: "var(--nw-text)",
                    background: "white", border: "1px solid var(--nw-border)", borderRadius: 8, outline: "none",
                  }}
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={save}
              disabled={busy !== "idle"}
              style={{
                fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: "white",
                background: "var(--nw-primary)", border: "none", borderRadius: 9,
                padding: "9px 16px", cursor: busy === "idle" ? "pointer" : "wait",
                opacity: busy === "saving" ? 0.7 : 1,
              }}
            >
              {busy === "saving" ? t.saving : t.save}
            </button>
            <button
              type="button"
              onClick={downloadSample}
              disabled={busy !== "idle"}
              style={{
                fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "var(--nw-primary)",
                background: "white", border: "1px solid var(--nw-primary)", borderRadius: 9,
                padding: "9px 16px", cursor: busy === "idle" ? "pointer" : "wait",
                opacity: busy === "sample" ? 0.7 : 1,
              }}
            >
              {busy === "sample" ? t.generating : t.downloadSample}
            </button>
            {saved && <span style={{ fontSize: 12, fontWeight: 600, color: "var(--nw-success)" }}>{t.saved}</span>}
            {error && <span style={{ fontSize: 12, color: "var(--nw-danger-strong, #B91C1C)" }}>{error}</span>}
          </div>
        </div>

        {/* Colonne aperçu */}
        <div>
          <label style={fieldLabel}>{t.previewLabel}</label>
          <MiniPreview
            accent={accent}
            logoUrl={logoUrl}
            orgName={orgName}
            slogan={organization.brand_slogan}
            contactEmail={organization.contact_email}
            watermark={watermark}
            watermarkText={effectiveWatermark}
            template={template}
            t={t}
          />
          <p style={{ margin: "8px 0 0", fontSize: 10.5, color: "var(--nw-text-muted)", lineHeight: 1.5 }}>{t.previewNote}</p>
        </div>
      </div>

      <style>{`@media (max-width: 720px) { .anon-tpl-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}

/* ── Aperçu HTML représentatif (pas le PDF exact) ──────────────────────── */

function MiniPreview({
  accent, logoUrl, orgName, slogan, contactEmail, watermark, watermarkText, template, t,
}: {
  accent: string
  logoUrl: string | null
  orgName: string
  slogan: string | null
  contactEmail: string | null
  watermark: boolean
  watermarkText: string
  template: AnonymizeTemplate
  t: (typeof copy)["fr"]
}) {
  const renderH = (label: string) => (
    <p style={{ margin: "0 0 4px", fontSize: 7.5, fontWeight: 800, color: accent, textTransform: "uppercase", letterSpacing: 0.5 }}>
      {label}
    </p>
  )
  const skillChips = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
      {SAMPLE_SKILLS.map((s) => (
        <span key={s} style={{ fontSize: 6.5, padding: "1px 5px", borderRadius: 20, background: "#F3F4F6", color: "#374151" }}>{s}</span>
      ))}
    </div>
  )
  const expList = SAMPLE_EXP.map((e) => (
    <div key={e.role} style={{ marginBottom: 5 }}>
      <p style={{ margin: 0, fontSize: 8, fontWeight: 700, color: "#1F2937" }}>{e.role}</p>
      <p style={{ margin: 0, fontSize: 7, color: "#6B7280" }}>{e.org} · {e.years}</p>
    </div>
  ))

  // Corps distinct par template (aperçu représentatif, pas le PDF exact).
  let body: React.ReactNode
  if (template === "two-column") {
    body = (
      <>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: "#111827" }}>{t.sampleRole}</p>
        <p style={{ margin: "6px 0 0", fontSize: 8, color: "#4B5563", lineHeight: 1.5 }}>{t.sampleSummary}</p>
        <div style={{ display: "grid", gridTemplateColumns: "34% 1fr", gap: 12, marginTop: 10 }}>
          <div style={{ background: "#FAFAFC", borderRadius: 6, padding: "8px 8px" }}>
            {renderH(t.sampleSkills)}{skillChips}
          </div>
          <div>{renderH(t.sampleExp)}{expList}</div>
        </div>
      </>
    )
  } else if (template === "executive") {
    // Aéré, gros titre centré, filet fin, compétences en texte (pas de chips).
    body = (
      <div style={{ textAlign: "center" }}>
        <p style={{ margin: "6px 0 0", fontSize: 15, fontWeight: 800, color: "#111827", letterSpacing: -0.3 }}>{t.sampleRole}</p>
        <div style={{ width: 40, height: 2, background: accent, margin: "8px auto" }} />
        <p style={{ margin: "0 0 14px", fontSize: 8.5, color: "#4B5563", lineHeight: 1.6 }}>{t.sampleSummary}</p>
        <p style={{ margin: "0 0 4px", fontSize: 7.5, fontWeight: 800, color: accent, textTransform: "uppercase", letterSpacing: 1 }}>{t.sampleSkills}</p>
        <p style={{ margin: "0 0 14px", fontSize: 7.5, color: "#374151" }}>{SAMPLE_SKILLS.join("  ·  ")}</p>
        <p style={{ margin: "0 0 4px", fontSize: 7.5, fontWeight: 800, color: accent, textTransform: "uppercase", letterSpacing: 1 }}>{t.sampleExp}</p>
        <div style={{ textAlign: "left", maxWidth: 180, margin: "0 auto" }}>{expList}</div>
      </div>
    )
  } else if (template === "bento") {
    // Grille de cards distinctes.
    const cardBox: React.CSSProperties = { border: "1px solid #ECECF1", borderRadius: 8, padding: "8px 9px", background: "white" }
    body = (
      <>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: "#111827" }}>{t.sampleRole}</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
          <div style={{ ...cardBox, gridColumn: "1 / -1" }}>
            <p style={{ margin: 0, fontSize: 8, color: "#4B5563", lineHeight: 1.5 }}>{t.sampleSummary}</p>
          </div>
          <div style={cardBox}>{renderH(t.sampleSkills)}{skillChips}</div>
          <div style={cardBox}>{renderH(t.sampleExp)}{expList}</div>
        </div>
      </>
    )
  } else {
    // classic — mono-colonne linéaire.
    body = (
      <>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "#111827" }}>{t.sampleRole}</p>
        <p style={{ margin: "2px 0 0", fontSize: 7, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.5 }}>{t.confidential}</p>
        <p style={{ margin: "8px 0 0", fontSize: 8, color: "#4B5563", lineHeight: 1.5 }}>{t.sampleSummary}</p>
        <div style={{ marginTop: 10 }}>{renderH(t.sampleSkills)}{skillChips}</div>
        <div style={{ marginTop: 10 }}>{renderH(t.sampleExp)}{expList}</div>
      </>
    )
  }

  return (
    <div style={{
      position: "relative", overflow: "hidden",
      marginTop: 8, background: "white",
      border: "1px solid var(--nw-border)", borderRadius: 10,
      boxShadow: "0 6px 20px rgba(17,24,39,0.08)",
      aspectRatio: "1 / 1.414", minHeight: 300,
      display: "flex", flexDirection: "column",
      fontSize: 8.5, color: "#1F2937",
    }}>
      {/* Filigrane */}
      {watermark && watermarkText && (
        <div aria-hidden style={{
          position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{
            transform: "rotate(-32deg)", whiteSpace: "nowrap",
            fontSize: 20, fontWeight: 800, letterSpacing: 2,
            color: accent, opacity: 0.07, textTransform: "uppercase",
          }}>
            {watermarkText}&nbsp;&nbsp;{watermarkText}
          </span>
        </div>
      )}

      {/* En-tête */}
      <div style={{
        borderTop: `4px solid ${accent}`, padding: "10px 12px 8px",
        display: "flex", alignItems: "center", gap: 8,
        borderBottom: "1px solid #F1F1F4",
      }}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" style={{ height: 18, maxWidth: 70, objectFit: "contain" }} />
        ) : orgName ? (
          <span style={{ fontSize: 10, fontWeight: 800, color: accent }}>{orgName}</span>
        ) : null}
        <span style={{
          marginLeft: "auto", fontSize: 6.5, fontWeight: 700, letterSpacing: 0.5,
          color: "#9CA3AF", textTransform: "uppercase",
        }}>
          C-000000
        </span>
      </div>

      {/* Corps (varie selon le template) */}
      <div style={{ flex: 1, padding: "10px 12px", minHeight: 0, position: "relative", zIndex: 1 }}>
        {body}
      </div>

      {/* Pied */}
      <div style={{
        borderTop: "1px solid #F1F1F4", padding: "6px 12px",
        display: "flex", alignItems: "center", gap: 6,
        fontSize: 6.5, color: "#6B7280",
      }}>
        {orgName && <span style={{ fontWeight: 700, color: accent }}>{orgName}</span>}
        {contactEmail && <span>· {contactEmail}</span>}
        {slogan && <span style={{ marginLeft: "auto", fontStyle: "italic" }}>{slogan}</span>}
      </div>
    </div>
  )
}

/* ── Bricoles ─────────────────────────────────────────────────────────── */

const cardStyle: React.CSSProperties = {
  background: "white", border: "1px solid var(--nw-border)", borderRadius: 16, padding: "20px 22px",
}

const fieldLabel: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
  color: "var(--nw-text-muted)", fontFamily: "var(--nw-font-mono)",
}

function CardHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--nw-text)", letterSpacing: "-0.01em" }}>{title}</h3>
      <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--nw-text-muted)", lineHeight: 1.55 }}>{subtitle}</p>
    </div>
  )
}
