/**
 * GET /apply/[token] — page publique de candidature (Slice 6.1 / E2).
 *
 * Server component : résout la mission via le client admin (pas de RLS pour
 * un visiteur anonyme) et affiche 404 si le jeton est inconnu OU si la
 * mission n'est plus ouverte — même comportement dans les deux cas, pour ne
 * jamais révéler qu'une mission fermée existe derrière un lien qui traîne.
 *
 * Pas d'i18n ici (volontairement) : le reste du produit est bilingue FR/EN,
 * mais cette page est neuve et le marché visé par Package Sourcing est
 * francophone — ajoutable plus tard sans redesign si un besoin réel émerge.
 */

import { notFound } from "next/navigation"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { applyMentionText } from "@/lib/apply-mention"
import ApplyForm from "@/components/apply/ApplyForm"

export default async function ApplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const admin = getAdminSupabase()

  const { data: job } = await admin
    .from("jobs")
    .select("id, title, location, organization_id, status")
    .eq("apply_token", token)
    .maybeSingle()

  if (!job || job.status !== "open") notFound()

  const { data: org } = await admin
    .from("organizations")
    .select("name, brand_name, brand_color, contact_email")
    .eq("id", job.organization_id)
    .single()

  const orgLabel = org?.brand_name?.trim() || org?.name?.trim() || "Ce cabinet"
  const brandColor = org?.brand_color?.trim() || "#7C63C8"
  const contactEmail = org?.contact_email?.trim() || "contact@naywastudio.com"
  const mention = applyMentionText({ orgLabel, jobTitle: job.title, contactEmail })

  return (
    <main style={{
      minHeight: "100vh",
      background: "#FDFCF9",
      fontFamily: "var(--font-inter), sans-serif",
      padding: "48px 20px 80px",
    }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{
          height: 4, width: 48, borderRadius: 2, background: brandColor, marginBottom: 20,
        }} />
        <p style={{
          margin: "0 0 6px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "#6B7280",
        }}>
          {orgLabel} recrute
        </p>
        <h1 style={{
          margin: "0 0 8px", fontSize: 28, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em",
        }}>
          {job.title}
        </h1>
        {job.location && (
          <p style={{ margin: "0 0 32px", fontSize: 14, color: "#6B7280" }}>{job.location}</p>
        )}

        <ApplyForm token={token} orgLabel={orgLabel} brandColor={brandColor} mentionText={mention} />

        <p style={{ marginTop: 40, fontSize: 11, color: "#9CA3AF", textAlign: "center" }}>
          Ce formulaire est opéré via Naywa Studio, sous-traitant technique de {orgLabel}.
        </p>
      </div>
    </main>
  )
}
