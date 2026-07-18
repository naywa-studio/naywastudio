"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { m, AnimatePresence } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import { CANDIDATE_COLUMNS, type Candidate } from "@/lib/database.types"
import { customTagsOf } from "@/lib/tags"
import { matchesCandidateRef, candidateRefLabel } from "@/lib/candidate-ref"
import { SectorReviewControl } from "@/components/workspace/SectorReviewControl"
import { sectorColors } from "@/lib/sector-color"
import type { SectorStatus } from "@/lib/database.types"
import { useEscapeKey } from "@/components/ui/useEscapeKey"
import { VivierSkeleton } from "@/components/workspace/PageSkeletons"
import { QuotaGauges } from "@/components/quota/QuotaGauges"
// VivierMapView et ZonesManager retirés temporairement de l'UI.
// Le code reste dispo (components/workspace/VivierMapView.tsx +
// ZonesManager.tsx + API /api/vivier/cluster, /api/vivier/zones) pour
// quand on retravaillera la taxonomie. Pour l'instant : vue Liste pure,
// pas de clustering automatique, pas de zones, juste les CVs uploadés.
import { showUndoToast } from "@/components/ui/UndoToast"
import { useWorkspace } from "../layout"

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

interface SectorInfo {
  id: string
  name: string
  description: string | null
  count: number
  created_by?: "user" | "nora"
}

const UNCLASSIFIED = "__unclassified__"

// ViewMode retiré : vue Liste uniquement (cf. import note ci-dessus).

// SECTOR_META / SECTOR_ORDER / SENIORITY_OPTIONS retirés : la classification
// est désormais 100 % faite par Nora (cluster_assignments). Plus de liste
// fermée de secteurs ni de filtres avancés sur la page Vivier.

export default function VivierPage() {
  // Lecture seule (lockdown / essai expiré / sans siège) : tout upload est
  // interdit côté serveur (requireActiveAccess). On grise aussi l'UI pour
  // éviter les 403 déroutants.
  const { isReadOnly } = useWorkspace()
  const sb = useMemo(() => getSupabase(), [])
  const [userId, setUserId] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [sectorsData, setSectorsData] = useState<SectorInfo[]>([])
  /** Navigation vivier : overview (cartes) | "__unclassified__" | nom de secteur. */
  const [view, setView] = useState<string>("overview")
  const [createOpen, setCreateOpen] = useState(false)
  const [classifying, setClassifying] = useState(false)
  /** CV importés dans cette session — pour montrer où ils atterrissent. */
  const [recentIds, setRecentIds] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const allSectors = useMemo(() => sectorsData.map((s) => s.name), [sectorsData])

  // Secteurs de l'org (nom + définition + comptage) — alimente les cartes du
  // vivier + le dropdown de reclassement. Seed initial fait côté GET.
  const refetchSectors = useCallback(async () => {
    try {
      const res = await fetch("/api/sectors")
      const data = await res.json().catch(() => null) as
        { sectors?: SectorInfo[] } | null
      if (data?.sectors) setSectorsData(data.sectors)
    } catch { /* best-effort */ }
  }, [])

  useEffect(() => { void refetchSectors() }, [refetchSectors])

  const registerSector = useCallback((name: string) => {
    setSectorsData((prev) => prev.some((s) => s.name.toLowerCase() === name.toLowerCase())
      ? prev
      : [...prev, { id: name, name, description: null, count: 0, created_by: "user" }])
  }, [])

  const applyCandidateSectors = useCallback((candId: string, sectors: string[], status: SectorStatus) => {
    setCandidates((prev) => prev.map((c) => c.id === candId ? { ...c, sectors, sector_status: status } : c))
    void refetchSectors()
  }, [refetchSectors])

  // "Classer le vivier" — Nora range les candidats "à classer".
  const runClassifyVivier = useCallback(async () => {
    if (isReadOnly) return
    setClassifying(true)
    try {
      const res = await fetch("/api/sectors/classify-vivier", { method: "POST" })
      if (res.ok) {
        // Refetch candidats + secteurs (Realtime peut rater les updates admin).
        const { data } = await sb
          .from("candidates").select(CANDIDATE_COLUMNS)
          .not("tags", "cs", "{ancien}")
          .order("created_at", { ascending: false }).limit(1000)
        setCandidates((data ?? []) as unknown as Candidate[])
        await refetchSectors()
      }
    } finally {
      setClassifying(false)
    }
  }, [sb, refetchSectors, isReadOnly])

  // Vue Liste uniquement — toggle Carte/Liste retiré le temps de
  // retravailler la taxonomie (Sprint B' juin 2026).
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
        .limit(1000)
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

    // Cap large pour les uploads de masse (200+ CVs d'un coup). Conserve
    // la sécu DOM contre un dump pathologique de 5000 fichiers.
    setJobs((prev) => [
      ...invalid,
      ...pending.map<UploadJob>(({ id, file }) => ({
        id, fileName: file.name, size: file.size, status: "uploading",
      })),
      ...prev,
    ].slice(0, 500))

    const patch = (id: string, p: Partial<UploadJob>) =>
      setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...p } : j)))

    // Upload en parallèle avec concurrence limitée. À 222 fichiers en
    // série on prend ~7 min ; à 5 en parallèle on tombe à ~90 s. Limite
    // à 5 pour ne pas saturer R2 ni faire griller le pool de connexions
    // du navigateur.
    const CONCURRENCY = 5
    const uploadOne = async ({ id, file }: { id: string; file: File }) => {
      try {
        const fd = new FormData()
        fd.append("file", file, file.name)
        const res = await fetch("/api/cv/upload", { method: "POST", body: fd })
        const data = await res.json().catch(() => ({} as Record<string, unknown>))
        if (!res.ok || data?.error) {
          patch(id, { status: "error", error: String(data?.message ?? data?.error ?? `HTTP ${res.status}`) })
          return
        }
        const cand = (data as { candidate?: Candidate }).candidate
        // Optimistic insert — don't wait for Realtime, which may be slow
        // or miss the event entirely (background tab, websocket hiccup).
        // The Realtime UPDATE will later overwrite this row by id, so no
        // risk of duplicates.
        if (cand?.id) {
          const cid = cand.id
          setCandidates((prev) =>
            prev.some((c) => c.id === cid) ? prev : [cand, ...prev]
          )
          setRecentIds((prev) => prev.includes(cid) ? prev : [cid, ...prev])
          // Trigger parse in background — we explicitly don't await it.
          void fetch(`/api/cv/${cid}/parse`, { method: "POST", keepalive: true }).catch(() => {})
        }
        patch(id, { status: "done", candidateId: cand?.id })
        setTimeout(() => {
          setJobs((prev) => prev.filter((j) => !(j.id === id && j.status === "done")))
        }, 2400)
      } catch (err) {
        patch(id, { status: "error", error: (err as Error).message ?? "Erreur réseau." })
      }
    }

    // Pool de workers — chaque worker pioche dans la queue jusqu'à
    // épuisement. Tolère les fichiers qui plantent (uploadOne avale
    // ses propres erreurs et patch le job en "error").
    const queue = [...pending]
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const next = queue.shift()
        if (!next) return
        await uploadOne(next)
      }
    })
    await Promise.all(workers)
  }, [])

  const onFilesPicked = (files: FileList | null) => {
    if (isReadOnly) return
    if (!files || files.length === 0) return
    enqueue(Array.from(files))
  }

  // 3. Drag handlers
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (isReadOnly) return
    const files = Array.from(e.dataTransfer?.files ?? [])
    if (files.length) enqueue(files)
  }, [enqueue, isReadOnly])

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

  // Regroupement par secteur pour la navigation "2 zones" du vivier.
  //  - À classer : sector_status 'to_review' OU aucun secteur.
  //  - Par secteur : un candidat hybride apparaît dans chacun de ses secteurs.
  const unclassifiedList = useMemo(
    () => parsedOrErrored.filter((c) => c.sector_status === "to_review" || (c.sectors ?? []).length === 0),
    [parsedOrErrored],
  )
  const candidatesInView = useMemo(() => {
    if (view === "overview") return []
    if (view === UNCLASSIFIED) return unclassifiedList
    return parsedOrErrored.filter((c) => (c.sectors ?? []).includes(view))
  }, [view, parsedOrErrored, unclassifiedList])

  // CV importés dans cette session (parsés) — pour voir où ils atterrissent.
  const recentParsed = useMemo(
    () => parsedOrErrored.filter((c) => recentIds.includes(c.id)),
    [parsedOrErrored, recentIds],
  )

  // 5. Deletion — optimistic UI + undo toast (5 sec). The actual API
  // call only fires if the sourcer doesn't click "Annuler" in the toast.
  const handleDelete = async (id: string) => {
    if (isReadOnly) return
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
    if (isReadOnly) return
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
          .limit(1000)
        setCandidates((data ?? []) as unknown as Candidate[])
      }
    } finally {
      setDedupRunning(false)
    }
  }, [sb, isReadOnly])

  if (!userId && loading) {
    return <VivierSkeleton />
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
              border: "2px dashed var(--nw-primary)",
              padding: "48px 64px",
              boxShadow: "0 24px 64px rgba(124,99,200,0.25)",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>📥</div>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--nw-text)" }}>
                Lâchez vos PDFs ici
              </p>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--nw-text-muted)" }}>
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
            fontSize: 11, fontWeight: 700, color: "var(--nw-primary)",
            background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.18)",
            padding: "4px 11px", borderRadius: 100,
            letterSpacing: "0.08em", textTransform: "uppercase",
            marginBottom: 12,
          }}>
            Vivier
          </span>
          <h1 style={{
            margin: 0, fontSize: "clamp(26px, 3vw, 34px)", fontWeight: 800,
            color: "var(--nw-text)", letterSpacing: "-0.025em", lineHeight: 1.1,
          }}>
            Votre base de CVs
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--nw-text-muted)", lineHeight: 1.6 }}>
            {candidates.length === 0
              ? "Glissez vos PDFs ici — Nora extrait nom, expérience, compétences."
              : `${candidates.length} candidat${candidates.length > 1 ? "s" : ""} dans votre vivier.`}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <QuotaGauges variant="inline" />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={isReadOnly}
            title={isReadOnly ? "Lecture seule — souscrivez pour importer des CVs" : undefined}
            style={{
              fontSize: 13, fontWeight: 700, color: "white",
              background: isReadOnly ? "var(--nw-primary-200)" : "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
              border: "none", borderRadius: 10, padding: "10px 18px",
              cursor: isReadOnly ? "not-allowed" : "pointer",
              boxShadow: isReadOnly ? "none" : "0 6px 20px -8px rgba(124,99,200,0.55)",
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
              background: "white", borderRadius: 14, border: "1px solid var(--nw-border-soft)",
              padding: 14,
            }}
          >
            {jobs.map((j) => (
              <div key={j.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                fontSize: 13, color: "var(--nw-text-body)",
              }}>
                <JobIcon status={j.status} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {j.fileName}
                </span>
                <span style={{ fontSize: 11, color: j.status === "error" ? "var(--nw-danger-strong)" : "var(--nw-text-muted)" }}>
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
                fontSize: 13.5, color: "var(--nw-text)",
                padding: "10px 14px",
                background: "white",
                border: "1px solid var(--nw-border)",
                borderRadius: 10,
                outline: "none", fontFamily: "inherit",
                transition: "border-color 150ms, box-shadow 150ms",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--nw-primary-200)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,99,200,0.10)" }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--nw-border)"; e.currentTarget.style.boxShadow = "none" }}
            />
            <span style={{ fontSize: 12, color: "var(--nw-text-muted)" }}>
              {filtered.length}{filtered.length !== candidates.length ? ` / ${candidates.length}` : ""} candidat{filtered.length > 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}

      {/* Doublon banner — Nora a trouvé X doublons, "Lancer le tri" */}
      {doublonCount > 0 && !isReadOnly && (
        <div style={{
          marginBottom: 20, padding: "12px 16px",
          background: "rgba(245,158,11,0.07)",
          border: "1px solid rgba(245,158,11,0.3)",
          borderRadius: 12,
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 13.5, color: "var(--nw-warn-strong)", flex: 1, minWidth: 240 }}>
            <strong>✦ Nora a trouvé {doublonCount} doublon{doublonCount > 1 ? "s" : ""} potentiel{doublonCount > 1 ? "s" : ""}.</strong>
            {" "}Elle peut garder la version la plus à jour de chaque candidat et masquer les autres.
          </span>
          <button
            onClick={runDedup}
            disabled={dedupRunning}
            style={{
              fontSize: 12.5, fontWeight: 700, color: "white",
              background: dedupRunning ? "var(--nw-primary-200)" : "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
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
              borderTopColor: "var(--nw-primary)",
              animation: "spin 0.9s linear infinite",
            }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--nw-primary)", letterSpacing: "0.02em" }}>
              Parsing en cours
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: "var(--nw-primary)",
              background: "white", border: "1px solid rgba(124,99,200,0.22)",
              borderRadius: 100, padding: "1px 8px",
            }}>{parsingCandidates.length}</span>
            <span style={{ fontSize: 11.5, color: "var(--nw-text-muted)", marginLeft: "auto" }}>
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

      {/* Contenu principal : recherche → liste plate ; sinon navigation par
          secteurs (overview cartes → liste des CV). */}
      {empty ? (
        <EmptyDropZone onPick={() => inputRef.current?.click()} readOnly={isReadOnly} />
      ) : query.trim() ? (
        // Recherche active → résultats à plat, on ignore la navigation secteur.
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}>
          {parsedOrErrored.map((c, i) => (
            <CandidateCard
              key={c.id} c={c} delay={Math.min(i * 0.03, 0.25)}
              onDelete={() => handleDelete(c.id)}
              allSectors={allSectors}
              onSectorCreated={registerSector}
              onSectorChange={(sectors, status) => applyCandidateSectors(c.id, sectors, status)}
              readOnly={isReadOnly}
            />
          ))}
          {parsedOrErrored.length === 0 && (
            <div style={{ gridColumn: "1 / -1", padding: 40, textAlign: "center", color: "var(--nw-text-muted)", fontSize: 14 }}>
              Aucun candidat ne correspond à la recherche.
            </div>
          )}
        </div>
      ) : view === "overview" ? (
        <>
          {recentParsed.length > 0 && (
            <RecentUploadsStrip
              candidates={recentParsed}
              onDelete={handleDelete}
              allSectors={allSectors}
              onSectorCreated={registerSector}
              onSectorChange={applyCandidateSectors}
              readOnly={isReadOnly}
            />
          )}
          <SectorOverview
            sectors={sectorsData}
            unclassifiedCount={unclassifiedList.length}
            onOpen={setView}
            onCreate={() => setCreateOpen(true)}
            onClassify={runClassifyVivier}
            classifying={classifying}
            readOnly={isReadOnly}
          />
        </>
      ) : (
        <SectorDetail
          view={view}
          sector={sectorsData.find((s) => s.name === view) ?? null}
          candidates={candidatesInView}
          onBack={() => setView("overview")}
          onDelete={handleDelete}
          allSectors={allSectors}
          onSectorCreated={registerSector}
          onSectorChange={applyCandidateSectors}
          onRenamed={(oldName, newName) => {
            setView(newName)
            void refetchSectors()
            // rafraîchit les candidats (le nom a changé côté serveur).
            setCandidates((prev) => prev.map((c) => ({
              ...c,
              sectors: (c.sectors ?? []).map((s) => s === oldName ? newName : s),
            })))
          }}
          onDeletedSector={(name) => {
            setView("overview")
            void refetchSectors()
            setCandidates((prev) => prev.map((c) => ({
              ...c,
              sectors: (c.sectors ?? []).filter((s) => s !== name),
            })))
          }}
          readOnly={isReadOnly}
        />
      )}

      {createOpen && !isReadOnly && (
        <CreateSectorModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); void refetchSectors() }}
        />
      )}
    </main>
  )
}

/* ─── Sub-components ──────────────────────────────────────────────── */

function JobIcon({ status }: { status: UploadJob["status"] }) {
  const map = {
    uploading: { color: "var(--nw-primary)", anim: true,  icon: "↑" },
    parsing:   { color: "var(--nw-primary)", anim: true,  icon: "✦" },
    done:      { color: "#16a34a", anim: false, icon: "✓" },
    error:     { color: "var(--nw-danger-strong)", anim: false, icon: "!" },
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

function CandidateCard({
  c, delay, onDelete, allSectors, onSectorCreated, onSectorChange, readOnly = false,
}: {
  c: Candidate
  delay: number
  onDelete: () => void
  allSectors: string[]
  onSectorCreated: (name: string) => void
  onSectorChange: (sectors: string[], status: SectorStatus) => void
  readOnly?: boolean
}) {
  const initials = (c.full_name ?? c.cv_file_name ?? "?")
    .split(/\s+/).slice(0, 2).map((s) => s[0] ?? "").join("").toUpperCase() || "?"

  const parsing = c.parse_status === "parsing" || c.parse_status === "pending"
  const errored = c.parse_status === "error"

  // Barre couleur = SECTEUR du candidat (nouveau système). Secteur primaire =
  // 1ᵉʳ de c.sectors ; dégradé vers le 2ᵉ pour les profils hybrides. Pas de
  // secteur (à classer) → gris neutre.
  const primarySector = (c.sectors ?? [])[0] ?? null
  const secondarySector = (c.sectors ?? [])[1] ?? null
  const barBackground = !primarySector
    ? "var(--nw-border)"
    : secondarySector
      ? `linear-gradient(180deg, ${sectorColors(primarySector).solid} 0%, ${sectorColors(secondarySector).solid} 100%)`
      : sectorColors(primarySector).solid

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: EASE }}
      style={{
        background: "white", borderRadius: 12,
        border: `1px solid ${errored ? "var(--nw-danger-border)" : "var(--nw-border-soft)"}`,
        padding: "12px 14px 12px 16px",
        display: "flex", flexDirection: "column", gap: 8,
        // overflow visible : le dropdown de reclassement (SectorReviewControl)
        // doit pouvoir déborder de la carte sans être coupé.
        position: "relative", overflow: "visible",
        transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms",
      }}
      whileHover={{ y: -2 }}
    >
      {/* Bande couleur secteur — gradient si profil hybride (Nora) */}
      {!errored && !parsing && (
        <span style={{
          position: "absolute", top: 0, bottom: 0, left: 0, width: 4,
          background: barBackground,
          borderTopLeftRadius: 12, borderBottomLeftRadius: 12,
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
          color:      errored ? "var(--nw-danger-strong)" : "var(--nw-primary)",
          border:     errored ? "1px solid #FCA5A5" : "1px solid rgba(124,99,200,0.18)",
        }}>
          {errored ? "Erreur parsing" : "Parsing…"}
        </span>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "linear-gradient(135deg, var(--nw-border-soft) 0%, var(--nw-primary-100) 100%)",
          color: "var(--nw-primary)", fontSize: 11.5, fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{
            margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--nw-text)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {c.full_name ?? (parsing ? "Parsing en cours…" : c.cv_file_name ?? "Sans nom")}
          </p>
          <p style={{
            margin: "1px 0 0", fontSize: 11.5, color: "var(--nw-text-muted)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {c.current_title ?? (errored ? c.parse_error ?? "Erreur" : "—")}
            {c.current_company ? <> · <span style={{ color: "var(--nw-text-muted)" }}>{c.current_company}</span></> : null}
          </p>
          <p style={{
            margin: "2px 0 0", fontSize: 9.5, fontWeight: 700, color: "var(--nw-text-muted)",
            letterSpacing: "0.04em",
            fontFamily: "var(--nw-font-mono)",
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
              fontSize: 10, color: "var(--nw-text-secondary)",
              background: "var(--nw-bg)", border: "1px solid var(--nw-border-soft)",
              padding: "2px 7px", borderRadius: 5,
            }}>
              {s}
            </span>
          ))}
          {c.skills.length > 3 && (
            <span style={{ fontSize: 10, color: "var(--nw-text-muted)", padding: "2px 3px" }}>
              +{c.skills.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Pied : métadonnées (peuvent passer à la ligne) PUIS ligne d'actions
          stable (secteur à gauche, Ouvrir/× à droite toujours alignés). */}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--nw-text-muted)", flexWrap: "wrap", minHeight: 16 }}>
          {c.location ?? "—"}
          {c.years_experience != null && <span>· {c.years_experience}a</span>}
          {customTagsOf(c.tags).slice(0, 2).map((t) => (
            <span key={t} style={{
              fontSize: 10, fontWeight: 600, color: "var(--nw-text-secondary)",
              background: "white", border: "1px solid var(--nw-primary-100)",
              borderRadius: 100, padding: "1px 8px",
            }}>
              {t}
            </span>
          ))}
          {customTagsOf(c.tags).length > 2 && (
            <span style={{ fontSize: 10, color: "var(--nw-text-muted)" }}>+{customTagsOf(c.tags).length - 2}</span>
          )}
          {c.tags?.includes("doublon") && (
            <span style={{
              background: "#FEF3C7", color: "var(--nw-warn-strong)",
              border: "1px solid #FDE68A",
              padding: "2px 7px", borderRadius: 100,
              fontSize: 10, fontWeight: 700,
              letterSpacing: "0.04em", textTransform: "uppercase",
            }}>
              Doublon
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
          {/* Secteur — reclasse en un geste (dropdown en portal). */}
          {!parsing && !errored ? (
            <SectorReviewControl
              candidateId={c.id}
              sectors={c.sectors ?? []}
              status={c.sector_status ?? "to_review"}
              allSectors={allSectors}
              onSectorCreated={onSectorCreated}
              onChange={onSectorChange}
              disabled={readOnly}
            />
          ) : <span />}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
            {!readOnly && (
              <button
                onClick={onDelete}
                title="Supprimer du vivier"
                style={{
                  height: 24, width: 24, boxSizing: "border-box",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: "transparent", border: "1px solid var(--nw-border)",
                  borderRadius: 7, padding: 0, cursor: "pointer",
                  color: "var(--nw-text-muted)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--nw-danger-strong)"; e.currentTarget.style.borderColor = "#FCA5A5" }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--nw-text-muted)"; e.currentTarget.style.borderColor = "var(--nw-border)" }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
            <Link
              href={`/workspace/vivier/${c.id}`}
              style={{
                height: 28, boxSizing: "border-box",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 600, color: "var(--nw-primary)", lineHeight: 1,
                padding: "0 10px", borderRadius: 7,
                background: "rgba(124,99,200,0.08)",
                border: "1px solid rgba(124,99,200,0.16)",
                textDecoration: "none", whiteSpace: "nowrap",
              }}
            >
              Ouvrir →
            </Link>
          </div>
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
          background: "linear-gradient(135deg, var(--nw-border-soft) 0%, var(--nw-primary-100) 100%)",
          color: "var(--nw-primary)", fontSize: 16, fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <span style={{
            display: "inline-block", width: 16, height: 16, borderRadius: "50%",
            border: "2px solid rgba(124,99,200,0.25)",
            borderTopColor: "var(--nw-primary)",
            animation: "spin 0.9s linear infinite",
          }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{
            margin: 0, fontSize: 14, fontWeight: 700, color: "var(--nw-text)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {c.cv_file_name ?? "Sans nom"}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--nw-text-muted)" }}>
            {label}
          </p>
        </div>
        <button
          onClick={onDelete}
          title="Annuler"
          style={{
            background: "transparent", border: "1px solid var(--nw-border)",
            borderRadius: 8, padding: "5px 8px", cursor: "pointer",
            color: "var(--nw-text-muted)", fontSize: 11, lineHeight: 1, flexShrink: 0,
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
                ? "linear-gradient(90deg, rgba(124,99,200,0) 0%, var(--nw-primary-200) 50%, rgba(124,99,200,0) 100%)"
                : "linear-gradient(90deg, rgba(124,99,200,0) 0%, var(--nw-primary) 50%, rgba(124,99,200,0) 100%)",
              animation: "indeterminate 1.6s ease-in-out infinite",
            }} />
          ) : (
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0,
              width: `${pct}%`,
              background: "linear-gradient(90deg, var(--nw-primary) 0%, #B8AEDE 100%)",
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
          fontSize: 10.5, color: "var(--nw-text-muted)", fontVariantNumeric: "tabular-nums",
        }}>
          <span>{nearAsymptote ? "Finalisation…" : `${Math.round(pct)}%`}</span>
          {veryStalled ? (
            <button
              onClick={manualRetry}
              disabled={retrying}
              style={{
                fontSize: 11, fontWeight: 700, color: "var(--nw-primary)",
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

function EmptyDropZone({ onPick, readOnly = false }: { onPick: () => void; readOnly?: boolean }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      onClick={readOnly ? undefined : onPick}
      style={{
        cursor: readOnly ? "default" : "pointer",
        marginTop: 40,
        padding: "72px 36px",
        background: "white",
        border: "2px dashed var(--nw-primary-100)",
        borderRadius: 22,
        textAlign: "center",
        transition: "border-color 200ms, background 200ms",
      }}
      onMouseEnter={readOnly ? undefined : (e) => { e.currentTarget.style.borderColor = "var(--nw-primary-200)"; e.currentTarget.style.background = "#FBFAFE" }}
      onMouseLeave={readOnly ? undefined : (e) => { e.currentTarget.style.borderColor = "var(--nw-primary-100)"; e.currentTarget.style.background = "white" }}
    >
      <div style={{ fontSize: 56, marginBottom: 16 }}>📄</div>
      <h2 style={{
        margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: "var(--nw-text)",
        letterSpacing: "-0.015em",
      }}>
        Commencez votre vivier
      </h2>
      <p style={{ margin: "0 auto 18px", maxWidth: 480, fontSize: 14, color: "var(--nw-text-muted)", lineHeight: 1.65 }}>
        Glissez vos CVs PDF ici (ou cliquez). Nora extrait nom, expérience, compétences
        et coordonnées. Une fois votre vivier en place, vous pourrez créer des missions
        et obtenir vos shortlists automatiques.
      </p>
      <span style={{
        display: "inline-block",
        padding: "11px 22px", borderRadius: 12,
        background: readOnly ? "var(--nw-primary-200)" : "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
        color: "white", fontWeight: 700, fontSize: 14,
        boxShadow: readOnly ? "none" : "0 8px 24px -8px rgba(124,99,200,0.5)",
      }}>
        {readOnly ? "Lecture seule" : "Choisir des PDFs"}
      </span>
      <p style={{ margin: "18px 0 0", fontSize: 11, color: "var(--nw-text-muted)" }}>
        PDF uniquement · 10 Mo max · 500 fichiers max par lot
      </p>
    </m.div>
  )
}

/* ─── Récemment importés (bande scrollable) ───────────────────────── */

function RecentUploadsStrip({
  candidates, onDelete, allSectors, onSectorCreated, onSectorChange, readOnly = false,
}: {
  candidates: Candidate[]
  onDelete: (id: string) => void
  allSectors: string[]
  onSectorCreated: (name: string) => void
  onSectorChange: (candId: string, sectors: string[], status: SectorStatus) => void
  readOnly?: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState(false)

  // Détecte si la bande déborde (→ afficher les flèches).
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const check = () => setOverflow(el.scrollWidth > el.clientWidth + 4)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [collapsed, candidates.length])

  const scrollBy = (dir: 1 | -1) => {
    scrollerRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" })
  }

  const arrowBtn: React.CSSProperties = {
    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    background: "white", border: "1px solid var(--nw-border)", color: "var(--nw-primary)",
    cursor: "pointer", fontFamily: "inherit", fontSize: 14, lineHeight: 1,
  }

  return (
    <section style={{
      marginBottom: 20, background: "white",
      border: "1px solid rgba(124,99,200,0.20)", borderRadius: 14, padding: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: collapsed ? 0 : 12 }}>
        <button
          onClick={() => setCollapsed((v) => !v)}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--nw-primary)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: collapsed ? "rotate(-90deg)" : "none", transition: "transform 150ms" }} aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--nw-primary)" }}>Récemment importés</span>
        </button>
        <span style={{
          fontSize: 11, fontWeight: 700, color: "var(--nw-primary)",
          background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.18)",
          borderRadius: 100, padding: "1px 8px",
        }}>{candidates.length}</span>
        <span style={{ fontSize: 11.5, color: "var(--nw-text-muted)" }}>— vérifiez leur secteur</span>
        {!collapsed && overflow && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button onClick={() => scrollBy(-1)} style={arrowBtn} aria-label="Défiler à gauche">‹</button>
            <button onClick={() => scrollBy(1)} style={arrowBtn} aria-label="Défiler à droite">›</button>
          </div>
        )}
      </div>

      {!collapsed && (
        <div
          ref={scrollerRef}
          style={{
            display: "flex", gap: 14, overflowX: "auto", paddingBottom: 4,
            scrollbarWidth: "thin",
          }}
        >
          {candidates.map((c, i) => (
            <div key={c.id} style={{ width: 300, flexShrink: 0, display: "flex" }}>
              <div style={{ width: "100%" }}>
                <CandidateCard
                  c={c} delay={Math.min(i * 0.02, 0.15)}
                  onDelete={() => onDelete(c.id)}
                  allSectors={allSectors}
                  onSectorCreated={onSectorCreated}
                  onSectorChange={(sectors, status) => onSectorChange(c.id, sectors, status)}
                  readOnly={readOnly}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/* ─── Vivier par secteurs ─────────────────────────────────────────── */

function SectorOverview({
  sectors, unclassifiedCount, onOpen, onCreate, onClassify, classifying, readOnly = false,
}: {
  sectors: SectorInfo[]
  unclassifiedCount: number
  onOpen: (view: string) => void
  onCreate: () => void
  onClassify: () => void
  classifying: boolean
  readOnly?: boolean
}) {
  // On masque les secteurs seed VIDES (BTP… que le cabinet n'utilise pas) mais
  // on garde ceux que l'user a créés explicitement (intention), même à 0 CV.
  const visibleSectors = sectors.filter((s) => s.count > 0 || s.created_by === "user")
  return (
    <div>
      {/* Barre d'actions secteurs */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--nw-text-body)" }}>Rangé par secteur</span>
        <span style={{ fontSize: 11.5, color: "var(--nw-text-muted)" }}>
          · un profil hybride peut appartenir à plusieurs secteurs
        </span>
        {/* Actions de mutation masquées en lecture seule. */}
        {!readOnly && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {unclassifiedCount > 0 && (
              <button
                onClick={onClassify}
                disabled={classifying}
                style={{
                  fontSize: 12.5, fontWeight: 700,
                  color: classifying ? "var(--nw-text-muted)" : "var(--nw-primary)",
                  background: "white", border: "1px solid rgba(124,99,200,0.30)",
                  borderRadius: 9, padding: "8px 13px",
                  cursor: classifying ? "default" : "pointer", fontFamily: "inherit",
                }}
              >
                {classifying ? "Nora range…" : "Classer le vivier"}
              </button>
            )}
            <button
              onClick={onCreate}
              style={{
                fontSize: 12.5, fontWeight: 700, color: "white",
                background: "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
                border: "none", borderRadius: 9, padding: "8px 14px",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              + Créer un secteur
            </button>
          </div>
        )}
      </div>

      {/* Zone 1 — À classer (seule action requise, en tête). */}
      {unclassifiedCount > 0 && (
        <button
          onClick={() => onOpen(UNCLASSIFIED)}
          style={{
            display: "flex", alignItems: "center", gap: 12, width: "100%",
            textAlign: "left", cursor: "pointer", fontFamily: "inherit",
            padding: "14px 16px", marginBottom: 16, borderRadius: 14,
            background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.30)",
          }}
        >
          <span style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: "rgba(245,158,11,0.14)", color: "var(--nw-warn)",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
          </span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: "var(--nw-warn-strong)" }}>
              À classer
            </span>
            <span style={{ display: "block", fontSize: 12, color: "var(--nw-warn)", marginTop: 1 }}>
              {unclassifiedCount} candidat{unclassifiedCount > 1 ? "s" : ""} que Nora n&apos;a pas su ranger — un clic pour les placer.
            </span>
          </span>
          <span style={{ fontSize: 18, color: "var(--nw-warn)" }}>→</span>
        </button>
      )}

      {/* Zone 2 — Cartes par secteur. */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 14,
      }}>
        {visibleSectors.map((s) => (
          <button
            key={s.id}
            onClick={() => onOpen(s.name)}
            style={{
              display: "flex", flexDirection: "column", gap: 6, textAlign: "left",
              cursor: "pointer", fontFamily: "inherit",
              padding: "16px 16px", borderRadius: 14,
              background: "white", border: "1px solid var(--nw-border-soft)",
              transition: "border-color 150ms, transform 150ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#D8CEF0"; e.currentTarget.style.transform = "translateY(-2px)" }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--nw-border-soft)"; e.currentTarget.style.transform = "none" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: sectorColors(s.name).solid, flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--nw-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.name}
              </span>
              <span style={{
                fontSize: 12, fontWeight: 800, color: "var(--nw-primary)",
                background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.18)",
                borderRadius: 100, padding: "1px 9px", fontVariantNumeric: "tabular-nums",
              }}>
                {s.count}
              </span>
            </div>
            {s.description && (
              <span style={{ fontSize: 11.5, color: "var(--nw-text-muted)", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {s.description}
              </span>
            )}
          </button>
        ))}
        {visibleSectors.length === 0 && (
          <div style={{ gridColumn: "1 / -1", padding: 30, textAlign: "center", color: "var(--nw-text-muted)", fontSize: 13 }}>
            Aucun secteur avec des candidats. Créez-en un ou laissez Nora classer le vivier.
          </div>
        )}
      </div>
    </div>
  )
}

function SectorDetail({
  view, sector, candidates, onBack, onDelete, allSectors, onSectorCreated, onSectorChange, onRenamed, onDeletedSector, readOnly = false,
}: {
  view: string
  sector: SectorInfo | null
  candidates: Candidate[]
  onBack: () => void
  onDelete: (id: string) => void
  allSectors: string[]
  onSectorCreated: (name: string) => void
  onSectorChange: (candId: string, sectors: string[], status: SectorStatus) => void
  onRenamed: (oldName: string, newName: string) => void
  onDeletedSector: (name: string) => void
  readOnly?: boolean
}) {
  const isUnclassified = view === UNCLASSIFIED
  const title = isUnclassified ? "À classer" : view
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(view)
  const [busy, setBusy] = useState(false)

  const doRename = async () => {
    if (readOnly) return
    const n = newName.trim()
    if (!sector || !n || n === view) { setRenaming(false); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/sectors/${sector.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n }),
      })
      if (res.ok) onRenamed(view, n)
    } finally { setBusy(false); setRenaming(false) }
  }

  const doDelete = async () => {
    if (readOnly || !sector) return
    if (!confirm(`Supprimer le secteur "${view}" ? Les candidats ne seront pas supprimés, seulement retirés de ce secteur.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/sectors/${sector.id}`, { method: "DELETE" })
      if (res.ok) onDeletedSector(view)
    } finally { setBusy(false) }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={onBack} style={{
          fontSize: 13, fontWeight: 600, color: "var(--nw-primary)",
          background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0,
        }}>← Secteurs</button>
        {renaming ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") void doRename(); if (e.key === "Escape") setRenaming(false) }}
              style={{ fontSize: 15, fontWeight: 700, color: "var(--nw-text)", padding: "4px 8px", border: "1px solid var(--nw-primary-200)", borderRadius: 7, outline: "none", fontFamily: "inherit" }}
            />
            <button onClick={doRename} disabled={busy} style={{ fontSize: 12, fontWeight: 700, color: "white", background: "var(--nw-primary)", border: "none", borderRadius: 7, padding: "5px 11px", cursor: "pointer", fontFamily: "inherit" }}>OK</button>
            <button onClick={() => setRenaming(false)} style={{ fontSize: 12, color: "var(--nw-text-muted)", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
          </div>
        ) : (
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--nw-text)", letterSpacing: "-0.01em" }}>
            {title}
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--nw-text-muted)", marginLeft: 8 }}>{candidates.length}</span>
          </h2>
        )}
        {!isUnclassified && sector && !renaming && !readOnly && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={() => { setNewName(view); setRenaming(true) }} style={{ fontSize: 12, fontWeight: 600, color: "var(--nw-text-muted)", background: "white", border: "1px solid var(--nw-border)", borderRadius: 8, padding: "6px 11px", cursor: "pointer", fontFamily: "inherit" }}>Renommer</button>
            <button onClick={doDelete} disabled={busy} style={{ fontSize: 12, fontWeight: 600, color: "var(--nw-danger-strong)", background: "white", border: "1px solid #FCA5A5", borderRadius: 8, padding: "6px 11px", cursor: "pointer", fontFamily: "inherit" }}>Supprimer</button>
          </div>
        )}
      </div>

      {isUnclassified && (
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--nw-warn)", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 10, padding: "10px 13px" }}>
          Nora n&apos;était pas sûre pour ces profils. Choisissez leur secteur ci-dessous (ou laissez, ils restent matchables).
        </p>
      )}

      {candidates.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--nw-text-muted)", fontSize: 14, background: "white", border: "1px dashed var(--nw-primary-100)", borderRadius: 14 }}>
          Aucun candidat dans ce secteur.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {candidates.map((c, i) => (
            <CandidateCard
              key={c.id} c={c} delay={Math.min(i * 0.03, 0.25)}
              onDelete={() => onDelete(c.id)}
              allSectors={allSectors}
              onSectorCreated={onSectorCreated}
              onSectorChange={(sectors, status) => onSectorChange(c.id, sectors, status)}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CreateSectorModal({
  onClose, onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  useEscapeKey(onClose)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null)
  const [defining, setDefining] = useState(false)
  const [creating, setCreating] = useState(false)
  const [asked, setAsked] = useState(false)

  const askNora = async () => {
    const n = name.trim()
    if (!n) return
    setDefining(true); setDuplicateOf(null)
    try {
      const res = await fetch("/api/sectors/define", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n }),
      })
      const data = await res.json().catch(() => null) as { description?: string; duplicate_of?: string | null } | null
      if (data) {
        setDescription(data.description ?? "")
        setDuplicateOf(data.duplicate_of ?? null)
        setAsked(true)
      }
    } finally { setDefining(false) }
  }

  const create = async () => {
    const n = name.trim()
    if (!n) return
    setCreating(true)
    try {
      const res = await fetch("/api/sectors", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, description: description.trim() || null }),
      })
      if (res.ok) onCreated()
    } finally { setCreating(false) }
  }

  return (
    <div
      role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(17,24,39,0.40)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: "var(--font-inter), sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: 460, background: "white", borderRadius: 16, padding: 22, boxShadow: "0 20px 50px -20px rgba(17,24,39,0.30)" }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--nw-text)" }}>Créer un secteur</h2>
        <p style={{ margin: "4px 0 16px", fontSize: 12.5, color: "var(--nw-text-muted)", lineHeight: 1.5 }}>
          Nommez le secteur, Nora en propose une définition — elle servira à ranger les CV de façon cohérente.
        </p>

        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--nw-text-muted)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>
          Nom du secteur
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={name} onChange={(e) => { setName(e.target.value); setAsked(false) }} autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") void askNora() }}
            placeholder="Ex : Assurance, Luxe, Aéronautique…"
            style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: "var(--nw-text)", padding: "9px 12px", border: "1px solid var(--nw-border)", borderRadius: 9, outline: "none", fontFamily: "inherit" }}
          />
          <button
            onClick={askNora} disabled={!name.trim() || defining}
            style={{ fontSize: 12.5, fontWeight: 700, color: name.trim() && !defining ? "var(--nw-primary)" : "#C4C4C4", background: "white", border: "1px solid var(--nw-border)", borderRadius: 9, padding: "0 13px", cursor: name.trim() && !defining ? "pointer" : "default", fontFamily: "inherit", whiteSpace: "nowrap" }}
          >
            {defining ? "…" : "Demander à Nora"}
          </button>
        </div>

        {duplicateOf && (
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--nw-warn)", background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.28)", borderRadius: 9, padding: "8px 11px" }}>
            Proche du secteur existant <strong>{duplicateOf}</strong>. Vous pouvez quand même créer celui-ci si c&apos;est vraiment différent.
          </p>
        )}

        {asked && (
          <div style={{ marginTop: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--nw-text-muted)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>
              Définition (modifiable)
            </label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              style={{ width: "100%", boxSizing: "border-box", fontSize: 13, lineHeight: 1.5, color: "var(--nw-text)", padding: "9px 11px", border: "1px solid var(--nw-primary-100)", background: "#FBFAFE", borderRadius: 9, outline: "none", fontFamily: "inherit", resize: "vertical" }}
            />
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={{ fontSize: 13, fontWeight: 600, color: "var(--nw-text-muted)", background: "white", border: "1px solid var(--nw-border)", borderRadius: 9, padding: "9px 15px", cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
          <button
            onClick={create} disabled={!name.trim() || creating}
            style={{ fontSize: 13, fontWeight: 700, color: "white", background: !name.trim() || creating ? "var(--nw-primary-200)" : "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)", border: "none", borderRadius: 9, padding: "9px 18px", cursor: !name.trim() || creating ? "default" : "pointer", fontFamily: "inherit" }}
          >
            {creating ? "Création…" : "Créer le secteur"}
          </button>
        </div>
      </div>
    </div>
  )
}

