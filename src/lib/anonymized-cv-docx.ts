/**
 * Générateur de CV anonymisé au format .docx (Word).
 *
 * Philosophie : le .docx est une version **simple linéaire** du CV
 * anonymisé, indépendante du template PDF choisi. Le sourceur la
 * télécharge pour pouvoir éditer / personnaliser dans Word (ajout de
 * notes, mise en forme custom). C'est un format d'édition, pas de
 * présentation finale — donc on ne reproduit pas les 4 templates.
 *
 * Anonymisation respectée :
 *   - aucun nom, école, mail, téléphone, adresse précise
 *   - juste : header brand cabinet + référence + headline mission +
 *     résumé Nora (+ custom text) + méta + skills + parcours + formation
 *   - watermark .docx pas implémenté (mode édition = pas anti-fuite,
 *     l'utilisateur peut le retirer dans Word, donc inutile)
 *
 * Côté langue : on traduit les libellés section comme le PDF.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx"
import type { Candidate } from "./database.types"
import type { AnonymizedBrand, AnonymizedJobContext, AnonymizedOptions } from "./anonymized-cv"

/**
 * Couleur par défaut (hex sans #) appliquée à la marque quand
 * brand_color n'est pas configuré côté org. Décision produit : noir
 * "off" plutôt que violet Naywa, pour pousser à la configuration.
 */
const ACCENT_DEFAULT = "000000"
const INK = "1F2937"
const MUTED = "6B7280"
const SOFT = "9CA3AF"

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
    summaryFallback: "Profil professionnel",
    rolePlaceholder: "Poste",
    presentSuffix: "présent",
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
    summaryFallback: "Professional profile",
    rolePlaceholder: "Role",
    presentSuffix: "present",
  },
} as const

function normalizeAccent(input: string | null | undefined): string {
  const raw = (input ?? "").trim().replace(/^#/, "")
  return /^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)
    ? (raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw).toUpperCase()
    : ACCENT_DEFAULT
}

/**
 * Construit le Document docx complet et renvoie un Buffer Node.js.
 * Appelé depuis l'API route ; le buffer est ensuite renvoyé avec
 * Content-Disposition: attachment.
 */
export async function buildAnonymizedDocx({
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
  executiveSummary?: string | null
  options?: AnonymizedOptions | null
}): Promise<Buffer> {
  const lang: "fr" | "en" = options?.language ?? "fr"
  const t = LABELS[lang]
  const keepNora = options?.keepNoraSummary ?? true
  const customText = (options?.customText ?? "").trim()

  const accent = normalizeAccent(brand?.color)
  // Couleur secondaire pour les titres de section (bicolore). Si non
  // configurée, on retombe sur l'accent principal pour uniformité.
  const accentSecondary = brand?.colorSecondary
    ? normalizeAccent(brand.colorSecondary)
    : accent
  const brandName = (brand?.name ?? "").trim() || "NAYWA STUDIO"
  const brandSlogan = (brand?.slogan ?? "").trim()
  const contactEmail = (brand?.contactEmail ?? "").trim()

  const cv = candidate.parsed_cv ?? {}
  const headline = job
    ? job.title
    : (candidate.current_title ?? candidate.taxonomy?.role_family?.[0] ?? t.summaryFallback)

  const seniority = candidate.seniority_level ?? cv.seniority_level ?? null
  const years = candidate.years_experience ?? cv.years_experience ?? null
  const skills = ((candidate.taxonomy?.core_skills?.length
    ? candidate.taxonomy.core_skills
    : (candidate.skills ?? []))).slice(0, 20)
  const experience = (cv.experience ?? []).slice(0, 8)
  const education = cv.education ?? []
  const languages = cv.languages ?? candidate.languages ?? []

  const baseSummary = keepNora
    ? (executiveSummary?.trim() || cv.summary?.trim() || null)
    : null

  // ─── Builders ────────────────────────────────────────────────────
  const children: Paragraph[] = []

  // Header line : NOM CABINET (gauche) — Réf XXXX (droite, simulé via tab stop)
  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: brandName.toUpperCase(),
          bold: true,
          color: accent,
          size: 22, // half-points → 11pt
          characterSpacing: 30,
        }),
        new TextRun({
          text: `\t\t\t\t\t\t\t\t\t\t\tRéf. ${reference}`,
          color: MUTED,
          size: 16,
        }),
      ],
    }),
  )
  if (brandSlogan) {
    children.push(
      new Paragraph({
        spacing: { after: 240 },
        children: [
          new TextRun({
            text: brandSlogan,
            italics: true,
            color: MUTED,
            size: 18,
          }),
        ],
      }),
    )
  } else {
    children.push(new Paragraph({ spacing: { after: 240 }, children: [new TextRun("")] }))
  }

  // Bar séparateur (border bottom)
  children.push(
    new Paragraph({
      border: { bottom: { color: accent, space: 1, style: BorderStyle.SINGLE, size: 12 } },
      spacing: { after: 280 },
      children: [new TextRun("")],
    }),
  )

  // Présenté pour
  if (job) {
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: t.presentedFor.toUpperCase(),
            bold: true,
            color: accent,
            size: 18,
            characterSpacing: 40,
          }),
        ],
      }),
    )
  }

  // Headline H1
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 280 },
      children: [
        new TextRun({
          text: headline,
          bold: true,
          color: INK,
          size: 40, // 20pt
        }),
      ],
    }),
  )

  // Résumé Nora (italique)
  if (baseSummary) {
    children.push(
      new Paragraph({
        spacing: { after: 220 },
        children: [
          new TextRun({
            text: baseSummary,
            italics: true,
            color: "374151",
            size: 21,
          }),
        ],
      }),
    )
  }

  // Custom text (bloc séparé)
  if (customText) {
    children.push(
      new Paragraph({
        spacing: { after: 280 },
        border: {
          left: { color: accent, space: 6, style: BorderStyle.SINGLE, size: 8 },
        },
        indent: { left: 200 },
        children: [
          new TextRun({
            text: customText,
            color: "374151",
            size: 20,
          }),
        ],
      }),
    )
  }

  // Méta — ligne unique avec séparateurs ·
  const metaParts: string[] = []
  if (seniority) metaParts.push(`${t.metaSeniority} : ${seniority}`)
  if (years != null) metaParts.push(`${t.metaExperience} : ${t.yearsSuffix(years)}`)
  if (candidate.location) metaParts.push(`${t.metaZone} : ${candidate.location}`)
  if (languages.length > 0) metaParts.push(`${t.metaLanguages} : ${languages.join(" · ")}`)
  if (metaParts.length > 0) {
    children.push(
      new Paragraph({
        spacing: { after: 280 },
        children: [
          new TextRun({
            text: metaParts.join("  ·  "),
            color: INK,
            size: 19,
            bold: false,
          }),
        ],
      }),
    )
  }

  // Skills
  if (skills.length > 0) {
    children.push(sectionTitle(t.keySkills, accentSecondary))
    children.push(
      new Paragraph({
        spacing: { after: 280 },
        children: [
          new TextRun({
            text: skills.join("  ·  "),
            color: "4B5563",
            size: 19,
          }),
        ],
      }),
    )
  }

  // Parcours
  if (experience.length > 0) {
    children.push(sectionTitle(t.background, accentSecondary))
    for (const e of experience) {
      const dates = [e.start, e.end ?? t.presentSuffix].filter(Boolean).join(" – ")
      children.push(
        new Paragraph({
          spacing: { before: 100, after: 40 },
          children: [
            new TextRun({
              text: e.title || t.rolePlaceholder,
              bold: true,
              color: INK,
              size: 22,
            }),
            new TextRun({
              text: dates ? `   ${dates}` : "",
              color: SOFT,
              size: 17,
              italics: true,
            }),
          ],
        }),
      )
      if (e.company) {
        children.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: e.company, color: MUTED, size: 19 })],
          }),
        )
      }
      if (e.description) {
        children.push(
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({ text: e.description, color: "4B5563", size: 19 }),
            ],
          }),
        )
      }
    }
  }

  // Formation
  if (education.length > 0) {
    children.push(sectionTitle(t.education, accentSecondary))
    for (const ed of education) {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({
              text: `${ed.degree}${ed.field ? ` — ${ed.field}` : ""}`,
              bold: true,
              color: INK,
              size: 20,
            }),
          ],
        }),
      )
      if (ed.start || ed.end) {
        children.push(
          new Paragraph({
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: `${ed.start ?? ""}${ed.end ? `–${ed.end}` : ""}`,
                color: MUTED,
                size: 17,
              }),
            ],
          }),
        )
      }
    }
  }

  // Footer (en bas de doc, pas un vrai footer Word — juste un dernier
  // paragraphe sobre avec mail de contact si présent).
  if (contactEmail) {
    children.push(
      new Paragraph({
        spacing: { before: 400 },
        border: { top: { color: "E5E1F2", space: 1, style: BorderStyle.SINGLE, size: 4 } },
        children: [
          new TextRun({
            text: `${t.contactPrefix} ${contactEmail}`,
            color: MUTED,
            size: 17,
            italics: true,
          }),
        ],
      }),
    )
  }

  const doc = new Document({
    creator: brandName,
    title: `Profil anonymisé ${reference}${job ? ` — ${job.title}` : ""}`,
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
          },
        },
        children,
      },
    ],
  })

  return await Packer.toBuffer(doc)
}

function sectionTitle(text: string, accent: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 140 },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        color: accent,
        size: 18,
        characterSpacing: 40,
      }),
    ],
  })
}
