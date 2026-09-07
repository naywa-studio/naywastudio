/**
 * Catalogue des champs optionnels du formulaire public de candidature
 * (/apply/[token]). Fermé et défini en code (pas en base) — l'ajout d'un
 * futur champ (ex. portfolio) est un changement de code assumé, pas une
 * donnée que le client pourrait inventer librement.
 *
 * Les 4 champs de base (prénom, nom, email, CV) ne sont PAS dans ce
 * catalogue : ils sont toujours présents et toujours obligatoires, non
 * désactivables — cf. `MissionApplyForm.tsx` et `ApplyForm.tsx`.
 *
 * `storage` documente où atterrit la valeur — ne change rien au runtime,
 * sert de repère pour qui relit ce fichier :
 *   - "column"  → écrit dans une vraie colonne `candidates` (déjà exploitée
 *     ailleurs dans le produit : fiche candidat, recherche, dédup...)
 *   - "notes"   → pas de colonne dédiée, formaté dans `candidates.notes`
 *     (visible sur la fiche candidat, section Notes) — évite d'ajouter une
 *     colonne pour un champ que rien d'autre ne consomme aujourd'hui.
 */

export type ApplyFormFieldKey =
  | "phone"
  | "location"
  | "linkedin_url"
  | "salary_expectation"
  | "years_experience"
  | "message"

export interface ApplyFormFieldDef {
  key: ApplyFormFieldKey
  storage: "column" | "notes"
  inputType: "tel" | "text" | "url" | "number" | "textarea"
  label: { fr: string; en: string }
  /** Libellé affiché dans le formulaire candidat (peut différer du libellé
   *  de la case à cocher recruteur, ex. précision d'unité). */
  formLabel: { fr: string; en: string }
  placeholder?: { fr: string; en: string }
}

export const APPLY_FORM_FIELD_CATALOG: ApplyFormFieldDef[] = [
  {
    key: "phone",
    storage: "column",
    inputType: "tel",
    label: { fr: "Téléphone", en: "Phone" },
    formLabel: { fr: "Téléphone", en: "Phone" },
    placeholder: { fr: "06 12 34 56 78", en: "+1 555 123 4567" },
  },
  {
    key: "location",
    storage: "column",
    inputType: "text",
    label: { fr: "Ville", en: "City" },
    formLabel: { fr: "Ville", en: "City" },
    placeholder: { fr: "Paris", en: "New York" },
  },
  {
    key: "linkedin_url",
    storage: "column",
    inputType: "url",
    label: { fr: "LinkedIn", en: "LinkedIn" },
    formLabel: { fr: "LinkedIn", en: "LinkedIn" },
    placeholder: { fr: "linkedin.com/in/…", en: "linkedin.com/in/…" },
  },
  {
    key: "salary_expectation",
    storage: "notes",
    inputType: "text",
    label: { fr: "Prétention salariale", en: "Salary expectation" },
    formLabel: { fr: "Prétention salariale", en: "Salary expectation" },
    placeholder: { fr: "45 000 € brut annuel", en: "€45,000 gross/year" },
  },
  {
    key: "years_experience",
    storage: "notes",
    inputType: "number",
    label: { fr: "Années d'expérience", en: "Years of experience" },
    formLabel: { fr: "Années d'expérience", en: "Years of experience" },
    placeholder: { fr: "5", en: "5" },
  },
  {
    key: "message",
    storage: "notes",
    inputType: "textarea",
    label: { fr: "Message", en: "Message" },
    formLabel: { fr: "Message", en: "Message" },
    placeholder: { fr: "Un mot sur votre motivation…", en: "A note on your motivation…" },
  },
]

export const APPLY_FORM_FIELD_KEYS: ApplyFormFieldKey[] = APPLY_FORM_FIELD_CATALOG.map((f) => f.key)

export function isApplyFormFieldKey(v: string): v is ApplyFormFieldKey {
  return (APPLY_FORM_FIELD_KEYS as string[]).includes(v)
}

/** Nettoie une liste arbitraire (venant d'un PATCH client) en ne gardant que
 *  les clés du catalogue, dédupliquées — jamais faire confiance à un
 *  tableau de strings reçu tel quel. */
export function sanitizeApplyFormFields(input: unknown): ApplyFormFieldKey[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<ApplyFormFieldKey>()
  for (const v of input) {
    if (typeof v === "string" && isApplyFormFieldKey(v)) seen.add(v)
  }
  return Array.from(seen)
}

export function applyFormFieldDef(key: ApplyFormFieldKey): ApplyFormFieldDef {
  const def = APPLY_FORM_FIELD_CATALOG.find((f) => f.key === key)
  if (!def) throw new Error(`unknown apply form field: ${key}`)
  return def
}

export const CUSTOM_QUESTION_MAX_COUNT = 5
export const CUSTOM_QUESTION_MAX_LENGTH = 300

/** Nettoie une liste de questions libres (venant d'un PATCH client) : trim,
 *  retire les vides, plafonne la longueur ET le nombre — un recruteur ne
 *  doit pas pouvoir transformer le formulaire en questionnaire de 40
 *  questions, et un texte non plafonné pourrait gonfler indéfiniment
 *  candidates.notes à chaque candidature. */
export function sanitizeApplyCustomQuestions(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const v of input) {
    if (typeof v !== "string") continue
    const trimmed = v.trim().slice(0, CUSTOM_QUESTION_MAX_LENGTH)
    if (trimmed) out.push(trimmed)
    if (out.length >= CUSTOM_QUESTION_MAX_COUNT) break
  }
  return out
}
