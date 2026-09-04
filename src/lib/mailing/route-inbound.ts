/**
 * Rattachement d'un email entrant : à qui, à quel candidat, à quelle mission.
 *
 * ── Pourquoi cette fonction est partagée ─────────────────────────────────
 *
 * Deux chemins de réception coexistent pendant la transition : l'ancien, par
 * `mail.naywastudio.com` via Resend, et le nouveau, par le domaine du client
 * via SES. **Ils doivent rattacher exactement de la même façon.**
 *
 * Dupliquer cette logique produirait deux comportements qui divergent
 * lentement — et la divergence ne se verrait pas : un message rattaché au
 * mauvais candidat, ou pas rattaché du tout, ressemble à un message qui n'est
 * jamais arrivé. Le sourceur croit que son candidat n'a pas répondu.
 *
 * ── L'ordre de résolution ────────────────────────────────────────────────
 *
 * 0. L'adresse DESTINATAIRE est-elle une adresse dédiée à une mission
 *    (`elyas.commercial-immobilier@…`, cf. `mission-alias.ts`) ? Alors on sait
 *    le sourceur ET la mission, exactement. C'est le chemin normal depuis
 *    qu'on pose ces adresses, et le seul qui soit INFAILLIBLE.
 * 1. Sinon, l'adresse désigne le sourceur seul (`profiles.inbox_address`).
 *    Inconnue = ce n'est pas une de nos adresses : on abandonne sans erreur.
 * 2. Son SUFFIXE, s'il en a un, désigne la conversation avec certitude. On
 *    n'en pose plus — l'adresse doit rester présentable au candidat — mais des
 *    messages en portent encore, et leurs réponses doivent continuer d'être
 *    rattachées (cf. `reply-address.ts`).
 * 3. L'adresse EXPÉDITEUR désigne le candidat, cherché dans TOUTE
 *    l'organisation : le vivier est partagé, et une réponse adressée à un
 *    sourceur peut venir d'un candidat importé par un collègue.
 * 4. L'OBJET désigne la mission (`subject-match.ts`). C'est le mécanisme
 *    principal depuis qu'on a retiré le jeton : il fonctionne dès la première
 *    réponse et ne s'affiche nulle part.
 * 5. À défaut, le dernier message SORTANT. C'était l'unique règle autrefois,
 *    et sa faute est connue : un candidat approché sur deux postes voyait sa
 *    réponse rattachée à la plus récente, quoi qu'il réponde. On la garde en
 *    dernier ressort, parce qu'un rattachement approximatif vaut mieux qu'un
 *    message qui n'apparaît nulle part.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../database.types"
import { parseReplyAddress } from "./reply-address"
import { jobFromSubject } from "./subject-match"

export interface InboundRouting {
  /** Le sourceur destinataire. `null` = adresse inconnue, message à ignorer. */
  userId: string | null
  organizationId: string | null
  /** Le candidat expéditeur, s'il est au vivier. */
  candidateId: string | null
  /** Mission déduite du dernier échange sortant. */
  jobId: string | null
  /**
   * Le destinataire est-il un administrateur Naywa ?
   *
   * Remonté d'ici parce que la lecture du profil a DÉJÀ lieu : le chemin
   * entrant n'a pas de session, donc sans ça l'appelant devrait relire la même
   * ligne pour savoir s'il peut analyser la réponse. C'était le seul chemin
   * appelant un modèle sans transmettre ce bypass.
   */
  isAdmin: boolean
}

/**
 * Résout le rattachement. Ne jette pas et n'écrit rien : la décision
 * d'enregistrer appartient à l'appelant, qui seul sait quoi faire d'un
 * message non rattaché.
 */
export async function resolveInboundRouting(
  admin: SupabaseClient<Database>,
  opts: {
    toAddress: string
    fromAddress: string
    /** L'objet du message reçu — c'est lui qui désigne la conversation. */
    subject?: string | null
  },
): Promise<InboundRouting> {
  /* L'adresse peut porter la conversation dans son suffixe
   * (`sophie+<jeton>@…`). On la décompose AVANT de chercher le sourceur :
   * c'est la base, sans suffixe, qui figure dans `profiles.inbox_address`. */
  const { base: toAddr, token } = parseReplyAddress(opts.toAddress)
  const fromAddr = opts.fromAddress.trim().toLowerCase()

  /* ── Le chemin CERTAIN : une adresse dédiée à une mission ──────────────
   *
   * `elyas.commercial-immobilier@reply.naywastudio.com` ne désigne qu'un seul
   * couple (sourceur, mission). Correspondance exacte, aucune déduction —
   * c'est ce qui rend le rattachement infaillible là où l'objet ne pouvait
   * que le supposer.
   *
   * Testé AVANT `profiles.inbox_address`, sans quoi rien ne le trouverait :
   * l'adresse générique du sourceur ne correspond à aucun alias, et un alias
   * ne figure dans aucun profil. */
  const { data: alias } = await admin
    .from("mailing_inbox_aliases")
    .select("user_id, organization_id, job_id")
    .ilike("address", toAddr)
    .maybeSingle()

  // L'adresse courante d'abord, puis les anciennes.
  //
  // Une organisation qui active son domaine change l'adresse de réception de
  // ses sourceurs. Les candidats déjà contactés, eux, répondent à celle qu'ils
  // ont dans leur boîte — pendant des semaines. Ne chercher que l'adresse
  // courante ferait tomber toutes ces réponses dans « destinataire inconnu »,
  // sans le moindre signe : un message non rattaché est indiscernable d'un
  // message jamais reçu, et le sourceur en conclut que personne n'a répondu.
  let { data: profile } = alias
    ? await admin
        .from("profiles")
        .select("user_id, organization_id, is_admin")
        .eq("user_id", alias.user_id)
        .maybeSingle()
    : await admin
        .from("profiles")
        .select("user_id, organization_id, is_admin")
        .eq("inbox_address", toAddr)
        .maybeSingle()

  if (!profile) {
    const { data: byAlias } = await admin
      .from("profiles")
      .select("user_id, organization_id, is_admin")
      .contains("inbox_aliases", [toAddr])
      .limit(1)
      .maybeSingle()
    profile = byAlias
  }

  if (!profile) {
    return { userId: null, organizationId: null, candidateId: null, jobId: null, isAdmin: false }
  }

  /* ── Le chemin CERTAIN : l'adresse portait la conversation ─────────────
   *
   * On sait alors le candidat ET la mission, au lieu de les déduire. C'est ce
   * qui règle le défaut d'origine : un candidat approché sur deux postes voyait
   * sa réponse rattachée à la plus récente, quoi qu'il réponde.
   *
   * ⚠️ Le contrôle d'organisation n'est pas une formalité. Le jeton voyage
   * dans une adresse, donc chez le candidat, donc à la portée de quiconque
   * reçoit un de nos messages. Sans cette comparaison, un jeton recopié dans
   * une réponse envoyée à l'adresse d'un AUTRE cabinet y injecterait un
   * message rattaché à une conversation qui ne lui appartient pas. On retombe
   * alors sur la déduction, qui reste bornée à l'organisation du destinataire. */
  if (token) {
    const { data: match } = await admin
      .from("match_assessments")
      .select("id, candidate_id, job_id, organization_id")
      .eq("reply_token", token)
      .maybeSingle()

    if (match && match.organization_id === profile.organization_id) {
      return {
        userId: profile.user_id,
        organizationId: profile.organization_id,
        candidateId: match.candidate_id,
        jobId: match.job_id,
        isAdmin: profile.is_admin === true,
      }
    }
  }

  // Le vivier est partagé : on cherche dans toute l'organisation, pas
  // seulement parmi les candidats importés par le destinataire.
  const { data: candidate } = await admin
    .from("candidates")
    .select("id")
    .eq("organization_id", profile.organization_id)
    .eq("email", fromAddr)
    .limit(1)
    .maybeSingle()

  /* L'alias a déjà tranché la mission : aucune déduction ne doit la
   * contredire. C'est tout l'intérêt du mécanisme — une adresse dédiée ne
   * laisse aucune place au doute, même quand deux missions portent le même
   * intitulé et le même objet. */
  if (alias && alias.organization_id === profile.organization_id) {
    return {
      userId: profile.user_id,
      organizationId: profile.organization_id,
      candidateId: candidate?.id ?? null,
      jobId: alias.job_id,
      isAdmin: profile.is_admin === true,
    }
  }

  let jobId: string | null = null
  if (candidate) {
    /* Tous les sortants récents vers ce candidat, et non plus le seul dernier.
     * C'est ce qui permet de rapprocher par l'OBJET avant de se rabattre sur
     * la chronologie. */
    const { data: sortants } = await admin
      .from("email_messages")
      .select("job_id, subject, created_at")
      .eq("candidate_id", candidate.id)
      .eq("direction", "outbound")
      .order("created_at", { ascending: false })
      .limit(50)

    const parObjet = jobFromSubject(opts.subject, sortants ?? [])

    /* `undefined` = aucun rapprochement possible (objet absent, inconnu, ou
     * partagé par deux missions). On rend alors la main à la déduction, qui a
     * le mérite d'être un comportement connu. `null` est une vraie réponse :
     * le message rapproché n'avait pas de mission. */
    jobId = parObjet !== undefined ? parObjet : (sortants?.[0]?.job_id ?? null)
  }

  return {
    userId: profile.user_id,
    organizationId: profile.organization_id,
    candidateId: candidate?.id ?? null,
    jobId,
    isAdmin: profile.is_admin === true,
  }
}

/**
 * Retire la citation du message précédent d'une réponse.
 *
 * Sans ça, chaque réponse embarque tout l'historique du fil, et l'analyse
 * comme l'affichage portent sur un texte majoritairement composé de ce que le
 * sourceur a écrit lui-même — ce qui fausse le sentiment détecté autant que la
 * lisibilité.
 *
 * Les marqueurs varient d'un client à l'autre ; on coupe au premier rencontré.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.split(/\r?\n/)
  const attribution = [
    /^\s*>?\s*Le .+ a écrit\s*:/i,                   // Apple Mail / Gmail FR
    /^\s*>?\s*On .+ wrote:\s*$/i,                    // Apple Mail / Gmail EN
    /^\s*-{2,}\s*(Original Message|Message d'origine)\s*-{2,}/i,
    /^\s*_{5,}\s*$/,                                 // séparateur Outlook
    // Ajouts : Outlook FR et EN écrivent parfois un bloc d'en-têtes recopiés
    // plutôt qu'un séparateur. Constaté sur les messages de test.
    /^\s*De\s*:\s*.+$/i,
    /^\s*From\s*:\s*.+$/i,
  ]
  let cut = lines.length
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*>/.test(lines[i]) || attribution.some((re) => re.test(lines[i]))) {
      cut = i
      break
    }
  }
  const head = lines.slice(0, cut).join("\n").replace(/\s+$/, "")
  // Filet : une coupe qui ne laisse presque rien vient d'un marqueur déclenché
  // trop tôt — une citation placée en tête, par exemple. Mieux vaut un texte
  // trop long qu'un texte vide : on ne peut pas deviner ce qui manque, et un
  // corps vide ferait croire à une conversation restée sans réponse.
  return head.trim().length >= 8 ? head : text.trim()
}

/** Formules de politesse finales, FR et EN. */
const CLOSINGS = [
  // FR
  "cordialement", "bien cordialement", "tres cordialement", "très cordialement",
  "bien a vous", "bien à vous", "sinceres salutations", "sincères salutations",
  "salutations distinguees", "salutations distinguées", "respectueusement",
  "merci d'avance", "merci par avance", "a bientot", "à bientôt",
  "bonne journee", "bonne journée", "bonne reception", "bonne réception",
  "au plaisir", "merci", "bien a vous,", "amicalement",
  // EN
  "best regards", "kind regards", "warm regards", "regards", "best",
  "sincerely", "yours sincerely", "yours faithfully", "cheers",
  "thanks", "thank you", "many thanks",
]

/**
 * Retire la signature d'un message entrant — **pour l'analyse seulement**.
 *
 * ── Pourquoi seulement pour l'analyse ────────────────────────────────────
 *
 * La signature d'un candidat contient son téléphone, son poste, parfois son
 * LinkedIn : de l'information NEUVE, que le sourceur veut voir. La retirer du
 * message stocké lui ferait perdre le numéro de quelqu'un qui vient de dire
 * oui. Elle ne gêne qu'à un seul endroit — l'entrée de l'analyse de sentiment,
 * où « Founder & CEO — Naywa Studio » pèse autant que la réponse elle-même, et
 * peut la dominer sur un message court.
 *
 * C'est la différence avec `stripQuotedReply` : une citation est du texte que
 * le SOURCEUR a déjà écrit, donc redondante partout. Une signature, non.
 *
 * ── Ce qui est coupé, et ce qui ne l'est pas ─────────────────────────────
 *
 * Deux marqueurs seulement, parce que trop de zèle ici supprime du contenu
 * réel — et une phrase perdue fausse l'analyse autant que la signature :
 *
 *  - le délimiteur normalisé `-- ` seul sur sa ligne (RFC 3676), sans ambiguïté ;
 *  - une formule de politesse SEULE sur sa ligne, suivie d'au plus 8 lignes.
 *    La formule est GARDÉE (« Cordialement » n'est pas du bruit, c'est du ton) ;
 *    au-delà de 8 lignes, ce n'est plus une signature et on ne touche à rien.
 */
export function stripSignature(text: string): string {
  const lines = text.split(/\r?\n/)

  // 1. Délimiteur normalisé : net, on coupe là.
  const rfc = lines.findIndex((l) => /^--\s?$/.test(l))
  if (rfc > 0) {
    const head = lines.slice(0, rfc).join("\n").trim()
    if (head.length >= 8) return head
  }

  // 2. Dernière formule de politesse isolée.
  let cut = -1
  for (let i = 0; i < lines.length; i++) {
    const norm = lines[i].trim().toLowerCase().replace(/[,.!;:]+$/, "")
    if (norm && CLOSINGS.includes(norm)) cut = i
  }
  if (cut >= 0) {
    // Combien de lignes NON VIDES suivent ? Une signature en fait peu ; un
    // paragraphe qui reprend après un « merci » en fait davantage.
    const after = lines.slice(cut + 1).filter((l) => l.trim()).length
    if (after > 0 && after <= 8) {
      const head = lines.slice(0, cut + 1).join("\n").trim()
      if (head.length >= 8) return head
    }
  }

  return text.trim()
}
