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
import { REJECT_REASON_OPTIONS, type RejectReason } from "@/lib/reject-reasons"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

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
            aria-label="Raison de l'écart"
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
              margin: 0, fontSize: 10.5, fontWeight: 700, color: "var(--nw-text-muted)",
              letterSpacing: "0.08em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
            }}>
              Écarter du sourcing
            </p>
            <h3 style={{
              margin: "4px 0 4px", fontSize: 15, fontWeight: 800, color: "var(--nw-text)",
              letterSpacing: "-0.01em",
            }}>
              Pourquoi écartez-vous {candidateName} ?
            </h3>
            <p style={{
              margin: "0 0 14px", fontSize: 12, color: "var(--nw-text-muted)", lineHeight: 1.55,
            }}>
              Indiquez la raison principale. Cela aide à mesurer la qualité du sourcing et calibrer les prochaines vagues.
            </p>

            {/* Options */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {REJECT_REASON_OPTIONS.map((opt) => {
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
                      color: active ? "var(--nw-primary)" : "var(--nw-text-body)",
                      background: active ? "rgba(124,99,200,0.08)" : "white",
                      border: `1px solid ${active ? "rgba(124,99,200,0.40)" : "var(--nw-border)"}`,
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
                  placeholder="Précisez la raison (optionnel, 280 caractères max)"
                  rows={3}
                  style={{
                    marginTop: 10, width: "100%", padding: "9px 12px",
                    fontSize: 12.5, color: "var(--nw-text)",
                    fontFamily: "inherit", lineHeight: 1.5,
                    background: "white",
                    border: "1px solid var(--nw-border)", borderRadius: 9,
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
                  color: "var(--nw-text-muted)",
                  background: "transparent", border: "none", cursor: "pointer",
                  padding: "6px 0", textDecoration: "underline",
                }}
              >
                Sans préciser
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={onCancel}
                  style={{
                    fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: "var(--nw-text-muted)",
                    background: "white", border: "1px solid var(--nw-border)",
                    borderRadius: 9, padding: "8px 14px", cursor: "pointer",
                  }}
                >
                  Annuler
                </button>
                <button
                  onClick={() => submit(reason)}
                  disabled={!reason}
                  style={{
                    fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, color: "white",
                    background: reason
                      ? "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)"
                      : "rgba(124,99,200,0.4)",
                    border: "none",
                    borderRadius: 9, padding: "8px 16px",
                    cursor: reason ? "pointer" : "not-allowed",
                  }}
                >
                  Confirmer l&apos;écart
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
