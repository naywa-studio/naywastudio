"use client"
import { m } from "framer-motion"
import Link from "next/link"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const fu = (delay: number) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.65, delay, ease: EASE },
})

const NORA_FEATURES = [
  "Ingestion CV automatique (PDF, DOCX, photo — OCR + IA)",
  "Vivier centralisé, indexé et recherchable",
  "Matching IA contre vos missions avec score justifié",
  "Compose IA : email d'approche pré-rédigé à partir du CV + brief",
  "Pricing Syntec automatisé : marge, charges, plafonds URSSAF, calendrier",
  "Anonymisation 1 clic — PDF prêt à présenter au client",
  "Pipeline candidat : Identifié → Contacté → Réponse → Entretien → Offre",
]

const COMING_SOON = [
  {
    name: "Intégration boîte mail",
    role: "Gmail / Outlook OAuth + BCC tracking",
    desc: "Nora détecte automatiquement les réponses des candidats et les log dans le pipeline. BCC simple pour démarrer, OAuth complet pour les power users.",
    color: "#3B82F6",
    accent: "rgba(59,130,246,0.18)",
  },
  {
    name: "Domaine d'envoi personnalisé",
    role: "Envoi depuis @votre-cabinet.fr",
    desc: "Connectez votre propre domaine mail pour que vos approches partent depuis l'adresse de votre cabinet, pas depuis un sous-domaine Naywa. Délivrabilité et image de marque alignées.",
    color: "#7C3AED",
    accent: "rgba(124,58,237,0.18)",
  },
] as const

export function AgentsPreview() {
  return (
    <section
      style={{
        background: "rgba(248,246,255,0.35)",
        padding: "112px 24px",
        borderTop: "1px solid rgba(240,236,248,0.6)",
        position: "relative",
      }}
    >
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        {/* Section header */}
        <m.div
          {...fu(0)}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            marginBottom: 56,
            gap: 16,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              background: "rgba(124,99,200,0.07)",
              border: "1px solid rgba(124,99,200,0.18)",
              borderRadius: 100,
              padding: "5px 14px",
              fontSize: 11,
              fontWeight: 600,
              color: "#7C63C8",
              letterSpacing: "0.09em",
              textTransform: "uppercase" as const,
              fontFamily: "var(--font-inter), sans-serif",
            }}
          >
            L&apos;agent disponible
          </span>

          <h2
            style={{
              fontFamily: "var(--font-space-grotesk), sans-serif",
              fontSize: "clamp(28px, 3.8vw, 46px)",
              fontWeight: 800,
              color: "#111827",
              letterSpacing: "-0.025em",
              lineHeight: 1.12,
              margin: 0,
            }}
          >
            Faites connaissance avec <span style={{ color: "#7C63C8" }}>Nora</span>
          </h2>

          <p
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 15,
              color: "#6B7280",
              lineHeight: 1.7,
              margin: 0,
              maxWidth: "52ch",
            }}
          >
            Votre copilote de recrutement IA — gratuit pendant la beta privée.
            L&apos;intégration boîte mail et la rédaction d&apos;emails d&apos;approche arrivent ensuite.
          </p>
        </m.div>

        {/* Léo — featured card */}
        <m.div
          {...fu(0.1)}
          style={{
            background: "white",
            border: "1.5px solid rgba(124,99,200,0.22)",
            borderRadius: 20,
            overflow: "hidden",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 0,
            boxShadow: "0 12px 40px rgba(124,99,200,0.10)",
            marginBottom: 40,
          }}
          className="leo-card"
        >
          <div style={{ padding: "40px 36px", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: "rgba(124,99,200,0.10)",
                border: "1px solid rgba(124,99,200,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 800, color: "#7C63C8",
                fontFamily: "var(--font-space-grotesk), sans-serif",
              }}>
                N
              </div>
              <div>
                <p style={{
                  margin: 0, fontFamily: "var(--font-space-grotesk), sans-serif",
                  fontSize: 24, fontWeight: 700, color: "#111827", letterSpacing: "-0.02em",
                }}>
                  Nora
                </p>
                <p style={{
                  margin: 0, fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 13, color: "#7C63C8", fontWeight: 600,
                }}>
                  CV management & matching IA
                </p>
              </div>
              <span style={{
                marginLeft: "auto",
                background: "#7C63C8", color: "white",
                fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 100,
                letterSpacing: "0.04em", textTransform: "uppercase" as const,
                fontFamily: "var(--font-inter), sans-serif",
              }}>
                Beta privée
              </span>
            </div>

            <p style={{
              margin: 0, fontFamily: "var(--font-inter), sans-serif",
              fontSize: 15, color: "#374151", lineHeight: 1.7,
            }}>
              Vous uploadez vos CVs et décrivez vos missions. Nora parse,
              indexe, match, chiffre selon Syntec et justifie ses scores.
              Vous obtenez des shortlists prêtes à présenter — anonymisées si
              besoin.
            </p>

            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
              {NORA_FEATURES.map((f) => (
                <li key={f} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 13.5, color: "#374151",
                }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: "50%",
                    background: "rgba(124,99,200,0.10)",
                    border: "1px solid rgba(124,99,200,0.22)",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <svg width="10" height="10" viewBox="0 0 8 8" fill="none">
                      <path d="M1.5 4L3.5 6L6.5 2" stroke="#7C63C8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {f}
                </li>
              ))}
            </ul>

            <Link href="/login?mode=signup" style={{
              alignSelf: "flex-start", marginTop: 6,
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "12px 24px", borderRadius: 10,
              background: "#7C63C8", color: "white",
              fontSize: 14, fontWeight: 700, textDecoration: "none",
              boxShadow: "0 6px 20px rgba(124,99,200,0.3)",
              fontFamily: "var(--font-inter), sans-serif",
            }}>
              Rejoindre la beta privée →
            </Link>
          </div>

          {/* Right side: visual */}
          <div style={{
            background: "linear-gradient(135deg, rgba(124,99,200,0.05) 0%, rgba(184,174,222,0.10) 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "40px 24px", position: "relative", overflow: "hidden",
          }}>
            <div style={{
              position: "absolute", inset: 0,
              background: "radial-gradient(circle at 70% 30%, rgba(124,99,200,0.12), transparent 50%)",
            }} />
            <div style={{
              position: "relative", zIndex: 1,
              background: "white", borderRadius: 14,
              border: "1px solid rgba(124,99,200,0.18)",
              padding: "20px", width: "100%", maxWidth: 320,
              boxShadow: "0 12px 32px rgba(124,99,200,0.12)",
              fontFamily: "var(--font-inter), sans-serif",
            }}>
              <p style={{
                margin: "0 0 12px", fontSize: 11, fontWeight: 700,
                color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.07em",
              }}>
                Poste · Data Engineer Paris — 3 meilleurs
              </p>
              {[
                { name: "Mike M.", title: "Senior Data Engineer · BNP", score: 92 },
                { name: "Paul M.", title: "Lead Data Engineer · Datadog", score: 88 },
                { name: "Ibtissam R.", title: "Data Platform · OVH", score: 85 },
              ].map((c, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px", borderRadius: 8,
                  background: i === 0 ? "rgba(34,197,94,0.06)" : "rgba(248,246,255,0.5)",
                  border: i === 0 ? "1px solid rgba(34,197,94,0.18)" : "1px solid #F0ECF8",
                  marginBottom: 6,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</p>
                    <p style={{ margin: 0, fontSize: 10, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</p>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
                    color: c.score >= 90 ? "#16a34a" : "#F59E0B",
                    background: c.score >= 90 ? "rgba(22,163,74,0.10)" : "rgba(245,158,11,0.10)",
                  }}>{c.score}</span>
                </div>
              ))}
            </div>
          </div>
        </m.div>

        {/* Coming soon row */}
        <m.div
          {...fu(0.2)}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
            opacity: 0.85,
          }}
        >
          {COMING_SOON.map((c) => (
            <div key={c.name} style={{
              background: "white", borderRadius: 16,
              border: `1px dashed ${c.accent}`,
              padding: "22px 24px",
              display: "flex", flexDirection: "column", gap: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "rgba(0,0,0,0.04)",
                  border: `1px solid ${c.accent}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 800, color: c.color,
                  fontFamily: "var(--font-space-grotesk), sans-serif",
                }}>
                  {c.name.charAt(0)}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontFamily: "var(--font-space-grotesk), sans-serif", fontSize: 17, fontWeight: 700, color: "#111827" }}>
                    {c.name}
                  </p>
                  <p style={{ margin: 0, fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "#9CA3AF" }}>
                    {c.role}
                  </p>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  padding: "3px 9px", borderRadius: 100,
                  background: "rgba(0,0,0,0.04)", color: "#6B7280",
                  letterSpacing: "0.04em", textTransform: "uppercase" as const,
                  fontFamily: "var(--font-inter), sans-serif",
                }}>
                  Bientôt
                </span>
              </div>
              <p style={{
                margin: 0, fontFamily: "var(--font-inter), sans-serif",
                fontSize: 13, color: "#6B7280", lineHeight: 1.6,
              }}>
                {c.desc}
              </p>
            </div>
          ))}
        </m.div>

      </div>

      <style>{`
        @media (max-width: 768px) {
          .leo-card {
            grid-template-columns: 1fr !important;
          }
          .leo-card > div:last-child {
            display: none !important;
          }
        }
      `}</style>
    </section>
  )
}
