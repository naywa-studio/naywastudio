"use client"

import Script from "next/script"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import { MAX_SELF_SERVE_SEATS } from "@/lib/pricing-plan"

/**
 * L'embed Lark s'injecte via `next/script` : un <script> écrit directement dans
 * du JSX n'est jamais exécuté par React (il est traité comme du markup inerte).
 * `afterInteractive` = chargé après l'hydratation, sans bloquer le rendu.
 */

const LARK_SCHEDULER_URL =
  "https://cjp35hkl3bla.jp.larksuite.com/scheduler/embed/7ff72813640fcff3"
const LARK_WIDGET_SCRIPT =
  "https://cjp35hkl3bla.jp.larksuite.com/scheduler/embed/scheduler-widget.js"

const copy = {
  fr: {
    badge: (n: number) => `Plus de ${n} personnes`,
    title: "Parlons de votre équipe",
    body: "À partir d'une certaine taille, une grille standard ne veut plus dire grand-chose. Prenez 20 minutes avec nous : on regarde votre volume, votre organisation et vos missions, et on construit l'offre qui colle. Vous parlez directement aux fondateurs.",
    noscript: (
      <>
        La prise de rendez-vous nécessite JavaScript. Écrivez-nous à{" "}
        <a href="mailto:contact@naywastudio.com" style={{ color: "#7C63C8", fontWeight: 600 }}>
          contact@naywastudio.com
        </a>
        .
      </>
    ),
    fallback: (
      <>
        Le créneau ne vous convient pas ? Écrivez-nous à{" "}
        <a href="mailto:contact@naywastudio.com" style={{ color: "#7C63C8", fontWeight: 600 }}>
          contact@naywastudio.com
        </a>
        .
      </>
    ),
  },
  en: {
    badge: (n: number) => `More than ${n} people`,
    title: "Let's talk about your team",
    body: "Past a certain size, a standard grid stops meaning much. Take 20 minutes with us: we look at your volume, your organization and your missions, and build the offer that fits. You speak directly with the founders.",
    noscript: (
      <>
        Booking a slot requires JavaScript. Email us at{" "}
        <a href="mailto:contact@naywastudio.com" style={{ color: "#7C63C8", fontWeight: 600 }}>
          contact@naywastudio.com
        </a>
        .
      </>
    ),
    fallback: (
      <>
        This slot doesn&apos;t work for you? Email us at{" "}
        <a href="mailto:contact@naywastudio.com" style={{ color: "#7C63C8", fontWeight: 600 }}>
          contact@naywastudio.com
        </a>
        .
      </>
    ),
  },
}

export function ContactEquipeContent() {
  const { lang } = useLanguage()
  const t = copy[lang]

  return (
    <>
      <Navbar />
      <main
        style={{
          minHeight: "100vh",
          background: "#FFFFFF",
          paddingTop: 96,
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        <section style={{ padding: "0 24px 32px", textAlign: "center" }}>
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 700,
                color: "#7C63C8",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              {t.badge(MAX_SELF_SERVE_SEATS)}
            </p>
            <h1
              style={{
                margin: "10px 0 0",
                fontFamily: "var(--font-fraunces), serif",
                fontSize: 38,
                lineHeight: 1.15,
                fontWeight: 800,
                color: "#111827",
                letterSpacing: "-0.03em",
              }}
            >
              {t.title}
            </h1>
            <p
              style={{
                margin: "14px auto 0",
                maxWidth: 520,
                fontSize: 15,
                lineHeight: 1.65,
                color: "#4B5563",
              }}
            >
              {t.body}
            </p>
          </div>
        </section>

        <section style={{ padding: "0 24px 96px" }}>
          <div
            style={{
              maxWidth: 900,
              margin: "0 auto",
              background: "#F8F6FF",
              border: "1px solid #E2DAF6",
              borderRadius: 20,
              padding: 12,
              boxShadow: "0 12px 40px -16px rgba(124,99,200,0.28)",
            }}
          >
            {/* 626px (la valeur par défaut de l'embed Lark) coupait le
                calendrier : le widget rendait sa propre barre de défilement
                interne, et il fallait scroller DANS le scroll de la page pour
                voir les créneaux. On lui donne la hauteur de son contenu. */}
            <div
              className="scheduler-inline-widget"
              data-url={LARK_SCHEDULER_URL}
              style={{ width: "100%", height: 900 }}
            />
            <noscript>
              <p style={{ padding: 24, textAlign: "center", fontSize: 14, color: "#4B5563" }}>
                {t.noscript}
              </p>
            </noscript>
          </div>

          <p
            style={{
              maxWidth: 900,
              margin: "16px auto 0",
              textAlign: "center",
              fontSize: 12.5,
              color: "#6B7280",
            }}
          >
            {t.fallback}
          </p>
        </section>
      </main>
      <Footer />
      <Script src={LARK_WIDGET_SCRIPT} strategy="afterInteractive" />
    </>
  )
}
