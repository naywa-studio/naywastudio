/**
 * Récupération et lecture d'un email entrant déposé par SES sur S3.
 *
 * ── Pourquoi le contenu passe par S3 ──────────────────────────────────────
 *
 * SES sait envoyer le message directement dans la notification, mais celle-ci
 * plafonne à 150 Ko. Or ce produit reçoit des réponses de candidats, et un
 * candidat **joint son CV** : on dépasserait ce plafond régulièrement, et le
 * message serait perdu — sans que le sourceur le sache. D'où le dépôt sur S3,
 * qui n'a pas de limite pratique.
 *
 * ── Ne pas confondre avec R2 ──────────────────────────────────────────────
 *
 * `lib/r2-storage.ts` utilise le MÊME SDK pour parler à Cloudflare R2, avec
 * d'autres identifiants et un autre point de terminaison. Les deux ne doivent
 * jamais partager de client : R2 stocke les CV du vivier, S3 ne sert qu'au
 * transit des emails entrants.
 */

import { S3Client, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { simpleParser } from "mailparser"

const DEFAULT_REGION = "eu-west-1"

let cached: S3Client | null = null

function s3(): S3Client {
  if (cached) return cached
  const accessKeyId = (process.env.AWS_SES_ACCESS_KEY_ID ?? "").trim()
  const secretAccessKey = (process.env.AWS_SES_SECRET_ACCESS_KEY ?? "").trim()
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS_SES_ACCESS_KEY_ID / AWS_SES_SECRET_ACCESS_KEY manquantes")
  }
  cached = new S3Client({
    region: (process.env.AWS_SES_REGION ?? "").trim() || DEFAULT_REGION,
    credentials: { accessKeyId, secretAccessKey },
  })
  return cached
}

export function inboundBucket(): string {
  return (process.env.AWS_SES_INBOUND_BUCKET ?? "").trim() || "naywa-inbound-email-eu"
}

/** Pièce jointe, ramenée à ce dont le produit a besoin. */
export interface InboundAttachment {
  filename: string
  contentType: string
  size: number
  content: Buffer
}

/** Un email entrant, une fois lu. */
export interface InboundEmail {
  /** Adresse de l'expéditeur, en minuscules, sans le nom affiché. */
  fromAddress: string | null
  /** Nom affiché de l'expéditeur, s'il y en a un. */
  fromName: string | null
  /** Destinataires — c'est par là qu'on retrouve à qui le message s'adresse. */
  to: string[]
  subject: string
  /** Corps en texte brut. Reconstruit depuis le HTML si le message n'en a pas. */
  text: string
  html: string | null
  /** `Message-ID` du message d'origine, et chaîne de références : c'est ce qui
   *  permet de rattacher une réponse à la conversation qui l'a provoquée
   *  plutôt que de se fier au sujet, qui change au gré des clients de mail. */
  messageId: string | null
  inReplyTo: string | null
  references: string[]
  attachments: InboundAttachment[]
  date: Date | null
}

/** Lit l'objet S3 déposé par SES. */
export async function fetchRawEmail(objectKey: string): Promise<Buffer> {
  const out = await s3().send(new GetObjectCommand({
    Bucket: inboundBucket(),
    Key: objectKey,
  }))
  if (!out.Body) throw new Error(`S3 : objet vide (${objectKey})`)
  // `transformToByteArray` évite d'assembler le flux à la main, et fonctionne
  // aussi bien sur Node que sur les runtimes edge.
  const bytes = await out.Body.transformToByteArray()
  return Buffer.from(bytes)
}

/**
 * Analyse un email brut (format RFC 822) en structure exploitable.
 *
 * On ne fait pas ce travail à la main : le format multipart, les encodages
 * (quoted-printable, base64), les jeux de caractères et les pièces jointes
 * imbriquées sont un nid à défauts silencieux. Un accent mal décodé dans une
 * réponse de candidat, personne ne le remarque avant que ce soit chez le
 * client.
 */
export async function parseInboundEmail(raw: Buffer): Promise<InboundEmail> {
  const parsed = await simpleParser(raw)

  const fromEntry = parsed.from?.value?.[0]
  const toList = Array.isArray(parsed.to) ? parsed.to : parsed.to ? [parsed.to] : []
  const to = toList
    .flatMap((t) => t.value ?? [])
    .map((v) => (v.address ?? "").toLowerCase().trim())
    .filter(Boolean)

  const refs = parsed.references
  const references = Array.isArray(refs) ? refs : refs ? [refs] : []

  return {
    fromAddress: (fromEntry?.address ?? "").toLowerCase().trim() || null,
    fromName: (fromEntry?.name ?? "").trim() || null,
    to,
    subject: (parsed.subject ?? "").trim(),
    // Repli sur le HTML dépouillé : certains clients n'envoient QUE du HTML,
    // et un corps vide donnerait une conversation qui semble sans réponse.
    text: (parsed.text ?? "").trim() || stripHtml(parsed.html || ""),
    html: typeof parsed.html === "string" ? parsed.html : null,
    messageId: parsed.messageId ?? null,
    inReplyTo: parsed.inReplyTo ?? null,
    references,
    attachments: (parsed.attachments ?? []).map((a) => ({
      filename: a.filename ?? "sans-nom",
      contentType: a.contentType ?? "application/octet-stream",
      size: a.size ?? a.content?.length ?? 0,
      content: a.content as Buffer,
    })),
    date: parsed.date ?? null,
  }
}

/**
 * Supprime l'objet S3 une fois le message traité.
 *
 * Le contenu est alors en base : le garder sur S3 reviendrait à conserver
 * indéfiniment les échanges candidats dans un SECOND endroit. C'est de la
 * minimisation au sens du RGPD autant que du ménage — et sur un produit qui
 * manipule des CV, le premier argument pèse plus que le second.
 *
 * Best-effort : un échec de suppression ne doit pas faire échouer la
 * réception, sinon SNS retenterait et le message serait traité deux fois.
 */
export async function deleteRawEmail(objectKey: string): Promise<void> {
  try {
    await s3().send(new DeleteObjectCommand({ Bucket: inboundBucket(), Key: objectKey }))
  } catch (err) {
    console.error("[mailing/inbound] suppression S3 impossible:", objectKey, err)
  }
}

/** Réduit du HTML à du texte lisible. Repli, pas un rendu fidèle. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
