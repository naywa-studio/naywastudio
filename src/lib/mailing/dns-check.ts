/**
 * Vérifier NOUS-MÊMES les enregistrements DNS, et dire ce qui manque.
 *
 * ── Le problème que ça règle ─────────────────────────────────────────────
 *
 * Aujourd'hui, « Vérifier » interroge SES, qui répond « pas vérifié ». Sans
 * dire lequel des quatre enregistrements manque, ni s'il est absent, mal
 * recopié, ou simplement pas encore propagé.
 *
 * Le client n'a alors aucune prise : il relit ses quatre lignes, ne voit rien,
 * reclique, obtient le même « pas vérifié », et abandonne ou appelle le
 * support. C'est là que se perdent les mises en route — pas sur la difficulté
 * technique, sur l'absence de retour.
 *
 * En résolvant les enregistrements nous-mêmes, on peut dire « le troisième
 * CNAME pointe vers autre chose » ou « les trois sont là, laissez propager ».
 * Ça transforme un mur en une étape.
 *
 * ── Ce que cette lecture ne décide PAS ───────────────────────────────────
 *
 * Elle n'accorde jamais l'état `active`. Seule la réponse du fournisseur le
 * fait. Notre résolveur peut voir un enregistrement que SES ne voit pas
 * encore, et l'inverse : croire l'un pour l'autre ferait partir des emails
 * depuis un domaine que SES refuse encore de signer.
 */

import { Resolver } from "node:dns/promises"
import type { MailingDnsRecord } from "./provider"

export type RecordState =
  /** Trouvé, et conforme. */
  | "ok"
  /** Rien à ce nom : pas encore publié, ou publié ailleurs. */
  | "missing"
  /** Quelque chose répond, mais pas la bonne valeur. */
  | "wrong"
  /** Le résolveur n'a pas pu répondre — panne réseau, pas une faute du client. */
  | "unknown"

export interface RecordCheck {
  record: MailingDnsRecord
  state: RecordState
  /** Ce qui a réellement été trouvé, pour que le client compare. */
  found?: string
}

/**
 * Résolveurs PUBLICS, choisis exprès.
 *
 * Le résolveur de la plateforme peut avoir en cache une réponse négative
 * datant d'avant la publication, et répondre « absent » pendant des heures
 * sur un enregistrement pourtant en place. On interroge donc Cloudflare puis
 * Google, qui voient l'internet public — celui que SES interroge aussi.
 */
function resolver(): Resolver {
  const r = new Resolver({ timeout: 4000, tries: 2 })
  r.setServers(["1.1.1.1", "8.8.8.8"])
  return r
}

/** Compare deux noms d'hôte sans se laisser piéger par la casse ou le point final. */
function sameHost(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\.+$/, "")
  return norm(a) === norm(b)
}

async function checkOne(r: Resolver, record: MailingDnsRecord): Promise<RecordCheck> {
  try {
    if (record.type === "CNAME") {
      const found = await r.resolveCname(record.name)
      const hit = found.find((f) => sameHost(f, record.value))
      return hit
        ? { record, state: "ok", found: hit }
        : { record, state: found.length ? "wrong" : "missing", found: found[0] }
    }

    if (record.type === "TXT") {
      // Un TXT long est renvoyé découpé en morceaux : il faut les recoller
      // avant de comparer, sinon un DMARC parfaitement valide passe pour faux.
      const chunks = await r.resolveTxt(record.name)
      const values = chunks.map((c) => c.join(""))
      // Comparaison tolérante : les espaces d'une politique DMARC ne changent
      // rien à son sens, et exiger l'égalité stricte ferait échouer des zones
      // correctes que l'hébergeur a reformatées.
      const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase()
      const hit = values.find((v) => squash(v) === squash(record.value))
      return hit
        ? { record, state: "ok", found: hit }
        : { record, state: values.length ? "wrong" : "missing", found: values[0] }
    }

    const mx = await r.resolveMx(record.name)
    const hit = mx.find((m) => sameHost(m.exchange, record.value))
    return hit
      ? { record, state: "ok", found: hit.exchange }
      : { record, state: mx.length ? "wrong" : "missing", found: mx[0]?.exchange }
  } catch (err) {
    // ENOTFOUND / ENODATA : le nom n'existe pas encore. C'est une ABSENCE,
    // pas une panne — et le dire correctement évite d'inquiéter un client
    // dont la zone est simplement en cours de propagation.
    const code = (err as { code?: string })?.code ?? ""
    if (code === "ENOTFOUND" || code === "ENODATA") return { record, state: "missing" }
    return { record, state: "unknown" }
  }
}

/** Contrôle tous les enregistrements attendus, en parallèle. */
export async function checkRecords(records: MailingDnsRecord[]): Promise<RecordCheck[]> {
  if (records.length === 0) return []
  const r = resolver()
  return Promise.all(records.map((rec) => checkOne(r, rec)))
}

/* ── Chez qui le domaine est-il hébergé ? ─────────────────────────────────
 *
 * Déduit des serveurs de noms, jamais du registrar déclaré : ce qui compte
 * est **où se modifie la zone**, et beaucoup de domaines sont achetés chez
 * l'un puis délégués à l'autre. Un client renvoyé vers la mauvaise interface
 * cherche un écran qui n'existe pas chez lui.
 */

const HOSTS: ReadonlyArray<{ match: RegExp; name: string; where: string }> = [
  { match: /\bovh\./i, name: "OVHcloud", where: "Espace client → Noms de domaine → votre domaine → onglet « Zone DNS »." },
  { match: /gandi\.net/i, name: "Gandi", where: "Admin → Domaines → votre domaine → « Enregistrements DNS »." },
  { match: /cloudflare\.com/i, name: "Cloudflare", where: "Tableau de bord → votre domaine → « DNS » → « Records ». ⚠️ Laissez le nuage GRIS (DNS only) sur ces entrées." },
  { match: /domaincontrol\.com|godaddy/i, name: "GoDaddy", where: "Mes produits → Domaines → « Gérer le DNS »." },
  { match: /ui-dns\.|ionos/i, name: "IONOS", where: "Menu Domaines & SSL → votre domaine → roue dentée → « DNS »." },
  { match: /awsdns/i, name: "Amazon Route 53", where: "Console Route 53 → Hosted zones → votre domaine." },
  { match: /azure-dns/i, name: "Azure DNS", where: "Portail Azure → Zone DNS → votre domaine." },
  { match: /registrar-servers\.com|namecheap/i, name: "Namecheap", where: "Domain List → « Manage » → « Advanced DNS »." },
  { match: /googledomains|google\.com/i, name: "Google Domains / Squarespace", where: "Paramètres du domaine → « DNS ». " },
  { match: /online\.net|scaleway/i, name: "Scaleway", where: "Console → Domains & DNS → votre domaine." },
  { match: /bookmyname|nameshield|infomaniak/i, name: "Infomaniak / autre hébergeur français", where: "Espace client → votre domaine → « Zone DNS »." },
]

export interface DnsHost {
  /** Nom lisible, ou null si on ne reconnaît pas. */
  name: string | null
  /** Où trouver la zone chez cet hébergeur. */
  where: string | null
  /** Les serveurs de noms trouvés, toujours renvoyés : utiles au support même
   *  quand on ne reconnaît pas l'hébergeur. */
  nameservers: string[]
}

export async function detectDnsHost(rootDomain: string): Promise<DnsHost> {
  try {
    const ns = await resolver().resolveNs(rootDomain)
    const joined = ns.join(" ")
    const hit = HOSTS.find((h) => h.match.test(joined))
    return { name: hit?.name ?? null, where: hit?.where ?? null, nameservers: ns }
  } catch {
    // Ne pas savoir n'est pas un échec : on affiche les instructions
    // génériques plutôt que de bloquer la mise en route.
    return { name: null, where: null, nameservers: [] }
  }
}
