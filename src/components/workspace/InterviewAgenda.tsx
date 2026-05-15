"use client"

/**
 * Interview agenda shown under the pipeline kanban: a compact month overview
 * (days with booked interviews highlighted) + a work-week view (Mon–Fri)
 * listing each day's interviews. Fed by the `interviews` table, kept live via
 * Supabase Realtime so Calendly bookings appear without a refresh.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { getSupabase } from "@/lib/supabase"
import type { Interview } from "@/lib/database.types"

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]
const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
const WORK_DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"]

/** Local YYYY-MM-DD key for a date. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
/** Monday of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  const dow = (r.getDay() + 6) % 7 // Mon = 0
  r.setDate(r.getDate() - dow)
  return r
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
function sameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b)
}
function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
}

const VIDEO_TYPES = new Set(["google_meet", "zoom", "microsoft_teams", "gotomeeting", "webex"])

export default function InterviewAgenda() {
  const sb = useMemo(() => getSupabase(), [])
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [loading, setLoading] = useState(true)
  // `cursor` drives both the displayed month and the selected work-week.
  const [cursor, setCursor] = useState(() => new Date())

  const load = useCallback(async () => {
    const { data } = await sb
      .from("interviews")
      .select("*")
      .eq("status", "scheduled")
      .order("start_time", { ascending: true })
    setInterviews((data ?? []) as Interview[])
    setLoading(false)
  }, [sb])

  useEffect(() => {
    let mounted = true
    let channel: ReturnType<typeof sb.channel> | null = null
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user || !mounted) return
      await load()
      channel = sb
        .channel(`interviews:${user.id}`)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "interviews", filter: `user_id=eq.${user.id}` },
          () => { load() },
        )
        .subscribe()
    })()
    return () => { mounted = false; if (channel) sb.removeChannel(channel) }
  }, [sb, load])

  // Index interviews by local day.
  const byDay = useMemo(() => {
    const map = new Map<string, Interview[]>()
    for (const iv of interviews) {
      const k = dayKey(new Date(iv.start_time))
      const arr = map.get(k)
      if (arr) arr.push(iv)
      else map.set(k, [iv])
    }
    return map
  }, [interviews])

  if (loading) {
    return (
      <div style={{ marginTop: 36, padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
        Chargement de l&apos;agenda…
      </div>
    )
  }

  const today = new Date()
  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  // Month grid — leading blanks so the 1st lands under the right weekday.
  const firstOfMonth = new Date(year, month, 1)
  const lead = (firstOfMonth.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))

  const weekStart = startOfWeek(cursor)
  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i))

  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#111827", letterSpacing: "-0.015em" }}>
          Agenda des entretiens
        </h2>
        <span style={{ fontSize: 12.5, color: "#9CA3AF" }}>
          {interviews.length} entretien{interviews.length > 1 ? "s" : ""} à venir
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 18, alignItems: "start" }} className="agenda-grid">
        {/* ── Month overview ── */}
        <div style={{ background: "white", border: "1px solid #F0ECF8", borderRadius: 14, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <button
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              style={navBtnStyle}
              aria-label="Mois précédent"
            >‹</button>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#111827", textTransform: "capitalize" }}>
              {MONTHS[month]} {year}
            </span>
            <button
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              style={navBtnStyle}
              aria-label="Mois suivant"
            >›</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
            {WEEKDAYS.map((w) => (
              <div key={w} style={{ fontSize: 10, fontWeight: 700, color: "#C4B6E0", textAlign: "center", padding: "2px 0" }}>
                {w}
              </div>
            ))}
            {cells.map((d, i) => {
              if (!d) return <div key={`b${i}`} />
              const count = byDay.get(dayKey(d))?.length ?? 0
              const isToday = sameDay(d, today)
              const inSelectedWeek = d >= weekStart && d < addDays(weekStart, 7)
              return (
                <button
                  key={dayKey(d)}
                  onClick={() => setCursor(new Date(d))}
                  style={{
                    aspectRatio: "1", border: "none", borderRadius: 8, cursor: "pointer",
                    fontSize: 12, fontFamily: "inherit",
                    fontWeight: isToday ? 800 : count > 0 ? 700 : 500,
                    color: count > 0 ? "#7C63C8" : isToday ? "#111827" : "#6B7280",
                    background: inSelectedWeek ? "rgba(124,99,200,0.08)" : "transparent",
                    outline: isToday ? "1.5px solid #7C63C8" : "none",
                    position: "relative",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {d.getDate()}
                  {count > 0 && (
                    <span style={{
                      position: "absolute", bottom: 3, left: "50%", transform: "translateX(-50%)",
                      width: 4, height: 4, borderRadius: "50%", background: "#7C63C8",
                    }} />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Work-week view ── */}
        <div style={{ background: "white", border: "1px solid #F0ECF8", borderRadius: 14, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
              Semaine du {weekStart.getDate()} {MONTHS[weekStart.getMonth()]}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setCursor(addDays(weekStart, -7))} style={navBtnStyle} aria-label="Semaine précédente">‹</button>
              <button onClick={() => setCursor(new Date())} style={{ ...navBtnStyle, width: "auto", padding: "0 10px", fontSize: 11.5, fontWeight: 700 }}>
                Aujourd&apos;hui
              </button>
              <button onClick={() => setCursor(addDays(weekStart, 7))} style={navBtnStyle} aria-label="Semaine suivante">›</button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }} className="agenda-week">
            {weekDays.map((d, i) => {
              const items = (byDay.get(dayKey(d)) ?? []).slice().sort(
                (a, b) => a.start_time.localeCompare(b.start_time),
              )
              const isToday = sameDay(d, today)
              return (
                <div key={dayKey(d)} style={{
                  background: isToday ? "rgba(124,99,200,0.05)" : "#FAFAFC",
                  border: `1px solid ${isToday ? "rgba(124,99,200,0.25)" : "#F0ECF8"}`,
                  borderRadius: 10, padding: 8, minHeight: 130,
                  display: "flex", flexDirection: "column", gap: 6,
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5, padding: "0 2px 4px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: isToday ? "#7C63C8" : "#9CA3AF" }}>
                      {WORK_DAYS[i]}
                    </span>
                    <span style={{ fontSize: 11, color: "#C4B6E0" }}>{d.getDate()}</span>
                  </div>
                  {items.length === 0 && (
                    <span style={{ fontSize: 11, color: "#D1C9E8", padding: "2px" }}>—</span>
                  )}
                  {items.map((iv) => <AgendaCard key={iv.id} iv={iv} />)}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .agenda-grid { grid-template-columns: 1fr !important; }
          .agenda-week { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </div>
  )
}

function AgendaCard({ iv }: { iv: Interview }) {
  const isVideo = iv.location_type ? VIDEO_TYPES.has(iv.location_type) : !!iv.join_url
  const name = iv.invitee_name?.trim() || iv.invitee_email || "Candidat"

  return (
    <div style={{
      background: "white", border: "1px solid #EDE8F8", borderRadius: 8,
      padding: "7px 8px", display: "flex", flexDirection: "column", gap: 3,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: "#7C63C8" }}>{hhmm(iv.start_time)}</span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 100,
          color: isVideo ? "#2563EB" : "#15803d",
          background: isVideo ? "rgba(37,99,235,0.10)" : "rgba(34,197,94,0.10)",
        }}>
          {isVideo ? "Visio" : "Présentiel"}
        </span>
      </div>
      <span style={{
        fontSize: 12, fontWeight: 600, color: "#111827", lineHeight: 1.3,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {name}
      </span>
      {isVideo && iv.join_url && (
        <a href={iv.join_url} target="_blank" rel="noopener noreferrer" style={{
          fontSize: 10.5, fontWeight: 700, color: "#2563EB", textDecoration: "none",
        }}>
          Rejoindre →
        </a>
      )}
      {!isVideo && iv.location_text && (
        <span style={{
          fontSize: 10.5, color: "#6B7280", lineHeight: 1.3,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {iv.location_text}
        </span>
      )}
      {iv.candidate_id && (
        <Link href={`/workspace/vivier/${iv.candidate_id}`} style={{
          fontSize: 10, fontWeight: 700, color: "#9CA3AF", textDecoration: "none",
        }}>
          Voir la fiche →
        </Link>
      )}
    </div>
  )
}

const navBtnStyle: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 7,
  border: "1px solid #F0ECF8", background: "white",
  color: "#7C63C8", fontSize: 14, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
}
