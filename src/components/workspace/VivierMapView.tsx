"use client"

/**
 * VivierMapView — vue "Carte" du vivier.
 *
 * Deux niveaux de lecture :
 *   - MACRO : seulement les zones colorées (atlas du vivier). Clic sur
 *             une zone → drill-in.
 *   - ZOOM  : la zone cliquée s'agrandit en plein conteneur, fond gradient
 *             à la teinte secteur, et les candidats du secteur apparaissent
 *             en cartes (primaires + hybrides). Clic carte = nav fiche.
 *
 * Les hybrides apparaissent dans CHAQUE zone qu'ils touchent et portent un
 * badge "+Autre secteur →" pour sauter au zoom de l'autre zone.
 *
 * Pas de DB / pas de filtre interne : on consomme directement la liste
 * `candidates` filtrée par la page parente (qui gère search + filtres).
 */

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { m, AnimatePresence, LayoutGroup } from "framer-motion"
import type { Candidate } from "@/lib/database.types"
import { buildClusters, candidateClusters, hsl, type VivierCluster } from "@/lib/vivier-clusters"
import { candidateRefLabel } from "@/lib/candidate-ref"
import NoraLoader from "@/components/workspace/NoraLoader"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]
const SPRING = { type: "spring" as const, stiffness: 220, damping: 28, mass: 0.9 }

export default function VivierMapView({
  candidates,
  onClusteringDone,
}: {
  candidates: Candidate[]
  /** Appelé après un passage de clustering réussi pour que le parent
   *  recharge ses données — la carte se redessine alors avec les nouveaux
   *  cluster_assignments. */
  onClusteringDone?: () => void
}) {
  const clusters = useMemo(() => buildClusters(candidates), [candidates])
  const [zoomedId, setZoomedId] = useState<string | null>(null)

  // État du clustering : busy = appel API en cours ; error = message à
  // afficher si rate. Pas de cache — le parent rafraîchit après ok.
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const triggerRunRef = useRef(false)
  const everClassified = candidates.some((c) => (c.cluster_assignments ?? []).length > 0)

  const runClustering = async () => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/vivier/cluster`, { method: "POST" })
      const data = await res.json().catch(() => null) as { error?: string; message?: string } | null
      if (!res.ok) throw new Error(data?.message ?? data?.error ?? `HTTP ${res.status}`)
      onClusteringDone?.()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Auto-déclenche au premier passage si aucun candidat n'a jamais été
  // classé. Évite un état vide intimidant au premier arrivée sur la Carte.
  useEffect(() => {
    if (triggerRunRef.current) return
    if (busy) return
    if (candidates.length === 0) return
    if (everClassified) return
    triggerRunRef.current = true
    void runClustering()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates.length, everClassified])

  const zoomed = zoomedId ? clusters.find((c) => c.id === zoomedId) ?? null : null

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Toolbar — état + bouton "Réorganiser avec Nora" */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap",
      }}>
        <p style={{ margin: 0, fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>
          {everClassified
            ? "Carte structurée par Nora à partir de vos candidats."
            : "Lancez une analyse pour que Nora regroupe les profils en secteurs cohérents."}
        </p>
        <button
          onClick={runClustering}
          disabled={busy}
          style={{
            fontFamily: "inherit", fontSize: 12, fontWeight: 700,
            color: "white",
            padding: "7px 14px", borderRadius: 9,
            background: busy
              ? "rgba(124,99,200,0.5)"
              : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
            border: "none",
            cursor: busy ? "wait" : "pointer",
            boxShadow: busy ? "none" : "0 6px 16px -8px rgba(124,99,200,0.5)",
          }}
        >
          {busy ? "Analyse en cours…" : everClassified ? "✦ Réorganiser avec Nora" : "✦ Analyser le vivier"}
        </button>
      </div>

      {error && (
        <div style={{
          padding: "9px 12px", fontSize: 12, color: "#B91C1C",
          background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.25)",
          borderRadius: 9,
        }}>
          ⚠ {error}
        </div>
      )}

      {busy ? (
        <div style={{
          background: "white", border: "1px solid #F0ECF8", borderRadius: 14,
          padding: 32, minHeight: 320,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <NoraLoader label="Nora analyse votre vivier" />
        </div>
      ) : clusters.length === 0 ? (
        <div style={{
          padding: "60px 24px", textAlign: "center",
          background: "white", border: "1px dashed #E5E7EB", borderRadius: 14,
          color: "#6B7280", fontSize: 14,
        }}>
          Aucun candidat ne correspond.
        </div>
      ) : (
        <LayoutGroup>
          <AnimatePresence mode="wait" initial={false}>
            {!zoomed ? (
              <MacroMap key="macro" clusters={clusters} onZoom={setZoomedId} />
            ) : (
              <SectorZoomView
                key={`zoom-${zoomed.id}`}
                cluster={zoomed}
                clusters={clusters}
                onBack={() => setZoomedId(null)}
                onJumpToCluster={setZoomedId}
              />
            )}
          </AnimatePresence>
        </LayoutGroup>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * MacroMap — zones colorées uniquement
 * ────────────────────────────────────────────────────────────────────────── */

function MacroMap({ clusters, onZoom }: { clusters: VivierCluster[]; onZoom: (id: string) => void }) {
  const W = 900
  const H = 580
  // Pas de overflow:hidden sur le wrapper — sinon les gradients qui touchent
  // les bords se font couper rectilignement (« délimitation » au-dessus de la
  // zone). On laisse les halos déborder en douceur.

  return (
    <m.div
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.99 }}
      transition={{ duration: 0.4, ease: EASE }}
      style={{ position: "relative", padding: "20px 0" }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" style={{ display: "block", overflow: "visible" }}>
        <defs>
          {clusters.map((c) => (
            <radialGradient key={c.id} id={`grad-macro-${c.id}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%"  stopColor={hsl(c.hue, 78, 72)} stopOpacity={0.65} />
              <stop offset="65%" stopColor={hsl(c.hue, 65, 80)} stopOpacity={0.30} />
              <stop offset="100%" stopColor={hsl(c.hue, 55, 85)} stopOpacity={0} />
            </radialGradient>
          ))}
        </defs>
        {clusters.map((c) => (
          <circle
            key={c.id}
            cx={c.cx * W}
            cy={c.cy * H}
            r={c.radius * Math.min(W, H) * 1.25}
            fill={`url(#grad-macro-${c.id})`}
          />
        ))}
      </svg>

      {/* Surcouche interactive — wrapper positionné + bouton motion à
          l'intérieur. Le wrapper porte le translate(-50%, -50%) qui centre
          la zone ; le motion-button ne gère QUE hover/tap pour que la
          scale n'écrase pas la translate. */}
      <div style={{ position: "absolute", inset: 0 }}>
        {clusters.map((c) => {
          const sizePx = c.radius * 540
          return (
            <div
              key={c.id}
              style={{
                position: "absolute",
                left: `${c.cx * 100}%`,
                top: `${c.cy * 100}%`,
                width: sizePx, height: sizePx,
                transform: "translate(-50%, -50%)",
                pointerEvents: "auto",
              }}
            >
              <m.button
                layoutId={`zone-${c.id}`}
                onClick={() => onZoom(c.id)}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.97 }}
                transition={SPRING}
                style={{
                  width: "100%", height: "100%",
                  borderRadius: "50%",
                  background: `radial-gradient(closest-side, ${hsl(c.hue, 70, 90)}66, ${hsl(c.hue, 60, 95)}11 70%, transparent 90%)`,
                  border: "none",
                  cursor: "pointer",
                  color: hsl(c.hue, 60, 25),
                  fontFamily: "inherit",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  padding: 0, transformOrigin: "center center",
                }}
                aria-label={`Explorer le secteur ${c.label} (${c.total} candidats)`}
              >
                <span style={{
                  fontSize: Math.max(13, sizePx / 13),
                  fontWeight: 800, letterSpacing: "0.02em", textTransform: "uppercase",
                  textShadow: "0 1px 0 rgba(255,255,255,0.6)",
                  pointerEvents: "none", textAlign: "center", padding: "0 8%",
                }}>
                  {c.label}
                </span>
                <span style={{
                  fontSize: Math.max(10, sizePx / 22),
                  fontWeight: 700, color: hsl(c.hue, 45, 38),
                  opacity: 0.85, marginTop: 4, pointerEvents: "none",
                }}>
                  {c.total} profil{c.total > 1 ? "s" : ""}
                </span>
              </m.button>
            </div>
          )
        })}
      </div>

      <m.p
        initial={{ opacity: 0 }} animate={{ opacity: 0.7 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.4 }}
        style={{
          position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)",
          margin: 0, fontSize: 11, color: "#9CA3AF", fontStyle: "italic",
          pointerEvents: "none",
        }}
      >
        Cliquez une zone pour explorer ses profils.
      </m.p>
    </m.div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * SectorZoomView — drill-in
 * ────────────────────────────────────────────────────────────────────────── */

function SectorZoomView({
  cluster, clusters, onBack, onJumpToCluster,
}: {
  cluster: VivierCluster
  clusters: VivierCluster[]
  onBack: () => void
  onJumpToCluster: (id: string) => void
}) {
  const primaries = cluster.primary
  const hybrids   = cluster.secondary

  return (
    <m.div
      layoutId={`zone-${cluster.id}`}
      transition={SPRING}
      style={{
        position: "relative",
        background: `radial-gradient(120% 100% at 50% 0%, ${hsl(cluster.hue, 70, 92)} 0%, ${hsl(cluster.hue, 55, 97)} 50%, white 100%)`,
        border: `1px solid ${hsl(cluster.hue, 55, 82)}`,
        borderRadius: 22,
        padding: "26px 28px 32px",
        overflow: "hidden",
        boxShadow: `0 12px 40px ${hsl(cluster.hue, 50, 60)}26`,
      }}
    >
      <m.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, ease: EASE, delay: 0.1 }}
        style={{
          position: "absolute", top: -120, left: "50%", transform: "translateX(-50%)",
          width: 700, height: 400, borderRadius: "50%",
          background: `radial-gradient(closest-side, ${hsl(cluster.hue, 75, 80)}55, transparent 70%)`,
          filter: "blur(40px)", pointerEvents: "none",
        }}
      />

      <m.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE, delay: 0.15 }}
        style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 22 }}
      >
        <button
          onClick={onBack}
          style={{
            fontFamily: "inherit", fontSize: 12, fontWeight: 700,
            color: hsl(cluster.hue, 50, 35),
            background: "rgba(255,255,255,0.7)",
            border: `1px solid ${hsl(cluster.hue, 55, 80)}`,
            borderRadius: 100, padding: "7px 14px", cursor: "pointer",
            backdropFilter: "blur(8px)",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}
        >
          ← Retour à la carte
        </button>

        <div style={{ textAlign: "right" }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: hsl(cluster.hue, 50, 50), letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Secteur
          </p>
          <h2 style={{ margin: "2px 0 0", fontSize: 22, fontWeight: 800, color: hsl(cluster.hue, 60, 28), letterSpacing: "-0.01em" }}>
            {cluster.label}
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: hsl(cluster.hue, 35, 45) }}>
            {cluster.total} profil{cluster.total > 1 ? "s" : ""}
            {hybrids.length > 0 && <> · <strong>{hybrids.length}</strong> hybride{hybrids.length > 1 ? "s" : ""}</>}
          </p>
        </div>
      </m.div>

      {cluster.total === 0 && (
        <p style={{ margin: "40px 0", fontSize: 13, color: "#9CA3AF", textAlign: "center" }}>
          Aucun candidat dans ce secteur.
        </p>
      )}

      <div style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 12,
      }}>
        {primaries.map((c, i) => (
          <CandidateCardLight
            key={c.id}
            candidate={c}
            index={i}
            cluster={cluster}
            clusters={clusters}
            onJumpToCluster={onJumpToCluster}
          />
        ))}
        {hybrids.length > 0 && primaries.length > 0 && (
          <m.div
            initial={{ opacity: 0 }} animate={{ opacity: 0.6 }}
            transition={{ duration: 0.35, ease: EASE, delay: 0.1 + primaries.length * 0.03 }}
            style={{
              gridColumn: "1 / -1",
              display: "flex", alignItems: "center", gap: 10, margin: "14px 0 4px",
              fontSize: 10, fontWeight: 700, color: hsl(cluster.hue, 35, 45),
              letterSpacing: "0.08em", textTransform: "uppercase",
            }}
          >
            <span style={{ flex: 1, height: 1, background: hsl(cluster.hue, 35, 75) }} />
            Profils hybrides
            <span style={{ flex: 1, height: 1, background: hsl(cluster.hue, 35, 75) }} />
          </m.div>
        )}
        {hybrids.map((c, i) => (
          <CandidateCardLight
            key={`h-${c.id}`}
            candidate={c}
            index={primaries.length + i}
            cluster={cluster}
            clusters={clusters}
            onJumpToCluster={onJumpToCluster}
            isHybridContext
          />
        ))}
      </div>
    </m.div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Carte candidat — Link direct vers /workspace/vivier/[id]
 * ────────────────────────────────────────────────────────────────────────── */

function CandidateCardLight({
  candidate: c, index, cluster, clusters, onJumpToCluster, isHybridContext = false,
}: {
  candidate: Candidate
  index: number
  cluster: VivierCluster
  clusters: VivierCluster[]
  onJumpToCluster: (id: string) => void
  isHybridContext?: boolean
}) {
  const initials = (c.full_name ?? c.cv_file_name ?? "?")
    .split(" ").slice(0, 2).map((s) => s[0] ?? "").join("").toUpperCase() || "?"

  // Pour l'hybride contexte : on cherche l'autre famille macro du candidat.
  // candidateClusters() applique déjà la consolidation : on récupère les
  // labels consolidés, on prend celui ≠ du cluster où on se trouve, puis
  // on retrouve le VivierCluster correspondant (id = slug du label).
  const { primary: primaryLabel, secondary: secondaryLabel } = candidateClusters(c)
  const otherLabel = isHybridContext
    ? (primaryLabel !== cluster.label ? primaryLabel : secondaryLabel)
    : null
  const otherCluster = otherLabel
    ? clusters.find((cc) => cc.label === otherLabel) ?? null
    : null

  const yearsExperience = c.years_experience ?? null
  const title = c.current_title ?? "—"
  const company = c.current_company

  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay: 0.18 + Math.min(index * 0.025, 0.25) }}
      whileHover={{ y: -2, boxShadow: `0 12px 24px ${hsl(cluster.hue, 50, 60)}22` }}
      style={{ position: "relative" }}
    >
      <Link
        href={`/workspace/vivier/${c.id}`}
        style={{
          display: "block",
          position: "relative",
          textAlign: "left", textDecoration: "none", cursor: "pointer", fontFamily: "inherit",
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(10px)",
          border: `1px solid ${hsl(cluster.hue, 40, 86)}`,
          borderRadius: 14,
          padding: "14px 16px 14px 20px",
          overflow: "hidden",
          boxShadow: "0 1px 2px rgba(17,24,39,0.04)",
          color: "inherit",
        }}
      >
        {/* Bande verticale couleur secteur — bicolore en dégradé si profil
            hybride, pour qu'on voie d'un coup d'œil les deux teintes du
            candidat. La couleur du secteur où on se trouve reste en haut. */}
        <span style={{
          position: "absolute", top: 0, bottom: 0, left: 0, width: 4,
          background: isHybridContext && otherCluster
            ? `linear-gradient(180deg, ${hsl(cluster.hue, 60, 55)} 0%, ${hsl(otherCluster.hue, 60, 55)} 100%)`
            : hsl(cluster.hue, 60, 55),
        }} />

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 32, height: 32, borderRadius: "50%",
            background: hsl(cluster.hue, 70, 92),
            color: hsl(cluster.hue, 60, 30),
            fontSize: 11.5, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            {initials}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.full_name ?? "Nom à compléter"}
            </div>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.04em", fontFamily: "var(--font-space-grotesk), monospace" }}>
              {candidateRefLabel(c.id)}
            </div>
          </div>
          {isHybridContext && otherCluster && (
            <span
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onJumpToCluster(otherCluster.id)
              }}
              role="button"
              tabIndex={0}
              style={{
                fontSize: 10, fontWeight: 700,
                color: hsl(otherCluster.hue, 55, 38),
                background: hsl(otherCluster.hue, 70, 95),
                border: `1px solid ${hsl(otherCluster.hue, 50, 80)}`,
                padding: "2px 8px", borderRadius: 100,
                cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 4,
                flexShrink: 0,
              }}
              title={`Voir aussi dans ${otherCluster.label}`}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: hsl(otherCluster.hue, 60, 55) }} />
              {otherCluster.label.split(" ")[0]} →
            </span>
          )}
        </div>

        <div style={{ fontSize: 12, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingLeft: 42, marginTop: 6 }}>
          {title}{company ? ` · ${company}` : ""}
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", paddingLeft: 42, fontSize: 10.5, color: "#9CA3AF", marginTop: 3 }}>
          {c.location ? `${c.location} · ` : ""}
          {yearsExperience != null ? `${yearsExperience} an${yearsExperience !== 1 ? "s" : ""} XP` : "XP n/c"}
        </div>

        {c.skills && c.skills.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", paddingLeft: 42, marginTop: 6 }}>
            {c.skills.slice(0, 4).map((s) => (
              <span key={s} style={{
                fontSize: 10, color: hsl(cluster.hue, 35, 38),
                background: hsl(cluster.hue, 60, 95),
                border: `1px solid ${hsl(cluster.hue, 50, 88)}`,
                padding: "2px 8px", borderRadius: 6,
              }}>
                {s}
              </span>
            ))}
          </div>
        )}
      </Link>
    </m.div>
  )
}
