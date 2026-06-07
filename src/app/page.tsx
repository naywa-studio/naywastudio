import { Navbar } from "@/components/layout/Navbar"
import { Hero } from "@/components/sections/Hero"
import { WhyNawa } from "@/components/sections/WhyNawa"
import { AgentsPreview } from "@/components/sections/AgentsPreview"
import { HowItWorks } from "@/components/sections/HowItWorks"
import { Founders } from "@/components/sections/Founders"
import { Footer } from "@/components/layout/Footer"
import { ShaderBackground } from "@/components/ui/ShaderBackground"
import AuthErrorRedirect from "@/components/layout/AuthErrorRedirect"

export default function Home() {
  return (
    <>
      <AuthErrorRedirect />
      <ShaderBackground />
      <Navbar />
      <main style={{ position: "relative", zIndex: 1 }}>
        <Hero />
        <WhyNawa />
        <AgentsPreview />
        <HowItWorks />
        <Founders />
      </main>
      <Footer />
    </>
  )
}
