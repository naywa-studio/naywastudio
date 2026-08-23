"use client"

/**
 * MailingDomainCard — la mise en route du domaine d'envoi, côté client.
 *
 * Tout le socle mailing existait sans écran : déclaration, vérification et
 * bascule d'adresses n'étaient appelables qu'en HTTP. Aucun cabinet ne pouvait
 * s'en servir. C'est cette carte qui rend la fonctionnalité atteignable.
 *
 * ── Le vrai enjeu de cet écran ────────────────────────────────────────────
 *
 * Publier des enregistrements DNS est l'étape où les gens abandonnent. Ce
 * n'est pas une difficulté technique, c'est une difficulté de confiance : on
 * demande à quelqu'un de coller des chaînes incompréhensibles dans une
 * interface qu'il connaît mal, sans savoir si ça a marché.
 *
 * D'où trois partis pris :
 *
 *  - **un enregistrement par ligne, copiable en un clic.** Retaper un jeton
 *    DKIM à la main produit une faute de frappe, et une faute de frappe
 *    produit une vérification qui échoue sans dire pourquoi ;
 *  - **l'état est toujours affiché**, y compris « en attente » : ne rien
 *    montrer entre la publication et la vérification laisse croire à une
 *    panne, et le client relance le support ;
 *  - **on ne promet jamais que c'est prêt.** Seul le fournisseur peut le dire,
 *    et l'écran ne fait que rapporter sa réponse.
 */

import { useCallback, useEffect, useState } from "react"
import { useLanguage } from "@/lib/i18n/LanguageContext"

interface DnsRecord {
  type: "CNAME" | "TXT" | "MX"
  name: string
  value: string
  priority?: number
}

interface RecordCheck {
  record: DnsRecord
  state: "ok" | "missing" | "wrong" | "unknown"
  found?: string
}

interface DnsHost {
  name: string | null
  where: string | null
  nameservers: string[]
}

interface DomainState {
  domain: string | null
  subdomain: string
  sending_domain: string | null
  status: string | null
  verified_at: string | null
  records: DnsRecord[]
}

const copy = {
  fr: {
    title: "Domaine d'envoi",
    subtitle: "Écrivez aux candidats depuis votre propre domaine, pas depuis celui de Naywa.",
    why: "Un message signé de votre domaine arrive dans la boîte de réception plutôt qu'en indésirables, et le candidat voit votre marque — pas la nôtre.",
    domainLabel: "Nom de domaine de votre organisation",
    domainHint: "Celui de votre site, par exemple « cabinet-durand.fr ».",
    subdomainLabel: "Sous-domaine d'envoi",
    subdomainHint: "Vos emails partiront de cette adresse. Nous n'utilisons jamais la racine de votre domaine : sa réputation sert déjà à votre messagerie interne.",
    declare: "Déclarer ce domaine",
    declaring: "Déclaration en cours…",
    recordsTitle: "À publier chez votre hébergeur DNS",
    recordsBody: "Ajoutez ces enregistrements, puis revenez cliquer sur « Vérifier ». La propagation prend de quelques minutes à quelques heures.",
    colType: "Type",
    colName: "Nom",
    colValue: "Valeur",
    copy: "Copier",
    copied: "Copié",
    verify: "Vérifier",
    verifying: "Vérification…",
    notYet: "Les enregistrements ne sont pas encore visibles. C'est normal juste après la publication : réessayez dans quelques minutes.",
    stOk: "En place",
    stMissing: "Absent",
    stWrong: "Valeur différente",
    stUnknown: "Non lu",
    foundLabel: "Trouvé :",
    allPublished: "Vos quatre enregistrements sont visibles. Il reste à votre hébergeur et à notre fournisseur de se synchroniser — cela prend de quelques minutes à quelques heures. Revenez vérifier.",
    hostDetected: (name: string) => `Votre DNS est géré chez ${name}`,
    hostUnknown: "Serveurs de noms de votre domaine",
    activeTitle: "Votre domaine est actif",
    activeBody: "Vos messages aux candidats partent désormais de",
    activeReply: "Leurs réponses reviennent dans Naywa, comme avant.",
    change: "Changer de domaine",
    cancel: "Annuler",
    replaceWarn: "Votre domaine actuel est actif. Le remplacer peut interrompre les échanges en cours avec les candidats déjà contactés.",
    replaceConfirm: "Remplacer quand même",
    statusPending: "En attente",
    statusAwaiting: "En attente de publication DNS",
    statusVerifying: "Vérification en cours",
    statusFailed: "Échec — reprenez la mise en route",
    genericError: "Une erreur est survenue. Réessayez.",
  },
  en: {
    title: "Sending domain",
    subtitle: "Email candidates from your own domain, not from Naywa's.",
    why: "A message signed by your domain lands in the inbox rather than in spam, and the candidate sees your brand — not ours.",
    domainLabel: "Your organisation's domain name",
    domainHint: "The one your website uses, for example “durand-recruiting.com”.",
    subdomainLabel: "Sending subdomain",
    subdomainHint: "Your emails will come from this address. We never use your root domain: its reputation already serves your internal mail.",
    declare: "Declare this domain",
    declaring: "Declaring…",
    recordsTitle: "To publish with your DNS host",
    recordsBody: "Add these records, then come back and click “Verify”. Propagation takes a few minutes to a few hours.",
    colType: "Type",
    colName: "Name",
    colValue: "Value",
    copy: "Copy",
    copied: "Copied",
    verify: "Verify",
    verifying: "Verifying…",
    notYet: "The records aren't visible yet. That's expected right after publishing — try again in a few minutes.",
    stOk: "In place",
    stMissing: "Missing",
    stWrong: "Different value",
    stUnknown: "Not read",
    foundLabel: "Found:",
    allPublished: "All four records are visible. Your DNS host and our provider now need to sync — that takes a few minutes to a few hours. Come back and verify.",
    hostDetected: (name: string) => `Your DNS is managed at ${name}`,
    hostUnknown: "Your domain's nameservers",
    activeTitle: "Your domain is active",
    activeBody: "Your candidate emails now come from",
    activeReply: "Their replies come back into Naywa, as before.",
    change: "Change domain",
    cancel: "Cancel",
    replaceWarn: "Your current domain is active. Replacing it may interrupt ongoing conversations with candidates already contacted.",
    replaceConfirm: "Replace anyway",
    statusPending: "Pending",
    statusAwaiting: "Awaiting DNS publication",
    statusVerifying: "Verifying",
    statusFailed: "Failed — start setup again",
    genericError: "Something went wrong. Please try again.",
  },
} as const

export default function MailingDomainCard() {
  const { lang } = useLanguage()
  const t = copy[lang === "en" ? "en" : "fr"]

  const [state, setState] = useState<DomainState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<"declare" | "verify" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [needsConfirm, setNeedsConfirm] = useState(false)
  const [domain, setDomain] = useState("")
  const [subdomain, setSubdomain] = useState("careers")
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [checks, setChecks] = useState<RecordCheck[]>([])
  const [host, setHost] = useState<DnsHost | null>(null)

  // Chargement initial. Le garde `cancelled` évite d'écrire dans un composant
  // démonté — la console /organisation change de section sans démonter la page.
  useEffect(() => {
    let cancelled = false
    fetch("/api/mailing/domain")
      .then((r) => r.json())
      .then((d: DomainState & { error?: string }) => {
        if (cancelled || d.error) return
        setState(d)
        if (d.domain) setDomain(d.domain)
        if (d.subdomain) setSubdomain(d.subdomain)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const declare = useCallback(async (confirmReplace: boolean) => {
    setBusy("declare"); setError(null); setNotice(null)
    try {
      const res = await fetch("/api/mailing/domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, subdomain, confirm_replace: confirmReplace }),
      })
      const d = await res.json()
      if (res.status === 409 && d.error === "replace_requires_confirmation") {
        setNeedsConfirm(true); return
      }
      if (!res.ok) { setError(d.message || t.genericError); return }
      setState({
        domain: d.domain, subdomain: d.subdomain, sending_domain: d.sending_domain,
        status: d.status, verified_at: null, records: d.records ?? [],
      })
      setEditing(false); setNeedsConfirm(false)
    } catch {
      setError(t.genericError)
    } finally {
      setBusy(null)
    }
  }, [domain, subdomain, t.genericError])

  const verify = useCallback(async () => {
    setBusy("verify"); setError(null); setNotice(null)
    try {
      const res = await fetch("/api/mailing/domain/verify", { method: "POST" })
      const d = await res.json()
      if (!res.ok) { setError(d.message || t.genericError); return }
      setState((s) => s ? { ...s, status: d.status, records: d.records ?? s.records } : s)
      setChecks(d.checks ?? [])
      setHost(d.host ?? null)
      // Une vérification qui n'aboutit pas n'est PAS une erreur : c'est l'état
      // normal des premières minutes. Et quand TOUT est publié de notre point
      // de vue, on le dit — sinon le client croit s'être trompé alors qu'il
      // n'a plus qu'à attendre.
      if (d.status !== "active") {
        const list: RecordCheck[] = d.checks ?? []
        const allOk = list.length > 0 && list.every((c) => c.state === "ok")
        setNotice(allOk ? t.allPublished : t.notYet)
      }
    } catch {
      setError(t.genericError)
    } finally {
      setBusy(null)
    }
  }, [t.genericError, t.notYet, t.allPublished])

  const copyValue = useCallback((key: string, value: string) => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1600)
    }).catch(() => {})
  }, [])

  if (loading) return null

  const status = state?.status ?? null
  const isActive = status === "active"
  const showForm = editing || !state?.domain

  return (
    <section style={S.card}>
      <header style={{ marginBottom: 18 }}>
        <h3 style={S.title}>{t.title}</h3>
        <p style={S.subtitle}>{t.subtitle}</p>
      </header>

      {isActive && !editing ? (
        <div style={S.activeBox}>
          <div style={S.activeHead}>
            <span style={S.dotOk} aria-hidden />
            <strong style={{ fontSize: 14 }}>{t.activeTitle}</strong>
          </div>
          <p style={S.activeText}>
            {t.activeBody} <code style={S.code}>{state?.subdomain}@{state?.sending_domain}</code>
          </p>
          <p style={{ ...S.hint, marginTop: 6 }}>{t.activeReply}</p>
          <button type="button" style={S.linkBtn} onClick={() => setEditing(true)}>
            {t.change}
          </button>
        </div>
      ) : null}

      {showForm ? (
        <div>
          <p style={S.why}>{t.why}</p>

          <label style={S.label} htmlFor="mailing-domain">{t.domainLabel}</label>
          <input
            id="mailing-domain"
            style={S.input}
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="cabinet-durand.fr"
            autoComplete="off"
            spellCheck={false}
          />
          <p style={S.hint}>{t.domainHint}</p>

          <label style={{ ...S.label, marginTop: 14 }} htmlFor="mailing-subdomain">
            {t.subdomainLabel}
          </label>
          <div style={S.inlineField}>
            <input
              id="mailing-subdomain"
              style={{ ...S.input, maxWidth: 160, marginBottom: 0 }}
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              placeholder="careers"
              autoComplete="off"
              spellCheck={false}
            />
            <span style={S.inlineSuffix}>.{domain || "…"}</span>
          </div>
          <p style={S.hint}>{t.subdomainHint}</p>

          {needsConfirm ? (
            <div style={S.warnBox}>
              <p style={{ margin: 0, fontSize: 13 }}>{t.replaceWarn}</p>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button type="button" style={S.dangerBtn} disabled={busy !== null}
                  onClick={() => declare(true)}>
                  {t.replaceConfirm}
                </button>
                <button type="button" style={S.linkBtn} onClick={() => setNeedsConfirm(false)}>
                  {t.cancel}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
              <button type="button" style={S.primaryBtn}
                disabled={busy !== null || !domain.trim()}
                onClick={() => declare(false)}>
                {busy === "declare" ? t.declaring : t.declare}
              </button>
              {state?.domain ? (
                <button type="button" style={S.linkBtn} onClick={() => setEditing(false)}>
                  {t.cancel}
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {!isActive && !showForm && state?.records?.length ? (
        <div>
          <div style={S.statusRow}>
            <span style={S.dotWait} aria-hidden />
            <span style={S.statusText}>
              {status === "verifying" ? t.statusVerifying
                : status === "failed" ? t.statusFailed
                : status === "pending" ? t.statusPending
                : t.statusAwaiting}
            </span>
          </div>

          <h4 style={S.recordsTitle}>{t.recordsTitle}</h4>
          <p style={S.hint}>{t.recordsBody}</p>

          {/* Où aller, chez SON hébergeur. Déduit des serveurs de noms et non
              du registrar déclaré : ce qui compte est l'endroit où la zone se
              modifie, et beaucoup de domaines sont achetés chez l'un puis
              délégués à l'autre. */}
          {host && (host.name || host.nameservers.length > 0) && (
            <div style={S.hostBox}>
              <strong style={{ fontSize: 12 }}>
                {host.name ? t.hostDetected(host.name) : t.hostUnknown}
              </strong>
              {host.where && <p style={{ ...S.hint, marginTop: 4 }}>{host.where}</p>}
              {!host.name && host.nameservers.length > 0 && (
                <p style={{ ...S.hint, ...S.mono, marginTop: 4 }}>
                  {host.nameservers.slice(0, 3).join(", ")}
                </p>
              )}
            </div>
          )}

          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>{t.colType}</th>
                  <th style={S.th}>{t.colName}</th>
                  <th style={S.th}>{t.colValue}</th>
                  <th style={S.th} aria-label={t.copy} />
                </tr>
              </thead>
              <tbody>
                {state.records.map((r, i) => {
                  const key = `${r.type}-${r.name}-${i}`
                  const check = checks.find((c) => c.record.name === r.name && c.record.type === r.type)
                  return (
                    <tr key={key}>
                      <td style={S.td}>
                        <span style={S.badge}>{r.type}</span>
                        {check && (
                          <span style={{
                            ...S.state,
                            color: check.state === "ok" ? "var(--nw-success)"
                              : check.state === "unknown" ? "var(--nw-text-muted)" : "#DC2626",
                          }}>
                            {check.state === "ok" ? t.stOk
                              : check.state === "missing" ? t.stMissing
                              : check.state === "wrong" ? t.stWrong : t.stUnknown}
                          </span>
                        )}
                      </td>
                      <td style={{ ...S.td, ...S.mono }}>{r.name}</td>
                      <td style={{ ...S.td, ...S.mono, wordBreak: "break-all" }}>
                        {r.priority != null ? `${r.priority} ` : ""}{r.value}
                        {/* Ce qu'on a réellement trouvé, quand ça diffère :
                            un client qui voit la valeur en place à côté de
                            celle attendue repère sa faute de copie tout seul. */}
                        {check?.state === "wrong" && check.found && (
                          <div style={{ marginTop: 3, color: "#DC2626" }}>
                            {t.foundLabel} {check.found}
                          </div>
                        )}
                      </td>
                      <td style={{ ...S.td, textAlign: "right" }}>
                        <button type="button" style={S.copyBtn}
                          onClick={() => copyValue(key, r.value)}>
                          {copiedKey === key ? t.copied : t.copy}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
            <button type="button" style={S.primaryBtn} disabled={busy !== null} onClick={verify}>
              {busy === "verify" ? t.verifying : t.verify}
            </button>
            <button type="button" style={S.linkBtn} onClick={() => setEditing(true)}>
              {t.change}
            </button>
          </div>
        </div>
      ) : null}

      {notice ? <p style={S.notice}>{notice}</p> : null}
      {error ? <p style={S.error}>{error}</p> : null}
    </section>
  )
}

const S: Record<string, React.CSSProperties> = {
  card: {
    background: "var(--nw-surface)",
    border: "1px solid var(--nw-border)",
    borderRadius: 14,
    padding: "22px 24px",
  },
  title: { margin: 0, fontSize: 17, fontWeight: 650, color: "var(--nw-text)" },
  subtitle: { margin: "6px 0 0", fontSize: 13, color: "var(--nw-text-muted)" },
  why: { margin: "0 0 16px", fontSize: 13, color: "var(--nw-text-muted)", lineHeight: 1.55 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "var(--nw-text)", marginBottom: 6 },
  input: {
    width: "100%", padding: "9px 12px", fontSize: 14, marginBottom: 6,
    border: "1px solid var(--nw-border)", borderRadius: 9,
    background: "var(--nw-bg)", color: "var(--nw-text)",
  },
  inlineField: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
  inlineSuffix: { fontSize: 13, color: "var(--nw-text-muted)", fontFamily: "var(--font-mono, monospace)" },
  hint: { margin: "0 0 2px", fontSize: 12, color: "var(--nw-text-muted)", lineHeight: 1.5 },
  primaryBtn: {
    padding: "9px 16px", fontSize: 13, fontWeight: 600, borderRadius: 9,
    border: "none", background: "var(--nw-primary)", color: "#fff", cursor: "pointer",
  },
  dangerBtn: {
    padding: "8px 14px", fontSize: 13, fontWeight: 600, borderRadius: 9,
    border: "none", background: "#DC2626", color: "#fff", cursor: "pointer",
  },
  linkBtn: {
    padding: "8px 4px", fontSize: 13, fontWeight: 600, borderRadius: 8,
    border: "none", background: "transparent", color: "var(--nw-primary)", cursor: "pointer",
  },
  copyBtn: {
    padding: "5px 10px", fontSize: 11, fontWeight: 600, borderRadius: 7,
    border: "1px solid var(--nw-border)", background: "var(--nw-bg)",
    color: "var(--nw-text)", cursor: "pointer", whiteSpace: "nowrap",
  },
  statusRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16 },
  statusText: { fontSize: 13, color: "var(--nw-text-muted)" },
  dotWait: { width: 8, height: 8, borderRadius: "50%", background: "#F59E0B", display: "inline-block" },
  dotOk: { width: 8, height: 8, borderRadius: "50%", background: "#22C55E", display: "inline-block" },
  recordsTitle: { margin: "0 0 4px", fontSize: 13, fontWeight: 650, color: "var(--nw-text)" },
  // Le tableau défile SEUL : une valeur DKIM est longue, et laisser la page
  // partir en travers casserait toute la console sur un écran étroit.
  tableWrap: { overflowX: "auto", marginTop: 10, border: "1px solid var(--nw-border)", borderRadius: 10 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: {
    textAlign: "left", padding: "8px 10px", fontSize: 10, letterSpacing: "0.05em",
    textTransform: "uppercase", color: "var(--nw-text-muted)",
    borderBottom: "1px solid var(--nw-border)", fontWeight: 600,
  },
  td: { padding: "8px 10px", borderBottom: "1px solid var(--nw-border)", verticalAlign: "top" },
  mono: { fontFamily: "var(--font-mono, monospace)", fontSize: 11 },
  badge: {
    padding: "2px 7px", fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase",
    borderRadius: 5, background: "var(--nw-surface-muted)", color: "var(--nw-text-muted)",
  },
  state: { display: "block", marginTop: 4, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" },
  hostBox: {
    marginTop: 10, padding: "10px 12px", borderRadius: 10,
    background: "var(--nw-surface-muted)", border: "1px solid var(--nw-border)",
  },
  activeBox: {
    padding: "14px 16px", borderRadius: 11,
    background: "var(--nw-surface-muted)", border: "1px solid var(--nw-border)",
  },
  activeHead: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  activeText: { margin: 0, fontSize: 13, color: "var(--nw-text)" },
  code: { fontFamily: "var(--font-mono, monospace)", fontSize: 12, color: "var(--nw-primary)" },
  warnBox: {
    marginTop: 14, padding: "12px 14px", borderRadius: 10,
    background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.35)",
  },
  notice: { marginTop: 12, fontSize: 12, color: "var(--nw-text-muted)" },
  error: { marginTop: 12, fontSize: 12, color: "#DC2626" },
}
