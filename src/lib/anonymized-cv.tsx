/**
 * Anonymized CV template — v2.
 *
 * Philosophie (vague 2) :
 *   - On préserve le FOND du CV tel que parsé : expériences, formations,
 *     descriptions, dates, ordre d'origine. Pas de réorganisation par
 *     pertinence ni de mise en avant de skills "alignées au poste". Le
 *     candidat reste le candidat — on ne triche pas sur son CV.
 *   - On anonymise UNIQUEMENT l'identité : nom, prénom, email, téléphone,
 *     photo, adresse précise, écoles. Les sociétés où il a bossé restent
 *     visibles (c'est du factuel pertinent pour le client).
 *   - On ajoute un en-tête mission "Présenté pour : <titre>" et,
 *     juste en dessous, un executive summary court (LLM) qui explique en
 *     2-3 phrases formelles pourquoi le profil est pertinent. Le reste
 *     du CV est intouché.
 *
 *   - Branding : logo + nom du cabinet en haut, ref candidat à droite.
 */

import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer"
import type { ParsedCv, Candidate } from "./database.types"

const DEFAULT_PURPLE = "#7C63C8"
const INK = "#1F2937"
const MUTED = "#6B7280"
const LINE = "#E5E1F2"

const DEFAULT_BRAND = "NAYWA STUDIO"

/** Construit le stylesheet PDF en injectant la couleur de marque du
 *  cabinet (par défaut violet Naywa). On ne met pas la couleur dans le
 *  StyleSheet global pour éviter une couleur figée à l'import : chaque
 *  rendu reprend la couleur de l'org en cours. */
function buildStyles(accent: string) {
  return StyleSheet.create({
    page: { paddingTop: 44, paddingBottom: 64, paddingHorizontal: 52, fontSize: 10, color: INK, fontFamily: "Helvetica" },

    brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
    brand: { fontSize: 11, fontFamily: "Helvetica-Bold", color: accent, letterSpacing: 1 },
    brandSlogan: { fontSize: 8.5, color: MUTED, marginTop: 2, fontStyle: "italic" },
    brandTag: { fontSize: 8, color: MUTED, letterSpacing: 0.5 },
    rule: { borderBottomWidth: 1.4, borderBottomColor: accent, marginTop: 8, marginBottom: 18 },

    preheadline: { fontSize: 8.5, color: accent, fontFamily: "Helvetica-Bold", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 },
    headline: { fontSize: 20, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 14, marginTop: 0 },

    /** Executive summary — phrase d'accroche mission-oriented (LLM). */
    execSummary: { fontSize: 10.5, color: "#374151", lineHeight: 1.6, marginBottom: 18, fontStyle: "italic" },

    metaRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16 },
    metaItem: { marginRight: 22, marginBottom: 4 },
    metaLabel: { fontSize: 7, color: MUTED, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 2 },
    metaValue: { fontSize: 10, color: INK, fontFamily: "Helvetica-Bold" },

    sectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: MUTED, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, marginTop: 4 },

    expItem: { marginBottom: 10, paddingLeft: 12, borderLeftWidth: 1.5, borderLeftColor: LINE },
    expTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: INK },
    expCompany: { fontSize: 9.5, color: MUTED },
    expDate: { fontSize: 8, color: "#9CA3AF", marginTop: 1, marginBottom: 3 },
    expDesc: { fontSize: 9, color: "#4B5563", lineHeight: 1.5 },

    chipRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 14 },
    chip: { fontSize: 8.5, color: "#4B5563", backgroundColor: "#F4F1FB", borderWidth: 1, borderColor: LINE, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6, marginRight: 5, marginBottom: 5 },

    eduItem: { marginBottom: 5 },
    eduDegree: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: INK },
    eduMeta: { fontSize: 8.5, color: MUTED },

    footer: { position: "absolute", bottom: 28, left: 52, right: 52, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8 },
    footerTopRow: { flexDirection: "row", justifyContent: "space-between" },
    footerContact: { fontSize: 7.5, color: MUTED, marginTop: 3 },
    footerText: { fontSize: 7.5, color: "#9CA3AF" },
  })
}

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
  /** Hex color (#RRGGBB) used as accent in the PDF. Falls back to Naywa
   *  violet when null. */
  color?: string | null
  /** Slogan court affiché sous le nom du cabinet (header). Optionnel. */
  slogan?: string | null
  /** Mail de contact générique imprimé en pied de page pour permettre
   *  au client final de recontacter au sujet du candidat. Optionnel. */
  contactEmail?: string | null
}

const norm = (s: string) => s.toLowerCase().trim()

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

export function AnonymizedCv({
  candidate,
  reference,
  job = null,
  brand = null,
  executiveSummary = null,
}: {
  candidate: Candidate
  reference: string
  job?: AnonymizedJobContext | null
  brand?: AnonymizedBrand | null
  /** Executive summary mission-oriented, produit côté serveur par le LLM.
   *  Si null, on retombe sur cv.summary tel que parsé (sans orientation). */
  executiveSummary?: string | null
}) {
  const brandName = (brand?.name ?? "").trim() || DEFAULT_BRAND
  const brandLogo = brand?.logoUrl ?? null
  // Sanity-check hex côté rendu : si la valeur DB est malformée, on
  // retombe sur Naywa violet pour ne jamais casser le PDF.
  const accentRaw = (brand?.color ?? "").trim()
  const accent = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(accentRaw) ? accentRaw : DEFAULT_PURPLE
  const brandSlogan = (brand?.slogan ?? "").trim() || null
  const contactEmail = (brand?.contactEmail ?? "").trim() || null
  const s = buildStyles(accent)
  const cv: ParsedCv = candidate.parsed_cv ?? {}
  const roleFamily = candidate.taxonomy?.role_family?.[0] ?? null
  const seniority = candidate.seniority_level ?? cv.seniority_level ?? null
  const years = candidate.years_experience ?? cv.years_experience ?? null
  // Compétences : on ne réordonne PAS par pertinence mission. Le client lit
  // le CV tel qu'il est, sans tri orienté. Juste dédupe + cap raisonnable.
  const skills = dedupe(
    (candidate.taxonomy?.core_skills?.length
      ? candidate.taxonomy.core_skills
      : (candidate.skills ?? [])),
  ).slice(0, 24)
  // Expériences : ordre d'origine du parser (qui suit le CV — généralement
  // antichronologique). On NE pousse PAS les expériences "pertinentes mission"
  // en haut : préserver le fond, c'est respecter le récit du candidat.
  const experience = cv.experience ?? []
  const education = cv.education ?? []
  const languages = cv.languages ?? candidate.languages ?? []

  // Texte d'en-tête : si on a un contexte mission, on l'affiche au-dessus
  // du H1 comme un "présenté pour", et le H1 reste le titre formel mission.
  // Sinon, fallback : titre courant du candidat ou son role_family.
  const hasJob = !!job
  const headline = job ? job.title : (candidate.current_title ?? roleFamily ?? "Profil professionnel")

  // Choix du résumé affiché : executive summary mission-oriented si dispo,
  // sinon cv.summary tel que parsé (résumé que le candidat avait écrit).
  const summaryText = executiveSummary?.trim() || cv.summary?.trim() || null

  return (
    <Document title={`Profil anonymisé ${reference}${job ? ` — ${job.title}` : ""}`} author={brandName}>
      <Page size="A4" style={s.page}>
        {/* Brand header — logo (if set) + cabinet name + optional slogan
            on the left, reference on the right. */}
        <View style={s.brandRow}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {brandLogo && (
              // @react-pdf Image doesn't expose alt; jsx-a11y rule is irrelevant here.
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={brandLogo} style={{ height: 56, maxWidth: 200, marginRight: 12, objectFit: "contain" }} />
            )}
            <View>
              <Text style={s.brand}>{brandName.toUpperCase()}</Text>
              {brandSlogan && <Text style={s.brandSlogan}>{brandSlogan}</Text>}
            </View>
          </View>
          <Text style={s.brandTag}>Réf. {reference}</Text>
        </View>
        <View style={s.rule} />

        {/* Headline — "Présenté pour : <mission>" quand on est mission-oriented,
            sinon simple titre courant du candidat. */}
        {hasJob && <Text style={s.preheadline}>Présenté pour</Text>}
        <Text style={s.headline}>{headline}</Text>

        {/* Executive summary — LLM 2-3 phrases formelles si on a un job.
            Fallback sur cv.summary tel que parsé sinon. */}
        {summaryText && (
          <Text style={s.execSummary}>{summaryText}</Text>
        )}

        {/* Meta — séniorité / XP / zone / langues. Pas d'adresse précise,
            seulement la zone (ville/région) qui est utile pour la mission. */}
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

        {/* Skills — telles que parsées (pas de highlight mission). */}
        {skills.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Compétences clés</Text>
            <View style={s.chipRow}>
              {skills.map((sk, i) => (
                <Text key={i} style={s.chip}>{sk}</Text>
              ))}
            </View>
          </>
        )}

        {/* Expérience — ordre d'origine, descriptions intactes. */}
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

        {/* Formation — degré + filière, école retirée pour anonymat. */}
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

        {/* Footer — nom cabinet + ref candidat. Si un mail de contact
            cabinet est renseigné, on l'imprime en dessous pour
            permettre au client final de recontacter. */}
        <View style={s.footer} fixed>
          <View style={s.footerTopRow}>
            <Text style={s.footerText}>{brandName}</Text>
            <Text style={s.footerText}>Réf. {reference}</Text>
          </View>
          {contactEmail && (
            <Text style={s.footerContact}>
              Pour échanger sur ce profil : {contactEmail}
            </Text>
          )}
        </View>
      </Page>
    </Document>
  )
}
