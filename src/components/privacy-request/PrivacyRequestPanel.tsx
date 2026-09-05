"use client"

import { useState, type CSSProperties } from "react"

interface Props {
  token: string
  orgLabel: string
  brandColor: string
  initialFullName: string
  initialEmail: string
  initialPhone: string
  initialLocation: string
  initialLinkedinUrl: string
}

const inputStyle: CSSProperties = {
  width: "100%", boxSizing: "border-box",
  padding: "10px 12px", fontSize: 13.5, color: "#111827",
  background: "white", border: "1px solid #E5E7EB", borderRadius: 9,
  outline: "none", fontFamily: "inherit",
}

const labelStyle: CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 5,
}

const cardStyle: CSSProperties = {
  background: "white", border: "1px solid #E5E7EB", borderRadius: 16, padding: 22, marginBottom: 14,
}

const sectionTitleStyle: CSSProperties = {
  margin: "0 0 4px", fontSize: 14.5, fontWeight: 700, color: "#111827",
}

const sectionHintStyle: CSSProperties = {
  margin: "0 0 14px", fontSize: 12.5, color: "#6B7280", lineHeight: 1.5,
}

export default function PrivacyRequestPanel(props: Props) {
  const [deleted, setDeleted] = useState(false)
  const [optedOut, setOptedOut] = useState(false)

  const [fullName, setFullName] = useState(props.initialFullName)
  const [email, setEmail] = useState(props.initialEmail)
  const [phone, setPhone] = useState(props.initialPhone)
  const [location, setLocation] = useState(props.initialLocation)
  const [linkedinUrl, setLinkedinUrl] = useState(props.initialLinkedinUrl)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")

  const [busy, setBusy] = useState<"delete" | "opt-out" | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const saveRectification = async () => {
    setSaveStatus("saving")
    setErrorMsg(null)
    const res = await fetch(`/api/privacy-request/${props.token}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: fullName, email, phone, location, linkedin_url: linkedinUrl }),
    }).catch(() => null)
    if (!res || !res.ok) {
      setSaveStatus("error")
      setErrorMsg("Impossible d'enregistrer — vérifiez que le nom, l'email et le téléphone sont valides.")
      return
    }
    setSaveStatus("saved")
    setTimeout(() => setSaveStatus("idle"), 2000)
  }

  const doOptOut = async () => {
    if (busy) return
    if (!window.confirm("Confirmer : vous ne souhaitez plus être recontacté par " + props.orgLabel + " ?")) return
    setBusy("opt-out")
    const res = await fetch(`/api/privacy-request/${props.token}/opt-out`, { method: "POST" }).catch(() => null)
    setBusy(null)
    if (res?.ok) setOptedOut(true)
    else setErrorMsg("Une erreur est survenue, réessayez.")
  }

  const doDelete = async () => {
    if (busy) return
    if (!window.confirm(
      "Supprimer définitivement vos données (CV, coordonnées, historique) chez " + props.orgLabel +
      " ? Cette action est irréversible.",
    )) return
    setBusy("delete")
    const res = await fetch(`/api/privacy-request/${props.token}/delete`, { method: "POST" }).catch(() => null)
    setBusy(null)
    if (res?.ok) setDeleted(true)
    else setErrorMsg("Une erreur est survenue, réessayez.")
  }

  if (deleted) {
    return (
      <div style={cardStyle}>
        <p style={{ margin: 0, fontSize: 14, color: "#111827", fontWeight: 600 }}>
          Vos données ont été supprimées.
        </p>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>
          {props.orgLabel} n&apos;a plus accès à votre CV ni à vos coordonnées. Ce lien n&apos;est plus utilisable.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Export */}
      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>Télécharger mes données</h2>
        <p style={sectionHintStyle}>Un fichier contenant tout ce que {props.orgLabel} détient sur vous.</p>
        <a
          href={`/api/privacy-request/${props.token}/export`}
          style={{
            display: "inline-block", fontSize: 13, fontWeight: 700, color: props.brandColor,
            background: "#F5F3FF", border: "1px solid #E5E7EB", borderRadius: 8, padding: "9px 14px",
            textDecoration: "none",
          }}
        >
          Télécharger le fichier
        </a>
      </section>

      {/* Rectification */}
      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>Corriger mes informations</h2>
        <p style={sectionHintStyle}>Ces champs sont visibles par {props.orgLabel} — corrigez ce qui a changé.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={labelStyle} htmlFor="pr-name">Nom complet</label>
            <input style={inputStyle} id="pr-name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={200} />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px" }}>
              <label style={labelStyle} htmlFor="pr-email">Email</label>
              <input style={inputStyle} id="pr-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <label style={labelStyle} htmlFor="pr-phone">Téléphone</label>
              <input style={inputStyle} id="pr-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px" }}>
              <label style={labelStyle} htmlFor="pr-location">Ville</label>
              <input style={inputStyle} id="pr-location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} />
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <label style={labelStyle} htmlFor="pr-linkedin">LinkedIn</label>
              <input style={inputStyle} id="pr-linkedin" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} maxLength={500} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <button
              type="button" onClick={saveRectification} disabled={saveStatus === "saving"}
              style={{
                fontSize: 13, fontWeight: 700, color: "white", background: props.brandColor,
                border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontFamily: "inherit",
                opacity: saveStatus === "saving" ? 0.6 : 1,
              }}
            >
              {saveStatus === "saving" ? "Enregistrement…" : "Enregistrer"}
            </button>
            {saveStatus === "saved" && <span style={{ fontSize: 12.5, color: "#16A34A", fontWeight: 600 }}>Enregistré ✓</span>}
          </div>
        </div>
      </section>

      {/* Opposition */}
      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>Ne plus être contacté</h2>
        <p style={sectionHintStyle}>
          {optedOut
            ? "Opposition enregistrée."
            : `Vous restez dans le vivier de ${props.orgLabel}, mais indiquez que vous ne souhaitez plus être recontacté.`}
        </p>
        {!optedOut && (
          <button
            type="button" onClick={doOptOut} disabled={!!busy}
            style={{
              fontSize: 13, fontWeight: 700, color: "#374151", background: "white",
              border: "1px solid #E5E7EB", borderRadius: 8, padding: "9px 14px", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {busy === "opt-out" ? "…" : "M'opposer au contact"}
          </button>
        )}
      </section>

      {/* Suppression */}
      <section style={{ ...cardStyle, marginBottom: 0, borderColor: "#FCA5A5" }}>
        <h2 style={{ ...sectionTitleStyle, color: "#B91C1C" }}>Supprimer définitivement mes données</h2>
        <p style={sectionHintStyle}>
          Efface votre CV et vos coordonnées chez {props.orgLabel}. Irréversible.
        </p>
        <button
          type="button" onClick={doDelete} disabled={!!busy}
          style={{
            fontSize: 13, fontWeight: 700, color: "#B91C1C", background: "transparent",
            border: "1px solid #FCA5A5", borderRadius: 8, padding: "9px 14px", cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {busy === "delete" ? "…" : "Supprimer mes données"}
        </button>
      </section>

      {errorMsg && (
        <p style={{ marginTop: 12, fontSize: 13, color: "#DC2626", fontWeight: 600 }}>{errorMsg}</p>
      )}
    </>
  )
}
