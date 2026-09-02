"use client"

/**
 * « Vos candidats ont répondu » — sur l'accueil du workspace.
 *
 * ── Pourquoi ici, et pas un onglet de navigation ──────────────────────────
 *
 * Le produit ne doit pas ressembler à une messagerie : c'est ce qu'on a
 * décrit à Google pour obtenir la vérification — un sourceur, un candidat, un
 * message choisi. Un sixième onglet « Messages » dirait le contraire.
 *
 * Une section qui n'existe que lorsqu'il y a quelque chose à voir dit
 * exactement ce qu'il faut : l'accueil est le premier écran de la journée,
 * et les réponses sont ce qui a changé depuis hier. Quand il n'y en a pas,
 * rien ne s'affiche — pas d'état vide décoratif.
 *
 * ── Ce que la carte porte, et pourquoi si peu ─────────────────────────────
 *
 * De quoi DÉCIDER quoi ouvrir : qui, pour quelle mission, l'humeur détectée
 * par Nora, un extrait. Le message entier est dans la fiche — le dupliquer
 * ici ferait une seconde boîte de réception, moins bonne que la première.
 *
 * Jamais `body_html` : le contenu d'un email entrant n'est pas de confiance.
 *
 * ── La prise en charge ────────────────────────────────────────────────────
 *
 * Le vivier est partagé : deux sourceurs peuvent répondre à la même personne
 * sans le savoir. « Je m'en occupe » est le seul état de tout le mailing qui
 * ne se dérive pas — personne ne peut deviner une intention.
 */

import Link from "next/link"
import { useState } from "react"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import { useCandidateReplies, markReplyHandled, type CandidateReply } from "./useCandidateReplies"

const copy = {
  fr: {
    title: "Vos candidats ont répondu",
    subtitle: (n: number) => (n === 1 ? "1 réponse à traiter" : `${n} réponses à traiter`),
    allHandled: "Tout est pris en charge",
    open: "Ouvrir",
    take: "Je m'en occupe",
    takenBy: (who: string | null) => (who ? `Pris en charge par ${who}` : "Pris en charge"),
    undo: "Annuler",
    anonymous: "Candidat",
    noJob: "Sans mission",
    today: "aujourd'hui", yesterday: "hier", days: (n: number) => `il y a ${n} j`,
    sentiment: {
      interested: "Intéressé", not_interested: "Pas intéressé",
      question: "Question", neutral: "Neutre", negotiation: "Négociation",
    },
  },
  en: {
    title: "Your candidates replied",
    subtitle: (n: number) => (n === 1 ? "1 reply to handle" : `${n} replies to handle`),
    allHandled: "Everything is handled",
    open: "Open",
    take: "I'll take it",
    takenBy: (who: string | null) => (who ? `Handled by ${who}` : "Handled"),
    undo: "Undo",
    anonymous: "Candidate",
    noJob: "No role",
    today: "today", yesterday: "yesterday", days: (n: number) => `${n}d ago`,
    sentiment: {
      interested: "Interested", not_interested: "Not interested",
      question: "Question", neutral: "Neutral", negotiation: "Negotiating",
    },
  },
}

/** Sobre par principe : quatre humeurs colorées côte à côte feraient un
 *  arc-en-ciel là où le sourceur cherche un nom. Seul l'intérêt — le signal
 *  qui fait agir — sort du gris. */
const SENTIMENT_TONE: Record<string, { fg: string; bg: string }> = {
  interested: { fg: "#166534", bg: "#DCFCE7" },
  negotiation: { fg: "#92400E", bg: "#FEF3C7" },
  not_interested: { fg: "var(--nw-text-muted)", bg: "var(--nw-surface-muted)" },
  question: { fg: "var(--nw-text-body)", bg: "var(--nw-surface-muted)" },
  neutral: { fg: "var(--nw-text-muted)", bg: "var(--nw-surface-muted)" },
}

/* `now` est passé en paramètre, jamais lu ici : `Date.now()` pendant le rendu
 * est interdit par la règle de pureté de React 19, et le compilateur React est
 * actif sur ce projet. L'appelant le fige une fois pour toutes. */
function ago(iso: string, now: number, t: typeof copy.fr): string {
  const d = Math.floor((now - Date.parse(iso)) / 86_400_000)
  if (!Number.isFinite(d) || d <= 0) return t.today
  if (d === 1) return t.yesterday
  return t.days(d)
}

export default function RepliesSection() {
  const { lang } = useLanguage()
  const t = copy[lang]
  const { enabled, replies, pending, loading } = useCandidateReplies()
  /* Figé au montage : « il y a 2 j » n'a pas besoin d'être recalculé à chaque
   * rendu, et le faire violerait la règle de pureté de React 19. */
  const [now] = useState(() => Date.now())

  /* Rien pendant le chargement : une carte qui apparaît puis disparaît sous
   * les yeux du sourceur est pire que son absence. Et rien du tout quand
   * aucun candidat n'a répondu — l'accueil ne se remplit pas de vide. */
  if (loading || !enabled || replies.length === 0) return null

  /* On garde les réponses déjà traitées en fin de liste plutôt que de les
   * masquer : elles disent qui s'en occupe, ce qui est précisément
   * l'information qui évite le doublon. */
  const shown = [...replies].sort((a, b) => Number(!!a.handledAt) - Number(!!b.handledAt)).slice(0, 6)

  return (
    <section style={{
      background: "white", border: "1px solid var(--nw-border-soft)",
      borderRadius: 16, padding: 18,
    }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <h2 style={{
          margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", fontFamily: "var(--nw-font-mono)", color: "var(--nw-text-muted)",
        }}>
          {t.title}
        </h2>
        <span style={{ fontSize: 12.5, color: pending > 0 ? "var(--nw-primary)" : "var(--nw-text-muted)", fontWeight: pending > 0 ? 700 : 400 }}>
          {pending > 0 ? t.subtitle(pending) : t.allHandled}
        </span>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {shown.map((r) => <ReplyRow key={r.id} reply={r} t={t} now={now} />)}
      </div>
    </section>
  )
}

function ReplyRow({ reply: r, t, now }: { reply: CandidateReply; t: typeof copy.fr; now: number }) {
  const handled = !!r.handledAt
  const tone = r.sentiment ? SENTIMENT_TONE[r.sentiment] : null

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "11px 13px", borderRadius: 12,
      border: "1px solid var(--nw-border-soft)",
      background: handled ? "var(--nw-surface-muted)" : "white",
      opacity: handled ? 0.72 : 1,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--nw-text-body)" }}>
            {r.candidateName ?? t.anonymous}
          </span>
          <span style={{ fontSize: 11.5, color: "var(--nw-text-muted)" }}>
            {r.jobTitle ?? t.noJob} · {ago(r.at, now, t)}
          </span>
          {tone && r.sentiment && (
            <span style={{
              padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 700,
              letterSpacing: "0.05em", textTransform: "uppercase",
              color: tone.fg, background: tone.bg,
            }}>
              {t.sentiment[r.sentiment]}
            </span>
          )}
        </div>

        <p style={{
          margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--nw-text-muted)",
          overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}>
          {r.summary ?? r.excerpt}
        </p>

        {handled && (
          <p style={{ margin: "5px 0 0", fontSize: 11, color: "var(--nw-text-muted)", fontStyle: "italic" }}>
            {t.takenBy(r.handledBy)}
          </p>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, alignItems: "flex-end" }}>
        {(r.matchId || r.candidateId) && (
          <Link
            href={r.matchId ? `/workspace/match/${r.matchId}` : `/workspace/vivier/${r.candidateId}`}
            style={{
              padding: "5px 11px", borderRadius: 8, fontSize: 11.5, fontWeight: 700,
              background: "var(--nw-primary)", color: "white", textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            {t.open}
          </Link>
        )}
        <button
          type="button"
          onClick={() => void markReplyHandled(r.id, !handled)}
          style={{
            padding: "4px 9px", borderRadius: 7, fontSize: 11, fontWeight: 600,
            border: "1px solid var(--nw-border-soft)", background: "transparent",
            color: "var(--nw-text-muted)", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          }}
        >
          {handled ? t.undo : t.take}
        </button>
      </div>
    </div>
  )
}
