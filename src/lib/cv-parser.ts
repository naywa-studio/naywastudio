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
 */
const LONG_CV_CHARS = 8_000

export class CvParseError extends Error {
  code: "scanned_pdf" | "empty_pdf" | "invalid_pdf" | "llm_failed" | "llm_invalid_json"
  constructor(code: CvParseError["code"], message: string) {
    super(message)
    this.code = code
  }
}

export async function extractPdfText(buf: Buffer): Promise<string> {
  // unpdf ships a serverless-friendly pdfjs build — no DOMMatrix / Path2D
  // browser globals required, unlike pdf-parse v2. Works on Vercel Node.
  const { extractText, getDocumentProxy } = await import("unpdf")
  let text = ""
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buf))
    const out = await extractText(pdf, { mergePages: true })
    text = Array.isArray(out.text) ? out.text.join("\n") : (out.text ?? "")
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
  - "tech" : édition logiciel, SaaS, data, IA, web, mobile, cybersécurité, ESN à dominante dev
  - "finance" : banque, assurance, asset management, fintech B2B, audit financier
  - "retail" : e-commerce, distribution, grande conso, mode, luxe
  - "sante" : hôpital, biotech, pharma, medtech, e-santé
  - "industrie" : industriel, automobile, aéronautique, énergie, BTP, transport
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
- Les outils métier spécialisés (simulation, calcul, CAO, ERP, instrumentation…) sont ce qui rend un profil recrutable : ils priment sur la bureautique générique. Ne garde jamais "Word/Excel" en écartant un outil spécialisé faute de place.

SKILLS vs QUALITIES (deux listes séparées, un item dans UNE SEULE) :
- "skills" = compétences vérifiables : technique, méthodologie, outil, framework, langue. Quelque chose qu'on peut tester ou citer dans une fiche de poste. Ex : "SQL", "Agile", "Python", "Salesforce", "négociation B2B", "anglais courant". Max 40.
- "qualities" = traits humains / soft skills observables au quotidien. Ex : "rigueur", "leadership", "adaptabilité", "esprit d'équipe", "autonomie". Max 15.
- Si tu hésites, mets dans "skills". Les langues parlées vont dans "languages", pas dans "skills".

SÉNIORITÉ :
- DATES : capture-les le plus précisément possible (YYYY-MM si dispo, sinon YYYY). "end" = null si c'est le poste actuel. NE LES INVENTE PAS — si une date manque, mets null. Le calcul d'années est fait par notre code à partir de ces dates : ta précision sur les dates est ce qui compte le plus.
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
- 0 à 4 alertes courtes (< 80 caractères chacune) en français, sur ce qui pose question dans le CV.
- Tu DOIS émettre une alerte dans CHACUN de ces cas, ce n'est pas optionnel :
  - gap inexpliqué > 6 mois entre deux postes
  - date manquante ou contradictoire (poste sans année de début, fin antérieure au début…)
  - plusieurs postes sans date de fin, donc présentés comme simultanément en cours
  - intitulé de poste très vague (ex: "consultant" sans précision)
  - aucune description sur plus de la moitié des postes
  - CV visiblement daté (l'en-tête annonce un nombre d'années incohérent avec les dates listées)
- Ces alertes servent au sourceur à savoir OÙ vérifier : un CV imparfait qui s'annonce vaut mieux qu'un CV faussement propre. Ne les omets pas par politesse.
- Ne mets PAS d'alerte si tout est réellement cohérent — tableau vide.

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
- "description" : reprends les missions réellement décrites, en CONSERVANT les termes techniques du CV (outils, normes, spécialités, types d'installations). 400 caractères max par poste. N'invente rien.
- "end" : null UNIQUEMENT pour le poste réellement en cours aujourd'hui. UN SEUL poste peut avoir end à null. Tous les autres DOIVENT porter une date de fin.
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
      maxTokens: 3200,
      timeoutMs: 25_000,
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
  // en deçà de son watchdog (75 s) même sur un CV de 24 000 caractères.
  const [result, secondPassExperiences] = await Promise.all([
    openrouterChat({
      model: "openai/gpt-4o-mini",
      temperature: 0.1,
      responseFormat: "json_object",
      maxTokens: 2600,
      // 25 s ceiling on the primary text LLM call. Default openrouter timeout
      // is 45 s, but on Vercel Hobby (60 s maxDuration) we need to leave room
      // for the OCR fallback in case the text extraction was bad. Most healthy
      // gpt-4o-mini calls finish in 3-12 s, so 25 s is a generous budget that
      // still gives ~30 s to OCR if needed.
      timeoutMs: 25_000,
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
    maxTokens: 2600,
    // 30 s ceiling on OCR. Was 90 s, but on Vercel Hobby (60 s maxDuration)
    // 90 s is impossible — the function would be killed before OCR could
    // return. With primary LLM capped at 25 s + OCR at 30 s = 55 s worst case,
    // leaving 5 s to write the error/success status to DB.
    timeoutMs: 30_000,
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
 * Contrôle DÉTERMINISTE : signale plusieurs postes simultanément "en cours".
 *
 * Constaté sur le vivier GMH (août 2026) : le prompt réclamait déjà une alerte
 * sur ce cas précis, et aucune n'a jamais été émise sur les 12 candidats. D'où
 * ce contrôle en dur, qui ne dépend d'aucun modèle.
 *
 * IL SIGNALE, IL NE CORRIGE PAS — et c'est délibéré. Une première version
 * refermait les postes en trop à la date de début du suivant, en supposant un
 * parcours séquentiel. Le vivier a immédiatement fourni le contre-exemple : un
 * candidat cumule "Lead mechanical engineer / FREELANCE CONTRACTS" et
 * "Manager / CHAMP-ECORCE" depuis la même date, soit un indépendant exerçant
 * via sa propre société. Les deux postes sont réellement en cours, et les
 * refermer aurait détruit une information juste.
 *
 * Aucune règle fondée sur les seules dates ne sépare une erreur du modèle d'un
 * cumul légitime (freelance, gérance, portage, mandat social). On alerte donc
 * le sourceur, qui tranchera depuis la fiche candidat.
 */
function flagMultipleCurrentRoles(experiences: ParsedExperience[]): string | null {
  const ongoing = experiences.filter((e) => e.end === null).length
  if (ongoing <= 1) return null
  return `${ongoing} postes sont marqués en cours, à vérifier.`
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

function normalizeParsedCv(p: LlmCvPayload): ParsedCv {
  const trimOrNull = (v: unknown) => {
    if (typeof v !== "string") return null
    const t = v.trim()
    return t.length ? t : null
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
    warnings: safeArr(p.warnings, 4).map((w) => w.slice(0, 120)),
    source_quality: "native",
  }

  // Contrôle dates : plusieurs postes "en cours" est soit une erreur du
  // modèle, soit un cumul réel. On ne tranche pas à sa place, on le signale.
  const multiCurrent = flagMultipleCurrentRoles(cv.experience ?? [])
  if (multiCurrent) {
    cv.warnings = [...(cv.warnings ?? []), multiCurrent].slice(0, 5)
  }

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
