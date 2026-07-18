"use client"

/**
 * MissionBriefSection — bloc "Brief de la mission" sur la fiche mission.
 *
 * Deux textes conservés tels quels, éditables sur place :
 *   - Brief original : le brief saisi par le sourceur (`jobs.briefing`).
 *   - Brief client / appel d'offre : le document brut transmis par le
 *     client (`jobs.client_brief`), optionnel — utile en réponse à appel
 *     d'offre pour garder la source sous les yeux.
 *
 * Repliable (fermé par défaut si vide) pour ne pas encombrer le cockpit.
 */

import { useState } from "react"
import type { Job } from "@/lib/database.types"

export function MissionBriefSection({
  job, onSaved,
}: {
  job: Job
  onSaved: (patch: Partial<Job>) => void
}) {
  const hasClientBrief = !!(job.client_brief?.trim())
  // Toujours replié par défaut — on n'encombre pas le cockpit.
  const [open, setOpen] = useState(false)

  return (
    <section style={{
      marginBottom: 16, background: "white",
      border: "1px solid var(--nw-border-soft)", borderRadius: 14, overflow: "hidden",
    }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: "13px 16px", background: "transparent", border: "none",
          cursor: "pointer", fontFamily: "inherit", textAlign: "left",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--nw-primary)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
          <path d="M14 4v5h5M8 13h8M8 17h5" />
        </svg>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--nw-text)", flex: 1 }}>
          Brief de la mission
        </span>
        {hasClientBrief && (
          <span style={{
            fontSize: 9.5, fontWeight: 700, color: "var(--nw-primary)",
            background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.18)",
            borderRadius: 999, padding: "1px 8px", letterSpacing: "0.04em", textTransform: "uppercase",
          }}>
            Appel d&apos;offre
          </span>
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--nw-text-muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
          <BriefBlock
            jobId={job.id}
            field="briefing"
            label="Brief original"
            hint="Le brief que vous avez saisi pour créer la mission."
            value={job.briefing ?? ""}
            emptyCta="Ajouter le brief"
            onSaved={(v) => onSaved({ briefing: v })}
          />
          <BriefBlock
            jobId={job.id}
            field="client_brief"
            label="Brief client / appel d'offre"
            hint="Optionnel — le document brut transmis par le client (cahier des charges, appel d'offre)."
            value={job.client_brief ?? ""}
            emptyCta="Ajouter le brief client"
            onSaved={(v) => onSaved({ client_brief: v })}
          />
        </div>
      )}
    </section>
  )
}

function BriefBlock({
  jobId, field, label, hint, value, emptyCta, onSaved,
}: {
  jobId: string
  field: "briefing" | "client_brief"
  label: string
  hint: string
  value: string
  emptyCta: string
  onSaved: (value: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  const startEdit = () => { setDraft(value); setEditing(true) }

  const save = async () => {
    setSaving(true)
    try {
      const next = draft.trim() || null
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: next }),
      })
      if (res.ok) {
        onSaved(next)
        setEditing(false)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--nw-text-body)", letterSpacing: "0.02em" }}>
          {label}
        </span>
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            style={{
              marginLeft: "auto", fontSize: 11, fontWeight: 600, color: "var(--nw-primary)",
              background: "transparent", border: "none", cursor: "pointer",
              fontFamily: "inherit", padding: 0,
            }}
          >
            {value.trim() ? "Modifier" : ""}
          </button>
        )}
      </div>

      {editing ? (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            rows={7}
            placeholder={hint}
            style={{
              width: "100%", boxSizing: "border-box",
              fontSize: 13, lineHeight: 1.6, color: "var(--nw-text)",
              padding: "10px 12px", borderRadius: 10,
              border: "1px solid var(--nw-primary-100)", background: "#FBFAFE",
              outline: "none", fontFamily: "inherit", resize: "vertical",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setEditing(false)}
              style={{
                fontSize: 12, fontWeight: 600, color: "var(--nw-text-muted)",
                background: "white", border: "1px solid var(--nw-border)", borderRadius: 8,
                padding: "7px 13px", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              style={{
                fontSize: 12, fontWeight: 700, color: "white",
                background: saving ? "var(--nw-primary-200)" : "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
                border: "none", borderRadius: 8, padding: "7px 15px",
                cursor: saving ? "default" : "pointer", fontFamily: "inherit",
              }}
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </>
      ) : value.trim() ? (
        <p style={{
          margin: 0, fontSize: 13, lineHeight: 1.65, color: "var(--nw-text-body)",
          whiteSpace: "pre-wrap", wordBreak: "break-word",
          background: "#FBFAFE", border: "1px solid var(--nw-border-soft)", borderRadius: 10,
          padding: "11px 13px", maxHeight: 320, overflowY: "auto",
        }}>
          {value}
        </p>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          style={{
            fontSize: 12.5, fontWeight: 600, color: "var(--nw-primary)",
            background: "rgba(124,99,200,0.05)", border: "1px dashed rgba(124,99,200,0.30)",
            borderRadius: 10, padding: "10px 14px", cursor: "pointer",
            fontFamily: "inherit", width: "100%", textAlign: "left",
          }}
        >
          + {emptyCta}
        </button>
      )}
    </div>
  )
}
