import { Navbar } from "@/components/layout/Navbar"
import { Hero } from "@/components/sections/Hero"
import { WhyNawa } from "@/components/sections/WhyNawa"
import { AgentsPreview } from "@/components/sections/AgentsPreview"
import { HowItWorks } from "@/components/sections/HowItWorks"
import { Footer } from "@/components/layout/Footer"
import { ShaderBackground } from "@/components/ui/ShaderBackground"

export default function Home() {
  return (
    <>
      <ShaderBackground />
      <Navbar />
      <main style={{ position: "relative", zIndex: 1 }}>
        <Hero />
        <WhyNawa />
        <AgentsPreview />
        <HowItWorks />
      </main>
      <Footer />
    </>
  )
}
