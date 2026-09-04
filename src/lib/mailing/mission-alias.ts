/**
 * L'adresse de réponse dédiée à une mission.
 *
 *   elyas.commercial-immobilier@reply.naywastudio.com
 *
 * ── Pourquoi celle-ci et pas les trois autres pistes ──────────────────────
 *
 * Il faut savoir de QUELLE conversation relève une réponse, sans afficher au
 * candidat quelque chose qui ressemble à un mouchard. Ont été essayés :
 *
 *  - **un jeton dans l'adresse** (`elyas+97w26uu2@…`) : certain, mais visible
 *    dans son champ « répondre à », sur un message dont tout l'enjeu est
 *    d'inspirer confiance ;
 *  - **`In-Reply-To`** : invisible et certain, mais il faudrait connaître
 *    l'identifiant RFC de notre propre envoi — Gmail et Graph ne le rendent
 *    pas et écrasent celui qu'on poserait. La première réponse d'un candidat,
 *    la plus importante, resterait non rattachée ;
 *  - **l'objet** : lisible, efficace dès la première réponse, mais faillible —
 *    deux missions au même intitulé ne se départagent pas.
 *
 * D'où le renversement : au lieu de cacher l'identifiant, on le rend lisible.
 * L'adresse EST l'identifiant. Correspondance exacte, aucune déduction — et
 * elle ne ressemble pas à un traceur parce que c'en est réellement une, de
 * recrutement.
 *
 * ── Ce que l'adresse ne dit PAS ───────────────────────────────────────────
 *
 * Le candidat. Lui reste identifié par son adresse d'expédition : s'il répond
 * depuis une autre boîte que celle qu'on connaît, on ne le reconnaît pas.
 * C'est vrai depuis toujours, et aucun schéma d'adressage ne le corrige sans
 * réintroduire un jeton par candidat. Ce qui devient infaillible, c'est
 * l'attribution de MISSION — le défaut qu'on corrigeait.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../database.types"
import { slugifyLocalPart } from "./inbox-address"

/** Au-delà, l'adresse devient pénible à lire et frôle la limite RFC de 64. */
const MAX_JOB_SLUG = 34

/**
 * La partie locale, à partir de celle du sourceur et de l'intitulé de mission.
 *
 * Séparées par un POINT, comme une adresse professionnelle ordinaire — c'est
 * tout l'objet de l'exercice. Le rattachement ne relit jamais cette
 * composition : il compare l'adresse entière à la table. On peut donc la faire
 * lisible sans se soucier de savoir la redécouper.
 */
export function missionAliasLocal(sourceurLocal: string, jobTitle: string | null | undefined): string {
  const base = slugifyLocalPart(sourceurLocal) || "sourceur"

  /* Normalisation faite ICI plutôt que par `slugifyLocalPart`, pour deux
   * raisons. Elle produit des TIRETS à l'intérieur du libellé, pour que le
   * point reste le séparateur visuel entre la personne et la mission. Et
   * surtout elle n'a pas de valeur de repli : `slugifyLocalPart("")` renvoie
   * « sourceur », ce qui fabriquait `elyas.sourceur` pour une mission sans
   * intitulé — une adresse qui a l'air d'être celle de quelqu'un d'autre. */
  const slug = (jobTitle ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_JOB_SLUG)
    .replace(/-$/, "")

  return slug ? `${base}.${slug}` : base
}

/** Le domaine d'une adresse, en minuscules. */
function domainOf(address: string): string {
  const at = address.lastIndexOf("@")
  return at > 0 ? address.slice(at + 1).toLowerCase() : ""
}

/** La partie locale d'une adresse. */
function localPartOf(address: string): string {
  const at = address.lastIndexOf("@")
  return at > 0 ? address.slice(0, at) : address
}

/**
 * L'adresse de réponse de ce sourceur pour cette mission, créée au besoin.
 *
 * Renvoie `null` quand rien n'a pu être posé — l'appelant retombe alors sur
 * l'adresse générique du sourceur. **Un échec ici ne doit jamais empêcher un
 * envoi** : perdre la précision du rattachement est réparable, un message qui
 * ne part pas ne l'est pas.
 */
export async function ensureMissionAlias(
  admin: SupabaseClient<Database>,
  opts: {
    userId: string
    organizationId: string
    jobId: string
    jobTitle: string | null | undefined
    /** L'adresse générique du sourceur : donne la partie locale et le domaine. */
    inboxAddress: string
  },
): Promise<string | null> {
  const domain = domainOf(opts.inboxAddress)
  if (!domain) return null

  const { data: existing } = await admin
    .from("mailing_inbox_aliases")
    .select("address")
    .eq("user_id", opts.userId)
    .eq("job_id", opts.jobId)
    .maybeSingle()

  /* Une adresse déjà posée ne change JAMAIS, même si la mission est renommée.
   * Elle est dans la boîte des candidats déjà contactés : la refaire suivre le
   * titre perdrait leurs réponses, en silence. */
  if (existing?.address) return existing.address

  const base = missionAliasLocal(localPartOf(opts.inboxAddress), opts.jobTitle)

  /* Collisions : deux missions au même intitulé chez le même sourceur, ou une
   * adresse déjà prise par un collègue. On tente, et c'est l'index unique qui
   * tranche — pas une lecture préalable, qui laisserait une fenêtre entre le
   * contrôle et l'écriture. Deux envois simultanés sur deux missions au même
   * nom sont rares, mais ils produiraient exactement ça. */
  for (let n = 1; n < 50; n++) {
    const local = n === 1 ? base : `${base}-${n}`
    const address = `${local}@${domain}`

    const { data, error } = await admin
      .from("mailing_inbox_aliases")
      .insert({
        organization_id: opts.organizationId,
        user_id: opts.userId,
        job_id: opts.jobId,
        address,
      })
      .select("address")
      .single()

    if (!error && data) return data.address

    /* 23505 = violation d'unicité. Sur `address`, on essaie le suffixe
     * suivant ; sur (user_id, job_id), c'est qu'un envoi concurrent vient de
     * poser l'adresse — on relit la sienne plutôt que d'en inventer une
     * seconde. Toute autre erreur est définitive : inutile de boucler. */
    if (error?.code !== "23505") {
      console.error("[mission-alias] création impossible:", error?.message)
      return null
    }

    const { data: concurrent } = await admin
      .from("mailing_inbox_aliases")
      .select("address")
      .eq("user_id", opts.userId)
      .eq("job_id", opts.jobId)
      .maybeSingle()
    if (concurrent?.address) return concurrent.address
  }

  console.error("[mission-alias] 50 collisions d'affilée, abandon:", base)
  return null
}
