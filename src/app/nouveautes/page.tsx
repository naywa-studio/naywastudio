"use client"

/**
 * /nouveautes — page changelog produit lisible par tout user
 * authentifié (workspace ou organisation, peu importe).
 *
 * Au mount, on POST mark-read pour chaque update non-lue : la pastille
 * violette de la sidebar disparaîtra au prochain rafraîchissement
 * (ou via un event broadcast — V2). UX simple : "ouvrir la page = lu".
 *
 * Pas d'images, pas de vidéos. Rendu markdown via lib/markdown.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { LazyMotion, domAnimation, m } from "framer-motion"
import { renderMarkdown } from "@/lib/markdown"
import { getSupabase } from "@/lib/supabase"
import type { AppUpdateCategory } from "@/lib/database.types"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

interface UpdateRow {
  id: string
  title: string
  body: string
  category: AppUpdateCategory
  published_at: string | null
  is_read: boolean
}

const CATEGORY_META: Record<AppUpdateCategory, { label: string; color: string; bg: string }> = {
  feature:   { label: "Nouveauté",  color: "#15803D", bg: "rgba(34,197,94,0.10)" },
  fix:       { label: "Correctif",  color: "#0369A1", bg: "rgba(3,105,161,0.10)" },
  important: { label: "Important",  color: "#B45309", bg: "rgba(245,158,11,0.10)" },
  announce:  { label: "Annonce",    color: "#7C63C8", bg: "rgba(124,99,200,0.10)" },
}

export default function NouveautesPage() {
  const [items, setItems] = useState<UpdateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Le retour pointe sur /workspace par défaut (la majorité des users),
  // sauf pour un owner sans siège alloué — il n'a pas accès au workspace
  // et doit revenir sur /organisation pour ne pas tomber sur une boucle
  // de redirection. On résout le bon href au mount.
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
        // Stamp mark-read pour chaque update non-lue.
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

  const empty = useMemo(() => !loading && items.length === 0 && !error, [loading, items, error])

  return (
    <LazyMotion features={domAnimation}>
      <main style={{
        maxWidth: 760, margin: "0 auto",
        padding: "32px 24px 80px",
        fontFamily: "var(--font-inter), sans-serif",
      }}>
        <Link
          href={backHref}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 13, fontWeight: 600, color: "#6B7280",
            textDecoration: "none", marginBottom: 18,
            padding: "6px 10px", borderRadius: 8,
            border: "1px solid #E5E7EB", background: "white",
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

        <header style={{ marginBottom: 28 }}>
          <p style={{
            margin: "0 0 6px", fontSize: 11, fontWeight: 700,
            color: "#7C63C8", letterSpacing: "0.10em", textTransform: "uppercase",
          }}>
            Naywa Studio
          </p>
          <h1 style={{
            margin: 0, fontSize: 32, fontWeight: 800, color: "#111827",
            letterSpacing: "-0.02em", lineHeight: 1.15,
          }}>
            Nouveautés
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 14.5, color: "#6B7280", lineHeight: 1.6 }}>
            Ce qui a changé sur Naywa récemment. Les nouveautés sont marquées
            comme lues dès que vous arrivez sur cette page.
          </p>
        </header>

        {loading && (
          <p style={{ fontSize: 13, color: "#9CA3AF" }}>Chargement…</p>
        )}

        {error && (
          <div style={{
            padding: "12px 14px", borderRadius: 10,
            background: "rgba(220,38,38,0.06)",
            border: "1px solid rgba(220,38,38,0.25)",
            color: "#B91C1C", fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {empty && (
          <div style={{
            padding: "32px 20px", borderRadius: 14,
            border: "1px dashed #E5E7EB",
            background: "#FAFAFA",
            textAlign: "center",
          }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#374151" }}>
              Aucune nouveauté pour le moment.
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "#9CA3AF" }}>
              Revenez plus tard — on travaille sur la suite.
            </p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {items.map((u, idx) => {
            const meta = CATEGORY_META[u.category]
            return (
              <m.article
                key={u.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE, delay: Math.min(0.15, idx * 0.04) }}
                style={{
                  padding: "20px 22px",
                  borderRadius: 16,
                  background: "white",
                  border: "1px solid #F0ECF8",
                  boxShadow: "0 1px 0 rgba(17,24,39,0.02)",
                }}
              >
                <div style={{
                  display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                  marginBottom: 8,
                }}>
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, color: meta.color,
                    background: meta.bg, padding: "3px 8px", borderRadius: 999,
                    letterSpacing: "0.05em", textTransform: "uppercase",
                  }}>
                    {meta.label}
                  </span>
                  <span style={{ fontSize: 11.5, color: "#9CA3AF" }}>
                    {formatDate(u.published_at)}
                  </span>
                </div>
                <h2 style={{
                  margin: "0 0 10px", fontSize: 18, fontWeight: 700,
                  color: "#111827", letterSpacing: "-0.01em", lineHeight: 1.3,
                }}>
                  {u.title}
                </h2>
                <div
                  style={{ fontSize: 14, color: "#374151" }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(u.body) }}
                />
              </m.article>
            )
          })}
        </div>
      </main>
    </LazyMotion>
  )
}
