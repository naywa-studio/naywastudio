"use client"

/**
 * Wizard inline d'onboarding des critères mission (PR-Z).
 *
 * Flow :
 *   1. Au mount : appelle POST /api/jobs/[id]/propose-criteria → Nora
 *      propose 4-5 main + 3-5 bonus depuis le catalogue.
 *   2. Le sourceur arbitre : check/uncheck, promote main↔bonus, drag
 *      n'est pas fait (overkill), juste 2 colonnes Main / Bonus.
 *   3. "Valider et lancer le matching" → PATCH /api/jobs/[id]/criteria
 *      puis callback parent qui déclenche le matching.
 *
 * S'affiche tant que jobs.criteria_locked_at est NULL.
 */

import { useCallback, useEffect, useState } from "react"
import { m } from "framer-motion"
import {
  CRITERION_CATALOG,
  type Criterion,
  type CriterionType,
  MAX_MAIN_CRITERIA,
  MAX_BONUS_CRITERIA,
} from "@/lib/job-criteria-catalog"
import { shortCriterionLabel, typeLabel } from "@/lib/criterion-display"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const copy = {
  fr: {
    proposalFailed: "Échec de la proposition Nora.",
    networkError: "Erreur réseau.",
    stepBadge: "Étape unique · Critères de matching",
    title: "Nora propose, vous validez",
    intro: (
      <>Choisissez les critères qui comptent pour cette mission. Les <strong style={{ color: "#15803d" }}>principaux</strong> pèsent dans le score, les <strong style={{ color: "#7C63C8" }}>bonus</strong> sont affichés mais ne pénalisent pas.</>
    ),
    relaunchNora: "↻ Relancer Nora",
    analyzing: "Nora analyse la mission…",
    mainColumn: "Principaux",
    mainSubtitle: (n: number, max: number) => `comptent dans le score · ${n}/${max}`,
    bonusColumn: "Bonus",
    bonusSubtitle: (n: number, max: number) => `informatifs · ${n}/${max}`,
    selectAtLeastOne: "Sélectionne au moins un critère.",
    needAtLeastOneMain: "Il faut au moins un critère principal.",
    describeCustom: "Décrivez vos critères personnalisés (ou retirez-les).",
    saveFailed: "Sauvegarde échouée.",
    addCriterion: "+ Ajouter un critère",
    cancel: "Annuler",
    saving: "Enregistrement…",
    saveCriteria: "Enregistrer les critères",
    validateCriteria: "Valider les critères",
    addFromCatalog: "Ajouter un critère depuis le catalogue",
    noMainCriteria: "Aucun critère principal",
    noBonus: "Aucun bonus",
    customPlaceholder: "Décrivez le critère (ex : a déjà managé une équipe)",
    addedSuffix: " · ajouté",
    demoteToBonus: "Rétrograder en bonus",
    promoteToMain: "Promouvoir en principal",
    toBonus: "↓ bonus",
    toMain: "↑ principal",
    remove: "Retirer",
    seeLess: "voir moins",
    seeMore: (n: number) => `voir plus (+${n})`,
  },
  en: {
    proposalFailed: "Nora's proposal failed.",
    networkError: "Network error.",
    stepBadge: "Single step · Matching criteria",
    title: "Nora suggests, you confirm",
    intro: (
      <>Choose the criteria that matter for this mission. <strong style={{ color: "#15803d" }}>Main</strong> criteria weigh into the score, <strong style={{ color: "#7C63C8" }}>bonus</strong> ones are shown but don&apos;t penalize.</>
    ),
    relaunchNora: "↻ Re-run Nora",
    analyzing: "Nora is analyzing the mission…",
    mainColumn: "Main",
    mainSubtitle: (n: number, max: number) => `count toward the score · ${n}/${max}`,
    bonusColumn: "Bonus",
    bonusSubtitle: (n: number, max: number) => `informative · ${n}/${max}`,
    selectAtLeastOne: "Select at least one criterion.",
    needAtLeastOneMain: "You need at least one main criterion.",
    describeCustom: "Describe your custom criteria (or remove them).",
    saveFailed: "Save failed.",
    addCriterion: "+ Add a criterion",
    cancel: "Cancel",
    saving: "Saving…",
    saveCriteria: "Save criteria",
    validateCriteria: "Confirm criteria",
    addFromCatalog: "Add a criterion from the catalog",
    noMainCriteria: "No main criterion",
    noBonus: "No bonus",
    customPlaceholder: "Describe the criterion (e.g.: has already managed a team)",
    addedSuffix: " · added",
    demoteToBonus: "Demote to bonus",
    promoteToMain: "Promote to main",
    toBonus: "↓ bonus",
    toMain: "↑ main",
    remove: "Remove",
    seeLess: "see less",
    seeMore: (n: number) => `see more (+${n})`,
  },
}

interface Props {
  jobId: string
  onDone: (criteria: Criterion[]) => void
  /** Si le sourceur a déjà fait une 1ʳᵉ tentative de proposition (re-ouverture
   *  du wizard), on précharge les critères existants au lieu de re-payer
   *  un appel LLM. */
  initialCriteria?: Criterion[] | null
  /** Fourni en mode ÉDITION (re-ouverture depuis "Modifier les critères").
   *  Affiche un bouton "Annuler" pour fermer sans sauver ni relancer le
   *  matching. Absent au 1ᵉʳ onboarding (pas d'échappatoire : il FAUT
   *  configurer les critères avant de matcher). */
  onCancel?: () => void
  /** Rendu compact SANS carte/entête propres — utilisé quand le composant
   *  est embarqué comme étape d'un wizard (modale de création) qui fournit
   *  déjà le cadre et le titre d'étape. */
  embedded?: boolean
  /** Libellé du bouton primaire (défaut selon le mode). */
  submitLabel?: string
}

export function CriteriaOnboarding({ jobId, onDone, initialCriteria, onCancel, embedded, submitLabel }: Props) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const [criteria, setCriteria] = useState<Criterion[]>(initialCriteria ?? [])
  const [loading, setLoading] = useState(!initialCriteria || initialCriteria.length === 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const propose = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}/propose-criteria`, { method: "POST" })
      const data = await res.json().catch(() => ({} as Record<string, unknown>))
      if (!res.ok) {
        setError(String(data?.message ?? data?.error ?? t.proposalFailed))
        setLoading(false)
        return
      }
      setCriteria(Array.isArray(data.criteria) ? data.criteria as Criterion[] : [])
    } catch (e) {
      setError((e as Error).message ?? t.networkError)
    }
    setLoading(false)
  }, [jobId, t])

  useEffect(() => {
    // Lance la proposition LLM uniquement au 1er mount sans critères
    // pré-existants. Pattern fetch-on-mount avec cancelled-guard (règle
    // pureté React 19 / Next 16).
    if (initialCriteria && initialCriteria.length > 0) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/propose-criteria`, { method: "POST" })
        const data = await res.json().catch(() => ({} as Record<string, unknown>))
        if (cancelled) return
        if (!res.ok) {
          setError(String(data?.message ?? data?.error ?? t.proposalFailed))
        } else {
          setCriteria(Array.isArray(data.criteria) ? data.criteria as Criterion[] : [])
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message ?? t.networkError)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  const mainCount  = criteria.filter((c) => c.weight === "main").length
  const bonusCount = criteria.filter((c) => c.weight === "bonus").length

  const toggleWeight = (id: string) => {
    setCriteria((prev) => prev.map((c) => {
      if (c.id !== id) return c
      const next = c.weight === "main" ? "bonus" : "main"
      // Bloque si on dépasse le cap du côté cible.
      if (next === "main" && mainCount >= MAX_MAIN_CRITERIA) return c
      if (next === "bonus" && bonusCount >= MAX_BONUS_CRITERIA) return c
      return { ...c, weight: next }
    }))
  }

  const remove = (id: string) => {
    setCriteria((prev) => prev.filter((c) => c.id !== id))
  }

  /** Édite le libellé d'un critère (et, pour "custom", sa description dans
   *  params — c'est ce que le LLM lit pour l'évaluer). */
  const editLabel = (id: string, label: string) => {
    setCriteria((prev) => prev.map((c) => {
      if (c.id !== id) return c
      if (c.type === "custom") {
        return { ...c, label, params: { ...c.params, description: label } }
      }
      return { ...c, label }
    }))
  }

  const addManual = (type: CriterionType) => {
    if (criteria.length >= MAX_MAIN_CRITERIA + MAX_BONUS_CRITERIA) return
    const targetWeight = mainCount < MAX_MAIN_CRITERIA ? "main" : "bonus"
    setCriteria((prev) => [...prev, {
      id: crypto.randomUUID(),
      type,
      // Custom : libellé vide au départ pour forcer la saisie (le placeholder
      // invite à décrire). Les autres types gardent leur libellé par défaut.
      label: type === "custom" ? "" : CRITERION_CATALOG[type].defaultLabel,
      weight: targetWeight,
      source: "manual",
      params: {},
    }])
    setShowAdd(false)
  }

  const save = async () => {
    if (criteria.length === 0) {
      setError(t.selectAtLeastOne)
      return
    }
    if (mainCount === 0) {
      setError(t.needAtLeastOneMain)
      return
    }
    if (criteria.some((c) => c.type === "custom" && !c.label.trim())) {
      setError(t.describeCustom)
      return
    }
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}/criteria`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria }),
      })
      const data = await res.json().catch(() => ({} as Record<string, unknown>))
      if (!res.ok) {
        setError(String(data?.message ?? data?.error ?? t.saveFailed))
        setSaving(false)
        return
      }
      onDone(Array.isArray(data.criteria) ? data.criteria as Criterion[] : criteria)
    } catch (e) {
      setError((e as Error).message ?? t.networkError)
      setSaving(false)
    }
  }

  const mainList  = criteria.filter((c) => c.weight === "main")
  const bonusList = criteria.filter((c) => c.weight === "bonus")

  return (
    <m.section
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={embedded ? { background: "transparent" } : {
        background: "white", borderRadius: 16,
        border: "1px solid rgba(124,99,200,0.22)",
        padding: 24, marginBottom: 22,
        boxShadow: "0 10px 30px -18px rgba(124,99,200,0.25)",
      }}
    >
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {!embedded && (
            <>
              <p style={{ margin: 0, fontSize: 10.5, fontWeight: 800, color: "#7C63C8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {t.stepBadge}
              </p>
              <h2 style={{ margin: "4px 0 0", fontSize: 19, fontWeight: 800, color: "#111827", letterSpacing: "-0.01em" }}>
                {t.title}
              </h2>
            </>
          )}
          <p style={{ margin: embedded ? 0 : "4px 0 0", fontSize: 12.5, color: "#6B7280", lineHeight: 1.55 }}>
            {t.intro}
          </p>
        </div>
        {!loading && criteria.length > 0 && (
          <button
            type="button"
            onClick={() => void propose()}
            disabled={loading || saving}
            style={{
              fontSize: 11.5, fontWeight: 700, color: "#7C63C8",
              background: "white", border: "1px solid rgba(124,99,200,0.30)",
              borderRadius: 9, padding: "6px 12px",
              cursor: loading || saving ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {t.relaunchNora}
          </button>
        )}
      </header>

      {loading && (
        <div style={{
          padding: "40px 0", textAlign: "center", color: "#7C63C8",
          fontSize: 13, fontWeight: 600,
        }}>
          <span style={{
            display: "inline-block", width: 18, height: 18, borderRadius: "50%",
            border: "2px solid rgba(124,99,200,0.25)", borderTopColor: "#7C63C8",
            animation: "criteria-spin 0.9s linear infinite",
            marginRight: 10, verticalAlign: "middle",
          }} />
          {t.analyzing}
          <style>{`@keyframes criteria-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {!loading && (
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16,
          marginTop: 4,
        }} className="criteria-grid">
          <Column
            title={t.mainColumn}
            subtitle={t.mainSubtitle(mainCount, MAX_MAIN_CRITERIA)}
            accent="#15803d"
            items={mainList}
            onToggleWeight={toggleWeight}
            onRemove={remove}
            onEditLabel={editLabel}
            isMain
          />
          <Column
            title={t.bonusColumn}
            subtitle={t.bonusSubtitle(bonusCount, MAX_BONUS_CRITERIA)}
            accent="#7C63C8"
            items={bonusList}
            onToggleWeight={toggleWeight}
            onRemove={remove}
            onEditLabel={editLabel}
            isMain={false}
          />
        </div>
      )}

      {!loading && (
        <div style={{
          marginTop: 14, display: "flex", alignItems: "center", gap: 10,
          flexWrap: "wrap",
        }}>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            disabled={criteria.length >= MAX_MAIN_CRITERIA + MAX_BONUS_CRITERIA}
            style={{
              fontSize: 12, fontWeight: 700, color: "#7C63C8",
              background: "white", border: "1px dashed rgba(124,99,200,0.40)",
              borderRadius: 9, padding: "7px 12px",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {t.addCriterion}
          </button>
          <div style={{ flex: 1 }} />
          {error && (
            <span style={{ fontSize: 12, color: "#B91C1C" }}>{error}</span>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              style={{
                fontSize: 13, fontWeight: 600, color: "#6B7280",
                padding: "10px 16px", borderRadius: 10,
                background: "white", border: "1px solid #E5E7EB",
                cursor: saving ? "default" : "pointer", fontFamily: "inherit",
              }}
            >
              {t.cancel}
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving || criteria.length === 0 || mainCount === 0}
            style={{
              fontSize: 13, fontWeight: 700, color: "white",
              padding: "10px 18px", borderRadius: 10, border: "none",
              background: saving || criteria.length === 0 || mainCount === 0
                ? "#C7BFE4"
                : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
              cursor: saving || criteria.length === 0 || mainCount === 0 ? "default" : "pointer",
              fontFamily: "inherit",
              boxShadow: "0 6px 20px -8px rgba(124,99,200,0.55)",
            }}
          >
            {/* Le matching ne se lance PLUS automatiquement (retour sourceur).
                Le CTA ne promet donc jamais de matching : il valide/enregistre
                les critères, le sourceur choisit ensuite l'action. */}
            {saving ? t.saving : (submitLabel ?? (onCancel ? t.saveCriteria : t.validateCriteria))}
          </button>
        </div>
      )}

      {showAdd && (
        <div style={{
          marginTop: 12, padding: 12,
          background: "#FAF9FE", border: "1px solid #F0ECF8", borderRadius: 11,
        }}>
          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#6B7280", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {t.addFromCatalog}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(Object.keys(CRITERION_CATALOG) as CriterionType[])
              .filter((ct) => !criteria.some((c) => c.type === ct && c.type !== "custom" && c.type !== "language" && c.type !== "license" && c.type !== "certification"))
              .map((ct) => (
                <button
                  key={ct}
                  type="button"
                  onClick={() => addManual(ct)}
                  style={{
                    fontSize: 11.5, fontWeight: 600, color: "#374151",
                    background: "white", border: "1px solid #E5E7EB",
                    borderRadius: 7, padding: "5px 10px",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  + {typeLabel(ct, lang)}
                </button>
              ))}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 760px) {
          .criteria-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </m.section>
  )
}

/** Liste grisée des compétences d'un critère skills, repliée à 5 + "voir plus". */
function SkillsPreview({ skills }: { skills: string[] }) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const [expanded, setExpanded] = useState(false)
  const LIMIT = 5
  const shown = expanded ? skills : skills.slice(0, LIMIT)
  const hidden = skills.length - LIMIT
  return (
    <p style={{ margin: "4px 0 0", fontSize: 10.5, color: "#B6AEC9", lineHeight: 1.5 }}>
      {shown.join(" · ")}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginLeft: 6, background: "none", border: "none", padding: 0,
            cursor: "pointer", fontSize: 10.5, fontWeight: 700, color: "#7C63C8",
            fontFamily: "inherit",
          }}
        >
          {expanded ? t.seeLess : t.seeMore(hidden)}
        </button>
      )}
    </p>
  )
}

function Column({
  title, subtitle, accent, items, onToggleWeight, onRemove, onEditLabel, isMain,
}: {
  title: string
  subtitle: string
  accent: string
  items: Criterion[]
  onToggleWeight: (id: string) => void
  onRemove: (id: string) => void
  onEditLabel: (id: string, label: string) => void
  isMain: boolean
}) {
  const { lang } = useLanguage()
  const t = copy[lang]
  return (
    <div style={{
      background: "#FAFAFA", border: "1px solid #F0ECF8", borderRadius: 12,
      padding: 14,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%", background: accent,
          display: "inline-block",
        }} />
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: "#111827" }}>{title}</p>
        <p style={{ margin: 0, fontSize: 11, color: "#6B7280" }}>{subtitle}</p>
      </div>
      {items.length === 0 ? (
        <p style={{ margin: 0, padding: "16px 6px", fontSize: 12, color: "#6B7280", textAlign: "center", fontStyle: "italic" }}>
          {isMain ? t.noMainCriteria : t.noBonus}
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((c) => (
            <li key={c.id} style={{
              background: "white", border: "1px solid #F0ECF8", borderRadius: 9,
              padding: "8px 10px",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {c.type === "custom" ? (
                  // Critère personnalisé : le libellé EST la description que le
                  // LLM évalue → champ éditable obligatoire (sinon vide/inutile).
                  <input
                    type="text"
                    value={c.label}
                    onChange={(e) => onEditLabel(c.id, e.target.value)}
                    placeholder={t.customPlaceholder}
                    style={{
                      width: "100%", boxSizing: "border-box",
                      fontSize: 12.5, fontWeight: 600, color: "#111827",
                      padding: "4px 6px", borderRadius: 6,
                      border: "1px solid #E2DAF6", background: "#FAFAFF",
                      outline: "none", fontFamily: "inherit",
                    }}
                  />
                ) : (
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {shortCriterionLabel(c, lang)}
                  </p>
                )}
                <p style={{ margin: "2px 0 0", fontSize: 10.5, color: "#6B7280" }}>
                  {typeLabel(c.type, lang)}{c.source === "manual" && t.addedSuffix}
                </p>
                {/* Skills : liste des compétences rattachées (grisées), repliée
                    par défaut avec "voir plus" pour ne pas casser l'UI. */}
                {c.type === "skills" && (() => {
                  const cp = c.params as Record<string, unknown>
                  const must = Array.isArray(cp.must) ? (cp.must as unknown[]).map(String) : []
                  const nice = Array.isArray(cp.nice) ? (cp.nice as unknown[]).map(String) : []
                  const all = [...must, ...nice].filter(Boolean)
                  return all.length > 0 ? <SkillsPreview skills={all} /> : null
                })()}
              </div>
              <button
                type="button"
                onClick={() => onToggleWeight(c.id)}
                title={isMain ? t.demoteToBonus : t.promoteToMain}
                style={{
                  fontSize: 10.5, fontWeight: 700, color: "#6B7280",
                  background: "transparent", border: "1px solid #E5E7EB",
                  borderRadius: 7, padding: "3px 8px",
                  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                }}
              >
                {isMain ? t.toBonus : t.toMain}
              </button>
              <button
                type="button"
                onClick={() => onRemove(c.id)}
                title={t.remove}
                style={{
                  fontSize: 14, color: "#6B7280",
                  background: "transparent", border: "none",
                  cursor: "pointer", padding: "2px 4px",
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
