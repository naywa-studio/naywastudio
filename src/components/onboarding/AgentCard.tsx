"use client"
import { m } from "framer-motion"

interface Level {
  number: number
  name: string
  role: string
  color: string
  colorLight: string
  features: string[]
  result: string
}

const LEVELS: Level[] = [
  {
    number: 1,
    name: "Léo",
    role: "Agent de tri & nettoyage",
    color: "#22c55e",
    colorLight: "rgba(34,197,94,0.08)",
    features: [
      "Upload de tableur (export Walaxy, CSV…)",
      "Définition du profil cible en langage naturel",
      "Tableur nettoyé avec profils pertinents",
    ],
    result: "Un tableur propre et exploitable, prêt à l'usage.",
  },
  {
    number: 2,
    name: "Nora",
    role: "Agent maître de sourcing",
    color: "#3b82f6",
    colorLight: "rgba(59,130,246,0.08)",
    features: [
      "Analyse fine du besoin de recrutement",
      "Tri automatique et nettoyage des listes",
      "Scoring & priorisation des candidats",
      "Shortlist prête à l'usage",
    ],
    result: "Une shortlist priorisée de candidats qualifiés.",
  },
  {
    number: 3,
    name: "Alex",
    role: "Agent orchestrateur complet",
    color: "#7C63C8",
    colorLight: "rgba(124,99,200,0.08)",
    features: [
      "Analyse du besoin & rédaction d'offres",
      "Sourcing & chasse active de candidats",
      "Contact candidats & booking d'entretiens",
      "Synthèse & dossiers candidats complets",
    ],
    result: "Dossiers candidats complets, prêts à présenter.",
  },
]

function recommendLevel(answers: Record<string, string>): Level {
  const pain = answers.pain ?? ""
  const autonomy = answers.autonomy ?? ""
  const volume = answers.volume ?? ""

  // Level 3 — high volume, full process, or full automation
  if (
    autonomy.includes("complète") ||
    autonomy.includes("clé en main") ||
    pain.includes("tout le processus") ||
    pain.includes("planifier les entretiens") ||
    volume.includes("Plus de 20")
  ) {
    return LEVELS[2]
  }

  // Level 2 — moderate needs, shortlists, delegate qualification
  if (
    autonomy.includes("déléguer") ||
    pain.includes("shortlists") ||
    volume.includes("5 à 20")
  ) {
    return LEVELS[1]
  }

  // Level 1 — simple, keep control
  return LEVELS[0]
}

interface AgentCardProps {
  answers: Record<string, string>
  onNext: (agentName: string, level: number) => void
}

export default function AgentCard({ answers, onNext }: AgentCardProps) {
  const level = recommendLevel(answers)

  return (
    <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
      <div
        style={{
          background: "white",
          border: `1.5px solid ${level.color}30`,
          borderRadius: 16,
          padding: "24px 22px",
          position: "relative",
        }}
      >
        {/* Level badge */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32, height: 32, borderRadius: "50%",
                background: level.color, color: "white",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 700,
              }}
            >
              {level.number}
            </div>
            <div>
              <span style={{ fontWeight: 700, color: "#111827", fontSize: 18 }}>{level.name}</span>
              <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>{level.role}</p>
            </div>
          </div>
          <span
            style={{
              background: level.colorLight,
              color: level.color,
              fontSize: 11,
              fontWeight: 600,
              padding: "4px 12px",
              borderRadius: 100,
              border: `1px solid ${level.color}25`,
            }}
          >
            Recommandé pour vous ✓
          </span>
        </div>

        {/* Features */}
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {level.features.map((f) => (
            <li key={f} style={{ fontSize: 13, color: "#4B5563", display: "flex", gap: 8, alignItems: "flex-start", lineHeight: 1.5 }}>
              <span style={{ color: level.color, flexShrink: 0 }}>✓</span> {f}
            </li>
          ))}
        </ul>

        {/* Result box */}
        <div
          style={{
            marginTop: 16,
            background: level.colorLight,
            borderRadius: 10,
            padding: "12px 14px",
            border: `1px solid ${level.color}20`,
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 600, color: level.color, margin: "0 0 2px" }}>Résultat</p>
          <p style={{ fontSize: 13, color: "#374151", margin: 0, lineHeight: 1.5 }}>{level.result}</p>
        </div>
      </div>

      <button
        onClick={() => onNext(level.name, level.number)}
        style={{
          background: level.color,
          color: "white",
          border: "none",
          borderRadius: 12,
          padding: "14px 24px",
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
          width: "100%",
          transition: "opacity 150ms",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      >
        Démarrer avec {level.name} →
      </button>
    </m.div>
  )
}
