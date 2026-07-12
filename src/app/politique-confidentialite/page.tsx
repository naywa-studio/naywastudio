import type { Metadata } from "next"
import { PolitiqueConfidentialiteContent } from "./PolitiqueConfidentialiteContent"

export const metadata: Metadata = {
  title: "Politique de confidentialité | Naywa Studio",
  description: "Comment Naywa Studio collecte, traite et protège vos données et celles de vos candidats.",
}

export default function PolitiqueConfidentialitePage() {
  return <PolitiqueConfidentialiteContent />
}
