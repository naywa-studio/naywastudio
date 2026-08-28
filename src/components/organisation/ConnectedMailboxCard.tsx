"use client"

/**
 * ConnectedMailboxCard — connecter sa propre boîte mail.
 *
 * ── Ce que cet écran vend, en une phrase ─────────────────────────────────
 *
 * Écrire aux candidats depuis sa vraie adresse professionnelle, **sans
 * toucher au DNS**. C'est la réponse à la seule objection qui revient
 * vraiment : « je ne veux pas aller modifier mes enregistrements ».
 *
 * ── Personnel, et pas une décision d'organisation ────────────────────────
 *
 * Une boîte mail appartient à quelqu'un. L'écran ne montre donc que LA
 * SIENNE, ne permet de déconnecter que la sienne, et n'exige aucune capacité
 * de gestion : un sourceur ordinaire doit pouvoir le faire seul, sans
 * demander à l'owner.
 *
 * ── Ce qu'on dit franchement ─────────────────────────────────────────────
 *
 * Les réponses des candidats arrivent dans SA boîte, pas dans Naywa. C'est la
 * contrepartie de ce chemin, et la taire ferait croire à un bug le jour où le
 * fil de conversation reste vide.
 */

import { useCallback, useEffect, useState } from "react"
import { useLanguage } from "@/lib/i18n/LanguageContext"

interface Mailbox {
  provider: "google" | "microsoft"
  email: string
  status: "active" | "needs_reconnect"
  last_error: string | null
  connected_at: string
  last_used_at: string | null
}

const copy = {
  fr: {
    title: "Votre boîte mail",
    subtitle: "Écrivez aux candidats depuis votre propre adresse, sans rien configurer.",
    why: "Le message part de votre messagerie habituelle, avec votre adresse et votre signature d'expéditeur. Vous en retrouvez une copie dans vos « Éléments envoyés ». Aucun enregistrement DNS à publier.",
    connect: "Connecter ma boîte Gmail",
    connected: "Boîte connectée",
    sendsFrom: "Vos messages aux candidats partent de",
    connectedOn: (d: string) => `Connectée le ${d}`,
    lastUsed: (d: string) => `Dernier envoi le ${d}`,
    neverUsed: "Aucun envoi pour l'instant",
    disconnect: "Déconnecter",
    disconnecting: "Déconnexion…",
    disconnectConfirm: "Confirmer",
    cancel: "Annuler",
    disconnectWarn: "Vos prochains messages repartiront de l'adresse de votre organisation.",
    revokeNote: "Déconnecter ici supprime notre accès. Vous pouvez aussi le révoquer depuis votre compte Google, dans « Applications tierces ».",
    reconnectTitle: "Reconnectez votre boîte",
    reconnectBody: "Google n'accepte plus notre accès — cela arrive après un changement de mot de passe ou une révocation. Vos envois passent par l'adresse de votre organisation en attendant.",
    reconnect: "Reconnecter",
    repliesTitle: "Où arrivent les réponses",
    repliesBody: "Les candidats répondent dans votre boîte mail, et une copie revient dans Naywa pour alimenter le fil de conversation. Vous restez dans la boucle des deux côtés.",
    notConfigured: "La connexion de boîte mail n'est pas encore disponible sur votre espace.",
    errors: {
      cancelled: "Connexion annulée.",
      denied: "Google a refusé l'autorisation.",
      invalid_state: "Ce lien de connexion n'est plus valable. Réessayez.",
      no_code: "Google n'a pas renvoyé d'autorisation. Réessayez.",
      exchange_failed: "La connexion a échoué. Réessayez, et si cela persiste écrivez-nous.",
      store_failed: "La connexion a échoué à l'enregistrement. Réessayez.",
      mailing_not_included: "L'option Mailing n'est pas incluse dans votre formule.",
      not_configured: "La connexion de boîte mail n'est pas encore disponible.",
      generic: "Une erreur est survenue. Réessayez.",
    } as Record<string, string>,
  },
  en: {
    title: "Your mailbox",
    subtitle: "Email candidates from your own address, with nothing to configure.",
    why: "The message goes out from your usual mailbox, with your address and sender identity. A copy lands in your Sent folder. No DNS record to publish.",
    connect: "Connect my Gmail mailbox",
    connected: "Mailbox connected",
    sendsFrom: "Your messages to candidates are sent from",
    connectedOn: (d: string) => `Connected on ${d}`,
    lastUsed: (d: string) => `Last sent on ${d}`,
    neverUsed: "Nothing sent yet",
    disconnect: "Disconnect",
    disconnecting: "Disconnecting…",
    disconnectConfirm: "Confirm",
    cancel: "Cancel",
    disconnectWarn: "Your next messages will go out from your organisation's address.",
    revokeNote: "Disconnecting here removes our access. You can also revoke it from your Google account, under “Third-party apps”.",
    reconnectTitle: "Reconnect your mailbox",
    reconnectBody: "Google no longer accepts our access — this happens after a password change or a revocation. Your sending falls back to your organisation's address in the meantime.",
    reconnect: "Reconnect",
    repliesTitle: "Where replies arrive",
    repliesBody: "Candidates reply into your mailbox, and a copy comes back to Naywa to fill the conversation thread. You stay in the loop on both sides.",
    notConfigured: "Mailbox connection is not available on your workspace yet.",
    errors: {
      cancelled: "Connection cancelled.",
      denied: "Google refused the authorization.",
      invalid_state: "This connection link is no longer valid. Try again.",
      no_code: "Google did not return an authorization. Try again.",
      exchange_failed: "The connection failed. Try again, and write to us if it persists.",
      store_failed: "The connection could not be saved. Try again.",
      mailing_not_included: "The Mailing option is not included in your plan.",
      not_configured: "Mailbox connection is not available yet.",
      generic: "Something went wrong. Try again.",
    } as Record<string, string>,
  },
}

export default function ConnectedMailboxCard() {
  const { lang } = useLanguage()
  const t = copy[lang === "en" ? "en" : "fr"]

  const [loading, setLoading] = useState(true)
  const [mailbox, setMailbox] = useState<Mailbox | null>(null)
  const [googleReady, setGoogleReady] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/mailing/mailbox")
      const d = await res.json()
      if (!res.ok) return
      setMailbox((d.mailboxes ?? [])[0] ?? null)
      setGoogleReady(d.providers?.google === true)
    } catch {
      // Silencieux : l'écran affiche simplement l'état « non connectée ».
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  /* Le retour du consentement passe par l'URL. On la NETTOIE après lecture :
   * sans ça, un rafraîchissement de page réafficherait « boîte connectée »
   * indéfiniment, y compris après une déconnexion. */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const connected = p.get("mailbox_connected")
    const failed = p.get("mailbox_error")
    if (!connected && !failed) return

    if (connected) setNotice(connected)
    if (failed) setError(t.errors[failed] ?? t.errors.generic)

    p.delete("mailbox_connected")
    p.delete("mailbox_error")
    const qs = p.toString()
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""))
  }, [t])

  const disconnect = useCallback(async () => {
    if (!mailbox) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/mailing/mailbox?email=${encodeURIComponent(mailbox.email)}`, {
        method: "DELETE",
      })
      if (!res.ok) { setError(t.errors.generic); return }
      setMailbox(null); setConfirming(false); setNotice(null)
    } catch {
      setError(t.errors.generic)
    } finally {
      setBusy(false)
    }
  }, [mailbox, t])

  if (loading) return null

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "en" ? "en-US" : "fr-FR",
      { day: "2-digit", month: "long", year: "numeric" })

  const needsReconnect = mailbox?.status === "needs_reconnect"

  return (
    <section style={S.card}>
      <header style={{ marginBottom: 16 }}>
        <h3 style={S.title}>{t.title}</h3>
        <p style={S.subtitle}>{t.subtitle}</p>
      </header>

      {error && <p style={S.error} role="alert">{error}</p>}

      {/* ── À reconnecter ───────────────────────────────────────────────
          Le cas le plus important de cet écran : un jeton meurt sans
          prévenir, et sans ce bandeau le sourceur croirait envoyer alors
          que ses messages repartent d'une autre adresse. */}
      {needsReconnect && (
        <div style={S.warnBox} role="status">
          <strong style={{ fontSize: 13 }}>{t.reconnectTitle}</strong>
          <p style={{ ...S.hint, marginTop: 4 }}>{t.reconnectBody}</p>
          <a href="/api/mailing/oauth/google/start" style={{ ...S.primaryBtn, marginTop: 10 }}>
            {t.reconnect}
          </a>
        </div>
      )}

      {mailbox && !needsReconnect && (
        <div style={S.okBox}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={S.dotOk} aria-hidden />
            <strong style={{ fontSize: 14 }}>{t.connected}</strong>
          </div>
          <p style={S.activeText}>
            {t.sendsFrom} <code style={S.code}>{mailbox.email}</code>
          </p>
          <p style={S.hint}>
            {t.connectedOn(fmt(mailbox.connected_at))}
            {" · "}
            {mailbox.last_used_at ? t.lastUsed(fmt(mailbox.last_used_at)) : t.neverUsed}
          </p>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
            {confirming ? (
              <>
                <span style={{ fontSize: 12, color: "var(--nw-text-body)" }}>{t.disconnectWarn}</span>
                <button type="button" style={S.dangerBtn} disabled={busy} onClick={disconnect}>
                  {busy ? t.disconnecting : t.disconnectConfirm}
                </button>
                <button type="button" style={S.linkBtn} onClick={() => setConfirming(false)}>
                  {t.cancel}
                </button>
              </>
            ) : (
              <button
                type="button"
                style={{ ...S.linkBtn, color: "var(--nw-text-muted)" }}
                onClick={() => setConfirming(true)}
              >
                {t.disconnect}
              </button>
            )}
          </div>
          <p style={{ ...S.hint, marginTop: 8 }}>{t.revokeNote}</p>
        </div>
      )}

      {!mailbox && (
        <>
          <p style={S.why}>{t.why}</p>
          {googleReady ? (
            <a href="/api/mailing/oauth/google/start" style={S.primaryBtn}>{t.connect}</a>
          ) : (
            <p style={S.hint}>{t.notConfigured}</p>
          )}
          {notice && <p style={{ ...S.hint, marginTop: 8 }}>{notice}</p>}
        </>
      )}

      {/* ── La contrepartie, dite franchement ───────────────────────────
          Les réponses arrivent dans SA boîte, pas dans Naywa. Le taire
          ferait croire à un bug le jour où le fil reste vide. */}
      <div style={S.noteBox}>
        <strong style={{ fontSize: 12 }}>{t.repliesTitle}</strong>
        <p style={{ ...S.hint, marginTop: 4 }}>{t.repliesBody}</p>
      </div>
    </section>
  )
}

const S: Record<string, React.CSSProperties> = {
  card: {
    background: "var(--nw-surface, #fff)",
    border: "1px solid var(--nw-border)",
    borderRadius: 14,
    padding: "22px 24px",
    marginBottom: 18,
  },
  title: { margin: 0, fontSize: 16, fontWeight: 700, color: "var(--nw-text)" },
  subtitle: { margin: "4px 0 0", fontSize: 13, color: "var(--nw-text-muted)" },
  why: { margin: "0 0 14px", fontSize: 13, lineHeight: 1.65, color: "var(--nw-text-body)" },
  hint: { margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--nw-text-muted)" },
  activeText: { margin: "8px 0 4px", fontSize: 13.5, color: "var(--nw-text-body)" },
  code: {
    fontFamily: "var(--nw-font-mono, monospace)", fontSize: 12.5,
    background: "var(--nw-surface-muted)", padding: "2px 6px", borderRadius: 5,
  },
  okBox: {
    background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.25)",
    borderRadius: 12, padding: "14px 16px",
  },
  warnBox: {
    background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.32)",
    borderRadius: 12, padding: "14px 16px", marginBottom: 14,
  },
  noteBox: {
    marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--nw-border)",
  },
  dotOk: {
    width: 8, height: 8, borderRadius: "50%", background: "#16A34A", display: "inline-block",
  },
  primaryBtn: {
    display: "inline-block", background: "var(--nw-primary)", color: "#fff",
    border: 0, borderRadius: 9, padding: "10px 16px", fontSize: 13.5,
    fontWeight: 600, cursor: "pointer", textDecoration: "none", fontFamily: "inherit",
  },
  linkBtn: {
    background: "none", border: 0, padding: 0, fontSize: 13,
    color: "var(--nw-primary)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
  },
  dangerBtn: {
    background: "var(--nw-danger-strong, #DC2626)", color: "#fff", border: 0,
    borderRadius: 8, padding: "7px 13px", fontSize: 12.5, cursor: "pointer",
    fontFamily: "inherit", fontWeight: 600,
  },
  error: {
    margin: "0 0 12px", fontSize: 13, color: "var(--nw-danger-strong, #DC2626)",
  },
}
