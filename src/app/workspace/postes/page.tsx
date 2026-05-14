"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { m, AnimatePresence } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import type { Job } from "@/lib/database.types"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const SENIORITIES = ["junior", "mid", "senior", "lead", "principal"]
const CONTRACTS = ["CDI", "CDD", "Freelance", "Stage", "Alternance"]

export default function PostesPage() {
  const sb = useMemo(() => getSupabase(), [])
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    let channel: ReturnType<typeof sb.channel> | null = null
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user || !mounted) return
      const { data } = await sb.from("jobs").select("*").order("created_at", { ascending: false })
      if (!mounted) return
      setJobs((data ?? []) as Job[])
      setLoading(false)

      channel = sb
        .channel(`jobs:${user.id}`)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "jobs", filter: `user_id=eq.${user.id}` },
          (payload) => {
            setJobs((prev) => {
              if (payload.eventType === "DELETE") return prev.filter((j) => j.id !== (payload.old as Job).id)
              const next = payload.new as Job
              const idx = prev.findIndex((j) => j.id === next.id)
              if (idx === -1) return [next, ...prev]
              const copy = [...prev]; copy[idx] = next; return copy
            })
          },
        )
        .subscribe()
    })()
    return () => { mounted = false; if (channel) sb.removeChannel(channel) }
  }, [sb])

  const handleCreated = useCallback((job: Job) => {
    setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)])
    setFormOpen(false)
  }, [])

  return (
    <main style={{
      minHeight: "calc(100vh - 60px)",
      padding: "40px 24px 80px",
      maxWidth: 1100, margin: "0 auto",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
        <div>
          <span style={{
            display: "inline-block",
            fontSize: 11, fontWeight: 700, color: "#7C63C8",
            background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.18)",
            padding: "4px 11px", borderRadius: 100,
            letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12,
          }}>
            Postes
          </span>
          <h1 style={{ margin: 0, fontSize: "clamp(26px, 3vw, 34px)", fontWeight: 800, color: "#111827", letterSpacing: "-0.025em", lineHeight: 1.1 }}>
            Vos postes ouverts
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "#6B7280", lineHeight: 1.6 }}>
            {jobs.length === 0
              ? "Décrivez un poste — Nora le matche avec votre vivier."
              : `${jobs.length} poste${jobs.length > 1 ? "s" : ""}.`}
          </p>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          style={{
            fontSize: 13, fontWeight: 700, color: "white",
            background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
            border: "none", borderRadius: 10, padding: "10px 18px", cursor: "pointer",
            boxShadow: "0 6px 20px -8px rgba(124,99,200,0.55)", fontFamily: "inherit",
          }}
        >
          + Créer un poste
        </button>
      </div>

      <AnimatePresence>
        {formOpen && <JobForm onClose={() => setFormOpen(false)} onCreated={handleCreated} />}
      </AnimatePresence>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "#9CA3AF" }}>Chargement…</div>
      ) : jobs.length === 0 ? (
        <EmptyState onCreate={() => setFormOpen(true)} />
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 16,
        }}>
          {jobs.map((j, i) => <JobCard key={j.id} job={j} delay={Math.min(i * 0.04, 0.3)} />)}
        </div>
      )}
    </main>
  )
}

/* ─── Job card ─────────────────────────────────────────────────── */

function JobCard({ job, delay }: { job: Job; delay: number }) {
  const ms = job.match_status
  return (
    <m.div
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: EASE }}
      whileHover={{ y: -2 }}
      style={{
        background: "white", borderRadius: 14, border: "1px solid #F0ECF8",
        padding: 18, display: "flex", flexDirection: "column", gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#111827", lineHeight: 1.3 }}>
          {job.title}
        </h2>
        <StatusChip status={job.status} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 12, color: "#6B7280" }}>
        {job.location && <Meta>{job.location}</Meta>}
        {job.seniority && <Meta>{job.seniority}</Meta>}
        {job.contract_type && <Meta>{job.contract_type}</Meta>}
      </div>

      {job.required_skills && job.required_skills.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {job.required_skills.slice(0, 4).map((s) => (
            <span key={s} style={{
              fontSize: 11, color: "#4B5563",
              background: "#F8F6FF", border: "1px solid #F0ECF8",
              padding: "3px 8px", borderRadius: 6,
            }}>{s}</span>
          ))}
          {job.required_skills.length > 4 && (
            <span style={{ fontSize: 11, color: "#9CA3AF", padding: "3px 4px" }}>+{job.required_skills.length - 4}</span>
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: 4 }}>
        <span style={{ fontSize: 11.5, color: "#9CA3AF" }}>
          {ms === "matching" ? "✦ Matching en cours…"
            : ms === "done" ? "✓ Matché"
            : ms === "error" ? "Erreur matching"
            : "Pas encore matché"}
        </span>
        <Link href={`/workspace/postes/${job.id}`} style={{
          fontSize: 12, fontWeight: 600, color: "#7C63C8",
          padding: "6px 12px", borderRadius: 8,
          background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.16)",
          textDecoration: "none",
        }}>
          Ouvrir →
        </Link>
      </div>
    </m.div>
  )
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      background: "#F9FAFB", border: "1px solid #F0ECF8",
      padding: "3px 8px", borderRadius: 6,
    }}>{children}</span>
  )
}

function StatusChip({ status }: { status: Job["status"] }) {
  const map: Record<Job["status"], { label: string; bg: string; fg: string; bd: string }> = {
    draft:    { label: "Brouillon", bg: "#F3F4F6", fg: "#6B7280", bd: "#E5E7EB" },
    open:     { label: "Ouvert",    bg: "rgba(34,197,94,0.10)", fg: "#16a34a", bd: "rgba(34,197,94,0.22)" },
    filled:   { label: "Pourvu",    bg: "rgba(124,99,200,0.10)", fg: "#7C63C8", bd: "rgba(124,99,200,0.22)" },
    archived: { label: "Archivé",   bg: "#F3F4F6", fg: "#9CA3AF", bd: "#E5E7EB" },
  }
  const s = map[status]
  return (
    <span style={{
      flexShrink: 0,
      fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 100,
      background: s.bg, color: s.fg, border: `1px solid ${s.bd}`,
      letterSpacing: "0.04em", textTransform: "uppercase",
    }}>{s.label}</span>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      style={{
        marginTop: 40, padding: "72px 36px",
        background: "white", border: "2px dashed #E2DAF6", borderRadius: 22,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 56, marginBottom: 16 }}>📋</div>
      <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: "#111827", letterSpacing: "-0.015em" }}>
        Créez votre premier poste
      </h2>
      <p style={{ margin: "0 auto 18px", maxWidth: 460, fontSize: 14, color: "#6B7280", lineHeight: 1.65 }}>
        Décrivez un besoin (titre, séniorité, compétences). Nora le compare à tout
        votre vivier et vous sort les candidats pertinents, classés et justifiés.
      </p>
      <button onClick={onCreate} style={{
        padding: "11px 22px", borderRadius: 12, border: "none", cursor: "pointer",
        background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
        color: "white", fontWeight: 700, fontSize: 14, fontFamily: "inherit",
        boxShadow: "0 8px 24px -8px rgba(124,99,200,0.5)",
      }}>
        Créer un poste
      </button>
    </m.div>
  )
}

/* ─── Create form (slide-in panel) ─────────────────────────────── */

function JobForm({ onClose, onCreated }: { onClose: () => void; onCreated: (j: Job) => void }) {
  const [title, setTitle] = useState("")
  const [location, setLocation] = useState("")
  const [seniority, setSeniority] = useState("")
  const [contractType, setContractType] = useState("")
  const [reqSkills, setReqSkills] = useState<string[]>([])
  const [niceSkills, setNiceSkills] = useState<string[]>([])
  const [description, setDescription] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!title.trim()) { setError("Le titre est requis."); return }
    setSubmitting(true); setError(null)
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, location, seniority, contract_type: contractType,
          required_skills: reqSkills, nice_to_have_skills: niceSkills, description,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.job) {
        setError(data.message ?? data.error ?? "Erreur de création.")
        setSubmitting(false)
        return
      }
      onCreated(data.job as Job)
    } catch (err) {
      setError((err as Error).message ?? "Erreur réseau.")
      setSubmitting(false)
    }
  }

  return (
    <>
      <m.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(17,24,39,0.32)" }}
      />
      <m.div
        initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
        transition={{ duration: 0.35, ease: EASE }}
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 51,
          width: "min(480px, 100vw)",
          background: "white", borderLeft: "1px solid #F0ECF8",
          boxShadow: "-20px 0 60px rgba(124,99,200,0.15)",
          display: "flex", flexDirection: "column",
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        <div style={{
          padding: "18px 24px", borderBottom: "1px solid #F0ECF8",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#111827" }}>Nouveau poste</h2>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", cursor: "pointer",
            fontSize: 20, color: "#9CA3AF", lineHeight: 1,
          }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="Intitulé du poste *">
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex : Senior Data Engineer" style={inputStyle} autoFocus />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Localisation">
              <input value={location} onChange={(e) => setLocation(e.target.value)}
                placeholder="Paris, remote…" style={inputStyle} />
            </Field>
            <Field label="Séniorité">
              <select value={seniority} onChange={(e) => setSeniority(e.target.value)} style={inputStyle}>
                <option value="">—</option>
                {SENIORITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Type de contrat">
            <select value={contractType} onChange={(e) => setContractType(e.target.value)} style={inputStyle}>
              <option value="">—</option>
              {CONTRACTS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          <Field label="Compétences requises" hint="Entrée ou virgule pour ajouter">
            <TagInput tags={reqSkills} onChange={setReqSkills} placeholder="Python, Spark, AWS…" />
          </Field>

          <Field label="Compétences souhaitées" hint="Bonus, non bloquant">
            <TagInput tags={niceSkills} onChange={setNiceSkills} placeholder="Kafka, dbt…" />
          </Field>

          <Field label="Description du besoin">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              rows={5} placeholder="Contexte, missions, contraintes…"
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
          </Field>

          {error && (
            <div style={{
              padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA",
              borderRadius: 10, fontSize: 13, color: "#B91C1C",
            }}>{error}</div>
          )}
        </div>

        <div style={{ padding: "16px 24px", borderTop: "1px solid #F0ECF8", display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: "0 0 auto", padding: "11px 18px", borderRadius: 10,
            background: "white", border: "1px solid #E5E7EB", color: "#6B7280",
            fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>Annuler</button>
          <button onClick={submit} disabled={submitting} style={{
            flex: 1, padding: "11px 18px", borderRadius: 10, border: "none",
            background: submitting ? "#C4B6E0" : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
            color: "white", fontSize: 13, fontWeight: 700,
            cursor: submitting ? "default" : "pointer", fontFamily: "inherit",
          }}>
            {submitting ? "Création + analyse…" : "Créer le poste"}
          </button>
        </div>
      </m.div>
    </>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: "#9CA3AF", marginLeft: 6 }}>· {hint}</span>}
      </span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  fontSize: 13.5, color: "#111827",
  padding: "9px 12px",
  background: "#FAFAFA", border: "1px solid #E5E7EB", borderRadius: 9,
  outline: "none", fontFamily: "inherit",
}

function TagInput({ tags, onChange, placeholder }: { tags: string[]; onChange: (t: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("")
  const commit = () => {
    const v = draft.trim().replace(/,$/, "").trim()
    if (v && !tags.some((t) => t.toLowerCase() === v.toLowerCase())) {
      onChange([...tags, v])
    }
    setDraft("")
  }
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
      padding: "7px 9px", background: "#FAFAFA",
      border: "1px solid #E5E7EB", borderRadius: 9, minHeight: 38,
    }}>
      {tags.map((t) => (
        <span key={t} style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 12, color: "#4B5563",
          background: "white", border: "1px solid #F0ECF8",
          padding: "3px 6px 3px 9px", borderRadius: 6,
        }}>
          {t}
          <button onClick={() => onChange(tags.filter((x) => x !== t))} style={{
            background: "transparent", border: "none", cursor: "pointer",
            color: "#9CA3AF", fontSize: 13, lineHeight: 1, padding: 0,
          }}>✕</button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => {
          const val = e.target.value
          if (val.endsWith(",")) { setDraft(val); commit() }
          else setDraft(val)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit() }
          if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1))
        }}
        onBlur={commit}
        placeholder={tags.length === 0 ? placeholder : ""}
        style={{
          flex: 1, minWidth: 100, border: "none", outline: "none",
          background: "transparent", fontSize: 13, color: "#111827", fontFamily: "inherit",
        }}
      />
    </div>
  )
}
