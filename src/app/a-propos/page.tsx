import type { Metadata } from "next"
import Link from "next/link"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"
import { Founders } from "@/components/sections/Founders"

export const metadata: Metadata = {
  title: "À propos",
  description:
    "Naywa Studio est porté par deux cousins. Notre conviction : l'IA traite, le sourceur décide. Naywa industrialise le traitement des CVs sans jamais retirer le contrôle au recruteur.",
}

export default function AProposPage() {
  return (
    <>
      <Navbar />

      <main style={{ position: "relative", zIndex: 1, paddingTop: 120 }}>
        {/* Hero */}
        <section style={{ padding: "0 24px 56px" }}>
          <div style={{ maxWidth: 780, margin: "0 auto" }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#7C63C8",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                fontFamily: "var(--font-inter), sans-serif",
              }}
            >
              À propos de Naywa Studio
            </span>
            <h1
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: "clamp(32px, 4.6vw, 52px)",
                fontWeight: 800,
                color: "#111827",
                margin: "12px 0 18px",
                lineHeight: 1.05,
                letterSpacing: "-0.025em",
              }}
            >
              L&apos;IA traite,{" "}
              <span
                style={{
                  fontFamily: "var(--font-instrument-serif), serif",
                  fontWeight: 400,
                  fontStyle: "italic",
                  color: "#7C63C8",
                }}
              >
                vous décidez
              </span>
              .
            </h1>
            <p
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 17,
                color: "#4B5563",
                lineHeight: 1.7,
                margin: 0,
                maxWidth: "60ch",
              }}
            >
              Naywa Studio est un studio produit qui conçoit des packages métier
              augmentés par l&apos;intelligence artificielle. Notre premier
              package est dédié au sourcing&nbsp;: <strong>Nora</strong>,
              l&apos;assistante IA qui range, score, anonymise et suit votre
              vivier de candidats — sans jamais agir à votre place.
            </p>
          </div>
        </section>

        {/* Pillars */}
        <section style={{ padding: "0 24px 80px" }}>
          <div style={{ maxWidth: 980, margin: "0 auto" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 18,
              }}
              className="a-propos-pillars"
            >
              {PILLARS.map((p) => (
                <article
                  key={p.title}
                  style={{
                    background: "white",
                    border: "1px solid #F0ECF8",
                    borderRadius: 18,
                    padding: "26px 22px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    boxShadow: "0 4px 16px rgba(124,99,200,0.05)",
                  }}
                >
                  <div
                    aria-hidden
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 11,
                      background: "linear-gradient(135deg, #F0ECF8 0%, #E2DAF6 100%)",
                      border: "1px solid rgba(124,99,200,0.30)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#7C63C8",
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      {p.icon}
                    </svg>
                  </div>
                  <h2
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      margin: 0,
                      fontSize: 16,
                      fontWeight: 700,
                      color: "#111827",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {p.title}
                  </h2>
                  <p
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      margin: 0,
                      fontSize: 14,
                      color: "#4B5563",
                      lineHeight: 1.6,
                    }}
                  >
                    {p.body}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <style>{`
            @media (max-width: 880px) {
              .a-propos-pillars { grid-template-columns: 1fr 1fr !important; }
            }
            @media (max-width: 560px) {
              .a-propos-pillars { grid-template-columns: 1fr !important; }
            }
          `}</style>
        </section>

        {/* Founders section reused from the homepage */}
        <Founders />

        {/* Final CTA */}
        <section style={{ padding: "96px 24px 112px", background: "white", borderTop: "1px solid #F0ECF8" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
            <h2
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: "clamp(24px, 3.4vw, 36px)",
                fontWeight: 800,
                color: "#111827",
                margin: "0 0 16px",
                lineHeight: 1.15,
                letterSpacing: "-0.02em",
              }}
            >
              Une question ou envie d&apos;essayer ?
            </h2>
            <p
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 15.5,
                color: "#4B5563",
                lineHeight: 1.7,
                margin: "0 0 28px",
              }}
            >
              On répond personnellement à chaque message. 15 jours d&apos;essai
              offerts, aucune carte requise.
            </p>
            <div
              style={{
                display: "inline-flex",
                gap: 10,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <Link
                href="/login?mode=signup"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                  color: "white",
                  borderRadius: 12,
                  padding: "13px 26px",
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 14.5,
                  fontWeight: 700,
                  textDecoration: "none",
                  boxShadow: "0 6px 20px -6px rgba(124,99,200,0.55)",
                }}
              >
                Créer mon cabinet
              </Link>
              <Link
                href="/contact"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  borderRadius: 12,
                  padding: "13px 24px",
                  border: "1px solid #E2DAF6",
                  background: "white",
                  color: "#4B5563",
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 14.5,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Nous contacter
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}

const PILLARS = [
  {
    title: "L'IA propose, jamais elle ne décide",
    body:
      "Nora suggère des scores, des relances, des messages d'approche. Aucune action n'est déclenchée sans approbation explicite du sourceur. Vous gardez la main sur chaque mouvement candidat.",
    icon: <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="9 12 11 14 15 10" />
    </>,
  },
  {
    title: "Un produit fait par deux cousins",
    body:
      "Équipe à taille humaine. Le produit, le code, le design, le pricing : tout passe entre nos mains. Vous parlez aux fondateurs, pas à un support.",
    icon: <>
      <path d="M16 11a4 4 0 1 0-8 0c0 1.7.9 3.2 2.3 4l-2.1 7h7.6l-2.1-7c1.4-.8 2.3-2.3 2.3-4z" />
    </>,
  },
  {
    title: "Vos données restent à vous",
    body:
      "Hébergement européen, base PostgreSQL chiffrée, RLS strict par cabinet. Aucune donnée n'est partagée entre cabinets, jamais. Vous pouvez exporter ou supprimer votre vivier à tout moment.",
    icon: <>
      <path d="M12 2 4 6v6c0 5 3.4 9.4 8 10 4.6-.6 8-5 8-10V6l-8-4z" />
    </>,
  },
]
