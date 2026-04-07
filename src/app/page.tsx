"use client"
import { useState } from "react"
import { AnimatePresence } from "framer-motion"
import { Navbar } from "@/components/layout/Navbar"
import { Hero } from "@/components/sections/Hero"
import { WhyNawa } from "@/components/sections/WhyNawa"
import { AgentsPreview } from "@/components/sections/AgentsPreview"
import { FinalCTA } from "@/components/sections/FinalCTA"
import { Footer } from "@/components/layout/Footer"
import OnboardingFlow from "@/components/onboarding/OnboardingFlow"

export default function Home() {
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [defaultAuthMode, setDefaultAuthMode] = useState<"signup" | "login">("signup")
  const [initialStep, setInitialStep] = useState<"sector" | "signup">("sector")

  const openOnboarding = () => {
    setInitialStep("sector")
    setDefaultAuthMode("signup")
    setShowOnboarding(true)
  }

  const openLogin = () => {
    setInitialStep("signup")
    setDefaultAuthMode("login")
    setShowOnboarding(true)
  }

  return (
    <>
      <Navbar onOpenOnboarding={openOnboarding} onOpenLogin={openLogin} />
      <Hero onOpenOnboarding={openOnboarding} />
      <WhyNawa />
      <AgentsPreview />
      <FinalCTA onOpenOnboarding={openOnboarding} />
      <Footer />
      <AnimatePresence>
        {showOnboarding && (
          <OnboardingFlow
            key="onboarding"
            onClose={() => setShowOnboarding(false)}
            initialStep={initialStep}
            defaultAuthMode={defaultAuthMode}
          />
        )}
      </AnimatePresence>
    </>
  )
}
