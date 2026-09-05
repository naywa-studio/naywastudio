"use client"

/**
 * /workspace/rgpd — "Demandes RGPD" (Slice 6.2).
 *
 * Journal des actions RGPD de l'organisation, PAS une file à approuver : les
 * demandes candidat (self-service) s'exécutent seules, cette page informe
 * après coup (cf. décision produit — un jeton signé envoyé au candidat EST
 * la vérification d'identité, une validation humaine n'ajouterait rien et
 * retarderait un droit qui doit s'exercer sans délai excessif).
 *
 * Distinction "qui a fait quoi" sans nouvelle colonne : actor_user_id NULL +
 * action='auto_purged' = cron de rétention ; actor_user_id NULL + toute
 * autre action = candidat via le lien self-service (un recruteur authentifié
 * pose TOUJOURS son actor_user_id, jamais NULL) ; actor_user_id renseigné =
 * action recruteur, avec son prénom si résolu.
 */

import { useEffect, useMemo, useState } from "react"
import { getSupabase } from "@/lib/supabase"
import { useLanguage, type Lang } from "@/lib/i18n/LanguageContext"
import type { CandidateRgpdLog } from "@/lib/database.types"

type LogRow = CandidateRgpdLog & { actor: { first_name: string | null } | null }

const ACTION_LABEL: Record<Lang, Record<CandidateRgpdLog["action"], string>> = {
  fr: {
    export: "Export des données",
    delete: "Suppression définitive",
    anonymize: "Anonymisation",
    consent_granted: "Consentement vivier accordé",
    consent_revoked: "Consentement vivier retiré",
    opt_out_contact: "Opposition au contact",
    auto_purged: "Purge automatique (rétention expirée)",
    rectification: "Correction de coordonnées",
  },
  en: {
    export: "Data export",
    delete: "Permanent deletion",
    anonymize: "Anonymization",
    consent_granted: "Talent pool consent granted",
    consent_revoked: "Talent pool consent revoked",
    opt_out_contact: "Contact opposition",
    auto_purged: "Automatic purge (retention expired)",
    rectification: "Contact details correction",
  },
}

const copy = {
  fr: {
    title: "Demandes RGPD",
    subtitle: "Historique des actions RGPD sur vos candidats — export, suppression, opposition, correction. Les demandes des candidats (via leur lien personnel) s'exécutent automatiquement ; cette page vous en informe.",
    empty: "Aucune action RGPD enregistrée pour l'instant.",
    colDate: "Date",
    colCandidate: "Candidat",
    colAction: "Action",
    colActor: "Par",
    selfService: "Candidat (self-service)",
    autoPurge: "Système (purge auto)",
  },
  en: {
    title: "GDPR requests",
    subtitle: "History of GDPR actions on your candidates — export, deletion, opposition, correction. Candidate-initiated requests (via their personal link) run automatically; this page keeps you informed.",
    empty: "No GDPR action recorded yet.",
    colDate: "Date",
    colCandidate: "Candidate",
    colAction: "Action",
    colActor: "By",
    selfService: "Candidate (self-service)",
    autoPurge: "System (auto purge)",
  },
}

export default function RgpdLogPage() {
  const { lang } = useLanguage()
  const t = copy[lang]
  const actionLabel = ACTION_LABEL[lang]
  const sb = useMemo(() => getSupabase(), [])

  const [rows, setRows] = useState<LogRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await sb
        .from("candidate_rgpd_log")
        .select("*, actor:profiles(first_name)")
        .order("created_at", { ascending: false })
        .limit(100)
      if (!cancelled) setRows((data as unknown as LogRow[] | null) ?? [])
    })()
    return () => { cancelled = true }
  }, [sb])

  return (
    <main style={{
      padding: "32px 24px 80px", maxWidth: 960, margin: "0 auto",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 800, color: "var(--nw-text)", letterSpacing: "-0.02em" }}>
        {t.title}
      </h1>
      <p style={{ margin: "0 0 24px", fontSize: 13.5, color: "var(--nw-text-muted)", lineHeight: 1.6, maxWidth: 640 }}>
        {t.subtitle}
      </p>

      <section style={{ background: "white", borderRadius: 16, border: "1px solid var(--nw-border-soft)", overflow: "hidden" }}>
        {!rows ? (
          <div style={{ padding: 24, fontSize: 13, color: "var(--nw-text-muted)" }}>…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 24, fontSize: 13, color: "var(--nw-text-muted)" }}>{t.empty}</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--nw-border-soft)" }}>
                  {[t.colDate, t.colCandidate, t.colAction, t.colActor].map((h) => (
                    <th key={h} style={{
                      textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 700,
                      color: "var(--nw-text-muted)", letterSpacing: "0.06em", textTransform: "uppercase",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const who = row.actor_user_id
                    ? (row.actor?.first_name ?? "—")
                    : row.action === "auto_purged" ? t.autoPurge : t.selfService
                  return (
                    <tr key={row.id} style={{ borderBottom: "1px solid var(--nw-border-soft)" }}>
                      <td style={{ padding: "10px 16px", color: "var(--nw-text-muted)", whiteSpace: "nowrap" }}>
                        {new Date(row.created_at).toLocaleString(lang === "fr" ? "fr-FR" : "en-US")}
                      </td>
                      <td style={{ padding: "10px 16px", fontFamily: "var(--nw-font-mono)", color: "var(--nw-text)" }}>
                        {row.candidate_ref}
                      </td>
                      <td style={{ padding: "10px 16px", color: "var(--nw-text)" }}>{actionLabel[row.action]}</td>
                      <td style={{ padding: "10px 16px", color: "var(--nw-text-muted)" }}>{who}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
