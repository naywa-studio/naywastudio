/**
 * Héberger la zone DNS du sous-domaine d'envoi, chez Route 53.
 *
 * ── Ce que ça change pour le client ──────────────────────────────────────
 *
 * Aujourd'hui il publie quatre enregistrements — trois types différents, des
 * jetons DKIM à recopier au caractère près — et devra recommencer à chaque
 * rotation de clés.
 *
 * Avec une zone déléguée, il ajoute **quatre NS, une seule fois**, sur le
 * sous-domaine `careers` uniquement. Ensuite Naywa écrit, corrige et fait
 * tourner les clés lui-même, sans plus rien demander.
 *
 * Ce n'est pas « zéro configuration » — je préfère le dire que le vendre. Mais
 * c'est une opération unique, avec des valeurs courtes, et surtout la
 * DERNIÈRE : c'est là qu'est le vrai gain, pas dans le nombre de lignes.
 *
 * ── Pourquoi seulement le SOUS-DOMAINE ───────────────────────────────────
 *
 * Déléguer la zone racine transférerait à Naywa le site web du client, sa
 * messagerie interne, tout. Une erreur de notre part le couperait du monde.
 * On ne prend en charge que `careers.son-domaine.fr`, dont on est seul
 * utilisateur : au pire, c'est l'envoi de candidats qui tombe.
 *
 * ── Ce que ça coûte ──────────────────────────────────────────────────────
 *
 * 0,50 $ par zone et par mois, soit ~6 € par an et par client. Premier coût
 * VARIABLE du chantier : les zones doivent être supprimées à la résiliation,
 * sinon elles s'accumulent en silence (cf. `deleteZone`).
 */

import {
  Route53Client,
  CreateHostedZoneCommand,
  GetHostedZoneCommand,
  ListHostedZonesByNameCommand,
  ChangeResourceRecordSetsCommand,
  ListResourceRecordSetsCommand,
  DeleteHostedZoneCommand,
  type Change,
} from "@aws-sdk/client-route-53"
import type { MailingDnsRecord } from "./provider"

/** Route 53 est un service GLOBAL : sa région d'API est toujours `us-east-1`,
 *  quelle que soit la région où l'on envoie. Une zone n'a pas de localisation. */
const ROUTE53_REGION = "us-east-1"

function client(): Route53Client {
  // Mêmes identifiants que SES : un seul utilisateur IAM pour tout le mailing,
  // ce qui évite d'avoir à raisonner sur deux jeux de droits qui divergent.
  const accessKeyId = (process.env.AWS_SES_ACCESS_KEY_ID ?? "").trim()
  const secretAccessKey = (process.env.AWS_SES_SECRET_ACCESS_KEY ?? "").trim()
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS_SES_ACCESS_KEY_ID / AWS_SES_SECRET_ACCESS_KEY manquantes")
  }
  return new Route53Client({ region: ROUTE53_REGION, credentials: { accessKeyId, secretAccessKey } })
}

export interface HostedZone {
  /** Identifiant Route 53, ex. `/hostedzone/Z123…` réduit à `Z123…`. */
  id: string
  name: string
  /** Les serveurs de noms à publier chez le registrar du client. */
  nameservers: string[]
}

/** Route 53 renvoie l'identifiant préfixé ; on stocke la forme courte. */
function shortId(id: string | undefined): string {
  return (id ?? "").replace(/^\/hostedzone\//, "")
}

/** Un nom de zone est toujours absolu côté AWS. */
function fqdn(name: string): string {
  return name.endsWith(".") ? name : `${name}.`
}

/**
 * Crée la zone du sous-domaine, ou renvoie celle qui existe déjà.
 *
 * **Idempotent, et ça n'est pas un luxe** : recréer une zone lui donnerait de
 * nouveaux serveurs de noms, donc invaliderait les NS que le client a publiés.
 * Son domaine d'envoi tomberait, sans erreur visible, jusqu'à ce qu'il
 * republie. On cherche donc avant de créer.
 */
export async function ensureZone(sendingDomain: string): Promise<HostedZone> {
  const existing = await findZone(sendingDomain)
  if (existing) return existing

  const c = client()
  const out = await c.send(new CreateHostedZoneCommand({
    Name: fqdn(sendingDomain),
    // Route 53 exige une référence unique par appel : elle sert à SA propre
    // idempotence en cas de rejeu réseau. Le domaine seul ne suffirait pas si
    // une zone était supprimée puis recréée.
    CallerReference: `naywa-${sendingDomain}-${Date.now()}`,
    HostedZoneConfig: { Comment: "Naywa — domaine d'envoi candidat" },
  }))

  return {
    id: shortId(out.HostedZone?.Id),
    name: sendingDomain,
    nameservers: out.DelegationSet?.NameServers ?? [],
  }
}

/** Cherche une zone par nom. `null` si elle n'existe pas. */
export async function findZone(sendingDomain: string): Promise<HostedZone | null> {
  const c = client()
  const out = await c.send(new ListHostedZonesByNameCommand({
    DNSName: fqdn(sendingDomain), MaxItems: 1,
  }))
  const zone = out.HostedZones?.[0]
  // `ListByName` renvoie la zone suivante dans l'ordre alphabétique quand la
  // nôtre n'existe pas : comparer le nom est OBLIGATOIRE, sinon on croirait
  // avoir trouvé la zone d'un autre client.
  if (!zone?.Name || zone.Name !== fqdn(sendingDomain)) return null

  const id = shortId(zone.Id)
  const details = await c.send(new GetHostedZoneCommand({ Id: id }))
  return { id, name: sendingDomain, nameservers: details.DelegationSet?.NameServers ?? [] }
}

/**
 * Écrit les enregistrements du fournisseur dans la zone.
 *
 * `UPSERT` : réécrire une valeur identique ne casse rien, et une rotation de
 * clés se contente d'écraser. C'est ce qui permet de tout reprendre en main
 * sans jamais redemander quoi que ce soit au client.
 */
export async function writeRecords(zoneId: string, records: MailingDnsRecord[]): Promise<number> {
  if (records.length === 0) return 0

  const changes: Change[] = records.map((r) => ({
    Action: "UPSERT",
    ResourceRecordSet: {
      Name: fqdn(r.name),
      Type: r.type,
      TTL: 300,
      ResourceRecords: [{
        Value: r.type === "TXT"
          // Un TXT doit être livré ENTRE GUILLEMETS à Route 53. Sans eux
          // l'appel est rejeté, avec un message qui ne le dit pas.
          ? `"${r.value.replace(/"/g, '\\"')}"`
          : r.type === "MX"
            ? `${r.priority ?? 10} ${r.value}`
            : r.value,
      }],
    },
  }))

  await client().send(new ChangeResourceRecordSetsCommand({
    HostedZoneId: zoneId,
    ChangeBatch: { Comment: "Naywa — mise à jour du domaine d'envoi", Changes: changes },
  }))
  return changes.length
}

/**
 * Supprime la zone — et tout ce qu'elle contient.
 *
 * ⚠️ Route 53 REFUSE de supprimer une zone qui contient autre chose que ses
 * NS et SOA d'origine. Il faut donc vider avant, ce que personne ne fait
 * spontanément — et une zone qu'on croit supprimée continue de coûter
 * 0,50 $ par mois, indéfiniment, pour un client qui est parti.
 *
 * Best-effort et idempotent : appelée à la résiliation, elle ne doit jamais
 * faire échouer la résiliation elle-même.
 */
export async function deleteZone(sendingDomain: string): Promise<boolean> {
  const zone = await findZone(sendingDomain)
  if (!zone) return true

  const c = client()
  const listed = await c.send(new ListResourceRecordSetsCommand({ HostedZoneId: zone.id }))

  const removable = (listed.ResourceRecordSets ?? []).filter(
    // NS et SOA de la zone elle-même : Route 53 les gère, on n'y touche pas.
    (rs) => !((rs.Type === "NS" || rs.Type === "SOA") && rs.Name === fqdn(sendingDomain)),
  )

  if (removable.length > 0) {
    await c.send(new ChangeResourceRecordSetsCommand({
      HostedZoneId: zone.id,
      ChangeBatch: {
        Changes: removable.map((rs) => ({ Action: "DELETE", ResourceRecordSet: rs })),
      },
    }))
  }

  await c.send(new DeleteHostedZoneCommand({ Id: zone.id }))
  return true
}

/**
 * Traduit les refus Route 53 qui coûtent le plus de temps.
 *
 * Le premier est quasi certain au démarrage : la politique IAM créée pour SES
 * ne couvre pas Route 53, et le message d'AWS ne le dit pas clairement.
 */
export function explainRoute53Error(err: unknown): string {
  const name = (err as { name?: string })?.name ?? ""
  const message = (err as { message?: string })?.message ?? String(err)

  if (name === "AccessDenied" || /not authorized|AccessDenied/i.test(message)) {
    return (
      "Route 53 refuse l'appel : la politique IAM de l'utilisateur n'autorise pas " +
      "la gestion des zones hébergées. " + message
    )
  }
  if (name === "HostedZoneAlreadyExists" || /already exists/i.test(message)) {
    return (
      "Une zone porte déjà ce nom. Elle aurait dû être réutilisée : recréer " +
      "changerait les serveurs de noms et casserait un domaine en production. " + message
    )
  }
  if (name === "HostedZoneNotEmpty" || /not empty/i.test(message)) {
    return (
      "La zone contient encore des enregistrements : elle doit être vidée " +
      "avant suppression. " + message
    )
  }
  return `Route 53 ${name}: ${message}`
}
