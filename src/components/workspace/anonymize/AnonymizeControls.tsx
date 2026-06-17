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
import { CUSTOM_TEXT_MAX, type AnonymizeOptions, type AnonymizeStatus } from "./types"

export function AnonymizeControls({
  jobId,
  jobTitle,
  candidateParsed,
  status,
  options,
  onOptionsChange,
  onGenerate,
  onScrollToPreview,
}: {
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
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const setOption = <K extends keyof AnonymizeOptions>(key: K, value: AnonymizeOptions[K]) => {
    onOptionsChange({ ...options, [key]: value })
  }
  // Indicateur "Personnaliser" actif → petit point coloré sur le
  // bouton pour rappeler au sourceur que ses overrides s'appliqueront.
  const hasOverrides =
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
              Télécharger
            </a>
          )}
        </div>
      </div>

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
