import Link from "next/link"
import { brand, type as t, accentItalic } from "@/lib/brand"
import { Eyebrow } from "@/components/brand/Eyebrow"
import { priceForSeats, formatEur } from "@/lib/pricing-plan"

/**
 * Bandes courtes du parcours d'accueil.
 *
 * TrustBar — juste sous le hero : les garanties qui lèvent le doute (UE, pas
 * d'entraînement de modèle, décision humaine).
 *   ⚠️ Volontairement SANS segmentation d'audience. L'accueil s'adresse à
 *   toutes les équipes de recrutement ; découper par type de structure ici
 *   fait sortir de la page tous ceux qui ne se reconnaissent dans aucune
 *   étiquette. La segmentation appartient à /solutions, dans le cadre du
 *   Package Sourcing.
 *
 * NoraIntro — présente l'assistante AVANT la démo. Sans elle, « Nora »
 * apparaît dans la démo sans qu'on sache ce que c'est.
 *
 * PricingTeaser — avant les fondateurs : donner l'ordre de grandeur SUR la
 * page. Sans ça, beaucoup partent chercher le prix et ne reviennent pas. Le
 * montant vient de `lib/pricing-plan` (source unique), il ne peut donc pas
 * diverger de /tarifs.
 */

const GUARANTEES = [
  "Vos données restent en Europe",
  "Vos données n'entraînent aucun modèle",
  "Aucune action déclenchée sans vous",
]

export function TrustBar() {
  return (
    <section
      style={{
        padding: "22px 24px",
        borderTop: `1px solid ${brand.border}`,
        borderBottom: `1px solid ${brand.border}`,
        background: brand.surface,
      }}
    >
      <ul
        style={{
          maxWidth: 1040,
          margin: "0 auto",
          listStyle: "none",
          padding: 0,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "8px 32px",
        }}
      >
        {GUARANTEES.map((g) => (
          <li
            key={g}
            style={{
              ...t.caption,
              fontSize: 13,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={brand.violet} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12l5 5L20 7" />
            </svg>
            {g}
          </li>
        ))}
      </ul>
    </section>
  )
}

const NORA_DOES = [
  { k: "Lit", v: "vos CVs, même scannés, et en extrait l'essentiel" },
  { k: "Range", v: "votre vivier par secteur, automatiquement" },
  { k: "Score", v: "chaque candidat face à une mission, avec la justification" },
  { k: "Rédige", v: "l'anonymisation et le message d'approche" },
]

export function NoraIntro() {
  return (
    <section style={{ padding: "88px 24px 8px" }}>
      <div
        style={{
          maxWidth: 940,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 40,
          alignItems: "center",
        }}
      >
        <div>
          <Eyebrow n="01">Faites connaissance</Eyebrow>
          <h2 style={{ ...t.h2, margin: "14px 0 14px" }}>
            Nora,{" "}
            <span style={accentItalic}>l&apos;assistante&nbsp;IA</span>
            <br />
            du Package Sourcing.
          </h2>
          <p style={{ ...t.body, margin: 0 }}>
            Nora n&apos;est pas un chatbot posé à côté de votre outil :
            c&apos;est l&apos;intelligence qui fait tourner le Package
            Sourcing, de l&apos;import du CV jusqu&apos;au message
            d&apos;approche. Elle prépare tout&nbsp;; la décision reste la
            vôtre, à chaque étape.
          </p>
        </div>

        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {NORA_DOES.map(({ k, v }) => (
            <li
              key={k}
              style={{
                background: brand.surface,
                border: `1px solid ${brand.border}`,
                borderRadius: brand.radiusMd,
                padding: "13px 16px",
                display: "flex",
                gap: 12,
                alignItems: "baseline",
              }}
            >
              <span
                style={{
                  ...t.meta,
                  color: brand.violet,
                  flexShrink: 0,
                  minWidth: 54,
                }}
              >
                {k}
              </span>
              <span style={{ ...t.body, fontSize: 14, margin: 0 }}>{v}</span>
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
          <Eyebrow n="05">Tarifs</Eyebrow>
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
