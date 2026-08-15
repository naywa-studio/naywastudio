/**
 * Le CONTENU du CV anonymisé, décidé une seule fois.
 *
 * ── Pourquoi ce fichier existe ────────────────────────────────────────────
 *
 * Le document remis au client est rendu en PDF côté serveur. L'aperçu sur
 * lequel le sourceur travaille, lui, est du HTML dans le navigateur — un PDF
 * dans une iframe ne se manipule pas.
 *
 * Deux rendus pour un même document, c'est un risque : le jour où ils
 * divergent, **l'aperçu ment**. Et il ment sur ce qui compte — une expérience
 * que le sourceur croyait avoir masquée, une rubrique qu'il croyait présente.
 *
 * D'où la règle : **ce qui figure au document est décidé ICI, une fois**, par
 * du code pur que le PDF et l'aperçu appellent tous les deux. Ce qui reste
 * propre à chacun, c'est l'habillage — polices, marges, couleurs. Une
 * divergence de style est cosmétique. Une divergence de contenu serait une
 * faute, et elle n'est plus possible.
 *
 * Ce module ne connaît ni React-PDF, ni le DOM : il doit rester importable
 * depuis un composant client comme depuis une route serveur.
 */

import type { Candidate, ParsedCv, ParsedExperience, ParsedEducation, ParsedSection } from "./database.types"

/** Couleur d'accent quand le cabinet n'en a pas configuré : noir « éteint »,
 *  jamais le violet Naywa — le document ne doit pas usurper notre marque. */
export const DEFAULT_OFF = "#000000"
export const DEFAULT_BRAND = "NAYWA STUDIO"

export type AnonymizedTemplate = "classic" | "two-column" | "executive" | "bento"

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
  name: string | null
  logoUrl: string | null
  color?: string | null
  colorSecondary?: string | null
  slogan?: string | null
  contactEmail?: string | null
}

export interface AnonymizedOptions {
  template?: AnonymizedTemplate
  keepNoraSummary?: boolean
  customText?: string
  watermark?: boolean
  watermarkText?: string
  language?: "fr" | "en"
}

/** Marque résolue : plus aucune valeur douteuse ne sort d'ici. */
export interface ResolvedBrand {
  name: string
  logoUrl: string | null
  accent: string
  accentSecondary: string
  slogan: string | null
  contactEmail: string | null
}

/** Tout ce que le document affiche, et rien d'autre. */
export interface AnonymizedCvModel {
  options: Required<AnonymizedOptions>
  brand: ResolvedBrand
  reference: string
  /** Titre principal : intitulé de la mission si on en a une, sinon le poste
   *  actuel du candidat. */
  headline: string
  /** Vrai quand le document est présenté POUR une mission. */
  hasJob: boolean
  roleFamily: string | null
  seniority: string | null
  years: number | null
  /** Commune + département, jamais l'adresse postale. */
  zone: string | null
  skills: string[]
  experience: ParsedExperience[]
  education: ParsedEducation[]
  languages: string[]
  otherSections: ParsedSection[]
  /** Résumé automatique, `null` si le sourceur l'a décoché. */
  noraSummary: string | null
  /** Message libre du sourceur, `null` s'il n'en a pas écrit. */
  customSummary: string | null
  /** Texte du filigrane, vide si désactivé. */
  watermarkText: string
}

const norm = (s: string) => s.toLowerCase().trim()

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/**
 * ZONE géographique pour un document ANONYMISÉ.
 *
 * `candidate.location` reprend la ligne d'adresse du CV telle qu'extraite, et
 * c'est très souvent une adresse postale COMPLÈTE. Constaté en recette sur 8
 * candidats sur 12 : « 35, Rte d'Hauterives 26210 Moras en Valloire »,
 * « 15 rue Jean Mermoz, 75008 Paris », et même « Monica Landou 77700 Chessy »
 * — le NOM du candidat imprimé sur son propre CV anonymisé.
 *
 * Un numéro de rue croisé avec un parcours détaillé identifie une personne
 * sans effort, et ce document part chez le client final du cabinet. Le libellé
 * du champ dit d'ailleurs « ZONE » : l'intention n'a jamais été l'adresse.
 *
 * On ne garde donc que la maille COMMUNE + DÉPARTEMENT. Mode d'échec = le
 * silence : si rien d'exploitable ne reste, on n'affiche rien plutôt qu'une
 * adresse.
 */
export function anonymizedZone(location: string | null | undefined, fullName?: string | null): string | null {
  if (!location) return null
  let s = location.trim()

  // Retire le nom du candidat s'il a été aspiré dans la ligne d'adresse.
  for (const part of (fullName ?? "").split(/\s+/)) {
    if (part.length < 3) continue
    s = s.replace(new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ")
  }

  const VOIE = /\b(\d+\s*(bis|ter|quater)?\b|rue|avenue|av\.|boulevard|bd\.?|impasse|chemin|route|rte|all[ée]e|place|quai)\b/i
  const propre = (x: string) => x.replace(/[(),;–-]+/g, " ").replace(/\s{2,}/g, " ").trim()

  // Code postal FR, éventuellement espacé ("75 014"). Il sépare la voie de la
  // localité — mais l'ordre varie : « 31000 Toulouse » aussi bien que
  // « Saint-Denis - 93200 ». On essaie donc les deux côtés.
  const cp = s.match(/\b(\d{2})\s?\d{3}\b/)
  if (cp) {
    const dep = cp[1]
    const idx = s.indexOf(cp[0])
    const apres = propre(s.slice(idx + cp[0].length).split(/[,;]/)[0] ?? "")
    if (apres.length > 2 && !VOIE.test(apres)) return `${apres} (${dep})`

    const avant = s.slice(0, idx).split(/[,;-]/).map(propre).filter((x) => x.length > 2 && !VOIE.test(x))
    const commune = avant[avant.length - 1]
    if (commune) return `${commune} (${dep})`

    return `Département ${dep}`
  }

  const restants = s.split(/[,;]/).map(propre).filter((x) => x.length > 1 && !VOIE.test(x))
  const out = restants.join(", ").trim()
  return out.length > 1 ? out : null
}

/**
 * Libellé de fin d'un poste.
 *
 * `null` = poste réellement EN COURS. Absent/undefined = date de fin INCONNUE.
 * Les quatre templates les confondaient via `e.end ?? "présent"`, si bien
 * qu'un poste terminé dont la date de fin n'avait pas été extraite était
 * présenté comme le poste actuel du candidat — dans le document remis au
 * client final du cabinet.
 */
export function endLabel(end: string | null | undefined, lang: "fr" | "en"): string | null {
  if (end === null) return lang === "en" ? "present" : "présent"
  return end ?? null
}

export function dedupe(arr: string[]): string[] {
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

/**
 * Décide ce qui figure au document.
 *
 * Appelé par le rendu PDF (serveur) ET par l'aperçu HTML (navigateur). Toute
 * règle de contenu ajoutée ailleurs qu'ici rouvre le risque de divergence.
 */
export function buildAnonymizedModel({
  candidate, reference, job = null, brand = null, executiveSummary = null, options = null,
}: {
  candidate: Candidate
  reference: string
  job?: AnonymizedJobContext | null
  brand?: AnonymizedBrand | null
  executiveSummary?: string | null
  options?: AnonymizedOptions | null
}): AnonymizedCvModel {
  const opts: Required<AnonymizedOptions> = {
    template: options?.template ?? "classic",
    keepNoraSummary: options?.keepNoraSummary ?? false,
    customText: (options?.customText ?? "").trim(),
    watermark: options?.watermark ?? false,
    watermarkText: (options?.watermarkText ?? "").trim(),
    language: options?.language ?? "fr",
  }

  const brandName = (brand?.name ?? "").trim() || DEFAULT_BRAND
  // Contrôle du hex au rendu : une valeur malformée en base ne doit jamais
  // casser le document. On retombe sur noir « éteint », ce qui rend l'absence
  // de configuration visible plutôt que d'usurper la marque Naywa.
  const accentRaw = (brand?.color ?? "").trim()
  const accent = HEX.test(accentRaw) ? accentRaw : DEFAULT_OFF
  const accent2Raw = (brand?.colorSecondary ?? "").trim()
  const accentSecondary = HEX.test(accent2Raw) ? accent2Raw : accent

  const cv: ParsedCv = candidate.parsed_cv ?? {}
  const roleFamily = candidate.taxonomy?.role_family?.[0] ?? null

  // Compétences : on ne réordonne PAS par pertinence mission. Le client lit le
  // CV tel qu'il est, sans tri orienté. Dédupe + plafond aligné sur le parsing.
  const skills = dedupe(
    candidate.taxonomy?.core_skills?.length
      ? candidate.taxonomy.core_skills
      : (candidate.skills ?? []),
  ).slice(0, 40)

  // Rubriques libres : on écarte celles qui n'ont ni titre ni contenu.
  const otherSections = (cv.other_sections ?? []).filter(
    (s) => s.title.trim().length > 0 && s.content.trim().length > 0,
  )

  return {
    options: opts,
    brand: {
      name: brandName,
      logoUrl: brand?.logoUrl ?? null,
      accent,
      accentSecondary,
      slogan: (brand?.slogan ?? "").trim() || null,
      contactEmail: (brand?.contactEmail ?? "").trim() || null,
    },
    reference,
    headline: job ? job.title : (candidate.current_title ?? roleFamily ?? "Profil professionnel"),
    hasJob: !!job,
    roleFamily,
    seniority: candidate.seniority_level ?? cv.seniority_level ?? null,
    years: candidate.years_experience ?? cv.years_experience ?? null,
    zone: anonymizedZone(candidate.location, candidate.full_name),
    skills,
    // Ordre d'origine du parser (qui suit le CV, généralement
    // antichronologique). On ne pousse PAS les expériences « pertinentes
    // mission » en haut : préserver le fond, c'est respecter le récit.
    experience: cv.experience ?? [],
    education: cv.education ?? [],
    languages: cv.languages ?? candidate.languages ?? [],
    otherSections,
    noraSummary: opts.keepNoraSummary
      ? (executiveSummary?.trim() || cv.summary?.trim() || null)
      : null,
    customSummary: opts.customText.length > 0 ? opts.customText : null,
    // Filigrane = le nom du cabinet, façon tampon discret. Pas de « Réf »
    // devant : la référence est déjà imprimée en clair en haut et en pied.
    watermarkText: opts.watermarkText || brandName || "",
  }
}
