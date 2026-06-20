"use client"

/**
 * /admin/demandes — file des demandes de modification branding.
 *
 * Liste des pending par défaut. Toggle pour voir les décidées.
 * Approve/Reject avec confirmation ; le mail Resend au client est
 * envoyé côté API.
 */

import { useCallback, useEffect, useState } from "react"

interface Request {
  id: string
  organization_id: string
  requested_by: string | null
  field: "name" | "brand_logo_path" | "contact_email"
  current_value: string | null
  requested_value: string
  reason: string | null
  status: "pending" | "approved" | "rejected" | "cancelled"
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  created_at: string
  organizations: { id: string; name: string; brand_name: string | null } | null
  requester: { user_id: string; first_name: string | null } | null
}

const FIELD_LABEL: Record<Request["field"], string> = {
  name: "Nom de l'organisation",
  brand_logo_path: "Logo",
  contact_email: "Email de contact",
}

export default function AdminDemandesPage() {
  const [filter, setFilter] = useState<"pending" | "decided" | "all">("pending")
  const [rows, setRows] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [decisionNote, setDecisionNote] = useState("")
  const [confirming, setConfirming] = useState<{ id: string; action: "approve" | "reject" } | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/admin/branding-requests?status=${filter}`, { cache: "no-store" })
      const j = await r.json() as { requests: Request[] }
      setRows(j.requests ?? [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [filter])
  useEffect(() => { void fetchAll() }, [fetchAll])

  const decide = async () => {
    if (!confirming) return
    setError(null)
    const r = await fetch(`/api/admin/branding-requests/${confirming.id}`, {
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
          Validation manuelle. La décision déclenche un email au requester.
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
      ) : rows.length === 0 ? (
        <div style={{
          padding: 32, textAlign: "center",
          border: "1px dashed #E5E7EB", borderRadius: 14, background: "#FAFAFA",
        }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#374151" }}>
            Aucune demande {filter === "pending" ? "en attente" : "à afficher"}.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((r) => {
            const orgLabel = r.organizations?.brand_name ?? r.organizations?.name ?? "—"
            const requesterLabel = r.requester?.first_name ?? "Inconnu"
            return (
              <article key={r.id} style={{
                padding: 16, background: "white",
                border: "1px solid #F0ECF8", borderRadius: 12,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                  <StatusPill status={r.status} />
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                    {new Date(r.created_at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <h2 style={{
                  margin: "4px 0 6px", fontSize: 15, fontWeight: 700, color: "#111827",
                }}>
                  {FIELD_LABEL[r.field]} — {orgLabel}
                </h2>
                <p style={{ margin: 0, fontSize: 12.5, color: "#6B7280" }}>
                  Demandée par <strong style={{ color: "#374151" }}>{requesterLabel}</strong>
                </p>
                <div style={{
                  marginTop: 10, padding: 12,
                  background: "#FAFAFA", borderRadius: 10,
                  display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
                }}>
                  <div>
                    <Label>Valeur actuelle</Label>
                    <div style={mono}>{r.current_value || <em style={{ color: "#9CA3AF" }}>(vide)</em>}</div>
                  </div>
                  <div>
                    <Label>Valeur demandée</Label>
                    <div style={mono}>{r.requested_value}</div>
                  </div>
                </div>
                {r.reason && (
                  <p style={{ margin: "10px 0 0", fontSize: 13, color: "#374151" }}>
                    <strong style={{ color: "#6B7280", fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Raison :</strong>{" "}
                    {r.reason}
                  </p>
                )}
                {r.decision_note && (
                  <p style={{ margin: "10px 0 0", fontSize: 13, color: "#B91C1C" }}>
                    <strong>Note de décision :</strong> {r.decision_note}
                  </p>
                )}
                {r.status === "pending" && (
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <button
                      type="button"
                      onClick={() => { setDecisionNote(""); setConfirming({ id: r.id, action: "approve" }) }}
                      style={{
                        padding: "8px 14px", borderRadius: 8,
                        border: "none",
                        background: "linear-gradient(120deg, #15803D 0%, #166534 100%)",
                        color: "white", fontSize: 12.5, fontWeight: 700,
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      Approuver
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDecisionNote(""); setConfirming({ id: r.id, action: "reject" }) }}
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
              </article>
            )
          })}
        </div>
      )}

      {confirming && (
        <div
          role="dialog" aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirming(null) }}
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
              {confirming.action === "approve" ? "Approuver la demande ?" : "Refuser la demande ?"}
            </h3>
            <p style={{ margin: "8px 0 14px", fontSize: 13, color: "#6B7280", lineHeight: 1.55 }}>
              {confirming.action === "approve"
                ? "Le changement sera appliqué et un mail enverra le client."
                : "Le client recevra un mail expliquant le refus. Indiquez la raison ci-dessous (visible dans le mail)."}
            </p>
            {confirming.action === "reject" && (
              <>
                <Label>Raison du refus</Label>
                <textarea
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  placeholder="Ex : ce nom est trop proche d'une organisation existante. Merci de proposer un autre nom."
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
              <button type="button" onClick={() => setConfirming(null)} style={{
                padding: "8px 14px", borderRadius: 8,
                border: "1px solid #E5E7EB", background: "white",
                color: "#374151", fontSize: 12.5, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}>
                Annuler
              </button>
              <button type="button" onClick={() => void decide()} style={{
                padding: "8px 16px", borderRadius: 8,
                border: "none",
                background: confirming.action === "approve"
                  ? "linear-gradient(120deg, #15803D 0%, #166534 100%)"
                  : "linear-gradient(120deg, #DC2626 0%, #B91C1C 100%)",
                color: "white", fontSize: 12.5, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
              }}>
                {confirming.action === "approve" ? "Confirmer l'approbation" : "Confirmer le refus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function StatusPill({ status }: { status: Request["status"] }) {
  const map: Record<Request["status"], { label: string; color: string; bg: string }> = {
    pending:   { label: "En attente", color: "#B45309", bg: "rgba(245,158,11,0.10)" },
    approved:  { label: "Approuvée",  color: "#15803D", bg: "rgba(34,197,94,0.10)" },
    rejected:  { label: "Refusée",    color: "#B91C1C", bg: "rgba(220,38,38,0.10)" },
    cancelled: { label: "Annulée",    color: "#6B7280", bg: "#F3F4F6" },
  }
  const s = map[status]
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, color: s.color, background: s.bg,
      padding: "2px 8px", borderRadius: 100,
      letterSpacing: "0.05em", textTransform: "uppercase",
    }}>
      {s.label}
    </span>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      margin: "0 0 5px", fontSize: 11, fontWeight: 700,
      color: "#9CA3AF", letterSpacing: "0.05em", textTransform: "uppercase",
    }}>
      {children}
    </p>
  )
}

const mono: React.CSSProperties = {
  fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
  fontSize: 12.5, color: "#111827",
  wordBreak: "break-all",
}
