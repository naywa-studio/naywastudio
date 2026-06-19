"use client"

/**
 * Aperçu du PDF anonymisé — affiché en bas de la fiche match dans
 * une carte large. Reste à sa place même quand l'utilisateur lance
 * une génération (pas de jump vers le haut), pour que la lecture du
 * matching ne soit pas perturbée.
 *
 * Empty state : le sourceur n'a pas encore généré → on guide vers le
 * bouton du haut. Ready state : iframe avec le PDF + lien download.
 */

import { forwardRef } from "react"
import type { AnonymizeStatus } from "./types"

export const AnonymizePreview = forwardRef<HTMLElement, {
  status: AnonymizeStatus
  /** Fired once the preview iframe finishes loading. */
  onPreviewLoad?: () => void
}>(function AnonymizePreview({ status, onPreviewLoad }, ref) {
  return (
    <section
      ref={ref}
      style={{
        background: "white",
        border: "1px solid #F0ECF8",
        borderRadius: 16,
        padding: 18,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <h3 style={{
          margin: 0, fontSize: 12, fontWeight: 700, color: "#9CA3AF",
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          📄 Aperçu PDF anonymisé
        </h3>
      </div>

      {status.state !== "ready" || !status.previewUrl ? (
        <div style={{
          border: "1.5px dashed #E2DAF6",
          borderRadius: 12,
          padding: "44px 24px",
          textAlign: "center",
          background: "#FAFAFA",
        }}>
          <p style={{
            margin: 0, fontSize: 13.5, color: "#9CA3AF",
            lineHeight: 1.6, maxWidth: 420, marginInline: "auto",
          }}>
            {status.state === "working"
              ? "Génération du PDF en cours…"
              : "L'aperçu apparaîtra ici une fois que vous aurez cliqué sur « Anonymiser pour cette mission » en haut de page."}
          </p>
        </div>
      ) : (
        <div style={{
          borderRadius: 12, overflow: "hidden",
          border: "1px solid #F0ECF8", background: "#FAFAFA",
          // Format proche d'une page A4 pour une lecture confortable.
          maxWidth: 840, marginInline: "auto",
        }}>
          {/* PDF viewer hints (Chromium) :
              #toolbar=1   garde la barre (zoom, print, download)
              #navpanes=0  cache la sidebar thumbnails
              #view=FitH   ajuste à la largeur de la frame */}
          <iframe
            src={`${status.previewUrl}#toolbar=1&navpanes=0&view=FitH`}
            title="CV anonymisé"
            onLoad={() => onPreviewLoad?.()}
            style={{ width: "100%", height: 820, border: "none", display: "block" }}
          />
        </div>
      )}
    </section>
  )
})
