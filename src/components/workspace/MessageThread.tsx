"use client"

/**
 * MessageThread — le fil d'échange avec un candidat.
 *
 * ── Le manque que ça comble ───────────────────────────────────────────────
 *
 * Les réponses arrivaient en base et **rien ne les montrait**. Un sourceur
 * voyait partir ses messages et jamais revenir les réponses : il pouvait
 * conclure qu'un candidat l'ignorait alors que Nora avait déjà lu son « oui »
 * et suggéré un entretien. C'est le pire défaut possible sur un produit de
 * sourcing — il fait perdre des candidats acquis.
 *
 * ── Deux règles qui gouvernent ce composant ──────────────────────────────
 *
 * 1. **Le texte entrant n'est jamais du HTML.** Un email vient de l'extérieur,
 *    sans authentification : le rendre en HTML offrirait une injection de
 *    script à quiconque connaît l'adresse de réception d'un sourceur. La
 *    route ne renvoie que le texte, et il est affiché tel quel.
 *
 * 2. **Nora suggère, le sourceur décide.** L'étape proposée s'affiche comme
 *    une proposition avec un bouton pour l'appliquer — jamais appliquée
 *    d'office. Le contenu analysé étant lui-même non fiable, un mouvement
 *    automatique se piloterait depuis une boîte mail.
 */

import { useCallback, useEffect, useState } from "react"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import { useWorkspace } from "@/app/workspace/layout"

interface ThreadAttachment { filename: string; size: number; contentType: string }

interface ThreadMessage {
  id: string
  direction: "inbound" | "outbound"
  from_address: string | null
  to_address: string | null
  subject: string | null
  body_text: string | null
  status: string | null
  error: string | null
  ai_sentiment: string | null
  ai_summary: string | null
  ai_suggested_stage: string | null
  attachments: ThreadAttachment[]
  created_at: string
}

const copy = {
  fr: {
    title: "Échanges avec le candidat",
    empty: "Aucun échange pour l'instant. Le message que vous enverrez apparaîtra ici, ainsi que la réponse du candidat.",
    sent: "Envoyé",
    received: "Reçu",
    failed: "Échec de l'envoi",
    noraRead: "Nora a lu cette réponse",
    suggests: "Étape suggérée",
    apply: "Déplacer ici",
    applying: "…",
    applied: "Étape appliquée",
    applyFailed: "Impossible de déplacer le candidat.",
    loadFailed: "Impossible de charger les échanges.",
    refresh: "Actualiser",
    attachmentsLabel: "Pièces jointes",
    sentiments: {
      interested: "Intéressé",
      not_interested: "Pas intéressé",
      question: "Pose une question",
      negotiation: "Négocie",
      neutral: "Neutre",
    } as Record<string, string>,
    stages: {
      identified: "À contacter", contacted: "Contacté", replied: "A répondu",
      interview: "Entretien", offer: "Présenté", hired: "Recruté", rejected: "Écarté",
    } as Record<string, string>,
  },
  en: {
    title: "Conversation with the candidate",
    empty: "No messages yet. What you send will appear here, along with the candidate's reply.",
    sent: "Sent",
    received: "Received",
    failed: "Sending failed",
    noraRead: "Nora read this reply",
    suggests: "Suggested stage",
    apply: "Move here",
    applying: "…",
    applied: "Stage applied",
    applyFailed: "Could not move the candidate.",
    loadFailed: "Could not load the conversation.",
    refresh: "Refresh",
    attachmentsLabel: "Attachments",
    sentiments: {
      interested: "Interested",
      not_interested: "Not interested",
      question: "Asks a question",
      negotiation: "Negotiating",
      neutral: "Neutral",
    } as Record<string, string>,
    stages: {
      identified: "To contact", contacted: "Contacted", replied: "Replied",
      interview: "Interview", offer: "Presented", hired: "Hired", rejected: "Rejected",
    } as Record<string, string>,
  },
} as const

/** Vert pour un signal positif, ambre pour un refus, neutre sinon. */
function sentimentTone(s: string | null): { fg: string; bg: string; bd: string } {
  if (s === "interested") return { fg: "var(--nw-success)", bg: "rgba(34,197,94,0.08)", bd: "rgba(34,197,94,0.3)" }
  if (s === "not_interested") return { fg: "var(--nw-warn-strong)", bg: "#FFFAEB", bd: "#FCD34D" }
  return { fg: "var(--nw-text-muted)", bg: "var(--nw-surface-muted)", bd: "var(--nw-border)" }
}

export default function MessageThread({
  candidateId,
  jobId,
  matchId,
  onStageApplied,
}: {
  candidateId: string
  jobId: string | null
  /** Nécessaire pour appliquer une étape suggérée. Absent = suggestion en lecture seule. */
  matchId?: string | null
  onStageApplied?: (stage: string) => void
}) {
  const { lang } = useLanguage()
  const t = copy[lang === "en" ? "en" : "fr"]
  const { isReadOnly } = useWorkspace()

  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState<string | null>(null)
  const [appliedOn, setAppliedOn] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const url = `/api/candidates/${candidateId}/messages${jobId ? `?job_id=${jobId}` : ""}`
      const res = await fetch(url, { signal })
      const data = await res.json()
      if (!res.ok || !data.ok) { setError(t.loadFailed); return }
      setMessages(data.messages ?? [])
      setError(null)
    } catch (err) {
      // Une requête annulée au démontage n'est pas une erreur à afficher.
      if ((err as Error).name !== "AbortError") setError(t.loadFailed)
    } finally {
      setLoading(false)
    }
  }, [candidateId, jobId, t.loadFailed])

  useEffect(() => {
    const ctrl = new AbortController()
    load(ctrl.signal)
    return () => ctrl.abort()
  }, [load])

  const applyStage = useCallback(async (messageId: string, stage: string) => {
    if (!matchId) return
    setApplying(messageId); setError(null)
    try {
      const res = await fetch(`/api/match/${matchId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline_stage: stage }),
      })
      if (!res.ok) { setError(t.applyFailed); return }
      setAppliedOn(messageId)
      onStageApplied?.(stage)
    } catch {
      setError(t.applyFailed)
    } finally {
      setApplying(null)
    }
  }, [matchId, onStageApplied, t.applyFailed])

  if (loading) return null

  return (
    <section style={S.wrap}>
      <header style={S.head}>
        <h3 style={S.title}>{t.title}</h3>
        <button type="button" style={S.refresh} onClick={() => load()}>{t.refresh}</button>
      </header>

      {messages.length === 0 ? (
        <p style={S.empty}>{t.empty}</p>
      ) : (
        <ol style={S.list}>
          {messages.map((m) => {
            const inbound = m.direction === "inbound"
            const failed = m.status === "failed"
            return (
              <li key={m.id} style={{ ...S.item, alignItems: inbound ? "flex-start" : "flex-end" }}>
                <div style={{
                  ...S.bubble,
                  background: inbound ? "var(--nw-surface-muted)" : "rgba(124,99,200,0.07)",
                  borderColor: failed ? "var(--nw-danger-border)" : inbound ? "var(--nw-border)" : "rgba(124,99,200,0.22)",
                }}>
                  <div style={S.meta}>
                    <span style={{ fontWeight: 700, color: failed ? "var(--nw-danger-strong)" : "var(--nw-text-muted)" }}>
                      {failed ? t.failed : inbound ? t.received : t.sent}
                    </span>
                    <span>·</span>
                    <time dateTime={m.created_at}>
                      {new Date(m.created_at).toLocaleString(lang === "en" ? "en-US" : "fr-FR", {
                        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </time>
                  </div>

                  {m.subject && <div style={S.subject}>{m.subject}</div>}

                  {/* Texte brut, jamais de HTML : cf. l'en-tête de ce fichier. */}
                  <p style={S.body}>{m.body_text}</p>

                  {m.attachments.length > 0 && (
                    <div style={S.attachments}>
                      <span style={S.attachLabel}>{t.attachmentsLabel}</span>
                      {m.attachments.map((a, i) => (
                        <span key={i} style={S.attachChip}>
                          {a.filename} · {Math.max(1, Math.round(a.size / 1024))} Ko
                        </span>
                      ))}
                    </div>
                  )}

                  {failed && m.error && <p style={S.errText}>{m.error}</p>}
                </div>

                {inbound && (m.ai_summary || m.ai_sentiment) && (
                  <div style={{
                    ...S.nora,
                    background: sentimentTone(m.ai_sentiment).bg,
                    borderColor: sentimentTone(m.ai_sentiment).bd,
                  }}>
                    <div style={{ ...S.noraHead, color: sentimentTone(m.ai_sentiment).fg }}>
                      ✦ {t.noraRead}
                      {m.ai_sentiment && ` · ${t.sentiments[m.ai_sentiment] ?? m.ai_sentiment}`}
                    </div>
                    {m.ai_summary && <p style={S.noraSummary}>{m.ai_summary}</p>}

                    {/* La suggestion reste une suggestion : un mouvement
                        automatique se piloterait depuis une boîte mail. */}
                    {m.ai_suggested_stage && matchId && !isReadOnly && (
                      appliedOn === m.id ? (
                        <span style={S.appliedNote}>{t.applied}</span>
                      ) : (
                        <div style={S.suggestRow}>
                          <span style={S.suggestLabel}>
                            {t.suggests} : {t.stages[m.ai_suggested_stage] ?? m.ai_suggested_stage}
                          </span>
                          <button
                            type="button"
                            style={S.applyBtn}
                            disabled={applying === m.id}
                            onClick={() => applyStage(m.id, m.ai_suggested_stage!)}
                          >
                            {applying === m.id ? t.applying : t.apply}
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {error && <p style={S.errText}>{error}</p>}
    </section>
  )
}

const S: Record<string, React.CSSProperties> = {
  wrap: {
    background: "var(--nw-surface)", border: "1px solid var(--nw-border)",
    borderRadius: 14, padding: "18px 20px",
  },
  head: { display: "flex", alignItems: "center", gap: 12, marginBottom: 14 },
  title: {
    margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em",
    textTransform: "uppercase", color: "var(--nw-text-muted)",
    fontFamily: "var(--nw-font-mono)",
  },
  refresh: {
    marginLeft: "auto", background: "transparent", border: "none", padding: 0,
    fontSize: 11.5, fontWeight: 700, color: "var(--nw-primary)",
    cursor: "pointer", fontFamily: "inherit",
  },
  empty: { margin: 0, fontSize: 12.5, color: "var(--nw-text-muted)", lineHeight: 1.6 },
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 },
  item: { display: "flex", flexDirection: "column", gap: 6 },
  bubble: {
    maxWidth: "88%", border: "1px solid", borderRadius: 12, padding: "10px 13px",
  },
  meta: {
    display: "flex", gap: 6, alignItems: "center",
    fontSize: 10.5, color: "var(--nw-text-muted)", marginBottom: 5,
    fontFamily: "var(--nw-font-mono)",
  },
  subject: { fontSize: 12.5, fontWeight: 700, color: "var(--nw-text)", marginBottom: 4 },
  // `pre-wrap` : un email est déjà mis en forme par des retours à la ligne.
  // Les écraser rendrait les signatures et les listes illisibles.
  body: { margin: 0, fontSize: 12.5, color: "var(--nw-text-body)", lineHeight: 1.6, whiteSpace: "pre-wrap" },
  attachments: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 8 },
  attachLabel: {
    fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase",
    color: "var(--nw-text-muted)", fontFamily: "var(--nw-font-mono)",
  },
  attachChip: {
    fontSize: 11, padding: "2px 8px", borderRadius: 6,
    background: "var(--nw-bg)", border: "1px solid var(--nw-border)", color: "var(--nw-text-body)",
  },
  nora: { maxWidth: "88%", border: "1px solid", borderRadius: 11, padding: "9px 12px" },
  noraHead: {
    fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em",
    textTransform: "uppercase", fontFamily: "var(--nw-font-mono)",
  },
  noraSummary: { margin: "5px 0 0", fontSize: 12.5, color: "var(--nw-text-body)", lineHeight: 1.55 },
  suggestRow: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 8 },
  suggestLabel: { fontSize: 12, color: "var(--nw-text-body)" },
  applyBtn: {
    padding: "5px 11px", borderRadius: 8, border: "none",
    background: "var(--nw-primary)", color: "#fff",
    fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  },
  appliedNote: {
    display: "inline-block", marginTop: 8, fontSize: 11.5,
    fontWeight: 700, color: "var(--nw-success)",
  },
  errText: { margin: "8px 0 0", fontSize: 12, color: "var(--nw-danger-strong)" },
}
