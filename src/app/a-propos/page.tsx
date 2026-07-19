import type { Metadata } from "next"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"
import { BrandBands } from "@/components/ui/BrandBands"
import { AProposContent } from "./AProposContent"

export const metadata: Metadata = {
  title: "À propos",
  description:
    "Naywa Studio est un studio produit qui conçoit des packages métier augmentés par l'intelligence artificielle. Notre conviction : l'IA traite, le sourceur décide. Naywa industrialise le traitement des CVs sans jamais retirer le contrôle au recruteur.",
}

export default function AProposPage() {
  return (
    <>
      <BrandBands />
      <Navbar />
      <AProposContent />
      <Footer />
    </>
  )
}
