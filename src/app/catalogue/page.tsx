import { redirect } from "next/navigation"

// Catalogue is folded into the public Tarifs page since the product is
// now Léo-only (Nora and Alex are marked "Bientôt" on /tarifs).
export default function CataloguePage() {
  redirect("/tarifs")
}
