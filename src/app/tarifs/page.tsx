"use client"

import { useState } from "react"
import Link from "next/link"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"
import { ShaderBackground } from "@/components/ui/ShaderBackground"
import { useLanguage, type Lang } from "@/lib/i18n/LanguageContext"
import {
  priceForSeats,
  monthlyTotalEur,
  cvIncludedForSeats,
  MAX_SELF_SERVE_SEATS,
} from "@/lib/pricing-plan"

type SeatCount = 1 | 2 | 3 | 4 | 5

/**
 * Les prix ne sont plus recopiés ici : cette page dupliquait la grille (et
 * aurait dérivé du catalogue Stripe au premier changement). Tout vient
 * désormais de `lib/pricing-plan.ts`, la même source que le configurateur,
 * le checkout et le catalogue Stripe lui-même.
 */
const SEAT_CHOICES: SeatCount[] = [1, 2, 3, 4, 5]

const copy = {
  fr: {
    badge: "Tarifs",
    heroTitlePrefix: "Essayez ",
    heroTitleItalic: "gratuitement",
    heroTitleSuffix: " pendant 15 jours.",
    heroBody: "15 jours offerts pour 2 personnes, Suite Pricing comprise, sans carte bancaire. Ensuite, vous composez votre abonnement : vous choisissez le nombre de personnes, et l'option Pricing si elle vous sert.",
    seatLabel: (n: number): string => n === 1 ? "personne" : "personnes",
    seatHint: (max: number) => `Tarif dégressif : plus vous êtes nombreux, moins la personne coûte. Au-delà de ${max} personnes, `,
    talkAboutIt: "parlons-en",
    sourcingTag: "Le plan",
    sourcingTitle: "Package Sourcing",
    sourcingSubtitle: "Tout le workspace Nora, partagé entre vos collègues.",
    pricingTag: "Avec l'option",
    pricingTitle: "Package Sourcing + Suite Pricing",
    pricingSubtitle: "Pour les structures en régie qui chiffrent au TJM.",
    sourcingIncluded: [
      "Vivier organisé par secteurs (Nora classe chaque CV automatiquement)",
      "Missions créées via brief LLM + matching scoré et justifié",
      "Anonymisation 1 clic — PDF brandé à votre structure",
      "Pipeline candidat partagé entre vos collègues",
      "Support fondateurs (vous parlez à Elyas et Hussein)",
    ],
    pricingExtra: [
      "Tout le Package Sourcing",
      "Pricing Syntec automatisé — marge, charges, calendrier réel",
      "Chart risque rupture employeur (RC + licenciement)",
      "Export PDF des chiffrages, nominatif ou anonymisé",
    ],
    cta: "Démarrer mes 15 jours →",
    perMonthExcl: "/mois HT",
    perSeatLine: (v: string) => `soit ${v}/personne/mois — dégressif`,
    included: "Inclus",
    cvCapacity: "Capacité vivier",
    cvUnit: (n: string) => `${n} CV`,
    matchingsAndAnonymize: "Matchings & anonymisations",
    unlimited: "Illimités",
    recommended: "Recommandé",
    cardFootnote: "15 jours offerts — aucun prélèvement, résiliable à tout moment.",
    faqTitle: "Questions fréquentes",
    otherQuestion: "Une autre question ? ",
    writeToUs: "Écrivez-nous",
    faq: [
      {
        q: "Comment se passe la période d'essai ?",
        a: "Vous créez votre compte, votre structure dispose immédiatement de 15 jours d'accès complet au workspace — Suite Pricing comprise — pour 2 personnes (vous + 1 collègue). Aucune carte bancaire n'est demandée. Pour ajouter des collègues ou continuer après les 15 jours, vous composez votre abonnement et l'activez.",
      },
      {
        q: "Quels moyens de paiement sont acceptés ?",
        a: "Carte bancaire et prélèvement SEPA, via Stripe. Facturation mensuelle, sans engagement de durée. La résiliation est faite depuis votre console organisation, l'abonnement s'arrête à la fin de la période en cours.",
      },
      {
        q: "Puis-je ajouter ou retirer des personnes en cours de route ?",
        a: "Oui, à tout moment depuis votre console organisation. La facturation est ajustée au prorata sur votre prochaine facture, et le tarif dégressif s'applique automatiquement au nouveau nombre. Au-delà de 5 personnes, prenez rendez-vous avec nous : on construit une offre adaptée à votre structure.",
      },
      {
        q: "Qu'est-ce que la Suite Pricing, et dois-je la prendre ?",
        a: "C'est notre moteur de chiffrage à la convention Syntec : marge réelle, charges par statut, plafonds URSSAF, calendrier des jours facturables et fiche PDF à envoyer au client. C'est une option à 9,99 € par mois, prix unique quel que soit le nombre de personnes. Elle n'a de sens que si vous placez en régie et chiffrez au TJM — si vous faites du recrutement en direct, ne la prenez pas. Vous pouvez l'activer ou la retirer quand vous voulez.",
      },
      {
        q: "Mes données sont-elles isolées des autres structures ?",
        a: "Oui. Chaque structure dispose de son propre périmètre, isolé via Row Level Security au niveau de la base de données. Aucun candidat, aucune mission, aucun chiffrage ne fuite entre structures, même en cas d'erreur applicative.",
      },
    ],
  },
  en: {
    badge: "Pricing",
    heroTitlePrefix: "Try it ",
    heroTitleItalic: "free",
    heroTitleSuffix: " for 15 days.",
    heroBody: "15 days on us for 2 people, Suite Pricing included, no credit card required. After that, you build your own subscription: pick the number of people, and the Pricing option if it's useful to you.",
    seatLabel: (n: number): string => n === 1 ? "person" : "people",
    seatHint: (max: number) => `Volume discount: the more people you have, the less each one costs. Beyond ${max} people, `,
    talkAboutIt: "let's talk",
    sourcingTag: "The plan",
    sourcingTitle: "Sourcing Package",
    sourcingSubtitle: "The entire Nora workspace, shared with your colleagues.",
    pricingTag: "With the option",
    pricingTitle: "Sourcing Package + Suite Pricing",
    pricingSubtitle: "For staffing firms that quote in daily rates.",
    sourcingIncluded: [
      "Talent pool organized by sector (Nora classifies every CV automatically)",
      "Missions created from an LLM brief + scored, justified matching",
      "One-click anonymization — PDF branded to your firm",
      "Candidate pipeline shared with your colleagues",
      "Founder support (you talk directly to Elyas and Hussein)",
    ],
    pricingExtra: [
      "Everything in the Sourcing Package",
      "Automated Syntec pricing — margin, charges, real calendar",
      "Termination risk chart (mutual termination + dismissal)",
      "PDF export of quotes, named or anonymized",
    ],
    cta: "Start my 15 free days →",
    perMonthExcl: "/mo excl. VAT",
    perSeatLine: (v: string) => `i.e. ${v}/person/month — volume discount`,
    included: "Included",
    cvCapacity: "Talent pool capacity",
    cvUnit: (n: string) => `${n} CVs`,
    matchingsAndAnonymize: "Matchings & anonymizations",
    unlimited: "Unlimited",
    recommended: "Recommended",
    cardFootnote: "15 days on us — no charge, cancel anytime.",
    faqTitle: "Frequently asked questions",
    otherQuestion: "Another question? ",
    writeToUs: "Write to us",
    faq: [
      {
        q: "How does the trial period work?",
        a: "You create your account, and your firm immediately gets 15 days of full workspace access — Suite Pricing included — for 2 people (you + 1 colleague). No credit card required. To add colleagues or continue after the 15 days, you build your subscription and activate it.",
      },
      {
        q: "What payment methods are accepted?",
        a: "Credit card and SEPA direct debit, via Stripe. Monthly billing, no fixed-term commitment. Cancellation is done from your organization console; the subscription ends at the end of the current period.",
      },
      {
        q: "Can I add or remove people along the way?",
        a: "Yes, at any time from your organization console. Billing is prorated on your next invoice, and the volume discount automatically applies to the new headcount. Beyond 5 people, book a call with us: we'll build an offer tailored to your firm.",
      },
      {
        q: "What is Suite Pricing, and should I get it?",
        a: "It's our Syntec-agreement pricing engine: real margin, charges by status, URSSAF caps, billable-days calendar, and a PDF sheet to send your client. It's a €9.99/month option, flat price regardless of headcount. It only makes sense if you staff on assignment and quote in daily rates — if you do direct recruitment, skip it. You can activate or remove it whenever you want.",
      },
      {
        q: "Is my data isolated from other firms?",
        a: "Yes. Each firm has its own scope, isolated via Row Level Security at the database level. No candidate, mission, or quote ever leaks between firms, even in the event of an application error.",
      },
    ],
  },
}

function formatEur(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n)
}

export default function TarifsPage() {
  const { lang } = useLanguage()
  const t = copy[lang]
  const [seats, setSeats] = useState<SeatCount>(3)

  return (
    <>
      <ShaderBackground />
      <Navbar />

      <main style={{ position: "relative", zIndex: 1, paddingTop: 120 }}>
        {/* Hero */}
        <section style={{ padding: "0 24px 40px", textAlign: "center" }}>
          <div style={{ maxWidth: 740, margin: "0 auto" }}>
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
              {t.badge}
            </span>
            <h1
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: "clamp(34px, 5vw, 56px)",
                fontWeight: 800,
                color: "#111827",
                margin: "14px 0 18px",
                lineHeight: 1.05,
                letterSpacing: "-0.025em",
              }}
            >
              {t.heroTitlePrefix}
              <span
                style={{
                  fontFamily: "var(--font-instrument-serif), serif",
                  fontWeight: 400,
                  fontStyle: "italic",
                  color: "#7C63C8",
                }}
              >
                {t.heroTitleItalic}
              </span>
              {t.heroTitleSuffix}
            </h1>
            <p
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 16,
                color: "#4B5563",
                lineHeight: 1.7,
                margin: "0 auto",
                maxWidth: "55ch",
              }}
            >
              {t.heroBody}
            </p>
          </div>
        </section>

        {/* Seat selector */}
        <section style={{ padding: "0 24px 32px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", justifyContent: "center" }}>
            <div
              style={{
                display: "inline-flex",
                background: "white",
                border: "1px solid #E2DAF6",
                borderRadius: 14,
                padding: 4,
                boxShadow: "0 4px 16px rgba(124,99,200,0.08)",
                fontFamily: "var(--font-inter), sans-serif",
              }}
            >
              {SEAT_CHOICES.map((n) => (
                <button
                  key={n}
                  onClick={() => setSeats(n)}
                  style={{
                    padding: "10px 18px",
                    borderRadius: 10,
                    border: "none",
                    background: seats === n ? "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)" : "transparent",
                    color: seats === n ? "white" : "#4B5563",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "background 150ms",
                    fontFamily: "var(--font-inter), sans-serif",
                    minWidth: 84,
                  }}
                >
                  {n} {t.seatLabel(n)}
                </button>
              ))}
            </div>
          </div>
          <p
            style={{
              textAlign: "center",
              fontSize: 12.5,
              color: "#6B7280",
              margin: "12px 0 0",
              fontFamily: "var(--font-inter), sans-serif",
            }}
          >
            {t.seatHint(MAX_SELF_SERVE_SEATS)}
            <Link href="/contact-equipe" style={{ color: "#7C63C8", fontWeight: 600 }}>
              {t.talkAboutIt}
            </Link>
            .
          </p>
        </section>

        {/* Two packages side by side */}
        <section style={{ padding: "0 24px 56px" }}>
          <div
            style={{
              maxWidth: 1040,
              margin: "0 auto",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 24,
              alignItems: "stretch",
            }}
          >
            <PriceCard
              tag={t.sourcingTag}
              title={t.sourcingTitle}
              subtitle={t.sourcingSubtitle}
              priceMonthly={priceForSeats(seats)}
              perSeat={priceForSeats(seats) / seats}
              recommended={seats === 3}
              features={t.sourcingIncluded}
              quota={{ cvLimit: cvIncludedForSeats(seats) }}
              cta={t.cta}
              accentSoft={false}
              lang={lang}
              t={t}
            />
            <PriceCard
              tag={t.pricingTag}
              title={t.pricingTitle}
              subtitle={t.pricingSubtitle}
              priceMonthly={monthlyTotalEur(seats, true)}
              perSeat={monthlyTotalEur(seats, true) / seats}
              recommended={false}
              features={t.pricingExtra}
              quota={{ cvLimit: cvIncludedForSeats(seats) }}
              cta={t.cta}
              accentSoft
              lang={lang}
              t={t}
            />
          </div>
        </section>

        {/* FAQ */}
        <section style={{ padding: "0 24px 96px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <h3
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 18,
                fontWeight: 700,
                color: "#111827",
                margin: "0 0 18px",
                letterSpacing: "-0.01em",
              }}
            >
              {t.faqTitle}
            </h3>
            <div style={{ display: "grid", gap: 12 }}>
              {t.faq.map((q) => (
                <details
                  key={q.q}
                  style={{
                    background: "white",
                    border: "1px solid #F0ECF8",
                    borderRadius: 12,
                    padding: "14px 18px",
                    fontFamily: "var(--font-inter), sans-serif",
                  }}
                >
                  <summary
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#111827",
                      cursor: "pointer",
                      listStyle: "none",
                    }}
                  >
                    {q.q}
                  </summary>
                  <p
                    style={{
                      margin: "10px 0 0",
                      fontSize: 13.5,
                      color: "#4B5563",
                      lineHeight: 1.65,
                    }}
                  >
                    {q.a}
                  </p>
                </details>
              ))}
            </div>
            <p
              style={{
                margin: "24px 0 0",
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 13.5,
                color: "#6B7280",
                textAlign: "center",
              }}
            >
              {t.otherQuestion}
              <Link
                href="/contact"
                style={{ color: "#7C63C8", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 2 }}
              >
                {t.writeToUs}
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}

function PriceCard({
  tag, title, subtitle, priceMonthly, perSeat, recommended, features, quota, cta, accentSoft, lang, t,
}: {
  tag: string
  title: string
  subtitle: string
  priceMonthly: number
  perSeat: number
  recommended: boolean
  features: readonly string[]
  quota?: { cvLimit: number }
  cta: string
  accentSoft: boolean
  lang: Lang
  t: (typeof copy)["fr"]
}) {
  const locale = lang === "fr" ? "fr-FR" : "en-US"
  return (
    <article
      style={{
        position: "relative",
        background: "white",
        borderRadius: 24,
        border: recommended ? "1.5px solid rgba(124,99,200,0.40)" : "1.5px solid rgba(124,99,200,0.18)",
        padding: "44px 32px 32px",
        boxShadow: recommended
          ? "0 24px 56px -18px rgba(124,99,200,0.28)"
          : "0 12px 32px -16px rgba(124,99,200,0.14)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {recommended && (
        <div
          style={{
            position: "absolute",
            top: -14,
            left: "50%",
            transform: "translateX(-50%)",
            background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
            color: "white",
            fontFamily: "var(--font-inter), sans-serif",
            fontSize: 11,
            fontWeight: 700,
            padding: "5px 16px",
            borderRadius: 999,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            boxShadow: "0 8px 20px -6px rgba(124,99,200,0.55)",
          }}
        >
          {t.recommended}
        </div>
      )}

      <header style={{ marginBottom: 20 }}>
        <p
          style={{
            fontFamily: "var(--font-inter), sans-serif",
            margin: "0 0 6px",
            fontSize: 11.5,
            fontWeight: 700,
            color: "#7C63C8",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
          }}
        >
          {tag}
        </p>
        <h2
          style={{
            fontFamily: "var(--font-inter), sans-serif",
            margin: 0,
            fontSize: 24,
            fontWeight: 800,
            color: "#111827",
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
          }}
        >
          {title}
        </h2>
        <p
          style={{
            fontFamily: "var(--font-inter), sans-serif",
            margin: "6px 0 0",
            fontSize: 13.5,
            color: "#6B7280",
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </p>
      </header>

      <div
        style={{
          borderTop: "1px solid rgba(124,99,200,0.18)",
          borderBottom: "1px solid rgba(124,99,200,0.18)",
          padding: "20px 0",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 38,
              fontWeight: 800,
              color: "#111827",
              lineHeight: 1,
              letterSpacing: "-0.025em",
            }}
          >
            {formatEur(priceMonthly, locale)}
          </span>
          <span
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 13.5,
              color: "#6B7280",
              paddingBottom: 4,
              fontWeight: 500,
            }}
          >
            {t.perMonthExcl}
          </span>
        </div>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 12.5,
            color: "#6B7280",
            fontFamily: "var(--font-inter), sans-serif",
          }}
        >
          {t.perSeatLine(formatEur(perSeat, locale))}
        </p>
        {quota && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(124,99,200,0.06)",
              border: "1px solid rgba(124,99,200,0.18)",
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 12.5,
              color: "#5C46A0",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#7C63C8" }}>
              {t.included}
            </span>
            <span style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span>{t.cvCapacity}</span>
              <strong>{t.cvUnit(quota.cvLimit.toLocaleString(locale))}</strong>
            </span>
            <span style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span>{t.matchingsAndAnonymize}</span>
              <strong>{t.unlimited}</strong>
            </span>
          </div>
        )}
      </div>

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: "0 0 24px",
          display: "grid",
          gap: 10,
          flex: 1,
        }}
      >
        {features.map((feat) => (
          <li
            key={feat}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 13.5,
              color: "#374151",
              lineHeight: 1.55,
            }}
          >
            <span
              aria-hidden
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "rgba(124,99,200,0.10)",
                color: "#7C63C8",
                flexShrink: 0,
                marginTop: 2,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span>{feat}</span>
          </li>
        ))}
      </ul>

      <Link
        href="/login?mode=signup"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 6,
          background: accentSoft
            ? "white"
            : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
          color: accentSoft ? "#7C63C8" : "white",
          border: accentSoft ? "1.5px solid #7C63C8" : "none",
          fontFamily: "var(--font-inter), sans-serif",
          fontSize: 14.5,
          fontWeight: 700,
          padding: "12px 22px",
          borderRadius: 12,
          textDecoration: "none",
          boxShadow: accentSoft
            ? "none"
            : "0 8px 24px -6px rgba(124,99,200,0.55)",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {cta}
      </Link>
      <p
        style={{
          margin: "10px 0 0",
          fontFamily: "var(--font-inter), sans-serif",
          fontSize: 11.5,
          color: "#6B7280",
          textAlign: "center",
        }}
      >
        {t.cardFootnote}
      </p>
    </article>
  )
}
