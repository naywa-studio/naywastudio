"use client"
import { m } from "framer-motion"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import { Eyebrow } from "@/components/brand/Eyebrow"
import { accentItalic } from "@/lib/brand"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const fu = (delay: number) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.65, delay, ease: EASE },
})

const content = {
  fr: {
    badge: "Notre proposition de valeur",
    titleLine1: "L'IA traite,",
    titleAccent: "vous décidez.",
    intro:
      "Une IA clé en main, pensée pour votre métier — pas un chatbot de plus. Vous n'avez pas à devenir expert du prompt : l'outil fait le travail d'exécution, vous gardez le jugement et la décision.",
    metrics: [
      {
        value: "Vous",
        title: "La décision reste vôtre",
        desc: "L'IA ne travaille jamais à votre place — elle travaille pour vous. Aucun envoi, aucun classement, aucune action automatique : Nora propose, vous tranchez. Vos process, votre style, vos clients.",
      },
      {
        value: "L'outil",
        title: "Clé en main, pas un chatbot",
        desc: "Rien à prompter, rien à paramétrer. Nora lit les CV, les range, les note, les anonymise, calcule la marge. Le métier n'a pas à devenir expert de l'IA — l'IA se met au service du métier.",
      },
      {
        value: "Métier",
        title: "Conçu pour le métier",
        desc: "Un métier ne se pilote pas avec une IA générique. Nous bâtissons un outil par métier, en profondeur, avec les structures qui le vivent au quotidien.",
      },
    ],
  },
  en: {
    badge: "Our value proposition",
    titleLine1: "AI does the work,",
    titleAccent: "you decide.",
    intro:
      "A turnkey AI, built for your profession — not just another chatbot. You don't have to become a prompt expert: the tool handles the execution, you keep the judgement and the decision.",
    metrics: [
      {
        value: "You",
        title: "The decision stays yours",
        desc: "AI never works in your place — it works for you. No sending, no ranking, no automatic action: Nora suggests, you decide. Your process, your style, your clients.",
      },
      {
        value: "The tool",
        title: "Turnkey, not a chatbot",
        desc: "Nothing to prompt, nothing to configure. Nora reads CVs, files them, scores them, anonymizes them, works out the margin. The profession shouldn't have to master AI — AI puts itself at the service of the craft.",
      },
      {
        value: "Craft",
        title: "Built for the craft",
        desc: "A profession isn't run with a generic AI. We build one tool per profession, in depth, with the teams who live it every day.",
      },
    ],
  },
}

export function WhyNawa() {
  const { lang } = useLanguage()
  const c = content[lang]
  const metrics = c.metrics
  return (
    <section
      style={{
        background: "transparent",
        padding: "112px 24px",
        borderTop: "1px solid rgba(233,225,203,0.6)",
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
            marginBottom: 80,
            gap: 16,
          }}
        >
          <Eyebrow n="03" align="center">{c.badge}</Eyebrow>

          <h2
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontSize: "clamp(28px, 3.8vw, 46px)",
              fontWeight: 800,
              color: "#1A1B2E",
              letterSpacing: "-0.025em",
              lineHeight: 1.12,
              margin: 0,
              maxWidth: "22ch",
            }}
          >
            {c.titleLine1}<br />
            <span style={accentItalic}>{c.titleAccent}</span>
          </h2>

          <p
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 15,
              color: "#6B6C7F",
              lineHeight: 1.7,
              margin: 0,
              maxWidth: "50ch",
            }}
          >
            {c.intro}
          </p>
        </m.div>

        {/* Metrics row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          }}
        >
          {metrics.map(({ value, title, desc }, i) => (
            <m.div
              key={value}
              {...fu(0.1 + i * 0.1)}
              style={{
                padding: "44px 40px",
                borderTop: "3px solid #7B63C8",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                position: "relative",
              }}
            >
              {/* Subtle separator between items (not after last) */}
              {i < metrics.length - 1 && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    width: 1,
                    height: "100%",
                    background: "linear-gradient(to bottom, transparent, #B8AEDE 30%, #B8AEDE 70%, transparent)",
                  }}
                />
              )}

              {/* Big metric */}
              <div
                style={{
                  fontFamily: "var(--font-fraunces), serif",
                  fontSize: "clamp(56px, 6.5vw, 80px)",
                  fontWeight: 800,
                  color: "#7B63C8",
                  lineHeight: 1,
                  letterSpacing: "-0.04em",
                }}
              >
                {value}
              </div>

              {/* Title */}
              <p
                style={{
                  margin: 0,
                  fontFamily: "var(--font-fraunces), serif",
                  fontSize: 17,
                  fontWeight: 700,
                  color: "#1A1B2E",
                  letterSpacing: "-0.01em",
                }}
              >
                {title}
              </p>

              {/* Description */}
              <p
                style={{
                  margin: 0,
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 14,
                  color: "#6B6C7F",
                  lineHeight: 1.7,
                }}
              >
                {desc}
              </p>
            </m.div>
          ))}
        </div>

      </div>
    </section>
  )
}
