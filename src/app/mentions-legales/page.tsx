import type { Metadata } from "next"
import { MentionsLegalesContent } from "./MentionsLegalesContent"

export const metadata: Metadata = {
  title: "Mentions légales | Naywa Studio",
  description: "Mentions légales de Naywa Studio.",
}

export default function MentionsLegalesPage() {
  return <MentionsLegalesContent />
}
