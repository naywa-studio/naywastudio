"use client"

/**
 * /admin/maj — CRUD des nouveautés Naywa.
 *
 * Liste à gauche, éditeur à droite (split 1/2). Pour V1 : une modale
 * pour créer/éditer, preview live du markdown via renderMarkdown.
 */

import { useEffect, useMemo, useState } from "react"
import { LazyMotion, domAnimation, m } from "framer-motion"
import { renderMarkdown } from "@/lib/markdown"
import { AFFECTED_PATH_OPTIONS } from "@/lib/affected-paths"
import { useEscapeKey } from "@/components/ui/useEscapeKey"
import type { AppUpdateCategory } from "@/lib/database.types"

interface Row {
  id: string
  title: string
  body: string
  category: AppUpdateCategory
  published_at: string | null
  affected_paths: string[] | null
  created_at: string
  updated_at: string
}

const CATEGORIES: { value: AppUpdateCategory; label: string; color: string }[] = [
  { value: "feature",   label: "Nouveauté", color: "var(--nw-success)" },
  { value: "fix",       label: "Correctif", color: "#0369A1" },
  { value: "important", label: "Important", color: "var(--nw-warn)" },
  { value: "announce",  label: "Annonce",   color: "var(--nw-primary)" },
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
              color: "var(--nw-primary)", letterSpacing: "0.10em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
            }}>
              Console admin · Nouveautés
            </p>
            <h1 style={{
              margin: 0, fontSize: 28, fontWeight: 800, color: "var(--nw-text)",
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
              background: "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
              color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: "0 6px 18px -8px rgba(124,99,200,0.55)",
            }}
          >
            + Publier une nouveauté
          </button>
        </header>

        {loading ? (
          <p style={{ fontSize: 13, color: "var(--nw-text-muted)" }}>Chargement…</p>
        ) : rows.length === 0 ? (
          <div style={{
            padding: 32, textAlign: "center",
            border: "1px dashed var(--nw-border)", borderRadius: 14, background: "var(--nw-surface-muted)",
          }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--nw-text-body)" }}>
              Aucune nouveauté pour le moment.
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--nw-text-muted)" }}>
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
                    border: "1px solid var(--nw-border-soft)",
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
                        letterSpacing: "0.05em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
                      }}>
                        {cat.label}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        color: isDraft ? "var(--nw-text-muted)" : "var(--nw-success)",
                        background: isDraft ? "var(--nw-neutral-100)" : "rgba(34,197,94,0.10)",
                        padding: "2px 7px", borderRadius: 100,
                        letterSpacing: "0.05em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
                      }}>
                        {isDraft ? "Brouillon" : "Publié"}
                      </span>
                    </div>
                    <p style={{
                      margin: 0, fontSize: 14, fontWeight: 700, color: "var(--nw-text)",
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
                    <button type="button" onClick={() => void remove(row)} style={{ ...smallBtnGhost, color: "var(--nw-danger-strong)" }}>
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
  useEscapeKey(onClose)
  const [title, setTitle] = useState(initial?.title ?? "")
  const [body, setBody] = useState(initial?.body ?? "")
  const [category, setCategory] = useState<AppUpdateCategory>(initial?.category ?? "feature")
  const [publishNow, setPublishNow] = useState(!!initial?.published_at)
  const [affectedPaths, setAffectedPaths] = useState<string[]>(initial?.affected_paths ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pathsByGroup = useMemo(() => {
    const groups = new Map<string, typeof AFFECTED_PATH_OPTIONS>()
    for (const opt of AFFECTED_PATH_OPTIONS) {
      const list = groups.get(opt.group) ?? []
      list.push(opt)
      groups.set(opt.group, list)
    }
    return Array.from(groups.entries())
  }, [])

  const togglePath = (path: string) => {
    setAffectedPaths((curr) =>
      curr.includes(path) ? curr.filter((p) => p !== path) : [...curr, path],
    )
  }

  const save = async () => {
    setBusy(true); setError(null)
    try {
      if (initial) {
        // PATCH
        const patch: Record<string, unknown> = { title, body, category, affected_paths: affectedPaths }
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
          body: JSON.stringify({ title, body, category, publish_now: publishNow, affected_paths: affectedPaths }),
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
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "var(--nw-primary)", letterSpacing: "0.10em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase" }}>
            {initial ? "Éditer" : "Nouvelle"}
          </p>
          <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800, color: "var(--nw-text)", letterSpacing: "-0.01em" }}>
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
                  color: "var(--nw-primary)", userSelect: "none",
                }}>
                  Syntaxe disponible (cliquez pour déplier)
                </summary>
                <div style={{
                  marginTop: 8, padding: "10px 12px", borderRadius: 8,
                  background: "var(--nw-bg)", border: "1px solid #EDE7F8",
                  fontSize: 11.5, color: "var(--nw-text-secondary)", lineHeight: 1.7,
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
            <div>
              <Label>Zones impactées (optionnel)</Label>
              <p style={{ margin: "0 0 8px", fontSize: 11.5, color: "var(--nw-text-muted)", lineHeight: 1.5 }}>
                Une pastille violette apparaîtra sur chaque item de menu coché jusqu&apos;à
                ce que l&apos;utilisateur ouvre &laquo;&nbsp;Nouveautés&nbsp;&raquo;. Laisser vide = pastille
                globale uniquement.
              </p>
              <div style={{
                display: "flex", flexDirection: "column", gap: 8,
                padding: "10px 12px", borderRadius: 10,
                background: "var(--nw-surface-muted)", border: "1px solid var(--nw-border-soft)",
              }}>
                {pathsByGroup.map(([group, opts]) => (
                  <div key={group}>
                    <div style={{
                      fontSize: 10, fontWeight: 700, color: "var(--nw-primary)",
                      letterSpacing: "0.07em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
                      marginBottom: 4,
                    }}>
                      {group}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {opts.map((opt) => {
                        const active = affectedPaths.includes(opt.value)
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => togglePath(opt.value)}
                            style={{
                              padding: "5px 10px", borderRadius: 999,
                              border: `1px solid ${active ? "var(--nw-primary)" : "var(--nw-border)"}`,
                              background: active ? "rgba(124,99,200,0.10)" : "white",
                              color: active ? "#5C46A0" : "var(--nw-text-secondary)",
                              fontSize: 12, fontWeight: active ? 700 : 500,
                              cursor: "pointer", fontFamily: "inherit",
                              transition: "all 120ms",
                            }}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={publishNow}
                onChange={(e) => setPublishNow(e.target.checked)}
                style={{ accentColor: "var(--nw-primary)" }}
              />
              <span style={{ fontSize: 13, color: "var(--nw-text-body)" }}>
                Publier maintenant (visible immédiatement par les utilisateurs)
              </span>
            </label>
            {error && <p style={{ margin: 0, fontSize: 12, color: "var(--nw-danger-strong)" }}>{error}</p>}
          </div>

          {/* Preview */}
          <div>
            <Label>Aperçu</Label>
            <div style={{
              padding: 18, background: "var(--nw-surface-muted)",
              border: "1px solid var(--nw-border-soft)", borderRadius: 12,
              minHeight: 320,
            }}>
              {title.trim() === "" && body.trim() === "" ? (
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--nw-text-muted)", fontStyle: "italic" }}>
                  L&apos;aperçu apparaîtra ici…
                </p>
              ) : (
                <>
                  <h3 style={{
                    margin: "0 0 10px", fontSize: 17, fontWeight: 700,
                    color: "var(--nw-text)", letterSpacing: "-0.01em", lineHeight: 1.3,
                  }}>
                    {title || "(sans titre)"}
                  </h3>
                  <div
                    style={{ fontSize: 13.5, color: "var(--nw-text-body)" }}
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
                ? "var(--nw-primary-200)"
                : "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
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
      fontSize: 11.5, fontWeight: 700, color: "var(--nw-text-muted)",
      letterSpacing: "0.03em",
    }}>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px",
  borderRadius: 8, border: "1.5px solid var(--nw-border)",
  fontSize: 13.5, color: "var(--nw-text)",
  outline: "none", transition: "border-color 150ms",
  fontFamily: "var(--font-inter), sans-serif",
  boxSizing: "border-box",
}

const smallBtnGhost: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 8,
  border: "1px solid var(--nw-border)", background: "white",
  color: "var(--nw-text-body)",
  fontSize: 12.5, fontWeight: 600, cursor: "pointer",
  fontFamily: "var(--font-inter), sans-serif",
  whiteSpace: "nowrap",
}
