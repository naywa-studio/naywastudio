"use client"

/**
 * /admin — tableau de bord KPIs.
 *
 * 6 KPIs sourcés explicitement (cf. /api/admin/kpis) :
 *   cabinets actifs, utilisateurs, sièges occupés, candidats parsés,
 *   essais actifs, MRR estimé.
 *
 * Layout cards plates, icônes SVG Naywa (pas d'emoji), refresh
 * manuel via bouton (pas de poll auto pour économiser quota).
 */

import { useEffect, useState } from "react"
import { LazyMotion, domAnimation, m } from "framer-motion"

interface Kpis {
  cabinets_active: number
  users_total: number
  seats_occupied: number
  candidates_parsed: number
  trials_active: number
  mrr_estimated_eur: number
}

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

export default function AdminDashboardPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchKpis = async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch("/api/admin/kpis", { cache: "no-store" })
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(j.error ?? `Erreur ${res.status}`)
      }
      const j = await res.json() as Kpis
      setKpis(j)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void fetchKpis() }, [])

  return (
    <LazyMotion features={domAnimation}>
      <main style={{
        maxWidth: 1200, margin: "0 auto",
        padding: "32px 24px 80px",
      }}>
        <header style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 16, marginBottom: 28,
        }}>
          <div>
            <p style={{
              margin: "0 0 6px", fontSize: 11, fontWeight: 700,
              color: "#7C63C8", letterSpacing: "0.10em", textTransform: "uppercase",
            }}>
              Console admin
            </p>
            <h1 style={{
              margin: 0, fontSize: 28, fontWeight: 800, color: "#111827",
              letterSpacing: "-0.02em",
            }}>
              Tableau de bord
            </h1>
          </div>
          <button
            type="button"
            onClick={fetchKpis}
            disabled={loading}
            style={{
              padding: "8px 14px", borderRadius: 9,
              border: "1px solid #E5E7EB", background: "white",
              color: "#374151", fontSize: 12.5, fontWeight: 600,
              cursor: loading ? "wait" : "pointer", fontFamily: "inherit",
            }}
          >
            {loading ? "Actualisation…" : "Actualiser"}
          </button>
        </header>

        {error && (
          <div style={{
            padding: "12px 14px", borderRadius: 10,
            background: "rgba(220,38,38,0.06)",
            border: "1px solid rgba(220,38,38,0.25)",
            color: "#B91C1C", fontSize: 13, marginBottom: 20,
          }}>
            {error}
          </div>
        )}

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}>
          <KpiCard
            label="Cabinets actifs"
            value={kpis?.cabinets_active}
            icon={<BuildingIcon />}
            hint="hors suppression en attente"
            delay={0}
          />
          <KpiCard
            label="Utilisateurs"
            value={kpis?.users_total}
            icon={<UsersIcon />}
            hint="tous comptes confondus"
            delay={0.04}
          />
          <KpiCard
            label="Sièges occupés"
            value={kpis?.seats_occupied}
            icon={<SeatIcon />}
            hint="profiles avec un siège alloué"
            delay={0.08}
          />
          <KpiCard
            label="Candidats parsés"
            value={kpis?.candidates_parsed}
            icon={<FileIcon />}
            hint="CV uploadés et analysés par Nora"
            delay={0.12}
          />
          <KpiCard
            label="Essais actifs"
            value={kpis?.trials_active}
            icon={<HourglassIcon />}
            hint="trial_ends_at > maintenant"
            delay={0.16}
          />
          <KpiCard
            label="MRR estimé"
            value={kpis ? formatEuros(kpis.mrr_estimated_eur) : undefined}
            icon={<EuroIcon />}
            hint="sub Stripe active + trialing"
            delay={0.20}
            wide
          />
        </div>

        <p style={{
          marginTop: 28, fontSize: 11.5, color: "#9CA3AF", lineHeight: 1.55,
        }}>
          Chaque KPI vient d&apos;une requête unique côté API. Aucun ratio
          composé. Le MRR estimé compte les sub Stripe actives ou en
          essai natif, multipliées par le prix du tier × sièges
          souscrits.
        </p>

        <R2MigrationCard />
      </main>
    </LazyMotion>
  )
}

/* ────────────────────────────────────────────────────────────────────
 * Migration Supabase Storage → R2 (one-shot, idempotent)
 * ──────────────────────────────────────────────────────────────────── */

interface MigrationResult {
  examined: number
  cv_migrated: number
  anonymized_migrated: number
  dry_run: boolean
  results?: Array<{ candidate_id: string; cv_migrated: boolean; anonymized_migrated: boolean; error?: string }>
}

function R2MigrationCard() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<MigrationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (dryRun: boolean) => {
    setBusy(true); setError(null); setResult(null)
    try {
      const r = await fetch("/api/admin/migrate-cv-to-r2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: dryRun, limit: 50 }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? `Erreur ${r.status}`)
      setResult(j as MigrationResult)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={{
      marginTop: 32, padding: "20px 22px",
      borderRadius: 14, background: "white",
      border: "1px solid #F0ECF8",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      <header style={{ marginBottom: 12 }}>
        <h2 style={{
          margin: 0, fontSize: 15, fontWeight: 700, color: "#111827",
          letterSpacing: "-0.01em",
        }}>
          Migration des CV vers R2
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#6B7280", lineHeight: 1.55 }}>
          Déplace les anciens fichiers (encore sur Supabase Storage) vers
          le bucket R2 <code>naywa-cv</code>. Idempotent — on peut
          relancer autant qu&apos;on veut, les fichiers déjà migrés sont
          ignorés. Batch de 50 candidats par appel.
        </p>
      </header>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => void run(true)}
          disabled={busy}
          style={{
            padding: "8px 14px", borderRadius: 9,
            border: "1px solid #E5E7EB", background: "white",
            color: "#374151", fontSize: 12.5, fontWeight: 600,
            cursor: busy ? "wait" : "pointer", fontFamily: "inherit",
          }}
        >
          {busy ? "…" : "Dry run (simulation)"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!confirm("Confirmer la migration ? Les fichiers seront copiés sur R2 puis supprimés de Supabase Storage.")) return
            void run(false)
          }}
          disabled={busy}
          style={{
            padding: "8px 14px", borderRadius: 9, border: "none",
            background: busy ? "#C4B6E0"
              : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
            color: "white", fontSize: 12.5, fontWeight: 700,
            cursor: busy ? "wait" : "pointer", fontFamily: "inherit",
          }}
        >
          Lancer la migration
        </button>
      </div>

      {error && (
        <p style={{ marginTop: 12, fontSize: 12.5, color: "#B91C1C" }}>
          {error}
        </p>
      )}

      {result && (
        <div style={{
          marginTop: 14, padding: "12px 14px",
          borderRadius: 10, background: "#F8F6FF",
          border: "1px solid #EDE7F8",
          fontSize: 12.5, color: "#374151", lineHeight: 1.55,
        }}>
          <strong>{result.dry_run ? "Simulation" : "Migration"} terminée.</strong>
          {" "}Examiné&nbsp;: {result.examined} candidats. CV migrés&nbsp;:
          {" "}<strong>{result.cv_migrated}</strong>. Anonymisés migrés&nbsp;:
          {" "}<strong>{result.anonymized_migrated}</strong>.
          {result.cv_migrated >= 50 && (
            <div style={{ marginTop: 6, color: "#7C63C8", fontWeight: 600 }}>
              Le batch est plein — relancez pour traiter les suivants.
            </div>
          )}
          {(result.results ?? []).some((x) => x.error) && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer", color: "#B91C1C", fontWeight: 600 }}>
                Voir les erreurs ({result.results?.filter((x) => x.error).length})
              </summary>
              <ul style={{ marginTop: 6, fontSize: 11.5 }}>
                {result.results?.filter((x) => x.error).map((x) => (
                  <li key={x.candidate_id}>{x.candidate_id}&nbsp;: {x.error}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  )
}

function KpiCard({
    label, value, icon, hint, delay = 0, wide = false,
  }: {
    label: string
    value: number | string | undefined
    icon: React.ReactNode
    hint: string
    delay?: number
    wide?: boolean
  }) {
    const display = value === undefined
      ? "—"
      : typeof value === "number" ? value.toLocaleString("fr-FR") : value
    return (
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE, delay }}
        style={{
          padding: "16px 18px",
          background: "white",
          border: "1px solid #F0ECF8",
          borderRadius: 14,
          gridColumn: wide ? "span 2" : undefined,
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, color: "#7C63C8" }}>
          {icon}
          <span style={{
            fontSize: 11, fontWeight: 700, color: "#9CA3AF",
            letterSpacing: "0.06em", textTransform: "uppercase",
          }}>
            {label}
          </span>
        </div>
        <p style={{
          margin: 0, fontSize: 32, fontWeight: 800, color: "#111827",
          letterSpacing: "-0.025em", lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
        }}>
          {display}
        </p>
        <p style={{
          margin: "6px 0 0", fontSize: 11.5, color: "#9CA3AF", lineHeight: 1.5,
        }}>
          {hint}
        </p>
      </m.div>
    )
}

function formatEuros(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency", currency: "EUR", maximumFractionDigits: 0,
  }).format(n)
}

/* ── Icônes SVG (style Naywa, traits fins géométriques) ─────────── */
function BuildingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="6" width="18" height="15" rx="1" />
      <path d="M7 10h2M7 14h2M7 18h2M13 10h2M13 14h2M13 18h2" />
      <path d="M3 6l9-3 9 3" />
    </svg>
  )
}
function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.5 3-6 6-6s6 2.5 6 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M14.5 20c0-2.5 1.5-4.5 4-4.5s2.5 1 2.5 1" />
    </svg>
  )
}
function SeatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 18v-7a3 3 0 013-3h8a3 3 0 013 3v7" />
      <path d="M3 21h18" />
      <path d="M8 14h8" />
    </svg>
  )
}
function FileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M8 13h8M8 17h6" />
    </svg>
  )
}
function HourglassIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 3h12M6 21h12" />
      <path d="M6 3c0 4 6 5 6 9 0 4-6 5-6 9" />
      <path d="M18 3c0 4-6 5-6 9 0 4 6 5 6 9" />
    </svg>
  )
}
function EuroIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6.5C16.5 5 14 4 12 4c-4.5 0-7.5 3.5-7.5 8s3 8 7.5 8c2 0 4.5-1 6-2.5" />
      <path d="M3 10h11" />
      <path d="M3 14h11" />
    </svg>
  )
}
