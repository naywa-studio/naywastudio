"use client"

import { useState } from "react"
import Link from "next/link"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"
import { ShaderBackground } from "@/components/ui/ShaderBackground"
import { QUOTAS_BY_PLAN } from "@/lib/quota-tiers"

type SeatCount = 1 | 2 | 3 | 4

const SOURCING: Record<SeatCount, number> = {
  1: 38.99,
  2: 69.99,
  3: 94.99,
  4: 119.99,
}
const SOURCING_PRO: Record<SeatCount, number> = {
  1: 46.99,
  2: 85.99,
  3: 118.99,
  4: 151.99,
}

const SOURCING_INCLUDED = [
  "Vivier vivant illimité (Nora range vos candidats par zone métier)",
  "Missions créées via brief LLM + matching scoré et justifié",
  "Anonymisation 1 clic — PDF brandé à votre structure",
  "Pipeline candidat partagé entre vos collègues",
  "Support fondateurs (vous parlez à Elyas et Hussein)",
]

const PRO_EXTRA = [
  "Tout Package Sourcing",
  "Pricing Syntec automatisé — marge, charges, calendrier réel",
  "Chart risque rupture employeur (RC + licenciement)",
  "Export PDF des chiffrages, nominatif ou anonymisé",
]

function formatEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n)
}

export default function TarifsPage() {
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
              Tarifs
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
              Essayez{" "}
              <span
                style={{
                  fontFamily: "var(--font-instrument-serif), serif",
                  fontWeight: 400,
                  fontStyle: "italic",
                  color: "#7C63C8",
                }}
              >
                gratuitement
              </span>{" "}
              pendant 15 jours.
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
              15 jours offerts, jusqu&apos;à 2 sièges, sans carte bancaire.
              Pour aller au-delà ou prolonger l&apos;accès, vous choisissez
              une formule ci-dessous — la souscription ne démarre qu&apos;une
              fois validée.
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
              {([1, 2, 3, 4] as SeatCount[]).map((n) => (
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
                  {n} {n === 1 ? "siège" : "sièges"}
                </button>
              ))}
            </div>
          </div>
          <p
            style={{
              textAlign: "center",
              fontSize: 12.5,
              color: "#9CA3AF",
              margin: "12px 0 0",
              fontFamily: "var(--font-inter), sans-serif",
            }}
          >
            Au-delà de 4 sièges,{" "}
            <Link href="/contact" style={{ color: "#7C63C8", fontWeight: 600 }}>
              contactez-nous
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
              tag="Le package"
              title="Package Sourcing"
              subtitle="Tout le workspace Nora, partagé entre vos collègues."
              priceMonthly={SOURCING[seats]}
              perSeat={SOURCING[seats] / seats}
              recommended={seats === 3}
              features={SOURCING_INCLUDED}
              quota={QUOTAS_BY_PLAN[`sourcing_${seats}`]}
              cta="Démarrer mes 15 jours →"
              accentSoft={false}
            />
            <PriceCard
              tag="Premium"
              title="Package Sourcing Pro"
              subtitle="Pour les structures qui veulent un accompagnement renforcé."
              priceMonthly={SOURCING_PRO[seats]}
              perSeat={SOURCING_PRO[seats] / seats}
              recommended={false}
              features={PRO_EXTRA}
              quota={QUOTAS_BY_PLAN[`sourcing_pro_${seats}`]}
              cta="Démarrer mes 15 jours →"
              accentSoft
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
              Questions fréquentes
            </h3>
            <div style={{ display: "grid", gap: 12 }}>
              {FAQ.map((q) => (
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
              Une autre question ?{" "}
              <Link
                href="/contact"
                style={{ color: "#7C63C8", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 2 }}
              >
                Écrivez-nous
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
  tag, title, subtitle, priceMonthly, perSeat, recommended, features, quota, cta, accentSoft,
}: {
  tag: string
  title: string
  subtitle: string
  priceMonthly: number
  perSeat: number
  recommended: boolean
  features: readonly string[]
  quota?: { cvLimit: number; storageBytes: number; llmMonthly: number }
  cta: string
  accentSoft: boolean
}) {
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
          Recommandé
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
            {formatEur(priceMonthly)}
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
            /mois HT
          </span>
        </div>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 12.5,
            color: "#9CA3AF",
            fontFamily: "var(--font-inter), sans-serif",
          }}
        >
          soit {formatEur(perSeat)}/siège/mois — dégressif
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
              Inclus
            </span>
            <span style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span>Capacité vivier</span>
              <strong>{quota.cvLimit.toLocaleString("fr-FR")} CV</strong>
            </span>
            <span style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span>Matchings &amp; anonymisations</span>
              <strong>Illimités</strong>
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
          color: "#9CA3AF",
          textAlign: "center",
        }}
      >
        15 jours offerts — aucun prélèvement, résiliable à tout moment.
      </p>
    </article>
  )
}

const FAQ = [
  {
    q: "Comment se passe la période d'essai ?",
    a: "Vous créez votre compte, votre structure dispose immédiatement de 15 jours d'accès complet au workspace, jusqu'à 2 sièges (vous + 1 collègue). Aucune carte bancaire n'est demandée. Pour ajouter plus de membres ou prolonger après les 15 jours, vous choisissez une formule et activez l'abonnement.",
  },
  {
    q: "Quels moyens de paiement sont acceptés ?",
    a: "Carte bancaire et prélèvement SEPA, via Stripe. Facturation mensuelle, sans engagement de durée. La résiliation est faite depuis votre console organisation, l'abonnement s'arrête à la fin de la période en cours.",
  },
  {
    q: "Que se passe-t-il si je dépasse mon nombre de sièges ?",
    a: "Vous pouvez ajouter ou retirer des sièges à tout moment depuis votre console organisation. La facturation est ajustée au prorata sur votre prochaine facture. Au-delà de 4 sièges, contactez-nous pour une offre adaptée.",
  },
  {
    q: "Quelle différence entre Sourcing et Sourcing Pro ?",
    a: "Sourcing donne accès à tout le workspace candidat : vivier vivant, missions, matching scoré, anonymisation et pipeline partagé. Sourcing Pro ajoute le moteur Pricing Syntec — calcul de marge automatisé, charges et plafonds URSSAF, calendrier réel, chart de risque rupture employeur, export PDF des chiffrages. C'est l'offre adaptée aux structures qui chiffrent leurs missions au TJM.",
  },
  {
    q: "Mes données sont-elles isolées des autres structures ?",
    a: "Oui. Chaque structure dispose de son propre périmètre, isolé via Row Level Security au niveau de la base de données. Aucun candidat, aucune mission, aucun chiffrage ne fuite entre structures, même en cas d'erreur applicative.",
  },
] as const
