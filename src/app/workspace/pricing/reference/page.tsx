"use client"

import Link from "next/link"
import { m } from "framer-motion"

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

const CONVENTION_SYNTEC: RefItem[] = [
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
]

const BAREMES_2026: RefItem[] = [
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
]

const CODE_TRAVAIL: RefItem[] = [
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
]

export default function PricingReferencePage() {
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
          ← Retour au pricing
        </Link>
        <span style={{
          display: "inline-block",
          fontSize: 11, fontWeight: 700, color: "#7C63C8",
          background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.18)",
          padding: "4px 11px", borderRadius: 100,
          letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12,
        }}>
          Référence Syntec
        </span>
        <h1 style={{
          margin: 0, fontSize: "clamp(24px, 3vw, 30px)",
          fontWeight: 800, color: "#111827",
          letterSpacing: "-0.025em", lineHeight: 1.15,
        }}>
          Les articles que Naywa applique
        </h1>
        <p style={{
          margin: "8px 0 0", fontSize: 14, color: "#6B7280",
          lineHeight: 1.6, maxWidth: 720,
        }}>
          Cette page liste uniquement les articles de la convention collective
          Syntec et du Code du travail effectivement utilisés par le moteur de
          pricing. Pour chacun, on précise ce qu&apos;il représente et à quel
          endroit du widget il intervient.
        </p>
      </div>

      <RefCategory
        label="Convention collective Syntec"
        accent="#7C63C8"
        items={CONVENTION_SYNTEC}
        delay={0}
      />
      <RefCategory
        label="Barèmes 2026"
        accent="#0EA5E9"
        items={BAREMES_2026}
        delay={0.06}
      />
      <RefCategory
        label="Code du travail"
        accent="#15803D"
        items={CODE_TRAVAIL}
        delay={0.12}
      />

      <footer style={{
        marginTop: 32, padding: "14px 18px",
        background: "rgba(124,99,200,0.05)",
        border: "1px solid rgba(124,99,200,0.18)",
        borderRadius: 12,
        fontSize: 12.5, color: "#4B5563", lineHeight: 1.6,
      }}>
        Les taux et grilles sont mis à jour annuellement. Pour un cas
        atypique (taux AT spécifique, expatriation hors zone standard,
        clause contractuelle particulière), contactez-nous depuis la page{" "}
        <Link href="/contact" style={{ color: "#7C63C8", fontWeight: 700, textDecoration: "underline" }}>
          Contact
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
