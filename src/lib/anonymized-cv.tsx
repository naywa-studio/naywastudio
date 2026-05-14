/**
 * Anonymized CV template — Sprint 2, single "Naywa" template.
 *
 * Built from the structured `parsed_cv`, NOT the original PDF, so the output
 * is fully controlled: no name, no photo, no contact details, no precise
 * school names. Experience (titles + companies) is kept — that's what makes
 * a profile worth presenting.
 *
 * Later: client logo upload + multiple templates (out of scope here).
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import type { ParsedCv, Candidate } from "./database.types"

const PURPLE = "#7C63C8"
const INK = "#1F2937"
const MUTED = "#6B7280"
const LINE = "#E5E1F2"

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 52, fontSize: 10, color: INK, fontFamily: "Helvetica" },
  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  brand: { fontSize: 11, fontFamily: "Helvetica-Bold", color: PURPLE, letterSpacing: 1 },
  brandTag: { fontSize: 8, color: MUTED, letterSpacing: 0.5 },
  rule: { borderBottomWidth: 1.4, borderBottomColor: PURPLE, marginTop: 8, marginBottom: 20 },

  headline: { fontSize: 19, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 3 },
  subline: { fontSize: 10.5, color: PURPLE, fontFamily: "Helvetica-Bold", marginBottom: 14 },

  metaRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 18 },
  metaItem: { marginRight: 22, marginBottom: 4 },
  metaLabel: { fontSize: 7, color: MUTED, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 2 },
  metaValue: { fontSize: 10, color: INK, fontFamily: "Helvetica-Bold" },

  sectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: MUTED, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, marginTop: 6 },
  summary: { fontSize: 10, color: "#374151", lineHeight: 1.55, marginBottom: 18 },

  expItem: { marginBottom: 12, paddingLeft: 12, borderLeftWidth: 1.5, borderLeftColor: LINE },
  expTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: INK },
  expCompany: { fontSize: 9.5, color: MUTED },
  expDate: { fontSize: 8, color: "#9CA3AF", marginTop: 1, marginBottom: 3 },
  expDesc: { fontSize: 9, color: "#4B5563", lineHeight: 1.5 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16 },
  chip: { fontSize: 8.5, color: "#4B5563", backgroundColor: "#F4F1FB", borderWidth: 1, borderColor: LINE, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6, marginRight: 5, marginBottom: 5 },

  eduItem: { marginBottom: 6 },
  eduDegree: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: INK },
  eduMeta: { fontSize: 8.5, color: MUTED },

  footer: { position: "absolute", bottom: 28, left: 52, right: 52, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8 },
  footerText: { fontSize: 7.5, color: "#9CA3AF" },
})

function genericSchool(): string {
  // Precise school names are intentionally dropped for anonymization.
  return "Établissement non communiqué"
}

export function AnonymizedCv({ candidate, reference }: { candidate: Candidate; reference: string }) {
  const cv: ParsedCv = candidate.parsed_cv ?? {}
  const roleFamily = candidate.taxonomy?.role_family?.[0]
  const headline = candidate.current_title ?? roleFamily ?? "Profil professionnel"
  const seniority = candidate.seniority_level ?? cv.seniority_level ?? null
  const years = candidate.years_experience ?? cv.years_experience ?? null
  const skills = (candidate.taxonomy?.core_skills?.length
    ? candidate.taxonomy.core_skills
    : (candidate.skills ?? [])).slice(0, 16)
  const experience = cv.experience ?? []
  const education = cv.education ?? []
  const languages = cv.languages ?? candidate.languages ?? []

  return (
    <Document title={`Profil anonymisé ${reference}`} author="Naywa Studio">
      <Page size="A4" style={s.page}>
        {/* Brand header */}
        <View style={s.brandRow}>
          <Text style={s.brand}>NAYWA STUDIO</Text>
          <Text style={s.brandTag}>Profil anonymisé · Réf. {reference}</Text>
        </View>
        <View style={s.rule} />

        {/* Headline */}
        <Text style={s.headline}>{headline}</Text>
        {roleFamily && headline !== roleFamily && <Text style={s.subline}>{roleFamily}</Text>}

        {/* Meta row */}
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

        {/* Skills */}
        {skills.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Compétences clés</Text>
            <View style={s.chipRow}>
              {skills.map((sk, i) => <Text key={i} style={s.chip}>{sk}</Text>)}
            </View>
          </>
        )}

        {/* Experience */}
        {experience.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Parcours</Text>
            {experience.map((e, i) => {
              const dates = [e.start, e.end ?? "présent"].filter(Boolean).join(" – ")
              return (
                <View key={i} style={s.expItem} wrap={false}>
                  <Text style={s.expTitle}>{e.title || "Poste"}</Text>
                  {e.company ? <Text style={s.expCompany}>{e.company}</Text> : null}
                  {dates ? <Text style={s.expDate}>{dates}</Text> : null}
                  {e.description ? <Text style={s.expDesc}>{e.description}</Text> : null}
                </View>
              )
            })}
          </>
        )}

        {/* Education — degree + field only, school name dropped */}
        {education.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Formation</Text>
            {education.map((ed, i) => (
              <View key={i} style={s.eduItem}>
                <Text style={s.eduDegree}>
                  {ed.degree}{ed.field ? ` — ${ed.field}` : ""}
                </Text>
                <Text style={s.eduMeta}>
                  {genericSchool()}{(ed.start || ed.end) ? ` · ${ed.start ?? ""}${ed.end ? `–${ed.end}` : ""}` : ""}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Document généré par Naywa Studio — identité retirée</Text>
          <Text style={s.footerText}>Réf. {reference}</Text>
        </View>
      </Page>
    </Document>
  )
}
