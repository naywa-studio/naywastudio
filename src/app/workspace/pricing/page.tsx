"use client"

/**
 * /workspace/pricing — Page de référence Syntec, vue opérationnelle.
 *
 * Pour chaque ligne, soit :
 *   - une valeur exacte si elle est systématique
 *   - une formule de calcul si elle dépend de paramètres (statut, salaire, lieu)
 *   - "à compléter par l'employeur" si non obligatoire / propre au cabinet
 *
 * Le but : savoir exactement ce que l'employeur paye pour chaque salarié,
 * et ce qu'il doit verser à l'employé. Pas plus.
 */

import { m } from "framer-motion"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

export default function PricingPage() {
  return (
    <main style={mainStyle}>
      <Header />

      <Section title="1 · Statuts Syntec" icon="👔">
        <p style={paragraphStyle}>
          Trois statuts utilisés par le calculateur. Le statut détermine quelles cotisations
          patronales s&apos;appliquent (APEC et prévoyance 1,5 % pour cadres uniquement).
        </p>
        <Table
          headers={["Code", "Libellé", "Cotise APEC", "Prévoyance 1,5 % T1", "Coefficients couverts"]}
          rows={[
            ["etam", "ETAM", "Non", "Non", "240 → 355"],
            ["etam_assimile_cadre", "ETAM Assimilé Cadre", "Oui", "Oui", "400 / 450 / 500 (par pratique)"],
            ["cadre", "Cadre (Ingénieurs & Cadres)", "Oui", "Oui", "95 → 270"],
          ]}
        />
      </Section>

      <Section title="2 · Positions Syntec & minimum mensuel brut 2026" icon="📋">
        <SubTitle>ETAM</SubTitle>
        <Table
          headers={["Position", "Coefficient", "Minimum mensuel brut 2026"]}
          rows={[
            ["1.1", "240", "1 815 €"],
            ["1.2", "250", "1 845 €"],
            ["2.1", "275", "1 875 €"],
            ["2.2", "310", "1 905 €"],
            ["2.3", "355", "2 045 €"],
            ["3.1", "400", "2 185 €"],
            ["3.2", "450", "2 340 €"],
            ["3.3", "500", "2 490 €"],
          ]}
        />
        <SubTitle>Cadre (IC)</SubTitle>
        <Table
          headers={["Position", "Coefficient", "Minimum mensuel brut 2026"]}
          rows={[
            ["1.1", "95", "2 135 €"],
            ["1.2", "100", "2 240 €"],
            ["2.1 (< 26 ans)", "105", "2 315 €"],
            ["2.1 (≥ 26 ans)", "115", "2 530 €"],
            ["2.2", "130", "2 850 €"],
            ["2.3", "150", "3 275 €"],
            ["3.1", "170", "3 650 €"],
            ["3.2", "210", "4 495 €"],
            ["3.3", "270", "5 755 €"],
          ]}
        />
        <CalloutInfo>
          Plancher conventionnel ETAM 2026 : <strong>2 145 €</strong>. SMIC mensuel brut 2026 :
          <strong> 1 823 €</strong> au 1er janvier puis <strong>1 867 €</strong> au 1er juin (+2,41 %).
        </CalloutInfo>
      </Section>

      <Section title="3 · Heures hebdo & modalités" icon="⏱">
        <Table
          headers={["Modalité", "Libellé", "Heures hebdo", "Statuts éligibles", "Majoration minimum"]}
          rows={[
            ["1", "Standard", "35 h", "Tous", "—"],
            ["2", "Réalisation de missions", "38h30 (max 1 700 h/an)", "Cadres + ETAM 3.x", "+15 %"],
            ["3", "Forfait jours", "218 j/an", "Cadres position 2.3 et plus", "+20 %"],
          ]}
        />
      </Section>

      <Section title="4 · Charges patronales — total à payer (% du brut)" icon="💸">
        <p style={paragraphStyle}>
          Total agrégé des cotisations patronales que l&apos;employeur ajoute au brut.
          Calcul approximatif : la valeur exacte varie selon le lieu (versement mobilité)
          et le salaire (cotisations T2 au-delà du PASS).
        </p>
        <Table
          headers={["Statut", "Total charges patronales", "Notes"]}
          rows={[
            ["ETAM", "≈ 35 à 38 % du brut", "Sans APEC ni prévoyance 1,5 %"],
            ["ETAM Assimilé Cadre", "≈ 42 à 45 % du brut", "+ APEC, prévoyance 1,5 %"],
            ["Cadre (IC)", "≈ 42 à 46 % du brut", "Idem + cotisations T2 au-delà du PASS"],
          ]}
        />
        <CalloutInfo>
          PASS 2026 (Plafond Annuel Sécurité Sociale) : <strong>4 005 €/mois</strong> · 48 060 €/an.
          La tranche 1 (T1) = salaire jusqu&apos;à 1 PASS, la tranche 2 (T2) = de 1 à 8 PASS.
          Les cotisations AGIRC-ARRCO T2 (12,95 %) ne s&apos;appliquent que sur la partie du
          salaire au-delà du PASS — c&apos;est ce qui fait varier le pourcentage total pour
          les cadres très bien payés.
        </CalloutInfo>
      </Section>

      <Section title="5 · Prime de vacances (Article 31 Syntec)" icon="🏖">
        <Table
          headers={["Paramètre", "Valeur"]}
          rows={[
            ["Caractère", "Obligatoire pour tous les salariés Syntec"],
            ["Formule", "10 % des congés payés acquis sur la période (≈ 1 % du brut annuel)"],
            ["Coût mensualisé pour l'employeur", "Brut mensuel × 1 %"],
          ]}
        />
      </Section>

      <Section title="6 · Versement mobilité (charge patronale)" icon="🚇">
        <p style={paragraphStyle}>
          Charge patronale supplémentaire qui finance les transports en commun locaux.
          Due par toute entreprise de <strong>11 salariés ou plus</strong>, calculée sur la
          masse salariale totale. Le taux dépend de la commune où le salarié est rattaché
          (siège ou établissement).
        </p>
        <Table
          headers={["Lieu", "Taux 2026 (% du brut)", "Condition"]}
          rows={[
            ["Paris intra-muros + petite couronne (75/92/93/94)", "jusqu'à 3,20 %", "Effectif ≥ 11"],
            ["Île-de-France grande couronne", "≈ 1,80 %", "Effectif ≥ 11"],
            ["Lyon métropole", "≈ 2,00 %", "Effectif ≥ 11"],
            ["Province (autres communes)", "0,20 % à 1,75 %", "Variable selon commune"],
            ["VMRR (Centre-VdL / Bourgogne-FC / Bretagne / partie N.-Aquitaine)", "0,15 %", "Nouveau 1er janvier 2026"],
            ["Entreprise < 11 salariés", "0 %", "Exonération totale"],
          ]}
        />
        <CalloutInfo>
          Outil URSSAF officiel pour avoir le taux exact par code postal :{" "}
          <a href="https://www.urssaf.fr/accueil/outils-documentation/outils/recherche-versement-mobilite.html"
             target="_blank" rel="noopener noreferrer"
             style={{ color: "#7C63C8", textDecoration: "underline" }}>
            urssaf.fr — Recherche versement mobilité
          </a>.
        </CalloutInfo>
      </Section>

      <Section title="7 · Tickets restaurant" icon="🍽">
        <p style={paragraphStyle}>
          Non obligatoire Syntec, mais ~95 % des ESN le pratiquent. <strong>À compléter par
          l&apos;employeur</strong> selon les conditions du cabinet.
        </p>
        <Table
          headers={["Paramètre", "Valeur 2026"]}
          rows={[
            ["Valeur faciale ticket", "À compléter par l'employeur (9 € à 13 € typiquement)"],
            ["Part employeur", "Entre 50 % et 60 % (à compléter)"],
            ["Plafond d'exonération URSSAF 2026", "7,18 €/jour part employeur"],
            ["Formule coût mensuel employeur", "Valeur × Part employeur (%) × Jours travaillés du mois"],
          ]}
        />
      </Section>

      <Section title="8 · Indemnité de transport" icon="🚆">
        <Table
          headers={["Type", "Valeur ou formule"]}
          rows={[
            ["Abonnement transports en commun (Navigo, TCL…)", "50 % du coût de l'abonnement, obligatoire"],
            ["Forfait mobilité durable", "À compléter par l'employeur (jusqu'à 700 €/an exonérés)"],
          ]}
        />
        <SubTitle>Barème indemnités kilométriques 2026 — Voitures thermique / hybride / hydrogène</SubTitle>
        <Table
          headers={["Puissance fiscale", "Jusqu'à 5 000 km", "De 5 001 à 20 000 km", "Au-delà de 20 000 km"]}
          rows={[
            ["3 CV et moins", "d × 0,529", "(d × 0,316) + 1 065", "d × 0,370"],
            ["4 CV", "d × 0,606", "(d × 0,340) + 1 330", "d × 0,407"],
            ["5 CV", "d × 0,636", "(d × 0,357) + 1 395", "d × 0,427"],
            ["6 CV", "d × 0,665", "(d × 0,374) + 1 457", "d × 0,447"],
            ["7 CV et plus", "d × 0,697", "(d × 0,394) + 1 515", "d × 0,470"],
          ]}
        />
        <SubTitle>Voitures 100 % électriques (majoration +20 %)</SubTitle>
        <Table
          headers={["Puissance fiscale", "Jusqu'à 5 000 km", "De 5 001 à 20 000 km", "Au-delà de 20 000 km"]}
          rows={[
            ["3 CV et moins", "d × 0,635", "(d × 0,379) + 1 278", "d × 0,444"],
            ["4 CV", "d × 0,727", "(d × 0,408) + 1 596", "d × 0,488"],
            ["5 CV", "d × 0,763", "(d × 0,428) + 1 674", "d × 0,512"],
            ["6 CV", "d × 0,798", "(d × 0,449) + 1 748", "d × 0,536"],
            ["7 CV et plus", "d × 0,836", "(d × 0,473) + 1 818", "d × 0,564"],
          ]}
        />
        <SubTitle>Motos &gt; 50 cm³ — thermique</SubTitle>
        <Table
          headers={["Puissance fiscale", "Jusqu'à 3 000 km", "De 3 001 à 6 000 km", "Au-delà de 6 000 km"]}
          rows={[
            ["1 à 2 CV", "d × 0,395", "(d × 0,099) + 891", "d × 0,248"],
            ["3 à 5 CV", "d × 0,468", "(d × 0,082) + 1 158", "d × 0,275"],
            ["Plus de 5 CV", "d × 0,606", "(d × 0,079) + 1 583", "d × 0,343"],
          ]}
        />
        <SubTitle>Motos &gt; 50 cm³ — 100 % électrique</SubTitle>
        <Table
          headers={["Puissance fiscale", "Jusqu'à 3 000 km", "De 3 001 à 6 000 km", "Au-delà de 6 000 km"]}
          rows={[
            ["1 à 2 CV", "d × 0,474", "(d × 0,119) + 1 069", "d × 0,298"],
            ["3 à 5 CV", "d × 0,562", "(d × 0,098) + 1 390", "d × 0,330"],
            ["Plus de 5 CV", "d × 0,727", "(d × 0,095) + 1 900", "d × 0,412"],
          ]}
        />
        <SubTitle>Cyclomoteurs &lt; 50 cm³</SubTitle>
        <Table
          headers={["Type", "Jusqu'à 3 000 km", "De 3 001 à 6 000 km", "Au-delà de 6 000 km"]}
          rows={[
            ["Thermique", "d × 0,315", "(d × 0,079) + 711", "d × 0,198"],
            ["100 % électrique", "d × 0,378", "(d × 0,095) + 853", "d × 0,238"],
          ]}
        />
        <CalloutInfo>
          <strong>d</strong> = distance parcourue à titre professionnel en km, sur l&apos;année.
          Formule officielle URSSAF / impots.gouv.fr 2026.
        </CalloutInfo>
      </Section>

      <Section title="9 · Mutuelle santé" icon="🏥">
        <p style={paragraphStyle}>
          Le contrat collectif est obligatoire (Syntec impose une couverture santé), mais le
          contrat exact et donc le coût varient selon le cabinet. <strong>À compléter par
          l&apos;employeur</strong> avec le montant réel de sa cotisation.
        </p>
        <Table
          headers={["Paramètre", "Valeur"]}
          rows={[
            ["Part employeur minimum", "50 % de la cotisation totale (minimum légal)"],
            ["Cotisation totale typique (régime de base Syntec)", "30 € à 70 €/mois selon contrat"],
            ["Part employeur typique observée", "20 € à 45 €/mois (à compléter par l'employeur)"],
            ["Avenant en cours d'application", "Avenant n°8 du 16/12/2025, applicable au 1er juillet 2026"],
          ]}
        />
      </Section>

      <Section title="10 · Heures supplémentaires (Code du travail + Syntec)" icon="⏰">
        <p style={paragraphStyle}>
          Source : Code du travail L3121-28 à L3121-39 + Syntec accord du 22 juin 1999 sur
          la durée du travail. Taux confirmés au barème 2026.
        </p>
        <Table
          headers={["Cas", "Tranche", "Majoration"]}
          rows={[
            ["ETAM — Modalité 1 (35 h)", "36ᵉ à 43ᵉ heure", "+25 %"],
            ["ETAM — Modalité 1 (35 h)", "44ᵉ heure et au-delà", "+50 %"],
            ["Cadre — Modalité 2 (38h30)", "Forfait inclus jusqu'à 38h30", "—"],
            ["Cadre — Modalité 2", "Au-delà de 38h30", "+25 %"],
            ["Cadre — Modalité 2", "Plafond annuel", "1 700 h"],
            ["Cadre — Modalité 3 (forfait jours)", "Pas d'HS au sens classique", "—"],
            ["Cadre — Modalité 3 — rachat jours au-delà de 218j", "Majoration minimum légale", "+10 %"],
            ["Cadre — Modalité 3 — rachat (usage)", "Majoration usuelle pratiquée", "+25 %"],
            ["Cadre — Modalité 3 — plafond annuel après rachat", "Limite légale", "235 j max"],
          ]}
        />
      </Section>

      <Section title="11 · Période d'essai CDI (Article 3.4 Syntec)" icon="🕒">
        <p style={paragraphStyle}>
          Source : Convention Syntec Article 3.4, en vigueur étendu — avenant n°2 du 27
          octobre 2022 (publié BOCC 2022-49). La période d&apos;essai et son renouvellement
          ne se présument pas : ils doivent être expressément stipulés dans le contrat.
        </p>
        <Table
          headers={["Catégorie", "Coefficients", "Durée initiale", "Renouvellement max", "Total max"]}
          rows={[
            ["ETAM", "240 à 250", "2 mois", "2 mois", "4 mois"],
            ["ETAM", "275 à 500", "3 mois", "3 mois", "6 mois"],
            ["Cadres et Ingénieurs", "95 à 270", "4 mois", "4 mois", "8 mois"],
          ]}
        />
      </Section>

      <Section title="12 · Délai de prévenance (rupture pendant essai)" icon="📣">
        <SubTitle>À l&apos;initiative de l&apos;employeur</SubTitle>
        <Table
          headers={["Temps de présence", "Délai"]}
          rows={[
            ["< 8 jours", "24 heures"],
            ["8 jours à 1 mois", "48 heures"],
            ["1 mois à 3 mois", "2 semaines"],
            ["3 mois à 6 mois", "1 mois"],
            ["6 mois à 8 mois", "6 semaines (spécifique Syntec)"],
          ]}
        />
        <SubTitle>À l&apos;initiative du salarié</SubTitle>
        <Table
          headers={["Temps de présence", "Délai"]}
          rows={[
            ["< 8 jours", "24 heures"],
            ["≥ 8 jours", "48 heures"],
          ]}
        />
        <CalloutInfo>
          Si l&apos;employeur ne respecte pas le délai → <strong>indemnité compensatrice</strong> due
          au salarié = salaires + avantages qu&apos;il aurait perçus jusqu&apos;à l&apos;expiration
          du délai, indemnité compensatrice de CP comprise.
        </CalloutInfo>
      </Section>

      <Section title="13 · Préavis de licenciement (Article 4.2 Syntec)" icon="📤">
        <p style={paragraphStyle}>
          Source : Convention Syntec Article 4.2, en vigueur étendu. Pas de préavis en cas
          de faute grave, faute lourde, ou impossibilité de reclassement pour inaptitude
          d&apos;origine non professionnelle.
        </p>
        <Table
          headers={["Catégorie", "Ancienneté", "Démission", "Licenciement"]}
          rows={[
            ["ETAM coef < 400", "< 2 ans", "1 mois", "1 mois"],
            ["ETAM coef < 400", "≥ 2 ans", "2 mois", "2 mois"],
            ["ETAM coef 400 / 450 / 500", "Toute ancienneté", "2 mois", "2 mois"],
            ["Cadres (toutes positions)", "Toute ancienneté", "3 mois", "3 mois"],
          ]}
        />
        <SubTitle>Indemnité compensatrice de préavis — Article 4.4 Syntec</SubTitle>
        <Table
          headers={["Cas", "Formule"]}
          rows={[
            ["Employeur dispense le salarié du préavis", "Salaire de base × nombre de mois de préavis × (1 + charges patronales %)"],
            ["Salarié quitte avant la fin pour un nouvel emploi", "Rémunération de la période effectivement travaillée uniquement"],
            ["Aucune des parties n'observe le préavis", "Indemnité due à l'autre = rémunération du préavis restant à courir"],
          ]}
        />
        <CalloutInfo>
          Pendant la période de préavis, le salarié a droit à <strong>6 jours ouvrés/mois</strong>
          d&apos;absence pour recherche d&apos;emploi (Article 4.3 Syntec). Payés si licenciement
          par l&apos;employeur, non payés si démission.
        </CalloutInfo>
      </Section>

      <Section title="14 · Indemnité de licenciement (Article 4.5 Syntec)" icon="💼">
        <p style={paragraphStyle}>
          Source : Convention Syntec Article 4.5, en vigueur étendu depuis l&apos;arrêté du
          5 avril 2023. <strong>Condition</strong> : 8 mois d&apos;ancienneté ininterrompue
          minimum. Non due en cas de faute grave ou lourde. L&apos;employeur verse
          l&apos;indemnité <strong>la plus élevée</strong> entre la formule Syntec et la
          formule légale du Code du travail (R1234-2).
        </p>
        <SubTitle>Formule Syntec</SubTitle>
        <Table
          headers={["Catégorie", "Ancienneté", "Fraction de mois par année d'ancienneté"]}
          rows={[
            ["ETAM", "Jusqu'à 10 ans", "1/4 de mois"],
            ["ETAM", "Au-delà de 10 ans", "1/3 de mois"],
            ["Cadres et Ingénieurs", "< 2 ans", "1/4 de mois"],
            ["Cadres et Ingénieurs", "≥ 2 ans", "1/3 de mois (plus généreux que le légal)"],
          ]}
        />
        <SubTitle>Formule légale Code du travail (R1234-2) — minimum garanti</SubTitle>
        <Table
          headers={["Ancienneté", "Fraction de mois par année"]}
          rows={[
            ["Jusqu'à 10 ans", "1/4 de mois"],
            ["Au-delà de 10 ans", "1/3 de mois"],
          ]}
        />
        <SubTitle>Calcul du montant</SubTitle>
        <Table
          headers={["Élément", "Valeur"]}
          rows={[
            ["Indemnité = fraction × ancienneté en années × salaire de référence", "Formule générale"],
            ["Salaire de référence", "1/12 de la rémunération brute des 12 derniers mois"],
            ["Inclus dans le salaire de référence", "Primes contractuelles, 13ᵉ mois prorata, prime de vacances"],
            ["Exclus du salaire de référence", "Majorations HS, indemnités/majorations déplacement ou détachement"],
            ["Années incomplètes", "Calcul prorata du nombre de mois de présence"],
          ]}
        />
      </Section>

      <Section title="15 · Récapitulatif — ce que l'employeur paye pour 1 salarié" icon="📊">
        <p style={paragraphStyle}>
          Synthèse de tous les coûts mensuels que l&apos;employeur doit prévoir par salarié
          en mission. Tous sont à additionner pour obtenir le coût employeur total.
        </p>
        <Table
          headers={["Composante", "Formule ou valeur", "Caractère"]}
          rows={[
            ["Salaire brut mensuel", "Négocié entre cabinet et candidat (≥ minimum conventionnel)", "Obligatoire"],
            ["Charges patronales", "Brut × taux statut (35 % ETAM, 42-46 % Cadre)", "Obligatoire"],
            ["Versement mobilité", "Brut × taux lieu (0 à 3,2 %)", "Obligatoire si effectif ≥ 11"],
            ["Prime de vacances Art. 31", "Brut mensuel × 1 % (mensualisé)", "Obligatoire Syntec"],
            ["Mutuelle santé", "Part employeur (à compléter par l'employeur)", "Obligatoire (50 % min)"],
            ["Transport en commun", "50 % de l'abonnement Navigo / TCL", "Obligatoire si pris en charge"],
            ["13ᵉ mois", "Brut mensuel ÷ 12 (mensualisé)", "À compléter par l'employeur"],
            ["Tickets restaurant", "Valeur × part employeur × jours travaillés", "À compléter par l'employeur"],
            ["Forfait mobilité durable", "Jusqu'à 700 €/an exonérés", "À compléter par l'employeur"],
            ["Prime de cooptation", "Versée au coopteur, à amortir sur durée mission", "À compléter par l'employeur"],
            ["Indemnité URSSAF déplacement", "115,70 €/j Paris+PC · 96,50 €/j province (plafond)", "À compléter si grand déplacement"],
          ]}
        />
        <CalloutInfo>
          En cas de rupture du contrat après la période d&apos;essai, ajouter au coût :
          (préavis × coût employeur mensuel) + indemnité de licenciement Article 4.5.
          Ces coûts ne s&apos;appliquent jamais pendant la période d&apos;essai.
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
        💰 Pricing · Référence opérationnelle
      </span>
      <h1 style={{
        margin: 0, fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 800,
        color: "#111827", letterSpacing: "-0.025em", lineHeight: 1.15,
      }}>
        Ce que l&apos;employeur paye pour chaque salarié
      </h1>
      <p style={{ margin: "8px 0 0", fontSize: 14, color: "#6B7280", lineHeight: 1.6, maxWidth: 760 }}>
        Tous les paramètres Syntec utilisés par le calculateur, sourcés sur la convention
        collective <strong>IDCC 1486</strong> (avenant salaires du 27 novembre 2025,
        applicable depuis le 1er janvier 2026). Pour chaque ligne : la valeur exacte si
        elle est systématique, la formule de calcul si elle dépend du contexte, ou
        <strong> &quot;à compléter par l&apos;employeur&quot;</strong> si non obligatoire.
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
                  {c.startsWith("À compléter") || c.startsWith("à compléter")
                    ? <em style={{ color: "#B45309" }}>{c}</em>
                    : c}
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
