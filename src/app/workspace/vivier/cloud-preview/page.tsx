"use client"

/**
 * /workspace/vivier/cloud-preview — V3 zones drill-in
 *
 * Carte par défaut : SEULES les zones colorées (pas de dots). On lit le
 * vivier comme un atlas. Clic sur une zone → la zone s'agrandit jusqu'à
 * remplir le canvas (framer-motion layoutId), puis les candidats du
 * secteur apparaissent en staggered fade-in dans l'ambiance colorée de
 * la zone.
 *
 * Les hybrides apparaissent dans CHAQUE zone qu'ils touchent et portent
 * un petit badge "+1 secteur" — clic dessus = zoom sur l'autre zone.
 *
 * Toggle Liste/Carte conservé : Liste = vue à plat (cards grille), Carte
 * = nouveau concept zones drill-in.
 *
 * 100 % fake data. Pas de DB.
 */

import { useMemo, useState } from "react"
import Link from "next/link"
import { m, AnimatePresence, LayoutGroup } from "framer-motion"
import { useEscapeKey } from "@/components/ui/useEscapeKey"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]
const SPRING = { type: "spring" as const, stiffness: 220, damping: 28, mass: 0.9 }

/* ──────────────────────────────────────────────────────────────────────────
 * Fake data
 * ────────────────────────────────────────────────────────────────────────── */

interface Cluster {
  id: string
  label: string
  cx: number     // 0..1 fraction of canvas
  cy: number
  radius: number // 0..1
  hue: number
}

const CLUSTERS: Cluster[] = [
  { id: "data",      label: "Data Engineering",  cx: 0.30, cy: 0.34, radius: 0.32, hue: 265 },
  { id: "backend",   label: "Tech Backend",      cx: 0.58, cy: 0.30, radius: 0.28, hue: 215 },
  { id: "quant",     label: "Quant / Finance",   cx: 0.82, cy: 0.52, radius: 0.24, hue: 305 },
  { id: "etudiants", label: "Étudiants Bac+5",   cx: 0.24, cy: 0.74, radius: 0.24, hue: 175 },
  { id: "devops",    label: "DevOps / SRE",      cx: 0.62, cy: 0.78, radius: 0.26, hue: 35 },
]

interface CvCand {
  id: string
  initials: string
  fullName: string
  title: string
  company: string | null
  yearsExperience: number
  location: string
  skills: string[]
  ref: string
  primary: string
  primaryWeight: number
  secondary?: string
}

const CANDIDATES: CvCand[] = [
  { id: "1",  initials: "AB", fullName: "Achraf Boutaleb",   title: "Senior Data Engineer",      company: "Doctolib",         yearsExperience: 8, location: "Paris", skills: ["Python", "Spark", "dbt", "Airflow"],  ref: "C-A1B2C3D4", primary: "data", primaryWeight: 1.0 },
  { id: "2",  initials: "ML", fullName: "Marie Lefevre",     title: "Data Engineer Spark",       company: "BlaBlaCar",        yearsExperience: 5, location: "Paris", skills: ["Scala", "Spark", "Kafka"],            ref: "C-D4E5F6A7", primary: "data", primaryWeight: 0.92 },
  { id: "3",  initials: "TR", fullName: "Tom Riberi",        title: "Lead Data Platform",        company: "Qonto",            yearsExperience: 9, location: "Paris", skills: ["Snowflake", "dbt", "Looker"],         ref: "C-B7C8D9E0", primary: "data", primaryWeight: 0.88 },
  { id: "4",  initials: "SP", fullName: "Sofia Petrenko",    title: "Data Engineer dbt",         company: "Spendesk",         yearsExperience: 4, location: "Lyon",  skills: ["dbt", "BigQuery", "Python"],          ref: "C-E1F2A3B4", primary: "data", primaryWeight: 0.95 },
  { id: "5",  initials: "JM", fullName: "Julien Mazars",     title: "Backend + Data ingest",     company: "Algolia",          yearsExperience: 6, location: "Paris", skills: ["Go", "Kafka", "PostgreSQL"],          ref: "C-12345678", primary: "data",    primaryWeight: 0.55, secondary: "backend" },
  { id: "6",  initials: "EK", fullName: "Elena Kowalski",    title: "Python pipelines",          company: "Aircall",          yearsExperience: 4, location: "Paris", skills: ["Python", "FastAPI", "Airflow"],       ref: "C-87654321", primary: "data",    primaryWeight: 0.6,  secondary: "backend" },
  { id: "7",  initials: "RD", fullName: "Rachid Daher",      title: "Senior Backend Go",         company: "Swile",            yearsExperience: 7, location: "Paris", skills: ["Go", "gRPC", "Kubernetes"],           ref: "C-AABBCCDD", primary: "backend", primaryWeight: 1.0 },
  { id: "8",  initials: "VC", fullName: "Vincent Caillet",   title: "Backend Node.js",           company: "Mirakl",           yearsExperience: 5, location: "Paris", skills: ["Node.js", "TypeScript", "MongoDB"],   ref: "C-DDCCBBAA", primary: "backend", primaryWeight: 0.9 },
  { id: "9",  initials: "AY", fullName: "Aya Yamamoto",      title: "Backend Kotlin / Java",     company: "Datadog",          yearsExperience: 6, location: "Paris", skills: ["Kotlin", "Java", "AWS"],              ref: "C-11223344", primary: "backend", primaryWeight: 0.85 },
  { id: "10", initials: "PG", fullName: "Pierre Galland",    title: "Tech Lead Backend",         company: "Payfit",           yearsExperience: 10, location: "Paris", skills: ["Python", "Django", "PostgreSQL"],   ref: "C-44332211", primary: "backend", primaryWeight: 1.0 },
  { id: "11", initials: "MO", fullName: "Mehdi Ouali",       title: "Backend + Kubernetes",      company: "Ubble",            yearsExperience: 7, location: "Lyon",  skills: ["Go", "K8s", "Terraform"],             ref: "C-55667788", primary: "backend", primaryWeight: 0.55, secondary: "devops" },
  { id: "12", initials: "DL", fullName: "David Lemoine",     title: "Quant Researcher",          company: "BNP Paribas",      yearsExperience: 9, location: "Paris", skills: ["Python", "C++", "Stochastic calc"],   ref: "C-88776655", primary: "quant",   primaryWeight: 1.0 },
  { id: "13", initials: "NR", fullName: "Naomi Reinhardt",   title: "Quant Developer C++",       company: "Société Générale", yearsExperience: 7, location: "Paris", skills: ["C++", "QuickFIX", "Linux"],           ref: "C-99887766", primary: "quant",   primaryWeight: 0.92 },
  { id: "14", initials: "AB", fullName: "Antonin Berger",    title: "Quant Strategy Python",     company: "Kepler Cheuvreux", yearsExperience: 6, location: "Paris", skills: ["Python", "NumPy", "Pandas"],          ref: "C-AABB1122", primary: "quant",   primaryWeight: 0.88 },
  { id: "15", initials: "LF", fullName: "Léa Faure",         title: "Data + Quant pricing",      company: "Crédit Agricole",  yearsExperience: 5, location: "Paris", skills: ["Python", "SQL", "Quant pricing"],     ref: "C-CCDD3344", primary: "quant",   primaryWeight: 0.55, secondary: "data" },
  { id: "16", initials: "KB", fullName: "Karim Belkacem",    title: "Site Reliability Engineer", company: "Doctolib",         yearsExperience: 6, location: "Paris", skills: ["AWS", "Terraform", "Kubernetes"],     ref: "C-EEFF5566", primary: "devops",  primaryWeight: 1.0 },
  { id: "17", initials: "AT", fullName: "Anaïs Tessier",     title: "Cloud DevOps AWS",          company: "Voodoo",           yearsExperience: 4, location: "Paris", skills: ["AWS", "Docker", "Terraform"],         ref: "C-99001122", primary: "devops",  primaryWeight: 0.88 },
  { id: "18", initials: "MN", fullName: "Mathieu Nizet",     title: "Platform Engineer",         company: "Ankorstore",       yearsExperience: 5, location: "Paris", skills: ["GCP", "K8s", "ArgoCD"],               ref: "C-33445566", primary: "devops",  primaryWeight: 0.82 },
  { id: "19", initials: "CT", fullName: "Camille Tournier",  title: "Étudiant 5A Centrale",      company: null,               yearsExperience: 0, location: "Paris", skills: ["Python", "Machine Learning"],         ref: "C-77889900", primary: "etudiants", primaryWeight: 1.0 },
  { id: "20", initials: "YO", fullName: "Yann Olivier",      title: "Étudiant 4A Polytechnique", company: null,               yearsExperience: 1, location: "Paris", skills: ["Python", "C++", "Deep Learning"],     ref: "C-12340000", primary: "etudiants", primaryWeight: 0.95 },
  { id: "21", initials: "FH", fullName: "Fatima Hadj",       title: "Étudiante M2 ENS",          company: null,               yearsExperience: 0, location: "Lyon",  skills: ["R", "Statistics", "Python"],          ref: "C-56780000", primary: "etudiants", primaryWeight: 1.0 },
  { id: "22", initials: "OB", fullName: "Oscar Brun",        title: "Étudiant 5A Télécom",       company: null,               yearsExperience: 1, location: "Paris", skills: ["Python", "Cybersécurité"],            ref: "C-00001234", primary: "etudiants", primaryWeight: 0.85 },
  { id: "23", initials: "RS", fullName: "Rania Saïdi",       title: "Étudiante Data 5A",         company: null,               yearsExperience: 0, location: "Paris", skills: ["Python", "SQL", "dbt"],               ref: "C-00005678", primary: "etudiants", primaryWeight: 0.55, secondary: "data" },
  { id: "24", initials: "GP", fullName: "Gabriel Praz",      title: "Étudiant DevOps 4A",        company: null,               yearsExperience: 1, location: "Paris", skills: ["Docker", "AWS", "Linux"],             ref: "C-43210000", primary: "etudiants", primaryWeight: 0.6,  secondary: "devops" },
]

/* ──────────────────────────────────────────────────────────────────────────
 * Helpers couleur
 * ────────────────────────────────────────────────────────────────────────── */

const hsl = (h: number, s = 65, l = 60) => `hsl(${h}, ${s}%, ${l}%)`

function clusterById(id: string): Cluster {
  return CLUSTERS.find((c) => c.id === id) ?? CLUSTERS[0]
}

/** Toutes les candidats qui touchent un secteur (primaire OU secondaire). */
function candidatesInSector(sectorId: string): CvCand[] {
  return CANDIDATES.filter((c) => c.primary === sectorId || c.secondary === sectorId)
}

/* ──────────────────────────────────────────────────────────────────────────
 * Page
 * ────────────────────────────────────────────────────────────────────────── */

export default function VivierCloudPreview() {
  const [view, setView] = useState<"list" | "map">("map")
  const [query, setQuery] = useState("")
  const [zoomedSector, setZoomedSector] = useState<string | null>(null)

  const q = query.trim().toLowerCase()
  const matchesQuery = (c: CvCand) => {
    if (!q) return true
    return [c.fullName, c.title, c.company ?? "", c.location, c.ref, ...c.skills]
      .join(" ").toLowerCase().includes(q)
  }

  return (
    <main style={{
      padding: "26px 28px 80px",
      maxWidth: 1320, margin: "0 auto",
      fontFamily: "var(--font-inter), sans-serif",
      minHeight: "calc(100vh - 60px)",
    }}>
      <Header view={view} setView={(v) => { setView(v); setZoomedSector(null) }} />

      <SearchBar value={query} onChange={setQuery} />

      {/* Vue Carte avec drill-in */}
      <AnimatePresence mode="wait" initial={false}>
        {view === "map" ? (
          <m.div
            key="map"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            style={{ marginTop: 22 }}
          >
            <LayoutGroup>
              <AnimatePresence mode="wait" initial={false}>
                {zoomedSector === null ? (
                  <MacroMap
                    key="macro"
                    onZoom={(id) => setZoomedSector(id)}
                  />
                ) : (
                  <SectorZoomView
                    key={`zoom-${zoomedSector}`}
                    sectorId={zoomedSector}
                    onBack={() => setZoomedSector(null)}
                    onJumpToSector={(nextId) => setZoomedSector(nextId)}
                    matchesQuery={matchesQuery}
                    query={q}
                  />
                )}
              </AnimatePresence>
            </LayoutGroup>
          </m.div>
        ) : (
          <m.div
            key="list"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            style={{ marginTop: 22 }}
          >
            <FlatList candidates={CANDIDATES.filter(matchesQuery)} />
          </m.div>
        )}
      </AnimatePresence>

    </main>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Header — titre + toggle vue
 * ────────────────────────────────────────────────────────────────────────── */

function Header({ view, setView }: { view: "list" | "map"; setView: (v: "list" | "map") => void }) {
  return (
    <m.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
      <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, color: "#7C63C8", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Vivier — Aperçu visuel
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginTop: 4 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em" }}>
            Mon vivier
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280", maxWidth: 720, lineHeight: 1.6 }}>
            {CANDIDATES.length} candidats répartis sur {CLUSTERS.length} secteurs détectés par Nora.
          </p>
        </div>
        <ViewToggle view={view} onChange={setView} />
      </div>
    </m.div>
  )
}

function ViewToggle({ view, onChange }: { view: "list" | "map"; onChange: (v: "list" | "map") => void }) {
  return (
    <div style={{
      display: "inline-flex", background: "white", border: "1px solid #E5E7EB",
      borderRadius: 100, padding: 3, gap: 2, position: "relative",
    }}>
      {(["map", "list"] as const).map((v) => {
        const active = view === v
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            style={{
              fontFamily: "inherit",
              position: "relative",
              padding: "7px 16px", borderRadius: 100,
              fontSize: 12, fontWeight: 700,
              cursor: "pointer",
              color: active ? "white" : "#6B7280",
              background: "transparent",
              border: "none",
              zIndex: 1,
            }}
          >
            {active && (
              <m.span
                layoutId="view-toggle-active"
                transition={SPRING}
                style={{
                  position: "absolute", inset: 0, borderRadius: 100,
                  background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                  zIndex: -1,
                }}
              />
            )}
            {v === "map" ? "◍ Carte" : "≡ Liste"}
          </button>
        )
      })}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Search bar — recherche libre
 * ────────────────────────────────────────────────────────────────────────── */

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE, delay: 0.04 }}
      style={{ marginTop: 18 }}
    >
      <input
        type="search"
        placeholder="Rechercher par nom, poste, compétence, ref C-…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          fontSize: 13.5, color: "#111827",
          padding: "12px 16px",
          background: "white",
          border: "1px solid #E5E7EB",
          borderRadius: 12,
          outline: "none",
          fontFamily: "inherit",
          boxShadow: "0 1px 2px rgba(17,24,39,0.03)",
        }}
      />
    </m.div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * MacroMap — zones colorées seules, pas de dots. Vue stratégique pure.
 * ────────────────────────────────────────────────────────────────────────── */

function MacroMap({ onZoom }: { onZoom: (id: string) => void }) {
  const W = 900
  const H = 580

  return (
    <m.div
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.99 }}
      transition={{ duration: 0.4, ease: EASE }}
      style={{ position: "relative", borderRadius: 20, overflow: "hidden" }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" style={{ display: "block" }}>
        <defs>
          {CLUSTERS.map((c) => (
            <radialGradient key={c.id} id={`grad-macro-${c.id}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%"  stopColor={hsl(c.hue, 78, 72)} stopOpacity={0.65} />
              <stop offset="65%" stopColor={hsl(c.hue, 65, 80)} stopOpacity={0.30} />
              <stop offset="100%" stopColor={hsl(c.hue, 55, 85)} stopOpacity={0} />
            </radialGradient>
          ))}
        </defs>

        {/* Zones colorées */}
        {CLUSTERS.map((c) => {
          const r = c.radius * Math.min(W, H) * 1.25
          return (
            <circle
              key={c.id}
              cx={c.cx * W}
              cy={c.cy * H}
              r={r}
              fill={`url(#grad-macro-${c.id})`}
            />
          )
        })}
      </svg>

      {/* Surcouche interactive : un wrapper positionné + bouton motion à
          l'intérieur. Le wrapper porte le translate(-50%, -50%) qui centre
          la zone, le motion-button ne gère QUE le hover scale — comme ça
          framer-motion n'écrase plus la translate de centrage et le titre
          ne saute plus à droite au hover. */}
      <div style={{ position: "absolute", inset: 0 }}>
        {CLUSTERS.map((c) => {
          const count = candidatesInSector(c.id).length
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
                  /* Disque plein à la teinte secteur — devient visible
                   *  au hover, restait fantomatique sans. Met le titre
                   *  en valeur sans le faire bouger. */
                  background: `radial-gradient(closest-side, ${hsl(c.hue, 70, 90)}66, ${hsl(c.hue, 60, 95)}11 70%, transparent 90%)`,
                  border: "none",
                  cursor: "pointer",
                  color: hsl(c.hue, 60, 25),
                  fontFamily: "inherit",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  padding: 0,
                  transformOrigin: "center center",
                }}
                aria-label={`Explorer le secteur ${c.label} (${count} candidats)`}
              >
                <span style={{
                  fontSize: Math.max(14, sizePx / 12),
                  fontWeight: 800,
                  letterSpacing: "0.02em",
                  textTransform: "uppercase",
                  textShadow: "0 1px 0 rgba(255,255,255,0.6)",
                  pointerEvents: "none",
                  textAlign: "center",
                }}>
                  {c.label}
                </span>
                <span style={{
                  fontSize: Math.max(10, sizePx / 22),
                  fontWeight: 700,
                  color: hsl(c.hue, 45, 38),
                  opacity: 0.85,
                  marginTop: 4,
                  pointerEvents: "none",
                }}>
                  {count} profils
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
 * SectorZoomView — la zone cliquée s'agrandit jusqu'au plein canvas et
 * révèle la liste des candidats du secteur (primaires + hybrides).
 * ────────────────────────────────────────────────────────────────────────── */

function SectorZoomView({
  sectorId,
  onBack,
  onJumpToSector,
  matchesQuery,
  query,
}: {
  sectorId: string
  onBack: () => void
  onJumpToSector: (id: string) => void
  matchesQuery: (c: CvCand) => boolean
  query: string
}) {
  const cluster = clusterById(sectorId)
  const all = useMemo(() => candidatesInSector(sectorId).filter(matchesQuery), [sectorId, matchesQuery])
  const primaries = all.filter((c) => c.primary === sectorId)
  const hybrids   = all.filter((c) => c.secondary === sectorId)

  return (
    <m.div
      layoutId={`zone-${sectorId}`}
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
      {/* Halo radial doux en haut, ambiance secteur */}
      <m.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, ease: EASE, delay: 0.1 }}
        style={{
          position: "absolute", top: -120, left: "50%", transform: "translateX(-50%)",
          width: 700, height: 400, borderRadius: "50%",
          background: `radial-gradient(closest-side, ${hsl(cluster.hue, 75, 80)}55, transparent 70%)`,
          filter: "blur(40px)", pointerEvents: "none",
        }}
      />

      {/* Header zoom : retour + titre secteur + count */}
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
            {all.length} profil{all.length > 1 ? "s" : ""}
            {hybrids.length > 0 && <> · <strong>{hybrids.length}</strong> hybride{hybrids.length > 1 ? "s" : ""}</>}
            {query && <> · filtré sur « {query} »</>}
          </p>
        </div>
      </m.div>

      {/* Empty state si filtre vide */}
      {all.length === 0 && (
        <p style={{ margin: "40px 0", fontSize: 13, color: "#9CA3AF", textAlign: "center" }}>
          Aucun candidat dans ce secteur ne correspond à la recherche.
        </p>
      )}

      {/* Grille candidats — stagger fade-in pour de la légèreté */}
      <div style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 12,
      }}>
        {primaries.map((c, i) => (
          <CandidateCardLight key={c.id} c={c} index={i} cluster={cluster} onJumpToSector={onJumpToSector} />
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
            c={c}
            index={primaries.length + i}
            cluster={cluster}
            onJumpToSector={onJumpToSector}
            isHybridContext
          />
        ))}
      </div>
    </m.div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * CandidateCardLight — carte aérée pour la vue zoom
 * ────────────────────────────────────────────────────────────────────────── */

function CandidateCardLight({
  c, index, cluster, onJumpToSector, isHybridContext = false,
}: {
  c: CvCand
  index: number
  cluster: Cluster
  onJumpToSector: (id: string) => void
  isHybridContext?: boolean
}) {
  const otherSectorId = c.primary === cluster.id ? c.secondary : c.primary
  const otherSector = otherSectorId ? clusterById(otherSectorId) : null
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
      {/* Bande verticale couleur secteur */}
      <span style={{
        position: "absolute", top: 0, bottom: 0, left: 0, width: 4,
        background: hsl(cluster.hue, 60, 55),
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
          {c.initials}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.fullName}
          </div>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.04em", fontFamily: "var(--font-space-grotesk), monospace" }}>
            {c.ref}
          </div>
        </div>
        {isHybridContext && otherSector && (
          <span
            onClick={(e) => { e.stopPropagation(); onJumpToSector(otherSector.id) }}
            style={{
              fontSize: 10, fontWeight: 700,
              color: hsl(otherSector.hue, 55, 38),
              background: hsl(otherSector.hue, 70, 95),
              border: `1px solid ${hsl(otherSector.hue, 50, 80)}`,
              padding: "2px 8px", borderRadius: 100,
              cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 4,
              flexShrink: 0,
            }}
            title={`Voir aussi dans ${otherSector.label}`}
          >
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: hsl(otherSector.hue, 60, 55) }} />
            {otherSector.label.split(" ")[0]} →
          </span>
        )}
      </div>

      <div style={{ fontSize: 12, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingLeft: 42 }}>
        {c.title}{c.company ? ` · ${c.company}` : ""}
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center", paddingLeft: 42, fontSize: 10.5, color: "#9CA3AF" }}>
        {c.location} · {c.yearsExperience} an{c.yearsExperience !== 1 ? "s" : ""} XP
      </div>

      {c.skills.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", paddingLeft: 42, marginTop: 2 }}>
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

/* ──────────────────────────────────────────────────────────────────────────
 * FlatList — vue Liste cross-secteurs (fallback pour ceux qui scrollent)
 * ────────────────────────────────────────────────────────────────────────── */

function FlatList({ candidates }: { candidates: CvCand[]; onOpenCand?: (c: CvCand) => void }) {
  if (candidates.length === 0) {
    return (
      <div style={{
        padding: "60px 24px", textAlign: "center",
        background: "white", border: "1px dashed #E5E7EB", borderRadius: 14,
        color: "#6B7280", fontSize: 14,
      }}>
        Aucun candidat ne correspond à la recherche.
      </div>
    )
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
      {candidates.map((c, i) => {
        const primary = clusterById(c.primary)
        return (
          <CandidateCardLight key={c.id} c={c} index={i} cluster={primary} onJumpToSector={() => {}} />
        )
      })}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Drawer candidat — V2 supprimé : on nav direct vers la fiche au clic.
 * (Le composant reste exporté désactivé pour mémoire en cas de re-activation.)
 * ────────────────────────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function DrawerCandidate({ cand, onClose }: { cand: CvCand | null; onClose: () => void }) {
  useEscapeKey(onClose, cand !== null)
  return (
    <AnimatePresence>
      {cand && (
        <>
          <m.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            onClick={onClose}
            style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(17,24,39,0.35)", backdropFilter: "blur(3px)" }}
          />
          <m.aside
            initial={{ x: 380, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 380, opacity: 0 }}
            transition={SPRING}
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0,
              width: "min(400px, 92vw)", zIndex: 90,
              background: "white", borderLeft: "1px solid #E9E2F7",
              padding: "24px 24px 30px",
              boxShadow: "-16px 0 50px rgba(17,24,39,0.12)",
              fontFamily: "var(--font-inter), sans-serif",
              display: "flex", flexDirection: "column", gap: 16,
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Aperçu candidat
              </span>
              <button onClick={onClose} style={{
                fontFamily: "inherit", fontSize: 11, fontWeight: 700, color: "#7C63C8",
                background: "rgba(124,99,200,0.06)", border: "1px solid rgba(124,99,200,0.20)",
                borderRadius: 8, padding: "4px 10px", cursor: "pointer",
              }}>
                ✕ Fermer
              </button>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: hsl(clusterById(cand.primary).hue, 70, 92),
                  color: hsl(clusterById(cand.primary).hue, 55, 30),
                  fontSize: 15, fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {cand.initials}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", letterSpacing: "-0.01em" }}>
                    {cand.fullName}
                  </div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.04em", fontFamily: "var(--font-space-grotesk), monospace" }}>
                    {cand.ref}
                  </div>
                </div>
              </div>
              <p style={{ margin: "10px 0 0", fontSize: 13, color: "#374151" }}>
                {cand.title}{cand.company ? ` · ${cand.company}` : ""}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#9CA3AF" }}>
                {cand.location} · {cand.yearsExperience} an{cand.yearsExperience !== 1 ? "s" : ""} d&apos;expérience
              </p>
            </div>

            <div>
              <SectionLabel>Secteurs</SectionLabel>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <SectorChip cluster={clusterById(cand.primary)} />
                {cand.secondary && <SectorChip cluster={clusterById(cand.secondary)} muted />}
              </div>
            </div>

            <div>
              <SectionLabel>Compétences</SectionLabel>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {cand.skills.map((s) => (
                  <span key={s} style={{
                    fontSize: 10.5, color: "#4B5563", background: "#F8F6FF",
                    border: "1px solid #F0ECF8", padding: "2.5px 9px", borderRadius: 6,
                  }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>

            <button style={{
              marginTop: "auto",
              fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: "white",
              padding: "11px 16px", borderRadius: 10,
              background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
              border: "none", cursor: "pointer",
              boxShadow: "0 6px 18px -8px rgba(124,99,200,0.6)",
            }}>
              Ouvrir la fiche complète →
            </button>
          </m.aside>
        </>
      )}
    </AnimatePresence>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9.5, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 7 }}>
      {children}
    </div>
  )
}

function SectorChip({ cluster, muted }: { cluster: Cluster; muted?: boolean }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 10.5, fontWeight: 700,
      color: muted ? hsl(cluster.hue, 40, 50) : hsl(cluster.hue, 55, 35),
      background: muted ? "transparent" : hsl(cluster.hue, 70, 94),
      border: `1px solid ${hsl(cluster.hue, 50, muted ? 80 : 78)}`,
      padding: "2px 9px", borderRadius: 100,
    }}>
      <span style={{ width: 5.5, height: 5.5, borderRadius: "50%", background: hsl(cluster.hue, 65, 55) }} />
      {cluster.label}
    </span>
  )
}
