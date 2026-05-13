"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { m, AnimatePresence } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import type { Candidate } from "@/lib/database.types"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]
const MAX_BYTES = 10 * 1024 * 1024

interface UploadJob {
  id: string          // local id
  fileName: string
  size: number
  status: "uploading" | "parsing" | "done" | "error"
  error?: string
  candidateId?: string
}

export default function VivierPage() {
  const sb = useMemo(() => getSupabase(), [])
  const [userId, setUserId] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // 1. Initial load + realtime
  useEffect(() => {
    let mounted = true
    let channel: ReturnType<typeof sb.channel> | null = null

    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user || !mounted) return
      setUserId(user.id)

      const { data } = await sb
        .from("candidates")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200)
      if (!mounted) return
      setCandidates((data ?? []) as Candidate[])
      setLoading(false)

      channel = sb
        .channel(`candidates:${user.id}`)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "candidates", filter: `user_id=eq.${user.id}` },
          (payload) => {
            setCandidates((prev) => {
              if (payload.eventType === "DELETE") {
                return prev.filter((c) => c.id !== (payload.old as Candidate).id)
              }
              const next = payload.new as Candidate
              const idx = prev.findIndex((c) => c.id === next.id)
              if (idx === -1) return [next, ...prev]
              const copy = [...prev]
              copy[idx] = next
              return copy
            })
          },
        )
        .subscribe()
    })()

    return () => {
      mounted = false
      if (channel) sb.removeChannel(channel)
    }
  }, [sb])

  // 2. File handling — every job has a stable local id so we never confuse
  // two files that happen to share a name.
  const enqueue = useCallback(async (files: File[]) => {
    type Pending = { id: string; file: File }
    const pending: Pending[] = []
    const invalid: UploadJob[] = []
    for (const f of files) {
      const id = crypto.randomUUID()
      const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
      if (!isPdf) {
        invalid.push({ id, fileName: f.name, size: f.size, status: "error", error: "Format non supporté (PDF uniquement)." })
        continue
      }
      if (f.size > MAX_BYTES) {
        invalid.push({ id, fileName: f.name, size: f.size, status: "error", error: "Fichier > 10 Mo." })
        continue
      }
      pending.push({ id, file: f })
    }

    setJobs((prev) => [
      ...invalid,
      ...pending.map<UploadJob>(({ id, file }) => ({
        id, fileName: file.name, size: file.size, status: "uploading",
      })),
      ...prev,
    ].slice(0, 30))

    const patch = (id: string, p: Partial<UploadJob>) =>
      setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...p } : j)))

    // Upload in series. The actual LLM parse runs in a separate, fire-and-
    // forget call so the UI is never blocked on the LLM round-trip; the
    // grid card updates via Realtime when parse_status flips.
    for (const { id, file } of pending) {
      try {
        const fd = new FormData()
        fd.append("file", file, file.name)
        const res = await fetch("/api/cv/upload", { method: "POST", body: fd })
        const data = await res.json().catch(() => ({} as Record<string, unknown>))
        if (!res.ok || data?.error) {
          patch(id, { status: "error", error: String(data?.message ?? data?.error ?? `HTTP ${res.status}`) })
          continue
        }
        const cand = (data as { candidate?: { id?: string } }).candidate
        // Trigger parse in background — we explicitly don't await it.
        if (cand?.id) {
          void fetch(`/api/cv/${cand.id}/parse`, { method: "POST", keepalive: true }).catch(() => {})
        }
        patch(id, { status: "done", candidateId: cand?.id })
        setTimeout(() => {
          setJobs((prev) => prev.filter((j) => !(j.id === id && j.status === "done")))
        }, 2400)
      } catch (err) {
        patch(id, { status: "error", error: (err as Error).message ?? "Erreur réseau." })
      }
    }
  }, [])

  const onFilesPicked = (files: FileList | null) => {
    if (!files || files.length === 0) return
    enqueue(Array.from(files))
  }

  // 3. Drag handlers
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer?.files ?? [])
    if (files.length) enqueue(files)
  }, [enqueue])

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!isDragging) setIsDragging(true)
  }
  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setIsDragging(false)
  }

  // 4. Filtering
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return candidates
    return candidates.filter((c) => {
      const hay = [
        c.full_name, c.current_title, c.current_company, c.location, c.email,
        ...(c.skills ?? []),
      ].filter(Boolean).join(" ").toLowerCase()
      return hay.includes(q)
    })
  }, [candidates, query])

  // 5. Deletion
  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce candidat du vivier ? Cette action est définitive.")) return
    setCandidates((prev) => prev.filter((c) => c.id !== id))
    const res = await fetch(`/api/cv/${id}`, { method: "DELETE" })
    if (!res.ok) {
      // Realtime will re-sync, but show a soft alert
      console.error("Delete failed")
    }
  }

  if (!userId && loading) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: "#9CA3AF" }}>
        Chargement…
      </div>
    )
  }

  const hasActiveJobs = jobs.some((j) => j.status === "uploading" || j.status === "parsing")
  const empty = !loading && candidates.length === 0 && !hasActiveJobs

  return (
    <main
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      style={{
        position: "relative",
        minHeight: "calc(100vh - 60px)",
        padding: "40px 24px 80px",
        maxWidth: 1280, margin: "0 auto",
        fontFamily: "var(--font-inter), sans-serif",
      }}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <m.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: "fixed", inset: 0, zIndex: 50,
              background: "rgba(124,99,200,0.06)",
              backdropFilter: "blur(2px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <div style={{
              background: "white", borderRadius: 24,
              border: "2px dashed #7C63C8",
              padding: "48px 64px",
              boxShadow: "0 24px 64px rgba(124,99,200,0.25)",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>📥</div>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#111827" }}>
                Lâchez vos PDFs ici
              </p>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6B7280" }}>
                Nora se charge du parsing
              </p>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
        <div>
          <span style={{
            display: "inline-block",
            fontSize: 11, fontWeight: 700, color: "#7C63C8",
            background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.18)",
            padding: "4px 11px", borderRadius: 100,
            letterSpacing: "0.08em", textTransform: "uppercase",
            marginBottom: 12,
          }}>
            Vivier
          </span>
          <h1 style={{
            margin: 0, fontSize: "clamp(26px, 3vw, 34px)", fontWeight: 800,
            color: "#111827", letterSpacing: "-0.025em", lineHeight: 1.1,
          }}>
            Votre base de CVs
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "#6B7280", lineHeight: 1.6 }}>
            {candidates.length === 0
              ? "Glissez vos PDFs ici — Nora extrait nom, expérience, compétences."
              : `${candidates.length} candidat${candidates.length > 1 ? "s" : ""} dans votre vivier.`}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="search"
            placeholder="Rechercher par nom, poste, compétence…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              minWidth: 260,
              fontSize: 13.5, color: "#111827",
              padding: "10px 14px",
              background: "white",
              border: "1px solid #E5E7EB",
              borderRadius: 10,
              outline: "none",
              fontFamily: "inherit",
              transition: "border-color 150ms, box-shadow 150ms",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "#C4B6E0"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,99,200,0.10)" }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.boxShadow = "none" }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            style={{
              fontSize: 13, fontWeight: 700, color: "white",
              background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
              border: "none", borderRadius: 10, padding: "10px 18px",
              cursor: "pointer",
              boxShadow: "0 6px 20px -8px rgba(124,99,200,0.55)",
              fontFamily: "inherit",
            }}
          >
            + Importer des CVs
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            style={{ display: "none" }}
            onChange={(e) => onFilesPicked(e.target.files)}
          />
        </div>
      </div>

      {/* Upload jobs strip */}
      <AnimatePresence>
        {jobs.length > 0 && (
          <m.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            style={{
              display: "flex", flexDirection: "column", gap: 8, marginBottom: 22,
              background: "white", borderRadius: 14, border: "1px solid #F0ECF8",
              padding: 14,
            }}
          >
            {jobs.map((j) => (
              <div key={j.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                fontSize: 13, color: "#374151",
              }}>
                <JobIcon status={j.status} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {j.fileName}
                </span>
                <span style={{ fontSize: 11, color: j.status === "error" ? "#DC2626" : "#9CA3AF" }}>
                  {j.status === "uploading" && "Upload…"}
                  {j.status === "parsing"   && "Parsing IA…"}
                  {j.status === "done"      && "✓ Ajouté"}
                  {j.status === "error"     && j.error}
                </span>
              </div>
            ))}
          </m.div>
        )}
      </AnimatePresence>

      {/* Grid / empty state */}
      {empty ? (
        <EmptyDropZone onPick={() => inputRef.current?.click()} />
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}>
          {filtered.map((c, i) => (
            <CandidateCard key={c.id} c={c} delay={Math.min(i * 0.03, 0.25)} onDelete={() => handleDelete(c.id)} />
          ))}
          {filtered.length === 0 && candidates.length > 0 && (
            <div style={{ gridColumn: "1 / -1", padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
              Aucun candidat ne correspond à « {query} »
            </div>
          )}
        </div>
      )}
    </main>
  )
}

/* ─── Sub-components ──────────────────────────────────────────────── */

function JobIcon({ status }: { status: UploadJob["status"] }) {
  const map = {
    uploading: { color: "#7C63C8", anim: true,  icon: "↑" },
    parsing:   { color: "#7C63C8", anim: true,  icon: "✦" },
    done:      { color: "#16a34a", anim: false, icon: "✓" },
    error:     { color: "#DC2626", anim: false, icon: "!" },
  }[status]
  return (
    <span style={{
      width: 22, height: 22, borderRadius: "50%",
      background: `${map.color}1a`,
      color: map.color, fontWeight: 800, fontSize: 12,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      animation: map.anim ? "spin 1.2s linear infinite" : "none",
    }}>
      {map.icon}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  )
}

function CandidateCard({ c, delay, onDelete }: { c: Candidate; delay: number; onDelete: () => void }) {
  const initials = (c.full_name ?? c.cv_file_name ?? "?")
    .split(/\s+/).slice(0, 2).map((s) => s[0] ?? "").join("").toUpperCase() || "?"

  const parsing = c.parse_status === "parsing" || c.parse_status === "pending"
  const errored = c.parse_status === "error"

  return (
    <m.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: EASE }}
      style={{
        background: "white", borderRadius: 14,
        border: `1px solid ${errored ? "#FECACA" : "#F0ECF8"}`,
        padding: 18,
        display: "flex", flexDirection: "column", gap: 12,
        position: "relative",
        transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms",
      }}
      whileHover={{ y: -2 }}
    >
      {/* Status chip */}
      {(parsing || errored) && (
        <span style={{
          position: "absolute", top: 12, right: 12,
          fontSize: 10, fontWeight: 700,
          padding: "3px 8px", borderRadius: 100,
          letterSpacing: "0.04em", textTransform: "uppercase",
          background: errored ? "#FEE2E2" : "rgba(124,99,200,0.10)",
          color:      errored ? "#B91C1C" : "#7C63C8",
          border:     errored ? "1px solid #FCA5A5" : "1px solid rgba(124,99,200,0.18)",
        }}>
          {errored ? "Erreur parsing" : "Parsing…"}
        </span>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{
          width: 42, height: 42, borderRadius: "50%",
          background: "linear-gradient(135deg, #F0ECF8 0%, #E2DAF6 100%)",
          color: "#7C63C8", fontSize: 14, fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{
            margin: 0, fontSize: 15, fontWeight: 700, color: "#111827",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {c.full_name ?? (parsing ? "Parsing en cours…" : c.cv_file_name ?? "Sans nom")}
          </p>
          <p style={{
            margin: "2px 0 0", fontSize: 12, color: "#6B7280",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {c.current_title ?? (errored ? c.parse_error ?? "Erreur" : "—")}
            {c.current_company ? <> · <span style={{ color: "#9CA3AF" }}>{c.current_company}</span></> : null}
          </p>
        </div>
      </div>

      {/* Skills chips */}
      {c.skills && c.skills.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {c.skills.slice(0, 5).map((s) => (
            <span key={s} style={{
              fontSize: 11, color: "#4B5563",
              background: "#F8F6FF", border: "1px solid #F0ECF8",
              padding: "3px 8px", borderRadius: 6,
            }}>
              {s}
            </span>
          ))}
          {c.skills.length > 5 && (
            <span style={{ fontSize: 11, color: "#9CA3AF", padding: "3px 4px" }}>
              +{c.skills.length - 5}
            </span>
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between", marginTop: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#9CA3AF" }}>
          {c.location ?? "—"}
          {c.years_experience != null && <span>· {c.years_experience}a</span>}
          {c.tags?.includes("doublon") && (
            <span style={{
              background: "#FEF3C7", color: "#92400E",
              border: "1px solid #FDE68A",
              padding: "2px 7px", borderRadius: 100,
              fontSize: 10, fontWeight: 700,
              letterSpacing: "0.04em", textTransform: "uppercase",
            }}>
              Doublon
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Link
            href={`/workspace/vivier/${c.id}`}
            style={{
              fontSize: 12, fontWeight: 600, color: "#7C63C8",
              padding: "6px 12px", borderRadius: 8,
              background: "rgba(124,99,200,0.08)",
              border: "1px solid rgba(124,99,200,0.16)",
              textDecoration: "none",
            }}
          >
            Ouvrir →
          </Link>
          <button
            onClick={onDelete}
            title="Supprimer du vivier"
            style={{
              background: "transparent", border: "1px solid #E5E7EB",
              borderRadius: 8, padding: "6px 9px", cursor: "pointer",
              color: "#9CA3AF",
              fontSize: 12,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#DC2626"; e.currentTarget.style.borderColor = "#FCA5A5" }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#9CA3AF"; e.currentTarget.style.borderColor = "#E5E7EB" }}
          >
            ✕
          </button>
        </div>
      </div>
    </m.div>
  )
}

function EmptyDropZone({ onPick }: { onPick: () => void }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      onClick={onPick}
      style={{
        cursor: "pointer",
        marginTop: 40,
        padding: "72px 36px",
        background: "white",
        border: "2px dashed #E2DAF6",
        borderRadius: 22,
        textAlign: "center",
        transition: "border-color 200ms, background 200ms",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#C4B6E0"; e.currentTarget.style.background = "#FBFAFE" }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E2DAF6"; e.currentTarget.style.background = "white" }}
    >
      <div style={{ fontSize: 56, marginBottom: 16 }}>📄</div>
      <h2 style={{
        margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: "#111827",
        letterSpacing: "-0.015em",
      }}>
        Commencez votre vivier
      </h2>
      <p style={{ margin: "0 auto 18px", maxWidth: 480, fontSize: 14, color: "#6B7280", lineHeight: 1.65 }}>
        Glissez vos CVs PDF ici (ou cliquez). Nora extrait nom, expérience, compétences
        et coordonnées. Une fois votre vivier en place, vous pourrez créer des postes
        et obtenir vos shortlists automatiques.
      </p>
      <span style={{
        display: "inline-block",
        padding: "11px 22px", borderRadius: 12,
        background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
        color: "white", fontWeight: 700, fontSize: 14,
        boxShadow: "0 8px 24px -8px rgba(124,99,200,0.5)",
      }}>
        Choisir des PDFs
      </span>
      <p style={{ margin: "18px 0 0", fontSize: 11, color: "#9CA3AF" }}>
        PDF uniquement · 10 Mo max · 50 imports / jour pendant la beta
      </p>
    </m.div>
  )
}
