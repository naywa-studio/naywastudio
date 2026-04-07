"use client"
import { m } from "framer-motion"
import Link from "next/link"

const levels = [
  {
    number: 1,
    agent: "Léo",
    role: "Tri & nettoyage",
    color: "#22c55e",
    colorLight: "rgba(34,197,94,0.08)",
    borderColor: "rgba(34,197,94,0.2)",
    desc: "Uploadez un tableur, Léo trie et nettoie vos candidats.",
  },
  {
    number: 2,
    agent: "Nora",
    role: "Sourcing complet",
    color: "#3b82f6",
    colorLight: "rgba(59,130,246,0.08)",
    borderColor: "rgba(59,130,246,0.2)",
    desc: "Analyse, tri, scoring — une shortlist prête à l'usage.",
    badge: "Populaire",
  },
  {
    number: 3,
    agent: "Alex",
    role: "Recrutement piloté",
    color: "#7C63C8",
    colorLight: "rgba(124,99,200,0.08)",
    borderColor: "rgba(124,99,200,0.2)",
    desc: "Du sourcing au booking d'entretiens, tout est géré.",
  },
]

export function AgentsPreview() {
  return (
    <section style={{ background: "#FFFFFF", padding: "80px 24px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <m.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{ textAlign: "center", marginBottom: 40 }}
        >
          <p
            style={{
              fontSize: 13,
              color: "#9CA3AF",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 12,
            }}
          >
            Package Sourcing
          </p>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: "#111827", margin: 0 }}>
            3 niveaux d&apos;autonomie
          </h2>
        </m.div>

        {/* Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {levels.map(({ number, agent, role, color, colorLight, borderColor, desc, badge }, i) => (
            <m.div
              key={number}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              style={{
                position: "relative",
                background: colorLight,
                border: `1.5px solid ${borderColor}`,
                borderRadius: 16,
                padding: "24px 22px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {badge && (
                <span
                  style={{
                    position: "absolute",
                    top: -10,
                    right: 16,
                    background: color,
                    color: "white",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: 100,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {badge}
                </span>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: color,
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {number}
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>
                    {agent}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: "#6B7280" }}>{role}</p>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: "#4B5563", lineHeight: 1.55 }}>{desc}</p>
            </m.div>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 32 }}>
          <Link
            href="/catalogue"
            style={{
              display: "inline-block",
              background: "#7C63C8",
              color: "white",
              padding: "13px 28px",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Voir le catalogue complet →
          </Link>
        </div>
      </div>
    </section>
  )
}
