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
import NoraLoader from "@/components/workspace/NoraLoader"
import { useWorkspace } from "../layout"
import PricingIcon from "@/components/workspace/PricingIcon"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

interface MissionRow {
  job: Pick<Job,
    | "id" | "title" | "location" | "contract_type" | "status"
    | "client_tjm_min" | "client_tjm_max" | "margin_min_pct"
    | "duration_months" | "target_gross_salary" | "created_at"
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
  const { profile: workspaceProfile } = useWorkspace()
  const isOwner = workspaceProfile?.role === "owner"
  const sb = useMemo(() => getSupabase(), [])
  const [missions, setMissions] = useState<MissionRow[] | null>(null)
  const [profile, setProfile] = useState<ProfilePricing | undefined>(undefined)

  const loadAll = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    const [{ data: jobs }, cabinetCfg, { data: pricingMatches }] = await Promise.all([
      sb
        .from("jobs")
        .select("id, title, location, contract_type, status, client_tjm_min, client_tjm_max, margin_min_pct, duration_months, target_gross_salary, created_at")
        .neq("status", "archived")
        .order("created_at", { ascending: false }),
      getCabinetPricingConfig(sb, user.id),
      sb
        .from("match_assessments")
        .select("job_id")
        .eq("in_pipeline", true),
    ])
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
    ;(async () => { if (mounted) await loadAll() })()
    return () => { mounted = false }
  }, [loadAll])

  // Loading state — profile or missions not yet fetched.
  if (missions === null || profile === undefined) return <NoraLoader />

  // Onboarding check : dedicated timestamp set by the wizard at finish.
  // Migration 012 had set DEFAULT 18 / 15 on the params columns, so they
  // were never NULL for new profiles — we couldn't tell first-time users
  // apart from configured ones. The dedicated column fixes that.
  const onboardingDone = profile?.pricing_onboarded_at != null

  if (!onboardingDone) {
    return (
      <main style={mainStyle}>
        <Header missionCount={0} />
        <NotConfiguredBanner isOwner={isOwner} />
      </main>
    )
  }

  return (
    <main style={mainStyle}>
      <Header missionCount={missions.length} />

      {missions.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{
          marginTop: 22,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 14,
        }}>
          {missions.map((m, i) => (
            <MissionCard key={m.job.id} row={m} index={i} />
          ))}
        </div>
      )}
    </main>
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
        letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12,
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
            color: "#111827", letterSpacing: "-0.025em", lineHeight: 1.15,
          }}>
            Vos missions à chiffrer
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "#6B7280", lineHeight: 1.6, maxWidth: 640 }}>
            {missionCount === 0
              ? "Aucune mission ouverte pour l'instant. Créez-en une depuis l'onglet Missions."
              : `${missionCount} mission${missionCount > 1 ? "s" : ""} ouverte${missionCount > 1 ? "s" : ""}. Cliquez pour ouvrir le chiffrage candidat.`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/cabinet/parametrage" style={linkBtnStyle}>
            Politique pricing cabinet
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
  fontSize: 12.5, fontWeight: 600, color: "#7C63C8",
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
      marginTop: 28, padding: "26px 30px",
      background: "white",
      border: "1px solid #F0ECF8", borderRadius: 16,
      boxShadow: "0 8px 24px -16px rgba(124,99,200,0.18)",
    }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#D97706",
        letterSpacing: "0.08em", textTransform: "uppercase",
      }}>
        Pricing à configurer
      </p>
      <h2 style={{ margin: "8px 0 12px", fontSize: 22, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em" }}>
        {isOwner ? "Configurez votre politique pricing" : "Le cabinet n'a pas encore configuré le pricing"}
      </h2>
      <p style={{ margin: "0 0 18px", fontSize: 14, color: "#4B5563", lineHeight: 1.65, maxWidth: 640 }}>
        {isOwner
          ? "Marge minimum, marge cible, avantages standards du cabinet : tout se règle dans la console cabinet. Sans ces paramètres, les chiffrages des missions retombent sur des valeurs par défaut peu pertinentes pour votre activité."
          : "Demandez à l'owner de votre cabinet de configurer la politique pricing. En attendant, les chiffrages utilisent des valeurs par défaut génériques."}
      </p>
      {isOwner ? (
        <Link
          href="/cabinet/parametrage"
          style={{
            display: "inline-block",
            padding: "11px 20px", borderRadius: 10,
            background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
            color: "white", fontSize: 13.5, fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Configurer maintenant
        </Link>
      ) : (
        <Link
          href="/workspace/pricing/reference"
          style={{
            display: "inline-block",
            padding: "11px 20px", borderRadius: 10,
            background: "white", border: "1px solid #E5E7EB", color: "#374151",
            fontSize: 13.5, fontWeight: 600, textDecoration: "none",
          }}
        >
          Consulter la référence Syntec
        </Link>
      )}
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
        margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: "#111827",
        letterSpacing: "-0.015em",
      }}>
        Aucune mission ouverte
      </h2>
      <p style={{
        margin: "0 auto 18px", maxWidth: 540, fontSize: 14, color: "#6B7280",
        lineHeight: 1.6,
      }}>
        Le pricing s&apos;applique aux missions que vous avez créées et qui sont
        encore ouvertes. Créez votre première mission depuis l&apos;onglet
        Missions.
      </p>
      <Link href="/workspace/missions" style={{
        display: "inline-block",
        padding: "11px 22px", borderRadius: 12,
        background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
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
          background: "white", borderRadius: 14, border: "1px solid #F0ECF8",
          padding: 16,
          transition: "border-color 0.2s ease",
        }}
      >
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          gap: 10, marginBottom: 10,
        }}>
          <h2 style={{
            margin: 0, fontSize: 15.5, fontWeight: 800, color: "#111827",
            lineHeight: 1.3,
          }}>
            {job.title}
          </h2>
          {pricingCandidatesCount > 0 && (
            <span style={{
              flexShrink: 0,
              fontSize: 11, fontWeight: 700, color: "#7C63C8",
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
          fontSize: 11.5, color: "#6B7280",
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
            fontSize: 12, fontWeight: 700, color: "#7C63C8",
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
      background: "#F8F6FF", border: "1px solid #F0ECF8",
      padding: "2px 8px", borderRadius: 6,
    }}>
      {children}
    </span>
  )
}

function PricingStatus({
  allRequiredFilled, filledCount, tjmLabel,
}: {
  allRequiredFilled: boolean
  filledCount: number
  tjmLabel: string | null
}) {
  if (allRequiredFilled) {
    return (
      <span style={{
        fontSize: 11, fontWeight: 700, color: "#15803d",
        display: "inline-flex", alignItems: "center", gap: 5,
      }}>
        ✓ {tjmLabel ? `TJM ${tjmLabel}` : "Prêt à chiffrer"}
      </span>
    )
  }
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color: "#B45309",
      display: "inline-flex", alignItems: "center", gap: 5,
    }}>
      ⚠ {filledCount}/3 paramètres remplis
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
