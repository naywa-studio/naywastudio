import type { Metadata } from "next"
import { CguContent } from "./CguContent"

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation | Naywa Studio",
  description: "Conditions générales d'utilisation du service Naywa Studio.",
}

export default function CGUPage() {
  return <CguContent />
}
