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
  /**
   * Accroche ÉCRITE PAR LE CANDIDAT sur son CV (`parsed_cv.summary`).
   *
   * Rien à voir avec le résumé de Nora, et c'est tout l'objet de ce drapeau :
   * les deux étaient pilotés par la seule case « Résumé Nora », décochée par
   * défaut. Un CV sur un (12/12 chez GMH, 141/142 chez KYPE) perdait donc son
   * accroche dans le document remis au client — du contenu de CV, au même
   * titre qu'une expérience, supprimé par une case qui parle d'IA.
   *
   * Coché par défaut : ne rien retirer de ce que le candidat a écrit.
   */
  keepCandidateSummary?: boolean
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
  /** Qualités humaines telles qu'écrites au CV. Bloc distinct des compétences
   *  clés : les mélanger diluerait le technique dans le générique. */
  qualities: string[]
  experience: ParsedExperience[]
  education: ParsedEducation[]
  /** Certifications et habilitations. Sur un profil technique, c'est souvent
   *  le critère qui emporte la décision du client. */
  certifications: string[]
  languages: string[]
  otherSections: ParsedSection[]
  /** Accroche écrite par le CANDIDAT, `null` si absente ou décochée. */
  candidateSummary: string | null
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
 * Casse d'affichage d'une compétence.
 *
 * Les deux sources n'ont pas la même convention : le parseur écrit les
 * `core_skills` en minuscules, alors que la colonne `skills` reprend le CV tel
 * quel — souvent en capitales. Les juxtaposer donnait « REVIT » à côté de
 * « modélisation 3D » sur le document remis au client.
 *
 * Les acronymes courts (BIM, ACP, E3D) restent en capitales : les abaisser
 * serait pire. Au-delà, une marque connue est rétablie dans sa graphie propre,
 * sinon on capitalise la première lettre.
 */
const BRAND_CASE: Record<string, string> = {
  autocad: "AutoCAD",
  revit: "Revit",
  tekla: "Tekla",
  navisworks: "Navisworks",
  twinmotion: "Twinmotion",
  solidworks: "SolidWorks",
  sketchup: "SketchUp",
  catia: "CATIA",
  excel: "Excel",
  powerpoint: "PowerPoint",
}

function displayCase(s: string): string {
  const t = s.trim()
  const known = BRAND_CASE[t.toLowerCase()]
  if (known) return known
  // Acronyme court, ou libellé qui n'est pas tout en capitales : on n'y touche pas.
  if (t.length <= 4) return t
  if (t !== t.toUpperCase()) return t
  if (/\d/.test(t)) return t
  return t.charAt(0) + t.slice(1).toLowerCase()
}

/**
 * Clé de COMPARAISON (jamais affichée).
 *
 * Les annotations entre parenthèses sont retirées : `calcul flexibilité` et
 * `Calcul flexibilité (CeasarII)` sont la même compétence, et les afficher
 * toutes les deux donne l'impression d'une fiche mal relue.
 */
const cmpKey = (s: string) =>
  s.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim()

/** `a` apparaît-il comme suite de mots consécutifs dans `b` ? */
function containsRun(a: string[], b: string[]): boolean {
  if (a.length === 0 || a.length > b.length) return false
  for (let i = 0; i + a.length <= b.length; i++) {
    let ok = true
    for (let j = 0; j < a.length; j++) {
      if (b[i + j] !== a[j]) { ok = false; break }
    }
    if (ok) return true
  }
  return false
}

/**
 * Bureautique générique — écartée du COMPLÉMENT uniquement.
 *
 * « Excel » en compétence CLÉ d'un ingénieur structure affaiblit la fiche au
 * lieu de l'étoffer. Mais si le modèle l'a délibérément retenu dans
 * `core_skills` (une assistante de gestion, par exemple), on respecte son
 * choix : le filtre ne s'applique jamais à la liste d'origine.
 */
const BUREAUTIQUE = new Set([
  "excel", "word", "powerpoint", "outlook", "office", "pack office",
  "microsoft office", "ms office", "suite office", "bureautique", "internet",
])

/**
 * Compétences affichées sur le document anonymisé.
 *
 * AVANT : `core_skills` OU, si vide seulement, la colonne `skills`. Un ou
 * EXCLUSIF — donc dès que le modèle sortait ne serait-ce qu'une compétence, le
 * contenu de la colonne était jeté. Mesuré en base sur 198 CV : 3,3 compétences
 * affichées en moyenne là où la fusion en donne 9,1, alors que TOUT était déjà
 * en base. Le champ s'imprime tel quel sur le CV remis au client final : quatre
 * étiquettes pour quinze ans de carrière donnent l'image d'un candidat pauvre.
 *
 * MAINTENANT : les deux sources fusionnent, `core_skills` en tête (c'est la
 * liste que le modèle a jugée déterminante), la colonne en complément.
 *
 * Ne consomme aucun crédit, n'appelle aucun modèle, et n'exige pas de
 * re-parser : la donnée est déjà là, elle était simplement écartée à
 * l'affichage.
 */
export function mergeDisplaySkills(core: string[], fallback: string[]): string[] {
  const out: string[] = []
  const keys: string[][] = []

  const push = (raw: string, isTopUp: boolean) => {
    const label = displayCase(raw)
    if (!label) return
    const key = cmpKey(label)
    if (!key) return
    if (isTopUp && BUREAUTIQUE.has(key)) return
    // Doublon exact, ou variante plus/moins détaillée d'une entrée déjà retenue.
    for (const k of keys) {
      if (containsRun(k, key.split(" ")) || containsRun(key.split(" "), k)) return
    }
    keys.push(key.split(" "))
    out.push(label)
  }

  for (const s of core) push(s, false)
  for (const s of fallback) push(s, true)
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
    // Coché par défaut, contrairement au résumé Nora : c'est du contenu du CV,
    // pas une génération. Le retirer par défaut revenait à amputer le document.
    keepCandidateSummary: options?.keepCandidateSummary ?? true,
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
  // CV tel qu'il est, sans tri orienté. Les deux sources fusionnent (cf.
  // `mergeDisplaySkills`) ; plafond inchangé, il ne mord qu'au-delà de 40.
  const skills = mergeDisplaySkills(
    candidate.taxonomy?.core_skills ?? [],
    candidate.skills ?? [],
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
    qualities: dedupe(cv.qualities ?? []).slice(0, 15),
    // Ordre d'origine du parser (qui suit le CV, généralement
    // antichronologique). On ne pousse PAS les expériences « pertinentes
    // mission » en haut : préserver le fond, c'est respecter le récit.
    experience: cv.experience ?? [],
    education: cv.education ?? [],
    certifications: dedupe(cv.certifications ?? []),
    languages: cv.languages ?? candidate.languages ?? [],
    otherSections,
    // Accroche du candidat et résumé de Nora sont DEUX choses, et ne partagent
    // plus le même interrupteur. `executiveSummary` n'apparaît plus ici en
    // repli : il n'a jamais été l'accroche du candidat.
    candidateSummary: opts.keepCandidateSummary ? (cv.summary?.trim() || null) : null,
    noraSummary: opts.keepNoraSummary ? (executiveSummary?.trim() || null) : null,
    customSummary: opts.customText.length > 0 ? opts.customText : null,
    // Filigrane = le nom du cabinet, façon tampon discret. Pas de « Réf »
    // devant : la référence est déjà imprimée en clair en haut et en pied.
    watermarkText: opts.watermarkText || brandName || "",
  }
}
