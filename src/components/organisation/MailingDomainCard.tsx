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
  /** Partie locale de l'adresse d'expédition, avant le « @ ». */
  from_local: string
  sending_domain: string | null
  status: string | null
  verified_at: string | null
  records: DnsRecord[]
  /** "ns_delegation" = Naywa heberge la zone ; null = publication manuelle. */
  path: string | null
  nameservers: string[]
}

const copy = {
  fr: {
    title: "Domaine d'envoi",
    subtitle: "Écrivez aux candidats depuis votre propre domaine, pas depuis celui de Naywa.",
    why: "Un message signé de votre domaine arrive dans la boîte de réception plutôt qu'en indésirables, et le candidat voit votre marque — pas la nôtre.",
    domainLabel: "Nom de domaine de votre organisation",
    domainHint: "Celui de votre site, par exemple « cabinet-durand.fr ».",
    subdomainLabel: "Sous-domaine d'envoi",
    subdomainHint: "Nous n'utilisons jamais la racine de votre domaine : sa réputation sert déjà à votre messagerie interne.",
    fromLabel: "Adresse d'expédition",
    fromHint: "C'est elle que lisent les candidats, en tête de chaque message. Modifiable à tout moment, domaine actif compris — elle ne dépend d'aucun réglage DNS.",
    fromEdit: "Modifier l'adresse",
    fromSave: "Enregistrer",
    fromSaving: "Enregistrement…",
    fromSaved: "Adresse d'expédition mise à jour.",
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
    delegateTitle: "Vous n'avez pas la main sur le DNS ?",
    delegateBody: "Envoyez cette configuration à la personne qui gère votre nom de domaine — prestataire informatique, agence web, associé. Elle recevra un lien où tout est expliqué, et pourra vérifier elle-même.",
    delegatePlaceholder: "email de votre contact technique",
    delegateCta: "Envoyer",
    delegateSending: "Envoi…",
    delegateSent: (e: string) => `Configuration envoyée à ${e}`,
    delegateSentHint: "Le lien est valable 14 jours et ne donne accès à rien d'autre. Vous verrez ici quand le domaine sera vérifié.",
    delegateAgain: "Envoyer à quelqu'un d'autre",
    stuckTitle: "Votre messagerie n'est ni Google ni Microsoft ?",
    stuckBody: "Écrivez-nous : nous regardons votre configuration avec vous et nous vous disons en une réponse si c'est possible.",
    stuckCta: "Nous écrire",
    disconnect: "Reprendre la main",
    disconnectWarn: "Vos messages repartiront du domaine de Naywa. Les réponses en cours continueront d'arriver.",
    disconnectConfirm: "Confirmer",
    disconnecting: "Retrait…",
    zoneBodyActive: "Votre domaine fonctionne, mais chaque renouvellement de clés vous redemandera de publier des enregistrements. En nous déléguant la zone, vous ne le referez plus jamais : une seule publication de quatre serveurs de noms, et nous gérons la suite.",
    nsAfterActive: "Publiez ces quatre serveurs de noms sur votre sous-domaine, chez votre hébergeur DNS. Rien ne presse : votre configuration actuelle continue de fonctionner jusque-là, et vos envois ne s'interrompent pas.",
    zoneTitle: "Ou laissez Naywa s'en occuper",
    zoneBody: "Vous ne publiez alors qu'une seule chose, une seule fois : quatre serveurs de noms. Nous gérons ensuite tous les enregistrements, y compris leurs renouvellements futurs, sans plus jamais vous solliciter.",
    zoneCta: "Laisser Naywa gérer la zone",
    zoneWorking: "Préparation…",
    nsTitle: "Une seule chose à publier",
    nsBody: (d: string) => `Chez votre hébergeur DNS, déléguez le sous-domaine ${d} en ajoutant ces quatre serveurs de noms.`,
    nsAfter: "Une fois publiés, tout le reste est géré de notre côté — vous n'aurez plus rien à faire, même quand les clés seront renouvelées.",
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
    subdomainHint: "We never use your root domain: its reputation already serves your internal mail.",
    fromLabel: "Sender address",
    fromHint: "This is what candidates read at the top of every message. You can change it at any time, even once the domain is live — it depends on no DNS setting.",
    fromEdit: "Change this address",
    fromSave: "Save",
    fromSaving: "Saving…",
    fromSaved: "Sender address updated.",
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
    delegateTitle: "Not the one managing DNS?",
    delegateBody: "Send this configuration to whoever manages your domain — IT provider, web agency, business partner. They get a link with everything explained, and can verify it themselves.",
    delegatePlaceholder: "your technical contact's email",
    delegateCta: "Send",
    delegateSending: "Sending…",
    delegateSent: (e: string) => `Configuration sent to ${e}`,
    delegateSentHint: "The link is valid for 14 days and grants nothing else. You will see here when the domain is verified.",
    delegateAgain: "Send to someone else",
    stuckTitle: "Your mailbox is neither Google nor Microsoft?",
    stuckBody: "Write to us: we will look at your setup with you and tell you in one reply whether it can work.",
    stuckCta: "Contact us",
    disconnect: "Disconnect",
    disconnectWarn: "Your emails will go back out from Naywa's domain. Ongoing replies will keep arriving.",
    disconnectConfirm: "Confirm",
    disconnecting: "Disconnecting…",
    zoneBodyActive: "Your domain works, but every key rotation will ask you to publish records again. Delegate the zone to us and you never will: publish four nameservers once, and we handle the rest.",
    nsAfterActive: "Publish these four nameservers on your subdomain, at your DNS host. No rush: your current setup keeps working until then, and your sending is not interrupted.",
    zoneTitle: "Or let Naywa handle it",
    zoneBody: "You then publish one thing, once: four nameservers. We manage every record from there, including future key rotations, without ever asking you again.",
    zoneCta: "Let Naywa manage the zone",
    zoneWorking: "Preparing…",
    nsTitle: "One thing to publish",
    nsBody: (d: string) => `At your DNS host, delegate the ${d} subdomain by adding these four nameservers.`,
    nsAfter: "Once published, everything else is handled on our side — you will not have to touch it again, even when keys rotate.",
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
  const [busy, setBusy] = useState<"declare" | "verify" | "delegate" | "zone" | "disconnect" | "from" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [needsConfirm, setNeedsConfirm] = useState(false)
  const [domain, setDomain] = useState("")
  const [subdomain, setSubdomain] = useState("careers")
  const [fromLocal, setFromLocal] = useState("recrutement")
  /** Édition de l'adresse d'expédition depuis l'écran « domaine actif ». */
  const [editingFrom, setEditingFrom] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [checks, setChecks] = useState<RecordCheck[]>([])
  const [host, setHost] = useState<DnsHost | null>(null)
  const [delegateEmail, setDelegateEmail] = useState("")
  const [delegated, setDelegated] = useState<string | null>(null)

  const [disconnecting, setDisconnecting] = useState(false)

  const isDelegatedZone = state?.path === "ns_delegation" && (state?.nameservers?.length ?? 0) > 0

  const disconnect = useCallback(async () => {
    setBusy("disconnect"); setError(null); setNotice(null)
    try {
      const res = await fetch("/api/mailing/domain", { method: "DELETE" })
      const d = await res.json()
      if (!res.ok) { setError(d.message || t.genericError); return }
      // Retour à l'état initial : la carte redemande un domaine.
      setState(null); setChecks([]); setHost(null)
      setDisconnecting(false); setEditing(true); setDomain("")
      setSubdomain("careers"); setFromLocal("recrutement"); setEditingFrom(false)
    } catch {
      setError(t.genericError)
    } finally {
      setBusy(null)
    }
  }, [t.genericError])

  const delegateZone = useCallback(async () => {
    setBusy("zone"); setError(null); setNotice(null)
    try {
      const res = await fetch("/api/mailing/domain/delegate-zone", { method: "POST" })
      const d = await res.json()
      if (!res.ok) { setError(d.message || t.genericError); return }
      setState((s) => s ? {
        ...s, path: d.path, nameservers: d.nameservers ?? [], status: d.status,
      } : s)
      // Les contrôles portaient sur les enregistrements du fournisseur : ils
      // n'ont plus de sens maintenant que c'est nous qui les écrivons.
      setChecks([])
    } catch {
      setError(t.genericError)
    } finally {
      setBusy(null)
    }
  }, [t.genericError])

  const delegate = useCallback(async () => {
    setBusy("delegate"); setError(null); setNotice(null)
    try {
      const res = await fetch("/api/mailing/domain/delegate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: delegateEmail.trim() }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.message || t.genericError); return }
      setDelegated(d.email)
    } catch {
      setError(t.genericError)
    } finally {
      setBusy(null)
    }
  }, [delegateEmail, t.genericError])

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
        if (d.from_local) setFromLocal(d.from_local)
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
        body: JSON.stringify({ domain, subdomain, from_local: fromLocal, confirm_replace: confirmReplace }),
      })
      const d = await res.json()
      if (res.status === 409 && d.error === "replace_requires_confirmation") {
        setNeedsConfirm(true); return
      }
      if (!res.ok) { setError(d.message || t.genericError); return }
      setState({
        domain: d.domain, subdomain: d.subdomain,
        from_local: d.from_local ?? fromLocal,
        sending_domain: d.sending_domain,
        status: d.status, verified_at: null, records: d.records ?? [],
        // Une déclaration repart toujours du parcours manuel : c'est ensuite,
        // et seulement si le client le demande, qu'on héberge sa zone.
        path: null, nameservers: [],
      })
      setEditing(false); setNeedsConfirm(false)
    } catch {
      setError(t.genericError)
    } finally {
      setBusy(null)
    }
  }, [domain, subdomain, fromLocal, t.genericError])

  /**
   * L'adresse d'expédition, changée à chaud.
   *
   * Sa propre route (`PATCH`) plutôt que la déclaration : elle ne touche à
   * aucun enregistrement DNS, donc rien à republier ni à revérifier, et rien
   * à interrompre. C'est le seul réglage de cette carte qui se modifie sans
   * conséquence sur les envois en cours.
   */
  const saveFromLocal = useCallback(async () => {
    setBusy("from"); setError(null); setNotice(null)
    try {
      const res = await fetch("/api/mailing/domain", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_local: fromLocal }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.message || t.genericError); return }
      setFromLocal(d.from_local)
      setState((s) => s ? { ...s, from_local: d.from_local } : s)
      setEditingFrom(false)
      setNotice(t.fromSaved)
    } catch {
      setError(t.genericError)
    } finally {
      setBusy(null)
    }
  }, [fromLocal, t.genericError, t.fromSaved])

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
            {t.activeBody} <code style={S.code}>{state?.from_local}@{state?.sending_domain}</code>
          </p>
          <p style={{ ...S.hint, marginTop: 6 }}>{t.activeReply}</p>

          {/* ── L'adresse se change à chaud ──────────────────────────────
              La partie locale ne s'authentifie pas : seul le domaine le
              fait. La modifier ne demande donc aucune republication et
              n'interrompt aucun envoi — c'est le seul réglage de cette
              carte qui puisse bouger sans conséquence, et le seul que le
              candidat lise en tête de chaque message. */}
          {editingFrom ? (
            <div style={{ marginTop: 10 }}>
              <label style={S.label} htmlFor="mailing-from-active">{t.fromLabel}</label>
              <div style={S.inlineField}>
                <input
                  id="mailing-from-active"
                  style={{ ...S.input, maxWidth: 200, marginBottom: 0 }}
                  value={fromLocal}
                  onChange={(e) => setFromLocal(e.target.value)}
                  placeholder="recrutement"
                  autoComplete="off"
                  spellCheck={false}
                />
                <span style={S.inlineSuffix}>@{state?.sending_domain}</span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
                <button type="button" style={S.primaryBtn} disabled={busy !== null} onClick={saveFromLocal}>
                  {busy === "from" ? t.fromSaving : t.fromSave}
                </button>
                <button
                  type="button"
                  style={S.linkBtn}
                  onClick={() => { setEditingFrom(false); setFromLocal(state?.from_local ?? "recrutement") }}
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" style={{ ...S.linkBtn, marginTop: 8 }} onClick={() => setEditingFrom(true)}>
              {t.fromEdit}
            </button>
          )}

          {/* ── La zone gérée reste offerte APRÈS l'activation ───────────
              Elle n'était proposée que sur l'écran des enregistrements,
              donc jamais à un client déjà configuré à la main — c'est-à-dire
              exactement celui qui en aurait le plus envie, puisqu'il a fait
              le travail et devra le refaire à chaque rotation de clés.
              Trouvé en testant : le domaine déjà vérifié repassait droit à
              l'écran vert, et la seconde porte devenait inatteignable. */}
          {isDelegatedZone ? (
            <div style={S.zoneBox}>
              <strong style={{ fontSize: 12 }}>{t.nsTitle}</strong>
              <p style={{ ...S.hint, marginTop: 4 }}>{t.nsAfterActive}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {state.nameservers.map((ns) => (
                  <button key={ns} type="button" style={S.copyBtn} onClick={() => copyValue(ns, ns)}>
                    {copiedKey === ns ? t.copied : ns}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={S.zoneBox}>
              <strong style={{ fontSize: 12 }}>{t.zoneTitle}</strong>
              <p style={{ ...S.hint, marginTop: 4 }}>{t.zoneBodyActive}</p>
              <button
                type="button"
                style={{ ...S.copyBtn, marginTop: 8, padding: "7px 12px", fontSize: 12 }}
                disabled={busy !== null}
                onClick={delegateZone}
              >
                {busy === "zone" ? t.zoneWorking : t.zoneCta}
              </button>
            </div>
          )}

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
            <button type="button" style={S.linkBtn} onClick={() => setEditing(true)}>
              {t.change}
            </button>
            {/* Une fonctionnalité qu'on ne peut pas quitter proprement est
                une fonctionnalité dont le coût ne fait que monter : la zone
                Route 53 survivrait à son client, facturée pour rien. */}
            {disconnecting ? (
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--nw-text-body)" }}>{t.disconnectWarn}</span>
                <button type="button" style={S.dangerBtn} disabled={busy !== null} onClick={disconnect}>
                  {busy === "disconnect" ? t.disconnecting : t.disconnectConfirm}
                </button>
                <button type="button" style={S.linkBtn} onClick={() => setDisconnecting(false)}>
                  {t.cancel}
                </button>
              </span>
            ) : (
              <button
                type="button"
                style={{ ...S.linkBtn, color: "var(--nw-text-muted)" }}
                onClick={() => setDisconnecting(true)}
              >
                {t.disconnect}
              </button>
            )}
          </div>
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

          {/* Le suffixe montre l'adresse ENTIÈRE, pas seulement le domaine :
              c'est la seule chaîne de tout ce parcours que le candidat verra,
              et elle mérite d'être relue avant d'être figée. */}
          <label style={{ ...S.label, marginTop: 14 }} htmlFor="mailing-from">
            {t.fromLabel}
          </label>
          <div style={S.inlineField}>
            <input
              id="mailing-from"
              style={{ ...S.input, maxWidth: 200, marginBottom: 0 }}
              value={fromLocal}
              onChange={(e) => setFromLocal(e.target.value)}
              placeholder="recrutement"
              autoComplete="off"
              spellCheck={false}
            />
            <span style={S.inlineSuffix}>
              @{subdomain || "careers"}.{domain || "…"}
            </span>
          </div>
          <p style={S.hint}>{t.fromHint}</p>

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

          {/* ── Deux portes, jamais les deux à la fois ──────────────────
              Montrer simultanément les enregistrements du fournisseur ET les
              serveurs de noms ferait publier les deux — et la délégation NS
              annulerait les enregistrements posés à la main. */}
          {isDelegatedZone ? (
            <>
              <h4 style={S.recordsTitle}>{t.nsTitle}</h4>
              <p style={S.hint}>{t.nsBody(state.sending_domain ?? "")}</p>
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
                    {state.nameservers.map((ns, i) => (
                      <tr key={ns}>
                        <td style={S.td}><span style={S.badge}>NS</span></td>
                        <td style={{ ...S.td, ...S.mono }}>
                          {i === 0 ? state.subdomain : ""}
                        </td>
                        <td style={{ ...S.td, ...S.mono, wordBreak: "break-all" }}>{ns}</td>
                        <td style={{ ...S.td, textAlign: "right" }}>
                          <button type="button" style={S.copyBtn} onClick={() => copyValue(ns, ns)}>
                            {copiedKey === ns ? t.copied : t.copy}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ ...S.hint, marginTop: 8 }}>{t.nsAfter}</p>
            </>
          ) : (
          <>
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

          {/* Seconde porte : Naywa prend la zone en charge. Proposée SOUS les
              enregistrements, pas à la place — celui qui sait faire va au plus
              court, celui qui doute a une issue. */}
          <div style={S.zoneBox}>
            <strong style={{ fontSize: 12 }}>{t.zoneTitle}</strong>
            <p style={{ ...S.hint, marginTop: 4 }}>{t.zoneBody}</p>
            <button
              type="button"
              style={{ ...S.copyBtn, marginTop: 8, padding: "7px 12px", fontSize: 12 }}
              disabled={busy !== null}
              onClick={delegateZone}
            >
              {busy === "zone" ? t.zoneWorking : t.zoneCta}
            </button>
          </div>
          </>
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
            <button type="button" style={S.primaryBtn} disabled={busy !== null} onClick={verify}>
              {busy === "verify" ? t.verifying : t.verify}
            </button>
            <button type="button" style={S.linkBtn} onClick={() => setEditing(true)}>
              {t.change}
            </button>
          </div>

          {/* Déléguer, plutôt que transférer un email technique à l'aveugle.
              Celui qui achète l'option n'a presque jamais les accès DNS : sans
              ce chemin, la mise en route s'arrête chez quelqu'un d'autre, avec
              des captures d'écran, et souvent ne repart pas. */}
          <div style={S.delegateBox}>
            {delegated ? (
              <>
                <strong style={{ fontSize: 12 }}>{t.delegateSent(delegated)}</strong>
                <p style={{ ...S.hint, marginTop: 4 }}>{t.delegateSentHint}</p>
                <button type="button" style={S.linkBtn} onClick={() => setDelegated(null)}>
                  {t.delegateAgain}
                </button>
              </>
            ) : (
              <>
                <strong style={{ fontSize: 12 }}>{t.delegateTitle}</strong>
                <p style={{ ...S.hint, marginTop: 4 }}>{t.delegateBody}</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <input
                    style={{ ...S.input, marginBottom: 0, flex: "1 1 220px", width: "auto" }}
                    value={delegateEmail}
                    onChange={(e) => setDelegateEmail(e.target.value)}
                    placeholder={t.delegatePlaceholder}
                    type="email"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    style={S.primaryBtn}
                    disabled={busy !== null || !delegateEmail.trim()}
                    onClick={delegate}
                  >
                    {busy === "delegate" ? t.delegateSending : t.delegateCta}
                  </button>
                </div>
              </>
            )}

            {/* ── L'issue pour ceux que rien de tout ça ne couvre ───────────
                Un cabinet chez OVH, Gandi, IONOS, Infomaniak ou Zoho ne sera
                jamais éligible aux connecteurs Google et Microsoft. Sans cette
                porte, il arrive au bout du parcours et ne trouve rien — le
                pire endroit où laisser quelqu'un qui vient de payer. */}
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--nw-border)" }}>
              <strong style={{ fontSize: 12 }}>{t.stuckTitle}</strong>
              <p style={{ ...S.hint, marginTop: 4 }}>{t.stuckBody}</p>
              <a href="/contact" style={{ ...S.linkBtn, display: "inline-block", marginTop: 6, textDecoration: "none" }}>
                {t.stuckCta}
              </a>
            </div>
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
  zoneBox: {
    marginTop: 14, padding: "12px 14px", borderRadius: 10,
    background: "var(--nw-surface-muted)", border: "1px dashed var(--nw-border)",
  },
  delegateBox: {
    marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--nw-border)",
  },
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
