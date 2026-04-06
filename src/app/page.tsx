import { Hero }          from '@/components/sections/Hero'
import { Services }      from '@/components/sections/Services'
import { AgentsCatalog } from '@/components/sections/AgentsCatalog'
import { HowItWorks }    from '@/components/sections/HowItWorks'
import { Pricing }       from '@/components/sections/Pricing'
import { CTA }           from '@/components/sections/CTA'

export default function Home() {
  return (
    <>
      <Hero />
      <Services />
      <AgentsCatalog />
      <HowItWorks />
      <Pricing />
      <CTA />
    </>
  )
}
