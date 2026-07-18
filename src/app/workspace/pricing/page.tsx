"use client"

/**
 * /workspace/pricing — Hub du sourceur pour le chiffrage des missions.
 *
 * Flow attendu :
 *   1. Premier accès → onboarding check (wizard params entreprise — tâche #28)
 *   2. Sinon → liste des missions, chacune avec son statut params pricing
 *      et le nombre de candidats actuellement en stage "pricing"
 *   3. Clic sur une mission → /workspace/pricing/[jobId] (form complétion
 *      + sélection candidat — tâche #31)
 *
 * Liens annexes en haut :
 *   - ⚙ Paramètres entreprise (/workspace/parametrage)
 *   - 📖 Référence Syntec (/workspace/pricing/reference)
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { m } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import type { Job } from "@/lib/database.types"
import { getCabinetPricingConfig, type CabinetPricingConfig } from "@/lib/cabinet-config"
import { hasPricingAccess } from "@/lib/subscription"
import { PricingSkeleton } from "@/components/workspace/PageSkeletons"
import { useWorkspace } from "../layout"
import PricingIcon from "@/components/workspace/PricingIcon"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

interface MissionRow {
  job: Pick<Job,
    | "id" | "title" | "location" | "contract_type" | "status"
    | "client_tjm_min" | "client_tjm_max" | "margin_min_pct"
    | "duration_months" | "target_gross_salary" | "created_at" | "user_id"
  >
  pricingCandidatesCount: number
}

type ProfilePricing = Pick<CabinetPricingConfig,
  | "pricing_billable_days_per_month"
  | "pricing_margin_min_pct"
  | "pricing_default_avantages"
  | "pricing_onboarded_at"
> | null

export default function PricingPage() {
  const { profile: workspaceProfile, organization } = useWorkspace()
  const isOwner = workspaceProfile?.role === "owner"
  // La Suite Pricing est une OPTION payante : l'onglet de nav est masqué sans
  // elle, mais masquer un lien n'empêche personne de taper l'URL — d'où ce
  // garde ici aussi. Le vrai périmètre reste serveur (requirePricingAccess).
  const canPricing = hasPricingAccess(organization, {
    isAdmin: workspaceProfile?.is_admin === true,
  })
  const sb = useMemo(() => getSupabase(), [])
  const [missions, setMissions] = useState<MissionRow[] | null>(null)
  const [profile, setProfile] = useState<ProfilePricing | undefined>(undefined)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [members, setMembers] = useState<Map<string, string>>(new Map())
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoadError(null)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    setCurrentUserId(user.id)
    const [{ data: jobs }, cabinetCfg, { data: pricingMatches }, { data: profilesData }] = await Promise.all([
      sb
        .from("jobs")
        .select("id, title, location, contract_type, status, client_tjm_min, client_tjm_max, margin_min_pct, duration_months, target_gross_salary, created_at, user_id")
        .neq("status", "archived")
        .order("created_at", { ascending: false }),
      getCabinetPricingConfig(sb, user.id),
      sb
        .from("match_assessments")
        .select("job_id")
        .eq("in_pipeline", true),
      sb
        .from("profiles")
        .select("user_id, first_name"),
    ])
    const m = new Map<string, string>()
    for (const p of (profilesData ?? []) as Array<{ user_id: string; first_name: string | null }>) {
      m.set(p.user_id, (p.first_name?.trim() || "Sans prénom"))
    }
    setMembers(m)
    const prof = cabinetCfg ? {
      pricing_billable_days_per_month: cabinetCfg.pricing_billable_days_per_month,
      pricing_margin_min_pct: cabinetCfg.pricing_margin_min_pct,
      pricing_default_avantages: cabinetCfg.pricing_default_avantages,
      pricing_onboarded_at: cabinetCfg.pricing_onboarded_at,
    } : null
    // Compte les candidats en pipeline par mission — c'est le pool réel à
    // chiffrer (le sourceur n'a ajouté que ceux qu'il poursuit vraiment).
    const countsByJob = new Map<string, number>()
    for (const row of (pricingMatches ?? []) as { job_id: string }[]) {
      countsByJob.set(row.job_id, (countsByJob.get(row.job_id) ?? 0) + 1)
    }
    const rows: MissionRow[] = ((jobs ?? []) as MissionRow["job"][]).map((j) => ({
      job: j,
      pricingCandidatesCount: countsByJob.get(j.id) ?? 0,
    }))
    setMissions(rows)
    setProfile(prof ?? null)
  }, [sb])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        if (mounted) await loadAll()
      } catch (err) {
        if (!mounted) return
        // Filet de sécurité : si Supabase timeout (cold start, panne, réseau client),
        // on affiche une carte d'erreur avec retry plutôt qu'une page blanche.
        setLoadError(err instanceof Error ? err.message : "Erreur de chargement")
        setMissions([])     // sort du loading state
        setProfile(null)
      }
    })()
    return () => { mounted = false }
  }, [loadAll])

  // Option non souscrite → écran d'activation, pas la Suite.
  if (!canPricing) {
    return (
      <main style={mainStyle}>
        <div style={{
          margin: "24px 0", padding: "32px 28px", borderRadius: 16,
          background: "linear-gradient(120deg, var(--nw-bg) 0%, var(--nw-border-soft) 100%)",
          border: "1px solid var(--nw-primary-100)",
          textAlign: "center",
          fontFamily: "var(--font-inter), sans-serif",
        }}>
          <p style={{
            margin: 0, fontSize: 11, fontWeight: 700, color: "var(--nw-primary)",
            letterSpacing: "0.10em", textTransform: "uppercase",
          }}>
            Option non activée
          </p>
          <h1 style={{
            margin: "8px 0 0", fontSize: 24, fontWeight: 800, color: "var(--nw-text)",
            letterSpacing: "-0.02em",
            fontFamily: "var(--font-inter), sans-serif",
          }}>
            La Suite Pricing Syntec
          </h1>
          <p style={{
            margin: "12px auto 0", maxWidth: 460, fontSize: 14, lineHeight: 1.65, color: "var(--nw-text-secondary)",
          }}>
            Chiffrez vos missions en régie sans vous tromper : TJM, marge réelle,
            charges par statut, calendrier des jours facturables, et la fiche PDF
            à envoyer au client. Le tout à votre convention.
          </p>
          <Link
            href="/organisation?tab=abonnement"
            style={{
              display: "inline-block", marginTop: 20,
              padding: "11px 20px", borderRadius: 12,
              background: "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
              color: "white", fontSize: 13.5, fontWeight: 700,
              textDecoration: "none",
              boxShadow: "0 8px 24px -6px rgba(124,99,200,0.55)",
            }}
          >
            {isOwner ? "Activer l'option →" : "Voir mon organisation →"}
          </Link>
          {!isOwner && (
            <p style={{ margin: "12px 0 0", fontSize: 11.5, color: "var(--nw-text-muted)" }}>
              Seul le propriétaire de l&apos;organisation peut activer une option.
            </p>
          )}
        </div>
      </main>
    )
  }

  // Error state — fetch a échoué.
  if (loadError) {
    return (
      <main style={mainStyle}>
        <Header missionCount={0} />
        <div style={{
          margin: "24px 0", padding: "20px 22px", borderRadius: 14,
          background: "rgba(220,38,38,0.05)",
          border: "1px solid rgba(220,38,38,0.25)",
          textAlign: "center",
          fontFamily: "var(--font-inter), sans-serif",
        }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--nw-danger-strong)" }}>
            Impossible de charger les missions.
          </p>
          <p style={{ margin: "6px 0 14px", fontSize: 12.5, color: "#7F1D1D" }}>
            {loadError}
          </p>
          <button
            type="button"
            onClick={() => {
              setLoadError(null); setMissions(null); setProfile(undefined)
              void loadAll()
            }}
            style={{
              padding: "8px 16px", borderRadius: 10,
              border: "none", background: "var(--nw-primary)", color: "white",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Réessayer
          </button>
        </div>
      </main>
    )
  }

  // Loading state — profile or missions not yet fetched.
  if (missions === null || profile === undefined) return <PricingSkeleton />

  // Onboarding check : dedicated timestamp set by the wizard at finish.
  // Migration 012 had set DEFAULT 18 / 15 on the params columns, so they
  // were never NULL for new profiles — we couldn't tell first-time users
  // apart from configured ones. The dedicated column fixes that.
  const onboardingDone = profile?.pricing_onboarded_at != null

  return (
    <main style={mainStyle}>
      <Header missionCount={missions.length} />

      {!onboardingDone && (
        <NotConfiguredBanner isOwner={isOwner} />
      )}

      {missions.length === 0 ? (
        <EmptyState />
      ) : (() => {
        // Regroupement par créateur. Mêmes règles que /workspace/missions :
        // Mes missions d'abord, puis Missions de [prénom] par ordre alpha.
        // Si je suis seul à avoir des missions, on saute le titre de section.
        const byUser = new Map<string, MissionRow[]>()
        for (const row of missions) {
          const arr = byUser.get(row.job.user_id) ?? []
          arr.push(row); byUser.set(row.job.user_id, arr)
        }
        const mine = currentUserId ? byUser.get(currentUserId) ?? [] : []
        const others = Array.from(byUser.entries())
          .filter(([uid]) => uid !== currentUserId)
          .map(([uid, rows]) => ({
            userId: uid,
            firstName: members.get(uid) ?? "Membre",
            rows,
          }))
          .sort((a, b) => a.firstName.localeCompare(b.firstName))
        if (others.length === 0) {
          return (
            <div style={gridStyle}>
              {missions.map((row, i) => (
                <MissionCard key={row.job.id} row={row} index={i} />
              ))}
            </div>
          )
        }
        return (
          <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 22 }}>
            {mine.length > 0 && (
              <PricingGroup title="Mes missions" rows={mine} isMine />
            )}
            {others.map((g) => (
              <PricingGroup
                key={g.userId}
                title={`Missions de ${g.firstName}`}
                rows={g.rows}
              />
            ))}
          </div>
        )
      })()}
    </main>
  )
}

const gridStyle: React.CSSProperties = {
  marginTop: 22,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
  gap: 14,
}

function PricingGroup({ title, rows, isMine }: {
  title: string
  rows: MissionRow[]
  isMine?: boolean
}) {
  const accent = isMine ? "var(--nw-primary)" : "var(--nw-text-muted)"
  return (
    <section>
      <header style={{
        display: "flex", alignItems: "baseline", gap: 10,
        marginBottom: 12,
      }}>
        <span style={{
          width: 4, height: 16, borderRadius: 4,
          background: accent, display: "inline-block",
        }} />
        <h2 style={{
          margin: 0, fontSize: 14, fontWeight: 700,
          color: isMine ? "var(--nw-text)" : "var(--nw-text-body)",
          letterSpacing: "-0.005em",
        }}>
          {title}
        </h2>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--nw-text-muted)" }}>
          · {rows.length} mission{rows.length > 1 ? "s" : ""}
        </span>
      </header>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: 14,
      }}>
        {rows.map((row, i) => (
          <MissionCard key={row.job.id} row={row} index={i} />
        ))}
      </div>
    </section>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Header + side links
 * ────────────────────────────────────────────────────────────────────────── */

function Header({ missionCount }: { missionCount: number }) {
  return (
    <div>
      <span style={{
        display: "inline-block",
        fontSize: 11, fontWeight: 700, color: "#D97706",
        background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.22)",
        padding: "4px 11px", borderRadius: 100,
        letterSpacing: "0.08em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase", marginBottom: 12,
      }}>
        <PricingIcon size={11} style={{ marginRight: 5 }} /> Pricing
      </span>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        gap: 12, flexWrap: "wrap",
      }}>
        <div>
          <h1 style={{
            margin: 0, fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 800,
            color: "var(--nw-text)", letterSpacing: "-0.025em", lineHeight: 1.15,
          }}>
            Vos missions à chiffrer
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--nw-text-muted)", lineHeight: 1.6, maxWidth: 640 }}>
            {missionCount === 0
              ? "Aucune mission ouverte pour l'instant. Créez-en une depuis l'onglet Missions."
              : `${missionCount} mission${missionCount > 1 ? "s" : ""} ouverte${missionCount > 1 ? "s" : ""}. Cliquez pour ouvrir le chiffrage candidat.`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/organisation/parametrage" style={linkBtnStyle}>
            Politique pricing organisation
          </Link>
          <Link href="/workspace/pricing/reference" style={linkBtnStyle}>
            Référence Syntec
          </Link>
        </div>
      </div>
    </div>
  )
}

const linkBtnStyle: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 600, color: "var(--nw-primary)",
  background: "white", border: "1px solid rgba(124,99,200,0.25)",
  borderRadius: 9, padding: "8px 14px", textDecoration: "none",
  whiteSpace: "nowrap",
}

/* ──────────────────────────────────────────────────────────────────────────
 * Banner : la politique pricing n'est pas encore configurée.
 * - Owner : CTA "Configurer maintenant" → /cabinet/parametrage
 * - Member : message d'attente, l'owner doit configurer
 * ────────────────────────────────────────────────────────────────────────── */

function NotConfiguredBanner({ isOwner }: { isOwner: boolean }) {
  return (
    <div style={{
      marginTop: 18,
      padding: "12px 16px",
      background: "rgba(217,119,6,0.06)",
      border: "1px solid rgba(217,119,6,0.25)",
      borderRadius: 12,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap",
    }}>
      <div style={{ minWidth: 0, flex: "1 1 280px" }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--nw-warn-strong)" }}>
          {isOwner
            ? "Politique pricing pas encore configurée"
            : "Le cabinet n'a pas encore configuré sa politique pricing"}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 12, color: "#7C2D12", lineHeight: 1.5 }}>
          {isOwner
            ? "Réglez vos marges et avantages dans la console organisation."
            : "L'owner n'a pas réglé les marges et avantages — valeurs par défaut en attendant."}
        </p>
      </div>
      {isOwner ? (
        <Link
          href="/organisation/parametrage"
          style={{
            display: "inline-block",
            padding: "8px 14px", borderRadius: 9,
            background: "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
            color: "white", fontSize: 12.5, fontWeight: 700,
            textDecoration: "none", whiteSpace: "nowrap",
          }}
        >
          Configurer →
        </Link>
      ) : null}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Empty state — no missions at all
 * ────────────────────────────────────────────────────────────────────────── */

function EmptyState() {
  return (
    <m.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      style={{
        marginTop: 28, padding: "44px 32px",
        background: "white",
        border: "2px dashed rgba(217,119,6,0.30)",
        borderRadius: 20, textAlign: "center",
      }}
    >
      <div style={{ fontSize: 44, marginBottom: 12 }}>💼</div>
      <h2 style={{
        margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: "var(--nw-text)",
        letterSpacing: "-0.015em",
      }}>
        Aucune mission ouverte
      </h2>
      <p style={{
        margin: "0 auto 18px", maxWidth: 540, fontSize: 14, color: "var(--nw-text-muted)",
        lineHeight: 1.6,
      }}>
        Créez une mission depuis l&apos;onglet Missions.
      </p>
      <Link href="/workspace/missions" style={{
        display: "inline-block",
        padding: "11px 22px", borderRadius: 12,
        background: "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
        color: "white", fontWeight: 700, fontSize: 14, textDecoration: "none",
        boxShadow: "0 8px 24px -8px rgba(124,99,200,0.5)",
      }}>
        Aller aux Missions →
      </Link>
    </m.div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Mission card
 * ────────────────────────────────────────────────────────────────────────── */

function MissionCard({ row, index }: { row: MissionRow; index: number }) {
  const { job, pricingCandidatesCount } = row

  const hasTjm = job.client_tjm_min != null || job.client_tjm_max != null
  const hasMargin = job.margin_min_pct != null
  const hasDuration = job.duration_months != null
  const filledCount = [hasTjm, hasMargin, hasDuration].filter(Boolean).length
  // 3 required fields for a decent pricing : TJM, marge mini, durée.
  // target_gross_salary is optional (peut être déduit).
  const allRequiredFilled = filledCount === 3

  const tjmLabel = job.client_tjm_min != null && job.client_tjm_max != null
    ? `${job.client_tjm_min}–${job.client_tjm_max} €/j`
    : job.client_tjm_min != null
      ? `≥ ${job.client_tjm_min} €/j`
      : job.client_tjm_max != null
        ? `≤ ${job.client_tjm_max} €/j`
        : null

  return (
    <m.div
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.3), ease: EASE }}
      whileHover={{ y: -2 }}
    >
      <Link
        href={`/workspace/pricing/${job.id}`}
        style={{
          display: "block", textDecoration: "none",
          background: "white", borderRadius: 14, border: "1px solid var(--nw-border-soft)",
          padding: 16,
          transition: "border-color 0.2s ease",
        }}
      >
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          gap: 10, marginBottom: 10,
        }}>
          <h2 style={{
            margin: 0, fontSize: 15.5, fontWeight: 800, color: "var(--nw-text)",
            lineHeight: 1.3,
          }}>
            {job.title}
          </h2>
          {pricingCandidatesCount > 0 && (
            <span style={{
              flexShrink: 0,
              fontSize: 11, fontWeight: 700, color: "var(--nw-primary)",
              background: "rgba(124,99,200,0.10)",
              border: "1px solid rgba(124,99,200,0.25)",
              borderRadius: 100, padding: "3px 9px",
            }}>
              {pricingCandidatesCount} en pipeline
            </span>
          )}
        </div>

        <div style={{
          display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12,
          fontSize: 11.5, color: "var(--nw-text-muted)",
        }}>
          {job.location && <Tag>{job.location}</Tag>}
          {job.contract_type && <Tag>{job.contract_type}</Tag>}
          {job.duration_months && <Tag>{job.duration_months} mois</Tag>}
        </div>

        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          paddingTop: 10, borderTop: "1px solid #F4F1FB",
        }}>
          <PricingStatus
            allRequiredFilled={allRequiredFilled}
            filledCount={filledCount}
            tjmLabel={tjmLabel}
          />
          <span style={{
            fontSize: 12, fontWeight: 700, color: "var(--nw-primary)",
            display: "inline-flex", alignItems: "center", gap: 4,
          }}>
            Ouvrir →
          </span>
        </div>
      </Link>
    </m.div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      background: "var(--nw-bg)", border: "1px solid var(--nw-border-soft)",
      padding: "2px 8px", borderRadius: 6,
    }}>
      {children}
    </span>
  )
}

function PricingStatus({
  allRequiredFilled, tjmLabel,
}: {
  allRequiredFilled: boolean
  filledCount: number
  tjmLabel: string | null
}) {
  if (allRequiredFilled) {
    return (
      <span style={{
        fontSize: 11, fontWeight: 700, color: "var(--nw-success)",
        display: "inline-flex", alignItems: "center", gap: 5,
      }}>
        ✓ {tjmLabel ? `TJM ${tjmLabel}` : "Prêt à chiffrer"}
      </span>
    )
  }
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color: "var(--nw-warn)",
      display: "inline-flex", alignItems: "center", gap: 5,
    }}>
      ⚠ À compléter · TJM, durée, date
    </span>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Shared styles
 * ────────────────────────────────────────────────────────────────────────── */

const mainStyle: React.CSSProperties = {
  minHeight: "calc(100vh - 60px)",
  padding: "32px 24px 80px",
  maxWidth: 1180, margin: "0 auto",
  fontFamily: "var(--font-inter), sans-serif",
}
