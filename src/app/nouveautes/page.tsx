"use client"

/**
 * /nouveautes — page changelog produit lisible par tout user
 * authentifié (workspace ou organisation, peu importe).
 *
 * Layout : onglets par zone (Tout + une tab par zone touchée par au
 * moins une update + Général pour les annonces sans zone) + cards
 * repliables. Les cards sont fermées par défaut sauf la première
 * de la liste filtrée — l'utilisateur balaye vite, ouvre ce qui
 * l'intéresse. Plus de scroll long.
 *
 * Mark-read auto au mount pour chaque update non-lue : la pastille
 * violette de la sidebar disparaîtra au prochain poll (60s).
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { LazyMotion, domAnimation, m, AnimatePresence } from "framer-motion"
import { renderMarkdown } from "@/lib/markdown"
import { AFFECTED_PATH_OPTIONS } from "@/lib/affected-paths"
import { getSupabase } from "@/lib/supabase"
import type { AppUpdateCategory } from "@/lib/database.types"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

interface UpdateRow {
  id: string
  title: string
  body: string
  category: AppUpdateCategory
  published_at: string | null
  affected_paths: string[]
  is_read: boolean
}

const CATEGORY_META: Record<AppUpdateCategory, { label: string; color: string; bg: string }> = {
  feature:   { label: "Nouveauté",  color: "var(--nw-success)", bg: "rgba(34,197,94,0.10)" },
  fix:       { label: "Correctif",  color: "#0369A1", bg: "rgba(3,105,161,0.10)" },
  important: { label: "Important",  color: "var(--nw-warn)", bg: "rgba(245,158,11,0.10)" },
  announce:  { label: "Annonce",    color: "var(--nw-primary)", bg: "rgba(124,99,200,0.10)" },
}

const ALL_TAB = "__all__"
const GENERAL_TAB = "__general__"

export default function NouveautesPage() {
  const [items, setItems] = useState<UpdateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>(ALL_TAB)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [backHref, setBackHref] = useState<string>("/workspace")

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const sb = getSupabase()
      const { data: { user } } = await sb.auth.getUser()
      if (!user || cancelled) return
      const { data: profile } = await sb
        .from("profiles")
        .select("role, has_sourcing_seat")
        .eq("user_id", user.id)
        .maybeSingle()
      if (cancelled) return
      const ownerNoSeat = profile?.role === "owner" && !profile?.has_sourcing_seat
      setBackHref(ownerNoSeat ? "/organisation" : "/workspace")
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/updates", { cache: "no-store" })
        if (!res.ok) {
          const j = await res.json().catch(() => ({} as { error?: string }))
          throw new Error(j.error ?? `Erreur ${res.status}`)
        }
        const j = await res.json() as { updates: UpdateRow[] }
        if (cancelled) return
        setItems(j.updates)
        // Toutes les cards fermées par défaut — l'utilisateur scanne
        // les titres d'abord, ouvre ce qui l'intéresse.
        // Mark-read auto pour chaque update non-lue.
        for (const u of j.updates) {
          if (!u.is_read) {
            void fetch(`/api/updates/${u.id}/mark-read`, { method: "POST" })
          }
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const formatDate = (iso: string | null) => {
    if (!iso) return ""
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric", month: "long", year: "numeric",
    })
  }

  // Compteurs par tab — uniquement les zones présentes dans la liste
  // (pas de tabs vides). Pastille violette si non-lu dans la zone.
  const tabs = useMemo(() => {
    const out: { key: string; label: string; total: number; unread: number }[] = []
    const pushIf = (key: string, label: string, list: UpdateRow[]) => {
      if (list.length === 0) return
      out.push({
        key, label,
        total: list.length,
        unread: list.filter((u) => !u.is_read).length,
      })
    }
    pushIf(ALL_TAB, "Tout", items)
    pushIf(GENERAL_TAB, "Général", items.filter((u) => u.affected_paths.length === 0))
    for (const opt of AFFECTED_PATH_OPTIONS) {
      pushIf(opt.value, opt.label, items.filter((u) => u.affected_paths.includes(opt.value)))
    }
    return out
  }, [items])

  const filteredItems = useMemo(() => {
    if (activeTab === ALL_TAB) return items
    if (activeTab === GENERAL_TAB) return items.filter((u) => u.affected_paths.length === 0)
    return items.filter((u) => u.affected_paths.includes(activeTab))
  }, [items, activeTab])

  const toggle = (id: string) => {
    setExpandedIds((curr) => {
      const next = new Set(curr)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => setExpandedIds(new Set(filteredItems.map((u) => u.id)))
  const collapseAll = () => setExpandedIds(new Set())

  const empty = !loading && items.length === 0 && !error

  return (
    <LazyMotion features={domAnimation}>
      <main style={{
        maxWidth: 820, margin: "0 auto",
        padding: "32px 24px 80px",
        fontFamily: "var(--font-inter), sans-serif",
      }}>
        <Link
          href={backHref}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 13, fontWeight: 600, color: "var(--nw-text-muted)",
            textDecoration: "none", marginBottom: 18,
            padding: "6px 10px", borderRadius: 8,
            border: "1px solid var(--nw-border)", background: "white",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          {backHref === "/organisation" ? "Retour à mon organisation" : "Retour au workspace"}
        </Link>

        <header style={{ marginBottom: 20 }}>
          <p style={{
            margin: "0 0 6px", fontSize: 11, fontWeight: 700,
            color: "var(--nw-primary)", letterSpacing: "0.10em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
          }}>
            Naywa Studio
          </p>
          <h1 style={{
            margin: 0, fontSize: 32, fontWeight: 800, color: "var(--nw-text)",
            letterSpacing: "-0.02em", lineHeight: 1.15,
          }}>
            Nouveautés
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--nw-text-muted)", lineHeight: 1.55 }}>
            Filtrez par zone, dépliez ce qui vous intéresse. Les nouveautés
            sont marquées comme lues dès que vous arrivez ici.
          </p>
        </header>

        {loading && (
          <p style={{ fontSize: 13, color: "var(--nw-text-muted)" }}>Chargement…</p>
        )}

        {error && (
          <div style={{
            padding: "12px 14px", borderRadius: 10,
            background: "rgba(220,38,38,0.06)",
            border: "1px solid rgba(220,38,38,0.25)",
            color: "var(--nw-danger-strong)", fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {empty && (
          <div style={{
            padding: "32px 20px", borderRadius: 14,
            border: "1px dashed var(--nw-border)",
            background: "var(--nw-surface-muted)",
            textAlign: "center",
          }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--nw-text-body)" }}>
              Aucune nouveauté pour le moment.
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--nw-text-muted)" }}>
              Revenez plus tard — on travaille sur la suite.
            </p>
          </div>
        )}

        {/* Tabs zones */}
        {tabs.length > 1 && (
          <div
            role="tablist"
            style={{
              display: "flex", flexWrap: "wrap", gap: 6,
              marginBottom: 12,
              padding: "6px",
              background: "var(--nw-bg)",
              borderRadius: 12,
              border: "1px solid #EDE7F8",
            }}
          >
            {tabs.map((t) => {
              const active = activeTab === t.key
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(t.key)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 7,
                    padding: "7px 13px",
                    borderRadius: 8,
                    border: "none",
                    background: active ? "white" : "transparent",
                    color: active ? "#5C46A0" : "var(--nw-text-muted)",
                    fontSize: 12.5,
                    fontWeight: active ? 700 : 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    boxShadow: active ? "0 1px 3px rgba(124,99,200,0.18)" : "none",
                    transition: "all 140ms",
                  }}
                >
                  {t.label}
                  <span style={{
                    fontSize: 10.5, fontWeight: 700,
                    color: active ? "var(--nw-primary)" : "var(--nw-text-muted)",
                    background: active ? "rgba(124,99,200,0.10)" : "rgba(107,114,128,0.10)",
                    padding: "1px 7px", borderRadius: 999,
                    minWidth: 18, textAlign: "center",
                  }}>
                    {t.total}
                  </span>
                  {t.unread > 0 && (
                    <span
                      aria-label={`${t.unread} non lu${t.unread > 1 ? "s" : ""}`}
                      style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: "var(--nw-primary)",
                        display: "inline-block",
                      }}
                    />
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Toolbar Tout déplier / Tout replier */}
        {filteredItems.length > 1 && (
          <div style={{
            display: "flex", justifyContent: "flex-end", gap: 6,
            marginBottom: 10,
          }}>
            <button type="button" onClick={expandAll} style={toolbarBtn}>
              Tout déplier
            </button>
            <button type="button" onClick={collapseAll} style={toolbarBtn}>
              Tout replier
            </button>
          </div>
        )}

        {/* Liste des cards (filtrées par tab) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredItems.map((u, idx) => {
            const meta = CATEGORY_META[u.category]
            const expanded = expandedIds.has(u.id)
            return (
              <m.article
                key={u.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE, delay: Math.min(0.1, idx * 0.03) }}
                style={{
                  background: "white",
                  border: "1px solid var(--nw-border-soft)",
                  borderRadius: 14,
                  boxShadow: "0 1px 0 rgba(17,24,39,0.02)",
                  overflow: "hidden",
                }}
              >
                {/* Header cliquable */}
                <button
                  type="button"
                  onClick={() => toggle(u.id)}
                  aria-expanded={expanded}
                  style={{
                    width: "100%",
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "14px 18px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <span style={{
                    flexShrink: 0,
                    fontSize: 10, fontWeight: 700, color: meta.color,
                    background: meta.bg, padding: "3px 8px", borderRadius: 999,
                    letterSpacing: "0.05em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
                  }}>
                    {meta.label}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin: 0, fontSize: 14.5, fontWeight: 700, color: "var(--nw-text)",
                      letterSpacing: "-0.01em", lineHeight: 1.35,
                    }}>
                      {u.title}
                    </p>
                    <p style={{
                      margin: "2px 0 0", fontSize: 11.5, color: "var(--nw-text-muted)",
                    }}>
                      {formatDate(u.published_at)}
                    </p>
                  </div>
                  <m.svg
                    animate={{ rotate: expanded ? 180 : 0 }}
                    transition={{ duration: 0.2, ease: EASE }}
                    width="16" height="16" viewBox="0 0 24 24"
                    fill="none" stroke="var(--nw-text-muted)" strokeWidth="2.2"
                    strokeLinecap="round" strokeLinejoin="round"
                    style={{ flexShrink: 0 }}
                    aria-hidden
                  >
                    <path d="m6 9 6 6 6-6"/>
                  </m.svg>
                </button>

                {/* Body — animation hauteur */}
                <AnimatePresence initial={false}>
                  {expanded && (
                    <m.div
                      key="body"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: EASE }}
                      style={{ overflow: "hidden" }}
                    >
                      <div
                        style={{
                          padding: "14px 18px 18px",
                          fontSize: 14, color: "var(--nw-text-body)",
                          borderTop: "1px solid #F4F0FA",
                        }}
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(u.body) }}
                      />
                    </m.div>
                  )}
                </AnimatePresence>
              </m.article>
            )
          })}
        </div>

        {filteredItems.length === 0 && !loading && items.length > 0 && (
          <p style={{
            margin: "20px 0 0", fontSize: 13, color: "var(--nw-text-muted)",
            textAlign: "center",
          }}>
            Rien dans cette zone pour l&apos;instant.
          </p>
        )}
      </main>
    </LazyMotion>
  )
}

const toolbarBtn: React.CSSProperties = {
  padding: "5px 10px", borderRadius: 7,
  border: "1px solid var(--nw-border)", background: "white",
  color: "var(--nw-text-muted)",
  fontSize: 11.5, fontWeight: 600, cursor: "pointer",
  fontFamily: "var(--font-inter), sans-serif",
}
