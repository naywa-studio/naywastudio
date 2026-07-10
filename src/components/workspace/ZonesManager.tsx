"use client"

/**
 * ZonesManager — panneau "Mes zones" pour /workspace/vivier (Sprint B).
 *
 * Permet au sourceur de gérer manuellement la taxonomie de son vivier :
 *   - voir toutes les zones (seed Nora + créées à la main)
 *   - créer une zone custom (nom + brief "qui ressemble à ça")
 *   - éditer une zone existante (sauf "Autre" — système)
 *   - supprimer une zone (les candidats tombent en "Autre")
 *
 * Le LLM utilise UNIQUEMENT cette liste pour assigner les candidats au
 * prochain re-clustering. C'est ta taxonomie, tu en es maître.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useEscapeKey } from "@/components/ui/useEscapeKey"

const FALLBACK_LABEL = "Autre"
const MAX_ZONES = 20

interface Zone {
  id: string
  label: string
  description: string
  candidate_count: number
  is_seed: boolean
  display_order: number
}

export function ZonesManager({ onChange }: { onChange?: () => void }) {
  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Zone | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/vivier/zones", { cache: "no-store" })
      const j = await res.json() as { zones?: Zone[]; error?: string }
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
      setZones(j.zones ?? [])
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const sorted = useMemo(() => {
    return [...zones].sort((a, b) => {
      // Autre toujours en dernier
      if (a.label === FALLBACK_LABEL) return 1
      if (b.label === FALLBACK_LABEL) return -1
      if (a.display_order !== b.display_order) return a.display_order - b.display_order
      return a.label.localeCompare(b.label)
    })
  }, [zones])

  const customCount = useMemo(() => zones.filter((z) => z.label !== FALLBACK_LABEL).length, [zones])
  const atCap = customCount >= MAX_ZONES - 1 // -1 car Autre est dans le cap

  return (
    <section style={{
      background: "white",
      border: "1px solid #F0ECF8",
      borderRadius: 14,
      padding: 18,
    }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "#111827", letterSpacing: "-0.005em" }}>
            Mes zones
          </h3>
          <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "#6B7280", lineHeight: 1.5 }}>
            Taxonomie utilisée par Nora pour ranger vos candidats. {customCount}/{MAX_ZONES - 1} zones personnalisées.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={atCap}
          title={atCap ? `Limite atteinte (${MAX_ZONES - 1} zones max hors Autre).` : "Ajouter une zone"}
          style={{
            fontFamily: "inherit", fontSize: 12, fontWeight: 700,
            color: atCap ? "#6B7280" : "#7C63C8",
            background: "white",
            border: `1px solid ${atCap ? "#E5E7EB" : "rgba(124,99,200,0.30)"}`,
            borderRadius: 8, padding: "6px 12px",
            cursor: atCap ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          + Créer une zone
        </button>
      </header>

      {error && (
        <div style={{
          padding: "8px 11px", fontSize: 12, color: "#B91C1C",
          background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.25)",
          borderRadius: 8, marginBottom: 10,
        }}>
          ⚠ {error}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 12, color: "#6B7280", padding: 16, textAlign: "center" }}>
          Chargement…
        </div>
      ) : sorted.length === 0 ? (
        <div style={{
          padding: 16, fontSize: 12.5, color: "#6B7280", textAlign: "center",
          border: "1px dashed #E5E7EB", borderRadius: 9,
        }}>
          Aucune zone définie. Lancez une analyse pour que Nora propose une taxonomie de base.
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {sorted.map((z) => (
            <li key={z.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 11px",
              borderRadius: 9,
              background: z.label === FALLBACK_LABEL ? "#FAFAFA" : "#FCFBFD",
              border: "1px solid #F0ECF8",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                    {z.label}
                  </span>
                  {z.label === FALLBACK_LABEL && (
                    <span style={{
                      fontSize: 9.5, fontWeight: 700, color: "#6B7280",
                      background: "#F3F4F6", border: "1px solid #E5E7EB",
                      borderRadius: 999, padding: "1px 6px",
                      letterSpacing: "0.05em", textTransform: "uppercase",
                    }}>
                      Système
                    </span>
                  )}
                  {z.is_seed && z.label !== FALLBACK_LABEL && (
                    <span style={{
                      fontSize: 9.5, fontWeight: 700, color: "#7C63C8",
                      background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.22)",
                      borderRadius: 999, padding: "1px 6px",
                      letterSpacing: "0.05em", textTransform: "uppercase",
                    }}>
                      Nora
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: "#6B7280", marginLeft: "auto" }}>
                    {z.candidate_count} {z.candidate_count > 1 ? "candidats" : "candidat"}
                  </span>
                </div>
                <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "#6B7280", lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {z.description}
                </p>
              </div>
              {z.label !== FALLBACK_LABEL && (
                <button
                  type="button"
                  onClick={() => setEditing(z)}
                  style={{
                    fontFamily: "inherit", fontSize: 11.5, fontWeight: 600,
                    color: "#7C63C8", background: "transparent",
                    border: "1px solid rgba(124,99,200,0.20)",
                    borderRadius: 7, padding: "5px 10px",
                    cursor: "pointer",
                  }}
                >
                  Modifier
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <ZoneEditModal
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); void reload(); onChange?.() }}
        />
      )}
      {editing && (
        <ZoneEditModal
          mode="edit"
          zone={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void reload(); onChange?.() }}
        />
      )}
    </section>
  )
}

function ZoneEditModal({
  mode, zone, onClose, onSaved,
}: {
  mode: "create" | "edit"
  zone?: Zone
  onClose: () => void
  onSaved: () => void
}) {
  useEscapeKey(onClose)
  const [label, setLabel] = useState(zone?.label ?? "")
  const [description, setDescription] = useState(zone?.description ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true); setError(null)
    try {
      const url = mode === "create" ? "/api/vivier/zones" : `/api/vivier/zones/${zone!.id}`
      const method = mode === "create" ? "POST" : "PATCH"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), description: description.trim() }),
      })
      const j = await res.json() as { error?: string; message?: string }
      if (!res.ok) throw new Error(j.message ?? j.error ?? `HTTP ${res.status}`)
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!zone) return
    if (!confirm(`Supprimer la zone "${zone.label}" ? Les ${zone.candidate_count} candidats assignés tomberont dans "Autre".`)) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/vivier/zones/${zone.id}`, { method: "DELETE" })
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { message?: string; error?: string }))
        throw new Error(j.message ?? j.error ?? `HTTP ${res.status}`)
      }
      onSaved()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const labelOk = label.trim().length >= 2 && label.trim().length <= 60
  const descOk = description.trim().length >= 10 && description.trim().length <= 280
  const canSave = labelOk && descOk && !busy

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(17,24,39,0.40)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: "var(--font-inter), sans-serif",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 480,
        background: "white", borderRadius: 16, padding: 24,
        boxShadow: "0 20px 50px -20px rgba(17,24,39,0.30)",
      }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800, color: "#111827", letterSpacing: "-0.01em" }}>
          {mode === "create" ? "Créer une zone" : "Modifier la zone"}
        </h2>
        <p style={{ margin: "0 0 18px", fontSize: 12.5, color: "#6B7280", lineHeight: 1.55 }}>
          Le brief de la zone est lu par Nora à chaque re-clustering pour décider
          quels candidats y atterrissent. Soyez explicite sur le métier, les outils
          clés et les signaux distinctifs.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600, color: "#374151" }}>
              Nom de la zone
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex : Data Engineering"
              maxLength={60}
              style={{
                width: "100%", padding: "9px 12px",
                borderRadius: 8, border: `1.5px solid ${labelOk || !label ? "#E5E7EB" : "#FCA5A5"}`,
                fontSize: 13.5, color: "#111827", outline: "none", fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
            <p style={{ margin: "3px 0 0", fontSize: 11, color: "#6B7280" }}>2-60 caractères</p>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600, color: "#374151" }}>
              Brief de la zone (« qui ressemble à ça »)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex : Profils data engineering — Python, Spark, Airflow, dbt, Snowflake. Fintech, banque, e-commerce."
              maxLength={280}
              rows={4}
              style={{
                width: "100%", padding: "9px 12px",
                borderRadius: 8, border: `1.5px solid ${descOk || !description ? "#E5E7EB" : "#FCA5A5"}`,
                fontSize: 13, color: "#111827", outline: "none",
                fontFamily: "inherit", resize: "vertical", lineHeight: 1.5,
                boxSizing: "border-box",
              }}
            />
            <p style={{ margin: "3px 0 0", fontSize: 11, color: "#6B7280" }}>{description.trim().length}/280 caractères (10 min)</p>
          </div>
        </div>

        {error && (
          <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#B91C1C" }}>{error}</p>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          {mode === "edit" ? (
            <button type="button" onClick={remove} disabled={busy}
              style={{
                padding: "9px 14px", borderRadius: 9,
                border: "1px solid rgba(220,38,38,0.30)", background: "white",
                color: "#B91C1C", fontSize: 12.5, fontWeight: 600,
                cursor: busy ? "wait" : "pointer", fontFamily: "inherit",
              }}>
              Supprimer
            </button>
          ) : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose} disabled={busy}
              style={{
                padding: "9px 14px", borderRadius: 9,
                border: "1px solid #E5E7EB", background: "white",
                color: "#374151", fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              Annuler
            </button>
            <button type="button" onClick={submit} disabled={!canSave}
              style={{
                padding: "9px 16px", borderRadius: 9,
                border: "none", color: "white",
                background: busy ? "#C4B6E0"
                  : canSave ? "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)"
                  : "#C4B6E0",
                fontSize: 13, fontWeight: 700,
                cursor: canSave ? "pointer" : "not-allowed",
                fontFamily: "inherit",
              }}>
              {busy ? "Enregistrement…" : mode === "create" ? "Créer la zone" : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
