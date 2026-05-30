"use client"

/**
 * /workspace/pricing — Page de référence Syntec opérationnelle.
 *
 * Mise en page :
 *   - Colonne gauche : référence détaillée par paramètre, avec pour chaque
 *     ligne soit une valeur, soit une formule, soit "à compléter par
 *     l'employeur".
 *   - Colonne droite sticky : formules consolidées du coût mensuel
 *     employeur dans les 3 grands cas (CDI essai / CDI post-essai / CDD).
 *     C'est la vue que le sourceur veut sous les yeux pendant qu'il chiffre.
 */

import { m } from "framer-motion"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

export default function PricingPage() {
  return (
    <main style={mainStyle}>
      <Header />

      <div className="pricing-layout" style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 360px)",
        gap: 18,
        alignItems: "start",
      }}>
        <div>
          <Section title="1 · Statuts Syntec" icon="👔">
            <p style={paragraphStyle}>
              Trois statuts utilisés par le calculateur. Le statut détermine quelles cotisations
              patronales s&apos;appliquent (APEC et prévoyance 1,5 % pour cadres uniquement).
            </p>
            <Table
              headers={["Code", "Libellé", "APEC", "Prévoyance 1,5 % T1", "Coefficients"]}
              rows={[
                ["etam", "ETAM", "Non", "Non", "240 → 355"],
                ["etam_assimile_cadre", "ETAM Assimilé Cadre", "Oui", "Oui", "400 / 450 / 500 (pratique)"],
                ["cadre", "Cadre (Ingénieurs & Cadres)", "Oui", "Oui", "95 → 270"],
              ]}
            />
          </Section>

          <Section title="2 · Positions Syntec & minimum mensuel brut 2026" icon="📋">
            <SubTitle>ETAM</SubTitle>
            <Table
              headers={["Position", "Coef.", "Minimum mensuel brut 2026"]}
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
              headers={["Position", "Coef.", "Minimum mensuel brut 2026"]}
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
              Plancher ETAM 2026 : <strong>2 145 €</strong>. SMIC mensuel brut 2026 :
              <strong> 1 823 €</strong> au 1er janvier puis <strong>1 867 €</strong> au 1er juin (+2,41 %).
            </CalloutInfo>
          </Section>

          <Section title="3 · Heures hebdo & modalités" icon="⏱">
            <Table
              headers={["Modalité", "Libellé", "Heures hebdo", "Statuts éligibles", "Majoration min"]}
              rows={[
                ["1", "Standard", "35 h", "Tous", "—"],
                ["2", "Réalisation de missions", "38h30 (max 1 700 h/an)", "Cadres + ETAM 3.x", "+15 %"],
                ["3", "Forfait jours", "218 j/an", "Cadres position 2.3+", "+20 %"],
              ]}
            />
          </Section>

          <Section title="4 · Charges patronales — total à payer (% du brut)" icon="💸">
            <p style={paragraphStyle}>
              Total agrégé par statut, calculé depuis la décomposition réelle des
              cotisations 2026 (sécu + chômage + retraite + formation + versement mobilité).
              Valeurs pour cabinet ESN moyen (11-250 sal, Paris+petite couronne, brut 50-65k).
              Peut varier de ±2 pts selon effectif (&gt; 250 sal = +2 pts), code AT/MP et lieu exact.
            </p>
            <Table
              headers={["Statut", "Total charges patronales", "Notes"]}
              rows={[
                ["ETAM", "≈ 38 % du brut", "Sans APEC, prévoyance Syntec ni AGIRC-ARRCO T2"],
                ["ETAM Assimilé Cadre", "≈ 42 % du brut", "+ APEC + prévoyance 1,5 % (cotise cadre)"],
                ["Cadre (IC)", "≈ 44 % du brut", "Idem + cotisations T2 au-delà du PASS · versement mobilité Paris 3,05 %"],
                ["Expatrié", "≈ 22 % du brut", "Variable selon convention bilatérale + CFE. Pas de chômage France si maintenu"],
              ]}
            />
            <CalloutInfo>
              PASS 2026 : <strong>4 005 €/mois</strong> · 48 060 €/an (gelé). T1 = jusqu&apos;à 1 PASS,
              T2 = 1 à 8 PASS. AGIRC-ARRCO T2 (12,95 %) ne s&apos;applique que sur la partie au-delà du PASS.
            </CalloutInfo>
          </Section>

          <Section title="5 · Médecine du travail" icon="🩺">
            <Table
              headers={["Paramètre", "Valeur"]}
              rows={[
                ["Caractère", "Obligatoire en France (cotisation à un Service de Santé au Travail)"],
                ["Coût annuel par salarié", "≈ 80 € à 150 €/an (à compléter par l'employeur selon le SST)"],
                ["Mensualisation", "Forfait annuel ÷ 12"],
              ]}
            />
          </Section>

          <Section title="6 · Prime de vacances (Article 31 Syntec)" icon="🏖">
            <Table
              headers={["Paramètre", "Valeur"]}
              rows={[
                ["Caractère", "Obligatoire pour tous les salariés Syntec"],
                ["Formule", "10 % des congés payés acquis (≈ 1 % du brut annuel)"],
                ["Coût mensualisé", "Brut mensuel × 1 %"],
              ]}
            />
          </Section>

          <Section title="7 · Versement mobilité (charge patronale)" icon="🚇">
            <p style={paragraphStyle}>
              Charge patronale qui finance les transports en commun locaux. Due par les
              entreprises de <strong>11 salariés ou plus</strong>, calculée sur la masse
              salariale, le taux dépend de la commune.
            </p>
            <Table
              headers={["Lieu", "Taux 2026 (% du brut)", "Condition"]}
              rows={[
                ["Paris intra-muros + petite couronne (75/92/93/94)", "3,05 % (Grand Paris 2026)", "Effectif ≥ 11"],
                ["Île-de-France grande couronne", "≈ 1,80 %", "Effectif ≥ 11"],
                ["Lyon métropole", "≈ 2,00 %", "Effectif ≥ 11"],
                ["Province (autres communes)", "0,20 % à 1,75 %", "Variable par commune"],
                ["VMRR — Centre-VdL / Bourgogne-FC / Bretagne / partie N.-Aquitaine", "0,15 %", "Nouveau 1er janvier 2026"],
                ["Entreprise < 11 salariés", "0 %", "Exonération"],
              ]}
            />
            <CalloutInfo>
              Outil URSSAF par code postal :{" "}
              <a href="https://www.urssaf.fr/accueil/outils-documentation/outils/recherche-versement-mobilite.html"
                 target="_blank" rel="noopener noreferrer"
                 style={{ color: "#7C63C8", textDecoration: "underline" }}>
                urssaf.fr — Recherche versement mobilité
              </a>.
            </CalloutInfo>
          </Section>

          <Section title="8 · Tickets restaurant" icon="🍽">
            <p style={paragraphStyle}>
              Non obligatoire Syntec, pratiqué par ~95 % des ESN.{" "}
              <strong>À compléter par l&apos;employeur</strong>.
            </p>
            <Table
              headers={["Paramètre", "Valeur 2026"]}
              rows={[
                ["Valeur faciale ticket", "À compléter par l'employeur (9 € à 13 €)"],
                ["Part employeur", "Entre 50 % et 60 % (à compléter)"],
                ["Plafond exonération URSSAF 2026", "7,32 €/jour part employeur"],
                ["Coût mensuel employeur", "Valeur × part employeur × jours travaillés"],
              ]}
            />
          </Section>

          <Section title="9 · Indemnité de transport" icon="🚆">
            <Table
              headers={["Type", "Valeur ou formule"]}
              rows={[
                ["Abonnement transports en commun (Navigo, TCL…)", "50 % du coût de l'abonnement — obligatoire"],
                ["Forfait mobilité durable", "À compléter par l'employeur (jusqu'à 700 €/an exonérés)"],
              ]}
            />
            <SubTitle>Barème kilométrique 2026 — Voitures thermique / hybride / hydrogène</SubTitle>
            <Table
              headers={["Puissance fiscale", "≤ 5 000 km", "5 001 → 20 000 km", "> 20 000 km"]}
              rows={[
                ["3 CV et moins", "d × 0,529", "(d × 0,316) + 1 065", "d × 0,370"],
                ["4 CV", "d × 0,606", "(d × 0,340) + 1 330", "d × 0,407"],
                ["5 CV", "d × 0,636", "(d × 0,357) + 1 395", "d × 0,427"],
                ["6 CV", "d × 0,665", "(d × 0,374) + 1 457", "d × 0,447"],
                ["7 CV et plus", "d × 0,697", "(d × 0,394) + 1 515", "d × 0,470"],
              ]}
            />
            <SubTitle>Voitures 100 % électriques (+20 %)</SubTitle>
            <Table
              headers={["Puissance fiscale", "≤ 5 000 km", "5 001 → 20 000 km", "> 20 000 km"]}
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
              headers={["Puissance fiscale", "≤ 3 000 km", "3 001 → 6 000 km", "> 6 000 km"]}
              rows={[
                ["1 à 2 CV", "d × 0,395", "(d × 0,099) + 891", "d × 0,248"],
                ["3 à 5 CV", "d × 0,468", "(d × 0,082) + 1 158", "d × 0,275"],
                ["Plus de 5 CV", "d × 0,606", "(d × 0,079) + 1 583", "d × 0,343"],
              ]}
            />
            <SubTitle>Motos &gt; 50 cm³ — 100 % électrique</SubTitle>
            <Table
              headers={["Puissance fiscale", "≤ 3 000 km", "3 001 → 6 000 km", "> 6 000 km"]}
              rows={[
                ["1 à 2 CV", "d × 0,474", "(d × 0,119) + 1 069", "d × 0,298"],
                ["3 à 5 CV", "d × 0,562", "(d × 0,098) + 1 390", "d × 0,330"],
                ["Plus de 5 CV", "d × 0,727", "(d × 0,095) + 1 900", "d × 0,412"],
              ]}
            />
            <SubTitle>Cyclomoteurs &lt; 50 cm³</SubTitle>
            <Table
              headers={["Type", "≤ 3 000 km", "3 001 → 6 000 km", "> 6 000 km"]}
              rows={[
                ["Thermique", "d × 0,315", "(d × 0,079) + 711", "d × 0,198"],
                ["100 % électrique", "d × 0,378", "(d × 0,095) + 853", "d × 0,238"],
              ]}
            />
            <CalloutInfo>
              <strong>d</strong> = distance parcourue à titre professionnel en km/an. Source URSSAF /
              impots.gouv.fr 2026.
            </CalloutInfo>
          </Section>

          <Section title="10 · Mutuelle santé" icon="🏥">
            <p style={paragraphStyle}>
              Contrat collectif obligatoire (Syntec impose une couverture santé). Le coût exact
              dépend du contrat choisi — <strong>à compléter par l&apos;employeur</strong>.
            </p>
            <Table
              headers={["Paramètre", "Valeur"]}
              rows={[
                ["Part employeur minimum", "50 % de la cotisation totale"],
                ["Cotisation totale typique (régime de base Syntec)", "30 € à 70 €/mois"],
                ["Part employeur typique observée", "20 € à 45 €/mois (à compléter)"],
                ["Avenant en cours d'application", "Avenant n°8 du 16/12/2025, applicable 1er juillet 2026"],
              ]}
            />
          </Section>

          <Section title="11 · Heures supplémentaires" icon="⏰">
            <Table
              headers={["Cas", "Tranche", "Majoration"]}
              rows={[
                ["ETAM — Modalité 1 (35 h)", "36ᵉ à 43ᵉ heure", "+25 %"],
                ["ETAM — Modalité 1 (35 h)", "44ᵉ heure et au-delà", "+50 %"],
                ["Cadre — Modalité 2 (38h30)", "Forfait inclus jusqu'à 38h30", "—"],
                ["Cadre — Modalité 2", "Au-delà de 38h30", "+25 %"],
                ["Cadre — Modalité 2", "Plafond annuel", "1 700 h"],
                ["Cadre — Modalité 3 (forfait jours)", "Pas d'HS au sens classique", "—"],
                ["Cadre — Modalité 3 — rachat > 218 j", "Majoration minimum légale", "+10 %"],
                ["Cadre — Modalité 3 — rachat (usage)", "Majoration usuelle", "+25 %"],
                ["Cadre — Modalité 3 — plafond après rachat", "Limite légale", "235 j max"],
              ]}
            />
          </Section>

          <Section title="12 · Période d'essai CDI (Article 3.4 Syntec)" icon="🕒">
            <Table
              headers={["Catégorie", "Coefficients", "Durée initiale", "Renouvellement max", "Total max"]}
              rows={[
                ["ETAM", "240 à 250", "2 mois", "2 mois", "4 mois"],
                ["ETAM", "275 à 500", "3 mois", "3 mois", "6 mois"],
                ["Cadres / Ingénieurs", "95 à 270", "4 mois", "4 mois", "8 mois"],
              ]}
            />
          </Section>

          <Section title="13 · Délai de prévenance (rupture pendant essai)" icon="📣">
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
              Si l&apos;employeur ne respecte pas le délai → <strong>indemnité compensatrice</strong> :
              salaires + avantages qu&apos;aurait perçus le salarié jusqu&apos;à expiration du délai,
              indemnité compensatrice de CP comprise.
            </CalloutInfo>
          </Section>

          <Section title="14 · Préavis de licenciement (Article 4.2 Syntec)" icon="📤">
            <p style={paragraphStyle}>
              Pas de préavis en cas de faute grave, faute lourde, ou impossibilité de
              reclassement pour inaptitude d&apos;origine non professionnelle.
            </p>
            <Table
              headers={["Catégorie", "Ancienneté", "Démission", "Licenciement"]}
              rows={[
                ["ETAM coef < 400", "< 2 ans", "1 mois", "1 mois"],
                ["ETAM coef < 400", "≥ 2 ans", "2 mois", "2 mois"],
                ["ETAM coef 400 / 450 / 500", "Toute", "2 mois", "2 mois"],
                ["Cadres (toutes positions)", "Toute", "3 mois", "3 mois"],
              ]}
            />
            <SubTitle>Indemnité compensatrice de préavis — Article 4.4</SubTitle>
            <Table
              headers={["Cas", "Formule"]}
              rows={[
                ["Employeur dispense du préavis", "Brut mensuel × nombre_mois_préavis × (1 + charges patronales)"],
                ["Salarié quitte avant fin pour nouvel emploi", "Rémunération de la période effectivement travaillée"],
                ["Aucune des parties n'observe le préavis", "Indemnité due = rémunération du préavis restant à courir"],
              ]}
            />
          </Section>

          <Section title="15 · Indemnité de licenciement (Article 4.5 Syntec)" icon="💼">
            <p style={paragraphStyle}>
              <strong>Condition</strong> : 8 mois d&apos;ancienneté ininterrompue minimum. Non due en
              cas de faute grave ou lourde. L&apos;employeur verse l&apos;indemnité <strong>la plus
              élevée</strong> entre formule Syntec et formule légale (R1234-2).
            </p>
            <SubTitle>Formule Syntec</SubTitle>
            <Table
              headers={["Catégorie", "Ancienneté", "Fraction de mois par année"]}
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
            <CalloutInfo>
              Formule : <strong>Fraction × ancienneté en années × salaire de référence</strong>.
              Salaire de référence = 1/12 des 12 derniers mois bruts. Inclut primes contractuelles,
              13ᵉ mois prorata, prime de vacances. Exclut majorations HS, indemnités déplacement.
            </CalloutInfo>
          </Section>

          <Section title="16 · Indemnité de fin de CDD (Code du travail L1243-8)" icon="📄">
            <p style={paragraphStyle}>
              Hors convention Syntec — application du Code du travail.
            </p>
            <Table
              headers={["Cas", "Formule ou valeur"]}
              rows={[
                ["CDD mené à son terme", "10 % de la rémunération brute totale versée pendant le CDD"],
                ["CDD jeune saisonnier / CDD avec formation diplômante", "Non due (exceptions légales)"],
                ["Rupture anticipée par employeur (hors faute grave / FM)", "Dommages-intérêts ≥ salaires restants jusqu'au terme du CDD"],
                ["Rupture anticipée par salarié pour CDI ailleurs", "Préavis 1 jour par semaine de contrat (max 2 semaines)"],
                ["Période d'essai CDD (Code du travail L1242-10)", "1 jour par semaine de contrat (max 2 sem si CDD ≤ 6 mois, max 1 mois si > 6 mois)"],
              ]}
            />
          </Section>

        </div>

        {/* Right column — consolidated formulas the sourceur keeps under
            their nose while pricing a candidate. */}
        <aside className="pricing-formulas" style={{
          position: "sticky", top: 80,
          alignSelf: "start",
        }}>
          <FormulasPanel />
        </aside>
      </div>

      <Footer />

      <style>{`
        @media (max-width: 980px) {
          .pricing-layout { grid-template-columns: 1fr !important; }
          .pricing-formulas { position: static !important; }
        }
      `}</style>
    </main>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Formulas sidebar
 * ────────────────────────────────────────────────────────────────────────── */

function FormulasPanel() {
  return (
    <div style={{
      background: "linear-gradient(160deg, rgba(124,99,200,0.07), rgba(217,119,6,0.04))",
      border: "1px solid rgba(124,99,200,0.20)",
      borderRadius: 16, padding: 18,
      display: "flex", flexDirection: "column", gap: 14,
    }}>
      <header>
        <span style={{
          display: "inline-block",
          fontSize: 10.5, fontWeight: 700, color: "#7C63C8",
          background: "rgba(124,99,200,0.10)", border: "1px solid rgba(124,99,200,0.25)",
          padding: "3px 9px", borderRadius: 100,
          letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8,
        }}>
          🧮 Formules opérationnelles
        </span>
        <h2 style={{
          margin: 0, fontSize: 15, fontWeight: 800, color: "#111827",
          letterSpacing: "-0.01em",
        }}>
          Coût mensuel employeur
        </h2>
        <p style={{ margin: "5px 0 0", fontSize: 11.5, color: "#6B7280", lineHeight: 1.5 }}>
          Synthèse des composantes à additionner selon le cas de figure.
        </p>
      </header>

      {/* Postulats du calculateur. L'objectif est de montrer le PIRE CAS
          RÉALISTE — celui où l'employeur subit la rupture, pas celui où
          il l'orchestre. */}
      <div style={{
        background: "white", border: "1px solid rgba(124,99,200,0.25)",
        borderRadius: 10, padding: "10px 12px",
      }}>
        <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: "#7C63C8",
          letterSpacing: "0.04em", textTransform: "uppercase" }}>
          🎯 Postulats du calculateur
        </p>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3, fontSize: 11.5, color: "#374151" }}>
          <li>• Worflow exécuté en arrière-plan, <strong>l&apos;utilisateur ne répond à aucune question</strong></li>
          <li>• Rupture <strong>toujours initiée par l&apos;employeur</strong> (seul cas qui impacte la marge)</li>
          <li>• Motif = licenciement standard (CDI) ou rupture anticipée hors faute (CDD)</li>
          <li>• <strong>Préavis respecté</strong> — pas d&apos;indemnité compensatrice volontaire</li>
          <li>• Cas exclus : démission, rupture conventionnelle, faute grave, inaptitude, FM</li>
        </ul>
        <p style={{ margin: "8px 0 0", fontSize: 10.5, color: "#6B7280", fontStyle: "italic", lineHeight: 1.5 }}>
          ⚠ La date de rupture n&apos;est pas un input — c&apos;est l&apos;axe X du graphique. Pour
          chaque <strong>t</strong> (ancienneté en mois) entre 1 et 24, on évalue ce que
          l&apos;employeur payerait au total. Les seuils Syntec qui font basculer les formules :
          fin_essai (selon coef), 8 mois (indemnité 4.5 ouverte), 2 ans cadre (1/4 → 1/3),
          10 ans ETAM (1/4 → 1/3).
        </p>
      </div>

      <FormulaCard
        title="📦 C(brut, statut) — coût mensuel récurrent"
        color="#7C63C8"
        lines={[
          "C = Brut mensuel négocié",
          "  + Brut × charges patronales % par statut (ETAM 38 %, Assimilé 42 %, Cadre 44 %, Expat 22 %)",
          "  + Brut × 1 % (prime de vacances Art. 31 mensualisée)",
          "  + Mutuelle santé (part employeur)",
          "  + Transport (50 % Navigo / TCL)",
          "  + Tickets resto (valeur × part empl. × jours travaillés)",
          "  + 13ᵉ mois ÷ 12 (si pratiqué)",
          "  + Médecine du travail (forfait annuel ÷ 12)",
          "  + Indemnité URSSAF déplacement (115,70 €/j Paris+PC, 96,50 €/j autres zones)",
        ]}
        note="Constante quel que soit t. Versement mobilité (1-3 % selon lieu) déjà inclus dans le total charges par statut."
      />

      {/* CDI — 2 cas (pendant essai / post-essai). Motif fixé à
          "licenciement standard par employeur, préavis respecté". */}
      <FormulaCard
        title="🚪 CDI · t ≤ fin_essai(coef) — pendant essai"
        color="#16A34A"
        lines={[
          "coût_total(t) = C × t",
          "",
          "fin_essai(coef) :",
          "  ETAM coef 240–250  → 4 mois max",
          "  ETAM coef 275–500  → 6 mois max",
          "  Cadre coef 95–270  → 8 mois max",
        ]}
        note="Pas d'indemnité, pas de préavis classique. Coût strictement linéaire en t."
      />

      <FormulaCard
        title="⚠ CDI · t > fin_essai — licenciement par employeur"
        color="#DC2626"
        lines={[
          "coût_total(t) = C × t",
          "              + préavis(statut, coef) × C",
          "              + indemnité_4.5(statut, t)",
          "              + indemnité_CP_non_pris(t)",
          "",
          "préavis(statut, coef) — Article 4.2 :",
          "  ETAM coef < 400, t < 24 mois → 1 mois",
          "  ETAM coef < 400, t ≥ 24 mois → 2 mois",
          "  ETAM coef 400 / 450 / 500    → 2 mois",
          "  Cadre                        → 3 mois",
          "",
          "indemnité_4.5(statut, t) — Article 4.5 :",
          "  Si t < 8 mois                → 0 (condition non remplie)",
          "  ETAM, t ≤ 120 mois           → (1/4) × (t/12) × salaire_réf",
          "  ETAM, t > 120 mois           → ((1/4)×10 + (1/3)×(t/12 − 10)) × salaire_réf",
          "  Cadre, t < 24 mois           → (1/4) × (t/12) × salaire_réf",
          "  Cadre, t ≥ 24 mois           → (1/3) × (t/12) × salaire_réf",
          "",
          "L'employeur verse MAX(formule Syntec, formule légale R1234-2).",
          "salaire_réf = 1/12 des 12 derniers mois bruts.",
        ]}
        note="Worst case réaliste : préavis payé sans facturer + indemnité Syntec. C'est ce que coûte vraiment une rupture."
      />

      {/* CDD — 3 cas : essai / au terme / rupture anticipée par employeur */}
      <FormulaCard
        title="📄 CDD · t ≤ essai_CDD — pendant essai"
        color="#16A34A"
        lines={[
          "coût_total(t) = C × t",
          "",
          "essai_CDD(durée_CDD) — Code du travail L1242-10 :",
          "  durée ≤ 6 mois  → 1 j/semaine, max 2 semaines",
          "  durée > 6 mois  → 1 j/semaine, max 1 mois",
        ]}
        note="Pas d'indemnité fin CDD (contrat non mené à terme). Coût strictement linéaire."
      />

      <FormulaCard
        title="📄 CDD · t = durée_CDD — terme normal"
        color="#D97706"
        lines={[
          "coût_total(t) = C × t",
          "              + 0,10 × Brut × t  (indemnité fin CDD L1243-8)",
          "              + indemnité_CP_non_pris(t)",
          "",
          "Exceptions (pas d'indemnité fin CDD) :",
          "  - CDD jeune saisonnier",
          "  - CDD avec formation diplômante",
        ]}
        note="Cas terminal — le CDD se finit naturellement. Indemnité 10 % due (sauf exceptions)."
      />

      <FormulaCard
        title="⚠ CDD · essai_CDD < t < durée_CDD — rupture anticipée par employeur"
        color="#DC2626"
        lines={[
          "coût_total(t) = C × t",
          "              + Brut × (durée_CDD − t) × (1 + charges)  (dommages-intérêts)",
          "              + 0,10 × Brut × t  (indemnité fin CDD due quand même)",
          "              + indemnité_CP_non_pris(t)",
        ]}
        note="Worst case réaliste CDD : l'employeur doit payer les salaires restants jusqu'au terme + indemnité fin CDD. Coût lourd, croît avec (durée_CDD − t) restant."
      />

      <div style={{
        padding: "10px 12px",
        background: "white", borderRadius: 10,
        border: "1px solid #F0ECF8",
        fontSize: 11, color: "#6B7280", lineHeight: 1.55,
      }}>
        💡 <strong>Pour le calculateur</strong> : chaque carte est une fonction pure
        <code style={codeStyle}> coût_total(t)</code> où <code style={codeStyle}>t</code> = ancienneté en mois.
        Le graphique trace ces courbes pour t ∈ [1, 24], motif au choix. Marge effective
        mensuelle = (revenu × t − coût_total(t)) ÷ t — c&apos;est la marge moyenne par
        mois travaillé si rupture survient au mois t.
      </div>
    </div>
  )
}

function FormulaCard({
  title, color, lines, note,
}: {
  title: string
  color: string
  lines: string[]
  note?: string
}) {
  return (
    <div style={{
      background: "white",
      border: `1px solid ${color}30`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 10, padding: 12,
    }}>
      <h3 style={{
        margin: "0 0 8px", fontSize: 12.5, fontWeight: 800, color: "#111827",
      }}>
        {title}
      </h3>
      <ul style={{
        margin: 0, padding: 0, listStyle: "none",
        display: "flex", flexDirection: "column", gap: 4,
        fontSize: 11.5, color: "#374151", lineHeight: 1.55,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      }}>
        {lines.map((l, i) => (
          <li key={i} style={{
            whiteSpace: "pre-wrap",
            color: l.trim().startsWith("=") || l.trim().startsWith("(") || l.trim().startsWith("Cadre") || l.trim().startsWith("ETAM") || l.trim().startsWith("salaire") || l.trim().startsWith("Indemnité") || l.trim().startsWith("Dommages") || l.trim().startsWith("Aucune")
              ? "#7C63C8" : "#374151",
            fontStyle: l.trim().startsWith("(") ? "italic" : "normal",
          }}>
            {l}
          </li>
        ))}
      </ul>
      {note && (
        <p style={{
          margin: "10px 0 0", fontSize: 10.5, color: "#6B7280", lineHeight: 1.5,
          fontStyle: "italic",
        }}>
          {note}
        </p>
      )}
    </div>
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
        Pricing · Référence opérationnelle
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
        applicable depuis le 1er janvier 2026). À droite : les formules consolidées du
        coût mensuel employeur dans les 3 grands cas (CDI essai, CDI post-essai, CDD).
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
  maxWidth: 1280, margin: "0 auto",
  fontFamily: "var(--font-inter), sans-serif",
}

const paragraphStyle: React.CSSProperties = {
  margin: 0, fontSize: 13, color: "#4B5563", lineHeight: 1.65,
}

const codeStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 10.5,
  background: "rgba(124,99,200,0.08)",
  padding: "1px 5px",
  borderRadius: 4,
  color: "#7C63C8",
}
