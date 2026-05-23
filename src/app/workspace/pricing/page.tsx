"use client"

/**
 * /workspace/pricing — Page de référence Syntec
 *
 * On remet tous les paramètres à plat avant de reconstruire le calculateur
 * dessus. Chaque section liste les valeurs officielles convention Syntec
 * IDCC 1486 (avenant salaires 27/11/2025, en vigueur 1er janvier 2026)
 * sourcées dans docs/syntec-bareme-2026.json. Les zones marquées "vide"
 * sont les valeurs qu'on n'a pas trouvées dans la convention ou qui
 * nécessitent une validation expert paie.
 */

import { m } from "framer-motion"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

export default function PricingPage() {
  return (
    <main style={mainStyle}>
      <Header />

      <Section title="1 · Statuts Syntec" icon="👔">
        <p style={paragraphStyle}>
          Trois statuts sont utilisés dans le calculateur. Les <em>Assimilés Cadre</em> ne
          sont pas une catégorie Syntec officielle — c&apos;est un statut social
          (cotisations) appliqué aux ETAM coef 400/450/500 dans la pratique ESN.
        </p>
        <Table
          headers={["Code", "Libellé", "Cotise APEC", "Prévoyance 1,5% T1", "Coefficients couverts"]}
          rows={[
            ["etam", "ETAM", "Non", "Non", "240 → 355 (et 400-500 si non assimilé)"],
            ["etam_assimile_cadre", "ETAM Assimilé Cadre", "Oui", "Oui", "400, 450, 500 (par pratique)"],
            ["cadre", "Cadre (Ingénieurs & Cadres)", "Oui", "Oui", "95 → 270"],
          ]}
        />
      </Section>

      <Section title="2 · Positions Syntec" icon="📋">
        <SubTitle>ETAM — positions 1.x à 3.x</SubTitle>
        <Table
          headers={["Position", "Coefficient", "Minimum mensuel brut 2026 (€)", "Profil type"]}
          rows={[
            ["1.1", "240", "1 815", "Entrée, junior technicien"],
            ["1.2", "250", "1 845", "Junior confirmé"],
            ["2.1", "275", "1 875", "Technicien expérimenté"],
            ["2.2", "310", "1 905", "Animateur d'équipe"],
            ["2.3", "355", "2 045", "Confirmé / référent"],
            ["3.1", "400", "2 185", "Expert technique"],
            ["3.2", "450", "2 340", "Très qualifié"],
            ["3.3", "500", "2 490", "ETAM senior, frontière cadre"],
          ]}
        />
        <SubTitle>Cadre (IC) — positions 1.x à 3.x</SubTitle>
        <Table
          headers={["Position", "Coefficient", "Minimum mensuel brut 2026 (€)", "Profil type"]}
          rows={[
            ["1.1", "95", "2 135", "Jeune diplômé Bac+5"],
            ["1.2", "100", "2 240", "Ingénieur débutant 1-2 ans"],
            ["2.1 (< 26 ans)", "105", "2 315", "Ingénieur junior < 26 ans"],
            ["2.1 (≥ 26 ans)", "115", "2 530", "Ingénieur confirmé ≥ 26 ans"],
            ["2.2", "130", "2 850", "Senior / lead position"],
            ["2.3", "150", "3 275", "Senior confirmé / consultant"],
            ["3.1", "170", "3 650", "Manager / chef de projet"],
            ["3.2", "210", "4 495", "Senior manager / expert"],
            ["3.3", "270", "5 755", "Director / principal / partner"],
          ]}
        />
        <CalloutInfo>
          Plancher conventionnel ETAM 2026 : <strong>2 145 €</strong>. SMIC mensuel brut 2026 :
          <strong> 1 823 €</strong> (au 1er janvier) → <strong>1 867 €</strong> (au 1er juin).
        </CalloutInfo>
      </Section>

      <Section title="3 · Heures hebdo & modalités" icon="⏱">
        <p style={paragraphStyle}>
          Trois modalités de durée du travail Syntec. Les modalités 2 et 3 imposent
          une majoration du minimum conventionnel.
        </p>
        <Table
          headers={["Modalité", "Libellé", "Heures hebdo", "Statuts éligibles", "Majoration mini"]}
          rows={[
            ["1", "Standard", "35h", "Tous (ETAM + Cadres)", "—"],
            ["2", "Réalisation de missions", "38h30 (max 1 700h/an)", "Cadres + ETAM position 3.x", "+15 %"],
            ["3", "Forfait jours", "218 jours/an", "Cadres position 2.3 et plus", "+20 %"],
          ]}
        />
        <CalloutInfo>
          Conditions Modalité 3 (forfait jours) : accord d&apos;entreprise, clause contractuelle
          explicite, entretien annuel charge de travail, rémunération ≥ 120 % du minimum
          conventionnel de la position.
        </CalloutInfo>
      </Section>

      <Section title="4 · Cotisations patronales 2026" icon="💸">
        <p style={paragraphStyle}>
          Total approximatif <strong>42 % à 45 %</strong> du brut pour un cadre Syntec selon
          le lieu (versement mobilité). Valeurs à valider expert paie.
        </p>
        <Table
          headers={["Cotisation", "Taux", "Base", "Statuts concernés"]}
          rows={[
            ["Maladie-maternité", "7,00 %", "Totalité", "Tous (13 % sans réduction Fillon)"],
            ["Allocations familiales", "3,45 %", "Totalité", "Tous (5,25 % si > 3,5 SMIC)"],
            ["Vieillesse plafonnée", "8,55 %", "Tranche 1", "Tous"],
            ["Vieillesse déplafonnée", "2,11 %", "Totalité", "Tous (hausse +0,09 vs 2025)"],
            ["AT/MP (tech ESN moyen)", "~1,00 %", "Totalité", "Tous (varie selon code risque)"],
            ["FNAL", "0,50 % (≥50 sal) · 0,10 % T1 (<50 sal)", "Totalité / T1", "Tous"],
            ["CSA — Contribution Solidarité Autonomie", "0,30 %", "Totalité", "Tous"],
            ["AGIRC-ARRCO T1", "4,72 %", "Tranche 1", "Tous"],
            ["AGIRC-ARRCO T2", "12,95 %", "Tranche 2", "Cadres + assimilés cadre"],
            ["CEG T1", "1,29 %", "Tranche 1", "Tous"],
            ["CEG T2", "1,62 %", "Tranche 2", "Cadres + assimilés cadre"],
            ["CET", "0,14 %", "Si rémunération > PASS", "Cadres + assimilés cadre"],
            ["APEC", "0,036 %", "T1 + T2 (max 4 PASS)", "Cadres + assimilés cadre"],
            ["Prévoyance Syntec cadres", "1,50 %", "Tranche 1", "Cadres + assimilés cadre (obligatoire)"],
            ["Chômage", "4,05 %", "T1 + T2 (max 4 PASS)", "Tous"],
            ["AGS", "0,15 %", "T1 + T2", "Tous"],
            ["CUFPA (formation/apprentissage)", "1,68 %", "Totalité", "Tous"],
            ["Médecine du travail (forfait)", "~80-120 €/an", "Forfait/salarié", "Tous"],
          ]}
        />
        <CalloutInfo>
          PASS 2026 : <strong>4 005 €/mois</strong> · 48 060 €/an (gelé). T1 = jusqu&apos;à 1 PASS, T2 = 1 à 8 PASS.
        </CalloutInfo>
      </Section>

      <Section title="5 · Versement mobilité par lieu" icon="🚇">
        <p style={paragraphStyle}>
          Taux variable par commune (outil URSSAF par code postal). Valeurs moyennes par zone :
        </p>
        <Table
          headers={["Lieu", "Taux 2026", "Condition"]}
          rows={[
            ["Paris intra-muros + petite couronne (75/92/93/94)", "jusqu'à 3,20 %", "Effectif ≥ 11"],
            ["Île-de-France grande couronne", "~1,80 %", "Effectif ≥ 11"],
            ["Lyon métropole", "~2,00 %", "Effectif ≥ 11"],
            ["Province (autres communes)", "0,20 % à 1,75 %", "Variable selon commune"],
            ["VMRR — Centre-VdL / Bourgogne-FC / Bretagne / partie Nouvelle-Aquitaine", "0,15 %", "Nouveau au 1er janvier 2026"],
          ]}
        />
      </Section>

      <Section title="6 · Prime de vacances (Article 31 Syntec)" icon="🏖">
        <Table
          headers={["Paramètre", "Valeur"]}
          rows={[
            ["Caractère", "Obligatoire pour tous les salariés Syntec"],
            ["Formule", "10 % des congés payés acquis sur la période de référence"],
            ["Période d'acquisition", "1er juin → 31 mai"],
            ["Période de versement", "Entre le 1er mai et le 31 octobre (souvent juin)"],
            ["Mensualisation calculateur", "≈ 1 % du brut annuel ÷ 12"],
            ["Substitution possible", "Intéressement, participation, prime annuelle ≥ 10 % des CP, si versée à tous entre mai et octobre"],
            ["Au départ du salarié", "Prorata des CP acquis, versé avec solde de tout compte"],
          ]}
        />
      </Section>

      <Section title="7 · Indemnités URSSAF — grand déplacement 2026" icon="🧳">
        <SubTitle>Petits déplacements (repas)</SubTitle>
        <Table
          headers={["Cas", "Montant 2026"]}
          rows={[
            ["Repas sur le lieu de travail (panier)", "7,40 €/repas"],
            ["Repas hors entreprise — restaurant", "20,70 €/repas"],
            ["Repas hors entreprise — panier", "10,30 €/repas"],
          ]}
        />
        <SubTitle>Grands déplacements (hébergement + repas par jour)</SubTitle>
        <Table
          headers={["Zone", "Hébergement + petit-déj", "Repas × 2", "Total/jour"]}
          rows={[
            ["Paris + petite couronne (75/92/93/94)", "74,30 €", "41,40 €", "115,70 €"],
            ["Autres départements métropole", "55,10 €", "41,40 €", "96,50 €"],
            ["Logement PMR (toutes zones)", "plafond majoré 150 €/j", "—", "—"],
          ]}
        />
        <SubTitle>Abattements mission longue durée</SubTitle>
        <Table
          headers={["Durée sur le même lieu", "Abattement"]}
          rows={[
            ["3 mois à 24 mois", "−15 % des forfaits"],
            ["24 mois à 72 mois", "−30 % des forfaits"],
          ]}
        />
      </Section>

      <Section title="8 · Tickets restaurant" icon="🍽">
        <Table
          headers={["Paramètre", "Valeur 2026"]}
          rows={[
            ["Valeur faciale typique", "9 € à 13 €"],
            ["Part employeur min", "50 %"],
            ["Part employeur max (exo URSSAF)", "60 %"],
            ["Plafond exonération URSSAF", "7,18 €/jour part employeur"],
            ["Caractère", "Non obligatoire Syntec, mais ~95 % des ESN le pratiquent"],
          ]}
        />
      </Section>

      <Section title="9 · Indemnité de transport" icon="🚆">
        <Table
          headers={["Type", "Valeur"]}
          rows={[
            ["Abonnement transports en commun (Navigo, TCL…)", "50 % obligatoire à la charge employeur"],
            ["Forfait mobilité durable", "Jusqu'à 700 €/an exonérés (vélo, covoiturage, trottinette électrique)"],
            ["Indemnité kilométrique", "Barème URSSAF 2026 par puissance fiscale (voitures + 2-roues)"],
          ]}
        />
      </Section>

      <Section title="10 · Mutuelle" icon="🏥">
        <Table
          headers={["Paramètre", "Valeur 2026"]}
          rows={[
            ["Part employeur min", "50 % (minimum légal)"],
            ["Avenant Syntec santé", "Avenant n°8 du 16/12/2025 — applicable au 1er juillet 2026"],
            ["Montant typique part employeur premium", "30 € à 60 €/mois au-delà du minimum"],
          ]}
        />
      </Section>

      <Section title="11 · Heures supplémentaires" icon="⏰">
        <Table
          headers={["Statut / Modalité", "Tranche", "Majoration"]}
          rows={[
            ["ETAM — Modalité 1 (35h)", "36ᵉ à 43ᵉ heure", "+25 %"],
            ["ETAM — Modalité 1 (35h)", "44ᵉ heure et au-delà", "+50 %"],
            ["Cadre — Modalité 2 (38h30)", "Forfait 38h30 inclus", "—"],
            ["Cadre — Modalité 2 (38h30)", "Au-delà de 38h30", "+25 %"],
            ["Cadre — Modalité 2", "Limite annuelle", "1 700 h/an"],
            ["Cadre — Modalité 3 (forfait jours)", "Pas d'HS au sens classique", "—"],
            ["Cadre — Modalité 3 — rachat dépassement 218j", "Majoration légale min", "+10 % (usage : +25 %)"],
            ["Cadre — Modalité 3 — limite après rachat", "Plafond annuel", "235 jours max"],
          ]}
        />
      </Section>

      <Section title="12 · Période d'essai CDI (Article 3.4 Syntec)" icon="🕒">
        <p style={paragraphStyle}>
          La période d&apos;essai et son renouvellement <strong>ne se présument pas</strong> :
          elles doivent être expressément stipulées dans la proposition d&apos;embauche ou
          le contrat de travail. Renouvellement exceptionnel + accord écrit obligatoire.
        </p>
        <Table
          headers={["Catégorie & coefficient", "Durée initiale", "Renouvellement max", "Total max"]}
          rows={[
            ["ETAM coef 240 à 250", "2 mois", "2 mois", "4 mois"],
            ["ETAM coef 275 à 500", "3 mois", "3 mois", "6 mois"],
            ["Cadres coef 95 à 270", "4 mois", "4 mois", "8 mois"],
          ]}
        />
      </Section>

      <Section title="13 · Période d'essai CDD selon durée du contrat" icon="📅">
        <p style={paragraphStyle}>
          <strong>vide</strong> côté Syntec — la convention ne déroge pas. Valeurs Code du
          travail (article L1242-10) applicables par défaut :
        </p>
        <Table
          headers={["Durée du CDD", "Période d'essai max"]}
          rows={[
            ["CDD ≤ 6 mois", "1 jour ouvré par semaine de contrat, plafonnée à 2 semaines"],
            ["CDD > 6 mois", "1 jour ouvré par semaine de contrat, plafonnée à 1 mois"],
          ]}
        />
      </Section>

      <Section title="14 · Délai de prévenance (rupture pendant essai) — Article 3.4 Syntec" icon="📣">
        <SubTitle>À l&apos;initiative de l&apos;employeur</SubTitle>
        <Table
          headers={["Temps de présence dans l'entreprise", "Délai"]}
          rows={[
            ["Inférieur à 8 jours", "24 heures"],
            ["Entre 8 jours et 1 mois", "48 heures"],
            ["Au-delà d'1 mois et jusqu'à 3 mois", "2 semaines"],
            ["Au-delà de 3 mois et jusqu'à 6 mois", "1 mois"],
            ["Au-delà de 6 mois et jusqu'à 8 mois", "6 semaines (spécifique Syntec)"],
          ]}
        />
        <SubTitle>À l&apos;initiative du salarié</SubTitle>
        <Table
          headers={["Temps de présence dans l'entreprise", "Délai"]}
          rows={[
            ["Inférieur à 8 jours", "24 heures"],
            ["8 jours et plus", "48 heures"],
          ]}
        />
        <CalloutInfo>
          La période d&apos;essai (renouvellement inclus) <strong>ne peut pas</strong> être
          prolongée par le délai de prévenance. Si l&apos;employeur ne respecte pas le délai,
          il doit verser une indemnité compensatrice = salaires + avantages que le salarié
          aurait perçus jusqu&apos;à expiration du délai, indemnité compensatrice de CP comprise.
        </CalloutInfo>
      </Section>

      <Section title="15 · Préavis de licenciement (Article 4.2 Syntec)" icon="📤">
        <p style={paragraphStyle}>
          Pas de préavis en cas de faute grave, faute lourde, ou impossibilité de reclassement
          suite à inaptitude d&apos;origine non professionnelle. Pendant le préavis, droit à
          6 jours ouvrés/mois d&apos;absences pour recherche d&apos;emploi (Article 4.3).
        </p>
        <Table
          headers={["Catégorie", "Démission", "Licenciement < 2 ans ancienneté", "Licenciement ≥ 2 ans"]}
          rows={[
            ["ETAM coef < 400 — < 2 ans", "1 mois", "1 mois", "—"],
            ["ETAM coef < 400 — ≥ 2 ans", "2 mois", "—", "2 mois"],
            ["ETAM coef 400 / 450 / 500", "2 mois", "2 mois", "2 mois"],
            ["Cadres (toutes positions)", "3 mois", "3 mois", "3 mois"],
          ]}
        />
        <CalloutInfo>
          Indemnité compensatrice de préavis (Article 4.4) : la partie qui n&apos;observe pas
          le préavis doit à l&apos;autre une indemnité égale à la rémunération du préavis
          restant à courir. Dispense employeur = paiement intégral dû.
        </CalloutInfo>
      </Section>

      <Section title="16 · Indemnité de licenciement (Article 4.5 Syntec)" icon="💼">
        <p style={paragraphStyle}>
          Attribuée à tout salarié licencié justifiant d&apos;au moins <strong>8 mois
          d&apos;ancienneté ininterrompue</strong>. S&apos;ajoute à l&apos;indemnité
          compensatrice de préavis. Non due en cas de faute grave ou lourde. Le montant
          versé est <strong>le plus élevé</strong> entre formule Syntec et formule légale.
        </p>
        <Table
          headers={["Catégorie", "Ancienneté", "Fraction de mois par année"]}
          rows={[
            ["ETAM", "Jusqu'à 10 ans", "1/4 de mois par année"],
            ["ETAM", "Au-delà de 10 ans", "1/3 de mois par année"],
            ["Cadres et Ingénieurs", "Ancienneté < 2 ans", "1/4 de mois par année"],
            ["Cadres et Ingénieurs", "Ancienneté ≥ 2 ans", "1/3 de mois par année (plus généreux que le légal)"],
          ]}
        />
        <CalloutInfo>
          Base de calcul : 1/12 de la rémunération des 12 derniers mois précédant la
          notification de la rupture. <strong>Inclut</strong> les primes contractuelles.
          <strong> Exclut</strong> majorations HS, indemnités déplacement / détachement.
          Années incomplètes : prorata du nombre de mois de présence.
        </CalloutInfo>
      </Section>

      <Footer />
    </main>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Layout helpers
 * ────────────────────────────────────────────────────────────────────────── */

function Header() {
  return (
    <div style={{ marginBottom: 26 }}>
      <span style={{
        display: "inline-block",
        fontSize: 11, fontWeight: 700, color: "#D97706",
        background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.22)",
        padding: "4px 11px", borderRadius: 100,
        letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12,
      }}>
        💰 Pricing · Référence Syntec
      </span>
      <h1 style={{
        margin: 0, fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 800,
        color: "#111827", letterSpacing: "-0.025em", lineHeight: 1.15,
      }}>
        Paramètres de tarification
      </h1>
      <p style={{ margin: "8px 0 0", fontSize: 14, color: "#6B7280", lineHeight: 1.6, maxWidth: 760 }}>
        Tous les paramètres Syntec utilisés par le calculateur, sourcés sur la convention
        collective <strong>IDCC 1486</strong> (texte de base du 16 juillet 2021, avenant
        salaires du 27 novembre 2025 — applicable depuis le 1er janvier 2026). Les valeurs
        marquées <strong>vide</strong> ne sont pas couvertes par la convention ou nécessitent
        une validation expert paie.
      </p>
    </div>
  )
}

function Footer() {
  return (
    <p style={{
      marginTop: 36, fontSize: 11.5, color: "#9CA3AF",
      textAlign: "center", lineHeight: 1.65,
    }}>
      Sources : Légifrance — Convention collective IDCC 1486 (KALICONT000005635173),
      URSSAF (frais professionnels 2026, indemnités kilométriques 2026, versement mobilité),
      info.gouv.fr (SMIC, PASS 2026), LégiSocial (grille salaires et cotisations).
      Les calculs basés sur ces paramètres sont à valider expert paie avant production.
    </p>
  )
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <m.section
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      style={{
        background: "white", borderRadius: 16, border: "1px solid #F0ECF8",
        padding: 22, marginBottom: 14,
      }}
    >
      <h2 style={{
        margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: "#7C63C8",
        letterSpacing: "0.06em", textTransform: "uppercase",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {children}
      </div>
    </m.section>
  )
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      margin: "8px 0 4px", fontSize: 12, fontWeight: 700, color: "#374151",
      letterSpacing: "0.02em",
    }}>
      {children}
    </h3>
  )
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div style={{
      overflowX: "auto", borderRadius: 10,
      border: "1px solid #F0ECF8", background: "#FAFAFA",
    }}>
      <table style={{
        width: "100%", borderCollapse: "collapse", fontSize: 12.5,
        fontFamily: "inherit",
      }}>
        <thead>
          <tr style={{ background: "#F4F1FB" }}>
            {headers.map((h) => (
              <th key={h} style={{
                padding: "9px 12px", textAlign: "left", fontWeight: 700,
                color: "#374151", borderBottom: "1px solid #E5E7EB",
                whiteSpace: "nowrap",
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{
              background: i % 2 ? "#FAFAFA" : "white",
              borderBottom: "1px solid #F0ECF8",
            }}>
              {r.map((c, j) => (
                <td key={j} style={{
                  padding: "8px 12px", color: "#4B5563", verticalAlign: "top",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {c === "vide" ? <em style={{ color: "#9CA3AF" }}>vide</em> : c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CalloutInfo({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "rgba(124,99,200,0.05)",
      border: "1px solid rgba(124,99,200,0.18)",
      borderRadius: 10, padding: "10px 14px",
      fontSize: 12, color: "#4B5563", lineHeight: 1.55,
    }}>
      ℹ {children}
    </div>
  )
}

const mainStyle: React.CSSProperties = {
  minHeight: "calc(100vh - 60px)",
  padding: "32px 24px 80px",
  maxWidth: 1100, margin: "0 auto",
  fontFamily: "var(--font-inter), sans-serif",
}

const paragraphStyle: React.CSSProperties = {
  margin: 0, fontSize: 13, color: "#4B5563", lineHeight: 1.65,
}
