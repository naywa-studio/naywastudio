/**
 * L'adresse de réponse porte la CONVERSATION, pas seulement le sourceur.
 *
 * ── Le défaut que ça supprime ─────────────────────────────────────────────
 *
 * Jusqu'ici, `resolve-inbound` devinait la mission d'une réponse en prenant
 * celle du **dernier message sortant** vers ce candidat. Un candidat approché
 * pour deux postes voyait donc sa réponse rattachée à la plus récente, même
 * s'il répondait à l'autre. Le fil se remplissait, rien n'échouait, et
 * personne ne s'en apercevait — la pire forme de défaut.
 *
 * Désormais le contexte voyage DANS l'adresse :
 * `sophie+<jeton>@reply.naywastudio.com`. Le client de messagerie du candidat
 * n'a rien à préserver, il répond à l'adresse. On sait donc la conversation
 * au lieu de la supposer.
 *
 * Effet de bord précieux : une conversation cesse d'appartenir à une personne
 * pour appartenir au cabinet. Un collègue qui reprend un dossier réutilise le
 * même jeton, et le départ d'un sourceur ne perd plus rien.
 *
 * ── Pourquoi un jeton encodé, et pas l'identifiant tel quel ───────────────
 *
 * Contrainte trouvée en écrivant : la partie locale d'une adresse est limitée
 * à **64 caractères** (RFC 5321). Or `slugifyLocalPart` produit jusqu'à 32
 * caractères, auxquels s'ajoute un suffixe numérique en cas de collision. Avec
 * un identifiant écrit en clair (36 caractères), on dépasse — pour les
 * sourceurs aux noms longs seulement, ce qui aurait donné un défaut réservé à
 * quelques personnes et impossible à reproduire chez nous.
 *
 * Base32 ramène les 16 octets à **26 caractères**, ce qui tient dans tous les
 * cas. L'encodage est réversible : aucune colonne, aucune table de
 * correspondance, donc rien qui puisse se désynchroniser.
 *
 * ── Ce que ce fichier ne fait PAS ─────────────────────────────────────────
 *
 * Il ne vérifie aucun droit. Un jeton dit « quelle conversation », jamais
 * « qui a le droit de la lire » : le rattachement vérifie que l'organisation
 * du sourceur destinataire est bien celle du match avant d'écrire quoi que ce
 * soit. Cf. `route-inbound.ts`.
 */

/** RFC 4648, en minuscules et sans remplissage — une adresse ignore la casse. */
const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567"

/** Longueur d'un jeton : 16 octets encodés en base32. */
export const TOKEN_LENGTH = 26

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function uuidToBytes(uuid: string): Uint8Array | null {
  if (!UUID_RE.test(uuid)) return null
  const hex = uuid.replace(/-/g, "")
  const out = new Uint8Array(16)
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** L'identifiant d'un match, ramené à un jeton court utilisable en adresse. */
export function encodeMatchToken(matchId: string): string | null {
  const bytes = uuidToBytes(matchId)
  if (!bytes) return null

  let out = ""
  let buffer = 0
  let bits = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(buffer >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  // Les bits restants (16 octets = 128 bits, soit 25 groupes de 5 + 3 bits)
  // sont complétés par des zéros : le décodage les ignore symétriquement.
  if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31]
  return out
}

/** L'opération inverse. `null` si le jeton est absent, tronqué ou altéré. */
export function decodeMatchToken(token: string): string | null {
  const normalized = token.trim().toLowerCase()
  if (normalized.length !== TOKEN_LENGTH) return null

  const bytes = new Uint8Array(16)
  let buffer = 0
  let bits = 0
  let index = 0
  for (const char of normalized) {
    const value = ALPHABET.indexOf(char)
    if (value < 0) return null
    buffer = (buffer << 5) | value
    bits += 5
    if (bits >= 8) {
      // `index` peut dépasser sur le dernier groupe de bits de remplissage :
      // on s'arrête, ces bits ne portent aucune information.
      if (index < 16) bytes[index++] = (buffer >>> (bits - 8)) & 255
      bits -= 8
    }
  }
  if (index !== 16) return null
  return bytesToUuid(bytes)
}

/**
 * L'adresse de réponse pour une conversation donnée.
 *
 * Sans match — un message hors mission — on renvoie l'adresse telle quelle :
 * mieux vaut l'ancien comportement qu'une adresse bancale.
 */
export function replyAddressFor(inboxAddress: string, matchId: string | null | undefined): string {
  const at = inboxAddress.lastIndexOf("@")
  if (at < 1 || !matchId) return inboxAddress

  const token = encodeMatchToken(matchId)
  if (!token) return inboxAddress

  const local = inboxAddress.slice(0, at)
  const domain = inboxAddress.slice(at + 1)

  /* Garde-fou de dernier recours. Si la partie locale dépassait malgré tout,
   * on renonce au jeton plutôt que de fabriquer une adresse invalide : perdre
   * la précision du rattachement est réparable, un message qui rebondit ne
   * l'est pas — il n'atteint jamais le candidat. */
  if (local.length + 1 + token.length > 64) return inboxAddress

  return `${local}+${token}@${domain}`
}

export interface ParsedReplyAddress {
  /** L'adresse sans son suffixe : celle qui identifie le sourceur. */
  base: string
  /** La conversation, si l'adresse en portait une. */
  matchId: string | null
}

/**
 * Décompose une adresse reçue.
 *
 * Le repli — `matchId: null` — n'est pas un cas d'erreur : c'est le cas
 * NORMAL pour toutes les réponses aux messages envoyés avant ce changement.
 * Elles doivent continuer d'arriver, sans quoi la mise en production perdrait
 * en silence les échanges en cours.
 */
export function parseReplyAddress(address: string): ParsedReplyAddress {
  const clean = address.trim().toLowerCase()
  const at = clean.lastIndexOf("@")
  if (at < 1) return { base: clean, matchId: null }

  const local = clean.slice(0, at)
  const domain = clean.slice(at + 1)
  const plus = local.indexOf("+")
  if (plus < 0) return { base: clean, matchId: null }

  return {
    base: `${local.slice(0, plus)}@${domain}`,
    // Un suffixe qui n'est pas un jeton valide (un candidat qui bricole
    // l'adresse, un « +test » ajouté à la main) ne doit pas faire perdre le
    // message : on le traite comme une adresse sans suffixe.
    matchId: decodeMatchToken(local.slice(plus + 1)),
  }
}
