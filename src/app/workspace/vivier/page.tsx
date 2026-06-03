"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { m, AnimatePresence } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import { CANDIDATE_COLUMNS, type Candidate } from "@/lib/database.types"
import { customTagsOf } from "@/lib/tags"
import { matchesCandidateRef, candidateRefLabel } from "@/lib/candidate-ref"
import { candidateClusters, clusterHue } from "@/lib/vivier-clusters"
import NoraLoader from "@/components/workspace/NoraLoader"
import VivierMapView from "@/components/workspace/VivierMapView"
import { showUndoToast } from "@/components/ui/UndoToast"

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

type ViewMode = "flat" | "map"

// SECTOR_META / SECTOR_ORDER / SENIORITY_OPTIONS retirés : la classification
// est désormais 100 % faite par Nora (cluster_assignments). Plus de liste
// fermée de secteurs ni de filtres avancés sur la page Vivier.

export default function VivierPage() {
  const sb = useMemo(() => getSupabase(), [])
  const [userId, setUserId] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Filters & view — default to sector grouping with everything collapsed
  // so the page lands as a tidy overview, not a wall of cards.
  const [viewMode, setViewMode] = useState<ViewMode>("map")
  // Les filtres avancés (séniorité, lieu, skill, complétude, secteur,
  // tag) ont été retirés au profit d'une seule barre de recherche large
  // — la recherche libre fait déjà le job sur ces 6 axes.
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
        .select(CANDIDATE_COLUMNS)
        // Hide superseded duplicates — only the freshest version of each
        // candidate appears by default.
        .not("tags", "cs", "{ancien}")
        .order("created_at", { ascending: false })
        .limit(200)
      if (!mounted) return
      // raw_text / search_tsv are intentionally not selected — unused in the UI.
      setCandidates((data ?? []) as unknown as Candidate[])
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
              // Hide rows that became "ancien" (e.g. via the dedup endpoint).
              if (next.tags?.includes("ancien")) {
                return prev.filter((c) => c.id !== next.id)
              }
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

  // 1bis. Polling safety net — while any candidate is still parsing, poll
  // those specific rows every 4 s. Realtime is the primary mechanism, but
  // websocket hiccups or backgrounded tabs occasionally miss the UPDATE
  // event and the card stays stuck on "Parsing…" until a manual refresh.
  // This is a thin fallback that stops as soon as nothing is pending.
  const pendingIdsKey = useMemo(() => {
    const ids: string[] = []
    for (const c of candidates) {
      if (c.parse_status === "pending" || c.parse_status === "parsing") ids.push(c.id)
    }
    return ids.sort().join(",")
  }, [candidates])

  useEffect(() => {
    if (!pendingIdsKey) return
    const ids = pendingIdsKey.split(",")
    let cancelled = false
    const tick = async () => {
      const { data } = await sb
        .from("candidates")
        .select(CANDIDATE_COLUMNS)
        .in("id", ids)
      if (cancelled || !data) return
      const byId = new Map<string, Candidate>()
      for (const row of data as unknown as Candidate[]) byId.set(row.id, row)
      setCandidates((prev) => prev.map((c) => byId.get(c.id) ?? c))
    }
    const interval = setInterval(tick, 4000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [pendingIdsKey, sb])

  // 1ter. Auto-retry stuck parses. /api/cv/[id]/parse is fire-and-forget
  // from the upload step — if Vercel kills the function mid-flight (timeout,
  // OOM, browser closed before keepalive completes), parse_status stays
  // "parsing" forever and the user has to manually retry. We detect rows
  // stuck for >90 s and re-fire the endpoint exactly once per candidate.
  // The route is idempotent (it resets parse_status="parsing" at the start
  // and writes the final state at the end), so this is safe.
  const retryAttemptedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      for (const c of candidates) {
        if (c.parse_status !== "parsing" && c.parse_status !== "pending") continue
        if (retryAttemptedRef.current.has(c.id)) continue
        const elapsed = now - new Date(c.created_at).getTime()
        if (elapsed > 90_000) {
          retryAttemptedRef.current.add(c.id)
          void fetch(`/api/cv/${c.id}/parse`, { method: "POST", keepalive: true }).catch(() => {})
        }
      }
    }, 10_000)
    return () => clearInterval(interval)
  }, [candidates])

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
        const cand = (data as { candidate?: Candidate }).candidate
        // Optimistic insert — don't wait for Realtime, which may be slow
        // or miss the event entirely (background tab, websocket hiccup).
        // The Realtime UPDATE will later overwrite this row by id, so no
        // risk of duplicates.
        if (cand?.id) {
          setCandidates((prev) =>
            prev.some((c) => c.id === cand.id) ? prev : [cand, ...prev]
          )
          // Trigger parse in background — we explicitly don't await it.
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
      // Match aussi sur la ref candidat (ex. "C-1A2B3C4D" ou "1A2B3C4D") :
      // utile quand un client rappelle un profil par sa ref anonyme.
      if (matchesCandidateRef(c.id, q)) return true
      const hay = [
        c.full_name, c.current_title, c.current_company, c.location, c.email,
        ...(c.skills ?? []),
        ...customTagsOf(c.tags),
      ].filter(Boolean).join(" ").toLowerCase()
      return hay.includes(q)
    })
  }, [candidates, query])

  // Split into parsing vs parsed pools. Parsing candidates have no sector
  // yet (parsed_cv is null) — putting them in "Autre" makes them feel lost.
  // Instead we surface them in a dedicated "Parsing en cours" strip at the
  // top of the page, visible in every view mode.
  const parsingCandidates = useMemo(
    () => filtered.filter((c) => c.parse_status === "pending" || c.parse_status === "parsing"),
    [filtered],
  )
  const parsedOrErrored = useMemo(
    () => filtered.filter((c) => c.parse_status !== "pending" && c.parse_status !== "parsing"),
    [filtered],
  )

  // 5. Deletion — optimistic UI + undo toast (5 sec). The actual API
  // call only fires if the sourcer doesn't click "Annuler" in the toast.
  const handleDelete = async (id: string) => {
    const removed = candidates.find((c) => c.id === id)
    if (!removed) return
    setCandidates((prev) => prev.filter((c) => c.id !== id))
    const label = removed.full_name?.trim() || "Candidat"
    const { cancelled } = await showUndoToast(`${label} supprimé`)
    if (cancelled) {
      // Realtime resync would also bring it back, but instant local restore
      // feels less janky.
      setCandidates((prev) => prev.some((c) => c.id === id) ? prev : [removed, ...prev])
      return
    }
    const res = await fetch(`/api/cv/${id}`, { method: "DELETE" })
    if (!res.ok) {
      console.error("Delete failed")
      setCandidates((prev) => prev.some((c) => c.id === id) ? prev : [removed, ...prev])
    }
  }

  // 6. Doublon detection + manual dedup trigger
  const doublonCount = useMemo(
    () => candidates.filter((c) => c.tags?.includes("doublon")).length,
    [candidates],
  )
  const [dedupRunning, setDedupRunning] = useState(false)
  const runDedup = useCallback(async () => {
    setDedupRunning(true)
    try {
      const res = await fetch("/api/candidates/dedup", { method: "POST" })
      if (res.ok) {
        // Refetch — Realtime may miss bulk tag changes done via admin client.
        const { data } = await sb
          .from("candidates")
          .select(CANDIDATE_COLUMNS)
          .not("tags", "cs", "{ancien}")
          .order("created_at", { ascending: false })
          .limit(200)
        setCandidates((data ?? []) as unknown as Candidate[])
      }
    } finally {
      setDedupRunning(false)
    }
  }, [sb])

  if (!userId && loading) {
    return <NoraLoader />
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
        maxWidth: 1640, margin: "0 auto",
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

      {/* Search bar pleine largeur + view toggle */}
      {candidates.length > 0 && (
        <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="search"
              placeholder="Rechercher par nom, poste, compétence, ref C-, tag…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                flex: 1, minWidth: 260,
                fontSize: 13.5, color: "#111827",
                padding: "10px 14px",
                background: "white",
                border: "1px solid #E5E7EB",
                borderRadius: 10,
                outline: "none", fontFamily: "inherit",
                transition: "border-color 150ms, box-shadow 150ms",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#C4B6E0"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,99,200,0.10)" }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.boxShadow = "none" }}
            />
            <div style={{ display: "flex", border: "1px solid #E5E7EB", borderRadius: 9, overflow: "hidden" }}>
              {([
                { key: "map" as ViewMode,  label: "◍ Carte" },
                { key: "flat" as ViewMode, label: "≡ Liste" },
              ]).map((m) => (
                <button
                  key={m.key}
                  onClick={() => setViewMode(m.key)}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: "9px 14px",
                    border: "none", cursor: "pointer", fontFamily: "inherit",
                    background: viewMode === m.key ? "#7C63C8" : "white",
                    color: viewMode === m.key ? "white" : "#6B7280",
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 12, color: "#9CA3AF" }}>
              {filtered.length}{filtered.length !== candidates.length ? ` / ${candidates.length}` : ""} candidat{filtered.length > 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}

      {/* Doublon banner — Nora a trouvé X doublons, "Lancer le tri" */}
      {doublonCount > 0 && (
        <div style={{
          marginBottom: 20, padding: "12px 16px",
          background: "rgba(245,158,11,0.07)",
          border: "1px solid rgba(245,158,11,0.3)",
          borderRadius: 12,
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 13.5, color: "#92400E", flex: 1, minWidth: 240 }}>
            <strong>✦ Nora a trouvé {doublonCount} doublon{doublonCount > 1 ? "s" : ""} potentiel{doublonCount > 1 ? "s" : ""}.</strong>
            {" "}Elle peut garder la version la plus à jour de chaque candidat et masquer les autres.
          </span>
          <button
            onClick={runDedup}
            disabled={dedupRunning}
            style={{
              fontSize: 12.5, fontWeight: 700, color: "white",
              background: dedupRunning ? "#C4B6E0" : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
              border: "none", borderRadius: 9, padding: "8px 14px",
              cursor: dedupRunning ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {dedupRunning ? "Tri en cours…" : "Lancer le tri"}
          </button>
        </div>
      )}

      {/* Parsing strip — surfaces in-progress CVs above all sectors so they
          never disappear into "Autre" while waiting for the LLM. */}
      {parsingCandidates.length > 0 && (
        <section style={{
          marginBottom: 18,
          background: "white",
          border: "1px solid rgba(124,99,200,0.22)",
          borderRadius: 14,
          overflow: "hidden",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px",
            background: "linear-gradient(120deg, rgba(124,99,200,0.06) 0%, rgba(124,99,200,0.02) 100%)",
            borderBottom: "1px solid rgba(124,99,200,0.14)",
          }}>
            <span style={{
              display: "inline-flex", width: 18, height: 18, borderRadius: "50%",
              border: "2px solid rgba(124,99,200,0.25)",
              borderTopColor: "#7C63C8",
              animation: "spin 0.9s linear infinite",
            }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: "#7C63C8", letterSpacing: "0.02em" }}>
              Parsing en cours
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: "#7C63C8",
              background: "white", border: "1px solid rgba(124,99,200,0.22)",
              borderRadius: 100, padding: "1px 8px",
            }}>{parsingCandidates.length}</span>
            <span style={{ fontSize: 11.5, color: "#9CA3AF", marginLeft: "auto" }}>
              Nora extrait nom, expérience, compétences…
            </span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
          <div style={{
            padding: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 14,
          }}>
            {parsingCandidates.map((c, i) => (
              <ParsingCard key={c.id} c={c} delay={Math.min(i * 0.02, 0.15)} onDelete={() => handleDelete(c.id)} />
            ))}
          </div>
        </section>
      )}

      {/* Grid / empty state */}
      {empty ? (
        <EmptyDropZone onPick={() => inputRef.current?.click()} />
      ) : viewMode === "map" ? (
        <VivierMapView
          candidates={parsedOrErrored.filter((c) => c.parse_status === "parsed")}
          onClusteringDone={async () => {
            if (!userId) return
            const { data } = await sb
              .from("candidates")
              .select(CANDIDATE_COLUMNS)
              .eq("user_id", userId)
              .not("tags", "cs", "{ancien}")
              .order("created_at", { ascending: false })
              .limit(200)
            setCandidates((data ?? []) as unknown as Candidate[])
          }}
        />
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}>
          {parsedOrErrored.map((c, i) => (
            <CandidateCard key={c.id} c={c} delay={Math.min(i * 0.03, 0.25)} onDelete={() => handleDelete(c.id)} />
          ))}
          {parsedOrErrored.length === 0 && parsingCandidates.length === 0 && candidates.length > 0 && (
            <div style={{ gridColumn: "1 / -1", padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
              Aucun candidat ne correspond aux filtres.
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

  // Couleurs de secteur, reprises de la Carte. Quand Nora a classé le
  // candidat, on prend la couleur de son secteur primaire (et un dégradé
  // vers le secondaire pour les hybrides). Sinon, fallback neutre.
  const { primary, secondary } = candidateClusters(c)
  const primaryHue = clusterHue(primary)
  const secondaryHue = secondary ? clusterHue(secondary) : null
  const barBackground = secondaryHue != null
    ? `linear-gradient(180deg, hsl(${primaryHue}, 60%, 55%) 0%, hsl(${secondaryHue}, 60%, 55%) 100%)`
    : `hsl(${primaryHue}, 60%, 55%)`

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: EASE }}
      style={{
        background: "white", borderRadius: 12,
        border: `1px solid ${errored ? "#FECACA" : "#F0ECF8"}`,
        padding: "12px 14px 12px 16px",
        display: "flex", flexDirection: "column", gap: 8,
        position: "relative", overflow: "hidden",
        transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms",
      }}
      whileHover={{ y: -2 }}
    >
      {/* Bande couleur secteur — gradient si profil hybride (Nora) */}
      {!errored && !parsing && (
        <span style={{
          position: "absolute", top: 0, bottom: 0, left: 0, width: 4,
          background: barBackground,
        }} />
      )}
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

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "linear-gradient(135deg, #F0ECF8 0%, #E2DAF6 100%)",
          color: "#7C63C8", fontSize: 11.5, fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{
            margin: 0, fontSize: 13.5, fontWeight: 700, color: "#111827",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {c.full_name ?? (parsing ? "Parsing en cours…" : c.cv_file_name ?? "Sans nom")}
          </p>
          <p style={{
            margin: "1px 0 0", fontSize: 11.5, color: "#6B7280",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {c.current_title ?? (errored ? c.parse_error ?? "Erreur" : "—")}
            {c.current_company ? <> · <span style={{ color: "#9CA3AF" }}>{c.current_company}</span></> : null}
          </p>
          <p style={{
            margin: "2px 0 0", fontSize: 9.5, fontWeight: 700, color: "#9CA3AF",
            letterSpacing: "0.04em",
            fontFamily: "var(--font-space-grotesk), monospace",
          }}>
            {candidateRefLabel(c.id)}
          </p>
        </div>
      </div>

      {/* Skills chips — limité à 3 pour garder la carte compacte. */}
      {c.skills && c.skills.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {c.skills.slice(0, 3).map((s) => (
            <span key={s} style={{
              fontSize: 10, color: "#4B5563",
              background: "#F8F6FF", border: "1px solid #F0ECF8",
              padding: "2px 7px", borderRadius: 5,
            }}>
              {s}
            </span>
          ))}
          {c.skills.length > 3 && (
            <span style={{ fontSize: 10, color: "#9CA3AF", padding: "2px 3px" }}>
              +{c.skills.length - 3}
            </span>
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between", marginTop: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#9CA3AF", flexWrap: "wrap" }}>
          {c.location ?? "—"}
          {c.years_experience != null && <span>· {c.years_experience}a</span>}
          {/* Secteur Nora — couleur reprise de la Carte pour cohérence
              visuelle. Bicolore (gradient) si profil hybride. */}
          {!parsing && !errored && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: 10, fontWeight: 700,
              color: `hsl(${primaryHue}, 55%, 35%)`,
              background: `hsl(${primaryHue}, 70%, 94%)`,
              border: `1px solid hsl(${primaryHue}, 50%, 80%)`,
              borderRadius: 100, padding: "1px 8px",
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: "50%",
                background: secondaryHue != null
                  ? `linear-gradient(180deg, hsl(${primaryHue}, 65%, 55%) 0%, hsl(${secondaryHue}, 65%, 55%) 100%)`
                  : `hsl(${primaryHue}, 65%, 55%)`,
              }} />
              {primary}
            </span>
          )}
          {customTagsOf(c.tags).slice(0, 2).map((t) => (
            <span key={t} style={{
              fontSize: 10, fontWeight: 600, color: "#4B5563",
              background: "white", border: "1px solid #E2DAF6",
              borderRadius: 100, padding: "1px 8px",
            }}>
              {t}
            </span>
          ))}
          {customTagsOf(c.tags).length > 2 && (
            <span style={{ fontSize: 10, color: "#9CA3AF" }}>+{customTagsOf(c.tags).length - 2}</span>
          )}
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
        <div style={{ display: "flex", gap: 4 }}>
          <Link
            href={`/workspace/vivier/${c.id}`}
            style={{
              fontSize: 11, fontWeight: 600, color: "#7C63C8",
              padding: "5px 10px", borderRadius: 7,
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
              borderRadius: 7, padding: "5px 8px", cursor: "pointer",
              color: "#9CA3AF",
              fontSize: 11,
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

/**
 * ParsingCard — dedicated card shown while a CV is being parsed.
 * Renders a realistic progress bar driven by elapsed time since
 * `created_at`. The curve `1 - exp(-t/14000)` rises fast at first and
 * asymptotes near 96 %, mimicking real backend progress (and never
 * showing a misleading 100 %). Past 90 s we show a discreet "Relance
 * automatique…" hint — the parent already re-fires the parse endpoint.
 */
function ParsingCard({ c, delay, onDelete }: { c: Candidate; delay: number; onDelete: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 600)
    return () => clearInterval(t)
  }, [])
  const startedAt = new Date(c.created_at).getTime()
  const elapsedMs = Math.max(0, now - startedAt)
  const elapsedSec = Math.round(elapsedMs / 1000)
  // Exponential approach to 96 % — feels alive, never hits 100 (the
  // realtime/polling update completes the perceived progress when the
  // card swaps to the parsed CandidateCard).
  const pct = Math.min(96, 100 * (1 - Math.exp(-elapsedMs / 14000)))
  // Vercel Hobby kills the function at 60 s — past that the parse has
  // either succeeded (DB update will land via Realtime/polling) or been
  // killed (parse_status stays at "parsing" until the auto-retry fires).
  const stalling = elapsedMs > 60_000
  const veryStalled = elapsedMs > 120_000
  // Subtle breathing pulse near the asymptote so the bar never looks dead.
  const nearAsymptote = pct > 80
  const [retrying, setRetrying] = useState(false)

  const label =
    veryStalled ? "Le PDF est peut-être trop complexe — réessayez."
    : stalling  ? "Plus long que d'habitude — Nora finalise."
    : elapsedSec < 6 ? "Extraction du texte…"
    : elapsedSec < 18 ? "Analyse par Nora…"
    : "Structuration des compétences…"

  const manualRetry = async () => {
    setRetrying(true)
    try {
      await fetch(`/api/cv/${c.id}/parse`, { method: "POST" })
    } catch { /* ignored — Realtime/polling will pick up the new state */ }
    setRetrying(false)
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: EASE }}
      style={{
        background: "white", borderRadius: 14,
        border: "1px solid rgba(124,99,200,0.22)",
        padding: 18,
        display: "flex", flexDirection: "column", gap: 12,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{
          width: 42, height: 42, borderRadius: "50%",
          background: "linear-gradient(135deg, #F0ECF8 0%, #E2DAF6 100%)",
          color: "#7C63C8", fontSize: 16, fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <span style={{
            display: "inline-block", width: 16, height: 16, borderRadius: "50%",
            border: "2px solid rgba(124,99,200,0.25)",
            borderTopColor: "#7C63C8",
            animation: "spin 0.9s linear infinite",
          }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{
            margin: 0, fontSize: 14, fontWeight: 700, color: "#111827",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {c.cv_file_name ?? "Sans nom"}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#9CA3AF" }}>
            {label}
          </p>
        </div>
        <button
          onClick={onDelete}
          title="Annuler"
          style={{
            background: "transparent", border: "1px solid #E5E7EB",
            borderRadius: 8, padding: "5px 8px", cursor: "pointer",
            color: "#9CA3AF", fontSize: 11, lineHeight: 1, flexShrink: 0,
          }}
        >✕</button>
      </div>

      <div>
        <div style={{
          position: "relative",
          height: 6, width: "100%",
          background: "rgba(124,99,200,0.10)",
          borderRadius: 100, overflow: "hidden",
        }}>
          {nearAsymptote ? (
            // Past 80 % we drop the percentage-driven bar — it would crawl
            // imperceptibly toward the asymptote and look frozen. Instead
            // we show an indeterminate "comet" sliding across the bar so
            // the user feels work is still happening.
            <div style={{
              position: "absolute", top: 0, bottom: 0,
              width: "40%",
              borderRadius: 100,
              background: stalling
                ? "linear-gradient(90deg, rgba(124,99,200,0) 0%, #C4B6E0 50%, rgba(124,99,200,0) 100%)"
                : "linear-gradient(90deg, rgba(124,99,200,0) 0%, #7C63C8 50%, rgba(124,99,200,0) 100%)",
              animation: "indeterminate 1.6s ease-in-out infinite",
            }} />
          ) : (
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0,
              width: `${pct}%`,
              background: "linear-gradient(90deg, #7C63C8 0%, #B8AEDE 100%)",
              borderRadius: 100,
              transition: "width 600ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}>
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
                animation: "shimmer 1.4s linear infinite",
              }} />
            </div>
          )}
        </div>
        <div style={{
          marginTop: 6, display: "flex", justifyContent: "space-between",
          alignItems: "center",
          fontSize: 10.5, color: "#9CA3AF", fontVariantNumeric: "tabular-nums",
        }}>
          <span>{nearAsymptote ? "Finalisation…" : `${Math.round(pct)}%`}</span>
          {veryStalled ? (
            <button
              onClick={manualRetry}
              disabled={retrying}
              style={{
                fontSize: 11, fontWeight: 700, color: "#7C63C8",
                background: "white",
                border: "1px solid rgba(124,99,200,0.3)",
                borderRadius: 7, padding: "3px 9px",
                cursor: retrying ? "default" : "pointer", fontFamily: "inherit",
              }}
            >
              {retrying ? "…" : "Réessayer"}
            </button>
          ) : (
            <span>{elapsedSec}s</span>
          )}
        </div>
        <style>{`
          @keyframes shimmer {
            0%   { transform: translateX(-100%); }
            100% { transform: translateX(100%);  }
          }
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes indeterminate {
            0%   { left: -40%; }
            100% { left: 100%; }
          }
        `}</style>
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
        et coordonnées. Une fois votre vivier en place, vous pourrez créer des missions
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
