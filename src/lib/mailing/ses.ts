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
  GetAccountCommand,
  CreateConfigurationSetCommand,
  CreateConfigurationSetEventDestinationCommand,
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
      /* ⚠️ TOUJOURS renvoyer les enregistrements, même quand le domaine est
       * actif.
       *
       * Ils étaient vidés dans ce cas — « une fois actif, plus rien à
       * publier ». Bonne intention pour l'affichage, mauvaise couche : le
       * chemin qui écrit la zone Route 53 en a besoin quel que soit l'état.
       *
       * Le bug trouvé en testant : déléguer la zone d'un domaine DÉJÀ vérifié
       * créait une zone VIDE. Le client publiait ses NS, la zone devenait
       * autoritaire sans aucune clé DKIM, et son domaine d'envoi tombait —
       * après avoir fonctionné. Le fournisseur dit la vérité ; c'est à
       * l'interface de décider ce qu'elle montre. */
      records: [...dkimRecords(domain, out.DkimAttributes?.Tokens), dmarcRecord(domain)],
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
    const build = (configurationSet?: string) => new SendEmailCommand({
      FromEmailAddress: input.from,
      Destination: {
        ToAddresses: [input.to],
        ...(input.bcc ? { BccAddresses: [input.bcc] } : {}),
      },
      ReplyToAddresses: [input.replyTo],
      ...(configurationSet ? { ConfigurationSetName: configurationSet } : {}),
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
    })

    try {
      const out = await client().send(build(input.reputationGroup))
      if (!out.MessageId) throw new Error("SES : envoi sans MessageId")
      return { id: out.MessageId }
    } catch (err) {
      /* ── Le jeu de configuration manque : on envoie quand même ──────────
       *
       * Il sert à MESURER un client (rebonds, plaintes) pour pouvoir couper
       * le fautif seul. C'est précieux, mais c'est de la télémétrie — et un
       * message à un candidat vaut plus qu'une métrique. Le perdre parce que
       * notre propre instrumentation manque serait absurde.
       *
       * L'erreur est journalisée fort : Sentry doit la voir, sinon on
       * enverrait durablement sans mesurer, ce qui est le vrai danger avec
       * une réputation partagée entre tous les clients du compte. */
      if (input.reputationGroup && isMissingConfigurationSet(err)) {
        console.error(
          "[ses] jeu de configuration absent, envoi SANS mesure de réputation:",
          input.reputationGroup,
        )
        const out = await client().send(build()).catch((e) => { throw new Error(explainSesError(e)) })
        if (!out.MessageId) throw new Error("SES : envoi sans MessageId")
        return { id: out.MessageId }
      }
      throw new Error(explainSesError(err))
    }
  },
}

/** SES refuse-t-il parce que le jeu de configuration n'existe pas ? */
function isMissingConfigurationSet(err: unknown): boolean {
  const message = (err as { message?: string })?.message ?? String(err)
  return /configuration set/i.test(message) && /does not exist|not found/i.test(message)
}

/**
 * Crée le jeu de configuration d'une organisation, s'il n'existe pas.
 *
 * ── Pourquoi il en faut un par client ─────────────────────────────────────
 *
 * Chez SES, la réputation est celle du COMPTE : un cabinet qui envoie
 * n'importe quoi dégrade la délivrabilité de tous les autres, et au pire fait
 * suspendre l'ensemble. Rattacher chaque client à son propre jeu permet de
 * mesurer séparément, et de couper le fautif AVANT qu'AWS ne s'en aperçoive.
 *
 * ⚠️ J'avais écrit la moitié du dispositif : le nom était passé à chaque
 * envoi, rien ne le créait jamais. SES rejetait donc tout envoi — trouvé au
 * premier essai réel, pas en relisant.
 *
 * Best-effort : si la politique IAM n'autorise pas la création, on ne bloque
 * ni la déclaration du domaine ni les envois. On perd la mesure, pas le
 * service — et l'envoi retombe sans jeu de configuration (cf. ci-dessus).
 */
export async function ensureReputationGroup(name: string): Promise<boolean> {
  try {
    await client().send(new CreateConfigurationSetCommand({ ConfigurationSetName: name }))
    return true
  } catch (err) {
    const errName = (err as { name?: string })?.name ?? ""
    // Déjà là : c'est le résultat voulu, pas un échec.
    if (errName === "AlreadyExistsException") return true
    console.error("[ses] jeu de configuration non créé:", name, explainSesError(err))
    return false
  }
}

/** Nom de la destination d'événements, un seul par jeu de configuration. */
const EVENT_DESTINATION = "naywa-delivery"

/**
 * Branche les rebonds, plaintes et remises sur notre rubrique SNS.
 *
 * ── Ce que son absence provoquait ─────────────────────────────────────────
 *
 * Rien de visible, et c'est le problème. Le jeu de configuration existait mais
 * ne publiait aucun événement : un message rebondi restait `sent` pour
 * toujours. Le sourceur relançait un candidat qui n'avait jamais rien reçu.
 *
 * C'est aussi, d'après AWS, la première cause de refus d'accès production —
 * un compte qui ne collecte pas ses rebonds ne peut pas prouver qu'il les
 * traite.
 *
 * ── Pourquoi « best-effort » ──────────────────────────────────────────────
 *
 * Comme `ensureReputationGroup` : si la rubrique n'est pas configurée ou que
 * la politique IAM refuse, on perd la remontée d'état — pas le service. Un
 * cabinet ne doit pas se retrouver incapable d'envoyer parce qu'une mesure
 * accessoire n'a pas pu être posée.
 *
 * Idempotent : une destination déjà là est le résultat voulu.
 */
export async function ensureEventDestination(configurationSetName: string): Promise<boolean> {
  const topicArn = (process.env.AWS_SNS_EVENTS_TOPIC_ARN ?? "").trim()
  if (!topicArn) {
    console.warn("[ses] AWS_SNS_EVENTS_TOPIC_ARN absente — rebonds non collectés")
    return false
  }
  try {
    await client().send(new CreateConfigurationSetEventDestinationCommand({
      ConfigurationSetName: configurationSetName,
      EventDestinationName: EVENT_DESTINATION,
      EventDestination: {
        Enabled: true,
        // Volontairement PAS d'ouvertures ni de clics : ils exigent un pixel
        // espion et la réécriture des liens, ce qui trahirait le message d'un
        // cabinet à son candidat. On ne suit que l'acheminement.
        MatchingEventTypes: ["BOUNCE", "COMPLAINT", "DELIVERY", "REJECT"],
        SnsDestination: { TopicArn: topicArn },
      },
    }))
    return true
  } catch (err) {
    const errName = (err as { name?: string })?.name ?? ""
    if (errName === "AlreadyExistsException") return true
    console.error("[ses] destination d'événements non créée:", configurationSetName, explainSesError(err))
    return false
  }
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

/**
 * L'état du COMPTE SES — bac à sable ou accès production, et les plafonds.
 *
 * ── Pourquoi ça mérite sa fonction ────────────────────────────────────────
 *
 * C'est la question la plus fréquente du chantier, et celle à laquelle rien ne
 * répond franchement. En bac à sable, un envoi vers une adresse non vérifiée
 * est rejeté avec un message qui parle du DESTINATAIRE (« adresse non
 * vérifiée »), jamais du compte. On cherche donc du mauvais côté.
 *
 * `GetAccount` tranche directement, sans envoyer le moindre email — donc sans
 * rien coûter à la réputation, qui est précisément ce qu'on protège.
 */
export async function sesAccountSummary(): Promise<Record<string, unknown>> {
  const out = await client().send(new GetAccountCommand({}))
  const quota = out.SendQuota
  return {
    accesProduction: out.ProductionAccessEnabled === true,
    verdict: out.ProductionAccessEnabled === true
      ? "Accès production ACCORDÉ — vous pouvez écrire à n'importe quelle adresse."
      : "BAC À SABLE — seules les adresses vérifiées peuvent recevoir.",
    // `Max24HourSend` vaut 200 en bac à sable ; une valeur bien supérieure est
    // un second signe, utile si le drapeau tarde à basculer.
    envoisMax24h: quota?.Max24HourSend ?? null,
    envoisParSeconde: quota?.MaxSendRate ?? null,
    envoyesDernieres24h: quota?.SentLast24Hours ?? null,
    // Si SES suspend le compte, c'est ici que ça se voit en premier.
    envoiActive: out.SendingEnabled === true,
    region: (process.env.AWS_SES_REGION ?? "").trim() || DEFAULT_REGION,
  }
}
