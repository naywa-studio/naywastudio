"use client"

import Link from "next/link"
import { brand, type as t, accentItalic } from "@/lib/brand"
import { Eyebrow } from "@/components/brand/Eyebrow"
import { priceForSeats, formatEur } from "@/lib/pricing-plan"
import { useLanguage } from "@/lib/i18n/LanguageContext"

/**
 * Bandes courtes du parcours d'accueil (charte v2.0).
 *
 * TrustBar — juste sous le hero : les garanties qui lèvent le doute (UE, pas
 * d'entraînement de modèle, décision humaine).
 *   ⚠️ Volontairement SANS segmentation d'audience. L'accueil s'adresse à
 *   toutes les équipes de recrutement ; découper par type de structure ici
 *   fait sortir de la page tous ceux qui ne se reconnaissent dans aucune
 *   étiquette. La segmentation appartient à /solutions.
 *
 * NoraIntro — présente l'assistante AVANT tout le reste. Sans elle, « Nora »
 * apparaît plus bas dans la page sans qu'on sache ce que c'est. C'est la
 * section qui répond à la seule question du lecteur : est-ce que je lui
 * parle, ou est-ce qu'elle travaille pour moi ?
 *
 * PricingTeaser — avant les fondateurs : donner l'ordre de grandeur SUR la
 * page. Sans ça, beaucoup partent chercher le prix et ne reviennent pas. Le
 * montant vient de `lib/pricing-plan` (source unique), il ne peut donc pas
 * diverger de /tarifs.
 */

const content = {
  fr: {
    guarantees: [
      "Vos données restent en Europe",
      "Vos données n'entraînent aucun modèle",
      "Aucune action déclenchée sans vous",
    ],
    noraEyebrow: "Faites connaissance",
    noraTitlePre: "Nora,",
    noraTitleAccent: "l'assistante IA",
    noraTitlePost: "du Package Sourcing.",
    noraBody:
      "Nora n'est pas un chatbot posé à côté de votre outil : c'est l'intelligence qui fait tourner le Package Sourcing, du dépôt du CV jusqu'au message d'approche. Elle prépare tout ; la décision reste la vôtre, à chaque étape.",
    noraDoes: [
      { k: "Lit", v: "vos CV, même scannés, et en extrait l'essentiel" },
      { k: "Range", v: "votre vivier par secteur, automatiquement" },
      { k: "Note", v: "chaque candidat face à une mission, en expliquant pourquoi" },
      { k: "Rédige", v: "le CV anonymisé et le message d'approche" },
    ],
    pricingEyebrow: "Tarifs",
    pricingFrom: "À partir de",
    pricingUnit: " / personne / mois",
    pricingBody:
      "Tarif dégressif : plus vous êtes nombreux, moins la personne coûte. La Suite Pricing Syntec reste en option.",
    pricingCta: "Voir les tarifs →",
    pricingNote: "15 jours offerts · sans carte bancaire",
  },
  en: {
    guarantees: [
      "Your data stays in Europe",
      "Your data trains no model",
      "Nothing is sent without you",
    ],
    noraEyebrow: "Get acquainted",
    noraTitlePre: "Nora,",
    noraTitleAccent: "the AI assistant",
    noraTitlePost: "behind Package Sourcing.",
    noraBody:
      "Nora isn't a chatbot sitting next to your tool: she is the intelligence that runs Package Sourcing, from the moment a CV lands to the outreach message. She prepares everything; the decision stays yours, at every step.",
    noraDoes: [
      { k: "Reads", v: "your CVs, scanned ones included, and pulls out what matters" },
      { k: "Sorts", v: "your talent pool by sector, automatically" },
      { k: "Scores", v: "every candidate against a role, and explains why" },
      { k: "Writes", v: "the anonymized CV and the outreach message" },
    ],
    pricingEyebrow: "Pricing",
    pricingFrom: "From",
    pricingUnit: " / person / month",
    pricingBody:
      "Volume pricing: the more of you there are, the less each person costs. The Syntec Pricing Suite stays optional.",
    pricingCta: "See pricing →",
    pricingNote: "15 days free · no credit card",
  },
}

export function TrustBar() {
  const { lang } = useLanguage()
  const c = content[lang]

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
        {c.guarantees.map((g) => (
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
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke={brand.violet}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 12l5 5L20 7" />
            </svg>
            {g}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function NoraIntro() {
  const { lang } = useLanguage()
  const c = content[lang]

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
          <Eyebrow n="01">{c.noraEyebrow}</Eyebrow>
          <h2 style={{ ...t.h2, margin: "14px 0 14px" }}>
            {c.noraTitlePre} <span style={accentItalic}>{c.noraTitleAccent}</span>
            <br />
            {c.noraTitlePost}
          </h2>
          <p style={{ ...t.body, margin: 0 }}>{c.noraBody}</p>
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
          {c.noraDoes.map(({ k, v }) => (
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
  const { lang } = useLanguage()
  const c = content[lang]
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
          <Eyebrow n="04">{c.pricingEyebrow}</Eyebrow>
          <p style={{ ...t.h2, fontSize: 30, margin: "12px 0 8px" }}>
            {c.pricingFrom} {from}
            <span style={{ ...t.body, fontSize: 15 }}>{c.pricingUnit}</span>
          </p>
          <p style={{ ...t.body, fontSize: 14, margin: 0 }}>{c.pricingBody}</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
          <Link href="/tarifs" className="nw-btn nw-btn-primary">
            {c.pricingCta}
          </Link>
          <span style={{ ...t.caption, fontSize: 12.5 }}>{c.pricingNote}</span>
        </div>
      </div>
    </section>
  )
}
