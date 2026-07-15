"use client"

import Link from "next/link"
import { m } from "framer-motion"
import { useLanguage, type Lang } from "@/lib/i18n/LanguageContext"

/**
 * /workspace/pricing/reference
 *
 * Doc Syntec consultable par tout sourceur (owner + member). On liste
 * uniquement les articles que Naywa applique réellement dans le moteur
 * de pricing, avec une phrase claire sur ce qu'ils représentent et où
 * ils interviennent. Pas de formule, pas de détails de calcul — le
 * sourceur veut savoir "à quoi sert tel article" pas comment on l'a
 * codé.
 *
 * Structure :
 *   - 3 catégories : Convention Syntec / Code du travail / Barèmes 2026
 *   - 2 colonnes desktop, 1 colonne mobile
 *   - Chaque article = carte avec source, titre, résumé court, et le
 *     contexte d'application dans Naywa.
 */

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

interface RefItem {
  source: string         // "Article 4.2", "L1242-10", "Annexe IC 2026"
  title: string          // Titre humain
  summary: string        // 1-2 phrases sur le contenu
  whereWeUse: string     // "Appliqué dans le chart Risque rupture"
}

const CONVENTION_SYNTEC: Record<Lang, RefItem[]> = {
  fr: [
    {
      source: "Article 3.4",
      title: "Période d'essai",
      summary: "Durée initiale + renouvellement de la période d'essai en CDI. Le renouvellement n'est pas automatique : il exige un accord écrit du salarié et de l'employeur.",
      whereWeUse: "Chart Risque rupture, toggle « Renouvellement » par mission.",
    },
    {
      source: "Article 4.2",
      title: "Préavis CDI",
      summary: "Durée du préavis selon statut et ancienneté. Cadre = 3 mois. ETAM assimilé cadre = 2 mois. ETAM selon coefficient et ancienneté.",
      whereWeUse: "Chart Risque rupture, coût rupture employeur post-essai.",
    },
    {
      source: "Article 4.5",
      title: "Indemnité conventionnelle de licenciement",
      summary: "Indemnité due au salarié licencié à partir de 8 mois d'ancienneté. Formule cadre (1/3 dès 2 ans) ou ETAM (1/4 puis 1/3 après 10 ans). La règle la plus favorable au salarié l'emporte.",
      whereWeUse: "Chart Risque rupture, indemnité ajoutée au coût rupture.",
    },
    {
      source: "Article 31",
      title: "Prime de vacances",
      summary: "Prime annuelle de 10 % des congés payés (≈ 1 % du brut annuel). Versée typiquement en mai-juin.",
      whereWeUse: "Coût employeur mensuel (mensualisée /12).",
    },
    {
      source: "Article 4 chap. 2",
      title: "Modalités de réalisation",
      summary: "Modalité 1 (forfait horaire), modalité 2 (forfait hebdo 38h30 → +15 % mini conventionnel), modalité 3 (forfait jours 218 j → +20 % mini conventionnel).",
      whereWeUse: "Verdict « cible / plancher Syntec » sur le brut.",
    },
  ],
  en: [
    {
      source: "Article 3.4",
      title: "Trial period",
      summary: "Initial length + renewal of the trial period for permanent contracts. Renewal isn't automatic: it requires written agreement from both the employee and the employer.",
      whereWeUse: "Termination risk chart, per-mission « Renewal » toggle.",
    },
    {
      source: "Article 4.2",
      title: "Notice period (permanent contract)",
      summary: "Notice period length based on status and seniority. Manager (Cadre) = 3 months. ETAM assimilated to manager = 2 months. ETAM based on coefficient and seniority.",
      whereWeUse: "Termination risk chart, post-trial employer termination cost.",
    },
    {
      source: "Article 4.5",
      title: "Contractual severance pay",
      summary: "Severance owed to an employee dismissed after 8 months of seniority. Manager formula (1/3 of a month per year from 2 years) or ETAM (1/4 then 1/3 after 10 years). The rule most favorable to the employee applies.",
      whereWeUse: "Termination risk chart, severance added to the termination cost.",
    },
    {
      source: "Article 31",
      title: "Vacation bonus",
      summary: "Annual bonus of 10% of paid-leave pay (≈ 1% of annual gross salary). Typically paid in May-June.",
      whereWeUse: "Monthly employer cost (spread over 12 months).",
    },
    {
      source: "Article 4 chap. 2",
      title: "Working-time arrangements",
      summary: "Arrangement 1 (hourly package), arrangement 2 (38.5h weekly package → +15% on the contractual minimum), arrangement 3 (218-day annual package → +20% on the contractual minimum).",
      whereWeUse: "« Target / Syntec floor » verdict on gross salary.",
    },
  ],
}

const BAREMES_2026: Record<Lang, RefItem[]> = {
  fr: [
    {
      source: "Annexe IC 2026",
      title: "Grille minima Cadres",
      summary: "Minimum mensuel conventionnel selon position (2.1, 2.2, 2.3, 3.1…) et coefficient (95 à 270).",
      whereWeUse: "Vérification du brut proposé contre le mini Syntec.",
    },
    {
      source: "Annexe ETAM 2026",
      title: "Grille minima ETAM",
      summary: "Minimum mensuel conventionnel selon position et coefficient ETAM (240 à 500).",
      whereWeUse: "Vérification du brut proposé contre le mini Syntec.",
    },
    {
      source: "Charges patronales",
      title: "Taux moyens 2026",
      summary: "ETAM ~38 % · ETAM assimilé cadre ~42 % · Cadre ~44 %. Expatrié hors France métropolitaine ~22 %. Versement mobilité Paris inclus.",
      whereWeUse: "Coût employeur — base de calcul de la marge.",
    },
  ],
  en: [
    {
      source: "Annexe IC 2026",
      title: "Manager (Cadre) minimum wage scale",
      summary: "Contractual monthly minimum based on position (2.1, 2.2, 2.3, 3.1…) and coefficient (95 to 270).",
      whereWeUse: "Checks the proposed gross salary against the Syntec minimum.",
    },
    {
      source: "Annexe ETAM 2026",
      title: "ETAM minimum wage scale",
      summary: "Contractual monthly minimum based on ETAM position and coefficient (240 to 500).",
      whereWeUse: "Checks the proposed gross salary against the Syntec minimum.",
    },
    {
      source: "Employer payroll taxes",
      title: "2026 average rates",
      summary: "ETAM ~38% · ETAM assimilated to manager ~42% · Manager ~44%. Expatriate outside mainland France ~22%. Paris mobility payment included.",
      whereWeUse: "Employer cost — basis for the margin calculation.",
    },
  ],
}

const CODE_TRAVAIL: Record<Lang, RefItem[]> = {
  fr: [
    {
      source: "L3141-3",
      title: "Congés payés (25 j/an)",
      summary: "Obligation légale de 2,5 jours ouvrables de CP par mois de travail effectif, soit 25 jours/an. Non modifiable.",
      whereWeUse: "Haircut CP+RTT sur le revenu facturable (jours payés non facturables).",
    },
    {
      source: "L1242-10",
      title: "Période d'essai CDD",
      summary: "1 jour ouvré par semaine de contrat, plafonné à 2 semaines (CDD ≤ 6 mois) ou 1 mois (CDD > 6 mois). Différente de la période d'essai CDI Syntec.",
      whereWeUse: "Chart Risque rupture sur mission CDD.",
    },
    {
      source: "L1243-1 / L1243-4",
      title: "Rupture anticipée du CDD par l'employeur",
      summary: "Dommages-intérêts dus au salarié : montant des salaires restants jusqu'au terme du contrat. S'ajoute à la prime de précarité.",
      whereWeUse: "Chart Risque rupture en CDD post-essai.",
    },
    {
      source: "L1243-8",
      title: "Prime de précarité (fin de CDD)",
      summary: "10 % de la rémunération brute totale versée pendant le CDD. Due à l'échéance normale du contrat. Non due en cas de CDD requalifié en CDI ou rupture pendant l'essai.",
      whereWeUse: "Chart Risque rupture, coût au terme du CDD.",
    },
    {
      source: "R1234-2",
      title: "Indemnité légale de licenciement",
      summary: "Plancher légal : 1/4 de mois par année d'ancienneté jusqu'à 10 ans, 1/3 au-delà. Naywa applique le maximum entre la formule Syntec et la formule légale.",
      whereWeUse: "Chart Risque rupture, indemnité CDI post-essai.",
    },
  ],
  en: [
    {
      source: "L3141-3",
      title: "Paid leave (25 days/year)",
      summary: "Legal requirement of 2.5 working days of paid leave per month actually worked, i.e. 25 days/year. Cannot be modified.",
      whereWeUse: "Paid-leave + RTT haircut on billable revenue (paid days that aren't billable).",
    },
    {
      source: "L1242-10",
      title: "Trial period (fixed-term contract)",
      summary: "1 working day per week of contract, capped at 2 weeks (fixed-term contract ≤ 6 months) or 1 month (fixed-term contract > 6 months). Different from the Syntec permanent-contract trial period.",
      whereWeUse: "Termination risk chart for fixed-term missions.",
    },
    {
      source: "L1243-1 / L1243-4",
      title: "Early termination of a fixed-term contract by the employer",
      summary: "Damages owed to the employee: an amount equal to the remaining salary until the contract's term. Added to the end-of-contract bonus.",
      whereWeUse: "Termination risk chart for fixed-term contracts, post-trial.",
    },
    {
      source: "L1243-8",
      title: "End-of-contract bonus (fixed-term contract)",
      summary: "10% of the total gross pay received during the fixed-term contract. Owed at the contract's normal end date. Not owed if the contract is reclassified as permanent, or terminated during the trial period.",
      whereWeUse: "Termination risk chart, cost at the end of the fixed-term contract.",
    },
    {
      source: "R1234-2",
      title: "Statutory severance pay",
      summary: "Legal floor: 1/4 month per year of seniority up to 10 years, 1/3 beyond that. Naywa applies the higher of the Syntec formula and the statutory formula.",
      whereWeUse: "Termination risk chart, permanent-contract severance post-trial.",
    },
  ],
}

const pageCopy = {
  fr: {
    back: "← Retour au pricing",
    badge: "Référence Syntec",
    title: "Les articles que Naywa applique",
    intro: (
      <>Cette page liste uniquement les articles de la convention collective
      Syntec et du Code du travail effectivement utilisés par le moteur de
      pricing. Pour chacun, on précise ce qu&apos;il représente et à quel
      endroit du widget il intervient.</>
    ),
    categorySyntec: "Convention collective Syntec",
    categoryBaremes: "Barèmes 2026",
    categoryCodeTravail: "Code du travail",
    footer: (
      <>Les taux et grilles sont mis à jour annuellement. Pour un cas
      atypique (taux AT spécifique, expatriation hors zone standard,
      clause contractuelle particulière), contactez-nous depuis la page{" "}</>
    ),
    contact: "Contact",
  },
  en: {
    back: "← Back to pricing",
    badge: "Syntec reference",
    title: "The articles Naywa applies",
    intro: (
      <>This page lists only the articles from the Syntec collective
      agreement and the French labor code that the pricing engine actually
      uses. For each one, it explains what it means and where it applies
      in the widget.</>
    ),
    categorySyntec: "Syntec collective agreement",
    categoryBaremes: "2026 scales",
    categoryCodeTravail: "Labor code",
    footer: (
      <>Rates and scales are updated annually. For an atypical case
      (specific work-injury rate, expatriation outside the standard zone,
      a particular contract clause), contact us from the{" "}</>
    ),
    contact: "Contact",
  },
}

export default function PricingReferencePage() {
  const { lang } = useLanguage()
  const t = pageCopy[lang]
  return (
    <main style={{
      maxWidth: 1280,
      margin: "0 auto",
      padding: "32px 28px 72px",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 26 }}>
        <Link href="/workspace/pricing" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 13, color: "#7C63C8", textDecoration: "none", marginBottom: 18,
        }}>
          {t.back}
        </Link>
        <span style={{
          display: "inline-block",
          fontSize: 11, fontWeight: 700, color: "#7C63C8",
          background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.18)",
          padding: "4px 11px", borderRadius: 100,
          letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12,
        }}>
          {t.badge}
        </span>
        <h1 style={{
          margin: 0, fontSize: "clamp(24px, 3vw, 30px)",
          fontWeight: 800, color: "#111827",
          letterSpacing: "-0.025em", lineHeight: 1.15,
        }}>
          {t.title}
        </h1>
        <p style={{
          margin: "8px 0 0", fontSize: 14, color: "#6B7280",
          lineHeight: 1.6, maxWidth: 720,
        }}>
          {t.intro}
        </p>
      </div>

      <RefCategory
        label={t.categorySyntec}
        accent="#7C63C8"
        items={CONVENTION_SYNTEC[lang]}
        delay={0}
      />
      <RefCategory
        label={t.categoryBaremes}
        accent="#0EA5E9"
        items={BAREMES_2026[lang]}
        delay={0.06}
      />
      <RefCategory
        label={t.categoryCodeTravail}
        accent="#15803D"
        items={CODE_TRAVAIL[lang]}
        delay={0.12}
      />

      <footer style={{
        marginTop: 32, padding: "14px 18px",
        background: "rgba(124,99,200,0.05)",
        border: "1px solid rgba(124,99,200,0.18)",
        borderRadius: 12,
        fontSize: 12.5, color: "#4B5563", lineHeight: 1.6,
      }}>
        {t.footer}
        <Link href="/contact" style={{ color: "#7C63C8", fontWeight: 700, textDecoration: "underline" }}>
          {t.contact}
        </Link>
        .
      </footer>
    </main>
  )
}

/* ──────────────────────────────────────────────────────────────────────── */

function RefCategory({
  label, accent, items, delay,
}: {
  label: string
  accent: string
  items: RefItem[]
  delay: number
}) {
  return (
    <m.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: EASE }}
      style={{ marginBottom: 30 }}
    >
      <div style={{
        display: "flex", alignItems: "baseline", gap: 10,
        marginBottom: 14,
      }}>
        <span style={{
          width: 4, height: 18, borderRadius: 4,
          background: accent, display: "inline-block",
        }} />
        <h2 style={{
          margin: 0, fontSize: 16, fontWeight: 800,
          color: "#111827", letterSpacing: "-0.01em",
        }}>
          {label}
        </h2>
      </div>

      <div className="ref-grid" style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 14,
      }}>
        {items.map((it) => (
          <article
            key={it.source + it.title}
            style={{
              padding: "16px 18px",
              background: "white",
              border: "1px solid #F0ECF8",
              borderRadius: 12,
              display: "flex", flexDirection: "column", gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{
                fontSize: 10.5, fontWeight: 700,
                color: accent, letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}>
                {it.source}
              </span>
              <h3 style={{
                margin: 0, fontSize: 14, fontWeight: 700, color: "#111827",
                letterSpacing: "-0.005em",
              }}>
                {it.title}
              </h3>
            </div>
            <p style={{
              margin: 0, fontSize: 13, color: "#4B5563", lineHeight: 1.6,
            }}>
              {it.summary}
            </p>
            <p style={{
              margin: 0, fontSize: 12, color: "#7C63C8", lineHeight: 1.55,
              fontWeight: 500,
            }}>
              {it.whereWeUse}
            </p>
          </article>
        ))}
      </div>

      <style>{`
        @media (max-width: 880px) {
          .ref-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </m.section>
  )
}
