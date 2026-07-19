"use client"
import { m } from "framer-motion"
import Link from "next/link"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const fu = (delay: number) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.65, delay, ease: EASE },
})

const content = {
  fr: {
    badge: "Au cœur du Package Sourcing",
    titlePre: "Le Package Sourcing est piloté par ",
    titleName: "Nora",
    subtitle:
      "Nora est l'assistante intégrée au package. C'est elle qui fait tout le travail de préparation — lire, ranger, comparer — pour que vous n'ayez plus qu'à décider.",
    role: "L'assistante du Package Sourcing",
    available: "Incluse",
    desc:
      "Vous déposez vos CV et vous décrivez votre mission. Nora lit chaque CV, range les candidats par secteur, les compare à votre mission et explique chaque note. Vous récupérez une liste courte, prête à présenter — anonymisée si vous le souhaitez.",
    features: [
      "Lit vos CV en PDF, y compris les documents scannés",
      "Range votre vivier par secteur, sans tri manuel",
      "Note chaque candidat sur votre mission, et dit pourquoi",
      "Chiffre la mission selon la convention Syntec : marge, charges, jours réellement facturables",
      "Montre ce que coûte une rupture pendant la période d'essai, mois par mois",
      "Anonymise un CV en un clic, à vos couleurs, prêt à envoyer au client",
      "Partage le suivi des candidats avec vos collègues",
    ],
    cta: "Démarrer l'essai de 15 jours →",
    cardLabel: "Mission · Data Engineer, Paris",
    cardNote: "Exemple illustratif",
  },
  en: {
    badge: "At the heart of Package Sourcing",
    titlePre: "Package Sourcing runs on ",
    titleName: "Nora",
    subtitle:
      "Nora is the assistant built into the package. She does all the groundwork — reading, sorting, comparing — so that all you have left to do is decide.",
    role: "The Package Sourcing assistant",
    available: "Included",
    desc:
      "You drop in your CVs and describe your role. Nora reads every CV, sorts candidates by sector, compares them against your role and explains every score. You get back a short list, ready to present — anonymized if you want it.",
    features: [
      "Reads your CVs in PDF, including scanned documents",
      "Sorts your talent pool by sector, with no manual filing",
      "Scores every candidate against your role, and says why",
      "Prices the role under the Syntec agreement: margin, payroll costs, actual billable days",
      "Shows what an early termination would cost you, month by month",
      "Anonymizes a CV in one click, in your colours, ready to send to your client",
      "Shares candidate tracking with your colleagues",
    ],
    cta: "Start the 15-day trial →",
    cardLabel: "Role · Data Engineer, Paris",
    cardNote: "Illustrative example",
  },
}

export function AgentsPreview() {
  const { lang } = useLanguage()
  const c = content[lang]
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
            {c.badge}
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
            {c.titlePre}<span style={{ color: "#7C63C8" }}>{c.titleName}</span>
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
            {c.subtitle}
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
                  {c.role}
                </p>
              </div>
              <span style={{
                marginLeft: "auto",
                background: "rgba(34,197,94,0.10)", color: "#16A34A",
                fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 100,
                letterSpacing: "0.04em", textTransform: "uppercase" as const,
                fontFamily: "var(--font-inter), sans-serif",
                border: "1px solid rgba(34,197,94,0.25)",
              }}>
                {c.available}
              </span>
            </div>

            <p style={{
              margin: 0, fontFamily: "var(--font-inter), sans-serif",
              fontSize: 15, color: "#374151", lineHeight: 1.7,
            }}>
              {c.desc}
            </p>

            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
              {c.features.map((f) => (
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
              {c.cta}
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
                margin: "0 0 2px", fontSize: 11, fontWeight: 700,
                color: "#6B7280", textTransform: "uppercase" as const, letterSpacing: "0.07em",
              }}>
                {c.cardLabel}
              </p>
              {/* Mention explicite : ces profils sont inventés, pas des
                  candidats réels. */}
              <p style={{
                margin: "0 0 12px", fontSize: 10, color: "#6B7280",
                fontStyle: "italic",
              }}>
                {c.cardNote}
              </p>
              {/* Données FICTIVES. Les employeurs sont volontairement
                  génériques : nommer de vraies entreprises laisserait croire
                  que leurs salariés figurent dans un vivier Naywa. */}
              {[
                { name: "Mehdi B.", title: "Senior Data Engineer · groupe bancaire", score: 92 },
                { name: "Paul M.", title: "Lead Data Engineer · éditeur SaaS", score: 88 },
                { name: "Inès R.", title: "Data Platform · hébergeur cloud", score: 85 },
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
