"use client"
import { useState, useEffect, useRef, useMemo } from "react"
import { m } from "framer-motion"
import ChatMessage from "./ChatMessage"
import ChoiceButtons from "./ChoiceButtons"
import AgentCard from "./AgentCard"
import SignupForm from "./SignupForm"
import { Logo } from "@/components/ui/Logo"

type Step = "sector" | "need" | "budget" | "proposal" | "signup" | "done"

interface Answers {
  sector?: string
  need?: string
  budget?: string
}

interface SelectedAgent {
  name: string
  price: string
}

const TOTAL_STEPS = 5
const stepNumber: Record<Step, number> = {
  sector: 1, need: 2, budget: 3, proposal: 4, signup: 5, done: 5
}

const SECTOR_CHOICES = ["Recrutement / RH", "Support client", "Marketing & contenu", "E-commerce", "Autre"]
const NEED_CHOICES: Record<string, string[]> = {
  "Recrutement / RH": ["Qualifier les candidats", "Répondre aux candidatures", "Planifier les entretiens", "Rédiger les offres"],
  "Support client": ["Répondre rapidement", "Gérer hors horaires", "Réduire la charge équipe", "Centraliser les tickets"],
  default: ["Créer du contenu", "Gérer mes réseaux", "Rédiger des newsletters", "Générer des idées"],
}
const BUDGET_CHOICES = ["Moins de 150€/mois", "150€ – 300€/mois", "300€ – 500€/mois", "Je veux d'abord voir"]

// Deterministic bubble data — no Math.random to avoid hydration mismatch
const BUBBLES = Array.from({ length: 16 }, (_, i) => ({
  id: i,
  left: 3 + (i * 5.9) % 92,
  bottomStart: 2 + (i * 6.1) % 55,
  size: 5 + (i * 2.6) % 13,
  delay: (i * 0.55) % 5,
  duration: 4 + (i * 0.6) % 4,
  opacity: 0.25 + (i * 0.04) % 0.38,
}))

interface Props {
  onClose: () => void
  initialStep?: "sector" | "signup"
  defaultAuthMode?: "signup" | "login"
}

export default function OnboardingFlow({ onClose, initialStep = "sector", defaultAuthMode = "signup" }: Props) {
  const [step, setStep] = useState<Step>(initialStep)
  const [answers, setAnswers] = useState<Answers>({})
  const [selectedAgent, setSelectedAgent] = useState<SelectedAgent>({ name: "", price: "" })
  const [messages, setMessages] = useState(() =>
    initialStep === "signup"
      ? [{ from: "agent", text: defaultAuthMode === "login" ? "Bon retour 👋 Connectez-vous à votre espace Nawa Studio." : "Créez votre espace Nawa Studio pour accéder à votre agent." }]
      : [{ from: "agent", text: "Bonjour 👋 En 3 questions, je vais vous proposer l'agent IA qui correspond à votre activité. Quel est votre secteur ?" }]
  )
  const [isTyping, setIsTyping] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, step])

  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [])

  const progress = (stepNumber[step] / TOTAL_STEPS) * 100

  // Keep a stable ref for bubbles to avoid recalculation
  const bubbles = useMemo(() => BUBBLES, [])

  const addAgentMessage = (text: string, nextStep: Step) => {
    setIsTyping(true)
    setTimeout(() => {
      setMessages((prev) => [...prev, { from: "agent", text }])
      setIsTyping(false)
      setStep(nextStep)
    }, 900)
  }

  const handleSector = (choice: string) => {
    setMessages((prev) => [...prev, { from: "user", text: choice }])
    setAnswers((prev) => ({ ...prev, sector: choice }))
    const q =
      choice === "Recrutement / RH" ? "Qu'est-ce qui vous prend le plus de temps aujourd'hui ?"
      : choice === "Support client" ? "Quel est votre défi principal ?"
      : "Où avez-vous besoin d'aide en priorité ?"
    addAgentMessage(q, "need")
  }

  const handleNeed = (choice: string) => {
    setMessages((prev) => [...prev, { from: "user", text: choice }])
    setAnswers((prev) => ({ ...prev, need: choice }))
    addAgentMessage("Parfait. Dernière question — quel budget mensuel envisagez-vous ?", "budget")
  }

  const handleBudget = (choice: string) => {
    setMessages((prev) => [...prev, { from: "user", text: choice }])
    setAnswers((prev) => ({ ...prev, budget: choice }))
    addAgentMessage("Voici l'agent qui correspond à votre profil 👇", "proposal")
  }

  return (
    <m.div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "#F8FAFC" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >

      {/* ── Liquid fill background ───────────────────────── */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute", inset: 0, overflow: "hidden",
          zIndex: 0, pointerEvents: "none",
        }}
      >
        {/* Main liquid body */}
        <m.div
          style={{
            position: "absolute",
            bottom: 0, left: 0, right: 0,
            background: "linear-gradient(180deg, rgba(184,174,222,0.3) 0%, rgba(140,118,210,0.45) 50%, rgba(107,84,178,0.55) 100%)",
          }}
          initial={{ height: "0%" }}
          animate={{ height: `${progress}%` }}
          transition={{ duration: 1.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* Wave surface */}
          <div style={{ position: "absolute", top: -18, left: 0, right: 0, height: 36, overflow: "hidden" }}>
            <m.div
              style={{ display: "flex", width: "200%", height: "100%" }}
              animate={{ x: ["0%", "-50%"] }}
              transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
            >
              {/* Two identical SVG paths tiled side by side for seamless loop */}
              {[0, 1].map((k) => (
                <svg
                  key={k}
                  viewBox="0 0 1440 36"
                  preserveAspectRatio="none"
                  style={{ width: "50%", height: 36, flexShrink: 0 }}
                >
                  <path
                    d="M0,18 C180,36 360,0 540,18 C720,36 900,0 1080,18 C1260,36 1440,0 1620,18 L1620,36 L0,36 Z"
                    fill="rgba(184,174,222,0.75)"
                  />
                  <path
                    d="M0,22 C120,10 240,34 360,22 C480,10 600,34 720,22 C840,10 960,34 1080,22 C1200,10 1320,34 1440,22 L1440,36 L0,36 Z"
                    fill="rgba(140,118,210,0.5)"
                  />
                </svg>
              ))}
            </m.div>
          </div>

          {/* Second wave — slower, different phase */}
          <div style={{ position: "absolute", top: -10, left: 0, right: 0, height: 24, overflow: "hidden" }}>
            <m.div
              style={{ display: "flex", width: "200%", height: "100%" }}
              animate={{ x: ["-50%", "0%"] }}
              transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
            >
              {[0, 1].map((k) => (
                <svg
                  key={k}
                  viewBox="0 0 1440 24"
                  preserveAspectRatio="none"
                  style={{ width: "50%", height: 24, flexShrink: 0 }}
                >
                  <path
                    d="M0,12 C240,24 480,0 720,12 C960,24 1200,0 1440,12 L1440,24 L0,24 Z"
                    fill="rgba(210,204,240,0.55)"
                  />
                </svg>
              ))}
            </m.div>
          </div>

          {/* Bubbles */}
          {bubbles.map((b) => (
            <m.div
              key={b.id}
              style={{
                position: "absolute",
                bottom: `${b.bottomStart}%`,
                left: `${b.left}%`,
                width: b.size,
                height: b.size,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.55)",
                border: "1px solid rgba(255,255,255,0.8)",
                boxShadow: "inset 0 -2px 4px rgba(255,255,255,0.4)",
              }}
              animate={{
                y: [0, -(600 + b.size * 10)],
                opacity: [b.opacity, b.opacity, 0],
                scale: [1, 1.15, 0.8],
              }}
              transition={{
                duration: b.duration,
                delay: b.delay,
                repeat: Infinity,
                ease: "easeInOut",
                times: [0, 0.7, 1],
              }}
            />
          ))}
        </m.div>

        {/* Subtle shimmer overlay on the liquid */}
        <m.div
          style={{
            position: "absolute",
            bottom: 0, left: 0, right: 0,
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)",
          }}
          animate={{ height: `${progress}%` }}
          transition={{ duration: 1.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        />
      </div>

      {/* ── Content layer (above liquid) ─────────────────── */}
      <div className="flex flex-col h-full" style={{ position: "relative", zIndex: 1 }}>

        {/* ── Top bar ───────────────────────────────────── */}
        <div
          className="flex-shrink-0 flex items-center gap-4 px-5 sm:px-8 py-3 border-b"
          style={{
            background: "rgba(255,255,255,0.88)",
            backdropFilter: "blur(10px)",
            borderColor: "rgba(226,218,246,0.6)",
          }}
        >
          <Logo size="md" />

          {/* Step indicator */}
          <div className="flex flex-1 items-center justify-center gap-3">
            <div className="flex items-center gap-2">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => {
                const n = i + 1
                const isCurrent = n === stepNumber[step]
                const isDone = n < stepNumber[step]
                return (
                  <m.div
                    key={n}
                    animate={{
                      scale: isCurrent ? 1.25 : 1,
                      background: isDone
                        ? "linear-gradient(135deg,#7C63C8,#6B54B2)"
                        : isCurrent
                        ? "linear-gradient(135deg,#9B8DD4,#7C63C8)"
                        : "rgba(209,213,219,0.6)",
                    }}
                    transition={{ duration: 0.35 }}
                    style={{
                      width: 8, height: 8, borderRadius: "50%",
                      boxShadow: isCurrent ? "0 0 0 3px rgba(124,99,200,0.25)" : "none",
                    }}
                  />
                )
              })}
            </div>
            <span style={{ fontSize: 12, color: "#6B7280", whiteSpace: "nowrap" }}>
              Étape {stepNumber[step]}/{TOTAL_STEPS}
            </span>
          </div>

          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: "none", border: "1px solid #E2DAF6", borderRadius: 8,
              color: "#9CA3AF", fontSize: 18, lineHeight: 1,
              padding: "5px 10px", cursor: "pointer", transition: "all 150ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#7C63C8"; e.currentTarget.style.color = "#7C63C8" }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E2DAF6"; e.currentTarget.style.color = "#9CA3AF" }}
          >
            ✕
          </button>
        </div>

        {/* ── Scrollable body ───────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-8 flex flex-col gap-5">

            {messages.map((msg, i) => (
              <ChatMessage key={i} from={msg.from as "agent" | "user"} text={msg.text} />
            ))}
            {isTyping && <ChatMessage from="agent" text="..." isTyping />}

            {!isTyping && (
              <m.div
                key={step}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="mt-2"
              >
                {step === "sector" && (
                  <ChoiceButtons choices={SECTOR_CHOICES} onSelect={handleSector} />
                )}
                {step === "need" && (
                  <ChoiceButtons
                    choices={NEED_CHOICES[answers.sector ?? "default"] ?? NEED_CHOICES.default}
                    onSelect={handleNeed}
                  />
                )}
                {step === "budget" && (
                  <ChoiceButtons choices={BUDGET_CHOICES} onSelect={handleBudget} />
                )}
                {step === "proposal" && (
                  <AgentCard
                    answers={answers as Record<string, string>}
                    onNext={(name, price) => {
                      setSelectedAgent({ name, price })
                      setStep("signup")
                    }}
                  />
                )}
                {step === "signup" && (
                  <SignupForm
                    answers={answers}
                    agentName={selectedAgent.name}
                    agentPrice={selectedAgent.price}
                    defaultMode={defaultAuthMode}
                    onDone={() => setStep("done")}
                  />
                )}
                {step === "done" && (
                  <m.div
                    className="text-center py-12 flex flex-col items-center"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <m.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
                      style={{
                        width: 72, height: 72, borderRadius: "50%",
                        background: "linear-gradient(135deg, #7C63C8, #B8AEDE)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 32, marginBottom: 20,
                        boxShadow: "0 8px 32px rgba(124,99,200,0.35)",
                      }}
                    >
                      ✓
                    </m.div>
                    <p style={{ color: "#111827", fontWeight: 700, fontSize: 22, marginBottom: 8 }}>
                      Votre espace est prêt !
                    </p>
                    <p style={{ color: "#6B7280", fontSize: 15, marginBottom: 28, maxWidth: 360 }}>
                      Notre équipe vous contacte sous 24h pour configurer votre agent IA.
                    </p>
                    <button
                      onClick={onClose}
                      style={{
                        background: "linear-gradient(135deg,#7C63C8,#6B54B2)",
                        color: "white", border: "none",
                        borderRadius: 10, padding: "13px 28px",
                        fontSize: 15, fontWeight: 600, cursor: "pointer",
                        boxShadow: "0 4px 16px rgba(124,99,200,0.3)",
                      }}
                    >
                      Retour à l&apos;accueil →
                    </button>
                  </m.div>
                )}
              </m.div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>
      </div>
    </m.div>
  )
}
