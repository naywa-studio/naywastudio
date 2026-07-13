"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { m } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import { CANDIDATE_COLUMNS, type Candidate, type ParsedCv, type MatchTier } from "@/lib/database.types"
import { customTagsOf, SYSTEM_TAGS } from "@/lib/tags"
import { candidateRefLabel } from "@/lib/candidate-ref"
import TagPicker from "@/components/workspace/TagPicker"
import { DetailSkeleton } from "@/components/workspace/PageSkeletons"
import { showUndoToast } from "@/components/ui/UndoToast"
import { useLanguage, type Lang } from "@/lib/i18n/LanguageContext"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

interface JobMatch {
  /** match_assessments.id — opens /workspace/match/[matchId] */
  id: string
  job_id: string
  job_title: string
  score: number | null
  match_tier: MatchTier | null
  pipeline_stage: string
  in_pipeline: boolean
}

const TIER_COLOR: Record<MatchTier, { fg: string; bg: string; bd: string }> = {
  excellent: { fg: "#15803d", bg: "rgba(34,197,94,0.10)",  bd: "rgba(34,197,94,0.3)" },
  good:      { fg: "#7C63C8", bg: "rgba(124,99,200,0.08)", bd: "rgba(124,99,200,0.22)" },
  fair:      { fg: "#B45309", bg: "rgba(245,158,11,0.10)", bd: "rgba(245,158,11,0.3)" },
  poor:      { fg: "#6B7280", bg: "#F3F4F6",               bd: "#E5E7EB" },
}

const STAGE_LABELS: Record<Lang, Record<string, string>> = {
  fr: {
    identified: "Identifié", contacted: "Contacté", replied: "Réponse",
    interview: "Entretien", offer: "Offre", hired: "Recruté", rejected: "Écarté",
  },
  en: {
    identified: "Identified", contacted: "Contacted", replied: "Replied",
    interview: "Interview", offer: "Offer", hired: "Hired", rejected: "Rejected",
  },
}

const LANGUAGE_LABEL: Record<Lang, Record<string, string>> = {
  fr: {
    fr: "Français", en: "Anglais", es: "Espagnol", de: "Allemand",
    it: "Italien", pt: "Portugais", nl: "Néerlandais",
  },
  en: {
    fr: "French", en: "English", es: "Spanish", de: "German",
    it: "Italian", pt: "Portuguese", nl: "Dutch",
  },
}

const copy = {
  fr: {
    loadingLabel: "Chargement du candidat",
    notFound: "Candidat introuvable.",
    backToVivier: "← Retour au vivier",
    candidateFallback: "Candidat",
    deletedToast: (label: string) => `${label} supprimé`,
    delete: "Supprimer",
    parsingFailed: "Parsing échoué.",
    retryParsing: "Relancer le parsing",
    retryParsingIcon: "⟳ Relancer le parsing",
    analyzing: "✦ Nora est en train d'analyser le CV…",
    email: "Email",
    phone: "Téléphone",
    location: "Localisation",
    experience: "Expérience",
    yearsSuffix: (n: number) => `${n} ans`,
    seniority: "Séniorité",
    retryTitle: "Re-soumettre le CV au parsing — utile après une mise à jour de l'analyse Nora",
    tags: "Tags",
    tagsPlaceholder: "ex : à recontacter, freelance, client X…",
    summary: "Résumé",
    experienceTitle: "Expérience",
    skills: "Compétences",
    technicalSkills: "Techniques & méthodes",
    softSkills: "Qualités",
    education: "Formation",
    other: "Autres",
    languagesLabel: "Langues:",
    certificationsLabel: "Certifications:",
    notes: "Notes",
    saving: "Enregistrement…",
    saved: "✓ Sauvegardé",
    notesPlaceholder: "Vos observations privées sur ce candidat…",
    matchedJobs: "📌 Missions matchées",
    noMatchedJobs: "Ce candidat n'est associé à aucune mission pour l'instant.",
    launchMatching: "Lancez un matching →",
    manual: "Manuel",
    openTriangle: "Ouvrir ▶",
    matchHint: "Le message d'approche et la version anonymisée du CV se font depuis chaque fiche match — un message par mission pitchée.",
    originalCv: "CV original",
    openExternal: "Ouvrir ↗",
    preparingPreview: "Préparation de l'aperçu…",
    noPdf: "Aucun fichier PDF.",
    nameToComplete: "Nom à compléter",
    viewPricing: "€ Voir le pricing",
    chooseJob: "Choisir la mission",
    openProfile: (label: string) => `Ouvrir le profil ${label}`,
    cvComplete: "CV complet",
    cvPartial: "CV partiel",
    cvPoor: "CV pauvre",
    completenessTitle: (score: number) => `Score de complétude : ${score}/100`,
    cvInLang: (lang: string) => `CV en ${lang}`,
    website: "Site",
  },
  en: {
    loadingLabel: "Loading candidate",
    notFound: "Candidate not found.",
    backToVivier: "← Back to talent pool",
    candidateFallback: "Candidate",
    deletedToast: (label: string) => `${label} deleted`,
    delete: "Delete",
    parsingFailed: "Parsing failed.",
    retryParsing: "Retry parsing",
    retryParsingIcon: "⟳ Retry parsing",
    analyzing: "✦ Nora is analyzing the CV…",
    email: "Email",
    phone: "Phone",
    location: "Location",
    experience: "Experience",
    yearsSuffix: (n: number) => `${n} years`,
    seniority: "Seniority",
    retryTitle: "Re-submit the CV for parsing — useful after a Nora analysis update",
    tags: "Tags",
    tagsPlaceholder: "e.g.: follow up, freelance, client X…",
    summary: "Summary",
    experienceTitle: "Experience",
    skills: "Skills",
    technicalSkills: "Technical skills & methods",
    softSkills: "Soft skills",
    education: "Education",
    other: "Other",
    languagesLabel: "Languages:",
    certificationsLabel: "Certifications:",
    notes: "Notes",
    saving: "Saving…",
    saved: "✓ Saved",
    notesPlaceholder: "Your private notes on this candidate…",
    matchedJobs: "📌 Matched job openings",
    noMatchedJobs: "This candidate isn't linked to any job opening yet.",
    launchMatching: "Run a matching →",
    manual: "Manual",
    openTriangle: "Open ▶",
    matchHint: "The outreach message and anonymized CV version are handled from each match sheet — one message per pitched job opening.",
    originalCv: "Original CV",
    openExternal: "Open ↗",
    preparingPreview: "Preparing preview…",
    noPdf: "No PDF file.",
    nameToComplete: "Name to complete",
    viewPricing: "€ View pricing",
    chooseJob: "Choose the job opening",
    openProfile: (label: string) => `Open ${label} profile`,
    cvComplete: "Complete CV",
    cvPartial: "Partial CV",
    cvPoor: "Sparse CV",
    completenessTitle: (score: number) => `Completeness score: ${score}/100`,
    cvInLang: (lang: string) => `CV in ${lang}`,
    website: "Website",
  },
}

/**
 * Fiche candidat — slim version.
 *
 * Post-refactor : this page answers "qui est cette personne ?" only.
 * Compose, anonymisation et conversation ont déménagé dans la fiche match
 * (/workspace/match/[matchId]) parce qu'ils dépendent d'un couple
 * candidat × mission. La section "Missions matchées" sert de tremplin.
 */
export default function CandidatePage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = copy[lang]
  const { candidateId } = useParams<{ candidateId: string }>()
  const sb = useMemo(() => getSupabase(), [])

  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [notes, setNotes] = useState("")
  const [savingNotes, setSavingNotes] = useState<"idle" | "saving" | "saved">("idle")
  const [jobMatches, setJobMatches] = useState<JobMatch[]>([])
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [tagsSaving, setTagsSaving] = useState(false)

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

      sb.from("candidates").update({ consulted_at: new Date().toISOString() }).eq("id", c.id).then(() => {})

      const tasks: Promise<void>[] = []

      if (c.cv_file_path) {
        tasks.push((async () => {
          const r = await fetch(`/api/cv/${c.id}/signed-url`)
          if (r.ok) { const j = await r.json(); if (mounted) setSignedUrl(j.url) }
        })())
      }

      tasks.push((async () => {
        const { data: allTags } = await sb
          .from("candidates").select("tags").not("tags", "is", null).limit(400)
        if (!mounted || !allTags) return
        const seen = new Set<string>()
        for (const row of allTags) {
          for (const t of (row.tags ?? [])) {
            if (typeof t === "string" && !SYSTEM_TAGS.has(t)) seen.add(t)
          }
        }
        setTagSuggestions(Array.from(seen).sort((a, b) => a.localeCompare(b)))
      })())

      tasks.push((async () => {
        const { data: matches } = await sb
          .from("match_assessments")
          .select("id, job_id, score, match_tier, pipeline_stage, in_pipeline, job:jobs(id, title)")
          .eq("candidate_id", c.id)
          .order("score", { ascending: false, nullsFirst: false })
        if (!mounted || !matches) return
        const seen = new Set<string>()
        const out: JobMatch[] = []
        for (const m of matches as unknown as Array<{
          id: string; job_id: string; score: number | null; match_tier: MatchTier | null
          pipeline_stage: string
          in_pipeline: boolean
          job: { id: string; title: string } | null
        }>) {
          if (!m.job || seen.has(m.job.id)) continue
          seen.add(m.job.id)
          out.push({
            id: m.id, job_id: m.job.id, job_title: m.job.title,
            score: m.score, match_tier: m.match_tier,
            pipeline_stage: m.pipeline_stage,
            in_pipeline: m.in_pipeline,
          })
        }
        setJobMatches(out)
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
    const label = candidate.full_name?.trim() || t.candidateFallback
    // Send the sourcer back to the vivier first so the candidate vanishes
    // visually; the actual deletion is held by the undo toast.
    router.push("/workspace/vivier")
    const { cancelled } = await showUndoToast(t.deletedToast(label))
    if (cancelled) {
      router.push(`/workspace/vivier/${candidate.id}`)
      return
    }
    await fetch(`/api/cv/${candidate.id}`, { method: "DELETE" })
  }

  const handleRetryParse = async () => {
    if (!candidate) return
    setCandidate((prev) => prev ? { ...prev, parse_status: "parsing", parse_error: null } : prev)
    await fetch(`/api/cv/${candidate.id}/parse`, { method: "POST" }).catch(() => {})
  }

  const saveTags = async (nextCustom: string[]) => {
    if (!candidate) return
    const systemFlags = (candidate.tags ?? []).filter((t) => SYSTEM_TAGS.has(t))
    const next = [...systemFlags, ...nextCustom]
    setCandidate((prev) => prev ? { ...prev, tags: next } : prev)
    setTagsSaving(true)
    await sb.from("candidates").update({ tags: next }).eq("id", candidate.id)
    setTagsSaving(false)
  }

  if (loading) {
    return <DetailSkeleton label={t.loadingLabel} />
  }
  if (notFound || !candidate) {
    return (
      <div style={{ padding: "60px 24px", textAlign: "center", color: "#6B7280" }}>
        <p style={{ fontSize: 16, fontWeight: 600 }}>{t.notFound}</p>
        <Link href="/workspace/vivier" style={{ color: "#7C63C8", textDecoration: "none", fontSize: 14 }}>
          {t.backToVivier}
        </Link>
      </div>
    )
  }

  const cv = candidate.parsed_cv ?? null

  return (
    <main style={{
      padding: "32px 24px 80px",
      maxWidth: 1280, margin: "0 auto",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      <Link href="/workspace/vivier" style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 13, color: "#7C63C8", textDecoration: "none",
        marginBottom: 22,
      }}>
        {t.backToVivier}
      </Link>

      <m.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="cand-grid"
      >
        {/* LEFT — identité + CV parsé + CV original + notes */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <section style={{
            background: "white", borderRadius: 16, border: "1px solid #F0ECF8",
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
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em" }}>
                    {candidate.full_name ?? t.nameToComplete}
                  </h1>
                  <RefBadge candidateId={candidate.id} />
                </div>
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
              <PricingShortcut matches={jobMatches} />
              <button
                onClick={handleDelete}
                style={{
                  fontSize: 12, fontWeight: 600, color: "#DC2626",
                  background: "transparent", border: "1px solid #FCA5A5",
                  borderRadius: 8, padding: "7px 14px", cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {t.delete}
              </button>
            </div>

            {candidate.parse_status === "error" && (
              <div style={{
                marginTop: 16, padding: "12px 14px",
                background: "#FEF2F2", border: "1px solid #FECACA",
                borderRadius: 10, fontSize: 13, color: "#B91C1C",
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap",
              }}>
                <span><strong>{t.parsingFailed}</strong> {candidate.parse_error}</span>
                <button
                  onClick={handleRetryParse}
                  style={{
                    fontSize: 12, fontWeight: 700, color: "white",
                    background: "#DC2626", border: "none",
                    borderRadius: 8, padding: "7px 14px", cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {t.retryParsing}
                </button>
              </div>
            )}
            {(candidate.parse_status === "parsing" || candidate.parse_status === "pending") && (
              <div style={{
                marginTop: 16, padding: "10px 14px",
                background: "rgba(124,99,200,0.06)", border: "1px solid rgba(124,99,200,0.18)",
                borderRadius: 10, fontSize: 13, color: "#7C63C8",
              }}>
                {t.analyzing}
              </div>
            )}

            <div style={{
              marginTop: 18, display: "flex", flexWrap: "wrap", gap: 14,
              fontSize: 13, color: "#374151",
            }}>
              <InfoChip label={t.email}       value={candidate.email} />
              <InfoChip label={t.phone}       value={candidate.phone} />
              <InfoChip label={t.location}    value={candidate.location} />
              <InfoChip label={t.experience}  value={candidate.years_experience != null ? t.yearsSuffix(candidate.years_experience) : null} />
              <InfoChip
                label={t.seniority}
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
                  title={t.retryTitle}
                  style={{
                    fontSize: 11.5, fontWeight: 600, color: "#7C63C8",
                    background: "transparent", border: "1px solid rgba(124,99,200,0.3)",
                    borderRadius: 8, padding: "5px 11px", cursor: "pointer",
                    fontFamily: "inherit",
                    display: "inline-flex", alignItems: "center", gap: 5,
                  }}
                >
                  {t.retryParsingIcon}
                </button>
              </div>
            )}
          </section>

          {/* Tags */}
          <Section title={t.tags}>
            <TagPicker
              value={customTagsOf(candidate.tags)}
              suggestions={tagSuggestions}
              onChange={saveTags}
              saving={tagsSaving}
              placeholder={t.tagsPlaceholder}
            />
          </Section>

          {/* Parsed CV */}
          <section style={{
            background: "white", borderRadius: 16, border: "1px solid #F0ECF8",
            overflow: "hidden",
          }}>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 22 }}>
              {cv?.summary && (
                <SubSection title={t.summary}>
                  <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>{cv.summary}</p>
                </SubSection>
              )}

              {cv?.experience && cv.experience.length > 0 && (
                <SubSection title={t.experienceTitle}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {cv.experience.map((e, i) => <ExperienceItem key={i} e={e} />)}
                  </div>
                </SubSection>
              )}

              {((candidate.skills && candidate.skills.length > 0) || (cv?.qualities && cv.qualities.length > 0)) && (
                <SubSection title={t.skills}>
                  {candidate.skills && candidate.skills.length > 0 && (
                    <div>
                      <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#7C63C8", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        {t.technicalSkills}
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
                        {t.softSkills}
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
                <SubSection title={t.education}>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                    {cv.education.map((ed, i) => (
                      <li key={i} style={{ fontSize: 13.5, color: "#374151", lineHeight: 1.55 }}>
                        <strong style={{ color: "#111827" }}>{ed.degree}</strong>
                        {ed.field ? `, ${ed.field}` : ""}
                        {ed.school ? <> — <span style={{ color: "#6B7280" }}>{ed.school}</span></> : null}
                        {(ed.start || ed.end) && (
                          <span style={{ color: "#6B7280", marginLeft: 8 }}>· {ed.start ?? ""}{ed.end ? `–${ed.end}` : ""}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </SubSection>
              )}

              {((cv?.languages && cv.languages.length > 0) || (cv?.certifications && cv.certifications.length > 0)) && (
                <SubSection title={t.other}>
                  {cv.languages && cv.languages.length > 0 && (
                    <p style={{ margin: "0 0 8px", fontSize: 13, color: "#374151" }}>
                      <strong style={{ color: "#111827" }}>{t.languagesLabel}</strong> {cv.languages.join(" · ")}
                    </p>
                  )}
                  {cv.certifications && cv.certifications.length > 0 && (
                    <p style={{ margin: 0, fontSize: 13, color: "#374151" }}>
                      <strong style={{ color: "#111827" }}>{t.certificationsLabel}</strong> {cv.certifications.join(" · ")}
                    </p>
                  )}
                </SubSection>
              )}
            </div>
          </section>

          {/* Notes */}
          <Section
            title={t.notes}
            right={savingNotes === "saving" ? <SmallStatus color="#7C63C8" label={t.saving} />
              : savingNotes === "saved" ? <SmallStatus color="#16a34a" label={t.saved} /> : null}
          >
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder={t.notesPlaceholder}
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

        {/* RIGHT — Missions matchées + CV original. Not sticky anymore — the
            PDF iframe makes the column taller than the viewport, so it
            scrolls along with the left content. */}
        <aside style={{
          display: "flex", flexDirection: "column", gap: 14,
        }} className="cand-aside">
          <section style={{
            background: "white", borderRadius: 16, border: "1px solid #F0ECF8",
            padding: 18,
          }}>
            <h3 style={{
              margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "#6B7280",
              letterSpacing: "0.08em", textTransform: "uppercase",
            }}>
              {t.matchedJobs}
            </h3>
            {jobMatches.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>
                {t.noMatchedJobs}
                {" "}<Link href="/workspace/missions" style={{ color: "#7C63C8", textDecoration: "none", fontWeight: 600 }}>
                  {t.launchMatching}
                </Link>
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {jobMatches.map((m) => {
                  const tier = m.match_tier ? TIER_COLOR[m.match_tier] : null
                  const isManual = m.score == null
                  return (
                    <Link key={m.id} href={`/workspace/match/${m.id}`} style={{
                      display: "block",
                      padding: "10px 12px",
                      background: tier ? tier.bg : "rgba(124,99,200,0.06)",
                      border: `1px solid ${tier ? tier.bd : "rgba(124,99,200,0.18)"}`,
                      borderRadius: 10, textDecoration: "none",
                      transition: "transform 120ms",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{
                          fontSize: 13.5, fontWeight: 700, color: "#111827",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {m.job_title}
                        </span>
                        <span style={{
                          fontSize: 10.5, fontWeight: 700,
                          color: tier?.fg ?? "#7C63C8",
                          background: "white",
                          border: `1px solid ${tier?.bd ?? "rgba(124,99,200,0.22)"}`,
                          padding: "2px 7px", borderRadius: 100, flexShrink: 0,
                        }}>
                          {isManual ? t.manual : `${m.score} · ${m.match_tier}`}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 11, color: "#6B7280" }}>
                          {STAGE_LABELS[lang][m.pipeline_stage] ?? m.pipeline_stage}
                        </span>
                        <span style={{ fontSize: 11, color: "#7C63C8", fontWeight: 700 }}>
                          {t.openTriangle}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
            <p style={{
              margin: "12px 0 0", fontSize: 11, color: "#6B7280",
              lineHeight: 1.55, fontStyle: "italic",
            }}>
              {t.matchHint}
            </p>
          </section>

          {/* CV original — colonne droite, juste sous les missions matchées.
              La fiche étant maintenant légère, l'aperçu PDF ne pollue
              plus la page principale. */}
          <section style={{
            background: "white", borderRadius: 16, border: "1px solid #F0ECF8",
            overflow: "hidden",
          }}>
            <div style={{
              padding: "12px 16px", borderBottom: "1px solid #F0ECF8",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <h3 style={{
                margin: 0, fontSize: 12, fontWeight: 700, color: "#6B7280",
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}>
                {t.originalCv}
              </h3>
              {signedUrl && (
                <a href={signedUrl} target="_blank" rel="noreferrer" style={{
                  fontSize: 11, fontWeight: 700, color: "#7C63C8",
                  textDecoration: "none",
                }}>
                  {t.openExternal}
                </a>
              )}
            </div>
            {signedUrl ? (
              <iframe
                src={signedUrl}
                title={candidate.cv_file_name ?? "CV"}
                style={{ width: "100%", height: 600, border: "none", display: "block" }}
              />
            ) : (
              <p style={{ margin: 0, padding: 24, fontSize: 13, color: "#6B7280" }}>
                {candidate.cv_file_path ? t.preparingPreview : t.noPdf}
              </p>
            )}
          </section>
        </aside>
      </m.div>

      <style>{`
        .cand-grid {
          display: grid;
          gap: 22px;
          grid-template-columns: minmax(0, 1fr) minmax(300px, 380px);
        }
        @media (max-width: 1000px) {
          .cand-grid { grid-template-columns: 1fr !important; }
          .cand-aside { position: static !important; }
        }
      `}</style>
    </main>
  )
}

/* ─── Sub-components ──────────────────────────────────────────── */

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={{
      background: "white", borderRadius: 16, border: "1px solid #F0ECF8",
      padding: 20,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <h2 style={{
          margin: 0, fontSize: 12, fontWeight: 700, color: "#6B7280",
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

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{
        margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#6B7280",
        letterSpacing: "0.08em", textTransform: "uppercase",
      }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

type ProfileBrand = "linkedin" | "github" | "malt" | "portfolio"

const PROFILE_BRANDS: Record<ProfileBrand, { label: string; color: string; path: string }> = {
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

/* Bouton "Voir le pricing" — direct si 1 seule mission en pipeline, dropdown
 * si N missions. Caché quand le candidat n'est sur aucune mission active. */
export function PricingShortcut({ matches }: { matches: JobMatch[] }) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const [open, setOpen] = useState(false)
  const pipelineMatches = matches.filter((m) => m.in_pipeline)
  if (pipelineMatches.length === 0) return null

  const btnStyle: React.CSSProperties = {
    fontFamily: "inherit", fontSize: 12, fontWeight: 700,
    color: "white",
    padding: "7px 12px", borderRadius: 9,
    background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
    border: "1px solid rgba(124,99,200,0.40)",
    cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 6,
  }

  if (pipelineMatches.length === 1) {
    const only = pipelineMatches[0]
    return (
      <Link href={`/workspace/pricing/${only.job_id}`} style={{ ...btnStyle, textDecoration: "none" }}>
        {t.viewPricing}
      </Link>
    )
  }

  // Plusieurs missions → dropdown
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} style={btnStyle}>
        {t.viewPricing}
        <span style={{ fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60,
            background: "white", border: "1px solid #E9E2F7", borderRadius: 10,
            boxShadow: "0 8px 28px rgba(124,99,200,0.18)",
            padding: 6, minWidth: 260, maxHeight: 320, overflowY: "auto",
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "#6B7280",
              letterSpacing: "0.05em", textTransform: "uppercase",
              padding: "6px 10px 4px",
            }}>
              {t.chooseJob}
            </div>
            {pipelineMatches.map((m) => (
              <Link key={m.id} href={`/workspace/pricing/${m.job_id}`} style={{
                display: "block", fontSize: 12.5, color: "#374151", fontWeight: 600,
                padding: "8px 10px", borderRadius: 7, textDecoration: "none",
              }}>
                {m.job_title}
                {m.score != null && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: "#6B7280" }}>· {m.score}</span>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* Réf candidat — même valeur que celle imprimée dans le PDF anonymisé.
 * Affichée en badge violet pour la repérer immédiatement (utile quand le
 * client rappelle "ah le candidat C-1A2B3C4D…"). */
export function RefBadge({ candidateId }: { candidateId: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10.5, fontWeight: 700, color: "#7C63C8",
      letterSpacing: "0.04em",
      background: "rgba(124,99,200,0.08)",
      border: "1px solid rgba(124,99,200,0.22)",
      borderRadius: 7,
      padding: "2px 8px",
      fontFamily: "var(--font-space-grotesk), monospace",
    }}>
      Ref · {candidateRefLabel(candidateId)}
    </span>
  )
}

function ProfileButton({ href, brand }: { href: string | null; brand: ProfileBrand }) {
  const { lang } = useLanguage()
  const t = copy[lang]
  if (!href) return null
  const b = PROFILE_BRANDS[brand]
  const label = brand === "portfolio" ? t.website : b.label
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={t.openProfile(label)}
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
      {label}
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
      <span style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", letterSpacing: "0.06em", textTransform: "uppercase" }}>
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
      <p style={{ margin: "2px 0 6px", fontSize: 11.5, color: "#6B7280" }}>
        {dateLabel}{e.location ? ` · ${e.location}` : ""}
      </p>
      {e.description && (
        <p style={{ margin: 0, fontSize: 13, color: "#4B5563", lineHeight: 1.6 }}>{e.description}</p>
      )}
    </div>
  )
}

function CvHealthBar({ cv }: { cv: ParsedCv | null }) {
  const { lang: uiLang } = useLanguage()
  const t = copy[uiLang]
  if (!cv) return null
  const score = typeof cv.completeness === "number" ? cv.completeness : null
  const cvLang = cv.language ?? null
  const warnings = Array.isArray(cv.warnings) ? cv.warnings : []
  if (score == null && !cvLang && warnings.length === 0) return null

  const tier = score == null ? null
    : score >= 75 ? { label: t.cvComplete, fg: "#15803d", bg: "rgba(34,197,94,0.10)", bd: "rgba(34,197,94,0.3)" }
    : score >= 40 ? { label: t.cvPartial,  fg: "#B45309", bg: "rgba(245,158,11,0.10)", bd: "rgba(245,158,11,0.3)" }
    :               { label: t.cvPoor,     fg: "#B91C1C", bg: "rgba(220,38,38,0.10)", bd: "rgba(220,38,38,0.3)" }

  return (
    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {tier && (
          <span title={t.completenessTitle(score!)} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 11, fontWeight: 700, color: tier.fg,
            background: tier.bg, border: `1px solid ${tier.bd}`,
            borderRadius: 100, padding: "3px 9px",
          }}>
            {tier.label} <span style={{ opacity: 0.7 }}>· {score}/100</span>
          </span>
        )}
        {cvLang && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: "#4B5563",
            background: "#F3F4F6", border: "1px solid #E5E7EB",
            borderRadius: 100, padding: "3px 9px",
          }}>
            {t.cvInLang(LANGUAGE_LABEL[uiLang][cvLang] ?? cvLang.toUpperCase())}
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
