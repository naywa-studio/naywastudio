"use client"

/**
 * Page de création de mission (plein écran, plus de popup).
 *
 * "Créer une mission" (liste) redirige ici. On réutilise le wizard JobForm
 * en variant "page" : Brief → Mission (14 champs) → Critères. La mission
 * n'est créée qu'en fin d'étape 2 ; à la validation des critères on atterrit
 * directement sur le cockpit matching de la mission créée.
 */

import Link from "next/link"
import { useRouter } from "next/navigation"
import type { Job } from "@/lib/database.types"
import { JobForm } from "../page"

export default function NewMissionPage() {
  const router = useRouter()
  return (
    <main style={{
      padding: "32px 24px 80px", maxWidth: 900, margin: "0 auto",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      <div style={{ marginBottom: 18 }}>
        <Link href="/workspace/missions" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 13, color: "var(--nw-primary)", textDecoration: "none",
        }}>← Retour aux missions</Link>
      </div>
      <JobForm
        variant="page"
        onClose={() => router.push("/workspace/missions")}
        onCreated={(job: Job) => router.push(`/workspace/missions/${job.id}`)}
      />
    </main>
  )
}
