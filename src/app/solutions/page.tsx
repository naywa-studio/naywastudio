import type { Metadata } from "next"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"
import { BrandBands } from "@/components/ui/BrandBands"
import { SolutionsContent } from "./SolutionsContent"

export const metadata: Metadata = {
  title: "Solutions",
  description:
    "Naywa Studio conçoit des packages d'optimisation de process métier. Nous traitons, vous décidez. Découvrez Package Sourcing, dédié aux ESN, cabinets de consulting et cabinets de recrutement.",
}

export default function SolutionsPage() {
  return (
    <>
      <BrandBands />
      <Navbar />
      <SolutionsContent />
      <Footer />
    </>
  )
}
