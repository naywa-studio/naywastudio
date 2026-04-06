"use client"
import { useState } from "react"
import { m, AnimatePresence } from "framer-motion"
import ChatMessage from "./ChatMessage"
import ChoiceButtons from "./ChoiceButtons"
import AgentCard from "./AgentCard"
import SignupForm from "./SignupForm"

type Step = "sector" | "need" | "budget" | "proposal" | "signup" | "done"

interface Answers {
  sector?: string
  need?: string
  budget?: string
}

export default function OnboardingFlow({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>("sector")
  const [answers, setAnswers] = useState<Answers>({})
  const [messages, setMessages] = useState([
    { from: "agent", text: "Bonjour 👋 En 3 questions, je vais vous proposer l'agent IA qui correspond à votre activité. Quel est votre secteur ?" }
  ])
  const [isTyping, setIsTyping] = useState(false)

  const progress = { sector: 20, need: 45, budget: 70, proposal: 85, signup: 95, done: 100 }[step]

  const addAgentMessage = (text: string, nextStep: Step) => {
    setIsTyping(true)
    setTimeout(() => {
      setMessages(prev => [...prev, { from: "agent", text }])
      setIsTyping(false)
      setStep(nextStep)
    }, 800)
  }

  const handleSector = (choice: string) => {
    setMessages(prev => [...prev, { from: "user", text: choice }])
    setAnswers(prev => ({ ...prev, sector: choice }))
    const q = choice === "Recrutement / RH"
      ? "Qu'est-ce qui vous prend le plus de temps aujourd'hui ?"
      : choice === "Support client"
      ? "Quel est votre défi principal ?"
      : "Où avez-vous besoin d'aide en priorité ?"
    addAgentMessage(q, "need")
  }

  const handleNeed = (choice: string) => {
    setMessages(prev => [...prev, { from: "user", text: choice }])
    setAnswers(prev => ({ ...prev, need: choice }))
    addAgentMessage("Parfait. Dernière question — quel budget mensuel envisagez-vous ?", "budget")
  }

  const handleBudget = (choice: string) => {
    setMessages(prev => [...prev, { from: "user", text: choice }])
    setAnswers(prev => ({ ...prev, budget: choice }))
    addAgentMessage("Voici l'agent qui correspond à votre profil 👇", "proposal")
  }

  const sectorChoices = ["Recrutement / RH", "Support client", "Marketing & contenu", "E-commerce", "Autre"]
  const needChoices: Record<string, string[]> = {
    "Recrutement / RH": ["Qualifier les candidats", "Répondre aux candidatures", "Planifier les entretiens", "Rédiger les offres"],
    "Support client": ["Répondre rapidement", "Gérer hors horaires", "Réduire la charge équipe", "Centraliser les tickets"],
    default: ["Créer du contenu", "Gérer mes réseaux", "Rédiger des newsletters", "Générer des idées"]
  }
  const budgetChoices = ["Moins de 150€/mois", "150€ – 300€/mois", "300€ – 500€/mois", "Je veux d'abord voir"]

  return (
    <AnimatePresence>
      <m.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)" }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      >
        <m.div
          className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col"
          style={{ maxHeight: "85vh" }}
          initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        >
          {/* Progress bar */}
          <div className="h-1 bg-gray-100 rounded-t-2xl overflow-hidden">
            <m.div className="h-full" style={{ backgroundColor: "#7C63C8" }}
              animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "#E2DAF6" }}>
            <span style={{ fontFamily: "Space Grotesk", fontWeight: 600, color: "#111827", fontSize: 15 }}>Trouvez votre agent</span>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3">
            {messages.map((m, i) => <ChatMessage key={i} from={m.from as "agent" | "user"} text={m.text} />)}
            {isTyping && <ChatMessage from="agent" text="..." isTyping />}
          </div>

          {/* Choix */}
          <div className="px-6 pb-6 pt-2">
            {step === "sector" && <ChoiceButtons choices={sectorChoices} onSelect={handleSector} />}
            {step === "need" && <ChoiceButtons choices={needChoices[answers.sector || "default"] ?? needChoices.default} onSelect={handleNeed} />}
            {step === "budget" && <ChoiceButtons choices={budgetChoices} onSelect={handleBudget} />}
            {step === "proposal" && <AgentCard answers={answers} onNext={() => setStep("signup")} />}
            {step === "signup" && <SignupForm onDone={() => setStep("done")} />}
            {step === "done" && (
              <div className="text-center py-4">
                <p style={{ color: "#7C63C8", fontWeight: 600 }}>✓ Votre espace est prêt !</p>
                <p style={{ color: "#4B5563", fontSize: 14, marginTop: 8 }}>Notre équipe vous contacte sous 24h pour configurer votre agent.</p>
                <button onClick={onClose} className="mt-4 text-sm" style={{ color: "#7C63C8" }}>Fermer →</button>
              </div>
            )}
          </div>
        </m.div>
      </m.div>
    </AnimatePresence>
  )
}
