"use client"

/**
 * Aperçu VIVANT du CV anonymisé — on agit sur le document, pas sur une liste.
 *
 * ── Ce que c'est ─────────────────────────────────────────────────────────
 *
 * Le sourceur voit la page telle qu'elle partira chez son client, et travaille
 * dessus : survoler un bloc fait apparaître ses actions. Plus de liste de
 * cases à cocher posée à côté d'un PDF qu'il faut regénérer pour savoir ce
 * qu'on a fait.
 *
 * ── Pourquoi il ne peut pas mentir ───────────────────────────────────────
 *
 * Le contenu vient de `buildAnonymizedModel`, la MÊME fonction qu'appelle le
 * rendu PDF serveur. Ce fichier ne décide rien : il habille. Une divergence de
 * police ou de marge est sans conséquence ; une divergence de contenu — un
 * poste masqué qui réapparaît chez le client — serait une faute, et l'
 * architecture la rend impossible.
 *
 * ── Deux gestes, deux portées, dites à l'écran ───────────────────────────
 *
 *  · `−` / `+`  masquent ou remettent un bloc POUR CETTE MISSION. Le vivier
 *    n'est pas touché, les autres missions non plus. C'est un arbitrage de
 *    présentation : le poste chez le concurrent du client, le job étudiant.
 *
 *  · le crayon corrige la DONNÉE, partout. Une date fausse est fausse pour le
 *    matching et pour toutes les missions ; la réparer ici la répare une fois.
 *
 * Les confondre serait la faute produit à éviter — d'où l'étiquette de portée
 * affichée sur chaque action, et non reléguée dans une doc que personne ne lit.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import type { Candidate, ParsedCv, CandidateTaxonomy } from "@/lib/database.types"
import {
  buildAnonymizedModel, endLabel,
  type AnonymizedJobContext, type AnonymizedBrand, type AnonymizedOptions,
} from "@/lib/anonymized-cv-model"
import {
  experienceKey, educationKey, sectionKey, sortByKeys,
  type AnonymizeSelection, type AnonymizeOrder,
} from "@/lib/anonymize-selection"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const copy = {
  fr: {
    docTitle: "Aperçu du document client",
    docHint: "Ce que verra votre client. Survolez un bloc pour l'ajuster.",
    scopeMission: "cette mission",
    scopeEverywhere: "partout",
    hide: "Masquer",
    restore: "Réafficher",
    edit: "Corriger",
    hideScope: "Masquer dans le document de cette mission uniquement",
    restoreScope: "Remettre dans le document de cette mission",
    editScope: "Corriger la donnée — la correction vaut pour le matching et pour toutes les missions",
    hiddenBanner: (n: number) => `${n} bloc${n > 1 ? "s" : ""} masqué${n > 1 ? "s" : ""} pour cette mission`,
    showAll: "Tout réafficher",
    resetOrder: "Rétablir l'ordre du CV",
    resetOrderHint: "Remet les blocs dans l'ordre où ils figurent au CV du candidat",
    showHidden: "Afficher les blocs masqués",
    hideHidden: "Masquer les blocs masqués",
    hiddenTag: "Masqué",
    dragHint: "Glisser pour déplacer ce bloc dans le document de cette mission",
    editTitleJob: "Renommer la mission",
    editTitleMeta: "Corriger les informations d'en-tête",
    editTitleSkills: "Corriger les compétences clés",
    editTitleLanguages: "Corriger les langues",
    scopeJob: "la mission",
    jobScopeHint: "Le nom de la mission change partout où elle apparaît, pas seulement sur ce document",
    fJobTitle: "Nom de la mission",
    fSeniority: "Séniorité",
    fYears: "Années d'expérience",
    fLocation: "Localisation du candidat",
    locationHint: "Le document n'imprime que la commune et le département, jamais l'adresse.",
    fSkills: "Compétences clés",
    fLanguages: "Langues",
    listHint: "Une par ligne.",
    presentedFor: "Présenté pour",
    summary: "Résumé",
    keySkills: "Compétences clés",
    experience: "Parcours",
    education: "Formation",
    languages: "Langues",
    seniorityLabel: "Séniorité",
    experienceLabel: "Expérience",
    zoneLabel: "Zone",
    yearsSuffix: (n: number) => `${n} an${n > 1 ? "s" : ""}`,
    ref: "Réf.",
    save: "Enregistrer",
    cancel: "Annuler",
    saving: "Enregistrement…",
    editTitleExp: "Corriger cette expérience",
    editTitleEdu: "Corriger cette formation",
    editTitleSec: "Corriger cette rubrique",
    editTitleSummary: "Corriger le résumé",
    fTitle: "Intitulé du poste",
    fCompany: "Entreprise",
    fStart: "Début",
    fEnd: "Fin",
    fOngoing: "Poste en cours",
    fDescription: "Description",
    fDegree: "Diplôme",
    fSchool: "École",
    fField: "Spécialité",
    fSecTitle: "Titre de la rubrique",
    fSecContent: "Contenu",
    fSummary: "Résumé",
    dateHint: "AAAA ou AAAA-MM",
    dateInvalid: "Date ignorée hors format AAAA ou AAAA-MM.",
    addExperience: "+ Ajouter une expérience",
    addEducation: "+ Ajouter une formation",
    addSection: "+ Ajouter une rubrique",
    addScope: "Ajoutée à la fiche candidat — elle apparaîtra partout",
    everythingHidden: "Tous les blocs de cette rubrique sont masqués pour cette mission.",
    noSummary: "Aucun résumé. Activez le résumé Nora ou écrivez un message dans les réglages.",
    summaryPending: "Le résumé Nora sera rédigé à la génération du document.",
    saveFailed: "Enregistrement impossible. Rien n'a été modifié.",
    readOnly: "Lecture seule.",
  },
  en: {
    docTitle: "Client document preview",
    docHint: "What your client will see. Hover a block to adjust it.",
    scopeMission: "this job opening",
    scopeEverywhere: "everywhere",
    hide: "Hide",
    restore: "Show again",
    edit: "Fix",
    hideScope: "Hide from this job opening's document only",
    restoreScope: "Put back into this job opening's document",
    editScope: "Fix the data — the correction applies to matching and to every job opening",
    hiddenBanner: (n: number) => `${n} block${n > 1 ? "s" : ""} hidden for this job opening`,
    showAll: "Show all again",
    resetOrder: "Restore the CV order",
    resetOrderHint: "Puts the blocks back in the order they appear in the candidate CV",
    showHidden: "Show hidden blocks",
    hideHidden: "Hide hidden blocks",
    hiddenTag: "Hidden",
    dragHint: "Drag to move this block within this job opening's document",
    editTitleJob: "Rename the job opening",
    editTitleMeta: "Fix the header information",
    editTitleSkills: "Fix the key skills",
    editTitleLanguages: "Fix the languages",
    scopeJob: "the job opening",
    jobScopeHint: "The job opening name changes everywhere it appears, not only on this document",
    fJobTitle: "Job opening name",
    fSeniority: "Seniority",
    fYears: "Years of experience",
    fLocation: "Candidate location",
    locationHint: "The document only prints town and county, never the address.",
    fSkills: "Key skills",
    fLanguages: "Languages",
    listHint: "One per line.",
    presentedFor: "Presented for",
    summary: "Summary",
    keySkills: "Key skills",
    experience: "Experience",
    education: "Education",
    languages: "Languages",
    seniorityLabel: "Seniority",
    experienceLabel: "Experience",
    zoneLabel: "Location",
    yearsSuffix: (n: number) => `${n} year${n > 1 ? "s" : ""}`,
    ref: "Ref.",
    save: "Save",
    cancel: "Cancel",
    saving: "Saving…",
    editTitleExp: "Fix this experience",
    editTitleEdu: "Fix this education entry",
    editTitleSec: "Fix this section",
    editTitleSummary: "Fix the summary",
    fTitle: "Job title",
    fCompany: "Company",
    fStart: "Start",
    fEnd: "End",
    fOngoing: "Current role",
    fDescription: "Description",
    fDegree: "Degree",
    fSchool: "School",
    fField: "Field",
    fSecTitle: "Section title",
    fSecContent: "Content",
    fSummary: "Summary",
    dateHint: "YYYY or YYYY-MM",
    dateInvalid: "Date dropped unless written as YYYY or YYYY-MM.",
    addExperience: "+ Add an experience",
    addEducation: "+ Add an education entry",
    addSection: "+ Add a section",
    addScope: "Added to the candidate profile — it will appear everywhere",
    everythingHidden: "Every block in this section is hidden for this job opening.",
    noSummary: "No summary. Turn on the Nora summary or write a message in the settings.",
    summaryPending: "The Nora summary will be written when the document is generated.",
    saveFailed: "Could not save. Nothing was changed.",
    readOnly: "Read only.",
  },
}

const DATE_RE = /^\d{4}(-(0[1-9]|1[0-2]))?$/
const isBadDate = (v: string | null | undefined) =>
  typeof v === "string" && v.trim().length > 0 && !DATE_RE.test(v.trim())

type Bucket = keyof AnonymizeSelection

/** Ce que l'éditeur inline est en train de retoucher.
 *  `index: NEW` = bloc à créer. On ne l'ajoute au CV qu'à l'enregistrement :
 *  annuler ne doit pas laisser une brique vide dans la fiche du candidat. */
const NEW = -1
type EditTarget =
  | { kind: "summary"; index?: undefined }
  /** En-tête : séniorité, années d'expérience, localisation. */
  | { kind: "meta"; index?: undefined }
  | { kind: "skills"; index?: undefined }
  | { kind: "languages"; index?: undefined }
  | { kind: "experience"; index: number }
  | { kind: "education"; index: number }
  | { kind: "section"; index: number }

export interface AnonymizedCvLivePreviewProps {
  candidate: Candidate
  reference: string
  job: AnonymizedJobContext | null
  brand: AnonymizedBrand | null
  options: AnonymizedOptions
  selection: AnonymizeSelection
  /** Masquer / remettre un bloc — portée : cette mission. */
  onSelectionChange: (next: AnonymizeSelection) => void
  /** Ordre des briques — portée : cette mission. */
  order: AnonymizeOrder
  onOrderChange: (next: AnonymizeOrder) => void
  /** Corriger la donnée — portée : partout. Renvoie le CV enregistré. */
  onCvChange: (next: ParsedCv, taxonomy?: CandidateTaxonomy) => void
  /** Renommer la mission — portée : la mission. */
  onJobTitleChange?: (title: string) => void
  readOnly?: boolean
}

export function AnonymizedCvLivePreview({
  candidate, reference, job, brand, options, selection,
  onSelectionChange, order, onOrderChange, onCvChange, onJobTitleChange,
  readOnly = false,
}: AnonymizedCvLivePreviewProps) {
  const { lang } = useLanguage()
  const t = copy[lang]

  const [editing, setEditing] = useState<EditTarget | null>(null)
  /** Renommage de la mission — chemin à part : il n'écrit pas dans le CV du
   *  candidat mais dans la mission, et sa portée n'est donc pas la même. */
  const [editingJob, setEditingJob] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(true)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  /** Clé de la brique en cours de déplacement, avec son type. */
  const [dragging, setDragging] = useState<{ bucket: Bucket; key: string } | null>(null)

  // Le logo vit dans un bucket privé : sans URL signée, l'aperçu montrerait un
  // en-tête sans marque là où le document en imprime une.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/organization/anonymize-defaults")
        if (!res.ok) return
        const j = await res.json()
        if (!cancelled) setLogoUrl(j?.logo_url ?? null)
      } catch { /* l'aperçu reste lisible sans logo */ }
    })()
    return () => { cancelled = true }
  }, [])

  const model = useMemo(
    () => {
      const base = buildAnonymizedModel({
        candidate, reference, job,
        brand: { ...(brand ?? { name: null, logoUrl: null }), logoUrl: logoUrl ?? brand?.logoUrl ?? null },
        // Le résumé exécutif est rédigé par le serveur au moment de la
        // génération : ici on montre le résumé du CV à sa place, en annonçant
        // la substitution plutôt qu'en la laissant deviner.
        executiveSummary: null,
        options,
      })
      // On applique l'ORDRE mais PAS le masquage : une brique masquée reste à
      // l'écran, barrée, pour qu'on puisse la remettre. Le serveur, lui,
      // applique les deux — c'est la seule divergence assumée entre l'aperçu
      // et le document, et elle est signalée à l'écran.
      return {
        ...base,
        experience: sortByKeys(base.experience, order.experiences, experienceKey),
        education: sortByKeys(base.education, order.education, educationKey),
        otherSections: sortByKeys(base.otherSections, order.sections, sectionKey),
      }
    },
    [candidate, reference, job, brand, options, logoUrl, order],
  )

  /** Déplace `key` juste avant `overKey`, et enregistre le nouvel ordre. */
  const reorder = useCallback((bucket: Bucket, key: string, overKey: string) => {
    if (readOnly || key === overKey) return
    const currentKeys =
      bucket === "experiences" ? model.experience.map(experienceKey)
      : bucket === "education" ? model.education.map(educationKey)
      : model.otherSections.map(sectionKey)
    const from = currentKeys.indexOf(key)
    const to = currentKeys.indexOf(overKey)
    if (from < 0 || to < 0) return
    const next = [...currentKeys]
    next.splice(from, 1)
    next.splice(to, 0, key)
    onOrderChange({ ...order, [bucket]: next })
  }, [model, order, onOrderChange, readOnly])

  const accent = model.brand.accent
  const accent2 = model.brand.accentSecondary
  const isHidden = (bucket: Bucket, key: string) => selection[bucket].includes(key)

  const toggle = useCallback((bucket: Bucket, key: string) => {
    if (readOnly) return
    const cur = selection[bucket]
    onSelectionChange({
      ...selection,
      [bucket]: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key],
    })
  }, [selection, onSelectionChange, readOnly])

  /** Câblage du glisser-déposer d'un bloc. `dragOver` sert uniquement au trait
   *  d'insertion ; le déplacement réel n'a lieu qu'au dépôt. */
  const [dragOver, setDragOver] = useState<{ bucket: Bucket; key: string } | null>(null)
  const dragProps = useCallback((bucket: Bucket, key: string) => ({
    title: t.dragHint,
    isDragging: dragging?.bucket === bucket && dragging.key === key,
    isTarget: dragOver?.bucket === bucket && dragOver.key === key
      && !(dragging?.bucket === bucket && dragging.key === key),
    onStart: () => setDragging({ bucket, key }),
    onEnd: () => { setDragging(null); setDragOver(null) },
    // On ne déplace QUE dans la même rubrique : une formation n'a rien à
    // faire au milieu du parcours, et l'autoriser produirait un document
    // que le PDF ne saurait pas rendre.
    onOver: () => { if (dragging?.bucket === bucket) setDragOver({ bucket, key }) },
    onDrop: () => {
      if (dragging?.bucket === bucket) reorder(bucket, dragging.key, key)
      setDragging(null); setDragOver(null)
    },
  }), [dragging, dragOver, reorder, t])

  /** Un ordre est en vigueur dès qu'une des trois listes est renseignée. */
  const orderTouched = order.experiences.length > 0
    || order.education.length > 0
    || order.sections.length > 0

  const hiddenCount = useMemo(() => {
    const inExp = new Set(model.experience.map(experienceKey))
    const inEdu = new Set(model.education.map(educationKey))
    const inSec = new Set(model.otherSections.map(sectionKey))
    return selection.experiences.filter((k) => inExp.has(k)).length
      + selection.education.filter((k) => inEdu.has(k)).length
      + selection.sections.filter((k) => inSec.has(k)).length
  }, [model, selection])

  const summaryText = model.noraSummary ?? model.customSummary

  return (
    <section style={{
      background: "white", borderRadius: 16,
      border: "1px solid var(--nw-border-soft)", overflow: "hidden",
    }}>
      {/* Barre d'état — ce qui est masqué se lit sans faire défiler la page. */}
      <div style={{
        padding: "12px 18px", borderBottom: "1px solid var(--nw-border-soft)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{
            margin: 0, fontSize: 12, fontWeight: 700, color: "var(--nw-text-muted)",
            letterSpacing: "0.08em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
          }}>
            {t.docTitle}
          </h3>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--nw-text-muted)" }}>
            {readOnly ? t.readOnly : t.docHint}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {hiddenCount > 0 && (
            <>
              <span style={{
                fontSize: 11, fontWeight: 700, color: "var(--nw-warn-strong)",
                background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.3)",
                borderRadius: 100, padding: "3px 10px",
              }}>
                {t.hiddenBanner(hiddenCount)}
              </span>
              <button type="button" onClick={() => setShowHidden((v) => !v)} style={miniBtn}>
                {showHidden ? t.hideHidden : t.showHidden}
              </button>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onSelectionChange({ experiences: [], education: [], sections: [] })}
                  style={miniBtn}
                >
                  {t.showAll}
                </button>
              )}
            </>
          )}
          {/* Pendant de « Tout réafficher » pour l'ORDRE. Sans lui, le
              sourceur qui avait déplacé un bloc n'avait aucun moyen de revenir
              à l'ordre du CV : il devait redéplacer à la main, sans savoir
              quel était l'ordre d'origine. Repéré en testant. */}
          {!readOnly && orderTouched && (
            <button
              type="button"
              onClick={() => onOrderChange({ experiences: [], education: [], sections: [] })}
              style={miniBtn}
              title={t.resetOrderHint}
            >
              {t.resetOrder}
            </button>
          )}
        </div>
      </div>

      {/* La « page ».
          Toutes les mesures ci-dessous sont celles du PDF, converties : une A4
          fait 595,28 pt de large et le rendu à 96 dpi en fait 794 px, soit un
          facteur 1,3338. Les marges du document (52 pt sur les côtés, 44 en
          haut, 64 en bas) deviennent donc 69 / 59 / 85 px, et le corps de
          texte de 10 pt devient 13,3 px.

          Ce n'est pas de la coquetterie : tant que l'aperçu avait ses propres
          proportions, le sourceur ne pouvait pas juger de ce qui tiendrait sur
          la page. Le document qu'il ajuste doit avoir la forme de celui qu'il
          envoie. */}
      <div style={{ background: "var(--nw-surface-muted)", padding: 22, overflowX: "auto" }}>
        <div style={{
          position: "relative",
          width: 794, maxWidth: "100%", margin: "0 auto", background: "white",
          border: "1px solid var(--nw-border)", borderRadius: 3,
          boxShadow: "0 3px 18px rgba(17,24,39,0.10)",
          padding: "59px 69px 85px",
          fontSize: 13.3, color: "#1F2937", lineHeight: 1.55,
        }}>
          {/* PAS DE REPÈRES DE PAGE — essayés, mesurés, retirés.
              Une A4 laisse ~979 px de contenu au facteur d'échelle utilisé.
              Mais l'aperçu porte le CHROME D'ÉDITION que le document n'a pas :
              chaque bloc gagne 14 px de rembourrage et 8 px d'écart pour être
              survolable et déplaçable. Sur le CV de recette, l'aperçu mesurait
              3 738 px, soit 3,8 pages estimées, quand le PDF en fait 3.
              Annoncer une page de trop pousserait le sourceur à couper du
              contenu qui tenait — l'inverse du service rendu.
              Coller vraiment demanderait de reproduire la pagination de
              @react-pdf, y compris son refus de scinder un bloc. Tant que ce
              n'est pas fait, la largeur est exacte et la hauteur ne prétend
              rien. */}

          {model.options.watermark && model.watermarkText && (
            <span aria-hidden style={{
              position: "absolute", inset: 0, display: "flex",
              alignItems: "center", justifyContent: "center",
              transform: "rotate(-24deg)", pointerEvents: "none",
              fontSize: 52, fontWeight: 800, letterSpacing: "0.06em",
              color: accent, opacity: 0.07, overflow: "hidden",
            }}>
              {model.watermarkText}
            </span>
          )}

          {/* En-tête de marque */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              {model.brand.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={model.brand.logoUrl} alt="" style={{ height: 34, maxWidth: 120, objectFit: "contain" }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.7, fontWeight: 700, color: accent, letterSpacing: "1.3px" }}>
                  {model.brand.name.toUpperCase()}
                </div>
                {model.brand.slogan && (
                  <div style={{ fontSize: 11.3, color: "#6B7280", fontStyle: "italic", marginTop: 2 }}>{model.brand.slogan}</div>
                )}
              </div>
            </div>
            <span style={{ fontSize: 10.7, color: "#6B7280", letterSpacing: "0.7px", flexShrink: 0 }}>
              {t.ref} {reference}
            </span>
          </div>
          <div style={{ borderBottom: `1.9px solid ${accent}`, marginTop: 11, marginBottom: 24 }} />

          {/* Titre */}
          {model.hasJob && (
            <div style={{
              fontSize: 11.3, fontWeight: 700, color: accent,
              letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3,
            }}>
              {t.presentedFor}
            </div>
          )}
          {/* Le titre est celui de la MISSION : le corriger la renomme partout,
              d'où une portée différente des deux autres. */}
          <BlockShell
            hidden={false}
            readOnly={readOnly || !model.hasJob || !onJobTitleChange}
            onEdit={model.hasJob && onJobTitleChange ? () => setEditingJob(model.headline) : undefined}
            editLabel={t.edit}
            editTitle={t.jobScopeHint}
            scopeEverywhere={t.scopeJob}
          >
            <h1 style={{ margin: 0, fontSize: 26.7, fontWeight: 700, color: "#111827", letterSpacing: "-0.01em" }}>
              {model.headline}
            </h1>
          </BlockShell>

          {/* Méta */}
          <BlockShell
            hidden={false}
            readOnly={readOnly}
            onEdit={() => setEditing({ kind: "meta" })}
            editLabel={t.edit}
            editTitle={t.editScope}
            scopeEverywhere={t.scopeEverywhere}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12, marginBottom: 6 }}>
              <Meta label={t.seniorityLabel} value={model.seniority} />
              <Meta label={t.experienceLabel} value={model.years != null ? t.yearsSuffix(model.years) : null} />
              <Meta label={t.zoneLabel} value={model.zone} />
            </div>
          </BlockShell>

          <BlockShell
            hidden={false}
            readOnly={readOnly}
            onEdit={() => setEditing({ kind: "languages" })}
            editLabel={t.edit}
            editTitle={t.editScope}
            scopeEverywhere={t.scopeEverywhere}
          >
            <div style={{ marginBottom: 12 }}>
              <Meta label={t.languages} value={model.languages.length ? model.languages.join(" · ") : "—"} />
            </div>
          </BlockShell>

          {/* Résumé */}
          <Band title={t.summary} accent={accent2}>
            <BlockShell
              hidden={false}
              readOnly={readOnly}
              onEdit={() => setEditing({ kind: "summary" })}
              editLabel={t.edit}
              editTitle={t.editScope}
              scopeEverywhere={t.scopeEverywhere}
            >
              {summaryText ? (
                <p style={{ margin: 0 }}>{summaryText}</p>
              ) : (
                <p style={{ margin: 0, color: "#9CA3AF", fontStyle: "italic" }}>
                  {model.options.keepNoraSummary ? t.summaryPending : t.noSummary}
                </p>
              )}
            </BlockShell>
          </Band>

          {/* Compétences clés — non masquables une par une (ce sont des
              étiquettes, pas des blocs), mais corrigeables en lot. C'est le
              champ qui s'imprime tel quel chez le client. */}
          <Band title={t.keySkills} accent={accent2}>
            <BlockShell
              hidden={false}
              readOnly={readOnly}
              onEdit={() => setEditing({ kind: "skills" })}
              editLabel={t.edit}
              editTitle={t.editScope}
              scopeEverywhere={t.scopeEverywhere}
            >
              {model.skills.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {model.skills.map((sk) => (
                    <span key={sk} style={{
                      fontSize: 11, color: "#374151", background: "#F9FAFB",
                      border: "1px solid #E5E7EB", borderRadius: 5, padding: "3px 8px",
                    }}>{sk}</span>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, color: "#9CA3AF", fontStyle: "italic", fontSize: 12 }}>—</p>
              )}
            </BlockShell>
          </Band>

          {/* Parcours */}
          <Band
            title={t.experience}
            accent={accent2}
            action={!readOnly && (
              <AddInline
                label={t.addExperience} hint={t.addScope}
                onClick={() => setEditing({ kind: "experience", index: NEW })}
              />
            )}
          >
            <BlockList
              empty={model.experience.length > 0 && model.experience.every((e) => isHidden("experiences", experienceKey(e)))}
              emptyLabel={t.everythingHidden}
            >
              {model.experience.map((e, i) => {
                const key = experienceKey(e)
                const hidden = isHidden("experiences", key)
                if (hidden && !showHidden) return null
                const end = endLabel(e.end, model.options.language)
                return (
                  <BlockShell
                    key={`${key}#${i}`}
                    hidden={hidden}
                    readOnly={readOnly}
                    onToggle={() => toggle("experiences", key)}
                    onEdit={() => setEditing({ kind: "experience", index: i })}
                    toggleLabel={hidden ? t.restore : t.hide}
                    toggleTitle={hidden ? t.restoreScope : t.hideScope}
                    editLabel={t.edit}
                    editTitle={t.editScope}
                    scopeMission={t.scopeMission}
                    scopeEverywhere={t.scopeEverywhere}
                    hiddenTag={t.hiddenTag}
                    drag={dragProps("experiences", key)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 13.5, color: "#111827" }}>
                        {e.title || "—"}
                        {e.company && <span style={{ fontWeight: 500, color: "#6B7280" }}> — {e.company}</span>}
                      </strong>
                      <span style={{ fontSize: 11, color: "#6B7280", whiteSpace: "nowrap" }}>
                        {[e.start, end].filter(Boolean).join(" – ")}
                      </span>
                    </div>
                    {e.description && (
                      <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#374151" }}>{e.description}</p>
                    )}
                  </BlockShell>
                )
              })}
            </BlockList>
          </Band>

          {/* Formation */}
          <Band
            title={t.education}
            accent={accent2}
            action={!readOnly && (
              <AddInline
                label={t.addEducation} hint={t.addScope}
                onClick={() => setEditing({ kind: "education", index: NEW })}
              />
            )}
          >
            <BlockList
              empty={model.education.length > 0 && model.education.every((ed) => isHidden("education", educationKey(ed)))}
              emptyLabel={t.everythingHidden}
            >
              {model.education.map((ed, i) => {
                const key = educationKey(ed)
                const hidden = isHidden("education", key)
                if (hidden && !showHidden) return null
                return (
                  <BlockShell
                    key={`${key}#${i}`}
                    hidden={hidden}
                    readOnly={readOnly}
                    onToggle={() => toggle("education", key)}
                    onEdit={() => setEditing({ kind: "education", index: i })}
                    toggleLabel={hidden ? t.restore : t.hide}
                    toggleTitle={hidden ? t.restoreScope : t.hideScope}
                    editLabel={t.edit}
                    editTitle={t.editScope}
                    scopeMission={t.scopeMission}
                    scopeEverywhere={t.scopeEverywhere}
                    hiddenTag={t.hiddenTag}
                    drag={dragProps("education", key)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 13, color: "#111827" }}>
                        {ed.degree || "—"}
                        {ed.field ? `, ${ed.field}` : ""}
                        {ed.school && <span style={{ fontWeight: 500, color: "#6B7280" }}> — {ed.school}</span>}
                      </strong>
                      <span style={{ fontSize: 11, color: "#6B7280", whiteSpace: "nowrap" }}>
                        {[ed.start, ed.end].filter(Boolean).join(" – ")}
                      </span>
                    </div>
                  </BlockShell>
                )
              })}
            </BlockList>
          </Band>

          {/* Rubriques libres */}
          <Band
            title={lang === "en" ? "Other sections" : "Autres rubriques"}
            accent={accent2}
            action={!readOnly && (
              <AddInline
                label={t.addSection} hint={t.addScope}
                onClick={() => setEditing({ kind: "section", index: NEW })}
              />
            )}
          >
            <BlockList
              empty={model.otherSections.length > 0 && model.otherSections.every((s) => isHidden("sections", sectionKey(s)))}
              emptyLabel={t.everythingHidden}
            >
              {model.otherSections.map((sec, i) => {
                const key = sectionKey(sec)
                const hidden = isHidden("sections", key)
                if (hidden && !showHidden) return null
                return (
                  <BlockShell
                    key={`${key}#${i}`}
                    hidden={hidden}
                    readOnly={readOnly}
                    onToggle={() => toggle("sections", key)}
                    onEdit={() => setEditing({ kind: "section", index: i })}
                    toggleLabel={hidden ? t.restore : t.hide}
                    toggleTitle={hidden ? t.restoreScope : t.hideScope}
                    editLabel={t.edit}
                    editTitle={t.editScope}
                    scopeMission={t.scopeMission}
                    scopeEverywhere={t.scopeEverywhere}
                    hiddenTag={t.hiddenTag}
                    drag={dragProps("sections", key)}
                  >
                    <strong style={{ fontSize: 12.5, color: "#111827" }}>{sec.title}</strong>
                    <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "#374151", whiteSpace: "pre-wrap" }}>
                      {sec.content}
                    </p>
                  </BlockShell>
                )
              })}
            </BlockList>
          </Band>

          {/* Pied — repris du document */}
          <div style={{
            marginTop: 22, paddingTop: 8, borderTop: "1px solid #E5E1F2",
            display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
            fontSize: 10, color: "#9CA3AF",
          }}>
            <span>{model.brand.name}</span>
            {model.brand.contactEmail && <span>{model.brand.contactEmail}</span>}
          </div>
        </div>
      </div>

      {editing && (
        <InlineEditor
          target={editing}
          cv={candidate.parsed_cv ?? {}}
          coreSkills={candidate.taxonomy?.core_skills ?? null}
          // Valeurs EFFECTIVEMENT affichées sur le document. Le modèle
          // privilégie les colonnes du candidat au JSON du CV ; initialiser
          // l'éditeur depuis le seul JSON aurait pu lui faire présenter une
          // séniorité différente de celle imprimée sous les yeux du sourceur.
          meta={{
            seniority: model.seniority,
            years: model.years,
            location: candidate.location ?? candidate.parsed_cv?.location ?? null,
          }}
          t={t}
          onClose={() => setEditing(null)}
          onSaved={(cv, taxonomy) => { onCvChange(cv, taxonomy); setEditing(null) }}
          candidateId={candidate.id}
        />
      )}

      {editingJob !== null && onJobTitleChange && (
        <JobTitleEditor
          value={editingJob}
          t={t}
          onClose={() => setEditingJob(null)}
          onSave={(title) => { onJobTitleChange(title); setEditingJob(null) }}
        />
      )}
    </section>
  )
}

/* ─── Habillage ────────────────────────────────────────────────────── */

const miniBtn: React.CSSProperties = {
  fontFamily: "inherit", fontSize: 11, fontWeight: 600,
  color: "var(--nw-text-secondary)", background: "white",
  border: "1px solid var(--nw-border)", borderRadius: 7,
  padding: "4px 9px", cursor: "pointer",
}

function Meta({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div>
      <div style={{
        fontSize: 9.3, fontWeight: 700, color: "#9CA3AF",
        letterSpacing: "0.1em", textTransform: "uppercase",
      }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function Band({ title, accent, action, children }: {
  title: string; accent: string; action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 10, marginBottom: 7,
      }}>
        <div style={{
          fontSize: 12, fontWeight: 700, color: accent,
          letterSpacing: "0.12em", textTransform: "uppercase",
        }}>
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function BlockList({ children, empty, emptyLabel }: {
  children: React.ReactNode; empty: boolean; emptyLabel: string
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {children}
      {empty && (
        <p style={{ margin: 0, fontSize: 11.5, color: "#9CA3AF", fontStyle: "italic" }}>{emptyLabel}</p>
      )}
    </div>
  )
}

/**
 * Enveloppe d'un bloc du document : le contenu, et au survol les deux actions
 * avec LEUR PORTÉE écrite. C'est le seul endroit où le sourceur apprend, sans
 * lire de documentation, que masquer ne vaut que pour cette mission alors que
 * corriger vaut partout.
 */
function BlockShell({
  children, hidden, readOnly, onToggle, onEdit,
  toggleLabel, toggleTitle, editLabel, editTitle,
  scopeMission, scopeEverywhere, hiddenTag,
  drag,
}: {
  children: React.ReactNode
  hidden: boolean
  readOnly: boolean
  onToggle?: () => void
  onEdit?: () => void
  toggleLabel?: string
  toggleTitle?: string
  editLabel: string
  editTitle: string
  scopeMission?: string
  scopeEverywhere: string
  hiddenTag?: string
  /** Déplacement du bloc. Absent = bloc non déplaçable (le résumé). */
  drag?: {
    title: string
    isDragging: boolean
    isTarget: boolean
    onStart: () => void
    onEnd: () => void
    onOver: () => void
    onDrop: () => void
  }
}) {
  const [hover, setHover] = useState(false)
  const showActions = hover && !readOnly
  const draggable = !!drag && !readOnly

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      draggable={draggable}
      onDragStart={draggable ? (e) => { e.dataTransfer.effectAllowed = "move"; drag!.onStart() } : undefined}
      onDragEnd={draggable ? () => drag!.onEnd() : undefined}
      onDragOver={draggable ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; drag!.onOver() } : undefined}
      onDrop={draggable ? (e) => { e.preventDefault(); drag!.onDrop() } : undefined}
      style={{
        // Grille à trois colonnes : poignée · contenu · actions. Les deux
        // colonnes latérales existent EN PERMANENCE, même vides. Les actions
        // étaient auparavant posées en absolu au-dessus du bloc : elles
        // mordaient sur le bloc précédent, et le document sautait au survol.
        display: "grid",
        gridTemplateColumns: `${drag ? "18px" : "0px"} minmax(0, 1fr) auto`,
        alignItems: "start",
        gap: 8,
        padding: "7px 9px",
        margin: "0 -9px",
        borderRadius: 8,
        background: hidden ? "rgba(245,158,11,0.06)" : (showActions ? "rgba(124,99,200,0.04)" : "transparent"),
        outline: hidden ? "1px dashed rgba(245,158,11,0.45)" : "none",
        borderTop: drag?.isTarget ? "2px solid var(--nw-primary)" : "2px solid transparent",
        opacity: drag?.isDragging ? 0.4 : (hidden ? 0.6 : 1),
        transition: "background 120ms, opacity 120ms",
        cursor: draggable ? "grab" : "default",
      }}
    >
      {/* Poignée — signale que le bloc se déplace, sans occuper la place
          d'une icône permanente : elle n'apparaît qu'au survol. */}
      <span aria-hidden title={drag?.title} style={{
        display: drag ? "block" : "none",
        paddingTop: 2, lineHeight: 1,
        color: "var(--nw-text-muted)", fontSize: 13,
        opacity: showActions ? 0.75 : 0,
        transition: "opacity 120ms",
      }}>
        ⠿
      </span>

      <div style={{ minWidth: 0, textDecoration: hidden ? "line-through" : "none" }}>
        {hidden && hiddenTag && (
          <span style={{
            display: "inline-block", marginBottom: 3,
            fontSize: 8.5, fontWeight: 800, color: "var(--nw-warn-strong)",
            background: "white", border: "1px solid rgba(245,158,11,0.45)",
            borderRadius: 100, padding: "1px 7px", letterSpacing: "0.06em",
            textTransform: "uppercase", textDecoration: "none",
          }}>
            {hiddenTag}
          </span>
        )}
        {children}
      </div>

      {/* Colonne d'actions : `visibility` et non `display`, pour que la
          largeur soit réservée dès le départ — sinon le texte du bloc se
          recompose à chaque survol. */}
      <div style={{
        display: "flex", flexDirection: "column", gap: 4, flexShrink: 0,
        visibility: showActions ? "visible" : "hidden",
      }}>
        {onToggle && toggleLabel && (
          <ActionChip
            onClick={onToggle}
            title={toggleTitle ?? ""}
            label={toggleLabel}
            scope={scopeMission ?? ""}
            tone="mission"
          />
        )}
        {onEdit && (
          <ActionChip
            onClick={onEdit}
            title={editTitle}
            label={editLabel}
            scope={scopeEverywhere}
            tone="source"
          />
        )}
      </div>
    </div>
  )
}

/** Action + portée, côte à côte. La portée n'est pas une info secondaire :
 *  c'est ce qui distingue les deux gestes. */
function ActionChip({ onClick, title, label, scope, tone }: {
  onClick: () => void; title: string; label: string; scope: string
  tone: "mission" | "source"
}) {
  const c = tone === "mission"
    ? { fg: "var(--nw-warn-strong)", bd: "rgba(245,158,11,0.45)", bg: "#FFFBEB" }
    : { fg: "var(--nw-primary)", bd: "rgba(124,99,200,0.4)", bg: "white" }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        fontFamily: "inherit", fontSize: 10, fontWeight: 700,
        color: c.fg, background: c.bg, border: `1px solid ${c.bd}`,
        borderRadius: 100, padding: "3px 9px", cursor: "pointer",
        boxShadow: "0 1px 4px rgba(17,24,39,0.08)",
        display: "inline-flex", alignItems: "center", gap: 5,
        whiteSpace: "nowrap",
      }}
    >
      {label}
      <span style={{ fontWeight: 500, opacity: 0.75 }}>· {scope}</span>
    </button>
  )
}

function AddInline({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} title={hint}
      style={{
        fontFamily: "inherit", fontSize: 10.5, fontWeight: 700,
        color: "var(--nw-primary)", background: "transparent",
        border: "1px dashed rgba(124,99,200,0.4)", borderRadius: 7,
        padding: "3px 9px", cursor: "pointer",
      }}
    >
      {label}
    </button>
  )
}

/* ─── Éditeur inline ───────────────────────────────────────────────── */

const fieldStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  fontFamily: "inherit", fontSize: 13, color: "var(--nw-text)",
  padding: "8px 10px", background: "white",
  border: "1px solid var(--nw-border)", borderRadius: 8, outline: "none",
}

const fieldLabel: React.CSSProperties = {
  display: "block", marginBottom: 4,
  fontSize: 10.5, fontWeight: 700, color: "var(--nw-text-muted)",
  letterSpacing: "0.05em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
}

/**
 * Correction d'un bloc — écrit dans `parsed_cv`, donc PARTOUT.
 *
 * Le panneau le dit en toutes lettres avant d'enregistrer. Une date hors
 * format est signalée ici : le serveur la refuserait en silence, et le
 * sourceur croirait sa correction passée.
 */
function InlineEditor({ target, cv, coreSkills, meta, t, onClose, onSaved, candidateId }: {
  target: EditTarget
  cv: ParsedCv
  /** `taxonomy.core_skills` — ce que le document imprime sous « Compétences
   *  clés » quand il est renseigné. Vit hors de `parsed_cv`, d'où le passage
   *  explicite : l'éditer sans ça n'aurait aucun effet visible. */
  coreSkills: string[] | null
  /** Valeurs d'en-tête telles qu'AFFICHÉES, colonnes du candidat comprises. */
  meta: { seniority: string | null; years: number | null; location: string | null }
  t: typeof copy["fr"]
  onClose: () => void
  onSaved: (cv: ParsedCv, taxonomy?: CandidateTaxonomy) => void
  candidateId: string
}) {
  // Listes éditées en texte libre, une par ligne : plus rapide à corriger en
  // lot que des chips, et c'est un travail de reprise, pas de saisie.
  const [skillsText, setSkillsText] = useState(
    () => (coreSkills?.length ? coreSkills : (cv.skills ?? [])).join("\n"),
  )
  const [languagesText, setLanguagesText] = useState(() => (cv.languages ?? []).join("\n"))
  const linesOf = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean)
  // Un bloc NEUF est ajouté au brouillon seulement, jamais au CV : refermer
  // sans enregistrer ne doit pas laisser une brique vide dans la fiche.
  const [draft, setDraft] = useState<ParsedCv>(() => {
    const base: ParsedCv = {
      ...cv,
      // Ce que le document AFFICHE, pas ce que le JSON contient : le modèle
      // privilégie les colonnes du candidat, et l'éditeur doit partir de la
      // valeur que le sourceur a sous les yeux.
      seniority_level: meta.seniority,
      years_experience: meta.years,
      location: meta.location,
      experience: [...(cv.experience ?? [])],
      education: [...(cv.education ?? [])],
      other_sections: [...(cv.other_sections ?? [])],
    }
    if (target.index !== NEW) return base
    if (target.kind === "experience") base.experience = [...(base.experience ?? []), { title: "", company: "" }]
    if (target.kind === "education") base.education = [...(base.education ?? []), { degree: "", school: "" }]
    if (target.kind === "section") base.other_sections = [...(base.other_sections ?? []), { title: "", content: "" }]
    return base
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  /** Rang réel du bloc dans le brouillon (le neuf est en fin de liste). */
  const idx = (list: unknown[] | undefined) =>
    target.index === NEW ? Math.max(0, (list?.length ?? 1) - 1) : (target.index ?? 0)

  const expIndex = idx(draft.experience)
  const eduIndex = idx(draft.education)
  const secIndex = idx(draft.other_sections)

  const exp = target.kind === "experience" ? draft.experience?.[expIndex] : undefined
  const edu = target.kind === "education" ? draft.education?.[eduIndex] : undefined
  const sec = target.kind === "section" ? draft.other_sections?.[secIndex] : undefined

  const badDate =
    (exp ? isBadDate(exp.start) || isBadDate(exp.end) : false) ||
    (edu ? isBadDate(edu.start) || isBadDate(edu.end) : false)

  const patchExp = (f: Partial<NonNullable<ParsedCv["experience"]>[number]>) =>
    setDraft((d) => ({
      ...d,
      experience: (d.experience ?? []).map((x, i) => i === expIndex ? { ...x, ...f } : x),
    }))
  const patchEdu = (f: Partial<NonNullable<ParsedCv["education"]>[number]>) =>
    setDraft((d) => ({
      ...d,
      education: (d.education ?? []).map((x, i) => i === eduIndex ? { ...x, ...f } : x),
    }))
  const patchSec = (f: Partial<NonNullable<ParsedCv["other_sections"]>[number]>) =>
    setDraft((d) => ({
      ...d,
      other_sections: (d.other_sections ?? []).map((x, i) => i === secIndex ? { ...x, ...f } : x),
    }))

  const save = async () => {
    if (saving || badDate) return
    setSaving(true); setError(null)
    try {
      // On n'envoie QUE ce que ce panneau édite. La route laisse intacte
      // toute clé absente : envoyer le CV entier à chaque correction ferait
      // écraser, sur une saisie concurrente, des champs qu'on n'a pas touchés.
      const payload: Record<string, unknown> =
        target.kind === "skills"
          ? {
              // On écrit les DEUX : `core_skills` est ce que le document
              // imprime, `skills` sert au matching. Ne toucher qu'à l'un des
              // deux ferait diverger le document et le scoring.
              core_skills: linesOf(skillsText),
              skills: linesOf(skillsText),
            }
        : target.kind === "languages" ? { languages: linesOf(languagesText) }
        : target.kind === "meta" ? {
            seniority_level: draft.seniority_level ?? null,
            years_experience: draft.years_experience ?? null,
            location: draft.location ?? null,
          }
        : {
            summary: draft.summary ?? null,
            experience: draft.experience ?? [],
            education: draft.education ?? [],
            other_sections: draft.other_sections ?? [],
          }

      const res = await fetch(`/api/candidates/${candidateId}/parsed-cv`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) { setError(t.saveFailed); return }
      onSaved(data.parsed_cv as ParsedCv, data.taxonomy as CandidateTaxonomy | undefined)
    } catch {
      setError(t.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  const title =
    target.kind === "summary" ? t.editTitleSummary
    : target.kind === "meta" ? t.editTitleMeta
    : target.kind === "skills" ? t.editTitleSkills
    : target.kind === "languages" ? t.editTitleLanguages
    : target.kind === "experience" ? t.editTitleExp
    : target.kind === "education" ? t.editTitleEdu
    : t.editTitleSec

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: "fixed", inset: 0, zIndex: 120,
        background: "rgba(17,24,39,0.40)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div style={{
        background: "white", borderRadius: 14, width: "min(560px, 100%)",
        maxHeight: "86vh", overflowY: "auto",
        border: "1px solid var(--nw-border-soft)", boxShadow: "0 18px 50px rgba(17,24,39,0.22)",
      }}>
        <div style={{ padding: "16px 20px 0" }}>
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--nw-text)" }}>{title}</h4>
          <p style={{ margin: "5px 0 0", fontSize: 12, color: "var(--nw-text-muted)", lineHeight: 1.5 }}>
            {t.editScope}
          </p>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {target.kind === "summary" && (
            <label style={{ display: "block" }}>
              <span style={fieldLabel}>{t.fSummary}</span>
              <textarea
                value={draft.summary ?? ""}
                rows={6}
                maxLength={2000}
                onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
                style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.6 }}
              />
            </label>
          )}

          {target.kind === "meta" && (
            <>
              <Row>
                <F label={t.fSeniority} value={draft.seniority_level ?? ""}
                   onChange={(v) => setDraft((d) => ({ ...d, seniority_level: v }))} autoFocus />
                <F label={t.fYears} value={draft.years_experience != null ? String(draft.years_experience) : ""}
                   onChange={(v) => setDraft((d) => ({
                     ...d, years_experience: v.trim() === "" ? null : Number(v.replace(/[^\d]/g, "")) || null,
                   }))} />
              </Row>
              <F label={t.fLocation} value={draft.location ?? ""}
                 onChange={(v) => setDraft((d) => ({ ...d, location: v }))} />
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--nw-text-muted)", lineHeight: 1.5 }}>
                {t.locationHint}
              </p>
            </>
          )}

          {target.kind === "skills" && (
            <label style={{ display: "block" }}>
              <span style={fieldLabel}>{t.fSkills}</span>
              <textarea
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                value={skillsText}
                rows={10}
                onChange={(e) => setSkillsText(e.target.value)}
                style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.6 }}
              />
              <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "var(--nw-text-muted)" }}>
                {t.listHint}
              </span>
            </label>
          )}

          {target.kind === "languages" && (
            <label style={{ display: "block" }}>
              <span style={fieldLabel}>{t.fLanguages}</span>
              <textarea
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                value={languagesText}
                rows={6}
                onChange={(e) => setLanguagesText(e.target.value)}
                style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.6 }}
              />
              <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "var(--nw-text-muted)" }}>
                {t.listHint}
              </span>
            </label>
          )}

          {exp && (
            <>
              <Row>
                <F label={t.fTitle} value={exp.title ?? ""} onChange={(v) => patchExp({ title: v })} autoFocus />
                <F label={t.fCompany} value={exp.company ?? ""} onChange={(v) => patchExp({ company: v })} />
              </Row>
              <Row>
                <F label={t.fStart} value={exp.start ?? ""} placeholder={t.dateHint}
                   invalid={isBadDate(exp.start)} invalidHint={t.dateInvalid}
                   onChange={(v) => patchExp({ start: v })} />
                <F label={t.fEnd} value={exp.end ?? ""} placeholder={t.dateHint}
                   invalid={isBadDate(exp.end)} invalidHint={t.dateInvalid}
                   disabled={exp.end === null}
                   onChange={(v) => patchExp({ end: v })} />
              </Row>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={exp.end === null}
                  onChange={(e) => patchExp({ end: e.target.checked ? null : undefined })}
                />
                {t.fOngoing}
              </label>
              <label style={{ display: "block" }}>
                <span style={fieldLabel}>{t.fDescription}</span>
                <textarea
                  value={exp.description ?? ""} rows={5} maxLength={2000}
                  onChange={(e) => patchExp({ description: e.target.value })}
                  style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.6 }}
                />
              </label>
            </>
          )}

          {edu && (
            <>
              <Row>
                <F label={t.fDegree} value={edu.degree ?? ""} onChange={(v) => patchEdu({ degree: v })} autoFocus />
                <F label={t.fSchool} value={edu.school ?? ""} onChange={(v) => patchEdu({ school: v })} />
              </Row>
              <Row>
                <F label={t.fField} value={edu.field ?? ""} onChange={(v) => patchEdu({ field: v })} />
                <F label={t.fStart} value={edu.start ?? ""} placeholder={t.dateHint}
                   invalid={isBadDate(edu.start)} invalidHint={t.dateInvalid}
                   onChange={(v) => patchEdu({ start: v })} />
                <F label={t.fEnd} value={edu.end ?? ""} placeholder={t.dateHint}
                   invalid={isBadDate(edu.end)} invalidHint={t.dateInvalid}
                   onChange={(v) => patchEdu({ end: v })} />
              </Row>
            </>
          )}

          {sec && (
            <>
              <F label={t.fSecTitle} value={sec.title ?? ""} maxLength={80}
                 onChange={(v) => patchSec({ title: v })} autoFocus />
              <label style={{ display: "block" }}>
                <span style={fieldLabel}>{t.fSecContent}</span>
                <textarea
                  value={sec.content ?? ""} rows={5} maxLength={800}
                  onChange={(e) => patchSec({ content: e.target.value })}
                  style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.6 }}
                />
              </label>
            </>
          )}

          {(error || badDate) && (
            <p style={{
              margin: 0, fontSize: 12.5,
              color: error ? "var(--nw-danger-strong)" : "var(--nw-warn-strong)",
            }}>
              {error ?? t.dateInvalid}
            </p>
          )}
        </div>

        <div style={{
          padding: "0 20px 18px", display: "flex", justifyContent: "flex-end", gap: 8,
        }}>
          <button type="button" onClick={onClose} disabled={saving} style={{
            fontFamily: "inherit", fontSize: 12, fontWeight: 600,
            color: "var(--nw-text-secondary)", background: "transparent",
            border: "1px solid var(--nw-border)", borderRadius: 8,
            padding: "8px 14px", cursor: "pointer",
          }}>
            {t.cancel}
          </button>
          <button type="button" onClick={save} disabled={saving || badDate} style={{
            fontFamily: "inherit", fontSize: 12, fontWeight: 700,
            color: "white", background: "var(--nw-primary)",
            border: "1px solid rgba(124,99,200,0.4)", borderRadius: 8,
            padding: "8px 16px",
            cursor: saving || badDate ? "not-allowed" : "pointer",
            opacity: saving || badDate ? 0.55 : 1,
          }}>
            {saving ? t.saving : t.save}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Renommage de la mission — chemin séparé de l'éditeur de CV.
 *
 * Il n'écrit pas dans le candidat mais dans la mission, et sa portée n'est
 * donc ni « cette mission » (au sens présentation) ni « partout » : c'est le
 * nom de la mission, qui change dans tout le produit. Le panneau le dit.
 */
function JobTitleEditor({ value, t, onClose, onSave }: {
  value: string
  t: typeof copy["fr"]
  onClose: () => void
  onSave: (title: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const trimmed = draft.trim()
  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: "fixed", inset: 0, zIndex: 120,
        background: "rgba(17,24,39,0.40)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div style={{
        background: "white", borderRadius: 14, width: "min(480px, 100%)",
        border: "1px solid var(--nw-border-soft)", boxShadow: "0 18px 50px rgba(17,24,39,0.22)",
        padding: 20,
      }}>
        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--nw-text)" }}>{t.editTitleJob}</h4>
        <p style={{ margin: "5px 0 14px", fontSize: 12, color: "var(--nw-text-muted)", lineHeight: 1.5 }}>
          {t.jobScopeHint}
        </p>
        <label style={{ display: "block" }}>
          <span style={fieldLabel}>{t.fJobTitle}</span>
          <input
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            type="text"
            value={draft}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && trimmed) onSave(trimmed) }}
            style={fieldStyle}
          />
        </label>
        <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={{
            fontFamily: "inherit", fontSize: 12, fontWeight: 600,
            color: "var(--nw-text-secondary)", background: "transparent",
            border: "1px solid var(--nw-border)", borderRadius: 8,
            padding: "8px 14px", cursor: "pointer",
          }}>
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={() => trimmed && onSave(trimmed)}
            disabled={!trimmed}
            style={{
              fontFamily: "inherit", fontSize: 12, fontWeight: 700,
              color: "white", background: "var(--nw-primary)",
              border: "1px solid rgba(124,99,200,0.4)", borderRadius: 8,
              padding: "8px 16px",
              cursor: trimmed ? "pointer" : "not-allowed",
              opacity: trimmed ? 1 : 0.55,
            }}
          >
            {t.save}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
      {children}
    </div>
  )
}

function F({ label, value, onChange, placeholder, invalid, invalidHint, disabled, maxLength = 400, autoFocus }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  invalid?: boolean
  invalidHint?: string
  disabled?: boolean
  maxLength?: number
  autoFocus?: boolean
}) {
  return (
    <label style={{ display: "block" }}>
      <span style={fieldLabel}>{label}</span>
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        type="text"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...fieldStyle,
          borderColor: invalid ? "var(--nw-warn)" : "var(--nw-border)",
          background: disabled ? "var(--nw-neutral-100)" : "white",
        }}
      />
      {invalid && invalidHint && (
        <span style={{ display: "block", marginTop: 3, fontSize: 10.5, color: "var(--nw-warn-strong)" }}>
          {invalidHint}
        </span>
      )}
    </label>
  )
}
