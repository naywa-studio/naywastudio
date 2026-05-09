"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

const DISMISS_KEY = "naywa_ext_banner_dismissed_at"
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * Thin advisory banner shown above the workspace when the Chrome
 * extension is not detected. Dismissable for 7 days. Used to drive
 * sourceuses through the /install flow without forcing them — the
 * server-side cascade keeps Léo working without the extension.
 */
export function ExtensionBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Honour previous dismissal
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY))
      if (at && Date.now() - at < DISMISS_TTL_MS) return
    } catch { /* ignore */ }

    let detected = false
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window) return
      const d = e.data as { source?: string; type?: string }
      if (d?.source === "nawa-extension" && (d.type === "READY" || d.type === "PONG")) {
        detected = true
        window.removeEventListener("message", onMessage)
      }
    }
    window.addEventListener("message", onMessage)
    window.postMessage({ source: "nawa-page", type: "PING_EXTENSION" }, window.location.origin)

    const t = setTimeout(() => {
      window.removeEventListener("message", onMessage)
      if (!detected) setShow(true)
    }, 2000)
    return () => {
      window.removeEventListener("message", onMessage)
      clearTimeout(t)
    }
  }, [])

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* ignore */ }
    setShow(false)
  }

  if (!show) return null

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 16px",
      background: "linear-gradient(90deg, rgba(124,99,200,0.10) 0%, rgba(184,174,222,0.06) 100%)",
      borderBottom: "1px solid rgba(124,99,200,0.18)",
      fontFamily: "var(--font-inter), sans-serif",
      fontSize: 13, color: "#5B3FA8",
    }}>
      <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>⚡</span>
      <span style={{ flex: 1, lineHeight: 1.5 }}>
        <strong>Astuce :</strong> installe l&apos;extension Naywa Studio pour des recherches plus rapides
        et plus fiables. Sinon Léo continue à marcher via les API serveur.
      </span>
      <Link
        href="/install"
        style={{
          padding: "5px 12px", borderRadius: 7,
          background: "#7C63C8", color: "white",
          fontSize: 12, fontWeight: 700, textDecoration: "none",
          flexShrink: 0,
        }}
      >
        Installer →
      </Link>
      <button
        onClick={dismiss}
        aria-label="Fermer"
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          padding: 4, color: "#7C63C8", flexShrink: 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
        title="Masquer 7 jours"
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
          <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
