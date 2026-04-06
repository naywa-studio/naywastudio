import { NeuralSceneClient } from '@/components/ui/NeuralSceneClient'
import { Hero }              from '@/components/sections/Hero'
import { Services }          from '@/components/sections/Services'
import { AgentsCatalog }     from '@/components/sections/AgentsCatalog'
import { HowItWorks }        from '@/components/sections/HowItWorks'
import { Pricing }           from '@/components/sections/Pricing'
import { CTA }               from '@/components/sections/CTA'

export default function Home() {
  return (
    <>
      {/* Neural network canvas — fixed behind everything (z-0), client-only */}
      <NeuralSceneClient />

      <Hero />
      <Services />
      <AgentsCatalog />
      <HowItWorks />
      <Pricing />
      <CTA />
    </>
  )
}
