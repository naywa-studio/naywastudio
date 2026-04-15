"use client"

import { useState } from "react"
import { m, AnimatePresence } from "framer-motion"
import type { MissionBrief } from "@/lib/database.types"

interface BriefFormProps {
  agentColor: string
  agentName: string
  agentLevel: number
  onSubmit: (brief: MissionBrief) => Promise<void>
}

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 6,
        fontSize: 12,
        fontWeight: 600,
        color: "#374151",
        fontFamily: "var(--font-inter), sans-serif",
      }}
    >
      {children}
      {required && <span style={{ color: "#EF4444", marginLeft: 3 }}>*</span>}
    </label>
  )
}

function TextInput({
  value, onChange, placeholder, error,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  error?: boolean
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        padding: "10px 14px",
        borderRadius: 9,
        border: `1.5px solid ${error ? "#EF4444" : "#E5E7EB"}`,
        fontSize: 13,
        color: "#111827",
        outline: "none",
        fontFamily: "var(--font-inter), sans-serif",
        boxSizing: "border-box",
        background: "white",
        transition: "border-color 150ms",
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = "#7C63C8" }}
      onBlur={(e) => { e.currentTarget.style.borderColor = error ? "#EF4444" : "#E5E7EB" }}
    />
  )
}

function Textarea({
  value, onChange, placeholder, rows = 3,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: "100%",
        padding: "10px 14px",
        borderRadius: 9,
        border: "1.5px solid #E5E7EB",
        fontSize: 13,
        color: "#111827",
        outline: "none",
        fontFamily: "var(--font-inter), sans-serif",
        boxSizing: "border-box",
        background: "white",
        resize: "vertical",
        lineHeight: 1.6,
        transition: "border-color 150ms",
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = "#7C63C8" }}
      onBlur={(e) => { e.currentTarget.style.borderColor = "#E5E7EB" }}
    />
  )
}

export default function BriefForm({ agentColor, agentName, agentLevel, onSubmit }: BriefFormProps) {
  const [titrePoste, setTitrePoste] = useState("")
  const [motsClesRaw, setMotsClesRaw] = useState("")
  const [localisation, setLocalisation] = useState("")
  const [criteres, setCriteres] = useState("")
  const [ton, setTon] = useState("")
  const [nomRecruteur, setNomRecruteur] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, boolean>>({})

  const validate = () => {
    const e: Record<string, boolean> = {}
    if (!titrePoste.trim()) e.titrePoste = true
    if (!localisation.trim()) e.localisation = true
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setSubmitting(true)
    const brief: MissionBrief = {
      titre_poste: titrePoste.trim(),
      mots_cles: motsClesRaw
        .split(/[,\n]/)
        .map((k) => k.trim())
        .filter(Boolean),
      localisation: localisation.trim(),
      ...(criteres.trim() && { criteres: criteres.trim() }),
      ...(ton.trim() && { ton: ton.trim() }),
      ...(nomRecruteur.trim() && { nom_recruteur: nomRecruteur.trim() }),
    }
    try {
      await onSubmit(brief)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      {/* Intro */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: "16px 20px",
          borderRadius: 12,
          background: `${agentColor}10`,
          border: `1px solid ${agentColor}30`,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            fontWeight: 700,
            color: "white",
            background: agentColor,
            flexShrink: 0,
          }}
        >
          {agentName.charAt(0)}
        </div>
        <p style={{ margin: 0, fontSize: 14, color: "#111827", lineHeight: 1.6, fontFamily: "var(--font-inter), sans-serif" }}>
          Bonjour&nbsp;! Je suis <strong>{agentName}</strong>.
          {agentLevel >= 2
            ? " Décrivez le poste et je rechercherai, scorerai et préparerai des messages pour les meilleurs profils."
            : " Décrivez le poste et je trouverai les profils LinkedIn correspondants."
          }
        </p>
      </div>

      {/* Form */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Row 1 — Titre + Localisation */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <FieldLabel required>Titre du poste</FieldLabel>
            <TextInput
              value={titrePoste}
              onChange={setTitrePoste}
              placeholder="Ex : Développeur Full-Stack Senior"
              error={errors.titrePoste}
            />
            {errors.titrePoste && (
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#EF4444", fontFamily: "var(--font-inter), sans-serif" }}>
                Champ requis
              </p>
            )}
          </div>
          <div>
            <FieldLabel required>Localisation</FieldLabel>
            <TextInput
              value={localisation}
              onChange={setLocalisation}
              placeholder="Ex : Paris, télétravail, France"
              error={errors.localisation}
            />
            {errors.localisation && (
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#EF4444", fontFamily: "var(--font-inter), sans-serif" }}>
                Champ requis
              </p>
            )}
          </div>
        </div>

        {/* Mots-clés */}
        <div>
          <FieldLabel>Compétences / mots-clés</FieldLabel>
          <Textarea
            value={motsClesRaw}
            onChange={setMotsClesRaw}
            placeholder={"React, Node.js, TypeScript, PostgreSQL\n(un par ligne ou séparés par des virgules)"}
            rows={3}
          />
        </div>

        {/* Critères */}
        <div>
          <FieldLabel>Critères spécifiques</FieldLabel>
          <Textarea
            value={criteres}
            onChange={setCriteres}
            placeholder="Ex : 5+ ans d'expérience, scale-up, open source apprécié, disponible sous 3 mois"
            rows={2}
          />
        </div>

        {/* Nora-only: ton + nom recruteur */}
        <AnimatePresence>
          {agentLevel >= 2 && (
            <m.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: "hidden" }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <FieldLabel>Ton des messages</FieldLabel>
                  <TextInput
                    value={ton}
                    onChange={setTon}
                    placeholder="Ex : direct et chaleureux"
                  />
                </div>
                <div>
                  <FieldLabel>Votre prénom</FieldLabel>
                  <TextInput
                    value={nomRecruteur}
                    onChange={setNomRecruteur}
                    placeholder="Ex : Sophie"
                  />
                </div>
              </div>
            </m.div>
          )}
        </AnimatePresence>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            padding: "14px 28px",
            borderRadius: 12,
            border: "none",
            cursor: submitting ? "not-allowed" : "pointer",
            fontSize: 15,
            fontWeight: 700,
            color: "white",
            background: submitting ? "#D1D5DB" : agentColor,
            fontFamily: "var(--font-space-grotesk), sans-serif",
            boxShadow: submitting ? "none" : `0 6px 24px ${agentColor}40`,
            transition: "all 200ms",
            alignSelf: "flex-start",
          }}
          onMouseEnter={(e) => {
            if (!submitting) {
              e.currentTarget.style.transform = "translateY(-2px)"
              e.currentTarget.style.boxShadow = `0 10px 32px ${agentColor}55`
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)"
            e.currentTarget.style.boxShadow = submitting ? "none" : `0 6px 24px ${agentColor}40`
          }}
        >
          {submitting ? "Lancement…" : `Lancer ${agentName} →`}
        </button>
      </div>
    </m.div>
  )
}
