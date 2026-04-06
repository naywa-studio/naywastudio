"use client"
import { CheckCircle, Clock, Settings } from "lucide-react"
import { m } from "framer-motion"

const items = [
  {
    Icon: CheckCircle,
    title: "Déployé en 48h, pas en 3 mois",
    desc: "On configure votre agent en quelques heures, pas en quelques mois.",
  },
  {
    Icon: Clock,
    title: "Vos agents travaillent nuits et week-ends",
    desc: "Disponibilité 24/7, sans heure sup ni congés.",
  },
  {
    Icon: Settings,
    title: "Tout se configure depuis votre espace client",
    desc: "Modifiez les règles, le ton, les scénarios — sans toucher au code.",
  },
]

export function WhyNawa() {
  return (
    <section style={{ background: "#F8F6FF", padding: "80px 24px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 20,
          }}
        >
          {items.map(({ Icon, title, desc }, i) => (
            <m.div
              key={title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              style={{
                background: "#FFFFFF",
                border: "1px solid #E4EDE6",
                borderRadius: 14,
                padding: 24,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                transition: "box-shadow 150ms",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLDivElement).style.boxShadow =
                  "0 4px 16px rgba(0,0,0,0.07)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLDivElement).style.boxShadow = "none")
              }
            >
              <Icon size={22} color="#7C63C8" strokeWidth={2} />
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#111827" }}>
                {title}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: "#4B5563", lineHeight: 1.5 }}>
                {desc}
              </p>
            </m.div>
          ))}
        </div>
      </div>
    </section>
  )
}
