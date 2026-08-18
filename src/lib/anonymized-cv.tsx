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
import type { Candidate } from "./database.types"
// Le CONTENU du document est décidé dans le modèle partagé, jamais ici : ce
// fichier ne fait plus que l'habiller. L'aperçu éditable du workspace appelle
// exactement la même fonction, ce qui rend impossible qu'il montre autre chose
// que ce qui partira chez le client.
import {
  buildAnonymizedModel, anonymizedZone, endLabel,
  type AnonymizedJobContext, type AnonymizedBrand, type AnonymizedOptions, type AnonymizedTemplate,
} from "./anonymized-cv-model"

const INK = "#1F2937"
const MUTED = "#6B7280"
const LINE = "#E5E1F2"

// Ré-exports : plusieurs appelants (routes, DOCX) importent ces symboles
// depuis ce fichier depuis longtemps. Les garder évite un sweep sans valeur.
export { anonymizedZone }
export type { AnonymizedJobContext, AnonymizedBrand, AnonymizedOptions, AnonymizedTemplate }

/** Construit le stylesheet PDF en injectant la couleur de marque du
 *  cabinet (par défaut violet Naywa). On ne met pas la couleur dans le
 *  StyleSheet global pour éviter une couleur figée à l'import : chaque
 *  rendu reprend la couleur de l'org en cours. */
/**
 * Construit le stylesheet @react-pdf à partir des couleurs brand.
 *
 *   - accent  : couleur primaire (header, headline pré-titre, ligne
 *               sous le brand row, bordure custom note).
 *   - secondary : couleur des titres de section + accents. Si l'org
 *                 n'a pas configuré de bicolore, on reçoit la même
 *                 valeur que `accent` — comportement uniforme préservé.
 */
function buildStyles(accent: string, secondary: string = accent) {
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
    // `marginBottom` GÉNÉREUX, et non décoratif : la ligne passe à la ligne
    // dès qu'une zone est longue, et sans cet écart le libellé de l'item
    // reporté vient coller à la VALEUR de celui du dessus. Constaté sur le
    // gabarit exécutif : « LANGUES » collé sous « principal ».
    metaItem: { marginRight: 22, marginBottom: 10 },
    metaLabel: { fontSize: 7, color: MUTED, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 2 },
    metaValue: { fontSize: 10, color: INK, fontFamily: "Helvetica-Bold" },

    /** Titre de section (Compétences, Parcours, Formation) — reprend
     *  la couleur secondaire si bicolore, sinon retombe sur l'accent
     *  principal. Plus visible que l'ancien gris MUTED. */
    sectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: secondary, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, marginTop: 4 },

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
  // ── CONTENU : décidé par le modèle partagé, jamais ici ──────────────────
  //
  // L'aperçu éditable du workspace appelle la MÊME fonction. C'est ce qui
  // garantit qu'il ne peut pas montrer autre chose que ce document : un poste
  // masqué y est masqué des deux côtés, une rubrique retrouvée y apparaît des
  // deux côtés. Ce fichier ne s'occupe plus que de l'habillage.
  const model = buildAnonymizedModel({ candidate, reference, job, brand, executiveSummary, options })

  const opts = model.options
  const t = LABELS[opts.language]
  const {
    brand: { name: brandName, logoUrl: brandLogo, accent, accentSecondary, slogan: brandSlogan, contactEmail },
    seniority, years, zone, skills,
    experience, education, languages, otherSections,
    hasJob, headline, watermarkText,
    noraSummary: baseSummaryText, customSummary: customSummaryText,
  } = model
  const s = buildStyles(accent, accentSecondary)

  // ─── Helpers partagés entre templates ────────────────────────────
  // (Closures qui capturent brand/labels/opts/styles depuis le scope
  // parent — évite de polluer la signature des sous-renders.)
  const renderBrandHeader = () => (
    // Brand row : on contraint le bloc gauche (logo+nom+slogan) à
    // flex:1 + paddingRight pour qu'il ne déborde jamais sous la
    // référence à droite, même avec un nom de cabinet long ou un
    // slogan qui passe sur 2 lignes.
    <View style={s.brandRow}>
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0, paddingRight: 14 }}>
        {brandLogo && (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={brandLogo} style={{ height: 56, maxWidth: 200, marginRight: 12, objectFit: "contain" }} />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.brand}>{brandName.toUpperCase()}</Text>
          {brandSlogan && <Text style={s.brandSlogan}>{brandSlogan}</Text>}
        </View>
      </View>
      <View style={{ minWidth: 90, alignItems: "flex-end" }}>
        <Text style={s.brandTag}>Réf. {reference}</Text>
      </View>
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
      {/* Footer top row : on contraint le bloc nom cabinet à flex:1
          pour qu'il wrap si trop long, et on alloue minWidth fixe à
          la ref à droite pour qu'elle reste lisible. */}
      <View style={s.footerTopRow}>
        <View style={{ flex: 1, minWidth: 0, paddingRight: 14 }}>
          <Text style={s.footerText}>{brandName}</Text>
        </View>
        <View style={{ minWidth: 70, alignItems: "flex-end" }}>
          <Text style={s.footerText}>Réf. {reference}</Text>
        </View>
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
              {zone && (
                <View style={{ marginBottom: 10 }}>
                  <Text style={s.metaLabel}>{t.metaZone}</Text>
                  <Text style={s.metaValue}>{zone}</Text>
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
                    const dates = [e.start, endLabel(e.end, opts.language)].filter(Boolean).join(" – ")
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
                    <View key={i} style={s.eduItem} wrap={false}>
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

              {otherSections.map((sec, i) => (
                <View key={`sec-${i}`} wrap={false}>
                  <Text style={s.sectionTitle}>{sec.title}</Text>
                  <Text style={s.expDesc}>{sec.content}</Text>
                </View>
              ))}
            </View>
          </View>

          {renderWatermark()}
          {renderFooter()}
        </Page>
      </Document>
    )
  }

  // ─── Template 3 : executive ──────────────────────────────────────
  // Mono-colonne aérée, headline XXL, peu de chips, skills triées
  // sur le volet. Pour profils senior présentés à des décideurs
  // métier qui veulent un document confortable à lire.
  if (opts.template === "executive") {
    // Plus de troncature. Ces plafonds (10 compétences, 6 postes) ne
    // protégeaient aucune contrainte de mise en page : chaque expérience est
    // rendue dans une View `wrap={false}` et @react-pdf pagine tout seul —
    // les templates classique et deux-colonnes affichent d'ailleurs déjà le
    // parcours entier sans problème. C'était donc du contenu perdu pour rien,
    // et sur le document remis au client final.
    const execSkills = skills
    const execExperience = experience
    return (
      <Document title={`Profil anonymisé ${reference}${job ? ` — ${job.title}` : ""}`} author={brandName}>
        <Page
          size="A4"
          style={{
            paddingTop: 60,
            paddingBottom: 72,
            paddingHorizontal: 64,
            fontSize: 10.5,
            color: INK,
            fontFamily: "Helvetica",
          }}
        >
          {/* Wordmark minimal — petit, en haut. Logo si dispo + nom
              en CAPS, et la ref alignée à droite. Bloc gauche
              contraint à flex:1 + paddingRight pour ne pas chevaucher
              la ref droite quand le nom + slogan est long. */}
          <View style={{
            flexDirection: "row", justifyContent: "space-between",
            alignItems: "center", marginBottom: 36,
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0, paddingRight: 14 }}>
              {brandLogo && (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image src={brandLogo} style={{ height: 32, maxWidth: 110, marginRight: 10, objectFit: "contain" }} />
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: accent, letterSpacing: 1.4 }}>
                  {brandName.toUpperCase()}
                </Text>
                {brandSlogan && (
                  <Text style={{ fontSize: 8, color: MUTED, fontStyle: "italic", marginTop: 1 }}>
                    {brandSlogan}
                  </Text>
                )}
              </View>
            </View>
            <View style={{ minWidth: 80, alignItems: "flex-end" }}>
              <Text style={{ fontSize: 9, color: MUTED, letterSpacing: 0.8 }}>
                Réf. {reference}
              </Text>
            </View>
          </View>

          {/* Pre-headline + headline XXL */}
          {hasJob && (
            <Text style={{
              fontSize: 9, fontFamily: "Helvetica-Bold",
              color: accent, letterSpacing: 2,
              textTransform: "uppercase", marginBottom: 8,
            }}>
              {t.presentedFor}
            </Text>
          )}
          <Text style={{
            fontSize: 32, fontFamily: "Helvetica-Bold",
            color: INK, lineHeight: 1.15,
            marginBottom: 28,
          }}>
            {headline}
          </Text>

          {/* Summary — Nora factuel + optional custom note */}
          {baseSummaryText && (
            <Text style={{
              fontSize: 12, color: "#374151",
              lineHeight: 1.7, fontStyle: "italic",
              marginBottom: 16,
              maxWidth: "92%",
            }}>
              {baseSummaryText}
            </Text>
          )}
          {customSummaryText && (
            <Text style={{
              fontSize: 11, color: "#374151", lineHeight: 1.65,
              marginBottom: 20,
              paddingLeft: 14,
              borderLeftWidth: 2, borderLeftColor: accent,
              maxWidth: "92%",
            }}>
              {customSummaryText}
            </Text>
          )}

          {/* Meta row plein air, max 4 items.
              `paddingBottom` réduit à 2 : chaque item porte désormais un
              `marginBottom: 10` (nécessaire au passage à la ligne), et garder
              12 en plus creusait un blanc sous le filet du bas. */}
          <View style={{
            flexDirection: "row", flexWrap: "wrap",
            marginTop: 6, marginBottom: 28,
            borderTopWidth: 0.5, borderBottomWidth: 0.5,
            borderColor: LINE,
            paddingTop: 12, paddingBottom: 2,
          }}>
            {seniority && (
              <View style={{ marginRight: 32, minWidth: 80, marginBottom: 10 }}>
                <Text style={{ fontSize: 7.5, color: MUTED, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 3 }}>
                  {t.metaSeniority}
                </Text>
                <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: INK }}>
                  {seniority}
                </Text>
              </View>
            )}
            {years != null && (
              <View style={{ marginRight: 32, minWidth: 80, marginBottom: 10 }}>
                <Text style={{ fontSize: 7.5, color: MUTED, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 3 }}>
                  {t.metaExperience}
                </Text>
                <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: INK }}>
                  {t.yearsSuffix(years)}
                </Text>
              </View>
            )}
            {zone && (
              <View style={{ marginRight: 32, minWidth: 80, marginBottom: 10 }}>
                <Text style={{ fontSize: 7.5, color: MUTED, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 3 }}>
                  {t.metaZone}
                </Text>
                <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: INK }}>
                  {zone}
                </Text>
              </View>
            )}
            {languages.length > 0 && (
              <View>
                <Text style={{ fontSize: 7.5, color: MUTED, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 3 }}>
                  {t.metaLanguages}
                </Text>
                <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: INK }}>
                  {languages.join(" · ")}
                </Text>
              </View>
            )}
          </View>

          {/* Skills — pills larges, liste entiere (le plafond a saute avec `execSkills`). */}
          {execSkills.length > 0 && (
            <View style={{ marginBottom: 28 }} minPresenceAhead={56}>
              <Text style={{
                fontSize: 9, fontFamily: "Helvetica-Bold",
                color: accentSecondary, letterSpacing: 1.2,
                textTransform: "uppercase", marginBottom: 12,
              }}>
                {t.keySkills}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {execSkills.map((sk, i) => (
                  <Text
                    key={i}
                    style={{
                      fontSize: 10, color: accent,
                      backgroundColor: "white",
                      borderWidth: 0.8, borderColor: accent,
                      borderRadius: 999,
                      paddingVertical: 4, paddingHorizontal: 10,
                      marginRight: 6, marginBottom: 6,
                    }}
                  >
                    {sk}
                  </Text>
                ))}
              </View>
            </View>
          )}

          {/* Parcours aéré */}
          {execExperience.length > 0 && (
            <View style={{ marginBottom: 26 }}>
              <Text style={{
                fontSize: 9, fontFamily: "Helvetica-Bold",
                color: accentSecondary, letterSpacing: 1.2,
                textTransform: "uppercase", marginBottom: 14,
              }}>
                {t.background}
              </Text>
              {execExperience.map((e, i) => {
                const dates = [e.start, endLabel(e.end, opts.language)].filter(Boolean).join(" – ")
                return (
                  <View key={i} style={{ marginBottom: 16 }} wrap={false}>
                    {/* Row titre + date — on encadre les 2 Texts avec
                        des Views contraintes : flex: 1 + paddingRight
                        sur le titre pour qu'il wrap proprement sans
                        chevaucher la date ; minWidth fixe sur la date
                        pour qu'elle ne soit jamais tronquée. */}
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                      <View style={{ flex: 1, paddingRight: 14, minWidth: 0 }}>
                        <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", color: INK }}>
                          {e.title || (opts.language === "en" ? "Role" : "Poste")}
                        </Text>
                      </View>
                      {dates && (
                        <View style={{ minWidth: 96, alignItems: "flex-end" }}>
                          <Text style={{ fontSize: 9, color: MUTED, letterSpacing: 0.4 }}>
                            {dates}
                          </Text>
                        </View>
                      )}
                    </View>
                    {e.company && (
                      <Text style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>
                        {e.company}
                      </Text>
                    )}
                    {e.description && (
                      <Text style={{ fontSize: 10, color: "#4B5563", lineHeight: 1.6 }}>
                        {e.description}
                      </Text>
                    )}
                  </View>
                )
              })}
            </View>
          )}

          {/* Formation compacte */}
          {education.length > 0 && (
            <View>
              <Text style={{
                fontSize: 9, fontFamily: "Helvetica-Bold",
                color: accentSecondary, letterSpacing: 1.2,
                textTransform: "uppercase", marginBottom: 10,
              }}>
                {t.education}
              </Text>
              {education.map((ed, i) => (
                <View key={i} style={{ marginBottom: 6 }} wrap={false}>
                  <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold", color: INK }}>
                    {ed.degree}{ed.field ? ` — ${ed.field}` : ""}
                  </Text>
                  {(ed.start || ed.end) && (
                    <Text style={{ fontSize: 9, color: MUTED }}>
                      {ed.start ?? ""}{ed.end ? `–${ed.end}` : ""}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {otherSections.map((sec, i) => (
            <View key={`sec-${i}`} wrap={false} style={{ marginTop: 14 }}>
              <Text style={{
                fontSize: 9, fontFamily: "Helvetica-Bold",
                color: accentSecondary, letterSpacing: 1.2,
                textTransform: "uppercase", marginBottom: 8,
              }}>
                {sec.title}
              </Text>
              <Text style={{ fontSize: 9.5, color: MUTED, lineHeight: 1.5 }}>{sec.content}</Text>
            </View>
          ))}

          {renderWatermark()}
          {renderFooter()}
        </Page>
      </Document>
    )
  }

  // ─── Template 4 : bento ──────────────────────────────────────────
  // Grille de cards bordées arrondies — un client visuel apprécie la
  // structure compartimentée. Chaque section a sa propre carte qui
  // l'isole proprement. Plus moderne, vise un public design-friendly.
  if (opts.template === "bento") {
    const card = {
      backgroundColor: "white",
      borderWidth: 0.7,
      borderColor: LINE,
      borderRadius: 8,
      padding: 14,
    } as const
    // Titre de card = couleur secondaire si bicolore configuré, sinon
    // on retombe sur accent principal (= comportement initial préservé
    // pour les orgs mono-couleur).
    const cardTitle = {
      fontSize: 8.5,
      fontFamily: "Helvetica-Bold",
      color: accentSecondary,
      letterSpacing: 1.1,
      textTransform: "uppercase",
      marginBottom: 8,
    } as const
    // Même raison que pour le template exécutif : la carte « Parcours » est en
    // pleine largeur, sans hauteur fixe, et chaque poste porte `wrap={false}`.
    const bentoSkills = skills
    const bentoExperience = experience
    return (
      <Document title={`Profil anonymisé ${reference}${job ? ` — ${job.title}` : ""}`} author={brandName}>
        <Page
          size="A4"
          style={{
            paddingTop: 36,
            paddingBottom: 60,
            paddingHorizontal: 36,
            fontSize: 10,
            color: INK,
            fontFamily: "Helvetica",
            backgroundColor: "#FAFAFA",
          }}
        >
          {/* Card 1 — Header + headline + summary, full width */}
          <View style={{ ...card, marginBottom: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0, paddingRight: 14 }}>
                {brandLogo && (
                  // eslint-disable-next-line jsx-a11y/alt-text
                  <Image src={brandLogo} style={{ height: 42, maxWidth: 150, marginRight: 10, objectFit: "contain" }} />
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: accent, letterSpacing: 1.2 }}>
                    {brandName.toUpperCase()}
                  </Text>
                  {brandSlogan && (
                    <Text style={{ fontSize: 8.5, color: MUTED, fontStyle: "italic", marginTop: 1 }}>
                      {brandSlogan}
                    </Text>
                  )}
                </View>
              </View>
              <View style={{ minWidth: 84, alignItems: "flex-end" }}>
                <Text style={{
                  fontSize: 8.5, fontFamily: "Helvetica-Bold", color: MUTED,
                  letterSpacing: 0.8, textTransform: "uppercase",
                }}>
                  Réf. {reference}
                </Text>
              </View>
            </View>
            {hasJob && (
              <Text style={{
                fontSize: 8.5, fontFamily: "Helvetica-Bold",
                color: accent, letterSpacing: 1.4,
                textTransform: "uppercase", marginBottom: 5,
              }}>
                {t.presentedFor}
              </Text>
            )}
            <Text style={{
              fontSize: 22, fontFamily: "Helvetica-Bold", color: INK,
              marginBottom: 10, lineHeight: 1.2,
            }}>
              {headline}
            </Text>
            {baseSummaryText && (
              <Text style={{ fontSize: 10.5, color: "#374151", lineHeight: 1.6, fontStyle: "italic" }}>
                {baseSummaryText}
              </Text>
            )}
            {customSummaryText && (
              <Text style={{
                fontSize: 10, color: "#374151", lineHeight: 1.55,
                marginTop: baseSummaryText ? 8 : 0,
                paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: accent,
              }}>
                {customSummaryText}
              </Text>
            )}
          </View>

          {/* Row 2 — Cards Méta + Skills */}
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
            {/* Card méta */}
            <View style={{ ...card, width: 200 }}>
              <Text style={cardTitle}>{opts.language === "en" ? "Profile" : "Profil"}</Text>
              {seniority && (
                <View style={{ marginBottom: 7 }}>
                  <Text style={{ fontSize: 7, color: MUTED, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 1.5 }}>
                    {t.metaSeniority}
                  </Text>
                  <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold", color: INK }}>{seniority}</Text>
                </View>
              )}
              {years != null && (
                <View style={{ marginBottom: 7 }}>
                  <Text style={{ fontSize: 7, color: MUTED, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 1.5 }}>
                    {t.metaExperience}
                  </Text>
                  <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold", color: INK }}>{t.yearsSuffix(years)}</Text>
                </View>
              )}
              {zone && (
                <View style={{ marginBottom: 7 }}>
                  <Text style={{ fontSize: 7, color: MUTED, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 1.5 }}>
                    {t.metaZone}
                  </Text>
                  <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold", color: INK }}>{zone}</Text>
                </View>
              )}
              {languages.length > 0 && (
                <View>
                  <Text style={{ fontSize: 7, color: MUTED, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 1.5 }}>
                    {t.metaLanguages}
                  </Text>
                  <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold", color: INK }}>{languages.join(" · ")}</Text>
                </View>
              )}
            </View>

            {/* Card skills */}
            <View style={{ ...card, flex: 1, minWidth: 0 }}>
              <Text style={cardTitle}>{t.keySkills}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {bentoSkills.map((sk, i) => (
                  <Text
                    key={i}
                    style={{
                      fontSize: 9, color: accent,
                      backgroundColor: "white",
                      borderWidth: 0.7, borderColor: accent,
                      borderRadius: 4,
                      paddingVertical: 2.5, paddingHorizontal: 7,
                      marginRight: 5, marginBottom: 5,
                    }}
                  >
                    {sk}
                  </Text>
                ))}
              </View>
            </View>
          </View>

          {/* Card 3 — Parcours full width */}
          {bentoExperience.length > 0 && (
            <View style={{ ...card, marginBottom: 10 }}>
              <Text style={cardTitle}>{t.background}</Text>
              {bentoExperience.map((e, i) => {
                const dates = [e.start, endLabel(e.end, opts.language)].filter(Boolean).join(" – ")
                const isLast = i === bentoExperience.length - 1
                return (
                  <View
                    key={i}
                    style={{
                      paddingBottom: isLast ? 0 : 10,
                      marginBottom: isLast ? 0 : 10,
                      borderBottomWidth: isLast ? 0 : 0.5,
                      borderBottomColor: LINE,
                    }}
                    wrap={false}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
                      <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                        <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold", color: INK }}>
                          {e.title || (opts.language === "en" ? "Role" : "Poste")}
                        </Text>
                      </View>
                      {dates && (
                        <View style={{ minWidth: 96, alignItems: "flex-end" }}>
                          <Text style={{ fontSize: 8.5, color: MUTED, letterSpacing: 0.3 }}>
                            {dates}
                          </Text>
                        </View>
                      )}
                    </View>
                    {e.company && (
                      <Text style={{ fontSize: 9.5, color: MUTED, marginBottom: 3 }}>{e.company}</Text>
                    )}
                    {e.description && (
                      <Text style={{ fontSize: 9.5, color: "#4B5563", lineHeight: 1.55 }}>{e.description}</Text>
                    )}
                  </View>
                )
              })}
            </View>
          )}

          {/* Card 4 — Formation */}
          {education.length > 0 && (
            <View style={{ ...card }}>
              <Text style={cardTitle}>{t.education}</Text>
              {education.map((ed, i) => (
                // `wrap={false}` comme sur les expériences : sans lui, le saut
                // de page tombe ENTRE le diplôme et ses dates. Constaté sur un
                // bento généré en recette — la carte Formation coupée en deux,
                // « 2022-09–2026-06 » orphelin en haut de la page suivante.
                <View key={i} style={{ marginBottom: 5 }} wrap={false}>
                  <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: INK }}>
                    {ed.degree}{ed.field ? ` — ${ed.field}` : ""}
                  </Text>
                  {(ed.start || ed.end) && (
                    <Text style={{ fontSize: 8.5, color: MUTED }}>
                      {ed.start ?? ""}{ed.end ? `–${ed.end}` : ""}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Une carte par rubrique libre — le bento est fait pour ça. */}
          {otherSections.map((sec, i) => (
            <View key={`sec-${i}`} style={{ ...card }} wrap={false}>
              <Text style={cardTitle}>{sec.title}</Text>
              <Text style={{ fontSize: 9.5, color: MUTED, lineHeight: 1.5 }}>{sec.content}</Text>
            </View>
          ))}

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
          {zone && (
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>{t.metaZone}</Text>
              <Text style={s.metaValue}>{zone}</Text>
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
            {/*
              Le titre et les puces sont deux elements FRERES : rien n'empeche
              @react-pdf de poser « Competences cles » en bas de page 1 et les
              puces en haut de page 2. Sans consequence tant que le bloc tenait
              en quatre puces, beaucoup plus probable depuis qu'il en compte
              couramment dix a vingt-cinq. Meme famille de defaut que le diplome
              separe de ses dates. `minPresenceAhead` reporte le titre a la page
              suivante s'il ne reste pas la place d'au moins deux rangees.
            */}
            <View minPresenceAhead={44}>
              <Text style={s.sectionTitle}>{t.keySkills}</Text>
            </View>
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
              const dates = [e.start, endLabel(e.end, opts.language)].filter(Boolean).join(" – ")
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
              <View key={i} style={s.eduItem} wrap={false}>
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

        {/* Rubriques libres du CV, rendues APRÈS la formation : ce sont des
            compléments, pas la colonne vertébrale du profil. */}
        {otherSections.map((sec, i) => (
          <View key={`sec-${i}`} wrap={false}>
            <Text style={s.sectionTitle}>{sec.title}</Text>
            <Text style={s.expDesc}>{sec.content}</Text>
          </View>
        ))}

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
