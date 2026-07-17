import type { Metadata } from "next"
import Link from "next/link"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"
import { BrandBands } from "@/components/ui/BrandBands"
import { PackageSourcingFlow } from "@/components/sections/PackageSourcingFlow"
import { Eyebrow } from "@/components/brand/Eyebrow"
import { brand, type as t, accentItalic } from "@/lib/brand"

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
      <BrandBands />
      <Navbar />

      <main style={{ position: "relative", zIndex: 1, paddingTop: 120 }}>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section style={{ padding: "0 24px 72px", textAlign: "center" }}>
          <div style={{ maxWidth: 820, margin: "0 auto" }}>
            <Eyebrow n="01" align="center">Nos solutions</Eyebrow>
            <h1 style={{ ...t.h1, margin: "18px 0 20px" }}>
              Des packages d&apos;<span style={accentItalic}>optimisation</span>{" "}
              de vos process métier.
            </h1>
            <p style={{ ...t.lead, margin: "0 auto", maxWidth: "55ch" }}>
              Nous traitons. Vous décidez. Choisissez le package qui
              correspond à votre activité.
            </p>
          </div>
        </section>

        {/* ── 4 étapes pour démarrer ─────────────────────────── */}
        <section
          style={{
            background: brand.surface,
            padding: "96px 24px",
            borderTop: `1px solid ${brand.border}`,
            borderBottom: `1px solid ${brand.border}`,
          }}
        >
          <div style={{ maxWidth: 1000, margin: "0 auto" }}>
            <header style={{ textAlign: "center", marginBottom: 56 }}>
              <Eyebrow n="02" align="center">Comment ça marche</Eyebrow>
              <h2 style={{ ...t.h2, margin: "14px 0 0" }}>
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
                    background: brand.surface2,
                    border: `1px solid ${brand.border}`,
                    borderRadius: brand.radiusXl,
                    padding: "22px 22px 24px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    boxShadow: brand.shadowSm,
                  }}
                >
                  <span
                    style={{
                      ...accentItalic,
                      fontSize: 44,
                      lineHeight: 0.9,
                      letterSpacing: "-0.03em",
                    }}
                  >
                    {s.n}
                  </span>
                  <h3 style={{ ...t.h3, fontSize: 16, margin: 0 }}>{s.title}</h3>
                  <p style={{ ...t.body, fontSize: 14, margin: 0 }}>{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Package Sourcing ─────────────────────────────── */}
        <section style={{ padding: "112px 24px 80px" }}>
          <div style={{ maxWidth: 1040, margin: "0 auto" }}>
            <header style={{ textAlign: "center", marginBottom: 48 }}>
              <Eyebrow n="03" align="center" dotColor={brand.success}>
                Disponible
              </Eyebrow>
              <h2 style={{ ...t.h2, fontSize: "clamp(32px, 4.4vw, 48px)", margin: "16px 0 16px" }}>
                Package Sourcing.
              </h2>
              <p style={{ ...t.lead, margin: "0 auto", maxWidth: "60ch" }}>
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

        <section style={{ padding: "0 24px 96px" }}>
          <div style={{ maxWidth: 1040, margin: "0 auto" }}>
            {/* Sécurité */}
            <div
              style={{
                background: brand.surface,
                border: `1px solid ${brand.border}`,
                borderRadius: brand.radiusXl,
                padding: "28px 30px",
                marginBottom: 40,
              }}
            >
              <Eyebrow n="04">Sécurité et données</Eyebrow>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: "16px 0 0",
                  display: "grid",
                  gap: 12,
                }}
              >
                {SECURITY.map((line) => (
                  <li
                    key={line}
                    style={{
                      ...t.body,
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                      color: brand.text,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 5,
                        background: brand.violet100,
                        border: `1px solid ${brand.violetSoft}`,
                        flexShrink: 0,
                        marginTop: 2,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={brand.violet} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
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
              <Link href="/login?mode=signup" className="nw-btn nw-btn-primary">
                Activer mon essai 15 jours →
              </Link>
              <Link href="/tarifs" className="nw-btn nw-btn-outline">
                Voir la tarification
              </Link>
            </div>
          </div>
        </section>

        {/* ── Roadmap : nouveaux packages ───────────────────── */}
        <section
          style={{
            background: brand.surface,
            padding: "96px 24px",
            borderTop: `1px solid ${brand.border}`,
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <Eyebrow align="center">Roadmap</Eyebrow>
            <h2 style={{ ...t.h2, fontSize: "clamp(26px, 3.5vw, 36px)", margin: "14px 0 16px" }}>
              Nous travaillons sur de nouveaux packages.
            </h2>
            <p style={{ ...t.body, fontSize: 15.5, lineHeight: 1.75, margin: 0 }}>
              D&apos;autres process métier feront prochainement l&apos;objet
              d&apos;un package Naywa. Notre règle reste la même : nous
              automatisons ce qui peut l&apos;être, vous gardez la décision.
            </p>
          </div>
        </section>

        {/* ── CTA Contact — bande encre (rythme / contraste) ── */}
        <section
          style={{
            padding: "104px 24px 120px",
            background: brand.ink,
            borderTop: `1px solid ${brand.ink}`,
          }}
        >
          <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
            <h2 style={{ ...t.h2, fontSize: "clamp(26px, 3.5vw, 36px)", color: brand.sable, margin: "0 0 14px" }}>
              Pas de package pour vous&nbsp;?
            </h2>
            <p
              style={{
                ...t.body,
                fontSize: 15.5,
                lineHeight: 1.75,
                color: brand.violetSoft,
                margin: "0 0 28px",
              }}
            >
              Décrivez-nous votre process. Si nous y voyons un terrain solide,
              nous étudions la faisabilité d&apos;un nouveau package.
            </p>
            <Link href="/contact" className="nw-btn nw-btn-primary">
              Contactez-nous →
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
