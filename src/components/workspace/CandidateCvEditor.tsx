"use client"

/**
 * Édition manuelle de la fiche candidat — la SOURCE DE VÉRITÉ.
 *
 * Ce que le sourceur corrige ici vaut partout : le matching le relit, et tous
 * les CV anonymisés de toutes les missions en héritent. C'est la différence
 * avec le panneau de la fiche match, qui ne fait que choisir ce qu'un client
 * donné verra du document.
 *
 * Deux principes de sûreté :
 *
 *  1. RIEN N'EST PERDU EN SILENCE. Une date mal écrite est signalée à l'écran
 *     avant l'enregistrement — le serveur, lui, la refuserait sans rien dire,
 *     et le sourceur croirait sa correction passée.
 *  2. L'ORIGINAL RESTE À PORTÉE. Le CV produit par Nora s'affiche à côté d'un
 *     clic pendant toute l'édition, et un bouton y ramène tant qu'on n'a pas
 *     re-parsé. Corriger ne doit jamais donner l'impression de casser.
 */

import { useCallback, useMemo, useState } from "react"
import { getSupabase } from "@/lib/supabase"
import type {
  ParsedCv, ParsedExperience, ParsedEducation, ParsedSection,
} from "@/lib/database.types"
import { useLanguage } from "@/lib/i18n/LanguageContext"

/* Bornes alignées sur l'allowlist serveur (api/candidates/[id]/parsed-cv).
 * Les répéter ici n'est pas de la duplication décorative : sans elles, l'UI
 * laisserait saisir un texte que le serveur tronquerait en silence. */
const MAX_TEXT = 400
const MAX_DESC = 2_000
const MAX_SUMMARY = 2_000
const MAX_EXPERIENCES = 40
const MAX_EDUCATION = 20
const MAX_SECTIONS = 12
const MAX_SECTION_TITLE = 80
const MAX_SECTION_CONTENT = 800
const MAX_LIST = 60

const DATE_RE = /^\d{4}(-(0[1-9]|1[0-2]))?$/

const copy = {
  fr: {
    editing: "Modification de la fiche",
    intro: "Vos corrections remplacent ce que Nora a lu. Elles valent pour le matching et pour tous les CV anonymisés.",
    showOriginal: "Voir l'original",
    hideOriginal: "Masquer l'original",
    originalTitle: "Version d'origine (Nora)",
    originalLoading: "Chargement…",
    originalNone: "Aucune version d'origine conservée : cette fiche n'a jamais été modifiée à la main.",
    identity: "Identité",
    fullName: "Nom complet",
    email: "Email",
    phone: "Téléphone",
    location: "Localisation",
    currentTitle: "Intitulé actuel",
    currentCompany: "Entreprise actuelle",
    summary: "Résumé",
    summaryPlaceholder: "Résumé du profil…",
    experience: "Parcours",
    education: "Formation",
    skills: "Compétences techniques",
    qualities: "Qualités",
    languages: "Langues",
    certifications: "Certifications",
    sections: "Autres rubriques",
    jobTitle: "Intitulé du poste",
    company: "Entreprise",
    start: "Début",
    end: "Fin",
    ongoing: "Poste en cours",
    place: "Lieu",
    description: "Description",
    degree: "Diplôme",
    school: "École",
    field: "Spécialité",
    sectionTitle: "Titre de la rubrique",
    sectionContent: "Contenu",
    addExperience: "+ Ajouter une expérience",
    addEducation: "+ Ajouter une formation",
    addSection: "+ Ajouter une rubrique",
    removeTitle: "Supprimer cette brique",
    addItem: "Ajouter…",
    removeItem: (v: string) => `Retirer ${v}`,
    dateHint: "Format attendu : AAAA ou AAAA-MM",
    dateInvalid: "Date ignorée si elle n'est pas au format AAAA ou AAAA-MM.",
    save: "Enregistrer",
    saving: "Enregistrement…",
    cancel: "Annuler",
    revert: "Revenir à la version de Nora",
    revertConfirm: "Vos corrections seront remplacées par la version d'origine produite par Nora. Continuer ?",
    saveFailed: "L'enregistrement a échoué. Vos modifications sont toujours à l'écran.",
    capReached: (n: number) => `Maximum ${n} atteint.`,
    fixDates: "Corrigez les dates signalées avant d'enregistrer, ou videz-les.",
  },
  en: {
    editing: "Editing the profile",
    intro: "Your corrections replace what Nora read. They apply to matching and to every anonymized CV.",
    showOriginal: "Show original",
    hideOriginal: "Hide original",
    originalTitle: "Original version (Nora)",
    originalLoading: "Loading…",
    originalNone: "No original kept: this profile has never been edited by hand.",
    identity: "Identity",
    fullName: "Full name",
    email: "Email",
    phone: "Phone",
    location: "Location",
    currentTitle: "Current job title",
    currentCompany: "Current company",
    summary: "Summary",
    summaryPlaceholder: "Profile summary…",
    experience: "Experience",
    education: "Education",
    skills: "Technical skills",
    qualities: "Soft skills",
    languages: "Languages",
    certifications: "Certifications",
    sections: "Other sections",
    jobTitle: "Job title",
    company: "Company",
    start: "Start",
    end: "End",
    ongoing: "Current role",
    place: "Location",
    description: "Description",
    degree: "Degree",
    school: "School",
    field: "Field",
    sectionTitle: "Section title",
    sectionContent: "Content",
    addExperience: "+ Add an experience",
    addEducation: "+ Add an education entry",
    addSection: "+ Add a section",
    removeTitle: "Remove this block",
    addItem: "Add…",
    removeItem: (v: string) => `Remove ${v}`,
    dateHint: "Expected format: YYYY or YYYY-MM",
    dateInvalid: "Date is dropped unless written as YYYY or YYYY-MM.",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    revert: "Back to Nora's version",
    revertConfirm: "Your corrections will be replaced by the original version produced by Nora. Continue?",
    saveFailed: "Saving failed. Your changes are still on screen.",
    capReached: (n: number) => `Maximum of ${n} reached.`,
    fixDates: "Fix the flagged dates before saving, or clear them.",
  },
}

const isBadDate = (v: string | null | undefined): boolean =>
  typeof v === "string" && v.trim().length > 0 && !DATE_RE.test(v.trim())

export interface CandidateCvEditorProps {
  candidateId: string
  cv: ParsedCv | null
  /** Reçoit le CV enregistré — le parent rafraîchit sa fiche avec. */
  onSaved: (cv: ParsedCv, revertedToOriginal: boolean) => void
  onCancel: () => void
  /** Une version d'origine existe → le retour arrière est proposé. */
  hasOriginal: boolean
}

export default function CandidateCvEditor({
  candidateId, cv, onSaved, onCancel, hasOriginal,
}: CandidateCvEditorProps) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const sb = useMemo(() => getSupabase(), [])

  const [draft, setDraft] = useState<ParsedCv>(() => ({
    ...(cv ?? {}),
    experience: [...(cv?.experience ?? [])],
    education: [...(cv?.education ?? [])],
    other_sections: [...(cv?.other_sections ?? [])],
    skills: [...(cv?.skills ?? [])],
    qualities: [...(cv?.qualities ?? [])],
    languages: [...(cv?.languages ?? [])],
    certifications: [...(cv?.certifications ?? [])],
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // L'original est un second CV complet, aussi lourd que le texte brut : il
  // reste hors des colonnes chargées à l'ouverture de fiche et n'arrive qu'au
  // clic, comme le texte intégral.
  const [showOriginal, setShowOriginal] = useState(false)
  const [original, setOriginal] = useState<ParsedCv | null | "loading">(null)

  const toggleOriginal = useCallback(async () => {
    setShowOriginal((v) => !v)
    if (original !== null) return
    setOriginal("loading")
    const { data } = await sb
      .from("candidates").select("parsed_cv_original").eq("id", candidateId).single()
    setOriginal(((data as { parsed_cv_original: ParsedCv | null } | null)?.parsed_cv_original) ?? null)
  }, [original, candidateId, sb])

  const patch = (fields: Partial<ParsedCv>) => setDraft((d) => ({ ...d, ...fields }))

  const badDates = useMemo(() => {
    const exp = (draft.experience ?? []).some((e) => isBadDate(e.start) || isBadDate(e.end))
    const edu = (draft.education ?? []).some((e) => isBadDate(e.start) || isBadDate(e.end))
    return exp || edu
  }, [draft])

  const save = async () => {
    if (saving || badDates) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/candidates/${candidateId}/parsed-cv`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: draft.full_name ?? null,
          email: draft.email ?? null,
          phone: draft.phone ?? null,
          location: draft.location ?? null,
          current_title: draft.current_title ?? null,
          current_company: draft.current_company ?? null,
          summary: draft.summary ?? null,
          skills: draft.skills ?? [],
          qualities: draft.qualities ?? [],
          languages: draft.languages ?? [],
          certifications: draft.certifications ?? [],
          experience: draft.experience ?? [],
          education: draft.education ?? [],
          other_sections: draft.other_sections ?? [],
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) { setError(t.saveFailed); return }
      onSaved(data.parsed_cv as ParsedCv, false)
    } catch {
      setError(t.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  const revert = async () => {
    if (saving) return
    if (!window.confirm(t.revertConfirm)) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/candidates/${candidateId}/parsed-cv`, { method: "DELETE" })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) { setError(t.saveFailed); return }
      onSaved(data.parsed_cv as ParsedCv, true)
    } catch {
      setError(t.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  /* ── Listes de briques ─────────────────────────────────────────────── */

  const updateExp = (i: number, fields: Partial<ParsedExperience>) =>
    setDraft((d) => ({
      ...d,
      experience: (d.experience ?? []).map((e, j) => (j === i ? { ...e, ...fields } : e)),
    }))
  const removeExp = (i: number) =>
    setDraft((d) => ({ ...d, experience: (d.experience ?? []).filter((_, j) => j !== i) }))
  const addExp = () =>
    setDraft((d) => (d.experience ?? []).length >= MAX_EXPERIENCES ? d : ({
      ...d, experience: [...(d.experience ?? []), { title: "", company: "" }],
    }))

  const updateEdu = (i: number, fields: Partial<ParsedEducation>) =>
    setDraft((d) => ({
      ...d,
      education: (d.education ?? []).map((e, j) => (j === i ? { ...e, ...fields } : e)),
    }))
  const removeEdu = (i: number) =>
    setDraft((d) => ({ ...d, education: (d.education ?? []).filter((_, j) => j !== i) }))
  const addEdu = () =>
    setDraft((d) => (d.education ?? []).length >= MAX_EDUCATION ? d : ({
      ...d, education: [...(d.education ?? []), { degree: "", school: "" }],
    }))

  const updateSec = (i: number, fields: Partial<ParsedSection>) =>
    setDraft((d) => ({
      ...d,
      other_sections: (d.other_sections ?? []).map((s, j) => (j === i ? { ...s, ...fields } : s)),
    }))
  const removeSec = (i: number) =>
    setDraft((d) => ({ ...d, other_sections: (d.other_sections ?? []).filter((_, j) => j !== i) }))
  const addSec = () =>
    setDraft((d) => (d.other_sections ?? []).length >= MAX_SECTIONS ? d : ({
      ...d, other_sections: [...(d.other_sections ?? []), { title: "", content: "" }],
    }))

  return (
    <section style={{
      background: "white", borderRadius: 16,
      border: "1px solid rgba(124,99,200,0.35)",
      boxShadow: "0 0 0 3px rgba(124,99,200,0.06)",
      overflow: "hidden",
    }}>
      {/* En-tête collant : le formulaire est long, les actions doivent rester
          accessibles sans remonter. */}
      <div style={{
        position: "sticky", top: 0, zIndex: 5,
        padding: "14px 20px", background: "white",
        borderBottom: "1px solid var(--nw-border-soft)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{
            margin: 0, fontSize: 12, fontWeight: 700, color: "var(--nw-primary)",
            letterSpacing: "0.08em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
          }}>
            {t.editing}
          </h2>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--nw-text-muted)", lineHeight: 1.5 }}>
            {t.intro}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={toggleOriginal} style={ghostBtn}>
            {showOriginal ? t.hideOriginal : t.showOriginal}
          </button>
          {hasOriginal && (
            <button type="button" onClick={revert} disabled={saving} style={ghostBtn}>
              {t.revert}
            </button>
          )}
          <button type="button" onClick={onCancel} disabled={saving} style={ghostBtn}>
            {t.cancel}
          </button>
          <button
            type="button" onClick={save} disabled={saving || badDates}
            title={badDates ? t.fixDates : undefined}
            style={{
              ...primaryBtn,
              opacity: saving || badDates ? 0.55 : 1,
              cursor: saving || badDates ? "not-allowed" : "pointer",
            }}
          >
            {saving ? t.saving : t.save}
          </button>
        </div>
      </div>

      {(error || badDates) && (
        <p style={{
          margin: 0, padding: "10px 20px", fontSize: 12.5,
          background: error ? "#FEF2F2" : "rgba(245,158,11,0.08)",
          color: error ? "var(--nw-danger-strong)" : "var(--nw-warn-strong)",
          borderBottom: "1px solid var(--nw-border-soft)",
        }}>
          {error ?? t.fixDates}
        </p>
      )}

      {showOriginal && (
        <div style={{
          padding: "14px 20px", background: "var(--nw-surface-muted)",
          borderBottom: "1px solid var(--nw-border-soft)",
        }}>
          <p style={{
            margin: "0 0 8px", fontSize: 10.5, fontWeight: 700, color: "var(--nw-text-muted)",
            letterSpacing: "0.08em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
          }}>
            {t.originalTitle}
          </p>
          {original === "loading" ? (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--nw-text-muted)" }}>{t.originalLoading}</p>
          ) : original === null ? (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--nw-text-muted)" }}>{t.originalNone}</p>
          ) : (
            <OriginalView cv={original} t={t} />
          )}
        </div>
      )}

      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 22 }}>
        <Group title={t.identity}>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <Field label={t.fullName} value={draft.full_name ?? ""} onChange={(v) => patch({ full_name: v })} />
            <Field label={t.email} value={draft.email ?? ""} onChange={(v) => patch({ email: v })} />
            <Field label={t.phone} value={draft.phone ?? ""} onChange={(v) => patch({ phone: v })} />
            <Field label={t.location} value={draft.location ?? ""} onChange={(v) => patch({ location: v })} />
            <Field label={t.currentTitle} value={draft.current_title ?? ""} onChange={(v) => patch({ current_title: v })} />
            <Field label={t.currentCompany} value={draft.current_company ?? ""} onChange={(v) => patch({ current_company: v })} />
          </div>
        </Group>

        <Group title={t.summary}>
          <TextArea
            value={draft.summary ?? ""}
            onChange={(v) => patch({ summary: v })}
            placeholder={t.summaryPlaceholder}
            rows={4}
            max={MAX_SUMMARY}
          />
        </Group>

        <Group
          title={t.experience}
          action={
            <AddButton
              label={t.addExperience}
              onClick={addExp}
              disabled={(draft.experience ?? []).length >= MAX_EXPERIENCES}
              title={(draft.experience ?? []).length >= MAX_EXPERIENCES ? t.capReached(MAX_EXPERIENCES) : undefined}
            />
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(draft.experience ?? []).map((e, i) => (
              <Brick key={i} onRemove={() => removeExp(i)} removeTitle={t.removeTitle}>
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                  <Field label={t.jobTitle} value={e.title ?? ""} onChange={(v) => updateExp(i, { title: v })} />
                  <Field label={t.company} value={e.company ?? ""} onChange={(v) => updateExp(i, { company: v })} />
                  <Field
                    label={t.start} value={e.start ?? ""} placeholder="AAAA-MM"
                    hint={t.dateHint} invalid={isBadDate(e.start)} invalidHint={t.dateInvalid}
                    onChange={(v) => updateExp(i, { start: v })}
                  />
                  <Field
                    label={t.end} value={e.end ?? ""} placeholder="AAAA-MM"
                    hint={t.dateHint} invalid={isBadDate(e.end)} invalidHint={t.dateInvalid}
                    disabled={e.end === null}
                    onChange={(v) => updateExp(i, { end: v })}
                  />
                  <Field label={t.place} value={e.location ?? ""} onChange={(v) => updateExp(i, { location: v })} />
                </div>
                {/* `end: null` = poste en cours, distinct d'une fin inconnue.
                    Sans cette case, la nuance disparaîtrait dès la première
                    retouche et un poste terminé passerait pour l'actuel. */}
                <label style={checkboxRow}>
                  <input
                    type="checkbox"
                    checked={e.end === null}
                    onChange={(ev) => updateExp(i, { end: ev.target.checked ? null : undefined })}
                  />
                  {t.ongoing}
                </label>
                <TextArea
                  label={t.description}
                  value={e.description ?? ""}
                  onChange={(v) => updateExp(i, { description: v })}
                  rows={3}
                  max={MAX_DESC}
                />
              </Brick>
            ))}
          </div>
        </Group>

        <Group
          title={t.education}
          action={
            <AddButton
              label={t.addEducation}
              onClick={addEdu}
              disabled={(draft.education ?? []).length >= MAX_EDUCATION}
              title={(draft.education ?? []).length >= MAX_EDUCATION ? t.capReached(MAX_EDUCATION) : undefined}
            />
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(draft.education ?? []).map((ed, i) => (
              <Brick key={i} onRemove={() => removeEdu(i)} removeTitle={t.removeTitle}>
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                  <Field label={t.degree} value={ed.degree ?? ""} onChange={(v) => updateEdu(i, { degree: v })} />
                  <Field label={t.school} value={ed.school ?? ""} onChange={(v) => updateEdu(i, { school: v })} />
                  <Field label={t.field} value={ed.field ?? ""} onChange={(v) => updateEdu(i, { field: v })} />
                  <Field
                    label={t.start} value={ed.start ?? ""} placeholder="AAAA"
                    hint={t.dateHint} invalid={isBadDate(ed.start)} invalidHint={t.dateInvalid}
                    onChange={(v) => updateEdu(i, { start: v })}
                  />
                  <Field
                    label={t.end} value={ed.end ?? ""} placeholder="AAAA"
                    hint={t.dateHint} invalid={isBadDate(ed.end)} invalidHint={t.dateInvalid}
                    onChange={(v) => updateEdu(i, { end: v })}
                  />
                </div>
              </Brick>
            ))}
          </div>
        </Group>

        <Group title={t.skills}>
          <ChipList value={draft.skills ?? []} onChange={(v) => patch({ skills: v })} t={t} />
        </Group>
        <Group title={t.qualities}>
          <ChipList value={draft.qualities ?? []} onChange={(v) => patch({ qualities: v })} t={t} cap={20} />
        </Group>
        <Group title={t.languages}>
          <ChipList value={draft.languages ?? []} onChange={(v) => patch({ languages: v })} t={t} cap={20} />
        </Group>
        <Group title={t.certifications}>
          <ChipList value={draft.certifications ?? []} onChange={(v) => patch({ certifications: v })} t={t} cap={30} />
        </Group>

        <Group
          title={t.sections}
          action={
            <AddButton
              label={t.addSection}
              onClick={addSec}
              disabled={(draft.other_sections ?? []).length >= MAX_SECTIONS}
              title={(draft.other_sections ?? []).length >= MAX_SECTIONS ? t.capReached(MAX_SECTIONS) : undefined}
            />
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(draft.other_sections ?? []).map((s, i) => (
              <Brick key={i} onRemove={() => removeSec(i)} removeTitle={t.removeTitle}>
                <Field
                  label={t.sectionTitle} value={s.title ?? ""} max={MAX_SECTION_TITLE}
                  onChange={(v) => updateSec(i, { title: v })}
                />
                <TextArea
                  label={t.sectionContent}
                  value={s.content ?? ""}
                  onChange={(v) => updateSec(i, { content: v })}
                  rows={3}
                  max={MAX_SECTION_CONTENT}
                />
              </Brick>
            ))}
          </div>
        </Group>
      </div>
    </section>
  )
}

/* ─── Styles partagés ──────────────────────────────────────────────── */

const ghostBtn: React.CSSProperties = {
  fontFamily: "inherit", fontSize: 12, fontWeight: 600,
  color: "var(--nw-text-secondary)", background: "transparent",
  border: "1px solid var(--nw-border)", borderRadius: 8,
  padding: "7px 12px", cursor: "pointer",
}

const primaryBtn: React.CSSProperties = {
  fontFamily: "inherit", fontSize: 12, fontWeight: 700,
  color: "white", background: "var(--nw-primary)",
  border: "1px solid rgba(124,99,200,0.4)", borderRadius: 8,
  padding: "7px 14px", cursor: "pointer",
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  fontFamily: "inherit", fontSize: 13, color: "var(--nw-text)",
  padding: "8px 10px", background: "white",
  border: "1px solid var(--nw-border)", borderRadius: 8,
  outline: "none",
}

const labelStyle: React.CSSProperties = {
  display: "block", marginBottom: 4,
  fontSize: 10.5, fontWeight: 700, color: "var(--nw-text-muted)",
  letterSpacing: "0.05em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
}

const checkboxRow: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 7,
  marginTop: 8, fontSize: 12.5, color: "var(--nw-text-body)", cursor: "pointer",
}

/* ─── Sous-composants ──────────────────────────────────────────────── */

function Group({ title, action, children }: {
  title: string; action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, marginBottom: 9,
      }}>
        <h3 style={{
          margin: 0, fontSize: 11, fontWeight: 700, color: "var(--nw-text-muted)",
          letterSpacing: "0.08em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
        }}>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  )
}

/** Une brique du CV : son contenu + le « − » qui la retire. */
function Brick({ children, onRemove, removeTitle }: {
  children: React.ReactNode; onRemove: () => void; removeTitle: string
}) {
  return (
    <div style={{
      position: "relative", padding: "12px 40px 12px 12px",
      background: "var(--nw-surface-muted)",
      border: "1px solid var(--nw-border-soft)", borderRadius: 10,
    }}>
      <button
        type="button" onClick={onRemove} title={removeTitle} aria-label={removeTitle}
        style={{
          position: "absolute", top: 10, right: 10,
          width: 24, height: 24, borderRadius: 7,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          border: "1px solid #FCA5A5", background: "white",
          color: "var(--nw-danger-strong)", cursor: "pointer",
          fontFamily: "inherit", fontSize: 15, fontWeight: 700, lineHeight: 1, padding: 0,
        }}
      >
        −
      </button>
      {children}
    </div>
  )
}

function AddButton({ label, onClick, disabled, title }: {
  label: string; onClick: () => void; disabled?: boolean; title?: string
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} title={title}
      style={{
        fontFamily: "inherit", fontSize: 11.5, fontWeight: 700,
        color: "var(--nw-primary)", background: "transparent",
        border: "1px solid rgba(124,99,200,0.3)", borderRadius: 8,
        padding: "5px 11px", cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  )
}

function Field({
  label, value, onChange, placeholder, hint, invalid, invalidHint, disabled, max = MAX_TEXT,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
  invalid?: boolean
  invalidHint?: string
  disabled?: boolean
  max?: number
}) {
  return (
    <label style={{ display: "block" }}>
      <span style={labelStyle}>{label}</span>
      <input
        type="text"
        value={value}
        maxLength={max}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...inputStyle,
          borderColor: invalid ? "var(--nw-warn)" : "var(--nw-border)",
          background: disabled ? "var(--nw-neutral-100)" : "white",
        }}
      />
      {(invalid || hint) && (
        <span style={{
          display: "block", marginTop: 3, fontSize: 10.5, lineHeight: 1.4,
          color: invalid ? "var(--nw-warn-strong)" : "var(--nw-text-muted)",
        }}>
          {invalid ? invalidHint : hint}
        </span>
      )}
    </label>
  )
}

function TextArea({ label, value, onChange, rows = 3, placeholder, max }: {
  label?: string
  value: string
  onChange: (v: string) => void
  rows?: number
  placeholder?: string
  max?: number
}) {
  return (
    <label style={{ display: "block", marginTop: label ? 8 : 0 }}>
      {label && <span style={labelStyle}>{label}</span>}
      <textarea
        value={value}
        rows={rows}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
      />
    </label>
  )
}

/** Liste de valeurs courtes (compétences, langues…). Chips retirables + saisie
 *  libre. La casse est conservée telle quelle : « AWS » ne doit pas devenir
 *  « aws » sur le CV remis au client. */
function ChipList({ value, onChange, t, cap = MAX_LIST }: {
  value: string[]
  onChange: (next: string[]) => void
  t: typeof copy["fr"]
  cap?: number
}) {
  const [input, setInput] = useState("")
  const add = () => {
    const v = input.trim()
    if (!v || value.length >= cap) { setInput(""); return }
    if (!value.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...value, v.slice(0, MAX_TEXT)])
    setInput("")
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {value.map((v) => (
        <span key={v} style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 12, color: "var(--nw-text-secondary)",
          background: "var(--nw-bg)", border: "1px solid var(--nw-border-soft)",
          padding: "4px 6px 4px 10px", borderRadius: 7,
        }}>
          {v}
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== v))}
            title={t.removeItem(v)}
            aria-label={t.removeItem(v)}
            style={{
              border: "none", background: "transparent", cursor: "pointer",
              color: "var(--nw-text-muted)", fontFamily: "inherit",
              fontSize: 14, lineHeight: 1, padding: "0 2px",
            }}
          >
            −
          </button>
        </span>
      ))}
      {value.length < cap && (
        <input
          type="text"
          value={input}
          placeholder={t.addItem}
          maxLength={MAX_TEXT}
          onChange={(e) => setInput(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add() }
          }}
          style={{ ...inputStyle, width: 150, padding: "5px 9px", fontSize: 12 }}
        />
      )}
    </div>
  )
}

/** Vue lecture seule de la version d'origine — repère pendant l'édition. */
function OriginalView({ cv, t }: { cv: ParsedCv; t: typeof copy["fr"] }) {
  const line = (label: string, v: string | null | undefined) =>
    v ? <p style={{ margin: "0 0 4px", fontSize: 12.5, color: "var(--nw-text-body)" }}>
      <strong style={{ color: "var(--nw-text)" }}>{label} :</strong> {v}
    </p> : null

  return (
    <div style={{ maxHeight: 320, overflow: "auto", paddingRight: 4 }}>
      {line(t.fullName, cv.full_name)}
      {line(t.currentTitle, cv.current_title)}
      {line(t.summary, cv.summary)}
      {(cv.experience ?? []).length > 0 && (
        <>
          <p style={{ margin: "8px 0 4px", ...labelStyle }}>{t.experience}</p>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, color: "var(--nw-text-body)", lineHeight: 1.6 }}>
            {(cv.experience ?? []).map((e, i) => (
              <li key={i}>
                {[e.title, e.company].filter(Boolean).join(" — ")}
                {(!!e.start || e.end !== undefined) && (
                  <span style={{ color: "var(--nw-text-muted)" }}>
                    {" "}· {e.start ?? "?"}{e.end === null ? ` – ${t.ongoing.toLowerCase()}` : e.end ? ` – ${e.end}` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {(cv.other_sections ?? []).length > 0 && (
        <>
          <p style={{ margin: "8px 0 4px", ...labelStyle }}>{t.sections}</p>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, color: "var(--nw-text-body)", lineHeight: 1.6 }}>
            {(cv.other_sections ?? []).map((s, i) => <li key={i}>{s.title}</li>)}
          </ul>
        </>
      )}
    </div>
  )
}
