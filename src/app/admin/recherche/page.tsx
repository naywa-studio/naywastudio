"use client"

/**
 * /admin/recherche — recherche user / org pour le support.
 *
 * Saisie email ou prénom (>= 2 caractères) → liste résultats avec
 * contexte org. Chaque consultation est journalisée côté server.
 *
 * Pas d'action sur les résultats : on regarde, on ne touche pas.
 * Pas d'impersonate, pas de modif (V2 / V3 si besoin un jour).
 */

import { useEffect, useState } from "react"

interface Result {
  user_id: string
  first_name: string | null
  email: string | null
  last_sign_in_at: string | null
  role: "owner" | "member"
  has_sourcing_seat: boolean
  organization: {
    id: string
    name: string
    subscription_status: string | null
    trial_ends_at: string | null
    pending_deletion_at: string | null
  } | null
}

export default function AdminRecherchePage() {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setMessage(null); setSearched(true)
    try {
      const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q.trim())}`, { cache: "no-store" })
      const j = await res.json() as { results: Result[]; message?: string }
      setResults(j.results ?? [])
      if (j.message) setMessage(j.message)
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—"

  return (
    <main style={{
      maxWidth: 1200, margin: "0 auto",
      padding: "32px 24px 80px",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      <header style={{ marginBottom: 24 }}>
        <p style={{
          margin: "0 0 6px", fontSize: 11, fontWeight: 700,
          color: "#7C63C8", letterSpacing: "0.10em", textTransform: "uppercase",
        }}>
          Console admin · Recherche
        </p>
        <h1 style={{
          margin: 0, fontSize: 28, fontWeight: 800, color: "#111827",
          letterSpacing: "-0.02em",
        }}>
          Recherche support
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 13.5, color: "#6B7280", lineHeight: 1.6 }}>
          Lecture seule. Toute consultation est journalisée dans le registre d&apos;audit
          (conformité RGPD / DPA).
        </p>
      </header>

      <form onSubmit={search} style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Email ou prénom"
          autoFocus
          style={{
            flex: 1, padding: "12px 14px",
            borderRadius: 10, border: "1.5px solid #E5E7EB",
            fontSize: 14, color: "#111827", outline: "none",
            fontFamily: "inherit",
          }}
        />
        <button
          type="submit"
          disabled={loading || q.trim().length < 2}
          style={{
            padding: "12px 20px", borderRadius: 10,
            border: "none",
            background: loading || q.trim().length < 2
              ? "#C4B6E0"
              : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
            color: "white", fontSize: 13, fontWeight: 700,
            cursor: loading || q.trim().length < 2 ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {loading ? "Recherche…" : "Rechercher"}
        </button>
      </form>

      {message && (
        <div style={{
          padding: "10px 12px", borderRadius: 10,
          background: "rgba(245,158,11,0.06)",
          border: "1px solid rgba(245,158,11,0.25)",
          color: "#92400E", fontSize: 12.5, marginBottom: 20,
        }}>
          {message}
        </div>
      )}

      {!searched && (
        <p style={{ fontSize: 13, color: "#9CA3AF" }}>
          Saisissez au moins 2 caractères pour lancer la recherche.
        </p>
      )}

      {searched && !loading && results.length === 0 && !message && (
        <div style={{
          padding: 32, textAlign: "center",
          border: "1px dashed #E5E7EB", borderRadius: 14, background: "#FAFAFA",
        }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#374151" }}>
            Aucun résultat.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div style={{
          background: "white", border: "1px solid #F0ECF8",
          borderRadius: 14, overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: "#FAFAFA", textAlign: "left" }}>
                <Th>Utilisateur</Th>
                <Th>Email</Th>
                <Th>Organisation</Th>
                <Th>Rôle</Th>
                <Th>Siège</Th>
                <Th>Statut abo</Th>
                <Th>Dernière connexion</Th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.user_id} style={{ borderTop: "1px solid #F0ECF8" }}>
                  <Td>
                    <span style={{ fontWeight: 600, color: "#111827" }}>
                      {r.first_name ?? <em style={{ color: "#9CA3AF" }}>Sans prénom</em>}
                    </span>
                  </Td>
                  <Td>{r.email ?? "—"}</Td>
                  <Td>
                    {r.organization ? (
                      <>
                        <span style={{ color: "#374151" }}>{r.organization.name}</span>
                        {r.organization.pending_deletion_at && (
                          <span style={pillWarn}>Suppression</span>
                        )}
                      </>
                    ) : "—"}
                  </Td>
                  <Td>
                    <span style={r.role === "owner" ? pillOwner : pillMember}>
                      {r.role}
                    </span>
                  </Td>
                  <Td>
                    <span style={r.has_sourcing_seat ? pillSeatOn : pillSeatOff}>
                      {r.has_sourcing_seat ? "alloué" : "—"}
                    </span>
                  </Td>
                  <Td>
                    <SubStatusPill status={r.organization?.subscription_status ?? null} trialEndsAt={r.organization?.trial_ends_at ?? null} />
                  </Td>
                  <Td style={{ color: "#6B7280" }}>{formatDate(r.last_sign_in_at)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      padding: "12px 14px",
      fontSize: 11, fontWeight: 700,
      color: "#9CA3AF", letterSpacing: "0.05em", textTransform: "uppercase",
    }}>
      {children}
    </th>
  )
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <td style={{ padding: "12px 14px", color: "#374151", ...style }}>
      {children}
    </td>
  )
}

function SubStatusPill({ status, trialEndsAt }: { status: string | null; trialEndsAt: string | null }) {
  // useState + useEffect pour la comparaison à Date.now() (impure et
  // interdite pendant le render en React 19 / Next 16).
  const [trialActive, setTrialActive] = useState(false)
  useEffect(() => {
    // Date.now() = subscription à un système externe (horloge), donc
    // setState en effet est le pattern recommandé ici.
    const active = !!trialEndsAt && new Date(trialEndsAt).getTime() > Date.now()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTrialActive(active)
  }, [trialEndsAt])
  if (status === "active") return <span style={pillOk}>Active</span>
  if (status === "trialing") return <span style={pillTrial}>Trial Stripe</span>
  if (status === "past_due" || status === "unpaid") return <span style={pillWarn}>{status}</span>
  if (status === "canceled") return <span style={pillMember}>Annulée</span>
  if (trialActive) return <span style={pillTrial}>Essai app</span>
  return <span style={pillMember}>—</span>
}

const pill = (color: string, bg: string, border: string): React.CSSProperties => ({
  display: "inline-block",
  fontSize: 10, fontWeight: 700, color,
  background: bg, border: `1px solid ${border}`,
  padding: "2px 7px", borderRadius: 100,
  letterSpacing: "0.05em", textTransform: "uppercase",
  marginLeft: 4,
})
const pillOwner = pill("#7C63C8", "rgba(124,99,200,0.08)", "rgba(124,99,200,0.22)")
const pillMember = pill("#6B7280", "#F3F4F6", "#E5E7EB")
const pillSeatOn = pill("#15803D", "rgba(34,197,94,0.08)", "rgba(34,197,94,0.22)")
const pillSeatOff = pill("#9CA3AF", "#F3F4F6", "#E5E7EB")
const pillOk = pill("#15803D", "rgba(34,197,94,0.08)", "rgba(34,197,94,0.22)")
const pillTrial = pill("#7C63C8", "rgba(124,99,200,0.08)", "rgba(124,99,200,0.22)")
const pillWarn = pill("#B91C1C", "rgba(220,38,38,0.06)", "rgba(220,38,38,0.25)")
