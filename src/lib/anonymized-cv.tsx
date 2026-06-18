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
    /** Message custom du sourceur — affiché sous le résumé Nora quand
     *  les deux coexistent, dans un encart sobre pour bien le distinguer. */
    customNote: {
      fontSize: 10, color: "#374151", lineHeight: 1.55,
      marginTop: -8, marginBottom: 18,
      paddingLeft: 10,
      borderLeftWidth: 2, borderLeftColor: accent,
    },

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

/**
 * Options de rendu choisies par le sourceur dans le panneau
 * "Personnaliser" de la fiche match. Toutes optionnelles, défauts
 * appliqués si absentes.
 */
/**
 * Identifiants des templates de PDF disponibles. "classic" = layout
 * mono-colonne historique (défaut). "two-column" = sidebar gauche
 * (skills + méta) + main droite (résumé, parcours, formation).
 */
export type AnonymizedTemplate = "classic" | "two-column"

export interface AnonymizedOptions {
  /** Template de layout. Défaut "classic". */
  template?: AnonymizedTemplate
  /** Afficher (true, défaut) ou masquer le résumé Nora. */
  keepNoraSummary?: boolean
  /** Message libre du sourceur, affiché sous le résumé Nora (ou
   *  seul si keepNoraSummary est false). Trim + max 600 chars
   *  recommandé côté caller. */
  customText?: string
  /** Filigrane diagonal "<NomCabinet>" en fond de toutes les pages. */
  watermark?: boolean
  /** Langue des labels section ("fr" défaut). Le contenu du CV
   *  reste dans sa langue d'origine. */
  language?: "fr" | "en"
}

/**
 * Labels traduits par section. On évite une lib i18n complète pour
 * éviter de payer un bundle PDF plus lourd ; le PDF n'a que 6 libellés
 * à traduire.
 */
const LABELS = {
  fr: {
    presentedFor: "Présenté pour",
    keySkills: "Compétences clés",
    background: "Parcours",
    education: "Formation",
    contactPrefix: "Pour échanger sur ce profil :",
    metaSeniority: "Séniorité",
    metaExperience: "Expérience",
    metaZone: "Zone",
    metaLanguages: "Langues",
    yearsSuffix: (n: number) => `${n} an${n > 1 ? "s" : ""}`,
  },
  en: {
    presentedFor: "Presented for",
    keySkills: "Key skills",
    background: "Experience",
    education: "Education",
    contactPrefix: "Contact about this profile:",
    metaSeniority: "Seniority",
    metaExperience: "Experience",
    metaZone: "Location",
    metaLanguages: "Languages",
    yearsSuffix: (n: number) => `${n} year${n > 1 ? "s" : ""}`,
  },
} as const

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
  options = null,
}: {
  candidate: Candidate
  reference: string
  job?: AnonymizedJobContext | null
  brand?: AnonymizedBrand | null
  /** Executive summary mission-oriented, produit côté serveur par le LLM.
   *  Si null, on retombe sur cv.summary tel que parsé (sans orientation). */
  executiveSummary?: string | null
  /** Choix du sourceur dans le panneau "Personnaliser" de la fiche match. */
  options?: AnonymizedOptions | null
}) {
  const opts: Required<AnonymizedOptions> = {
    template: options?.template ?? "classic",
    keepNoraSummary: options?.keepNoraSummary ?? true,
    customText: (options?.customText ?? "").trim(),
    watermark: options?.watermark ?? false,
    language: options?.language ?? "fr",
  }
  const t = LABELS[opts.language]
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
  // Si l'owner a décoché "Garder résumé Nora" dans la fiche match, on
  // ne montre aucun résumé auto — seul le custom text restera.
  const baseSummaryText = opts.keepNoraSummary
    ? (executiveSummary?.trim() || cv.summary?.trim() || null)
    : null
  const customSummaryText = opts.customText.length > 0 ? opts.customText : null
  // Filigrane = juste le nom du cabinet, façon "tampon" discret.
  // Pas de "Réf" devant : la ref est déjà imprimée en clair en haut
  // à droite et dans le footer, inutile de la redoubler en filigrane.
  const watermarkText = brandName

  // ─── Helpers partagés entre templates ────────────────────────────
  // (Closures qui capturent brand/labels/opts/styles depuis le scope
  // parent — évite de polluer la signature des sous-renders.)
  const renderBrandHeader = () => (
    <View style={s.brandRow}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {brandLogo && (
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
  )

  const renderWatermark = () =>
    opts.watermark ? (
      <View
        fixed
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontSize: 60,
            fontFamily: "Helvetica-Bold",
            color: accent,
            opacity: 0.08,
            transform: "rotate(-30deg)",
            letterSpacing: 6,
          }}
        >
          {watermarkText.toUpperCase()}
        </Text>
      </View>
    ) : null

  const renderFooter = () => (
    <View style={s.footer} fixed>
      <View style={s.footerTopRow}>
        <Text style={s.footerText}>{brandName}</Text>
        <Text style={s.footerText}>Réf. {reference}</Text>
      </View>
      {contactEmail && (
        <Text style={s.footerContact}>
          {t.contactPrefix} {contactEmail}
        </Text>
      )}
    </View>
  )

  // ─── Template 2 : two-column ─────────────────────────────────────
  if (opts.template === "two-column") {
    return (
      <Document title={`Profil anonymisé ${reference}${job ? ` — ${job.title}` : ""}`} author={brandName}>
        <Page size="A4" style={s.page}>
          {renderBrandHeader()}
          <View style={s.rule} />

          {hasJob && <Text style={s.preheadline}>{t.presentedFor}</Text>}
          <Text style={s.headline}>{headline}</Text>

          {/* Body — flex row : sidebar + main */}
          <View style={{ flexDirection: "row", gap: 16, marginTop: 6 }}>
            {/* Sidebar gauche : méta + skills */}
            <View style={{
              width: 165, padding: 12, borderRadius: 6,
              backgroundColor: "#F4F1FB",
              borderWidth: 0.5, borderColor: LINE,
            }}>
              {/* Méta empilées */}
              {seniority && (
                <View style={{ marginBottom: 10 }}>
                  <Text style={s.metaLabel}>{t.metaSeniority}</Text>
                  <Text style={s.metaValue}>{seniority}</Text>
                </View>
              )}
              {years != null && (
                <View style={{ marginBottom: 10 }}>
                  <Text style={s.metaLabel}>{t.metaExperience}</Text>
                  <Text style={s.metaValue}>{t.yearsSuffix(years)}</Text>
                </View>
              )}
              {candidate.location && (
                <View style={{ marginBottom: 10 }}>
                  <Text style={s.metaLabel}>{t.metaZone}</Text>
                  <Text style={s.metaValue}>{candidate.location}</Text>
                </View>
              )}
              {languages.length > 0 && (
                <View style={{ marginBottom: 14 }}>
                  <Text style={s.metaLabel}>{t.metaLanguages}</Text>
                  <Text style={s.metaValue}>{languages.join(" · ")}</Text>
                </View>
              )}

              {/* Skills empilées en chips compactes */}
              {skills.length > 0 && (
                <>
                  <Text style={{ ...s.sectionTitle, marginBottom: 6, marginTop: 2 }}>
                    {t.keySkills}
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    {skills.map((sk, i) => (
                      <Text key={i} style={{
                        ...s.chip,
                        backgroundColor: "white",
                        marginRight: 4,
                        marginBottom: 4,
                      }}>{sk}</Text>
                    ))}
                  </View>
                </>
              )}
            </View>

            {/* Main droite : résumé + parcours + formation */}
            <View style={{ flex: 1, minWidth: 0 }}>
              {baseSummaryText && (
                <Text style={s.execSummary}>{baseSummaryText}</Text>
              )}
              {customSummaryText && (
                <Text style={baseSummaryText ? s.customNote : s.execSummary}>
                  {customSummaryText}
                </Text>
              )}

              {experience.length > 0 && (
                <>
                  <Text style={s.sectionTitle}>{t.background}</Text>
                  {experience.map((e, i) => {
                    const dates = [e.start, e.end ?? (opts.language === "en" ? "present" : "présent")].filter(Boolean).join(" – ")
                    return (
                      <View key={i} style={s.expItem} wrap={false}>
                        <Text style={s.expTitle}>{e.title || (opts.language === "en" ? "Role" : "Poste")}</Text>
                        {e.company ? <Text style={s.expCompany}>{e.company}</Text> : null}
                        {dates ? <Text style={s.expDate}>{dates}</Text> : null}
                        {e.description ? <Text style={s.expDesc}>{e.description}</Text> : null}
                      </View>
                    )
                  })}
                </>
              )}

              {education.length > 0 && (
                <>
                  <Text style={s.sectionTitle}>{t.education}</Text>
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
            </View>
          </View>

          {renderWatermark()}
          {renderFooter()}
        </Page>
      </Document>
    )
  }

  // ─── Template 1 : classic (default) ──────────────────────────────
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
        {hasJob && <Text style={s.preheadline}>{t.presentedFor}</Text>}
        <Text style={s.headline}>{headline}</Text>

        {/* Executive summary — LLM 2-3 phrases factuelles si on a un job,
            puis (en plus ou seul) message custom du sourceur si renseigné. */}
        {baseSummaryText && (
          <Text style={s.execSummary}>{baseSummaryText}</Text>
        )}
        {customSummaryText && (
          <Text style={baseSummaryText ? s.customNote : s.execSummary}>
            {customSummaryText}
          </Text>
        )}

        {/* Meta — séniorité / XP / zone / langues. Pas d'adresse précise,
            seulement la zone (ville/région) qui est utile pour la mission. */}
        <View style={s.metaRow}>
          {seniority && (
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>{t.metaSeniority}</Text>
              <Text style={s.metaValue}>{seniority}</Text>
            </View>
          )}
          {years != null && (
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>{t.metaExperience}</Text>
              <Text style={s.metaValue}>{t.yearsSuffix(years)}</Text>
            </View>
          )}
          {candidate.location && (
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>{t.metaZone}</Text>
              <Text style={s.metaValue}>{candidate.location}</Text>
            </View>
          )}
          {languages.length > 0 && (
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>{t.metaLanguages}</Text>
              <Text style={s.metaValue}>{languages.join(" · ")}</Text>
            </View>
          )}
        </View>

        {/* Skills — telles que parsées (pas de highlight mission). */}
        {skills.length > 0 && (
          <>
            <Text style={s.sectionTitle}>{t.keySkills}</Text>
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
            <Text style={s.sectionTitle}>{t.background}</Text>
            {experience.map((e, i) => {
              const dates = [e.start, e.end ?? (opts.language === "en" ? "present" : "présent")].filter(Boolean).join(" – ")
              return (
                <View key={i} style={s.expItem} wrap={false}>
                  <Text style={s.expTitle}>{e.title || (opts.language === "en" ? "Role" : "Poste")}</Text>
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
            <Text style={s.sectionTitle}>{t.education}</Text>
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

        {/* Watermark diagonal — fixed sur toutes les pages, opacity
            très basse pour rester lisible. On le rend APRÈS le contenu
            principal pour qu'il passe au-dessus visuellement. Toggle
            depuis le panneau "Personnaliser" de la fiche match. */}
        {opts.watermark && (
          <View
            fixed
            style={{
              position: "absolute",
              top: 0, left: 0, right: 0, bottom: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontSize: 60,
                fontFamily: "Helvetica-Bold",
                color: accent,
                opacity: 0.08,
                transform: "rotate(-30deg)",
                letterSpacing: 6,
              }}
            >
              {watermarkText.toUpperCase()}
            </Text>
          </View>
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
              {t.contactPrefix} {contactEmail}
            </Text>
          )}
        </View>
      </Page>
    </Document>
  )
}
