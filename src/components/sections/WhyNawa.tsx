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
    badge: "Notre parti pris",
    titleLine1: "Clé en main, avec vous.",
    titleAccent: "Jamais à votre place.",
    intro: [
      { t: "Un métier, c'est d'abord une expertise humaine : un jugement, une relation, une responsabilité. Notre conviction : l'IA ne remplace pas cette expertise, " },
      { t: "elle la libère", emph: true },
      { t: ". Elle absorbe la friction, clé en main, sans que vous ayez à devenir expert du prompt. Vous gardez " },
      { t: "ce qui ne se délègue pas", emph: true },
      { t: "." },
    ],
    metrics: [
      {
        value: "Vous",
        title: "La décision reste humaine",
        desc: "L'IA propose, vous tranchez. Aucun envoi, aucun classement, aucune action automatique. Vos process, votre style, vos clients.",
      },
      {
        value: "L'outil",
        title: "Clé en main, pas un chatbot",
        desc: "Rien à prompter, rien à paramétrer. Le métier n'a pas à s'adapter à l'IA : c'est l'IA qui s'adapte au métier. Nora lit les CV, les range, les note, les anonymise, calcule la marge.",
      },
      {
        value: "Métier",
        title: "Une expertise, pas un algorithme",
        desc: "On ne remplace pas un savoir-faire, on l'outille. Un outil par métier, en profondeur, avec ceux qui le vivent au quotidien.",
      },
    ],
  },
  en: {
    badge: "Where we stand",
    titleLine1: "Turnkey, with you.",
    titleAccent: "Never in your place.",
    intro: [
      { t: "A profession is, first, human expertise: judgement, a relationship, responsibility. Our conviction: AI doesn't replace that expertise, " },
      { t: "it frees it", emph: true },
      { t: ". It absorbs the friction, turnkey, without you ever becoming a prompt expert. You keep " },
      { t: "what can't be delegated", emph: true },
      { t: "." },
    ],
    metrics: [
      {
        value: "You",
        title: "The decision stays human",
        desc: "AI suggests, you decide. No sending, no ranking, no automatic action. Your process, your style, your clients.",
      },
      {
        value: "The tool",
        title: "Turnkey, not a chatbot",
        desc: "Nothing to prompt, nothing to configure. The profession doesn't adapt to the AI: the AI adapts to the profession. Nora reads CVs, files them, scores them, anonymizes them, works out the margin.",
      },
      {
        value: "Craft",
        title: "Expertise, not an algorithm",
        desc: "We don't replace craft, we equip it. One tool per profession, in depth, with the people who live it every day.",
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
              fontWeight: 500,
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
            {(c.intro as { t: string; emph?: boolean }[]).map((seg, i) =>
              seg.emph
                ? <span key={i} style={accentItalic}>{seg.t}</span>
                : <span key={i}>{seg.t}</span>
            )}
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
                  fontWeight: 500,
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
                  fontWeight: 600,
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
