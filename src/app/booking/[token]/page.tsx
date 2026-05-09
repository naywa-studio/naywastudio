import type { Metadata } from "next"
import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { Logo } from "@/components/ui/Logo"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Choisir un créneau",
  description: "Réservez un entretien avec notre équipe de recrutement.",
}

interface BookingRow {
  id: string
  token: string
  status: "pending" | "reserved" | "done"
  mission_id: string
  mission_title: string
  candidate_id: string
  candidate_name: string | null
  recruiter_name: string | null
  booking_url: string | null
}

async function getBooking(token: string): Promise<BookingRow | null> {
  const sb = await createSupabaseServerClient()
  const { data, error } = await sb.rpc("get_booking_by_token", { p_token: token })
  if (error || !data || (data as BookingRow[]).length === 0) return null
  return (data as BookingRow[])[0]
}

export default async function BookingTokenPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const booking = await getBooking(token)

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#FAFAFA",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "48px 24px 80px",
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: 48 }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <Logo size="md" />
        </Link>
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: "white",
          borderRadius: 24,
          border: "1px solid #F0ECF8",
          overflow: "hidden",
          boxShadow: "0 8px 40px rgba(124,99,200,0.08)",
        }}
      >
        <div style={{ height: 4, background: "linear-gradient(90deg, #7C63C8, #9B8DD4)" }} />

        <div style={{ padding: "40px 36px" }}>
          {/* Invalid token */}
          {!booking && (
            <InvalidState />
          )}

          {/* Already done */}
          {booking && booking.status === "done" && (
            <DoneState booking={booking} />
          )}

          {/* Reserved — show confirmation */}
          {booking && booking.status === "reserved" && (
            <ReservedState booking={booking} />
          )}

          {/* Pending — main CTA */}
          {booking && booking.status === "pending" && (
            <PendingState booking={booking} />
          )}
        </div>
      </div>

      <p
        style={{
          marginTop: 24,
          fontSize: 12,
          color: "#9CA3AF",
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        Propulsé par{" "}
        <Link href="/" style={{ color: "#7C63C8", textDecoration: "none" }}>
          Naywa Studio
        </Link>
      </p>
    </div>
  )
}

/* ── Sub-states ──────────────────────────────────────────────── */

function InvalidState() {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🔗</div>
      <h1
        style={{
          margin: "0 0 12px",
          fontSize: 22,
          fontWeight: 800,
          color: "#111827",
          fontFamily: "var(--font-space-grotesk), sans-serif",
        }}
      >
        Lien invalide ou expiré
      </h1>
      <p
        style={{
          margin: 0,
          fontSize: 14,
          color: "#6B7280",
          lineHeight: 1.65,
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        Ce lien de réservation n&apos;existe pas ou n&apos;est plus actif.
        Contactez directement le cabinet qui vous a sollicité.
      </p>
    </div>
  )
}

function DoneState({ booking }: { booking: BookingRow }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "rgba(34,197,94,0.1)",
          border: "2px solid rgba(34,197,94,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 26,
          margin: "0 auto 20px",
        }}
      >
        ✓
      </div>
      <h1
        style={{
          margin: "0 0 10px",
          fontSize: 22,
          fontWeight: 800,
          color: "#111827",
          fontFamily: "var(--font-space-grotesk), sans-serif",
        }}
      >
        Entretien confirmé
      </h1>
      <p
        style={{
          margin: 0,
          fontSize: 14,
          color: "#6B7280",
          lineHeight: 1.65,
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        Votre entretien pour le poste de{" "}
        <strong style={{ color: "#111827" }}>{booking.mission_title}</strong>{" "}
        a déjà été planifié. Vous recevrez une confirmation par email.
      </p>
    </div>
  )
}

function ReservedState({ booking }: { booking: BookingRow }) {
  return (
    <div>
      <Pill color="#3b82f6">Créneau réservé</Pill>
      <h1
        style={{
          margin: "20px 0 8px",
          fontSize: 22,
          fontWeight: 800,
          color: "#111827",
          fontFamily: "var(--font-space-grotesk), sans-serif",
        }}
      >
        Votre entretien est planifié
      </h1>
      <p
        style={{
          margin: "0 0 24px",
          fontSize: 14,
          color: "#6B7280",
          lineHeight: 1.65,
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        Pour le poste de{" "}
        <strong style={{ color: "#111827" }}>{booking.mission_title}</strong>.
        Vous recevrez une invitation calendrier de notre part.
      </p>
      <InfoRow label="Poste" value={booking.mission_title} />
      {booking.recruiter_name && (
        <InfoRow label="Recruteur" value={booking.recruiter_name} />
      )}
    </div>
  )
}

function PendingState({ booking }: { booking: BookingRow }) {
  const hasBookingUrl = Boolean(booking.booking_url)

  return (
    <div>
      <Pill color="#7C63C8">Invitation entretien</Pill>

      <h1
        style={{
          margin: "20px 0 8px",
          fontSize: 24,
          fontWeight: 800,
          color: "#111827",
          fontFamily: "var(--font-space-grotesk), sans-serif",
          letterSpacing: "-0.3px",
        }}
      >
        {booking.mission_title}
      </h1>

      <p
        style={{
          margin: "0 0 28px",
          fontSize: 14,
          color: "#6B7280",
          lineHeight: 1.7,
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        {booking.recruiter_name
          ? `${booking.recruiter_name} vous`
          : "Notre équipe vous"}{" "}
        invite à sélectionner un créneau pour un premier échange autour de ce poste.
        Cela prendra environ 30 minutes.
      </p>

      {/* Info cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 28,
        }}
      >
        <MiniCard icon="💼" label="Poste" value={booking.mission_title} />
        <MiniCard icon="⏱" label="Durée" value="~30 minutes" />
        <MiniCard icon="🎥" label="Format" value="Visioconférence" />
        {booking.recruiter_name && (
          <MiniCard icon="👤" label="Recruteur" value={booking.recruiter_name} />
        )}
      </div>

      {hasBookingUrl ? (
        <a
          href={booking.booking_url!}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block",
            width: "100%",
            textAlign: "center",
            padding: "16px 24px",
            borderRadius: 12,
            background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
            color: "white",
            fontSize: 15,
            fontWeight: 700,
            textDecoration: "none",
            boxShadow: "0 6px 24px rgba(124,99,200,0.3)",
            boxSizing: "border-box",
            fontFamily: "var(--font-inter), sans-serif",
            letterSpacing: "-0.01em",
          }}
        >
          Choisir un créneau →
        </a>
      ) : (
        <div
          style={{
            padding: "16px",
            borderRadius: 12,
            background: "#FEF3C7",
            border: "1px solid #FDE68A",
            fontSize: 13,
            color: "#92400E",
            fontFamily: "var(--font-inter), sans-serif",
          }}
        >
          Le lien de réservation n&apos;est pas encore configuré. Contactez directement le recruteur.
        </div>
      )}

      <p
        style={{
          marginTop: 16,
          textAlign: "center",
          fontSize: 12,
          color: "#9CA3AF",
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        Ce lien est personnel et à usage unique.
      </p>
    </div>
  )
}

/* ── Shared sub-components ────────────────────────────────────── */

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 12px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase" as const,
        color,
        background: `${color}14`,
        border: `1px solid ${color}30`,
        fontFamily: "var(--font-inter), sans-serif",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      {children}
    </span>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "10px 0",
        borderBottom: "1px solid #F0ECF8",
        fontSize: 13,
        fontFamily: "var(--font-inter), sans-serif",
      }}
    >
      <span style={{ color: "#6B7280" }}>{label}</span>
      <span style={{ fontWeight: 600, color: "#111827" }}>{value}</span>
    </div>
  )
}

function MiniCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 10,
        background: "#F8F6FF",
        border: "1px solid #F0ECF8",
      }}
    >
      <p
        style={{
          margin: "0 0 4px",
          fontSize: 11,
          color: "#9CA3AF",
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        {icon} {label}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 600,
          color: "#111827",
          fontFamily: "var(--font-inter), sans-serif",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </p>
    </div>
  )
}
