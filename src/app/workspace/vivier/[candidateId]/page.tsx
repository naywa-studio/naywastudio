"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { m } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import type { Candidate, ParsedCv } from "@/lib/database.types"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

export default function CandidatePage() {
  const router = useRouter()
  const { candidateId } = useParams<{ candidateId: string }>()
  const sb = useMemo(() => getSupabase(), [])

  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [notes, setNotes] = useState("")
  const [savingNotes, setSavingNotes] = useState<"idle" | "saving" | "saved">("idle")
  const [anonState, setAnonState] = useState<"idle" | "working" | "ready" | "error">("idle")
  const [anonUrl, setAnonUrl] = useState<string | null>(null)
  const [anonError, setAnonError] = useState<string | null>(null)
  const notesRef = useRef(notes)
  useEffect(() => { notesRef.current = notes }, [notes])

  useEffect(() => {
    let mounted = true
    let channel: ReturnType<typeof sb.channel> | null = null

    ;(async () => {
      const { data, error } = await sb.from("candidates").select("*").eq("id", candidateId).single()
      if (!mounted) return
      if (error || !data) { setNotFound(true); setLoading(false); return }
      const c = data as Candidate
      setCandidate(c)
      setNotes(c.notes ?? "")

      // Mark consulted
      sb.from("candidates").update({ consulted_at: new Date().toISOString() }).eq("id", c.id).then(() => {})

      // Signed URL for PDF preview
      if (c.cv_file_path) {
        const r = await fetch(`/api/cv/${c.id}/signed-url`)
        if (r.ok) {
          const j = await r.json()
          if (mounted) setSignedUrl(j.url)
        }
      }

      // Existing anonymized PDF, if any
      if (c.anonymized_pdf_path) {
        const r = await fetch(`/api/cv/${c.id}/anonymize`)
        if (r.ok) {
          const j = await r.json()
          if (mounted && j.url) { setAnonUrl(j.url); setAnonState("ready") }
        }
      }

      setLoading(false)

      // Realtime: react to parse completion
      channel = sb
        .channel(`candidate:${c.id}`)
        .on("postgres_changes",
          { event: "UPDATE", schema: "public", table: "candidates", filter: `id=eq.${c.id}` },
          (payload) => {
            setCandidate(payload.new as Candidate)
          },
        )
        .subscribe()
    })()

    return () => {
      mounted = false
      if (channel) sb.removeChannel(channel)
    }
  }, [candidateId, sb])

  const saveNotes = async () => {
    if (!candidate) return
    if ((notesRef.current ?? "") === (candidate.notes ?? "")) return
    setSavingNotes("saving")
    await sb.from("candidates").update({ notes: notesRef.current }).eq("id", candidate.id)
    setSavingNotes("saved")
    setTimeout(() => setSavingNotes("idle"), 1600)
  }

  const handleDelete = async () => {
    if (!candidate) return
    if (!confirm("Supprimer ce candidat ? Cette action est définitive.")) return
    const res = await fetch(`/api/cv/${candidate.id}`, { method: "DELETE" })
    if (res.ok) router.push("/workspace/vivier")
  }

  const handleRetryParse = async () => {
    if (!candidate) return
    // Optimistic — Realtime will follow up
    setCandidate((prev) => prev ? { ...prev, parse_status: "parsing", parse_error: null } : prev)
    await fetch(`/api/cv/${candidate.id}/parse`, { method: "POST" }).catch(() => {})
  }

  const handleAnonymize = async () => {
    if (!candidate) return
    setAnonState("working"); setAnonError(null)
    try {
      const res = await fetch(`/api/cv/${candidate.id}/anonymize`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setAnonError(data?.message ?? data?.error ?? "Échec de l'anonymisation.")
        setAnonState("error")
        return
      }
      setAnonUrl(data.url ?? null)
      setAnonState("ready")
    } catch (err) {
      setAnonError((err as Error).message ?? "Erreur réseau.")
      setAnonState("error")
    }
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: "center", color: "#9CA3AF" }}>Chargement…</div>
  }
  if (notFound || !candidate) {
    return (
      <div style={{ padding: "60px 24px", textAlign: "center", color: "#6B7280" }}>
        <p style={{ fontSize: 16, fontWeight: 600 }}>Candidat introuvable.</p>
        <Link href="/workspace/vivier" style={{ color: "#7C63C8", textDecoration: "none", fontSize: 14 }}>
          ← Retour au vivier
        </Link>
      </div>
    )
  }

  const cv = candidate.parsed_cv ?? null

  return (
    <main style={{
      padding: "32px 24px 80px",
      maxWidth: 1280, margin: "0 auto",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      {/* Back */}
      <Link href="/workspace/vivier" style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 13, color: "#7C63C8", textDecoration: "none",
        marginBottom: 22,
      }}>
        ← Retour au vivier
      </Link>

      <m.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 380px)",
          gap: 24,
        }}
        className="cand-grid"
      >
        {/* Left: content */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Header card */}
          <section style={{
            background: "white", borderRadius: 18, border: "1px solid #F0ECF8",
            padding: 24,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "linear-gradient(135deg, #F0ECF8 0%, #E2DAF6 100%)",
                color: "#7C63C8", fontSize: 18, fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {initials(candidate.full_name ?? candidate.cv_file_name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 style={{
                  margin: 0, fontSize: 24, fontWeight: 800, color: "#111827",
                  letterSpacing: "-0.02em",
                }}>
                  {candidate.full_name ?? "Nom à compléter"}
                </h1>
                <p style={{
                  margin: "4px 0 0", fontSize: 14, color: "#6B7280",
                }}>
                  {candidate.current_title ?? "—"}
                  {candidate.current_company ? <> · <span>{candidate.current_company}</span></> : null}
                </p>
              </div>
              <button
                onClick={handleDelete}
                style={{
                  fontSize: 12, fontWeight: 600, color: "#DC2626",
                  background: "transparent", border: "1px solid #FCA5A5",
                  borderRadius: 8, padding: "7px 14px", cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Supprimer
              </button>
            </div>

            {/* Anonymisation */}
            {candidate.parse_status === "parsed" && (
              <div style={{
                marginTop: 16, padding: "14px 16px",
                background: "rgba(124,99,200,0.05)",
                border: "1px solid rgba(124,99,200,0.16)",
                borderRadius: 12,
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#111827" }}>
                    CV anonymisé
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>
                    {anonState === "ready"
                      ? "PDF prêt — sans nom, photo, contacts ni école précise."
                      : "Génère un PDF présentable à votre client, identité retirée."}
                  </p>
                  {anonError && (
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#B91C1C" }}>{anonError}</p>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {anonState === "ready" && anonUrl && (
                    <a href={anonUrl} target="_blank" rel="noreferrer" style={{
                      fontSize: 12, fontWeight: 700, color: "#7C63C8",
                      background: "white", border: "1px solid rgba(124,99,200,0.25)",
                      borderRadius: 8, padding: "8px 14px", textDecoration: "none",
                    }}>
                      Télécharger ↓
                    </a>
                  )}
                  <button
                    onClick={handleAnonymize}
                    disabled={anonState === "working"}
                    style={{
                      fontSize: 12, fontWeight: 700, color: "white",
                      background: anonState === "working"
                        ? "#C4B6E0"
                        : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                      border: "none", borderRadius: 8, padding: "8px 14px",
                      cursor: anonState === "working" ? "default" : "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {anonState === "working" ? "Génération…"
                      : anonState === "ready" ? "Régénérer"
                      : "Anonymiser"}
                  </button>
                </div>
              </div>
            )}

            {candidate.parse_status === "error" && (
              <div style={{
                marginTop: 16, padding: "12px 14px",
                background: "#FEF2F2", border: "1px solid #FECACA",
                borderRadius: 10, fontSize: 13, color: "#B91C1C",
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap",
              }}>
                <span><strong>Parsing échoué.</strong> {candidate.parse_error}</span>
                <button
                  onClick={handleRetryParse}
                  style={{
                    fontSize: 12, fontWeight: 700, color: "white",
                    background: "#DC2626", border: "none",
                    borderRadius: 8, padding: "7px 14px", cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Relancer le parsing
                </button>
              </div>
            )}
            {(candidate.parse_status === "parsing" || candidate.parse_status === "pending") && (
              <div style={{
                marginTop: 16, padding: "10px 14px",
                background: "rgba(124,99,200,0.06)", border: "1px solid rgba(124,99,200,0.18)",
                borderRadius: 10, fontSize: 13, color: "#7C63C8",
              }}>
                ✦ Nora est en train d&apos;analyser le CV…
              </div>
            )}

            {/* Contact strip */}
            <div style={{
              marginTop: 18, display: "flex", flexWrap: "wrap", gap: 14,
              fontSize: 13, color: "#374151",
            }}>
              <InfoChip label="Email"        value={candidate.email} />
              <InfoChip label="Téléphone"    value={candidate.phone} />
              <InfoChip label="Localisation" value={candidate.location} />
              <InfoChip label="Expérience"   value={candidate.years_experience != null ? `${candidate.years_experience} ans` : null} />
              <InfoChip label="Séniorité"    value={candidate.seniority_level} />
            </div>
          </section>

          {/* Summary */}
          {cv?.summary && (
            <Section title="Résumé">
              <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
                {cv.summary}
              </p>
            </Section>
          )}

          {/* Experience */}
          {cv?.experience && cv.experience.length > 0 && (
            <Section title="Expérience">
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {cv.experience.map((e, i) => (
                  <ExperienceItem key={i} e={e} />
                ))}
              </div>
            </Section>
          )}

          {/* Skills */}
          {candidate.skills && candidate.skills.length > 0 && (
            <Section title="Compétences">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {candidate.skills.map((s) => (
                  <span key={s} style={{
                    fontSize: 12, color: "#4B5563",
                    background: "#F8F6FF", border: "1px solid #F0ECF8",
                    padding: "5px 10px", borderRadius: 7,
                  }}>{s}</span>
                ))}
              </div>
            </Section>
          )}

          {/* Education */}
          {cv?.education && cv.education.length > 0 && (
            <Section title="Formation">
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                {cv.education.map((ed, i) => (
                  <li key={i} style={{ fontSize: 13.5, color: "#374151", lineHeight: 1.55 }}>
                    <strong style={{ color: "#111827" }}>{ed.degree}</strong>
                    {ed.field ? `, ${ed.field}` : ""}
                    {ed.school ? <> — <span style={{ color: "#6B7280" }}>{ed.school}</span></> : null}
                    {(ed.start || ed.end) && (
                      <span style={{ color: "#9CA3AF", marginLeft: 8 }}>· {ed.start ?? ""}{ed.end ? `–${ed.end}` : ""}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Languages + Certs */}
          {((cv?.languages && cv.languages.length > 0) || (cv?.certifications && cv.certifications.length > 0)) && (
            <Section title="Autres">
              {cv.languages && cv.languages.length > 0 && (
                <p style={{ margin: "0 0 8px", fontSize: 13, color: "#374151" }}>
                  <strong style={{ color: "#111827" }}>Langues:</strong> {cv.languages.join(" · ")}
                </p>
              )}
              {cv.certifications && cv.certifications.length > 0 && (
                <p style={{ margin: 0, fontSize: 13, color: "#374151" }}>
                  <strong style={{ color: "#111827" }}>Certifications:</strong> {cv.certifications.join(" · ")}
                </p>
              )}
            </Section>
          )}

          {/* Notes */}
          <Section
            title="Notes"
            right={savingNotes === "saving" ? <SmallStatus color="#7C63C8" label="Enregistrement…" />
              : savingNotes === "saved" ? <SmallStatus color="#16a34a" label="✓ Sauvegardé" /> : null}
          >
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Vos observations privées sur ce candidat…"
              rows={4}
              style={{
                width: "100%", boxSizing: "border-box",
                fontSize: 13.5, color: "#111827",
                padding: 12,
                background: "#FAFAFA",
                border: "1px solid #F0ECF8",
                borderRadius: 10,
                outline: "none",
                resize: "vertical",
                fontFamily: "inherit",
                lineHeight: 1.6,
              }}
            />
          </Section>
        </div>

        {/* Right: PDF preview */}
        <aside style={{
          background: "white", borderRadius: 18, border: "1px solid #F0ECF8",
          overflow: "hidden",
          display: "flex", flexDirection: "column",
          minHeight: 540,
          position: "sticky", top: 80,
          alignSelf: "flex-start",
        }} className="cand-aside">
          <div style={{
            padding: "12px 16px",
            borderBottom: "1px solid #F0ECF8",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: 12, fontWeight: 600, color: "#6B7280",
          }}>
            <span>CV original</span>
            {signedUrl && (
              <a href={signedUrl} target="_blank" rel="noreferrer" style={{
                fontSize: 11, fontWeight: 700, color: "#7C63C8",
                textDecoration: "none",
              }}>
                Ouvrir ↗
              </a>
            )}
          </div>
          {signedUrl ? (
            <iframe
              src={signedUrl}
              title={candidate.cv_file_name ?? "CV"}
              style={{ flex: 1, width: "100%", border: "none", minHeight: 520 }}
            />
          ) : (
            <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
              {candidate.cv_file_path ? "Préparation de l'aperçu…" : "Pas de fichier."}
            </div>
          )}
        </aside>
      </m.div>

      <style>{`
        @media (max-width: 920px) {
          .cand-grid { grid-template-columns: 1fr !important; }
          .cand-aside { position: static !important; min-height: 480px; }
        }
      `}</style>
    </main>
  )
}

/* ─── Bits ────────────────────────────────────────────────── */

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={{
      background: "white", borderRadius: 18, border: "1px solid #F0ECF8",
      padding: 24,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <h2 style={{
          margin: 0, fontSize: 12, fontWeight: 700, color: "#9CA3AF",
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  )
}

function InfoChip({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <span style={{
      display: "inline-flex", flexDirection: "column",
      padding: "8px 12px",
      background: "#F8F6FF", border: "1px solid #F0ECF8", borderRadius: 9,
      fontSize: 12,
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ color: "#111827", fontWeight: 600, marginTop: 2 }}>{value}</span>
    </span>
  )
}

function ExperienceItem({ e }: { e: NonNullable<ParsedCv["experience"]>[number] }) {
  const dateLabel = [e.start, e.end ?? "actuel"].filter(Boolean).join(" – ")
  return (
    <div style={{ paddingLeft: 14, borderLeft: "2px solid #F0ECF8", position: "relative" }}>
      <span style={{
        position: "absolute", left: -5, top: 5,
        width: 8, height: 8, borderRadius: "50%",
        background: "#7C63C8", boxShadow: "0 0 0 3px white",
      }} />
      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827" }}>
        {e.title}
        {e.company ? <span style={{ fontWeight: 500, color: "#6B7280" }}> — {e.company}</span> : null}
      </p>
      <p style={{ margin: "2px 0 6px", fontSize: 11.5, color: "#9CA3AF" }}>
        {dateLabel}{e.location ? ` · ${e.location}` : ""}
      </p>
      {e.description && (
        <p style={{ margin: 0, fontSize: 13, color: "#4B5563", lineHeight: 1.6 }}>{e.description}</p>
      )}
    </div>
  )
}

function SmallStatus({ color, label }: { color: string; label: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color,
      letterSpacing: "0.04em",
    }}>
      {label}
    </span>
  )
}

function initials(s: string | null | undefined): string {
  if (!s) return "?"
  return s.split(/\s+/).slice(0, 2).map((p) => p[0] ?? "").join("").toUpperCase() || "?"
}
