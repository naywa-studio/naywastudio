"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { m, AnimatePresence } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import { CANDIDATE_COLUMNS, type Candidate, type ParsedCv, type EmailMessage, type MatchTier } from "@/lib/database.types"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

interface JobMatch {
  id: string                  // match_assessment id
  job_id: string
  job_title: string
  score: number | null
  match_tier: MatchTier | null
}

export default function CandidatePage() {
  const router = useRouter()
  const { candidateId } = useParams<{ candidateId: string }>()
  const sb = useMemo(() => getSupabase(), [])

  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [notes, setNotes] = useState("")
  const [savingNotes, setSavingNotes] = useState<"idle" | "saving" | "saved">("idle")

  // Anonymisation
  const [anonState, setAnonState] = useState<"idle" | "working" | "ready" | "error">("idle")
  const [anonUrl, setAnonUrl] = useState<string | null>(null)
  const [anonError, setAnonError] = useState<string | null>(null)

  // Job matches + active selection — drives compose AND anonymize.
  const [jobMatches, setJobMatches] = useState<JobMatch[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string>("")

  const notesRef = useRef(notes)
  useEffect(() => { notesRef.current = notes }, [notes])

  useEffect(() => {
    let mounted = true
    let channel: ReturnType<typeof sb.channel> | null = null

    ;(async () => {
      const { data, error } = await sb
        .from("candidates")
        .select(CANDIDATE_COLUMNS)
        .eq("id", candidateId)
        .single()
      if (!mounted) return
      if (error || !data) { setNotFound(true); setLoading(false); return }
      const c = data as unknown as Candidate
      setCandidate(c)
      setNotes(c.notes ?? "")
      setLoading(false)

      // Mark consulted — fire and forget.
      sb.from("candidates").update({ consulted_at: new Date().toISOString() }).eq("id", c.id).then(() => {})

      const tasks: Promise<void>[] = []

      if (c.cv_file_path) {
        tasks.push((async () => {
          const r = await fetch(`/api/cv/${c.id}/signed-url`)
          if (r.ok) { const j = await r.json(); if (mounted) setSignedUrl(j.url) }
        })())
      }
      if (c.anonymized_pdf_path) {
        tasks.push((async () => {
          const r = await fetch(`/api/cv/${c.id}/anonymize`)
          if (r.ok) { const j = await r.json(); if (mounted && j.url) { setAnonUrl(j.url); setAnonState("ready") } }
        })())
      }
      tasks.push((async () => {
        const { data: matches } = await sb
          .from("match_assessments")
          .select("id, job_id, score, match_tier, job:jobs(id, title)")
          .eq("candidate_id", c.id)
          .order("score", { ascending: false })
        if (!mounted || !matches) return
        const seen = new Set<string>()
        const out: JobMatch[] = []
        for (const m of matches as unknown as Array<{
          id: string; job_id: string; score: number | null; match_tier: MatchTier | null
          job: { id: string; title: string } | null
        }>) {
          if (!m.job || seen.has(m.job.id)) continue
          seen.add(m.job.id)
          out.push({
            id: m.id, job_id: m.job.id, job_title: m.job.title,
            score: m.score, match_tier: m.match_tier,
          })
        }
        setJobMatches(out)
        // Auto-select last-used job from outreach_meta, else best match.
        const lastJobId = c.outreach_meta?.job_id ?? null
        const initial = lastJobId && out.find((j) => j.job_id === lastJobId) ? lastJobId : (out[0]?.job_id ?? "")
        setSelectedJobId(initial)
      })())

      void Promise.allSettled(tasks)

      channel = sb
        .channel(`candidate:${c.id}`)
        .on("postgres_changes",
          { event: "UPDATE", schema: "public", table: "candidates", filter: `id=eq.${c.id}` },
          (payload) => {
            setCandidate((prev) => prev
              ? { ...prev, ...(payload.new as Partial<Candidate>) } as Candidate
              : (payload.new as Candidate))
          },
        )
        .subscribe()
    })()

    return () => {
      mounted = false
      if (channel) sb.removeChannel(channel)
    }
  }, [candidateId, sb])

  const saveNotes = async () => {
    if (!candidate) return
    if ((notesRef.current ?? "") === (candidate.notes ?? "")) return
    setSavingNotes("saving")
    await sb.from("candidates").update({ notes: notesRef.current }).eq("id", candidate.id)
    setSavingNotes("saved")
    setTimeout(() => setSavingNotes("idle"), 1600)
  }

  const handleDelete = async () => {
    if (!candidate) return
    if (!confirm("Supprimer ce candidat ? Cette action est définitive.")) return
    const res = await fetch(`/api/cv/${candidate.id}`, { method: "DELETE" })
    if (res.ok) router.push("/workspace/vivier")
  }

  const handleRetryParse = async () => {
    if (!candidate) return
    setCandidate((prev) => prev ? { ...prev, parse_status: "parsing", parse_error: null } : prev)
    await fetch(`/api/cv/${candidate.id}/parse`, { method: "POST" }).catch(() => {})
  }

  const handleAnonymize = async () => {
    if (!candidate) return
    setAnonState("working"); setAnonError(null)
    try {
      const res = await fetch(`/api/cv/${candidate.id}/anonymize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: selectedJobId || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setAnonError(data?.message ?? data?.error ?? "Échec de l'anonymisation.")
        setAnonState("error")
        return
      }
      setAnonUrl(data.url ?? null)
      setAnonState("ready")
    } catch (err) {
      setAnonError((err as Error).message ?? "Erreur réseau.")
      setAnonState("error")
    }
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: "center", color: "#9CA3AF" }}>Chargement…</div>
  }
  if (notFound || !candidate) {
    return (
      <div style={{ padding: "60px 24px", textAlign: "center", color: "#6B7280" }}>
        <p style={{ fontSize: 16, fontWeight: 600 }}>Candidat introuvable.</p>
        <Link href="/workspace/vivier" style={{ color: "#7C63C8", textDecoration: "none", fontSize: 14 }}>
          ← Retour au vivier
        </Link>
      </div>
    )
  }

  const cv = candidate.parsed_cv ?? null
  const selectedJob = jobMatches.find((j) => j.job_id === selectedJobId) ?? null

  return (
    <main style={{
      padding: "32px 24px 80px",
      maxWidth: 1400, margin: "0 auto",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      <Link href="/workspace/vivier" style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 13, color: "#7C63C8", textDecoration: "none",
        marginBottom: 22,
      }}>
        ← Retour au vivier
      </Link>

      <m.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="cand-grid"
      >
        {/* ─── LEFT: parsed CV sections ─── */}
        <div className="cand-parsed" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Header */}
          <section style={{
            background: "white", borderRadius: 18, border: "1px solid #F0ECF8",
            padding: 24,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "linear-gradient(135deg, #F0ECF8 0%, #E2DAF6 100%)",
                color: "#7C63C8", fontSize: 18, fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {initials(candidate.full_name ?? candidate.cv_file_name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em" }}>
                  {candidate.full_name ?? "Nom à compléter"}
                </h1>
                <p style={{ margin: "4px 0 0", fontSize: 14, color: "#6B7280" }}>
                  {candidate.current_title ?? "—"}
                  {candidate.current_company ? <> · <span>{candidate.current_company}</span></> : null}
                </p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <ProfileButton href={candidate.linkedin_url ?? cv?.linkedin_url ?? null} brand="linkedin" />
                <ProfileButton href={cv?.github_url ?? null} brand="github" />
                <ProfileButton href={cv?.malt_url ?? null} brand="malt" />
                <ProfileButton href={cv?.portfolio_url ?? null} brand="portfolio" />
              </div>
              <button
                onClick={handleDelete}
                style={{
                  fontSize: 12, fontWeight: 600, color: "#DC2626",
                  background: "transparent", border: "1px solid #FCA5A5",
                  borderRadius: 8, padding: "7px 14px", cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Supprimer
              </button>
            </div>

            {candidate.parse_status === "error" && (
              <div style={{
                marginTop: 16, padding: "12px 14px",
                background: "#FEF2F2", border: "1px solid #FECACA",
                borderRadius: 10, fontSize: 13, color: "#B91C1C",
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap",
              }}>
                <span><strong>Parsing échoué.</strong> {candidate.parse_error}</span>
                <button
                  onClick={handleRetryParse}
                  style={{
                    fontSize: 12, fontWeight: 700, color: "white",
                    background: "#DC2626", border: "none",
                    borderRadius: 8, padding: "7px 14px", cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Relancer le parsing
                </button>
              </div>
            )}
            {(candidate.parse_status === "parsing" || candidate.parse_status === "pending") && (
              <div style={{
                marginTop: 16, padding: "10px 14px",
                background: "rgba(124,99,200,0.06)", border: "1px solid rgba(124,99,200,0.18)",
                borderRadius: 10, fontSize: 13, color: "#7C63C8",
              }}>
                ✦ Nora est en train d&apos;analyser le CV…
              </div>
            )}

            <div style={{
              marginTop: 18, display: "flex", flexWrap: "wrap", gap: 14,
              fontSize: 13, color: "#374151",
            }}>
              <InfoChip label="Email"        value={candidate.email} />
              <InfoChip label="Téléphone"    value={candidate.phone} />
              <InfoChip label="Localisation" value={candidate.location} />
              <InfoChip label="Expérience"   value={candidate.years_experience != null ? `${candidate.years_experience} ans` : null} />
              <InfoChip
                label="Séniorité"
                value={candidate.seniority_level
                  ? cv?.seniority_role
                    ? `${candidate.seniority_level} · ${cv.seniority_role}`
                    : candidate.seniority_level
                  : null}
              />
            </div>

            <CvHealthBar cv={cv} />

            {candidate.parse_status === "parsed" && (
              <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={handleRetryParse}
                  title="Re-soumettre le CV au parsing — utile après une mise à jour de l'analyse Nora"
                  style={{
                    fontSize: 11.5, fontWeight: 600, color: "#7C63C8",
                    background: "transparent", border: "1px solid rgba(124,99,200,0.3)",
                    borderRadius: 8, padding: "5px 11px", cursor: "pointer",
                    fontFamily: "inherit",
                    display: "inline-flex", alignItems: "center", gap: 5,
                  }}
                >
                  ⟳ Relancer le parsing
                </button>
              </div>
            )}
          </section>

          {/* Parsed CV sections */}
          <section style={{
            background: "white", borderRadius: 18, border: "1px solid #F0ECF8",
            overflow: "hidden",
          }}>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 22 }}>
                {cv?.summary && (
                  <SubSection title="Résumé">
                    <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>{cv.summary}</p>
                  </SubSection>
                )}

                {cv?.experience && cv.experience.length > 0 && (
                  <SubSection title="Expérience">
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {cv.experience.map((e, i) => <ExperienceItem key={i} e={e} />)}
                    </div>
                  </SubSection>
                )}

                {((candidate.skills && candidate.skills.length > 0) || (cv?.qualities && cv.qualities.length > 0)) && (
                  <SubSection title="Compétences">
                    {candidate.skills && candidate.skills.length > 0 && (
                      <div>
                        <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#7C63C8", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                          Techniques & méthodes
                        </p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {candidate.skills.map((s) => (
                            <span key={s} style={{
                              fontSize: 12, color: "#4B5563",
                              background: "#F8F6FF", border: "1px solid #F0ECF8",
                              padding: "5px 10px", borderRadius: 7,
                            }}>{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {cv?.qualities && cv.qualities.length > 0 && (
                      <div style={{ marginTop: candidate.skills && candidate.skills.length > 0 ? 16 : 0 }}>
                        <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#16a34a", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                          Qualités
                        </p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {cv.qualities.map((q) => (
                            <span key={q} style={{
                              fontSize: 12, color: "#15803d",
                              background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)",
                              padding: "5px 10px", borderRadius: 7,
                            }}>{q}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </SubSection>
                )}

                {cv?.education && cv.education.length > 0 && (
                  <SubSection title="Formation">
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                      {cv.education.map((ed, i) => (
                        <li key={i} style={{ fontSize: 13.5, color: "#374151", lineHeight: 1.55 }}>
                          <strong style={{ color: "#111827" }}>{ed.degree}</strong>
                          {ed.field ? `, ${ed.field}` : ""}
                          {ed.school ? <> — <span style={{ color: "#6B7280" }}>{ed.school}</span></> : null}
                          {(ed.start || ed.end) && (
                            <span style={{ color: "#9CA3AF", marginLeft: 8 }}>· {ed.start ?? ""}{ed.end ? `–${ed.end}` : ""}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </SubSection>
                )}

                {((cv?.languages && cv.languages.length > 0) || (cv?.certifications && cv.certifications.length > 0)) && (
                  <SubSection title="Autres">
                    {cv.languages && cv.languages.length > 0 && (
                      <p style={{ margin: "0 0 8px", fontSize: 13, color: "#374151" }}>
                        <strong style={{ color: "#111827" }}>Langues:</strong> {cv.languages.join(" · ")}
                      </p>
                    )}
                    {cv.certifications && cv.certifications.length > 0 && (
                      <p style={{ margin: 0, fontSize: 13, color: "#374151" }}>
                        <strong style={{ color: "#111827" }}>Certifications:</strong> {cv.certifications.join(" · ")}
                      </p>
                    )}
                  </SubSection>
                )}
            </div>
          </section>

          {/* CV original — collapsible, kept low on the page since the parsed
              view is the working surface; the PDF is just the reference. */}
          <CollapsibleSection
            title={signedUrl ? "CV original (PDF)" : "CV original (indisponible)"}
            defaultOpen={false}
            right={signedUrl ? (
              <a href={signedUrl} target="_blank" rel="noreferrer" style={{
                fontSize: 11, fontWeight: 700, color: "#7C63C8",
                textDecoration: "none",
              }} onClick={(e) => e.stopPropagation()}>
                Ouvrir ↗
              </a>
            ) : null}
          >
            {signedUrl ? (
              <iframe
                src={signedUrl}
                title={candidate.cv_file_name ?? "CV"}
                style={{ width: "100%", height: 720, border: "1px solid #F0ECF8", borderRadius: 10, display: "block" }}
              />
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF" }}>
                {candidate.cv_file_path ? "Préparation de l'aperçu…" : "Aucun fichier PDF."}
              </p>
            )}
          </CollapsibleSection>

          {/* Notes */}
          <Section
            title="Notes"
            right={savingNotes === "saving" ? <SmallStatus color="#7C63C8" label="Enregistrement…" />
              : savingNotes === "saved" ? <SmallStatus color="#16a34a" label="✓ Sauvegardé" /> : null}
          >
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Vos observations privées sur ce candidat…"
              rows={4}
              style={{
                width: "100%", boxSizing: "border-box",
                fontSize: 13.5, color: "#111827",
                padding: 12,
                background: "#FAFAFA",
                border: "1px solid #F0ECF8",
                borderRadius: 10,
                outline: "none",
                resize: "vertical",
                fontFamily: "inherit",
                lineHeight: 1.6,
              }}
            />
          </Section>
        </div>

        {/* ─── RIGHT: workflow ─── */}
        <aside style={{
          display: "flex", flexDirection: "column", gap: 16,
          position: "sticky", top: 80, alignSelf: "flex-start",
          maxHeight: "calc(100vh - 100px)", overflowY: "auto",
        }} className="cand-aside">
          {/* 1. Job picker */}
          <JobPicker
            matches={jobMatches}
            selectedJobId={selectedJobId}
            onChange={setSelectedJobId}
          />

          {/* 2. Compose IA — fixed, always visible */}
          {candidate.parse_status === "parsed" ? (
            <Section title="Message d'approche">
              <ComposeBox
                candidate={candidate}
                selectedJobId={selectedJobId}
                jobTitle={selectedJob?.job_title ?? null}
              />
            </Section>
          ) : (
            <Section title="Message d'approche">
              <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF" }}>
                Disponible une fois le CV parsé.
              </p>
            </Section>
          )}

          {/* 3. Conversation (collapsible) */}
          {candidate.parse_status === "parsed" && (
            <CollapsibleSection title="Conversation" defaultOpen={false}>
              <MessagerieThread candidateId={candidate.id} />
            </CollapsibleSection>
          )}

          {/* 4. Anonymisation orientée poste */}
          {candidate.parse_status === "parsed" && (
            <AnonymizeForJob
              jobTitle={selectedJob?.job_title ?? null}
              hasJob={!!selectedJob}
              state={anonState}
              url={anonUrl}
              error={anonError}
              onGenerate={handleAnonymize}
            />
          )}
        </aside>
      </m.div>

      <style>{`
        .cand-grid {
          display: grid;
          gap: 22px;
          grid-template-columns: minmax(0, 1fr) minmax(380px, 460px);
        }
        @media (max-width: 1000px) {
          .cand-grid { grid-template-columns: 1fr !important; }
          .cand-aside { position: static !important; max-height: none !important; overflow: visible !important; }
        }
      `}</style>
    </main>
  )
}

/* ─── Job picker ─────────────────────────────────────────── */

const TIER_COLOR: Record<MatchTier, { fg: string; bg: string }> = {
  excellent: { fg: "#15803d", bg: "rgba(34,197,94,0.10)" },
  good:      { fg: "#7C63C8", bg: "rgba(124,99,200,0.08)" },
  fair:      { fg: "#B45309", bg: "rgba(245,158,11,0.10)" },
  poor:      { fg: "#9CA3AF", bg: "#F3F4F6" },
}

function JobPicker({
  matches, selectedJobId, onChange,
}: {
  matches: JobMatch[]
  selectedJobId: string
  onChange: (id: string) => void
}) {
  return (
    <section style={{
      background: "white", borderRadius: 18, border: "1px solid #F0ECF8",
      padding: 18,
    }}>
      <h2 style={{
        margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#9CA3AF",
        letterSpacing: "0.08em", textTransform: "uppercase",
      }}>
        🎯 Poste matché
      </h2>
      {matches.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>
          Ce candidat ne match avec aucun poste pour l&apos;instant.
          {" "}<Link href="/workspace/postes" style={{ color: "#7C63C8", textDecoration: "none", fontWeight: 600 }}>
            Lancez un matching →
          </Link>
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {matches.map((m) => {
            const active = m.job_id === selectedJobId
            const tier = m.match_tier ? TIER_COLOR[m.match_tier] : TIER_COLOR.poor
            return (
              <button
                key={m.job_id}
                onClick={() => onChange(m.job_id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px",
                  background: active ? "rgba(124,99,200,0.07)" : "white",
                  border: `1px solid ${active ? "rgba(124,99,200,0.35)" : "#F0ECF8"}`,
                  borderRadius: 10, textAlign: "left",
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "background 120ms, border-color 120ms",
                }}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: "50%",
                  border: `2px solid ${active ? "#7C63C8" : "#D1D5DB"}`,
                  background: active ? "#7C63C8" : "transparent",
                  flexShrink: 0,
                }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.job_title}
                </span>
                {m.match_tier && (
                  <span style={{
                    fontSize: 10.5, fontWeight: 700,
                    color: tier.fg, background: tier.bg,
                    padding: "2px 7px", borderRadius: 100,
                    textTransform: "capitalize", flexShrink: 0,
                  }}>
                    {m.score != null ? `${m.score}` : ""} {m.match_tier}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

/* ─── Anonymize for job ──────────────────────────────────── */

function AnonymizeForJob({
  jobTitle, hasJob, state, url, error, onGenerate,
}: {
  jobTitle: string | null
  hasJob: boolean
  state: "idle" | "working" | "ready" | "error"
  url: string | null
  error: string | null
  onGenerate: () => void
}) {
  return (
    <section style={{
      background: "white", borderRadius: 18, border: "1px solid #F0ECF8",
      padding: 18,
    }}>
      <h2 style={{
        margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#9CA3AF",
        letterSpacing: "0.08em", textTransform: "uppercase",
      }}>
        🔒 CV anonymisé
      </h2>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#6B7280", lineHeight: 1.55 }}>
        {hasJob
          ? <>Génère un PDF présentable au client, orienté pour le poste <strong style={{ color: "#111827" }}>{jobTitle}</strong>. Identité retirée.</>
          : "Choisis d'abord un poste matché ci-dessus pour orienter le PDF anonyme."}
      </p>
      {error && (
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "#B91C1C" }}>{error}</p>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={onGenerate}
          disabled={!hasJob || state === "working"}
          title={!hasJob ? "Choisis d'abord un poste matché" : undefined}
          style={{
            fontSize: 12.5, fontWeight: 700,
            color: !hasJob ? "#9CA3AF" : "white",
            background: !hasJob ? "#F3F4F6"
              : state === "working" ? "#C4B6E0"
              : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
            border: "none", borderRadius: 9, padding: "9px 16px",
            cursor: !hasJob || state === "working" ? "default" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {state === "working" ? "Génération…"
            : state === "ready" ? "Régénérer"
            : "Anonymiser pour ce poste"}
        </button>
        {state === "ready" && url && (
          <a href={url} target="_blank" rel="noreferrer" style={{
            fontSize: 12.5, fontWeight: 700, color: "#7C63C8",
            background: "white", border: "1px solid rgba(124,99,200,0.25)",
            borderRadius: 9, padding: "9px 14px", textDecoration: "none",
            display: "inline-flex", alignItems: "center",
          }}>
            Télécharger ↓
          </a>
        )}
      </div>
    </section>
  )
}

/* ─── Compose IA ──────────────────────────────────────────── */

function ComposeBox({
  candidate,
  selectedJobId,
  jobTitle,
}: {
  candidate: Candidate
  selectedJobId: string
  jobTitle: string | null
}) {
  const existing = candidate.outreach_meta
  const [channel, setChannel] = useState<"email" | "linkedin">(existing?.channel ?? "email")
  const [instruction, setInstruction] = useState(existing?.instruction ?? "")
  const [subject, setSubject] = useState(existing?.subject ?? "")
  const [bodyText, setBodyText] = useState(candidate.outreach_draft ?? "")
  const [composing, setComposing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent">("idle")

  // Track the last AI-generated body verbatim. If the textarea content
  // differs, the sourcer has hand-edited it → Nora can review.
  const [aiBody, setAiBody] = useState(candidate.outreach_draft ?? "")
  const [aiSubject, setAiSubject] = useState(existing?.subject ?? "")
  const [critiqueState, setCritiqueState] = useState<"idle" | "running">("idle")
  const [critique, setCritique] = useState<{ verdict: "ok" | "warn"; flags: { level: "info" | "warn"; text: string }[] } | null>(null)

  const hasDraft = bodyText.trim().length > 0
  const canSend = channel === "email" && hasDraft && !!candidate.email
  const edited = hasDraft && (bodyText.trim() !== aiBody.trim() || subject.trim() !== aiSubject.trim())

  const generate = async () => {
    setComposing(true); setError(null)
    try {
      const res = await fetch(`/api/cv/${candidate.id}/compose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          job_id: selectedJobId || null,
          instruction: instruction.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data?.message ?? data?.error ?? "Échec de la génération.")
        setComposing(false)
        return
      }
      setSubject(data.subject ?? "")
      setBodyText(data.body ?? "")
      setAiSubject(data.subject ?? "")
      setAiBody(data.body ?? "")
      setCritique(null)
    } catch (err) {
      setError((err as Error).message ?? "Erreur réseau.")
    } finally {
      setComposing(false)
    }
  }

  const runCritique = async () => {
    if (!edited || critiqueState === "running") return
    setCritiqueState("running"); setError(null)
    try {
      const res = await fetch(`/api/cv/${candidate.id}/critique`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body: bodyText, channel, job_id: selectedJobId || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setError(data?.message ?? data?.error ?? "Nora n'a pas pu relire le message.")
      } else {
        setCritique({ verdict: data.verdict, flags: data.flags ?? [] })
      }
    } catch (err) {
      setError((err as Error).message ?? "Erreur réseau.")
    } finally {
      setCritiqueState("idle")
    }
  }

  const copy = async () => {
    const text = channel === "email" && subject ? `Objet : ${subject}\n\n${bodyText}` : bodyText
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked */ }
  }

  const send = async () => {
    if (!canSend || sendState === "sending") return
    if (!confirm(`Envoyer cet email à ${candidate.full_name ?? candidate.email} ?`)) return
    setSendState("sending"); setError(null)
    try {
      const res = await fetch(`/api/cv/${candidate.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body: bodyText, job_id: selectedJobId || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setError(data?.message ?? data?.error ?? "L'envoi a échoué.")
        setSendState("idle")
        return
      }
      setSendState("sent")
      setTimeout(() => setSendState("idle"), 2500)
    } catch (err) {
      setError((err as Error).message ?? "Erreur réseau.")
      setSendState("idle")
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Channel toggle + context badge */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 0, border: "1px solid #E5E7EB", borderRadius: 9, overflow: "hidden" }}>
          {(["email", "linkedin"] as const).map((ch) => (
            <button
              key={ch}
              onClick={() => setChannel(ch)}
              style={{
                fontSize: 12.5, fontWeight: 600, padding: "6px 12px",
                border: "none", cursor: "pointer", fontFamily: "inherit",
                background: channel === ch ? "#7C63C8" : "white",
                color: channel === ch ? "white" : "#6B7280",
              }}
            >
              {ch === "email" ? "Email" : "LinkedIn"}
            </button>
          ))}
        </div>
        {jobTitle && (
          <span style={{
            fontSize: 11, fontWeight: 600, color: "#7C63C8",
            background: "rgba(124,99,200,0.08)",
            border: "1px solid rgba(124,99,200,0.16)",
            borderRadius: 100, padding: "3px 10px",
          }}>
            Pour : {jobTitle}
          </span>
        )}
      </div>

      <input
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Consigne optionnelle — ex : insiste sur le télétravail, ton très direct…"
        style={{
          width: "100%", boxSizing: "border-box",
          fontSize: 12.5, color: "#111827", padding: "8px 11px",
          background: "#FAFAFA", border: "1px solid #E5E7EB", borderRadius: 9,
          outline: "none", fontFamily: "inherit",
        }}
      />

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={generate} disabled={composing} style={{
          padding: "8px 14px", borderRadius: 9, border: "none",
          background: composing ? "#C4B6E0" : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
          color: "white", fontSize: 12.5, fontWeight: 700,
          cursor: composing ? "default" : "pointer", fontFamily: "inherit",
        }}>
          {composing ? "Nora rédige…" : hasDraft ? "Régénérer (version alternative)" : "Rédiger avec Nora"}
        </button>
        {existing?.generated_at && !composing && (
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>
            {new Date(existing.generated_at).toLocaleDateString("fr-FR")}
          </span>
        )}
      </div>

      {error && (
        <div style={{
          padding: "9px 12px", background: "#FEF2F2", border: "1px solid #FECACA",
          borderRadius: 9, fontSize: 12.5, color: "#B91C1C",
        }}>{error}</div>
      )}

      {hasDraft && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {channel === "email" && (
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Objet de l'email"
              style={{
                width: "100%", boxSizing: "border-box",
                fontSize: 13, fontWeight: 600, color: "#111827", padding: "9px 12px",
                background: "#FAFAFA", border: "1px solid #F0ECF8", borderRadius: 9,
                outline: "none", fontFamily: "inherit",
              }}
            />
          )}
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={9}
            style={{
              width: "100%", boxSizing: "border-box",
              fontSize: 13, color: "#111827", padding: 11,
              background: "#FAFAFA", border: "1px solid #F0ECF8", borderRadius: 9,
              outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.65,
            }}
          />

          {/* Post-it Nora — only shown when the sourcer has edited the draft.
              Pure suggestion, never blocking. */}
          {edited && !critique && (
            <button
              onClick={runCritique}
              disabled={critiqueState === "running"}
              style={{
                alignSelf: "flex-start",
                background: "#FFFAEB",
                border: "1px solid #FCD34D",
                borderRadius: 10,
                padding: "8px 12px",
                fontSize: 12.5, fontWeight: 600, color: "#92400E",
                cursor: critiqueState === "running" ? "default" : "pointer",
                fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", gap: 7,
                boxShadow: "0 2px 6px rgba(252,211,77,0.25)",
              }}
            >
              {critiqueState === "running" ? "✦ Nora relit…" : "✦ Une révision Nora ?"}
            </button>
          )}
          {critique && (
            <div style={{
              background: critique.verdict === "ok" ? "rgba(34,197,94,0.06)" : "#FFFAEB",
              border: `1px solid ${critique.verdict === "ok" ? "rgba(34,197,94,0.3)" : "#FCD34D"}`,
              borderRadius: 10,
              padding: "10px 12px",
              display: "flex", flexDirection: "column", gap: 6,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontSize: 11, fontWeight: 800,
                  color: critique.verdict === "ok" ? "#15803d" : "#92400E",
                  letterSpacing: "0.04em", textTransform: "uppercase",
                }}>
                  ✦ {critique.verdict === "ok" ? "Nora approuve" : "Nora suggère"}
                </span>
                <button onClick={() => setCritique(null)} style={{
                  marginLeft: "auto", fontSize: 11, color: "#9CA3AF",
                  background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
                }}>
                  Masquer
                </button>
              </div>
              {critique.verdict === "ok" && critique.flags.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12.5, color: "#374151" }}>
                  Le message est prêt à être envoyé.
                </p>
              ) : (
                <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 3 }}>
                  {critique.flags.map((f, i) => (
                    <li key={i} style={{ fontSize: 12.5, color: "#374151", lineHeight: 1.5 }}>
                      {f.text}
                    </li>
                  ))}
                </ul>
              )}
              {edited && (
                <button onClick={runCritique} disabled={critiqueState === "running"} style={{
                  alignSelf: "flex-start", marginTop: 2,
                  background: "transparent", border: "none", padding: 0,
                  fontSize: 11.5, fontWeight: 700, color: "#7C63C8",
                  cursor: critiqueState === "running" ? "default" : "pointer", fontFamily: "inherit",
                }}>
                  {critiqueState === "running" ? "Relecture…" : "Relire à nouveau"}
                </button>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={copy} style={{
              padding: "7px 12px", borderRadius: 9,
              background: copied ? "rgba(34,197,94,0.10)" : "white",
              border: `1px solid ${copied ? "rgba(34,197,94,0.3)" : "#E5E7EB"}`,
              color: copied ? "#15803d" : "#374151",
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>
              {copied ? "✓ Copié" : "Copier"}
            </button>

            {channel === "email" && (
              <button
                onClick={send}
                disabled={!canSend || sendState !== "idle"}
                title={!candidate.email ? "Ce candidat n'a pas d'adresse email" : undefined}
                style={{
                  padding: "7px 14px", borderRadius: 9, border: "none",
                  background: sendState === "sent" ? "rgba(34,197,94,0.12)"
                    : !canSend || sendState === "sending" ? "#C4B6E0"
                    : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                  color: sendState === "sent" ? "#15803d" : "white",
                  fontSize: 12, fontWeight: 700,
                  cursor: canSend && sendState === "idle" ? "pointer" : "default",
                  fontFamily: "inherit",
                }}
              >
                {sendState === "sending" ? "Envoi…"
                  : sendState === "sent" ? "✓ Envoyé"
                  : "Envoyer via Naywa"}
              </button>
            )}
          </div>
          <span style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.5 }}>
            {channel === "linkedin"
              ? "Copiez le message dans LinkedIn — Nora n'envoie pas sur LinkedIn."
              : !candidate.email
                ? "Pas d'email pour ce candidat — copiez le message."
                : "Relisez avant d'envoyer. L'envoi part de votre adresse Naywa."}
          </span>
        </div>
      )}
    </div>
  )
}

/* ─── Messagerie ──────────────────────────────────────────── */

const STAGE_LABELS: Record<string, string> = {
  identified: "Identifié", contacted: "Contacté", replied: "Réponse",
  interview: "Entretien", offer: "Offre", hired: "Recruté", rejected: "Écarté",
}
const SENTIMENT_LABELS: Record<string, { label: string; color: string }> = {
  interested:     { label: "Intéressé",   color: "#15803d" },
  not_interested: { label: "Pas intéressé", color: "#B91C1C" },
  question:       { label: "Question",    color: "#7C63C8" },
  negotiation:    { label: "Négociation", color: "#B45309" },
  neutral:        { label: "Neutre",      color: "#6B7280" },
}

function MessagerieThread({ candidateId }: { candidateId: string }) {
  const sb = useMemo(() => getSupabase(), [])
  const [messages, setMessages] = useState<EmailMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    let channel: ReturnType<typeof sb.channel> | null = null
    ;(async () => {
      const { data } = await sb
        .from("email_messages")
        .select("*")
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: true })
      if (!mounted) return
      setMessages((data ?? []) as EmailMessage[])
      setLoading(false)

      channel = sb
        .channel(`emails:${candidateId}`)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "email_messages", filter: `candidate_id=eq.${candidateId}` },
          (payload) => {
            setMessages((prev) => {
              if (payload.eventType === "DELETE") return prev.filter((m) => m.id !== (payload.old as EmailMessage).id)
              const next = payload.new as EmailMessage
              const idx = prev.findIndex((m) => m.id === next.id)
              if (idx === -1) return [...prev, next].sort((a, b) => a.created_at.localeCompare(b.created_at))
              const copy = [...prev]; copy[idx] = next; return copy
            })
          },
        )
        .subscribe()
    })()
    return () => { mounted = false; if (channel) sb.removeChannel(channel) }
  }, [candidateId, sb])

  const applyStage = async (msg: EmailMessage) => {
    if (!msg.job_id || !msg.ai_suggested_stage) return
    setApplying(msg.id)
    try {
      const { data: assessment } = await sb
        .from("match_assessments")
        .select("id")
        .eq("candidate_id", candidateId)
        .eq("job_id", msg.job_id)
        .maybeSingle()
      if (assessment) {
        await fetch(`/api/match/${assessment.id}/stage`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pipeline_stage: msg.ai_suggested_stage }),
        })
      }
    } finally {
      setApplying(null)
    }
  }

  if (loading) {
    return <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF" }}>Chargement…</p>
  }
  if (messages.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>
        Aucun échange pour l&apos;instant.
      </p>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {messages.map((msg) => {
        const out = msg.direction === "outbound"
        return (
          <div key={msg.id} style={{
            alignSelf: out ? "flex-end" : "flex-start",
            maxWidth: "92%",
            display: "flex", flexDirection: "column", gap: 5,
          }}>
            <div style={{
              background: out ? "rgba(124,99,200,0.07)" : "#F4F1FB",
              border: `1px solid ${out ? "rgba(124,99,200,0.18)" : "#E2DAF6"}`,
              borderRadius: out ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
              padding: "10px 12px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: out ? "#7C63C8" : "#6B7280" }}>
                  {out ? "Vous" : "Candidat"}
                </span>
                {msg.status === "failed" && <span style={{ fontSize: 10, fontWeight: 700, color: "#B91C1C" }}>échec d&apos;envoi</span>}
                {msg.status === "bounced" && <span style={{ fontSize: 10, fontWeight: 700, color: "#B91C1C" }}>rejeté</span>}
                <span style={{ marginLeft: "auto", fontSize: 10, color: "#9CA3AF" }}>
                  {new Date(msg.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>
              {msg.subject && (
                <p style={{ margin: "0 0 3px", fontSize: 12, fontWeight: 700, color: "#111827" }}>{msg.subject}</p>
              )}
              <p style={{ margin: 0, fontSize: 12.5, color: "#374151", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                {msg.body_text ?? "(message vide)"}
              </p>
            </div>

            {!out && (msg.ai_summary || msg.ai_suggested_stage) && (
              <div style={{
                background: "white", border: "1px solid #E2DAF6", borderRadius: 10,
                padding: "8px 11px", display: "flex", flexDirection: "column", gap: 6,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#7C63C8", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                    ✦ Analyse Nora
                  </span>
                  {msg.ai_sentiment && SENTIMENT_LABELS[msg.ai_sentiment] && (
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: SENTIMENT_LABELS[msg.ai_sentiment].color,
                      background: `${SENTIMENT_LABELS[msg.ai_sentiment].color}15`,
                      padding: "1px 7px", borderRadius: 100,
                    }}>
                      {SENTIMENT_LABELS[msg.ai_sentiment].label}
                    </span>
                  )}
                </div>
                {msg.ai_summary && (
                  <p style={{ margin: 0, fontSize: 12, color: "#4B5563", lineHeight: 1.55 }}>{msg.ai_summary}</p>
                )}
                {msg.ai_suggested_stage && msg.job_id && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11.5, color: "#6B7280" }}>
                      Passer en <strong>{STAGE_LABELS[msg.ai_suggested_stage] ?? msg.ai_suggested_stage}</strong> ?
                    </span>
                    <button
                      onClick={() => applyStage(msg)}
                      disabled={applying === msg.id}
                      style={{
                        fontSize: 11, fontWeight: 700, color: "white",
                        background: applying === msg.id ? "#C4B6E0" : "#7C63C8",
                        border: "none", borderRadius: 7, padding: "4px 10px",
                        cursor: applying === msg.id ? "default" : "pointer", fontFamily: "inherit",
                      }}
                    >
                      {applying === msg.id ? "…" : "Appliquer"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ─── Bits ────────────────────────────────────────────────── */

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={{
      background: "white", borderRadius: 18, border: "1px solid #F0ECF8",
      padding: 20,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <h2 style={{
          margin: 0, fontSize: 12, fontWeight: 700, color: "#9CA3AF",
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  )
}

function CollapsibleSection({ title, defaultOpen = true, right, children }: {
  title: string; defaultOpen?: boolean; right?: React.ReactNode; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section style={{
      background: "white", borderRadius: 18, border: "1px solid #F0ECF8",
      overflow: "hidden",
    }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12,
          padding: "14px 20px", background: "transparent", border: "none",
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        <span style={{
          fontSize: 12, fontWeight: 700, color: "#9CA3AF",
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          {title}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
          {right}
          <span style={{ fontSize: 14, color: "#7C63C8", transform: open ? "rotate(90deg)" : "none", transition: "transform 160ms" }}>
            ›
          </span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <m.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "0 20px 20px" }}>
              {children}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{
        margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#9CA3AF",
        letterSpacing: "0.08em", textTransform: "uppercase",
      }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

type ProfileBrand = "linkedin" | "github" | "malt" | "portfolio"

const PROFILE_BRANDS: Record<ProfileBrand, {
  label: string; color: string; path: string
}> = {
  linkedin: {
    label: "LinkedIn", color: "#0A66C2",
    path: "M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z",
  },
  github: {
    label: "GitHub", color: "#181717",
    path: "M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.2-.7.1-.7.1-.7 1.3.1 2 1.3 2 1.3 1.1 2 3 1.4 3.7 1 .1-.8.4-1.4.8-1.7-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.3-3.2-.1-.3-.6-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.6.2 2.9.1 3.2.8.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1.1.9 2.3v3.4c0 .3.2.7.8.6A12 12 0 0 0 12 .3",
  },
  malt: {
    label: "Malt", color: "#FF5158",
    path: "M3 19h3v-9.5L11 19h2l5-9.5V19h3V5h-4l-5 9.5L7 5H3v14z",
  },
  portfolio: {
    label: "Site", color: "#7C63C8",
    path: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm6.93 6h-2.95a15.65 15.65 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.92 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.99 7.99 0 0 1 5.08 16zm2.95-8H5.08a7.99 7.99 0 0 1 4.33-3.56A15.65 15.65 0 0 0 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2s.07-1.35.16-2h4.68c.09.65.16 1.32.16 2s-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z",
  },
}

function ProfileButton({ href, brand }: { href: string | null; brand: ProfileBrand }) {
  if (!href) return null
  const b = PROFILE_BRANDS[brand]
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Ouvrir le profil ${b.label}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 12, fontWeight: 700, color: b.color,
        background: "white", border: `1px solid ${b.color}`,
        borderRadius: 8, padding: "7px 12px", textDecoration: "none",
        fontFamily: "inherit",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d={b.path} />
      </svg>
      {b.label}
    </a>
  )
}

function InfoChip({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <span style={{
      display: "inline-flex", flexDirection: "column",
      padding: "8px 12px",
      background: "#F8F6FF", border: "1px solid #F0ECF8", borderRadius: 9,
      fontSize: 12,
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ color: "#111827", fontWeight: 600, marginTop: 2 }}>{value}</span>
    </span>
  )
}

function ExperienceItem({ e }: { e: NonNullable<ParsedCv["experience"]>[number] }) {
  const dateLabel = [e.start, e.end ?? "actuel"].filter(Boolean).join(" – ")
  return (
    <div style={{ paddingLeft: 14, borderLeft: "2px solid #F0ECF8", position: "relative" }}>
      <span style={{
        position: "absolute", left: -5, top: 5,
        width: 8, height: 8, borderRadius: "50%",
        background: "#7C63C8", boxShadow: "0 0 0 3px white",
      }} />
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827" }}>
          {e.title}
          {e.company ? <span style={{ fontWeight: 500, color: "#6B7280" }}> — {e.company}</span> : null}
        </p>
        {e.seniority && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: "#7C63C8",
            background: "rgba(124,99,200,0.08)",
            border: "1px solid rgba(124,99,200,0.2)",
            borderRadius: 100, padding: "1px 7px",
            textTransform: "capitalize", letterSpacing: "0.02em",
          }}>
            {e.seniority}
          </span>
        )}
      </div>
      <p style={{ margin: "2px 0 6px", fontSize: 11.5, color: "#9CA3AF" }}>
        {dateLabel}{e.location ? ` · ${e.location}` : ""}
      </p>
      {e.description && (
        <p style={{ margin: 0, fontSize: 13, color: "#4B5563", lineHeight: 1.6 }}>{e.description}</p>
      )}
    </div>
  )
}

const LANGUAGE_LABEL: Record<string, string> = {
  fr: "Français", en: "Anglais", es: "Espagnol", de: "Allemand",
  it: "Italien", pt: "Portugais", nl: "Néerlandais",
}

function CvHealthBar({ cv }: { cv: ParsedCv | null }) {
  if (!cv) return null
  const score = typeof cv.completeness === "number" ? cv.completeness : null
  const lang = cv.language ?? null
  const warnings = Array.isArray(cv.warnings) ? cv.warnings : []
  if (score == null && !lang && warnings.length === 0) return null

  const tier = score == null ? null
    : score >= 75 ? { label: "CV complet",  fg: "#15803d", bg: "rgba(34,197,94,0.10)", bd: "rgba(34,197,94,0.3)" }
    : score >= 40 ? { label: "CV partiel",  fg: "#B45309", bg: "rgba(245,158,11,0.10)", bd: "rgba(245,158,11,0.3)" }
    :               { label: "CV pauvre",   fg: "#B91C1C", bg: "rgba(220,38,38,0.10)", bd: "rgba(220,38,38,0.3)" }

  return (
    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {tier && (
          <span title={`Score de complétude : ${score}/100`} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 11, fontWeight: 700, color: tier.fg,
            background: tier.bg, border: `1px solid ${tier.bd}`,
            borderRadius: 100, padding: "3px 9px",
          }}>
            {tier.label} <span style={{ opacity: 0.7 }}>· {score}/100</span>
          </span>
        )}
        {lang && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: "#4B5563",
            background: "#F3F4F6", border: "1px solid #E5E7EB",
            borderRadius: 100, padding: "3px 9px",
          }}>
            CV en {LANGUAGE_LABEL[lang] ?? lang.toUpperCase()}
          </span>
        )}
      </div>
      {warnings.length > 0 && (
        <ul style={{
          margin: 0, padding: "8px 12px", listStyle: "none",
          background: "rgba(245,158,11,0.06)",
          border: "1px solid rgba(245,158,11,0.22)",
          borderRadius: 9,
          display: "flex", flexDirection: "column", gap: 3,
        }}>
          {warnings.map((w, i) => (
            <li key={i} style={{ fontSize: 12, color: "#92400E", lineHeight: 1.5 }}>
              ⚠ {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SmallStatus({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: "0.04em" }}>
      {label}
    </span>
  )
}

function initials(s: string | null | undefined): string {
  if (!s) return "?"
  return s.split(/\s+/).slice(0, 2).map((p) => p[0] ?? "").join("").toUpperCase() || "?"
}
