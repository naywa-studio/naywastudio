import type { Metadata } from "next"
import Link from "next/link"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"
import { ShaderBackground } from "@/components/ui/ShaderBackground"
import { PackageSourcingFlow } from "@/components/sections/PackageSourcingFlow"

export const metadata: Metadata = {
  title: "Solutions",
  description:
    "Naywa Studio conçoit des packages d'optimisation de process métier. Nous traitons, vous décidez. Découvrez Package Sourcing, dédié aux ESN, cabinets de consulting et cabinets de recrutement.",
}

const ONBOARDING_STEPS = [
  {
    n: "01",
    title: "Créez votre compte",
    body: "Email ou Google. 30 secondes.",
  },
  {
    n: "02",
    title: "Choisissez votre package",
    body: "Aujourd'hui : Package Sourcing. D'autres packages arrivent.",
  },
  {
    n: "03",
    title: "Allouez les sièges à votre équipe",
    body: "Invitez vos collègues par email. Chacun reçoit son accès personnel.",
  },
  {
    n: "04",
    title: "Utilisez le package au quotidien",
    body: "Votre équipe travaille dans son workspace. Nous faisons évoluer le package, vous bénéficiez des améliorations.",
  },
] as const

const SECURITY = [
  "Hébergement européen (Vercel Paris, Supabase Francfort).",
  "Isolation stricte par organisation via RLS Postgres.",
  "Aucun entraînement de modèle sur vos données.",
  "Suppression de votre vivier à tout moment, depuis votre console organisation.",
] as const

export default function SolutionsPage() {
  return (
    <>
      <ShaderBackground />
      <Navbar />

      <main style={{ position: "relative", zIndex: 1, paddingTop: 120 }}>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section style={{ padding: "0 24px 64px", textAlign: "center" }}>
          <div style={{ maxWidth: 820, margin: "0 auto" }}>
            <span
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 11,
                fontWeight: 700,
                color: "#7C63C8",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
              }}
            >
              Nos solutions
            </span>
            <h1
              style={{
                fontFamily: "var(--font-title), sans-serif",
                fontSize: "clamp(34px, 5vw, 56px)",
                fontWeight: 700,
                color: "#111827",
                margin: "14px 0 20px",
                lineHeight: 1.05,
                letterSpacing: "-0.025em",
              }}
            >
              Des packages d&apos;<span
                style={{
                  fontFamily: "var(--font-accent), serif",
                  fontWeight: 400,
                  fontStyle: "italic",
                  color: "#7C63C8",
                }}
              >
                optimisation
              </span>{" "}
              de vos process métier.
            </h1>
            <p
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 17,
                color: "#4B5563",
                lineHeight: 1.7,
                margin: "0 auto",
                maxWidth: "55ch",
              }}
            >
              Nous traitons. Vous décidez. Choisissez le package qui
              correspond à votre activité.
            </p>
          </div>
        </section>

        {/* ── 4 étapes pour démarrer ─────────────────────────── */}
        <section
          style={{
            background: "rgba(248,246,255,0.4)",
            padding: "96px 24px",
            borderTop: "1px solid rgba(240,236,248,0.6)",
          }}
        >
          <div style={{ maxWidth: 1000, margin: "0 auto" }}>
            <header style={{ textAlign: "center", marginBottom: 56 }}>
              <span
                style={{
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#7C63C8",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                }}
              >
                Comment ça marche
              </span>
              <h2
                style={{
                  fontFamily: "var(--font-title), sans-serif",
                  fontSize: "clamp(28px, 3.8vw, 40px)",
                  fontWeight: 700,
                  color: "#111827",
                  margin: "12px 0 0",
                  lineHeight: 1.1,
                  letterSpacing: "-0.02em",
                }}
              >
                Démarrez en 4 étapes.
              </h2>
            </header>

            <ol
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 18,
              }}
            >
              {ONBOARDING_STEPS.map((s) => (
                <li
                  key={s.n}
                  style={{
                    background: "white",
                    border: "1px solid #F0ECF8",
                    borderRadius: 18,
                    padding: "22px 22px 24px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    boxShadow: "0 4px 16px rgba(124,99,200,0.05)",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-accent), serif",
                      fontStyle: "italic",
                      fontSize: 44,
                      lineHeight: 0.9,
                      color: "#7C63C8",
                      letterSpacing: "-0.03em",
                    }}
                  >
                    {s.n}
                  </span>
                  <h3
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 16,
                      fontWeight: 700,
                      color: "#111827",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {s.title}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 14,
                      color: "#4B5563",
                      lineHeight: 1.65,
                    }}
                  >
                    {s.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Package Sourcing ─────────────────────────────── */}
        <section style={{ padding: "112px 24px 80px" }}>
          <div style={{ maxWidth: 1040, margin: "0 auto" }}>
            <header style={{ textAlign: "center", marginBottom: 48 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#7C63C8",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#22C55E",
                    boxShadow: "0 0 0 4px rgba(34,197,94,0.18)",
                  }}
                />
                Disponible
              </span>
              <h2
                style={{
                  fontFamily: "var(--font-title), sans-serif",
                  fontSize: "clamp(32px, 4.4vw, 48px)",
                  fontWeight: 700,
                  color: "#111827",
                  margin: "14px 0 16px",
                  lineHeight: 1.05,
                  letterSpacing: "-0.025em",
                }}
              >
                Package Sourcing.
              </h2>
              <p
                style={{
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 16,
                  color: "#4B5563",
                  lineHeight: 1.7,
                  margin: "0 auto 22px",
                  maxWidth: "60ch",
                }}
              >
                Pour les ESN, cabinets de consulting et cabinets de recrutement.
                Le package Sourcing organise votre vivier candidat, score les
                profils sur vos missions, calcule la marge selon la convention
                Syntec, anonymise les CVs pour vos clients et suit votre
                pipeline. Aucune action ne se déclenche sans votre validation.
              </p>
            </header>
          </div>
        </section>

        {/* Frise interactive Package Sourcing */}
        <PackageSourcingFlow />

        <section style={{ padding: "0 24px 80px" }}>
          <div style={{ maxWidth: 1040, margin: "0 auto" }}>
            {/* Sécurité */}
            <div
              style={{
                background: "rgba(248,246,255,0.55)",
                border: "1px solid #F0ECF8",
                borderRadius: 18,
                padding: "26px 28px",
                marginBottom: 40,
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#7C63C8",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  margin: "0 0 14px",
                }}
              >
                Sécurité et données
              </p>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "grid",
                  gap: 10,
                }}
              >
                {SECURITY.map((line) => (
                  <li
                    key={line}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 14,
                      color: "#374151",
                      lineHeight: 1.65,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 5,
                        background: "rgba(124,99,200,0.10)",
                        border: "1px solid rgba(124,99,200,0.22)",
                        flexShrink: 0,
                        marginTop: 2,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#7C63C8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* CTAs */}
            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <Link
                href="/login?mode=signup"
                style={{
                  background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                  color: "white",
                  borderRadius: 12,
                  padding: "14px 28px",
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 15,
                  fontWeight: 700,
                  textDecoration: "none",
                  boxShadow: "0 6px 20px -6px rgba(124,99,200,0.55)",
                  letterSpacing: "-0.01em",
                }}
              >
                Activer mon essai 15 jours
              </Link>
              <Link
                href="/tarifs"
                style={{
                  borderRadius: 12,
                  padding: "14px 24px",
                  border: "1px solid #E2DAF6",
                  background: "white",
                  color: "#4B5563",
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 15,
                  fontWeight: 600,
                  textDecoration: "none",
                  letterSpacing: "-0.01em",
                }}
              >
                Voir la tarification
              </Link>
            </div>
          </div>
        </section>

        {/* ── Roadmap : nouveaux packages ───────────────────── */}
        <section
          style={{
            background: "rgba(248,246,255,0.4)",
            padding: "96px 24px",
            borderTop: "1px solid rgba(240,236,248,0.6)",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <span
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 11,
                fontWeight: 700,
                color: "#7C63C8",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
              }}
            >
              Roadmap
            </span>
            <h2
              style={{
                fontFamily: "var(--font-title), sans-serif",
                fontSize: "clamp(26px, 3.5vw, 36px)",
                fontWeight: 700,
                color: "#111827",
                margin: "12px 0 16px",
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
              }}
            >
              Nous travaillons sur de nouveaux packages.
            </h2>
            <p
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 15.5,
                color: "#4B5563",
                lineHeight: 1.75,
                margin: 0,
              }}
            >
              D&apos;autres process métier feront prochainement l&apos;objet
              d&apos;un package Naywa. Notre règle reste la même : nous
              automatisons ce qui peut l&apos;être, vous gardez la décision.
            </p>
          </div>
        </section>

        {/* ── CTA Contact ────────────────────────────────────── */}
        <section style={{ padding: "96px 24px 112px", background: "white", borderTop: "1px solid #F0ECF8" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
            <h2
              style={{
                fontFamily: "var(--font-title), sans-serif",
                fontSize: "clamp(26px, 3.5vw, 36px)",
                fontWeight: 700,
                color: "#111827",
                margin: "0 0 14px",
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
              }}
            >
              Pas de package pour vous ?
            </h2>
            <p
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 15.5,
                color: "#4B5563",
                lineHeight: 1.75,
                margin: "0 0 26px",
              }}
            >
              Décrivez-nous votre process. Si nous y voyons un terrain solide,
              nous étudions la faisabilité d&apos;un nouveau package.
            </p>
            <Link
              href="/contact"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                color: "white",
                borderRadius: 12,
                padding: "13px 26px",
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 14.5,
                fontWeight: 700,
                textDecoration: "none",
                boxShadow: "0 6px 20px -6px rgba(124,99,200,0.55)",
                letterSpacing: "-0.01em",
              }}
            >
              Contactez-nous
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
