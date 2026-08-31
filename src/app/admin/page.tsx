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
import { useLanguage } from "@/lib/i18n/LanguageContext"
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from "recharts"

interface Kpis {
  cabinets_active: number
  users_total: number
  seats_occupied: number
  candidates_parsed: number
  trials_active: number
  mrr_estimated_eur: number
  org_type_counts: {
    esn_conseil: number
    cabinet_recrutement: number
    equipe_interne: number
  }
  candidates_by_month: {
    month: string
    count: number
  }[]
}

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const copy = {
  fr: {
    badge: "Console admin",
    title: "Tableau de bord",
    refreshing: "Actualisation…",
    refresh: "Actualiser",
    errorWithStatus: (status: number) => `Erreur ${status}`,
    platform: "Plateforme",
    platformFirms:"Organisations",
    breakdown: "Répartition",
    esn: "ESN Conseil",
    cabinet: "Cabinet recrutement",
    interne: "Équipe interne",
    platformUsers:"Utilisateurs",
    platformSeats: "Sièges occupés",
    kpiCandidates: "Candidats parsés",
    kpiCandidatesHint: "CV uploadés et analysés par Nora",
    kpiTrials: "Essais actifs",
    kpiTrialsHint: "trial_ends_at > maintenant",
    kpiMrr: "MRR estimé",
    kpiMrrHint: "sub Stripe active + trialing",
    footnote: "Chaque KPI vient d'une requête unique côté API. Aucun ratio composé. Le MRR estimé compte les sub Stripe actives ou en essai natif, valorisées via le barème dégressif (sièges + option Pricing).",
  },
  en: { 
    badge: "Admin console", 
    title: "Dashboard", 
    refreshing: "Refreshing…", 
    refresh: "Refresh", 
    errorWithStatus: (status: number) => `Error ${status}`, 
    platform: "Platform", 
    platformFirms: "Organizations", 
    breakdown: "Breakdown",
    esn: "ESN Consulting",
    cabinet: "Recruitment Agency",
    interne: "Internal Team",
    platformUsers: "Users", 
    platformSeats: "Seats", 
    kpiCandidates: "Parsed candidates", 
    kpiCandidatesHint: "CVs uploaded and analyzed by Nora", 
    kpiTrials: "Active trials", 
    kpiTrialsHint: "trial_ends_at > now", 
    kpiMrr: "Estimated MRR", 
    kpiMrrHint: "active or trialing Stripe sub", 
    footnote: "Each KPI comes from a single API query. No composite ratio. Estimated MRR counts active or native-trial Stripe subs, valued via the tiered pricing scale (seats + Pricing option).", 
  },
}

export default function AdminDashboardPage() {
  const { lang } = useLanguage()
  const t = copy[lang]
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  

  const fetchKpis = async () => {
    setLoading(true); 
    setError(null)
    try {
      const res = await fetch("/api/admin/kpis", { cache: "no-store" })
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(j.error ?? t.errorWithStatus(res.status))
      }
      const j = await res.json() as Kpis
      setKpis(j)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
              color: "var(--nw-primary)", letterSpacing: "0.10em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
            }}>
              {t.badge}
            </p>
            <h1 style={{
              margin: 0, fontSize: 28, fontWeight: 800, color: "var(--nw-text)",
              letterSpacing: "-0.02em",
            }}>
              {t.title}
            </h1>
          </div>
          <button
            type="button"
            onClick={fetchKpis}
            disabled={loading}
            style={{
              padding: "8px 14px", borderRadius: 9,
              border: "1px solid var(--nw-border)", background: "white",
              color: "var(--nw-text-body)", fontSize: 12.5, fontWeight: 600,
              cursor: loading ? "wait" : "pointer", fontFamily: "inherit",
            }}
          >
            {loading ? t.refreshing : t.refresh}
          </button>
        </header>

        {error && (
          <div style={{
            padding: "12px 14px", borderRadius: 10,
            background: "rgba(220,38,38,0.06)",
            border: "1px solid rgba(220,38,38,0.25)",
            color: "var(--nw-danger-strong)", fontSize: 13, marginBottom: 20,
          }}>
            {error}
          </div>
        )}

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}>
          <PlatformCard
           firms={kpis?.cabinets_active} 
           users={kpis?.users_total} 
           seats={kpis?.seats_occupied}
           orgTypes={kpis?.org_type_counts}
           delay={0}
          />
         
          
         <CandidatesParsedCard
            value={kpis?.candidates_parsed}
            data={kpis?.candidates_by_month}
            delay={0.12}
          />

          <KpiCard
            label={t.kpiTrials}
            value={kpis?.trials_active}
            icon={<HourglassIcon />}
            hint={t.kpiTrialsHint}
            delay={0.16}
          />
          <KpiCard
            label={t.kpiMrr}
            value={kpis ? formatEuros(kpis.mrr_estimated_eur, lang) : undefined}
            icon={<EuroIcon />}
            hint={t.kpiMrrHint}
            delay={0.20}
            wide
          />
        </div>

        <p style={{
          marginTop: 28, fontSize: 11.5, color: "var(--nw-text-muted)", lineHeight: 1.55,
        }}>
          {t.footnote}
        </p>

        <StripeSeedCard />
      </main>
    </LazyMotion>
  )
}

/*Platform Card */ 
function PlatformCard({
  firms,
  users,
  seats,
  orgTypes,
  delay=0,
}: {
  firms?:number
  users?:number
  seats?:number
  orgTypes?: {
    esn_conseil: number
    cabinet_recrutement: number
    equipe_interne: number
  }
  delay?:number
}) {
  const {lang }=useLanguage()
  const [expanded, setExpanded] = useState(false)
  const labels = 
   lang === "fr"
     ? {
         title: "Plateforme",
         firms: "Organisations", 
         users: "Utilisateurs", 
         seats: "Sièges", 
         breakdown: "Répartition",
         esn: "ESN Conseil",
         cabinet: "Cabinet recrutement",
         interne: "Équipe interne",
        } 
      : { 
         title: "Platform", 
         firms: "Organizations", 
         users: "Users", 
         seats: "Seats",
         breakdown: "Breakdown",
         esn: "ESN Consulting",
         cabinet: "Recruitment Agency",
         interne: "Internal Team",
        }
  const formatNumber =(value?: number )=>
    value === undefined
      ? "-"
      : value.toLocaleString(lang ==="fr"? "fr-FR": "en-US")
return (
  <m.div
    initial ={{opacity: 0, y: 8}}
    animate= {{opacity: 1, y: 0}}
    transition={{
      duration: 0.4,
      ease:EASE,
      delay,
    }}
    style={{
      padding: "16px 18px",
      background: "white",
      border: "1 px solid var(--nw--border--soft)",
      borderRadius: 14,
      minWidth: 0,
      height: expanded ? "auto" : 150,
      boxSizing: "border-box",
      alignSelf: "start",
    }}
  > 
  <div 
      style ={{
        display:"flex",
        alignItems:"center",
        gap: 10,
        marginBottom: 18,
        color: "var(--nw-primary)",
      }}
   > 
    <BuildingIcon/>
    
    <span
     style={{ 
      fontSize: 11, 
      fontWeight: 700, 
      color: "var(--nw-text-muted)", 
      letterSpacing: "0.06em", 
      fontFamily: "var(--nw-font-mono)", 
      textTransform: "uppercase", 
    }} 
    > 
    {labels.title} 
    </span> 
  </div> 
    <div 
    style={{ 
      display: "grid", 
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))", 
      gap: 12, 
      alignSelf: "start",

    }} 
    > 
    <PlatformMetric 
      label={labels.firms} 
      value={formatNumber(firms)} 
      /> 

    <PlatformMetric 
      label={labels.users} 
      value={formatNumber(users)} 
    /> 
    
    <PlatformMetric 
      label={labels.seats} 
      value={formatNumber(seats)} 
    /> 
    </div>
    <button
  type="button"
  onClick={() => setExpanded(!expanded)}
  style={{
    marginTop: 16,
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "transparent",
    border: "none",
    color: "var(--nw-primary)",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    padding: 0,
  }}
>
  {labels.breakdown}
  <span>{expanded ? "▲" : "▼"}</span>
  </button>

  {expanded && (
  <m.div
    initial={{ opacity: 0, height: 0 }}
    animate={{ opacity: 1, height: "auto" }}
    transition={{ duration: 0.25 }}
    style={{
      overflow: "hidden",
      marginTop: 14,
      paddingTop: 14,
      borderTop: "1px solid var(--nw-border-soft)",
      display: "grid",
      gap: 10,
    }}
  >
    <OrgTypeRow
      label={labels.esn}
      value={orgTypes?.esn_conseil}
    />

    <OrgTypeRow
      label={labels.cabinet}
      value={orgTypes?.cabinet_recrutement}
    />

    <OrgTypeRow
      label={labels.interne}
      value={orgTypes?.equipe_interne}
    />
  </m.div>
)}
    </m.div> 
    ) 
  } 

function CandidatesParsedCard({
  value,
  data,
  delay = 0,
}: {
  value?: number
  data?: { month: string; count: number }[]
  delay?: number
}) {
  const { lang } = useLanguage()
  const [expanded, setExpanded] = useState(false)
  const display =
    value === undefined
      ? "—"
      : value.toLocaleString(lang === "fr" ? "fr-FR" : "en-US")

  const labels =
    lang === "fr"
      ? {
          title: "Candidats parsés",
          hint: "CV uploadés et analysés par Nora",
        }
      : {
          title: "Parsed candidates",
          hint: "CVs uploaded and analyzed by Nora",
        }

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay }}
      style={{
        padding: "16px 18px",
        background: "white",
        border: "1px solid var(--nw-border-soft)",
        borderRadius: 14,
        minWidth: 0,
        height: expanded ? "auto" : 150,
        boxSizing: "border-box",
        alignSelf: "start",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
          color: "var(--nw-primary)",
        }}
      >
        <FileIcon />

        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--nw-text-muted)",
            letterSpacing: "0.06em",
            fontFamily: "var(--nw-font-mono)",
            textTransform: "uppercase",
          }}
        >
          {labels.title}
        </span>
      </div>

      <p
        style={{
          margin: 0,
          fontSize: 32,
          fontWeight: 800,
          color: "var(--nw-text)",
          letterSpacing: "-0.025em",
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {display}
      </p>

      <p
        style={{
          margin: "12px 0 0",
          fontSize: 11.5,
          color: "var(--nw-text-muted)",
          lineHeight: 1.5,
        }}
      >
        {labels.hint}
      </p>

      <button
       type="button"
       onClick={() => setExpanded(!expanded)}
       style={{
        marginTop: 16,
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: "transparent",
        border: "none",
        color: "var(--nw-primary)",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 600,
        padding: 0,
        }}
>
  {lang === "fr" ? "Évolution mensuelle" : "Monthly trend"}
  <span>{expanded ? "▲" : "▼"}</span>
</button>

{expanded && (
  <m.div
    initial={{ opacity: 0, height: 0 }}
    animate={{ opacity: 1, height: "auto" }}
    transition={{ duration: 0.25 }}
    style={{
      overflow: "hidden",
      marginTop: 14,
      paddingTop: 14,
      borderTop: "1px solid var(--nw-border-soft)",
    }}
  >
    <div style={{ width: "100%", height: 110 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data ?? []}>
          <defs>
            <linearGradient
              id="candidateFill"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="5%"
                stopColor="var(--nw-primary)"
                stopOpacity={0.35}
              />
              <stop
                offset="95%"
                stopColor="var(--nw-primary)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11 }}
          />

          <Tooltip cursor={false} />

          <Area
            type="monotone"
            dataKey="count"
            stroke="var(--nw-primary)"
            strokeWidth={3}
            fill="url(#candidateFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </m.div>
)}

      
    </m.div>
  )
}

function PlatformMetric({ 
  label, 
  value, 
}: { 
  label: string 
  value: string 
}) { 
  return ( 
  <div style={{ 
    minWidth: 0, 
    paddingRight: 10, 
    borderRight: "1px solid var(--nw-border-soft)", 
  }} 
  > 
  <p 
    style={{ 
      margin: 0, 
      fontSize: 25, 
      fontWeight: 800, 
      color: "var(--nw-text)", 
      letterSpacing: "-0.025em", 
      lineHeight: 1.1, 
      fontVariantNumeric: "tabular-nums", 
    }} 
    > 
    {value} 
    </p> 
    <p 
    style={{ 
      margin: "6px 0 0", 
      fontSize: 10.5, 
      fontWeight: 700, 
      color: "var(--nw-text-muted)", 
      letterSpacing: "0.05em", 
      fontFamily: "var(--nw-font-mono)", 
      textTransform: "uppercase",
    }} 
    > {
      label} 
      </p> 
      </div> 
    )
}

function OrgTypeRow({
  label,
  value,
}: {
  label: string
  value?: number
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: "var(--nw-text-body)",
        }}
      >
        {label}
      </span>

      <span
        style={{
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value ?? "—"}
      </span>
    </div>
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
    const { lang } = useLanguage()
    const display = value === undefined
      ? "—"
      : typeof value === "number" ? value.toLocaleString(lang === "fr" ? "fr-FR" : "en-US") : value
    return (
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE, delay }}
        style={{
          padding: "16px 18px",
          background: "white",
          border: "1px solid var(--nw-border-soft)",
          borderRadius: 14,
          gridColumn: wide ? "span 2" : undefined,
          minWidth: 0,
          height: 150,
          boxSizing: "border-box",
          alignSelf: "start",
          display: "flex",
          flexDirection: "column",


        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, color: "var(--nw-primary)" }}>
          {icon}
          <span style={{
            fontSize: 11, fontWeight: 700, color: "var(--nw-text-muted)",
            letterSpacing: "0.06em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
          }}>
            {label}
          </span>
        </div>
        <p style={{
          margin: 0, fontSize: 32, fontWeight: 800, color: "var(--nw-text)",
          letterSpacing: "-0.025em", lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
        }}>
          {display}
        </p>
        <p style={{
          margin: "auto 0 0",
          paddingTop: 12,
          fontSize: 11.5,
          color: "var(--nw-text-muted)",
          lineHeight: 1.5,
          }}>
          {hint}
        </p>
      </m.div>
    )
}

/**
 * Seed du catalogue Stripe de TEST, en un clic.
 *
 * La route refuse de tourner ailleurs qu'en mode test, donc ce bouton est
 * inoffensif en prod (il répondra « pas en mode test »). On l'expose ici parce
 * que la route est un POST admin : sans bouton, il faudrait la déclencher à la
 * main depuis une console navigateur, ce qui est une instruction qui rate.
 */
function StripeSeedCard() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const seed = async () => {
    setBusy(true); setResult(null); setFailed(false)
    try {
      const res = await fetch("/api/admin/stripe-seed-test", { method: "POST" })
      const j = await res.json().catch(() => ({} as Record<string, unknown>))
      if (!res.ok) {
        setFailed(true)
        setResult(typeof j.message === "string" ? j.message : `Erreur ${res.status}`)
      } else {
        setResult(typeof j.hint === "string" ? j.hint : "Catalogue de test à jour.")
      }
    } catch {
      setFailed(true)
      setResult("Requête impossible (réseau).")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      marginTop: 32, padding: "16px 18px",
      background: "var(--nw-bg)", border: "1px solid var(--nw-primary-100)", borderRadius: 14,
    }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--nw-text)" }}>
        Catalogue Stripe — mode test
      </p>
      <p style={{ margin: "5px 0 12px", fontSize: 11.5, color: "var(--nw-text-muted)", lineHeight: 1.55 }}>
        Crée les deux prix du plan (<code>sourcing_seat</code> dégressif +{" "}
        <code>pricing_addon</code>) dans le compte de <strong>test</strong>, pour pouvoir
        tester le checkout sur les previews sans paiement réel. Idempotent : sans effet si
        déjà en place. Refuse catégoriquement de toucher au catalogue live.
      </p>
      <button
        type="button"
        onClick={seed}
        disabled={busy}
        style={{
          padding: "9px 15px", borderRadius: 10, border: "none",
          background: "var(--nw-primary)",
          color: "white", fontSize: 12.5, fontWeight: 700,
          cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1,
          fontFamily: "inherit",
        }}
      >
        {busy ? "Création…" : "Créer les prix de test"}
      </button>
      {result && (
        <p style={{
          margin: "10px 0 0", fontSize: 11.5, lineHeight: 1.5,
          color: failed ? "var(--nw-danger-strong)" : "var(--nw-success)",
        }}>
          {result}
        </p>
      )}
    </div>
  )
}




function formatEuros(n: number, lang: "fr" | "en"): string {
  return new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US", {
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


function HourglassIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 3h12M6 21h12" />
      <path d="M6 3c0 4 6 5 6 9 0 4-6 5-6 9" />
      <path d="M18 3c0 4-6 5-6 9 0 4 6 5 6 9" />
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
function EuroIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6.5C16.5 5 14 4 12 4c-4.5 0-7.5 3.5-7.5 8s3 8 7.5 8c2 0 4.5-1 6-2.5" />
      <path d="M3 10h11" />
      <path d="M3 14h11" />
    </svg>
  )
}
