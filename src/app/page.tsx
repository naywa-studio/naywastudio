import { Navbar } from "@/components/layout/Navbar"
import { Hero } from "@/components/sections/Hero"
import { WhyNawa } from "@/components/sections/WhyNawa"
import { AgentsPreview } from "@/components/sections/AgentsPreview"
import { FinalCTA } from "@/components/sections/FinalCTA"
import { Footer } from "@/components/layout/Footer"

export default function Home() {
  return (
    <>
      <Navbar />
      <Hero />
      <WhyNawa />
      <AgentsPreview />
      <FinalCTA />
      <Footer />
    </>
  )
}
