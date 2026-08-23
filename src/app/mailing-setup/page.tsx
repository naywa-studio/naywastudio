"use client"

/**
 * /mailing-setup?token=… — la page du contact technique.
 *
 * Ouverte SANS COMPTE, par quelqu'un que Naywa n'a jamais vu : le prestataire
 * informatique, l'agence web ou l'associé à qui le cabinet a délégué la
 * publication DNS.
 *
 * ── Ce que ça change ─────────────────────────────────────────────────────
 *
 * Le sourceur qui achète l'option n'a presque jamais les accès DNS. Sans
 * cette page, la mise en route se termine en transfert d'un email technique
 * vers quelqu'un d'autre, avec des captures d'écran — et la moitié s'arrête
 * là. Ici, la personne qui a les accès voit ce qu'elle doit faire, où le
 * faire, et constate elle-même que c'est bon.
 *
 * ── Écrit pour quelqu'un qui n'a pas de contexte ─────────────────────────
 *
 * Il ne sait pas ce qu'est Naywa, ni pourquoi on lui demande ça. La page
 * commence donc par le dire, en une phrase, avant de montrer quoi que ce
 * soit de technique.
 */

import { Suspense, useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"

interface DnsRecord { type: string; name: string; value: string; priority?: number }
interface RecordCheck { record: DnsRecord; state: "ok" | "missing" | "wrong" | "unknown"; found?: string }
interface DnsHost { name: string | null; where: string | null; nameservers: string[] }

interface Payload {
  ok?: true
  error?: string
  org_name?: string
  sending_domain?: string
  status?: string
  records?: DnsRecord[]
  checks?: RecordCheck[]
  host?: DnsHost | null
  became_active?: boolean
}

function SetupInner() {
  const token = useSearchParams().get("token") ?? ""
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/mailing/delegate/${encodeURIComponent(token)}`)
      setData(await res.json())
    } catch {
      setData({ error: "network" })
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { if (token) load(); else setLoading(false) }, [token, load])

  const verify = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/mailing/delegate/${encodeURIComponent(token)}`, { method: "POST" })
      setData(await res.json())
    } catch {
      setData((d) => ({ ...(d ?? {}), error: "network" }))
    } finally {
      setBusy(false)
    }
  }

  const copy = (key: string, value: string) => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(key)
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1600)
    }).catch(() => {})
  }

  if (loading) return null

  if (!token || data?.error) {
    return (
      <main style={S.page}>
        <div style={S.card}>
          <h1 style={S.h1}>Lien invalide ou expiré</h1>
          <p style={S.p}>
            Ce lien de configuration n&apos;est plus valable. Demandez à votre interlocuteur
            de vous en renvoyer un depuis son espace Naywa.
          </p>
        </div>
      </main>
    )
  }

  const active = data?.status === "active"
  const records = data?.records ?? []
  const checks = data?.checks ?? []
  const allOk = checks.length > 0 && checks.every((c) => c.state === "ok")

  return (
    <main style={S.page}>
      <div style={S.card}>
        <p style={S.eyebrow}>Naywa Studio · Configuration DNS</p>
        <h1 style={S.h1}>
          {active ? "Configuration terminée" : `Enregistrements à publier pour ${data?.org_name ?? ""}`}
        </h1>

        {active ? (
          <p style={S.p}>
            Le domaine <code style={S.code}>{data?.sending_domain}</code> est vérifié.
            Il n&apos;y a plus rien à faire — vous pouvez fermer cette page.
          </p>
        ) : (
          <>
            <p style={S.p}>
              {data?.org_name} utilise Naywa pour contacter des candidats, et souhaite que
              ces emails partent de son propre domaine plutôt que d&apos;un domaine tiers.
              Cela demande de publier les enregistrements ci-dessous sur{" "}
              <code style={S.code}>{data?.sending_domain}</code>.
            </p>
            <p style={S.pMuted}>
              Ce sont des enregistrements d&apos;authentification (DKIM et DMARC) et de
              réception. Ils n&apos;affectent ni le site web, ni la messagerie existante du
              domaine racine : tout est posé sur un sous-domaine dédié.
            </p>

            {data?.host && (data.host.name || data.host.nameservers.length > 0) && (
              <div style={S.hostBox}>
                <strong style={{ fontSize: 13 }}>
                  {data.host.name ? `DNS hébergé chez ${data.host.name}` : "Serveurs de noms du domaine"}
                </strong>
                {data.host.where && <p style={{ ...S.pMuted, margin: "4px 0 0" }}>{data.host.where}</p>}
                {!data.host.name && data.host.nameservers.length > 0 && (
                  <p style={{ ...S.pMuted, ...S.mono, margin: "4px 0 0" }}>
                    {data.host.nameservers.slice(0, 3).join(", ")}
                  </p>
                )}
              </div>
            )}

            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Type</th>
                    <th style={S.th}>Nom</th>
                    <th style={S.th}>Valeur</th>
                    <th style={S.th} aria-label="Copier" />
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => {
                    const key = `${r.type}-${r.name}-${i}`
                    const check = checks.find((c) => c.record.name === r.name && c.record.type === r.type)
                    return (
                      <tr key={key}>
                        <td style={S.td}>
                          <span style={S.badge}>{r.type}</span>
                          {check && (
                            <span style={{
                              ...S.state,
                              color: check.state === "ok" ? "#16A34A"
                                : check.state === "unknown" ? "#6B7280" : "#DC2626",
                            }}>
                              {check.state === "ok" ? "En place"
                                : check.state === "missing" ? "Absent"
                                : check.state === "wrong" ? "Valeur différente" : "Non lu"}
                            </span>
                          )}
                        </td>
                        <td style={{ ...S.td, ...S.mono }}>{r.name}</td>
                        <td style={{ ...S.td, ...S.mono, wordBreak: "break-all" }}>
                          {r.priority != null ? `${r.priority} ` : ""}{r.value}
                          {check?.state === "wrong" && check.found && (
                            <div style={{ marginTop: 3, color: "#DC2626" }}>Trouvé : {check.found}</div>
                          )}
                        </td>
                        <td style={{ ...S.td, textAlign: "right" }}>
                          <button type="button" style={S.copyBtn} onClick={() => copy(key, r.value)}>
                            {copied === key ? "Copié" : "Copier"}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16 }}>
              <button type="button" style={S.primary} disabled={busy} onClick={verify}>
                {busy ? "Vérification…" : "Vérifier"}
              </button>
            </div>

            {/* Distinguer « tout est publié, laissez propager » de « il manque
                quelque chose » évite la boucle où l'on refait une
                configuration déjà correcte. */}
            {checks.length > 0 && (
              <p style={{ ...S.pMuted, marginTop: 12 }}>
                {allOk
                  ? "Tous les enregistrements sont visibles. La validation finale peut prendre de quelques minutes à quelques heures — revenez vérifier."
                  : "Certains enregistrements ne sont pas encore visibles. C'est normal juste après la publication : réessayez dans quelques minutes."}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  )
}

export default function MailingSetupPage() {
  // `useSearchParams` impose une frontière de suspense au prérendu.
  return <Suspense fallback={null}><SetupInner /></Suspense>
}

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh", background: "var(--nw-bg, #FDFCF9)",
    padding: "48px 20px", display: "flex", justifyContent: "center",
    fontFamily: "var(--font-inter, system-ui, sans-serif)",
  },
  card: {
    width: "100%", maxWidth: 780, background: "white",
    border: "1px solid var(--nw-border, #E5E7EB)", borderRadius: 16, padding: "30px 32px",
  },
  eyebrow: {
    margin: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em",
    textTransform: "uppercase", color: "var(--nw-primary, #7C63C8)",
    fontFamily: "var(--nw-font-mono, monospace)",
  },
  h1: { margin: "10px 0 14px", fontSize: 22, fontWeight: 650, color: "var(--nw-text, #111827)" },
  p: { margin: "0 0 10px", fontSize: 14, lineHeight: 1.65, color: "var(--nw-text-body, #374151)" },
  pMuted: { margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.6, color: "#6B7280" },
  code: { fontFamily: "var(--nw-font-mono, monospace)", fontSize: 13, color: "var(--nw-primary, #7C63C8)" },
  hostBox: {
    margin: "14px 0", padding: "12px 14px", borderRadius: 10,
    background: "#F8F6FF", border: "1px solid #E5E7EB",
  },
  tableWrap: { overflowX: "auto", marginTop: 14, border: "1px solid #E5E7EB", borderRadius: 10 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: {
    textAlign: "left", padding: "9px 11px", fontSize: 10, letterSpacing: "0.05em",
    textTransform: "uppercase", color: "#6B7280", borderBottom: "1px solid #E5E7EB", fontWeight: 600,
  },
  td: { padding: "9px 11px", borderBottom: "1px solid #E5E7EB", verticalAlign: "top" },
  mono: { fontFamily: "var(--nw-font-mono, monospace)", fontSize: 11 },
  badge: {
    display: "inline-block", padding: "2px 7px", fontSize: 10, letterSpacing: "0.05em",
    textTransform: "uppercase", borderRadius: 5, background: "#F3F4F6", color: "#6B7280",
  },
  state: { display: "block", marginTop: 4, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" },
  copyBtn: {
    padding: "5px 10px", fontSize: 11, fontWeight: 600, borderRadius: 7,
    border: "1px solid #E5E7EB", background: "white", cursor: "pointer", whiteSpace: "nowrap",
  },
  primary: {
    padding: "9px 17px", fontSize: 13, fontWeight: 600, borderRadius: 9,
    border: "none", background: "var(--nw-primary, #7C63C8)", color: "white", cursor: "pointer",
  },
}
