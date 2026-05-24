"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { m, AnimatePresence } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import type { Job, Candidate, MatchAssessment, MatchTier } from "@/lib/database.types"
import NoraLoader from "@/components/workspace/NoraLoader"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

type AssessmentRow = MatchAssessment & { candidate: Candidate | null }

const TIER_META: Record<MatchTier, { label: string; color: string; bg: string; bd: string }> = {
  excellent: { label: "Excellent match", color: "#15803d", bg: "rgba(34,197,94,0.07)", bd: "rgba(34,197,94,0.25)" },
  good:      { label: "Bon match",       color: "#7C63C8", bg: "rgba(124,99,200,0.07)", bd: "rgba(124,99,200,0.22)" },
  fair:      { label: "Match moyen",     color: "#B45309", bg: "rgba(245,158,11,0.07)", bd: "rgba(245,158,11,0.22)" },
  poor:      { label: "Match faible",    color: "#6B7280", bg: "#F9FAFB", bd: "#E5E7EB" },
}
const TIER_ORDER: MatchTier[] = ["excellent", "good", "fair", "poor"]

export default function JobDetailPage() {
  const router = useRouter()
  const { jobId } = useParams<{ jobId: string }>()
  const sb = useMemo(() => getSupabase(), [])

  const [job, setJob] = useState<Job | null>(null)
  const [rows, setRows] = useState<AssessmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [showWeak, setShowWeak] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [briefing, setBriefing] = useState("")
  const [briefingSaving, setBriefingSaving] = useState<"idle" | "saving" | "saved">("idle")

  const loadAll = useCallback(async () => {
    const res = await fetch(`/api/jobs/${jobId}`)
    if (res.status === 404) { setNotFound(true); setLoading(false); return }
    if (!res.ok) { setLoading(false); return }
    const data = await res.json()
    const j = data.job as Job
    setJob(j)
    setBriefing(j.briefing ?? "")
    setRows((data.assessments ?? []) as AssessmentRow[])
    setLoading(false)
  }, [jobId])

  const saveBriefing = async () => {
    if (!job) return
    if ((briefing ?? "") === (job.briefing ?? "")) return
    setBriefingSaving("saving")
    const res = await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ briefing }),
    })
    if (res.ok) {
      setJob((prev) => prev ? { ...prev, briefing } : prev)
      setBriefingSaving("saved")
      setTimeout(() => setBriefingSaving("idle"), 1600)
    } else {
      setBriefingSaving("idle")
    }
  }

  useEffect(() => {
    let mounted = true
    let jobCh: ReturnType<typeof sb.channel> | null = null
    let maCh: ReturnType<typeof sb.channel> | null = null
    ;(async () => {
      await loadAll()
      if (!mounted) return
      jobCh = sb
        .channel(`job:${jobId}`)
        .on("postgres_changes",
          { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${jobId}` },
          (payload) => setJob(payload.new as Job),
        )
        .subscribe()
      maCh = sb
        .channel(`ma:${jobId}`)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "match_assessments", filter: `job_id=eq.${jobId}` },
          () => { loadAll() },
        )
        .subscribe()
    })()
    return () => {
      mounted = false
      if (jobCh) sb.removeChannel(jobCh)
      if (maCh) sb.removeChannel(maCh)
    }
  }, [jobId, sb, loadAll])

  const runMatch = async () => {
    if (!job) return
    setMatchError(null)
    setJob({ ...job, match_status: "matching" })
    const res = await fetch(`/api/jobs/${job.id}/match`, { method: "POST" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMatchError(data?.detail ?? data?.error ?? "Le matching a échoué.")
      setJob((prev) => prev ? { ...prev, match_status: "error" } : prev)
      return
    }
    await loadAll()
  }

  const handleDelete = async () => {
    if (!job) return
    if (!confirm("Supprimer cette mission ? Les matchs associés seront perdus.")) return
    const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" })
    if (res.ok) router.push("/workspace/missions")
  }

  if (loading) return <NoraLoader />
  if (notFound || !job) {
    return (
      <div style={{ padding: "60px 24px", textAlign: "center", color: "#6B7280" }}>
        <p style={{ fontSize: 16, fontWeight: 600 }}>Mission introuvable.</p>
        <Link href="/workspace/missions" style={{ color: "#7C63C8", textDecoration: "none", fontSize: 14 }}>
          ← Retour aux missions
        </Link>
      </div>
    )
  }

  const matching = job.match_status === "matching"
  // Manually assigned matches have score === null. Pinned at the top of
  // the page so the sourcer never loses track of who they pushed in by hand.
  const manualRows = rows
    .filter((r) => r.score == null)
    .sort((a, b) => (a.candidate?.full_name ?? "").localeCompare(b.candidate?.full_name ?? ""))
  const scoredRows = rows.filter((r) => r.score != null)
  const grouped = TIER_ORDER.map((tier) => ({
    tier,
    rows: scoredRows
      .filter((r) => (r.match_tier ?? "poor") === tier)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
  }))
  const strong = grouped.filter((g) => g.tier === "excellent" || g.tier === "good")
  const weak = grouped.filter((g) => g.tier === "fair" || g.tier === "poor")
  const strongCount = strong.reduce((n, g) => n + g.rows.length, 0)
  const weakCount = weak.reduce((n, g) => n + g.rows.length, 0)

  return (
    <main style={{
      padding: "32px 24px 80px", maxWidth: 1040, margin: "0 auto",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      <Link href="/workspace/missions" style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 13, color: "#7C63C8", textDecoration: "none", marginBottom: 22,
      }}>← Retour aux missions</Link>

      {/* Header */}
      <m.section
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        style={{ background: "white", borderRadius: 16, border: "1px solid #F0ECF8", padding: 24, marginBottom: 20 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em" }}>
              {job.title}
            </h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, fontSize: 12, color: "#6B7280" }}>
              {job.location && <Meta>{job.location}</Meta>}
              {job.seniority && <Meta>{job.seniority}</Meta>}
              {job.contract_type && <Meta>{job.contract_type}</Meta>}
            </div>
          </div>
          <button onClick={handleDelete} style={{
            fontSize: 12, fontWeight: 600, color: "#DC2626",
            background: "transparent", border: "1px solid #FCA5A5",
            borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontFamily: "inherit",
          }}>Supprimer</button>
        </div>

        {job.required_skills && job.required_skills.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.07em", textTransform: "uppercase" }}>
              Compétences requises
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {job.required_skills.map((s) => (
                <span key={s} style={{ fontSize: 12, color: "#4B5563", background: "#F8F6FF", border: "1px solid #F0ECF8", padding: "4px 9px", borderRadius: 7 }}>{s}</span>
              ))}
            </div>
          </div>
        )}

        {job.description && (
          <p style={{ margin: "16px 0 0", fontSize: 13.5, color: "#4B5563", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {job.description}
          </p>
        )}

        {/* Briefing / contraintes — injected into matching + compose */}
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#7C63C8", letterSpacing: "0.07em", textTransform: "uppercase" }}>
              Briefing / contraintes
            </p>
            <span style={{ fontSize: 11, color: "#9CA3AF" }}>
              — pris en compte par Nora pour le matching et les messages
            </span>
            {briefingSaving === "saving" && <span style={{ fontSize: 11, color: "#7C63C8", marginLeft: "auto" }}>Enregistrement…</span>}
            {briefingSaving === "saved"   && <span style={{ fontSize: 11, color: "#16a34a", marginLeft: "auto" }}>✓ Sauvegardé</span>}
          </div>
          <textarea
            value={briefing}
            onChange={(e) => setBriefing(e.target.value)}
            onBlur={saveBriefing}
            placeholder="Ex : pas de profils <3 ans XP, démarrage septembre, budget max 55k, pas d'ESN, client préfère un profil hybride Paris…"
            rows={3}
            style={{
              width: "100%", boxSizing: "border-box",
              fontSize: 13, color: "#111827",
              padding: 11,
              background: "#FAFAFA",
              border: "1px solid #F0ECF8", borderRadius: 10,
              outline: "none", resize: "vertical",
              fontFamily: "inherit", lineHeight: 1.6,
            }}
          />
        </div>

        {/* Pricing — paramètres commerciaux entrés à la création.
            Affichage en lecture seule pour V1 ; l'édition inline viendra plus
            tard. Le bloc se rend en jaune amber, cohérent avec le stage Pricing
            et le ruban de l'onglet Pricing. */}
        <MissionPricingBlock
          job={job}
          onPatched={(next) => setJob(next)}
        />

        {/* Match action */}
        <div style={{
          marginTop: 20, paddingTop: 18, borderTop: "1px solid #F0ECF8",
          display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
        }}>
          <button onClick={runMatch} disabled={matching} style={{
            padding: "11px 20px", borderRadius: 11, border: "none",
            background: matching ? "#C4B6E0" : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
            color: "white", fontSize: 13.5, fontWeight: 700,
            cursor: matching ? "default" : "pointer", fontFamily: "inherit",
            boxShadow: matching ? "none" : "0 6px 20px -8px rgba(124,99,200,0.55)",
          }}>
            {matching ? "✦ Matching en cours…" : rows.length > 0 ? "Relancer le matching" : "Matcher le vivier"}
          </button>
          <button onClick={() => setAssignOpen(true)} disabled={matching} style={{
            padding: "10px 16px", borderRadius: 11,
            background: "white", border: "1px solid rgba(124,99,200,0.3)",
            color: "#7C63C8", fontSize: 13, fontWeight: 700,
            cursor: matching ? "default" : "pointer", fontFamily: "inherit",
          }}>
            + Assigner un candidat
          </button>
          <span style={{ fontSize: 12.5, color: "#9CA3AF" }}>
            {matching
              ? "Nora compare votre vivier à la mission…"
              : job.matched_at
                ? `Dernier matching : ${new Date(job.matched_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}`
                : "Lancez le matching pour voir les candidats pertinents."}
          </span>
        </div>
        {matchError && (
          <div style={{
            marginTop: 12, padding: "10px 14px",
            background: "#FEF2F2", border: "1px solid #FECACA",
            borderRadius: 10, fontSize: 13, color: "#B91C1C",
          }}>{matchError}</div>
        )}
      </m.section>

      {/* Results */}
      {rows.length === 0 ? (
        <div style={{
          padding: "56px 24px", textAlign: "center",
          background: "white", border: "1px dashed #E2DAF6", borderRadius: 16,
          color: "#6B7280",
        }}>
          {matching ? (
            <>
              <div style={{ fontSize: 40, marginBottom: 10 }}>✦</div>
              <p style={{ margin: 0, fontSize: 14 }}>Nora analyse votre vivier…</p>
            </>
          ) : (
            <>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🎯</div>
              <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#111827" }}>Aucun candidat matché pour l&apos;instant</p>
              <p style={{ margin: 0, fontSize: 13 }}>Lancez le matching — Nora ne remontera que les profils pertinents.</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 16, fontSize: 13, color: "#6B7280" }}>
            <strong style={{ color: "#111827" }}>{strongCount}</strong> candidat{strongCount > 1 ? "s" : ""} pertinent{strongCount > 1 ? "s" : ""}
            {manualRows.length > 0 && <> · <strong style={{ color: "#7C63C8" }}>{manualRows.length}</strong> assigné{manualRows.length > 1 ? "s" : ""} manuellement</>}
            {weakCount > 0 && <> · {weakCount} autre{weakCount > 1 ? "s" : ""} à plus faible affinité</>}
          </div>

          {/* Manually assigned — always first, no score by definition */}
          {manualRows.length > 0 && (
            <ManualBlock rows={manualRows} />
          )}

          {strong.map((g) => g.rows.length > 0 && (
            <TierBlock key={g.tier} tier={g.tier} rows={g.rows} />
          ))}

          {weakCount > 0 && (
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setShowWeak((v) => !v)} style={{
                fontSize: 12.5, fontWeight: 600, color: "#7C63C8",
                background: "transparent", border: "none", cursor: "pointer",
                padding: "8px 0", fontFamily: "inherit",
              }}>
                {showWeak ? "▾ Masquer" : "▸ Afficher"} les {weakCount} match{weakCount > 1 ? "s" : ""} à plus faible affinité
              </button>
              <AnimatePresence>
                {showWeak && (
                  <m.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
                    {weak.map((g) => g.rows.length > 0 && <TierBlock key={g.tier} tier={g.tier} rows={g.rows} />)}
                  </m.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </>
      )}

      {assignOpen && (
        <AssignModal
          jobId={job.id}
          existingCandidateIds={new Set(rows.map((r) => r.candidate?.id).filter((x): x is string => !!x))}
          onClose={() => setAssignOpen(false)}
          onAssigned={() => { setAssignOpen(false); loadAll() }}
        />
      )}
    </main>
  )
}

/* ─── Assign modal ─────────────────────────────────────────────── */

function AssignModal({
  jobId, existingCandidateIds, onClose, onAssigned,
}: {
  jobId: string
  existingCandidateIds: Set<string>
  onClose: () => void
  onAssigned: () => void
}) {
  const sb = useMemo(() => getSupabase(), [])
  const [query, setQuery] = useState("")
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await sb
        .from("candidates")
        .select("id, full_name, current_title, current_company, cv_file_name, location, seniority_level")
        .eq("parse_status", "parsed")
        .order("created_at", { ascending: false })
        .limit(200)
      if (!mounted) return
      setCandidates((data ?? []) as unknown as Candidate[])
      setLoadingList(false)
    })()
    return () => { mounted = false }
  }, [sb])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return candidates
      .filter((c) => !existingCandidateIds.has(c.id))
      .filter((c) => {
        if (!q) return true
        const hay = [c.full_name, c.current_title, c.current_company, c.location, c.cv_file_name]
          .filter(Boolean).join(" ").toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 50)
  }, [candidates, query, existingCandidateIds])

  const assign = async (candidateId: string) => {
    setAssigning(candidateId); setErr(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: candidateId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(data?.detail ?? data?.error ?? "L'assignation a échoué.")
        setAssigning(null)
        return
      }
      onAssigned()
    } catch (e) {
      setErr((e as Error).message ?? "Erreur réseau.")
      setAssigning(null)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(17,24,39,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white", borderRadius: 16,
          width: "100%", maxWidth: 560,
          maxHeight: "85vh", display: "flex", flexDirection: "column",
          boxShadow: "0 24px 60px rgba(17,24,39,0.25)",
        }}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #F0ECF8" }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Assigner manuellement
          </p>
          <h3 style={{ margin: "4px 0 10px", fontSize: 17, fontWeight: 800, color: "#111827" }}>
            Choisir un candidat
          </h3>
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher par nom, poste, entreprise…"
            style={{
              width: "100%", boxSizing: "border-box",
              fontSize: 13.5, color: "#111827", padding: "10px 12px",
              background: "#FAFAFA", border: "1px solid #E5E7EB", borderRadius: 10,
              outline: "none", fontFamily: "inherit",
            }}
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
          {loadingList ? (
            <div style={{ padding: 20 }}><NoraLoader inline /></div>
          ) : filtered.length === 0 ? (
            <p style={{ padding: 20, fontSize: 13, color: "#9CA3AF", textAlign: "center" }}>
              {query ? "Aucun candidat ne correspond." : "Tous les candidats du vivier sont déjà matchés."}
            </p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => assign(c.id)}
                disabled={assigning !== null}
                style={{
                  width: "100%", textAlign: "left",
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px", borderRadius: 10,
                  background: "transparent", border: "1px solid transparent",
                  cursor: assigning === c.id ? "default" : "pointer",
                  fontFamily: "inherit",
                  opacity: assigning && assigning !== c.id ? 0.4 : 1,
                }}
                onMouseEnter={(e) => { if (!assigning) e.currentTarget.style.background = "#F8F6FF" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.full_name ?? c.cv_file_name ?? "Sans nom"}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.current_title ?? "—"}
                    {c.current_company ? ` · ${c.current_company}` : ""}
                    {c.location ? ` · ${c.location}` : ""}
                  </p>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: "#7C63C8",
                  background: "rgba(124,99,200,0.08)",
                  border: "1px solid rgba(124,99,200,0.18)",
                  borderRadius: 8, padding: "4px 10px",
                  flexShrink: 0,
                }}>
                  {assigning === c.id ? "…" : "Assigner"}
                </span>
              </button>
            ))
          )}
        </div>
        {err && (
          <div style={{ padding: "10px 16px", fontSize: 12.5, color: "#B91C1C", background: "#FEF2F2", borderTop: "1px solid #FECACA" }}>
            {err}
          </div>
        )}
        <div style={{ padding: "12px 16px", borderTop: "1px solid #F0ECF8", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            fontSize: 12.5, fontWeight: 700, color: "#6B7280",
            background: "white", border: "1px solid #E5E7EB",
            borderRadius: 9, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit",
          }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Tier block ───────────────────────────────────────────────── */

function TierBlock({ tier, rows }: { tier: MatchTier; rows: AssessmentRow[] }) {
  const meta = TIER_META[tier]
  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{
          fontSize: 11, fontWeight: 800, color: meta.color,
          letterSpacing: "0.04em", textTransform: "uppercase",
        }}>{meta.label}</span>
        <span style={{ fontSize: 11, color: "#9CA3AF" }}>· {rows.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r, i) => <MatchRow key={r.id} row={r} tier={tier} delay={Math.min(i * 0.03, 0.2)} />)}
      </div>
    </section>
  )
}

function MatchRow({ row, tier, delay }: { row: AssessmentRow; tier: MatchTier; delay: number }) {
  const meta = TIER_META[tier]
  const c = row.candidate
  const name = c?.full_name ?? c?.cv_file_name ?? "Candidat"
  const initials = name.split(/\s+/).slice(0, 2).map((s) => s[0] ?? "").join("").toUpperCase() || "?"

  return (
    <m.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: EASE }}
      style={{
        background: meta.bg, border: `1px solid ${meta.bd}`,
        borderRadius: 13, padding: "14px 16px",
        display: "flex", gap: 14, alignItems: "flex-start",
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
        background: "white", border: `1px solid ${meta.bd}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: meta.color, fontWeight: 800, fontSize: 13,
      }}>{initials}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: "#111827" }}>{name}</p>
          <span style={{
            fontSize: 12, fontWeight: 800, color: meta.color,
            background: "white", border: `1px solid ${meta.bd}`,
            padding: "1px 8px", borderRadius: 100,
          }}>{row.score ?? "—"}</span>
        </div>
        {c?.current_title && (
          <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#6B7280" }}>
            {c.current_title}{c.current_company ? ` · ${c.current_company}` : ""}
          </p>
        )}
        {row.justification && (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "#4B5563", lineHeight: 1.6 }}>
            {row.justification}
          </p>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end", flexShrink: 0, alignSelf: "center" }}>
        <Link href={`/workspace/match/${row.id}`} style={{
          fontSize: 12, fontWeight: 700, color: "white",
          padding: "6px 12px", borderRadius: 8,
          background: `linear-gradient(120deg, ${meta.color} 0%, ${meta.color} 100%)`,
          textDecoration: "none",
        }}>
          Ouvrir ▶
        </Link>
        {c && (
          <Link href={`/workspace/vivier/${c.id}`} title="Fiche candidat (identité)" style={{
            fontSize: 11, color: "#9CA3AF", textDecoration: "none",
          }}>
            👤 Fiche
          </Link>
        )}
      </div>
    </m.div>
  )
}

/* ─── Manual block ─────────────────────────────────────────────── */

function ManualBlock({ rows }: { rows: AssessmentRow[] }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{
          fontSize: 11, fontWeight: 800, color: "#7C63C8",
          letterSpacing: "0.04em", textTransform: "uppercase",
        }}>
          ✋ Assignés manuellement
        </span>
        <span style={{ fontSize: 11, color: "#9CA3AF" }}>· {rows.length}</span>
        <span style={{ fontSize: 11, color: "#9CA3AF", fontStyle: "italic" }}>
          — en dehors du matching auto
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r) => {
          const c = r.candidate
          const name = c?.full_name ?? c?.cv_file_name ?? "Candidat"
          const init = name.split(/\s+/).slice(0, 2).map((s) => s[0] ?? "").join("").toUpperCase() || "?"
          return (
            <div key={r.id} style={{
              background: "rgba(124,99,200,0.07)",
              border: "1px solid rgba(124,99,200,0.25)",
              borderRadius: 13, padding: "14px 16px",
              display: "flex", gap: 14, alignItems: "flex-start",
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                background: "white", border: "1px solid rgba(124,99,200,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#7C63C8", fontWeight: 800, fontSize: 13,
              }}>{init}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: "#111827" }}>{name}</p>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: "#7C63C8",
                    background: "white", border: "1px solid rgba(124,99,200,0.25)",
                    padding: "1px 8px", borderRadius: 100,
                  }}>Manuel</span>
                </div>
                {c?.current_title && (
                  <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#6B7280" }}>
                    {c.current_title}{c.current_company ? ` · ${c.current_company}` : ""}
                  </p>
                )}
                {r.justification && (
                  <p style={{ margin: "8px 0 0", fontSize: 13, color: "#4B5563", lineHeight: 1.6 }}>
                    {r.justification}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end", flexShrink: 0, alignSelf: "center" }}>
                <Link href={`/workspace/match/${r.id}`} style={{
                  fontSize: 12, fontWeight: 700, color: "white",
                  padding: "6px 12px", borderRadius: 8,
                  background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                  textDecoration: "none",
                }}>
                  Ouvrir ▶
                </Link>
                {c && (
                  <Link href={`/workspace/vivier/${c.id}`} title="Fiche candidat (identité)" style={{
                    fontSize: 11, color: "#9CA3AF", textDecoration: "none",
                  }}>
                    👤 Fiche
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ background: "#F9FAFB", border: "1px solid #F0ECF8", padding: "3px 8px", borderRadius: 6 }}>
      {children}
    </span>
  )
}

/* ───────────────────────── Pricing inline editor ─────────────────────────
 * Inline-editable pricing inputs directly on the mission detail page.
 * Auto-save debounced (800 ms) so the sourceur doesn't have to click
 * any save button — the badge confirms persistence. Calls back to the
 * parent so the cached `job` state stays in sync after each save.
 */
function MissionPricingBlock({
  job,
  onPatched,
}: {
  job: Job
  onPatched: (next: Job) => void
}) {
  // String values keep intermediate edits typeable (e.g. "5." before "5.5").
  // Empty string = field cleared = null in DB.
  const numToStr = (n: number | null | undefined): string =>
    n == null ? "" : String(n)

  const [tjmMin, setTjmMin] = useState<string>(numToStr(job.client_tjm_min))
  const [tjmMax, setTjmMax] = useState<string>(numToStr(job.client_tjm_max))
  const [duration, setDuration] = useState<string>(numToStr(job.duration_months))
  const [targetGross, setTargetGross] = useState<string>(numToStr(job.target_gross_salary))
  const [startDate, setStartDate] = useState<string>(job.start_date ?? "")
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const saveTimerRef = useRef<number | null>(null)

  const parseNum = (s: string): number | null => {
    if (!s.trim()) return null
    const n = Number(s.replace(",", "."))
    return Number.isFinite(n) ? n : null
  }

  const schedulePatch = useCallback(
    (patch: Partial<Job>) => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
      setSaveState("saving")
      saveTimerRef.current = window.setTimeout(async () => {
        const res = await fetch(`/api/jobs/${job.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        })
        if (res.ok) {
          const data = await res.json()
          const next = data.job as Job
          onPatched(next)
          setSaveState("saved")
          window.setTimeout(() => setSaveState("idle"), 1800)
        } else {
          setSaveState("error")
        }
      }, 800)
    },
    [job.id, onPatched],
  )

  const updateField = useCallback(
    (key: keyof Job, raw: string, setter: (s: string) => void) => {
      setter(raw)
      schedulePatch({ [key]: parseNum(raw) } as Partial<Job>)
    },
    [schedulePatch],
  )

  return (
    <div style={{
      marginTop: 18,
      background: "rgba(217,119,6,0.04)",
      border: "1px solid rgba(217,119,6,0.20)",
      borderRadius: 12, padding: 14,
    }}>
      <div style={{
        display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12,
        flexWrap: "wrap", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <p style={{
            margin: 0, fontSize: 11, fontWeight: 700, color: "#B45309",
            letterSpacing: "0.07em", textTransform: "uppercase",
          }}>
            💰 Pricing
          </p>
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>
            — édition en direct, sauvegarde automatique
          </span>
        </div>
        <SaveBadge state={saveState} />
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 10,
      }}>
        <PricingField
          label="TJM client min"
          value={tjmMin}
          onChange={(v) => updateField("client_tjm_min", v, setTjmMin)}
          suffix="€/j"
          placeholder="500"
        />
        <PricingField
          label="TJM client max"
          value={tjmMax}
          onChange={(v) => updateField("client_tjm_max", v, setTjmMax)}
          suffix="€/j"
          placeholder="650"
        />
        <PricingField
          label="Durée prévue"
          value={duration}
          onChange={(v) => updateField("duration_months", v, setDuration)}
          suffix="mois"
          placeholder="12"
          max={120}
        />
        <PricingField
          label="Brut annuel ciblé"
          value={targetGross}
          onChange={(v) => updateField("target_gross_salary", v, setTargetGross)}
          suffix="€/an"
          placeholder="45000"
          step={500}
        />
        <label style={{
          background: "white", border: "1px solid rgba(217,119,6,0.18)",
          borderRadius: 9, padding: "8px 11px",
          display: "flex", flexDirection: "column", gap: 4, cursor: "text",
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: "#92400E",
            letterSpacing: "0.05em", textTransform: "uppercase",
          }}>
            Démarrage prévu
          </span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              const v = e.target.value
              setStartDate(v)
              schedulePatch({ start_date: v || null })
            }}
            style={{
              width: "100%", minWidth: 0,
              fontSize: 13, fontWeight: 700, color: "#111827",
              background: "transparent", border: "none", outline: "none",
              padding: 0, fontFamily: "inherit",
            }}
          />
        </label>
      </div>
    </div>
  )
}

function PricingField({
  label, value, onChange, suffix, placeholder, max, step,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  suffix: string
  placeholder?: string
  max?: number
  step?: number
}) {
  return (
    <label style={{
      background: "white", border: "1px solid rgba(217,119,6,0.18)",
      borderRadius: 9, padding: "8px 11px",
      display: "flex", flexDirection: "column", gap: 4,
      cursor: "text",
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, color: "#92400E",
        letterSpacing: "0.05em", textTransform: "uppercase",
      }}>
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step={step ?? 1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1, minWidth: 0,
            fontSize: 13.5, fontWeight: 700, color: "#111827",
            background: "transparent", border: "none", outline: "none",
            padding: 0, fontFamily: "inherit",
            fontVariantNumeric: "tabular-nums",
            appearance: "textfield",
          }}
        />
        <span style={{ fontSize: 11, color: "#9CA3AF", flexShrink: 0 }}>
          {suffix}
        </span>
      </div>
    </label>
  )
}

function SaveBadge({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "idle") return null
  const styles: Record<string, React.CSSProperties> = {
    saving: { background: "#F3F4F6", color: "#6B7280" },
    saved: { background: "rgba(34,197,94,0.10)", color: "#16a34a", border: "1px solid rgba(34,197,94,0.22)" },
    error: { background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA" },
  }
  return (
    <div style={{
      ...styles[state],
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 100,
    }}>
      {state === "saving" ? "Enregistrement…"
        : state === "saved" ? "✓ Enregistré"
        : "⚠ Erreur"}
    </div>
  )
}
