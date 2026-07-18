"use client"

import { useState } from "react"
import type { Candidate, OutreachMeta } from "@/lib/database.types"

/**
 * ComposeBox — outreach draft editor.
 *
 * Self-contained: own state, calls /api/cv/:id/compose to generate a draft,
 * /api/cv/:id/critique when the sourcer edits then asks Nora to review.
 * The parent decides which job context to pass (selectedJobId / jobTitle).
 *
 * Lives at /workspace/match/[matchId] in the new architecture; was inline
 * on the candidate fiche before the refactor.
 */
export default function ComposeBox({
  candidate,
  selectedJobId,
  jobTitle,
  showJobBadge = true,
}: {
  candidate: Candidate
  selectedJobId: string
  jobTitle: string | null
  /** Hide the "Pour : <job>" pill when the surrounding UI already shows it. */
  showJobBadge?: boolean
}) {
  const existing = candidate.outreach_meta as OutreachMeta | null
  const [channel, setChannel] = useState<"email" | "linkedin">(existing?.channel ?? "email")
  const [instruction, setInstruction] = useState(existing?.instruction ?? "")
  const [subject, setSubject] = useState(existing?.subject ?? "")
  const [bodyText, setBodyText] = useState(candidate.outreach_draft ?? "")
  const [composing, setComposing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // AI baseline — if the textarea drifts from this, the sourcer has edited.
  const [aiBody, setAiBody] = useState(candidate.outreach_draft ?? "")
  const [aiSubject, setAiSubject] = useState(existing?.subject ?? "")
  const [critiqueState, setCritiqueState] = useState<"idle" | "running">("idle")
  const [critique, setCritique] = useState<{
    verdict: "ok" | "warn"
    flags: { level: "info" | "warn"; text: string }[]
  } | null>(null)

  const hasDraft = bodyText.trim().length > 0
  const edited = hasDraft && (bodyText.trim() !== aiBody.trim() || subject.trim() !== aiSubject.trim())

  const generate = async () => {
    setComposing(true); setError(null)
    try {
      const res = await fetch(`/api/cv/${candidate.id}/compose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          job_id: selectedJobId || null,
          instruction: instruction.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data?.message ?? data?.error ?? "Échec de la génération.")
        return
      }
      setSubject(data.subject ?? "")
      setBodyText(data.body ?? "")
      setAiSubject(data.subject ?? "")
      setAiBody(data.body ?? "")
      setCritique(null)
    } catch (err) {
      setError((err as Error).message ?? "Erreur réseau.")
    } finally {
      setComposing(false)
    }
  }

  const runCritique = async () => {
    if (!edited || critiqueState === "running") return
    setCritiqueState("running"); setError(null)
    try {
      const res = await fetch(`/api/cv/${candidate.id}/critique`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body: bodyText, channel, job_id: selectedJobId || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setError(data?.message ?? data?.error ?? "Nora n'a pas pu relire le message.")
      } else {
        setCritique({ verdict: data.verdict, flags: data.flags ?? [] })
      }
    } catch (err) {
      setError((err as Error).message ?? "Erreur réseau.")
    } finally {
      setCritiqueState("idle")
    }
  }

  const copy = async () => {
    const text = channel === "email" && subject ? `Objet : ${subject}\n\n${bodyText}` : bodyText
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked */ }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 0, border: "1px solid var(--nw-border)", borderRadius: 9, overflow: "hidden" }}>
          {(["email", "linkedin"] as const).map((ch) => (
            <button
              key={ch}
              onClick={() => setChannel(ch)}
              style={{
                fontSize: 12.5, fontWeight: 600, padding: "6px 12px",
                border: "none", cursor: "pointer", fontFamily: "inherit",
                background: channel === ch ? "var(--nw-primary)" : "white",
                color: channel === ch ? "white" : "var(--nw-text-muted)",
              }}
            >
              {ch === "email" ? "Email" : "LinkedIn"}
            </button>
          ))}
        </div>
        {showJobBadge && jobTitle && (
          <span style={{
            fontSize: 11, fontWeight: 600, color: "var(--nw-primary)",
            background: "rgba(124,99,200,0.08)",
            border: "1px solid rgba(124,99,200,0.16)",
            borderRadius: 100, padding: "3px 10px",
          }}>
            Pour : {jobTitle}
          </span>
        )}
      </div>

      <input
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Consigne optionnelle — ex : insiste sur le télétravail, ton très direct…"
        style={{
          width: "100%", boxSizing: "border-box",
          fontSize: 12.5, color: "var(--nw-text)", padding: "8px 11px",
          background: "var(--nw-surface-muted)", border: "1px solid var(--nw-border)", borderRadius: 9,
          outline: "none", fontFamily: "inherit",
        }}
      />

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={generate} disabled={composing} style={{
          padding: "8px 14px", borderRadius: 9, border: "none",
          background: composing ? "var(--nw-primary-200)" : "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
          color: "white", fontSize: 12.5, fontWeight: 700,
          cursor: composing ? "default" : "pointer", fontFamily: "inherit",
        }}>
          {composing ? "Nora rédige…" : hasDraft ? "Régénérer (version alternative)" : "Rédiger avec Nora"}
        </button>
        {existing?.generated_at && !composing && (
          <span style={{ fontSize: 11, color: "var(--nw-text-muted)" }}>
            {new Date(existing.generated_at).toLocaleDateString("fr-FR")}
          </span>
        )}
      </div>

      {error && (
        <div style={{
          padding: "9px 12px", background: "#FEF2F2", border: "1px solid var(--nw-danger-border)",
          borderRadius: 9, fontSize: 12.5, color: "var(--nw-danger-strong)",
        }}>{error}</div>
      )}

      {hasDraft && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {channel === "email" && (
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Objet de l'email"
              style={{
                width: "100%", boxSizing: "border-box",
                fontSize: 13, fontWeight: 600, color: "var(--nw-text)", padding: "9px 12px",
                background: "var(--nw-surface-muted)", border: "1px solid var(--nw-border-soft)", borderRadius: 9,
                outline: "none", fontFamily: "inherit",
              }}
            />
          )}
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={9}
            style={{
              width: "100%", boxSizing: "border-box",
              fontSize: 13, color: "var(--nw-text)", padding: 11,
              background: "var(--nw-surface-muted)", border: "1px solid var(--nw-border-soft)", borderRadius: 9,
              outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.65,
            }}
          />

          {edited && !critique && (
            <button
              onClick={runCritique}
              disabled={critiqueState === "running"}
              style={{
                alignSelf: "flex-start",
                background: "#FFFAEB", border: "1px solid #FCD34D", borderRadius: 10,
                padding: "8px 12px",
                fontSize: 12.5, fontWeight: 600, color: "var(--nw-warn-strong)",
                cursor: critiqueState === "running" ? "default" : "pointer",
                fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 7,
                boxShadow: "0 2px 6px rgba(252,211,77,0.25)",
              }}
            >
              {critiqueState === "running" ? "✦ Nora relit…" : "✦ Une révision Nora ?"}
            </button>
          )}
          {critique && (
            <div style={{
              background: critique.verdict === "ok" ? "rgba(34,197,94,0.06)" : "#FFFAEB",
              border: `1px solid ${critique.verdict === "ok" ? "rgba(34,197,94,0.3)" : "#FCD34D"}`,
              borderRadius: 10, padding: "10px 12px",
              display: "flex", flexDirection: "column", gap: 6,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontSize: 11, fontWeight: 800,
                  color: critique.verdict === "ok" ? "var(--nw-success)" : "var(--nw-warn-strong)",
                  letterSpacing: "0.04em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
                }}>
                  ✦ {critique.verdict === "ok" ? "Nora approuve" : "Nora suggère"}
                </span>
                <button onClick={() => setCritique(null)} style={{
                  marginLeft: "auto", fontSize: 11, color: "var(--nw-text-muted)",
                  background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
                }}>
                  Masquer
                </button>
              </div>
              {critique.verdict === "ok" && critique.flags.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--nw-text-body)" }}>
                  Le message est prêt à être envoyé.
                </p>
              ) : (
                <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 3 }}>
                  {critique.flags.map((f, i) => (
                    <li key={i} style={{ fontSize: 12.5, color: "var(--nw-text-body)", lineHeight: 1.5 }}>
                      {f.text}
                    </li>
                  ))}
                </ul>
              )}
              {edited && (
                <button onClick={runCritique} disabled={critiqueState === "running"} style={{
                  alignSelf: "flex-start", marginTop: 2,
                  background: "transparent", border: "none", padding: 0,
                  fontSize: 11.5, fontWeight: 700, color: "var(--nw-primary)",
                  cursor: critiqueState === "running" ? "default" : "pointer", fontFamily: "inherit",
                }}>
                  {critiqueState === "running" ? "Relecture…" : "Relire à nouveau"}
                </button>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={copy} style={{
              padding: "7px 12px", borderRadius: 9,
              background: copied ? "rgba(34,197,94,0.10)" : "white",
              border: `1px solid ${copied ? "rgba(34,197,94,0.3)" : "var(--nw-border)"}`,
              color: copied ? "var(--nw-success)" : "var(--nw-text-body)",
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>
              {copied ? "✓ Copié" : "Copier"}
            </button>
          </div>
          <span style={{ fontSize: 11, color: "var(--nw-text-muted)", lineHeight: 1.5 }}>
            Copiez le message et envoyez-le depuis votre outil habituel
            (Gmail, LinkedIn, etc.).
          </span>
        </div>
      )}
    </div>
  )
}
