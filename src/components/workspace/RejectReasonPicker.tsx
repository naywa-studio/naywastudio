"use client"

/**
 * RejectReasonPicker — petite modale qui demande pourquoi le sourceur a
 * écarté ce candidat avant de valider la mise en "rejected".
 *
 * Le menu propose les options stables (REJECT_REASON_OPTIONS) + un champ
 * libre quand "Autre" est choisi. Bouton "Sans préciser" pour ne pas forcer
 * la saisie — on capture juste ce qu'on a.
 */

import { useState } from "react"
import { m, AnimatePresence } from "framer-motion"
import { REJECT_REASON_OPTIONS_BY_LANG, type RejectReason } from "@/lib/reject-reasons"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const copy = {
  fr: {
    dialogLabel: "Raison de l'écart",
    eyebrow: "Écarter du sourcing",
    title: (name: string) => `Pourquoi écartez-vous ${name} ?`,
    body: "Indiquez la raison principale. Cela aide à mesurer la qualité du sourcing et calibrer les prochaines vagues.",
    otherPlaceholder: "Précisez la raison (optionnel, 280 caractères max)",
    noReason: "Sans préciser",
    cancel: "Annuler",
    confirm: "Confirmer l'écart",
  },
  en: {
    dialogLabel: "Rejection reason",
    eyebrow: "Reject from sourcing",
    title: (name: string) => `Why are you rejecting ${name}?`,
    body: "Pick the main reason. It helps measure sourcing quality and calibrate the next rounds.",
    otherPlaceholder: "Specify the reason (optional, 280 characters max)",
    noReason: "Skip",
    cancel: "Cancel",
    confirm: "Confirm rejection",
  },
}

export default function RejectReasonPicker({
  open, candidateName, onConfirm, onCancel,
}: {
  open: boolean
  candidateName: string
  /** Appelé avec la raison + note dès que le sourceur clique "Confirmer".
   *  reason peut être null si "Sans préciser". */
  onConfirm: (reason: RejectReason | null, note: string | null) => void
  onCancel: () => void
}) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const options = REJECT_REASON_OPTIONS_BY_LANG[lang]
  const [reason, setReason] = useState<RejectReason | null>(null)
  const [note, setNote] = useState("")

  const submit = (r: RejectReason | null) => {
    const finalNote = r === "other" ? note.trim() : ""
    onConfirm(r, finalNote.length > 0 ? finalNote : null)
    // Reset for next open
    setReason(null)
    setNote("")
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <m.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE }}
            onClick={onCancel}
            style={{
              position: "fixed", inset: 0, zIndex: 80,
              background: "rgba(17,24,39,0.45)",
              backdropFilter: "blur(4px)",
            }}
          />
          {/* Centering wrapper — fixed full-screen flex pour centrer.
             *  Évite que les `transform` de framer-motion écrasent un
             *  translate(-50%, -50%) sur la carte. */}
          <div
            style={{
              position: "fixed", inset: 0, zIndex: 90,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 16, pointerEvents: "none",
            }}
          >
          <m.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.22, ease: EASE }}
            role="dialog"
            aria-modal="true"
            aria-label={t.dialogLabel}
            style={{
              background: "white",
              border: "1px solid #E9E2F7",
              borderRadius: 16,
              boxShadow: "0 24px 80px rgba(17,24,39,0.25)",
              padding: "20px 22px",
              width: "min(440px, 100%)",
              fontFamily: "var(--font-inter), sans-serif",
              pointerEvents: "auto",
            }}
          >
            <p style={{
              margin: 0, fontSize: 10.5, fontWeight: 700, color: "#6B7280",
              letterSpacing: "0.08em", textTransform: "uppercase",
            }}>
              {t.eyebrow}
            </p>
            <h3 style={{
              margin: "4px 0 4px", fontSize: 15, fontWeight: 800, color: "#111827",
              letterSpacing: "-0.01em",
            }}>
              {t.title(candidateName)}
            </h3>
            <p style={{
              margin: "0 0 14px", fontSize: 12, color: "#6B7280", lineHeight: 1.55,
            }}>
              {t.body}
            </p>

            {/* Options */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {options.map((opt) => {
                const active = reason === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => setReason(opt.value)}
                    style={{
                      fontFamily: "inherit",
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: active ? 700 : 500,
                      color: active ? "#7C63C8" : "#374151",
                      background: active ? "rgba(124,99,200,0.08)" : "white",
                      border: `1px solid ${active ? "rgba(124,99,200,0.40)" : "#E5E7EB"}`,
                      cursor: "pointer",
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>

            {reason === "other" && (
              <m.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.2 }}>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 280))}
                  placeholder={t.otherPlaceholder}
                  rows={3}
                  style={{
                    marginTop: 10, width: "100%", padding: "9px 12px",
                    fontSize: 12.5, color: "#111827",
                    fontFamily: "inherit", lineHeight: 1.5,
                    background: "white",
                    border: "1px solid #E5E7EB", borderRadius: 9,
                    outline: "none", resize: "vertical",
                  }}
                />
              </m.div>
            )}

            {/* Actions */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              gap: 8, marginTop: 16,
            }}>
              <button
                onClick={() => submit(null)}
                style={{
                  fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                  color: "#6B7280",
                  background: "transparent", border: "none", cursor: "pointer",
                  padding: "6px 0", textDecoration: "underline",
                }}
              >
                {t.noReason}
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={onCancel}
                  style={{
                    fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: "#6B7280",
                    background: "white", border: "1px solid #E5E7EB",
                    borderRadius: 9, padding: "8px 14px", cursor: "pointer",
                  }}
                >
                  {t.cancel}
                </button>
                <button
                  onClick={() => submit(reason)}
                  disabled={!reason}
                  style={{
                    fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, color: "white",
                    background: reason
                      ? "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)"
                      : "rgba(124,99,200,0.4)",
                    border: "none",
                    borderRadius: 9, padding: "8px 16px",
                    cursor: reason ? "pointer" : "not-allowed",
                  }}
                >
                  {t.confirm}
                </button>
              </div>
            </div>
          </m.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
