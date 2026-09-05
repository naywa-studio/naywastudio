"use client"

import { useState, type CSSProperties, type FormEvent } from "react"
import { TALENT_POOL_CONSENT_LABEL } from "@/lib/apply-mention"

interface Props {
  token: string
  orgLabel: string
  brandColor: string
  mentionText: string
}

type Status = "idle" | "sending" | "sent" | "error"

const inputStyle: CSSProperties = {
  width: "100%", boxSizing: "border-box",
  padding: "11px 13px", fontSize: 14, color: "#111827",
  background: "white", border: "1px solid #E5E7EB", borderRadius: 10,
  outline: "none", fontFamily: "inherit",
}

const labelStyle: CSSProperties = {
  display: "block", fontSize: 12.5, fontWeight: 700, color: "#374151", marginBottom: 6,
}

export default function ApplyForm({ token, orgLabel, brandColor, mentionText }: Props) {
  const [status, setStatus] = useState<Status>("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (status === "sending") return
    setStatus("sending")
    setErrorMsg(null)

    const formEl = e.currentTarget
    const formData = new FormData(formEl)

    try {
      const res = await fetch(`/api/apply/${token}`, { method: "POST", body: formData })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const messages: Record<string, string> = {
          rate_limited: "Trop de tentatives depuis votre connexion — réessayez dans un moment.",
          invalid_fields: "Merci de renseigner votre nom et un email valide.",
          missing_file: "Merci de joindre votre CV (PDF).",
          invalid_type: "Seuls les fichiers PDF sont acceptés.",
          too_large: "Le fichier dépasse 10 Mo.",
          empty_file: "Le fichier semble vide.",
          cv_quota_exceeded: "Ce cabinet a atteint sa capacité d'accueil pour le moment — réessayez plus tard.",
        }
        setErrorMsg(messages[json.error] ?? "Une erreur est survenue. Réessayez dans un instant.")
        setStatus("error")
        return
      }
      setStatus("sent")
    } catch {
      setErrorMsg("Impossible d'envoyer votre candidature pour le moment. Réessayez.")
      setStatus("error")
    }
  }

  if (status === "sent") {
    return (
      <div style={{
        background: "white", border: "1px solid #E5E7EB", borderRadius: 16, padding: 28, textAlign: "center",
      }}>
        <p style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "#111827" }}>
          Candidature envoyée
        </p>
        <p style={{ margin: 0, fontSize: 13.5, color: "#6B7280", lineHeight: 1.6 }}>
          Merci ! {orgLabel} a bien reçu votre candidature. Vous allez recevoir un email de confirmation
          avec un lien pour gérer vos données à tout moment.
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "white", border: "1px solid #E5E7EB", borderRadius: 16, padding: 24,
        display: "flex", flexDirection: "column", gap: 16,
      }}
    >
      {/* Honeypot — invisible pour un humain, seuls les bots le remplissent.
          tabIndex=-1 + hors-écran plutôt que display:none (certains bots
          ignorent les champs display:none, moins les champs "juste" décalés). */}
      <div style={{ position: "absolute", left: "-9999px", top: "auto", width: 1, height: 1, overflow: "hidden" }} aria-hidden="true">
        <label htmlFor="website">Site web</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <label style={labelStyle} htmlFor="full_name">Nom complet *</label>
        <input style={inputStyle} id="full_name" name="full_name" type="text" required maxLength={200} placeholder="Jean Dupont" />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px" }}>
          <label style={labelStyle} htmlFor="email">Email *</label>
          <input style={inputStyle} id="email" name="email" type="email" required maxLength={200} placeholder="jean@email.fr" />
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <label style={labelStyle} htmlFor="phone">Téléphone</label>
          <input style={inputStyle} id="phone" name="phone" type="tel" maxLength={40} placeholder="06 12 34 56 78" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px" }}>
          <label style={labelStyle} htmlFor="location">Ville</label>
          <input style={inputStyle} id="location" name="location" type="text" maxLength={200} placeholder="Paris" />
        </div>
        <div style={{ flex: "1 1 220px" }}>
          <label style={labelStyle} htmlFor="linkedin_url">LinkedIn</label>
          <input style={inputStyle} id="linkedin_url" name="linkedin_url" type="url" maxLength={500} placeholder="linkedin.com/in/…" />
        </div>
      </div>

      <div>
        <label style={labelStyle} htmlFor="cv">CV (PDF) *</label>
        <input
          style={inputStyle} id="cv" name="cv" type="file" accept="application/pdf" required
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
        {fileName && <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6B7280" }}>{fileName}</p>}
      </div>

      <div>
        <label style={labelStyle} htmlFor="message">Message (optionnel)</label>
        <textarea style={{ ...inputStyle, resize: "vertical" }} id="message" name="message" rows={3} maxLength={4000}
          placeholder="Un mot sur votre motivation, votre disponibilité…" />
      </div>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer" }}>
        <input type="checkbox" name="talent_pool_consent" style={{ marginTop: 3 }} />
        <span style={{ fontSize: 12.5, color: "#374151", lineHeight: 1.5 }}>{TALENT_POOL_CONSENT_LABEL}</span>
      </label>

      <details style={{ fontSize: 11.5, color: "#6B7280" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Mention d&apos;information (RGPD)</summary>
        <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, marginTop: 8 }}>{mentionText}</p>
      </details>

      {errorMsg && (
        <p style={{ margin: 0, fontSize: 13, color: "#DC2626", fontWeight: 600 }}>{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        style={{
          fontSize: 14, fontWeight: 700, color: "white", background: brandColor,
          border: "none", borderRadius: 10, padding: "13px 20px", cursor: "pointer",
          fontFamily: "inherit", opacity: status === "sending" ? 0.6 : 1,
        }}
      >
        {status === "sending" ? "Envoi en cours…" : "Envoyer ma candidature"}
      </button>
    </form>
  )
}
