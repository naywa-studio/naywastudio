"use client"

/**
 * /admin/maj — CRUD des nouveautés Naywa.
 *
 * Liste à gauche, éditeur à droite (split 1/2). Pour V1 : une modale
 * pour créer/éditer, preview live du markdown via renderMarkdown.
 */

import { useEffect, useState } from "react"
import { LazyMotion, domAnimation, m } from "framer-motion"
import { renderMarkdown } from "@/lib/markdown"
import type { AppUpdateCategory } from "@/lib/database.types"

interface Row {
  id: string
  title: string
  body: string
  category: AppUpdateCategory
  published_at: string | null
  created_at: string
  updated_at: string
}

const CATEGORIES: { value: AppUpdateCategory; label: string; color: string }[] = [
  { value: "feature",   label: "Nouveauté", color: "#15803D" },
  { value: "fix",       label: "Correctif", color: "#0369A1" },
  { value: "important", label: "Important", color: "#B45309" },
  { value: "announce",  label: "Annonce",   color: "#7C63C8" },
]

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

export default function AdminMajPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Row | "new" | null>(null)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/maj", { cache: "no-store" })
      const j = await res.json() as { updates: Row[] }
      setRows(j.updates ?? [])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void fetchAll() }, [])

  const togglePublish = async (row: Row) => {
    const action = row.published_at ? { unpublish: true } : { publish: true }
    await fetch(`/api/admin/maj/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    })
    void fetchAll()
  }

  const remove = async (row: Row) => {
    if (!confirm(`Supprimer définitivement "${row.title}" ?`)) return
    await fetch(`/api/admin/maj/${row.id}`, { method: "DELETE" })
    void fetchAll()
  }

  return (
    <LazyMotion features={domAnimation}>
      <main style={{
        maxWidth: 1200, margin: "0 auto",
        padding: "32px 24px 80px",
      }}>
        <header style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 24,
        }}>
          <div>
            <p style={{
              margin: "0 0 6px", fontSize: 11, fontWeight: 700,
              color: "#7C63C8", letterSpacing: "0.10em", textTransform: "uppercase",
            }}>
              Console admin · Nouveautés
            </p>
            <h1 style={{
              margin: 0, fontSize: 28, fontWeight: 800, color: "#111827",
              letterSpacing: "-0.02em",
            }}>
              Publier les nouveautés
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setEditing("new")}
            style={{
              padding: "10px 16px", borderRadius: 10,
              border: "none",
              background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
              color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: "0 6px 18px -8px rgba(124,99,200,0.55)",
            }}
          >
            + Publier une nouveauté
          </button>
        </header>

        {loading ? (
          <p style={{ fontSize: 13, color: "#9CA3AF" }}>Chargement…</p>
        ) : rows.length === 0 ? (
          <div style={{
            padding: 32, textAlign: "center",
            border: "1px dashed #E5E7EB", borderRadius: 14, background: "#FAFAFA",
          }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#374151" }}>
              Aucune nouveauté pour le moment.
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "#9CA3AF" }}>
              Cliquez sur &ldquo;Publier une nouveauté&rdquo; pour commencer.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {rows.map((row) => {
              const cat = CATEGORIES.find((c) => c.value === row.category)!
              const isDraft = !row.published_at
              return (
                <m.article
                  key={row.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  style={{
                    padding: "14px 16px",
                    background: "white",
                    border: "1px solid #F0ECF8",
                    borderRadius: 12,
                    display: "flex", alignItems: "center", gap: 14,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: cat.color,
                        background: `${cat.color}1A`,
                        padding: "2px 7px", borderRadius: 100,
                        letterSpacing: "0.05em", textTransform: "uppercase",
                      }}>
                        {cat.label}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        color: isDraft ? "#9CA3AF" : "#15803D",
                        background: isDraft ? "#F3F4F6" : "rgba(34,197,94,0.10)",
                        padding: "2px 7px", borderRadius: 100,
                        letterSpacing: "0.05em", textTransform: "uppercase",
                      }}>
                        {isDraft ? "Brouillon" : "Publié"}
                      </span>
                    </div>
                    <p style={{
                      margin: 0, fontSize: 14, fontWeight: 700, color: "#111827",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {row.title}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" onClick={() => setEditing(row)} style={smallBtnGhost}>
                      Éditer
                    </button>
                    <button type="button" onClick={() => void togglePublish(row)} style={smallBtnGhost}>
                      {isDraft ? "Publier" : "Dépublier"}
                    </button>
                    <button type="button" onClick={() => void remove(row)} style={{ ...smallBtnGhost, color: "#B91C1C" }}>
                      Supprimer
                    </button>
                  </div>
                </m.article>
              )
            })}
          </div>
        )}

        {editing && (
          <EditModal
            initial={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); void fetchAll() }}
          />
        )}
      </main>
    </LazyMotion>
  )
}

function EditModal({
  initial, onClose, onSaved,
}: {
  initial: Row | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? "")
  const [body, setBody] = useState(initial?.body ?? "")
  const [category, setCategory] = useState<AppUpdateCategory>(initial?.category ?? "feature")
  const [publishNow, setPublishNow] = useState(!!initial?.published_at)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setBusy(true); setError(null)
    try {
      if (initial) {
        // PATCH
        const patch: Record<string, unknown> = { title, body, category }
        if (publishNow && !initial.published_at) patch.publish = true
        if (!publishNow && initial.published_at) patch.unpublish = true
        const r = await fetch(`/api/admin/maj/${initial.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        })
        if (!r.ok) {
          const j = await r.json().catch(() => ({} as { error?: string }))
          throw new Error(j.error ?? `Erreur ${r.status}`)
        }
      } else {
        const r = await fetch("/api/admin/maj", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, body, category, publish_now: publishNow }),
        })
        if (!r.ok) {
          const j = await r.json().catch(() => ({} as { error?: string }))
          throw new Error(j.error ?? `Erreur ${r.status}`)
        }
      }
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(17,24,39,0.40)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{
        width: "100%", maxWidth: 920, maxHeight: "92vh",
        background: "white", borderRadius: 16, padding: 24,
        overflow: "auto",
        fontFamily: "var(--font-inter), sans-serif",
        boxShadow: "0 24px 64px -24px rgba(17,24,39,0.30)",
      }}>
        <header style={{ marginBottom: 18 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#7C63C8", letterSpacing: "0.10em", textTransform: "uppercase" }}>
            {initial ? "Éditer" : "Nouvelle"}
          </p>
          <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800, color: "#111827", letterSpacing: "-0.01em" }}>
            {initial ? "Éditer la nouveauté" : "Publier une nouveauté"}
          </h2>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Form */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <Label>Titre</Label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Templates de CV anonymisé : 4 styles disponibles"
                maxLength={200}
                style={inputStyle}
              />
            </div>
            <div>
              <Label>Catégorie</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as AppUpdateCategory)}
                style={inputStyle}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Contenu (markdown)</Label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={"Vous pouvez désormais choisir parmi 4 templates pour vos CV anonymisés :\n\n- **Classique** : sobre, mono-colonne\n- **Compact 2 colonnes** : sidebar + parcours\n- **Exécutif** : aéré, gros titre\n- **Bento** : grille moderne\n\nDisponible sur chaque fiche match."}
                maxLength={8000}
                rows={14}
                style={{
                  ...inputStyle,
                  fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
                  fontSize: 12.5,
                  resize: "vertical",
                  minHeight: 220,
                }}
              />
              <details style={{ marginTop: 8 }}>
                <summary style={{
                  cursor: "pointer", fontSize: 11.5, fontWeight: 600,
                  color: "#7C63C8", userSelect: "none",
                }}>
                  Syntaxe disponible (cliquez pour déplier)
                </summary>
                <div style={{
                  marginTop: 8, padding: "10px 12px", borderRadius: 8,
                  background: "#F8F6FF", border: "1px solid #EDE7F8",
                  fontSize: 11.5, color: "#4B5563", lineHeight: 1.7,
                  fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
                }}>
                  <div><b>Texte</b> : <code>**gras**</code>, <code>*italique*</code>, <code>`code`</code>, <code>[texte](https://…)</code></div>
                  <div><b>Liste</b> : ligne commençant par <code>- </code></div>
                  <div><b>Titre</b> : <code>## Mon titre</code> (barre violette + sparkle)</div>
                  <div style={{ marginTop: 6 }}><b>Pastilles inline</b> : <code>[NOUVEAU]</code>, <code>[FIX]</code>, <code>[AMÉLIORATION]</code>, <code>[ATTENTION]</code>, <code>[BETA]</code></div>
                  <div style={{ marginTop: 6 }}><b>CTA bouton</b> : <code>:::cta /workspace/vivier|Ouvrir le vivier:::</code></div>
                  <div style={{ marginTop: 6 }}><b>Callouts</b> (boîtes colorées, sur plusieurs lignes) :</div>
                  <pre style={{ margin: "4px 0 0", fontSize: 11, whiteSpace: "pre-wrap" }}>{`:::tip
Astuce pour mieux utiliser cette feature.
:::

:::info
Information neutre, contexte.
:::

:::warning
Attention, action requise.
:::

:::success
Confirmation positive.
:::`}</pre>
                </div>
              </details>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={publishNow}
                onChange={(e) => setPublishNow(e.target.checked)}
                style={{ accentColor: "#7C63C8" }}
              />
              <span style={{ fontSize: 13, color: "#374151" }}>
                Publier maintenant (visible immédiatement par les utilisateurs)
              </span>
            </label>
            {error && <p style={{ margin: 0, fontSize: 12, color: "#B91C1C" }}>{error}</p>}
          </div>

          {/* Preview */}
          <div>
            <Label>Aperçu</Label>
            <div style={{
              padding: 18, background: "#FAFAFA",
              border: "1px solid #F0ECF8", borderRadius: 12,
              minHeight: 320,
            }}>
              {title.trim() === "" && body.trim() === "" ? (
                <p style={{ margin: 0, fontSize: 12.5, color: "#9CA3AF", fontStyle: "italic" }}>
                  L&apos;aperçu apparaîtra ici…
                </p>
              ) : (
                <>
                  <h3 style={{
                    margin: "0 0 10px", fontSize: 17, fontWeight: 700,
                    color: "#111827", letterSpacing: "-0.01em", lineHeight: 1.3,
                  }}>
                    {title || "(sans titre)"}
                  </h3>
                  <div
                    style={{ fontSize: 13.5, color: "#374151" }}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button type="button" onClick={onClose} disabled={busy} style={smallBtnGhost}>
            Annuler
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || title.trim() === "" || body.trim() === ""}
            style={{
              padding: "10px 16px", borderRadius: 10,
              border: "none", color: "white",
              background: busy
                ? "#C4B6E0"
                : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
              fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer",
              fontFamily: "inherit",
              opacity: title.trim() === "" || body.trim() === "" ? 0.5 : 1,
            }}
          >
            {busy ? "Enregistrement…" : initial ? "Enregistrer" : "Créer"}
          </button>
        </div>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display: "block", marginBottom: 5,
      fontSize: 11.5, fontWeight: 700, color: "#6B7280",
      letterSpacing: "0.03em",
    }}>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px",
  borderRadius: 8, border: "1.5px solid #E5E7EB",
  fontSize: 13.5, color: "#111827",
  outline: "none", transition: "border-color 150ms",
  fontFamily: "var(--font-inter), sans-serif",
  boxSizing: "border-box",
}

const smallBtnGhost: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 8,
  border: "1px solid #E5E7EB", background: "white",
  color: "#374151",
  fontSize: 12.5, fontWeight: 600, cursor: "pointer",
  fontFamily: "var(--font-inter), sans-serif",
  whiteSpace: "nowrap",
}
