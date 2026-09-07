"use client"

import { useState, type CSSProperties, type FormEvent } from "react"
import { TALENT_POOL_CONSENT_LABEL } from "@/lib/apply-mention"
import { APPLY_FORM_FIELD_CATALOG, type ApplyFormFieldKey } from "@/lib/apply-form-fields"

interface Props {
  token: string
  orgLabel: string
  brandColor: string
  mentionText: string
  /** Champs du catalogue activés pour CETTE mission (lib/apply-form-fields.ts).
   *  Vide = seuls les 4 champs de base (prénom/nom/email/CV). */
  enabledFields: ApplyFormFieldKey[]
  /** Questions libres rédigées par le recruteur, dans l'ordre — chacune un
   *  champ texte obligatoire, envoyé au serveur via getAll("custom_answer")
   *  (même name répété = ordre préservé, pas besoin d'index dans le name). */
  customQuestions: string[]
}

type Status = "idle" | "sending" | "sent" | "error"

const inputStyle: CSSProperties = {
  width: "100%", boxSizing: "border-box",
  padding: "11px 13px", fontSize: 14, color: "var(--nw-text)",
  background: "white", border: "1px solid var(--nw-border-soft)", borderRadius: 10,
  outline: "none", fontFamily: "inherit",
}

const labelStyle: CSSProperties = {
  display: "block", fontSize: 12.5, fontWeight: 700, color: "var(--nw-text-body)", marginBottom: 6,
}

export default function ApplyForm({ token, orgLabel, brandColor, mentionText, enabledFields, customQuestions }: Props) {
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
          invalid_fields: "Merci de renseigner votre nom, un email et un téléphone valides.",
          missing_required_field: "Merci de compléter tous les champs marqués obligatoires.",
          missing_file: "Merci de joindre votre CV (PDF).",
          invalid_type: "Seuls les fichiers PDF sont acceptés.",
          too_large: "Le fichier dépasse 10 Mo.",
          empty_file: "Le fichier semble vide.",
          cv_quota_exceeded: "Ce cabinet a atteint sa capacité d'accueil pour le moment — réessayez plus tard.",
          // Code réel renvoyé par lib/quota.ts pour le stockage ET le LLM
          // (checkStorageQuota / consumeOrgLlmAction) — "storage_quota_
          // exceeded" et "llm_quota_exceeded" ne sont JAMAIS les valeurs
          // effectivement renvoyées, seulement des fallbacks théoriques
          // dans la route qui ne se déclenchent jamais.
          quota_exceeded: "Ce cabinet n'est pas en mesure de recevoir votre candidature pour le moment — contactez-le directement ou réessayez plus tard.",
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
        background: "white", border: "1px solid var(--nw-border-soft)", borderRadius: 16, padding: 28, textAlign: "center",
      }}>
        <p style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "var(--nw-text)" }}>
          Candidature envoyée
        </p>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--nw-text-muted)", lineHeight: 1.6 }}>
          Merci ! {orgLabel} a bien reçu votre candidature. Vous allez recevoir un email de confirmation
          avec un lien pour gérer vos données à tout moment.
        </p>
      </div>
    )
  }

  const activeCatalogFields = APPLY_FORM_FIELD_CATALOG.filter((f) => enabledFields.includes(f.key))

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "white", border: "1px solid var(--nw-border-soft)", borderRadius: 16, padding: 24,
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

      <p style={{ margin: 0, fontSize: 11.5, color: "var(--nw-text-muted)" }}>* Champs obligatoires</p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 200px" }}>
          <label style={labelStyle} htmlFor="first_name">Prénom *</label>
          <input style={inputStyle} id="first_name" name="first_name" type="text" required maxLength={100} placeholder="Jean" />
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <label style={labelStyle} htmlFor="last_name">Nom *</label>
          <input style={inputStyle} id="last_name" name="last_name" type="text" required maxLength={100} placeholder="Dupont" />
        </div>
      </div>
      <div>
        <label style={labelStyle} htmlFor="email">Email *</label>
        <input style={inputStyle} id="email" name="email" type="email" required maxLength={200} placeholder="jean@email.fr" />
      </div>

      {/* Champs optionnels du catalogue, activés par mission — tous rendus
          OBLIGATOIRES (une fois choisi par le recruteur, le champ n'est plus
          "si vous voulez", il est demandé). */}
      {activeCatalogFields.map((f) => (
        <div key={f.key}>
          <label style={labelStyle} htmlFor={f.key}>{f.formLabel.fr} *</label>
          {f.inputType === "textarea" ? (
            <textarea
              style={{ ...inputStyle, resize: "vertical" }} id={f.key} name={f.key} rows={3} required
              maxLength={4000} placeholder={f.placeholder?.fr}
            />
          ) : (
            <input
              style={inputStyle} id={f.key} name={f.key}
              type={f.inputType === "number" ? "number" : f.inputType}
              required maxLength={f.inputType === "number" ? undefined : 500}
              placeholder={f.placeholder?.fr}
            />
          )}
        </div>
      ))}

      {/* Questions libres rédigées par le recruteur — même name répété
          ("custom_answer") pour toutes : côté serveur, form.getAll() renvoie
          les réponses dans l'ordre du DOM, qui est celui de customQuestions. */}
      {customQuestions.map((q, i) => (
        <div key={i}>
          <label style={labelStyle} htmlFor={`custom-q-${i}`}>{q} *</label>
          <textarea
            style={{ ...inputStyle, resize: "vertical" }} id={`custom-q-${i}`} name="custom_answer"
            rows={3} required maxLength={2000}
          />
        </div>
      ))}

      <div>
        <label style={labelStyle} htmlFor="cv">CV (PDF) *</label>
        {/* L'input natif reste dans le formulaire (requis pour la
            soumission + required natif) mais visuellement caché : son
            widget par défaut ("Choisir un fichier" + "Aucun fichier
            choisi") ne se stylise pas correctement et affichait le nom du
            fichier en double avec notre propre aperçu ci-dessous. Un
            <label htmlFor> ouvre le sélecteur même sur un input caché. */}
        <input
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }}
          id="cv" name="cv" type="file" accept="application/pdf" required
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
        <label
          htmlFor="cv"
          style={{
            display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
            padding: "11px 13px", fontSize: 14, border: "1px dashed var(--nw-border)", borderRadius: 10,
            background: "var(--nw-surface-muted)", color: fileName ? "var(--nw-text)" : "var(--nw-text-muted)",
          }}
        >
          <span style={{
            fontSize: 12.5, fontWeight: 700, color: "var(--nw-text-body)", background: "white",
            border: "1px solid var(--nw-border-soft)", borderRadius: 6, padding: "5px 10px", whiteSpace: "nowrap",
          }}>
            Choisir un fichier
          </span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {fileName ?? "Aucun fichier choisi (PDF, 10 Mo max)"}
          </span>
        </label>
      </div>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer" }}>
        <input type="checkbox" name="talent_pool_consent" style={{ marginTop: 3 }} />
        <span style={{ fontSize: 12.5, color: "var(--nw-text-body)", lineHeight: 1.5 }}>{TALENT_POOL_CONSENT_LABEL}</span>
      </label>

      <details style={{ fontSize: 11.5, color: "var(--nw-text-muted)" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Mention d&apos;information (RGPD)</summary>
        <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, marginTop: 8 }}>{mentionText}</p>
      </details>

      {errorMsg && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--nw-danger-strong)", fontWeight: 600 }}>{errorMsg}</p>
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
