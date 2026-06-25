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
import { useEscapeKey } from "@/components/ui/useEscapeKey"

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
    subscription_price_lookup: string | null
    subscription_seats: number | null
    current_period_end: string | null
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

  // Permet à un sous-composant (modale Essai) de rafraîchir la ligne de
  // son org sans avoir à relancer la recherche complète.
  const refreshOrg = async (orgId: string) => {
    try {
      const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q.trim())}`, { cache: "no-store" })
      const j = await res.json() as { results: Result[] }
      const fresh = (j.results ?? []).find((r) => r.organization?.id === orgId)
      if (!fresh) return
      setResults((prev) => prev.map((r) =>
        r.organization?.id === orgId && r.user_id === fresh.user_id ? fresh : r,
      ))
    } catch {
      // best-effort, l'admin peut relancer la recherche manuellement
    }
  }

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
                <Th>Organisation</Th>
                <Th>Rôle</Th>
                <Th>Siège</Th>
                <Th>Statut abo</Th>
                <Th>Échéance</Th>
                <Th>Dernière connexion</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.user_id} style={{ borderTop: "1px solid #F0ECF8" }}>
                  <Td>
                    <div style={{ fontWeight: 600, color: "#111827" }}>
                      {r.first_name ?? <em style={{ color: "#9CA3AF" }}>Sans prénom</em>}
                    </div>
                    <div style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 2 }}>
                      {r.email ?? "—"}
                    </div>
                  </Td>
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
                    <SubStatusPill
                      status={r.organization?.subscription_status ?? null}
                      trialEndsAt={r.organization?.trial_ends_at ?? null}
                    />
                    {r.organization?.subscription_price_lookup && (
                      <div style={{ fontSize: 10.5, color: "#9CA3AF", marginTop: 3 }}>
                        {r.organization.subscription_price_lookup}
                        {r.organization.subscription_seats != null && ` · ${r.organization.subscription_seats} siège${(r.organization.subscription_seats ?? 0) > 1 ? "s" : ""}`}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <DueDateCell
                      status={r.organization?.subscription_status ?? null}
                      currentPeriodEnd={r.organization?.current_period_end ?? null}
                      trialEndsAt={r.organization?.trial_ends_at ?? null}
                    />
                  </Td>
                  <Td style={{ color: "#6B7280" }}>{formatDate(r.last_sign_in_at)}</Td>
                  <Td>
                    {r.organization ? (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <TrialButton
                          orgId={r.organization.id}
                          orgName={r.organization.name}
                          trialEndsAt={r.organization.trial_ends_at}
                          onUpdated={() => void refreshOrg(r.organization!.id)}
                        />
                        <QuotaOverrideButton orgId={r.organization.id} orgName={r.organization.name} />
                      </div>
                    ) : "—"}
                  </Td>
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

/**
 * Échéance compacte : date de prochain renouvellement Stripe si abonné
 * actif, sinon nb de jours restants sur l'essai gratuit app-side.
 * Affichage rouge si <= 3 jours.
 */
function DueDateCell({
  status, currentPeriodEnd, trialEndsAt,
}: {
  status: string | null
  currentPeriodEnd: string | null
  trialEndsAt: string | null
}) {
  // Date.now() = source impure : on capte côté effect, jamais dans le render.
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now())
  }, [currentPeriodEnd, trialEndsAt])
  if (now == null) return <span style={{ color: "#9CA3AF" }}>—</span>

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })

  if (status === "active" || status === "trialing" || status === "past_due") {
    if (currentPeriodEnd) {
      const ms = new Date(currentPeriodEnd).getTime() - now
      const days = Math.ceil(ms / (24 * 60 * 60 * 1000))
      const isSoon = days <= 7 && days >= 0
      return (
        <div>
          <div style={{ color: "#374151", fontVariantNumeric: "tabular-nums" }}>
            {fmt(currentPeriodEnd)}
          </div>
          <div style={{
            fontSize: 11, marginTop: 2,
            color: days < 0 ? "#B91C1C" : isSoon ? "#B45309" : "#9CA3AF",
          }}>
            {days < 0
              ? `Échue depuis ${Math.abs(days)} j`
              : days === 0 ? "Aujourd'hui"
              : `Dans ${days} j`}
          </div>
        </div>
      )
    }
    return <span style={{ color: "#9CA3AF" }}>—</span>
  }

  if (trialEndsAt) {
    const ms = new Date(trialEndsAt).getTime() - now
    const days = Math.ceil(ms / (24 * 60 * 60 * 1000))
    if (days <= 0) {
      return (
        <div>
          <div style={{ color: "#B91C1C", fontWeight: 600 }}>Essai expiré</div>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{fmt(trialEndsAt)}</div>
        </div>
      )
    }
    return (
      <div>
        <div style={{ color: days <= 3 ? "#B91C1C" : "#374151", fontWeight: 600 }}>
          Essai · {days} j restant{days > 1 ? "s" : ""}
        </div>
        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{fmt(trialEndsAt)}</div>
      </div>
    )
  }
  return <span style={{ color: "#9CA3AF" }}>—</span>
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
// ─── Période d'essai (admin) ────────────────────────────────────────────

function TrialButton({
  orgId, orgName, trialEndsAt, onUpdated,
}: {
  orgId: string
  orgName: string
  trialEndsAt: string | null
  onUpdated: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: "5px 9px", borderRadius: 7,
          border: "1px solid #E5E7EB", background: "white",
          color: "#7C63C8", fontSize: 11.5, fontWeight: 700,
          cursor: "pointer", fontFamily: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        Essai
      </button>
      {open && (
        <TrialModal
          orgId={orgId}
          orgName={orgName}
          trialEndsAt={trialEndsAt}
          onClose={() => setOpen(false)}
          onUpdated={onUpdated}
        />
      )}
    </>
  )
}

function TrialModal({
  orgId, orgName, trialEndsAt, onClose, onUpdated,
}: {
  orgId: string
  orgName: string
  trialEndsAt: string | null
  onClose: () => void
  onUpdated: () => void
}) {
  useEscapeKey(onClose)
  const [days, setDays] = useState("7")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ next: string } | null>(null)

  const submit = async (action: "extend" | "reset") => {
    setBusy(true); setError(null)
    try {
      const body: Record<string, unknown> = { organization_id: orgId, action }
      if (action === "extend") {
        const n = Number(days)
        if (!Number.isFinite(n) || n <= 0) throw new Error("Nombre de jours invalide.")
        body.days = n
      }
      const r = await fetch("/api/admin/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const j = await r.json() as { trial_ends_at?: string; error?: string; message?: string }
      if (!r.ok) throw new Error(j.message ?? j.error ?? `Erreur ${r.status}`)
      setDone({ next: j.trial_ends_at ?? "" })
      onUpdated()
      setTimeout(onClose, 1400)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }) : "—"

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(17,24,39,0.40)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: "var(--font-inter), sans-serif",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 480,
        background: "white", borderRadius: 16, padding: 24,
        boxShadow: "0 20px 50px -20px rgba(17,24,39,0.30)",
      }}>
        <h2 style={{
          margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: "#111827",
          letterSpacing: "-0.01em",
        }}>
          Période d&apos;essai gratuite
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#6B7280" }}>
          Organisation : <strong>{orgName}</strong>
        </p>

        {done ? (
          <div style={{
            padding: "14px 16px", borderRadius: 12,
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.25)",
            color: "#166534", fontSize: 13, textAlign: "center",
          }}>
            <strong>Essai mis à jour.</strong>
            <div style={{ marginTop: 4, fontSize: 12 }}>Nouvelle fin : {fmt(done.next)}</div>
          </div>
        ) : (
          <>
            <div style={{
              padding: "12px 14px", borderRadius: 10, background: "#F8F6FF",
              marginBottom: 14, fontSize: 12.5, color: "#5C46A0", lineHeight: 1.55,
            }}>
              <div>Fin actuelle : <strong>{fmt(trialEndsAt)}</strong></div>
            </div>

            <div style={{
              padding: "14px 14px", borderRadius: 10,
              border: "1px solid #F0ECF8", marginBottom: 12,
            }}>
              <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: "#111827" }}>
                Prolonger la période d&apos;essai
              </p>
              <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => submit("extend")}
                  disabled={busy}
                  style={{
                    padding: "9px 16px", borderRadius: 9,
                    border: "none", color: "white",
                    background: busy ? "#C4B6E0"
                      : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                    fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer",
                    fontFamily: "inherit", whiteSpace: "nowrap",
                  }}
                >
                  Ajouter {days} j
                </button>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "#9CA3AF" }}>
                Maximum 90 jours par opération. Si l&apos;essai est déjà expiré,
                on prolonge à partir d&apos;aujourd&apos;hui.
              </p>
            </div>

            <div style={{
              padding: "14px 14px", borderRadius: 10,
              border: "1px solid #F0ECF8", marginBottom: 14,
            }}>
              <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, color: "#111827" }}>
                Réinitialiser la période d&apos;essai
              </p>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>
                Remet la fin à J+15 (essai gratuit standard) à partir d&apos;aujourd&apos;hui.
              </p>
              <button
                type="button"
                onClick={() => submit("reset")}
                disabled={busy}
                style={{
                  padding: "9px 14px", borderRadius: 9,
                  border: "1px solid #E2DAF6", background: "white",
                  color: "#7C63C8", fontSize: 12.5, fontWeight: 700,
                  cursor: busy ? "wait" : "pointer", fontFamily: "inherit",
                }}
              >
                Réinitialiser à J+15
              </button>
            </div>

            {error && (
              <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#B91C1C" }}>
                {error}
              </p>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                style={{
                  padding: "9px 14px", borderRadius: 9,
                  border: "1px solid #E5E7EB", background: "white",
                  color: "#374151", fontSize: 13, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Fermer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Quota override (admin) ────────────────────────────────────────────

function QuotaOverrideButton({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: "5px 9px", borderRadius: 7,
          border: "1px solid #E5E7EB", background: "white",
          color: "#7C63C8", fontSize: 11.5, fontWeight: 700,
          cursor: "pointer", fontFamily: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        Custom
      </button>
      {open && <QuotaOverrideModal orgId={orgId} orgName={orgName} onClose={() => setOpen(false)} />}
    </>
  )
}

function QuotaOverrideModal({
  orgId, orgName, onClose,
}: { orgId: string; orgName: string; onClose: () => void }) {
  useEscapeKey(onClose)
  const [storageGb, setStorageGb] = useState("")
  const [llmMonthly, setLlmMonthly] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const save = async () => {
    setBusy(true); setError(null)
    try {
      const body: Record<string, unknown> = { organization_id: orgId }
      const s = Number(storageGb)
      const l = Number(llmMonthly)
      if (Number.isFinite(s) && s > 0) body.storage_gb = s
      if (Number.isFinite(l) && l > 0) body.llm_monthly = l
      const r = await fetch("/api/admin/quota-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? `Erreur ${r.status}`)
      setDone(true)
      setTimeout(onClose, 1200)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    if (!confirm(`Supprimer le quota custom de ${orgName} ? L'org revient aux quotas du plan.`)) return
    setBusy(true); setError(null)
    try {
      const r = await fetch("/api/admin/quota-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: orgId, clear: true }),
      })
      if (!r.ok) {
        const j = await r.json()
        throw new Error(j.error ?? `Erreur ${r.status}`)
      }
      setDone(true)
      setTimeout(onClose, 1200)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(17,24,39,0.40)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: "var(--font-inter), sans-serif",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 460,
        background: "white", borderRadius: 16, padding: 24,
        boxShadow: "0 20px 50px -20px rgba(17,24,39,0.30)",
      }}>
        <h2 style={{
          margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: "#111827",
          letterSpacing: "-0.01em",
        }}>
          Quota custom
        </h2>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "#6B7280" }}>
          Organisation : <strong>{orgName}</strong>
        </p>

        {done ? (
          <div style={{
            padding: "14px 16px", borderRadius: 12,
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.25)",
            color: "#166534", fontSize: 13, textAlign: "center",
          }}>
            <strong>Override mis à jour.</strong>
          </div>
        ) : (
          <>
            <div style={{
              padding: "12px 14px", borderRadius: 10, background: "#F8F6FF",
              marginBottom: 16, fontSize: 12, color: "#5C46A0", lineHeight: 1.55,
            }}>
              Laissez un champ vide pour ne pas le surcharger. Toute valeur saisie
              remplace le quota du plan pour ce client (extras facturés
              manuellement hors-Stripe).
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600, color: "#374151" }}>
                  Stockage (GB)
                </label>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={storageGb}
                  onChange={(e) => setStorageGb(e.target.value)}
                  placeholder="ex: 20"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600, color: "#374151" }}>
                  Actions IA / mois
                </label>
                <input
                  type="number"
                  min={1}
                  max={10_000_000}
                  value={llmMonthly}
                  onChange={(e) => setLlmMonthly(e.target.value)}
                  placeholder="ex: 30000"
                  style={inputStyle}
                />
              </div>
            </div>

            {error && (
              <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#B91C1C" }}>
                {error}
              </p>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <button type="button" onClick={clear} disabled={busy}
                style={{
                  padding: "9px 14px", borderRadius: 9,
                  border: "1px solid rgba(220,38,38,0.30)", background: "white",
                  color: "#B91C1C", fontSize: 12.5, fontWeight: 600,
                  cursor: busy ? "wait" : "pointer", fontFamily: "inherit",
                }}>
                Supprimer override
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={onClose} disabled={busy}
                  style={{
                    padding: "9px 14px", borderRadius: 9,
                    border: "1px solid #E5E7EB", background: "white",
                    color: "#374151", fontSize: 13, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>
                  Annuler
                </button>
                <button type="button" onClick={save}
                  disabled={busy || (!storageGb && !llmMonthly)}
                  style={{
                    padding: "9px 16px", borderRadius: 9,
                    border: "none", color: "white",
                    background: busy ? "#C4B6E0"
                      : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                    fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer",
                    fontFamily: "inherit",
                    opacity: (!storageGb && !llmMonthly) ? 0.5 : 1,
                  }}>
                  {busy ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px",
  borderRadius: 8, border: "1.5px solid #E5E7EB",
  fontSize: 13.5, color: "#111827",
  outline: "none", fontFamily: "inherit",
  boxSizing: "border-box",
}

const pillOwner = pill("#7C63C8", "rgba(124,99,200,0.08)", "rgba(124,99,200,0.22)")
const pillMember = pill("#6B7280", "#F3F4F6", "#E5E7EB")
const pillSeatOn = pill("#15803D", "rgba(34,197,94,0.08)", "rgba(34,197,94,0.22)")
const pillSeatOff = pill("#9CA3AF", "#F3F4F6", "#E5E7EB")
const pillOk = pill("#15803D", "rgba(34,197,94,0.08)", "rgba(34,197,94,0.22)")
const pillTrial = pill("#7C63C8", "rgba(124,99,200,0.08)", "rgba(124,99,200,0.22)")
const pillWarn = pill("#B91C1C", "rgba(220,38,38,0.06)", "rgba(220,38,38,0.25)")
