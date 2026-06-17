"use client"

/**
 * Contrôles d'anonymisation — affichés en haut de la fiche match,
 * juste sous le bandeau d'identité candidat.
 *
 * Responsabilités V1 :
 *  - description courte mission ciblée
 *  - bouton principal "Anonymiser pour cette mission"
 *  - une fois un PDF prêt : bouton "Voir le PDF ↓" qui scroll vers
 *    AnonymizePreview en bas de page
 *
 * V2 (commit suivant) : on insère ici la section dépliable
 * "Personnaliser" avec toggle résumé Nora, textarea custom, watermark,
 * langue FR/EN.
 */

import type { AnonymizeStatus } from "./types"

export function AnonymizeControls({
  jobId,
  jobTitle,
  candidateParsed,
  status,
  onGenerate,
  onScrollToPreview,
}: {
  jobId: string | null
  jobTitle: string | null
  candidateParsed: boolean
  status: AnonymizeStatus
  onGenerate: () => Promise<void> | void
  /** Scroll vers la section AnonymizePreview en bas de la fiche match. */
  onScrollToPreview: () => void
}) {
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
    </section>
  )
}
