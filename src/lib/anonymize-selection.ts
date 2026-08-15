/**
 * Sélection des briques qui partent dans le CV anonymisé, PAR MISSION.
 *
 * ── Pourquoi ce fichier existe ────────────────────────────────────────────
 *
 * Deux gestes d'édition coexistent dans le produit et ne doivent JAMAIS être
 * confondus :
 *
 *  1. Éditer la fiche candidat corrige la SOURCE DE VÉRITÉ. Une date fausse
 *     est fausse partout : elle fausse le matching et tous les CV anonymisés
 *     de toutes les missions. On la répare une fois, dans `parsed_cv`.
 *
 *  2. Choisir ce qui apparaît dans le CV remis à UN client est un arbitrage
 *     de PRÉSENTATION, propre à une mission. Le poste chez le concurrent du
 *     client, le job étudiant sans rapport, la rubrique loisirs : on ne les
 *     efface pas du vivier, on décide juste de ne pas les montrer ICI.
 *
 * Ce fichier ne sert QUE au second geste. Il ne touche jamais `parsed_cv`.
 *
 * ── Une LISTE D'EXCLUSION, jamais une liste d'inclusion ───────────────────
 *
 * Absent de la liste = la brique part. C'est délibéré et c'est le cœur de la
 * sûreté du dispositif : après un re-parsing qui révèle deux expériences
 * jusque-là perdues, elles apparaissent d'office dans le document client. Une
 * liste d'inclusion les aurait fait disparaître en silence — exactement le
 * défaut que tout ce chantier cherche à supprimer.
 *
 * ── Des clés de CONTENU, jamais des index ────────────────────────────────
 *
 * Un index (« la 3ᵉ expérience ») ne survit pas à un re-parsing : il désigne
 * un autre poste dès que l'ordre bouge, et masquerait donc au client un poste
 * que personne n'a choisi de masquer. La clé est dérivée du contenu ; quand
 * la brique disparaît, sa clé devient orpheline et est simplement ignorée.
 *
 * Deux limites assumées, à connaître avant de toucher ce fichier :
 *
 *  - Deux briques rigoureusement identiques partagent une clé et s'excluent
 *    donc ensemble. Ce sont les doublons, que `dedupeExperiences` retire déjà
 *    au parsing.
 *
 *  - CORRIGER une brique masquée la fait RÉAPPARAÎTRE. Renommer l'employeur
 *    ou rectifier la date de début depuis la fiche candidat change la clé, et
 *    l'exclusion devient orpheline. C'est le prix des clés de contenu ; le
 *    remède serait un identifiant stable posé sur chaque brique au parsing,
 *    ce que le schéma actuel n'a pas. En attendant, le panneau de la fiche
 *    match affiche en permanence le nombre de briques masquées : l'écart se
 *    voit avant de regénérer le document.
 */

import type {
  ParsedCv, ParsedExperience, ParsedEducation, ParsedSection, AnonymizeSelection,
} from "./database.types"

export type { AnonymizeSelection }

export const EMPTY_SELECTION: AnonymizeSelection = {
  experiences: [],
  education: [],
  sections: [],
}

/** Plafond par type — une liste d'exclusion ne devrait jamais dépasser le
 *  nombre de briques d'un CV. Borne la taille de la colonne jsonb. */
const MAX_KEYS = 60
const MAX_KEY_LENGTH = 300

const norm = (s: string | null | undefined): string =>
  (s ?? "").toLowerCase().replace(/\s+/g, " ").trim()

/** `end: null` = poste en cours, `end: undefined` = fin inconnue. Deux états
 *  distincts qui ne doivent pas se confondre dans la clé, sinon deux postes
 *  différents chez le même employeur n'en feraient plus qu'un. */
export function experienceKey(e: ParsedExperience): string {
  const end = e.end === null ? "*" : norm(e.end)
  return `${norm(e.company)}|${norm(e.title)}|${norm(e.start)}|${end}`.slice(0, MAX_KEY_LENGTH)
}

export function educationKey(ed: ParsedEducation): string {
  return `${norm(ed.degree)}|${norm(ed.school)}|${norm(ed.end)}`.slice(0, MAX_KEY_LENGTH)
}

export function sectionKey(s: ParsedSection): string {
  return norm(s.title).slice(0, MAX_KEY_LENGTH)
}

const keyList = (v: unknown): string[] =>
  Array.isArray(v)
    ? Array.from(new Set(
        v.filter((x): x is string => typeof x === "string")
          .map((x) => x.slice(0, MAX_KEY_LENGTH)),
      )).slice(0, MAX_KEYS)
    : []

/** Lit la colonne jsonb brute. Tolère NULL, champs manquants, types faux —
 *  une sélection illisible vaut « rien d'exclu », jamais une erreur : le
 *  sourceur doit toujours pouvoir générer son document. */
export function readSelection(raw: unknown): AnonymizeSelection {
  const o = (raw ?? {}) as Record<string, unknown>
  return {
    experiences: keyList(o.experiences),
    education: keyList(o.education),
    sections: keyList(o.sections),
  }
}

export function isEmptySelection(sel: AnonymizeSelection): boolean {
  return sel.experiences.length === 0 && sel.education.length === 0 && sel.sections.length === 0
}

/**
 * Retire du CV les briques exclues pour cette mission.
 *
 * Renvoie une COPIE : l'objet d'origine reste intact, ce qui garantit que
 * l'appelant ne peut pas réécrire par mégarde un `parsed_cv` amputé en base.
 */
export function applySelection(cv: ParsedCv, sel: AnonymizeSelection): ParsedCv {
  if (isEmptySelection(sel)) return cv

  const excludedExp = new Set(sel.experiences)
  const excludedEdu = new Set(sel.education)
  const excludedSec = new Set(sel.sections)

  return {
    ...cv,
    experience: (cv.experience ?? []).filter((e) => !excludedExp.has(experienceKey(e))),
    education: (cv.education ?? []).filter((ed) => !excludedEdu.has(educationKey(ed))),
    other_sections: (cv.other_sections ?? []).filter((s) => !excludedSec.has(sectionKey(s))),
  }
}

/** Compte les briques réellement masquées — celles dont la clé existe encore
 *  dans le CV. Les clés orphelines (brique disparue depuis) ne comptent pas,
 *  sinon l'UI annoncerait « 3 masquées » sur un CV qui n'en cache qu'une. */
export function countHidden(cv: ParsedCv, sel: AnonymizeSelection): number {
  const inExp = new Set((cv.experience ?? []).map(experienceKey))
  const inEdu = new Set((cv.education ?? []).map(educationKey))
  const inSec = new Set((cv.other_sections ?? []).map(sectionKey))
  return (
    sel.experiences.filter((k) => inExp.has(k)).length +
    sel.education.filter((k) => inEdu.has(k)).length +
    sel.sections.filter((k) => inSec.has(k)).length
  )
}
