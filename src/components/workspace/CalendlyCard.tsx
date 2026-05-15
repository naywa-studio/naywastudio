"use client"

/**
 * Calendly connection card for the workspace dashboard.
 *
 * Not connected → a single "Connecter Calendly" button (OAuth).
 * Connected     → connection status, the meeting-type picker used for candidate
 *                 booking, and a disconnect button.
 */

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { m } from "framer-motion"
import { useWorkspace } from "@/app/workspace/layout"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

interface EventType {
  uri: string
  name: string
  durationMinutes: number | null
}

export default function CalendlyCard() {
  const { profile, refetchProfile } = useWorkspace()
  const searchParams = useSearchParams()
  const connected = !!profile?.calendly_connected_at
  const hasWebhook = !!profile?.calendly_webhook_uri

  const [eventTypes, setEventTypes] = useState<EventType[]>([])
  const [selected, setSelected] = useState<string | null>(profile?.calendly_event_type_uri ?? null)
  const [loadingTypes, setLoadingTypes] = useState(false)
  const [savingType, setSavingType] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const status = searchParams.get("calendly")

  const loadEventTypes = useCallback(async () => {
    setLoadingTypes(true)
    setError(null)
    try {
      const res = await fetch("/api/calendly/event-types")
      const json = await res.json()
      if (!res.ok) throw new Error(json.message || "Erreur Calendly")
      setEventTypes(json.eventTypes ?? [])
      setSelected(json.selected ?? null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingTypes(false)
    }
  }, [])

  useEffect(() => {
    if (connected) loadEventTypes()
  }, [connected, loadEventTypes])

  const handleSelect = async (uri: string) => {
    setSavingType(true)
    setError(null)
    try {
      const res = await fetch("/api/calendly/event-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uri }),
      })
      if (!res.ok) throw new Error("Impossible d'enregistrer le type de RDV.")
      setSelected(uri)
      await refetchProfile()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSavingType(false)
    }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      await fetch("/api/calendly/disconnect", { method: "POST" })
      await refetchProfile()
      setEventTypes([])
      setSelected(null)
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.12, ease: EASE }}
      style={{
        background: "white", border: "1px solid #F0ECF8", borderRadius: 18,
        padding: "24px 26px", marginBottom: 32,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <p style={{
          margin: 0, fontSize: 11, fontWeight: 700, color: "#9CA3AF",
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          Prise de rendez-vous
        </p>
        {connected && (
          <span style={{
            fontSize: 10.5, fontWeight: 700, color: "#16a34a",
            background: "rgba(34,197,94,0.10)", padding: "2px 8px", borderRadius: 100,
          }}>
            Calendly connecté
          </span>
        )}
      </div>

      {!connected && (
        <>
          <p style={{ margin: "0 0 16px", fontSize: 14, color: "#4B5563", lineHeight: 1.65, maxWidth: "56ch" }}>
            Connectez votre compte Calendly pour que vos candidats réservent leurs entretiens
            directement depuis Naywa. Les RDV remontent dans votre pipeline automatiquement.
          </p>
          <a
            href="/api/calendly/oauth/start"
            style={{
              display: "inline-block",
              background: "#7C63C8", color: "white",
              padding: "11px 20px", borderRadius: 11,
              fontSize: 13.5, fontWeight: 700, textDecoration: "none",
            }}
          >
            Connecter Calendly
          </a>
        </>
      )}

      {connected && (
        <>
          {status === "connected_no_webhook" && (
            <p style={{
              margin: "0 0 14px", fontSize: 12.5, color: "#92400E", lineHeight: 1.6,
              background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.25)",
              borderRadius: 10, padding: "9px 12px",
            }}>
              Connexion établie, mais les notifications de réservation n&apos;ont pas pu être activées —
              cela nécessite un plan Calendly payant (Standard minimum). Une fois votre plan mis à niveau,
              déconnectez puis reconnectez Calendly.
            </p>
          )}

          <p style={{ margin: "0 0 14px", fontSize: 14, color: "#4B5563", lineHeight: 1.65, maxWidth: "56ch" }}>
            Choisissez le type de rendez-vous proposé aux candidats sur leur page de réservation.
          </p>

          {loadingTypes && (
            <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF" }}>Chargement des types de RDV…</p>
          )}

          {!loadingTypes && eventTypes.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}>
              {eventTypes.map((et) => (
                <label
                  key={et.uri}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 13px", borderRadius: 11, cursor: "pointer",
                    border: `1px solid ${selected === et.uri ? "#7C63C8" : "#E5E0F2"}`,
                    background: selected === et.uri ? "rgba(124,99,200,0.05)" : "white",
                  }}
                >
                  <input
                    type="radio"
                    name="calendly-event-type"
                    checked={selected === et.uri}
                    disabled={savingType}
                    onChange={() => handleSelect(et.uri)}
                    style={{ accentColor: "#7C63C8" }}
                  />
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "#111827" }}>{et.name}</span>
                  {et.durationMinutes != null && (
                    <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: "auto" }}>
                      {et.durationMinutes} min
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}

          {!loadingTypes && eventTypes.length === 0 && !error && (
            <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF", lineHeight: 1.6 }}>
              Aucun type de RDV actif trouvé sur votre Calendly. Créez-en un dans Calendly, puis
              rechargez cette page.
            </p>
          )}

          {error && (
            <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "#B91C1C" }}>{error}</p>
          )}

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid #F0ECF8" }}>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              style={{
                background: "none", border: "none", padding: 0,
                fontSize: 12.5, fontWeight: 600, color: "#9CA3AF",
                cursor: disconnecting ? "default" : "pointer", fontFamily: "inherit",
                textDecoration: "underline",
              }}
            >
              {disconnecting ? "Déconnexion…" : "Déconnecter Calendly"}
            </button>
            {!hasWebhook && status !== "connected_no_webhook" && (
              <span style={{ marginLeft: 12, fontSize: 12, color: "#D97706" }}>
                Notifications de réservation inactives (plan Calendly payant requis).
              </span>
            )}
          </div>
        </>
      )}
    </m.div>
  )
}
