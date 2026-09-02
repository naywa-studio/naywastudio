"use client"

/**
 * Ce qu'il faut savoir AVANT d'écrire — au-dessus de la zone de rédaction.
 *
 * ── Pourquoi au-dessus, et pas ailleurs ───────────────────────────────────
 *
 * Tout ce qui est affiché ici était auparavant découvert au clic sur
 * « Envoyer » : le candidat s'était désinscrit, le plafond du cabinet était
 * atteint, la boîte connectée avait été révoquée. Le sourceur avait alors
 * rédigé, relu, retouché — pour rien. Une information que le produit détenait
 * avant sa première frappe.
 *
 * Deux natures d'information cohabitent, et l'ordre entre elles est décidé
 * côté serveur (`lib/mailing/readiness.ts`) :
 *
 *  - **ce qui empêche d'écrire** — trois cas seulement, et la zone de
 *    rédaction disparaît ;
 *  - **ce qu'il faut savoir en écrivant** — l'identité d'expédition, et
 *    surtout la mémoire du cabinet : « Louis lui a écrit il y a trois jours ».
 *
 * ── Le cas qui justifie tout le reste ─────────────────────────────────────
 *
 * Le vivier est partagé, la boîte aux lettres est personnelle. Rien ne
 * signalait qu'un collègue avait sollicité la même personne l'avant-veille.
 * Le candidat, lui, le voyait très bien. Ce bandeau n'interdit rien — un
 * cabinet doit pouvoir doubler volontairement, reprendre un dossier, couvrir
 * une absence. Il rend visible ce qui l'était déjà côté candidat.
 */

import { useEffect, useState } from "react"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import type { ReadinessVerdict } from "@/lib/mailing/readiness"
import type { ContactHistory, PastContact } from "@/lib/mailing/contact-history"
import { severityOf } from "@/lib/mailing/contact-history"

export interface ReadinessPayload extends ReadinessVerdict {
  enabled: boolean
  suppressionUnknown: boolean
  history: ContactHistory
  names: Record<string, string>
  jobTitles: Record<string, string>
}

const copy = {
  fr: {
    blocked: {
      no_email: "Ce candidat n'a pas d'adresse email. Ajoutez-la sur sa fiche pour pouvoir lui écrire.",
      bounce: "Cette adresse n'existe plus : un message précédent a été définitivement refusé.",
      complaint: "Ce candidat a signalé un message précédent comme indésirable. Nous ne lui écrivons plus.",
      unsubscribe: "Ce candidat a demandé à ne plus être contacté par votre organisation.",
      manual: "Cette adresse a été mise en liste d'exclusion par votre organisation.",
      unknown: "Impossible de vérifier si ce candidat accepte d'être contacté. Par précaution, l'envoi est suspendu — réessayez dans un instant.",
      cap: (sent: number, limit: number) =>
        `Votre organisation a atteint ses ${limit} envois du jour (${sent} partis). L'envoi redevient possible demain.`,
    },
    warn: {
      reconnect: (a: string | null | undefined) =>
        `L'accès à votre messagerie${a ? ` (${a})` : ""} a été révoqué. Vos messages partent pour l'instant d'une autre adresse.`,
      generic: (a: string | null | undefined) =>
        `Vos messages partiront de ${a ?? "une adresse Naywa"}. Connectez votre messagerie pour écrire depuis votre propre adresse.`,
      capNear: (sent: number, limit: number) => `${sent} envois sur ${limit} aujourd'hui pour votre organisation.`,
      settings: "Régler",
    },
    memory: {
      you: "Vous",
      sameYou: (d: string) => `Vous avez déjà écrit à ce candidat pour cette mission ${d}.`,
      sameOther: (who: string, d: string) => `${who} a déjà écrit à ce candidat pour cette mission ${d}.`,
      otherYou: (d: string, job: string | null) =>
        `Vous avez écrit à ce candidat ${d}${job ? ` pour « ${job} »` : " pour une autre mission"}.`,
      otherSomeone: (who: string, d: string, job: string | null) =>
        `${who} a écrit à ce candidat ${d}${job ? ` pour « ${job} »` : " pour une autre mission"}.`,
      replied: "Il a déjà répondu au cabinet.",
      today: "aujourd'hui", yesterday: "hier",
      days: (n: number) => `il y a ${n} jours`,
      months: (n: number) => `il y a ${n} mois`,
      colleague: "Un collègue",
      from: "Envoi depuis",
    },
  },
  en: {
    blocked: {
      no_email: "This candidate has no email address. Add one on their profile to write to them.",
      bounce: "This address no longer exists: a previous message was permanently rejected.",
      complaint: "This candidate marked a previous message as spam. We no longer write to them.",
      unsubscribe: "This candidate asked not to be contacted by your organisation again.",
      manual: "This address was added to your organisation's exclusion list.",
      unknown: "We couldn't check whether this candidate accepts being contacted. Sending is paused as a precaution — try again shortly.",
      cap: (sent: number, limit: number) =>
        `Your organisation has reached its ${limit} daily sends (${sent} sent). Sending resumes tomorrow.`,
    },
    warn: {
      reconnect: (a: string | null | undefined) =>
        `Access to your mailbox${a ? ` (${a})` : ""} was revoked. Your messages currently go out from another address.`,
      generic: (a: string | null | undefined) =>
        `Your messages will be sent from ${a ?? "a Naywa address"}. Connect your mailbox to write from your own address.`,
      capNear: (sent: number, limit: number) => `${sent} of ${limit} sends today for your organisation.`,
      settings: "Set up",
    },
    memory: {
      you: "You",
      sameYou: (d: string) => `You already wrote to this candidate for this role ${d}.`,
      sameOther: (who: string, d: string) => `${who} already wrote to this candidate for this role ${d}.`,
      otherYou: (d: string, job: string | null) =>
        `You wrote to this candidate ${d}${job ? ` about “${job}”` : " about another role"}.`,
      otherSomeone: (who: string, d: string, job: string | null) =>
        `${who} wrote to this candidate ${d}${job ? ` about “${job}”` : " about another role"}.`,
      replied: "They have already replied to the agency.",
      today: "today", yesterday: "yesterday",
      days: (n: number) => `${n} days ago`,
      months: (n: number) => `${n} months ago`,
      colleague: "A colleague",
      from: "Sending from",
    },
  },
}

type Tone = "block" | "alert" | "info"

const TONES: Record<Tone, { border: string; bg: string; dot: string; text: string }> = {
  block: { border: "#FECACA", bg: "#FEF2F2", dot: "#EF4444", text: "#991B1B" },
  alert: { border: "#FDE68A", bg: "#FFFBEB", dot: "#F59E0B", text: "#92400E" },
  info: { border: "var(--nw-border-soft)", bg: "var(--nw-surface-muted)", dot: "var(--nw-text-muted)", text: "var(--nw-text-muted)" },
}

/** « il y a 3 jours » plutôt qu'une date : c'est la fraîcheur qui décide, pas le calendrier. */
function ago(days: number, t: typeof copy.fr.memory): string {
  if (days <= 0) return t.today
  if (days === 1) return t.yesterday
  if (days < 60) return t.days(days)
  return t.months(Math.round(days / 30))
}

export default function OutreachReadiness({
  candidateId,
  jobId,
  reloadKey = 0,
  onVerdict,
}: {
  candidateId: string
  jobId: string | null
  /** Incrémenté par le parent après un envoi : le plafond et la mémoire bougent. */
  reloadKey?: number
  onVerdict?: (v: ReadinessPayload | null) => void
}) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const [data, setData] = useState<ReadinessPayload | null>(null)

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ candidate_id: candidateId })
    if (jobId) params.set("job_id", jobId)
    fetch(`/api/mailing/readiness?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return
        const payload = j?.ok && j.enabled ? (j as ReadinessPayload) : null
        setData(payload)
        onVerdict?.(payload)
      })
      .catch(() => { if (!cancelled) { setData(null); onVerdict?.(null) } })
    return () => { cancelled = true }
    // `onVerdict` est volontairement hors dépendances : le parent le
    // redéfinit à chaque rendu, et l'inclure relancerait la requête en boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId, jobId, reloadKey])

  if (!data) return null

  const lines: { tone: Tone; text: string; action?: { href: string; label: string } }[] = []

  if (data.block) {
    const b = data.block
    const text =
      b.code === "no_email" ? t.blocked.no_email
      : b.code === "cap_reached" ? t.blocked.cap(b.sent ?? 0, b.limit ?? 0)
      : data.suppressionUnknown ? t.blocked.unknown
      : b.reason ? t.blocked[b.reason]
      : t.blocked.unknown
    lines.push({ tone: "block", text })
  } else {
    for (const w of data.warnings) {
      if (w.code === "mailbox_needs_reconnect") {
        lines.push({
          tone: "alert", text: t.warn.reconnect(w.address),
          action: { href: "/organisation?tab=messagerie", label: t.warn.settings },
        })
      } else if (w.code === "generic_identity") {
        lines.push({
          tone: "info", text: t.warn.generic(w.address),
          action: { href: "/organisation?tab=messagerie", label: t.warn.settings },
        })
      }
    }

    /* La mémoire du cabinet vient EN DERNIER des avertissements mais c'est la
     * plus importante : elle est la seule à protéger la réputation du client
     * devant le candidat. Placée après l'identité d'expédition, elle est aussi
     * la dernière chose lue avant d'écrire. */
    const memory = memoryLine(data, t.memory)
    if (memory) lines.push(memory)
  }

  if (!lines.length) return null

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {lines.map((l, i) => {
        const tone = TONES[l.tone]
        return (
          <div key={i} style={{
            display: "flex", alignItems: "flex-start", gap: 9,
            padding: "10px 13px", borderRadius: 11,
            border: `1px solid ${tone.border}`, background: tone.bg,
          }}>
            <span aria-hidden style={{
              flexShrink: 0, width: 6, height: 6, borderRadius: "50%",
              background: tone.dot, marginTop: 6,
            }} />
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: tone.text, flex: 1, minWidth: 0 }}>
              {l.text}
              {l.action && (
                <>
                  {" "}
                  <a href={l.action.href} style={{ color: "var(--nw-primary)", fontWeight: 700, textDecoration: "none" }}>
                    {l.action.label}
                  </a>
                </>
              )}
            </p>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Une seule ligne de mémoire, jamais deux.
 *
 * Un candidat sollicité sur trois missions produirait trois bandeaux, et le
 * sourceur cesserait de les lire — donc aussi celui qui compte. On montre le
 * cas le plus engageant : la même mission d'abord (le vrai doublon), une autre
 * mission ensuite.
 */
function memoryLine(
  data: ReadinessPayload,
  t: typeof copy.fr.memory & { colleague: string },
): { tone: Tone; text: string } | null {
  const h = data.history
  const who = (c: PastContact) => (c.byViewer ? t.you : data.names[c.userId] ?? t.colleague)

  if (h.sameMission) {
    const c = h.sameMission
    const when = ago(c.daysAgo, t)
    const text = c.byViewer ? t.sameYou(when) : t.sameOther(who(c), when)
    return { tone: severityOf(c) === "alert" ? "alert" : "info", text: appendReplied(text, h, t) }
  }

  if (h.otherMission) {
    const c = h.otherMission
    const job = c.jobId ? data.jobTitles[c.jobId] ?? null : null
    const when = ago(c.daysAgo, t)
    const text = c.byViewer ? t.otherYou(when, job) : t.otherSomeone(who(c), when, job)
    return { tone: severityOf(c) === "alert" ? "alert" : "info", text: appendReplied(text, h, t) }
  }

  return null
}

/* « Il a déjà répondu » change complètement la lecture d'un contact passé :
 * une relance après une réponse n'est plus un doublon, c'est une conversation
 * en cours. */
function appendReplied(text: string, h: ContactHistory, t: { replied: string }): string {
  return h.hasReplied ? `${text} ${t.replied}` : text
}
