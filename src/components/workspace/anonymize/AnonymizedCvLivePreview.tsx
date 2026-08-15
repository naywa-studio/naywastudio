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
import type { Candidate, ParsedCv } from "@/lib/database.types"
import {
  buildAnonymizedModel, endLabel,
  type AnonymizedJobContext, type AnonymizedBrand, type AnonymizedOptions,
} from "@/lib/anonymized-cv-model"
import {
  experienceKey, educationKey, sectionKey,
  type AnonymizeSelection,
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
    showHidden: "Afficher les blocs masqués",
    hideHidden: "Masquer les blocs masqués",
    hiddenTag: "Masqué",
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
    showHidden: "Show hidden blocks",
    hideHidden: "Hide hidden blocks",
    hiddenTag: "Hidden",
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
  /** Corriger la donnée — portée : partout. Renvoie le CV enregistré. */
  onCvChange: (next: ParsedCv) => void
  readOnly?: boolean
}

export function AnonymizedCvLivePreview({
  candidate, reference, job, brand, options, selection,
  onSelectionChange, onCvChange, readOnly = false,
}: AnonymizedCvLivePreviewProps) {
  const { lang } = useLanguage()
  const t = copy[lang]

  const [editing, setEditing] = useState<EditTarget | null>(null)
  const [showHidden, setShowHidden] = useState(true)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

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
    () => buildAnonymizedModel({
      candidate, reference, job,
      brand: { ...(brand ?? { name: null, logoUrl: null }), logoUrl: logoUrl ?? brand?.logoUrl ?? null },
      // Le résumé exécutif est rédigé par le serveur au moment de la
      // génération : ici on montre le résumé du CV à sa place, en annonçant
      // la substitution plutôt qu'en la laissant deviner.
      executiveSummary: null,
      options,
    }),
    [candidate, reference, job, brand, options, logoUrl],
  )

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
        {hiddenCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
          </div>
        )}
      </div>

      {/* La « page ». Fond gris autour pour lire le document comme une feuille. */}
      <div style={{ background: "var(--nw-surface-muted)", padding: 18, overflowX: "auto" }}>
        <div style={{
          position: "relative",
          maxWidth: 720, margin: "0 auto", background: "white",
          border: "1px solid var(--nw-border)", borderRadius: 6,
          boxShadow: "0 2px 14px rgba(17,24,39,0.06)",
          padding: "30px 34px 34px",
          fontSize: 13, color: "#1F2937", lineHeight: 1.55,
        }}>
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
                <div style={{ fontSize: 12, fontWeight: 800, color: accent, letterSpacing: "0.08em" }}>
                  {model.brand.name.toUpperCase()}
                </div>
                {model.brand.slogan && (
                  <div style={{ fontSize: 10, color: "#6B7280", fontStyle: "italic" }}>{model.brand.slogan}</div>
                )}
              </div>
            </div>
            <span style={{ fontSize: 10, color: "#6B7280", letterSpacing: "0.04em", flexShrink: 0 }}>
              {t.ref} {reference}
            </span>
          </div>
          <div style={{ borderBottom: `1.5px solid ${accent}`, marginTop: 8, marginBottom: 18 }} />

          {/* Titre */}
          {model.hasJob && (
            <div style={{
              fontSize: 10, fontWeight: 700, color: accent2,
              letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3,
            }}>
              {t.presentedFor}
            </div>
          )}
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#111827", letterSpacing: "-0.01em" }}>
            {model.headline}
          </h1>

          {/* Méta */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12, marginBottom: 18 }}>
            <Meta label={t.seniorityLabel} value={model.seniority} />
            <Meta label={t.experienceLabel} value={model.years != null ? t.yearsSuffix(model.years) : null} />
            <Meta label={t.zoneLabel} value={model.zone} />
            <Meta label={t.languages} value={model.languages.length ? model.languages.join(" · ") : null} />
          </div>

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

          {/* Compétences clés — non masquables une par une : ce sont des
              étiquettes, pas des blocs. Les corriger se fait sur la fiche. */}
          {model.skills.length > 0 && (
            <Band title={t.keySkills} accent={accent2}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {model.skills.map((sk) => (
                  <span key={sk} style={{
                    fontSize: 11, color: "#374151", background: "#F9FAFB",
                    border: "1px solid #E5E7EB", borderRadius: 5, padding: "3px 8px",
                  }}>{sk}</span>
                ))}
              </div>
            </Band>
          )}

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
          onClose={() => setEditing(null)}
          onSaved={(cv) => { onCvChange(cv); setEditing(null) }}
          candidateId={candidate.id}
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
        fontSize: 8.5, fontWeight: 700, color: "#9CA3AF",
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
          fontSize: 9.5, fontWeight: 800, color: accent,
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
}) {
  const [hover, setHover] = useState(false)
  const showActions = hover && !readOnly
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        padding: "7px 9px",
        margin: "0 -9px",
        borderRadius: 8,
        background: hidden ? "rgba(245,158,11,0.06)" : (showActions ? "rgba(124,99,200,0.04)" : "transparent"),
        outline: hidden ? "1px dashed rgba(245,158,11,0.45)" : "none",
        opacity: hidden ? 0.6 : 1,
        transition: "background 120ms",
      }}
    >
      {hidden && hiddenTag && (
        <span style={{
          position: "absolute", top: -8, left: 8,
          fontSize: 8.5, fontWeight: 800, color: "var(--nw-warn-strong)",
          background: "white", border: "1px solid rgba(245,158,11,0.45)",
          borderRadius: 100, padding: "1px 7px", letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}>
          {hiddenTag}
        </span>
      )}
      <div style={{ textDecoration: hidden ? "line-through" : "none" }}>{children}</div>
      {showActions && (
        <div style={{
          position: "absolute", top: -10, right: 6, zIndex: 2,
          display: "flex", gap: 5,
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
      )}
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
function InlineEditor({ target, cv, t, onClose, onSaved, candidateId }: {
  target: EditTarget
  cv: ParsedCv
  t: typeof copy["fr"]
  onClose: () => void
  onSaved: (cv: ParsedCv) => void
  candidateId: string
}) {
  // Un bloc NEUF est ajouté au brouillon seulement, jamais au CV : refermer
  // sans enregistrer ne doit pas laisser une brique vide dans la fiche.
  const [draft, setDraft] = useState<ParsedCv>(() => {
    const base: ParsedCv = {
      ...cv,
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
      const res = await fetch(`/api/candidates/${candidateId}/parsed-cv`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: draft.summary ?? null,
          experience: draft.experience ?? [],
          education: draft.education ?? [],
          other_sections: draft.other_sections ?? [],
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) { setError(t.saveFailed); return }
      onSaved(data.parsed_cv as ParsedCv)
    } catch {
      setError(t.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  const title =
    target.kind === "summary" ? t.editTitleSummary
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
