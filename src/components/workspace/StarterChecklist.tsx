"use client"

/**
 * Checklist de démarrage — remplace la modale "visite guidée" (lecture
 * passive) par une progression ACTIVE vers la première valeur du produit.
 *
 * 4 étapes cochées automatiquement sur l'ÉTAT RÉEL du workspace (pas des
 * clics) : CV importés → mission créée → matching lancé → CV anonymisé.
 * Chaque étape non faite est un lien direct vers l'action.
 *
 * Cycle de vie :
 *   - Affichée tant que `profiles.package_sourcing_onboarded_at` est NULL
 *     (même flag que l'ancienne visite guidée — zéro migration).
 *   - 4/4 atteint → on stampe le flag automatiquement : disparition DÉFINITIVE.
 *   - "Masquer" = temporaire (sessionStorage) : la checklist revient à la
 *     prochaine session tant que les 4 étapes ne sont pas faites.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { getSupabase } from "@/lib/supabase"

interface StepState {
  hasCvs: boolean
  hasJob: boolean
  hasMatched: boolean
  hasAnonymized: boolean
}

export function StarterChecklist({ onComplete }: {
  /** Stampe package_sourcing_onboarded_at + refetch le profil. */
  onComplete: () => void
}) {
  const sb = useMemo(() => getSupabase(), [])
  const [steps, setSteps] = useState<StepState | null>(null)
  // "Masquer" ne clôt PAS la checklist (le flag DB n'est stampé qu'à 4/4) —
  // simple repli de session, elle revient à la prochaine visite.
  const [hidden, setHidden] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    try { return sessionStorage.getItem("naywa.starterChecklist.hidden") === "1" } catch { return false }
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [cands, jobs, matched, anon] = await Promise.all([
        sb.from("candidates").select("id", { count: "exact", head: true }),
        sb.from("jobs").select("id", { count: "exact", head: true }),
        sb.from("jobs").select("id", { count: "exact", head: true }).not("matched_at", "is", null),
        sb.from("candidates").select("id", { count: "exact", head: true }).not("anonymized_at", "is", null),
      ])
      if (cancelled) return
      setSteps({
        hasCvs: (cands.count ?? 0) > 0,
        hasJob: (jobs.count ?? 0) > 0,
        hasMatched: (matched.count ?? 0) > 0,
        hasAnonymized: (anon.count ?? 0) > 0,
      })
    })()
    return () => { cancelled = true }
  }, [sb])

  // Clôture DÉFINITIVE (stamp DB) — uniquement à 4/4.
  const markDone = async () => {
    try {
      await fetch("/api/cabinet/package-onboarding-done", { method: "POST" })
    } catch { /* best-effort */ }
    onComplete()
  }

  // Repli TEMPORAIRE ("Masquer") — la checklist reviendra tant que les
  // 4 étapes ne sont pas faites.
  const hide = () => {
    try { sessionStorage.setItem("naywa.starterChecklist.hidden", "1") } catch { /* noop */ }
    setHidden(true)
  }

  // 4/4 → on clôture automatiquement (le flag évite tout re-affichage).
  const allDone = !!steps && steps.hasCvs && steps.hasJob && steps.hasMatched && steps.hasAnonymized
  useEffect(() => {
    if (allDone) void markDone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone])

  if (!steps || allDone || hidden) return null

  const items: Array<{ label: string; done: boolean; href: string; cta: string }> = [
    { label: "Importez vos premiers CVs", done: steps.hasCvs, href: "/workspace/vivier", cta: "Ouvrir le vivier" },
    { label: "Créez votre première mission", done: steps.hasJob, href: "/workspace/missions/new", cta: "Créer une mission" },
    { label: "Lancez un matching", done: steps.hasMatched, href: "/workspace/missions", cta: "Voir mes missions" },
    { label: "Exportez un CV anonymisé", done: steps.hasAnonymized, href: "/workspace/missions", cta: "Choisir un candidat" },
  ]
  const doneCount = items.filter((i) => i.done).length
  // La première étape restante = la prochaine action à faire (mise en avant).
  const nextIdx = items.findIndex((i) => !i.done)

  return (
    <section style={{
      marginBottom: 24,
      background: "white",
      border: "1px solid var(--nw-border-soft)",
      borderRadius: 16,
      padding: "18px 20px",
      boxShadow: "0 4px 14px rgba(124,99,200,0.08)",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--nw-text)", letterSpacing: "-0.01em" }}>
          Bien démarrer avec Nora
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--nw-primary)" }}>
            {doneCount}/4
          </span>
          <button
            type="button"
            onClick={hide}
            title="Masquer pour cette session — la checklist reviendra tant que tout n'est pas fait"
            style={{
              background: "none", border: "none", padding: 0,
              fontSize: 12, color: "var(--nw-text-muted)", cursor: "pointer",
              textDecoration: "underline", fontFamily: "inherit",
            }}
          >
            Masquer
          </button>
        </div>
      </div>

      {/* Barre de progression */}
      <div style={{
        height: 5, borderRadius: 999, background: "rgba(229,231,235,0.7)",
        overflow: "hidden", margin: "10px 0 14px",
      }}>
        <div style={{
          width: `${(doneCount / 4) * 100}%`, height: "100%",
          background: "linear-gradient(90deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
          borderRadius: 999, transition: "width 400ms ease",
        }} />
      </div>

      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
        {items.map((item, i) => {
          const isNext = i === nextIdx
          return (
            <li key={item.label} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 10px", borderRadius: 10,
              background: isNext ? "rgba(124,99,200,0.06)" : "transparent",
              border: isNext ? "1px solid rgba(124,99,200,0.18)" : "1px solid transparent",
            }}>
              {item.done ? (
                <span aria-hidden style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                  background: "rgba(34,197,94,0.12)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--nw-success)"
                    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
              ) : (
                <span aria-hidden style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                  border: `1.5px solid ${isNext ? "var(--nw-primary)" : "var(--nw-border)"}`,
                  color: isNext ? "var(--nw-primary)" : "var(--nw-text-muted)",
                  fontSize: 10.5, fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {i + 1}
                </span>
              )}
              <span style={{
                flex: 1, fontSize: 13,
                fontWeight: item.done ? 500 : 600,
                color: item.done ? "var(--nw-text-muted)" : "var(--nw-text)",
                textDecoration: item.done ? "line-through" : "none",
              }}>
                {item.label}
              </span>
              {!item.done && isNext && (
                <Link href={item.href} style={{
                  fontSize: 12, fontWeight: 700, color: "white",
                  padding: "6px 12px", borderRadius: 8,
                  background: "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
                  textDecoration: "none", whiteSpace: "nowrap",
                }}>
                  {item.cta} →
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
