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
import { useLanguage, type Lang } from "@/lib/i18n/LanguageContext"

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

const CATEGORIES: Record<Lang, { value: AppUpdateCategory; label: string; color: string }[]> = {
  fr: [
    { value: "feature",   label: "Nouveauté", color: "#15803D" },
    { value: "fix",       label: "Correctif", color: "#0369A1" },
    { value: "important", label: "Important", color: "#B45309" },
    { value: "announce",  label: "Annonce",   color: "#7C63C8" },
  ],
  en: [
    { value: "feature",   label: "Feature",     color: "#15803D" },
    { value: "fix",       label: "Fix",         color: "#0369A1" },
    { value: "important", label: "Important",   color: "#B45309" },
    { value: "announce",  label: "Announcement", color: "#7C63C8" },
  ],
}

const copy = {
  fr: {
    badge: "Console admin · Nouveautés",
    title: "Publier les nouveautés",
    newUpdate: "+ Publier une nouveauté",
    loading: "Chargement…",
    noUpdatesYet: "Aucune nouveauté pour le moment.",
    clickToStart: "Cliquez sur “Publier une nouveauté” pour commencer.",
    draft: "Brouillon",
    published: "Publié",
    edit: "Éditer",
    publish: "Publier",
    unpublish: "Dépublier",
    delete: "Supprimer",
    deleteConfirm: (title: string) => `Supprimer définitivement "${title}" ?`,
    errorWithStatus: (status: number) => `Erreur ${status}`,
    editEyebrow: "Éditer",
    newEyebrow: "Nouvelle",
    editTitle: "Éditer la nouveauté",
    newTitle: "Publier une nouveauté",
    titleLabel: "Titre",
    titlePlaceholder: "Templates de CV anonymisé : 4 styles disponibles",
    categoryLabel: "Catégorie",
    contentLabel: "Contenu (markdown)",
    contentPlaceholder: "Vous pouvez désormais choisir parmi 4 templates pour vos CV anonymisés :\n\n- **Classique** : sobre, mono-colonne\n- **Compact 2 colonnes** : sidebar + parcours\n- **Exécutif** : aéré, gros titre\n- **Bento** : grille moderne\n\nDisponible sur chaque fiche match.",
    syntaxHelp: "Syntaxe disponible (cliquez pour déplier)",
    syntaxText: "Texte",
    syntaxList: "Liste",
    syntaxListDesc: (code: React.ReactNode) => <>ligne commençant par {code}</>,
    syntaxHeading: "Titre",
    syntaxHeadingDesc: "(barre violette + sparkle)",
    syntaxPills: "Pastilles inline",
    syntaxCta: "CTA bouton",
    syntaxCallouts: "Callouts (boîtes colorées, sur plusieurs lignes) :",
    affectedZonesLabel: "Zones impactées (optionnel)",
    affectedZonesHint: "Une pastille violette apparaîtra sur chaque item de menu coché jusqu'à ce que l'utilisateur ouvre « Nouveautés ». Laisser vide = pastille globale uniquement.",
    publishNowLabel: "Publier maintenant (visible immédiatement par les utilisateurs)",
    previewLabel: "Aperçu",
    previewPlaceholder: "L'aperçu apparaîtra ici…",
    noTitle: "(sans titre)",
    cancel: "Annuler",
    saving: "Enregistrement…",
    save: "Enregistrer",
    create: "Créer",
  },
  en: {
    badge: "Admin console · Updates",
    title: "Publish updates",
    newUpdate: "+ Publish an update",
    loading: "Loading…",
    noUpdatesYet: "No updates yet.",
    clickToStart: "Click “Publish an update” to get started.",
    draft: "Draft",
    published: "Published",
    edit: "Edit",
    publish: "Publish",
    unpublish: "Unpublish",
    delete: "Delete",
    deleteConfirm: (title: string) => `Permanently delete "${title}"?`,
    errorWithStatus: (status: number) => `Error ${status}`,
    editEyebrow: "Edit",
    newEyebrow: "New",
    editTitle: "Edit update",
    newTitle: "Publish an update",
    titleLabel: "Title",
    titlePlaceholder: "Anonymized CV templates: 4 styles available",
    categoryLabel: "Category",
    contentLabel: "Content (markdown)",
    contentPlaceholder: "You can now choose from 4 templates for your anonymized CVs:\n\n- **Classic**: sober, single-column\n- **Compact 2-column**: sidebar + timeline\n- **Executive**: airy, large title\n- **Bento**: modern grid\n\nAvailable on every match sheet.",
    syntaxHelp: "Available syntax (click to expand)",
    syntaxText: "Text",
    syntaxList: "List",
    syntaxListDesc: (code: React.ReactNode) => <>line starting with {code}</>,
    syntaxHeading: "Heading",
    syntaxHeadingDesc: "(purple bar + sparkle)",
    syntaxPills: "Inline badges",
    syntaxCta: "CTA button",
    syntaxCallouts: "Callouts (colored boxes, multi-line):",
    affectedZonesLabel: "Affected zones (optional)",
    affectedZonesHint: "A purple dot will appear on each checked menu item until the user opens “Updates”. Leave empty = global dot only.",
    publishNowLabel: "Publish now (immediately visible to users)",
    previewLabel: "Preview",
    previewPlaceholder: "The preview will appear here…",
    noTitle: "(untitled)",
    cancel: "Cancel",
    saving: "Saving…",
    save: "Save",
    create: "Create",
  },
}

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

export default function AdminMajPage() {
  const { lang } = useLanguage()
  const t = copy[lang]
  const categories = CATEGORIES[lang]
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
    if (!confirm(t.deleteConfirm(row.title))) return
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
              {t.badge}
            </p>
            <h1 style={{
              margin: 0, fontSize: 28, fontWeight: 800, color: "#111827",
              letterSpacing: "-0.02em",
            }}>
              {t.title}
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
            {t.newUpdate}
          </button>
        </header>

        {loading ? (
          <p style={{ fontSize: 13, color: "#6B7280" }}>{t.loading}</p>
        ) : rows.length === 0 ? (
          <div style={{
            padding: 32, textAlign: "center",
            border: "1px dashed #E5E7EB", borderRadius: 14, background: "#FAFAFA",
          }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#374151" }}>
              {t.noUpdatesYet}
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "#6B7280" }}>
              {t.clickToStart}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {rows.map((row) => {
              const cat = categories.find((c) => c.value === row.category)!
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
                        color: isDraft ? "#6B7280" : "#15803D",
                        background: isDraft ? "#F3F4F6" : "rgba(34,197,94,0.10)",
                        padding: "2px 7px", borderRadius: 100,
                        letterSpacing: "0.05em", textTransform: "uppercase",
                      }}>
                        {isDraft ? t.draft : t.published}
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
                      {t.edit}
                    </button>
                    <button type="button" onClick={() => void togglePublish(row)} style={smallBtnGhost}>
                      {isDraft ? t.publish : t.unpublish}
                    </button>
                    <button type="button" onClick={() => void remove(row)} style={{ ...smallBtnGhost, color: "#B91C1C" }}>
                      {t.delete}
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
  const { lang } = useLanguage()
  const t = copy[lang]
  const categories = CATEGORIES[lang]
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
          throw new Error(j.error ?? t.errorWithStatus(r.status))
        }
      } else {
        const r = await fetch("/api/admin/maj", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, body, category, publish_now: publishNow, affected_paths: affectedPaths }),
        })
        if (!r.ok) {
          const j = await r.json().catch(() => ({} as { error?: string }))
          throw new Error(j.error ?? t.errorWithStatus(r.status))
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
            {initial ? t.editEyebrow : t.newEyebrow}
          </p>
          <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800, color: "#111827", letterSpacing: "-0.01em" }}>
            {initial ? t.editTitle : t.newTitle}
          </h2>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Form */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <Label>{t.titleLabel}</Label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t.titlePlaceholder}
                maxLength={200}
                style={inputStyle}
              />
            </div>
            <div>
              <Label>{t.categoryLabel}</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as AppUpdateCategory)}
                style={inputStyle}
              >
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t.contentLabel}</Label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t.contentPlaceholder}
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
                  {t.syntaxHelp}
                </summary>
                <div style={{
                  marginTop: 8, padding: "10px 12px", borderRadius: 8,
                  background: "#F8F6FF", border: "1px solid #EDE7F8",
                  fontSize: 11.5, color: "#4B5563", lineHeight: 1.7,
                  fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
                }}>
                  <div><b>{t.syntaxText}</b> : <code>**gras**</code>, <code>*italique*</code>, <code>`code`</code>, <code>[texte](https://…)</code></div>
                  <div><b>{t.syntaxList}</b> : {t.syntaxListDesc(<code>- </code>)}</div>
                  <div><b>{t.syntaxHeading}</b> : <code>## Mon titre</code> {t.syntaxHeadingDesc}</div>
                  <div style={{ marginTop: 6 }}><b>{t.syntaxPills}</b> : <code>[NOUVEAU]</code>, <code>[FIX]</code>, <code>[AMÉLIORATION]</code>, <code>[ATTENTION]</code>, <code>[BETA]</code></div>
                  <div style={{ marginTop: 6 }}><b>{t.syntaxCta}</b> : <code>:::cta /workspace/vivier|Ouvrir le vivier:::</code></div>
                  <div style={{ marginTop: 6 }}><b>{t.syntaxCallouts}</b></div>
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
              <Label>{t.affectedZonesLabel}</Label>
              <p style={{ margin: "0 0 8px", fontSize: 11.5, color: "#6B7280", lineHeight: 1.5 }}>
                {t.affectedZonesHint}
              </p>
              <div style={{
                display: "flex", flexDirection: "column", gap: 8,
                padding: "10px 12px", borderRadius: 10,
                background: "#FAFAFA", border: "1px solid #F0ECF8",
              }}>
                {pathsByGroup.map(([group, opts]) => (
                  <div key={group}>
                    <div style={{
                      fontSize: 10, fontWeight: 700, color: "#7C63C8",
                      letterSpacing: "0.07em", textTransform: "uppercase",
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
                              border: `1px solid ${active ? "#7C63C8" : "#E5E7EB"}`,
                              background: active ? "rgba(124,99,200,0.10)" : "white",
                              color: active ? "#5C46A0" : "#4B5563",
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
                style={{ accentColor: "#7C63C8" }}
              />
              <span style={{ fontSize: 13, color: "#374151" }}>
                {t.publishNowLabel}
              </span>
            </label>
            {error && <p style={{ margin: 0, fontSize: 12, color: "#B91C1C" }}>{error}</p>}
          </div>

          {/* Preview */}
          <div>
            <Label>{t.previewLabel}</Label>
            <div style={{
              padding: 18, background: "#FAFAFA",
              border: "1px solid #F0ECF8", borderRadius: 12,
              minHeight: 320,
            }}>
              {title.trim() === "" && body.trim() === "" ? (
                <p style={{ margin: 0, fontSize: 12.5, color: "#6B7280", fontStyle: "italic" }}>
                  {t.previewPlaceholder}
                </p>
              ) : (
                <>
                  <h3 style={{
                    margin: "0 0 10px", fontSize: 17, fontWeight: 700,
                    color: "#111827", letterSpacing: "-0.01em", lineHeight: 1.3,
                  }}>
                    {title || t.noTitle}
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
            {t.cancel}
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
            {busy ? t.saving : initial ? t.save : t.create}
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
