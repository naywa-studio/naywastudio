"use client"

/**
 * /admin/demandes — file des demandes de modification branding.
 *
 * Une demande = un "batch" qui peut contenir 1 à 3 changements
 * (nom + logo + email selon ce que l'owner a coché). Chaque
 * changement reste décidé indépendamment : tu peux approuver le nom
 * et refuser le logo dans la même batch.
 *
 * Toggle pending/decided/all. Mail Resend envoyé au client à chaque
 * décision côté serveur.
 */

import { useCallback, useEffect, useState } from "react"

type Field = "name" | "brand_logo_path" | "contact_email"
type Status = "pending" | "approved" | "rejected" | "cancelled"

interface ChangeRow {
  id: string
  field: Field
  current_value: string | null
  requested_value: string
  status: Status
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
}

interface Batch {
  batch_id: string
  organization: { id: string; name: string } | null
  requester: { user_id: string; first_name: string | null; email: string | null } | null
  reason: string | null
  created_at: string
  changes: ChangeRow[]
}

const FIELD_LABEL: Record<Field, string> = {
  name: "Nom de l'organisation",
  brand_logo_path: "Logo",
  contact_email: "Email de contact",
}

export default function AdminDemandesPage() {
  const [filter, setFilter] = useState<"pending" | "decided" | "all">("pending")
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<{ change: ChangeRow; action: "approve" | "reject" } | null>(null)
  const [decisionNote, setDecisionNote] = useState("")
  const [signedLogos, setSignedLogos] = useState<Record<string, string | null>>({})

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/admin/branding-requests?status=${filter}`, { cache: "no-store" })
      if (!r.ok) {
        const j = await r.json().catch(() => ({} as { error?: string }))
        throw new Error(j.error ?? `Erreur ${r.status}`)
      }
      const j = await r.json() as { batches: Batch[] }
      setBatches(j.batches ?? [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [filter])
  useEffect(() => { void fetchAll() }, [fetchAll])

  // Récupère les signed URLs pour les logos (current + requested) afin
  // que l'admin puisse comparer visuellement avant de décider.
  useEffect(() => {
    let cancelled = false
    const allLogoPaths = new Set<string>()
    for (const batch of batches) {
      for (const c of batch.changes) {
        if (c.field !== "brand_logo_path") continue
        if (c.current_value) allLogoPaths.add(c.current_value)
        if (c.requested_value) allLogoPaths.add(c.requested_value)
      }
    }
    void (async () => {
      const entries = await Promise.all(
        Array.from(allLogoPaths).map(async (path) => {
          const r = await fetch(`/api/admin/branding-logo-url?path=${encodeURIComponent(path)}`)
          if (!r.ok) return [path, null] as const
          const j = await r.json() as { url?: string | null }
          return [path, j.url ?? null] as const
        }),
      )
      if (cancelled) return
      setSignedLogos(Object.fromEntries(entries))
    })()
    return () => { cancelled = true }
  }, [batches])

  const decide = async () => {
    if (!confirming) return
    setError(null)
    const r = await fetch(`/api/admin/branding-requests/${confirming.change.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: confirming.action, note: decisionNote.trim() || null }),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? `Erreur ${r.status}`)
      return
    }
    setConfirming(null); setDecisionNote("")
    void fetchAll()
  }

  return (
    <main style={{
      maxWidth: 1100, margin: "0 auto",
      padding: "32px 24px 80px",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      <header style={{ marginBottom: 24 }}>
        <p style={{
          margin: "0 0 6px", fontSize: 11, fontWeight: 700,
          color: "#7C63C8", letterSpacing: "0.10em", textTransform: "uppercase",
        }}>
          Console admin · Demandes
        </p>
        <h1 style={{
          margin: 0, fontSize: 28, fontWeight: 800, color: "#111827",
          letterSpacing: "-0.02em",
        }}>
          Demandes de modification branding
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 13.5, color: "#6B7280", lineHeight: 1.6 }}>
          Chaque demande peut concerner plusieurs champs (nom, logo, email).
          Vous décidez champ par champ.
        </p>
      </header>

      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {(["pending", "decided", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            style={{
              padding: "7px 14px", borderRadius: 100,
              border: filter === f ? "1px solid #7C63C8" : "1px solid #E5E7EB",
              background: filter === f ? "rgba(124,99,200,0.08)" : "white",
              color: filter === f ? "#7C63C8" : "#6B7280",
              fontSize: 12.5, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {f === "pending" ? "En attente" : f === "decided" ? "Décidées" : "Toutes"}
          </button>
        ))}
      </div>

      {error && (
        <div style={{
          padding: "10px 12px", borderRadius: 10,
          background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.25)",
          color: "#B91C1C", fontSize: 12.5, marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: "#9CA3AF" }}>Chargement…</p>
      ) : batches.length === 0 ? (
        <div style={{
          padding: 32, textAlign: "center",
          border: "1px dashed #E5E7EB", borderRadius: 14, background: "#FAFAFA",
        }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#374151" }}>
            Aucune demande {filter === "pending" ? "en attente" : "à afficher"}.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {batches.map((batch) => {
            const orgLabel = batch.organization?.name ?? "—"
            const requesterLabel = batch.requester?.first_name ?? "Inconnu"
            const requesterEmail = batch.requester?.email ?? null
            return (
              <article key={batch.batch_id} style={{
                padding: "18px 20px", background: "white",
                border: "1px solid #F0ECF8", borderRadius: 14,
              }}>
                <header style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                    <BatchStatusPill changes={batch.changes} />
                    <span style={{ fontSize: 11.5, color: "#9CA3AF" }}>
                      {new Date(batch.created_at).toLocaleString("fr-FR", {
                        day: "numeric", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <h2 style={{
                    margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "#111827",
                    letterSpacing: "-0.01em",
                  }}>
                    {orgLabel}
                  </h2>
                  <p style={{ margin: 0, fontSize: 12.5, color: "#6B7280" }}>
                    Demandée par <strong style={{ color: "#374151" }}>{requesterLabel}</strong>
                    {requesterEmail && (
                      <> · <a href={`mailto:${requesterEmail}`} style={{ color: "#7C63C8" }}>{requesterEmail}</a></>
                    )}
                  </p>
                  {batch.reason && (
                    <p style={{
                      margin: "10px 0 0", padding: "8px 10px",
                      fontSize: 13, color: "#374151", lineHeight: 1.5,
                      background: "#FAFAFA", borderRadius: 8,
                      borderLeft: "3px solid #7C63C8",
                    }}>
                      <strong style={{ color: "#6B7280", fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Raison :</strong>{" "}
                      {batch.reason}
                    </p>
                  )}
                </header>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {batch.changes.map((change) => (
                    <ChangeCard
                      key={change.id}
                      change={change}
                      signedLogos={signedLogos}
                      onApprove={() => { setDecisionNote(""); setConfirming({ change, action: "approve" }) }}
                      onReject={() => { setDecisionNote(""); setConfirming({ change, action: "reject" }) }}
                    />
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {confirming && (
        <ConfirmationModal
          change={confirming.change}
          action={confirming.action}
          note={decisionNote}
          onNoteChange={setDecisionNote}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void decide()}
        />
      )}
    </main>
  )
}

function ChangeCard({
  change, signedLogos, onApprove, onReject,
}: {
  change: ChangeRow
  signedLogos: Record<string, string | null>
  onApprove: () => void
  onReject: () => void
}) {
  const isLogo = change.field === "brand_logo_path"
  const currentLogoUrl = isLogo && change.current_value ? signedLogos[change.current_value] : null
  const requestedLogoUrl = isLogo ? signedLogos[change.requested_value] : null

  return (
    <div style={{
      padding: 14,
      borderRadius: 10,
      border: change.status === "pending" ? "1px solid #F0ECF8" : "1px solid #E5E7EB",
      background: change.status === "pending" ? "white" : "#FAFAFA",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
        flexWrap: "wrap",
      }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: "#7C63C8",
          background: "rgba(124,99,200,0.08)",
          padding: "3px 8px", borderRadius: 100,
          letterSpacing: "0.05em", textTransform: "uppercase",
        }}>
          {FIELD_LABEL[change.field]}
        </span>
        <ChangeStatusPill status={change.status} />
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
      }}>
        <div>
          <FieldHeader>Valeur actuelle</FieldHeader>
          {isLogo ? (
            <LogoPreview src={currentLogoUrl} placeholder="Aucun logo" />
          ) : (
            <ValueBlock value={change.current_value} dim />
          )}
        </div>
        <div>
          <FieldHeader>Valeur demandée</FieldHeader>
          {isLogo ? (
            <LogoPreview src={requestedLogoUrl} placeholder="Logo en cours d'upload" highlight />
          ) : (
            <ValueBlock value={change.requested_value} highlight />
          )}
        </div>
      </div>

      {change.decision_note && (
        <p style={{
          margin: "10px 0 0", padding: "8px 10px",
          fontSize: 12.5, color: "#B91C1C", lineHeight: 1.5,
          background: "rgba(220,38,38,0.06)", borderRadius: 8,
        }}>
          <strong>Note de décision :</strong> {change.decision_note}
        </p>
      )}

      {change.status === "pending" && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            type="button" onClick={onApprove}
            style={{
              padding: "8px 14px", borderRadius: 8, border: "none",
              background: "linear-gradient(120deg, #15803D 0%, #166534 100%)",
              color: "white", fontSize: 12.5, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Approuver
          </button>
          <button
            type="button" onClick={onReject}
            style={{
              padding: "8px 14px", borderRadius: 8,
              border: "1px solid #FCA5A5", background: "white",
              color: "#B91C1C", fontSize: 12.5, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Refuser
          </button>
        </div>
      )}
    </div>
  )
}

function ConfirmationModal({
  change, action, note, onNoteChange, onCancel, onConfirm,
}: {
  change: ChangeRow
  action: "approve" | "reject"
  note: string
  onNoteChange: (next: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(17,24,39,0.40)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
    >
      <div style={{
        width: "100%", maxWidth: 480,
        background: "white", borderRadius: 16, padding: 24,
        fontFamily: "var(--font-inter), sans-serif",
        boxShadow: "0 24px 64px -24px rgba(17,24,39,0.30)",
      }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#111827" }}>
          {action === "approve" ? "Approuver ce changement ?" : "Refuser ce changement ?"}
        </h3>
        <p style={{ margin: "8px 0 14px", fontSize: 13, color: "#6B7280", lineHeight: 1.55 }}>
          Champ concerné : <strong>{FIELD_LABEL[change.field]}</strong>.
          {action === "approve"
            ? " La modification sera appliquée et un mail enverra le client."
            : " Un mail expliquant le refus sera envoyé. Indiquez la raison (visible dans le mail)."}
        </p>
        {action === "reject" && (
          <>
            <label style={{
              display: "block", marginBottom: 5,
              fontSize: 11, fontWeight: 700, color: "#9CA3AF",
              letterSpacing: "0.05em", textTransform: "uppercase",
            }}>
              Raison du refus
            </label>
            <textarea
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="Ex : le nom proposé est trop similaire à une autre organisation. Merci de proposer une variante."
              rows={4}
              style={{
                width: "100%", padding: "10px 12px",
                borderRadius: 8, border: "1.5px solid #E5E7EB",
                fontSize: 13.5, fontFamily: "inherit",
                boxSizing: "border-box", resize: "vertical",
              }}
            />
          </>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <button type="button" onClick={onCancel} style={{
            padding: "8px 14px", borderRadius: 8,
            border: "1px solid #E5E7EB", background: "white",
            color: "#374151", fontSize: 12.5, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}>
            Annuler
          </button>
          <button type="button" onClick={onConfirm} style={{
            padding: "8px 16px", borderRadius: 8, border: "none",
            background: action === "approve"
              ? "linear-gradient(120deg, #15803D 0%, #166534 100%)"
              : "linear-gradient(120deg, #DC2626 0%, #B91C1C 100%)",
            color: "white", fontSize: 12.5, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit",
          }}>
            {action === "approve" ? "Confirmer l'approbation" : "Confirmer le refus"}
          </button>
        </div>
      </div>
    </div>
  )
}

function FieldHeader({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      margin: "0 0 6px", fontSize: 10.5, fontWeight: 700,
      color: "#9CA3AF", letterSpacing: "0.05em", textTransform: "uppercase",
    }}>
      {children}
    </p>
  )
}

function ValueBlock({ value, dim, highlight }: { value: string | null; dim?: boolean; highlight?: boolean }) {
  return (
    <div style={{
      padding: "8px 10px", borderRadius: 8,
      background: highlight ? "rgba(124,99,200,0.05)" : "#FAFAFA",
      border: highlight ? "1px solid rgba(124,99,200,0.20)" : "1px solid #F0ECF8",
      fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
      fontSize: 12.5, color: dim ? "#9CA3AF" : "#111827",
      wordBreak: "break-all", minHeight: 28,
    }}>
      {value || <em style={{ color: "#9CA3AF" }}>(vide)</em>}
    </div>
  )
}

function LogoPreview({ src, placeholder, highlight }: { src: string | null | undefined; placeholder: string; highlight?: boolean }) {
  return (
    <div style={{
      width: "100%", aspectRatio: "2 / 1",
      borderRadius: 8,
      border: highlight ? "1px solid rgba(124,99,200,0.30)" : "1px solid #F0ECF8",
      background: highlight ? "rgba(124,99,200,0.05)" : "#FAFAFA",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", padding: 8 }} />
      ) : (
        <span style={{ fontSize: 11.5, color: "#9CA3AF", fontStyle: "italic" }}>{placeholder}</span>
      )}
    </div>
  )
}

function ChangeStatusPill({ status }: { status: Status }) {
  const map: Record<Status, { label: string; color: string; bg: string }> = {
    pending:   { label: "En attente", color: "#B45309", bg: "rgba(245,158,11,0.10)" },
    approved:  { label: "Approuvé",   color: "#15803D", bg: "rgba(34,197,94,0.10)" },
    rejected:  { label: "Refusé",     color: "#B91C1C", bg: "rgba(220,38,38,0.10)" },
    cancelled: { label: "Annulé",     color: "#6B7280", bg: "#F3F4F6" },
  }
  const s = map[status]
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color: s.color, background: s.bg,
      padding: "2px 7px", borderRadius: 100,
      letterSpacing: "0.05em", textTransform: "uppercase",
    }}>
      {s.label}
    </span>
  )
}

function BatchStatusPill({ changes }: { changes: ChangeRow[] }) {
  const hasPending = changes.some((c) => c.status === "pending")
  const allApproved = changes.every((c) => c.status === "approved")
  const allRejected = changes.every((c) => c.status === "rejected")
  if (hasPending) return <Pill label="À traiter" color="#B45309" bg="rgba(245,158,11,0.10)" />
  if (allApproved) return <Pill label="Tout approuvé" color="#15803D" bg="rgba(34,197,94,0.10)" />
  if (allRejected) return <Pill label="Tout refusé" color="#B91C1C" bg="rgba(220,38,38,0.10)" />
  return <Pill label="Décidé" color="#6B7280" bg="#F3F4F6" />
}

function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, color, background: bg,
      padding: "2px 8px", borderRadius: 100,
      letterSpacing: "0.05em", textTransform: "uppercase",
    }}>
      {label}
    </span>
  )
}
