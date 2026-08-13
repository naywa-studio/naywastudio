/**
 * CV parsing pipeline.
 *
 *   1. Extract raw text from a PDF buffer with pdf-parse.
 *   2. If the extraction looks empty (scanned / image PDF) bail out with a
 *      clear, user-facing error code — the OCR fallback is Sprint 2.
 *   3. Send the text to OpenRouter (gpt-4o-mini) with a strict schema
 *      prompt and return a typed ParsedCv.
 */

import { openrouterChat, safeJsonParse } from "./openrouter"
import type { ParsedCv, ParsedExperience, CandidateTaxonomy } from "./database.types"

export interface ParseResult {
  cv: ParsedCv
  taxonomy: CandidateTaxonomy
}

const MIN_USEFUL_CHARS = 280   // anything below this is almost certainly a scan
const MAX_TEXT_CHARS   = 24_000 // hard cap to keep token usage bounded

/**
 * Seuil de bascule en extraction DOUBLE PASSE.
 *
 * Mesuré sur le vivier GMH (août 2026) : le ratio « JSON produit / texte lu »
 * s'effondre quand le CV s'allonge — 1,09 sur un CV de 3 900 caractères,
 * 0,17 sur un CV de 21 000. Le modèle RÉSUME au lieu d'extraire, et il le
 * fait bien avant d'atteindre son plafond de tokens (max observé : 1 395 sur
 * 2 600 autorisés). Augmenter `maxTokens` ne corrige donc rien.
 *
 * La parade : au-delà de ce seuil, on lance une SECONDE passe dédiée aux
 * seules expériences, qui dispose alors de tout son budget pour les restituer
 * exhaustivement (descriptions comprises). Les deux passes partent en
 * parallèle — la latence reste celle d'un seul appel.
 *
 * Abaissé de 8 000 à 5 000 (août 2026) : le CV d'Aymen HAMMAMI, celui-là même
 * que GMH nous a remonté, fait 7 219 caractères et passait donc à côté de la
 * seconde passe. La difficulté ne tient pas qu'à la longueur — son CV est en
 * plusieurs colonnes et range sa carrière sous un titre « PROJETS ET STAGES ».
 * Le coût du seuil bas est une requête de plus sur des CV moyens ; elle ne
 * l'emporte que si elle rapporte davantage, et ne consomme aucun crédit client
 * supplémentaire (le quota se compte par parsing, pas par appel).
 */
const LONG_CV_CHARS = 5_000

export class CvParseError extends Error {
  code: "scanned_pdf" | "empty_pdf" | "invalid_pdf" | "llm_failed" | "llm_invalid_json"
  constructor(code: CvParseError["code"], message: string) {
    super(message)
    this.code = code
  }
}

/* -------------------------------------------------------------------------
 * ORDRE DE LECTURE — reconstruction géométrique
 *
 * `extractText` restitue les blocs dans l'ordre du FLUX INTERNE du PDF, qui
 * n'a aucune raison d'être l'ordre de lecture humain. Sur les CV mis en page
 * dans un outil de design (colonne latérale, blocs libres), les deux ordres
 * divergent, et la conséquence n'est pas cosmétique : elle CORROMPT la fiche.
 *
 * Cas mesuré (CV d'Elyas, août 2026) — le flux rendait :
 *     BDB TALENT | mai 2025 - juillet 2025
 *     Accueil, encaissement, mise en rayon ...     <- description de CARREFOUR
 *     Carrefour | depuis septembre 2024
 * chaque description arrivant AVANT son en-tête. Le modèle, qui lit dans
 * l'ordre, décalait tout d'un cran : le cabinet de recrutement héritait de la
 * mise en rayon du supermarché, et Carrefour se retrouvait sans description.
 *
 * On reconstruit donc l'ordre à partir des COORDONNÉES de chaque fragment :
 * regroupement en lignes par ordonnée, tri des lignes de haut en bas, et
 * détection d'une éventuelle gouttière verticale pour rendre les colonnes
 * l'une après l'autre plutôt que de les entrelacer (c'est ce qui collait
 * « EXPÉRIENCE PROFESSIONELLE » et « COMPETENCES » sur la même ligne chez
 * Aymen HAMMAMI).
 *
 * BEST-EFFORT STRICT : à la moindre erreur, et surtout si le texte reconstruit
 * contient MOINS de caractères que l'extraction à plat, on garde cette
 * dernière. Réordonner ne doit jamais devenir un moyen de perdre du contenu.
 * ------------------------------------------------------------------------- */

/** Au-delà, on ne réordonne pas : ce n'est plus un CV. */
const MAX_LAYOUT_PAGES = 40
/** Résolution du profil de couverture horizontale utilisé pour la gouttière. */
const GUTTER_BUCKETS = 120
/** Nombre de bandes horizontales sur lesquelles la gouttière est cherchée. */
const GUTTER_BANDS = 40

/** Fragment de texte muni de sa position sur la page. */
interface PlacedItem {
  str: string
  x: number
  y: number
  w: number
  h: number
}

/** Surface minimale de pdf.js dont on dépend, décrite localement pour ne pas
 *  s'accrocher aux types réexportés par unpdf. */
interface PdfLikePage {
  getTextContent(): Promise<{ items?: unknown }>
  getViewport(params: { scale: number }): { width: number }
}
interface PdfLikeDoc {
  numPages: number
  getPage(pageNumber: number): Promise<PdfLikePage>
}

function toPlacedItems(items: unknown): PlacedItem[] {
  if (!Array.isArray(items)) return []
  const out: PlacedItem[] = []
  for (const raw of items) {
    const it = raw as { str?: unknown; width?: unknown; height?: unknown; transform?: unknown }
    const str = typeof it?.str === "string" ? it.str : ""
    // On GARDE les fragments faits de seuls espaces : pdf.js émet souvent
    // l'espace entre deux mots comme un fragment à part entière. Les écarter
    // recollait les mots ("NAYWASTUDIO|depuisjuin2026") sans que le contrôle
    // de sécurité, qui compare hors espaces, puisse s'en apercevoir.
    if (str.length === 0) continue
    const t = it.transform
    // transform = [a, b, c, d, e, f] : e/f portent la position, d l'échelle
    // verticale, donc la taille de police effective.
    if (!Array.isArray(t) || t.length < 6) continue
    const x = Number(t[4])
    const y = Number(t[5])
    if (!isFinite(x) || !isFinite(y)) continue
    const scaleY = Math.abs(Number(t[3]))
    const h = (isFinite(scaleY) && scaleY > 0)
      ? scaleY
      : (typeof it.height === "number" && it.height > 0 ? it.height : 10)
    const w = (typeof it.width === "number" && isFinite(it.width) && it.width > 0)
      ? it.width
      : str.length * h * 0.5
    out.push({ str, x, y, w, h })
  }
  return out
}

/** Verdict de mise en page d'une page : elle est à deux colonnes, et voici où
 *  passe la séparation. Les bornes VERTICALES de la zone servent à établir ce
 *  verdict mais ne sont pas exposées : la séparation s'applique ensuite ligne
 *  par ligne sur toute la page, une ligne pleine largeur étant reconnue à ce
 *  qu'elle traverse la gouttière plutôt qu'à sa position. */
interface ColumnRegion {
  /** Abscisse de séparation. */
  splitX: number
  /** Côté portant l'essentiel du contenu. La barre latérale est tantôt à
   *  gauche, tantôt à droite ; c'est la colonne PRINCIPALE qu'on veut lire en
   *  premier et qui doit recueillir les lignes pleine largeur. */
  mainIsLeft: boolean
}

/**
 * Trouve la zone à deux colonnes d'une page, ou null s'il n'y en a pas.
 *
 * Deux enseignements tirés du CV d'Elyas, mesuré boîte par boîte :
 *
 * 1. Projeter la page entière d'un seul bloc ne marche pas. Son en-tête
 *    (nom, téléphone, mail) traverse toute la largeur et recouvre à lui seul
 *    la gouttière : la page semblait n'avoir qu'une colonne, et la barre
 *    latérale venait se glisser au milieu des descriptions de poste. D'où la
 *    recherche par BANDES horizontales.
 * 2. La séparation ne vaut pas sur toute la hauteur. Chez lui, les colonnes
 *    s'arrêtent avant la section FORMATION, qui reprend la pleine largeur.
 *    Découper jusqu'en bas aurait coupé chaque ligne de formation en deux.
 *    On délimite donc AUSSI la zone verticale où la gouttière tient.
 *
 * Reste volontairement CONSERVATEUR : sans gouttière franche, sans zone assez
 * haute, ou avec deux côtés déséquilibrés, on renvoie null et la page est lue
 * d'un seul tenant. Mal découper ferait plus de dégâts que ne pas découper.
 */
function findColumnRegion(items: PlacedItem[], pageWidth: number): ColumnRegion | null {
  if (!isFinite(pageWidth) || pageWidth <= 0) return null
  if (items.length < 40) return null

  let minY = Infinity
  let maxY = -Infinity
  for (const it of items) {
    if (it.y < minY) minY = it.y
    if (it.y > maxY) maxY = it.y
  }
  const span = maxY - minY
  if (!isFinite(span) || span <= 0) return null

  const bucketWidth = pageWidth / GUTTER_BUCKETS
  const bandHeight = span / GUTTER_BANDS
  const bands: boolean[][] = Array.from(
    { length: GUTTER_BANDS },
    () => new Array<boolean>(GUTTER_BUCKETS).fill(false),
  )
  const bandUsed = new Array<boolean>(GUTTER_BANDS).fill(false)
  const bandOf = (y: number) =>
    Math.min(GUTTER_BANDS - 1, Math.max(0, Math.floor((maxY - y) / bandHeight)))

  for (const it of items) {
    const bi = bandOf(it.y)
    bandUsed[bi] = true
    const from = Math.max(0, Math.floor(it.x / bucketWidth))
    const to = Math.min(GUTTER_BUCKETS - 1, Math.floor((it.x + it.w) / bucketWidth))
    for (let b = from; b <= to; b++) bands[bi][b] = true
  }

  const usedBands = bandUsed.filter(Boolean).length
  if (usedBands < 8) return null

  // Un seau est « gouttière » s'il reste vide sur au moins trois quarts des
  // bandes occupées. Le seuil laisse passer une section pleine largeur en
  // haut ou en bas sans faire échouer la détection.
  const isGutter = new Array<boolean>(GUTTER_BUCKETS).fill(false)
  for (let b = 0; b < GUTTER_BUCKETS; b++) {
    let empty = 0
    for (let i = 0; i < GUTTER_BANDS; i++) {
      if (bandUsed[i] && !bands[i][b]) empty++
    }
    isGutter[b] = empty >= usedBands * 0.75
  }

  // Plage de gouttière la plus large, bordée de contenu des deux côtés : une
  // marge de page touche un bord et se trouve donc écartée d'office.
  let bestStart = -1
  let bestLen = 0
  let b = 0
  while (b < GUTTER_BUCKETS) {
    if (!isGutter[b]) { b++; continue }
    let end = b
    while (end < GUTTER_BUCKETS && isGutter[end]) end++
    if (b > 0 && end < GUTTER_BUCKETS && end - b > bestLen) {
      bestStart = b
      bestLen = end - b
    }
    b = end
  }
  // Moins de ~4 % de la largeur : c'est une respiration typographique, pas une
  // séparation de colonnes.
  if (bestLen < 5) return null

  const splitX = (bestStart + bestLen / 2) * bucketWidth

  // Bandes où la gouttière tient vraiment. Une bande vide ne rompt pas la
  // continuité (interligne), une bande pleine largeur si.
  const bandSplits = new Array<boolean>(GUTTER_BANDS).fill(false)
  for (let i = 0; i < GUTTER_BANDS; i++) {
    if (!bandUsed[i]) { bandSplits[i] = true; continue }
    let clear = true
    for (let g = bestStart; g < bestStart + bestLen; g++) {
      if (bands[i][g]) { clear = false; break }
    }
    bandSplits[i] = clear
  }

  let runStart = -1
  let runEnd = -1
  let bestRunUsed = 0
  let i = 0
  while (i < GUTTER_BANDS) {
    if (!bandSplits[i]) { i++; continue }
    let end = i
    let used = 0
    while (end < GUTTER_BANDS && bandSplits[end]) {
      if (bandUsed[end]) used++
      end++
    }
    if (used > bestRunUsed) {
      bestRunUsed = used
      runStart = i
      runEnd = end
    }
    i = end
  }
  // Une zone à deux colonnes trop courte ne vaut pas le risque de la découpe.
  if (bestRunUsed < 8) return null

  // L'équilibre des deux colonnes se juge DANS la zone où elles coexistent :
  // compté sur la page entière, un bandeau d'en-tête ou une section pleine
  // largeur fausserait la mesure.
  const yTop = maxY - runStart * bandHeight
  const yBottom = maxY - runEnd * bandHeight

  let left = 0
  let right = 0
  let straddling = 0
  for (const it of items) {
    if (it.y > yTop || it.y < yBottom) continue
    if (it.x + it.w <= splitX) left++
    else if (it.x >= splitX) right++
    else straddling++
  }
  const inside = left + right + straddling
  if (inside < 20) return null
  // Test SYMÉTRIQUE : la barre latérale est tantôt à gauche, tantôt à droite.
  // Exiger un côté gauche dominant écartait à tort 12 CV du corpus de recette
  // dont la colonne étroite est à gauche (elle n'y pèse que 8 à 27 %).
  const dominant = Math.max(left, right)
  const minor = Math.min(left, right)
  if (dominant < inside * 0.30) return null
  if (minor < inside * 0.08) return null
  if (straddling > inside * 0.10) return null

  return { splitX, mainIsLeft: left >= right }
}

/** Assemble une ligne : fragments de gauche à droite, espace inséré seulement
 *  quand l'écart le justifie (sinon on couperait les mots en deux). */
function renderLine(line: PlacedItem[]): string {
  const sorted = [...line].sort((a, b) => a.x - b.x)
  let out = ""
  let prevRight: number | null = null
  for (const it of sorted) {
    if (prevRight !== null && it.x - prevRight > it.h * 0.25) out += " "
    out += it.str
    prevRight = it.x + it.w
  }
  return out
}

/** Regroupe les fragments en lignes (ordonnée décroissante : en PDF, l'origine
 *  est en bas à gauche). */
function groupIntoLines(items: PlacedItem[]): PlacedItem[][] {
  if (items.length === 0) return []
  const heights = items.map((i) => i.h).sort((a, b) => a - b)
  const medianHeight = heights[Math.floor(heights.length / 2)] || 10
  const tolerance = Math.max(1.5, medianHeight * 0.6)

  const sorted = [...items].sort((a, b) => (b.y - a.y) || (a.x - b.x))
  const lines: PlacedItem[][] = []
  let current: PlacedItem[] = []
  let refY = sorted[0].y
  for (const it of sorted) {
    if (current.length > 0 && Math.abs(it.y - refY) > tolerance) {
      lines.push(current)
      current = []
    }
    if (current.length === 0) refY = it.y
    current.push(it)
  }
  if (current.length > 0) lines.push(current)
  return lines
}

function toLines(items: PlacedItem[]): string[] {
  return groupIntoLines(items).map(renderLine).filter((l) => l.trim().length > 0)
}

/**
 * Rend une page en séparant les colonnes LIGNE PAR LIGNE.
 *
 * Découper la page en deux blocs d'items sur la seule abscisse ne suffisait
 * pas : dans la zone à deux colonnes, la colonne principale émet parfois une
 * ligne assez longue pour traverser la gouttière (chez Elyas : « Planification
 * et suivi des formations obligatoires de plus de 2 000 collaborateurs… »), et
 * les sections pleine largeur du bas de page font de même. Couper à l'aveugle
 * aurait expédié la fin de ces lignes dans la barre latérale.
 *
 * On regarde donc chaque ligne : celle qui TRAVERSE la gouttière est une ligne
 * pleine largeur et reste entière du côté principal ; seules celles qui
 * présentent un vrai vide au niveau de la gouttière sont séparées en deux.
 * Chaque fragment atterrit dans exactement une ligne de sortie.
 */
function renderPage(items: PlacedItem[], pageWidth: number): string {
  const region = findColumnRegion(items, pageWidth)
  if (!region) return toLines(items).join("\n")
  const { splitX, mainIsLeft } = region

  const mainLines: string[] = []
  const asideLines: string[] = []
  const push = (target: string[], line: PlacedItem[]) => {
    const rendered = renderLine(line)
    if (rendered.trim().length > 0) target.push(rendered)
  }

  for (const line of groupIntoLines(items)) {
    // Une ligne qui traverse la gouttière est pleine largeur : elle revient
    // entière à la colonne principale.
    if (line.some((it) => it.x < splitX && it.x + it.w > splitX)) {
      push(mainLines, line)
      continue
    }
    const left = line.filter((it) => it.x + it.w <= splitX)
    const right = line.filter((it) => it.x >= splitX)
    const main = mainIsLeft ? left : right
    const aside = mainIsLeft ? right : left
    if (main.length === 0) { push(asideLines, line); continue }
    if (aside.length === 0) { push(mainLines, line); continue }
    push(mainLines, main)
    push(asideLines, aside)
  }

  // Colonne principale d'un seul tenant, puis la colonne étroite. Chacune
  // garde son fil, au lieu d'être hachée ligne à ligne par sa voisine.
  return [...mainLines, "", ...asideLines].join("\n")
}

async function extractTextByLayout(doc: PdfLikeDoc): Promise<string> {
  const pageCount = Math.min(doc.numPages ?? 0, MAX_LAYOUT_PAGES)
  const pages: string[] = []
  for (let p = 1; p <= pageCount; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const items = toPlacedItems(content?.items)
    if (items.length === 0) continue
    pages.push(renderPage(items, page.getViewport({ scale: 1 }).width))
  }
  return pages.join("\n\n")
}

/**
 * Le texte réordonné n'est retenu que s'il ne PERD rien.
 *
 * DEUX contrôles, et le second a été appris à ses dépens. Comparer les seuls
 * caractères hors espaces laissait passer une version où TOUS les espaces
 * intra-ligne avaient sauté ("NAYWASTUDIO|depuisjuin2026") : le contenu était
 * intact au caractère près, illisible en pratique. On vérifie donc aussi que
 * le découpage en mots survit.
 */
function layoutTextIsSafe(layout: string, flat: string): boolean {
  const dense = (s: string) => s.replace(/\s+/g, "").length
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length
  if (dense(layout) === 0) return false
  if (dense(layout) < dense(flat) * 0.98) return false
  return words(layout) >= words(flat) * 0.95
}

export async function extractPdfText(buf: Buffer): Promise<string> {
  // unpdf ships a serverless-friendly pdfjs build — no DOMMatrix / Path2D
  // browser globals required, unlike pdf-parse v2. Works on Vercel Node.
  const { extractText, getDocumentProxy } = await import("unpdf")
  let text = ""
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buf))
    const out = await extractText(pdf, { mergePages: true })
    const flat = Array.isArray(out.text) ? out.text.join("\n") : (out.text ?? "")
    let layout = ""
    try {
      layout = await extractTextByLayout(pdf as unknown as PdfLikeDoc)
    } catch (err) {
      // Le réordonnancement est un CONFORT : son échec ne doit jamais coûter
      // un parsing. On le trace pour la recette et on reprend le texte à plat.
      console.warn(`[cv-parser] ordre de lecture non reconstruit : ${(err as Error).message}`)
      layout = ""
    }
    const useLayout = layoutTextIsSafe(layout, flat)
    console.log(
      `[cv-parser] ordre de lecture : ${useLayout ? "geometrique" : "flux PDF"} ` +
      `(${layout.length}c reordonnes vs ${flat.length}c a plat)`,
    )
    text = useLayout ? layout : flat
  } catch (err) {
    throw new CvParseError("invalid_pdf", `PDF illisible: ${(err as Error).message}`)
  }
  text = (text ?? "")
    // Octets NUL : certains PDF en produisent à l'extraction. Ils étaient
    // jusqu'ici filtrés par une regex contenant un NUL LITTÉRAL dans la source,
    // invisible à la relecture — et qui faisait classer ce fichier comme
    // binaire par ripgrep, donc l'excluait de toute recherche du dépôt.
    // Même comportement, écrit avec un échappement lisible.
    .replace(/\0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  if (!text) throw new CvParseError("empty_pdf", "Le PDF ne contient pas de texte extractible.")
  if (text.length < MIN_USEFUL_CHARS) {
    throw new CvParseError(
      "scanned_pdf",
      "Ce PDF semble être scanné (image). L'OCR automatique arrivera prochainement. " +
      "Pour l'instant, merci de fournir un PDF natif (export depuis Word, LinkedIn, etc.).",
    )
  }
  return text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text
}

const SYSTEM_PROMPT = `Tu es un assistant qui extrait des informations structurées depuis un CV en texte brut.
Tu réponds UNIQUEMENT en JSON valide, sans texte avant ou après.
Le JSON doit suivre ce schéma exactement (toutes les clés présentes, mettre null ou tableau vide si l'info est absente) :

{
  "full_name":        string | null,
  "email":            string | null,
  "phone":            string | null,
  "location":         string | null,
  "linkedin_url":     string | null,
  "github_url":       string | null,
  "portfolio_url":    string | null,
  "malt_url":         string | null,
  "current_title":    string | null,
  "current_company":  string | null,
  "years_experience": number | null,
  "seniority_level":  "etudiant" | "stagiaire" | "junior" | "mid" | "senior" | "lead" | "principal" | null,
  "seniority_role":   string | null,
  "is_apprentice":    boolean,
  "summary":          string | null,
  "language":         "fr" | "en" | "es" | "de" | "it" | "pt" | "nl" | null,
  "sector":           "tech" | "finance" | "retail" | "sante" | "industrie" | "conseil" | "marketing" | "rh" | "public" | "education" | "autre" | null,
  "skills":           string[],
  "qualities":        string[],
  "languages":        string[],
  "experience": [
    {
      "title":            string,
      "company":          string,
      "start":            string | null,
      "end":              string | null,
      "location":         string | null,
      "description":      string | null,
      "seniority":        "stage" | "junior" | "mid" | "senior" | "lead" | "principal" | null,
      "counts_toward_role": boolean
    }
  ],
  "education": [
    {
      "degree": string,
      "school": string,
      "field":  string | null,
      "start":  string | null,
      "end":    string | null
    }
  ],
  "certifications": string[],
  "warnings": string[],
  "taxonomy": {
    "role_family":  string[],
    "domains":      string[],
    "industries":   string[],
    "tools":        string[],
    "core_skills":  string[]
  }
}

RÈGLES GÉNÉRALES :
- N'invente RIEN qui ne soit pas explicitement dans le texte du CV. En cas de doute, mets null ou [] plutôt que de deviner. C'est mieux d'omettre que d'halluciner.
- Si une info n'apparaît pas dans le CV → null (ou [] pour les tableaux).
- Pas de markdown, pas de commentaires, JSON pur.

URLS (linkedin, github, portfolio, malt) :
- Capture l'URL telle qu'elle apparaît (avec ou sans https://) — la normalisation est faite après.
- "linkedin_url" : profil LinkedIn (/in/ ou /pub/).
- "github_url" : profil GitHub uniquement (github.com/<user>), pas un repo individuel.
- "portfolio_url" : site personnel / portfolio générique (Behance, Dribbble, Notion publique, site .com personnel).
- "malt_url" : profil Malt (malt.fr ou malt.com/profile/...).

LANGUE :
- "language" : la langue principale dans laquelle le CV est rédigé (code ISO 639-1 : "fr", "en", etc.). null si vraiment indéterminable.

SECTEUR :
- "sector" : grand secteur dominant du candidat sur sa trajectoire récente (3-5 dernières années si possible). Choisis EXACTEMENT UNE valeur dans la liste fermée :
  - "tech" : édition logiciel, SaaS, data, IA, web, mobile, cybersécurité, ESN à dominante dev. STRICTEMENT le NUMÉRIQUE. Les mots "technique", "ingénieur" ou "engineering" ne suffisent JAMAIS à classer en "tech" : un ingénieur électrique, mécanique, énergie, procédés, automatisme ou génie civil relève de "industrie".
  - "finance" : banque, assurance, asset management, fintech B2B, audit financier
  - "retail" : e-commerce, distribution, grande conso, mode, luxe
  - "sante" : hôpital, biotech, pharma, medtech, e-santé
  - "industrie" : industriel, automobile, aéronautique, énergie, BTP, transport, électricité et électrotechnique, mécanique, procédés, automatisme, génie civil, mise en service / commissioning, maintenance industrielle, bureaux d'études techniques
  - "conseil" : conseil en stratégie, en management, cabinet d'avocats, audit non-financier
  - "marketing" : pub, communication, médias, événementiel, contenu, créa
  - "rh" : cabinet de recrutement, formation, RH conseil
  - "public" : administration, collectivités, ONG, fonction publique
  - "education" : enseignement, recherche académique
  - "autre" : si rien ne colle clairement (étudiant sans XP pertinente, ou mix très éclaté)
- Le secteur se juge sur les EMPLOYEURS et les MISSIONS RÉELLES, jamais sur la liste d'outils. Un ingénieur énergie ou BTP qui a appris le C/C++ ou MATLAB en école d'ingénieur relève de "industrie", PAS de "tech" : regarde où il a travaillé, pas ce qu'il a étudié.
- Mets null UNIQUEMENT si tu n'as vraiment AUCUN indice exploitable (CV quasi vide).

EXHAUSTIVITÉ — RÈGLE PRIORITAIRE :
- Ta mission est d'EXTRAIRE, pas de résumer. Un CV long doit produire une extraction longue. Ne condense JAMAIS pour faire court : si le CV liste 11 expériences et 25 outils, tu restitues 11 expériences et 25 outils.
- N'omets AUCUNE expérience professionnelle, même ancienne, même décrite en une ligne.
- Balaye le document ENTIER pour les compétences et outils. Ils sont souvent hors d'une section "Compétences" : sous "Formation", "Divers", "Informatique", "Logiciels", ou noyés dans les descriptions de poste. Un intitulé de section trompeur ne doit JAMAIS te faire ignorer son contenu.
- L'ORDRE DU TEXTE PEUT ÊTRE IMPARFAIT. Un CV mis en page en colonnes ou en blocs libres arrive parfois désordonné : une colonne latérale peut s'intercaler au milieu d'une section, une description apparaître avant l'employeur qu'elle décrit. Rattache chaque bloc à son poste par le SENS, pas seulement par la position. Un paragraphe qui parle d'encaissement et de mise en rayon appartient au supermarché, pas au cabinet de recrutement cité juste au-dessus.
- DESCRIPTIONS DE POSTE : reprends les lignes de mission rattachées au poste en gardant les termes du CV (chiffres, outils, normes, intitulés), jusqu'à 600 caractères par poste. Une description élaguée fait disparaître exactement ce sur quoi le recruteur juge.
- COUVRIR TOUS LES POSTES PRIME SUR EN ALLONGER UN. N'omets JAMAIS un poste pour tenir dans le format. Si le CV en compte beaucoup et que ta réponse s'annonce très longue, écourte en commençant par les postes les PLUS ANCIENS, et laisse intactes les descriptions des trois plus récents. Ce n'est pas une invitation à raccourcir par défaut : tant que tu peux tout dire, dis tout.
- Les outils métier spécialisés (simulation, calcul, CAO, ERP, instrumentation…) sont ce qui rend un profil recrutable : ils priment sur la bureautique générique. Ne garde jamais "Word/Excel" en écartant un outil spécialisé faute de place.

SKILLS vs QUALITIES (deux listes séparées, un item dans UNE SEULE) :
- "skills" = compétences vérifiables : technique, méthodologie, outil, framework, langue. Quelque chose qu'on peut tester ou citer dans une fiche de poste. Ex : "SQL", "Agile", "Python", "Salesforce", "négociation B2B", "anglais courant". Max 40.
- "qualities" = traits humains / soft skills observables au quotidien. Ex : "rigueur", "leadership", "adaptabilité", "esprit d'équipe", "autonomie". Max 15.
- Si tu hésites, mets dans "skills". Les langues parlées vont dans "languages", pas dans "skills".

SÉNIORITÉ :
- DATES : capture-les le plus précisément possible (YYYY-MM si dispo, sinon YYYY). NE LES INVENTE PAS. Le calcul d'années est fait par notre code à partir de ces dates : ta précision sur les dates est ce qui compte le plus.
- "end" = null signifie EN COURS, rien d'autre. Mets null UNIQUEMENT si le CV présente ce poste comme actuel : "depuis 2024", "présent", "aujourd'hui", "à ce jour", période laissée ouverte. Dès qu'une date de fin figure au CV, reprends-la, même approximative ("fin 2019" → "2019"). Notre interface affiche tout poste à null comme le poste ACTUEL du candidat : y mettre un poste terminé est une erreur visible par le client final.
- Plusieurs postes peuvent légitimement être en cours en même temps (gérance, freelance, mandat, emploi en parallèle). N'en referme aucun pour "faire propre" : recopie ce que dit le CV.
- "years_experience" : ton estimation indicative en années arrondie au plus proche entier. **NE COMPTE QUE LE TRAVAIL POST-DIPLÔME** : stages avant diplôme, alternances et années d'études n'entrent PAS dans le calcul. Quelqu'un qui a son diplôme depuis 10 ans mais n'a vraiment travaillé que 2 ans (gaps, autre formation, sabbatique) = 2 ans, pas 10. Notre code recalcule à partir des dates + du flag is_apprentice.
- "is_apprentice" : true si la personne est ACTUELLEMENT en alternance / apprentissage / contrat pro (mots-clés à chercher : "Apprenti", "Alternance", "Contrat d'apprentissage", "Contrat de professionnalisation", parfois mention "BUT 2 / Master en alternance"). False sinon (y compris pour les anciens alternants qui sont maintenant en CDI). Si tu hésites → false.
- "seniority_level" : séniorité **dans le rôle dominant** (pas en années absolues). Quelqu'un qui a 10 ans d'XP totale mais a switché de domaine il y a 1 an n'est PAS senior dans le nouveau rôle.
  - "etudiant" : actuellement en études (job étudiant, alternance, pas encore diplômé) ;
  - "stagiaire" : profil cherchant/effectuant un stage ;
  - "junior" < 3 ans dans le rôle, "mid" 3-6, "senior" 6-10, "lead" 10-14, "principal" 15+.
  Notre code peut recalculer ce niveau à partir des expériences taguées "counts_toward_role" — ton tag est un fallback.
- "seniority_role" : le rôle dominant auquel la séniorité se rapporte (ex : "Data Engineer", "Product Manager"). null pour étudiant/stagiaire.
- Sur CHAQUE entrée d'experience :
  - "seniority" = niveau tenu DANS CETTE expérience précise (stage/junior/mid/senior/lead/principal). Permet de visualiser la progression.
  - "counts_toward_role" = true si cette expérience appartient au même domaine/métier que le "seniority_role" dominant, false sinon. Ex : pour un Data Engineer senior, ses 2 ans de marketing en début de carrière → false ; ses postes Data → true. Pour un junior sans rôle dominant identifié → mets true sur tous les postes pro.

LANGUAGES :
- "languages" : langues parlées avec niveau si donné (ex: "Français (langue maternelle)", "Anglais (C1)", "Espagnol (notions)").

SUMMARY :
- 2-3 phrases SYNTHÉTISÉES utiles à un recruteur — pas un copier-coller du paragraphe "à propos". Couvre : (1) métier/rôle principal, (2) domaine/secteur dominant + 2-3 compétences/outils différenciants, (3) trajectoire ou point fort distinctif (ex: "passé d'analyste à Tech Lead", "mix data science + product").
- N'ÉCRIS JAMAIS un nombre total d'années d'expérience dans le résumé. Les CV affichent souvent un compte périmé dans leur en-tête ("12 ans d'expérience" sur un CV vieux de 3 ans) ; notre code, lui, recalcule cette valeur depuis les dates réelles et l'affiche à côté du résumé. Reprendre le chiffre du CV crée une contradiction visible pour le sourceur. Les durées d'un POSTE précis ("4 ans chez X") restent autorisées.
- Reste factuel — uniquement ce qui est dans le CV. Si le CV est très pauvre, 1 phrase honnête vaut mieux que du meublage.

WARNINGS — alertes pour le sourceur :
- 0 à 3 alertes courtes (< 80 caractères chacune) en français, sur ce qui pose question À LA LECTURE du CV.
- Périmètre STRICT. Tu ne signales QUE ces trois situations, et rien d'autre :
  - trou inexpliqué de plus de 6 mois entre deux postes
  - intitulé de poste trop vague pour être exploitable (ex: "consultant" sans précision)
  - CV visiblement périmé : l'en-tête annonce un nombre d'années qui ne colle pas aux dates listées
- NE COMPTE RIEN. Notre code calcule lui-même, sur le JSON que tu produis, les dates manquantes, les dates incohérentes, les descriptions absentes et les postes en cours. Une alerte de ta part sur ces sujets serait un doublon au mieux, une contradiction au pire : nous avons déjà vu le modèle annoncer « aucune description sur plus de la moitié des postes » sur un CV où les six postes en avaient une.
- N'ALERTE JAMAIS sur un poste EN COURS. Un poste présenté comme actuel ("depuis 2024", "présent", "aujourd'hui", période ouverte) n'a pas de date de fin manquante : il n'en a pas encore.
- Une alerte doit pouvoir être VÉRIFIÉE en rouvrant le CV. Si tu n'es pas certain, n'écris rien : une alerte fausse coûte plus cher qu'une alerte absente, elle apprend au sourceur à ne plus les lire. Tableau vide si tout est cohérent.

TAXONOMY — classement pour le matching futur, sois rigoureux :
- N'invente AUCUN tag qui ne soit pas DIRECTEMENT supporté par une mention explicite dans le texte du CV. Si tu ne peux pas pointer la phrase qui justifie le tag, ne le mets pas.
- "role_family" : 1 à 3 familles de métier normalisées et génériques (ex: "Data Engineer", "Product Manager", "Commercial B2B"). PAS le titre exact du CV, la CATÉGORIE.
- "domains" : domaines fonctionnels où la personne a vraiment travaillé (ex: "paiement", "logistique", "cybersécurité"). Sois PRÉCIS et complet : sur un profil technique, "air comprimé", "vapeur", "eau glacée", "lutte incendie" valent bien mieux que le seul mot "fluides". Max 10.
- "industries" : secteurs d'activité des entreprises où elle a travaillé (ex: "banque", "e-commerce", "santé"). Max 10.
- "tools" : technologies / logiciels / frameworks maîtrisés et nommés dans le CV (ex: "AWS", "Salesforce", "Figma", "Aspen", "AutoCAD"). Prends-les PARTOUT dans le document, y compris hors section "Compétences". Max 30.
- "core_skills" : 8 à 20 compétences réellement déterminantes pour recruter ce profil. IGNORE le bruit (sports, loisirs, soft skills génériques).
- Tout en minuscules sauf les noms propres/acronymes. Déduplique. Si rien de fiable → tableau vide.`

/**
 * Prompt de la SECONDE PASSE — parcours professionnel uniquement.
 *
 * Déclenché sur les CV longs (cf. LONG_CV_CHARS). En n'ayant qu'un seul objet
 * à produire, le modèle cesse d'arbitrer entre « tout dire » et « tenir dans
 * le format » : il dispose de tout son budget pour les expériences, qui sont
 * la partie la plus coûteuse à restituer et la première sacrifiée en passe
 * unique.
 */
const EXPERIENCE_PROMPT = `Tu es un assistant qui extrait EXHAUSTIVEMENT le parcours professionnel depuis un CV en texte brut.
Tu réponds UNIQUEMENT en JSON valide, sans texte avant ou après, à ce format :

{
  "experience": [
    {
      "title":            string,
      "company":          string,
      "start":            string | null,
      "end":              string | null,
      "location":         string | null,
      "description":      string | null,
      "seniority":        "stage" | "junior" | "mid" | "senior" | "lead" | "principal" | null,
      "counts_toward_role": boolean
    }
  ]
}

RÈGLES :
- EXHAUSTIVITÉ ABSOLUE : reprends TOUTES les expériences, de la plus récente à la plus ancienne. Aucune omission, même pour un poste décrit en une seule ligne. C'est ta seule mission ici : tu as tout ton budget pour elle.
- ATTENTION AUX TITRES DE SECTION TROMPEURS : un CV range parfois toute sa carrière sous "PROJETS", "PARCOURS", "DIVERS" ou même "STAGES". Ce qui décide qu'une ligne est une expérience professionnelle, ce sont les DATES et l'EMPLOYEUR — jamais le titre de la section qui la contient.
- Ne FUSIONNE JAMAIS deux postes distincts en une seule entrée : deux employeurs différents, ou deux intitulés successifs chez le même employeur, font deux entrées.
- "description" : reprends les lignes de mission du poste en CONSERVANT les termes du CV (chiffres, outils, normes, spécialités, types d'installations), jusqu'à 600 caractères par poste. N'invente rien, mais n'élague rien non plus.
- COUVRIR TOUS LES POSTES PRIME SUR EN ALLONGER UN. N'omets JAMAIS un poste pour tenir dans le format. Si ta réponse s'annonce très longue, écourte en commençant par les postes les PLUS ANCIENS et laisse intactes les descriptions des trois plus récents. Ce n'est pas une invitation à raccourcir par défaut : tant que tu peux tout dire, dis tout.
- L'ORDRE DU TEXTE PEUT ÊTRE IMPARFAIT : sur un CV en colonnes ou en blocs, une description peut apparaître avant l'employeur qu'elle décrit, ou une colonne latérale s'intercaler. Rattache chaque description à son poste par le SENS, pas seulement par la position. Un bloc qui parle d'encaissement et de mise en rayon appartient au supermarché, pas au cabinet de recrutement mentionné juste au-dessus.
- "end" : null UNIQUEMENT pour un poste que le CV présente comme EN COURS ("depuis…", "présent", "aujourd'hui", période ouverte). Dès qu'une date de fin figure au CV, reprends-la. PLUSIEURS postes peuvent être en cours simultanément (gérance, freelance, mandat, emploi en parallèle) : ne referme aucun poste pour "faire propre".
- Dates : "YYYY-MM" si le mois est disponible, sinon "YYYY". Ne les invente pas — null si vraiment absente.
- "seniority" : niveau réellement tenu DANS CE POSTE. Un poste de direction, de gérance ou de chefferie de projet tenu plusieurs années n'est pas "mid".
- "counts_toward_role" : false pour les stages, jobs étudiants et postes hors du métier dominant ; true sinon.
- Pas de markdown, pas de commentaire, JSON pur.`

interface LlmCvPayload extends ParsedCv {
  taxonomy?: {
    role_family?: unknown
    domains?: unknown
    industries?: unknown
    tools?: unknown
    core_skills?: unknown
  }
}

/** Longueur cumulée des descriptions d'une liste d'expériences brutes. */
function describedLength(list: unknown): number {
  if (!Array.isArray(list)) return 0
  let total = 0
  for (const e of list) {
    const d = (e as { description?: unknown } | null)?.description
    if (typeof d === "string") total += d.trim().length
  }
  return total
}

/**
 * Seconde passe « expériences seules ». BEST-EFFORT : toute erreur renvoie
 * null et on garde le parcours de la passe principale — un CV long mal
 * découpé vaut toujours mieux qu'un parse en échec.
 */
async function parseExperiencesOnly(rawText: string): Promise<unknown[] | null> {
  try {
    const result = await openrouterChat({
      model: "openai/gpt-4o-mini",
      temperature: 0.1,
      responseFormat: "json_object",
      maxTokens: 4_000,
      timeoutMs: 40_000,
      messages: [
        { role: "system", content: EXPERIENCE_PROMPT },
        { role: "user", content: `Voici le CV :\n\n${rawText}` },
      ],
    })
    const parsed = safeJsonParse<{ experience?: unknown }>(result.content)
    const list = parsed?.experience
    return Array.isArray(list) && list.length > 0 ? list : null
  } catch {
    return null
  }
}

export async function parseCvWithLlm(rawText: string): Promise<ParseResult> {
  const isLong = rawText.length > LONG_CV_CHARS

  // Les deux passes partent EN PARALLÈLE : la latence totale reste celle du
  // plus lent des deux appels et non leur somme, ce qui laisse la route très
  // en deçà de ses 90 s même sur un CV de 24 000 caractères.
  const [result, secondPassExperiences] = await Promise.all([
    openrouterChat({
      model: "openai/gpt-4o-mini",
      temperature: 0.1,
      responseFormat: "json_object",
      // Relevé de 2 600 à 4 000. Le plafond était calé sur des descriptions
      // que le prompt ne bornait pas et qui sortaient à 150-250 caractères ;
      // en réclamant l'exhaustivité, la sortie a doublé et le JSON s'est mis à
      // être TRONQUÉ, donc invalide — le CV de Merzouk Habi (21 000
      // caractères) est passé en erreur de parsing. Un JSON coupé au milieu ne
      // laisse aucune trace parlante : l'erreur remontée est « JSON invalide »
      // et rien n'indique que c'est le budget qui a manqué.
      maxTokens: 4_000,
      // 40 s de plafond. La route a 90 s (maxDuration) et les deux passes
      // partent en parallèle : le pire cas reste très en deçà du watchdog,
      // tout en laissant de la marge à l'OCR de secours.
      timeoutMs: 40_000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Voici le CV :\n\n${rawText}` },
      ],
    }),
    isLong ? parseExperiencesOnly(rawText) : Promise.resolve(null),
  ])

  const parsed = safeJsonParse<LlmCvPayload>(result.content)
  if (!parsed || typeof parsed !== "object") {
    throw new CvParseError("llm_invalid_json", "Le LLM n'a pas renvoyé un JSON valide.")
  }

  // Arbitrage entre les deux parcours : on garde le PLUS COMPLET, jamais une
  // fusion (dédupliquer deux listes d'expériences sans clé fiable produirait
  // des doublons ou des postes mutilés). Plus d'entrées l'emporte ; à nombre
  // égal, les descriptions les plus fournies l'emportent.
  if (secondPassExperiences) {
    const firstPass = Array.isArray(parsed.experience) ? parsed.experience : []
    const richer =
      secondPassExperiences.length > firstPass.length ||
      (secondPassExperiences.length === firstPass.length &&
        describedLength(secondPassExperiences) > describedLength(firstPass))
    if (richer) {
      parsed.experience = secondPassExperiences as ParsedExperience[]
    }
    // Trace de recette : sans elle, impossible de savoir depuis les logs si la
    // seconde passe s'est declenchee ni si elle a apporte quelque chose.
    console.log(
      `[cv-parser] 2e passe : ${firstPass.length} exp (${describedLength(firstPass)}c) ` +
      `vs ${secondPassExperiences.length} exp (${describedLength(secondPassExperiences)}c) ` +
      `-> ${richer ? "2e passe retenue" : "1re passe conservee"}`,
    )
  } else if (isLong) {
    console.log("[cv-parser] 2e passe declenchee mais sans resultat exploitable")
  }

  const cv = normalizeParsedCv(parsed)
  const taxonomy = normalizeTaxonomy(parsed.taxonomy, cv)
  return { cv, taxonomy }
}

/**
 * OCR fallback for scanned / image-only PDFs.
 *
 * Sends the raw PDF to OpenRouter with the built-in file-parser plugin
 * (mistral-ocr engine, ≈ $0.002/page). The OCR'd text is fed straight into
 * the same parse prompt, so we get a structured ParseResult in one call —
 * no PDF→image rendering needed on the Node side.
 */
export async function parseCvViaOcr(buf: Buffer): Promise<ParseResult> {
  const base64 = buf.toString("base64")
  const result = await openrouterChat({
    model: "openai/gpt-4o-mini",
    temperature: 0.1,
    responseFormat: "json_object",
    // Aligné sur la passe texte : ce chemin sert le MÊME prompt, il porte donc
    // exactement le même risque de JSON tronqué. L'oublier ici aurait laissé
    // les PDF scannés tomber en « JSON invalide » alors que les PDF natifs
    // venaient d'être réparés — et les scans sont justement ceux qu'on ne peut
    // pas re-parser ensuite, faute de texte brut conservé.
    maxTokens: 4_000,
    // 40 s de plafond, pour la même raison qu'au-dessus : la route dispose de
    // 90 s, il reste de la marge pour écrire le statut en base.
    timeoutMs: 40_000,
    plugins: [{ id: "file-parser", pdf: { engine: "mistral-ocr" } }],
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Voici le CV (PDF scanné, lis-le via OCR puis extrais les informations) :" },
          { type: "file", file: { filename: "cv.pdf", file_data: `data:application/pdf;base64,${base64}` } },
        ],
      },
    ],
  })

  const parsed = safeJsonParse<LlmCvPayload>(result.content)
  if (!parsed || typeof parsed !== "object") {
    throw new CvParseError("llm_invalid_json", "L'OCR n'a pas renvoyé un JSON valide.")
  }
  const cv = normalizeParsedCv(parsed)
  if (!cv.full_name && (cv.experience?.length ?? 0) === 0 && (cv.skills?.length ?? 0) === 0) {
    throw new CvParseError("scanned_pdf", "L'OCR n'a rien pu extraire de ce PDF — qualité d'image trop faible.")
  }
  const taxonomy = normalizeTaxonomy(parsed.taxonomy, cv)
  taxonomy.seniority = cv.seniority_level ?? null
  const out: ParseResult = { cv: { ...cv, source_quality: "scanned" }, taxonomy }
  return out
}

function normalizeTaxonomy(
  raw: LlmCvPayload["taxonomy"],
  cv: ParsedCv,
): CandidateTaxonomy {
  const arr = (v: unknown, max: number): string[] => {
    if (!Array.isArray(v)) return []
    const seen = new Set<string>()
    const out: string[] = []
    for (const x of v) {
      const s = String(x).trim()
      if (!s) continue
      const k = s.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push(s)
      if (out.length >= max) break
    }
    return out
  }
  // Plafonds relevés (août 2026) : les anciennes valeurs (2/6/6/15/12)
  // rabotaient la taxonomie juste après que le prompt ait demandé
  // l'exhaustivité — sur un profil technique, les outils spécialisés qui le
  // rendent trouvable tombaient hors des 15 premiers. C'est cette taxonomie,
  // et elle seule, que voit le matching : ce qui est coupé ici est perdu
  // définitivement pour le scoring (cf. matching.ts, le CV brut n'est jamais relu).
  return {
    role_family: arr(raw?.role_family, 3),
    domains:     arr(raw?.domains, 10),
    industries:  arr(raw?.industries, 10),
    tools:       arr(raw?.tools, 30),
    core_skills: arr(raw?.core_skills, 20),
    seniority:   cv.seniority_level ?? null,
    mission_tags: [],
  }
}

/* ─── Field normalization helpers ─── */

/** Ensure a URL has a scheme + matches the expected host (best-effort). */
function normalizeUrl(raw: unknown, expectedHost?: RegExp): string | null {
  if (typeof raw !== "string") return null
  let s = raw.trim()
  if (!s) return null
  // Strip surrounding angle brackets / trailing punctuation often glued by PDFs
  s = s.replace(/^[<(]+|[>),.;:]+$/g, "")
  if (!/^https?:\/\//i.test(s)) s = `https://${s.replace(/^\/+/, "")}`
  try {
    const u = new URL(s)
    if (expectedHost && !expectedHost.test(u.hostname)) return null
    return u.toString().replace(/\/$/, "")
  } catch {
    return null
  }
}

/** Light phone normalization for FR numbers; passes other formats through. */
function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const cleaned = raw.replace(/[^\d+]/g, "")
  if (!cleaned) return null
  // 0612345678 → +33 6 12 34 56 78  (most common FR case)
  if (/^0\d{9}$/.test(cleaned)) {
    return `+33 ${cleaned[1]} ${cleaned.slice(2, 4)} ${cleaned.slice(4, 6)} ${cleaned.slice(6, 8)} ${cleaned.slice(8, 10)}`
  }
  // 0033612345678 / +33612345678 — re-format the trailing 9 digits
  const fr = cleaned.match(/^(?:\+33|0033)(\d{9})$/)
  if (fr) {
    const d = fr[1]
    return `+33 ${d[0]} ${d.slice(1, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`
  }
  // International: keep + and digits, no fancy grouping.
  return cleaned.startsWith("+") ? cleaned : raw.trim()
}

/* ─── Date-based seniority computation ─── */

type ExpInterval = { start: Date; end: Date; counts_toward_role: boolean }

function parseYearMonth(s: string | null | undefined): Date | null {
  if (!s) return null
  const m = String(s).match(/^(\d{4})(?:-(\d{1,2}))?/)
  if (!m) return null
  const y = parseInt(m[1], 10)
  if (y < 1950 || y > 2100) return null
  const mo = m[2] ? Math.max(1, Math.min(12, parseInt(m[2], 10))) - 1 : 0
  return new Date(Date.UTC(y, mo, 1))
}

/** Sum of months across a list of intervals, counting overlaps only once. */
function unionMonths(intervals: { start: Date; end: Date }[]): number {
  const sorted = intervals
    .filter((i) => i.end.getTime() > i.start.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime())
  if (!sorted.length) return 0
  let total = 0
  let curStart = sorted[0].start
  let curEnd = sorted[0].end
  for (let i = 1; i < sorted.length; i++) {
    const { start, end } = sorted[i]
    if (start.getTime() <= curEnd.getTime()) {
      if (end.getTime() > curEnd.getTime()) curEnd = end
    } else {
      total += diffMonths(curStart, curEnd)
      curStart = start
      curEnd = end
    }
  }
  total += diffMonths(curStart, curEnd)
  return total
}

function diffMonths(start: Date, end: Date): number {
  return Math.max(0,
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth()))
}

/** "10 mois → 1 an" : round to the nearest whole year, never display 0 if XP exists. */
function monthsToYears(months: number): number {
  if (months <= 0) return 0
  if (months < 3) return 0       // negligible (very short gigs)
  return Math.max(1, Math.round(months / 12))
}

const SENIORITY_BUCKETS: Array<[number, NonNullable<ParsedCv["seniority_level"]>]> = [
  [36,  "junior"],     // < 3 ans
  [72,  "mid"],        // 3-6 ans
  [120, "senior"],     // 6-10 ans
  [168, "lead"],       // 10-14 ans
  [Infinity, "principal"], // 14+
]

function seniorityFromMonths(months: number): NonNullable<ParsedCv["seniority_level"]> {
  for (const [cap, label] of SENIORITY_BUCKETS) {
    if (months < cap) return label
  }
  return "principal"
}

/**
 * Alertes CALCULÉES depuis les données extraites, sans passer par le modèle.
 *
 * Le lot A avait rendu les alertes obligatoires dans le prompt pour les
 * réveiller (elles étaient mortes : zéro sur douze candidats). Le modèle s'est
 * mis à en produire, mais FAUSSES : sur le CV d'Elyas, dont les six postes
 * portent une description, il annonçait « aucune description sur plus de la
 * moitié des postes » et nommait un poste précis comme dépourvu de la sienne.
 * Une alerte fausse est pire qu'une alerte absente : elle apprend au sourceur
 * à ne plus les lire.
 *
 * D'où le partage : ce qui se COMPTE se calcule ici, exactement, à partir du
 * JSON qu'on vient de normaliser ; le modèle ne garde que ce qui relève du
 * jugement (trou inexpliqué, intitulé vague, en-tête périmé).
 *
 * Sur les postes en cours, on SIGNALE SANS CORRIGER. Une première version
 * refermait les postes en trop à la date de début du suivant, en supposant un
 * parcours séquentiel. Le vivier a fourni le contre-exemple : un candidat
 * cumule "Lead mechanical engineer / FREELANCE CONTRACTS" et "Manager /
 * CHAMP-ECORCE" depuis la même date, soit un indépendant exerçant via sa
 * propre société. Les deux postes sont réellement en cours.
 */
/**
 * Retire les expériences RIGOUREUSEMENT redondantes.
 *
 * Depuis que le texte est lu dans le bon ordre, le modèle voit l'intégralité
 * du document — y compris, sur les CV longs, une synthèse de carrière EN PLUS
 * de la section détaillée. Il restitue alors deux fois le même poste sous deux
 * intitulés voisins : chez Sebastian MOLINA, « DOW CHEMICAL / Directeur de
 * chantier » et « DOW CHEMICAL / Directeur de chantier TCE » partageaient les
 * mêmes dates au mois près.
 *
 * La clé est volontairement STRICTE — société + début + fin. Deux postes
 * successifs chez le même employeur ont des dates différentes et sont donc
 * conservés : on ne déduplique que ce qui est indiscernable. À égalité, on
 * garde l'entrée la plus décrite.
 */
function dedupeExperiences(experiences: ParsedExperience[]): ParsedExperience[] {
  const seen = new Map<string, number>()
  const out: ParsedExperience[] = []
  for (const e of experiences) {
    const company = (e.company || "").trim().toLowerCase()
    // Sans société ni dates, aucune comparaison n'est fiable : on garde.
    if (!company || (!e.start && e.end === undefined)) { out.push(e); continue }
    const key = `${company}|${e.start ?? ""}|${e.end === null ? "encours" : e.end ?? ""}`
    const at = seen.get(key)
    if (at === undefined) {
      seen.set(key, out.length)
      out.push(e)
      continue
    }
    const kept = out[at]
    if ((e.description || "").length > (kept.description || "").length) out[at] = e
  }
  return out
}

/** Rang absolu en mois d'une date "YYYY" ou "YYYY-MM", ou null si illisible.
 *  Tolère un mois non complété ("2019-9") et un mois hors bornes. */
function monthRank(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null
  const m = /^(\d{4})(?:-(\d{1,2}))?/.exec(value.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = m[2] === undefined ? 1 : Number(m[2])
  if (!isFinite(year) || !isFinite(month) || month < 1 || month > 12) return null
  return year * 12 + (month - 1)
}

function structuralWarnings(experiences: ParsedExperience[]): string[] {
  if (experiences.length === 0) return []
  const out: string[] = []
  const label = (e: ParsedExperience) =>
    (e.company || "").trim() || (e.title || "").trim() || "un poste"

  const noStart = experiences.filter((e) => !e.start)
  if (noStart.length === 1) out.push(`Poste chez ${label(noStart[0])} sans date de début.`)
  else if (noStart.length > 1) out.push(`${noStart.length} postes sans date de début.`)

  // Comparaison sur un RANG de mois, jamais sur les chaînes : le modèle écrit
  // parfois "2019-9" au lieu de "2019-09", et l'ordre alphabétique place alors
  // décembre AVANT septembre. On aurait annoncé des dates incohérentes sur un
  // parcours parfaitement cohérent — exactement le genre de fausse alerte
  // qu'on vient de retirer au modèle.
  const inverted = experiences.find((e) => {
    const s = monthRank(e.start)
    const f = monthRank(typeof e.end === "string" ? e.end : null)
    return s !== null && f !== null && f < s
  })
  if (inverted) out.push(`Dates incohérentes chez ${label(inverted)} : fin avant le début.`)

  const undescribed = experiences.filter((e) => (e.description || "").trim().length === 0)
  if (undescribed.length === experiences.length) {
    out.push("Aucune description de poste dans ce CV.")
  } else if (undescribed.length === 1) {
    out.push(`Poste chez ${label(undescribed[0])} sans description.`)
  } else if (undescribed.length > 1) {
    out.push(`${undescribed.length} postes sans description.`)
  }

  // Seuil à 4 : trois postes en cours est le quotidien d'un fondateur ou d'un
  // indépendant (sa société, ses missions, un emploi à côté). Alerter dessous,
  // c'était crier sur des parcours parfaitement normaux.
  const ongoing = experiences.filter((e) => e.end === null).length
  if (ongoing > 3) {
    out.push(`${ongoing} postes en cours en parallèle : cumul réel ou date de fin oubliée ?`)
  }
  return out
}

/**
 * Derive years_experience + seniority_level from experience dates when
 * possible. Falls back to the LLM's estimates when dates are too sparse.
 *
 * Counting rules per the product spec:
 *   - "stage" experiences are excluded (pre-graduation, training, not
 *     real work)
 *   - if the candidate is currently an alternant (is_apprentice=true),
 *     the CURRENT experience is excluded (alternance is training)
 *   - what remains is summed as a union (no double-counting overlaps)
 *
 * Example : someone graduated 10 y ago but only worked 2 y of real CDI
 * after 8 y of various things → returns 2 y, not 10.
 */
function deriveSeniority(
  experiences: ParsedExperience[],
  llmYears: number | null,
  llmLevel: string | null,
  isApprentice: boolean,
): { years_experience: number | null; seniority_level: string | null } {
  // Etudiant / stagiaire are LLM-only (status, not duration).
  if (llmLevel === "etudiant" || llmLevel === "stagiaire") {
    return { years_experience: llmYears, seniority_level: llmLevel }
  }

  const now = new Date()
  const intervals: ExpInterval[] = []
  for (const e of experiences) {
    // Skip stages — pre-graduation training, not real work.
    if (e.seniority === "stage") continue
    // Skip the current (ongoing) experience if the candidate is in
    // alternance — that experience is also training, not real work.
    const isOngoing = e.end === null
    if (isApprentice && isOngoing) continue

    const start = parseYearMonth(e.start)
    if (!start) continue
    const end = e.end === null ? now : parseYearMonth(e.end ?? null) ?? now
    intervals.push({ start, end, counts_toward_role: e.counts_toward_role !== false })
  }

  if (intervals.length === 0) {
    // Nothing countable post-graduation → junior, possibly 0 years.
    return { years_experience: 0, seniority_level: "junior" }
  }

  const totalMonths = unionMonths(intervals)
  const roleMonths = unionMonths(intervals.filter((i) => i.counts_toward_role))

  // If LLM didn't flag any role-relevant exp, fall back to total.
  const effectiveMonths = roleMonths > 0 ? roleMonths : totalMonths

  return {
    years_experience: monthsToYears(totalMonths),
    seniority_level: seniorityFromMonths(effectiveMonths),
  }
}

/** 0-100 rough completeness score based on filled fields. */
function computeCompleteness(cv: ParsedCv): number {
  let score = 0
  const presence = (v: unknown) => (typeof v === "string" && v.trim().length > 0) || (Array.isArray(v) && v.length > 0)
  if (presence(cv.full_name)) score += 10
  if (presence(cv.email)) score += 8
  if (presence(cv.phone)) score += 5
  if (presence(cv.location)) score += 5
  if (presence(cv.linkedin_url)) score += 5
  if (presence(cv.current_title)) score += 8
  if (presence(cv.summary)) score += 7
  if (presence(cv.skills)) score += 10
  if (presence(cv.languages)) score += 5
  if (presence(cv.certifications)) score += 3
  // Experience: weight by count + presence of dates/descriptions
  const exps = Array.isArray(cv.experience) ? cv.experience : []
  if (exps.length > 0) {
    score += Math.min(15, exps.length * 5)
    const datedShare = exps.filter((e) => e.start).length / exps.length
    const descShare = exps.filter((e) => e.description && e.description.trim().length > 30).length / exps.length
    score += Math.round(datedShare * 10)
    score += Math.round(descShare * 9)
  }
  return Math.max(0, Math.min(100, score))
}

const ALLOWED_LANGUAGES = new Set(["fr", "en", "es", "de", "it", "pt", "nl"])
const ALLOWED_EXP_SENIORITY = new Set(["stage", "junior", "mid", "senior", "lead", "principal"])
const ALLOWED_SECTORS = new Set([
  "tech", "finance", "retail", "sante", "industrie", "conseil",
  "marketing", "rh", "public", "education", "autre",
])

/** Fallback when the LLM doesn't emit `sector` — derive from raw industries
 *  keywords. Loose-match on common words; returns null if no signal. */
function deriveSectorFromIndustries(industries: string[] | undefined): ParsedCv["sector"] {
  if (!industries || industries.length === 0) return null
  const hay = industries.join(" ").toLowerCase()
  const matchers: Array<[RegExp, NonNullable<ParsedCv["sector"]>]> = [
    [/\b(banque|assurance|finance|asset|audit financier|fintech)\b/, "finance"],
    [/\b(saas|logiciel|software|web|mobile|data|cyber|ia|ai|cloud|devops|edition logiciel|esn)\b/, "tech"],
    [/\b(retail|e[- ]?commerce|distribution|grande conso|luxe|mode|grande distribution)\b/, "retail"],
    [/\b(sant[eé]|hopital|biotech|pharma|medtech)\b/, "sante"],
    [/\b(industrie|automobile|aero|aeronautique|energie|btp|transport)\b/, "industrie"],
    [/\b(conseil|strat[eé]gie|cabinet|avocat|audit)\b/, "conseil"],
    [/\b(marketing|com(munication)?|publicit[eé]|m[eé]dia|[eé]v[eé]nement|creation|cr[eé]a)\b/, "marketing"],
    [/\b(recrutement|formation|ressources humaines|rh)\b/, "rh"],
    [/\b(administration|collectivit[eé]|ong|public|fonction publique)\b/, "public"],
    [/\b(enseignement|universit[eé]|recherche|education)\b/, "education"],
  ]
  for (const [re, sector] of matchers) if (re.test(hay)) return sector
  return "autre"
}

/** Chaînes que le modèle écrit parfois AU LIEU d'un null JSON. Sans ce filtre,
 *  un début de mission valait littéralement "null" : la date paraissait
 *  renseignée, et le contrôle de cohérence annonçait une fin antérieure au
 *  début (« null » se compare après « 2004 »). Vu chez Sebastian MOLINA.
 *
 *  Volontairement limité aux formes SANS ambiguïté : ce filtre s'applique à
 *  tous les champs texte, localisation comprise, où « NA » (North America) et
 *  « NC » (Nouvelle-Calédonie) sont des valeurs légitimes. */
const NULL_LIKE = new Set(["null", "none", "n/a", "undefined", "-", "--"])

function normalizeParsedCv(p: LlmCvPayload): ParsedCv {
  const trimOrNull = (v: unknown) => {
    if (typeof v !== "string") return null
    const t = v.trim()
    if (!t.length) return null
    return NULL_LIKE.has(t.toLowerCase()) ? null : t
  }
  const safeArr = (v: unknown, cap = 50): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, cap) : []
  const lang = trimOrNull(p.language)?.toLowerCase() ?? null
  const rawSector = trimOrNull(p.sector)?.toLowerCase() ?? null
  const sector: ParsedCv["sector"] = rawSector && ALLOWED_SECTORS.has(rawSector)
    ? rawSector as NonNullable<ParsedCv["sector"]>
    : null

  const cv: ParsedCv = {
    full_name: trimOrNull(p.full_name),
    email: trimOrNull(p.email)?.toLowerCase() ?? null,
    phone: normalizePhone(p.phone),
    location: trimOrNull(p.location),
    linkedin_url:  normalizeUrl(p.linkedin_url,  /linkedin\.com$/i),
    github_url:    normalizeUrl(p.github_url,    /github\.com$/i),
    portfolio_url: normalizeUrl(p.portfolio_url),
    malt_url:      normalizeUrl(p.malt_url,      /malt\.(fr|com)$/i),
    current_title: trimOrNull(p.current_title),
    current_company: trimOrNull(p.current_company),
    years_experience: typeof p.years_experience === "number" && isFinite(p.years_experience)
      ? Math.max(0, Math.min(60, Math.round(p.years_experience * 10) / 10))
      : null,
    seniority_level: trimOrNull(p.seniority_level),
    seniority_role:  trimOrNull(p.seniority_role),
    is_apprentice:   p.is_apprentice === true,
    language: lang && ALLOWED_LANGUAGES.has(lang) ? lang : null,
    sector,
    summary: trimOrNull(p.summary),
    skills: safeArr(p.skills, 40),
    qualities: safeArr(p.qualities, 15),
    languages: safeArr(p.languages, 10),
    experience: Array.isArray(p.experience) ? p.experience.slice(0, 30).map((e) => {
      const sen = trimOrNull(e?.seniority)?.toLowerCase() ?? null
      return {
        title: trimOrNull(e?.title) ?? "",
        company: trimOrNull(e?.company) ?? "",
        start: trimOrNull(e?.start) ?? undefined,
        end: e?.end === null ? null : (trimOrNull(e?.end) ?? undefined),
        location: trimOrNull(e?.location) ?? undefined,
        description: trimOrNull(e?.description) ?? undefined,
        seniority: sen && ALLOWED_EXP_SENIORITY.has(sen) ? sen as ParsedExperience["seniority"] : null,
        counts_toward_role: e?.counts_toward_role !== false,
      }
    }).filter((e) => e.title || e.company) : [],
    education: Array.isArray(p.education) ? p.education.slice(0, 15).map((e) => ({
      degree: trimOrNull(e?.degree) ?? "",
      school: trimOrNull(e?.school) ?? "",
      field: trimOrNull(e?.field) ?? undefined,
      start: trimOrNull(e?.start) ?? undefined,
      end: trimOrNull(e?.end) ?? undefined,
    })).filter((e) => e.degree || e.school) : [],
    certifications: safeArr(p.certifications, 20),
    warnings: safeArr(p.warnings, 3).map((w) => w.slice(0, 120)),
    source_quality: "native",
  }

  // Dédoublonnage AVANT les alertes : elles comptent les postes, et compter
  // deux fois le même fausserait leur diagnostic autant que la fiche.
  cv.experience = dedupeExperiences(cv.experience ?? [])

  // Les alertes VÉRIFIABLES sont recalculées ici et passent devant : elles
  // portent sur le JSON réellement stocké, là où celles du modèle ne sont
  // qu'une impression de lecture.
  cv.warnings = [
    ...structuralWarnings(cv.experience ?? []),
    ...(cv.warnings ?? []),
  ].slice(0, 5)

  // Recompute years_experience + seniority_level from real dates when we have
  // enough — far more reproducible than the LLM's rounding (10 mois = 1 an).
  // Counts ONLY post-graduation work: stages and current alternance are skipped.
  const derived = deriveSeniority(
    cv.experience ?? [],
    cv.years_experience ?? null,
    cv.seniority_level ?? null,
    cv.is_apprentice === true,
  )
  cv.years_experience = derived.years_experience
  cv.seniority_level = derived.seniority_level

  // Fallback for older CVs / when the LLM omits sector — derive from the
  // taxonomy industries the same pass produced.
  if (!cv.sector) {
    const industries = Array.isArray(p.taxonomy?.industries)
      ? (p.taxonomy!.industries as unknown[]).map((x) => String(x))
      : []
    cv.sector = deriveSectorFromIndustries(industries)
  }

  cv.completeness = computeCompleteness(cv)
  return cv
}
