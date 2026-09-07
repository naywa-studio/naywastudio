"use client"

/**
 * MissionApplyForm — panneau « Formulaire » de la fiche mission (4e section
 * du carrousel, entre Mission et Candidats).
 *
 * 4 blocs : le lien public à partager · l'état (actif/fermé) · la
 * personnalisation des champs optionnels (lib/apply-form-fields.ts) ·
 * l'aperçu en lecture seule de ce que voit le candidat, qui reflète en
 * direct la sélection de champs (avant même d'avoir cliqué Enregistrer —
 * plus utile qu'un aperçu figé sur le dernier état sauvegardé).
 *
 * Ne fait AUCUNE requête pour le lien ni le nombre de candidatures — les
 * deux sont déjà en mémoire dans la page (job.apply_token, comptage des
 * matchs source='applied'). Seule la sauvegarde des champs personnalisés
 * fait un PATCH /api/jobs/[id].
 */

import { useEffect, useState, type CSSProperties } from "react"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import { APPLY_FORM_FIELD_CATALOG, type ApplyFormFieldKey } from "@/lib/apply-form-fields"
import type { Job } from "@/lib/database.types"

interface Props {
  job: Job
  applicantsCount: number
  isReadOnly: boolean
  onViewApplicants: () => void
  onJobUpdate: (patch: Partial<Job>) => void
}

const copy = {
  fr: {
    linkTitle: "Lien de candidature",
    linkHint: "Partagez ce lien sur une annonce ou votre site carrière — les candidatures arrivent directement dans cette mission.",
    copy: "Copier",
    copied: "Copié",
    open: "Ouvrir",
    statusActive: "Formulaire actif",
    statusClosed: "Formulaire fermé",
    statusActiveHint: "La mission est ouverte : ce lien accepte les candidatures.",
    statusClosedHint: "La mission n'est pas ouverte — ce lien ne reçoit plus de candidature tant qu'elle n'est pas repassée en « Ouverte ». C'est le seul contrôle d'accès : le lien lui-même ne change jamais.",
    statusSelectLabel: "Statut de la mission",
    statusSaved: "Enregistré",
    statusDraft: "Brouillon", statusOpen: "Ouverte", statusFilled: "Pourvue", statusArchived: "Archivée",
    fieldsTitle: "Personnaliser le formulaire",
    fieldsHint: "Prénom, nom, email et CV sont toujours demandés. Ajoutez les champs utiles à cette mission — une fois ajouté, un champ devient obligatoire pour le candidat.",
    save: "Enregistrer",
    saved: "Enregistré",
    previewTitle: "Aperçu — ce que voit le candidat",
    previewRequired: "obligatoire",
    previewCv: "CV (PDF)",
    previewConsent: "J'accepte que mon profil soit conservé pour de futures opportunités",
    applicantsCount: (n: number) => n === 0 ? "Aucune candidature reçue via ce lien pour l'instant" : n === 1 ? "1 candidature reçue via ce lien" : `${n} candidatures reçues via ce lien`,
    viewApplicants: "Voir les candidatures →",
    roTitle: "Lecture seule — souscrivez pour reprendre la main",
  },
  en: {
    linkTitle: "Application link",
    linkHint: "Share this link on a job ad or your careers page — applications land directly in this mission.",
    copy: "Copy",
    copied: "Copied",
    open: "Open",
    statusActive: "Form active",
    statusClosed: "Form closed",
    statusActiveHint: "The mission is open: this link accepts applications.",
    statusClosedHint: "The mission isn't open — this link stops receiving applications until it's set back to \"Open\". That's the only access control: the link itself never changes.",
    statusSelectLabel: "Mission status",
    statusSaved: "Saved",
    statusDraft: "Draft", statusOpen: "Open", statusFilled: "Filled", statusArchived: "Archived",
    fieldsTitle: "Customize the form",
    fieldsHint: "First name, last name, email and CV are always asked. Add the fields useful for this mission — once added, a field becomes mandatory for the candidate.",
    save: "Save",
    saved: "Saved",
    previewTitle: "Preview — what the candidate sees",
    previewRequired: "required",
    previewCv: "CV (PDF)",
    previewConsent: "I agree that my profile may be kept for future opportunities",
    applicantsCount: (n: number) => n === 0 ? "No application received via this link yet" : n === 1 ? "1 application received via this link" : `${n} applications received via this link`,
    viewApplicants: "View applications →",
    roTitle: "Read-only — subscribe to regain control",
  },
}

const card: CSSProperties = {
  background: "white", borderRadius: 16, border: "1px solid var(--nw-border-soft)", padding: 18,
}

const sectionTitle: CSSProperties = {
  margin: "0 0 4px", fontSize: 13.5, fontWeight: 800, color: "var(--nw-text)",
}

const sectionHint: CSSProperties = {
  margin: "0 0 14px", fontSize: 12.5, color: "var(--nw-text-muted)", lineHeight: 1.55,
}

const pillBase: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "2px 7px", borderRadius: 100, fontSize: 10.5, fontWeight: 700,
  letterSpacing: "0.05em", textTransform: "uppercase",
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  )
}

function OpenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6M10 14 21 3" />
    </svg>
  )
}

export default function MissionApplyForm({ job, applicantsCount, isReadOnly, onViewApplicants, onJobUpdate }: Props) {
  const { lang } = useLanguage()
  const t = copy[lang]

  // window.location.origin n'existe pas au prérendu — récupéré après montage
  // pour ne pas casser l'hydratation (jamais lu pendant le render).
  const [origin, setOrigin] = useState("")
  useEffect(() => {
    // Appel enveloppé (pas un setState direct au 1er niveau de l'effet) —
    // react-hooks/set-state-in-effect (React Compiler) refuse sinon, même
    // motif déjà rencontré ailleurs dans ce produit.
    void (async () => { setOrigin(window.location.origin) })()
  }, [])
  const link = origin ? `${origin}/apply/${job.apply_token}` : ""

  const [copied, setCopied] = useState(false)
  const doCopy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard indisponible (contexte non sécurisé) — pas de crash */ }
  }

  const [selectedFields, setSelectedFields] = useState<Set<ApplyFormFieldKey>>(
    () => new Set((job.apply_form_fields ?? []) as ApplyFormFieldKey[]),
  )
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")

  const toggleField = (key: ApplyFormFieldKey) => {
    if (isReadOnly) return
    setSaveStatus("idle")
    setSelectedFields((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const saveFields = async () => {
    if (isReadOnly || saveStatus === "saving") return
    setSaveStatus("saving")
    const nextFields = Array.from(selectedFields)
    const res = await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apply_form_fields: nextFields }),
    }).catch(() => null)
    if (!res || !res.ok) {
      setSaveStatus("error")
      return
    }
    onJobUpdate({ apply_form_fields: nextFields })
    setSaveStatus("saved")
    window.setTimeout(() => setSaveStatus("idle"), 2000)
  }

  const isOpen = job.status === "open"
  const previewFields = APPLY_FORM_FIELD_CATALOG.filter((f) => selectedFields.has(f.key))

  const [statusSaving, setStatusSaving] = useState(false)
  const [statusSaved, setStatusSaved] = useState(false)
  const changeStatus = async (next: Job["status"]) => {
    if (isReadOnly || next === job.status) return
    setStatusSaving(true)
    const res = await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    }).catch(() => null)
    setStatusSaving(false)
    if (!res || !res.ok) return
    onJobUpdate({ status: next })
    setStatusSaved(true)
    window.setTimeout(() => setStatusSaved(false), 2000)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Lien public */}
      <section style={card}>
        <h3 style={sectionTitle}>{t.linkTitle}</h3>
        <p style={sectionHint}>{t.linkHint}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            readOnly value={link} placeholder="…"
            onFocus={(e) => e.currentTarget.select()}
            style={{
              flex: "1 1 260px", minWidth: 0, boxSizing: "border-box",
              padding: "9px 12px", fontSize: 12.5, fontFamily: "var(--nw-font-mono)",
              color: "var(--nw-text)", background: "var(--nw-surface-muted)",
              border: "1px solid var(--nw-border-soft)", borderRadius: 9,
            }}
          />
          <button
            type="button" onClick={doCopy} disabled={!link}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 12.5, fontWeight: 700, color: copied ? "var(--nw-success)" : "var(--nw-text-body)",
              background: "white", border: "1px solid var(--nw-border-soft)", borderRadius: 9,
              padding: "8px 13px", cursor: link ? "pointer" : "default", fontFamily: "inherit", whiteSpace: "nowrap",
            }}
          >
            <CopyIcon />{copied ? t.copied : t.copy}
          </button>
          {link && (
            <a
              href={link} target="_blank" rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 12.5, fontWeight: 700, color: "var(--nw-primary)",
                background: "var(--nw-primary-50)", border: "1px solid var(--nw-border-soft)", borderRadius: 9,
                padding: "8px 13px", textDecoration: "none", whiteSpace: "nowrap",
              }}
            >
              <OpenIcon />{t.open}
            </a>
          )}
        </div>
      </section>

      {/* État */}
      <section style={card}>
        {isOpen ? (
          <span style={{ ...pillBase, color: "var(--nw-success)", background: "var(--nw-success-bg)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--nw-success)" }} />
            {t.statusActive}
          </span>
        ) : (
          <span style={{ ...pillBase, color: "var(--nw-text-muted)", background: "var(--nw-neutral-100)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--nw-text-muted)" }} />
            {t.statusClosed}
          </span>
        )}
        <p style={{ ...sectionHint, margin: "8px 0 0" }}>
          {isOpen ? t.statusActiveHint : t.statusClosedHint}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--nw-text-body)" }} htmlFor="mission-status">
            {t.statusSelectLabel}
          </label>
          <select
            id="mission-status" value={job.status} disabled={isReadOnly || statusSaving}
            onChange={(e) => void changeStatus(e.target.value as Job["status"])}
            style={{
              fontSize: 12.5, fontWeight: 600, color: "var(--nw-text)", fontFamily: "inherit",
              background: "white", border: "1px solid var(--nw-border-soft)", borderRadius: 8,
              padding: "6px 10px", cursor: isReadOnly ? "not-allowed" : "pointer",
            }}
          >
            <option value="draft">{t.statusDraft}</option>
            <option value="open">{t.statusOpen}</option>
            <option value="filled">{t.statusFilled}</option>
            <option value="archived">{t.statusArchived}</option>
          </select>
          {statusSaved && <span style={{ fontSize: 12, fontWeight: 700, color: "var(--nw-success)" }}>{t.statusSaved} ✓</span>}
        </div>
      </section>

      {/* Personnalisation */}
      <section style={card}>
        <h3 style={sectionTitle}>{t.fieldsTitle}</h3>
        <p style={sectionHint}>{t.fieldsHint}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {APPLY_FORM_FIELD_CATALOG.map((f) => (
            <label
              key={f.key}
              style={{
                display: "flex", alignItems: "center", gap: 9,
                cursor: isReadOnly ? "default" : "pointer", fontSize: 13, color: "var(--nw-text-body)",
              }}
            >
              <input
                type="checkbox" checked={selectedFields.has(f.key)} disabled={isReadOnly}
                onChange={() => toggleField(f.key)}
              />
              {f.label[lang]}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button" onClick={saveFields} disabled={isReadOnly || saveStatus === "saving"}
            title={isReadOnly ? t.roTitle : undefined}
            style={{
              fontSize: 12.5, fontWeight: 700, color: "white",
              background: isReadOnly ? "var(--nw-primary-200)" : "var(--nw-primary)",
              border: "none", borderRadius: 9, padding: "8px 16px", fontFamily: "inherit",
              cursor: isReadOnly ? "not-allowed" : "pointer", opacity: saveStatus === "saving" ? 0.7 : 1,
            }}
          >
            {saveStatus === "saving" ? "…" : t.save}
          </button>
          {saveStatus === "saved" && <span style={{ fontSize: 12, fontWeight: 700, color: "var(--nw-success)" }}>{t.saved} ✓</span>}
          {saveStatus === "error" && <span style={{ fontSize: 12, fontWeight: 700, color: "var(--nw-danger-strong)" }}>—</span>}
        </div>
      </section>

      {/* Aperçu */}
      <section style={card}>
        <h3 style={sectionTitle}>{t.previewTitle}</h3>
        <div style={{
          display: "flex", flexDirection: "column", gap: 10, marginTop: 10,
          padding: 14, borderRadius: 12, background: "var(--nw-surface-muted)",
          border: "1px dashed var(--nw-border)", pointerEvents: "none",
        }}>
          <PreviewField label={lang === "fr" ? "Prénom" : "First name"} required />
          <PreviewField label={lang === "fr" ? "Nom" : "Last name"} required />
          <PreviewField label="Email" required />
          {previewFields.map((f) => (
            <PreviewField key={f.key} label={f.formLabel[lang]} required multiline={f.inputType === "textarea"} />
          ))}
          <PreviewField label={t.previewCv} required />
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--nw-text-muted)" }}>
            <span style={{ width: 14, height: 14, borderRadius: 4, border: "1px solid var(--nw-border)", flexShrink: 0 }} />
            {t.previewConsent}
          </div>
        </div>
      </section>

      {/* Candidatures reçues */}
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--nw-text-muted)" }}>
        {t.applicantsCount(applicantsCount)}
        {" — "}
        <button
          type="button" onClick={onViewApplicants}
          style={{
            border: "none", background: "transparent", padding: 0, cursor: "pointer",
            fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, color: "var(--nw-primary)",
          }}
        >
          {t.viewApplicants}
        </button>
      </p>
    </div>
  )
}

function PreviewField({ label, required, multiline = false }: { label: string; required: boolean; multiline?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--nw-text-body)", marginBottom: 4 }}>
        {label}{required && <span style={{ color: "var(--nw-danger-strong)" }}> *</span>}
      </div>
      <div style={{
        height: multiline ? 44 : 30, borderRadius: 7,
        background: "white", border: "1px solid var(--nw-border-soft)",
      }} />
    </div>
  )
}
