"use client"
import { m } from "framer-motion"

const agents = [
  {
    emoji: "🎯",
    name: "Agent Recrutement",
    desc: "Qualifie vos candidats, 24h/24",
    price: "À partir de 199€/mois",
  },
  {
    emoji: "💬",
    name: "Agent Support",
    desc: "Répond à vos clients sans attendre",
    price: "À partir de 149€/mois",
  },
]

export function AgentsPreview() {
  return (
    <section style={{ background: "#FFFFFF", padding: "80px 24px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <p
          style={{
            textAlign: "center",
            fontSize: 13,
            color: "#9CA3AF",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 32,
          }}
        >
          Ils ressemblent à ça
        </p>

        {/* Cards — scroll horizontal on mobile */}
        <div
          style={{
            display: "flex",
            gap: 20,
            overflowX: "auto",
            paddingBottom: 4,
          }}
        >
          {agents.map(({ emoji, name, desc, price }, i) => (
            <m.div
              key={name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              style={{
                flex: "0 0 calc(50% - 10px)",
                minWidth: 240,
                background: "#F8F6FF",
                border: "1px solid #E2DAF6",
                borderRadius: 16,
                padding: 28,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 32 }}>{emoji}</span>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#111827" }}>
                {name}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: "#4B5563" }}>{desc}</p>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#7C63C8" }}>
                {price}
              </p>
            </m.div>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 28 }}>
          <a
            href="#agents"
            style={{
              color: "#7C63C8",
              fontSize: 14,
              textDecoration: "none",
              fontWeight: 500,
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.textDecoration = "underline")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.textDecoration = "none")
            }
          >
            Voir le catalogue complet →
          </a>
        </div>
      </div>
    </section>
  )
}
