"use client"

import { useEffect, useState } from "react"

/**
 * Self-contained "anonymise this candidate for the chosen job" action card.
 *
 * On mount it fetches any existing anonymised PDF URL (GET /anonymize) so
 * the "Télécharger" button shows up immediately if there's already a file.
 * Clicking "Régénérer" / "Anonymiser pour ce poste" POSTs with the job_id
 * so the route's job-orientation logic kicks in.
 */
export default function AnonymizeForJob({
  candidateId,
  jobId,
  jobTitle,
  candidateParsed = true,
  embedded = false,
  onPreviewLoad,
}: {
  candidateId: string
  jobId: string | null
  jobTitle: string | null
  /** When false (CV not parsed yet), the section disables itself with a
   *  clear message rather than letting the user trigger a 400. */
  candidateParsed?: boolean
  /** When true, drop the outer card + title — the host already provides a
   *  "🔒 CV anonymisé" header (e.g. the collapsible block on the fiche match). */
  embedded?: boolean
  /** Fired once the preview iframe finishes loading — lets the host re-scroll
   *  to the now-full-height preview. */
  onPreviewLoad?: () => void
}) {
  const [state, setState] = useState<"idle" | "working" | "ready" | "error">("idle")
  // Two distinct URLs:
  //  - previewUrl  : no Content-Disposition: attachment → safe in <iframe>
  //  - downloadUrl : forces "save as" via the <a download> anchor
  // The route returns both; legacy `url` field falls back to preview.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hasJob = !!jobId

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await fetch(`/api/cv/${candidateId}/anonymize`)
      if (cancelled) return
      if (res.ok) {
        const j = await res.json().catch(() => ({}))
        const preview = j?.preview_url ?? j?.url ?? null
        const download = j?.download_url ?? j?.url ?? null
        if (preview) {
          setPreviewUrl(preview)
          setDownloadUrl(download)
          setState("ready")
        }
      }
    })()
    return () => { cancelled = true }
  }, [candidateId])

  const generate = async () => {
    if (!hasJob || state === "working") return
    setState("working"); setError(null)
    try {
      const res = await fetch(`/api/cv/${candidateId}/anonymize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setError(data?.message ?? data?.error ?? "Échec de l'anonymisation.")
        setState("error")
        return
      }
      setPreviewUrl(data.preview_url ?? data.url ?? null)
      setDownloadUrl(data.download_url ?? data.url ?? null)
      setState("ready")
    } catch (err) {
      setError((err as Error).message ?? "Erreur réseau.")
      setState("error")
    }
  }

  return (
    <section style={embedded ? { background: "transparent" } : {
      background: "white", borderRadius: 16, border: "1px solid var(--nw-border-soft)",
      padding: 18,
    }}>
      {!embedded && (
        <h2 style={{
          margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "var(--nw-text-muted)",
          letterSpacing: "0.08em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
        }}>
          🔒 CV anonymisé
        </h2>
      )}
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--nw-text-muted)", lineHeight: 1.55 }}>
        {!candidateParsed
          ? "Disponible une fois le CV parsé."
          : hasJob
            ? <>Génère un PDF présentable au client, orienté pour la mission <strong style={{ color: "var(--nw-text)" }}>{jobTitle}</strong>. Identité retirée.</>
            : "Aucune mission sélectionnée — le PDF sera générique."}
      </p>
      {error && (
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--nw-danger-strong)" }}>{error}</p>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={generate}
          disabled={!candidateParsed || !hasJob || state === "working"}
          title={!hasJob ? "Aucune mission sélectionnée" : undefined}
          style={{
            fontSize: 12.5, fontWeight: 700,
            color: (!candidateParsed || !hasJob) ? "var(--nw-text-muted)" : "white",
            background: (!candidateParsed || !hasJob) ? "var(--nw-neutral-100)"
              : state === "working" ? "var(--nw-primary-200)"
              : "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
            border: "none", borderRadius: 9, padding: "9px 16px",
            cursor: (!candidateParsed || !hasJob || state === "working") ? "default" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {state === "working" ? "Génération…"
            : state === "ready" ? "Régénérer pour cette mission"
            : "Anonymiser pour cette mission"}
        </button>
        {state === "ready" && downloadUrl && (
          <a href={downloadUrl} style={{
            fontSize: 12.5, fontWeight: 700, color: "var(--nw-primary)",
            background: "white", border: "1px solid rgba(124,99,200,0.25)",
            borderRadius: 9, padding: "9px 14px", textDecoration: "none",
            display: "inline-flex", alignItems: "center",
          }}>
            Télécharger ↓
          </a>
        )}
      </div>

      {state === "ready" && previewUrl && (
        <div style={{
          marginTop: 14, borderRadius: 12, overflow: "hidden",
          border: "1px solid var(--nw-border-soft)", background: "var(--nw-surface-muted)",
          // Centré, format proche d'une page A4 pour une lecture confortable.
          maxWidth: 840, marginLeft: "auto", marginRight: "auto",
        }}>
          {/* PDF viewer hints understood by Chrome/Edge's built-in viewer:
              #toolbar=1   keep the toolbar (zoom, print, download)
              #navpanes=0  hide the page-thumbnails sidebar (default open)
              #view=FitH   fit page width — the doc fills the iframe nicely */}
          <iframe
            src={`${previewUrl}#toolbar=1&navpanes=0&view=FitH`}
            title="CV anonymisé"
            onLoad={() => onPreviewLoad?.()}
            style={{ width: "100%", height: 720, border: "none", display: "block" }}
          />
        </div>
      )}
    </section>
  )
}
