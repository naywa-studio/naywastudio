"use client"

import Script from "next/script"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"
import { useLanguage } from "@/lib/i18n/LanguageContext"

/**
 * Même embed Lark que /contact-equipe (voir la note là-bas sur next/script). On
 * partage volontairement le MÊME scheduler : c'est le même créneau côté équipe.
 * Seul le cadrage change — ici « rencontre / découverte », pas « 5+ sièges ».
 */

const LARK_SCHEDULER_URL =
  "https://cjp35hkl3bla.jp.larksuite.com/scheduler/embed/7ff72813640fcff3"
const LARK_WIDGET_SCRIPT =
  "https://cjp35hkl3bla.jp.larksuite.com/scheduler/embed/scheduler-widget.js"

const copy = {
  fr: {
    badge: "Nous rencontrer",
    title: "20 minutes avec l'équipe",
    body: "Une question, une hésitation, l'envie de voir si Naywa colle à votre façon de recruter ? Prenez un créneau : vous parlez directement aux personnes qui conçoivent et font tourner le produit — pas à un commercial.",
    noscript: (
      <>
        La prise de rendez-vous nécessite JavaScript. Écrivez-nous à{" "}
        <a href="mailto:contact@naywastudio.com" style={{ color: "#7B63C8", fontWeight: 600 }}>
          contact@naywastudio.com
        </a>
        .
      </>
    ),
    fallback: (
      <>
        Aucun créneau ne vous convient ? Écrivez-nous à{" "}
        <a href="mailto:contact@naywastudio.com" style={{ color: "#7B63C8", fontWeight: 600 }}>
          contact@naywastudio.com
        </a>
        .
      </>
    ),
  },
  en: {
    badge: "Meet the team",
    title: "20 minutes with the team",
    body: "A question, a doubt, or just want to see whether Naywa fits the way you recruit? Grab a slot: you talk directly with the people who design and run the product — not a salesperson.",
    noscript: (
      <>
        Booking a slot requires JavaScript. Email us at{" "}
        <a href="mailto:contact@naywastudio.com" style={{ color: "#7B63C8", fontWeight: 600 }}>
          contact@naywastudio.com
        </a>
        .
      </>
    ),
    fallback: (
      <>
        None of these slots work for you? Email us at{" "}
        <a href="mailto:contact@naywastudio.com" style={{ color: "#7B63C8", fontWeight: 600 }}>
          contact@naywastudio.com
        </a>
        .
      </>
    ),
  },
}

export function NousRencontrerContent() {
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
                color: "#7B63C8",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              {t.badge}
            </p>
            <h1
              style={{
                margin: "10px 0 0",
                fontFamily: "var(--font-fraunces), serif",
                fontSize: 38,
                lineHeight: 1.15,
                fontWeight: 800,
                color: "#1A1B2E",
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
                color: "#4B4C5E",
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
              boxShadow: "0 12px 40px -16px rgba(123,99,200,0.28)",
            }}
          >
            {/* Hauteur alignée sur /contact-equipe : 626px (défaut Lark) coupait
                le calendrier et forçait un scroll dans le scroll. */}
            <div
              className="scheduler-inline-widget"
              data-url={LARK_SCHEDULER_URL}
              style={{ width: "100%", height: 900 }}
            />
            <noscript>
              <p style={{ padding: 24, textAlign: "center", fontSize: 14, color: "#4B4C5E" }}>
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
              color: "#6B6C7F",
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
