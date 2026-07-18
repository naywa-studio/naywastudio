"use client"

/**
 * MatchVivierPanel — petit panneau au clic sur "Matcher le vivier".
 *
 * Choix du MODE (Intelligent / Personnalisé / Complet) + secteurs cibles
 * proposés par Nora (chips éditables). Aucune friction avant ce clic : les
 * secteurs ne sont demandés qu'ici, au moment où l'user veut vraiment matcher.
 *
 *   - Intelligent  : Nora choisit les secteurs (chips affichées, pré-cochées).
 *   - Personnalisé : l'user ajuste les chips (ajoute/retire/crée).
 *   - Complet      : tout le vivier, secteurs ignorés.
 *
 * Les secteurs sont proposés une fois (LLM), puis mémorisés sur la mission
 * (`target_sectors`) → réouvertures instantanées, sans nouvel appel.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { useEscapeKey } from "@/components/ui/useEscapeKey"
import { sectorColors } from "@/lib/sector-color"
import type { Job } from "@/lib/database.types"
import type { MatchMode } from "@/lib/sector-gate"

export function MatchVivierPanel({
  job, onClose, onLaunch,
}: {
  job: Job
  onClose: () => void
  onLaunch: (mode: MatchMode, sectors: string[]) => void
}) {
  useEscapeKey(onClose)

  const [mode, setMode] = useState<MatchMode>("intelligent")
  const [sectors, setSectors] = useState<string[]>(job.target_sectors ?? [])
  const [loadingProposal, setLoadingProposal] = useState(false)
  /** Secteurs de l'org AVEC comptage — on n'affiche que ceux présents dans le
   *  vivier (≥ 1 candidat). La création se fait dans le vivier. */
  const [orgSectors, setOrgSectors] = useState<{ name: string; count: number }[]>([])
  const [showAllPills, setShowAllPills] = useState(false)
  const proposedOnce = useRef((job.target_sectors ?? []).length > 0)

  // Charge la liste des secteurs de l'org (pour les pills).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/sectors")
        const data = await res.json().catch(() => null) as { sectors?: { name: string; count: number }[] } | null
        if (!cancelled && data?.sectors) setOrgSectors(data.sectors.map((s) => ({ name: s.name, count: s.count ?? 0 })))
      } catch { /* best-effort */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Proposition Nora : uniquement si la mission n'a pas déjà des secteurs
  // mémorisés (sinon on réutilise, 0 appel LLM).
  useEffect(() => {
    if (proposedOnce.current) return
    proposedOnce.current = true
    let cancelled = false
    ;(async () => {
      setLoadingProposal(true)
      try {
        const res = await fetch(`/api/jobs/${job.id}/propose-sectors`, { method: "POST" })
        const data = await res.json().catch(() => null) as { sectors?: string[] } | null
        if (!cancelled && data?.sectors) setSectors(data.sectors)
      } catch { /* best-effort — l'user peut saisir les secteurs à la main */ }
      finally { if (!cancelled) setLoadingProposal(false) }
    })()
    return () => { cancelled = true }
  }, [job.id])

  // Éditer les pills = passer automatiquement en "Personnalisé".
  const editSectors = (next: string[]) => {
    setSectors(next)
    if (mode === "intelligent") setMode("personnalise")
  }
  const toggleSector = (name: string) => {
    const on = sectors.some((s) => s.toLowerCase() === name.toLowerCase())
    editSectors(on
      ? sectors.filter((s) => s.toLowerCase() !== name.toLowerCase())
      : [...sectors, name].slice(0, 10))
  }
  const isOn = (name: string) => sectors.some((s) => s.toLowerCase() === name.toLowerCase())
  // Pills à afficher : secteurs PRÉSENTS dans le vivier (≥ 1 CV) + ceux déjà
  // ciblés (au cas où Nora en propose un vide). Ciblés en tête.
  const allPills = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    const push = (n: string) => {
      const k = n.toLowerCase()
      if (seen.has(k)) return
      seen.add(k); out.push(n)
    }
    for (const n of sectors) push(n)                    // ciblés (toujours visibles)
    for (const s of orgSectors) if (s.count > 0) push(s.name) // présents dans le vivier
    return out
  }, [sectors, orgSectors])
  const PILL_FOLD = 12
  const shownPills = showAllPills ? allPills : allPills.slice(0, PILL_FOLD)

  const launch = () => {
    onLaunch(mode, mode === "complet" ? [] : sectors)
    onClose()
  }

  const showSectors = mode !== "complet"

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "rgba(17,24,39,0.40)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: "var(--font-inter), sans-serif",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 460, background: "white",
        borderRadius: 16, padding: 22,
        boxShadow: "0 20px 50px -20px rgba(17,24,39,0.30)",
      }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--nw-text)", letterSpacing: "-0.01em" }}>
          Matcher le vivier
        </h2>
        <p style={{ margin: "4px 0 16px", fontSize: 12.5, color: "var(--nw-text-muted)", lineHeight: 1.5 }}>
          Choisissez l&apos;étendue de la recherche. Plus le périmètre est large, plus l&apos;analyse est longue.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <ModeRow
            active={mode === "intelligent"} onClick={() => setMode("intelligent")}
            label="Intelligent" hint="Nora cible les bons secteurs et écarte les profils hors sujet. Rapide."
          />
          <ModeRow
            active={mode === "personnalise"} onClick={() => setMode("personnalise")}
            label="Personnalisé" hint="Vous ajustez vous-même les secteurs ciblés ci-dessous."
          />
          <ModeRow
            active={mode === "complet"} onClick={() => setMode("complet")}
            label="Complet" hint="Tout le vivier est analysé, sans filtre. Exhaustif mais plus long."
          />
        </div>

        {showSectors && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 9 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "var(--nw-text-muted)", letterSpacing: "0.04em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase" }}>
                Secteurs ciblés
              </p>
              <span style={{ fontSize: 11, color: "var(--nw-text-muted)" }}>· cliquez pour cibler</span>
            </div>
            {loadingProposal ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--nw-primary)", padding: "4px 0" }}>
                <span style={{
                  display: "inline-block", width: 13, height: 13, borderRadius: "50%",
                  border: "2px solid rgba(124,99,200,0.25)", borderTopColor: "var(--nw-primary)",
                  animation: "mvp-spin 0.9s linear infinite",
                }} />
                Nora identifie les secteurs…
                <style>{`@keyframes mvp-spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {allPills.length === 0 && (
                    <span style={{ fontSize: 12, color: "var(--nw-text-muted)" }}>
                      Aucun secteur dans le vivier — classez vos CV ou passez en Complet.
                    </span>
                  )}
                  {shownPills.map((s) => {
                    const on = isOn(s)
                    const col = sectorColors(s)
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSector(s)}
                        aria-pressed={on}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          fontSize: 12.5, fontWeight: 600, fontFamily: "inherit",
                          color: on ? col.text : "var(--nw-text-muted)",
                          background: on ? col.bg : "white",
                          border: `1px solid ${on ? col.border : "var(--nw-border)"}`,
                          borderRadius: 99, padding: "5px 11px", cursor: "pointer",
                          transition: "all 120ms",
                        }}
                      >
                        <span style={{
                          width: 8, height: 8, borderRadius: "50%",
                          background: on ? col.solid : "var(--nw-border)",
                        }} />
                        {s}
                        {on && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={col.text} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        )}
                      </button>
                    )
                  })}
                </div>
                {allPills.length > PILL_FOLD && (
                  <button
                    type="button"
                    onClick={() => setShowAllPills((v) => !v)}
                    style={{
                      marginTop: 8, fontSize: 11.5, fontWeight: 600, color: "var(--nw-primary)",
                      background: "transparent", border: "none", cursor: "pointer",
                      fontFamily: "inherit", padding: 0,
                    }}
                  >
                    {showAllPills ? "Voir moins" : `Voir tous les secteurs (+${allPills.length - PILL_FOLD})`}
                  </button>
                )}
                <p style={{ margin: "10px 0 0", fontSize: 10.5, color: "var(--nw-text-muted)", lineHeight: 1.4 }}>
                  Pour créer un nouveau secteur, rendez-vous dans le Vivier — Nora l&apos;aide à le définir.
                </p>
              </>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontSize: 13, fontWeight: 600, color: "var(--nw-text-muted)",
              background: "white", border: "1px solid var(--nw-border)", borderRadius: 9,
              padding: "9px 15px", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={launch}
            disabled={loadingProposal}
            style={{
              fontSize: 13, fontWeight: 700, color: "white",
              background: loadingProposal ? "var(--nw-primary-200)" : "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
              border: "none", borderRadius: 9, padding: "9px 18px",
              cursor: loadingProposal ? "default" : "pointer", fontFamily: "inherit",
            }}
          >
            Lancer le matching
          </button>
        </div>
      </div>
    </div>
  )
}

function ModeRow({
  active, onClick, label, hint,
}: {
  active: boolean
  onClick: () => void
  label: string
  hint: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "flex-start", gap: 11, width: "100%",
        padding: "11px 13px", borderRadius: 11, textAlign: "left",
        background: active ? "rgba(124,99,200,0.06)" : "white",
        border: `1px solid ${active ? "rgba(124,99,200,0.40)" : "var(--nw-border)"}`,
        cursor: "pointer", fontFamily: "inherit",
        transition: "border-color 120ms, background 120ms",
      }}
    >
      <span style={{
        width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 1,
        border: `2px solid ${active ? "var(--nw-primary)" : "var(--nw-border)"}`,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        {active && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--nw-primary)" }} />}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "var(--nw-text)" }}>{label}</span>
        <span style={{ display: "block", fontSize: 11.5, color: "var(--nw-text-muted)", lineHeight: 1.45, marginTop: 1 }}>{hint}</span>
      </span>
    </button>
  )
}
