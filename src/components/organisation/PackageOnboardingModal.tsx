"use client"

import { useEffect, useState } from "react"
import { LazyMotion, domAnimation, m } from "framer-motion"

/**
 * Visite guidée 6 étapes du Package Sourcing.
 *
 * Déclenchée automatiquement sur /organisation après une souscription
 * réussie (ou réactivation), tant que l'owner n'a pas stampé
 * package_sourcing_onboarded_at sur son org.
 *
 * Comportement :
 *   - "Suivant" / "Précédent" pour naviguer dans les 6 étapes
 *   - "Plus tard" : dismiss session-only (revient au prochain refresh
 *     via bannière reminder sur /organisation)
 *   - "Skip définitif" sur la dernière étape : stamp + ne revient plus
 *   - "Aller au workspace" sur la dernière étape : stamp + redirige
 *
 * Le contenu reprend les 6 étapes de la marketing PackageSourcingFlow,
 * adapté pour un onboarding interne plutôt qu'une vente.
 */

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

interface Step {
  number: string
  title:  string
  short:  string
  body:   string
  cta?:   { label: string; href: string }
}

const STEPS: Step[] = [
  {
    number: "01",
    title:  "Constituez votre vivier",
    short:  "Upload de CVs + classement par secteur par Nora",
    body:   "Glissez vos CVs en PDF (même scannés — OCR intégré) dans votre vivier. Nora extrait le nom, l'expérience post-diplôme réelle, les compétences, la séniorité, et classe chaque candidat dans son secteur. Chaque nouvel upload s'organise tout seul, sans tri manuel.",
    cta:    { label: "Ouvrir le vivier", href: "/workspace/vivier" },
  },
  {
    number: "02",
    title:  "Créez vos missions",
    short:  "Collez un brief, Nora extrait les 14 champs",
    body:   "Collez une fiche de poste, un RFP ou un brief texte dans /workspace/missions. Nora extrait l'intitulé, le lieu, la séniorité, les compétences, le type de contrat, le TJM cible et le brut cible en 5 secondes. Vous corrigez, vous validez — le matching se lance automatiquement.",
    cta:    { label: "Créer une mission", href: "/workspace/missions" },
  },
  {
    number: "03",
    title:  "Évaluez le matching",
    short:  "Score multi-critères, justification dimension par dimension",
    body:   "Pour chaque mission, Nora score tous les candidats du vivier. Le score est justifié : compétences techniques, séniorité, secteur, localisation. Pas de boîte noire — vous cliquez sur un candidat et vous voyez pourquoi il a 87 % et pas 60 %.",
    cta:    { label: "Voir les matches", href: "/workspace/missions" },
  },
  {
    number: "04",
    title:  "Chiffrez avec la Suite Pricing Syntec",
    short:  "Marge mensuelle réelle, calendrier fériés, chart risque rupture",
    body:   "Vous réglez le TJM facturable et le brut consultant. Naywa calcule la marge mensuelle réelle avec charges patronales par statut, plafonds URSSAF, calendrier fériés français, indemnité CP et période d'essai. Le chart « risque rupture » visualise mois par mois où sont les zones de fragilité financière.",
    cta:    { label: "Ouvrir le pricing", href: "/workspace/pricing" },
  },
  {
    number: "05",
    title:  "Anonymisez en 1 clic",
    short:  "PDF brandé à votre organisation, nom et photo retirés",
    body:   "Sur chaque fiche candidat, bouton « Anonymiser pour cette mission ». PDF généré sans nom, sans photo, sans coordonnées, avec votre logo en header et une référence interne C-XXXXXXXX. Le CV original reste intact dans votre vivier.",
    cta:    { label: "Voir le vivier", href: "/workspace/vivier" },
  },
  {
    number: "06",
    title:  "Suivez le pipeline candidat",
    short:  "Kanban partagé entre les membres",
    body:   "Chaque candidat × mission a son étape : Identifié, Contacté, Réponse, Entretien, Offre. Vous déplacez à la main — Nora suggère mais ne décide jamais. Le pipeline est partagé entre les membres de votre structure : tout le monde voit où en est chaque positionnement.",
    cta:    { label: "Ouvrir le pipeline", href: "/workspace/pipeline" },
  },
]

interface Props {
  /** Appelé quand l'owner termine ou skippe définitivement la visite. */
  onDone: () => void
  /** Appelé quand l'owner clique "Plus tard" (dismiss session-only). */
  onDismiss: () => void
}

export function PackageOnboardingModal({ onDone, onDismiss }: Props) {
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  // ESC pour dismiss session-only
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss()
      if (e.key === "ArrowRight" && step < STEPS.length - 1) setStep(step + 1)
      if (e.key === "ArrowLeft" && step > 0) setStep(step - 1)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [step, onDismiss])

  const stampDone = async () => {
    setBusy(true)
    try {
      await fetch("/api/cabinet/package-onboarding-done", { method: "POST" })
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <LazyMotion features={domAnimation}>
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(17,24,39,0.55)",
          backdropFilter: "blur(3px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20,
        }}
      >
        <m.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: EASE }}
          style={{
            background: "white",
            borderRadius: 22,
            width: "100%",
            maxWidth: 640,
            boxShadow: "0 30px 90px -20px rgba(17,24,39,0.40)",
            fontFamily: "var(--font-inter), sans-serif",
            overflow: "hidden",
          }}
        >
          {/* Progress bar */}
          <div style={{
            height: 3, background: "var(--nw-border-soft)", position: "relative",
          }}>
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0,
              width: `${((step + 1) / STEPS.length) * 100}%`,
              background: "linear-gradient(90deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
              transition: "width 320ms cubic-bezier(0.22, 1, 0.36, 1)",
            }} />
          </div>

          {/* Header */}
          <header style={{
            display: "flex", justifyContent: "space-between", alignItems: "flex-start",
            padding: "26px 30px 8px",
          }}>
            <div>
              <p style={{
                margin: 0, fontSize: 11, fontWeight: 700, color: "var(--nw-primary)",
                letterSpacing: "0.10em", textTransform: "uppercase",
              }}>
                Étape {current.number} sur 06 · Visite guidée
              </p>
              <h2 style={{
                margin: "8px 0 0", fontSize: 24, fontWeight: 800, color: "var(--nw-text)",
                letterSpacing: "-0.02em", lineHeight: 1.15,
              }}>
                {current.title}
              </h2>
              <p style={{
                margin: "6px 0 0", fontSize: 14, color: "var(--nw-primary)", fontWeight: 600,
              }}>
                {current.short}
              </p>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Plus tard"
              style={{
                background: "transparent", border: "none",
                fontSize: 22, color: "var(--nw-text-muted)",
                cursor: "pointer", padding: 4, marginTop: -4,
                fontFamily: "inherit",
              }}
            >
              ×
            </button>
          </header>

          {/* Body */}
          <div style={{ padding: "16px 30px 22px" }}>
            <p style={{
              margin: 0, fontSize: 14.5, color: "var(--nw-text-body)", lineHeight: 1.65,
            }}>
              {current.body}
            </p>
            {current.cta && (
              <a
                href={current.cta.href}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  marginTop: 18,
                  padding: "10px 16px", borderRadius: 10,
                  border: "1px solid rgba(124,99,200,0.30)",
                  background: "white", color: "var(--nw-primary)",
                  fontSize: 13, fontWeight: 700, textDecoration: "none",
                }}
              >
                {current.cta.label} →
              </a>
            )}
          </div>

          {/* Footer */}
          <footer style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "16px 30px 24px",
            borderTop: "1px solid var(--nw-border-soft)",
            background: "var(--nw-surface-muted)",
          }}>
            <div style={{ display: "flex", gap: 6 }}>
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setStep(i)}
                  aria-label={`Étape ${i + 1}`}
                  style={{
                    width: 8, height: 8, borderRadius: "50%", border: "none",
                    background: i === step ? "var(--nw-primary)" : i < step ? "#C4B5E5" : "var(--nw-border)",
                    cursor: "pointer", padding: 0,
                  }}
                />
              ))}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  style={{
                    padding: "9px 14px", borderRadius: 10,
                    border: "1px solid var(--nw-border)",
                    background: "white", color: "var(--nw-text-body)",
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  ← Précédent
                </button>
              )}
              {!isLast ? (
                <button
                  type="button"
                  onClick={() => setStep(step + 1)}
                  style={{
                    padding: "9px 16px", borderRadius: 10,
                    border: "none",
                    background: "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
                    color: "white", fontSize: 13.5, fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 6px 18px -6px rgba(124,99,200,0.55)",
                    fontFamily: "inherit",
                  }}
                >
                  Suivant →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stampDone}
                  disabled={busy}
                  style={{
                    padding: "9px 16px", borderRadius: 10,
                    border: "none",
                    background: "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
                    color: "white", fontSize: 13.5, fontWeight: 700,
                    cursor: busy ? "wait" : "pointer",
                    boxShadow: "0 6px 18px -6px rgba(124,99,200,0.55)",
                    opacity: busy ? 0.7 : 1,
                    fontFamily: "inherit",
                  }}
                >
                  {busy ? "Enregistrement…" : "Terminer la visite"}
                </button>
              )}
            </div>
          </footer>
        </m.div>
      </div>
    </LazyMotion>
  )
}
