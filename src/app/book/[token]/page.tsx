/**
 * Public booking page — naywastudio.com/book/[token]
 *
 * The token is a per-match `booking_token`. We resolve the match, prefill the
 * candidate's name/email, and embed the client's Calendly widget. The token is
 * passed through as `utm_content` so the Calendly webhook can tie the booking
 * back to the right pipeline card.
 *
 * Public (no auth) — `/book/*` is outside the proxy-protected `/workspace/*`.
 */

import type { Metadata } from "next"
import { getAdminSupabase } from "@/lib/admin-supabase"
import CalendlyEmbed from "@/components/booking/CalendlyEmbed"

export const metadata: Metadata = {
  title: "Réserver un entretien — Naywa Studio",
  robots: { index: false, follow: false },
}

const PAGE_BG = "#F8F6FF"
const PRIMARY = "#7C63C8"

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{
      minHeight: "100vh", background: PAGE_BG,
      fontFamily: "var(--font-inter), sans-serif",
      padding: "48px 20px 80px",
    }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>{children}</div>
    </main>
  )
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <div style={{
        background: "white", border: "1px solid #EDE8F8", borderRadius: 18,
        padding: "40px 32px", textAlign: "center",
      }}>
        <h1 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 800, color: "#111827" }}>{title}</h1>
        <p style={{ margin: 0, fontSize: 14.5, color: "#6B7280", lineHeight: 1.65 }}>{body}</p>
      </div>
    </Shell>
  )
}

export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const admin = getAdminSupabase()

  const { data: match } = await admin
    .from("match_assessments")
    .select("id, user_id, candidate_id, job_id")
    .eq("booking_token", token)
    .maybeSingle()

  if (!match) {
    return <Notice
      title="Lien invalide"
      body="Ce lien de réservation n'est plus valide. Contactez votre interlocuteur pour en obtenir un nouveau."
    />
  }

  const [{ data: candidate }, { data: job }, { data: profile }] = await Promise.all([
    admin.from("candidates").select("full_name, email").eq("id", match.candidate_id).maybeSingle(),
    admin.from("jobs").select("title").eq("id", match.job_id).maybeSingle(),
    admin.from("profiles").select("first_name, calendly_scheduling_url, calendly_connected_at")
      .eq("user_id", match.user_id).maybeSingle(),
  ])

  if (!profile?.calendly_connected_at || !profile.calendly_scheduling_url) {
    return <Notice
      title="Réservation indisponible"
      body="La prise de rendez-vous n'est pas encore configurée. Réessayez plus tard ou contactez votre interlocuteur."
    />
  }

  // Build the prefilled widget URL — name/email prefill + token for the webhook.
  const widgetParams = new URLSearchParams()
  if (candidate?.full_name) widgetParams.set("name", candidate.full_name)
  if (candidate?.email) widgetParams.set("email", candidate.email)
  widgetParams.set("utm_content", token)
  const widgetUrl = `${profile.calendly_scheduling_url}?${widgetParams.toString()}`

  const recruiter = profile.first_name?.trim() || "Votre interlocuteur"

  return (
    <Shell>
      <div style={{ marginBottom: 22, textAlign: "center" }}>
        <span style={{
          display: "inline-block", fontSize: 11, fontWeight: 700, color: PRIMARY,
          background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.18)",
          padding: "4px 11px", borderRadius: 100,
          letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14,
        }}>
          Naywa Studio
        </span>
        <h1 style={{
          margin: 0, fontSize: "clamp(22px, 3.4vw, 28px)", fontWeight: 800,
          color: "#111827", letterSpacing: "-0.02em",
        }}>
          Réservez votre entretien
        </h1>
        <p style={{ margin: "10px 0 0", fontSize: 14.5, color: "#6B7280", lineHeight: 1.65 }}>
          {recruiter} vous invite à un entretien
          {job?.title ? <> pour le poste <strong style={{ color: "#374151" }}>{job.title}</strong></> : null}.
          Choisissez le créneau qui vous convient.
        </p>
      </div>

      <div style={{
        background: "white", border: "1px solid #EDE8F8", borderRadius: 18,
        padding: 8, overflow: "hidden",
      }}>
        <CalendlyEmbed url={widgetUrl} />
      </div>
    </Shell>
  )
}
