"use client"

/**
 * Contrôles d'anonymisation — affichés en haut de la fiche match,
 * juste sous le bandeau d'identité candidat.
 *
 * Responsabilités :
 *  - description courte mission ciblée
 *  - section dépliable "Personnaliser" : toggle résumé Nora,
 *    textarea custom, toggle filigrane, langue FR/EN
 *  - bouton principal "Anonymiser pour cette mission"
 *  - une fois un PDF prêt : bouton "Voir le PDF ↓" qui scroll vers
 *    AnonymizePreview en bas de page + Télécharger
 */

import { useState } from "react"
import {
  CUSTOM_TEXT_MAX,
  TEMPLATE_META,
  type AnonymizeOptions,
  type AnonymizeStatus,
  type AnonymizeTemplate,
} from "./types"

/**
 * Mini-preview SVG illustrant le layout d'un template, dans le
 * sélecteur du panneau "Personnaliser". Pas un vrai PDF — juste des
 * rectangles arrangés pour donner le sentiment visuel.
 */
function TemplatePreview({ template }: { template: AnonymizeTemplate }) {
  const bg = "#F8F6FF"
  const block = "#C4B6E0"
  const accent = "#7C63C8"
  if (template === "two-column") {
    return (
      <svg viewBox="0 0 100 70" width="100%" height="64" style={{ display: "block", borderRadius: 6 }} aria-hidden>
        <rect width="100" height="70" fill={bg} />
        {/* header */}
        <rect x="6" y="6" width="40" height="4" rx="1" fill={accent} />
        {/* sidebar */}
        <rect x="6" y="14" width="28" height="50" rx="2" fill="white" stroke={block} strokeWidth="0.5" />
        <rect x="9" y="18" width="22" height="2" fill={block} />
        <rect x="9" y="22" width="16" height="2" fill={block} />
        <rect x="9" y="26" width="20" height="2" fill={block} />
        <rect x="9" y="32" width="22" height="2" fill={block} />
        <rect x="9" y="36" width="18" height="2" fill={block} />
        {/* main */}
        <rect x="38" y="14" width="56" height="3" rx="1" fill={accent} />
        <rect x="38" y="20" width="56" height="2" fill={block} />
        <rect x="38" y="24" width="48" height="2" fill={block} />
        <rect x="38" y="32" width="56" height="2" fill={block} />
        <rect x="38" y="36" width="50" height="2" fill={block} />
        <rect x="38" y="40" width="56" height="2" fill={block} />
        <rect x="38" y="44" width="44" height="2" fill={block} />
        <rect x="38" y="52" width="56" height="2" fill={block} />
        <rect x="38" y="56" width="40" height="2" fill={block} />
      </svg>
    )
  }
  if (template === "executive") {
    // Aéré : gros titre, beaucoup d'air vertical, peu de chips,
    // sections espacées avec liserés mais pas de fond coloré.
    return (
      <svg viewBox="0 0 100 70" width="100%" height="64" style={{ display: "block", borderRadius: 6 }} aria-hidden>
        <rect width="100" height="70" fill={bg} />
        {/* small wordmark + ref top */}
        <rect x="6" y="6" width="20" height="2" rx="1" fill={accent} />
        <rect x="84" y="6" width="10" height="2" rx="1" fill={block} />
        {/* GIANT headline */}
        <rect x="6" y="16" width="70" height="6" rx="1.5" fill={accent} />
        <rect x="6" y="24" width="48" height="6" rx="1.5" fill={accent} />
        {/* small subtitle / meta line */}
        <rect x="6" y="34" width="60" height="2" fill={block} />
        {/* skills as 3-4 large pills */}
        <rect x="6" y="42" width="18" height="3.5" rx="1.5" fill={block} />
        <rect x="26" y="42" width="22" height="3.5" rx="1.5" fill={block} />
        <rect x="50" y="42" width="14" height="3.5" rx="1.5" fill={block} />
        {/* exp blocks spaced */}
        <rect x="6" y="52" width="88" height="2" fill={block} />
        <rect x="6" y="56" width="70" height="2" fill={block} />
        <rect x="6" y="62" width="88" height="2" fill={block} />
      </svg>
    )
  }
  if (template === "bento") {
    // Grille de cards : header card pleine largeur, puis 2 cards
    // côte à côte (skills + méta), puis cards verticales pour les
    // sections principales (parcours, formation). Chaque card a un
    // contour arrondi pour donner le ressenti bento.
    return (
      <svg viewBox="0 0 100 70" width="100%" height="64" style={{ display: "block", borderRadius: 6 }} aria-hidden>
        <rect width="100" height="70" fill={bg} />
        {/* header card */}
        <rect x="6" y="6" width="88" height="14" rx="2.5" fill="white" stroke={block} strokeWidth="0.5" />
        <rect x="10" y="10" width="36" height="3" rx="1" fill={accent} />
        <rect x="10" y="15" width="30" height="2" fill={block} />
        {/* 2 row cards : skills + meta */}
        <rect x="6" y="24" width="44" height="14" rx="2.5" fill="white" stroke={block} strokeWidth="0.5" />
        <rect x="10" y="28" width="18" height="2" fill={accent} />
        <rect x="10" y="32" width="36" height="2.5" rx="1.25" fill={block} />
        <rect x="50" y="24" width="44" height="14" rx="2.5" fill="white" stroke={block} strokeWidth="0.5" />
        <rect x="54" y="28" width="14" height="2" fill={accent} />
        <rect x="54" y="32" width="36" height="2" fill={block} />
        {/* exp stacked cards */}
        <rect x="6" y="42" width="88" height="11" rx="2.5" fill="white" stroke={block} strokeWidth="0.5" />
        <rect x="10" y="45" width="40" height="2" fill={accent} />
        <rect x="10" y="49" width="60" height="1.5" fill={block} />
        <rect x="6" y="56" width="88" height="8" rx="2.5" fill="white" stroke={block} strokeWidth="0.5" />
        <rect x="10" y="59" width="30" height="2" fill={accent} />
      </svg>
    )
  }
  // classic
  return (
    <svg viewBox="0 0 100 70" width="100%" height="64" style={{ display: "block", borderRadius: 6 }} aria-hidden>
      <rect width="100" height="70" fill={bg} />
      <rect x="6" y="6" width="50" height="4" rx="1" fill={accent} />
      <rect x="6" y="14" width="88" height="3" rx="1" fill={accent} />
      <rect x="6" y="22" width="88" height="2" fill={block} />
      <rect x="6" y="26" width="80" height="2" fill={block} />
      <rect x="6" y="34" width="20" height="3" rx="1" fill={accent} />
      <rect x="6" y="40" width="14" height="3" rx="1" fill={block} />
      <rect x="22" y="40" width="18" height="3" rx="1" fill={block} />
      <rect x="42" y="40" width="16" height="3" rx="1" fill={block} />
      <rect x="6" y="50" width="88" height="2" fill={block} />
      <rect x="6" y="54" width="78" height="2" fill={block} />
      <rect x="6" y="58" width="84" height="2" fill={block} />
      <rect x="6" y="62" width="60" height="2" fill={block} />
    </svg>
  )
}

export function AnonymizeControls({
  candidateId,
  jobId,
  jobTitle,
  candidateParsed,
  status,
  options,
  onOptionsChange,
  onGenerate,
  onScrollToPreview,
}: {
  candidateId: string
  jobId: string | null
  jobTitle: string | null
  candidateParsed: boolean
  status: AnonymizeStatus
  options: AnonymizeOptions
  onOptionsChange: (next: AnonymizeOptions) => void
  onGenerate: () => Promise<void> | void
  /** Scroll vers la section AnonymizePreview en bas de la fiche match. */
  onScrollToPreview: () => void
}) {
  const [docxBusy, setDocxBusy] = useState(false)
  const [docxError, setDocxError] = useState<string | null>(null)

  /**
   * Génère et déclenche le téléchargement du .docx (sans Storage).
   * On POST → blob → URL.createObjectURL → click sur un <a> virtuel
   * → revoke. C'est le pattern standard pour des fichiers à usage
   * unique en flux serveur.
   */
  const downloadDocx = async () => {
    if (docxBusy || !candidateParsed) return
    setDocxBusy(true); setDocxError(null)
    try {
      const res = await fetch(`/api/cv/${candidateId}/anonymize/docx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          options: {
            keep_nora_summary: options.keepNoraSummary,
            custom_text: options.customText.trim() || null,
            language: options.language,
          },
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as { message?: string }))
        setDocxError(data.message ?? `Échec génération .docx (${res.status})`)
        setDocxBusy(false)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const cd = res.headers.get("content-disposition") ?? ""
      const match = cd.match(/filename="([^"]+)"/)
      a.download = match?.[1] ?? "cv-anonymise.docx"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setDocxError((err as Error).message ?? "Erreur réseau.")
    } finally {
      setDocxBusy(false)
    }
  }

  const [customizeOpen, setCustomizeOpen] = useState(false)
  const setOption = <K extends keyof AnonymizeOptions>(key: K, value: AnonymizeOptions[K]) => {
    onOptionsChange({ ...options, [key]: value })
  }
  // Indicateur "Personnaliser" actif → petit point coloré sur le
  // bouton pour rappeler au sourceur que ses overrides s'appliqueront.
  const hasOverrides =
    options.template !== "classic" ||
    !options.keepNoraSummary ||
    options.customText.trim().length > 0 ||
    options.watermark ||
    options.language !== "fr"
  const hasJob = !!jobId
  const disabled = !candidateParsed || !hasJob || status.state === "working"

  return (
    <section style={{
      background: "white",
      border: "1px solid #F0ECF8",
      borderRadius: 16,
      padding: 18,
      marginBottom: 14,
    }}>
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        gap: 14, flexWrap: "wrap",
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{
            margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: "#9CA3AF",
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            🔒 CV anonymisé
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: "#6B7280", lineHeight: 1.55 }}>
            {!candidateParsed
              ? "Disponible une fois le CV parsé."
              : hasJob
                ? <>Générez un PDF présentable au client, orienté pour la mission <strong style={{ color: "#111827" }}>{jobTitle}</strong>. Identité retirée.</>
                : "Aucune mission sélectionnée — le PDF sera générique."}
          </p>
          {status.error && (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "#B91C1C" }}>
              {status.error}
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Toggle "Personnaliser" — ouvre le panneau d'options. */}
          <button
            type="button"
            onClick={() => setCustomizeOpen((v) => !v)}
            style={{
              fontSize: 12.5, fontWeight: 700, color: customizeOpen ? "white" : "#374151",
              background: customizeOpen ? "#374151" : "white",
              border: `1px solid ${customizeOpen ? "#374151" : "#E5E7EB"}`,
              borderRadius: 10, padding: "10px 14px",
              cursor: "pointer", fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", gap: 8,
              whiteSpace: "nowrap",
            }}
          >
            <span>Personnaliser</span>
            {hasOverrides && (
              <span aria-hidden style={{
                display: "inline-block", width: 7, height: 7, borderRadius: "50%",
                background: customizeOpen ? "#FBBF24" : "#7C63C8",
              }} />
            )}
            <span style={{ fontSize: 10, opacity: 0.6 }}>{customizeOpen ? "▴" : "▾"}</span>
          </button>

          <button
            type="button"
            onClick={() => void onGenerate()}
            disabled={disabled}
            title={!hasJob ? "Aucune mission sélectionnée" : undefined}
            style={{
              fontSize: 13, fontWeight: 700,
              color: disabled ? "#9CA3AF" : "white",
              background: disabled
                ? "#F3F4F6"
                : status.state === "working"
                  ? "#C4B6E0"
                  : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
              border: "none", borderRadius: 10, padding: "10px 18px",
              cursor: disabled ? "default" : "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
              boxShadow: disabled ? "none" : "0 6px 18px -8px rgba(124,99,200,0.55)",
            }}
          >
            {status.state === "working"
              ? "Génération…"
              : status.state === "ready"
                ? "Régénérer pour cette mission"
                : "Anonymiser pour cette mission"}
          </button>

          {status.state === "ready" && status.previewUrl && (
            <button
              type="button"
              onClick={onScrollToPreview}
              style={{
                fontSize: 12.5, fontWeight: 700, color: "#7C63C8",
                background: "white", border: "1px solid rgba(124,99,200,0.25)",
                borderRadius: 10, padding: "10px 14px",
                cursor: "pointer", fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", gap: 6,
                whiteSpace: "nowrap",
              }}
              title="Aller à l'aperçu du PDF en bas de page"
            >
              Voir le PDF ↓
            </button>
          )}

          {status.state === "ready" && status.downloadUrl && (
            <a
              href={status.downloadUrl}
              style={{
                fontSize: 12.5, fontWeight: 700, color: "#374151",
                background: "white", border: "1px solid #E5E7EB",
                borderRadius: 10, padding: "10px 14px",
                textDecoration: "none",
                display: "inline-flex", alignItems: "center", gap: 6,
                whiteSpace: "nowrap",
              }}
            >
              Télécharger PDF
            </a>
          )}

          {/* Export .docx — lien discret. Disponible dès que le CV est
              parsé (n'a pas besoin d'avoir d'abord généré le PDF). */}
          <button
            type="button"
            onClick={() => void downloadDocx()}
            disabled={!candidateParsed || docxBusy}
            title="Version .docx éditable dans Word"
            style={{
              fontSize: 12, fontWeight: 600, color: "#6B7280",
              background: "transparent", border: "none",
              padding: "10px 4px", cursor: !candidateParsed || docxBusy ? "default" : "pointer",
              textDecoration: "underline", textDecorationStyle: "dotted",
              textUnderlineOffset: 3, fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            {docxBusy ? "Génération .docx…" : "Aussi en .docx"}
          </button>
        </div>
      </div>

      {docxError && (
        <p style={{ margin: "10px 0 0", fontSize: 12, color: "#B91C1C" }}>
          {docxError}
        </p>
      )}

      {/* Panneau Personnaliser — déplié à la demande. Sauvegarde locale
          uniquement : les choix ne sont pas persistés en DB, ils
          s'appliquent au prochain "Générer". */}
      {customizeOpen && (
        <div style={{
          marginTop: 16,
          padding: "16px 18px",
          background: "#FAFAFA",
          border: "1px solid #F0ECF8",
          borderRadius: 12,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 16,
        }}>
          {/* Sélecteur template — full width, en haut du panneau */}
          <div style={{ gridColumn: "1 / -1" }}>
            <span style={{
              display: "block", fontSize: 12.5, fontWeight: 600,
              color: "#374151", marginBottom: 8,
            }}>
              Template
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              {(Object.keys(TEMPLATE_META) as AnonymizeTemplate[]).map((tpl) => {
                const meta = TEMPLATE_META[tpl]
                const active = options.template === tpl
                return (
                  <button
                    key={tpl}
                    type="button"
                    onClick={() => setOption("template", tpl)}
                    style={{
                      display: "flex", flexDirection: "column", gap: 8,
                      padding: 10, borderRadius: 10,
                      border: `1.5px solid ${active ? "#7C63C8" : "#E5E7EB"}`,
                      background: active ? "white" : "white",
                      boxShadow: active ? "0 6px 18px -10px rgba(124,99,200,0.55)" : "none",
                      cursor: "pointer", fontFamily: "inherit",
                      textAlign: "left",
                    }}
                  >
                    <TemplatePreview template={tpl} />
                    <div>
                      <span style={{
                        display: "block", fontSize: 12.5,
                        fontWeight: 700, color: active ? "#7C63C8" : "#111827",
                      }}>
                        {meta.label}
                      </span>
                      <span style={{ display: "block", fontSize: 11, color: "#6B7280", marginTop: 2, lineHeight: 1.4 }}>
                        {meta.hint}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Toggle résumé Nora */}
          <label style={{
            display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
            padding: 10, borderRadius: 8, background: "white",
            border: "1px solid #F0ECF8",
          }}>
            <input
              type="checkbox"
              checked={options.keepNoraSummary}
              onChange={(e) => setOption("keepNoraSummary", e.target.checked)}
              style={{ marginTop: 2, accentColor: "#7C63C8" }}
            />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#111827" }}>
                Garder le résumé Nora
              </span>
              <span style={{ display: "block", fontSize: 11.5, color: "#6B7280", marginTop: 2 }}>
                2-3 phrases factuelles orientées mission, générées automatiquement.
              </span>
            </span>
          </label>

          {/* Toggle filigrane */}
          <label style={{
            display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
            padding: 10, borderRadius: 8, background: "white",
            border: "1px solid #F0ECF8",
          }}>
            <input
              type="checkbox"
              checked={options.watermark}
              onChange={(e) => setOption("watermark", e.target.checked)}
              style={{ marginTop: 2, accentColor: "#7C63C8" }}
            />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#111827" }}>
                Filigrane diagonal
              </span>
              <span style={{ display: "block", fontSize: 11.5, color: "#6B7280", marginTop: 2 }}>
                « Réf · Cabinet » en filigrane sur toutes les pages.
              </span>
            </span>
          </label>

          {/* Langue */}
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "#374151" }}>
              Langue des libellés
            </span>
            <div style={{ display: "inline-flex", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden" }}>
              {(["fr", "en"] as const).map((lang) => {
                const active = options.language === lang
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setOption("language", lang)}
                    style={{
                      fontSize: 12.5, fontWeight: 700,
                      color: active ? "white" : "#374151",
                      background: active ? "#7C63C8" : "white",
                      border: "none",
                      padding: "7px 14px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    {lang}
                  </button>
                )
              })}
            </div>
            <span style={{ fontSize: 11, color: "#9CA3AF" }}>
              Le contenu du CV reste dans sa langue d&apos;origine.
            </span>
          </div>

          {/* Textarea message custom */}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
              Message personnalisé <span style={{ color: "#9CA3AF", fontWeight: 400 }}>(optionnel)</span>
            </label>
            <textarea
              value={options.customText}
              onChange={(e) => setOption("customText", e.target.value.slice(0, CUSTOM_TEXT_MAX))}
              placeholder="Ajoutez un message rédigé sous votre angle (positionnement candidat, contexte mission, etc.). S'affichera sous le résumé Nora, ou seul si vous décochez « Garder le résumé Nora »."
              rows={4}
              maxLength={CUSTOM_TEXT_MAX}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #E2DAF6",
                background: "white",
                fontSize: 13,
                color: "#111827",
                fontFamily: "inherit",
                lineHeight: 1.55,
                resize: "vertical",
                outline: "none",
                minHeight: 80,
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11, color: "#9CA3AF" }}>
              <span>S&apos;intègre sous le résumé (ou le remplace si décoché).</span>
              <span>{options.customText.length}/{CUSTOM_TEXT_MAX}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
