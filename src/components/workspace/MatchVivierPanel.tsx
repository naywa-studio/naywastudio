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

import { useEffect, useRef, useState } from "react"
import { useEscapeKey } from "@/components/ui/useEscapeKey"
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
  const [newSector, setNewSector] = useState("")
  const proposedOnce = useRef((job.target_sectors ?? []).length > 0)

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

  // Éditer les chips = passer automatiquement en "Personnalisé".
  const editSectors = (next: string[]) => {
    setSectors(next)
    if (mode === "intelligent") setMode("personnalise")
  }
  const removeSector = (name: string) => editSectors(sectors.filter((s) => s !== name))
  const addSector = () => {
    const n = newSector.trim()
    if (!n || sectors.some((s) => s.toLowerCase() === n.toLowerCase())) { setNewSector(""); return }
    editSectors([...sectors, n].slice(0, 8))
    setNewSector("")
  }

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
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#111827", letterSpacing: "-0.01em" }}>
          Matcher le vivier
        </h2>
        <p style={{ margin: "4px 0 16px", fontSize: 12.5, color: "#6B7280", lineHeight: 1.5 }}>
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
            <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Secteurs ciblés
            </p>
            {loadingProposal ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#7C63C8", padding: "4px 0" }}>
                <span style={{
                  display: "inline-block", width: 13, height: 13, borderRadius: "50%",
                  border: "2px solid rgba(124,99,200,0.25)", borderTopColor: "#7C63C8",
                  animation: "mvp-spin 0.9s linear infinite",
                }} />
                Nora identifie les secteurs…
                <style>{`@keyframes mvp-spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {sectors.length === 0 && (
                    <span style={{ fontSize: 12, color: "#9CA3AF" }}>
                      Aucun secteur ciblé — ajoutez-en ou passez en Complet.
                    </span>
                  )}
                  {sectors.map((s) => (
                    <span key={s} style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      fontSize: 12, fontWeight: 600, color: "#6B54B2",
                      background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.25)",
                      borderRadius: 99, padding: "4px 10px",
                    }}>
                      {s}
                      <button
                        type="button"
                        onClick={() => removeSector(s)}
                        aria-label={`Retirer ${s}`}
                        style={{
                          background: "transparent", border: "none", cursor: "pointer",
                          color: "#9C8BD0", fontSize: 13, lineHeight: 1, padding: 0,
                        }}
                      >×</button>
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input
                    value={newSector}
                    onChange={(e) => setNewSector(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSector() } }}
                    placeholder="Ajouter un secteur…"
                    style={{
                      flex: 1, minWidth: 0, fontSize: 12.5, color: "#111827",
                      padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 8,
                      outline: "none", fontFamily: "inherit",
                    }}
                  />
                  <button
                    type="button"
                    onClick={addSector}
                    disabled={!newSector.trim()}
                    style={{
                      fontSize: 13, fontWeight: 700, color: newSector.trim() ? "#7C63C8" : "#C4C4C4",
                      background: "white", border: "1px solid #E5E7EB", borderRadius: 8,
                      padding: "0 12px", cursor: newSector.trim() ? "pointer" : "default",
                      fontFamily: "inherit",
                    }}
                  >+</button>
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontSize: 13, fontWeight: 600, color: "#6B7280",
              background: "white", border: "1px solid #E5E7EB", borderRadius: 9,
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
              background: loadingProposal ? "#C4B6E0" : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
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
        border: `1px solid ${active ? "rgba(124,99,200,0.40)" : "#E5E7EB"}`,
        cursor: "pointer", fontFamily: "inherit",
        transition: "border-color 120ms, background 120ms",
      }}
    >
      <span style={{
        width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 1,
        border: `2px solid ${active ? "#7C63C8" : "#D1D5DB"}`,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        {active && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#7C63C8" }} />}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#111827" }}>{label}</span>
        <span style={{ display: "block", fontSize: 11.5, color: "#6B7280", lineHeight: 1.45, marginTop: 1 }}>{hint}</span>
      </span>
    </button>
  )
}
