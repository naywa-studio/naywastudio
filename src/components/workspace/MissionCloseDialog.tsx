"use client"

/**
 * MissionCloseDialog — ce qui s'ouvre au clic sur la croix d'une carte
 * mission, sur « Fermer ou supprimer » dans le menu ⋯ de la fiche, ou sur
 * « Réouvrir » quand la mission est fermée.
 *
 * Deux modes, une même logique : l'action SÛRE et réversible d'abord, mise en
 * avant ; la suppression ensuite, en retrait, derrière une seconde
 * confirmation sur place.
 *   - mode "close"  : mission en cours → Fermer (recommandé) · Supprimer
 *   - mode "reopen" : mission fermée   → Réouvrir (recommandé) · Supprimer
 *
 * Pourquoi l'option sûre en tête : une croix se lit « faire disparaître ».
 * C'est presque toujours ce que veut le sourceur, et fermer le fait sans rien
 * perdre. Supprimer reste possible, mais ne peut plus arriver sur un clic trop
 * rapide : la confirmation met le focus sur « Retour », pas sur « Supprimer ».
 *
 * Contrat : `onPrimary` et `onDelete` font le travail ET démontent la fenêtre
 * en cas de succès. Ils renvoient false en cas d'échec : la fenêtre reste
 * ouverte et affiche l'erreur, rien n'a bougé à l'écran.
 *
 * Rendu en portail sur document.body : la croix vit dans des cartes animées
 * (transform) et le menu ⋯ dans un bandeau, deux contextes qui piègeraient une
 * modale en position fixed.
 */

import { useCallback, useState } from "react"
import { createPortal } from "react-dom"
import { m } from "framer-motion"
import { useEscapeKey } from "@/components/ui/useEscapeKey"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const copy = {
  fr: {
    eyebrow: "Mission",
    titleClose: (title: string) => `Retirer « ${title} » de vos missions ?`,
    titleReopen: (title: string) => `Réouvrir « ${title} » ?`,
    recommended: "Recommandé",
    closeLabel: "Fermer la mission",
    closeDesc: "Elle disparaît de vos missions et de la pipeline. Candidats, shortlist et retours client sont conservés : vous pourrez la réouvrir à tout moment.",
    reopenLabel: "Réouvrir la mission",
    reopenDesc: "Elle revient dans vos missions, et ses candidats réapparaissent dans la pipeline à l'étape où vous les aviez laissés.",
    deleteLabel: "Supprimer définitivement",
    deleteDesc: "La mission, ses matchs et sa shortlist sont effacés. Les CV restent dans votre vivier.",
    confirmTitle: "Cette suppression est irréversible.",
    confirmBody: "Les matchs, la shortlist et les retours client de cette mission seront perdus. Si vous voulez simplement la ranger, fermez-la plutôt.",
    confirmYes: "Oui, supprimer",
    back: "Retour",
    cancel: "Annuler",
    working: "Un instant…",
    error: "L'action n'a pas abouti. Réessayez.",
  },
  en: {
    eyebrow: "Mission",
    titleClose: (title: string) => `Remove "${title}" from your missions?`,
    titleReopen: (title: string) => `Reopen "${title}"?`,
    recommended: "Recommended",
    closeLabel: "Close the mission",
    closeDesc: "It leaves your missions and the pipeline. Candidates, shortlist and client feedback are kept: you can reopen it at any time.",
    reopenLabel: "Reopen the mission",
    reopenDesc: "It comes back to your missions, and its candidates reappear in the pipeline at the stage where you left them.",
    deleteLabel: "Delete permanently",
    deleteDesc: "The mission, its matches and its shortlist are erased. The CVs stay in your talent pool.",
    confirmTitle: "This deletion cannot be undone.",
    confirmBody: "This mission's matches, shortlist and client feedback will be lost. If you just want to put it away, close it instead.",
    confirmYes: "Yes, delete",
    back: "Back",
    cancel: "Cancel",
    working: "One moment…",
    error: "That didn't work. Please try again.",
  },
}

export type MissionCloseMode = "close" | "reopen"

export default function MissionCloseDialog({
  mode, missionTitle, onDismiss, onPrimary, onDelete,
}: {
  mode: MissionCloseMode
  missionTitle: string
  onDismiss: () => void
  /** Fermer (mode "close") ou réouvrir (mode "reopen"). true = c'est fait. */
  onPrimary: () => Promise<boolean>
  /** Suppression définitive. true = c'est fait. */
  onDelete: () => Promise<boolean>
}) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState<"primary" | "delete" | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Pas de fermeture pendant un appel en vol : l'utilisateur doit voir le
  // résultat de ce qu'il vient de demander.
  const dismiss = useCallback(() => { if (!busy) onDismiss() }, [busy, onDismiss])
  useEscapeKey(dismiss)

  const run = async (kind: "primary" | "delete") => {
    setBusy(kind)
    setError(null)
    const ok = await (kind === "primary" ? onPrimary() : onDelete())
    if (!ok) {
      setBusy(null)
      setError(t.error)
    }
  }

  if (typeof document === "undefined") return null
  const isClose = mode === "close"

  return createPortal(
    <div
      role="presentation"
      onClick={dismiss}
      style={{
        position: "fixed", inset: 0, zIndex: 120,
        background: "rgba(17,24,39,0.40)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <m.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mission-close-dialog-title"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: EASE }}
        style={{
          background: "white", border: "1px solid #E9E2F7", borderRadius: 16,
          boxShadow: "0 24px 80px rgba(17,24,39,0.25)",
          padding: "20px 22px", width: "min(460px, 100%)",
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        <p style={{
          margin: 0, fontSize: 10.5, fontWeight: 700, color: "var(--nw-text-muted)",
          letterSpacing: "0.08em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
        }}>
          {t.eyebrow}
        </p>
        <h3 id="mission-close-dialog-title" style={{
          margin: "4px 0 14px", fontSize: 16, fontWeight: 800, color: "var(--nw-text)",
          letterSpacing: "-0.01em", lineHeight: 1.35, overflowWrap: "anywhere",
        }}>
          {isClose ? t.titleClose(missionTitle) : t.titleReopen(missionTitle)}
        </h3>

        {!confirmingDelete ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <OptionButton
              tone="primary"
              icon={isClose ? <ArchiveIcon /> : <ReopenIcon />}
              label={busy === "primary" ? t.working : isClose ? t.closeLabel : t.reopenLabel}
              desc={isClose ? t.closeDesc : t.reopenDesc}
              badge={t.recommended}
              disabled={busy !== null}
              onClick={() => void run("primary")}
              autoFocus
            />
            <OptionButton
              tone="danger"
              icon={<TrashIcon />}
              label={t.deleteLabel}
              desc={t.deleteDesc}
              disabled={busy !== null}
              onClick={() => { setError(null); setConfirmingDelete(true) }}
            />
          </div>
        ) : (
          <div style={{
            padding: "14px 14px 12px", borderRadius: 12,
            background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.25)",
          }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: "var(--nw-danger-strong)" }}>
              {t.confirmTitle}
            </p>
            <p style={{ margin: "4px 0 12px", fontSize: 12.5, color: "var(--nw-text-body)", lineHeight: 1.55 }}>
              {t.confirmBody}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={busy !== null}
                autoFocus
                style={ghostBtn}
              >
                {t.back}
              </button>
              <button
                type="button"
                onClick={() => void run("delete")}
                disabled={busy !== null}
                style={{
                  padding: "8px 14px", borderRadius: 9, border: "none",
                  background: "var(--nw-danger-strong)", color: "white",
                  fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                  cursor: busy ? "wait" : "pointer", opacity: busy === "delete" ? 0.75 : 1,
                }}
              >
                {busy === "delete" ? t.working : t.confirmYes}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--nw-danger-strong)" }}>
            {error}
          </p>
        )}

        {!confirmingDelete && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
            <button type="button" onClick={dismiss} disabled={busy !== null} style={ghostBtn}>
              {t.cancel}
            </button>
          </div>
        )}
      </m.div>
    </div>,
    document.body,
  )
}

function OptionButton({
  tone, icon, label, desc, badge, disabled, onClick, autoFocus = false,
}: {
  tone: "primary" | "danger"
  icon: React.ReactNode
  label: string
  desc: string
  badge?: string
  disabled: boolean
  onClick: () => void
  autoFocus?: boolean
}) {
  const primary = tone === "primary"
  const restBorder = primary ? "rgba(124,99,200,0.35)" : "var(--nw-border)"
  const hoverBorder = primary ? "var(--nw-primary)" : "rgba(220,38,38,0.45)"
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.borderColor = hoverBorder }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = restBorder }}
      style={{
        display: "flex", alignItems: "flex-start", gap: 12,
        width: "100%", textAlign: "left", fontFamily: "inherit",
        padding: "12px 14px", borderRadius: 12,
        background: primary ? "rgba(124,99,200,0.06)" : "white",
        border: `1px solid ${restBorder}`,
        cursor: disabled ? "wait" : "pointer", opacity: disabled ? 0.7 : 1,
        transition: "border-color 140ms",
      }}
    >
      <span aria-hidden="true" style={{
        flexShrink: 0, width: 30, height: 30, borderRadius: 9,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: primary ? "white" : "var(--nw-neutral-100)",
        border: primary ? "1px solid rgba(124,99,200,0.20)" : "1px solid transparent",
        color: primary ? "var(--nw-primary)" : "var(--nw-danger-strong)",
      }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 13.5, fontWeight: 800,
            color: primary ? "var(--nw-text)" : "var(--nw-danger-strong)",
          }}>
            {label}
          </span>
          {badge && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: "var(--nw-primary)",
              background: "white", border: "1px solid rgba(124,99,200,0.25)",
              padding: "1px 7px", borderRadius: 100,
              letterSpacing: "0.05em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
            }}>
              {badge}
            </span>
          )}
        </span>
        <span style={{ display: "block", marginTop: 3, fontSize: 12, color: "var(--nw-text-muted)", lineHeight: 1.5 }}>
          {desc}
        </span>
      </span>
    </button>
  )
}

const ghostBtn: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 9,
  border: "1px solid var(--nw-border)", background: "white",
  color: "var(--nw-text-body)", fontSize: 13, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
}

const iconProps = {
  width: 16, height: 16, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 1.9,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
}

function ArchiveIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
    </svg>
  )
}

function ReopenIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
    </svg>
  )
}
