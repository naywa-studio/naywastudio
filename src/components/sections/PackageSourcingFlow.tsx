"use client"

/**
 * PackageSourcingFlow — frise des 6 étapes du Package Sourcing.
 *
 * Visuel : un fil épais sinusoïdal SVG qui ondule de gauche à droite avec
 * 6 nœuds numérotés posés dessus. Clic sur un nœud → la carte détail
 * en dessous s'anime pour montrer le contenu de l'étape.
 *
 * Pensé pour être utilisé sur la home — sobre, pas de motion lourde,
 * juste un fade-in framer-motion sur la carte qui change.
 */

import { useState } from "react"
import { m, AnimatePresence } from "framer-motion"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

interface Step {
  number: string
  title:  string
  short:  string          // sous-titre court à côté du numéro
  body:   string          // paragraphe détail dans la carte
  hint:   string          // « ce que vous voyez côté outil »
  /** position sur le SVG en coords viewBox 1200 × 160 */
  x: number
  y: number
}

const STEPS: Step[] = [
  {
    number: "01",
    title:  "Vivier",
    short:  "Upload CV + clustering automatique",
    body:   "Drag-drop n'importe quel CV — PDF, DOCX, photo. Nora extrait le nom, l'expérience post-diplôme réelle, les compétences, la séniorité. Le candidat est rangé automatiquement dans sa zone métier (vivier vivant). Pas de reclassement manuel — les nouveaux candidats viennent enrichir les zones existantes.",
    hint:   "Vue carte du vivier + fiche candidat parsée",
    x: 90,
    y: 110,
  },
  {
    number: "02",
    title:  "Missions",
    short:  "Brief texte → formulaire pré-rempli",
    body:   "Vous collez un brief client, une fiche de poste ou un RFP. Nora extrait les 14 champs structurés en 5 secondes : intitulé, lieu, séniorité, compétences requises, type de contrat, TJM cible, brut cible. Vous corrigez ce qui doit l'être, vous validez — le matching se lance automatiquement.",
    hint:   "Modal de création de mission avec bordures colorées",
    x: 270,
    y: 50,
  },
  {
    number: "03",
    title:  "Matching",
    short:  "Score + justification multi-critères",
    body:   "Pour chaque mission, Nora score tous les candidats du vivier. Le score est justifié dimension par dimension : compétences techniques, séniorité, secteur, localisation. Aucune boîte noire — vous cliquez sur un candidat et vous voyez pourquoi il a 87% et pas 60%.",
    hint:   "Shortlist triée par tier : excellent / bon / moyen",
    x: 450,
    y: 110,
  },
  {
    number: "04",
    title:  "Pricing Syntec",
    short:  "Calcul marge temps réel selon convention",
    body:   "Vous réglez le TJM facturable et le brut consultant. Naywa calcule la marge mensuelle réelle, avec charges patronales par statut, plafonds URSSAF, calendrier fériés français, indemnité de congés payés, période d'essai. Bonus : un chart « risque de rupture » qui visualise mois par mois où sont les zones de fragilité.",
    hint:   "Layout 2 colonnes : sliders + verdict + charts",
    x: 630,
    y: 50,
  },
  {
    number: "05",
    title:  "Anonymisation",
    short:  "PDF brandé à votre organisation, 1 clic",
    body:   "Bouton « Anonymiser pour cette mission ». PDF généré sans nom, sans photo, sans coordonnées, avec votre logo en header et une référence interne C-XXXXXXXX pour suivre le candidat avec votre client sans révéler son identité. Le CV original reste intact dans votre vivier.",
    hint:   "Aperçu du PDF anonymisé téléchargeable",
    x: 810,
    y: 110,
  },
  {
    number: "06",
    title:  "Pipeline",
    short:  "Suivi candidat Identifié → Offre",
    body:   "Kanban partagé entre les membres de votre organisation. Chaque candidat × mission a son étape : Identifié, Contacté, Réponse, Entretien, Offre. Vous déplacez à la main — Nora suggère mais ne décide jamais. Les emails entrants (webhook Resend) remontent les réponses pour vous faire gagner du temps de saisie.",
    hint:   "Vue Kanban partagée avec colonnes par stage",
    x: 990,
    y: 50,
  },
]

/** SVG path qui passe par les 6 nœuds avec une courbe douce. */
const PATH = (() => {
  let d = `M ${STEPS[0].x} ${STEPS[0].y}`
  for (let i = 1; i < STEPS.length; i++) {
    const prev = STEPS[i - 1]
    const cur  = STEPS[i]
    const cx1  = prev.x + (cur.x - prev.x) * 0.5
    const cx2  = prev.x + (cur.x - prev.x) * 0.5
    d += ` C ${cx1} ${prev.y}, ${cx2} ${cur.y}, ${cur.x} ${cur.y}`
  }
  return d
})()

export function PackageSourcingFlow() {
  const [active, setActive] = useState(0)
  const step = STEPS[active]

  return (
    <section
      style={{
        background: "transparent",
        padding: "16px 24px 80px",
        position: "relative",
      }}
    >
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        {/* Header */}
        <m.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.65, ease: EASE }}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 14,
            marginBottom: 56,
          }}
        >
          <h3
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: "clamp(22px, 2.8vw, 30px)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "#111827",
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            Le process en{" "}
            <span
              style={{
                fontFamily: "var(--font-instrument-serif), serif",
                fontWeight: 400,
                fontStyle: "italic",
                color: "#7C63C8",
              }}
            >
              6 étapes
            </span>
          </h3>
          <p
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 14.5,
              color: "#4B5563",
              lineHeight: 1.65,
              maxWidth: "58ch",
              margin: 0,
            }}
          >
            Cliquez sur une étape pour voir comment Naywa l&apos;optimise. Du
            premier CV qui rentre dans votre vivier jusqu&apos;à l&apos;offre
            signée avec votre client.
          </p>
        </m.div>

        {/* SVG wave + nodes */}
        <m.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
          style={{
            position: "relative",
            width: "100%",
            marginBottom: 36,
          }}
        >
          <svg
            viewBox="0 0 1080 170"
            preserveAspectRatio="none"
            style={{ width: "100%", height: "clamp(120px, 16vw, 170px)", display: "block", overflow: "visible" }}
            aria-hidden
          >
            <defs>
              <linearGradient id="threadGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor="#B8AEDE" />
                <stop offset="50%"  stopColor="#7C63C8" />
                <stop offset="100%" stopColor="#B8AEDE" />
              </linearGradient>
              <filter id="threadGlow" x="-10%" y="-50%" width="120%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* The thick thread */}
            <path
              d={PATH}
              fill="none"
              stroke="url(#threadGradient)"
              strokeWidth="7"
              strokeLinecap="round"
              filter="url(#threadGlow)"
              opacity={0.95}
            />

            {/* Nodes */}
            {STEPS.map((s, i) => {
              const isActive = active === i
              return (
                <g key={s.number} style={{ cursor: "pointer" }} onClick={() => setActive(i)}>
                  {/* Outer halo when active */}
                  {isActive && (
                    <circle
                      cx={s.x}
                      cy={s.y}
                      r={26}
                      fill="rgba(124,99,200,0.15)"
                    />
                  )}
                  {/* Node */}
                  <circle
                    cx={s.x}
                    cy={s.y}
                    r={isActive ? 22 : 18}
                    fill={isActive ? "#7C63C8" : "#FFFFFF"}
                    stroke={isActive ? "#6B54B2" : "#7C63C8"}
                    strokeWidth={isActive ? 0 : 2.5}
                    style={{ transition: "all 200ms cubic-bezier(0.22, 1, 0.36, 1)" }}
                  />
                  {/* Number */}
                  <text
                    x={s.x}
                    y={s.y + 5}
                    textAnchor="middle"
                    fontFamily="var(--font-inter), sans-serif"
                    fontSize="14"
                    fontWeight="700"
                    fill={isActive ? "#FFFFFF" : "#7C63C8"}
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {s.number}
                  </text>
                </g>
              )
            })}
          </svg>

          {/* Step labels under each node — only visible on wider screens */}
          <div
            className="package-sourcing-labels"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
              gap: 8,
              marginTop: 14,
            }}
          >
            {STEPS.map((s, i) => {
              const isActive = active === i
              return (
                <button
                  key={s.number}
                  type="button"
                  onClick={() => setActive(i)}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: "4px 8px",
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 12.5,
                    fontWeight: isActive ? 700 : 600,
                    color: isActive ? "#7C63C8" : "#6B7280",
                    textAlign: "center" as const,
                    letterSpacing: "-0.005em",
                    transition: "color 180ms ease",
                  }}
                >
                  {s.title}
                </button>
              )
            })}
          </div>
        </m.div>

        {/* Detail card */}
        <div style={{ position: "relative", minHeight: 240 }}>
          <AnimatePresence mode="wait">
            <m.article
              key={step.number}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: EASE }}
              style={{
                background: "white",
                border: "1px solid #F0ECF8",
                borderRadius: 20,
                padding: "28px 32px",
                boxShadow: "0 4px 24px rgba(124,99,200,0.06)",
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "0 24px",
                alignItems: "start",
              }}
              className="package-sourcing-card"
            >
              {/* Big numeral */}
              <div
                style={{
                  fontFamily: "var(--font-instrument-serif), serif",
                  fontStyle: "italic",
                  fontWeight: 400,
                  fontSize: "clamp(64px, 7vw, 96px)",
                  color: "#7C63C8",
                  lineHeight: 0.9,
                  letterSpacing: "-0.03em",
                  alignSelf: "start",
                  opacity: 0.92,
                }}
              >
                {step.number}
              </div>

              {/* Content */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <h3
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 22,
                      fontWeight: 800,
                      color: "#111827",
                      letterSpacing: "-0.015em",
                    }}
                  >
                    {step.title}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 13,
                      color: "#7C63C8",
                      fontWeight: 600,
                      letterSpacing: "-0.005em",
                    }}
                  >
                    {step.short}
                  </p>
                </header>

                <p
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 14.5,
                    lineHeight: 1.7,
                    color: "#374151",
                  }}
                >
                  {step.body}
                </p>

                <p
                  style={{
                    margin: "8px 0 0",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 12.5,
                    color: "#6B7280",
                    fontWeight: 500,
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
                      borderRadius: 5,
                      background: "rgba(124,99,200,0.10)",
                      border: "1px solid rgba(124,99,200,0.22)",
                      color: "#7C63C8",
                      flexShrink: 0,
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="12" cy="12" r="3" />
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                    </svg>
                  </span>
                  <span>
                    <strong style={{ color: "#374151", fontWeight: 600 }}>Côté outil :</strong>{" "}
                    {step.hint}
                  </span>
                </p>
              </div>
            </m.article>
          </AnimatePresence>
        </div>
      </div>

      <style>{`
        @media (max-width: 720px) {
          .package-sourcing-labels {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            row-gap: 6px !important;
          }
          .package-sourcing-card {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .package-sourcing-card > div:first-child {
            font-size: 56px !important;
          }
        }
      `}</style>
    </section>
  )
}
