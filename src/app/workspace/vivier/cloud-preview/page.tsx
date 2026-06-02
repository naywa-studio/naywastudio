"use client"

/**
 * /workspace/vivier/cloud-preview
 *
 * Mockup statique du vivier "nuage" : zones colorées par cluster,
 * candidats positionnés dans ou entre les zones selon leur affinité.
 *
 * 100 % fake data — sert à valider la direction visuelle avant qu'on
 * branche la classification LLM réelle. Aucun appel API, aucune DB.
 */

import { useMemo, useState } from "react"
import { m } from "framer-motion"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

/* ──────────────────────────────────────────────────────────────────────────
 * Fake data — ce que produira plus tard le LLM
 * ────────────────────────────────────────────────────────────────────────── */

interface Cluster {
  id: string
  label: string
  /** Coordonnées normalisées [0..1] du centre dans le viewport. */
  cx: number
  cy: number
  /** Rayon influence en proportion du viewport. */
  radius: number
  /** Couleur primaire HSL (h, s%, l%). */
  hue: number
}

const CLUSTERS: Cluster[] = [
  { id: "data",     label: "Data Engineering",  cx: 0.30, cy: 0.35, radius: 0.30, hue: 265 },
  { id: "backend",  label: "Tech Backend",      cx: 0.55, cy: 0.30, radius: 0.26, hue: 215 },
  { id: "quant",    label: "Quant / Finance",   cx: 0.78, cy: 0.50, radius: 0.22, hue: 305 },
  { id: "etudiants", label: "Étudiants Bac+5",  cx: 0.20, cy: 0.72, radius: 0.20, hue: 175 },
  { id: "devops",   label: "DevOps / SRE",      cx: 0.62, cy: 0.75, radius: 0.22, hue: 35 },
]

interface CvDot {
  id: string
  initials: string
  fullName: string
  title: string
  ref: string
  /** Cluster principal + poids ; cluster secondaire optionnel pour les profils
   *  hybrides. Le LLM produira exactement ces 3 champs côté backend. */
  primary: string
  primaryWeight: number       // 0.5 → 1.0
  secondary?: string
}

const CV_DOTS: CvDot[] = [
  // Data pur
  { id: "1", initials: "AB", fullName: "Achraf Boutaleb",  title: "Senior Data Engineer",      ref: "C-1042", primary: "data", primaryWeight: 1.0 },
  { id: "2", initials: "ML", fullName: "Marie Lefevre",    title: "Data Engineer Spark",       ref: "C-1043", primary: "data", primaryWeight: 0.92 },
  { id: "3", initials: "TR", fullName: "Tom Riberi",       title: "Lead Data Platform",        ref: "C-1044", primary: "data", primaryWeight: 0.88 },
  { id: "4", initials: "SP", fullName: "Sofia Petrenko",   title: "Data Engineer dbt",         ref: "C-1045", primary: "data", primaryWeight: 0.95 },
  // Data ↔ Backend hybride
  { id: "5", initials: "JM", fullName: "Julien Mazars",    title: "Backend + Data ingest",     ref: "C-1046", primary: "data",    primaryWeight: 0.55, secondary: "backend" },
  { id: "6", initials: "EK", fullName: "Elena Kowalski",   title: "Python pipelines",          ref: "C-1047", primary: "data",    primaryWeight: 0.6,  secondary: "backend" },
  // Backend pur
  { id: "7", initials: "RD", fullName: "Rachid Daher",     title: "Senior Backend Go",         ref: "C-1048", primary: "backend", primaryWeight: 1.0 },
  { id: "8", initials: "VC", fullName: "Vincent Caillet",  title: "Backend Node.js",           ref: "C-1049", primary: "backend", primaryWeight: 0.9 },
  { id: "9", initials: "AY", fullName: "Aya Yamamoto",     title: "Backend Kotlin / Java",     ref: "C-1050", primary: "backend", primaryWeight: 0.85 },
  { id: "10", initials: "PG", fullName: "Pierre Galland",  title: "Tech Lead Backend",         ref: "C-1051", primary: "backend", primaryWeight: 1.0 },
  // Backend ↔ DevOps hybride
  { id: "11", initials: "MO", fullName: "Mehdi Ouali",     title: "Backend + Kubernetes",      ref: "C-1052", primary: "backend", primaryWeight: 0.55, secondary: "devops" },
  // Quant pur
  { id: "12", initials: "DL", fullName: "David Lemoine",   title: "Quant Researcher",          ref: "C-1053", primary: "quant",   primaryWeight: 1.0 },
  { id: "13", initials: "NR", fullName: "Naomi Reinhardt", title: "Quant Developer C++",       ref: "C-1054", primary: "quant",   primaryWeight: 0.92 },
  { id: "14", initials: "AB", fullName: "Antonin Berger",  title: "Quant Strategy Python",     ref: "C-1055", primary: "quant",   primaryWeight: 0.88 },
  // Quant ↔ Data hybride
  { id: "15", initials: "LF", fullName: "Léa Faure",       title: "Data + Quant pricing",      ref: "C-1056", primary: "quant",   primaryWeight: 0.55, secondary: "data" },
  // DevOps pur
  { id: "16", initials: "KB", fullName: "Karim Belkacem",  title: "Site Reliability Engineer", ref: "C-1057", primary: "devops",  primaryWeight: 1.0 },
  { id: "17", initials: "AT", fullName: "Anaïs Tessier",   title: "Cloud DevOps AWS",          ref: "C-1058", primary: "devops",  primaryWeight: 0.88 },
  { id: "18", initials: "MN", fullName: "Mathieu Nizet",   title: "Platform Engineer",         ref: "C-1059", primary: "devops",  primaryWeight: 0.82 },
  // Étudiants Bac+5 pur
  { id: "19", initials: "CT", fullName: "Camille Tournier", title: "Étudiant 5A Centrale",     ref: "C-1060", primary: "etudiants", primaryWeight: 1.0 },
  { id: "20", initials: "YO", fullName: "Yann Olivier",    title: "Étudiant 4A Polytechnique", ref: "C-1061", primary: "etudiants", primaryWeight: 0.95 },
  { id: "21", initials: "FH", fullName: "Fatima Hadj",     title: "Étudiante M2 ENS",          ref: "C-1062", primary: "etudiants", primaryWeight: 1.0 },
  { id: "22", initials: "OB", fullName: "Oscar Brun",      title: "Étudiant 5A Telecom",       ref: "C-1063", primary: "etudiants", primaryWeight: 0.85 },
  // Étudiants ↔ Data hybride
  { id: "23", initials: "RS", fullName: "Rania Saïdi",     title: "Étudiante Data 5A",         ref: "C-1064", primary: "etudiants", primaryWeight: 0.55, secondary: "data" },
  { id: "24", initials: "GP", fullName: "Gabriel Praz",    title: "Étudiant DevOps 4A",        ref: "C-1065", primary: "etudiants", primaryWeight: 0.6,  secondary: "devops" },
]

/* ──────────────────────────────────────────────────────────────────────────
 * Helpers — couleur cluster + positionnement
 * ────────────────────────────────────────────────────────────────────────── */

const clusterColor = (hue: number, sat = 65, lit = 60) => `hsl(${hue}, ${sat}%, ${lit}%)`

/** Position d'un CV : centroïde de son cluster primaire si pur, interpolation
 *  pondérée entre les deux centroïdes si hybride. Un petit jitter pseudo-aléatoire
 *  est ajouté pour éviter que les points pur d'un cluster ne s'empilent.
 *  Deterministic — basé sur l'id du CV. */
function positionFor(dot: CvDot) {
  const primary = CLUSTERS.find((c) => c.id === dot.primary)!
  const secondary = dot.secondary ? CLUSTERS.find((c) => c.id === dot.secondary) : null
  const w = dot.primaryWeight
  let x = primary.cx
  let y = primary.cy
  if (secondary) {
    x = primary.cx * w + secondary.cx * (1 - w)
    y = primary.cy * w + secondary.cy * (1 - w)
  }
  // Jitter déterministe basé sur l'id (hash léger) — répartit les points purs.
  const seed = Number(dot.id) || 0
  const angle = (seed * 137.508) * Math.PI / 180   // golden angle
  const radius = primary.radius * 0.42 * Math.sqrt((seed % 7) / 7)
  // Plus on est hybride (w bas), moins on a de jitter (on veut rester
  // proche de la frontière entre les deux clusters).
  const jitterScale = secondary ? 0.4 : 1.0
  x += Math.cos(angle) * radius * jitterScale
  y += Math.sin(angle) * radius * jitterScale
  return { x, y }
}

/** Couleur du dot — mix linéaire entre primary et secondary par leur poids. */
function dotColor(dot: CvDot) {
  const primary = CLUSTERS.find((c) => c.id === dot.primary)!
  if (!dot.secondary) return clusterColor(primary.hue, 55, 55)
  const secondary = CLUSTERS.find((c) => c.id === dot.secondary)!
  // Mix simple sur hue (raccourci visuel — pour V1 ça suffit largement).
  const w = dot.primaryWeight
  const h = primary.hue * w + secondary.hue * (1 - w)
  return clusterColor(h, 55, 55)
}

/* ──────────────────────────────────────────────────────────────────────────
 * Page
 * ────────────────────────────────────────────────────────────────────────── */

export default function VivierCloudPreview() {
  // Filtres possibles (cluster désactivé → ses CVs s'estompent).
  const [activeClusters, setActiveClusters] = useState<Set<string>>(
    () => new Set(CLUSTERS.map((c) => c.id)),
  )
  const [hovered, setHovered] = useState<CvDot | null>(null)

  const toggleCluster = (id: string) => {
    setActiveClusters((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const W = 900
  const H = 600

  const positionned = useMemo(
    () => CV_DOTS.map((dot) => ({ dot, pos: positionFor(dot) })),
    [],
  )

  return (
    <main style={{
      padding: "24px 28px 80px",
      maxWidth: 1280, margin: "0 auto",
      fontFamily: "var(--font-inter), sans-serif",
      minHeight: "calc(100vh - 60px)",
    }}>
      {/* Header */}
      <m.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
      >
        <p style={{
          margin: 0, fontSize: 10.5, fontWeight: 700, color: "#7C63C8",
          letterSpacing: "0.1em", textTransform: "uppercase",
        }}>
          Vivier — Aperçu visuel
        </p>
        <h1 style={{
          margin: "4px 0 4px", fontSize: 24, fontWeight: 800, color: "#111827",
        }}>
          Carte de compétences
        </h1>
        <p style={{
          margin: 0, fontSize: 13, color: "#6B7280", maxWidth: 720, lineHeight: 1.6,
        }}>
          Les zones colorées sont les <strong>secteurs déterminés par Nora</strong> à
          partir du contenu des CVs. Les profils mixtes apparaissent dans le dégradé
          entre deux zones. Aperçu statique — la classification réelle est faite par
          le LLM à l&apos;upload.
        </p>
      </m.div>

      {/* Filtres cluster */}
      <m.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE, delay: 0.05 }}
        style={{
          display: "flex", flexWrap: "wrap", gap: 8,
          marginTop: 18, marginBottom: 18,
        }}
      >
        {CLUSTERS.map((c) => {
          const active = activeClusters.has(c.id)
          const count = CV_DOTS.filter((d) => d.primary === c.id || d.secondary === c.id).length
          return (
            <button
              key={c.id}
              onClick={() => toggleCluster(c.id)}
              style={{
                fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 11px", borderRadius: 100,
                fontSize: 12, fontWeight: 600,
                cursor: "pointer",
                color: active ? "#1F2937" : "#9CA3AF",
                background: active ? clusterColor(c.hue, 60, 92) : "#FAFAFA",
                border: `1px solid ${active ? clusterColor(c.hue, 50, 70) : "#E5E7EB"}`,
                opacity: active ? 1 : 0.6,
              }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: clusterColor(c.hue, 65, 55),
                display: "inline-block",
              }} />
              {c.label}
              <span style={{ color: "#9CA3AF", fontWeight: 500 }}>· {count}</span>
            </button>
          )
        })}
      </m.div>

      {/* Carte SVG */}
      <m.div
        initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.08 }}
        style={{
          background: "white",
          border: "1px solid #F0ECF8",
          borderRadius: 18,
          padding: 12,
          position: "relative",
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%" height="auto"
          style={{ display: "block", overflow: "visible" }}
        >
          {/* Defs — gradient radial par cluster */}
          <defs>
            {CLUSTERS.map((c) => (
              <radialGradient
                key={c.id}
                id={`grad-${c.id}`}
                cx="50%" cy="50%" r="50%"
              >
                <stop offset="0%" stopColor={clusterColor(c.hue, 75, 75)} stopOpacity={activeClusters.has(c.id) ? 0.6 : 0.08} />
                <stop offset="60%" stopColor={clusterColor(c.hue, 65, 80)} stopOpacity={activeClusters.has(c.id) ? 0.3 : 0.04} />
                <stop offset="100%" stopColor={clusterColor(c.hue, 60, 85)} stopOpacity={0} />
              </radialGradient>
            ))}
          </defs>

          {/* Zones colorées — un disque par cluster avec le gradient */}
          {CLUSTERS.map((c) => (
            <circle
              key={c.id}
              cx={c.cx * W}
              cy={c.cy * H}
              r={c.radius * Math.min(W, H) * 1.25}
              fill={`url(#grad-${c.id})`}
              style={{ transition: "opacity 200ms ease" }}
            />
          ))}

          {/* Titres clusters au centre des zones */}
          {CLUSTERS.map((c) => {
            const active = activeClusters.has(c.id)
            return (
              <g key={`label-${c.id}`} style={{ pointerEvents: "none" }}>
                <text
                  x={c.cx * W}
                  y={c.cy * H - 6}
                  fontSize={15}
                  fontWeight={800}
                  textAnchor="middle"
                  fill={clusterColor(c.hue, 70, 30)}
                  opacity={active ? 0.85 : 0.3}
                  style={{ letterSpacing: "0.02em" }}
                >
                  {c.label.toUpperCase()}
                </text>
                <text
                  x={c.cx * W}
                  y={c.cy * H + 12}
                  fontSize={11}
                  textAnchor="middle"
                  fill={clusterColor(c.hue, 50, 45)}
                  opacity={active ? 0.6 : 0.2}
                >
                  {CV_DOTS.filter((d) => d.primary === c.id || d.secondary === c.id).length} profils
                </text>
              </g>
            )
          })}

          {/* Dots des CVs */}
          {positionned.map(({ dot, pos }) => {
            const isHovered = hovered?.id === dot.id
            const inActive = activeClusters.has(dot.primary) || (dot.secondary && activeClusters.has(dot.secondary))
            const color = dotColor(dot)
            return (
              <g
                key={dot.id}
                onMouseEnter={() => setHovered(dot)}
                onMouseLeave={() => setHovered((h) => h?.id === dot.id ? null : h)}
                style={{ cursor: "pointer", transition: "transform 200ms ease" }}
                transform={isHovered ? `translate(0, -2)` : undefined}
              >
                {/* Halo doux derrière le dot pour le détacher des zones */}
                <circle
                  cx={pos.x * W} cy={pos.y * H} r={isHovered ? 22 : 16}
                  fill="white" opacity={0.75}
                />
                <circle
                  cx={pos.x * W} cy={pos.y * H}
                  r={isHovered ? 16 : 13}
                  fill={color}
                  stroke="white"
                  strokeWidth={2}
                  opacity={inActive ? 1 : 0.25}
                  style={{ transition: "r 160ms ease, opacity 200ms ease" }}
                />
                <text
                  x={pos.x * W} y={pos.y * H + 4}
                  fontSize={9.5}
                  fontWeight={800}
                  textAnchor="middle"
                  fill="white"
                  style={{ pointerEvents: "none", letterSpacing: "0.02em" }}
                  opacity={inActive ? 1 : 0.25}
                >
                  {dot.initials}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Tooltip dot hovered — flottant en bas du SVG */}
        {hovered && (
          <div style={{
            position: "absolute",
            left: 16, bottom: 16,
            background: "white",
            border: "1px solid #E9E2F7",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(124,99,200,0.15)",
            padding: "10px 14px",
            display: "flex", flexDirection: "column", gap: 2,
            minWidth: 220,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Ref {hovered.ref}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>
              {hovered.fullName}
            </div>
            <div style={{ fontSize: 11.5, color: "#6B7280" }}>
              {hovered.title}
            </div>
            <div style={{
              marginTop: 4, paddingTop: 4, borderTop: "1px dashed #E5E7EB",
              fontSize: 10.5, color: "#7C63C8", fontWeight: 600,
            }}>
              {CLUSTERS.find((c) => c.id === hovered.primary)?.label}
              {hovered.secondary && (
                <> · <span style={{ color: "#B45309" }}>hybride {CLUSTERS.find((c) => c.id === hovered.secondary)?.label}</span></>
              )}
            </div>
          </div>
        )}
      </m.div>

      {/* Stats récap */}
      <m.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE, delay: 0.2 }}
        style={{
          marginTop: 16,
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
        }}
      >
        <Stat label="Total candidats" value={`${CV_DOTS.length}`} />
        <Stat label="Secteurs détectés" value={`${CLUSTERS.length}`} />
        <Stat label="Profils hybrides" value={`${CV_DOTS.filter((d) => d.secondary).length}`} />
        <Stat label="À reclasser" value="0" />
      </m.div>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "white", border: "1px solid #F0ECF8",
      borderRadius: 12, padding: "10px 14px",
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: "#9CA3AF",
        letterSpacing: "0.05em", textTransform: "uppercase",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 18, fontWeight: 800, color: "#111827",
        fontVariantNumeric: "tabular-nums", marginTop: 2,
      }}>
        {value}
      </div>
    </div>
  )
}
