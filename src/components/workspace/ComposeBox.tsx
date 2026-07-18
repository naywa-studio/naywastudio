"use client"

import { useState } from "react"
import type { Candidate, OutreachMeta } from "@/lib/database.types"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const uiCopy = {
  fr: {
    email: "Email",
    linkedin: "LinkedIn",
    forLabel: (jobTitle: string) => `Pour : ${jobTitle}`,
    instructionPlaceholder: "Consigne optionnelle — ex : insiste sur le télétravail, ton très direct…",
    composing: "Nora rédige…",
    regenerate: "Régénérer (version alternative)",
    draftWithNora: "Rédiger avec Nora",
    subjectPlaceholder: "Objet de l'email",
    critiqueRunning: "✦ Nora relit…",
    critiquePrompt: "✦ Une révision Nora ?",
    noraApproves: "Nora approuve",
    noraSuggests: "Nora suggère",
    hide: "Masquer",
    readyToSend: "Le message est prêt à être envoyé.",
    critiqueRunning2: "Relecture…",
    reReview: "Relire à nouveau",
    copied: "✓ Copié",
    copyBtn: "Copier",
    footerHint: "Copiez le message et envoyez-le depuis votre outil habituel (Gmail, LinkedIn, etc.).",
    subjectPrefix: "Objet",
    generateFailed: "Échec de la génération.",
    networkError: "Erreur réseau.",
    critiqueFailed: "Nora n'a pas pu relire le message.",
  },
  en: {
    email: "Email",
    linkedin: "LinkedIn",
    forLabel: (jobTitle: string) => `For: ${jobTitle}`,
    instructionPlaceholder: "Optional instruction — e.g.: emphasize remote work, very direct tone…",
    composing: "Nora is writing…",
    regenerate: "Regenerate (alternative version)",
    draftWithNora: "Draft with Nora",
    subjectPlaceholder: "Email subject",
    critiqueRunning: "✦ Nora is reviewing…",
    critiquePrompt: "✦ Have Nora review it?",
    noraApproves: "Nora approves",
    noraSuggests: "Nora suggests",
    hide: "Hide",
    readyToSend: "The message is ready to send.",
    critiqueRunning2: "Reviewing…",
    reReview: "Review again",
    copied: "✓ Copied",
    copyBtn: "Copy",
    footerHint: "Copy the message and send it from your usual tool (Gmail, LinkedIn, etc.).",
    subjectPrefix: "Subject",
    generateFailed: "Generation failed.",
    networkError: "Network error.",
    critiqueFailed: "Nora couldn't review the message.",
  },
}

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
  const { lang } = useLanguage()
  const t = uiCopy[lang]
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
          lang,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data?.message ?? data?.error ?? t.generateFailed)
        return
      }
      setSubject(data.subject ?? "")
      setBodyText(data.body ?? "")
      setAiSubject(data.subject ?? "")
      setAiBody(data.body ?? "")
      setCritique(null)
    } catch (err) {
      setError((err as Error).message ?? t.networkError)
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
        body: JSON.stringify({ subject, body: bodyText, channel, job_id: selectedJobId || null, lang }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setError(data?.message ?? data?.error ?? t.critiqueFailed)
      } else {
        setCritique({ verdict: data.verdict, flags: data.flags ?? [] })
      }
    } catch (err) {
      setError((err as Error).message ?? t.networkError)
    } finally {
      setCritiqueState("idle")
    }
  }

  const copyToClipboard = async () => {
    const text = channel === "email" && subject ? `${t.subjectPrefix} : ${subject}\n\n${bodyText}` : bodyText
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked */ }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 0, border: "1px solid #E5E7EB", borderRadius: 9, overflow: "hidden" }}>
          {(["email", "linkedin"] as const).map((ch) => (
            <button
              key={ch}
              onClick={() => setChannel(ch)}
              style={{
                fontSize: 12.5, fontWeight: 600, padding: "6px 12px",
                border: "none", cursor: "pointer", fontFamily: "inherit",
                background: channel === ch ? "#7C63C8" : "white",
                color: channel === ch ? "white" : "#6B7280",
              }}
            >
              {ch === "email" ? t.email : t.linkedin}
            </button>
          ))}
        </div>
        {showJobBadge && jobTitle && (
          <span style={{
            fontSize: 11, fontWeight: 600, color: "#7C63C8",
            background: "rgba(124,99,200,0.08)",
            border: "1px solid rgba(124,99,200,0.16)",
            borderRadius: 100, padding: "3px 10px",
          }}>
            {t.forLabel(jobTitle)}
          </span>
        )}
      </div>

      <input
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder={t.instructionPlaceholder}
        style={{
          width: "100%", boxSizing: "border-box",
          fontSize: 12.5, color: "#111827", padding: "8px 11px",
          background: "#FAFAFA", border: "1px solid #E5E7EB", borderRadius: 9,
          outline: "none", fontFamily: "inherit",
        }}
      />

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={generate} disabled={composing} style={{
          padding: "8px 14px", borderRadius: 9, border: "none",
          background: composing ? "#C4B6E0" : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
          color: "white", fontSize: 12.5, fontWeight: 700,
          cursor: composing ? "default" : "pointer", fontFamily: "inherit",
        }}>
          {composing ? t.composing : hasDraft ? t.regenerate : t.draftWithNora}
        </button>
        {existing?.generated_at && !composing && (
          <span style={{ fontSize: 11, color: "#6B7280" }}>
            {new Date(existing.generated_at).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}
          </span>
        )}
      </div>

      {error && (
        <div style={{
          padding: "9px 12px", background: "#FEF2F2", border: "1px solid #FECACA",
          borderRadius: 9, fontSize: 12.5, color: "#B91C1C",
        }}>{error}</div>
      )}

      {hasDraft && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {channel === "email" && (
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t.subjectPlaceholder}
              style={{
                width: "100%", boxSizing: "border-box",
                fontSize: 13, fontWeight: 600, color: "#111827", padding: "9px 12px",
                background: "#FAFAFA", border: "1px solid #F0ECF8", borderRadius: 9,
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
              fontSize: 13, color: "#111827", padding: 11,
              background: "#FAFAFA", border: "1px solid #F0ECF8", borderRadius: 9,
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
                fontSize: 12.5, fontWeight: 600, color: "#92400E",
                cursor: critiqueState === "running" ? "default" : "pointer",
                fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 7,
                boxShadow: "0 2px 6px rgba(252,211,77,0.25)",
              }}
            >
              {critiqueState === "running" ? t.critiqueRunning : t.critiquePrompt}
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
                  color: critique.verdict === "ok" ? "#15803d" : "#92400E",
                  letterSpacing: "0.04em", textTransform: "uppercase",
                }}>
                  ✦ {critique.verdict === "ok" ? t.noraApproves : t.noraSuggests}
                </span>
                <button onClick={() => setCritique(null)} style={{
                  marginLeft: "auto", fontSize: 11, color: "#6B7280",
                  background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
                }}>
                  {t.hide}
                </button>
              </div>
              {critique.verdict === "ok" && critique.flags.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12.5, color: "#374151" }}>
                  {t.readyToSend}
                </p>
              ) : (
                <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 3 }}>
                  {critique.flags.map((f, i) => (
                    <li key={i} style={{ fontSize: 12.5, color: "#374151", lineHeight: 1.5 }}>
                      {f.text}
                    </li>
                  ))}
                </ul>
              )}
              {edited && (
                <button onClick={runCritique} disabled={critiqueState === "running"} style={{
                  alignSelf: "flex-start", marginTop: 2,
                  background: "transparent", border: "none", padding: 0,
                  fontSize: 11.5, fontWeight: 700, color: "#7C63C8",
                  cursor: critiqueState === "running" ? "default" : "pointer", fontFamily: "inherit",
                }}>
                  {critiqueState === "running" ? t.critiqueRunning2 : t.reReview}
                </button>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={copyToClipboard} style={{
              padding: "7px 12px", borderRadius: 9,
              background: copied ? "rgba(34,197,94,0.10)" : "white",
              border: `1px solid ${copied ? "rgba(34,197,94,0.3)" : "#E5E7EB"}`,
              color: copied ? "#15803d" : "#374151",
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>
              {copied ? t.copied : t.copyBtn}
            </button>
          </div>
          <span style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.5 }}>
            {t.footerHint}
          </span>
        </div>
      )}
    </div>
  )
}
