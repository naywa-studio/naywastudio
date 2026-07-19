"use client"

/**
 * Card fine sous le hero des pages /workspace et /organisation,
 * affichée uniquement si au moins une nouveauté n'est pas lue.
 *
 * Une ligne horizontale, mise en avant douce, lien direct vers
 * /nouveautes. Pas d'emoji — icône SVG stylisée Naywa (sparkle
 * géométrique violet).
 */

import Link from "next/link"
import { useUnreadUpdates } from "./useUnreadUpdates"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const copy = {
  fr: {
    single: "Nouveauté Naywa",
    plural: (n: number) => `${n} nouveautés Naywa`,
    fallback: "À découvrir dans Nouveautés.",
    read: "Lire",
  },
  en: {
    single: "Naywa update",
    plural: (n: number) => `${n} Naywa updates`,
    fallback: "Check it out in Updates.",
    read: "Read",
  },
}

export function UpdatesHeroCard() {
  const { lang } = useLanguage()
  const t = copy[lang]
  const { unreadCount, latestTitle, loading } = useUnreadUpdates()
  if (loading || unreadCount === 0) return null

  const single = unreadCount === 1

  return (
    <Link
      href="/nouveautes"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 18px",
        marginBottom: 22,
        borderRadius: 14,
        background: "linear-gradient(135deg, rgba(124,99,200,0.05) 0%, rgba(184,174,222,0.10) 100%)",
        border: "1px solid rgba(124,99,200,0.22)",
        textDecoration: "none",
        color: "inherit",
        fontFamily: "var(--font-inter), sans-serif",
        transition: "transform 140ms, box-shadow 140ms",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 24px -10px rgba(124,99,200,0.30)" }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none" }}
    >
      <SparkleIcon />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0, fontSize: 12, fontWeight: 700, color: "var(--nw-primary)",
          letterSpacing: "0.05em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
        }}>
          {single ? t.single : t.plural(unreadCount)}
        </p>
        <p style={{
          margin: "2px 0 0", fontSize: 13.5, color: "var(--nw-text-body)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          lineHeight: 1.4,
        }}>
          {latestTitle ?? t.fallback}
        </p>
      </div>
      <span style={{
        fontSize: 12.5, fontWeight: 700, color: "var(--nw-primary)",
        whiteSpace: "nowrap",
        display: "inline-flex", alignItems: "center", gap: 6,
      }}>
        {t.read} <ArrowRightIcon />
      </span>
    </Link>
  )
}

function SparkleIcon() {
  return (
    <svg
      width="22" height="22" viewBox="0 0 24 24"
      fill="none" stroke="var(--nw-primary)" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}
      aria-hidden
    >
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <path d="M5.6 5.6l2.8 2.8" />
      <path d="M15.6 15.6l2.8 2.8" />
      <path d="M5.6 18.4l2.8-2.8" />
      <path d="M15.6 8.4l2.8-2.8" />
    </svg>
  )
}

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14" />
      <path d="m13 5 7 7-7 7" />
    </svg>
  )
}
