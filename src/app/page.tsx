"use client"
import { useState } from "react"
import { Navbar } from "@/components/layout/Navbar"
import { Hero } from "@/components/sections/Hero"
import { WhyNawa } from "@/components/sections/WhyNawa"
import { AgentsPreview } from "@/components/sections/AgentsPreview"
import { FinalCTA } from "@/components/sections/FinalCTA"
import { Footer } from "@/components/layout/Footer"
import OnboardingFlow from "@/components/onboarding/OnboardingFlow"

export default function Home() {
  const [showOnboarding, setShowOnboarding] = useState(false)

  return (
    <>
      <Navbar />
      <Hero onOpenOnboarding={() => setShowOnboarding(true)} />
      <WhyNawa />
      <AgentsPreview />
      <FinalCTA onOpenOnboarding={() => setShowOnboarding(true)} />
      <Footer />
      {showOnboarding && <OnboardingFlow onClose={() => setShowOnboarding(false)} />}
    </>
  )
}
