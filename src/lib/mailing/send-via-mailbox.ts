/**
 * Envoyer par la boîte connectée d'un sourceur, jeton compris.
 *
 * Ce fichier fait le lien entre la ligne en base (jeton chiffré) et l'API du
 * fournisseur — Gmail ou Microsoft Graph : déchiffrer, rafraîchir, envoyer, et
 * surtout **marquer la boîte quand elle cesse de fonctionner**.
 *
 * ⚠️ **Microsoft fait tourner son jeton durable** : chaque rafraîchissement en
 * renvoie un nouveau et périme l'ancien. Le ré-enregistrer n'est pas une
 * optimisation, c'est la condition pour que la boîte fonctionne encore la
 * semaine prochaine. Cf. `oauth-microsoft.ts`.
 *
 * ── Le défaut le plus probable de tout le connecteur ─────────────────────
 *
 * Un jeton meurt sans prévenir : mot de passe Google changé, autorisation
 * révoquée, politique du tenant. Rien ne nous en avertit — on l'apprend en
 * essayant d'envoyer.
 *
 * Si ça ne se voit pas, le sourceur clique « Envoyer », voit une erreur
 * générique, recommence, et conclut que le produit est cassé. D'où
 * `needs_reconnect` posé en base **dès le premier refus**, avec la cause : ce
 * n'est pas une trace de débogage, c'est ce qui permet à l'écran de dire
 * « reconnectez votre boîte » au lieu de « une erreur est survenue ».
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../database.types"
import { decryptToken } from "./token-crypto"
import { refreshGoogleAccessToken } from "./oauth-google"
import { refreshMicrosoftAccessToken } from "./oauth-microsoft"
import { sendViaGmail, type GmailMessage } from "./gmail-send"
import { sendViaGraph } from "./graph-send"
import { encryptToken } from "./token-crypto"

export interface MailboxRow {
  id: string
  provider: "google" | "microsoft"
  email: string
  refresh_token_encrypted: string
  status: "active" | "needs_reconnect"
}

/**
 * La boîte utilisable de ce sourceur, ou `null`.
 *
 * Une boîte en `needs_reconnect` n'est PAS renvoyée : elle existe, elle
 * s'affiche dans l'interface avec son bandeau, mais elle ne doit plus servir
 * à envoyer. La renvoyer ferait échouer chaque tentative au lieu de basculer
 * proprement sur le transport suivant.
 */
export async function activeMailboxFor(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<MailboxRow | null> {
  const { data } = await admin
    .from("connected_mailboxes")
    .select("id, provider, email, refresh_token_encrypted, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as MailboxRow | null) ?? null
}

/** Marque une boîte comme à reconnecter, avec la cause, pour l'afficher. */
async function markNeedsReconnect(
  admin: SupabaseClient<Database>,
  id: string,
  detail: string,
): Promise<void> {
  await admin
    .from("connected_mailboxes")
    .update({ status: "needs_reconnect", last_error: detail.slice(0, 500) })
    .eq("id", id)
}

export type MailboxSendResult =
  | { ok: true; id: string }
  /** À afficher au sourceur : reconnecter, pas réessayer. */
  | { ok: false; reason: "needs_reconnect"; message: string }
  | { ok: false; reason: "failed"; message: string }

/**
 * Envoie par la boîte connectée.
 *
 * Trois façons d'échouer, et une seule se répare en réessayant :
 *
 *   jeton illisible   clé de chiffrement tournée, ligne abîmée → reconnecter
 *   jeton refusé      révocation, mot de passe changé → reconnecter
 *   panne Gmail       transitoire → réessayer
 *
 * Les deux premières marquent la boîte. La troisième n'y touche pas : couper
 * une boîte saine parce que Gmail a hoqueté obligerait le sourceur à
 * reconnecter pour rien.
 */
export async function sendFromMailbox(
  admin: SupabaseClient<Database>,
  mailbox: MailboxRow,
  message: Omit<GmailMessage, "fromEmail">,
): Promise<MailboxSendResult> {
  const refresh = decryptToken(mailbox.refresh_token_encrypted)
  if (!refresh) {
    await markNeedsReconnect(admin, mailbox.id, "Jeton illisible (clé changée ou donnée abîmée).")
    return {
      ok: false, reason: "needs_reconnect",
      message: "La connexion à votre boîte mail n'est plus valable. Reconnectez-la.",
    }
  }

  const provider = mailbox.provider === "microsoft" ? "Microsoft" : "Google"
  let accessToken: string | null

  if (mailbox.provider === "microsoft") {
    const refreshed = await refreshMicrosoftAccessToken(refresh)
    accessToken = refreshed?.accessToken ?? null

    /* Le nouveau jeton durable, ré-enregistré AVANT l'envoi.
     *
     * Avant, parce que l'ancien est déjà mort à cet instant : si l'envoi
     * échouait et qu'on sortait sans écrire, la boîte serait définitivement
     * inutilisable alors que le rafraîchissement, lui, avait réussi.
     *
     * Best-effort : rater cette écriture coûte une reconnexion, la refuser
     * coûterait un message non parti. */
    if (refreshed && refreshed.refreshToken !== refresh) {
      const encrypted = encryptToken(refreshed.refreshToken)
      if (encrypted) {
        await admin
          .from("connected_mailboxes")
          .update({ refresh_token_encrypted: encrypted })
          .eq("id", mailbox.id)
          .then(undefined, () => {})
      }
    }
  } else {
    accessToken = await refreshGoogleAccessToken(refresh)
  }

  if (!accessToken) {
    await markNeedsReconnect(admin, mailbox.id, `${provider} a refusé le jeton (révocation ou mot de passe changé).`)
    return {
      ok: false, reason: "needs_reconnect",
      message: `${provider} a révoqué l'accès à votre boîte mail. Reconnectez-la pour continuer à écrire.`,
    }
  }

  const sent = mailbox.provider === "microsoft"
    ? await sendViaGraph(accessToken, { ...message, fromEmail: mailbox.email })
    : await sendViaGmail(accessToken, { ...message, fromEmail: mailbox.email })

  if (sent.ok) {
    // Best-effort : sert à montrer « dernière utilisation » dans l'écran, pas
    // à décider quoi que ce soit. Un échec ici ne doit pas défaire un envoi
    // qui a réussi.
    await admin
      .from("connected_mailboxes")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", mailbox.id)
      .then(undefined, () => {})
    return { ok: true, id: sent.id }
  }

  if (sent.reason === "needs_reconnect") {
    await markNeedsReconnect(admin, mailbox.id, sent.detail)
    return {
      ok: false, reason: "needs_reconnect",
      message: "L'accès à votre boîte mail a été retiré. Reconnectez-la pour continuer à écrire.",
    }
  }

  return { ok: false, reason: "failed", message: "L'envoi a échoué. Réessayez." }
}
