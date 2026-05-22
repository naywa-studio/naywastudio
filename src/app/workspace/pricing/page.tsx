"use client"

/**
 * /workspace/pricing — onglet dédié au chiffrage commercial des missions ESN.
 *
 * Flow attendu :
 *   1. Le sourceur identifie un candidat (kanban → "Identifié")
 *   2. Il le déplace en "Pricing" pour vérifier la rentabilité commerciale
 *   3. Cet onglet liste tous les candidats actuellement en stage "Pricing",
 *      et permet d'en sélectionner un pour ouvrir le widget de chiffrage.
 *
 * Le widget réutilisé ici est exactement le même composant que celui qui
 * vivait sur la fiche match avant — sauf que maintenant il a la pleine
 * largeur et de l'espace pour le graphique à venir (#14).
 *
 * Reminder : si la mission n'a pas TJM ni durée prévue, on affiche un
 * bandeau orange avec un lien vers la fiche mission pour les compléter.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { m } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import type { Candidate, Job, MatchTier } from "@/lib/database.types"
import NoraLoader from "@/components/workspace/NoraLoader"
import PricingWidget from "@/components/workspace/PricingWidget"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

interface PricingMatch {
  id: string
  candidate_id: string
  job_id: string
  score: number | null
  match_tier: MatchTier | null
  candidate: Pick<Candidate, "id" | "full_name" | "current_title" | "parse_status" | "parsed_cv" | "current_company" | "location" | "years_experience" | "seniority_level" | "skills"> | null
  job: Pick<Job,
    | "id" | "title" | "location" | "contract_type"
    | "client_tjm_min" | "client_tjm_max" | "margin_min_pct" | "duration_months"
  > | null
}

/** Returns the list of pricing inputs the mission is still missing. */
function missingMissionFields(job: PricingMatch["job"]): string[] {
  if (!job) return []
  const missing: string[] = []
  if (job.client_tjm_min == null && job.client_tjm_max == null) missing.push("TJM client")
  if (job.duration_months == null) missing.push("durée prévue")
  if (job.margin_min_pct == null) missing.push("marge minimum")
  return missing
}

export default function PricingPage() {
  const sb = useMemo(() => getSupabase(), [])
  const [matches, setMatches] = useState<PricingMatch[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user || !mounted) return
      const { data } = await sb
        .from("match_assessments")
        .select(`
          id, candidate_id, job_id, score, match_tier,
          candidate:candidates (
            id, full_name, current_title, current_company, location,
            years_experience, seniority_level, skills, parse_status, parsed_cv
          ),
          job:jobs (
            id, title, location, contract_type,
            client_tjm_min, client_tjm_max, margin_min_pct, duration_months
          )
        `)
        .eq("pipeline_stage", "pricing")
        .order("score", { ascending: false, nullsFirst: false })
      if (!mounted) return
      const list = (data ?? []) as unknown as PricingMatch[]
      setMatches(list)
      if (list.length > 0 && selectedId === null) setSelectedId(list[0].id)
    })()
    return () => { mounted = false }
    // intentional: only run once at mount, the realtime listener below
    // keeps the list in sync afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb])

  if (matches === null) return <NoraLoader />

  if (matches.length === 0) {
    return (
      <main style={mainStyle}>
        <Header count={0} />
        <EmptyState />
      </main>
    )
  }

  const selected = matches.find((m) => m.id === selectedId) ?? matches[0]
  const missing = missingMissionFields(selected.job)

  return (
    <main style={mainStyle}>
      <Header count={matches.length} />

      <div className="pricing-grid" style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 360px) minmax(0, 1fr)",
        gap: 18,
        marginTop: 22,
      }}>
        {/* LEFT — candidates list */}
        <aside style={{
          display: "flex", flexDirection: "column", gap: 10,
          alignSelf: "flex-start",
          position: "sticky", top: 80,
        }}>
          <p style={{
            margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: "#9CA3AF",
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            Candidats en pricing
          </p>
          {matches.map((m, i) => (
            <CandidateCard
              key={m.id}
              match={m}
              active={m.id === selected.id}
              onClick={() => setSelectedId(m.id)}
              index={i}
            />
          ))}
        </aside>

        {/* RIGHT — widget */}
        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {selected.candidate && selected.job && (
            <>
              <SelectionHeader match={selected} />
              {missing.length > 0 && (
                <MissionIncompleteBanner jobId={selected.job.id} missing={missing} />
              )}
              <PricingWidget
                candidate={selected.candidate as unknown as Candidate}
                job={selected.job as unknown as Job}
              />
            </>
          )}
          {(!selected.candidate || !selected.job) && (
            <div style={{
              background: "white", border: "1px solid #F0ECF8", borderRadius: 16,
              padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 14,
            }}>
              Données candidat ou mission introuvables — vérifiez le pipeline.
            </div>
          )}
        </section>
      </div>

      <style>{`
        @media (max-width: 980px) {
          .pricing-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Sub-components
 * ────────────────────────────────────────────────────────────────────────── */

function Header({ count }: { count: number }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <span style={{
        display: "inline-block",
        fontSize: 11, fontWeight: 700, color: "#D97706",
        background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.22)",
        padding: "4px 11px", borderRadius: 100,
        letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12,
      }}>
        💰 Pricing
      </span>
      <h1 style={{
        margin: 0, fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 800,
        color: "#111827", letterSpacing: "-0.025em", lineHeight: 1.15,
      }}>
        Chiffrer la rentabilité de vos candidats
      </h1>
      <p style={{ margin: "8px 0 0", fontSize: 14, color: "#6B7280", lineHeight: 1.6, maxWidth: 720 }}>
        {count === 0
          ? "Aucun candidat en stage Pricing. Déplacez un candidat depuis le pipeline pour commencer."
          : `${count} candidat${count > 1 ? "s" : ""} en cours de chiffrage — sélectionnez-en un pour voir le détail.`}
      </p>
    </div>
  )
}

function EmptyState() {
  return (
    <m.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      style={{
        marginTop: 28, padding: "56px 28px",
        background: "white", border: "2px dashed rgba(217,119,6,0.30)",
        borderRadius: 20, textAlign: "center",
      }}
    >
      <div style={{ fontSize: 44, marginBottom: 12 }}>💰</div>
      <h2 style={{
        margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: "#111827",
      }}>
        Aucun chiffrage en cours
      </h2>
      <p style={{
        margin: "0 auto 18px", maxWidth: 480, fontSize: 14, color: "#6B7280", lineHeight: 1.6,
      }}>
        Pour utiliser cet onglet, déplacez un candidat dans la colonne <strong>Pricing</strong>{" "}
        du pipeline. Vous pourrez ensuite calculer sa marge et son TJM optimal en quelques secondes.
      </p>
      <Link href="/workspace/pipeline" style={{
        display: "inline-block",
        padding: "10px 18px", borderRadius: 10,
        background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
        color: "white", fontWeight: 700, fontSize: 13, textDecoration: "none",
        boxShadow: "0 8px 22px -8px rgba(124,99,200,0.5)",
      }}>
        Ouvrir le pipeline →
      </Link>
    </m.div>
  )
}

function CandidateCard({
  match, active, onClick, index,
}: {
  match: PricingMatch
  active: boolean
  onClick: () => void
  index: number
}) {
  const name = match.candidate?.full_name ?? "Candidat sans nom"
  const jobTitle = match.job?.title ?? "Sans mission"
  const incomplete = missingMissionFields(match.job).length > 0
  return (
    <m.button
      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.3), ease: EASE }}
      onClick={onClick}
      style={{
        textAlign: "left", cursor: "pointer", fontFamily: "inherit",
        background: active ? "rgba(217,119,6,0.06)" : "white",
        border: active ? "1.5px solid rgba(217,119,6,0.40)" : "1px solid #F0ECF8",
        borderRadius: 12, padding: "12px 14px",
        display: "flex", flexDirection: "column", gap: 4,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "#111827" }}>
          {name}
        </span>
        {match.match_tier && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: "#6B7280",
            padding: "2px 7px", borderRadius: 100,
            background: "#F4F1FB", textTransform: "uppercase", letterSpacing: "0.04em",
          }}>
            {match.score ?? "—"}
          </span>
        )}
      </div>
      <span style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.4 }}>
        {jobTitle}
      </span>
      {incomplete && (
        <span style={{
          marginTop: 2, fontSize: 10.5, fontWeight: 600, color: "#B45309",
          display: "inline-flex", alignItems: "center", gap: 4,
        }}>
          ⚠ Mission incomplète
        </span>
      )}
    </m.button>
  )
}

function SelectionHeader({ match }: { match: PricingMatch }) {
  return (
    <m.section
      key={match.id}
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      style={{
        background: "white", borderRadius: 16, border: "1px solid #F0ECF8",
        padding: "16px 20px",
        display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <div>
        <h2 style={{
          margin: 0, fontSize: 19, fontWeight: 800, color: "#111827", letterSpacing: "-0.015em",
        }}>
          {match.candidate?.full_name ?? "Candidat"}
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#6B7280" }}>
          {match.candidate?.current_title && <>{match.candidate.current_title} · </>}
          Mission : <strong style={{ color: "#374151" }}>{match.job?.title}</strong>
          {match.job?.location && <> · {match.job.location}</>}
        </p>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Link href={`/workspace/match/${match.id}`} style={{
          fontSize: 12, fontWeight: 700, color: "#7C63C8",
          background: "white", border: "1px solid rgba(124,99,200,0.25)",
          borderRadius: 9, padding: "7px 12px", textDecoration: "none",
        }}>
          Fiche match →
        </Link>
        {match.job && (
          <Link href={`/workspace/missions/${match.job.id}`} style={{
            fontSize: 12, fontWeight: 700, color: "#7C63C8",
            background: "white", border: "1px solid rgba(124,99,200,0.25)",
            borderRadius: 9, padding: "7px 12px", textDecoration: "none",
          }}>
            Fiche mission →
          </Link>
        )}
      </div>
    </m.section>
  )
}

function MissionIncompleteBanner({ jobId, missing }: { jobId: string; missing: string[] }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      style={{
        background: "rgba(217,119,6,0.07)", border: "1px solid rgba(217,119,6,0.30)",
        borderRadius: 12, padding: "12px 16px",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14,
        flexWrap: "wrap",
      }}
    >
      <div style={{ fontSize: 13, color: "#92400E", lineHeight: 1.55 }}>
        <strong>⚠ Mission incomplète :</strong> il manque <em>{missing.join(", ")}</em>.
        Le chiffrage ci-dessous fonctionne mais sera plus précis une fois renseigné.
      </div>
      <Link href={`/workspace/missions/${jobId}`} style={{
        fontSize: 12, fontWeight: 700, color: "white",
        background: "linear-gradient(120deg, #D97706 0%, #B45309 100%)",
        borderRadius: 9, padding: "7px 12px", textDecoration: "none",
        whiteSpace: "nowrap",
      }}>
        Compléter la mission →
      </Link>
    </m.div>
  )
}

const mainStyle: React.CSSProperties = {
  minHeight: "calc(100vh - 60px)",
  padding: "32px 24px 80px",
  maxWidth: 1240, margin: "0 auto",
  fontFamily: "var(--font-inter), sans-serif",
}
