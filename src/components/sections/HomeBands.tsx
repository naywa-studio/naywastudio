import Link from "next/link"
import { brand, type as t } from "@/lib/brand"
import { Eyebrow } from "@/components/brand/Eyebrow"
import { priceForSeats, formatEur } from "@/lib/pricing-plan"

/**
 * Deux bandes courtes du nouveau parcours d'accueil.
 *
 * TrustBar — juste sous le hero : le visiteur doit se reconnaître en trois
 * secondes (ESN / consulting / recrutement) et voir les garanties qui lèvent
 * le doute (UE, pas d'entraînement de modèle, décision humaine).
 *
 * PricingTeaser — avant les fondateurs : donner l'ordre de grandeur SUR la
 * page. Sans ça, beaucoup partent pour aller chercher le prix et ne
 * reviennent pas. Le montant vient de `lib/pricing-plan` (source unique), il
 * ne peut donc pas diverger de /tarifs.
 */

const AUDIENCE = ["ESN", "Cabinets de consulting", "Cabinets de recrutement"]

const GUARANTEES = [
  "Hébergé dans l'Union européenne",
  "Vos données n'entraînent aucun modèle",
  "Aucune action déclenchée sans vous",
]

export function TrustBar() {
  return (
    <section
      style={{
        padding: "28px 24px",
        borderTop: `1px solid ${brand.border}`,
        borderBottom: `1px solid ${brand.border}`,
        background: brand.surface,
      }}
    >
      <div
        style={{
          maxWidth: 1040,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px 32px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <span style={{ ...t.meta }}>Conçu pour</span>
          {AUDIENCE.map((a) => (
            <span
              key={a}
              style={{
                fontFamily: brand.fontBody,
                fontSize: 13,
                fontWeight: 600,
                color: brand.text,
                background: brand.surface2,
                border: `1px solid ${brand.border}`,
                borderRadius: brand.radiusPill,
                padding: "5px 14px",
              }}
            >
              {a}
            </span>
          ))}
        </div>

        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexWrap: "wrap",
            gap: "6px 20px",
          }}
        >
          {GUARANTEES.map((g) => (
            <li
              key={g}
              style={{
                ...t.caption,
                fontSize: 12.5,
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={brand.violet} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12l5 5L20 7" />
              </svg>
              {g}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function PricingTeaser() {
  const from = formatEur(priceForSeats(1))

  return (
    <section style={{ padding: "88px 24px" }}>
      <div
        style={{
          maxWidth: 880,
          margin: "0 auto",
          background: brand.surface,
          border: `1px solid ${brand.border}`,
          borderRadius: brand.radiusXl,
          padding: "36px 32px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          boxShadow: brand.shadowMd,
        }}
      >
        <div style={{ minWidth: 260 }}>
          <Eyebrow n="04">Tarifs</Eyebrow>
          <p style={{ ...t.h2, fontSize: 30, margin: "12px 0 8px" }}>
            À partir de {from}
            <span style={{ ...t.body, fontSize: 15 }}> / personne / mois</span>
          </p>
          <p style={{ ...t.body, fontSize: 14, margin: 0 }}>
            Tarif dégressif : plus vous êtes nombreux, moins la personne coûte.
            La Suite Pricing Syntec reste en option.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
          <Link href="/tarifs" className="nw-btn nw-btn-primary">
            Voir les tarifs →
          </Link>
          <span style={{ ...t.caption, fontSize: 12.5 }}>
            15 jours offerts · sans carte bancaire
          </span>
        </div>
      </div>
    </section>
  )
}
