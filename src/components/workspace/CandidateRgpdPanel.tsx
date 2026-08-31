"use client"

/**
 * Panneau "Conformité RGPD" sur la fiche candidat (Slice 2 du chantier RGPD).
 *
 * Volontairement un composant à part (page déjà à 1200+ lignes) : lit ses
 * props depuis le `candidate` du parent (pas de fetch initial dupliqué), et
 * compte sur l'abonnement realtime déjà monté sur la page pour refléter les
 * mutations (anonymize/consent) sans callback de refetch — la ligne
 * `candidates` change en base, la page parent la reçoit via postgres_changes
 * et repasse les nouvelles props ici automatiquement.
 *
 * Seul l'historique (candidate_rgpd_log) est géré en interne : ce n'est pas
 * un champ de `candidate`, donc pas couvert par cet abonnement.
 */

import { useEffect, useMemo, useState } from "react"
import { getSupabase } from "@/lib/supabase"
import type { CandidateRgpdLog } from "@/lib/database.types"
import { useLanguage, type Lang } from "@/lib/i18n/LanguageContext"

interface Props {
  candidateId: string
  hasEmail: boolean
  talentPoolConsent: boolean
  retentionUntil: string | null
  rgpdAnonymizedAt: string | null
  isReadOnly: boolean
}

const ACTION_LABEL: Record<Lang, Record<CandidateRgpdLog["action"], string>> = {
  fr: {
    export: "Export des données",
    delete: "Suppression définitive",
    anonymize: "Anonymisation",
    consent_granted: "Consentement vivier accordé",
    consent_revoked: "Consentement vivier retiré",
    opt_out_contact: "Opposition au contact",
    auto_purged: "Purge automatique (rétention expirée)",
  },
  en: {
    export: "Data export",
    delete: "Permanent deletion",
    anonymize: "Anonymization",
    consent_granted: "Talent pool consent granted",
    consent_revoked: "Talent pool consent revoked",
    opt_out_contact: "Contact opposition",
    auto_purged: "Automatic purge (retention expired)",
  },
}

const copy = {
  fr: {
    title: "Conformité RGPD",
    export: "Exporter les données",
    exportHint: "Télécharge un JSON complet de ce que nous détenons sur ce candidat (droit d'accès).",
    consentLabel: "Conserver en vivier (accord obtenu)",
    consentHint: "Déclaratif : coche si le candidat a accepté d'être recontacté au-delà de cette mission (jusqu'à 2 ans depuis le dernier contact). Décoché par défaut — 180 jours.",
    retentionLabel: "Suppression automatique prévue le",
    retentionNone: "Non planifiée",
    optOut: "Ne plus contacter",
    optOutConfirm: "Tracer une opposition au contact pour ce candidat ? Cette action ne bloque pas encore l'envoi (voir le détail dans l'historique) — c'est une trace, pas encore une garde technique.",
    optOutDone: "Opposition tracée",
    anonymize: "Anonymiser (RGPD)",
    anonymizeConfirm: "Vide définitivement le nom, l'email, le téléphone, le CV et les notes de ce candidat — sa ligne reste dans le vivier pour les statistiques agrégées, mais devient impossible à identifier. Irréversible. Continuer ?",
    anonymizedBadge: (d: string) => `Anonymisé (RGPD) le ${d}`,
    deleteHint: "Suppression définitive : bouton « Supprimer » en haut de la fiche.",
    history: "Historique RGPD",
    historyEmpty: "Aucune action RGPD enregistrée pour l'instant.",
    noEmail: "Pas d'email enregistré — rien à opposer.",
    loading: "…",
  },
  en: {
    title: "GDPR compliance",
    export: "Export data",
    exportHint: "Downloads a full JSON of what we hold on this candidate (right of access).",
    consentLabel: "Keep in talent pool (consent obtained)",
    consentHint: "Declarative: check if the candidate agreed to be recontacted beyond this job opening (up to 2 years since last contact). Unchecked by default — 180 days.",
    retentionLabel: "Scheduled automatic deletion on",
    retentionNone: "Not scheduled",
    optOut: "Stop contacting",
    optOutConfirm: "Record a contact opposition for this candidate? This does not yet block outreach (see the history detail) — it's a trace, not a technical guard yet.",
    optOutDone: "Opposition recorded",
    anonymize: "Anonymize (GDPR)",
    anonymizeConfirm: "Permanently clears this candidate's name, email, phone, CV and notes — their row stays in the pool for aggregate stats, but becomes impossible to identify. Irreversible. Continue?",
    anonymizedBadge: (d: string) => `Anonymized (GDPR) on ${d}`,
    deleteHint: "Permanent deletion: use the “Delete” button at the top of the profile.",
    history: "GDPR history",
    historyEmpty: "No GDPR action recorded yet.",
    noEmail: "No email on file — nothing to opt out.",
    loading: "…",
  },
}

export default function CandidateRgpdPanel(props: Props) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const actionLabel = ACTION_LABEL[lang]
  const sb = useMemo(() => getSupabase(), [])

  const [log, setLog] = useState<CandidateRgpdLog[] | null>(null)
  const [busy, setBusy] = useState<"consent" | "anonymize" | "opt-out" | null>(null)

  const loadLog = async () => {
    const { data } = await sb
      .from("candidate_rgpd_log")
      .select("*")
      .eq("candidate_id", props.candidateId)
      .order("created_at", { ascending: false })
      .limit(20)
    setLog((data as CandidateRgpdLog[] | null) ?? [])
  }

  // Chargement initial inline (pas un appel à loadLog()) : le hook
  // react-hooks/set-state-in-effect (React Compiler) trace les appels à une
  // fonction nommée qui fait setState et les refuse dans le corps d'un effet
  // — même pattern que le fetch principal de la page parente. loadLog() reste
  // la fonction réutilisée par les handlers, hors effet.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await sb
        .from("candidate_rgpd_log")
        .select("*")
        .eq("candidate_id", props.candidateId)
        .order("created_at", { ascending: false })
        .limit(20)
      if (!cancelled) setLog((data as CandidateRgpdLog[] | null) ?? [])
    })()
    return () => { cancelled = true }
  }, [props.candidateId, sb])

  const toggleConsent = async () => {
    if (props.isReadOnly || busy) return
    setBusy("consent")
    await fetch(`/api/candidates/${props.candidateId}/rgpd/consent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent: !props.talentPoolConsent }),
    }).catch(() => {})
    await loadLog()
    setBusy(null)
  }

  const doAnonymize = async () => {
    if (props.isReadOnly || busy) return
    if (!window.confirm(t.anonymizeConfirm)) return
    setBusy("anonymize")
    await fetch(`/api/candidates/${props.candidateId}/rgpd/anonymize`, { method: "POST" }).catch(() => {})
    await loadLog()
    setBusy(null)
  }

  const doOptOut = async () => {
    if (props.isReadOnly || busy || !props.hasEmail) return
    if (!window.confirm(t.optOutConfirm)) return
    setBusy("opt-out")
    await fetch(`/api/candidates/${props.candidateId}/rgpd/opt-out`, { method: "POST" }).catch(() => {})
    await loadLog()
    setBusy(null)
  }

  const retentionLabel = props.retentionUntil
    ? new Date(props.retentionUntil).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")
    : t.retentionNone

  return (
    <section style={{
      background: "white", borderRadius: 16, border: "1px solid var(--nw-border-soft)",
      padding: 20,
    }}>
      <h2 style={{
        margin: "0 0 14px", fontSize: 12, fontWeight: 700, color: "var(--nw-text-muted)",
        letterSpacing: "0.08em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
      }}>
        {t.title}
      </h2>

      {props.rgpdAnonymizedAt ? (
        <p style={{
          margin: "0 0 14px", fontSize: 13, fontWeight: 600, color: "var(--nw-text-muted)",
          background: "var(--nw-surface-muted)", border: "1px solid var(--nw-border-soft)",
          borderRadius: 10, padding: "10px 12px",
        }}>
          {t.anonymizedBadge(new Date(props.rgpdAnonymizedAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US"))}
        </p>
      ) : (
        <>
          {/* Consentement vivier */}
          <label style={{
            display: "flex", alignItems: "flex-start", gap: 10, cursor: props.isReadOnly ? "default" : "pointer",
            marginBottom: 6,
          }}>
            <input
              type="checkbox"
              checked={props.talentPoolConsent}
              disabled={props.isReadOnly || busy === "consent"}
              onChange={toggleConsent}
              style={{ marginTop: 3 }}
            />
            <span style={{ fontSize: 13.5, color: "var(--nw-text)", fontWeight: 600 }}>
              {t.consentLabel}
            </span>
          </label>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--nw-text-muted)", lineHeight: 1.5 }}>
            {t.consentHint}
          </p>
          <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--nw-text-muted)" }}>
            {t.retentionLabel} <strong style={{ color: "var(--nw-text)" }}>{retentionLabel}</strong>
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            <a
              href={`/api/candidates/${props.candidateId}/rgpd/export`}
              style={{
                fontSize: 12.5, fontWeight: 600, color: "var(--nw-primary)",
                background: "var(--nw-primary-100)", border: "1px solid var(--nw-border-soft)",
                borderRadius: 8, padding: "7px 12px", textDecoration: "none",
              }}
            >
              {t.export}
            </a>
            <button
              onClick={doOptOut}
              disabled={props.isReadOnly || !!busy || !props.hasEmail}
              title={props.hasEmail ? undefined : t.noEmail}
              style={{
                fontSize: 12.5, fontWeight: 600, color: "var(--nw-text)",
                background: "white", border: "1px solid var(--nw-border-soft)",
                borderRadius: 8, padding: "7px 12px", cursor: props.hasEmail ? "pointer" : "not-allowed",
                fontFamily: "inherit", opacity: props.hasEmail ? 1 : 0.5,
              }}
            >
              {busy === "opt-out" ? t.loading : t.optOut}
            </button>
            {!props.isReadOnly && (
              <button
                onClick={doAnonymize}
                disabled={!!busy}
                style={{
                  fontSize: 12.5, fontWeight: 600, color: "var(--nw-warn)",
                  background: "transparent", border: "1px solid rgba(245,158,11,0.35)",
                  borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {busy === "anonymize" ? t.loading : t.anonymize}
              </button>
            )}
          </div>
          <p style={{ margin: "-10px 0 16px", fontSize: 11.5, color: "var(--nw-text-muted)" }}>
            {t.deleteHint}
          </p>
        </>
      )}

      <div style={{ borderTop: "1px solid var(--nw-border-soft)", paddingTop: 12 }}>
        <h3 style={{
          margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "var(--nw-text-muted)",
          letterSpacing: "0.08em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
        }}>
          {t.history}
        </h3>
        {!log || log.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--nw-text-muted)" }}>{t.historyEmpty}</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {log.map((entry) => (
              <li key={entry.id} style={{ fontSize: 12.5, color: "var(--nw-text)", lineHeight: 1.5 }}>
                <span style={{ color: "var(--nw-text-muted)" }}>
                  {new Date(entry.created_at).toLocaleString(lang === "fr" ? "fr-FR" : "en-US")}
                </span>
                {" — "}{actionLabel[entry.action]}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
