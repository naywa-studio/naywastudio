import type { Metadata } from "next"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"
import { BrandBands } from "@/components/ui/BrandBands"
import { FaqContent } from "./FaqContent"

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Questions fréquentes sur Naywa Studio et Package Sourcing. Vivier de CVs, matching, pricing Syntec, anonymisation, pipeline candidat. Pour ESN, cabinets de consulting et cabinets de recrutement.",
}

export default function FAQPage() {
  return (
    <div style={{ background: "transparent", minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative" }}>
      <BrandBands />
      <Navbar />
      <FaqContent />
      <Footer />
    </div>
  )
}
