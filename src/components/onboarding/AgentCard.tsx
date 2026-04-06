"use client"
import { m } from "framer-motion"

const agentMap: Record<string, { name: string; bullets: string[]; price: string }> = {
  "Recrutement / RH": {
    name: "Agent Qualification Candidats",
    bullets: ["Qualifie chaque candidat automatiquement", "Génère une fiche structurée par profil", "Transmet les meilleurs profils par email"],
    price: "À partir de 199€/mois",
  },
  "Support client": {
    name: "Agent Support 24/7",
    bullets: ["Répond aux questions clients en temps réel", "Disponible les nuits et week-ends", "Escalade vers vous si besoin"],
    price: "À partir de 149€/mois",
  },
  default: {
    name: "Agent Content",
    bullets: ["Génère 20+ contenus par mois", "Adapté à votre ton et votre secteur", "Prêt à publier sur LinkedIn et email"],
    price: "À partir de 149€/mois",
  }
}

export default function AgentCard({ answers, onNext }: { answers: Record<string, string>; onNext: () => void }) {
  const agent = agentMap[answers.sector || "default"] ?? agentMap.default
  return (
    <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
      <div style={{ background: "#F8F6FF", border: "1px solid #E2DAF6", borderRadius: 16, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontWeight: 600, color: "#111827", fontSize: 15 }}>{agent.name}</span>
          <span style={{ background: "#EEE9FB", color: "#7C63C8", fontSize: 11, fontWeight: 600,
            padding: "3px 10px", borderRadius: 100 }}>Correspond à votre profil ✓</span>
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {agent.bullets.map(b => (
            <li key={b} style={{ fontSize: 13, color: "#4B5563", display: "flex", gap: 8 }}>
              <span style={{ color: "#7C63C8" }}>✓</span> {b}
            </li>
          ))}
        </ul>
        <p style={{ marginTop: 14, fontSize: 14, fontWeight: 600, color: "#7C63C8" }}>{agent.price}</p>
      </div>
      <button
        onClick={onNext}
        style={{ background: "#7C63C8", color: "white", border: "none", borderRadius: 10,
          padding: "14px 24px", fontSize: 15, fontWeight: 600, cursor: "pointer", width: "100%" }}
      >Je veux tester cet agent →</button>
    </m.div>
  )
}
