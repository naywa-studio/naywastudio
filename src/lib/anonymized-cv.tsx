/**
 * Anonymized CV template — Sprint 2, single "Naywa" template,
 * Sprint 6.x: now oriented towards a specific job when one is supplied.
 *
 * Built from the structured `parsed_cv`, NOT the original PDF, so the output
 * is fully controlled: no name, no photo, no contact details, no precise
 * school names. Experience (titles + companies) is kept — that's what makes
 * a profile worth presenting.
 *
 * When a `job` context is passed, the document is reoriented around it:
 *   - title shows the job's title ("Présenté pour : <job>")
 *   - skills that match the job's must-have / required list are pinned at
 *     the top of the chip row and emphasised
 *   - experiences relevant to the dominant role family (counts_toward_role)
 *     are listed first
 *
 * Later: multi-template + client logo upload (the client uploads their
 * logo / company name and it replaces the Naywa brand). Hooks for this
 * are isolated in BRAND_NAME below — swap when ready.
 */

import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer"
import type { ParsedCv, ParsedExperience, Candidate } from "./database.types"

const PURPLE = "#7C63C8"
const PURPLE_DEEP = "#5B45A3"
const INK = "#1F2937"
const MUTED = "#6B7280"
const LINE = "#E5E1F2"
const SOFT_HL = "#EEE9FB"

const DEFAULT_BRAND = "NAYWA STUDIO"

const s = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 56, paddingHorizontal: 52, fontSize: 10, color: INK, fontFamily: "Helvetica" },

  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  brand: { fontSize: 11, fontFamily: "Helvetica-Bold", color: PURPLE, letterSpacing: 1 },
  brandTag: { fontSize: 8, color: MUTED, letterSpacing: 0.5 },
  rule: { borderBottomWidth: 1.4, borderBottomColor: PURPLE, marginTop: 8, marginBottom: 18 },

  pitchBlock: { marginBottom: 16, backgroundColor: SOFT_HL, borderRadius: 4, paddingVertical: 10, paddingHorizontal: 14 },
  pitchLabel: { fontSize: 7.5, color: PURPLE_DEEP, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 },
  pitchTitle: { fontSize: 16, fontFamily: "Helvetica-Bold", color: INK },
  pitchMeta: { fontSize: 9, color: MUTED, marginTop: 2 },

  headline: { fontSize: 18, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 4 },
  subline: { fontSize: 10.5, color: PURPLE, fontFamily: "Helvetica-Bold", marginBottom: 14 },

  metaRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16 },
  metaItem: { marginRight: 22, marginBottom: 4 },
  metaLabel: { fontSize: 7, color: MUTED, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 2 },
  metaValue: { fontSize: 10, color: INK, fontFamily: "Helvetica-Bold" },

  sectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: MUTED, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, marginTop: 4 },
  summary: { fontSize: 10, color: "#374151", lineHeight: 1.55, marginBottom: 16 },

  expItem: { marginBottom: 10, paddingLeft: 12, borderLeftWidth: 1.5, borderLeftColor: LINE },
  expItemHL: { marginBottom: 10, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: PURPLE },
  expTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: INK },
  expCompany: { fontSize: 9.5, color: MUTED },
  expDate: { fontSize: 8, color: "#9CA3AF", marginTop: 1, marginBottom: 3 },
  expDesc: { fontSize: 9, color: "#4B5563", lineHeight: 1.5 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 14 },
  chip: { fontSize: 8.5, color: "#4B5563", backgroundColor: "#F4F1FB", borderWidth: 1, borderColor: LINE, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6, marginRight: 5, marginBottom: 5 },
  chipHL: { fontSize: 8.5, color: "white", backgroundColor: PURPLE, borderWidth: 1, borderColor: PURPLE, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6, marginRight: 5, marginBottom: 5 },

  eduItem: { marginBottom: 5 },
  eduDegree: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: INK },
  eduMeta: { fontSize: 8.5, color: MUTED },

  footer: { position: "absolute", bottom: 28, left: 52, right: 52, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8 },
  footerText: { fontSize: 7.5, color: "#9CA3AF" },
})

export interface AnonymizedJobContext {
  title: string
  seniority: string | null
  location: string | null
  required_skills: string[]
  nice_to_have_skills: string[]
  must_have_skills: string[]
  role_family: string | null
}

export interface AnonymizedBrand {
  /** Cabinet / client name. Falls back to "NAYWA STUDIO" when null. */
  name: string | null
  /** Signed URL to the brand logo PNG/JPG. Optional — text-only fallback works. */
  logoUrl: string | null
}

const norm = (s: string) => s.toLowerCase().trim()

/** Order skills by job relevance: must-have first, then required, then
 *  nice-to-have, then the rest. Returns the reordered list + a Set of
 *  the ones flagged as job-relevant (for highlighting). */
function pickAndOrderSkills(
  candidateSkills: string[],
  job: AnonymizedJobContext | null,
  cap = 16,
): { ordered: string[]; highlighted: Set<string> } {
  if (!job) {
    return { ordered: dedupe(candidateSkills).slice(0, cap), highlighted: new Set() }
  }
  const jobAll = [...job.must_have_skills, ...job.required_skills, ...job.nice_to_have_skills]
  const jobSet = new Set(jobAll.map(norm))
  const matched: string[] = []
  const rest: string[] = []
  for (const s of dedupe(candidateSkills)) {
    if (jobSet.has(norm(s))) matched.push(s)
    else rest.push(s)
  }
  const ordered = [...matched, ...rest].slice(0, cap)
  return { ordered, highlighted: new Set(matched.map(norm)) }
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of arr) {
    if (!x) continue
    const k = norm(x)
    if (seen.has(k)) continue
    seen.add(k); out.push(x)
  }
  return out
}

/** Reorder experiences so the ones marked relevant to the dominant role
 *  appear first. Within each group, original chronological order is kept. */
function orderExperiences(exps: ParsedExperience[]): { items: ParsedExperience[]; relevantCount: number } {
  const relevant = exps.filter((e) => e.counts_toward_role !== false)
  const others = exps.filter((e) => e.counts_toward_role === false)
  return { items: [...relevant, ...others], relevantCount: relevant.length }
}

export function AnonymizedCv({
  candidate,
  reference,
  job = null,
  brand = null,
}: {
  candidate: Candidate
  reference: string
  job?: AnonymizedJobContext | null
  brand?: AnonymizedBrand | null
}) {
  const brandName = (brand?.name ?? "").trim() || DEFAULT_BRAND
  const brandLogo = brand?.logoUrl ?? null
  const cv: ParsedCv = candidate.parsed_cv ?? {}
  const roleFamily = candidate.taxonomy?.role_family?.[0] ?? null
  const seniority = candidate.seniority_level ?? cv.seniority_level ?? null
  const years = candidate.years_experience ?? cv.years_experience ?? null
  const candSkills = (candidate.taxonomy?.core_skills?.length
    ? candidate.taxonomy.core_skills
    : (candidate.skills ?? []))
  const { ordered: skills, highlighted } = pickAndOrderSkills(candSkills, job)
  const { items: experience, relevantCount } = orderExperiences(cv.experience ?? [])
  const education = cv.education ?? []
  const languages = cv.languages ?? candidate.languages ?? []

  // Headline strategy:
  //  - If a job is passed: the dominant headline is the JOB title, with
  //    the candidate's current role as a discreet subtitle context.
  //  - Otherwise: the candidate's current title (or their role family).
  const headline = job ? job.title : (candidate.current_title ?? roleFamily ?? "Profil professionnel")
  const subline = job
    ? (candidate.current_title ? `Profil actuel : ${candidate.current_title}` : (roleFamily ?? null))
    : (roleFamily && roleFamily !== headline ? roleFamily : null)

  return (
    <Document title={`Profil anonymisé ${reference}${job ? ` — ${job.title}` : ""}`} author={brandName}>
      <Page size="A4" style={s.page}>
        {/* Brand header — logo (if set) + cabinet name on the left,
            reference + "anonymised profile" tag on the right. */}
        <View style={s.brandRow}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {brandLogo && (
              // @react-pdf Image doesn't expose alt; jsx-a11y rule is irrelevant here.
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={brandLogo} style={{ maxHeight: 22, maxWidth: 80, marginRight: 8, objectFit: "contain" }} />
            )}
            <Text style={s.brand}>{brandName.toUpperCase()}</Text>
          </View>
          <Text style={s.brandTag}>Profil anonymisé · Réf. {reference}</Text>
        </View>
        <View style={s.rule} />

        {/* Job pitch banner — only when oriented to a specific job */}
        {job && (
          <View style={s.pitchBlock}>
            <Text style={s.pitchLabel}>Profil présenté pour le poste</Text>
            <Text style={s.pitchTitle}>{job.title}</Text>
            {(job.seniority || job.location) && (
              <Text style={s.pitchMeta}>
                {[job.seniority, job.location].filter(Boolean).join(" · ")}
              </Text>
            )}
          </View>
        )}

        {/* Headline + subline */}
        <Text style={s.headline}>{headline}</Text>
        {subline && <Text style={s.subline}>{subline}</Text>}

        {/* Meta row — keep only what's not already obvious from the pitch */}
        <View style={s.metaRow}>
          {seniority && (
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>Séniorité</Text>
              <Text style={s.metaValue}>{seniority}</Text>
            </View>
          )}
          {years != null && (
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>Expérience</Text>
              <Text style={s.metaValue}>{years} an{years > 1 ? "s" : ""}</Text>
            </View>
          )}
          {candidate.location && (
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>Zone</Text>
              <Text style={s.metaValue}>{candidate.location}</Text>
            </View>
          )}
          {languages.length > 0 && (
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>Langues</Text>
              <Text style={s.metaValue}>{languages.join(" · ")}</Text>
            </View>
          )}
        </View>

        {/* Summary */}
        {cv.summary && (
          <>
            <Text style={s.sectionTitle}>Résumé</Text>
            <Text style={s.summary}>{cv.summary}</Text>
          </>
        )}

        {/* Skills — job-relevant ones first, highlighted */}
        {skills.length > 0 && (
          <>
            <Text style={s.sectionTitle}>
              {job ? "Compétences clés (alignées au poste)" : "Compétences clés"}
            </Text>
            <View style={s.chipRow}>
              {skills.map((sk, i) => (
                <Text key={i} style={highlighted.has(norm(sk)) ? s.chipHL : s.chip}>
                  {sk}
                </Text>
              ))}
            </View>
          </>
        )}

        {/* Experience — relevant-to-role first */}
        {experience.length > 0 && (
          <>
            <Text style={s.sectionTitle}>
              {job && relevantCount > 0 && relevantCount < experience.length
                ? "Parcours (expériences les plus pertinentes en premier)"
                : "Parcours"}
            </Text>
            {experience.map((e, i) => {
              const dates = [e.start, e.end ?? "présent"].filter(Boolean).join(" – ")
              const isRelevant = e.counts_toward_role !== false
              return (
                <View key={i} style={job && isRelevant ? s.expItemHL : s.expItem} wrap={false}>
                  <Text style={s.expTitle}>{e.title || "Poste"}</Text>
                  {e.company ? <Text style={s.expCompany}>{e.company}</Text> : null}
                  {dates ? <Text style={s.expDate}>{dates}</Text> : null}
                  {e.description ? <Text style={s.expDesc}>{e.description}</Text> : null}
                </View>
              )
            })}
          </>
        )}

        {/* Education — degree + field only, school name dropped for anonymity.
            We previously showed "Établissement non communiqué" on every row;
            it added visual noise without info. Now we just show the degree. */}
        {education.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Formation</Text>
            {education.map((ed, i) => (
              <View key={i} style={s.eduItem}>
                <Text style={s.eduDegree}>
                  {ed.degree}{ed.field ? ` — ${ed.field}` : ""}
                </Text>
                {(ed.start || ed.end) && (
                  <Text style={s.eduMeta}>
                    {ed.start ?? ""}{ed.end ? `–${ed.end}` : ""}
                  </Text>
                )}
              </View>
            ))}
          </>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Document généré par {brandName} — identité retirée</Text>
          <Text style={s.footerText}>Réf. {reference}</Text>
        </View>
      </Page>
    </Document>
  )
}
