"use client"
import { useState } from "react"
import { m } from "framer-motion"

export default function SignupForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ firstName: "", email: "" })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    localStorage.setItem("nawa_lead", JSON.stringify({ ...form, date: new Date().toISOString() }))
    onDone()
  }

  return (
    <m.form onSubmit={handleSubmit} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 14, color: "#4B5563", margin: 0 }}>
        Créez votre espace Nawa Studio en 30 secondes. C&apos;est gratuit pour commencer.
      </p>
      <input required placeholder="Votre prénom"
        value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))}
        style={{ padding: "11px 14px", borderRadius: 8, border: "1px solid #E2DAF6",
          fontSize: 14, outline: "none", color: "#111827" }}
      />
      <input required type="email" placeholder="Votre email professionnel"
        value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
        style={{ padding: "11px 14px", borderRadius: 8, border: "1px solid #E2DAF6",
          fontSize: 14, outline: "none", color: "#111827" }}
      />
      <button type="submit"
        style={{ background: "#7C63C8", color: "white", border: "none", borderRadius: 10,
          padding: "14px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
        Créer mon espace →
      </button>
      <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", margin: 0 }}>
        Aucune carte bancaire requise
      </p>
    </m.form>
  )
}
