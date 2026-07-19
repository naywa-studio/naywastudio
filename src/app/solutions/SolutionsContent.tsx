"use client"

import Link from "next/link"
import { PackageSourcingFlow } from "@/components/sections/PackageSourcingFlow"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const content = {
  fr: {
    heroBadge: "Le produit",
    heroTitlePre: "Des packages d'",
    heroTitleItalic: "optimisation",
    heroTitleSuffix: " de vos process métier.",
    heroDesc: "Nous traitons. Vous décidez. Choisissez le package qui correspond à votre activité.",
    stepsBadge: "Comment ça marche",
    stepsTitle: "Démarrez en 4 étapes.",
    steps: [
      { n: "01", title: "Créez votre compte", body: "Email ou Google. 30 secondes." },
      { n: "02", title: "Choisissez votre package", body: "Aujourd'hui : Package Sourcing. D'autres packages arrivent." },
      { n: "03", title: "Allouez les sièges à votre équipe", body: "Invitez vos collègues par email. Chacun reçoit son accès personnel." },
      { n: "04", title: "Utilisez le package au quotidien", body: "Votre équipe travaille dans son workspace. Nous faisons évoluer le package, vous bénéficiez des améliorations." },
    ],
    packageBadge: "Disponible",
    packageTitle: "Package Sourcing.",
    packageDesc:
      "Pour les ESN, cabinets de consulting et cabinets de recrutement. Le package Sourcing organise votre vivier candidat, score les profils sur vos missions, calcule la marge selon la convention Syntec, anonymise les CVs pour vos clients et suit votre pipeline. Aucune action ne se déclenche sans votre validation.",
    securityTitle: "Sécurité et données",
    security: [
      "Vos données sont hébergées en Europe, de bout en bout.",
      "Nos hébergeurs sont certifiés selon les standards du secteur (ISO 27001, SOC 2 Type II).",
      "Vos données n'entraînent aucun modèle d'intelligence artificielle.",
      "Chaque organisation est cloisonnée : personne ne voit le vivier d'une autre.",
      "Vous gardez le contrôle : export ou suppression de votre vivier à tout moment.",
    ],
    ctaTrial: "Activer mon essai 15 jours",
    ctaPricing: "Voir la tarification",
    roadmapBadge: "Roadmap",
    roadmapTitle: "Nous travaillons sur de nouveaux packages.",
    roadmapDesc:
      "D'autres process métier feront prochainement l'objet d'un package Naywa. Notre règle reste la même : nous automatisons ce qui peut l'être, vous gardez la décision.",
    contactTitle: "Pas de package pour vous ?",
    contactDesc: "Décrivez-nous votre process. Si nous y voyons un terrain solide, nous étudions la faisabilité d'un nouveau package.",
    contactCta: "Contactez-nous",
  },
  en: {
    heroBadge: "The product",
    heroTitlePre: "Packages that ",
    heroTitleItalic: "optimize",
    heroTitleSuffix: " your business processes.",
    heroDesc: "We handle it. You decide. Choose the package that fits your business.",
    stepsBadge: "How it works",
    stepsTitle: "Get started in 4 steps.",
    steps: [
      { n: "01", title: "Create your account", body: "Email or Google. 30 seconds." },
      { n: "02", title: "Choose your package", body: "Today: Package Sourcing. More packages coming." },
      { n: "03", title: "Allocate seats to your team", body: "Invite your colleagues by email. Each one gets their own personal access." },
      { n: "04", title: "Use the package every day", body: "Your team works in its workspace. We keep improving the package, you benefit from the updates." },
    ],
    packageBadge: "Available",
    packageTitle: "Package Sourcing.",
    packageDesc:
      "For IT consulting firms, consulting firms, and recruitment agencies. Package Sourcing organizes your candidate pool, scores profiles against your job openings, calculates margin using industry consulting rules, anonymizes CVs for your clients, and tracks your pipeline. No action is ever triggered without your approval.",
    securityTitle: "Security and data",
    security: [
      "Your data is hosted in Europe, end to end.",
      "Our hosting providers are certified to industry standards (ISO 27001, SOC 2 Type II).",
      "Your data trains no artificial intelligence model.",
      "Every organization is walled off: nobody sees another's talent pool.",
      "You stay in control: export or delete your talent pool at any time.",
    ],
    ctaTrial: "Activate my 15-day trial",
    ctaPricing: "See pricing",
    roadmapBadge: "Roadmap",
    roadmapTitle: "We're working on new packages.",
    roadmapDesc:
      "Other business processes will soon get their own Naywa package. Our rule stays the same: we automate what can be automated, you keep the decision.",
    contactTitle: "No package that fits you?",
    contactDesc: "Tell us about your process. If we see solid ground, we'll look into building a new package.",
    contactCta: "Contact us",
  },
}

export function SolutionsContent() {
  const { lang } = useLanguage()
  const c = content[lang]

  return (
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
            {c.heroBadge}
          </span>
          <h1
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontSize: "clamp(34px, 5vw, 56px)",
              fontWeight: 800,
              color: "#111827",
              margin: "14px 0 20px",
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
            }}
          >
            {c.heroTitlePre}
            <span
              style={{
                fontFamily: "var(--font-instrument-serif), serif",
                fontWeight: 400,
                fontStyle: "italic",
                color: "#7C63C8",
              }}
            >
              {c.heroTitleItalic}
            </span>
            {c.heroTitleSuffix}
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
            {c.heroDesc}
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
              {c.stepsBadge}
            </span>
            <h2
              style={{
                fontFamily: "var(--font-fraunces), serif",
                fontSize: "clamp(28px, 3.8vw, 40px)",
                fontWeight: 800,
                color: "#111827",
                margin: "12px 0 0",
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
              }}
            >
              {c.stepsTitle}
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
            {c.steps.map((s) => (
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
                    fontFamily: "var(--font-instrument-serif), serif",
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
                    fontFamily: "var(--font-fraunces), serif",
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
              {c.packageBadge}
            </span>
            <h2
              style={{
                fontFamily: "var(--font-fraunces), serif",
                fontSize: "clamp(32px, 4.4vw, 48px)",
                fontWeight: 800,
                color: "#111827",
                margin: "14px 0 16px",
                lineHeight: 1.05,
                letterSpacing: "-0.025em",
              }}
            >
              {c.packageTitle}
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
              {c.packageDesc}
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
              {c.securityTitle}
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
              {c.security.map((line) => (
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
              {c.ctaTrial}
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
              {c.ctaPricing}
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
            {c.roadmapBadge}
          </span>
          <h2
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontSize: "clamp(26px, 3.5vw, 36px)",
              fontWeight: 800,
              color: "#111827",
              margin: "12px 0 16px",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            {c.roadmapTitle}
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
            {c.roadmapDesc}
          </p>
        </div>
      </section>

      {/* ── CTA Contact ────────────────────────────────────── */}
      <section style={{ padding: "96px 24px 112px", background: "white", borderTop: "1px solid #F0ECF8" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <h2
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontSize: "clamp(26px, 3.5vw, 36px)",
              fontWeight: 800,
              color: "#111827",
              margin: "0 0 14px",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            {c.contactTitle}
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
            {c.contactDesc}
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
            {c.contactCta}
          </Link>
        </div>
      </section>
    </main>
  )
}
