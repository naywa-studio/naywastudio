"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { m } from "framer-motion"
import { useWorkspace } from "./layout"
import NoraLoader from "@/components/workspace/NoraLoader"
import { StarterChecklist } from "@/components/workspace/StarterChecklist"
import { getSupabase } from "@/lib/supabase"
import { trialStatus } from "@/lib/trial"
import { hasPricingAccess } from "@/lib/subscription"
import { UpdatesHeroCard } from "@/components/updates/UpdatesHeroCard"
import { getCapabilities } from "@/lib/capabilities"
import type { Organization } from "@/lib/database.types"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const copy = {
  fr: {
    noOrgName: "Organisation sans nom",
    hello: (firstName: string | null) => `Bonjour${firstName ? `, ${firstName}` : ""}`,
    yourWorkspace: "Votre espace de travail",
    setIdentity: "Définir l'identité de votre organisation",
    identityHint: " · apparaît sur les CV anonymisés",
    addCv: "Ajouter un CV",
    createMission: "Créer une mission",
    launchMatching: "Lancer un matching",
    priceMission: "Chiffrer une mission",
    trackPipeline: "Suivre le pipeline",
    orgQuickAccess: "Organisation",
    vivier: "Vivier",
    vivierUnit: "CV",
    openMissions: "Missions ouvertes",
    toQualify: "Matchs à qualifier",
    deltaThisWeek: (n: number) => `+${n} cette semaine`,
    missionsNowTitle: "Vos missions du moment",
    missionsNowSubtitle: "Reprenez là où vous en étiez.",
    missionInPipeline: (n: number) => `${n} en pipeline`,
    toQualifyWord: "à qualifier",
    openMission: "Ouvrir la mission",
    noMissionsTitle: "Aucune mission ouverte",
    noMissionsBody: "Créez une mission pour commencer à sourcer et matcher.",
    createFirstMission: "Créer une mission",
  },
  en: {
    noOrgName: "Unnamed organization",
    hello: (firstName: string | null) => `Hello${firstName ? `, ${firstName}` : ""}`,
    yourWorkspace: "Your workspace",
    setIdentity: "Set up your organization's identity",
    identityHint: " · appears on anonymized CVs",
    addCv: "Add a CV",
    createMission: "Create a job opening",
    launchMatching: "Run a matching",
    priceMission: "Price a job opening",
    trackPipeline: "Track the pipeline",
    orgQuickAccess: "Organization",
    vivier: "Talent pool",
    vivierUnit: "CVs",
    openMissions: "Open job openings",
    toQualify: "Matches to qualify",
    deltaThisWeek: (n: number) => `+${n} this week`,
    missionsNowTitle: "Your active missions",
    missionsNowSubtitle: "Pick up where you left off.",
    missionInPipeline: (n: number) => `${n} in pipeline`,
    toQualifyWord: "to qualify",
    openMission: "Open the mission",
    noMissionsTitle: "No open mission",
    noMissionsBody: "Create a mission to start sourcing and matching.",
    createFirstMission: "Create a mission",
  },
}

/** Helper local : trial app-side actif. Évite de réimporter le helper
 *  complet juste pour ça. */
function trialStatusActive(org: Organization): boolean {
  return trialStatus(org).state === "active"
}

/**
 * Couleur de marque (hex #RRGGBB, posée via le color picker) → rgba() à
 * l'alpha voulu, pour des accents SÛRS quelle que soit la couleur du client
 * (fonds très clairs, texte qui reste sur des tons neutres). Renvoie null si
 * la valeur n'est pas un hex exploitable → l'appelant retombe sur le violet
 * de l'app. On ne repeint jamais le chrome (boutons, nav) : juste le hero.
 */
function brandRgba(hex: string | null | undefined, alpha: number): string | null {
  if (!hex) return null
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

/**
 * Workspace home — cockpit opérationnel du sourceur (distinct de la Vue
 * d'ensemble admin de /organisation). Structure :
 *   - hero BRANDÉ (logo + couleurs du cabinet, « votre espace de travail »)
 *   - raccourcis d'action + accès Organisation (owner/délégué)
 *   - 3 KPIs bornés : Vivier (CV) · Missions ouvertes · Matchs à qualifier
 *   - « Vos missions du moment » : 1-2 missions les plus actives, chacune
 *     avec ses candidats en pipeline et ses matchs à qualifier.
 *
 * « À qualifier » = match fort (excellent/bon) DÉJÀ en pipeline mais encore au
 * premier stade (identified) : le sourceur doit décider de l'avancer ou l'écarter.
 */

interface Stats {
  candidates: number
  candidatesDelta: number
  openJobs: number
  /** Matchs forts en pipeline encore au stade « identified » (à qualifier). */
  toQualify: number
}

interface MissionCard {
  id: string
  title: string
  /** Candidats suivis dans la pipeline de cette mission. */
  pipelineCount: number
  /** Matchs forts à qualifier (in_pipeline + stade identified) sur cette mission. */
  toQualifyCount: number
}

export default function WorkspaceHome() {
  const { profile, organization, hasSubscription, isReadOnly, refetchProfile } = useWorkspace()
  const { lang } = useLanguage()
  const t = copy[lang]
  // L'accueil est une deuxième porte d'entrée vers la Suite Pricing (raccourci
  // « Chiffrer »). Sans ce gate, un client sans l'option voyait un lien qui mène
  // à un écran d'activation : on lui propose une porte fermée.
  const canPricing = hasPricingAccess(organization, { isAdmin: profile?.is_admin === true })
  // Accès rapide à /organisation réservé à ceux qui peuvent la gérer : owner
  // (isOrgAdmin) ou délégué habilité (branding/pricing). Un simple sourceur ne
  // le voit pas. Même source de vérité que le reste (getCapabilities).
  const orgCaps = getCapabilities(profile)
  const canReachOrg = orgCaps.isOrgAdmin || orgCaps.canBranding || orgCaps.canPricing
  const sb = useMemo(() => getSupabase(), [])
  const granted = useRef(false)

  const [stats, setStats] = useState<Stats | null>(null)
  const [missionCards, setMissionCards] = useState<MissionCard[]>([])
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Visite guidée Package Sourcing : auto-déclenchée à la PREMIÈRE
  // entrée dans le workspace pour CHAQUE user (owner ou member), tant
  // qu'il n'a pas stampé son propre flag sur profile.
  // Conditions :
  //   - org existe et a un accès actif (trial OU sub Stripe)
  //   - profile.package_sourcing_onboarded_at est NULL
  //   - pas en pending_deletion ni lockdown
  const orgHasAccess = !!organization && (
    trialStatusActive(organization) ||
    organization.subscription_status === "active" ||
    organization.subscription_status === "trialing"
  )
  const onboardingNeeded =
    !!profile &&
    !!organization &&
    !profile.package_sourcing_onboarded_at &&
    orgHasAccess &&
    !organization.pending_deletion_at &&
    !organization.lockdown_started_at
  // L'ancienne modale "visite guidée" (lecture passive) est remplacée par
  // la StarterChecklist (progression active) — même flag DB, même gating.

  // Grant the subscription if missing — first visit after signup.
  useEffect(() => {
    if (granted.current || hasSubscription) return
    granted.current = true
    ;(async () => {
      try {
        const r = await fetch("/api/subscribe", { method: "POST" })
        if (r.ok || r.status === 409) await refetchProfile()
      } catch { /* ignore */ }
    })()
  }, [hasSubscription, refetchProfile])

  // Brand logo — signed URL for 1 h preview from the org bucket.
  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!organization?.brand_logo_path) { setBrandLogoUrl(null); return }
      const { data: signed } = await sb.storage.from("brand-logos")
        .createSignedUrl(organization.brand_logo_path, 60 * 60)
      if (mounted) setBrandLogoUrl(signed?.signedUrl ?? null)
    })()
    return () => { mounted = false }
  }, [sb, organization?.brand_logo_path])

  // Charge les KPIs + les missions du moment.
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      const [
        candRes, candDeltaRes,
        jobsRes,
        toQualifyRes,
        recentJobsRes,
      ] = await Promise.all([
        // Vivier — CV actifs (hors « ancien »).
        sb.from("candidates").select("id", { count: "exact", head: true })
          .not("tags", "cs", "{ancien}"),
        sb.from("candidates").select("id", { count: "exact", head: true })
          .not("tags", "cs", "{ancien}")
          .gte("created_at", sevenDaysAgo),
        // Missions ouvertes.
        sb.from("jobs").select("id", { count: "exact", head: true })
          .eq("status", "open"),
        // Matchs à qualifier (global) : forts, en pipeline, encore « identified ».
        sb.from("match_assessments").select("id", { count: "exact", head: true })
          .in("match_tier", ["excellent", "good"])
          .eq("in_pipeline", true)
          .eq("pipeline_stage", "identified"),
        // Missions du moment : les 2 ouvertes les plus récemment actives.
        sb.from("jobs")
          .select("id, title")
          .eq("status", "open")
          .order("updated_at", { ascending: false })
          .limit(2),
      ])

      if (!mounted) return

      // Agrégats par mission (candidats en pipeline + matchs à qualifier) pour
      // les 1-2 missions affichées : une seule requête filtrée sur leurs ids,
      // comptée côté client.
      type RecentJob = { id: string; title: string }
      const recentJobs = (recentJobsRes.data ?? []) as RecentJob[]
      const jobIds = recentJobs.map((j) => j.id)

      const cards: MissionCard[] = recentJobs.map((j) => ({
        id: j.id, title: j.title, pipelineCount: 0, toQualifyCount: 0,
      }))

      if (jobIds.length > 0) {
        const { data: matchRows } = await sb.from("match_assessments")
          .select("job_id, in_pipeline, match_tier, pipeline_stage")
          .in("job_id", jobIds)
        if (!mounted) return
        type MatchRow = { job_id: string; in_pipeline: boolean; match_tier: string | null; pipeline_stage: string }
        for (const row of (matchRows ?? []) as MatchRow[]) {
          const card = cards.find((c) => c.id === row.job_id)
          if (!card) continue
          if (row.in_pipeline) card.pipelineCount += 1
          if (
            row.in_pipeline &&
            row.pipeline_stage === "identified" &&
            (row.match_tier === "excellent" || row.match_tier === "good")
          ) {
            card.toQualifyCount += 1
          }
        }
      }

      setStats({
        candidates: candRes.count ?? 0,
        candidatesDelta: candDeltaRes.count ?? 0,
        openJobs: jobsRes.count ?? 0,
        toQualify: toQualifyRes.count ?? 0,
      })
      setMissionCards(cards)
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [sb])

  const firstName = profile?.first_name?.trim() || null
  const brandName = (organization?.brand_name ?? organization?.name ?? "").trim() || null
  const brandInitials = brandName
    ? brandName.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")
    : null

  // Personnalisation « à vos couleurs » : le hero du workspace prend une teinte
  // de la marque du cabinet (fond + barre d'accent + anneau du logo). C'est ce
  // qui distingue l'accueil (l'espace DU cabinet) de la Vue d'ensemble (admin,
  // neutre). Accents uniquement — le chrome de l'app reste violet.
  const brandColor = organization?.brand_color ?? null
  const brandColor2 = organization?.brand_color_secondary ?? null
  const heroTint1 = brandRgba(brandColor, 0.12)
  const heroTint2 = brandRgba(brandColor2 ?? brandColor, 0.05)
  const heroBg = heroTint1
    ? `linear-gradient(120deg, ${heroTint1} 0%, ${heroTint2 ?? "transparent"} 55%, transparent 100%)`
    : "linear-gradient(120deg, var(--nw-surface-muted) 0%, white 65%)"
  const heroBar = brandColor
    ? `linear-gradient(90deg, ${brandColor} 0%, ${brandColor2 ?? brandColor} 100%)`
    : "linear-gradient(90deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)"
  const avatarRing = brandRgba(brandColor, 0.45) ?? "rgba(124,99,200,0.30)"

  return (
    <main style={{
      maxWidth: 1080, margin: "0 auto",
      padding: "44px 24px 80px",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      {/* Checklist de démarrage — cochée sur l'état réel du workspace,
          disparaît définitivement à 4/4 (ou via "Masquer"). */}
      {onboardingNeeded && (
        <StarterChecklist onComplete={() => { void refetchProfile() }} />
      )}

      {/* ── Hero identité — carte BRANDÉE (à vos couleurs) ────────── */}
      <m.section
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE }}
        style={{
          position: "relative", overflow: "hidden",
          borderRadius: 20, marginBottom: 30,
          padding: "26px 26px 24px",
          background: heroBg,
          border: "1px solid var(--nw-border-soft)",
        }}
      >
        {/* Barre d'accent supérieure aux couleurs de la marque. */}
        <div aria-hidden style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 4, background: heroBar,
        }} />
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <BrandAvatar logoUrl={brandLogoUrl} initials={brandInitials} ring={avatarRing} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              margin: 0, fontSize: 12, fontWeight: 700, color: "var(--nw-text-muted)",
              letterSpacing: "0.08em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {brandName ?? t.noOrgName}
            </p>
            <h1 style={{
              margin: "4px 0 0", fontSize: "clamp(26px, 3.4vw, 34px)", fontWeight: 800,
              color: "var(--nw-text)", letterSpacing: "-0.025em", lineHeight: 1.15,
            }}>
              {t.hello(firstName)}
            </h1>
            {brandName ? (
              <p style={{ margin: "7px 0 0", fontSize: 13, color: "var(--nw-text-muted)" }}>
                {t.yourWorkspace}
              </p>
            ) : (
              <p style={{ margin: "7px 0 0", fontSize: 13, color: "var(--nw-text-muted)" }}>
                <Link href="/organisation" style={{ color: "var(--nw-primary)", fontWeight: 600, textDecoration: "none" }}>
                  {t.setIdentity}
                </Link>
                {t.identityHint}
              </p>
            )}
          </div>
        </div>
      </m.section>

      {/* ── Card Nouveautés (uniquement si non-lues) ─────────── */}
      <UpdatesHeroCard />

      {/* ── Raccourcis d'action ───────────────────────────────── */}
      <m.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE, delay: 0.05 }}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 10, marginBottom: 28,
        }}
      >
        {/* En lecture seule (lockdown), on masque les CTAs créateurs.
            "Suivre le pipeline" et la navigation restent visibles --
            tout est encore consultable, juste plus modifiable. */}
        {!isReadOnly && (
          <>
            <ActionTile href="/workspace/vivier" label={t.addCv}  icon={<IconUpload />} />
            <ActionTile href="/workspace/missions" label={t.createMission} icon={<IconPlus />} />
            <ActionTile href="/workspace/missions" label={t.launchMatching} icon={<IconTarget />} />
            {canPricing && (
              <ActionTile href="/workspace/pricing" label={t.priceMission} icon={<IconEuro />} />
            )}
          </>
        )}
        <ActionTile href="/workspace/pipeline" label={t.trackPipeline} icon={<IconKanban />} />
        {/* Accès Organisation : PAS un onglet du workspace mais un vrai accès
            admin (owner/délégué). Traitement visuel distinct des raccourcis. */}
        {canReachOrg && (
          <OrgAccessTile label={t.orgQuickAccess} />
        )}
      </m.div>

      {/* ── KPIs (l'état, bornés) ─────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 12, marginBottom: 28,
      }}>
        <StatTile href="/workspace/vivier"
          label={t.vivier}
          value={stats?.candidates ?? null}
          unit={t.vivierUnit}
          delta={stats?.candidatesDelta ?? null}
          loading={loading}
          deltaLabel={t.deltaThisWeek}
        />
        <StatTile href="/workspace/missions"
          label={t.openMissions}
          value={stats?.openJobs ?? null}
          delta={null}
          loading={loading}
          deltaLabel={t.deltaThisWeek}
        />
        <StatTile href="/workspace/pipeline"
          label={t.toQualify}
          value={stats?.toQualify ?? null}
          delta={null}
          loading={loading}
          deltaLabel={t.deltaThisWeek}
        />
      </div>

      {/* ── Vos missions du moment ─────────────────────────────── */}
      <section style={{
        background: "white", border: "1px solid var(--nw-border-soft)", borderRadius: 16,
        overflow: "hidden",
      }}>
        <div style={{
          padding: "14px 18px", borderBottom: "1px solid var(--nw-border-soft)",
        }}>
          <h2 style={{
            margin: 0, fontSize: 12, fontWeight: 700, color: "var(--nw-text-muted)",
            letterSpacing: "0.08em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
          }}>
            {t.missionsNowTitle}
          </h2>
          <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--nw-text-muted)" }}>
            {t.missionsNowSubtitle}
          </p>
        </div>
        <div style={{ padding: 12 }}>
          {loading ? (
            <div style={{ padding: "20px 12px" }}><NoraLoader inline /></div>
          ) : missionCards.length === 0 ? (
            <div style={{ padding: "22px 14px", textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--nw-text)" }}>
                {t.noMissionsTitle}
              </p>
              <p style={{ margin: "5px 0 0", fontSize: 12.5, color: "var(--nw-text-muted)" }}>
                {t.noMissionsBody}
              </p>
              {!isReadOnly && (
                <Link href="/workspace/missions" style={{
                  display: "inline-block", marginTop: 14,
                  padding: "9px 16px", borderRadius: 10,
                  background: "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
                  color: "white", fontSize: 13, fontWeight: 700, textDecoration: "none",
                }}>
                  {t.createFirstMission}
                </Link>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {missionCards.map((mc) => (
                <MissionRow key={mc.id} card={mc} t={t} />
              ))}
            </div>
          )}
        </div>
      </section>

    </main>
  )
}

/** Carte « mission du moment » : titre + candidats en pipeline + gros chiffre
 *  « à qualifier » (l'action clé) + CTA d'ouverture. */
function MissionRow({ card, t }: { card: MissionCard; t: (typeof copy)["fr"] }) {
  return (
    <Link href={`/workspace/missions/${card.id}`} style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "14px 16px", borderRadius: 12,
      background: "var(--nw-surface-muted)", border: "1px solid var(--nw-border-soft)",
      textDecoration: "none",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0, fontSize: 14.5, fontWeight: 700, color: "var(--nw-text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {card.title}
        </p>
        <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--nw-text-muted)" }}>
          {t.missionInPipeline(card.pipelineCount)}
        </p>
      </div>
      {/* Gros chiffre actionnable : matchs à qualifier sur cette mission. */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <p style={{
          margin: 0, fontSize: 24, fontWeight: 800, lineHeight: 1,
          color: card.toQualifyCount > 0 ? "var(--nw-primary)" : "var(--nw-text-muted)",
          fontVariantNumeric: "tabular-nums",
        }}>
          {card.toQualifyCount}
        </p>
        <p style={{ margin: "3px 0 0", fontSize: 10.5, fontWeight: 700, color: "var(--nw-text-muted)", letterSpacing: "0.02em" }}>
          {t.toQualifyWord}
        </p>
      </div>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
        padding: "8px 13px", borderRadius: 9,
        background: "white", border: "1px solid var(--nw-primary-100)",
        color: "var(--nw-primary)", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap",
      }}>
        {t.openMission}
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M8 4l6 6-6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </span>
    </Link>
  )
}

/* ─── Sub-components ──────────────────────────────────────────── */

function BrandAvatar({ logoUrl, initials, ring }: { logoUrl: string | null; initials: string | null; ring?: string }) {
  const ringColor = ring ?? "rgba(124,99,200,0.30)"
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        style={{
          width: 60, height: 60, borderRadius: 14, flexShrink: 0,
          // contain plutôt que cover : on respecte le ratio d'aspect
          // d'origine du logo cabinet, même si c'est un format
          // non-carré (rectangulaire, large, etc.). Padding pour
          // que le logo ne touche pas le bord arrondi.
          objectFit: "contain",
          padding: 5,
          border: `1.5px solid ${ringColor}`,
          background: "white",
          boxShadow: "0 2px 10px -4px rgba(17,24,39,0.15)",
        }}
      />
    )
  }
  return (
    <div style={{
      width: 60, height: 60, borderRadius: 14, flexShrink: 0,
      background: "linear-gradient(135deg, white 0%, var(--nw-surface-muted) 100%)",
      border: `1.5px solid ${ringColor}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "var(--nw-text)", fontWeight: 800, fontSize: 19,
      letterSpacing: "0.02em",
      boxShadow: "0 2px 10px -4px rgba(17,24,39,0.15)",
    }}>
      {initials ?? "—"}
    </div>
  )
}

function ActionTile({ href, label, icon }: {
  href: string
  label: string
  icon: React.ReactNode
}) {
  return (
    <Link href={href} style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "12px 14px",
      background: "white", border: "1px solid var(--nw-border-soft)", borderRadius: 12,
      textDecoration: "none",
      transition: "border-color 160ms, box-shadow 160ms, transform 160ms",
    }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--nw-primary-100)"
        e.currentTarget.style.boxShadow = "0 4px 14px -8px rgba(124,99,200,0.25)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--nw-border-soft)"
        e.currentTarget.style.boxShadow = "none"
      }}
    >
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 32, height: 32, borderRadius: 8,
        background: "rgba(124,99,200,0.08)", color: "var(--nw-primary)",
        flexShrink: 0,
      }}>
        {icon}
      </span>
      <span style={{
        fontSize: 13, fontWeight: 600, color: "var(--nw-text)",
        lineHeight: 1.25,
      }}>
        {label}
      </span>
    </Link>
  )
}

/**
 * Accès Organisation — visuellement DISTINCT des raccourcis d'onglet : ce n'est
 * pas une page du workspace mais la console admin (owner/délégué). Fond teinté
 * primaire, icône pleine, chevron « on sort du workspace ».
 */
function OrgAccessTile({ label }: { label: string }) {
  return (
    <Link href="/organisation" style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "12px 14px",
      background: "linear-gradient(120deg, rgba(124,99,200,0.12) 0%, rgba(124,99,200,0.05) 100%)",
      border: "1px solid var(--nw-primary-100)", borderRadius: 12,
      textDecoration: "none",
      transition: "border-color 160ms, box-shadow 160ms",
    }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--nw-primary)"
        e.currentTarget.style.boxShadow = "0 4px 14px -8px rgba(124,99,200,0.35)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--nw-primary-100)"
        e.currentTarget.style.boxShadow = "none"
      }}
    >
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
        color: "white",
      }}>
        <IconBuilding />
      </span>
      <span style={{
        flex: 1, fontSize: 13, fontWeight: 700, color: "var(--nw-primary)", lineHeight: 1.25,
      }}>
        {label}
      </span>
      {/* Chevron « sortie » : on quitte le workspace vers l'admin. */}
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden style={{ flexShrink: 0, color: "var(--nw-primary)" }}>
        <path d="M8 4l6 6-6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </Link>
  )
}

function StatTile({ href, label, value, unit, delta, loading, deltaLabel }: {
  href: string
  label: string
  value: number | null
  /** Unité affichée en petit après le nombre (ex : « CV »). */
  unit?: string
  delta: number | null
  loading: boolean
  deltaLabel: (n: number) => string
}) {
  return (
    <Link href={href} style={{
      display: "block", padding: "16px 18px",
      background: "white", border: "1px solid var(--nw-border-soft)", borderRadius: 14,
      textDecoration: "none",
      transition: "border-color 160ms, box-shadow 160ms",
    }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--nw-primary-100)"
        e.currentTarget.style.boxShadow = "0 4px 14px -8px rgba(124,99,200,0.25)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--nw-border-soft)"
        e.currentTarget.style.boxShadow = "none"
      }}
    >
      <p style={{
        margin: 0, fontSize: 11, fontWeight: 700, color: "var(--nw-text-muted)",
        letterSpacing: "0.07em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
      }}>
        {label}
      </p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
        <p style={{
          margin: 0, fontSize: 28, fontWeight: 800, color: "var(--nw-text)",
          letterSpacing: "-0.02em", lineHeight: 1,
        }}>
          {loading ? "—" : value ?? 0}
          {!loading && unit && (
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--nw-text-muted)", marginLeft: 5 }}>
              {unit}
            </span>
          )}
        </p>
        {/* Delta masqué quand il égale le total (ex : vivier entièrement
            importé cette semaine) — "+77" sous "77" n'apporte rien. */}
        {!loading && delta != null && delta > 0 && value != null && delta < value && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: "var(--nw-success)",
          }}>
            {deltaLabel(delta)}
          </span>
        )}
      </div>
    </Link>
  )
}

/* ─── Icons (16 px, sober line-art) ───────────────────────────── */

const ICON_PROPS = {
  width: 16, height: 16, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 1.8,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
}

function IconUpload() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
    </svg>
  )
}
function IconPlus() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}
function IconTarget() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  )
}
function IconEuro() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M18 6.5A6.5 6.5 0 0 0 8.5 12 6.5 6.5 0 0 0 18 17.5" />
      <path d="M5 10h8M5 14h8" />
    </svg>
  )
}
function IconKanban() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="4" y="4" width="4" height="16" rx="1.2" />
      <rect x="10" y="4" width="4" height="10" rx="1.2" />
      <rect x="16" y="4" width="4" height="13" rx="1.2" />
    </svg>
  )
}
function IconBuilding() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="5" y="3" width="10" height="18" rx="1.4" />
      <path d="M15 8h4v13H5M8 7h1M11 7h1M8 11h1M11 11h1M8 15h1M11 15h1" />
    </svg>
  )
}
