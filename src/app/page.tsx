"use client"
import { useState } from "react"
import { AnimatePresence } from "framer-motion"
import { Navbar } from "@/components/layout/Navbar"
import { Hero } from "@/components/sections/Hero"
import { WhyNawa } from "@/components/sections/WhyNawa"
import { AgentsPreview } from "@/components/sections/AgentsPreview"
import { HowItWorks } from "@/components/sections/HowItWorks"
import { Footer } from "@/components/layout/Footer"
import OnboardingFlow from "@/components/onboarding/OnboardingFlow"
import { ShaderBackground } from "@/components/ui/ShaderBackground"

export default function Home() {
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [defaultAuthMode, setDefaultAuthMode] = useState<"signup" | "login">("signup")
  const [initialStep, setInitialStep] = useState<"volume" | "signup">("volume")

  const openOnboarding = () => {
    setInitialStep("volume")
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
      <ShaderBackground />
      <Navbar onOpenOnboarding={openOnboarding} onOpenLogin={openLogin} />
      <main style={{ position: "relative", zIndex: 1 }}>
        <Hero onOpenOnboarding={openOnboarding} />
        <WhyNawa />
        <AgentsPreview />
        <HowItWorks />
      </main>
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
