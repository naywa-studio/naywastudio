"use client"

/**
 * /workspace/vivier/cloud-preview — V2 hybride
 *
 * Deux vues d'un même vivier :
 *   - LISTE : la vue par défaut, enrichie de chips secteurs (filtrent) et
 *             d'une pastille de couleur par carte selon le secteur primaire.
 *             Scale à 200+ CVs.
 *   - CARTE : exploration visuelle / stratégique. Hover + clic ouvre un
 *             drawer latéral avec aperçu du candidat.
 *
 * 100 % fake data. Validation visuelle avant qu'on branche la classification
 * LLM réelle côté backend.
 */

import { useMemo, useState } from "react"
import { m, AnimatePresence } from "framer-motion"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

/* ──────────────────────────────────────────────────────────────────────────
 * Fake data
 * ────────────────────────────────────────────────────────────────────────── */

interface Cluster {
  id: string
  label: string
  cx: number
  cy: number
  radius: number
  hue: number
}

const CLUSTERS: Cluster[] = [
  { id: "data",      label: "Data Engineering",  cx: 0.28, cy: 0.32, radius: 0.30, hue: 265 },
  { id: "backend",   label: "Tech Backend",      cx: 0.56, cy: 0.28, radius: 0.26, hue: 215 },
  { id: "quant",     label: "Quant / Finance",   cx: 0.80, cy: 0.50, radius: 0.22, hue: 305 },
  { id: "etudiants", label: "Étudiants Bac+5",   cx: 0.22, cy: 0.72, radius: 0.22, hue: 175 },
  { id: "devops",    label: "DevOps / SRE",      cx: 0.60, cy: 0.76, radius: 0.22, hue: 35 },
]

interface CvDot {
  id: string
  initials: string
  fullName: string
  title: string
  company: string | null
  yearsExperience: number | null
  location: string
  skills: string[]
  ref: string
  primary: string
  primaryWeight: number
  secondary?: string
}

const CV_DOTS: CvDot[] = [
  { id: "1", initials: "AB", fullName: "Achraf Boutaleb", title: "Senior Data Engineer",       company: "Doctolib",       yearsExperience: 8, location: "Paris",      skills: ["Python", "Spark", "dbt", "Airflow"], ref: "C-A1B2C3D4", primary: "data", primaryWeight: 1.0 },
  { id: "2", initials: "ML", fullName: "Marie Lefevre",   title: "Data Engineer Spark",        company: "BlaBlaCar",      yearsExperience: 5, location: "Paris",      skills: ["Scala", "Spark", "Kafka"],          ref: "C-D4E5F6A7", primary: "data", primaryWeight: 0.92 },
  { id: "3", initials: "TR", fullName: "Tom Riberi",      title: "Lead Data Platform",         company: "Qonto",          yearsExperience: 9, location: "Paris",      skills: ["Snowflake", "dbt", "Looker"],       ref: "C-B7C8D9E0", primary: "data", primaryWeight: 0.88 },
  { id: "4", initials: "SP", fullName: "Sofia Petrenko",  title: "Data Engineer dbt",          company: "Spendesk",       yearsExperience: 4, location: "Lyon",       skills: ["dbt", "BigQuery", "Python"],        ref: "C-E1F2A3B4", primary: "data", primaryWeight: 0.95 },
  { id: "5", initials: "JM", fullName: "Julien Mazars",   title: "Backend + Data ingest",      company: "Algolia",        yearsExperience: 6, location: "Paris",      skills: ["Go", "Kafka", "PostgreSQL"],        ref: "C-12345678", primary: "data",    primaryWeight: 0.55, secondary: "backend" },
  { id: "6", initials: "EK", fullName: "Elena Kowalski",  title: "Python pipelines",           company: "Aircall",        yearsExperience: 4, location: "Paris",      skills: ["Python", "FastAPI", "Airflow"],     ref: "C-87654321", primary: "data",    primaryWeight: 0.6,  secondary: "backend" },
  { id: "7", initials: "RD", fullName: "Rachid Daher",    title: "Senior Backend Go",          company: "Swile",          yearsExperience: 7, location: "Paris",      skills: ["Go", "gRPC", "Kubernetes"],         ref: "C-AABBCCDD", primary: "backend", primaryWeight: 1.0 },
  { id: "8", initials: "VC", fullName: "Vincent Caillet", title: "Backend Node.js",            company: "Mirakl",         yearsExperience: 5, location: "Paris",      skills: ["Node.js", "TypeScript", "MongoDB"], ref: "C-DDCCBBAA", primary: "backend", primaryWeight: 0.9 },
  { id: "9", initials: "AY", fullName: "Aya Yamamoto",    title: "Backend Kotlin / Java",      company: "Datadog",        yearsExperience: 6, location: "Paris",      skills: ["Kotlin", "Java", "AWS"],            ref: "C-11223344", primary: "backend", primaryWeight: 0.85 },
  { id: "10", initials: "PG", fullName: "Pierre Galland", title: "Tech Lead Backend",          company: "Payfit",         yearsExperience: 10, location: "Paris",     skills: ["Python", "Django", "PostgreSQL"],   ref: "C-44332211", primary: "backend", primaryWeight: 1.0 },
  { id: "11", initials: "MO", fullName: "Mehdi Ouali",    title: "Backend + Kubernetes",       company: "Ubble",          yearsExperience: 7, location: "Lyon",       skills: ["Go", "K8s", "Terraform"],           ref: "C-55667788", primary: "backend", primaryWeight: 0.55, secondary: "devops" },
  { id: "12", initials: "DL", fullName: "David Lemoine",  title: "Quant Researcher",           company: "BNP Paribas",    yearsExperience: 9, location: "Paris",      skills: ["Python", "C++", "Stochastic calc"], ref: "C-88776655", primary: "quant",   primaryWeight: 1.0 },
  { id: "13", initials: "NR", fullName: "Naomi Reinhardt", title: "Quant Developer C++",       company: "Société Gé.",    yearsExperience: 7, location: "Paris",      skills: ["C++", "QuickFIX", "Linux"],         ref: "C-99887766", primary: "quant",   primaryWeight: 0.92 },
  { id: "14", initials: "AB", fullName: "Antonin Berger", title: "Quant Strategy Python",      company: "Kepler Cheuvreux", yearsExperience: 6, location: "Paris",   skills: ["Python", "NumPy", "Pandas"],        ref: "C-AABB1122", primary: "quant",   primaryWeight: 0.88 },
  { id: "15", initials: "LF", fullName: "Léa Faure",      title: "Data + Quant pricing",       company: "Crédit Agricole", yearsExperience: 5, location: "Paris",     skills: ["Python", "SQL", "Quant pricing"],   ref: "C-CCDD3344", primary: "quant",   primaryWeight: 0.55, secondary: "data" },
  { id: "16", initials: "KB", fullName: "Karim Belkacem", title: "Site Reliability Engineer",  company: "Doctolib",       yearsExperience: 6, location: "Paris",      skills: ["AWS", "Terraform", "Kubernetes"],   ref: "C-EEFF5566", primary: "devops",  primaryWeight: 1.0 },
  { id: "17", initials: "AT", fullName: "Anaïs Tessier",  title: "Cloud DevOps AWS",           company: "Voodoo",         yearsExperience: 4, location: "Paris",      skills: ["AWS", "Docker", "Terraform"],       ref: "C-99001122", primary: "devops",  primaryWeight: 0.88 },
  { id: "18", initials: "MN", fullName: "Mathieu Nizet",  title: "Platform Engineer",          company: "Ankorstore",     yearsExperience: 5, location: "Paris",      skills: ["GCP", "K8s", "ArgoCD"],             ref: "C-33445566", primary: "devops",  primaryWeight: 0.82 },
  { id: "19", initials: "CT", fullName: "Camille Tournier", title: "Étudiant 5A Centrale",     company: null,             yearsExperience: 0, location: "Paris",      skills: ["Python", "Machine Learning"],       ref: "C-77889900", primary: "etudiants", primaryWeight: 1.0 },
  { id: "20", initials: "YO", fullName: "Yann Olivier",   title: "Étudiant 4A Polytechnique",  company: null,             yearsExperience: 1, location: "Paris",      skills: ["Python", "C++", "Deep Learning"],   ref: "C-12340000", primary: "etudiants", primaryWeight: 0.95 },
  { id: "21", initials: "FH", fullName: "Fatima Hadj",    title: "Étudiante M2 ENS",           company: null,             yearsExperience: 0, location: "Lyon",       skills: ["R", "Statistics", "Python"],        ref: "C-56780000", primary: "etudiants", primaryWeight: 1.0 },
  { id: "22", initials: "OB", fullName: "Oscar Brun",     title: "Étudiant 5A Télécom",        company: null,             yearsExperience: 1, location: "Paris",      skills: ["Python", "Cybersécurité"],          ref: "C-00001234", primary: "etudiants", primaryWeight: 0.85 },
  { id: "23", initials: "RS", fullName: "Rania Saïdi",    title: "Étudiante Data 5A",          company: null,             yearsExperience: 0, location: "Paris",      skills: ["Python", "SQL", "dbt"],             ref: "C-00005678", primary: "etudiants", primaryWeight: 0.55, secondary: "data" },
  { id: "24", initials: "GP", fullName: "Gabriel Praz",   title: "Étudiant DevOps 4A",         company: null,             yearsExperience: 1, location: "Paris",      skills: ["Docker", "AWS", "Linux"],           ref: "C-43210000", primary: "etudiants", primaryWeight: 0.6,  secondary: "devops" },
]

/* ──────────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────────── */

const clusterColor = (hue: number, sat = 65, lit = 60) => `hsl(${hue}, ${sat}%, ${lit}%)`

function positionFor(dot: CvDot) {
  const primary = CLUSTERS.find((c) => c.id === dot.primary)!
  const secondary = dot.secondary ? CLUSTERS.find((c) => c.id === dot.secondary) : null
  const w = dot.primaryWeight
  let x = primary.cx, y = primary.cy
  if (secondary) {
    x = primary.cx * w + secondary.cx * (1 - w)
    y = primary.cy * w + secondary.cy * (1 - w)
  }
  const seed = Number(dot.id) || 0
  const angle = (seed * 137.508) * Math.PI / 180
  const radius = primary.radius * 0.42 * Math.sqrt((seed % 7) / 7)
  const jitterScale = secondary ? 0.4 : 1.0
  x += Math.cos(angle) * radius * jitterScale
  y += Math.sin(angle) * radius * jitterScale
  return { x, y }
}

function dotColor(dot: CvDot) {
  const primary = CLUSTERS.find((c) => c.id === dot.primary)!
  if (!dot.secondary) return clusterColor(primary.hue, 55, 55)
  const secondary = CLUSTERS.find((c) => c.id === dot.secondary)!
  const w = dot.primaryWeight
  const h = primary.hue * w + secondary.hue * (1 - w)
  return clusterColor(h, 55, 55)
}

function clusterById(id: string) {
  return CLUSTERS.find((c) => c.id === id)
}

/* ──────────────────────────────────────────────────────────────────────────
 * Page
 * ────────────────────────────────────────────────────────────────────────── */

export default function VivierCloudPreview() {
  const [view, setView] = useState<"list" | "map">("list")
  const [query, setQuery] = useState("")
  const [activeClusters, setActiveClusters] = useState<Set<string>>(
    () => new Set(CLUSTERS.map((c) => c.id)),
  )
  const [drawerDot, setDrawerDot] = useState<CvDot | null>(null)

  const toggleCluster = (id: string) => {
    setActiveClusters((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const onlyOneActive = (id: string) => setActiveClusters(new Set([id]))
  const allActive = () => setActiveClusters(new Set(CLUSTERS.map((c) => c.id)))

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => CV_DOTS.filter((d) => {
    if (!activeClusters.has(d.primary) && (!d.secondary || !activeClusters.has(d.secondary))) {
      return false
    }
    if (q) {
      const hay = [d.fullName, d.title, d.company ?? "", d.location, d.ref, ...d.skills].join(" ").toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [activeClusters, q])

  return (
    <main style={{
      padding: "24px 28px 80px",
      maxWidth: 1360, margin: "0 auto",
      fontFamily: "var(--font-inter), sans-serif",
      minHeight: "calc(100vh - 60px)",
    }}>
      {/* Header */}
      <m.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
        <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, color: "#7C63C8", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Vivier — Aperçu visuel
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginTop: 4 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#111827" }}>
              Mon vivier
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280", maxWidth: 720, lineHeight: 1.6 }}>
              {filtered.length} candidat{filtered.length > 1 ? "s" : ""} · {CLUSTERS.length} secteurs détectés par Nora.
            </p>
          </div>
          <ViewToggle view={view} onChange={setView} />
        </div>
      </m.div>

      {/* Search + cluster chips */}
      <m.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE, delay: 0.04 }}
        style={{ marginTop: 18 }}
      >
        <input
          type="search"
          placeholder="Rechercher par nom, poste, compétence, ref C-…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: "100%",
            fontSize: 13.5, color: "#111827",
            padding: "12px 16px",
            background: "white",
            border: "1px solid #E5E7EB",
            borderRadius: 12,
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.06em", textTransform: "uppercase", marginRight: 4 }}>
            Secteurs
          </span>
          {CLUSTERS.map((c) => {
            const active = activeClusters.has(c.id)
            const count = CV_DOTS.filter((d) => d.primary === c.id || d.secondary === c.id).length
            return (
              <button
                key={c.id}
                onClick={() => toggleCluster(c.id)}
                onDoubleClick={() => onlyOneActive(c.id)}
                title={`Clic : afficher/masquer · Double-clic : isoler`}
                style={{
                  fontFamily: "inherit",
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "5px 11px", borderRadius: 100,
                  fontSize: 12, fontWeight: 600,
                  cursor: "pointer",
                  color: active ? "#1F2937" : "#9CA3AF",
                  background: active ? clusterColor(c.hue, 60, 94) : "#FAFAFA",
                  border: `1px solid ${active ? clusterColor(c.hue, 55, 72) : "#E5E7EB"}`,
                  opacity: active ? 1 : 0.6,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: clusterColor(c.hue, 65, 55), display: "inline-block" }} />
                {c.label}
                <span style={{ color: "#9CA3AF", fontWeight: 500 }}>· {count}</span>
              </button>
            )
          })}
          {activeClusters.size < CLUSTERS.length && (
            <button onClick={allActive} style={{
              fontFamily: "inherit", fontSize: 11, fontWeight: 600,
              color: "#7C63C8", background: "transparent", border: "none",
              cursor: "pointer", textDecoration: "underline", padding: "5px 8px",
            }}>
              Tout afficher
            </button>
          )}
        </div>
      </m.div>

      {/* Views */}
      <AnimatePresence mode="wait">
        {view === "list" ? (
          <m.div key="list" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease: EASE }} style={{ marginTop: 22 }}>
            <ListView candidates={filtered} onOpenDrawer={setDrawerDot} />
          </m.div>
        ) : (
          <m.div key="map" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease: EASE }} style={{ marginTop: 22 }}>
            <MapView candidates={filtered} activeClusters={activeClusters} query={q} onOpenDrawer={setDrawerDot} />
          </m.div>
        )}
      </AnimatePresence>

      {/* Drawer */}
      <DrawerCandidate dot={drawerDot} onClose={() => setDrawerDot(null)} />
    </main>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * View toggle
 * ────────────────────────────────────────────────────────────────────────── */

function ViewToggle({ view, onChange }: { view: "list" | "map"; onChange: (v: "list" | "map") => void }) {
  return (
    <div style={{
      display: "inline-flex", background: "white", border: "1px solid #E5E7EB",
      borderRadius: 100, padding: 3, gap: 2,
    }}>
      {(["list", "map"] as const).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          style={{
            fontFamily: "inherit",
            padding: "6px 14px", borderRadius: 100,
            fontSize: 12, fontWeight: 700,
            cursor: "pointer",
            color: view === v ? "white" : "#6B7280",
            background: view === v ? "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)" : "transparent",
            border: "none",
          }}
        >
          {v === "list" ? "≡ Liste" : "◍ Carte"}
        </button>
      ))}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * List view — pile de cartes candidat (scale à 200+ en virtualisant plus tard)
 * ────────────────────────────────────────────────────────────────────────── */

function ListView({ candidates, onOpenDrawer }: { candidates: CvDot[]; onOpenDrawer: (d: CvDot) => void }) {
  if (candidates.length === 0) {
    return (
      <div style={{
        padding: "60px 24px", textAlign: "center",
        background: "white", border: "1px dashed #E5E7EB", borderRadius: 14,
      }}>
        <p style={{ margin: 0, fontSize: 14, color: "#6B7280" }}>
          Aucun candidat ne correspond.
        </p>
      </div>
    )
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
      {candidates.map((c, i) => (
        <CandidateCard key={c.id} c={c} index={i} onOpen={() => onOpenDrawer(c)} />
      ))}
    </div>
  )
}

function CandidateCard({ c, index, onOpen }: { c: CvDot; index: number; onOpen: () => void }) {
  const primary = clusterById(c.primary)!
  const secondary = c.secondary ? clusterById(c.secondary) : null
  return (
    <m.button
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.015, 0.2), ease: EASE }}
      onClick={onOpen}
      style={{
        position: "relative",
        textAlign: "left", cursor: "pointer", fontFamily: "inherit",
        background: "white", border: "1px solid #F0ECF8", borderRadius: 12,
        padding: "12px 14px 12px 18px",
        display: "flex", flexDirection: "column", gap: 6,
        overflow: "hidden",
      }}
    >
      {/* Pastille couleur secteur — bord gauche */}
      <span style={{
        position: "absolute", top: 0, bottom: 0, left: 0, width: 4,
        background: secondary
          ? `linear-gradient(180deg, ${clusterColor(primary.hue, 70, 55)} 0%, ${clusterColor(secondary.hue, 70, 55)} 100%)`
          : clusterColor(primary.hue, 70, 55),
      }} />

      {/* Ligne 1 : avatar + nom + ref */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          width: 30, height: 30, borderRadius: "50%",
          background: clusterColor(primary.hue, 65, 92),
          color: clusterColor(primary.hue, 55, 35),
          fontSize: 11, fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          {c.initials}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.fullName}
          </div>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.04em", fontFamily: "var(--font-space-grotesk), monospace" }}>
            {c.ref}
          </div>
        </div>
      </div>

      {/* Ligne 2 : poste + entreprise */}
      <div style={{ fontSize: 12, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingLeft: 40 }}>
        {c.title}{c.company ? ` · ${c.company}` : ""}
      </div>

      {/* Ligne 3 : badges secteur + lieu + xp */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingLeft: 40, marginTop: 2 }}>
        <SectorBadge cluster={primary} />
        {secondary && <SectorBadge cluster={secondary} muted />}
        <span style={{ fontSize: 10.5, color: "#9CA3AF" }}>
          {c.location} · {c.yearsExperience}j XP
        </span>
      </div>

      {/* Skills chips */}
      {c.skills.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", paddingLeft: 40, marginTop: 2 }}>
          {c.skills.slice(0, 4).map((s) => (
            <span key={s} style={{
              fontSize: 10, color: "#4B5563",
              background: "#F8F6FF", border: "1px solid #F0ECF8",
              padding: "2px 7px", borderRadius: 6,
            }}>
              {s}
            </span>
          ))}
        </div>
      )}
    </m.button>
  )
}

function SectorBadge({ cluster, muted }: { cluster: Cluster; muted?: boolean }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10, fontWeight: 700,
      color: muted ? clusterColor(cluster.hue, 40, 50) : clusterColor(cluster.hue, 55, 40),
      background: muted ? "transparent" : clusterColor(cluster.hue, 65, 95),
      border: `1px solid ${clusterColor(cluster.hue, 55, muted ? 80 : 75)}`,
      padding: "1.5px 7px", borderRadius: 100,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: clusterColor(cluster.hue, 65, 55) }} />
      {cluster.label}
    </span>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Map view — le nuage, mais avec recherche/filtres qui mettent en évidence
 * ────────────────────────────────────────────────────────────────────────── */

function MapView({
  candidates, activeClusters, query, onOpenDrawer,
}: {
  candidates: CvDot[]
  activeClusters: Set<string>
  query: string
  onOpenDrawer: (d: CvDot) => void
}) {
  const W = 900
  const H = 600

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" style={{ display: "block", overflow: "visible" }}>
        <defs>
          {CLUSTERS.map((c) => (
            <radialGradient key={c.id} id={`grad-${c.id}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%"  stopColor={clusterColor(c.hue, 75, 75)} stopOpacity={activeClusters.has(c.id) ? 0.55 : 0.06} />
              <stop offset="60%" stopColor={clusterColor(c.hue, 65, 80)} stopOpacity={activeClusters.has(c.id) ? 0.3  : 0.03} />
              <stop offset="100%" stopColor={clusterColor(c.hue, 60, 85)} stopOpacity={0} />
            </radialGradient>
          ))}
        </defs>

        {/* Zones colorées */}
        {CLUSTERS.map((c) => (
          <circle key={c.id} cx={c.cx * W} cy={c.cy * H} r={c.radius * Math.min(W, H) * 1.25} fill={`url(#grad-${c.id})`} />
        ))}

        {/* Titres clusters */}
        {CLUSTERS.map((c) => {
          const active = activeClusters.has(c.id)
          return (
            <g key={`label-${c.id}`} style={{ pointerEvents: "none" }}>
              <text x={c.cx * W} y={c.cy * H - 6} fontSize={15} fontWeight={800} textAnchor="middle" fill={clusterColor(c.hue, 70, 30)} opacity={active ? 0.85 : 0.3} style={{ letterSpacing: "0.02em" }}>
                {c.label.toUpperCase()}
              </text>
              <text x={c.cx * W} y={c.cy * H + 12} fontSize={11} textAnchor="middle" fill={clusterColor(c.hue, 50, 45)} opacity={active ? 0.6 : 0.2}>
                {CV_DOTS.filter((d) => d.primary === c.id || d.secondary === c.id).length} profils
              </text>
            </g>
          )
        })}

        {/* Dots */}
        {CV_DOTS.map((dot) => {
          const pos = positionFor(dot)
          const inFilters = candidates.some((c) => c.id === dot.id)
          const highlighted = query.length > 0 && inFilters
          const dimmed = !inFilters
          return (
            <g
              key={dot.id}
              onClick={() => onOpenDrawer(dot)}
              style={{ cursor: "pointer", transition: "opacity 200ms ease" }}
            >
              <circle cx={pos.x * W} cy={pos.y * H} r={16} fill="white" opacity={dimmed ? 0.4 : 0.75} />
              <circle
                cx={pos.x * W} cy={pos.y * H}
                r={highlighted ? 16 : 13}
                fill={dotColor(dot)}
                stroke={highlighted ? "#7C63C8" : "white"}
                strokeWidth={highlighted ? 3 : 2}
                opacity={dimmed ? 0.18 : 1}
                style={{ transition: "r 160ms ease, stroke 160ms ease" }}
              />
              <text
                x={pos.x * W} y={pos.y * H + 4}
                fontSize={9.5} fontWeight={800} textAnchor="middle" fill="white"
                style={{ pointerEvents: "none", letterSpacing: "0.02em" }}
                opacity={dimmed ? 0.2 : 1}
              >
                {dot.initials}
              </text>
            </g>
          )
        })}
      </svg>

      <p style={{
        margin: "10px 0 0", fontSize: 11, color: "#9CA3AF", lineHeight: 1.5, fontStyle: "italic",
      }}>
        Astuce : clique un dot pour ouvrir le candidat dans le drawer · double-clic sur une chip secteur pour isoler ce groupe.
      </p>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Drawer — aperçu candidat à droite, ne quitte pas la vue
 * ────────────────────────────────────────────────────────────────────────── */

function DrawerCandidate({ dot, onClose }: { dot: CvDot | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {dot && (
        <>
          <m.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE }}
            onClick={onClose}
            style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(17,24,39,0.35)", backdropFilter: "blur(2px)" }}
          />
          <m.aside
            initial={{ x: 360, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 360, opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0, width: "min(380px, 90vw)", zIndex: 90,
              background: "white", borderLeft: "1px solid #E9E2F7",
              padding: "22px 22px 28px",
              boxShadow: "-12px 0 40px rgba(17,24,39,0.10)",
              fontFamily: "var(--font-inter), sans-serif",
              display: "flex", flexDirection: "column", gap: 14,
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
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: clusterColor(clusterById(dot.primary)!.hue, 65, 92),
                  color: clusterColor(clusterById(dot.primary)!.hue, 55, 35),
                  fontSize: 14, fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {dot.initials}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>{dot.fullName}</div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.04em", fontFamily: "var(--font-space-grotesk), monospace" }}>
                    {dot.ref}
                  </div>
                </div>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#374151" }}>
                {dot.title}{dot.company ? ` · ${dot.company}` : ""}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#9CA3AF" }}>
                {dot.location} · {dot.yearsExperience} an{dot.yearsExperience !== 1 ? "s" : ""} d&apos;expérience
              </p>
            </div>

            <div>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
                Secteurs
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <SectorBadge cluster={clusterById(dot.primary)!} />
                {dot.secondary && <SectorBadge cluster={clusterById(dot.secondary)!} muted />}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
                Compétences
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {dot.skills.map((s) => (
                  <span key={s} style={{
                    fontSize: 10.5, color: "#4B5563", background: "#F8F6FF",
                    border: "1px solid #F0ECF8", padding: "2px 8px", borderRadius: 6,
                  }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>

            <button style={{
              marginTop: "auto",
              fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: "white",
              padding: "10px 16px", borderRadius: 9,
              background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
              border: "none", cursor: "pointer",
            }}>
              Ouvrir la fiche complète →
            </button>
          </m.aside>
        </>
      )}
    </AnimatePresence>
  )
}
