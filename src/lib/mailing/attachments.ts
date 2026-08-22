/**
 * Stockage durable des pièces jointes d'un email entrant.
 *
 * Le fichier va sur **R2**, là où vivent déjà les CV du vivier. S3 n'est qu'un
 * lieu de transit : l'objet y est supprimé dès le message traité, et une pièce
 * jointe qui n'aurait pas été recopiée disparaîtrait avec lui.
 *
 * ── Le nom de fichier vient d'un inconnu ─────────────────────────────────
 *
 * C'est le point sensible de ce fichier. Le nom est écrit par l'expéditeur,
 * qui n'est ni authentifié ni de confiance. Un nom comme
 * `../../autre-cabinet/cv.pdf` écrirait chez un autre client — le cloisonnement
 * entre cabinets est ce que ce produit vend, et il tomberait sur un champ de
 * formulaire d'email.
 *
 * Trois protections en couches, parce qu'une seule finit toujours par céder :
 *  1. le nom est réduit à un jeu de caractères sûr ;
 *  2. le chemin est CONSTRUIT côté serveur, jamais concaténé depuis l'entrée ;
 *  3. `assertOrgScopedPath` refuse tout ce qui sort de l'organisation.
 *
 * ── Le quota est compté, jamais bloquant ─────────────────────────────────
 *
 * Refuser d'enregistrer la réponse d'un candidat parce que le cabinet a
 * atteint son plafond ferait perdre une donnée commerciale réelle — bien pire
 * qu'un léger dépassement, que le recalcul nocturne corrige de toute façon.
 * On incrémente donc APRÈS coup, sans jamais barrer la route.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../database.types"
import { r2Upload } from "../r2-storage"
import { incrementStorageUsed } from "../quota"
import type { InboundAttachment } from "./inbound"

/** Ce qu'on garde en base pour retrouver et afficher un fichier. */
export interface StoredAttachment {
  filename: string
  contentType: string
  size: number
  /** Chemin R2, toujours préfixé de l'identifiant d'organisation. */
  path: string
}

/**
 * Au-delà, on ne stocke pas.
 *
 * SES plafonne déjà les messages reçus à 40 Mo, donc ce filet ne devrait
 * jamais servir. Il est là parce que « ne devrait jamais » n'est pas « ne peut
 * pas », et qu'un plafond côté fournisseur peut changer sans qu'on le sache.
 */
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

/** Au-delà, on garde les premières : un email légitime n'en porte pas trente. */
const MAX_ATTACHMENTS = 10

/**
 * Réduit un nom de fichier à quelque chose de sûr, en gardant sa lisibilité.
 *
 * Exporté pour être testé seul : c'est la fonction dont dépend le
 * cloisonnement, elle doit rester vérifiable sans monter tout le reste.
 */
export function safeFilename(raw: string): string {
  // On ne garde que le dernier segment : un nom contenant des séparateurs est
  // soit une tentative de traversée, soit un chemin recopié par erreur. Dans
  // les deux cas, seul le nom final nous intéresse.
  const last = raw.split(/[/\\]/).pop() ?? ""

  const cleaned = last
    .normalize("NFKD")
    // Accents retirés : les noms d'objets voyagent mieux en ASCII, et le nom
    // affiché à l'utilisateur reste celui d'origine, stocké à part.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    // Les points en tête produisent des noms cachés ou « .. » ; on les retire
    // avant toute autre chose.
    .replace(/^\.+/, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 120)
    .trim()

  return cleaned || "piece-jointe"
}

/**
 * Enregistre les pièces jointes et renvoie ce qu'il faut mettre en base.
 *
 * Best-effort par fichier : l'échec de l'un ne fait pas perdre les autres, ni
 * le message lui-même. Un email dont la pièce jointe n'a pas pu être stockée
 * reste infiniment plus utile qu'un email perdu.
 */
export async function storeInboundAttachments(
  admin: SupabaseClient<Database>,
  opts: {
    organizationId: string
    /** Identifiant du message, pour regrouper les fichiers d'un même envoi. */
    messageKey: string
    candidateId: string | null
    attachments: InboundAttachment[]
  },
): Promise<StoredAttachment[]> {
  const stored: StoredAttachment[] = []
  let totalBytes = 0

  for (const [index, att] of opts.attachments.slice(0, MAX_ATTACHMENTS).entries()) {
    if (!att.content || att.content.length === 0) continue
    if (att.content.length > MAX_ATTACHMENT_BYTES) {
      console.warn("[mailing/attachments] pièce jointe ignorée, trop volumineuse", {
        filename: att.filename, sizeKo: Math.round(att.content.length / 1024),
      })
      continue
    }

    // Chemin CONSTRUIT ici, jamais assemblé depuis l'entrée. L'index préfixe
    // le nom pour que deux fichiers homonymes d'un même message ne s'écrasent
    // pas — un candidat qui envoie « cv.pdf » et « cv.pdf » existe.
    const safe = safeFilename(att.filename)
    const scope = opts.candidateId ?? "sans-candidat"
    const path = `${opts.organizationId}/inbound/${scope}/${opts.messageKey}/${index}-${safe}`

    try {
      await r2Upload({
        bucket: "cv",
        path,
        body: att.content,
        contentType: att.contentType || "application/octet-stream",
        // Troisième couche : refuse tout chemin qui sortirait de l'org.
        callerOrgId: opts.organizationId,
      })
      stored.push({
        // Le nom AFFICHÉ reste celui d'origine, accents compris : c'est le
        // chemin qui doit être sûr, pas ce que lit le sourceur.
        filename: att.filename,
        contentType: att.contentType,
        size: att.content.length,
        path,
      })
      totalBytes += att.content.length
    } catch (err) {
      console.error("[mailing/attachments] échec de stockage", {
        filename: att.filename, error: (err as Error).message,
      })
    }
  }

  if (totalBytes > 0) {
    // Après coup, et sans jamais bloquer : cf. l'en-tête de ce fichier.
    try {
      await incrementStorageUsed(admin, opts.organizationId, totalBytes)
    } catch (err) {
      console.error("[mailing/attachments] compteur de stockage non mis à jour:", err)
    }
  }

  return stored
}
