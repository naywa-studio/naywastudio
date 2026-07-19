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
import { useLanguage } from "@/lib/i18n/LanguageContext"

const copy = {
  fr: {
    badge: "Console admin · Recherche",
    title: "Recherche support",
    subtitle: "Lecture seule. Toute consultation est journalisée dans le registre d'audit (conformité RGPD / DPA).",
    searchPlaceholder: "Email ou prénom",
    searching: "Recherche…",
    search: "Rechercher",
    minChars: "Saisissez au moins 2 caractères pour lancer la recherche.",
    noResults: "Aucun résultat.",
    colUser: "Utilisateur",
    colOrg: "Organisation",
    colRole: "Rôle",
    colSeat: "Siège",
    colSubStatus: "Statut abo",
    colDueDate: "Échéance",
    colLastLogin: "Dernière connexion",
    colActions: "Actions",
    noName: "Sans prénom",
    deletion: "Suppression",
    allocated: "alloué",
    seatSuffix: (n: number) => `siège${n > 1 ? "s" : ""}`,
    overdueBy: (n: number) => `Échue depuis ${n} j`,
    today: "Aujourd'hui",
    inDays: (n: number) => `Dans ${n} j`,
    trialExpired: "Essai expiré",
    trialDaysLeft: (n: number) => `Essai · ${n} j restant${n > 1 ? "s" : ""}`,
    statusActive: "Active",
    statusTrialStripe: "Trial Stripe",
    statusCanceled: "Annulée",
    statusTrialApp: "Essai app",
    trialButton: "Essai",
    invalidDaysNumber: "Nombre de jours invalide.",
    errorWithStatus: (status: number) => `Erreur ${status}`,
    trialModalTitle: "Période d'essai gratuite",
    organizationLabel: "Organisation :",
    trialUpdated: "Essai mis à jour.",
    newEnd: (date: string) => `Nouvelle fin : ${date}`,
    currentEnd: (date: string) => `Fin actuelle : ${date}`,
    extendTrial: "Prolonger la période d'essai",
    addDays: (n: string) => `Ajouter ${n} j`,
    extendHint: "Maximum 90 jours par opération. Si l'essai est déjà expiré, on prolonge à partir d'aujourd'hui.",
    resetTrial: "Réinitialiser la période d'essai",
    resetTrialHint: "Remet la fin à J+15 (essai gratuit standard) à partir d'aujourd'hui.",
    resetToJ15: "Réinitialiser à J+15",
    close: "Fermer",
    customButton: "Custom",
    quotaCustomTitle: "Quota custom",
    quotaOverrideUpdated: "Override mis à jour.",
    quotaHint: "Laissez un champ vide pour ne pas le surcharger. Toute valeur saisie remplace le quota du plan pour ce client (extras facturés manuellement hors-Stripe).",
    cvCapLabel: "Capacité vivier (CV) — plafond principal",
    cvCapPlaceholder: "ex: 50000",
    storageLabel: "Stockage (GB) — filet interne, optionnel",
    llmLabel: "Actions IA / mois — filet interne, optionnel",
    auto: "auto",
    removeOverride: "Supprimer override",
    cancel: "Annuler",
    saving: "Enregistrement…",
    save: "Enregistrer",
    clearConfirm: (orgName: string) => `Supprimer le quota custom de ${orgName} ? L'org revient aux quotas du plan.`,
  },
  en: {
    badge: "Admin console · Search",
    title: "Support search",
    subtitle: "Read-only. Every lookup is logged in the audit trail (GDPR / DPA compliance).",
    searchPlaceholder: "Email or first name",
    searching: "Searching…",
    search: "Search",
    minChars: "Enter at least 2 characters to search.",
    noResults: "No results.",
    colUser: "User",
    colOrg: "Organization",
    colRole: "Role",
    colSeat: "Seat",
    colSubStatus: "Sub status",
    colDueDate: "Due date",
    colLastLogin: "Last sign-in",
    colActions: "Actions",
    noName: "No name",
    deletion: "Deletion",
    allocated: "allocated",
    seatSuffix: (n: number) => `seat${n > 1 ? "s" : ""}`,
    overdueBy: (n: number) => `Overdue by ${n}d`,
    today: "Today",
    inDays: (n: number) => `In ${n}d`,
    trialExpired: "Trial expired",
    trialDaysLeft: (n: number) => `Trial · ${n} day${n > 1 ? "s" : ""} left`,
    statusActive: "Active",
    statusTrialStripe: "Stripe trial",
    statusCanceled: "Canceled",
    statusTrialApp: "App trial",
    trialButton: "Trial",
    invalidDaysNumber: "Invalid number of days.",
    errorWithStatus: (status: number) => `Error ${status}`,
    trialModalTitle: "Free trial period",
    organizationLabel: "Organization:",
    trialUpdated: "Trial updated.",
    newEnd: (date: string) => `New end: ${date}`,
    currentEnd: (date: string) => `Current end: ${date}`,
    extendTrial: "Extend the trial period",
    addDays: (n: string) => `Add ${n}d`,
    extendHint: "Maximum 90 days per operation. If the trial has already expired, it's extended starting today.",
    resetTrial: "Reset the trial period",
    resetTrialHint: "Resets the end to Day+15 (standard free trial) starting today.",
    resetToJ15: "Reset to Day+15",
    close: "Close",
    customButton: "Custom",
    quotaCustomTitle: "Custom quota",
    quotaOverrideUpdated: "Override updated.",
    quotaHint: "Leave a field empty to not override it. Any value entered replaces the plan quota for this client (extras billed manually outside Stripe).",
    cvCapLabel: "Talent pool capacity (CVs) — main cap",
    cvCapPlaceholder: "e.g. 50000",
    storageLabel: "Storage (GB) — internal safety net, optional",
    llmLabel: "AI actions / month — internal safety net, optional",
    auto: "auto",
    removeOverride: "Remove override",
    cancel: "Cancel",
    saving: "Saving…",
    save: "Save",
    clearConfirm: (orgName: string) => `Remove ${orgName}'s custom quota? The org reverts to plan quotas.`,
  },
}

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
  const { lang } = useLanguage()
  const t = copy[lang]
  const locale = lang === "fr" ? "fr-FR" : "en-US"
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
    iso ? new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "—"

  return (
    <main style={{
      maxWidth: 1200, margin: "0 auto",
      padding: "32px 24px 80px",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      <header style={{ marginBottom: 24 }}>
        <p style={{
          margin: "0 0 6px", fontSize: 11, fontWeight: 700,
          color: "var(--nw-primary)", letterSpacing: "0.10em", textTransform: "uppercase",
        }}>
          {t.badge}
        </p>
        <h1 style={{
          margin: 0, fontSize: 28, fontWeight: 800, color: "var(--nw-text)",
          letterSpacing: "-0.02em",
        }}>
          {t.title}
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 13.5, color: "var(--nw-text-muted)", lineHeight: 1.6 }}>
          {t.subtitle}
        </p>
      </header>

      <form onSubmit={search} style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.searchPlaceholder}
          autoFocus
          style={{
            flex: 1, padding: "12px 14px",
            borderRadius: 10, border: "1.5px solid var(--nw-border)",
            fontSize: 14, color: "var(--nw-text)", outline: "none",
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
              ? "var(--nw-primary-200)"
              : "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
            color: "white", fontSize: 13, fontWeight: 700,
            cursor: loading || q.trim().length < 2 ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {loading ? t.searching : t.search}
        </button>
      </form>

      {message && (
        <div style={{
          padding: "10px 12px", borderRadius: 10,
          background: "rgba(245,158,11,0.06)",
          border: "1px solid rgba(245,158,11,0.25)",
          color: "var(--nw-warn-strong)", fontSize: 12.5, marginBottom: 20,
        }}>
          {message}
        </div>
      )}

      {!searched && (
        <p style={{ fontSize: 13, color: "var(--nw-text-muted)" }}>
          {t.minChars}
        </p>
      )}

      {searched && !loading && results.length === 0 && !message && (
        <div style={{
          padding: 32, textAlign: "center",
          border: "1px dashed var(--nw-border)", borderRadius: 14, background: "var(--nw-surface-muted)",
        }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--nw-text-body)" }}>
            {t.noResults}
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div style={{
          background: "white", border: "1px solid var(--nw-border-soft)",
          borderRadius: 14, overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: "var(--nw-surface-muted)", textAlign: "left" }}>
                <Th>{t.colUser}</Th>
                <Th>{t.colOrg}</Th>
                <Th>{t.colRole}</Th>
                <Th>{t.colSeat}</Th>
                <Th>{t.colSubStatus}</Th>
                <Th>{t.colDueDate}</Th>
                <Th>{t.colLastLogin}</Th>
                <Th>{t.colActions}</Th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.user_id} style={{ borderTop: "1px solid var(--nw-border-soft)" }}>
                  <Td>
                    <div style={{ fontWeight: 600, color: "var(--nw-text)" }}>
                      {r.first_name ?? <em style={{ color: "var(--nw-text-muted)" }}>{t.noName}</em>}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--nw-text-muted)", marginTop: 2 }}>
                      {r.email ?? "—"}
                    </div>
                  </Td>
                  <Td>
                    {r.organization ? (
                      <>
                        <span style={{ color: "var(--nw-text-body)" }}>{r.organization.name}</span>
                        {r.organization.pending_deletion_at && (
                          <span style={pillWarn}>{t.deletion}</span>
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
                      {r.has_sourcing_seat ? t.allocated : "—"}
                    </span>
                  </Td>
                  <Td>
                    <SubStatusPill
                      status={r.organization?.subscription_status ?? null}
                      trialEndsAt={r.organization?.trial_ends_at ?? null}
                    />
                    {r.organization?.subscription_price_lookup && (
                      <div style={{ fontSize: 10.5, color: "var(--nw-text-muted)", marginTop: 3 }}>
                        {r.organization.subscription_price_lookup}
                        {r.organization.subscription_seats != null && ` · ${r.organization.subscription_seats} ${t.seatSuffix(r.organization.subscription_seats ?? 0)}`}
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
                  <Td style={{ color: "var(--nw-text-muted)" }}>{formatDate(r.last_sign_in_at)}</Td>
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
      color: "var(--nw-text-muted)", letterSpacing: "0.05em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
    }}>
      {children}
    </th>
  )
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <td style={{ padding: "12px 14px", color: "var(--nw-text-body)", ...style }}>
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
  const { lang } = useLanguage()
  const t = copy[lang]
  // Date.now() = source impure : on capte côté effect, jamais dans le render.
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now())
  }, [currentPeriodEnd, trialEndsAt])
  if (now == null) return <span style={{ color: "var(--nw-text-muted)" }}>—</span>

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "short", year: "numeric" })

  if (status === "active" || status === "trialing" || status === "past_due") {
    if (currentPeriodEnd) {
      const ms = new Date(currentPeriodEnd).getTime() - now
      const days = Math.ceil(ms / (24 * 60 * 60 * 1000))
      const isSoon = days <= 7 && days >= 0
      return (
        <div>
          <div style={{ color: "var(--nw-text-body)", fontVariantNumeric: "tabular-nums" }}>
            {fmt(currentPeriodEnd)}
          </div>
          <div style={{
            fontSize: 11, marginTop: 2,
            color: days < 0 ? "var(--nw-danger-strong)" : isSoon ? "var(--nw-warn)" : "var(--nw-text-muted)",
          }}>
            {days < 0
              ? t.overdueBy(Math.abs(days))
              : days === 0 ? t.today
              : t.inDays(days)}
          </div>
        </div>
      )
    }
    return <span style={{ color: "var(--nw-text-muted)" }}>—</span>
  }

  if (trialEndsAt) {
    const ms = new Date(trialEndsAt).getTime() - now
    const days = Math.ceil(ms / (24 * 60 * 60 * 1000))
    if (days <= 0) {
      return (
        <div>
          <div style={{ color: "var(--nw-danger-strong)", fontWeight: 600 }}>{t.trialExpired}</div>
          <div style={{ fontSize: 11, color: "var(--nw-text-muted)", marginTop: 2 }}>{fmt(trialEndsAt)}</div>
        </div>
      )
    }
    return (
      <div>
        <div style={{ color: days <= 3 ? "var(--nw-danger-strong)" : "var(--nw-text-body)", fontWeight: 600 }}>
          {t.trialDaysLeft(days)}
        </div>
        <div style={{ fontSize: 11, color: "var(--nw-text-muted)", marginTop: 2 }}>{fmt(trialEndsAt)}</div>
      </div>
    )
  }
  return <span style={{ color: "var(--nw-text-muted)" }}>—</span>
}

function SubStatusPill({ status, trialEndsAt }: { status: string | null; trialEndsAt: string | null }) {
  const { lang } = useLanguage()
  const t = copy[lang]
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
  if (status === "active") return <span style={pillOk}>{t.statusActive}</span>
  if (status === "trialing") return <span style={pillTrial}>{t.statusTrialStripe}</span>
  if (status === "past_due" || status === "unpaid") return <span style={pillWarn}>{status}</span>
  if (status === "canceled") return <span style={pillMember}>{t.statusCanceled}</span>
  if (trialActive) return <span style={pillTrial}>{t.statusTrialApp}</span>
  return <span style={pillMember}>—</span>
}

const pill = (color: string, bg: string, border: string): React.CSSProperties => ({
  display: "inline-block",
  fontSize: 10, fontWeight: 700, color,
  background: bg, border: `1px solid ${border}`,
  padding: "2px 7px", borderRadius: 100,
  letterSpacing: "0.05em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
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
  const { lang } = useLanguage()
  const t = copy[lang]
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: "5px 9px", borderRadius: 7,
          border: "1px solid var(--nw-border)", background: "white",
          color: "var(--nw-primary)", fontSize: 11.5, fontWeight: 700,
          cursor: "pointer", fontFamily: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        {t.trialButton}
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
  const { lang } = useLanguage()
  const t = copy[lang]
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
        if (!Number.isFinite(n) || n <= 0) throw new Error(t.invalidDaysNumber)
        body.days = n
      }
      const r = await fetch("/api/admin/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const j = await r.json() as { trial_ends_at?: string; error?: string; message?: string }
      if (!r.ok) throw new Error(j.message ?? j.error ?? t.errorWithStatus(r.status))
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
    iso ? new Date(iso).toLocaleString(lang === "fr" ? "fr-FR" : "en-US", { dateStyle: "long", timeStyle: "short" }) : "—"

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
          margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: "var(--nw-text)",
          letterSpacing: "-0.01em",
        }}>
          {t.trialModalTitle}
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--nw-text-muted)" }}>
          {t.organizationLabel} <strong>{orgName}</strong>
        </p>

        {done ? (
          <div style={{
            padding: "14px 16px", borderRadius: 12,
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.25)",
            color: "#166534", fontSize: 13, textAlign: "center",
          }}>
            <strong>{t.trialUpdated}</strong>
            <div style={{ marginTop: 4, fontSize: 12 }}>{t.newEnd(fmt(done.next))}</div>
          </div>
        ) : (
          <>
            <div style={{
              padding: "12px 14px", borderRadius: 10, background: "var(--nw-bg)",
              marginBottom: 14, fontSize: 12.5, color: "#5C46A0", lineHeight: 1.55,
            }}>
              <div>{t.currentEnd(fmt(trialEndsAt))}</div>
            </div>

            <div style={{
              padding: "14px 14px", borderRadius: 10,
              border: "1px solid var(--nw-border-soft)", marginBottom: 12,
            }}>
              <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: "var(--nw-text)" }}>
                {t.extendTrial}
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
                    background: busy ? "var(--nw-primary-200)"
                      : "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
                    fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer",
                    fontFamily: "inherit", whiteSpace: "nowrap",
                  }}
                >
                  {t.addDays(days)}
                </button>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--nw-text-muted)" }}>
                {t.extendHint}
              </p>
            </div>

            <div style={{
              padding: "14px 14px", borderRadius: 10,
              border: "1px solid var(--nw-border-soft)", marginBottom: 14,
            }}>
              <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, color: "var(--nw-text)" }}>
                {t.resetTrial}
              </p>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--nw-text-muted)", lineHeight: 1.5 }}>
                {t.resetTrialHint}
              </p>
              <button
                type="button"
                onClick={() => submit("reset")}
                disabled={busy}
                style={{
                  padding: "9px 14px", borderRadius: 9,
                  border: "1px solid var(--nw-primary-100)", background: "white",
                  color: "var(--nw-primary)", fontSize: 12.5, fontWeight: 700,
                  cursor: busy ? "wait" : "pointer", fontFamily: "inherit",
                }}
              >
                {t.resetToJ15}
              </button>
            </div>

            {error && (
              <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--nw-danger-strong)" }}>
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
                  border: "1px solid var(--nw-border)", background: "white",
                  color: "var(--nw-text-body)", fontSize: 13, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {t.close}
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
  const { lang } = useLanguage()
  const t = copy[lang]
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: "5px 9px", borderRadius: 7,
          border: "1px solid var(--nw-border)", background: "white",
          color: "var(--nw-primary)", fontSize: 11.5, fontWeight: 700,
          cursor: "pointer", fontFamily: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        {t.customButton}
      </button>
      {open && <QuotaOverrideModal orgId={orgId} orgName={orgName} onClose={() => setOpen(false)} />}
    </>
  )
}

function QuotaOverrideModal({
  orgId, orgName, onClose,
}: { orgId: string; orgName: string; onClose: () => void }) {
  useEscapeKey(onClose)
  const { lang } = useLanguage()
  const t = copy[lang]
  const [cv, setCv] = useState("")
  const [storageGb, setStorageGb] = useState("")
  const [llmMonthly, setLlmMonthly] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const save = async () => {
    setBusy(true); setError(null)
    try {
      const body: Record<string, unknown> = { organization_id: orgId }
      const c = Number(cv)
      const s = Number(storageGb)
      const l = Number(llmMonthly)
      if (Number.isFinite(c) && c > 0) body.cv = c
      if (Number.isFinite(s) && s > 0) body.storage_gb = s
      if (Number.isFinite(l) && l > 0) body.llm_monthly = l
      const r = await fetch("/api/admin/quota-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? t.errorWithStatus(r.status))
      setDone(true)
      setTimeout(onClose, 1200)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    if (!confirm(t.clearConfirm(orgName))) return
    setBusy(true); setError(null)
    try {
      const r = await fetch("/api/admin/quota-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: orgId, clear: true }),
      })
      if (!r.ok) {
        const j = await r.json()
        throw new Error(j.error ?? t.errorWithStatus(r.status))
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
          margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: "var(--nw-text)",
          letterSpacing: "-0.01em",
        }}>
          {t.quotaCustomTitle}
        </h2>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--nw-text-muted)" }}>
          {t.organizationLabel} <strong>{orgName}</strong>
        </p>

        {done ? (
          <div style={{
            padding: "14px 16px", borderRadius: 12,
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.25)",
            color: "#166534", fontSize: 13, textAlign: "center",
          }}>
            <strong>{t.quotaOverrideUpdated}</strong>
          </div>
        ) : (
          <>
            <div style={{
              padding: "12px 14px", borderRadius: 10, background: "var(--nw-bg)",
              marginBottom: 16, fontSize: 12, color: "#5C46A0", lineHeight: 1.55,
            }}>
              {t.quotaHint}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 700, color: "var(--nw-text-body)" }}>
                  {t.cvCapLabel}
                </label>
                <input
                  type="number"
                  min={1}
                  max={5_000_000}
                  value={cv}
                  onChange={(e) => setCv(e.target.value)}
                  placeholder={t.cvCapPlaceholder}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600, color: "var(--nw-text-muted)" }}>
                  {t.storageLabel}
                </label>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={storageGb}
                  onChange={(e) => setStorageGb(e.target.value)}
                  placeholder={t.auto}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600, color: "var(--nw-text-muted)" }}>
                  {t.llmLabel}
                </label>
                <input
                  type="number"
                  min={1}
                  max={10_000_000}
                  value={llmMonthly}
                  onChange={(e) => setLlmMonthly(e.target.value)}
                  placeholder={t.auto}
                  style={inputStyle}
                />
              </div>
            </div>

            {error && (
              <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--nw-danger-strong)" }}>
                {error}
              </p>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <button type="button" onClick={clear} disabled={busy}
                style={{
                  padding: "9px 14px", borderRadius: 9,
                  border: "1px solid rgba(220,38,38,0.30)", background: "white",
                  color: "var(--nw-danger-strong)", fontSize: 12.5, fontWeight: 600,
                  cursor: busy ? "wait" : "pointer", fontFamily: "inherit",
                }}>
                {t.removeOverride}
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={onClose} disabled={busy}
                  style={{
                    padding: "9px 14px", borderRadius: 9,
                    border: "1px solid var(--nw-border)", background: "white",
                    color: "var(--nw-text-body)", fontSize: 13, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>
                  {t.cancel}
                </button>
                <button type="button" onClick={save}
                  disabled={busy || (!cv && !storageGb && !llmMonthly)}
                  style={{
                    padding: "9px 16px", borderRadius: 9,
                    border: "none", color: "white",
                    background: busy ? "var(--nw-primary-200)"
                      : "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
                    fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer",
                    fontFamily: "inherit",
                    opacity: (!cv && !storageGb && !llmMonthly) ? 0.5 : 1,
                  }}>
                  {busy ? t.saving : t.save}
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
  borderRadius: 8, border: "1.5px solid var(--nw-border)",
  fontSize: 13.5, color: "var(--nw-text)",
  outline: "none", fontFamily: "inherit",
  boxSizing: "border-box",
}

const pillOwner = pill("var(--nw-primary)", "rgba(124,99,200,0.08)", "rgba(124,99,200,0.22)")
const pillMember = pill("var(--nw-text-muted)", "var(--nw-neutral-100)", "var(--nw-border)")
const pillSeatOn = pill("var(--nw-success)", "rgba(34,197,94,0.08)", "rgba(34,197,94,0.22)")
const pillSeatOff = pill("var(--nw-text-muted)", "var(--nw-neutral-100)", "var(--nw-border)")
const pillOk = pill("var(--nw-success)", "rgba(34,197,94,0.08)", "rgba(34,197,94,0.22)")
const pillTrial = pill("var(--nw-primary)", "rgba(124,99,200,0.08)", "rgba(124,99,200,0.22)")
const pillWarn = pill("var(--nw-danger-strong)", "rgba(220,38,38,0.06)", "rgba(220,38,38,0.25)")
