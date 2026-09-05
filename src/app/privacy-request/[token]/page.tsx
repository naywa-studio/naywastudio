/**
 * GET /privacy-request/[token] — self-service RGPD candidat (Slice 6.2).
 *
 * Server component : résout le candidat via le jeton signé (client admin,
 * pas de session). Même message que le jeton soit invalide OU que le
 * candidat ait déjà été supprimé/anonymisé — ne jamais laisser deviner
 * lequel des deux cas c'est.
 */

import { getAdminSupabase } from "@/lib/admin-supabase"
import { resolveCandidateByToken } from "@/lib/candidate-rgpd"
import PrivacyRequestPanel from "@/components/privacy-request/PrivacyRequestPanel"

export default async function PrivacyRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const admin = getAdminSupabase()
  const candidate = await resolveCandidateByToken(admin, token)

  const { data: org } = candidate
    ? await admin.from("organizations").select("name, brand_name, brand_color").eq("id", candidate.organization_id).single()
    : { data: null }
  const orgLabel = org?.brand_name?.trim() || org?.name?.trim() || "ce cabinet"
  const brandColor = org?.brand_color?.trim() || "#7C63C8"

  return (
    <main style={{
      minHeight: "100vh",
      background: "#FDFCF9",
      fontFamily: "var(--font-inter), sans-serif",
      padding: "48px 20px 80px",
    }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ height: 4, width: 48, borderRadius: 2, background: brandColor, marginBottom: 20 }} />
        <p style={{
          margin: "0 0 6px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "#6B7280",
        }}>
          Vos données chez {orgLabel}
        </p>
        <h1 style={{ margin: "0 0 28px", fontSize: 24, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em" }}>
          Gérer mes données
        </h1>

        {!candidate ? (
          <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 16, padding: 24 }}>
            <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
              Ce lien n&apos;est plus valide — soit il est incorrect, soit les données qu&apos;il concernait ont
              déjà été supprimées. Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur, contactez directement
              le cabinet concerné.
            </p>
          </div>
        ) : (
          <PrivacyRequestPanel
            token={token}
            orgLabel={orgLabel}
            brandColor={brandColor}
            initialFullName={candidate.full_name ?? ""}
            initialEmail={candidate.email ?? ""}
            initialPhone={candidate.phone ?? ""}
            initialLocation={candidate.location ?? ""}
            initialLinkedinUrl={candidate.linkedin_url ?? ""}
          />
        )}

        <p style={{ marginTop: 40, fontSize: 11, color: "#9CA3AF", textAlign: "center" }}>
          Cette page est opérée via Naywa Studio, sous-traitant technique de {orgLabel}.
        </p>
      </div>
    </main>
  )
}
