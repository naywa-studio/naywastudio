/**
 * Amazon SES — implémentation du fournisseur d'envoi.
 *
 * Retenu après comparatif (cf. `docs/chantier-mailing-domaine-client.md`) pour
 * une raison décisive : **aucune facturation au domaine**. Les fournisseurs
 * facturant par palier de domaines rendaient l'add-on déficitaire dès le
 * premier ou le deuxième client. SES coûte des centimes, à n'importe quelle
 * échelle.
 *
 * Deux points de vigilance, traités ici :
 *
 *  1. Un compte neuf est en BAC À SABLE : il ne peut écrire qu'à des adresses
 *     vérifiées. L'erreur renvoyée par SES dans ce cas est cryptique ; on la
 *     traduit pour ne pas chercher pendant une heure.
 *
 *  2. La réputation est PARTAGÉE entre tous les clients du compte. D'où le jeu
 *     de configuration par client (`reputationGroup`) : il permet de mesurer
 *     chacun séparément et de couper le fautif seul.
 *
 * Région : `eu-west-1` par défaut — résidence européenne, cohérente avec R2-EU
 * et le DPA, et l'une des rares régions qui gère AUSSI la réception.
 */

import {
  SESv2Client,
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
  SendEmailCommand,
  type DkimStatus,
} from "@aws-sdk/client-sesv2"
import {
  type MailingProvider,
  type MailingDnsRecord,
  type MailingStatus,
  type ProviderSendInput,
  type SendingDomain,
} from "./provider"

const DEFAULT_REGION = "eu-west-1"

function client(): SESv2Client {
  const accessKeyId = (process.env.AWS_SES_ACCESS_KEY_ID ?? "").trim()
  const secretAccessKey = (process.env.AWS_SES_SECRET_ACCESS_KEY ?? "").trim()
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS_SES_ACCESS_KEY_ID / AWS_SES_SECRET_ACCESS_KEY manquantes")
  }
  return new SESv2Client({
    region: (process.env.AWS_SES_REGION ?? "").trim() || DEFAULT_REGION,
    credentials: { accessKeyId, secretAccessKey },
  })
}

/**
 * Les trois CNAME DKIM, dérivés des jetons rendus par SES.
 *
 * SES ne renvoie pas les enregistrements tout faits : il donne des jetons, et
 * la convention de nommage est implicite. On la matérialise ici — vérifiée
 * contre ce qu'affiche la console.
 */
function dkimRecords(domain: string, tokens: string[] | undefined): MailingDnsRecord[] {
  return (tokens ?? []).map((token) => ({
    type: "CNAME" as const,
    name: `${token}._domainkey.${domain}`,
    value: `${token}.dkim.amazonses.com`,
  }))
}

/**
 * DMARC en `p=none` : on observe sans rien rejeter.
 *
 * Une politique stricte posée d'emblée sur le domaine d'un client ferait
 * rejeter ses propres emails légitimes s'il envoie déjà depuis ailleurs. Le
 * durcissement est sa décision, pas la nôtre.
 */
function dmarcRecord(domain: string): MailingDnsRecord {
  return { type: "TXT", name: `_dmarc.${domain}`, value: "v=DMARC1; p=none;" }
}

/**
 * État SES → état produit.
 *
 * `verifiedForSending` fait foi : c'est lui qui conditionne réellement l'envoi.
 * DKIM en succès sans cette confirmation reste un état transitoire, et
 * l'annoncer « actif » ferait échouer le premier envoi réel.
 */
function toStatus(dkim: DkimStatus | string | undefined, verifiedForSending: boolean): MailingStatus {
  if (verifiedForSending && dkim === "SUCCESS") return "active"
  switch (dkim) {
    case "SUCCESS":       return "verifying"
    case "PENDING":       return "verifying"
    case "NOT_STARTED":   return "awaiting_dns"
    case "FAILED":        return "failed"
    // TEMPORARY_FAILURE : SES réessaie tout seul. Ce n'est pas un échec du
    // client, et le marquer « failed » lui ferait refaire sa configuration
    // pour rien.
    default:              return "verifying"
  }
}

/** Une erreur SES « identité inconnue », qui n'est pas une panne. */
function isNotFound(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? ""
  return name === "NotFoundException"
}

async function readDomain(domain: string): Promise<SendingDomain | null> {
  try {
    const out = await client().send(new GetEmailIdentityCommand({ EmailIdentity: domain }))
    const status = toStatus(out.DkimAttributes?.Status, out.VerifiedForSendingStatus === true)
    return {
      id: domain, // SES adresse les identités par leur nom : pas d'autre id.
      name: domain,
      status,
      // Une fois actif, plus rien à publier — l'UI ne doit pas continuer à
      // réclamer des enregistrements déjà posés.
      records: status === "active"
        ? []
        : [...dkimRecords(domain, out.DkimAttributes?.Tokens), dmarcRecord(domain)],
    }
  } catch (err) {
    if (isNotFound(err)) return null
    throw err
  }
}

export const sesProvider: MailingProvider = {
  name: "ses",

  async createSendingDomain(domain: string): Promise<SendingDomain> {
    // Idempotence d'abord : recréer une identité existante ferait tourner ses
    // clés DKIM, donc casserait un domaine en production le temps que le
    // client republie. On ne crée que ce qui n'existe pas.
    const existing = await readDomain(domain)
    if (existing) return existing

    await client().send(new CreateEmailIdentityCommand({
      EmailIdentity: domain,
      DkimSigningAttributes: { NextSigningKeyLength: "RSA_2048_BIT" },
    }))

    const created = await readDomain(domain)
    if (!created) throw new Error(`SES : identité ${domain} introuvable après création`)
    return created
  },

  getSendingDomain: readDomain,

  async verifySendingDomain(domain: string): Promise<SendingDomain> {
    // SES revérifie en continu de lui-même : il n'existe pas d'appel « vérifie
    // maintenant ». Relire l'état EST la vérification — le bouton de l'UI sert
    // à ne pas attendre le passage du cron.
    const found = await readDomain(domain)
    if (!found) throw new Error(`SES : identité ${domain} inconnue`)
    return found
  },

  async sendFromDomain(input: ProviderSendInput): Promise<{ id: string }> {
    try {
      const out = await client().send(new SendEmailCommand({
        FromEmailAddress: input.from,
        Destination: {
          ToAddresses: [input.to],
          ...(input.bcc ? { BccAddresses: [input.bcc] } : {}),
        },
        ReplyToAddresses: [input.replyTo],
        ConfigurationSetName: input.reputationGroup,
        Content: {
          Simple: {
            // Un saut de ligne dans un sujet permet d'injecter des en-têtes.
            // Filtré ici plutôt que chez chaque appelant : la garde protège
            // tous les points d'envoi, présents et futurs.
            Subject: { Data: input.subject.replace(/[\r\n]+/g, " "), Charset: "UTF-8" },
            Body: {
              Text: { Data: input.text, Charset: "UTF-8" },
              ...(input.html ? { Html: { Data: input.html, Charset: "UTF-8" } } : {}),
            },
          },
        },
      }))
      if (!out.MessageId) throw new Error("SES : envoi sans MessageId")
      return { id: out.MessageId }
    } catch (err) {
      throw new Error(explainSesError(err))
    }
  },
}

/**
 * Traduit les erreurs SES qui coûtent le plus de temps à diagnostiquer.
 *
 * Les deux premières sont quasi certaines en début de projet, et leur message
 * d'origine n'oriente vers rien.
 */
export function explainSesError(err: unknown): string {
  const name = (err as { name?: string })?.name ?? ""
  const message = (err as { message?: string })?.message ?? String(err)

  if (name === "MessageRejected" && /not verified/i.test(message)) {
    return (
      "SES refuse l'envoi : le compte est encore en BAC À SABLE, il ne peut " +
      "écrire qu'à des adresses vérifiées. Demandez l'accès production, ou " +
      "vérifiez l'adresse du destinataire pour vos tests. " + message
    )
  }
  if (name === "AccessDeniedException" || /not authorized/i.test(message)) {
    return (
      "SES refuse l'appel : la politique IAM de l'utilisateur n'autorise pas " +
      "cette action, ou les clés appartiennent à un autre compte. " + message
    )
  }
  if (name === "NotFoundException") {
    return (
      "SES ne connaît pas cette identité DANS CETTE RÉGION. Les identités sont " +
      "vérifiées par région : une identité créée ailleurs n'existe pas ici. " + message
    )
  }
  return `SES ${name}: ${message}`
}
